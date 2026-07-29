require('./setup')
const { getLastPageConfig, createPage, callFnMock } = require('./setup')

let page

beforeAll(() => {
  require('../../miniprogram/pages/weight-track/weight-track')
  const config = getLastPageConfig()
  page = createPage(config)
})

beforeEach(() => {
  page.setData.mockClear()
  page.data.inputWeight = ''
  page.data.latestWeight = null
  page.data.weightChange = null
  page.data.records = []
  page.data.saving = false
})

describe('onWeightInput', () => {
  test('更新输入值', () => {
    page.onWeightInput({ detail: { value: '65.5' } })
    expect(page.data.inputWeight).toBe('65.5')
  })
})

describe('saveWeight', () => {
  test('空输入不发起调用', async () => {
    page.data.inputWeight = ''
    await page.saveWeight()
    expect(callFnMock).not.toHaveBeenCalled()
  })

  test('有效体重保存成功', async () => {
    page.data.inputWeight = '65.5'
    callFnMock.mockResolvedValue({
      result: { code: 0, data: { records: [{ date: '2026-07-29', weight_kg: 65.5 }] } }
    })
    await page.saveWeight()
    expect(page.data.latestWeight).toBe(65.5)
    expect(page.data.inputWeight).toBe('')
    expect(wx.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining('成功') }))
  })

  test('返回多条记录时计算变化值', async () => {
    page.data.inputWeight = '65.5'
    callFnMock.mockResolvedValue({
      result: { code: 0, data: { records: [{ date: '2026-07-20', weight_kg: 64 }, { date: '2026-07-29', weight_kg: 65.5 }] } }
    })
    await page.saveWeight()
    expect(page.data.latestWeight).toBe(65.5)
    expect(page.data.weightChange).toBe(1.5)
  })

  test('API 错误时 toast', async () => {
    page.data.inputWeight = '65'
    callFnMock.mockResolvedValue({ result: { code: 1, message: '缺少参数' } })
    await page.saveWeight()
    expect(wx.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining('缺少参数') }))
  })

  test('网络异常时 toast', async () => {
    page.data.inputWeight = '65'
    callFnMock.mockRejectedValue(new Error('timeout'))
    await page.saveWeight()
    expect(page.data.saving).toBe(false)
    expect(wx.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining('网络异常') }))
  })
})

describe('loadWeightRecords', () => {
  test('无记录时设为 null', async () => {
    const db = wx.cloud.database()
    const col = db.collection('weight_logs')
    col.where = jest.fn(() => ({
      orderBy: jest.fn(() => ({
        limit: jest.fn(() => ({
          get: jest.fn(() => Promise.resolve({ data: [] }))
        }))
      }))
    }))
    await page.loadWeightRecords()
    expect(page.data.latestWeight).toBeNull()
    expect(page.data.weightChange).toBeNull()
  })

  test('单条记录时 latestWeight 正确', async () => {
    const db = wx.cloud.database()
    const col = db.collection('weight_logs')
    col.where = jest.fn(() => ({
      orderBy: jest.fn(() => ({
        limit: jest.fn(() => ({
          get: jest.fn(() => Promise.resolve({ data: [{ date: '2026-07-29', weight_kg: 65 }] }))
        }))
      }))
    }))
    await page.loadWeightRecords()
    expect(page.data.latestWeight).toBe(65)
    expect(page.data.weightChange).toBeNull()
  })

  test('两条记录时计算变化值', async () => {
    const db = wx.cloud.database()
    const col = db.collection('weight_logs')
    col.where = jest.fn(() => ({
      orderBy: jest.fn(() => ({
        limit: jest.fn(() => ({
          get: jest.fn(() => Promise.resolve({ data: [{ date: '2026-07-29', weight_kg: 65.5 }, { date: '2026-07-20', weight_kg: 64 }] }))
        }))
      }))
    }))
    await page.loadWeightRecords()
    expect(page.data.latestWeight).toBe(65.5)
    expect(page.data.weightChange).toBe(1.5)
  })
})
