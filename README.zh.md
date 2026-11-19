# dsh-bailian-model-catalog

[English](./README.md) | **简体中文**

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的**阿里百炼 Token Plan** 路由补齐模型目录：官方标注支持视觉理解的模型会声明 `[text, image]`，附图不再被「当前模型不支持图片」拦下。

## 问题出在哪

DSH 判断模型能不能收图，只看模型声明的输入模态。`@deepseek-ai/dsh-llm-pi-ai` 在物化一条路由时执行：

```ts
input: declaredInput(entry.input) ?? base?.input ?? [...request.defaultInput]
```

其中 `base` 是按**路由名**去 pi-ai 已安装目录里查的条目。手写百炼路由时：

- 路由名通常叫 `aliyun` 之类，目录里没有这个名字 → `base` 为空；
- 模型条目只写了 `id`，没写 `input` → 落到 `defaultInput`，而它的默认值是 `['text']`。

结果就是：哪怕模型在百炼侧明确支持视觉，DSH 也会按纯文本处理，附图被宿主拒绝，提示「当前模型不支持图片，请切换支持图片的模型」。

## 这个插件做什么

1. **补齐 pi-ai 目录**：把官方能力表里 DSH 目录缺的模型写进 `qwen-token-plan-cn` 的 shipped catalog 对象（缺的加、漏模态的补）。
2. **补上时序差**：适配器在自己的 `apply()` 阶段就把路由物化成了模型快照，晚到的目录写入看不到。插件因此在**读取期**（`ModelsImpl.getModels`）把目录里的 `input`/`contextWindow`/`maxTokens`/`compat`/`reasoning` 覆盖到条目上，卸载时还原。
3. **允许借名**：你自己的路由名（如 `aliyun`）可以通过配置借用这份目录。

## 安装

从 npm：

```bash
dsh plugin --profile <你的 profile> add dsh-bailian-model-catalog
```

从 GitHub（插件市场收录前也能直接装）：

```bash
dsh plugin --profile <profile> add github:liudengxing/dsh-bailian-model-catalog
```

本地开发时用 `link:` 前缀，改代码即生效：

```bash
dsh plugin --profile <profile> add "link:Z:/path/to/dsh-bailian-model-catalog"
```

## 自动发布

仓库带 `.github/workflows/publish.yml`：推 `v*` tag 即跑 `npm run check` + `npm test`，
校验 tag 与 `package.json` 版本一致后 `npm publish --provenance`。

发版流程：

```bash
# 1. 改 package.json 的 version 与 CHANGELOG.md
# 2. 提交
git commit -am "chore(release): v0.1.3"
git tag v0.1.3
git push origin main --tags
```

npm 侧需要在包页面 Settings → Trusted Publishing 绑定本仓库与本工作流，
绑好后由 OIDC 签发短期凭据，仓库里不需要保存任何长期 token。

## 配置

### 情况 A：路由名就叫 `qwen-token-plan-cn`

零配置，装上即可。

### 情况 B：路由名是你自己起的（例如 `aliyun`）

一要在**路由级**写明 `api`（目录里没有这个名字，适配器推断不出协议，否则会报 `needs an api`）；二要让插件把目录借给这个路由：

```yaml
- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
      aliyun:
        displayName: 阿里百炼 · Token Plan
        apiKeyEnv: ALIYUN_API_KEY
        api: openai-completions
        baseURL: https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1
        models:
          - id: deepseek-v4.1-flash-1017
          - id: qwen4-max

- id: bailian-catalog
  config:
    routes:
      aliyun: qwen-token-plan-cn
```

### 全量配置项

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `routes` | `{ qwen-token-plan-cn: qwen-token-plan-cn }` | 路由名 → 借用哪份 shipped catalog（pi-ai 里的 provider 名） |
| `exclude` | `[]` | 不让插件插手的模型 id |

## 覆盖的模型

视觉理解（`text, image`）：`qwen4-max`、`qwen4-max-preview`、`qwen3.8-max`、`qwen3.8-flash`、`qwen3.7-plus`、`qwen3.6-flash`、`deepseek-v4.1-flash`、`deepseek-v4.1-flash-1017`

纯文本：`qwen3.7-max`、`glm-5.3`、`glm-5.2`、`deepseek-v4-pro`、`deepseek-v4-pro-0813`、`deepseek-v4-flash-0731`、`auto`、`decision-model-preview`

来源：<https://help.aliyun.com/zh/model-studio/token-plan-personal-overview>

## 生效与回滚

- 不需要重启：适配器在下一次请求时重读配置，插件也是按读取期生效。
- 卸载插件即还原：`ctx.effect` 在销毁时把 `getModels` 还原成原实现，程序化写入目录的条目随进程结束消失。

## 限制

- 依赖 pi-ai 的内部形状（`ModelsImpl.getModels`）。若新版本改名，插件会退化成「只写目录」，此时要等 profile 重新解析配置（例如改一次设置）才看得到效果。
- 非 `deepseek-v4.1-flash` 家族的模型**只补输入模态**，不继承别人的 `maxTokens`/`compat`——跨厂商克隆会发错请求参数。它们的上下文与输出上限仍取路由默认值，需要精确值请在模型条目里自己写。
- 目录里本来就有的模型（例如 `deepseek-v4.1-flash`）完全不动。
- 能力以官方文档为准；`qwen4-max-preview` 官方标注 2026-11-25 下线。

## 真机验证

2026-11 用真实 `ALIYUN_API_KEY` 对
`https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1` 验证：
`deepseek-v4.1-flash-1017` 附图请求顺利通过，模型能正确描述图片内容。
pi-ai 目录 `compat` 带进请求体的 `enable_thinking` 参数，兼容模式网关可以接受，
不构成阻塞。

## 与其他插件并存

- 本插件只做两件事：给 pi-ai 目录写条目、在读取期叠加元数据。它不注册 provider 路由，也不接管适配器。
- 若同时安装了另一个 `@deepseek-ai/dsh-llm-pi-ai` 实例（例如自建独立路由的插件），会先撞上 DSH 的全局限制：`LlmError: configurable provider "amazon-bedrock" is already declared`，第二个实例整实例激活失败。这与本插件无关，请改用路由借名方式扩展。

## License

MIT