const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const NUTRITION_MAP = {
  '花生酱香蕉吐司': { calorie: 407, protein_g: 13 },
  '牛油果鸡蛋三明治': { calorie: 446, protein_g: 23 },
  '牛奶燕麦粥': { calorie: 453, protein_g: 16 },
  '蛋炒饭升级版': { calorie: 646, protein_g: 42 },
  '红烧牛腩面': { calorie: 772, protein_g: 35 },
  '咖喱鸡肉饭': { calorie: 711, protein_g: 30 },
  '麻婆豆腐盖饭': { calorie: 671, protein_g: 32 },
  '番茄牛腩煲': { calorie: 522, protein_g: 35 },
  '芝士焗意面': { calorie: 713, protein_g: 38 },
  '全脂酸奶果昔': { calorie: 354, protein_g: 13 },
  '坚果能量球': { calorie: 401, protein_g: 11 },
  '烤红薯配黄油': { calorie: 308, protein_g: 4 },
  '鸡蛋灌饼加肠': { calorie: 546, protein_g: 22 },
  '土豆炖鸡块': { calorie: 568, protein_g: 36 },
  '芝麻酱拌面': { calorie: 569, protein_g: 19 },
  '日式亲子丼': { calorie: 641, protein_g: 39 },
  '椰香西米露': { calorie: 392, protein_g: 4 },
  '煎饺抱蛋': { calorie: 556, protein_g: 29 },
  '黑椒牛柳意面': { calorie: 676, protein_g: 43 },
  '红豆薏仁牛奶粥': { calorie: 416, protein_g: 16 },
  '煎鸡胸肉沙拉': { calorie: 435, protein_g: 49 },
  '培根芝士可颂': { calorie: 514, protein_g: 20 },
  '板栗烧鸡': { calorie: 648, protein_g: 37 },
  '韩式拌饭': { calorie: 543, protein_g: 26 },
  '核桃红枣糕': { calorie: 215, protein_g: 5 },
  '三文鱼牛油果拌饭': { calorie: 524, protein_g: 27 },
  '花生炖猪脚': { calorie: 660, protein_g: 43 },
  '奶油蘑菇汤配面包': { calorie: 431, protein_g: 9 },
  '芝士蛋饼': { calorie: 573, protein_g: 30 },
  '土豆泥沙拉': { calorie: 280, protein_g: 10 },
  '香菇滑鸡煲仔饭': { calorie: 607, protein_g: 28 },
  '芋泥牛奶': { calorie: 271, protein_g: 10 },
}

exports.main = async (event, context) => {
  const FN = 'migrateRecipesNutrition'
  console.log(JSON.stringify({ fn: FN, action: 'start' }))

  try {
    const total = await db.collection('recipes').count()
    const LIMIT = 100
    let updated = 0
    let skipped = 0
    let page = 0

    while (true) {
      const res = await db.collection('recipes')
        .skip(page * LIMIT)
        .limit(LIMIT)
        .get()

      if (res.data.length === 0) break

      for (const doc of res.data) {
        const title = doc.title
        const nu = NUTRITION_MAP[title]
        if (!nu) {
          console.log(JSON.stringify({ fn: FN, action: 'skip', title, reason: 'not_in_map' }))
          skipped++
          continue
        }
        if (doc.calorie === nu.calorie && doc.protein_g === nu.protein_g) {
          console.log(JSON.stringify({ fn: FN, action: 'skip_unchanged', title }))
          skipped++
          continue
        }
        await db.collection('recipes').doc(doc._id).update({
          data: { calorie: nu.calorie, protein_g: nu.protein_g }
        })
        console.log(JSON.stringify({ fn: FN, action: 'update', title, calorie: nu.calorie, protein_g: nu.protein_g }))
        updated++
      }

      if (res.data.length < LIMIT) break
      page++
    }

    const result = { code: 0, total: total.total, updated, skipped }
    console.log(JSON.stringify({ fn: FN, action: 'done', result }))
    return result
  } catch (err) {
    console.log(JSON.stringify({ fn: FN, action: 'crash', error: err.message }))
    return { code: -1, message: err.message }
  }
}
