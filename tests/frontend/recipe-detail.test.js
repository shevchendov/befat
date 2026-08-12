require('./setup')
const { getLastPageConfig, createPage, callFnMock } = require('./setup')

let page

beforeAll(() => {
  require('../../miniprogram/pages/recipe-detail/recipe-detail')
  const config = getLastPageConfig()
  page = createPage(config)
})

beforeEach(() => {
  page.setData.mockClear()
  page.data.recipe = null
  page.data.loading = true
  page.data.favorited = false
})

describe('onLoad', () => {
  test('缺少 id 时提示', () => {
    wx.showToast.mockClear()
    page.onLoad({})
    expect(wx.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: '缺少食谱参数' }))
    expect(page.data.loading).toBe(false)
  })
})

describe('loadRecipe', () => {
  test('通过 getRecipeDetail 云函数加载详情', async () => {
    callFnMock.mockResolvedValue({
      result: {
        code: 0,
        data: {
          id: 'r1',
          title: '菜谱',
          nutrition: { calorie: 500, protein_g: 30, fat_g: 10, carb_g: 60, fiber_g: 5 },
          calorie: 500,
          protein_g: 30,
          ingredients: [{ name: '鸡蛋', amount: 2, unit: '个', food_id: null, note: null }],
          steps: ['打蛋'],
          tags: ['早餐'],
          image_url: '',
          version: 1
        }
      }
    })
    await page.loadRecipe('r1')
    expect(callFnMock).toHaveBeenCalledWith(expect.objectContaining({
      name: 'getRecipeDetail',
      data: { id: 'r1' }
    }))
    expect(page.data.recipe.title).toBe('菜谱')
    expect(page.data.recipe.calorie).toBe(500)
    expect(page.data.loading).toBe(false)
  })

  test('云函数返回错误码时提示失败', async () => {
    wx.showToast.mockClear()
    callFnMock.mockResolvedValue({ result: { code: 3, message: '食谱不可查看' } })
    await page.loadRecipe('r1')
    expect(wx.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: '加载失败' }))
    expect(page.data.loading).toBe(false)
  })

  test('调用异常时不崩溃', async () => {
    callFnMock.mockRejectedValue(new Error('network'))
    await page.loadRecipe('r1')
    expect(page.data.loading).toBe(false)
  })
})

describe('toggleFav', () => {
  test('成功切换收藏状态', async () => {
    page.recipeId = 'r1'
    callFnMock.mockResolvedValue({ result: { code: 0, data: { favorited: true } } })
    await page.toggleFav()
    expect(callFnMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'toggleFavorite' }))
  })

  test('失败回滚收藏状态', async () => {
    page.recipeId = 'r1'
    callFnMock.mockResolvedValue({ result: { code: 1, message: 'error' } })
    await page.toggleFav()
    expect(page.data.favorited).toBe(false)
  })
})
