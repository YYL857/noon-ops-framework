# -*- coding: utf-8 -*-
"""
Portal delivery helpers for Noon Playwright exports (public, shop-agnostic).

- Wait for browser downloads
- Normalize Campaign Overview xlsx/csv → ads_sku_{from}_{to}.csv
- Deliver per shopId into {NOON_DATA_ROOT}/shops/{shopId}/portal-imports

Never commit real shop IDs; set NOON_SHOPS / NOON_SHOP via env.
"""

from __future__ import annotations

import csv
import io
import os
import re
import shutil
import time
import zipfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import Iterable, Optional
from xml.etree import ElementTree as ET

EXPORT_DIR = Path(r".\data\exports")
INBOX_DIR = EXPORT_DIR / "inbox"
DOWNLOAD_DIR = Path(r".\data\downloads")
# 常见系统下载目录也扫一遍（RPA / Chrome / 360）
USER_DOWNLOADS = Path.home() / "Downloads"
EXTRA_DOWNLOAD_DIRS = [
    Path(r".\data\downloads"),
    Path(r".\data\downloads"),
    Path.home() / "Desktop",
    Path(r"C:\Users\Public\Desktop"),
]
NOON_DATA_ROOT = Path(os.environ.get("NOON_DATA_ROOT", r".\data"))
IMPORT_DIR = NOON_DATA_ROOT / "portal-imports"  # 仅兼容旧路径；新投递不写全局
LOG_DIR = Path(r".\data\logs")

# Never bake real shop IDs into source.
DEFAULT_SHOP_IDS = ()  # require NOON_SHOPS env — never bake real shops


def parse_shop_ids(raw: Optional[str] = None) -> list[str]:
    """环境变量 NOON_SHOPS=；required — no baked-in shops."""
    text = (raw if raw is not None else os.environ.get("NOON_SHOPS", "")).strip()
    if not text:
        raise ValueError("Set NOON_SHOPS=PRJ…,PRJ… (comma-separated project codes)")
    ids = [x.strip().upper() for x in re.split(r"[,;\s]+", text) if x.strip()]
    if ids:
        return ids
    raise ValueError("Set NOON_SHOPS=PRJ…,PRJ… (comma-separated project codes)")


def shop_download_dir(shop_id: str) -> Path:
    return DOWNLOAD_DIR / shop_id.strip().upper()


def shop_export_ads_dir(shop_id: str) -> Path:
    return EXPORT_DIR / "ads" / shop_id.strip().upper()


def shop_portal_imports(shop_id: str) -> Path:
    return NOON_DATA_ROOT / "shops" / shop_id.strip().upper() / "portal-imports"


# 兼容旧常量名（勿再写死单店投递）
SHOP_IMPORT_DIR = None  # set after NOON_SHOP is known; do not default to a real shop

ADS_HEADERS = [
    "sku",
    "campaign_name",
    "from_date",
    "to_date",
    "spend",
    "revenue",
    "orders",
    "views",
    "clicks",
    "atc",
]

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def ensure_dirs(shop_ids: Optional[Iterable[str]] = None) -> None:
    ids = list(shop_ids) if shop_ids is not None else parse_shop_ids()
    dirs = [
        EXPORT_DIR,
        INBOX_DIR,
        DOWNLOAD_DIR,
        LOG_DIR,
    ]
    for sid in ids:
        dirs.extend(
            [
                shop_download_dir(sid),
                shop_export_ads_dir(sid),
                shop_portal_imports(sid),
            ]
        )
    for d in dirs:
        d.mkdir(parents=True, exist_ok=True)


def default_date_range(days: int = 7) -> tuple[str, str]:
    today = datetime.now().date()
    to_date = today.isoformat()
    from_date = (today - timedelta(days=max(days, 1) - 1)).isoformat()
    return from_date, to_date


def yesterday_date_range() -> tuple[str, str]:
    """今天导出「昨天」：from=to=昨天。"""
    y = (datetime.now().date() - timedelta(days=1)).isoformat()
    return y, y


