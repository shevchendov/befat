require('./setup')
const { getLastPageConfig, createPage, callFnMock } = require('./setup')

let page

function snapshot(overrides = {}) {
  return {
    title: '溏心水煮蛋',
    meal_type: 'breakfast',
    calorie: 180,
    protein_g: 12.5,
    ingredients: ['鸡蛋 2个'],
    steps: ['煮6分钟'],
    date: '2026-08-24',
    created_at: '2026-08-24T10:00:00.000Z',
    ...overrides
  }
}

beforeAll(() => {
  require('../../miniprogram/pages/daily-menu/daily-menu')
  page = createPage(getLastPageConfig())
})

beforeEach(() => {
  page.setData.mockClear()
  page.data.drawerVisible = false
  page.data.favLoading = false
  page.data.favTab = 'all'
  page.data.favList = []
  page.data.favTotal = 0
  page.data.favHasMore = false
  page.data.date = '2026-08-24'
  page.data.meals = []
})

describe('openFavoriteDrawer', () => {
  test('打开抽屉并拉取收藏列表', async () => {
    callFnMock.mockResolvedValue({
      result: { code: 0, message: 'ok', data: { list: [snapshot()], total: 1, has_more: false } }
    })
    page.openFavoriteDrawer()
    expect(page.data.drawerVisible).toBe(true)
    await new Promise(r => setTimeout(r, 0))
    expect(page.data.favList).toHaveLength(1)
    expect(page.data.favList[0].title).toBe('溏心水煮蛋')
    expect(page.data.favList[0].mealLabel).toBe('早餐')
    expect(page.data.favList[0].expanded).toBe(false)
    expect(page.data.favTotal).toBe(1)
  })

  test('打开抽屉强制从 DB 拉取（不读本地缓存）', async () => {
    wx.setStorageSync('favoriteMenuCache', { ts: Date.now(), list: [snapshot({ title: '缓存旧数据' })] })
    callFnMock.mockResolvedValue({
      result: { code: 0, message: 'ok', data: { list: [snapshot({ title: 'DB新数据' })], total: 1, has_more: false } }
    })
    page.openFavoriteDrawer()
    expect(page.data.favList).toHaveLength(0)
    await new Promise(r => setTimeout(r, 0))
    expect(page.data.favList).toHaveLength(1)
    expect(page.data.favList[0].title).toBe('DB新数据')
  })

  test('抽屉已打开时不重复触发', () => {
    callFnMock.mockClear()
    page.data.drawerVisible = true
    page.openFavoriteDrawer()
    expect(callFnMock).not.toHaveBeenCalled()
  })
})

describe('switchFavTab', () => {
  test('切换 Tab 后按 meal_type 重新拉取', async () => {
    callFnMock.mockResolvedValue({
      result: { code: 0, message: 'ok', data: { list: [snapshot({ meal_type: 'lunch', title: '鸡腿饭' })], total: 1, has_more: false } }
    })
    page.switchFavTab({ currentTarget: { dataset: { tab: 'lunchdinner' } } })
    expect(page.data.favTab).toBe('lunchdinner')
    await new Promise(r => setTimeout(r, 0))
    expect(callFnMock).toHaveBeenCalledWith(expect.objectContaining({
      name: 'getFavorites',
      data: expect.objectContaining({ meal_types: ['lunch', 'dinner'] })
    }))
    expect(page.data.favList[0].meal_type).toBe('lunch')
  })

  test('同一 Tab 不重复拉取', () => {
    callFnMock.mockClear()
    page.data.favTab = 'all'
    page.switchFavTab({ currentTarget: { dataset: { tab: 'all' } } })
    expect(callFnMock).not.toHaveBeenCalled()
  })
})

