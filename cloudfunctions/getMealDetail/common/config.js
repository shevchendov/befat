const logger = require('./logger')

let configCache = null

const SYSTEM_PROMPT = '你是一位专业的中国增重营养师。你的任务是为「吃不胖、想增重」的用户设计安全、可落地的一日三餐。你只输出严格 JSON，不输出任何解释、标题、Markdown 代码块或多余文字。你推荐的每一道菜都必须使用常规熟食烹饪方法，杜绝任何食品安全风险。'

const SYSTEM_PROMPT_LOSE_TIPS = '你是一位专业的中国减脂生活教练。你的任务是为「想减脂、控体重」的用户，结合当天天气与季节，输出 3 条实操性强、可立即执行的生活减脂建议。你只输出严格 JSON，不输出任何解释、标题、Markdown 代码块或多余文字。建议必须安全、科学、健康，不得涉及极端节食、药物、催吐等危险行为。'

const DAILY_MENU_PROMPT = `今天是 {date}。请为增重人群设计一日增重食谱的「概览」，包含 4 餐：早餐(breakfast)、午餐(lunch)、加餐(snack)、晚餐(dinner)。

【安全食材池】你只能从以下食材中组合菜品，严禁使用池外任何食材：
{ingredients}

【强约束】
1. 每一道菜的食材必须全部来自上述食材池，禁止使用生僻食材、野生动物、河豚、野菌等
2. 严禁任何生食肉类/生食水产（如生肉、刺身、生鱼片），所有肉类鱼类必须完全煮熟
3. 只能采用常规熟食烹饪（炒/煮/蒸/炖/烤/煎）
4. 绝不出现"相克""解毒""治疗"等无科学依据的说法
5. 每次生成的 4 餐菜品名称与核心食材必须具有极高的多样性，严禁重复推荐前几轮已经出现过的雷同菜品（例如：避免连续出现燕麦奶昔或牛肉面，鼓励交替使用全麦面包、红薯、鸡胸肉、鲈鱼、虾等其他安全食材池内的组合）

每餐概览必须包含以下字段（不要 ingredients、不要 steps）：
- meal_type: breakfast/lunch/snack/dinner
- title: 菜品名称（中文，有辨识度的修饰，避免裸词如"水煮蛋"）
- calorie: 该餐热量估算值(kcal，整数)
- protein_g: 该餐蛋白质估算值(g，可含 1 位小数)

严格输出以下 JSON 结构，不要计算 total_calorie 或 total_protein_g：

{"meals":[{"meal_type":"breakfast","title":"...","calorie":0,"protein_g":0},{"meal_type":"lunch","title":"...","calorie":0,"protein_g":0},{"meal_type":"snack","title":"...","calorie":0,"protein_g":0},{"meal_type":"dinner","title":"...","calorie":0,"protein_g":0}]}

约束：
1. 4 餐必须齐全，meal_type 依次为 breakfast/lunch/snack/dinner
2. 每餐 calorie 在 150~900 之间（加餐 snack 可放宽至 80~900），protein_g 在 0~80 之间
3. 高热量、高蛋白，偏增重导向，但食材常见、可落地
4. 不要输出任何数学总和，总和由后端计算
只返回 JSON 本体。`

const DAILY_MENU_TIPS_PROMPT_LOSE = `今天是 {date}。请为减脂人群提供 3 条贴合当天天气与季节的实操性减脂生活建议（例：多喝水、餐前饮水、饭后快走、规律作息、饮食清淡等）。

【强约束】
1. 只给正向、健康、可每天执行的小建议，避免极端节食、药物、催吐等危险做法
2. 建议要具体、有画面感、可量化（如"每天喝够 1500ml 水"而非"多喝水"）
3. 3 条建议主题应错开（饮水/运动/作息/饮食结构等），避免雷同
4. 每条建议要简短、口语化、温暖鼓励，不贩卖焦虑
5. 结合当前季节气候（如天冷提醒保暖代谢、天热提醒补水），使建议有当日感

严格输出以下 JSON 结构：

{"tips":[{"title":"建议标题","content":"建议具体内容"},{"title":"建议标题","content":"建议具体内容"},{"title":"建议标题","content":"建议具体内容"}]}

约束：
1. tips 必须恰好 3 条，每条都有 title 与 content 两个字段，均不能为空
2. title 简短（8~16 字），content 为一句话（30~80 字）
3. 只返回 JSON 本体。`

const MEAL_DETAIL_PROMPT = `请为以下菜品补充具体食材与烹饪步骤：
- 菜名：{title}
- 热量：{calorie} kcal
- 蛋白质：{protein} g

【安全食材池】食材必须全部来自以下池，严禁池外食材：
{ingredients}

【强约束】
1. 食材必须全部来自安全食材池，肉类鱼类必须完全煮熟，采用常规熟食烹饪
2. 反推的食材份量应使总热量尽量接近 {calorie} kcal、蛋白质尽量接近 {protein} g
3. 绝不出现"相克""解毒""治疗"等无科学依据的说法

只返回 JSON（ingredients 为"食材名 份量"字符串数组，steps 为 2~3 步极简步骤）：
{"ingredients":["食材 份量","食材 份量"],"steps":["步骤1","步骤2","步骤3"]}`