def resolve_ads_date_range(
    *,
    mode: Optional[str] = None,
    days: int = 1,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
) -> tuple[str, str]:
    """
    mode:
      - yesterday（默认）：from=to=昨天
      - today / last7 / last30 / last90 / ytd / all / custom
      - days：近 N 天（含今天），兼容旧逻辑
    """
    env_from = (from_date or os.environ.get("NOON_ADS_FROM", "")).strip()
    env_to = (to_date or os.environ.get("NOON_ADS_TO", "")).strip()
    if env_from and env_to:
        return (env_from, env_to) if env_from <= env_to else (env_to, env_from)
    m = (mode or os.environ.get("NOON_ADS_RANGE", "yesterday")).strip().lower()
    today = datetime.now().date()
    if m in ("today",):
        d = today.isoformat()
        return d, d
    if m in ("last7", "7"):
        return default_date_range(7)
    if m in ("last30", "30"):
        return default_date_range(30)
    if m in ("last90", "90"):
        return default_date_range(90)
    if m in ("ytd", "year"):
        return datetime(today.year, 1, 1).date().isoformat(), today.isoformat()
    if m in ("all", "alltime"):
        return "2019-01-01", today.isoformat()
    if m in ("days", "window", "rolling"):
        return default_date_range(days)
    return yesterday_date_range()


def parse_date_range_from_name(name: str) -> Optional[tuple[str, str]]:
    m = re.search(
        r"(20\d{2}-\d{2}-\d{2}).{0,3}(20\d{2}-\d{2}-\d{2})",
        name,
    )
    if not m:
        return None
    a, b = m.group(1), m.group(2)
    return (a, b) if a <= b else (b, a)


def write_log(name: str, lines: Iterable[str]) -> Path:
    ensure_dirs()
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = LOG_DIR / f"{name}_{stamp}.log"
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def deliver_to_portal(
    src: Path,
    dest_name: Optional[str] = None,
    *,
    shop_id: Optional[str] = None,
    also_global: bool = False,
) -> Path:
    """
    按 shopId 隔离投递到 shops/{shopId}/portal-imports。
    默认不写全局 portal-imports，避免多店脏数据。
    """
    sid = (shop_id or os.environ.get("NOON_SHOP", "")).strip().upper()
    if not sid:
        raise ValueError("deliver_to_portal 需要 shop_id（或环境变量 NOON_SHOP）")
    ensure_dirs([sid])
    src = Path(src)
    if not src.is_file():
        raise FileNotFoundError(f"投递源不存在: {src}")
    name = dest_name or src.name
    shop_dest = shop_portal_imports(sid) / name
    shutil.copy2(src, shop_dest)
    if also_global:
        IMPORT_DIR.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, IMPORT_DIR / name)
    return shop_dest


def latest_ads_csv(shop_id: str) -> Optional[Path]:
    """该店 portal-imports 下最新 ads_sku_*.csv（按 mtime）。"""
    d = shop_portal_imports(shop_id)
    if not d.is_dir():
        return None
    cands = [
        p
        for p in d.iterdir()
        if p.is_file() and p.suffix.lower() == ".csv" and "ads_sku" in p.name.lower()
    ]
    if not cands:
        return None
    cands.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return cands[0]


def fbn_summary_name(ymd: str) -> str:
    return f"fbn_inventory_ledger_summary_{ymd}.csv"


def fbn_pivot_name(ymd: str) -> str:
    return f"fbn_vs_supermall_{ymd}.csv"


def sales_export_name(from_ymd: str, to_ymd: str) -> str:
    """门户 Sales 导出规范名（auto-ingest 认 sales_export）。"""
    return f"sales_export_{from_ymd}_{to_ymd}.csv"


