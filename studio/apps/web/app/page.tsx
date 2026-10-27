import Link from "next/link";

import { detectBrowserExecutable, loadSkill, resolveReaLaunch } from "@rea-studio/agent";
import { LANGUAGES, TARGET_KINDS, type JobSpec } from "@rea-studio/core";

import { buttonClass, Card, Eyebrow, PageTitle, StatusPill, Tag } from "@/components/ui";
import { getStore, workerHeartbeat } from "@/lib/server";

export const dynamic = "force-dynamic";

const enhancementSummary = (spec: JobSpec): string => {
  const parts: string[] = [];
  const { port, stack, hardening } = spec.enhancement;
  if (port) {
    const language = LANGUAGES.find((item) => item.id === port.language)?.label ?? port.language;
    parts.push(`→ ${language}${port.framework ? ` / ${port.framework}` : ""}`);
  }
  if (stack) parts.push(stack);
  if (hardening.length) parts.push(`+ ${hardening.join(", ")}`);
  return parts.join(" · ") || "faithful rebuild";
};

const ago = (iso: string): string => {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${Math.round(seconds)}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
};

const SystemRow = ({ label, value, ok }: { label: string; value: string; ok: boolean }) => (
  <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-rule py-2 last:border-none">
    <span className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-ink-2">{label}</span>
    <span className={`truncate text-right font-mono text-xs ${ok ? "text-ink" : "text-warn"}`} title={value}>
      {value}
    </span>
  </div>
);

export default function JobsPage() {
  const store = getStore();
  const jobs = store.listJobs();
  const models = store.listModels();
  const launch = resolveReaLaunch();
  const browser = detectBrowserExecutable();
  const skill = loadSkill(launch);
  const heartbeat = workerHeartbeat();
  const workerAlive = heartbeat !== undefined && Date.now() - heartbeat.getTime() < 15_000;

  return (
    <>
      <PageTitle eyebrow="Jobs" title={<>See a feature. <em className="text-signal">Rebuild it better.</em></>}>
        Point Reall at an app you are allowed to study, choose any model with your own API
        key, and get a verified rebuild with the enhancement you want — another language, another
        stack, tests and hardening.
      </PageTitle>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Eyebrow>{jobs.length} job{jobs.length === 1 ? "" : "s"}</Eyebrow>
            <Link href="/jobs/new" className={buttonClass("primary")}>
              New clone
            </Link>
          </div>
          {jobs.length === 0 ? (
            <Card className="rise flex flex-col items-start gap-3 py-10">
              <p className="font-display text-2xl">No jobs yet.</p>
              <p className="max-w-md text-sm text-ink-2">
                {models.length === 0
                  ? "Start by adding a model: any provider, your key."
                  : "Create your first clone: a URL, an app bundle, an APK or a binary."}
              </p>
              <Link
                href={models.length === 0 ? "/models" : "/jobs/new"}
                className={buttonClass("ghost")}
              >
                {models.length === 0 ? "Add a model" : "New clone"}
              </Link>
            </Card>
          ) : (
            <ol className="flex flex-col">
              {jobs.map((job, index) => (
                <li key={job.id} className="rise" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
                  <Link
                    href={`/jobs/${job.id}`}
                    className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b border-rule py-4 hover:bg-card"
                  >
                    <span className="w-8 font-mono text-xs text-ink-3 group-hover:text-signal">
                      {String(jobs.length - index).padStart(2, "0")}
                    </span>
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="truncate font-display text-xl leading-tight">{job.title}</span>
                      <span className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
                        <Tag>{TARGET_KINDS.find((kind) => kind.id === job.spec.target.kind)?.label}</Tag>
                        <span className="truncate">{enhancementSummary(job.spec)}</span>
                      </span>
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      <StatusPill status={job.status} />
                      <span className="font-mono text-[0.68rem] text-ink-3">
                        {ago(job.createdAt)} · {job.usage.totalTokens.toLocaleString()} tok
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <Card>
            <Eyebrow>Bench</Eyebrow>
            <div className="mt-3">
              <SystemRow
                label="Worker"
                value={workerAlive ? "running" : heartbeat ? `last seen ${ago(heartbeat.toISOString())}` : "not started"}
                ok={workerAlive}
              />
              <SystemRow label="REA" value={`${launch.source} · ${launch.args.at(-2) ?? launch.command}`} ok={launch.source !== "npx"} />
              <SystemRow label="Skill" value={skill.source ? "loaded" : "missing"} ok={Boolean(skill.source)} />
              <SystemRow label="Browser" value={browser ?? "not found"} ok={Boolean(browser)} />
              <SystemRow label="Models" value={String(models.length)} ok={models.length > 0} />
            </div>
            {!workerAlive ? (
              <p className="mt-3 text-xs leading-relaxed text-ink-2">
                Jobs run in the worker. Start everything with <code className="font-mono">npm run studio</code> in{" "}
                <code className="font-mono">studio/</code>.
              </p>
            ) : null}
            {!browser ? (
              <p className="mt-2 text-xs leading-relaxed text-ink-2">
                Web targets need Chrome or Chromium. Set <code className="font-mono">STUDIO_BROWSER_PATH</code> if it
                is installed elsewhere.
              </p>
            ) : null}
          </Card>
        </aside>
      </div>
    </>
  );
}
