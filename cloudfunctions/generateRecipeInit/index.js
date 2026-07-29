const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const logger = require('./common/logger')
const FN = 'generateRecipeInit'

const RECIPES = [
  { title: '花生酱香蕉吐司', calorie: 407, protein_g: 13, ingredients: ['全麦吐司 2片', '花生酱 2汤匙(30g)', '香蕉 1根', '蜂蜜 1茶匙'], steps: ['吐司烤至微焦', '涂抹花生酱', '香蕉切片铺上', '淋上蜂蜜'], tags: ['早餐', '快手'] },
  { title: '牛油果鸡蛋三明治', calorie: 446, protein_g: 23, ingredients: ['全麦面包 2片', '牛油果 1/2个', '鸡蛋 2个', '芝士片 1片'], steps: ['鸡蛋煎熟', '牛油果切半挖出果肉压成泥', '面包依次放上牛油果泥、芝士片、煎蛋', '合拢对切'], tags: ['早餐', '高蛋白'] },
  { title: '牛奶燕麦粥', calorie: 453, protein_g: 16, ingredients: ['燕麦片 40g', '全脂牛奶 250ml', '坚果碎 15g', '蜂蜜 1汤匙', '葡萄干 10g'], steps: ['牛奶煮至微沸', '加入燕麦片小火煮5分钟', '盛碗后撒上坚果碎和葡萄干', '淋上蜂蜜'], tags: ['早餐', '快手'] },
  { title: '蛋炒饭升级版', calorie: 646, protein_g: 42, ingredients: ['米饭 220g', '鸡蛋 2个', '鸡胸肉 70g', '青豆 25g', '胡萝卜丁 25g', '油 1汤匙'], steps: ['鸡蛋打散炒熟盛出', '鸡胸肉切丁炒至变色', '加入青豆胡萝卜翻炒', '加入米饭和鸡蛋翻炒均匀', '加盐调味'], tags: ['午餐', '晚餐', '高蛋白'] },
  { title: '红烧牛腩面', calorie: 772, protein_g: 35, ingredients: ['牛腩 130g', '面条 120g', '土豆 1个', '胡萝卜 1/2根', '八角 2个', '生抽 2汤匙', '老抽 1汤匙'], steps: ['牛腩切块焯水', '热油炒糖色后加入牛腩翻炒', '加入八角和酱油翻炒', '加水没过牛腩炖1小时', '加入土豆胡萝卜续炖30分钟', '另起锅煮面，浇上牛腩'], tags: ['午餐', '晚餐', '高蛋白'] },
  { title: '咖喱鸡肉饭', calorie: 711, protein_g: 30, ingredients: ['鸡腿肉 130g', '洋葱 1/4个', '土豆 1个', '胡萝卜 1/2根', '咖喱块 35g', '米饭 180g'], steps: ['鸡肉切块煎至金黄', '洋葱炒香加入土豆胡萝卜翻炒', '加水煮10分钟至蔬菜软烂', '加入咖喱块搅拌融化', '小火煮5分钟至浓稠', '浇在米饭上'], tags: ['午餐', '晚餐'] },
  { title: '麻婆豆腐盖饭', calorie: 671, protein_g: 32, ingredients: ['豆腐 200g', '猪肉末 60g', '豆瓣酱 1汤匙', '花椒粉 1茶匙', '米饭 180g', '葱花 适量'], steps: ['豆腐切块焯水', '肉末炒散加入豆瓣酱炒出红油', '加入适量水煮开', '放入豆腐轻轻推匀煮5分钟', '勾芡撒花椒粉和葱花', '浇在米饭上'], tags: ['午餐', '晚餐'] },
  { title: '番茄牛腩煲', calorie: 522, protein_g: 35, ingredients: ['牛腩 180g', '番茄 3个', '土豆 1个', '洋葱 1/2个', '番茄酱 2汤匙', '姜片 3片'], steps: ['牛腩切块焯水', '番茄切块炒出汁', '加入牛腩番茄酱和姜片', '加水没过食材大火烧开转小火炖1小时', '加入土豆续炖20分钟', '加盐调味'], tags: ['晚餐', '高蛋白'] },
  { title: '芝士焗意面', calorie: 713, protein_g: 38, ingredients: ['意面 90g', '牛肉末 80g', '番茄酱 50ml', '马苏里拉芝士 35g', '洋葱 1/4个', '黄油 10g'], steps: ['意面煮至八分熟', '黄油炒香洋葱加入肉末炒散', '加入番茄酱煮成肉酱', '意面与肉酱拌匀放入烤碗', '铺上芝士碎', '烤箱200度烤15分钟'], tags: ['晚餐', '高蛋白'] },
  { title: '全脂酸奶果昔', calorie: 354, protein_g: 13, ingredients: ['全脂酸奶 180ml', '香蕉 1根', '花生酱 1汤匙', '牛奶 80ml', '蜂蜜 1汤匙'], steps: ['所有材料放入搅拌机', '打至顺滑', '倒入杯中即可'], tags: ['加餐', '快手'] },
  { title: '坚果能量球', calorie: 401, protein_g: 11, ingredients: ['即食燕麦 40g', '花生酱 20g', '蜂蜜 12g', '蔓越莓干 12g', '黑巧克力碎 10g'], steps: ['所有材料混合均匀', '搓成乒乓球大小的球', '冷藏30分钟定型'], tags: ['加餐', '零食'] },
  { title: '烤红薯配黄油', calorie: 308, protein_g: 4, ingredients: ['红薯 1个(约250g)', '黄油 10g', '肉桂粉 少许', '蜂蜜 1茶匙'], steps: ['红薯洗净擦干', '烤箱200度烤45分钟至软', '切开抹上黄油', '撒肉桂粉淋蜂蜜'], tags: ['加餐', '快手'] },
  { title: '鸡蛋灌饼加肠', calorie: 546, protein_g: 22, ingredients: ['面粉 70g', '鸡蛋 1.5个', '火腿肠 1根', '生菜 2片', '油 1汤匙'], steps: ['面粉加水和成面团擀成薄饼', '平底锅刷油放入饼皮', '饼鼓起后戳破倒入蛋液', '翻面煎至金黄', '卷入火腿肠和生菜'], tags: ['早餐', '午餐'] },
  { title: '土豆炖鸡块', calorie: 568, protein_g: 36, ingredients: ['鸡腿 2个', '土豆 2个', '青椒 1个', '姜蒜 适量', '生抽 2汤匙', '老抽 1汤匙'], steps: ['鸡腿剁块焯水', '热油爆香姜蒜', '加入鸡块翻炒至金黄', '加入土豆块和酱油翻炒', '加水没过食材炖20分钟', '加入青椒翻炒收汁'], tags: ['午餐', '晚餐', '高蛋白'] },
  { title: '芝麻酱拌面', calorie: 569, protein_g: 19, ingredients: ['面条 130g', '芝麻酱 2汤匙(30g)', '黄瓜 1/2根', '醋 1汤匙', '生抽 1汤匙', '蒜末 适量'], steps: ['芝麻酱加温水调开', '加入醋、生抽、蒜末调匀', '面条煮熟过凉水', '黄瓜切丝', '面条浇上芝麻酱撒黄瓜丝'], tags: ['午餐', '快手'] },
  { title: '日式亲子丼', calorie: 641, protein_g: 39, ingredients: ['鸡腿肉 130g', '鸡蛋 2个', '洋葱 1/2个', '米饭 180g', '味醂 2汤匙', '酱油 2汤匙'], steps: ['鸡腿肉切块煎至金黄', '洋葱切丝与鸡肉同炒', '加入味醂和酱油煮3分钟', '鸡蛋打散淋在表面', '半熟时关火浇在米饭上'], tags: ['午餐', '晚餐', '高蛋白'] },
  { title: '椰香西米露', calorie: 392, protein_g: 4, ingredients: ['西米 25g', '椰浆 80ml', '牛奶 60ml', '糖 12g', '芒果 1个'], steps: ['西米煮至透明过冷水', '椰浆牛奶加糖小火加热', '芒果切丁', '西米放入碗中倒入椰奶', '放上芒果丁'], tags: ['加餐', '甜品'] },
  { title: '煎饺抱蛋', calorie: 556, protein_g: 29, ingredients: ['速冻饺子 12个', '鸡蛋 2个', '葱花 适量', '油 1汤匙', '芝麻 少许'], steps: ['平底锅热油放入饺子', '煎至底面金黄', '加水没过饺子一半盖盖焖5分钟', '鸡蛋打散沿锅边倒入', '蛋液凝固后撒葱花芝麻'], tags: ['早餐', '晚餐'] },
  { title: '黑椒牛柳意面', calorie: 676, protein_g: 43, ingredients: ['意面 100g', '牛里脊 100g', '青椒 1个', '洋葱 1/4个', '黑胡椒酱 2汤匙', '黄油 10g'], steps: ['牛里脊切条用黑胡椒和料酒腌制', '意面煮至八分熟', '黄油融化炒香洋葱', '加入牛柳炒至变色', '加入青椒和黑胡椒酱翻炒', '加入意面拌匀'], tags: ['晚餐', '高蛋白'] },
  { title: '红豆薏仁牛奶粥', calorie: 416, protein_g: 16, ingredients: ['红豆 30g', '薏仁 30g', '全脂牛奶 180ml', '冰糖 12g', '糯米 15g'], steps: ['红豆薏仁提前泡4小时', '加糯米和水煮至软烂', '加入牛奶和冰糖', '小火搅拌至冰糖融化'], tags: ['早餐', '加餐'] },
  { title: '煎鸡胸肉沙拉', calorie: 435, protein_g: 49, ingredients: ['鸡胸肉 130g', '混合生菜 60g', '圣女果 5个', '鸡蛋 1个', '牛油果 1/4个', '油醋汁 2汤匙'], steps: ['鸡胸肉用盐和黑胡椒腌制', '煎至两面金黄熟透切片', '鸡蛋煮熟对切', '所有蔬菜摆盘', '放上鸡胸肉和鸡蛋', '淋上油醋汁'], tags: ['午餐', '晚餐', '高蛋白'] },
  { title: '培根芝士可颂', calorie: 514, protein_g: 20, ingredients: ['可颂面包 1个', '培根 2片', '芝士片 1片', '生菜 2片', '蛋黄酱 1汤匙'], steps: ['培根煎至焦脆', '可颂面包横切开', '依次放上生菜、培根、芝士片', '挤上蛋黄酱', '合上可颂即可'], tags: ['早餐', '快手'] },
  { title: '板栗烧鸡', calorie: 648, protein_g: 37, ingredients: ['鸡块 200g', '去皮板栗 80g', '姜片 3片', '生抽 2汤匙', '老抽 1汤匙', '冰糖 10g'], steps: ['鸡块焯水沥干', '热油炒糖色加入鸡块翻炒', '加入姜片酱油翻炒上色', '加入板栗和开水没过食材', '小火炖30分钟收汁'], tags: ['晚餐', '高蛋白'] },
  { title: '韩式拌饭', calorie: 543, protein_g: 26, ingredients: ['米饭 180g', '牛肉末 60g', '菠菜 40g', '胡萝卜丝 30g', '豆芽 40g', '鸡蛋 1个', '韩式辣酱 2汤匙'], steps: ['牛肉末加酱油炒熟', '菠菜胡萝卜豆芽分别焯水', '煎一个太阳蛋', '碗中盛饭摆上配菜和煎蛋', '挤上韩式辣酱拌匀'], tags: ['午餐', '晚餐'] },
  { title: '核桃红枣糕', calorie: 215, protein_g: 5, ingredients: ['红枣 100g', '核桃仁 50g', '红糖 40g', '低筋面粉 150g', '鸡蛋 2个', '油 25ml'], steps: ['红枣去核加水煮软打成泥', '鸡蛋加红糖打发', '加入枣泥和油拌匀', '筛入面粉翻拌', '加入核桃碎', '倒入模具170度烤30分钟'], tags: ['加餐', '零食'] },
  { title: '三文鱼牛油果拌饭', calorie: 524, protein_g: 27, ingredients: ['三文鱼 100g', '牛油果 1/2个', '米饭 180g', '酱油 1汤匙', '芥末 少许', '海苔碎 适量'], steps: ['三文鱼切丁用酱油腌制', '牛油果切丁', '米饭盛碗', '铺上三文鱼和牛油果', '撒海苔碎', '淋酱油和芥末拌匀'], tags: ['午餐', '晚餐', '高蛋白'] },
  { title: '花生炖猪脚', calorie: 660, protein_g: 43, ingredients: ['猪脚 500g', '花生 35g', '姜片 5片', '八角 2个', '生抽 3汤匙', '老抽 1汤匙', '冰糖 20g'], steps: ['猪脚焯水去腥', '热油炒糖色加入猪脚翻炒', '加入姜片八角酱油', '加入花生和开水', '大火烧开转小火炖1.5小时', '收汁至浓稠'], tags: ['晚餐', '高蛋白'] },
  { title: '奶油蘑菇汤配面包', calorie: 431, protein_g: 9, ingredients: ['口蘑 70g', '洋葱 1/4个', '黄油 12g', '淡奶油 50ml', '面粉 12g', '法棍面包 2片'], steps: ['黄油融化炒香洋葱和蘑菇片', '加入面粉翻炒', '分次加入清水搅匀煮开', '加入淡奶油煮5分钟', '加盐和黑胡椒调味', '法棍切片烤脆蘸食'], tags: ['晚餐', '加餐'] },
  { title: '芝士蛋饼', calorie: 573, protein_g: 30, ingredients: ['面粉 60g', '鸡蛋 2个', '芝士碎 25g', '火腿丁 15g', '牛奶 60ml', '油 1汤匙'], steps: ['面粉加鸡蛋牛奶调成糊', '平底锅刷油倒入面糊', '撒上火腿丁和芝士碎', '底部凝固后翻面', '煎至两面金黄'], tags: ['早餐', '快手'] },
  { title: '土豆泥沙拉', calorie: 280, protein_g: 10, ingredients: ['土豆 1.5个(约130g)', '鸡蛋 1个', '黄瓜丁 20g', '沙拉酱 2汤匙', '牛奶 20ml', '黑胡椒 少许'], steps: ['土豆蒸熟压成泥', '鸡蛋煮熟切丁', '所有材料混合', '加入沙拉酱牛奶拌匀', '撒黑胡椒调味'], tags: ['加餐', '快手'] },
  { title: '香菇滑鸡煲仔饭', calorie: 607, protein_g: 28, ingredients: ['鸡腿肉 130g', '干香菇 5朵', '大米 90g', '姜丝 适量', '生抽 2汤匙', '蚝油 1汤匙'], steps: ['香菇泡发切片', '鸡肉切块用生抽蚝油姜丝腌制', '大米淘洗加水煮至八分熟', '铺上鸡肉和香菇', '沿锅边淋油小火焖15分钟', '关火再焖5分钟'], tags: ['午餐', '晚餐', '高蛋白'] },
  { title: '芋泥牛奶', calorie: 271, protein_g: 10, ingredients: ['芋头 100g', '全脂牛奶 200ml', '炼乳 2汤匙', '紫薯粉 1茶匙(可选)'], steps: ['芋头蒸熟压成泥', '牛奶加热', '芋泥炼乳和牛奶一起搅打均匀', '倒入杯中即可'], tags: ['加餐', '快手'] }
]

