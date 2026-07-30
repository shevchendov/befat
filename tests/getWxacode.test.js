const mockFs = { writeFileSync: jest.fn() }
mockFs.createReadStream = jest.fn(() => 'mock-stream')

jest.mock('fs', () => mockFs)

const getWxacode = require('../cloudfunctions/getWxacode/index')

beforeEach(() => {
  const cloud = require('wx-server-sdk')
  cloud.openapi.wxacode.getUnlimited.mockClear()
  cloud.uploadFile.mockClear()
  mockFs.writeFileSync.mockClear()
  mockFs.createReadStream.mockClear()
})

describe('getWxacode.main', () => {
  test('generates wxacode and uploads successfully', async () => {
    const cloud = require('wx-server-sdk')
    cloud.openapi.wxacode.getUnlimited.mockResolvedValue({
      buffer: Buffer.from('fake-png-data')
    })
    cloud.uploadFile.mockResolvedValue({
      fileID: 'cloud://test/wxacode/test-openid.png'
    })

    const res = await getWxacode.main({}, {})
    expect(res.code).toBe(0)
    expect(res.data.fileID).toBe('cloud://test/wxacode/test-openid.png')
    expect(cloud.openapi.wxacode.getUnlimited).toHaveBeenCalledWith({
      scene: 'test-openid',
      page: 'pages/index/index',
      checkPath: false,
      envVersion: 'release'
    })
    expect(mockFs.writeFileSync).toHaveBeenCalled()
    expect(cloud.uploadFile).toHaveBeenCalledWith({
      cloudPath: 'wxacode/test-openid.png',
      fileContent: 'mock-stream'
    })
  })

  test('returns error code -1 when wxacode generation fails', async () => {
    const cloud = require('wx-server-sdk')
    cloud.openapi.wxacode.getUnlimited.mockRejectedValue(new Error('api error'))

    const res = await getWxacode.main({}, {})
    expect(res.code).toBe(-1)
    expect(res.message).toBe('生成小程序码失败')
  })

  test('returns error code -1 when upload fails', async () => {
    const cloud = require('wx-server-sdk')
    cloud.openapi.wxacode.getUnlimited.mockResolvedValue({
      buffer: Buffer.from('fake-png-data')
    })
    cloud.uploadFile.mockRejectedValue(new Error('upload error'))

    const res = await getWxacode.main({}, {})
    expect(res.code).toBe(-1)
    expect(res.message).toBe('生成小程序码失败')
  })
})
