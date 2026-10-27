import { ModelsManager } from "@/components/ModelsManager";
import { PageTitle } from "@/components/ui";
import { getStore } from "@/lib/server";

export const dynamic = "force-dynamic";

export default function ModelsPage() {
  const models = getStore()
    .listModels()
    .map(({ id, name, provider, model, baseURL, hasApiKey }) => ({
      id,
      name,
      provider,
      model,
      hasApiKey,
      ...(baseURL ? { baseURL } : {}),
    }));
  return (
    <>
      <PageTitle eyebrow="Models" title="Bring your own model.">
        REA itself never calls a model; the agent that drives it does. Add the provider and key you
        want to pay for. You can use a cheaper model for analysis and a stronger one for the build.
      </PageTitle>
      <ModelsManager models={models} />
    </>
  );
}
