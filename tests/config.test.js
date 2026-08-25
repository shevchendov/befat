let configMod

beforeEach(() => {
  jest.resetModules()
  configMod = require('../cloudfunctions/common/config')
})

function fakeDb(config, shouldThrow) {
  const get = shouldThrow
    ? jest.fn().mockRejectedValue(new Error('db error'))
    : jest.fn().mockResolvedValue({ data: config })
  return { collection: () => ({ doc: () => ({ get }) }), getFn: get }
}

describe('config - renderPrompt', () => {
  test('替换占位符', () => {
    const out = configMod.renderPrompt('今天是 {date}，吃 {ingredients}', { date: '2026-08-25', ingredients: '米饭、鸡蛋' })
    expect(out).toBe('今天是 2026-08-25，吃 米饭、鸡蛋')
  })

  test('重复占位符全部替换', () => {
    const out = configMod.renderPrompt('{title} {title}', { title: '鸡蛋' })
    expect(out).toBe('鸡蛋 鸡蛋')
  })
})

describe('config - getConfig', () => {
  test('DB 合法配置读取成功', async () => {
    const db = fakeDb({ ...configMod.LOCAL_FALLBACK_CONFIG })
    const res = await configMod.getConfig(db)
    expect(res.prompts.daily_menu).toContain('{date}')
    expect(res.ingredient_whitelist.length).toBeGreaterThan(0)
  })

  test('DB 读取失败 → 兜底 LOCAL_FALLBACK', async () => {
    const db = fakeDb(null, true)
    const res = await configMod.getConfig(db)
    expect(res).toBe(configMod.LOCAL_FALLBACK_CONFIG)
  })

  test('校验失败（缺 prompts）→ 兜底 LOCAL_FALLBACK', async () => {
    const db = fakeDb({ ingredient_whitelist: ['米饭'] })
    const res = await configMod.getConfig(db)
    expect(res).toBe(configMod.LOCAL_FALLBACK_CONFIG)
  })

  test('校验失败（fallback_menus 缺餐别）→ 兜底 LOCAL_FALLBACK', async () => {
    const bad = { ...configMod.LOCAL_FALLBACK_CONFIG, fallback_menus: [{ meal_type: 'breakfast' }] }
    const db = fakeDb(bad)
    const res = await configMod.getConfig(db)
    expect(res).toBe(configMod.LOCAL_FALLBACK_CONFIG)
  })

  test('成功读取后内存缓存命中，不重复读 DB', async () => {
    const db = fakeDb({ ...configMod.LOCAL_FALLBACK_CONFIG })
    await configMod.getConfig(db)
    await configMod.getConfig(db)
    expect(db.getFn).toHaveBeenCalledTimes(1)
  })
})