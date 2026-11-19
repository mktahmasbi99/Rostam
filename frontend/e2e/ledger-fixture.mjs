import { expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

export async function startLedgerFixture(port) {
  const origin = `http://127.0.0.1:${port}`;
  const directory = await mkdtemp(resolve(tmpdir(), "rostam-ledger-e2e-"));
  const python = resolve("../.venv/bin/python");
  const backend = spawn(existsSync(python) ? python : "python3", [
    "-m", "uvicorn", "app.main:app", "--app-dir", resolve("../backend"),
    "--host", "127.0.0.1", "--port", String(port),
  ], {
    env: { ...process.env, ROSTAM_DB: resolve(directory, "ledger.sqlite3"), TZ: "Europe/Warsaw" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  backend.stdout.on("data", (chunk) => { output += chunk; });
  backend.stderr.on("data", (chunk) => { output += chunk; });
  backend.on("error", (error) => { output += error.message; });
  const stopped = new Promise((done) => backend.once("close", done));
  let paused = false;

  function setPaused(value) {
    if (value === paused) return;
    backend.kill(value ? "SIGSTOP" : "SIGCONT");
    paused = value;
  }

  async function close() {
    setPaused(false);
    backend.kill("SIGTERM");
    await stopped;
    await rm(directory, { recursive: true, force: true });
  }

  try {
    await expect.poll(async () => {
      try { return (await fetch(`${origin}/api/config`)).status; }
      catch { return 0; }
    }, { message: "Temporary ledger backend must start", timeout: 15000 }).toBe(200);
    return { origin, close, setPaused, get output() { return output; } };
  } catch (error) {
    await close();
    throw new Error(`Could not start the temporary ledger backend.\n${output}`, { cause: error });
  }
}
