# Domain map · 一源一域

## 语义拆分（勿混）

| 数据 | 含义 | 不要当成 |
|---|---|---|
| `orders` | 订单履约单据 | SKU 日销量主表 |
| `sales` | 平台销售报表（SKU×日） | 财务科目 |
| `fees` | Transaction View 平台费用 | 本地头程 / 采购成本 |
| `fee_estimates` | Catalog Estimated Fees | 覆盖 `fees`；进主财务报表 |
| `ads` | 广告区间花费 / 归因收入 | 全站销量 |
| `catalog` | 在线 / 不在线商品主档 | 库存账本 |
| `stock` | 仓存 / 可售 | 销量 |

## 通道选择

1. **Impex 有 category** → Path A（Partner API），失败再 Path B。
2. **确认无 Impex（如多数 Ads 报表）** → 只走 Path B，不要空转 API。
3. 两条都落到同一 ingest：按文件名 / 导出窗口 / 内容哈希幂等。

## 落库建议

- 每域独立集合或表；Catalog 页用 JOIN / 拼装视图展示。
- 保留 `source`、`importedAt`、`exportWindow`（若有）。
- 售价字段优先：`active_price` → `sale_price` → `offer_price` → `price`（按你导出列实际改）。