const LOCAL_FALLBACK_CONFIG = {
  prompts: {
    daily_menu: DAILY_MENU_PROMPT,
    meal_detail: MEAL_DETAIL_PROMPT
  },
  ingredient_whitelist: [
    '米饭', '糙米', '全麦面包', '燕麦', '面条', '馒头', '红薯', '土豆', '玉米', '小米',
    '鸡蛋', '鸡胸肉', '鸡腿肉', '猪瘦肉', '牛瘦肉', '鲈鱼', '草鱼', '虾', '豆腐', '牛奶', '无糖酸奶', '原味奶酪',
    '番茄', '青菜', '西兰花', '胡萝卜', '菠菜', '生菜', '青椒', '黄瓜', '蘑菇', '南瓜',
    '香蕉', '苹果', '橙子', '梨', '蓝莓', '牛油果',
    '花生', '花生酱', '核桃', '橄榄油', '黄油', '芝麻', '蜂蜜', '盐', '酱油', '黑胡椒', '姜', '蒜', '葱花'
  ],
  blocking_checks: [
    '生肉', '刺身', '生吃', '生食', '生鱼', '毒', '相克', '解药', '治疗', '野生', '河豚', '野菌', '霉变', '变质', '发芽土豆'
  ],
  fallback_menus: [
    { meal_type: 'breakfast', title: '花生酱香蕉全麦吐司', calorie: 480, protein_g: 18, ingredients: ['全麦吐司 2片', '花生酱 1勺', '香蕉 1根'], steps: ['吐司烤至微黄', '抹花生酱', '摆香蕉片'] },
    { meal_type: 'lunch', title: '鸡腿肉蛋炒饭', calorie: 650, protein_g: 32, ingredients: ['鸡腿肉 150g', '米饭 250g', '鸡蛋 2个', '时蔬 1份'], steps: ['鸡腿肉切丁炒熟', '加米饭鸡蛋翻炒', '调味出锅'] },
    { meal_type: 'snack', title: '牛奶坚果燕麦杯', calorie: 180, protein_g: 8, ingredients: ['燕麦 40g', '全脂牛奶 250ml', '坚果 15g'], steps: ['燕麦加牛奶冲泡', '撒坚果'] },
    { meal_type: 'dinner', title: '红烧牛肉面', calorie: 620, protein_g: 28, ingredients: ['牛腩 150g', '面条 200g', '青菜 1把'], steps: ['牛肉炖软', '煮面', '浇牛肉汤'] }
  ],
  fallback_tips_lose: [
    { title: '晨起一杯温水', content: '起床后先喝 500ml 温水，唤醒代谢，帮助身体轻盈启动新一天。' },
    { title: '餐前先喝汤/水', content: '正餐前先喝一碗清汤或一杯水，增强饱腹感，自然减少进食量。' },
    { title: '饭后散步 20 分钟', content: '饭后别急着坐下，慢走 20 分钟，平稳血糖，助力消耗多余热量。' }
  ]
}

function isNonEmptyString(v, minLen) {
  return typeof v === 'string' && v.trim().length >= (minLen || 1)
}

function sanityCheck(config) {
  if (!config || typeof config !== 'object') return false
  const p = config.prompts
  if (!p || typeof p !== 'object') return false
  if (!isNonEmptyString(p.daily_menu, 50) || p.daily_menu.indexOf('{date}') === -1) return false
  if (!isNonEmptyString(p.meal_detail, 50) || p.meal_detail.indexOf('{title}') === -1) return false
  if (!Array.isArray(config.ingredient_whitelist) || config.ingredient_whitelist.length === 0) return false
  if (!config.ingredient_whitelist.every(x => typeof x === 'string' && x.trim())) return false
  if (!Array.isArray(config.blocking_checks)) return false
  if (!Array.isArray(config.fallback_menus) || config.fallback_menus.length === 0) return false
  const types = new Set(config.fallback_menus.map(m => m && m.meal_type))
  if (!['breakfast', 'lunch', 'snack', 'dinner'].every(t => types.has(t))) return false
  return true
}

async function getConfig(db) {
  if (configCache) return configCache

  try {
    const res = await db.collection('system_config').doc('menu_ai_config').get()
    const config = res && res.data
    if (config && sanityCheck(config)) {
      configCache = config
      return configCache
    }
    logger.warn('config', 'invalid system_config, use local fallback')
    return LOCAL_FALLBACK_CONFIG
  } catch (err) {
    logger.warn('config', 'load system_config failed, use local fallback', { error: err.message })
    return LOCAL_FALLBACK_CONFIG
  }
}

function renderPrompt(template, vars) {
  return Object.keys(vars).reduce((s, k) => {
    return s.split('{' + k + '}').join(String(vars[k]))
  }, template)
}

module.exports = { getConfig, renderPrompt, LOCAL_FALLBACK_CONFIG, SYSTEM_PROMPT, SYSTEM_PROMPT_LOSE_TIPS, DAILY_MENU_PROMPT, DAILY_MENU_TIPS_PROMPT_LOSE }