def find_sales_export_files(
    shop_id: str, *, from_ymd: Optional[str] = None, to_ymd: Optional[str] = None
) -> dict[str, Optional[Path]]:
    """
    按店定位 Sales 落盘：
      ./data\\shops\\{shopId}\\portal-imports\\sales_export_{from}_{to}.csv
    未指定区间则取该店最新一份 sales_export_*.csv（按文件名日期，其次 mtime）。
    """
    sid = shop_id.strip().upper()
    d = shop_portal_imports(sid)
    out: dict[str, Optional[Path]] = {"path": None, "from": None, "to": None}
    if not d.is_dir():
        return out

    cands = [
        p
        for p in d.iterdir()
        if p.is_file()
        and p.suffix.lower() == ".csv"
        and "sales_export" in p.name.lower()
    ]
    if not cands:
        return out

    def _range_of(p: Path) -> tuple[str, str]:
        m = re.search(
            r"(20\d{2}-\d{2}-\d{2}).{0,3}(20\d{2}-\d{2}-\d{2})",
            p.name,
        )
        if m:
            a, b = m.group(1), m.group(2)
            return (a, b) if a <= b else (b, a)
        return ("", "")

    if from_ymd and to_ymd:
        raw = d / sales_export_name(from_ymd.strip(), to_ymd.strip())
        out["from"] = from_ymd.strip()
        out["to"] = to_ymd.strip()
        out["path"] = raw if raw.is_file() else None
        return out

    cands.sort(
        key=lambda p: (_range_of(p)[1], _range_of(p)[0], p.stat().st_mtime),
        reverse=True,
    )
    raw = cands[0]
    a, b = _range_of(raw)
    out["path"] = raw
    out["from"] = a or None
    out["to"] = b or None
    return out


def find_fbn_stock_files(
    shop_id: str, ymd: Optional[str] = None
) -> dict[str, Optional[Path]]:
    """
    按店 + 报表日定位落盘文件（同步用）。
    目录：./data\\shops\\{shopId}\\portal-imports\\
      fbn_inventory_ledger_summary_{Y}.csv  ← 原表（auto-ingest → stock）
      fbn_vs_supermall_{Y}.csv              ← 决策表
    ymd 缺省则取该店最新一份 summary（按文件名日期，其次 mtime）。
    """
    sid = shop_id.strip().upper()
    d = shop_portal_imports(sid)
    out: dict[str, Optional[Path]] = {"raw": None, "pivot": None, "ymd": None}
    if not d.is_dir():
        return out

    summaries = [
        p
        for p in d.iterdir()
        if p.is_file()
        and p.suffix.lower() == ".csv"
        and p.name.lower().startswith("fbn_inventory_ledger_summary_")
    ]
    if not summaries:
        return out

    def _ymd_of(p: Path) -> str:
        m = re.search(r"(20\d{2}-\d{2}-\d{2})", p.name)
        return m.group(1) if m else ""

    if ymd:
        y = ymd.strip()
        raw = d / fbn_summary_name(y)
        pivot = d / fbn_pivot_name(y)
        out["ymd"] = y
        out["raw"] = raw if raw.is_file() else None
        out["pivot"] = pivot if pivot.is_file() else None
        return out

    summaries.sort(
        key=lambda p: (_ymd_of(p), p.stat().st_mtime),
        reverse=True,
    )
    raw = summaries[0]
    y = _ymd_of(raw)
    out["ymd"] = y or None
    out["raw"] = raw
    pivot = d / fbn_pivot_name(y) if y else None
    out["pivot"] = pivot if pivot and pivot.is_file() else None
    return out


def is_ephemeral_download(path: Path) -> bool:
    """系统/RPA下载目录里的临时落点（投递后可删，避免误当正式库）。"""
    p = Path(path).resolve()
    roots = [
        Path(r".\data\downloads").resolve(),
        USER_DOWNLOADS.resolve(),
        DOWNLOAD_DIR.resolve(),
    ]
    for r in roots:
        try:
            p.relative_to(r)
            return True
        except ValueError:
            continue
    return False


