require('./setup')
const { getLastPageConfig, createPage, callFnMock } = require('./setup')

let page

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
  test('通过 getPublishedRecipes 云函数加载食谱并提取标签', async () => {
    callFnMock.mockResolvedValue({
      result: {
        code: 0,
        data: {
          list: [
            { id: '1', title: '食谱A', tags: ['早餐', '快手'] },
            { id: '2', title: '食谱B', tags: ['午餐', '高蛋白'] },
            { id: '3', title: '食谱C', tags: ['早餐', '高蛋白'] }
          ]
        }
      }
    })
    await page.loadRecipes()
    expect(callFnMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'getPublishedRecipes' }))
    expect(page.data.recipes).toHaveLength(3)
    expect(page.data.recipes[0]._id).toBe('1')
    expect(page.data.filteredRecipes).toHaveLength(3)
    expect(page.data.tags).toEqual(expect.arrayContaining(['早餐', '快手', '午餐', '高蛋白']))
    expect(page.data.loading).toBe(false)
  })

  test('云函数返回非 0 时加载失败不崩溃', async () => {
    callFnMock.mockResolvedValue({ result: { code: 1, message: 'error' } })
    await page.loadRecipes()
    expect(page.data.loading).toBe(false)
  })

  test('云函数调用异常时不崩溃', async () => {
    callFnMock.mockRejectedValue(new Error('network error'))
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
