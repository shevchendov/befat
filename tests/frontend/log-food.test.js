require('./setup')
const { getLastPageConfig, createPage, callFnMock, collectionAdd } = require('./setup')

let page

beforeAll(() => {
  require('../../miniprogram/pages/log-food/log-food')
  const config = getLastPageConfig()
  page = createPage(config)
})

beforeEach(() => {
  page.setData.mockClear()
  page.data.mealType = 'lunch'
  page.data.rawText = ''
  page.data.parsedItems = []
  page.data.totalCalorie = 0
  page.data.totalProtein = 0
  page.data.rawTextSaved = ''
  page.data.showResult = false
  page.data.parsing = false
  page.data.saving = false
  page.data.showCelebration = false
  getApp().globalData.forceIndexRefresh = false
})

describe('setMealType', () => {
  test('更新餐次类型', () => {
    page.setMealType({ currentTarget: { dataset: { type: 'dinner' } } })
    expect(page.setData).toHaveBeenCalledWith({ mealType: 'dinner' })
  })
})

describe('onTextInput', () => {
  test('更新输入文字', () => {
    page.onTextInput({ detail: { value: '一碗米饭' } })
    expect(page.setData).toHaveBeenCalledWith({ rawText: '一碗米饭', canParse: true })
  })
})

describe('parseFood', () => {
  test('空文字不发起调用', async () => {
    page.data.rawText = ''
    await page.parseFood()
    expect(callFnMock).not.toHaveBeenCalled()
  })

  test('成功解析后展示结果', async () => {
    page.data.rawText = '一碗米饭'
    callFnMock.mockResolvedValue({
      result: { code: 0, message: 'ok', data: { items: [{ name: '米饭', portion: '1碗', calorie: 200, protein_g: 4 }], total_calorie: 200, total_protein_g: 4 } }
    })
    await page.parseFood()
    expect(page.data.showResult).toBe(true)
    expect(page.data.parsedItems).toEqual([{ name: '米饭', portion: '1碗', calorie: 200, protein_g: 4 }])
    expect(page.data.totalCalorie).toBe(200)
    expect(page.data.totalProtein).toBe(4)
    expect(page.data.rawTextSaved).toBe('一碗米饭')
  })

  test('空 items 时补偿为占位项', async () => {
    page.data.rawText = '未知食物'
    callFnMock.mockResolvedValue({
      result: { code: 0, message: 'ok', data: { items: [], total_calorie: 0, total_protein_g: 0 } }
    })
    await page.parseFood()
    expect(page.data.parsedItems).toEqual([{ name: '未知食物', portion: '1份', calorie: 0, protein_g: 0 }])
  })

  test('code 88 违规内容不展示结果', async () => {
    page.data.rawText = '违规'
    callFnMock.mockResolvedValue({ result: { code: 88, message: '输入包含违规内容' } })
    await page.parseFood()
    expect(page.data.showResult).toBe(false)
    expect(wx.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining('违规') }))
  })

  test('code 非 0 非 88 时 toast 错误信息', async () => {
    page.data.rawText = '解析失败'
    callFnMock.mockResolvedValue({ result: { code: 3, message: 'AI 解析失败' } })
    await page.parseFood()
    expect(wx.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining('AI 解析失败') }))
  })

  test('网络异常时 toast', async () => {
    page.data.rawText = '米饭'
    callFnMock.mockRejectedValue(new Error('network error'))
    await page.parseFood()
    expect(page.data.parsing).toBe(false)
    expect(wx.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining('网络异常') }))
  })
})

describe('editItem / recalcTotal', () => {
  test('编辑单项后重新计算合计', () => {
    page.data.parsedItems = [{ name: '米饭', portion: '1碗', calorie: 200, protein_g: 4 }]
    page.editItem({ currentTarget: { dataset: { index: 0, field: 'calorie' } }, detail: { value: '250' } })
    expect(page.data.parsedItems[0].calorie).toBe('250')
    expect(page.data.totalCalorie).toBe(250)
  })
})

describe('removeItem', () => {
  test('移除单项后重新计算', () => {
    page.data.parsedItems = [
      { name: '米饭', portion: '1碗', calorie: 200, protein_g: 4 },
      { name: '鸡腿', portion: '1个', calorie: 150, protein_g: 20 }
    ]
    page.removeItem({ currentTarget: { dataset: { index: 0 } } })
    expect(page.data.parsedItems).toHaveLength(1)
    expect(page.data.parsedItems[0].name).toBe('鸡腿')
  })
})

describe('addItem', () => {
  test('添加空项目', () => {
    page.data.parsedItems = [{ name: '米饭', portion: '1碗', calorie: 200, protein_g: 4 }]
    page.addItem()
    expect(page.data.parsedItems).toHaveLength(2)
    expect(page.data.parsedItems[1]).toEqual({ name: '', portion: '1份', calorie: 0, protein_g: 0 })
  })
})

