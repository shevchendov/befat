const canvasChart = require('../../miniprogram/utils/canvasChart')

function rect(x, y, w, h) { return { x, y, w, h } }

describe('measureYAxisPadding', () => {
  test('返回最大文本宽度 + margin', () => {
    const ctx = { measureText: (t) => ({ width: t.length * 5 }), font: '' }
    expect(canvasChart.measureYAxisPadding(ctx, ['65.00', '70.00', '75.00'], { margin: 16 }))
      .toBe(5 * 5 + 16)
  })

  test('默认 margin 为 16', () => {
    const ctx = { measureText: (t) => ({ width: t.length * 5 }), font: '' }
    expect(canvasChart.measureYAxisPadding(ctx, ['abc'], {})).toBe(3 * 5 + 16)
  })
})

describe('calcXLabelMetrics', () => {
  test('计算投影宽度与底部 padding', () => {
    const ctx = { measureText: (t) => ({ width: t.length * 10 }), font: '' }
    const m = canvasChart.calcXLabelMetrics(ctx, ['07-29', '07-30'], { fontSize: 20 })
    expect(m.maxW).toBe(5 * 10)
    const projected = Math.round(0.7071 * (5 * 10 + 20) + 4)
    expect(m.projectedW).toBe(projected)
    expect(m.halfExtent).toBe(projected / 2)
    expect(m.bottomPadding).toBe(Math.max(60, m.halfExtent * 2 + 20))
  })
})

describe('computeLabelStep', () => {
  test('空间足够返回 1', () => {
    expect(canvasChart.computeLabelStep(100, 40)).toBe(1)
  })

  test('空间不足时按投影宽抽样', () => {
    expect(canvasChart.computeLabelStep(10, 45)).toBe(5)
    expect(canvasChart.computeLabelStep(30, 45)).toBe(2)
  })

  test('临界抖动区（间距略小于投影宽）返回 1', () => {
    expect(canvasChart.computeLabelStep(45, 46)).toBe(1)
    expect(canvasChart.computeLabelStep(45.6, 46)).toBe(1)
  })

  test('投影宽为 0 时返回 1', () => {
    expect(canvasChart.computeLabelStep(10, 0)).toBe(1)
  })
})

describe('rectsOverlap', () => {
  test('重叠时返回 true', () => {
    expect(canvasChart.rectsOverlap(rect(0, 0, 10, 10), rect(5, 5, 10, 10))).toBe(true)
    expect(canvasChart.rectsOverlap(rect(0, 0, 10, 10), rect(10, 10, 5, 5))).toBe(false)
    expect(canvasChart.rectsOverlap(rect(0, 0, 10, 10), rect(-5, 5, 5, 5))).toBe(false)
  })

  test('边界恰好相接视为不重叠', () => {
    expect(canvasChart.rectsOverlap(rect(0, 0, 10, 10), rect(10, 0, 5, 5))).toBe(false)
  })
})

describe('findFirstFreeRect', () => {
  test('返回第一个不重叠的候选', () => {
    const obstacles = [rect(5, 5, 10, 10)]
    const candidates = [rect(0, 0, 8, 8), rect(20, 20, 8, 8)]
    expect(canvasChart.findFirstFreeRect(candidates, obstacles)).toEqual(candidates[1])
  })

  test('全部重叠返回 null', () => {
    const obstacles = [rect(0, 0, 100, 100)]
    expect(canvasChart.findFirstFreeRect([rect(0, 0, 5, 5)], obstacles)).toBeNull()
  })

  test('无障碍时返回第一个', () => {
    const candidates = [rect(1, 2, 3, 4), rect(5, 6, 7, 8)]
    expect(canvasChart.findFirstFreeRect(candidates, [])).toEqual(candidates[0])
  })
})

describe('buildObstacles', () => {
  test('每个数据点生成一个外接矩形', () => {
    const result = canvasChart.buildObstacles([{ x: 100, y: 100 }], { pointRadius: 6, margin: 4 })
    const pointRect = result[0]
    const r = 6 + 4
    expect(pointRect).toEqual({ x: 100 - r, y: 100 - r, w: r * 2, h: r * 2 })
  })

  test('折线段上生成采样障碍', () => {
    const result = canvasChart.buildObstacles(
      [{ x: 0, y: 0 }, { x: 40, y: 0 }],
      { pointRadius: 6, margin: 4, lineWidth: 3, sampleStep: 10 }
    )
    // 点障碍 2 个 + 线段采样 (len/step + 1 = 4/step? 40/10=4 -> 5 个采样)
    expect(result.length).toBe(2 + 5)
  })
})

describe('initCanvas', () => {
  test('设置画布尺寸并 scale', () => {
    const canvas = { width: 0, height: 0, getContext: jest.fn(() => ({ scale: jest.fn() })) }
    global.wx = { getWindowInfo: () => ({ pixelRatio: 3 }) }
    const { ctx, dpr } = canvasChart.initCanvas(canvas, 300, 200)
    expect(canvas.width).toBe(900)
    expect(canvas.height).toBe(600)
    expect(dpr).toBe(3)
    expect(ctx.scale).toHaveBeenCalledWith(3, 3)
  })
})