def wait_for_new_file(
    dirs: Iterable[Path],
    *,
    patterns: Iterable[str],
    since_ts: float,
    timeout_sec: float = 180,
    settle_sec: float = 1.5,
) -> Path:
    """等待目录出现新文件（mtime >= since_ts），匹配任一子串（大小写不敏感）。"""
    pats = [p.lower() for p in patterns]
    # 始终附带常见下载目录
    all_dirs = list(dirs) + [DOWNLOAD_DIR, USER_DOWNLOADS, INBOX_DIR, *EXTRA_DOWNLOAD_DIRS]
    seen = set()
    uniq_dirs = []
    for d in all_dirs:
        key = str(d).lower()
        if key in seen:
            continue
        seen.add(key)
        uniq_dirs.append(Path(d))

    deadline = time.time() + timeout_sec
    last_seen: Optional[Path] = None
    while time.time() < deadline:
        candidates: list[Path] = []
        for d in uniq_dirs:
            if not d.is_dir():
                continue
            for p in d.iterdir():
                if not p.is_file():
                    continue
                if p.name.endswith((".crdownload", ".tmp", ".partial")):
                    continue
                name_l = p.name.lower()
                if pats and not any(x in name_l for x in pats):
                    continue
                try:
                    st = p.stat()
                except OSError:
                    continue
                if st.st_mtime + 0.01 < since_ts:
                    continue
                if time.time() - st.st_mtime < settle_sec:
                    continue
                candidates.append(p)
        if candidates:
            candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
            last_seen = candidates[0]
            return last_seen
        time.sleep(1.0)
    raise TimeoutError(
        f"等待下载超时 {timeout_sec}s；patterns={list(patterns)} last={last_seen}"
    )


def _xlsx_shared_strings(zf: zipfile.ZipFile) -> list[str]:
    try:
        root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    out: list[str] = []
    for si in root.findall("m:si", NS):
        texts = [t.text or "" for t in si.findall(".//m:t", NS)]
        out.append("".join(texts))
    return out


def _col_index(cell_ref: str) -> int:
    letters = "".join(c for c in cell_ref if c.isalpha())
    n = 0
    for ch in letters.upper():
        n = n * 26 + (ord(ch) - 64)
    return max(n - 1, 0)


def _xlsx_sheet_rows(zf: zipfile.ZipFile, sheet_path: str, shared: list[str]) -> list[list[str]]:
    root = ET.fromstring(zf.read(sheet_path))
    rows: list[list[str]] = []
    for row in root.findall("m:sheetData/m:row", NS):
        cells: dict[int, str] = {}
        max_i = -1
        for c in row.findall("m:c", NS):
            ref = c.get("r") or ""
            i = _col_index(ref) if ref else (max_i + 1)
            max_i = max(max_i, i)
            t = c.get("t")
            v = c.find("m:v", NS)
            if t == "inlineStr":
                texts = [t_.text or "" for t_ in c.findall(".//m:t", NS)]
                val = "".join(texts)
            elif v is None:
                val = ""
            elif t == "s":
                try:
                    val = shared[int(v.text or "0")]
                except (ValueError, IndexError):
                    val = v.text or ""
            else:
                val = v.text or ""
            cells[i] = val
        if max_i < 0:
            rows.append([])
        else:
            rows.append([cells.get(i, "") for i in range(max_i + 1)])
    return rows


def _pick_sku_sheet(zf: zipfile.ZipFile) -> str:
    wb = ET.fromstring(zf.read("xl/workbook.xml"))
    sheets = []
    for sh in wb.findall("m:sheets/m:sheet", NS):
        name = sh.get("name") or ""
        rid = sh.get(
            "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
        )
        sheets.append((name, rid))
    rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    rid_to_target = {}
    for rel in rels:
        rid_to_target[rel.get("Id")] = rel.get("Target")

    # 优先 SKU 页
    preferred = []
    others = []
    for name, rid in sheets:
        target = rid_to_target.get(rid) or ""
        if not target.startswith("worksheets/"):
            target = "worksheets/" + target.split("/")[-1]
        path = "xl/" + target.lstrip("/")
        bucket = preferred if re.search(r"sku", name, re.I) else others
        bucket.append((name, path))
    chosen = preferred[0] if preferred else (others[0] if others else None)
    if not chosen:
        raise ValueError("xlsx 无可用 sheet")
    return chosen[1]


