require('./setup')
const { getLastPageConfig, createPage } = require('./setup')

let page
let collectionGet

beforeAll(() => {
  require('../../miniprogram/pages/recipe-list/recipe-list')
  const config = getLastPageConfig()
  page = createPage(config)
})

beforeEach(() => {
  page.setData.mockClear()
  page.data.recipes = []
  page.data.filteredRecipes = []
  page.data.tags = []
  page.data.selectedTag = ''
  page.data.loading = true
})

describe('loadRecipes', () => {
  test('加载食谱并提取标签', async () => {
    const db = wx.cloud.database()
    const col = db.collection('recipes')
    col.get = jest.fn(() => Promise.resolve({
      data: [
        { _id: '1', title: '食谱A', tags: ['早餐', '快手'] },
        { _id: '2', title: '食谱B', tags: ['午餐', '高蛋白'] },
        { _id: '3', title: '食谱C', tags: ['早餐', '高蛋白'] }
      ]
    }))
    await page.loadRecipes()
    expect(page.data.recipes).toHaveLength(3)
    expect(page.data.filteredRecipes).toHaveLength(3)
    expect(page.data.tags).toEqual(expect.arrayContaining(['早餐', '快手', '午餐', '高蛋白']))
    expect(page.data.loading).toBe(false)
  })

  test('加载失败不崩溃', async () => {
    const db = wx.cloud.database()
    const col = db.collection('recipes')
    col.get = jest.fn(() => Promise.reject(new Error('db error')))
    await page.loadRecipes()
    expect(page.data.loading).toBe(false)
  })
})

describe('filterByTag', () => {
  beforeEach(() => {
    page.data.recipes = [
      { _id: '1', title: '早餐A', tags: ['早餐', '快手'] },
      { _id: '2', title: '午餐B', tags: ['午餐', '高蛋白'] },
      { _id: '3', title: '早餐C', tags: ['早餐', '高蛋白'] }
    ]
  })

  test('空标签显示全部', () => {
    page.filterByTag({ currentTarget: { dataset: { tag: '' } } })
    expect(page.data.filteredRecipes).toHaveLength(3)
    expect(page.data.selectedTag).toBe('')
  })

  test('按标签过滤', () => {
    page.filterByTag({ currentTarget: { dataset: { tag: '早餐' } } })
    expect(page.data.filteredRecipes).toHaveLength(2)
    expect(page.data.selectedTag).toBe('早餐')
  })

  test('匹配无结果时返回空', () => {
    page.filterByTag({ currentTarget: { dataset: { tag: '晚餐' } } })
    expect(page.data.filteredRecipes).toHaveLength(0)
  })
})

describe('goToDetail', () => {
  test('导航到食谱详情', () => {
    wx.navigateTo.mockClear()
    page.goToDetail({ currentTarget: { dataset: { id: 'recipe-123' } } })
    expect(wx.navigateTo).toHaveBeenCalledWith(expect.objectContaining({
      url: expect.stringContaining('recipe-123')
    }))
  })
})
