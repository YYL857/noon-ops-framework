# Noon Ops Framework

**Noon 卖家数据接入参考框架 · Turn Noon seller data into a dual-path ops pipeline.**

[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Status](https://img.shields.io/badge/status-v0.1%20beta-orange.svg)](#)
[![Focus](https://img.shields.io/badge/focus-read%20path%20first-brightgreen.svg)](#)
[![Node](https://img.shields.io/badge/node-%3E%3D18-blue.svg)](./package.json)

---

## 这是什么

把真实 Noon 多店运营里已经跑通的数据接入方式，抽成**可公开复用的参考框架**：

> **官方 Partner API / Impex 能拉的走 Path A；官方没有对等导出的（如多数 Ads）走 Path B 门户 CSV → 统一幂等入库。**

不是 SaaS，不是一键改价机器人。本仓库只做四件事：认证样板、Impex 骨架、portal-imports 约定、域语义文档——让自建 ERP / OMS 的人少走弯路。

| 交付物 | 说明 |
|--------|------|
| 📘 接入方法论 | 双通道架构 +「一源一域」落库原则，避免万能商品表 |
| 🔐 认证样板 | Service Account → RS256 JWT → 网关 Cookie（对照官方 Quick Start） |
| 📥 Impex 骨架 | category list / create / status 最小客户端 |
| 📂 Portal ingest | CSV inbox 哈希去重、成功归档约定 |
| 🗺️ 域映射表 | catalog / stock / orders / sales / fees / ads 语义与勿混说明 |
| 🛡️ 安全边界 | 公开仓不含凭证、店号、业务 CSV；见 `docs/SECURITY.md` |

---

## 为什么需要它

| 常见弯路 | 本框架主张 |
|----------|------------|
| 只爬 noon.com 前台当「ERP」 | 经营主数据走 **Partner API / Impex**；前台只做情报 |
| 以为有完整公开 Seller SDK | 官方 `noonapi` 仍早期；用 **Service Account JWT → Cookie** |
| 广告也想同一条 Impex | **Ads 常无 Impex** → 门户导出 / RPA → `portal-imports` |
| 抄其他站点 Agent 费率口径 | 费率用 **Transaction View 实数**；阈值按本站重标定 |
| 第一天就自动改价推库存 | **先读后写**；Stock / Pricing 写回列为第二阶段 |

---

## 核心架构

```
                    ┌─────────────────────────┐
   Service Account  │  Path A · Partner API   │
   JSON（密钥自管）──►│  Impex 异步导出 CSV     │──┐
                    │  whoami / Offer / …     │  │
                    └─────────────────────────┘  │
                                                 ▼
                                            ┌──────────────┐
                                            │  Domain store │
                                            │  （按域落库）  │
                                            └──────────────┘
                                                 ▲
                    ┌─────────────────────────┐  │
   人工 / RPA       │  Path B · Portal export │  │
   导出 CSV ────────►│  投递 portal-imports/   │──┘
                    │  幂等 ingest            │
                    └─────────────────────────┘
```

**原则：一源一域、一域一主存。** Catalog 可引用库存 / 销量 / 费用，但不是这些域的真相源。

---

## 域映射（经营核心）

| Noon 来源 | 域 | 推荐通道 | 主用途 |
|-----------|-----|----------|--------|
| Catalog live / notlive | `catalog` | Impex `catalogexport` | 在线商品主档 |
| FBN / 库存导出 | `stock` | Impex 或 Catalog hints | 可售库存 |
| Orders | `orders` | Impex `ordersexport` | 履约单据（≠ 日销量） |
| Product views & sales | `sales` | Impex `productviewsandsalesdata` | SKU×日销量主数据 |
| Transaction View (item) | `fees` | Impex `transactionviewreportonitemlevel` | 佣金 / 出库等平台费 |
| Estimated Fees | `fee_estimates` | Catalog 列或门户导出 | **仅补缺**，勿盖过 TV |
| Noon Ads overview | `ads` | **门户导出 / RPA** | 花费与归因收入 |

冲突优先级（数字越小越高）：官方 Catalog 价与在售 → Transaction View → Estimated Fees（FBN 补缺）→ 自有采购 / 头程 → 广告导出。

更细的「勿混」表见 [`docs/DOMAIN_MAP.md`](./docs/DOMAIN_MAP.md)。

---

## 仓库结构

| 路径 | 内容 |
|------|------|
| `src/auth.ts` | Service Account → JWT → Cookie 会话 |
| `src/endpoints.ts` | 网关 Base URL 与常用路径常量 |
| `src/impex.ts` | Impex 最小客户端 |
| `src/ingest.ts` | `portal-imports` 幂等约定 |
| `docs/DOMAIN_MAP.md` | 域语义 |
| `docs/SECURITY.md` | 开源边界 |
| `examples/` | `.env.example` · `whoami` · `list-impex-categories` |

**本仓没有：** 真实密钥、店铺 ID、浏览器登录态、广告改价脚本、库存写回机器人。

---

## 快速开始

```bash
cp examples/.env.example .env
# 将 Access App 下载的 Service Account JSON 放到本机私有路径
# 填写 NOON_CREDENTIALS_FILE=

npm install
npm run whoami
# 可选：npm run list-impex
```

要求：Node.js **≥ 18**。凭证获取见 [Noon Partner API 文档](https://noon-docs.noonpartners.dev/)（Seller Lab → Access / Service Account）。**私钥当密码，勿提交 Git。**

---

## 写回能力（第二阶段 · 可选）

网关已提供、本框架**刻意不默认启用**：

- `POST /stock/v1/stock-update`（绝对值库存：发 `25` 即变成 25）
- `POST /pricing/v1/pricing/upsert`

建议：读侧稳定 + 审计日志 + SKU 白名单后再做。

---

## 适用 / 不适用

**适合**

- 自建 Noon 侧 ERP / 数仓的技术团队  
- 要把 Partner API 与门户导出收成一条流水线的集成方  
- 不想把前台爬取当经营主数据源的卖家与代运营  

**不适合**

- 仅需 Noon Payments 支付网关  
- 期望开箱即改价、自动投放的「一键运营机器人」  

---

## License

[MIT](./LICENSE) · 模式来自生产环境 Noon 多店实践；公开内容与任何具体店铺数据无关。

—— noon-ops-framework 维护方
