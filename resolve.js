/**
 * 找到 DSH 安装里的 pi-ai，并导入它自己的目录模块。
 *
 * profile 插件直接 `import('@earendil-works/pi-ai/...')` 会失败：这个包只存在于
 * DSH 安装的 node_modules 里，不在 profile 的解析范围内。裸 specifier 若被解析
 * 到别的副本，修改就落在另一个模块实例上，适配器看不到 —— 所以这里只在解析不
 * 到安装本体时才退回安装目录，并始终用**真实文件的绝对 URL** 导入：ESM 按 URL
 * 缓存，URL 相同即模块实例相同。
 *
 * @module dsh-bailian-token-plan/resolve
 */
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** 候选锚点文件：它们的 node_modules 链可能包含 DSH 安装。 */
function installationAnchors() {
  const anchors = []
  const override = typeof process.env.DSH_PI_AI_ROOT === 'string' ? process.env.DSH_PI_AI_ROOT.trim() : ''
  if (override.length > 0) anchors.push(join(override, 'package.json'))
  if (typeof process.argv[1] === 'string' && process.argv[1].length > 0) anchors.push(process.argv[1])
  anchors.push(fileURLToPath(new URL('./package.json', import.meta.url)))
  return anchors
}

/** 把 scoped specifier 拆成包名与子路径。 */
function splitSpecifier(specifier) {
  const parts = specifier.split('/')
  const packageName = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
  return { packageName, subpath: specifier.slice(packageName.length) }
}

/** 通过某个锚点的解析路径找到包目录。 */
function packageDirFrom(anchor, packageName) {
  let searchPaths
  try {
    searchPaths = createRequire(anchor).resolve.paths(packageName) ?? []
  } catch {
    return undefined
  }
  for (const searchPath of searchPaths) {
    const candidate = join(searchPath, packageName)
    if (existsSync(join(candidate, 'package.json'))) return candidate
  }
  return undefined
}

/** export 键匹配到的通配符，或匹配失败时的 false。 */
function exportKeyMatch(declared, key) {
  if (declared[key] !== undefined) return { value: declared[key], wildcard: '' }
  for (const [pattern, value] of Object.entries(declared)) {
    const star = pattern.indexOf('*')
    if (star === -1) continue
    const prefix = pattern.slice(0, star)
    const suffix = pattern.slice(star + 1)
    if (key.length < prefix.length + suffix.length) continue
    if (!key.startsWith(prefix) || !key.endsWith(suffix)) continue
    return { value, wildcard: key.slice(prefix.length, key.length - suffix.length) }
  }
  return false
}

/** 包自己的 export map 为某个子路径声明的模块 URL。 */
function exportTargetUrl(packageDir, subpath) {
  let manifest
  try {
    manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
  } catch {
    return undefined
  }
  const declared = manifest.exports
  if (typeof declared !== 'object' || declared === null) return undefined
  const key = subpath.length === 0 ? '.' : `.${subpath}`
  const match = exportKeyMatch(declared, key)
  if (match === false) return undefined
  const chosen = typeof match.value === 'string' ? match.value : match.value?.import ?? match.value?.default
  if (typeof chosen !== 'string' || !chosen.startsWith('./')) return undefined
  const target = join(packageDir, chosen.split('*').join(match.wildcard))
  return existsSync(target) ? pathToFileURL(target).href : undefined
}

/** 已解析过的模块，按 specifier 缓存。 */
const resolvedModules = new Map()

/**
 * 导入一个 pi-ai 入口：profile 能解析就用裸 specifier，否则走安装目录里的真实文件。
 *
 * @param specifier - 例如 `@earendil-works/pi-ai/providers/qwen-token-plan-cn.models`。
 * @returns 模块命名空间。
 */
export async function importPiAiModule(specifier) {
  const cached = resolvedModules.get(specifier)
  if (cached !== undefined) return cached

  let module
  try {
    module = await import(specifier)
  } catch {
    const { packageName, subpath } = splitSpecifier(specifier)
    let url
    for (const anchor of installationAnchors()) {
      const packageDir = packageDirFrom(anchor, packageName)
      if (packageDir === undefined) continue
      url = exportTargetUrl(packageDir, subpath)
      if (url !== undefined) break
    }
    if (url === undefined) {
      throw new Error(`无法从本 profile 或 DSH 安装中解析 ${specifier}`)
    }
    module = await import(url)
  }

  resolvedModules.set(specifier, module)
  return module
}