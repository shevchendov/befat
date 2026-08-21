jest.mock('wx-server-sdk')

const toggleFavoriteRecipe = require('../cloudfunctions/toggleFavoriteRecipe/index')
const cloud = require('wx-server-sdk')

beforeEach(() => {
  cloud.__resetDB()
})

describe('toggleFavoriteRecipe - 参数校验', () => {
  test('缺少 recipe_snapshot 返回 code 1', async () => {
    const res = await toggleFavoriteRecipe.main({}, {})
    expect(res.code).toBe(1)
  })

  test('缺 title/meal_type 返回 code 1', async () => {
    const res = await toggleFavoriteRecipe.main({ recipe_snapshot: { calorie: 100 } }, {})
    expect(res.code).toBe(1)
  })
})

describe('toggleFavoriteRecipe - 收藏切换', () => {
  function snap(overrides = {}) {
    return {
      title: '测试菜', meal_type: 'breakfast', calorie: 400, protein_g: 20,
      ingredients: ['a'], steps: ['b'], date: '2026-08-21', ...overrides
    }
  }

  test('首次收藏 favorited=true 并落库', async () => {
    const res = await toggleFavoriteRecipe.main({ recipe_snapshot: snap() }, {})
    expect(res.code).toBe(0)
    expect(res.data.favorited).toBe(true)
    const favs = cloud.__getDB('user_favorites')
    expect(favs).toHaveLength(1)
    expect(favs[0].recipe_title).toBe('测试菜')
    expect(favs[0].meal_type).toBe('breakfast')
    expect(favs[0].recipe_id).toBeNull()
  })

  test('再次收藏同一 title+meal_type 取消 favorited=false', async () => {
    await toggleFavoriteRecipe.main({ recipe_snapshot: snap() }, {})
    const res = await toggleFavoriteRecipe.main({ recipe_snapshot: snap() }, {})
    expect(res.code).toBe(0)
    expect(res.data.favorited).toBe(false)
    expect(cloud.__getDB('user_favorites')).toHaveLength(0)
  })

  test('同名不同 meal_type 视为独立收藏，互不覆盖', async () => {
    await toggleFavoriteRecipe.main({ recipe_snapshot: snap({ meal_type: 'breakfast' }) }, {})
    await toggleFavoriteRecipe.main({ recipe_snapshot: snap({ meal_type: 'snack' }) }, {})
    expect(cloud.__getDB('user_favorites')).toHaveLength(2)
  })
})