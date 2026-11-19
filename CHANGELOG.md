# Changelog

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
