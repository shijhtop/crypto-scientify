#!/usr/bin/env node
/**
 * crypto-scientify MCP server
 * Exposes: arxiv_search, openalex_search, eprint_search
 * Pure Node.js — no external dependencies, no compilation required.
 */

// ---------------------------------------------------------------------------
// Tool definitions (used in tools/list response)
// ---------------------------------------------------------------------------
const TOOL_DEFS = [
  {
    name: "arxiv_search",
    description:
      "Search arXiv.org for academic papers. Returns title, authors, abstract, arxiv_id. Does NOT download files.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", description: "Search query (e.g. 'lattice-based KEM')" },
        max_results: { type: "number", description: "Max results 1–50, default 10" },
        sort_by: { type: "string", description: "relevance | lastUpdatedDate | submittedDate" },
        date_from: { type: "string", description: "Filter papers after YYYY-MM-DD" },
      },
    },
  },
  {
    name: "openalex_search",
    description:
      "Search OpenAlex for academic works across all disciplines. Returns metadata including citation counts.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", description: "Search query" },
        max_results: { type: "number", description: "Max results 1–50, default 15" },
        filter: { type: "string", description: "OpenAlex filter (e.g. 'from_publication_date:2024-01-01')" },
        sort: { type: "string", description: "relevance_score | cited_by_count | publication_date" },
      },
    },
  },
  {
    name: "eprint_search",
    description:
      "Search IACR ePrint archive for cryptography preprints. Essential for PQC, protocols, cryptanalysis, and side-channel research — covers papers not yet indexed on arXiv.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", description: "Search query (e.g. 'ML-KEM side channel')" },
        max_results: { type: "number", description: "Max results 1–50, default 10" },
        date_from: { type: "string", description: "Filter papers after YYYY-MM-DD" },
      },
    },
  },
];

// ---------------------------------------------------------------------------
// arXiv search
// ---------------------------------------------------------------------------
const ARXIV_SORT_MAP = {
  relevance: "relevance",
  lastupdateddate: "lastUpdatedDate",
  submitteddate: "submittedDate",
};

function parseAtomXml(xml) {
  const papers = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = entryRe.exec(xml)) !== null) {
    const entry = m[1];
    const tag = (name) => {
      const t = entry.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`));
      return t ? t[1].trim() : "";
    };
    const title = tag("title").replace(/\s+/g, " ");
    const abstract = tag("summary").replace(/\s+/g, " ");
    const published = tag("published");
    const arxivId = tag("id").replace("http://arxiv.org/abs/", "").replace(/v\d+$/, "");
    const authors = [];
    const authRe = /<author>\s*<name>([^<]+)<\/name>/g;
    let am;
    while ((am = authRe.exec(entry)) !== null) authors.push(am[1].trim());
    const pdfM = entry.match(/<link[^>]+title="pdf"[^>]+href="([^"]+)"/);
    const pdfUrl = pdfM ? pdfM[1] : `https://arxiv.org/pdf/${arxivId}`;
    const categories = [];
    const catRe = /<category[^>]+term="([^"]+)"/g;
    let cm;
    while ((cm = catRe.exec(entry)) !== null) categories.push(cm[1]);
    if (title && arxivId) papers.push({ title, authors, abstract, arxivId, pdfUrl, published, categories });
  }
  return papers;
}

async function arxivSearch(args) {
  const query = (args.query ?? "").trim();
  if (!query) throw new Error("query required");
  const maxResults = Math.min(Math.max(1, args.max_results ?? 10), 50);
  const sortBy = ARXIV_SORT_MAP[(args.sort_by ?? "relevance").toLowerCase()] ?? "relevance";
  let searchQuery = query;
  if (args.date_from) {
    const d = args.date_from.replace(/-/g, "");
    searchQuery = `${query} AND submittedDate:[${d}0000 TO 99991231]`;
  }
  const params = new URLSearchParams({
    search_query: searchQuery, start: "0",
    max_results: String(maxResults), sortBy, sortOrder: "descending",
  });
  const res = await fetch(`https://export.arxiv.org/api/query?${params}`);
  if (!res.ok) throw new Error(`arXiv API returned ${res.status}`);
  const papers = parseAtomXml(await res.text());
  return {
    query, source: "arxiv", total: papers.length,
    papers: papers.map((p) => ({
      title: p.title, authors: p.authors,
      abstract: p.abstract.length > 300 ? p.abstract.slice(0, 300) + "…" : p.abstract,
      arxiv_id: p.arxivId, pdf_url: p.pdfUrl, published: p.published, categories: p.categories,
    })),
  };
}

// ---------------------------------------------------------------------------
// OpenAlex search
// ---------------------------------------------------------------------------
function reconstructAbstract(inv) {
  if (!inv) return "";
  const words = [];
  for (const [w, positions] of Object.entries(inv))
    for (const pos of positions) words.push([w, pos]);
  words.sort((a, b) => a[1] - b[1]);
  return words.map(([w]) => w).join(" ").slice(0, 500);
}