def read_tabular(path: Path) -> list[dict[str, str]]:
    """读 csv 或 xlsx（优先 SKU sheet）→ list[dict]。"""
    path = Path(path)
    suffix = path.suffix.lower()
    if suffix in (".csv", ".txt"):
        text = path.read_text(encoding="utf-8-sig", errors="replace")
        reader = csv.DictReader(io.StringIO(text))
        return [{(k or "").strip(): (v or "").strip() for k, v in row.items()} for row in reader]

    if suffix in (".xlsx", ".xlsm"):
        with zipfile.ZipFile(path) as zf:
            shared = _xlsx_shared_strings(zf)
            sheet = _pick_sku_sheet(zf)
            raw_rows = _xlsx_sheet_rows(zf, sheet, shared)
        if not raw_rows:
            return []
        hdr_i = 0
        for i, r in enumerate(raw_rows[:10]):
            joined = " ".join(str(c).lower() for c in r)
            if "sku" in joined and (
                "campaign" in joined or "spend" in joined or "clicks" in joined
            ):
                hdr_i = i
                break
        headers = [str(h).strip() for h in raw_rows[hdr_i]]
        out = []
        for r in raw_rows[hdr_i + 1 :]:
            d = {}
            for i, h in enumerate(headers):
                if not h:
                    continue
                d[h] = r[i].strip() if i < len(r) else ""
            if any(d.values()):
                out.append(d)
        return out

    raise ValueError(f"不支持的文件类型: {path}")


def _get(row: dict[str, str], *keys: str) -> str:
    lower = {k.lower().strip(): v for k, v in row.items()}
    for k in keys:
        if k.lower() in lower and lower[k.lower()]:
            return lower[k.lower()]
    return ""


def normalize_ads_rows(
    rows: list[dict[str, str]],
    from_date: str,
    to_date: str,
) -> list[dict[str, str]]:
    """对齐noon-ops parseAdsContent 可识别字段。"""
    out: list[dict[str, str]] = []
    for row in rows:
        sku = _get(row, "sku", "partner_sku", "partner sku", "psku")
        if not sku or sku.lower() == "sku":
            continue
        campaign = _get(row, "campaign_name", "campaign name", "campaign")
        f = _get(row, "from_date", "start date", "start_date") or from_date
        t = _get(row, "to_date", "end date", "end_date") or to_date
        out.append(
            {
                "sku": sku,
                "campaign_name": campaign,
                "from_date": f,
                "to_date": t,
                "spend": _get(row, "spend", "spends", "cost", "ad spend", "ad_spend")
                or "0",
                "revenue": _get(
                    row, "revenue", "sales", "ad revenue", "ad_revenue", "ad_sales", "gmv"
                )
                or "0",
                "orders": _get(row, "orders", "units", "conversions", "ad_orders") or "0",
                "views": _get(row, "views", "impressions") or "0",
                "clicks": _get(row, "clicks") or "0",
                "atc": _get(
                    row,
                    "atc",
                    "add to cart",
                    "add_to_cart",
                    "add-to-cart",
                    "addtocart",
                    "加购",
                )
                or "0",
            }
        )
    return out


def write_ads_csv(rows: list[dict[str, str]], dest: Path) -> Path:
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=ADS_HEADERS)
        w.writeheader()
        for r in rows:
            w.writerow({h: r.get(h, "") for h in ADS_HEADERS})
    return dest


def normalize_ads_file(
    src: Path,
    *,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    days: int = 7,
    shop_id: Optional[str] = None,
) -> Path:
    """
    任意 Campaign Overview 落盘文件 → Exports/ads/{shopId}/ads_sku_{from}_{to}.csv
    无 shop_id 时仍写 Exports/ 根目录（兼容 inbox 单文件）。
    """
    sid = (shop_id or "").strip().upper() or None
    if sid:
        ensure_dirs([sid])
    else:
        ensure_dirs()
    src = Path(src)
    rng = parse_date_range_from_name(src.name)
    if from_date and to_date:
        f, t = from_date, to_date
    elif rng:
        f, t = rng
    else:
        f, t = default_date_range(days)

    rows = normalize_ads_rows(read_tabular(src), f, t)
    if not rows:
        raise ValueError(f"未解析到广告行: {src}")

    out_dir = shop_export_ads_dir(sid) if sid else EXPORT_DIR
    out = out_dir / f"ads_sku_{f}_{t}.csv"
    write_ads_csv(rows, out)
    return out


