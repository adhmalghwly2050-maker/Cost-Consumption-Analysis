"""
BOQ Historical Consumption Analyzer
Handles both Oracle Reports HTML formats:
  Format A: Absolute-positioned spans (file 1 - الهندهولات_والاخلاء)
  Format B: HTML table-based (files 2-4 - هندهولات_2/3/4)
"""

import os
import re
import sys
import json
import warnings
import traceback
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from bs4 import BeautifulSoup
from scipy import stats

warnings.filterwarnings("ignore")

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
HTML_DIR = ROOT_DIR / "attached_assets"
OUTPUT_DIR = ROOT_DIR / "outputs" / "boq_analysis"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

HTML_FILES = sorted(HTML_DIR.glob("*.HTM")) + sorted(HTML_DIR.glob("*.htm"))


# ─── Encoding ─────────────────────────────────────────────────────────────────

def decode_file(raw: bytes) -> str:
    for enc in ("windows-1256", "cp1256", "utf-8", "latin-1"):
        try:
            return raw.decode(enc)
        except (UnicodeDecodeError, LookupError):
            continue
    return raw.decode("latin-1", errors="replace")


# ─── Format Detection ─────────────────────────────────────────────────────────

def is_absolute_positioned(html: str) -> bool:
    """Returns True if file uses CSS position:absolute layout (Format A)."""
    return "position:absolute" in html.replace(" ", "")


# ═══════════════════════════════════════════════════════════════════════════════
#  FORMAT A: Absolute-positioned spans
# ═══════════════════════════════════════════════════════════════════════════════

def parse_pos(style: str, key: str) -> Optional[float]:
    m = re.search(rf"{key}\s*:\s*([\d.]+)", style)
    return float(m.group(1)) if m else None