describe('toggleDrawerDetail', () => {
  test('已有详情直接展开与收起', () => {
    page.data.favList = [{ ...snapshot(), mealLabel: '早餐', expanded: false, loading: false }]
    page.toggleDrawerDetail({ currentTarget: { dataset: { index: 0 } } })
    expect(page.data.favList[0].expanded).toBe(true)
    page.toggleDrawerDetail({ currentTarget: { dataset: { index: 0 } } })
    expect(page.data.favList[0].expanded).toBe(false)
  })

  test('空详情兜底生成并补全 + 写回', async () => {
    page.data.favList = [{ ...snapshot({ ingredients: [], steps: [] }), mealLabel: '早餐', expanded: false, loading: false }]
    callFnMock.mockResolvedValue({
      result: { code: 0, message: 'ok', data: { ingredients: ['鸡蛋 2个', '黑胡椒 少许'], steps: ['煮6分钟'] } }
    })
    await page.toggleDrawerDetail({ currentTarget: { dataset: { index: 0 } } })
    expect(page.data.favList[0].ingredients).toEqual(['鸡蛋 2个', '黑胡椒 少许'])
    expect(page.data.favList[0].expanded).toBe(true)
    expect(page.data.favList[0].loading).toBe(false)
    expect(callFnMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'getMealDetail' }))
    expect(callFnMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'updateFavoriteDetail' }))
  })

  test('生成失败 loading 复位并 toast', async () => {
    page.data.favList = [{ ...snapshot({ ingredients: [], steps: [] }), mealLabel: '早餐', expanded: false, loading: false }]
    callFnMock.mockResolvedValue({ result: { code: -1, message: '生成失败' } })
    await page.toggleDrawerDetail({ currentTarget: { dataset: { index: 0 } } })
    expect(page.data.favList[0].expanded).toBe(false)
    expect(page.data.favList[0].loading).toBe(false)
    expect(wx.showToast).toHaveBeenCalled()
  })

  test('无效 index 不崩溃', () => {
    page.toggleDrawerDetail({ currentTarget: { dataset: { index: 99 } } })
    expect(page.data.favList).toEqual([])
  })
})

describe('removeFavFromDrawer', () => {
  beforeEach(() => {
    page.data.favList = [{ ...snapshot(), mealLabel: '早餐', expanded: false }]
    page.data.favTotal = 1
    page.data.meals = [{ title: '溏心水煮蛋', meal_type: 'breakfast', favorited: true }]
    callFnMock.mockResolvedValue({ result: { code: 0, message: 'ok', data: { favorited: false } } })
  })

  test('取消收藏：剔除卡片 + 同步主页爱心', async () => {
    await page.removeFavFromDrawer({ currentTarget: { dataset: { index: 0 } } })
    expect(page.data.favList).toHaveLength(0)
    expect(page.data.favTotal).toBe(0)
    expect(page.data.meals[0].favorited).toBe(false)
    expect(callFnMock).toHaveBeenCalledWith(expect.objectContaining({
      name: 'toggleFavoriteRecipe',
      data: expect.objectContaining({ recipe_snapshot: expect.objectContaining({ title: '溏心水煮蛋' }) })
    }))
  })

  test('取消失败回滚列表并 toast', async () => {
    callFnMock.mockResolvedValue({ result: { code: -1, message: '失败' } })
    await page.removeFavFromDrawer({ currentTarget: { dataset: { index: 0 } } })
    expect(page.data.favList).toHaveLength(1)
    expect(page.data.favTotal).toBe(1)
    expect(page.data.meals[0].favorited).toBe(true)
    expect(wx.showToast).toHaveBeenCalled()
  })
})

describe('双向反向校验', () => {
  test('主页已收藏但 DB 无 → 强制取消主页爱心 + 同步缓存', async () => {
    page.data.meals = [
      { title: '溏心水煮蛋', meal_type: 'breakfast', favorited: true },
      { title: '燕麦杯', meal_type: 'snack', favorited: true }
    ]
    wx.setStorageSync('dailyMenuFavorites', { '溏心水煮蛋|breakfast': true, '燕麦杯|snack': true })
    callFnMock.mockResolvedValue({
      result: { code: 0, message: 'ok', data: { list: [snapshot({ title: '溏心水煮蛋', meal_type: 'breakfast' })], total: 1, has_more: false } }
    })
    page.openFavoriteDrawer()
    await new Promise(r => setTimeout(r, 0))
    expect(page.data.meals[0].favorited).toBe(true)
    expect(page.data.meals[1].favorited).toBe(false)
    const map = wx.getStorageSync('dailyMenuFavorites')
    expect(map['溏心水煮蛋|breakfast']).toBe(true)
    expect(map['燕麦杯|snack']).toBeUndefined()
  })
})