def process_ads_and_deliver(
    src: Path,
    *,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    days: int = 7,
    shop_id: Optional[str] = None,
) -> dict:
    sid = (shop_id or os.environ.get("NOON_SHOP", "")).strip().upper()
    if not sid:
        raise ValueError("process_ads_and_deliver 需要 shop_id（或 NOON_SHOP）")
    csv_path = normalize_ads_file(
        src, from_date=from_date, to_date=to_date, days=days, shop_id=sid
    )
    portal = deliver_to_portal(csv_path, shop_id=sid)
    return {
        "shop_id": sid,
        "source": str(src),
        "export": str(csv_path),
        "portal": str(portal),
        "rows": sum(1 for _ in csv_path.open(encoding="utf-8-sig")) - 1,
    }


def list_inbox_candidates(
    patterns: Iterable[str] = ("ads", "campaign", "overview", "sku", "overview_all"),
) -> list[Path]:
    ensure_dirs()
    pats = [p.lower() for p in patterns]
    found: list[Path] = []
    scan_dirs = [INBOX_DIR, EXPORT_DIR, DOWNLOAD_DIR, USER_DOWNLOADS, *EXTRA_DOWNLOAD_DIRS]
    for d in scan_dirs:
        if not d.is_dir():
            continue
        for p in d.iterdir():
            if not p.is_file():
                continue
            if p.suffix.lower() not in (".csv", ".xlsx", ".xlsm", ".txt"):
                continue
            name = p.name.lower()
            if any(x in name for x in pats):
                found.append(p)
    found.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return found


def guess_portal_name(src: Path, domain_hint: Optional[str] = None) -> str:
    """非 ads 域：尽量保留可识别文件名；ads 走 normalize。"""
    name = src.name
    if domain_hint == "ads" or re.search(r"ads|campaign.?overview", name, re.I):
        return name  # normalize 会另起规范名
    return name


# —— 市场情报（Noon 沙特选品/竞品）——

MARKET_INTEL_SA = NOON_DATA_ROOT / "market-imports" / "noon" / "sa"
MARKET_INTEL_RPA_INBOX = MARKET_INTEL_SA / "inbox" / "rpa"
MARKET_INTEL_EXPORT = EXPORT_DIR / "market-intel" / "sa"


def ensure_market_intel_dirs() -> None:
    for d in (MARKET_INTEL_SA, MARKET_INTEL_RPA_INBOX, MARKET_INTEL_EXPORT, LOG_DIR):
        d.mkdir(parents=True, exist_ok=True)


def deliver_market_intel_payload(
    *,
    category_id: str,
    products: list[dict],
    source: str = "rpa",
    intent: str = "white_label_seller_intel",
    hot_list: list[dict] | None = None,
    extra: dict | None = None,
) -> Path:
    """
    写入noon-ops热目录：
      ./data\\market-imports\\noon\\sa\\inbox\\rpa\\{categoryId}_{stamp}.json

    products: 主投递（优先白牌+卖家深采）
    hot_list: 类目热度信号（可含大牌，仅作参考）
    """
    ensure_market_intel_dirs()
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_cat = re.sub(r"[^\w.-]+", "-", (category_id or "unknown").strip()) or "unknown"
    dest = MARKET_INTEL_RPA_INBOX / f"{safe_cat}_{stamp}.json"
    envelope = {
        "source": source,
        "intent": intent,
        "categoryId": category_id,
        "capturedAt": datetime.now().isoformat(timespec="seconds"),
        "products": products,
        "hotList": hot_list or [],
    }
    if extra:
        envelope.update(extra)
    dest.write_text(
        __import__("json").dumps(envelope, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    bak = MARKET_INTEL_EXPORT / dest.name
    shutil.copy2(dest, bak)
    return dest
