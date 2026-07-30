const logger = require('../../utils/logger')

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
      canvas.width = W * dpr
      canvas.height = H * dpr
      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)

      this.drawBackground(ctx)
      this.drawDecorations(ctx)
      this.drawBrand(ctx)
      this.drawBadge(ctx)
      this.drawRings(ctx)
      this.drawWeightCard(ctx)
      this.drawQuoteCard(ctx)
      this.drawQR(ctx, canvas)
      this.drawFooter(ctx)

      this.canvas = canvas
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
    const rays = [
      { x: 80, y: 80, a: -0.8, l: 60 },
      { x: 80, y: 80, a: 0.3, l: 50 },
      { x: 80, y: 80, a: 1.2, l: 40 },
      { x: 580, y: 320, a: 2.0, l: 45 },
      { x: 580, y: 320, a: -1.8, l: 35 },
      { x: 600, y: 240, a: 2.5, l: 50 },
      { x: 100, y: 380, a: -1.0, l: 40 }
    ]
    ctx.fillStyle = '#FFD23F'
    rays.forEach(function (r) {
      ctx.save()
      ctx.translate(r.x, r.y)
      ctx.rotate(r.a)
      ctx.beginPath()
      ctx.moveTo(-5, 0)
      ctx.lineTo(0, -r.l)
      ctx.lineTo(5, 0)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    })
  },

  drawBrand(ctx) {
    ctx.save()
    ctx.translate(50, 70)
    ctx.rotate(-0.05)

    ctx.font = 'bold 42px sans-serif'
    ctx.fillStyle = '#FFD23F'
    ctx.lineWidth = 4
    ctx.strokeStyle = '#1A1006'
    ctx.strokeText('BE FAT', 0, 0)
    ctx.fillText('BE FAT', 0, 0)

    ctx.font = '24px sans-serif'
    ctx.fillStyle = '#FFF8E7'
    ctx.strokeStyle = '#1A1006'
    ctx.lineWidth = 2
    ctx.strokeText('做大只', 0, 42)
    ctx.fillText('做大只', 0, 42)

    ctx.restore()
  },

  drawBadge(ctx) {
    var d = this.cardData
    var text = '连续 ' + (d.consecutive_days || 0) + ' 天'

    ctx.save()
    ctx.translate(520, 60)
    ctx.rotate(-0.07)

    ctx.fillStyle = '#FFD23F'
    ctx.lineWidth = 4
    ctx.strokeStyle = '#1A1006'
    ctx.beginPath()
    ctx.roundRect(0, 0, 150, 56, 12)
    ctx.fill()
    ctx.stroke()

    ctx.font = 'bold 24px sans-serif'
    ctx.fillStyle = '#1A1006'
    ctx.textAlign = 'center'
    ctx.fillText(text, 75, 38)

    ctx.restore()
  },

  drawRings(ctx) {
    var d = this.cardData
    var calPct = d.target_calorie > 0 ? d.total_calorie / d.target_calorie : 0
    var proPct = d.target_protein > 0 ? d.total_protein_g / d.target_protein : 0

    this.drawOneRing(ctx, 172, 300, 80, Math.min(calPct, 1), '#FFD23F', Math.round(d.total_calorie), String(d.target_calorie), '热量', 'kcal')
    this.drawOneRing(ctx, 518, 300, 80, Math.min(proPct, 1), '#FF6B35', d.total_protein_g, String(d.target_protein) + 'g', '蛋白质', 'g')
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
    ctx.font = 'bold 34px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(value), cx, cy - 10)

    ctx.font = '16px sans-serif'
    ctx.fillStyle = '#FFD23F'
    ctx.fillText('/ ' + targetText, cx, cy + 22)

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
    ctx.beginPath()
    ctx.roundRect(0, 0, 590, 110, 16)
    ctx.fill()

    ctx.font = '20px sans-serif'
    ctx.fillStyle = '#FFD23F'
    ctx.textAlign = 'left'
    ctx.fillText('本周体重', 30, 36)

    var changeText = ''
    if (d.week_weight_change_kg !== 0) {
      changeText = (d.week_weight_change_kg > 0 ? '+' : '') + d.week_weight_change_kg + ' kg'
    } else {
      changeText = '0 kg'
    }
    ctx.font = 'bold 30px sans-serif'
    ctx.fillStyle = d.week_weight_change_kg >= 0 ? '#639922' : '#FF6B35'
    ctx.fillText(changeText, 30, 80)

    if (d.remaining_kg !== null) {
      ctx.font = '20px sans-serif'
      ctx.fillStyle = '#FFD23F'
      ctx.textAlign = 'right'
      ctx.fillText('距目标还差', 560, 36)

      ctx.font = 'bold 30px sans-serif'
      ctx.fillStyle = '#FFF8E7'
      var remain = (d.remaining_kg > 0 ? '+' : '') + d.remaining_kg + ' kg'
      ctx.fillText(remain, 560, 80)
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
    ctx.beginPath()
    ctx.roundRect(0, 0, 590, 100, 16)
    ctx.fill()
    ctx.stroke()

    ctx.font = 'bold 22px sans-serif'
    ctx.fillStyle = '#1A1006'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('今日战绩', 295, 35)
    ctx.font = '20px sans-serif'
    ctx.fillText('"' + quote + '"', 295, 68)

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
      ctx.beginPath()
      ctx.roundRect(-4, -4, 100, 100, 12)
      ctx.fillStyle = '#FFF'
      ctx.fill()
      ctx.stroke()

      ctx.drawImage(img, 6, 6, 80, 80)
      ctx.restore()
    }
    img.onerror = function () {
      logger.warn('qrLoadFail')
    }
    img.src = this.qrTempPath
  },

  drawFooter(ctx) {
    var today = new Date()
    var dateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0')

    ctx.font = '16px sans-serif'
    ctx.fillStyle = '#FFF8E7'
    ctx.textAlign = 'right'
    ctx.fillText(dateStr, W - 50, 770)

    ctx.font = '14px sans-serif'
    ctx.fillStyle = 'rgba(255,248,231,0.5)'
    ctx.textAlign = 'center'
    ctx.fillText('AI生成，仅供参考', W / 2, 810)
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
