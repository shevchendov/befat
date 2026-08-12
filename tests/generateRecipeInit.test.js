const sdk = require('wx-server-sdk')
jest.mock('wx-server-sdk')
const generateRecipeInit = require('../cloudfunctions/generateRecipeInit/index')

beforeEach(() => {
  sdk.__resetDB()
})

describe('generateRecipeInit - 已废弃', () => {
  test('返回 deprecated 标记且不插入任何食谱', async () => {
    const res = await generateRecipeInit.main({}, {})
    expect(res.code).toBe(0)
    expect(res.deprecated).toBe(true)
    expect(res.message).toContain('已废弃')
  })

  test('recipes 集合保持为空', async () => {
    await generateRecipeInit.main({}, {})
    const db = sdk.__getDB()
    expect(db.recipes).toHaveLength(0)
  })

  test('force 模式同样不插入数据', async () => {
    const res = await generateRecipeInit.main({ force: true }, {})
    expect(res.deprecated).toBe(true)
    const db = sdk.__getDB()
    expect(db.recipes).toHaveLength(0)
  })
})
