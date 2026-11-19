/**
 * 百炼 Token Plan 目录补齐插件
 *
 * DSH 判断模型能否收图，只看模型声明的输入模态：
 * `dsh-llm-pi-ai/src/catalog.ts` 里
 *   input: declaredInput(entry.input) ?? base?.input ?? [...request.defaultInput]
 * 其中 `base` 是按**路由名**去 pi-ai 已安装目录里查的模型条目。阿里百炼这条
 * 路由在目录里叫 `qwen-token-plan-cn`，但目录缺了 1017 快照等模型，于是那些
 * 模型只能落到 `defaultInput`（默认 ['text']），附图就被宿主拒绝。
 *
 * 本插件把缺失的模型补进 pi-ai 的 shipped catalog 对象。`dsh-llm-pi-ai` 用裸
 * specifier 导入 pi-ai，profile 插件通过模块回退解析到同一个真实文件，因此
 * 两边持有同一个模块实例 —— 在这里写入，等于在适配器那里写入。
 *
 * @module dsh-bailian-token-plan
 */
import { importPiAiModule } from './resolve.js'

/** pi-ai 目录里承载百炼 Token Plan 的 provider 名，同时也是路由名。 */
export const PROVIDER = 'qwen-token-plan-cn'

/** 官方文档标注支持视觉理解的模型（输入模态 Text、Image）。 */
export const VISION_MODELS = [
  'qwen4-max',
  'qwen4-max-preview',
  'qwen3.8-max',
  'qwen3.8-flash',
  'qwen3.7-plus',
  'qwen3.6-flash',
  'deepseek-v4.1-flash',
  'deepseek-v4.1-flash-1017',
]

/** 官方文档标注为纯文本的对话模型。 */
export const TEXT_MODELS = [
  'qwen3.7-max',
  'glm-5.3',
  'glm-5.2',
  'deepseek-v4-pro',
  'deepseek-v4-pro-0813',
  'deepseek-v4-flash-0731',
  'auto',
  'decision-model-preview',
]

export const name = 'bailian-catalog'
export const inject = []

/** `qwen-token-plan-cn` → `QWEN_TOKEN_PLAN_CN_MODELS`，pi-ai 的导出命名规则。 */
export function exportNameFor(provider) {
  return `${provider.toUpperCase().replace(/[^A-Z0-9]+/gu, '_')}_MODELS`
}

/** 官方能力表：模型 id → 输入模态。 */
export function declaredInput(id) {
  if (VISION_MODELS.includes(id)) return ['text', 'image']
  if (TEXT_MODELS.includes(id)) return ['text']
  return undefined
}

/** 与模板同族、可以直接继承模板能力参数的模型（1017 是 flash 的快照）。 */
const SIBLING_METADATA = new Set(['deepseek-v4.1-flash-1017'])

/** 只在同族模型上继承的能力参数；跨厂商克隆会传错请求参数。 */
const METADATA_KEYS = ['contextWindow', 'maxTokens', 'compat', 'reasoning']

/** 覆盖到适配器物化结果上的字段。 */
const OVERLAY_KEYS = ['input', 'contextWindow', 'maxTokens', 'compat', 'reasoning']

/**
 * 用同目录里的一个已知条目当模板，保证补进去的条目字段完整
 * （api、baseUrl、provider、type 由目录决定）。能力参数只对同族模型继承。
 */
function entryFor(template, id, input) {
  const entry = {
    id,
    name: id,
    input: [...input],
    api: template.api,
    provider: template.provider,
    baseUrl: template.baseUrl,
    type: template.type,
  }
  if (SIBLING_METADATA.has(id)) {
    for (const key of METADATA_KEYS) {
      if (template[key] !== undefined) entry[key] = template[key]
    }
  }
  return entry
}

