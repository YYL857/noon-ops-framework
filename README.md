# noon-ops-framework

**Noon 卖家数据接入参考框架**（只读同步优先）——把「官方 Partner API 能拉的」和「只能门户导出的」拆成两条稳定通道，避免一上来就爬前台或抄巴西/Shopee 口径。

> 从真实 Noon 多店运营系统中抽离的**可公开模式与最小 TypeScript 样板**。不含任何店铺凭证、项目号、业务 CSV 或内部 SOP。

## 你为什么会走弯路

| 常见误区 | 更稳的做法 |
|---|---|
| 只爬 noon.com 前台做「ERP」 | 经营主数据走 **Partner API / Impex**；前台只做情报 |
| 以为有完整公开 Seller SDK | 官方 `noonapi` 仍早期；自己用 **Service Account JWT → Cookie** |
| 广告也想走同一 Impex | **Ads 通常无 Impex** → 门户导出 / RPA → 统一落 `portal-imports` |
| 抄跨境 Agent Prompt 当费率真理 | 费率用 **Transaction View 实数**；阈值按本站重标定 |
| 一上来就自动改价推库存 | 先把**读侧**跑稳；写接口（Stock/Pricing）单独开白名单 |

## 核心架构（双通道）

```
                    ┌─────────────────────────┐
   Service Account  │  Path A · Partner API   │
   JSON (密钥自管) ─►│  Impex 异步导出 CSV     │──┐
                    │  whoami / Offer / …     │  │
                    └─────────────────────────┘  │
                                                 ▼
                                            ┌──────────────┐
                                            │  Domain store │
                                            │  (按域落库)   │
                                            └──────────────┘
                                                 ▲
                    ┌─────────────────────────┐  │
   人工 / RPA / 影刀 │  Path B · Portal export │  │
   导出 CSV ────────►│  投递 portal-imports/   │──┘
                    │  幂等 ingest            │
                    └─────────────────────────┘
```

**原则：一源一域、一域一主存。** Catalog 可以引用库存/销量/费用，但不要把所有东西都塞进一张「商品表」当真相源。

## 域映射（经营核心）

| Noon 来源 | 域 | 推荐通道 | 主用途 |
|---|---|---|---|
| Catalog live / notlive | `catalog` | Impex `catalogexport` | 在线商品主档 |
| FBN / 库存导出 | `stock` | Impex 或 Catalog hints | 可售库存 |
| Orders | `orders` | Impex `ordersexport` | 履约单据（≠ 日销量表） |
| Product views & sales | `sales` | Impex `productviewsandsalesdata` | SKU×日销量主数据 |
| Transaction View (item) | `fees` | Impex `transactionviewreportonitemlevel` | 佣金 / 出库等平台费 |
| Estimated Fees | `fee_estimates` | Catalog 列或门户导出 | **仅补缺**，勿盖过 TV |
| Noon Ads overview | `ads` | **门户导出 / RPA**（常无 Impex） | 花费与归因收入 |

冲突时建议优先级（数字越小越高）：官方 Catalog 价与在售状态 → Transaction View 费率 → Estimated Fees（FBN 补缺）→ 自有采购/头程表 → 广告导出。

## 官方文档

- Partner API：[https://noon-docs.noonpartners.dev/](https://noon-docs.noonpartners.dev/)
- 凭证：Seller Lab → Access / Service Account → 下载 JSON（**私钥当密码，勿进 Git**）

## 本仓库有什么

| 路径 | 内容 |
|---|---|
| `src/auth.ts` | Service Account → RS256 JWT → `api/login` → Cookie 会话 |
| `src/endpoints.ts` | 网关 Base URL 与常用路径常量 |
| `src/impex.ts` | Impex create / status 最小客户端（骨架） |
| `src/ingest.ts` | `portal-imports` 幂等入库约定（骨架） |
| `docs/DOMAIN_MAP.md` | 域语义与「勿混」表 |
| `docs/SECURITY.md` | 脱敏与开源边界 |
| `examples/.env.example` | 环境变量模板 |

**没有：** 真实密钥、店铺 ID、浏览器登录态、广告自动化脚本、改价机器人。

## 快速开始

```bash
cp examples/.env.example .env
# 把 Access App 下载的 JSON 放到本机私有路径，填入 NOON_CREDENTIALS_FILE

npm install   # 或 pnpm i —— 仅 Node 18+，零强制依赖也可直接 tsx 跑 examples
npx tsx examples/whoami.ts
```

## 写回能力（可选第二阶段）

网关已有：

- `POST /stock/v1/stock-update`（绝对值库存）
- `POST /pricing/v1/pricing/upsert`

建议：**读侧稳定 + 审计日志 + SKU 白名单** 后再做。库存更新是绝对值（发 `25` 就是变成 25）。

## License

MIT

## 致谢

模式来自生产环境 Noon 多店运营实践；本仓库仅公开可复用的接入骨架，与任何具体店铺数据无关。