async function openalexSearch(args) {
  const query = (args.query ?? "").trim();
  if (!query) throw new Error("query required");
  const maxResults = Math.min(Math.max(1, args.max_results ?? 15), 50);
  const sortMap = {
    cited_by_count: "cited_by_count:desc",
    publication_date: "publication_date:desc",
    relevance_score: "relevance_score:desc",
  };
  const params = new URLSearchParams({
    search: query, per_page: String(maxResults), mailto: "research@example.org",
    sort: sortMap[args.sort ?? "relevance_score"] ?? "relevance_score:desc",
  });
  if (args.filter) params.set("filter", args.filter);
  const res = await fetch(`https://api.openalex.org/works?${params}`);
  if (res.status === 429) throw new Error("OpenAlex rate limit exceeded");
  if (!res.ok) throw new Error(`OpenAlex API returned ${res.status}`);
  const data = await res.json();
  return {
    query, source: "openalex",
    total_count: data.meta?.count ?? 0,
    returned: (data.results ?? []).length,
    works: (data.results ?? []).map((w) => ({
      id: (w.id ?? "").replace("https://openalex.org/", ""),
      title: w.title || "Untitled",
      doi: w.doi?.replace("https://doi.org/", "") ?? null,
      year: w.publication_year ?? null,
      authors: (w.authorships ?? []).slice(0, 5).map((a) => a?.author?.display_name).filter(Boolean),
      venue: w.primary_location?.source?.display_name ?? "Unknown",
      cited_by: w.cited_by_count ?? 0,
      is_open_access: w.open_access?.is_oa ?? false,
      oa_url: w.open_access?.oa_url ?? null,
      abstract_preview: reconstructAbstract(w.abstract_inverted_index ?? null),
    })),
  };
}

// ---------------------------------------------------------------------------
// IACR ePrint search
// ---------------------------------------------------------------------------
function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ").trim();
}

function parseEprintHtml(html) {
  const papers = [];
  const seen = new Set();
  const re = /<a[^>]+href="(?:https?:\/\/eprint\.iacr\.org)?\/(\d{4}\/\d{1,5})"[^>]*>([\s\S]*?)<\/a>([\s\S]{0,400})/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const id = m[1];
    if (seen.has(id)) continue;
    const linkText = stripTags(m[2]);
    const trailing = stripTags(m[3]);
    const isIdOnly = /^\d{4}\/\d{1,5}$/.test(linkText);
    seen.add(id);
    papers.push({
      title: isIdOnly ? `ePrint ${id}` : linkText,
      eprintId: id,
      abstract: trailing.slice(0, 300),
    });
  }
  return papers;
}

async function eprintSearch(args) {
  const query = (args.query ?? "").trim();
  if (!query) throw new Error("query required");
  const maxResults = Math.min(Math.max(1, args.max_results ?? 10), 50);
  const params = new URLSearchParams({ q: query });
  if (args.date_from) params.set("submittedafter", args.date_from);
  const res = await fetch(`https://eprint.iacr.org/search?${params}`);
  if (!res.ok) throw new Error(`IACR ePrint returned ${res.status}`);
  const papers = parseEprintHtml(await res.text()).slice(0, maxResults);
  return {
    query, source: "iacr_eprint", total: papers.length,
    papers: papers.map((p) => ({
      title: p.title,
      abstract: p.abstract.length > 300 ? p.abstract.slice(0, 300) + "…" : p.abstract,
      eprint_id: p.eprintId,
      paper_id: `eprint:${p.eprintId}`,
      html_url: `https://eprint.iacr.org/${p.eprintId}`,
      pdf_url: `https://eprint.iacr.org/${p.eprintId}.pdf`,
    })),
    ...(papers.length === 0
      ? { note: "No results parsed — ePrint markup may have changed. Check https://eprint.iacr.org/search" }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// MCP protocol (newline-delimited JSON over stdio)
// ---------------------------------------------------------------------------
const HANDLERS = {
  arxiv_search: arxivSearch,
  openalex_search: openalexSearch,
  eprint_search: eprintSearch,
};

async function dispatch(msg) {
  const { id, method, params } = msg;
  try {
    switch (method) {
      case "initialize":
        return {
          jsonrpc: "2.0", id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "crypto-scientify", version: "1.0.0" },
          },
        };
      case "notifications/initialized":
      case "notifications/cancelled":
        return null; // one-way notifications, no response
      case "ping":
        return { jsonrpc: "2.0", id, result: {} };
      case "tools/list":
        return { jsonrpc: "2.0", id, result: { tools: TOOL_DEFS } };
      case "tools/call": {
        const { name, arguments: args } = params ?? {};
        const handler = HANDLERS[name];
        if (!handler)
          return { jsonrpc: "2.0", id, error: { code: -32602, message: `Unknown tool: ${name}` } };
        const data = await handler(args ?? {});
        return {
          jsonrpc: "2.0", id,
          result: { content: [{ type: "text", text: JSON.stringify(data) }] },
        };
      }
      default:
        return { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } };
    }
  } catch (e) {
    return { jsonrpc: "2.0", id, error: { code: -32603, message: String(e?.message ?? e) } };
  }
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (chunk) => {
  buf += chunk;
  const lines = buf.split("\n");
  buf = lines.pop(); // keep incomplete last line
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let msg;
    try { msg = JSON.parse(trimmed); } catch { continue; }
    const response = await dispatch(msg);
    if (response) process.stdout.write(JSON.stringify(response) + "\n");
  }
});