/**
 * 跨 apply 的补丁状态。
 *
 * 适配器在自己的 apply 里就把路由物化成模型快照（`dsh-llm-pi-ai/src/adapter.ts:284`
 * 的 `snapshot`），我们的条目被 patch 追加在树尾，因此**只写目录来不及**：宿主准入和
 * 请求参数都读那份快照。这里改 `ModelsImpl.prototype.getModels`（`getModel` 内部也走
 * 它），在读取时把目录里的能力参数覆盖上去，等价于"目录在我们之前就齐了"。
 */
const live = { proto: undefined, original: undefined, patched: undefined, overlays: new Map() }

/**
 * 把目录里的能力参数覆盖到集合读出的模型上。
 *
 * @param model - 集合给出的模型条目。
 * @param provider - 调用方显式指定的路由，未指定时按条目自身 provider 判定。
 * @returns 覆盖后的新条目；没有覆盖规则时原样返回。
 */
function overlayModel(model, provider) {
  if (model === null || typeof model !== 'object' || typeof model.id !== 'string') return model
  const overlay = live.overlays.get(provider ?? model.provider)
  if (overlay === undefined || !overlay.ids.has(model.id)) return model
  const meta = overlay.catalog[model.id]
  if (meta === undefined) return model
  const merged = { ...model }
  for (const key of OVERLAY_KEYS) {
    if (meta[key] === undefined) continue
    merged[key] = Array.isArray(meta[key]) ? [...meta[key]] : meta[key]
  }
  return merged
}

/**
 * 安装读取期覆盖。
 *
 * @param core - pi-ai 核心模块（`createModels` 所在处）。
 * @param route - DSH 里的路由名（用户可自定义，不必等于目录名）。
 * @param catalog - 供该路由借用的 shipped catalog 对象。
 * @param ids - 本插件为这个路由补齐/修正过的模型 id。
 * @returns 是否安装成功以及还原函数。
 */
export function installCatalogOverlay(core, route, catalog, ids) {
  const probe = core.createModels({})
  const proto = Object.getPrototypeOf(probe)
  if (proto === null || typeof proto?.getModels !== 'function') {
    return { supported: false, dispose() {} }
  }
  if (live.proto !== proto) {
    live.proto = proto
    live.original = proto.getModels
    live.patched = undefined
    live.overlays = new Map()
  }
  live.overlays.set(route, { catalog, ids: new Set(ids) })
  if (live.patched === undefined) {
    live.patched = function getModels(provider) {
      const base = live.original.call(this, provider)
      if (!Array.isArray(base) || live.overlays.size === 0) return base
      return base.map(model => overlayModel(model, provider))
    }
    Object.defineProperty(live.patched, 'name', { value: 'getModels', configurable: true })
  }
  proto.getModels = live.patched
  let disposed = false
  return {
    supported: true,
    dispose() {
      if (disposed) return
      disposed = true
      live.overlays.delete(route)
      if (live.overlays.size === 0 && live.proto?.getModels === live.patched) {
        live.proto.getModels = live.original
      }
    },
  }
}

/** 路由名 → 借用哪份 shipped catalog。用户自定义的 `aliyun` 也能借此拿到目录。 */
export const DEFAULT_ROUTES = { [PROVIDER]: PROVIDER }

/**
 * 取某个目录文件的 shipped catalog 对象（模块状态本体，写入即全局可见）。
 *
 * @param source - pi-ai 目录里的 provider 名。
 * @returns catalog 对象。
 * @throws 当安装的 pi-ai 没有这个目录模块时。
 */
async function loadCatalog(source) {
  const specifier = `@earendil-works/pi-ai/providers/${source}.models`
  const module = await importPiAiModule(specifier)
  const exported = exportNameFor(source)
  const catalog = module[exported]
  if (catalog === undefined) throw new Error(`${specifier} 没有导出 ${exported}`)
  return catalog
}

/**
 * 把缺失的模型补进目录，并给"存在但漏了 image"的条目补模态。
 *
 * @param catalog - shipped catalog 对象。
 * @param exclude - 不想让插件插手的模型 id（配置里的 `exclude`）。
 * @returns 新增的 id、修正过模态的 id，以及可作模板的条目。
 */
