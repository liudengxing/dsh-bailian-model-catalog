# Changelog

## 0.1.8

- `package.json` 的 `description` 改为中文在前、英文在后：npm 包页与包列表
  显示的就是这个字段，此前只有英文在前的一句

## 0.1.7

- 新增 `locale/zh.json` 与 `locale/en.json`，各自声明 `meta.detail`：中文界面读
  `README.zh.md`，英文界面读 `README.en.md`。此前详情页只按 `README_NAMES`
  取 `README.md`，切语言不会换文档
- `package.json` 的 `files` 加入 `locale`

## 0.1.6

- 插件详情页改为**中文为默认**：`README.md` 现在是简体中文版，英文版移到
  `README.en.md`。DSH 详情页按界面语言走 `languageChain`（`zh-CN` → `zh` → `en`）
  取文档，因此中文界面看到中文，切到英文界面看到英文
- 开头说明提到最前面，并补齐「输入模态 / 支持图片输入与多模态」的表述
- 覆盖模型清单里标注视觉理解一行即支持图片输入的多模态模型
- `package.json` 的 `files` 加入 `README.en.md`，保证 npm 版本与仓库详情一致

## 0.1.5

- `package.json` 新增 `engines.dsh: ">=0.2.0-rc.2 <0.3.0"`：插件市场（索引）与
  安装器据此判断兼容性；此前该字段缺省，安装器会退回去检查 `@deepseek-ai/dsh*`
  peer 依赖，本包没有这类 peer，等于没有兼容性声明
- `engines.node` 保持不变（`>=22`）

## 0.1.4

首个正式对外版本。

- 新增「实现说明 / Implementation notes」小节：解释读取期覆盖、宿主模块实例解析、
  只覆盖自补 id 三处设计取舍
- 安装示例的本地开发路径改为中性的 `/absolute/path/to/...` 占位符
- 移除说明中的本机路径引用

## 0.1.3

- 新增 `.github/workflows/publish.yml`：推 `v*` tag 后自动跑测试并以
  `npm publish --provenance` 发布（Trusted Publishing + OIDC，无需长期 token）
- README 增加「自动发布」小节

## 0.1.2

- 仓库迁移至 GitHub：`github.com/liudengxing/dsh-bailian-model-catalog`
- `package.json` 补充 `repository` / `homepage` / `bugs` / `author`
- README 顶部增加中英文切换入口
- README 补「真机验证」小节：真实百炼兼容模式端点附图请求通过

## 0.1.1

- README 记录真机验证结论，移除 `enable_thinking` 已知问题说明

## 0.1.0

- 首个版本：补齐 pi-ai shipped catalog 的 `qwen-token-plan-cn` 模型目录
- 读取期覆盖 `ModelsImpl.getModels`，绕过适配器提前物化快照的时序问题
- 支持自定义路由名借名（`routes` 映射）与 `exclude`
