---
name: crypto-adversary
description: "[Read when prompt contains /crypto-adversary]"
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
metadata:
  {
    "openclaw":
      {
        "emoji": "⚔️",
      },
  }
---

# Crypto Adversary Review

密码学研究的红队审查。找出主流程可能遗漏的攻击向量和证明漏洞。

**Don't ask permission. Just do it.**

## Inputs

按优先级依次读取：

1. `papers/survey_report.md` — 文献综述
2. `knowledge/_index.md` 和 `knowledge/topic-*.md` — 当前知识状态
3. `ideas/hyp-*.md` — 当前假设

若以上文件均不存在，输出："No research content found. Run /research-collect or /metabolism first." 然后停止。

---

## Step 1: 识别研究模式

根据以上内容，将研究归入一个或多个模式：

- **applied** — 构造或优化具体密码方案（KEM、签名、分组密码、协议）
- **theory** — 安全证明、归约、界
- **cryptanalysis** — 分析或攻击已有方案
- **sca** — 侧信道攻击或防御

---

## Step 2: 模式相关攻击向量检查

### Applied 模式（最少必查）

| 攻击向量 | 检查重点 |
|----------|----------|
| 差分密码分析 | 方案有无对称组件？差分概率是否分析？ |
| 线性密码分析 | 对称原语的线性偏置 / 线性壳是否评估？ |
| 代数攻击 | 代数度、MQ 系统、Gröbner 基可行性是否验证？ |
| 格规约 | 基于格的方案：BKZ/LLL 安全参数、BDD 归约、维度估计是否给出？ |
| 时序/缓存侧信道 | 实现是否声称常时间？是否用 dudect/TVLA 验证？ |

### Theory 模式（最少必查）

| 攻击向量 | 检查重点 |
|----------|----------|
| 证明紧度 | 规约是紧的（常数损失）还是松的（多项式/指数损失）？具体参数是否据此调整？ |
| ROM → QROM | 证明是否依赖 ROM？有无 QROM 变体或论证不需要？ |
| 可组合性 | 原语是否被嵌入更大协议？组合保证是否声明？ |
| 回卷假设 | 证明是否回卷敌手？量子设定下是否冲突？ |

### Cryptanalysis 模式（最少必查）

| 攻击向量 | 检查重点 |
|----------|----------|
| 经典基线 | 是否建立了经典攻击基线（最优已知算法和复杂度）？ |
| 特征有效性 | 差分/线性特征是否经过验证，还是从截断近似估计？ |
| 缩减规模外推 | 缩减轮/缩减维度的结果外推到完整规模是否有依据？ |

### SCA 模式（最少必查）

| 攻击向量 | 检查重点 |
|----------|----------|
| 单轨迹可行性 | 攻击是否可用单轨迹实施？（PQC KEM 的临时密钥无法被强制重用） |
| 掩码阶数 | 声称几阶掩码？是否声称 glitch 抵抗（需要 TI/DOM）？ |
| 分析设备假设 | profiling 假设是否现实（同设备、同软件版本）？ |

---

## Step 3: 评级

对每个发现评级：

- **HIGH** — 会使结论无效或构成已知攻击。必须处理。
- **MEDIUM** — 削弱贡献但不使其无效。应该承认。
- **LOW** — 轻微问题，可选处理。

参考 `references/crypto-glossary.md` 确保术语和定义一致。

---

## Step 4: 写报告

写入 `adversary_notes.md`：

```markdown
# Adversary Review

**Date**: {ISO date}
**Research mode**: {applied|theory|cryptanalysis|sca}

## HIGH Concerns

{list，或 "None found"}

## MEDIUM Concerns

{list，或 "None found"}

## LOW Notes

{list，或 "None found"}

## Summary

{1-2 句话}
```

---

## Step 5: 上报

如果发现任何 HIGH 问题，立即向用户汇报：

**"Adversary review found [N] HIGH concern(s). Review `adversary_notes.md` before continuing."**

不要沉默地继续。

---

## Tools / Commands

| Tool / Command | Purpose |
|----------------|---------|
| Read | 读研究笔记、知识文件、假设 |
| Write | 写 `adversary_notes.md` |