export function fillCatalog(catalog, exclude = []) {
  const skip = new Set(exclude)
  const template = catalog['deepseek-v4.1-flash']
    ?? Object.values(catalog).find(entry => Array.isArray(entry?.input) && entry.input.includes('image'))
  if (template === undefined) return { added: [], filled: [], template: undefined }
  const added = []
  const filled = []
  for (const id of [...VISION_MODELS, ...TEXT_MODELS]) {
    if (skip.has(id)) continue
    const input = declaredInput(id)
    if (input === undefined) continue
    const existing = catalog[id]
    if (existing === undefined) {
      catalog[id] = entryFor(template, id, input)
      added.push(id)
      continue
    }
    if (input.includes('image') && !existing.input?.includes('image')) {
      existing.input = [...input]
      filled.push(id)
    }
  }
  return { added, filled, template }
}

/**
 * 启动时补齐目录，并让适配器已经物化的模型快照在读取时看到这些元数据。
 *
 * @param ctx - cordis 上下文。
 * @param config - 插件配置，`routes` 可把自定义路由名映射到 catalog 名。
 */
export async function apply(ctx, config = {}) {
  const routes = { ...DEFAULT_ROUTES, ...(config?.routes ?? {}) }
  const core = await importPiAiModule('@earendil-works/pi-ai/models')
  const all = await importPiAiModule('@earendil-works/pi-ai/providers/all')
  const sources = new Map()
  const overlays = []
  const report = []

  for (const [route, source] of Object.entries(routes)) {
    let source_ = sources.get(source)
    if (source_ === undefined) {
      let catalog
      try {
        catalog = await loadCatalog(source)
      } catch (error) {
        report.push(`${route}: 跳过（${error?.message ?? String(error)}）`)
        continue
      }
      const { added, filled, template } = fillCatalog(catalog, config?.exclude ?? [])
      if (template === undefined) {
        report.push(`${route}: 跳过（目录里没有可作模板的多模态条目）`)
        continue
      }
      const served = all.getBuiltinModels(source)
      const probe = served.find(model => model.id === 'deepseek-v4.1-flash-1017')
      source_ = { catalog, added, filled, ids: [...added, ...filled] }
      sources.set(source, source_)
      report.push(`${source}: 新增 ${added.length} 个、修正模态 ${filled.length} 个，`
        + `目录内条目 ${served.length} 个，1017 模态=${JSON.stringify(probe?.input)}`)
    }
    const overlay = installCatalogOverlay(core, route, source_.catalog, source_.ids)
    overlays.push(overlay)
    report.push(`${route} → ${source}: 读取期覆盖${overlay.supported ? '已安装' : '不可用'}`)
  }

  if (overlays.length === 0) {
    console.warn(`[bailian-catalog] 没有可用的路由配置，跳过。${report.join('；')}`)
    return
  }

  if (ctx?.effect !== undefined) {
    ctx.effect(() => () => {
      for (const overlay of overlays) overlay.dispose()
    }, 'bailian-catalog: 还原模型集合读取补丁')
  }

  console.log(`[bailian-catalog] ${report.join('；')}`)

  // 自检：宿主准入走 resolveModelInfo -> adapter.resolveModel -> 集合读取，
  // 这里走同一条链，确认补丁真的生效（而不是只写进了目录）。
  ctx.inject(['llm'], async (inner) => {
    for (const route of Object.keys(routes)) {
      try {
        const models = await inner.llm.listModels(route)
        if (models.length === 0) continue
        const summary = models.map(model => `${model.id}:${(model.inputModalities ?? []).join('+')}`)
        console.log(`[bailian-catalog] 自检 ${route} 共 ${models.length} 个模型 → ${summary.join(' | ')}`)
      } catch (error) {
        const message = error?.message ?? String(error)
        // 没配置的路由本来就没有适配器，不算问题。
        if (!message.includes('no adapter registered')) {
          console.log(`[bailian-catalog] 自检 ${route} 失败：${message}`)
        }
      }
    }
  })
}

export default { name, inject, apply }