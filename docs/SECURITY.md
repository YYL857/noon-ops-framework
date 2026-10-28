# Security · 开源边界

## 永远不要提交

- Service Account JSON（含 `private_key`）
- 浏览器 `storage-state` / Cookie / 会话文件
- 真实 `project_code`、Partner ID、Warehouse ID、Offer code
- 生产 CSV、对账单、客户地址
- 内网 IP、办公机器路径、影刀账号

## 推荐做法

- 凭证路径只放环境变量，例如 `NOON_CREDENTIALS_FILE`
- `.gitignore` 忽略 `.env`、`*.sensitive.json`、`portal-imports/**`、`data/**`
- 示例里的 project / SKU 一律用 `YOUR_PROJECT` / `DEMO-SKU-001`
- 对外截图打码店铺名与 GMV

## 本框架范围

只描述**读侧双通道**与最小认证样板。自动化点击 Seller Lab、广告改价、库存写回若要做，请放在私有仓库并单独审计。
