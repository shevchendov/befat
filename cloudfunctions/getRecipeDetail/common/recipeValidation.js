const NUTRITION_KEYS = ['calorie', 'protein_g', 'fat_g', 'carb_g', 'fiber_g']

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0
}

function normalizeTitle(title) {
  if (typeof title !== 'string') return ''
  return title.trim().replace(/\s+/g, '')
}

function validateIngredients(ingredients) {
  if (!Array.isArray(ingredients) || ingredients.length === 0) return { valid: false, reason: 'ingredients 不能为空' }
  for (let i = 0; i < ingredients.length; i++) {
    const item = ingredients[i]
    if (!item || typeof item !== 'object') return { valid: false, reason: 'ingredients 第 ' + (i + 1) + ' 项不是对象' }
    if (!isNonEmptyString(item.name)) return { valid: false, reason: 'ingredients 第 ' + (i + 1) + ' 项缺少合法 name' }
    if (item.amount != null && typeof item.amount !== 'number') return { valid: false, reason: 'ingredients 第 ' + (i + 1) + ' 项 amount 必须是数字或 null' }
    if (item.unit != null && typeof item.unit !== 'string') return { valid: false, reason: 'ingredients 第 ' + (i + 1) + ' 项 unit 必须是字符串或 null' }
    if (item.food_id != null && typeof item.food_id !== 'string') return { valid: false, reason: 'ingredients 第 ' + (i + 1) + ' 项 food_id 必须是字符串或 null' }
    if (item.note != null && typeof item.note !== 'string') return { valid: false, reason: 'ingredients 第 ' + (i + 1) + ' 项 note 必须是字符串或 null' }
  }
  return { valid: true }
}

function validateSteps(steps) {
  if (!Array.isArray(steps) || steps.length === 0) return { valid: false, reason: 'steps 不能为空' }
  if (!steps.every(isNonEmptyString)) return { valid: false, reason: 'steps 必须是非空字符串数组' }
  return { valid: true }
}

function validateTags(tags) {
  if (!Array.isArray(tags)) return { valid: false, reason: 'tags 必须是数组' }
  if (!tags.every(isNonEmptyString)) return { valid: false, reason: 'tags 必须是非空字符串数组' }
  return { valid: true }
}

function validateNutrition(nutrition) {
  if (!nutrition || typeof nutrition !== 'object') {
    return { valid: false, reason: 'nutrition 缺失' }
  }
  const calorie = Number(nutrition.calorie)
  const protein = Number(nutrition.protein_g)
  if (!Number.isFinite(calorie) || calorie <= 0) return { valid: false, reason: 'calorie 必须 > 0' }
  if (calorie > 2000) return { valid: false, reason: 'calorie 不能超过 2000' }
  if (!Number.isFinite(protein) || protein < 0) return { valid: false, reason: 'protein_g 必须 >= 0' }
  if (protein > 200) return { valid: false, reason: 'protein_g 不能超过 200' }
  return { valid: true }
}

function validateSource(sourceId, sourceVersion) {
  if (!isNonEmptyString(sourceId)) return { valid: false, reason: 'source_id 不能为空' }
  if (!isNonEmptyString(sourceVersion)) return { valid: false, reason: 'source_version 不能为空' }
  return { valid: true }
}

function buildChecks(recipe, duplicateOfId) {
  const nutrition = recipe && recipe.nutrition
  const calorie = nutrition ? Number(nutrition.calorie) : NaN
  const protein = nutrition ? Number(nutrition.protein_g) : NaN
  const ingredients = recipe && recipe.ingredients
  const ingValid = Array.isArray(ingredients) && ingredients.length > 0 && validateIngredients(ingredients).valid

  return {
    calorie_in_range: Number.isFinite(calorie) && calorie > 0 && calorie <= 2000,
    protein_in_reasonable: Number.isFinite(protein) && protein >= 0 && protein <= 200,
    missing_nutrition: !nutrition || !Number.isFinite(calorie) || !Number.isFinite(protein),
    ingredients_valid: ingValid,
    duplicate_of_id: duplicateOfId || null
  }
}

function validateRecipe(recipe, existingTitles) {
  const errors = []
  const checks = buildChecks(recipe, null)

  if (!recipe || typeof recipe !== 'object') {
    return { valid: false, errors: ['recipe 不能为空'], checks }
  }

  if (!isNonEmptyString(recipe.title)) errors.push('title 不能为空')

  const ing = validateIngredients(recipe.ingredients)
  if (!ing.valid) errors.push(ing.reason)

  const step = validateSteps(recipe.steps)
  if (!step.valid) errors.push(step.reason)

  const tag = validateTags(recipe.tags)
  if (!tag.valid) errors.push(tag.reason)

  const nu = validateNutrition(recipe.nutrition)
  if (!nu.valid) errors.push(nu.reason)

  const src = validateSource(recipe.source_id, recipe.source_version)
  if (!src.valid) errors.push(src.reason)

  let duplicateOfId = null
  if (checks.calorie_in_range && checks.protein_in_reasonable && existingTitles && Array.isArray(existingTitles)) {
    const normalized = normalizeTitle(recipe.title)
    if (normalized) {
      const hit = existingTitles.find(t => normalizeTitle(t.title) === normalized)
      if (hit) duplicateOfId = hit._id || hit.id || null
    }
  }

  const finalChecks = buildChecks(recipe, duplicateOfId)
  if (duplicateOfId) errors.push('与现有食谱重复')

  return { valid: errors.length === 0, errors, checks: finalChecks }
}

module.exports = { validateRecipe, NUTRITION_KEYS }