def extract_absolute_elements(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    elements = []
    for tag in soup.find_all(["span", "div"]):
        style = tag.get("style", "")
        if "position:absolute" not in style.replace(" ", ""):
            continue
        top = parse_pos(style, "top")
        right = parse_pos(style, "right")
        if top is None or right is None:
            continue
        text = tag.get_text(" ", strip=True)
        if text:
            elements.append({"top": top, "right": right, "text": text})
    return elements


def group_into_rows(elements: list[dict], tolerance: float = 5.0) -> list[list[dict]]:
    if not elements:
        return []
    tops = sorted(set(e["top"] for e in elements))
    clusters: list[float] = []
    for t in tops:
        if clusters and abs(t - clusters[-1]) <= tolerance:
            continue
        clusters.append(t)

    rows: list[list[dict]] = [[] for _ in clusters]
    for e in elements:
        idx = min(range(len(clusters)), key=lambda i: abs(clusters[i] - e["top"]))
        rows[idx].append(e)
    for row in rows:
        row.sort(key=lambda e: e["right"], reverse=True)
    return rows


# Calibrated column buckets from the actual Arabic header row of file 1:
# right:18   = رقم المشروع  (Project Number)
# right:209  = اسم المشروع  (Project Name)
# right:411  = النوع        (Type)
# right:471  = الحالة       (Status)
# right:509  = تاريخ التكليف (Assignment Date)
# right:574  = اجمالي الطلبات (Total Requests = ALLOCATED)
# right:645  = اجمالي ما تم اخلاؤه (Total Cleared = CONSUMED)
# right:723  = م البند       (Item Seq No)
# right:760  = الكلفة        (Cost element description)
# right:890  = الكلفة        (Cost element ID)
# right:1024 = البند         (Item)
# right:1154 = البند         (Item desc)
# right:1329 = الفرع         (Branch)
# right:1398 = الوحدة        (Unit)
# right:1439 = الكمية        (Quantity at item level)
# right:1494 = سعر الوحدة    (Unit Price)
# right:1577 = القيمة        (Value)
# right:1641 = اجمالي الطلبات (Total Requests again)
# right:1711 = اجمالي ما تم اخلاؤه (Total Cleared again)
# right:2678 = مبلغ الطلبات  (Requests Amount - GIS)

COL_MAP_A = [
    # (center_right, tolerance, field_name)
    (18,   50,  "project_id"),
    (209,  80,  "project_name"),
    (411,  40,  "item_type"),
    (471,  30,  "status"),
    (509,  30,  "date_field"),
    (574,  40,  "total_requests"),      # ALLOCATED (project level)
    (645,  40,  "total_cleared"),       # CONSUMED (project level)
    (723,  35,  "item_seq"),
    (760,  50,  "element_id"),           # cost element ID (numeric like 286, 5)
    (890,  70,  "element_desc"),        # cost element description (Arabic text)
    (1024, 80,  "item_id"),
    (1154, 90,  "item_desc"),
    (1329, 90,  "branch"),
    (1398, 40,  "uom"),
    (1439, 30,  "quantity"),
    (1494, 40,  "unit_price"),
    (1577, 60,  "value"),
    (1641, 50,  "total_requests_item"),
    (1711, 60,  "total_cleared_item"),
    (2678, 120, "gis_requests_amount"),
    (2820, 120, "gis_cleared_amount"),
    (2305, 80,  "gis_item_code"),
    (2432, 90,  "gis_item_desc"),
    (2625, 60,  "gis_cleared_qty"),
    (2765, 60,  "gis_requests_qty"),
]


def classify_cell_a(right: float) -> Optional[str]:
    best = None
    best_dist = float("inf")
    for center, tol, name in COL_MAP_A:
        dist = abs(right - center)
        if dist <= tol and dist < best_dist:
            best = name
            best_dist = dist
    return best


def row_to_dict_a(row: list[dict]) -> dict:
    record: dict = {}
    for cell in row:
        field = classify_cell_a(cell["right"])
        if field:
            existing = record.get(field, "")
            record[field] = (existing + " " + cell["text"]).strip() if existing else cell["text"]
    return record


def process_file_format_a(html: str, filename: str) -> pd.DataFrame:
    elements = extract_absolute_elements(html)
    rows = group_into_rows(elements, tolerance=6.0)
    records = []
    for row in rows:
        d = row_to_dict_a(row)
        if not d:
            continue
        # Skip header/empty rows (they lack project_id-like numeric content)
        has_numeric = any(
            re.search(r'\d{3,}', str(d.get(k, "")))
            for k in ("project_id", "total_requests", "total_cleared", "item_id")
        )
        if not has_numeric:
            continue
        d["source_file"] = filename
        records.append(d)
    return pd.DataFrame(records)


# ═══════════════════════════════════════════════════════════════════════════════
#  FORMAT B: HTML table-based
# ═══════════════════════════════════════════════════════════════════════════════

# Header columns (31 real columns at even indices 0, 2, 4, ... 60):
# idx  0: رقم المشروع    → project_id
# idx  2: اسم المشروع   → project_name
# idx  4: النوع         → item_type
# idx  6: الحالة        → status
# idx  8: تاريخ التكليف → date_field
# idx 10: اجمالي الطلبات → total_requests (ALLOCATED at project level)
# idx 12: اجمالي ما تم اخلاؤه → total_cleared (CONSUMED at project level)
# idx 14: م البند       → item_seq
# idx 16: الكلفة        → element_id
# idx 18: الكلفة        → element_desc
# idx 20: البند         → item_id
# idx 22: البند         → item_desc
# idx 24: الفرع         → branch
# idx 26: الوحدة        → uom
# idx 28: الكمية        → quantity
# idx 30: سعر الوحدة    → unit_price
# idx 32: القيمة        → value
# idx 34: اجمالي الطلبات (item-level)
# idx 36: اجمالي ما تم اخلاؤه (item-level)
# idx 38: بيان الكلفة GIS → gis_cost_desc
# idx 40: النوع GIS     → gis_type
# idx 42: الوحدة GIS    → gis_uom
# idx 44: الكمية GIS    → gis_qty (KEY ELEMENT QUANTITY IN GIS)
# idx 46: س.الوحدة GIS  → gis_unit_price
# idx 48: القيمة GIS    → gis_value
# idx 50: رمز الصنف     → gis_item_code
# idx 52: اسم الصنف     → gis_item_name
# idx 54: كمية الطلب    → request_qty  (ALLOCATED element qty)
# idx 56: مبلغ الطلبات  → request_amount
# idx 58: كمية الاخلاء  → cleared_qty  (CONSUMED element qty)
# idx 60: مبلغ الاخلاء  → cleared_amount

COL_NAMES_B_FULL = [
    "project_id", "", "project_name", "", "item_type", "", "status", "",
    "date_field", "", "total_requests", "", "total_cleared", "",
    "item_seq", "", "element_id", "", "element_desc", "",
    "item_id", "", "item_desc", "", "branch", "", "uom", "",
    "quantity", "", "unit_price", "", "value", "",
    "total_requests_item", "", "total_cleared_item", "",
    "gis_cost_desc", "", "gis_type", "", "gis_uom", "",
    "gis_qty", "", "gis_unit_price", "", "gis_value", "",
    "gis_item_code", "", "gis_item_name", "",
    "request_qty", "", "request_amount", "",
    "cleared_qty", "", "cleared_amount", "",
]

# Sub-row (13 cells) column mapping: GIS item data only
# Structure revealed by debugging:
# ['', '1101105', '', 'حديد ابو 12ملم', '', '1', '', '4,991', '', '', '', '', '']
# idx:  0      1     2        3           4   5    6     7       8...
COL_NAMES_B_SUB = [
    "", "gis_item_code", "", "gis_item_name", "", "gis_qty", "", "gis_value",
    "", "", "", "", "",
]


def get_cell_text(cell) -> str:
    return cell.get_text(" ", strip=True)


def cells_to_dict(cells: list, col_names: list) -> dict:
    d = {}
    for i, cell in enumerate(cells):
        if i >= len(col_names):
            break
        name = col_names[i]
        if name and name != "":
            text = get_cell_text(cell)
            if text:
                d[name] = text
    return d


def parse_table_b(table) -> list[dict]:
    """
    Parse a Format-B HTML table. Returns list of element-level records
    with project/item context inherited from the most recent main row.
    """
    rows = table.find_all("tr")
    records = []
    current_ctx: dict = {}   # project+item context carried forward

    for row in rows:
        cells = row.find_all(["td", "th"])
        n = len(cells)

        if n < 4:
            continue

        # Skip rows where all cells are empty
        texts = [get_cell_text(c) for c in cells]
        nonempty = [t for t in texts if t]
        if not nonempty:
            continue

        # Detect main rows (≥50 cells = project+item+GIS data)
        if n >= 50:
            d = cells_to_dict(cells, COL_NAMES_B_FULL)
            # Skip header rows (contain Arabic column names)
            if any(v in d.values() for v in ("رقم المشروع", "اسم المشروع")):
                continue
            if not d.get("project_id"):
                continue

            # Update context
            current_ctx = {
                k: d[k] for k in (
                    "project_id", "project_name", "item_type", "status",
                    "date_field", "total_requests", "total_cleared",
                    "item_seq", "element_id", "element_desc",
                    "item_id", "item_desc", "branch"
                )
                if k in d
            }

            # Emit the GIS element in this main row
            if d.get("gis_item_code") or d.get("gis_qty") or d.get("request_qty"):
                rec = {**current_ctx}
                for k in ("gis_item_code", "gis_item_name", "gis_qty",
                          "gis_unit_price", "gis_value",
                          "request_qty", "request_amount",
                          "cleared_qty", "cleared_amount"):
                    if k in d:
                        rec[k] = d[k]
                records.append(rec)

        # Sub-rows: 13-14 cells = additional GIS elements under same project+item
        elif 10 <= n <= 16:
            d = cells_to_dict(cells, COL_NAMES_B_SUB)
            if not current_ctx:
                continue
            if not (d.get("gis_item_code") or d.get("gis_qty")):
                continue
            rec = {**current_ctx, **d}
            records.append(rec)

    return records


def process_file_format_b(html: str, filename: str) -> pd.DataFrame:
    soup = BeautifulSoup(html, "lxml")
    tables = soup.find_all("table")
    if not tables:
        return pd.DataFrame()

    all_records = []
    seen_project_items: set = set()

    for tbl in tables:
        recs = parse_table_b(tbl)
        for r in recs:
            # De-duplicate by project+item+element key
            key = (
                r.get("project_id", ""),
                r.get("item_id", ""),
                r.get("element_id", ""),
                r.get("gis_item_code", ""),
            )
            if key not in seen_project_items:
                seen_project_items.add(key)
                r["source_file"] = filename
                all_records.append(r)

    return pd.DataFrame(all_records)


# ═══════════════════════════════════════════════════════════════════════════════
#  Master Dataset Builder
# ═══════════════════════════════════════════════════════════════════════════════

def clean_number(val) -> Optional[float]:
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return None
    s = str(val).strip().replace(",", "").replace(" ", "").replace("\xa0", "")
    s = s.replace("\u066c", "").replace("\u066b", ".")
    try:
        v = float(s)
        return v if np.isfinite(v) else None
    except ValueError:
        return None


def process_file(path: Path) -> pd.DataFrame:
    print(f"  → Parsing: {path.name}")
    raw = path.read_bytes()
    html = decode_file(raw)

    if is_absolute_positioned(html):
        df = process_file_format_a(html, path.name)
        fmt = "A (absolute-positioned)"
    else:
        df = process_file_format_b(html, path.name)
        fmt = "B (table-based)"

    print(f"     Format {fmt}: {len(df)} records")
    return df


def build_master(files: list[Path]) -> pd.DataFrame:
    frames = []
    for f in files:
        try:
            df = process_file(f)
            if not df.empty:
                frames.append(df)
        except Exception as e:
            print(f"  ERROR {f.name}: {e}")
            traceback.print_exc()

    if not frames:
        raise RuntimeError("No data extracted from any HTML file")

    master = pd.concat(frames, ignore_index=True)

    # Numeric conversions for all likely-numeric columns
    num_cols = [
        "total_requests", "total_cleared",
        "total_requests_item", "total_cleared_item",
        "quantity", "unit_price", "value",
        "gis_qty", "gis_unit_price", "gis_value",
        "request_qty", "request_amount",
        "cleared_qty", "cleared_amount",
    ]
    for col in num_cols:
        if col in master.columns:
            master[col + "_num"] = master[col].apply(clean_number)

    return master


# ═══════════════════════════════════════════════════════════════════════════════
#  Allocation / Consumption Column Selection
# ═══════════════════════════════════════════════════════════════════════════════

def select_qty_columns(df: pd.DataFrame) -> tuple[str, str]:
    """
    Choose the best (allocated, consumed) numeric column pair.
    Priority: element-level request/cleared > project-level totals.
    """
    MIN_VALID_PAIRS = 5  # require at least this many alloc+used pairs

    candidates = [
        # (allocated_col, consumed_col, description)
        ("request_qty_num", "cleared_qty_num",
         "element-level request qty / cleared qty"),
        ("total_requests_num", "total_cleared_num",
         "project-level total requests / cleared"),
        ("total_requests_item_num", "total_cleared_item_num",
         "item-level totals"),
        ("gis_qty_num", None,
         "GIS qty (allocation only)"),
    ]
    for alloc_col, used_col, label in candidates:
        a_ok = alloc_col in df.columns and df[alloc_col].notna().sum() >= 1
        if used_col:
            valid_pairs = (
                df[alloc_col].notna() & df[used_col].notna() &
                (df[alloc_col] > 0) & (df[used_col] >= 0)
            ).sum() if (alloc_col in df.columns and used_col in df.columns) else 0
            if a_ok and valid_pairs >= MIN_VALID_PAIRS:
                print(f"  Using: {label} ({valid_pairs} valid pairs)")
                return alloc_col, used_col
        else:
            if a_ok:
                print(f"  Using: {label} (allocation only)")
                return alloc_col, ""

    print("  WARNING: No usable quantity columns found")
    return "", ""


# ═══════════════════════════════════════════════════════════════════════════════
#  Statistical Analysis
# ═══════════════════════════════════════════════════════════════════════════════

def compute_stats(series: pd.Series) -> dict:
    clean = series.dropna()
    clean = clean[np.isfinite(clean)]
    n = len(clean)
    if n < 1:
        return {}

    q1, q3 = float(clean.quantile(0.25)), float(clean.quantile(0.75))
    iqr = q3 - q1
    lb, ub = q1 - 1.5 * iqr, q3 + 1.5 * iqr
    outlier_iqr = ((clean < lb) | (clean > ub)).sum()

    z = np.abs(stats.zscore(clean)) if n > 2 else pd.Series([0.0] * n, index=clean.index)
    outlier_z = (z > 2.5).sum()

    inlier_mask = (clean >= lb) & (clean <= ub) & (z <= 2.5)
    inliers = clean[inlier_mask] if inlier_mask.sum() > 0 else clean

    return {
        "n": n,
        "n_outliers_iqr": int(outlier_iqr),
        "n_outliers_z": int(outlier_z),
        "mean": float(clean.mean()),
        "median": float(clean.median()),
        "std": float(clean.std()) if n > 1 else 0.0,
        "min": float(clean.min()),
        "max": float(clean.max()),
        "p25": q1,
        "p50": float(clean.quantile(0.50)),
        "p75": q3,
        "p80": float(clean.quantile(0.80)),
        "p90": float(clean.quantile(0.90)),
        "iqr": iqr,
        "inlier_mean": float(inliers.mean()),
        "inlier_median": float(inliers.median()),
        "inlier_std": float(inliers.std()) if len(inliers) > 1 else 0.0,
    }


def efficiency_label(cf: float) -> str:
    if np.isnan(cf) or not np.isfinite(cf):
        return "unknown"
    if cf >= 0.90:
        return "excellent"
    if cf >= 0.75:
        return "good"
    if cf >= 0.50:
        return "moderate"
    return "poor"


def analyze(df: pd.DataFrame, alloc_col: str, used_col: str) -> pd.DataFrame:
    df = df.copy()
    has_used = bool(used_col) and used_col in df.columns

    valid = df[alloc_col].notna() & (df[alloc_col] > 0)
    if has_used:
        valid &= df[used_col].notna() & (df[used_col] >= 0)

    df.loc[valid, "_alloc"] = df.loc[valid, alloc_col]
    df.loc[valid, "_used"]  = df.loc[valid, used_col] if has_used else np.nan

    if has_used:
        used_nz = df["_used"].replace(0, np.nan)
        df.loc[valid, "consumption_factor"] = df.loc[valid, "_used"] / df.loc[valid, "_alloc"]
        df.loc[valid, "over_allocation"] = df.loc[valid, "_alloc"] - df.loc[valid, "_used"]
        df.loc[valid, "over_allocation_pct"] = (
            df.loc[valid, "over_allocation"] / used_nz.loc[valid]
        ) * 100

    # Choose group columns dynamically
    group_candidates = [
        ("item_id", "item_desc", "element_id", "element_desc"),
        ("item_id", "item_desc", "element_id"),
        ("item_id", "element_id"),
        ("item_id",),
        ("element_id",),
        ("gis_item_code", "gis_item_name"),
        ("source_file",),
    ]
    group_cols = []
    for candidates in group_candidates:
        cols = [c for c in candidates if c in df.columns and df[c].notna().sum() > 0]
        if cols:
            group_cols = cols
            break

    print(f"  Grouping by: {group_cols}")

    rows_out = []
    for key, grp in df.groupby(group_cols, dropna=False):
        if not isinstance(key, tuple):
            key = (key,)
        base = dict(zip(group_cols, key))

        alloc_s  = grp["_alloc"].dropna() if "_alloc" in grp.columns else pd.Series(dtype=float)
        used_s   = grp["_used"].dropna()  if "_used"  in grp.columns else pd.Series(dtype=float)
        cf_s     = grp["consumption_factor"].dropna() if "consumption_factor" in grp.columns else pd.Series(dtype=float)
        oa_s     = grp["over_allocation_pct"].dropna() if "over_allocation_pct" in grp.columns else pd.Series(dtype=float)

        cf_stats = compute_stats(cf_s)
        oa_stats = compute_stats(oa_s)
        al_stats = compute_stats(alloc_s)
        us_stats = compute_stats(used_s)

        if alloc_s.empty and cf_s.empty:
            continue

        n_projects = len(grp)

        if cf_stats:
            median_cf = cf_stats.get("inlier_median", cf_stats["median"])
            p80_cf    = cf_stats.get("p80", np.nan)
            std_cf    = cf_stats.get("std", np.nan)
            rec_factor = 0.6 * median_cf + 0.4 * p80_cf if not np.isnan(p80_cf) else median_cf
        else:
            median_cf = rec_factor = p80_cf = std_cf = np.nan

        row = {
            **base,
            "n_projects": n_projects,
            "n_outliers": cf_stats.get("n_outliers_iqr", 0) if cf_stats else 0,
            "median_cf": _r(median_cf),
            "mean_cf": _r(cf_stats.get("mean", np.nan)) if cf_stats else np.nan,
            "p75_cf": _r(cf_stats.get("p75", np.nan)) if cf_stats else np.nan,
            "p80_cf": _r(p80_cf),
            "p90_cf": _r(cf_stats.get("p90", np.nan)) if cf_stats else np.nan,
            "std_cf": _r(std_cf),
            "min_cf": _r(cf_stats.get("min", np.nan)) if cf_stats else np.nan,
            "max_cf": _r(cf_stats.get("max", np.nan)) if cf_stats else np.nan,
            "avg_over_alloc_pct": _r(oa_stats.get("mean", np.nan)) if oa_stats else np.nan,
            "median_over_alloc_pct": _r(oa_stats.get("median", np.nan)) if oa_stats else np.nan,
            "recommended_factor": _r(rec_factor),
            "avg_alloc_qty": _r(al_stats.get("mean", np.nan)) if al_stats else np.nan,
            "avg_used_qty": _r(us_stats.get("mean", np.nan)) if us_stats else np.nan,
            "median_used_qty": _r(us_stats.get("median", np.nan)) if us_stats else np.nan,
            "efficiency_rating": efficiency_label(median_cf),
            "has_consumption_data": has_used,
        }
        rows_out.append(row)

    return pd.DataFrame(rows_out)


def _r(v, decimals: int = 4) -> Optional[float]:
    if v is None or (isinstance(v, float) and (np.isnan(v) or not np.isfinite(v))):
        return None
    return round(float(v), decimals)


# ═══════════════════════════════════════════════════════════════════════════════
#  Insights
# ═══════════════════════════════════════════════════════════════════════════════

def build_insights(analysis: pd.DataFrame, master: pd.DataFrame) -> dict:
    if analysis.empty:
        return {"kpis": {}, "worst_over_allocated": [], "most_stable": [], "most_volatile": [], "efficiency_distribution": {}}

    # Rankings
    worst_col = "avg_over_alloc_pct" if "avg_over_alloc_pct" in analysis.columns else None
    worst = (
        analysis[analysis[worst_col].notna()]
        .sort_values(worst_col, ascending=False)
        .head(20)
        .replace({np.nan: None, np.inf: None, -np.inf: None})
        .to_dict(orient="records")
        if worst_col else []
    )

    std_col = "std_cf" if "std_cf" in analysis.columns else None
    stable = volatile = []
    if std_col:
        base = analysis[analysis["n_projects"] >= 1].copy()
        stable = (
            base.sort_values(std_col)
            .head(10)
            .replace({np.nan: None, np.inf: None, -np.inf: None})
            .to_dict(orient="records")
        )
        volatile = (
            base.sort_values(std_col, ascending=False)
            .head(10)
            .replace({np.nan: None, np.inf: None, -np.inf: None})
            .to_dict(orient="records")
        )

    # KPIs
    alloc_total = master.get("_alloc", pd.Series(dtype=float)).sum()
    used_total  = master.get("_used",  pd.Series(dtype=float)).sum()
    valid_cf    = analysis["median_cf"].dropna() if "median_cf" in analysis.columns else pd.Series(dtype=float)

    eff_dist = {}
    if "efficiency_rating" in analysis.columns:
        eff_dist = analysis["efficiency_rating"].value_counts().to_dict()

    kpis = {
        "total_items_analyzed": len(analysis),
        "total_projects": int(master["source_file"].nunique()) if "source_file" in master.columns else 0,
        "total_rows_extracted": len(master),
        "overall_consumption_rate": _r(float(used_total / alloc_total), 4) if alloc_total > 0 and used_total > 0 else None,
        "overall_over_allocation_pct": _r(float((alloc_total - used_total) / used_total * 100), 2) if used_total > 0 else None,
        "median_consumption_factor": _r(float(valid_cf.median()), 4) if len(valid_cf) > 0 else None,
        "items_with_poor_efficiency": int((analysis.get("efficiency_rating", pd.Series()) == "poor").sum()),
        "items_with_excellent_efficiency": int((analysis.get("efficiency_rating", pd.Series()) == "excellent").sum()),
    }

    return {
        "kpis": kpis,
        "worst_over_allocated": worst,
        "most_stable": stable,
        "most_volatile": volatile,
        "efficiency_distribution": eff_dist,
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  Export
# ═══════════════════════════════════════════════════════════════════════════════

def clean_for_json(obj):
    if isinstance(obj, dict):
        return {k: clean_for_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [clean_for_json(i) for i in obj]
    if isinstance(obj, float) and (np.isnan(obj) or np.isinf(obj)):
        return None
    return obj


def export_results(master: pd.DataFrame, analysis: pd.DataFrame, insights: dict) -> dict:
    master_path   = OUTPUT_DIR / "master_dataset.csv"
    analysis_path = OUTPUT_DIR / "analysis_results.csv"
    excel_path    = OUTPUT_DIR / "boq_analysis.xlsx"
    json_path     = OUTPUT_DIR / "dashboard_data.json"

    master.to_csv(master_path, index=False, encoding="utf-8-sig")
    analysis.to_csv(analysis_path, index=False, encoding="utf-8-sig")
    print(f"  ✓ CSVs exported")

    with pd.ExcelWriter(excel_path, engine="openpyxl") as writer:
        analysis.to_excel(writer, sheet_name="Analysis Results", index=False)
        master.head(5000).to_excel(writer, sheet_name="Master Dataset", index=False)
        pd.DataFrame([insights.get("kpis", {})]).to_excel(writer, sheet_name="KPIs", index=False)
        pd.DataFrame(insights.get("worst_over_allocated", [])).to_excel(
            writer, sheet_name="Worst Over-Allocated", index=False)
        pd.DataFrame(insights.get("most_stable", [])).to_excel(
            writer, sheet_name="Most Stable", index=False)
        pd.DataFrame(insights.get("most_volatile", [])).to_excel(
            writer, sheet_name="Most Volatile", index=False)
    print(f"  ✓ Excel exported")

    analysis_clean = analysis.replace({np.nan: None, np.inf: None, -np.inf: None})

    # Column samples for diagnostic
    col_samples = {}
    for col in master.columns:
        if master[col].dtype == object:
            sample = master[col].dropna().head(3).tolist()
            if sample:
                col_samples[col] = sample

    dashboard = {
        "kpis": insights.get("kpis", {}),
        "analysis": analysis_clean.to_dict(orient="records"),
        "insights": {
            "worst_over_allocated": insights.get("worst_over_allocated", []),
            "most_stable": insights.get("most_stable", []),
            "most_volatile": insights.get("most_volatile", []),
            "efficiency_distribution": insights.get("efficiency_distribution", {}),
        },
        "column_samples": col_samples,
        "has_consumption_data": bool(
            not analysis_clean.empty and
            "mean_cf" in analysis_clean.columns and
            analysis_clean["mean_cf"].notna().any()
        ),
    }

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(clean_for_json(dashboard), f, ensure_ascii=False, indent=2)
    print(f"  ✓ JSON exported")

    return {
        "master_csv": str(master_path),
        "analysis_csv": str(analysis_path),
        "excel": str(excel_path),
        "dashboard_json": str(json_path),
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  Charts
# ═══════════════════════════════════════════════════════════════════════════════

def generate_charts(master: pd.DataFrame, analysis: pd.DataFrame) -> list[str]:
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        return []

    charts_dir = OUTPUT_DIR / "charts"
    charts_dir.mkdir(exist_ok=True)

    plt.rcParams.update({
        "figure.facecolor": "#1a1a2e",
        "axes.facecolor": "#16213e",
        "axes.edgecolor": "#0f3460",
        "text.color": "#e0e0e0",
        "axes.labelcolor": "#e0e0e0",
        "xtick.color": "#e0e0e0",
        "ytick.color": "#e0e0e0",
        "grid.color": "#0f3460",
        "grid.alpha": 0.5,
    })

    generated = []

    # 1. Allocation vs Consumed comparison (if both available)
    if "_alloc" in master.columns and "_used" in master.columns:
        valid = master[master["_alloc"].notna() & master["_used"].notna() &
                       (master["_alloc"] > 0) & (master["_used"] >= 0)]
        if len(valid) > 0:
            fig, ax = plt.subplots(figsize=(9, 5))
            ax.scatter(valid["_alloc"].clip(upper=valid["_alloc"].quantile(0.95)),
                       valid["_used"].clip(upper=valid["_used"].quantile(0.95)),
                       alpha=0.5, color="#e94560", s=25, edgecolors="none")
            m = max(valid["_alloc"].quantile(0.95), valid["_used"].quantile(0.95))
            ax.plot([0, m], [0, m], "w--", linewidth=1, alpha=0.6, label="Perfect allocation")
            ax.set_xlabel("Allocated Quantity")
            ax.set_ylabel("Consumed Quantity")
            ax.set_title("Allocated vs Consumed Quantity", fontsize=13, fontweight="bold")
            ax.legend()
            ax.grid(True, alpha=0.3)
            plt.tight_layout()
            fig.savefig(charts_dir / "alloc_vs_consumed.png", dpi=120)
            plt.close(fig)
            generated.append("alloc_vs_consumed.png")

    # 2. Consumption factor distribution
    if "consumption_factor" in master.columns:
        cf = master["consumption_factor"].dropna()
        cf = cf[np.isfinite(cf)]
        if len(cf) > 1:
            fig, ax = plt.subplots(figsize=(10, 5))
            cf_clipped = cf.clip(0, 3)
            ax.hist(cf_clipped, bins=min(40, max(10, len(cf) // 3)),
                    color="#e94560", edgecolor="#1a1a2e", alpha=0.85)
            ax.axvline(float(cf.median()), color="#f5a623", linestyle="--",
                       linewidth=2, label=f"Median: {cf.median():.2f}")
            if len(cf) > 1:
                ax.axvline(float(cf.quantile(0.80)), color="#4ade80", linestyle=":",
                           linewidth=2, label=f"P80: {cf.quantile(0.80):.2f}")
            ax.set_title("Consumption Factor Distribution", fontsize=13, fontweight="bold")
            ax.set_xlabel("Consumption Factor (Consumed / Allocated)")
            ax.set_ylabel("Count")
            ax.legend()
            plt.tight_layout()
            fig.savefig(charts_dir / "consumption_factor_dist.png", dpi=120)
            plt.close(fig)
            generated.append("consumption_factor_dist.png")

    # 3. Efficiency distribution pie
    if "efficiency_rating" in analysis.columns and len(analysis) > 0:
        eff = analysis["efficiency_rating"].value_counts()
        if len(eff) > 0:
            colors = {
                "excellent": "#4ade80", "good": "#86efac",
                "moderate": "#fbbf24", "poor": "#f87171",
                "unknown": "#94a3b8",
            }
            pie_cols = [colors.get(k, "#94a3b8") for k in eff.index]
            fig, ax = plt.subplots(figsize=(7, 7), facecolor="#1a1a2e")
            ax.pie(eff.values, labels=eff.index.tolist(), colors=pie_cols,
                   autopct="%1.0f%%", startangle=90,
                   textprops={"color": "#e0e0e0"})
            ax.set_title("Efficiency Rating Distribution", fontsize=13,
                         fontweight="bold", color="#e0e0e0")
            plt.tight_layout()
            fig.savefig(charts_dir / "efficiency_pie.png", dpi=120)
            plt.close(fig)
            generated.append("efficiency_pie.png")

    # 4. Over-allocation ranking bar chart
    if "avg_over_alloc_pct" in analysis.columns and len(analysis) > 0:
        top_oa = (
            analysis[analysis["avg_over_alloc_pct"].notna()]
            .sort_values("avg_over_alloc_pct", ascending=False)
            .head(15)
        )
        if not top_oa.empty:
            # Pick best available label column
            label_col = next(
                (c for c in ("element_desc", "item_desc", "gis_item_name", "item_id", "element_id")
                 if c in top_oa.columns),
                top_oa.columns[0]
            )
            labels = [str(v)[:20] if v is not None else "" for v in top_oa[label_col].tolist()]
            values = top_oa["avg_over_alloc_pct"].clip(-500, 2000).tolist()
            if labels and all(isinstance(v, (int, float)) and np.isfinite(v) for v in values):
                fig, ax = plt.subplots(figsize=(12, 6))
                ax.barh(labels[::-1], values[::-1], color="#e94560", alpha=0.85)
                ax.set_xlabel("Avg Over-Allocation %")
                ax.set_title("Top Items — Highest Over-Allocation", fontsize=13, fontweight="bold")
                ax.grid(axis="x", alpha=0.4)
                plt.tight_layout()
                fig.savefig(charts_dir / "over_allocation_ranking.png", dpi=120)
                plt.close(fig)
                generated.append("over_allocation_ranking.png")

    # 5. Allocation amount bar chart (per element, from GIS qty)
    qty_col = next(
        (c for c in ("gis_qty_num", "request_qty_num", "quantity_num")
         if c in master.columns and master[c].notna().sum() > 0),
        None
    )
    id_col = next(
        (c for c in ("element_desc", "gis_item_name", "item_desc", "element_id")
         if c in master.columns and master[c].notna().sum() > 0),
        None
    )
    if qty_col and id_col:
        top = (
            master.groupby(id_col)[qty_col].sum()
            .sort_values(ascending=False)
            .head(12)
        )
        if len(top) > 0:
            labels = [str(v)[:20] for v in top.index.tolist()]
            values = top.values.tolist()
            if all(np.isfinite(v) for v in values):
                fig, ax = plt.subplots(figsize=(12, 6))
                ax.barh(labels[::-1], values[::-1], color="#0f3460", alpha=0.9)
                ax.set_xlabel("Total Quantity")
                ax.set_title(f"Top Elements by Total Quantity ({qty_col})", fontsize=13, fontweight="bold")
                ax.grid(axis="x", alpha=0.4)
                plt.tight_layout()
                fig.savefig(charts_dir / "element_qty_ranking.png", dpi=120)
                plt.close(fig)
                generated.append("element_qty_ranking.png")

    print(f"  ✓ Charts: {generated}")
    return generated


# ═══════════════════════════════════════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════════════════════════════════════

def main() -> int:
    print("=" * 60)
    print("BOQ Consumption Analyzer v2")
    print("=" * 60)

    if not HTML_FILES:
        print("ERROR: No HTML files found in", HTML_DIR)
        return 1

    print(f"\nFound {len(HTML_FILES)} HTML file(s):")
    for f in HTML_FILES:
        print(f"  • {f.name}")

    print("\n[1/5] Parsing HTML files...")
    master = build_master(HTML_FILES)
    print(f"      Total records: {len(master):,}  |  Columns: {len(master.columns)}")

    print("\n[2/5] Selecting quantity columns...")
    alloc_col, used_col = select_qty_columns(master)

    if not alloc_col:
        print("  Could not find usable quantity columns. Check column mapping.")
        # Still export what we have
        insights = build_insights(pd.DataFrame(), master)
        export_results(master, pd.DataFrame(), insights)
        return 1

    # Copy to working columns
    master["_alloc"] = master.get(alloc_col, pd.Series(dtype=float))
    if used_col:
        master["_used"] = master.get(used_col, pd.Series(dtype=float))
        valid_pairs = master["_alloc"].notna() & master["_used"].notna() & (master["_alloc"] > 0)
        print(f"      Rows with valid alloc+used: {valid_pairs.sum():,}")
    else:
        master["_used"] = np.nan
        print(f"      Rows with alloc: {master['_alloc'].notna().sum():,} (no consumption data found)")

    print("\n[3/5] Statistical analysis...")
    analysis = analyze(master, alloc_col, used_col)
    print(f"      Groups analyzed: {len(analysis):,}")

    print("\n[4/5] Computing insights...")
    insights = build_insights(analysis, master)
    kpis = insights.get("kpis", {})
    for k, v in kpis.items():
        print(f"      {k}: {v}")

    print("\n[5/5] Exporting...")
    paths = export_results(master, analysis, insights)
    charts = generate_charts(master, analysis)

    print("\n" + "=" * 60)
    print("DONE")
    print("=" * 60)
    print(json.dumps({"kpis": kpis, "charts": charts}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
