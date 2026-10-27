"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { PROVIDERS, providerInfo, type ProviderId } from "@rea-studio/core/catalog";

import { Button, Card, Eyebrow, Field, Input, Select, Tag } from "./ui";

export interface ModelSummary {
  readonly id: string;
  readonly name: string;
  readonly provider: ProviderId;
  readonly model: string;
  readonly baseURL?: string;
  readonly hasApiKey: boolean;
}

interface TestResult {
  ok: boolean;
  toolCalling: boolean;
  latencyMs: number;
  reply?: string;
  error?: string;
}

const postJson = async <T,>(url: string, body: unknown): Promise<{ status: number; data: T }> => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, data: (await response.json()) as T };
};

const TestLine = ({ result }: { result: TestResult }) => (
  <p className={`font-mono text-xs ${result.ok && result.toolCalling ? "text-ok" : "text-err"}`}>
    {result.ok
      ? result.toolCalling
        ? `✓ answered and called tools in ${result.latencyMs} ms`
        : `✗ answered in ${result.latencyMs} ms but did not call the tool — pick a model with tool calling`
      : `✗ ${result.error ?? "failed"}`}
  </p>
);

export const ModelsManager = ({ models }: { models: readonly ModelSummary[] }) => {
  const router = useRouter();
  const [provider, setProvider] = useState<ProviderId>("openai");
  const [name, setName] = useState("");
  const [model, setModel] = useState("");
  const [baseURL, setBaseURL] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [available, setAvailable] = useState<string[]>([]);
  const [busy, setBusy] = useState<"" | "list" | "test" | "save">("");
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [test, setTest] = useState<TestResult | null>(null);
  const [savedTests, setSavedTests] = useState<Record<string, TestResult | "running">>({});
  const info = providerInfo(provider);

  const draft = () => ({ provider, model, baseURL, apiKey });

  const listModels = async () => {
    setBusy("list");
    setMessage(null);
    const { status, data } = await postJson<{ models?: string[]; error?: string }>(
      "/api/models/list",
      { provider, baseURL, apiKey },
    );
    setBusy("");
    if (status !== 200 || !data.models) {
      setMessage({ tone: "err", text: data.error ?? "Could not list models." });
      return;
    }
    setAvailable(data.models);
    setMessage({ tone: "ok", text: `${data.models.length} models available. Pick one below.` });
  };

  const runTest = async () => {
    setBusy("test");
    setTest(null);
    const { data } = await postJson<TestResult>("/api/models/test", draft());
    setBusy("");
    setTest(data);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("save");
    setMessage(null);
    const { status, data } = await postJson<{ error?: string; test?: TestResult }>("/api/models", {
      ...draft(),
      name,
    });
    setBusy("");
    if (data.test) setTest(data.test);
    if (status !== 201) {
      setMessage({ tone: "err", text: data.error ?? "Could not save the model." });
      return;
    }
    setMessage({ tone: "ok", text: "Saved. The key is encrypted on this machine." });
    setModel("");
    setName("");
    setApiKey("");
    setAvailable([]);
    router.refresh();
  };

  const remove = async (id: string) => {
    await fetch(`/api/models/${id}`, { method: "DELETE" });
    router.refresh();
  };

  const retest = async (id: string) => {
    setSavedTests((current) => ({ ...current, [id]: "running" }));
    const { data } = await postJson<TestResult>("/api/models/test", { id });
    setSavedTests((current) => ({ ...current, [id]: data }));
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <Card className="rise">
        <form onSubmit={save} className="flex flex-col gap-4">
          <Eyebrow>Add a model</Eyebrow>
          <Field label="Provider" htmlFor="provider">
            <Select
              id="provider"
              value={provider}
              onChange={(event) => {
                setProvider(event.target.value as ProviderId);
                setAvailable([]);
                setTest(null);
              }}
            >
              {PROVIDERS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={info.needsApiKey ? "API key" : "API key (optional)"}
            htmlFor="apiKey"
            hint="Stored with AES-256-GCM. Never shown again and never sent to the model."
          >
            <Input
              id="apiKey"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={info.needsApiKey ? "sk-…" : "Leave empty for local servers"}
            />
          </Field>
          <Field
            label={info.baseURL === "required" ? "Base URL" : "Base URL (optional)"}
            htmlFor="baseURL"
            hint={
              info.baseURL === "required"
                ? "For example https://api.deepseek.com/v1 or http://127.0.0.1:1234/v1"
                : `Default: ${info.defaultBaseURL}`
            }
          >
            <Input
              id="baseURL"
              value={baseURL}
              onChange={(event) => setBaseURL(event.target.value)}
              placeholder={info.defaultBaseURL || "https://…/v1"}
            />
          </Field>
          <Field label="Model id" htmlFor="model">
            <div className="flex gap-2">
              <Input
                id="model"
                list="available-models"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="The id your provider uses"
                required
              />
              <Button type="button" variant="ghost" onClick={listModels} disabled={busy !== ""}>
                {busy === "list" ? "…" : "List"}
              </Button>
            </div>
            <datalist id="available-models">
              {available.map((id) => (
                <option key={id} value={id} />
              ))}
            </datalist>
          </Field>
          <Field label="Display name (optional)" htmlFor="name">
            <Input id="name" value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          {test ? <TestLine result={test} /> : null}
          {message ? (
            <p className={`text-xs ${message.tone === "ok" ? "text-ok" : "text-err"}`}>{message.text}</p>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={runTest} disabled={busy !== "" || !model}>
              {busy === "test" ? "Testing…" : "Test connection"}
            </Button>
            <Button type="submit" disabled={busy !== "" || !model}>
              {busy === "save" ? "Testing and saving…" : "Save model"}
            </Button>
          </div>
          <p className="text-xs leading-relaxed text-ink-3">
            Saving runs a short tool-calling check. Reall needs a model that can call tools.
          </p>
        </form>
      </Card>

      <div className="flex flex-col gap-3">
        <Eyebrow>
          {models.length} saved model{models.length === 1 ? "" : "s"}
        </Eyebrow>
        {models.length === 0 ? (
          <p className="text-sm text-ink-2">
            Nothing saved yet. Any provider works: OpenAI, Anthropic, Gemini, OpenRouter, Ollama on
            your machine, or any OpenAI-compatible endpoint.
          </p>
        ) : null}
        {models.map((saved, index) => {
          const result = savedTests[saved.id];
          return (
            <div
              key={saved.id}
              className="rise flex flex-col gap-2 border border-rule bg-card p-4"
              style={{ animationDelay: `${index * 40}ms` }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate font-display text-xl leading-tight">{saved.name}</p>
                  <p className="truncate font-mono text-xs text-ink-2">{saved.model}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Tag>{providerInfo(saved.provider).label.split(" ")[0]}</Tag>
                  <Tag>{saved.hasApiKey ? "key ●" : "no key"}</Tag>
                </div>
              </div>
              {saved.baseURL ? <p className="truncate font-mono text-[0.7rem] text-ink-3">{saved.baseURL}</p> : null}
              {result === "running" ? (
                <p className="font-mono text-xs text-ink-2">Testing…</p>
              ) : result ? (
                <TestLine result={result} />
              ) : null}
              <div className="flex gap-3">
                <Button variant="quiet" type="button" onClick={() => retest(saved.id)}>
                  Test
                </Button>
                <Button variant="quiet" type="button" onClick={() => remove(saved.id)}>
                  Delete
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
