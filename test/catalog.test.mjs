import { test } from 'node:test'
import assert from 'node:assert/strict'
import { declaredInput, exportNameFor, fillCatalog, TEXT_MODELS, VISION_MODELS } from '../index.js'

/** 一份形状最小的假目录，够验证"补目录"的规则。 */
function fakeCatalog() {
  return {
    'deepseek-v4.1-flash': {
      id: 'deepseek-v4.1-flash',
      name: 'deepseek-v4.1-flash',
      api: 'openai-completions',
      provider: 'qwen-token-plan-cn',
      baseUrl: 'https://example.invalid/v1',
      type: 'chat',
      input: ['text', 'image'],
      contextWindow: 1000000,
      maxTokens: 384000,
      compat: { thinkingFormat: 'deepseek' },
      reasoning: true,
    },
  }
}

test('导出名按 pi-ai 规则转换', () => {
  assert.equal(exportNameFor('qwen-token-plan-cn'), 'QWEN_TOKEN_PLAN_CN_MODELS')
})

test('官方能力表映射到输入模态', () => {
  assert.deepEqual(declaredInput('qwen4-max'), ['text', 'image'])
  assert.deepEqual(declaredInput('deepseek-v4.1-flash-1017'), ['text', 'image'])
  assert.deepEqual(declaredInput('glm-5.3'), ['text'])
  assert.equal(declaredInput('wan3.0-video'), undefined)
})

test('缺失的视觉模型被补进来', () => {
  const catalog = fakeCatalog()
  const { added, filled } = fillCatalog(catalog)
  assert.ok(added.includes('deepseek-v4.1-flash-1017'))
  assert.ok(added.includes('qwen4-max'))
  assert.deepEqual(filled, [])
  assert.deepEqual(catalog['qwen4-max'].input, ['text', 'image'])
  assert.deepEqual(catalog['glm-5.3'].input, ['text'])
})

test('只有同族模型继承 maxTokens/compat', () => {
  const catalog = fakeCatalog()
  fillCatalog(catalog)
  const snapshot = catalog['deepseek-v4.1-flash-1017']
  assert.equal(snapshot.maxTokens, 384000)
  assert.equal(snapshot.contextWindow, 1000000)
  assert.deepEqual(snapshot.compat, { thinkingFormat: 'deepseek' })
  assert.equal(snapshot.reasoning, true)

  const qwen = catalog['qwen4-max']
  assert.equal(qwen.maxTokens, undefined)
  assert.equal(qwen.compat, undefined)
  assert.equal(qwen.api, 'openai-completions')
})

test('目录里已有的模型完全不改', () => {
  const catalog = fakeCatalog()
  const before = { ...catalog['deepseek-v4.1-flash'] }
  fillCatalog(catalog)
  assert.deepEqual(catalog['deepseek-v4.1-flash'], before)
})

test('已经声明 image 的条目不被重复计入', () => {
  const catalog = fakeCatalog()
  catalog['qwen4-max'] = { ...catalog['deepseek-v4.1-flash'], id: 'qwen4-max', name: 'qwen4-max' }
  const { added, filled } = fillCatalog(catalog)
  assert.ok(!added.includes('qwen4-max'))
  assert.ok(!filled.includes('qwen4-max'))
})

test('exclude 让插件不碰指定模型', () => {
  const catalog = fakeCatalog()
  fillCatalog(catalog, ['glm-5.3'])
  assert.equal(catalog['glm-5.3'], undefined)
  assert.ok(VISION_MODELS.includes('qwen4-max'))
  assert.ok(TEXT_MODELS.includes('glm-5.3'))
})

test('目录里没有模板条目时安全退出', () => {
  const { added, filled, template } = fillCatalog({})
  assert.equal(template, undefined)
  assert.deepEqual(added, [])
  assert.deepEqual(filled, [])
})