exports.main = async (event, context) => {
  const start = Date.now()
  logger.info(FN, 'invoke', { force: !!event.force })

  try {
    if (event.force) {
      const NUTRITION_MAP = {}
      for (const r of RECIPES) NUTRITION_MAP[r.title] = { calorie: r.calorie, protein_g: r.protein_g }

      const LIMIT = 100
      let updated = 0; let skipped = 0; let page = 0

      while (true) {
        const res = await db.collection('recipes').skip(page * LIMIT).limit(LIMIT).get()
        if (res.data.length === 0) break

        for (const doc of res.data) {
          const nu = NUTRITION_MAP[doc.title]
          if (!nu || (doc.calorie === nu.calorie && doc.protein_g === nu.protein_g)) {
            skipped++; continue
          }
          await db.collection('recipes').doc(doc._id).update({
            data: { calorie: nu.calorie, protein_g: nu.protein_g }
          })
          updated++
        }
        if (res.data.length < LIMIT) break
        page++
      }

      const result = { code: 0, message: `已更新 ${updated} 条，跳过 ${skipped} 条`, updated, skipped }
      logger.info(FN, 'force_done', result)
      return result
    }

    const existing = await db.collection('recipes').count()
    if (existing.total > 0) {
      const result = { code: 0, message: '食谱数据已存在，跳过初始化', count: existing.total }
      logger.info(FN, 'skipped', { existing: existing.total, duration: Date.now() - start })
      return result
    }

    for (let i = 0; i < RECIPES.length; i++) {
      await db.collection('recipes').add({
        data: { ...RECIPES[i], created_at: db.serverDate() }
      })
    }

    const result = { code: 0, message: '食谱数据初始化完成', count: RECIPES.length }
    logger.info(FN, 'success', { count: RECIPES.length, duration: Date.now() - start })
    return result
  } catch (err) {
    logger.error(FN, 'crash', { error: err.message, duration: Date.now() - start })
    return { code: -1, message: '初始化失败' }
  }
}
