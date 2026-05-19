import app from "./app";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { historicalUsageTable, importBatchesTable } from "@workspace/db/schema";
import { sql } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function autoImportCsvIfEmpty() {
  try {
    const countResult = await db.execute(sql`SELECT COUNT(*)::int AS n FROM historical_usage`);
    const count = (countResult.rows[0] as { n: number }).n ?? 0;
    if (count > 0) {
      logger.info({ count }, "DB already has data — skipping auto-import");
      return;
    }

    const csvPath = path.resolve(process.cwd(), "..", "..", "outputs", "boq_analysis", "master_dataset.csv");
    if (!fs.existsSync(csvPath)) {
      logger.warn("master_dataset.csv not found — skipping auto-import");
      return;
    }

    logger.info("DB empty — auto-importing master_dataset.csv…");

    const [batch] = await db.insert(importBatchesTable)
      .values({ filename: "master_dataset.csv", rowCount: 0, status: "processing" })
      .returning();

    const content = fs.readFileSync(csvPath, "utf-8");
    const lines = content.split("\n");
    const rawHeader = lines[0].replace(/^\uFEFF/, "");
    const headers = rawHeader.split(",");

    const col = (name: string) => headers.indexOf(name);
    const idxProjId    = col("project_id");
    const idxProjName  = col("project_name");
    const idxProjType  = col("item_type");
    const idxStatus    = col("status");
    const idxItemId    = col("item_id");
    const idxItemDesc  = col("item_desc");
    const idxBranch    = col("branch");
    const idxUom       = col("uom");
    const idxQty       = col("quantity_num");
    const idxUnitPrice = col("unit_price_num");
    const idxValue     = col("value_num");
    const idxElemId    = col("element_id");
    const idxElemDesc  = col("element_desc");
    const idxReqQty    = col("request_qty_num");
    const idxReqAmt    = col("request_amount_num");
    const idxClrQty    = col("cleared_qty_num");
    const idxClrAmt    = col("cleared_amount_num");
    const idxTotReq    = col("total_requests_num");
    const idxTotClr    = col("total_cleared_num");

    const get = (cols: string[], i: number) =>
      i >= 0 && i < cols.length ? (cols[i] || "").trim().replace(/^"|"$/g, "") : "";
    const num = (v: string) => {
      const n = parseFloat(v.replace(/,/g, ""));
      return isNaN(n) ? null : String(n);
    };
    const parseCsvLine = (line: string): string[] => {
      const result: string[] = [];
      let cur = "", inQ = false;
      for (const ch of line) {
        if (ch === '"') { inQ = !inQ; }
        else if (ch === "," && !inQ) { result.push(cur.trim()); cur = ""; }
        else cur += ch;
      }
      result.push(cur.trim());
      return result;
    };

    type Row = {
      batchId: number; projectId: string | null; projectName: string | null;
      projectType: string | null; projectStatus: string | null;
      boqItemCode: string | null; boqItemName: string | null;
      branch: string | null; unit: string | null;
      qty: string | null; unitPrice: string | null; totalValue: string | null;
      elementCode: string | null; elementName: string;
      requestedQty: string | null; requestedAmount: string | null;
      clearedQty: string; clearedAmount: string;
      totalRequests: string | null; totalCleared: string | null;
    };

    const rows: Row[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const cols = parseCsvLine(line);
      const elemName = get(cols, idxElemDesc);
      if (!elemName) continue;
      rows.push({
        batchId: batch.id,
        projectId: get(cols, idxProjId) || null,
        projectName: get(cols, idxProjName) || null,
        projectType: get(cols, idxProjType) || null,
        projectStatus: get(cols, idxStatus) || null,
        boqItemCode: get(cols, idxItemId) || null,
        boqItemName: get(cols, idxItemDesc) || null,
        branch: get(cols, idxBranch) || null,
        unit: get(cols, idxUom) || null,
        qty: num(get(cols, idxQty)),
        unitPrice: num(get(cols, idxUnitPrice)),
        totalValue: num(get(cols, idxValue)),
        elementCode: get(cols, idxElemId) || null,
        elementName: elemName,
        requestedQty: num(get(cols, idxReqQty)),
        requestedAmount: num(get(cols, idxReqAmt)),
        clearedQty: num(get(cols, idxClrQty)) ?? "0",
        clearedAmount: num(get(cols, idxClrAmt)) ?? "0",
        totalRequests: num(get(cols, idxTotReq)),
        totalCleared: num(get(cols, idxTotClr)),
      });
    }

    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await db.insert(historicalUsageTable).values(rows.slice(i, i + CHUNK));
    }

    await db.update(importBatchesTable)
      .set({ status: "done", rowCount: rows.length })
      .where(sql`id = ${batch.id}`);

    logger.info({ rowsImported: rows.length }, "Auto-import complete");
  } catch (err) {
    logger.error({ err }, "Auto-import failed — continuing without data");
  }
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
  await autoImportCsvIfEmpty();
});
