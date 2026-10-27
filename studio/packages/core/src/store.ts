import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { isProviderId, type ProviderId } from "./catalog.js";
import { createSecretBox, loadMasterKey, type SecretBox } from "./crypto.js";
import { studioPaths } from "./paths.js";
import type {
  ApprovalKind,
  ApprovalRequest,
  JobEvent,
  JobSecrets,
  JobSpec,
  JobStatus,
  ModelConfig,
} from "./types.js";

export interface ModelRecord {
  readonly id: string;
  readonly name: string;
  readonly provider: ProviderId;
  readonly model: string;
  readonly baseURL?: string;
  readonly hasApiKey: boolean;
  readonly createdAt: string;
}

export interface JobUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

export interface JobRecord {
  readonly id: string;
  readonly title: string;
  readonly status: JobStatus;
  readonly spec: JobSpec;
  readonly analysisModelId: string;
  readonly buildModelId: string;
  readonly workspace: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly error?: string;
  readonly usage: JobUsage;
}

export interface StoredEvent {
  readonly seq: number;
  readonly ts: string;
  readonly event: JobEvent;
}

export interface ApprovalRecord {
  readonly id: string;
  readonly jobId: string;
  readonly kind: ApprovalKind;
  readonly title: string;
  readonly detail: string;
  readonly status: "pending" | "approved" | "rejected";
  readonly note?: string;
  readonly createdAt: string;
  readonly decidedAt?: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  base_url TEXT,
  api_key_enc TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  spec_json TEXT NOT NULL,
  secrets_enc TEXT NOT NULL,
  analysis_model_id TEXT NOT NULL,
  build_model_id TEXT NOT NULL,
  workspace TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  error TEXT,
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  usage_json TEXT NOT NULL DEFAULT '{"inputTokens":0,"outputTokens":0,"totalTokens":0}'
);
CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status, created_at);
CREATE TABLE IF NOT EXISTS job_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS job_events_job ON job_events(job_id, seq);
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  status TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT
);
CREATE INDEX IF NOT EXISTS approvals_job ON approvals(job_id, status);
`;

type Row = Record<string, unknown>;

const text = (row: Row, key: string): string => String(row[key] ?? "");
const optionalText = (row: Row, key: string): string | undefined =>
  row[key] === null || row[key] === undefined ? undefined : String(row[key]);
const now = (): string => new Date().toISOString();

/** SQLite-backed state shared by the web server and the worker. */
export class StudioStore {
  readonly db: DatabaseSync;
  readonly jobsDir: string;
  readonly #box: SecretBox;

  constructor(home?: string) {
    const paths = studioPaths(home);
    mkdirSync(paths.jobs, { recursive: true, mode: 0o700 });
    this.jobsDir = paths.jobs;
    this.#box = createSecretBox(loadMasterKey(paths.masterKey));
    this.db = new DatabaseSync(paths.database);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  // Models ------------------------------------------------------------------

  listModels(): ModelRecord[] {
    return this.db
      .prepare("SELECT * FROM models ORDER BY created_at DESC")
      .all()
      .map((row) => this.#modelRecord(row as Row));
  }

  getModel(id: string): ModelRecord | undefined {
    const row = this.db.prepare("SELECT * FROM models WHERE id = ?").get(id);
    return row ? this.#modelRecord(row as Row) : undefined;
  }

  createModel(input: {
    name: string;
    provider: ProviderId;
    model: string;
    baseURL?: string;
    apiKey?: string;
  }): ModelRecord {
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO models (id, name, provider, model, base_url, api_key_enc, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        input.name,
        input.provider,
        input.model,
        input.baseURL || null,
        input.apiKey ? this.#box.seal(input.apiKey) : null,
        now(),
      );
    const created = this.getModel(id);
    if (!created) throw new Error("Model was not stored.");
    return created;
  }

  deleteModel(id: string): void {
    this.db.prepare("DELETE FROM models WHERE id = ?").run(id);
  }

  /** Server-only: the decrypted configuration used to call the provider. */
  getModelConfig(id: string): ModelConfig | undefined {
    const row = this.db.prepare("SELECT * FROM models WHERE id = ?").get(id) as
      | Row
      | undefined;
    if (!row) return undefined;
    const provider = text(row, "provider");
    if (!isProviderId(provider)) return undefined;
    const sealed = optionalText(row, "api_key_enc");
    const baseURL = optionalText(row, "base_url");
    return {
      provider,
      model: text(row, "model"),
      ...(sealed ? { apiKey: this.#box.open(sealed) } : {}),
      ...(baseURL ? { baseURL } : {}),
    };
  }

  #modelRecord(row: Row): ModelRecord {
    const provider = text(row, "provider");
    const baseURL = optionalText(row, "base_url");
    return {
      id: text(row, "id"),
      name: text(row, "name"),
      provider: isProviderId(provider) ? provider : "openai-compatible",
      model: text(row, "model"),
      ...(baseURL ? { baseURL } : {}),
      hasApiKey: optionalText(row, "api_key_enc") !== undefined,
      createdAt: text(row, "created_at"),
    };
  }

  // Jobs --------------------------------------------------------------------

  createJob(input: {
    spec: JobSpec;
    secrets: JobSecrets;
    analysisModelId: string;
    buildModelId: string;
  }): JobRecord {
    const id = randomUUID();
    const workspace = join(this.jobsDir, id);
    const ts = now();
    this.db
      .prepare(
        "INSERT INTO jobs (id, title, status, spec_json, secrets_enc, analysis_model_id, build_model_id, workspace, created_at, updated_at) VALUES (?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        input.spec.title,
        JSON.stringify(input.spec),
        this.#box.seal(JSON.stringify(input.secrets)),
        input.analysisModelId,
        input.buildModelId,
        workspace,
        ts,
        ts,
      );
    const job = this.getJob(id);
    if (!job) throw new Error("Job was not stored.");
    return job;
  }

  listJobs(limit = 100): JobRecord[] {
    return this.db
      .prepare("SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?")
      .all(limit)
      .map((row) => this.#jobRecord(row as Row));
  }

  getJob(id: string): JobRecord | undefined {
    const row = this.db.prepare("SELECT * FROM jobs WHERE id = ?").get(id);
    return row ? this.#jobRecord(row as Row) : undefined;
  }

  /** Server-only: decrypted target credentials for a job. */
  getJobSecrets(id: string): JobSecrets {
    const row = this.db
      .prepare("SELECT secrets_enc FROM jobs WHERE id = ?")
      .get(id) as Row | undefined;
    if (!row) return {};
    return JSON.parse(this.#box.open(text(row, "secrets_enc"))) as JobSecrets;
  }

  /** Atomically move the oldest queued job to running. */
  claimNextJob(): JobRecord | undefined {
    const row = this.db
      .prepare(
        "SELECT id FROM jobs WHERE status = 'queued' AND cancel_requested = 0 ORDER BY created_at LIMIT 1",
      )
      .get() as Row | undefined;
    if (!row) return undefined;
    const id = text(row, "id");
    const result = this.db
      .prepare(
        "UPDATE jobs SET status = 'running', updated_at = ? WHERE id = ? AND status = 'queued'",
      )
      .run(now(), id);
    return Number(result.changes) === 1 ? this.getJob(id) : undefined;
  }

  setJobStatus(id: string, status: JobStatus, error?: string): void {
    this.db
      .prepare("UPDATE jobs SET status = ?, error = ?, updated_at = ? WHERE id = ?")
      .run(status, error ?? null, now(), id);
  }

  setJobUsage(id: string, usage: JobUsage): void {
    this.db
      .prepare("UPDATE jobs SET usage_json = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(usage), now(), id);
  }

  /** Queued jobs are cancelled at once; running jobs stop at the next check. */
  requestCancel(id: string): void {
    this.db
      .prepare("UPDATE jobs SET cancel_requested = 1, updated_at = ? WHERE id = ?")
      .run(now(), id);
    this.db
      .prepare(
        "UPDATE jobs SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'queued'",
      )
      .run(now(), id);
  }

  isCancelRequested(id: string): boolean {
    const row = this.db
      .prepare("SELECT cancel_requested FROM jobs WHERE id = ?")
      .get(id) as Row | undefined;
    return Number(row?.cancel_requested ?? 0) === 1;
  }

  /** Jobs left running by a crashed worker are marked failed on startup. */
  failInterruptedJobs(): number {
    const result = this.db
      .prepare(
        "UPDATE jobs SET status = 'failed', error = 'Worker stopped before the job finished.', updated_at = ? WHERE status IN ('running', 'waiting_approval')",
      )
      .run(now());
    return Number(result.changes);
  }

  #jobRecord(row: Row): JobRecord {
    const error = optionalText(row, "error");
    return {
      id: text(row, "id"),
      title: text(row, "title"),
      status: text(row, "status") as JobStatus,
      spec: JSON.parse(text(row, "spec_json")) as JobSpec,
      analysisModelId: text(row, "analysis_model_id"),
      buildModelId: text(row, "build_model_id"),
      workspace: text(row, "workspace"),
      createdAt: text(row, "created_at"),
      updatedAt: text(row, "updated_at"),
      ...(error ? { error } : {}),
      usage: JSON.parse(text(row, "usage_json")) as JobUsage,
    };
  }

  // Events ------------------------------------------------------------------

  appendEvent(jobId: string, event: JobEvent): number {
    const result = this.db
      .prepare("INSERT INTO job_events (job_id, ts, data_json) VALUES (?, ?, ?)")
      .run(jobId, now(), JSON.stringify(event));
    return Number(result.lastInsertRowid);
  }

  listEvents(jobId: string, afterSeq = 0, limit = 500): StoredEvent[] {
    return this.db
      .prepare(
        "SELECT seq, ts, data_json FROM job_events WHERE job_id = ? AND seq > ? ORDER BY seq LIMIT ?",
      )
      .all(jobId, afterSeq, limit)
      .map((row) => {
        const r = row as Row;
        return {
          seq: Number(r.seq),
          ts: text(r, "ts"),
          event: JSON.parse(text(r, "data_json")) as JobEvent,
        };
      });
  }

  // Approvals ---------------------------------------------------------------

  createApproval(jobId: string, request: ApprovalRequest): ApprovalRecord {
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO approvals (id, job_id, kind, title, detail, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)",
      )
      .run(id, jobId, request.kind, request.title, request.detail, now());
    const created = this.getApproval(id);
    if (!created) throw new Error("Approval was not stored.");
    return created;
  }

  getApproval(id: string): ApprovalRecord | undefined {
    const row = this.db.prepare("SELECT * FROM approvals WHERE id = ?").get(id);
    return row ? this.#approvalRecord(row as Row) : undefined;
  }

  listApprovals(jobId: string, status?: ApprovalRecord["status"]): ApprovalRecord[] {
    const rows = status
      ? this.db
          .prepare(
            "SELECT * FROM approvals WHERE job_id = ? AND status = ? ORDER BY created_at",
          )
          .all(jobId, status)
      : this.db
          .prepare("SELECT * FROM approvals WHERE job_id = ? ORDER BY created_at")
          .all(jobId);
    return rows.map((row) => this.#approvalRecord(row as Row));
  }

  decideApproval(id: string, approved: boolean, note?: string): boolean {
    const result = this.db
      .prepare(
        "UPDATE approvals SET status = ?, note = ?, decided_at = ? WHERE id = ? AND status = 'pending'",
      )
      .run(approved ? "approved" : "rejected", note ?? null, now(), id);
    return Number(result.changes) === 1;
  }

  #approvalRecord(row: Row): ApprovalRecord {
    const note = optionalText(row, "note");
    const decidedAt = optionalText(row, "decided_at");
    return {
      id: text(row, "id"),
      jobId: text(row, "job_id"),
      kind: text(row, "kind") as ApprovalKind,
      title: text(row, "title"),
      detail: text(row, "detail"),
      status: text(row, "status") as ApprovalRecord["status"],
      ...(note ? { note } : {}),
      createdAt: text(row, "created_at"),
      ...(decidedAt ? { decidedAt } : {}),
    };
  }
}