describe('recalcTotal', () => {
  test('空列表合计为 0', () => {
    page.data.parsedItems = []
    page.recalcTotal()
    expect(page.data.totalCalorie).toBe(0)
    expect(page.data.totalProtein).toBe(0)
  })

  test('多项累加正确', () => {
    page.data.parsedItems = [
      { name: '米饭', portion: '1碗', calorie: 200, protein_g: 4 },
      { name: '鸡腿', portion: '1个', calorie: 150, protein_g: 20 },
      { name: '青菜', portion: '1份', calorie: 50, protein_g: 2 }
    ]
    page.recalcTotal()
    expect(page.data.totalCalorie).toBe(400)
    expect(page.data.totalProtein).toBe(26)
  })
})

describe('saveFoodLog', () => {
  test('空项目列表时提示不保存', async () => {
    page.data.parsedItems = []
    await page.saveFoodLog()
    expect(wx.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining('保留') }))
  })

  test('成功保存后显示庆祝弹窗', async () => {
    callFnMock.mockResolvedValue({
      result: { code: 0, message: 'ok', data: { is_merge: false, item_count: 1 } }
    })
    page.data.parsedItems = [{ name: '米饭', portion: '1碗', calorie: 200, protein_g: 4 }]
    page.data.rawTextSaved = '米饭'
    page.data.mealType = 'lunch'
    page.data.totalCalorie = 200
    page.data.totalProtein = 4
    await page.saveFoodLog()
    expect(callFnMock).toHaveBeenCalledWith(expect.objectContaining({
      name: 'saveFoodLog',
      data: expect.objectContaining({ date: expect.any(String), meal_type: 'lunch', items: expect.any(Array) })
    }))
    expect(page.data.showCelebration).toBe(true)
    expect(page.data.celebText).toBeTruthy()
  })

  test('云函数返回非 0 code 时 toast 保存失败', async () => {
    callFnMock.mockResolvedValue({ result: { code: 3, message: 'AI 解析失败' } })
    page.data.parsedItems = [{ name: '米饭', portion: '1碗', calorie: 200, protein_g: 4 }]
    page.data.rawTextSaved = '米饭'
    page.data.mealType = 'lunch'
    await page.saveFoodLog()
    expect(page.data.saving).toBe(false)
    expect(page.data.showCelebration).toBe(false)
    expect(wx.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining('失败') }))
  })

  test('保存失败(网络异常)时 toast', async () => {
    callFnMock.mockRejectedValue(new Error('db error'))
    page.data.parsedItems = [{ name: '米饭', portion: '1碗', calorie: 200, protein_g: 4 }]
    page.data.rawTextSaved = '米饭'
    page.data.mealType = 'lunch'
    await page.saveFoodLog()
    expect(page.data.saving).toBe(false)
    expect(wx.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining('失败') }))
  })
})

describe('saveFoodLog - forceIndexRefresh 写后强制刷新', () => {
  test('保存成功后设置 forceIndexRefresh', async () => {
    callFnMock.mockResolvedValue({ result: { code: 0, message: 'ok', data: { is_merge: false, item_count: 1 } } })
    page.data.parsedItems = [{ name: '米饭', portion: '1碗', calorie: 200, protein_g: 4 }]
    page.data.rawTextSaved = '米饭'
    page.data.mealType = 'lunch'
    await page.saveFoodLog()
    expect(getApp().globalData.forceIndexRefresh).toBe(true)
  })

  test('保存失败（code 非 0）不设置 forceIndexRefresh', async () => {
    callFnMock.mockResolvedValue({ result: { code: 3, message: 'AI 解析失败' } })
    page.data.parsedItems = [{ name: '米饭', portion: '1碗', calorie: 200, protein_g: 4 }]
    page.data.rawTextSaved = '米饭'
    page.data.mealType = 'lunch'
    await page.saveFoodLog()
    expect(getApp().globalData.forceIndexRefresh).toBe(false)
  })

  test('保存失败（网络异常）不设置 forceIndexRefresh', async () => {
    callFnMock.mockRejectedValue(new Error('network error'))
    page.data.parsedItems = [{ name: '米饭', portion: '1碗', calorie: 200, protein_g: 4 }]
    page.data.rawTextSaved = '米饭'
    page.data.mealType = 'lunch'
    await page.saveFoodLog()
    expect(getApp().globalData.forceIndexRefresh).toBe(false)
  })
})

describe('resetForm', () => {
  test('重置所有输入状态', () => {
    page.data.showResult = true
    page.data.rawText = '米饭'
    page.resetForm()
    expect(page.data.rawText).toBe('')
    expect(page.data.showResult).toBe(false)
    expect(page.data.parsedItems).toEqual([])
    expect(page.data.totalCalorie).toBe(0)
    expect(page.data.totalProtein).toBe(0)
  })
})
