# dsh-bailian-model-catalog

Completes the model catalog for **Alibaba Cloud Bailian (Model Studio) Token Plan** routes in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), so the models that officially accept images actually declare `[text, image]` — and an attached image stops being rejected with "the current model does not support images".

## Why it is needed

DSH decides whether a model accepts images purely from its declared input modalities. When `@deepseek-ai/dsh-llm-pi-ai` materializes a route it runs:

```ts
input: declaredInput(entry.input) ?? base?.input ?? [...request.defaultInput]
```

`base` is looked up in the installed pi-ai catalog **by route name**. A hand-written Bailian route is usually named `aliyun` (no such catalog) and its model entries only carry `id`, so the modality falls back to `defaultInput`, whose default is `['text']`.

## What the plugin does

1. Fills the shipped `qwen-token-plan-cn` catalog object with the models DSH is missing (and adds `image` to entries that lack it).
2. Bridges the ordering gap: the adapter materializes its model snapshot during its own `apply()`, so catalog writes that arrive later are invisible. The plugin overlays `input`/`contextWindow`/`maxTokens`/`compat`/`reasoning` at read time (`ModelsImpl.getModels`) and restores the original on dispose.
3. Lets your own route name borrow that catalog.

## Install

From npm:

```bash
dsh plugin --profile <profile> add dsh-bailian-model-catalog
```

From GitHub:

```bash
dsh plugin --profile <profile> add github:echosong21/dsh-bailian-model-catalog
```

For local development install with `link:` so edits apply immediately:

```bash
dsh plugin --profile <profile> add "link:Z:/path/to/dsh-bailian-model-catalog"
```

## Configure

### Route already named `qwen-token-plan-cn`

Nothing to configure.

### Custom route name (e.g. `aliyun`)

Set `api` on the route (the catalog does not know your name, so the protocol cannot be inferred) and map the route to the catalog:

```yaml
- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
      aliyun:
        displayName: Bailian · Token Plan
        apiKeyEnv: ALIYUN_API_KEY
        api: openai-completions
        baseURL: https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1
        models:
          - id: deepseek-v4.1-flash-1017

- id: bailian-catalog
  config:
    routes:
      aliyun: qwen-token-plan-cn
```

| Field | Default | Meaning |
| --- | --- | --- |
| `routes` | `{ qwen-token-plan-cn: qwen-token-plan-cn }` | route name → shipped catalog to borrow |
| `exclude` | `[]` | model ids the plugin must leave alone |

## Covered models

Vision (`text, image`): `qwen4-max`, `qwen4-max-preview`, `qwen3.8-max`, `qwen3.8-flash`, `qwen3.7-plus`, `qwen3.6-flash`, `deepseek-v4.1-flash`, `deepseek-v4.1-flash-1017`

Text only: `qwen3.7-max`, `glm-5.3`, `glm-5.2`, `deepseek-v4-pro`, `deepseek-v4-pro-0813`, `deepseek-v4-flash-0731`, `auto`, `decision-model-preview`

Source: <https://help.aliyun.com/zh/model-studio/token-plan-personal-overview>

## Limits

- Relies on pi-ai internals (`ModelsImpl.getModels`). If a future release renames it, the plugin degrades to catalog-only writes.
- Models outside the `deepseek-v4.1-flash` family only get their input modality; cloning another vendor's `maxTokens`/`compat` would send wrong request parameters. Their context and output limits stay at the route defaults.
- Models already present in the shipped catalog are never touched.

## Known issue: reasoning parameters on the Bailian endpoint

Before you send an image to `deepseek-v4.1-flash-1017` through Bailian, be aware of a problem **this repository does not fix** (noted 2026-11):

- `dsh-llm-pi-ai` applies pi-ai's catalog `compat` for `deepseek` (which carries `enable_thinking` and other reasoning switches) to this route as well.
- When your Bailian route points at a compatible-mode endpoint (`.../compatible-mode/v1`), the gateway may reject the request as `InvalidParameter` on `enable_thinking`. DSH's shipped `qwen-token-plan-cn` route uses the same compatible mode and the same `compat`, so this is upstream behaviour rather than something this plugin introduces.
- No reproduction log is attached here; trust the actual error you see. Workaround directions: override `compat` at route or model level, or test against a parameter set from the official OpenAI-compatible SDK.

## Coexistence

- This plugin only writes catalog entries and overlays metadata at read time. It registers no provider route and takes over no adapter.
- Installing a second `@deepseek-ai/dsh-llm-pi-ai` instance (for example from another plugin that wants its own route) hits a DSH-wide limit first: `LlmError: configurable provider "amazon-bedrock" is already declared`, and the second instance fails to activate. That is unrelated to this plugin; extend through route borrowing instead.

## License

MIT
