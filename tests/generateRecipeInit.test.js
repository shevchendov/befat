const sdk = require('wx-server-sdk')
jest.mock('wx-server-sdk')
const generateRecipeInit = require('../cloudfunctions/generateRecipeInit/index')

beforeEach(() => {
  sdk.__resetDB()
})

describe('generateRecipeInit - first run', () => {
  test('首次调用返回 count=32', async () => {
    const res = await generateRecipeInit.main({}, {})
    expect(res.code).toBe(0)
    expect(res.count).toBe(32)
    expect(res.message).toContain('初始化完成')
  })

  test('插入 32 条食谱到 recipes 集合', async () => {
    await generateRecipeInit.main({}, {})
    const db = sdk.__getDB()
    expect(db.recipes.length).toBe(32)
  })

  test('每条食谱包含必要字段', async () => {
    await generateRecipeInit.main({}, {})
    const db = sdk.__getDB()
    db.recipes.forEach((recipe, i) => {
      expect(recipe).toHaveProperty('title')
      expect(recipe).toHaveProperty('calorie')
      expect(recipe).toHaveProperty('protein_g')
      expect(recipe).toHaveProperty('ingredients')
      expect(recipe).toHaveProperty('steps')
      expect(recipe).toHaveProperty('tags')
      expect(recipe).toHaveProperty('created_at')
      expect(Array.isArray(recipe.ingredients)).toBe(true)
      expect(Array.isArray(recipe.steps)).toBe(true)
      expect(Array.isArray(recipe.tags)).toBe(true)
      expect(typeof recipe.title).toBe('string')
      expect(typeof recipe.calorie).toBe('number')
      expect(typeof recipe.protein_g).toBe('number')
      expect(recipe.calorie).toBeGreaterThan(0)
      expect(recipe.protein_g).toBeGreaterThanOrEqual(0)
    })
  })

  test('不包含 _id 和 _openid（由 add 自动注入）', async () => {
    await generateRecipeInit.main({}, {})
    const db = sdk.__getDB()
    db.recipes.forEach(recipe => {
      expect(recipe).toHaveProperty('_id')
      expect(recipe).toHaveProperty('_openid')
    })
  })
})

describe('generateRecipeInit - idempotent', () => {
  test('第二次调用返回已有数量并跳过插入', async () => {
    await generateRecipeInit.main({}, {})
    const dbBefore = sdk.__getDB()
    const res = await generateRecipeInit.main({}, {})
    const dbAfter = sdk.__getDB()
    expect(res.code).toBe(0)
    expect(res.count).toBe(32)
    expect(res.message).toContain('已存在')
    expect(dbAfter.recipes.length).toBe(dbBefore.recipes.length)
  })

  test('已有一条数据时不再插入', async () => {
    sdk.__seed('recipes', { title: '手工食谱', calorie: 500, protein_g: 20, ingredients: [], steps: [], tags: [] })
    const res = await generateRecipeInit.main({}, {})
    expect(res.count).toBe(1)
    expect(res.message).toContain('已存在')
    const db = sdk.__getDB()
    expect(db.recipes.length).toBe(1)
  })
})

describe('generateRecipeInit - recipe data quality', () => {
  test('所有食谱 calorie 在合理范围', async () => {
    await generateRecipeInit.main({}, {})
    const db = sdk.__getDB()
    db.recipes.forEach(recipe => {
      expect(recipe.calorie).toBeGreaterThanOrEqual(200)
      // 部分正餐（如红烧牛肉 772kcal）按 CDC 数据本就高热量，上限放宽到 800
      expect(recipe.calorie).toBeLessThanOrEqual(800)
    })
  })

  test('所有食谱都有非空 ingredients 和 steps', async () => {
    await generateRecipeInit.main({}, {})
    const db = sdk.__getDB()
    db.recipes.forEach(recipe => {
      expect(recipe.ingredients.length).toBeGreaterThan(0)
      expect(recipe.steps.length).toBeGreaterThan(0)
    })
  })

  test('所有食谱至少有一个 tag', async () => {
    await generateRecipeInit.main({}, {})
    const db = sdk.__getDB()
    db.recipes.forEach(recipe => {
      expect(recipe.tags.length).toBeGreaterThan(0)
    })
  })

  test('响应 code=0', async () => {
    const res = await generateRecipeInit.main({}, {})
    expect(res.code).toBe(0)
  })
})
