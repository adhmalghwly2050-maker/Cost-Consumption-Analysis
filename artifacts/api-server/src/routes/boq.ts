import { Router } from "express";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";

const execFileAsync = promisify(execFile);
const router = Router();

const ROOT_DIR = path.resolve(import.meta.dirname, "../../..");
const OUTPUT_DIR = path.join(ROOT_DIR, "outputs", "boq_analysis");
const DASHBOARD_JSON = path.join(OUTPUT_DIR, "dashboard_data.json");
const SCRIPT_PATH = path.join(ROOT_DIR, "scripts", "src", "analyze_boq.py");

let analysisRunning = false;
let lastRunTime: string | null = null;

router.post("/run-analysis", async (req, res) => {
  if (analysisRunning) {
    res.status(409).json({ error: "Analysis already running" });
    return;
  }

  analysisRunning = true;
  const start = Date.now();

  try {
    req.log.info("Starting BOQ analysis pipeline");

    const python = await findPython();
    req.log.info({ python }, "Using Python interpreter");

    const { stdout, stderr } = await execFileAsync(python, [SCRIPT_PATH], {
      timeout: 300_000,
      maxBuffer: 50 * 1024 * 1024,
      cwd: ROOT_DIR,
    });

    req.log.info({ stdout: stdout.slice(-2000) }, "Analysis stdout");
    if (stderr) req.log.warn({ stderr: stderr.slice(-1000) }, "Analysis stderr");

    lastRunTime = new Date().toISOString();
    const duration = Date.now() - start;

    const outputPaths: Record<string, string> = {};
    for (const [key, file] of Object.entries({
      master_csv: "master_dataset.csv",
      analysis_csv: "analysis_results.csv",
      excel: "boq_analysis.xlsx",
      dashboard_json: "dashboard_data.json",
    })) {
      const full = path.join(OUTPUT_DIR, file);
      if (fs.existsSync(full)) outputPaths[key] = full;
    }

    res.json({
      success: true,
      message: "Analysis completed successfully",
      duration_ms: duration,
      output_paths: outputPaths,
    });
  } catch (err: unknown) {
    req.log.error({ err }, "Analysis pipeline failed");
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg.slice(0, 1000) });
  } finally {
    analysisRunning = false;
  }
});

router.get("/dashboard-data", (req, res) => {
  if (!fs.existsSync(DASHBOARD_JSON)) {
    res.status(404).json({ error: "No analysis results found. Run analysis first." });
    return;
  }
  try {
    const raw = fs.readFileSync(DASHBOARD_JSON, "utf-8");
    const data = JSON.parse(raw);
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to read dashboard data");
    res.status(500).json({ error: "Failed to read dashboard data" });
  }
});

router.get("/analysis-status", (req, res) => {
  const htmlDir = path.join(ROOT_DIR, "attached_assets");
  const htmlFiles = fs.existsSync(htmlDir)
    ? fs.readdirSync(htmlDir).filter((f) => f.toLowerCase().endsWith(".htm")).length
    : 0;

  const outputFiles: string[] = fs.existsSync(OUTPUT_DIR)
    ? fs.readdirSync(OUTPUT_DIR).filter((f) => !fs.statSync(path.join(OUTPUT_DIR, f)).isDirectory())
    : [];

  res.json({
    has_results: fs.existsSync(DASHBOARD_JSON),
    last_run: lastRunTime,
    files_found: htmlFiles,
    output_files: outputFiles,
  });
});

router.get("/download/:fileType", (req, res) => {
  const fileMap: Record<string, { file: string; name: string; mime: string }> = {
    csv: {
      file: "analysis_results.csv",
      name: "boq_analysis_results.csv",
      mime: "text/csv",
    },
    "master-csv": {
      file: "master_dataset.csv",
      name: "boq_master_dataset.csv",
      mime: "text/csv",
    },
    excel: {
      file: "boq_analysis.xlsx",
      name: "boq_analysis.xlsx",
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  };

  const entry = fileMap[req.params.fileType];
  if (!entry) {
    res.status(400).json({ error: "Invalid file type" });
    return;
  }

  const filePath = path.join(OUTPUT_DIR, entry.file);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "File not found. Run analysis first." });
    return;
  }

  res.setHeader("Content-Disposition", `attachment; filename="${entry.name}"`);
  res.setHeader("Content-Type", entry.mime);
  fs.createReadStream(filePath).pipe(res);
});

router.get("/chart/:filename", (req, res) => {
  const allowed = /^[\w\-.]+\.png$/;
  const { filename } = req.params;
  if (!allowed.test(filename)) {
    res.status(400).json({ error: "Invalid filename" });
    return;
  }
  const filePath = path.join(OUTPUT_DIR, "charts", filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "Chart not found" });
    return;
  }
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=60");
  fs.createReadStream(filePath).pipe(res);
});

async function findPython(): Promise<string> {
  const candidates = ["python3.11", "python3", "python"];
  for (const cmd of candidates) {
    try {
      await execFileAsync(cmd, ["--version"]);
      return cmd;
    } catch {
      continue;
    }
  }
  throw new Error("No Python interpreter found");
}

export default router;
