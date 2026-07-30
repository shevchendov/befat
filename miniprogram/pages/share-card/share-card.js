const logger = require('../../utils/logger')

function rndRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

const QUOTES = [
  '啧啧啧，干饭圈的狠人就是你',
  '别停，再吃一顿就更狠了',
  '今天吃的每一口，都是明天的肌肉',
  '这战绩，我敬你是条汉子',
  '干饭不积极，思想有问题——你没问题',
  '增重路上的卷王，就是你',
  '你只管干饭，剩下的交给时间',
  '看到这战绩，隔壁瘦子都馋哭了',
  '吃饱了才有力气减肥——不对，吃饱了才有力气继续吃',
  '今日战绩：优秀到需要发朋友圈炫耀'
]

const W = 690
const H = 1104
const SCALE = 2

Page({
  data: {
    loading: true,
    error: null
  },

  onLoad() {
    this.loadData()
  },

  async loadData() {
    this.setData({ loading: true, error: null })
    try {
      const cardRes = await wx.cloud.callFunction({ name: 'getShareCard' })
      if (cardRes.result.code !== 0) throw new Error(cardRes.result.message)
      this.cardData = cardRes.result.data
      logger.info('shareCard', 'data loaded', this.cardData)

      this.qrTempPath = null
      try {
        const qrRes = await wx.cloud.callFunction({ name: 'getWxacode' })
        if (qrRes.result.code === 0) {
          const dl = await wx.cloud.downloadFile({ fileID: qrRes.result.data.fileID })
          this.qrTempPath = dl.tempFilePath
        }
      } catch (e) {
        logger.warn('qrGenFail', e.message)
      }

      this.setData({ loading: false })
      wx.nextTick(() => {
        this.drawCard(0)
      })
    } catch (err) {
      logger.error('shareCardLoad', err)
      this.setData({ error: err.message, loading: false })
    }
  },

  drawCard(retry) {
    const query = wx.createSelectorQuery()
    query.select('#shareCanvas').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) {
        if ((retry || 0) < 3) {
          wx.nextTick(() => this.drawCard((retry || 0) + 1))
        } else {
          this.setData({ error: 'Canvas 初始化失败', loading: false })
        }
        return
      }

      const canvas = res[0].node
      const dpr = wx.getSystemInfoSync().pixelRatio
      canvas.width = W * SCALE * dpr
      canvas.height = H * SCALE * dpr
      const ctx = canvas.getContext('2d')
      ctx.scale(dpr * SCALE, dpr * SCALE)

      try { this.drawBackground(ctx) } catch (e) { logger.error('drawBg', e) }
      try { this.drawDecorations(ctx) } catch (e) { logger.error('drawDeco', e) }
      try { this.drawBrand(ctx) } catch (e) { logger.error('drawBrand', e) }
      try { this.drawBadge(ctx) } catch (e) { logger.error('drawBadge', e) }
      try { this.drawRings(ctx) } catch (e) { logger.error('drawRings', e) }
      try { this.drawWeightCard(ctx) } catch (e) { logger.error('drawWeight', e) }
      try { this.drawQuoteCard(ctx) } catch (e) { logger.error('drawQuote', e) }
      try { this.drawFooter(ctx) } catch (e) { logger.error('drawFooter', e) }

      this.canvas = canvas
      try { this.drawQR(ctx, canvas) } catch (e) { logger.error('drawQR', e) }
    })
  },

  drawBackground(ctx) {
    ctx.fillStyle = '#E8471F'
    ctx.fillRect(0, 0, W, H)

    ctx.fillStyle = '#D43D1A'
    ctx.beginPath()
    ctx.arc(120, 100, 260, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#C03515'
    ctx.beginPath()
    ctx.arc(600, 1000, 200, 0, Math.PI * 2)
    ctx.fill()
  },

  drawDecorations(ctx) {
    var rays = [
      { x: 80, y: 80, a: -0.8, l: 110 },
      { x: 75, y: 85, a: 0.3, l: 90 },
      { x: 85, y: 75, a: 1.2, l: 75 },
      { x: 40, y: 120, a: -1.6, l: 60 },
      { x: 570, y: 320, a: 2.0, l: 80 },
      { x: 560, y: 310, a: -1.8, l: 70 },
      { x: 600, y: 240, a: 2.5, l: 90 },
      { x: 620, y: 280, a: -2.6, l: 55 },
      { x: 100, y: 380, a: -1.0, l: 75 },
      { x: 130, y: 200, a: -0.4, l: 60 },
      { x: 540, y: 200, a: -2.3, l: 65 },
      { x: 350, y: 220, a: 0.7, l: 50 }
    ]
    ctx.fillStyle = '#FFD23F'
    rays.forEach(function (r) {
      ctx.save()
      ctx.translate(r.x, r.y)
      ctx.rotate(r.a)
      ctx.beginPath()
      ctx.moveTo(-8, 0)
      ctx.lineTo(0, -r.l)
      ctx.lineTo(8, 0)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    })
  },

  drawBrand(ctx) {
    ctx.save()
    ctx.translate(50, 75)
    ctx.rotate(-0.05)

    ctx.font = 'bold 50px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = '#FFD23F'
    ctx.lineWidth = 5
    ctx.strokeStyle = '#1A1006'
    ctx.strokeText('BE FAT', 0, 0)
    ctx.fillText('BE FAT', 0, 0)

    ctx.font = '28px sans-serif'
    ctx.fillStyle = '#FFF8E7'
    ctx.strokeStyle = '#1A1006'
    ctx.lineWidth = 3
    ctx.strokeText('做大只', 0, 48)
    ctx.fillText('做大只', 0, 48)

    ctx.restore()
  },

  drawBadge(ctx) {
    var d = this.cardData
    var text = '连续 ' + (d.consecutive_days || 0) + ' 天'

    ctx.save()
    ctx.translate(505, 58)
    ctx.rotate(-0.07)

    ctx.fillStyle = '#FFD23F'
    ctx.lineWidth = 4
    ctx.strokeStyle = '#1A1006'
    rndRect(ctx, 0, 0, 175, 66, 14)
    ctx.fill()
    ctx.stroke()

    ctx.font = 'bold 27px sans-serif'
    ctx.fillStyle = '#1A1006'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 87, 33)

    ctx.restore()
  },

  drawRings(ctx) {
    var d = this.cardData
    logger.info('drawRings', 'data', d)
    var calPct = d.target_calorie > 0 ? d.total_calorie / d.target_calorie : 0
    var proPct = d.target_protein > 0 ? d.total_protein_g / d.target_protein : 0

    this.drawOneRing(ctx, 172, 305, 82, Math.min(calPct, 1), '#FFD23F', Math.round(d.total_calorie), String(d.target_calorie), '热量', 'kcal')
    this.drawOneRing(ctx, 518, 305, 82, Math.min(proPct, 1), '#FF6B35', d.total_protein_g, String(d.target_protein) + 'g', '蛋白质', 'g')
  },

  drawOneRing(ctx, cx, cy, radius, pct, color, value, targetText, label, unit) {
    ctx.save()

    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.lineWidth = 14
    ctx.strokeStyle = '#1A1006'
    ctx.stroke()

    if (pct > 0) {
      ctx.beginPath()
      ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct)
      ctx.strokeStyle = color
      ctx.lineWidth = 14
      ctx.lineCap = 'round'
      ctx.stroke()
    }

    ctx.fillStyle = '#FFF8E7'
    ctx.font = 'bold 40px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(value), cx, cy - 12)

    ctx.font = '16px sans-serif'
    ctx.fillStyle = '#FFD23F'
    ctx.fillText('/ ' + targetText, cx, cy + 24)

    ctx.font = '18px sans-serif'
    ctx.fillStyle = '#FFF8E7'
    ctx.fillText(label, cx, cy + 60)

    ctx.restore()
  },

  drawWeightCard(ctx) {
    var d = this.cardData

    ctx.save()
    ctx.translate(50, 430)
    ctx.rotate(0.03)

    ctx.fillStyle = '#1A1006'
    ctx.lineWidth = 4
    ctx.strokeStyle = '#1A1006'
    rndRect(ctx, 0, 0, 590, 110, 16)
    ctx.fill()

    ctx.font = '22px sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#FFD23F'
    ctx.textAlign = 'left'
    ctx.fillText('本周体重', 30, 34)

    var changeText = ''
    if (d.week_weight_change_kg !== 0) {
      changeText = (d.week_weight_change_kg > 0 ? '+' : '') + d.week_weight_change_kg + ' kg'
    } else {
      changeText = '0 kg'
    }
    ctx.font = 'bold 38px sans-serif'
    ctx.fillStyle = d.week_weight_change_kg >= 0 ? '#639922' : '#FF6B35'
    ctx.fillText(changeText, 30, 82)

    if (d.remaining_kg !== null) {
      ctx.font = '22px sans-serif'
      ctx.fillStyle = '#FFD23F'
      ctx.textAlign = 'right'
      ctx.fillText('距目标还差', 560, 34)

      ctx.font = 'bold 38px sans-serif'
      ctx.fillStyle = '#FFF8E7'
      var remain = (d.remaining_kg > 0 ? '+' : '') + d.remaining_kg + ' kg'
      ctx.fillText(remain, 560, 82)
    }

    ctx.restore()
  },

  drawQuoteCard(ctx) {
    var idx = Math.floor(Math.random() * QUOTES.length)
    var quote = QUOTES[idx]

    ctx.save()
    ctx.translate(50, 575)
    ctx.rotate(-0.04)

    ctx.fillStyle = '#FFD23F'
    ctx.lineWidth = 4
    ctx.strokeStyle = '#1A1006'
    rndRect(ctx, 0, 0, 590, 100, 16)
    ctx.fill()
    ctx.stroke()

    ctx.font = 'bold 22px sans-serif'
    ctx.fillStyle = '#1A1006'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('今日战绩', 295, 34)
    ctx.font = '20px sans-serif'
    ctx.fillText('"' + quote + '"', 295, 66)

    ctx.restore()
  },

  drawQR(ctx, canvas) {
    if (!this.qrTempPath) return

    var img = canvas.createImage()
    var self = this
    img.onload = function () {
      ctx.save()
      ctx.translate(50, 720)
      ctx.rotate(-0.03)

      ctx.lineWidth = 4
      ctx.strokeStyle = '#1A1006'
      rndRect(ctx, -4, -4, 100, 100, 12)
      ctx.fillStyle = '#FFF'
      ctx.fill()
      ctx.stroke()

      ctx.drawImage(img, 6, 6, 80, 80)
      ctx.restore()
    }
    img.onerror = function () { logger.warn('qrLoadFail') }
    img.src = this.qrTempPath
  },

  drawFooter(ctx) {
    var today = new Date()
    var dateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0')

    ctx.save()
    ctx.font = '16px sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#FFF8E7'
    ctx.textAlign = 'right'
    ctx.fillText(dateStr, W - 50, 770)

    ctx.font = '14px sans-serif'
    ctx.fillStyle = 'rgba(255,248,231,0.5)'
    ctx.textAlign = 'center'
    ctx.fillText('AI生成，仅供参考', W / 2, 810)
    ctx.restore()
  },

  saveToAlbum() {
    var self = this
    wx.canvasToTempFilePath({
      canvas: this.canvas,
      success: function (res) {
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: function () {
            wx.showToast({ title: '已保存到相册', icon: 'success' })
          },
          fail: function (err) {
            if (err.errMsg.indexOf('auth deny') !== -1 || err.errMsg.indexOf('deny') !== -1) {
              wx.showModal({
                title: '需要权限',
                content: '保存图片需要相册权限，是否前往设置开启？',
                success: function (m) {
                  if (m.confirm) wx.openSetting()
                }
              })
            } else {
              wx.showToast({ title: '保存失败', icon: 'none' })
            }
          }
        })
      },
      fail: function () {
        wx.showToast({ title: '生成图片失败', icon: 'none' })
      }
    })
  },

  goBack() {
    wx.navigateBack()
  }
})
