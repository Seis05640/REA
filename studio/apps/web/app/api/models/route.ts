import { testConnection } from "@rea-studio/agent";
import { isProviderId } from "@rea-studio/core";

import { badRequest, errorText, getStore, guard, json } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const refused = guard(request);
  if (refused) return refused;
  return json({ models: getStore().listModels() });
}

interface CreateModelBody {
  name?: string;
  provider?: string;
  model?: string;
  baseURL?: string;
  apiKey?: string;
  skipTest?: boolean;
}

export async function POST(request: Request) {
  const refused = guard(request);
  if (refused) return refused;
  const body = (await request.json().catch(() => ({}))) as CreateModelBody;
  const provider = body.provider;
  if (!isProviderId(provider)) return badRequest("Choose a supported provider.");
  const model = body.model?.trim();
  if (!model) return badRequest("Enter a model id.");
  if (provider === "openai-compatible" && !body.baseURL?.trim()) {
    return badRequest("An OpenAI-compatible provider needs a base URL.");
  }
  const config = {
    provider,
    model,
    ...(body.apiKey?.trim() ? { apiKey: body.apiKey.trim() } : {}),
    ...(body.baseURL?.trim() ? { baseURL: body.baseURL.trim() } : {}),
  };
  const test = body.skipTest ? undefined : await testConnection(config, request.signal);
  if (test && !(test.ok && test.toolCalling)) {
    return json(
      {
        error: test.ok
          ? "The model answered but did not call the test tool. Reall needs tool calling."
          : `Connection failed: ${test.error ?? "unknown error"}`,
        test,
      },
      422,
    );
  }
  try {
    const record = getStore().createModel({
      name: body.name?.trim() || `${provider} · ${model}`,
      ...config,
    });
    return json({ model: record, test }, 201);
  } catch (cause) {
    return json({ error: errorText(cause) }, 500);
  }
}
