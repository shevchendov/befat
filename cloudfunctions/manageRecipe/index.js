const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const logger = require('./common/logger')
const { validateRecipe: runValidation } = require('./common/recipeValidation')
const FN = 'manageRecipe'
const ADMIN_OPENID = process.env.ADMIN_OPENID || 'ADMIN_OPENID_PLACEHOLDER'

const DRAFT = 'DRAFT'
const VALIDATING = 'VALIDATING'
const PENDING_REVIEW = 'PENDING_REVIEW'
const APPROVED = 'APPROVED'
const PUBLISHED = 'PUBLISHED'
const ARCHIVED = 'ARCHIVED'
const VALIDATION_FAILED = 'VALIDATION_FAILED'
const REJECTED = 'REJECTED'

const EDITABLE_STATUSES = [DRAFT, VALIDATING, PENDING_REVIEW, APPROVED, VALIDATION_FAILED, REJECTED]

function buildBaseDoc(data) {
  const now = db.serverDate()
  const nutrition = data.nutrition || {}
  const sourceId = data.source_id || 'admin-manual'
  const sourceVersion = data.source_version || 'v1'
  return {
    title: data.title,
    status: DRAFT,
    version: 1,
    nutrition: {
      calorie: Number(nutrition.calorie) || 0,
      protein_g: Number(nutrition.protein_g) || 0,
      fat_g: Number(nutrition.fat_g) || 0,
      carb_g: Number(nutrition.carb_g) || 0,
      fiber_g: Number(nutrition.fiber_g) || 0
    },
    ingredients: data.ingredients || [],
    steps: data.steps || [],
    tags: data.tags || [],
    image_url: data.image_url || '',
    source_id: sourceId,
    source_version: sourceVersion,
    source_url: data.source_url || null,
    generation_job_id: null,
    created_at: now,
    updated_at: now,
    published_at: null,
    archived_at: null,
    nutrition_snapshot: {
      source_id: sourceId,
      source_version: sourceVersion,
      retrieved_at: now,
      calculation_method: 'manual_verified',
      reviewer: null,
      reviewed_at: null
    },
    review_record: null,
    base_nutrition_checked: {},
    versions: []
  }
}

function buildVersionSnapshot(doc, reason) {
  return {
    version: doc.version,
    nutrition: doc.nutrition,
    ingredients: doc.ingredients,
    steps: doc.steps,
    tags: doc.tags,
    timestamp: db.serverDate(),
    reason
  }
}

function toAdminDto(doc) {
  return {
    id: doc._id,
    title: doc.title,
    status: doc.status,
    version: doc.version,
    nutrition: doc.nutrition,
    ingredients: doc.ingredients,
    steps: doc.steps,
    tags: doc.tags,
    image_url: doc.image_url,
    source_id: doc.source_id,
    source_version: doc.source_version,
    source_url: doc.source_url,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
    published_at: doc.published_at,
    archived_at: doc.archived_at,
    nutrition_snapshot: doc.nutrition_snapshot,
    review_record: doc.review_record,
    base_nutrition_checked: doc.base_nutrition_checked,
    versions: doc.versions || []
  }
}

exports.main = async (event, context) => {
  const start = Date.now()
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action } = event
  logger.info(FN, 'invoke', logger.sanitize(event))

  try {
    if (openid !== ADMIN_OPENID) {
      const result = { code: 403, message: '无权限' }
      logger.info(FN, 'return', { code: 403, action, duration: Date.now() - start })
      return result
    }

    const ACTIONS = ['add', 'update', 'delete', 'list', 'review', 'approve', 'archive', 'rollback']
    if (!action || !ACTIONS.includes(action)) {
      const result = { code: 1, message: 'action 参数不合法' }
      logger.info(FN, 'return', { code: 1, action, duration: Date.now() - start })
      return result
    }

    if (action === 'list') {
      const res = await db.collection('recipes').orderBy('created_at', 'desc').limit(100).get()
      const result = { code: 0, message: 'ok', data: { recipes: res.data.map(toAdminDto) } }
      logger.info(FN, 'success', { action, count: res.data.length, duration: Date.now() - start })
      return result
    }

    if (action === 'add') {
      const { title, nutrition, ingredients, steps, tags, image_url, source_id, source_version, source_url } = event
      if (!title || !nutrition || !ingredients || !steps || !tags) {
        const result = { code: 1, message: '缺少必要参数' }
        logger.info(FN, 'return', { code: 1, action, duration: Date.now() - start })
        return result
      }
      const recipeInput = {
        title, nutrition, ingredients, steps, tags,
        source_id: source_id || 'admin-manual',
        source_version: source_version || 'v1'
      }
      const existing = await db.collection('recipes').where({ status: PUBLISHED }).limit(100).get()
      const existingTitles = existing.data.map(r => ({ _id: r._id, title: r.title }))
      const validation = runValidation(recipeInput, existingTitles)

      const doc = buildBaseDoc({ title, nutrition, ingredients, steps, tags, image_url, source_id, source_version, source_url })
      doc.base_nutrition_checked = validation.checks

      if (!validation.valid) {
        const result = { code: 2, message: '食谱校验未通过', errors: validation.errors, checks: validation.checks }
        logger.info(FN, 'return', { code: 2, action, errors: validation.errors, duration: Date.now() - start })
        return result
      }

      const res = await db.collection('recipes').add({ data: doc })
      const result = { code: 0, message: 'ok', data: { recipe_id: res._id, status: DRAFT } }
      logger.info(FN, 'success', { action, recipe_id: res._id, duration: Date.now() - start })
      return result
    }

    if (action === 'update') {
      const { recipe_id, title, nutrition, ingredients, steps, tags, image_url, source_id, source_version, source_url } = event
      if (!recipe_id) {
        const result = { code: 1, message: '缺少 recipe_id' }
        logger.info(FN, 'return', { code: 1, action, duration: Date.now() - start })
        return result
      }
      const existing = await db.collection('recipes').doc(recipe_id).get()
      if (!existing.data) {
        const result = { code: 2, message: '食谱不存在' }
        logger.info(FN, 'return', { code: 2, action, recipe_id, duration: Date.now() - start })
        return result
      }
      const current = existing.data
      if (!EDITABLE_STATUSES.includes(current.status)) {
        const result = { code: 4, message: '当前状态不可编辑' }
        logger.info(FN, 'return', { code: 4, action, status: current.status, duration: Date.now() - start })
        return result
      }

      const updateData = {}
      const candidate = { ...current }
      if (title !== undefined) { updateData.title = title; candidate.title = title }
      if (nutrition !== undefined) {
        const nu = {
          calorie: Number(nutrition.calorie) || 0,
          protein_g: Number(nutrition.protein_g) || 0,
          fat_g: Number(nutrition.fat_g) || 0,
          carb_g: Number(nutrition.carb_g) || 0,
          fiber_g: Number(nutrition.fiber_g) || 0
        }
        updateData.nutrition = nu; candidate.nutrition = nu
      }
      if (ingredients !== undefined) { updateData.ingredients = ingredients; candidate.ingredients = ingredients }
      if (steps !== undefined) { updateData.steps = steps; candidate.steps = steps }
      if (tags !== undefined) { updateData.tags = tags; candidate.tags = tags }
      if (image_url !== undefined) updateData.image_url = image_url
      if (source_id !== undefined) updateData.source_id = source_id
      if (source_version !== undefined) updateData.source_version = source_version
      if (source_url !== undefined) updateData.source_url = source_url

      const validationInput = {
        title: candidate.title,
        nutrition: candidate.nutrition,
        ingredients: candidate.ingredients,
        steps: candidate.steps,
        tags: candidate.tags,
        source_id: candidate.source_id || 'admin-manual',
        source_version: candidate.source_version || 'v1'
      }
      const existingAll = await db.collection('recipes').where({ status: PUBLISHED }).limit(100).get()
      const existingTitles = existingAll.data.filter(r => r._id !== recipe_id).map(r => ({ _id: r._id, title: r.title }))
      const validation = runValidation(validationInput, existingTitles)
      if (!validation.valid) {
        const result = { code: 2, message: '食谱校验未通过', errors: validation.errors, checks: validation.checks }
        logger.info(FN, 'return', { code: 2, action, errors: validation.errors, duration: Date.now() - start })
        return result
      }

      updateData.base_nutrition_checked = validation.checks
      updateData.updated_at = db.serverDate()
      await db.collection('recipes').doc(recipe_id).update({ data: updateData })
      const result = { code: 0, message: 'ok' }
      logger.info(FN, 'success', { action, recipe_id, duration: Date.now() - start })
      return result
    }

    if (action === 'delete') {
      const { recipe_id } = event
      if (!recipe_id) {
        const result = { code: 1, message: '缺少 recipe_id' }
        logger.info(FN, 'return', { code: 1, action, duration: Date.now() - start })
        return result
      }
      const existing = await db.collection('recipes').doc(recipe_id).get()
      if (!existing.data) {
        const result = { code: 2, message: '食谱不存在' }
        logger.info(FN, 'return', { code: 2, action, recipe_id, duration: Date.now() - start })
        return result
      }
      await db.collection('recipes').doc(recipe_id).remove()
      const result = { code: 0, message: 'ok' }
      logger.info(FN, 'success', { action, recipe_id, duration: Date.now() - start })
      return result
    }

    if (action === 'review') {
      const { recipe_id, decision, note } = event
      if (!recipe_id) {
        const result = { code: 1, message: '缺少 recipe_id' }
        logger.info(FN, 'return', { code: 1, action, duration: Date.now() - start })
        return result
      }
      if (!['submit', 'approve', 'reject'].includes(decision)) {
        const result = { code: 1, message: 'decision 必须是 submit/approve/reject' }
        logger.info(FN, 'return', { code: 1, action, duration: Date.now() - start })
        return result
      }
      if (!note || typeof note !== 'string' || note.trim().length === 0) {
        const result = { code: 1, message: 'review note 不能为空' }
        logger.info(FN, 'return', { code: 1, action, duration: Date.now() - start })
        return result
      }

      const existing = await db.collection('recipes').doc(recipe_id).get()
      if (!existing.data) {
        const result = { code: 2, message: '食谱不存在' }
        logger.info(FN, 'return', { code: 2, action, recipe_id, duration: Date.now() - start })
        return result
      }

      let targetStatus
      if (decision === 'submit') {
        if (![DRAFT, VALIDATION_FAILED, REJECTED].includes(existing.data.status)) {
          const result = { code: 4, message: '仅 DRAFT/VALIDATION_FAILED/REJECTED 可提交' }
          logger.info(FN, 'return', { code: 4, action, status: existing.data.status, duration: Date.now() - start })
          return result
        }
        targetStatus = VALIDATING
      } else {
        if (![VALIDATING, PENDING_REVIEW].includes(existing.data.status)) {
          const result = { code: 4, message: '当前状态不能审核' }
          logger.info(FN, 'return', { code: 4, action, status: existing.data.status, duration: Date.now() - start })
          return result
        }
        targetStatus = decision === 'approve' ? APPROVED : REJECTED
      }

      const reviewRecord = {
        reviewer: openid,
        review_type: 'manual',
        action: decision,
        note: note.trim(),
        at: db.serverDate()
      }
      await db.collection('recipes').doc(recipe_id).update({
        data: { status: targetStatus, review_record: reviewRecord, updated_at: db.serverDate() }
      })
      const result = { code: 0, message: 'ok', data: { status: targetStatus } }
      logger.info(FN, 'success', { action, recipe_id, decision, status: targetStatus, duration: Date.now() - start })
      return result
    }

    if (action === 'approve') {
      const { recipe_id, note } = event
      if (!recipe_id) {
        const result = { code: 1, message: '缺少 recipe_id' }
        logger.info(FN, 'return', { code: 1, action, duration: Date.now() - start })
        return result
      }
      if (!note || typeof note !== 'string' || note.trim().length === 0) {
        const result = { code: 1, message: 'approve note 不能为空' }
        logger.info(FN, 'return', { code: 1, action, duration: Date.now() - start })
        return result
      }

      const existing = await db.collection('recipes').doc(recipe_id).get()
      if (!existing.data) {
        const result = { code: 2, message: '食谱不存在' }
        logger.info(FN, 'return', { code: 2, action, recipe_id, duration: Date.now() - start })
        return result
      }
      if (existing.data.status !== APPROVED) {
        const result = { code: 4, message: '仅 APPROVED 状态可发布' }
        logger.info(FN, 'return', { code: 4, action, status: existing.data.status, duration: Date.now() - start })
        return result
      }

      const current = existing.data
      const snapshot = buildVersionSnapshot(current, current.versions && current.versions.length > 0 ? 'content_update' : 'initial_publish')
      const reviewRecord = {
        reviewer: openid,
        review_type: 'manual',
        action: 'approve',
        note: note.trim(),
        at: db.serverDate()
      }
      const updateData = {
        status: PUBLISHED,
        published_at: db.serverDate(),
        archived_at: null,
        updated_at: db.serverDate(),
        review_record: reviewRecord,
        nutrition_snapshot: {
          ...current.nutrition_snapshot,
          reviewer: openid,
          reviewed_at: db.serverDate()
        },
        versions: [...(current.versions || []), snapshot]
      }
      await db.collection('recipes').doc(recipe_id).update({ data: updateData })
      const result = { code: 0, message: 'ok', data: { status: PUBLISHED } }
      logger.info(FN, 'success', { action, recipe_id, duration: Date.now() - start })
      return result
    }

    if (action === 'archive') {
      const { recipe_id } = event
      if (!recipe_id) {
        const result = { code: 1, message: '缺少 recipe_id' }
        logger.info(FN, 'return', { code: 1, action, duration: Date.now() - start })
        return result
      }
      const existing = await db.collection('recipes').doc(recipe_id).get()
      if (!existing.data) {
        const result = { code: 2, message: '食谱不存在' }
        logger.info(FN, 'return', { code: 2, action, recipe_id, duration: Date.now() - start })
        return result
      }
      if (existing.data.status !== PUBLISHED) {
        const result = { code: 4, message: '仅 PUBLISHED 状态可归档' }
        logger.info(FN, 'return', { code: 4, action, status: existing.data.status, duration: Date.now() - start })
        return result
      }
      const reviewRecord = {
        reviewer: openid,
        review_type: 'manual',
        action: 'archive',
        note: 'archive',
        at: db.serverDate()
      }
      await db.collection('recipes').doc(recipe_id).update({
        data: { status: ARCHIVED, archived_at: db.serverDate(), updated_at: db.serverDate(), review_record: reviewRecord }
      })
      const result = { code: 0, message: 'ok', data: { status: ARCHIVED } }
      logger.info(FN, 'success', { action, recipe_id, duration: Date.now() - start })
      return result
    }

    if (action === 'rollback') {
      const { recipe_id, target_version } = event
      if (!recipe_id) {
        const result = { code: 1, message: '缺少 recipe_id' }
        logger.info(FN, 'return', { code: 1, action, duration: Date.now() - start })
        return result
      }
      const existing = await db.collection('recipes').doc(recipe_id).get()
      if (!existing.data) {
        const result = { code: 2, message: '食谱不存在' }
        logger.info(FN, 'return', { code: 2, action, recipe_id, duration: Date.now() - start })
        return result
      }
      const current = existing.data
      const versions = current.versions || []
      const target = versions.find(v => v.version === Number(target_version))
      if (!target) {
        const result = { code: 4, message: '目标版本不存在' }
        logger.info(FN, 'return', { code: 4, action, recipe_id, target_version, duration: Date.now() - start })
        return result
      }
      const maxVersion = versions.reduce((m, v) => Math.max(m, v.version), 0)
      const newVersion = maxVersion + 1
      const reason = 'rollback_from_v' + (current.version || maxVersion) + '_to_v' + target.version
      const snapshot = {
        version: newVersion,
        nutrition: target.nutrition,
        ingredients: target.ingredients,
        steps: target.steps,
        tags: target.tags,
        timestamp: db.serverDate(),
        reason
      }
      const reviewRecord = {
        reviewer: openid,
        review_type: 'manual',
        action: 'rollback',
        note: reason,
        at: db.serverDate()
      }
      const updateData = {
        status: PUBLISHED,
        version: newVersion,
        nutrition: target.nutrition,
        ingredients: target.ingredients,
        steps: target.steps,
        tags: target.tags,
        published_at: db.serverDate(),
        archived_at: null,
        updated_at: db.serverDate(),
        review_record: reviewRecord,
        versions: [...versions, snapshot]
      }
      await db.collection('recipes').doc(recipe_id).update({ data: updateData })
      const result = { code: 0, message: 'ok', data: { status: PUBLISHED, version: newVersion } }
      logger.info(FN, 'success', { action, recipe_id, target_version, new_version: newVersion, duration: Date.now() - start })
      return result
    }
  } catch (err) {
    logger.error(FN, 'crash', { error: err.message, duration: Date.now() - start })
    return { code: -1, message: '服务器内部错误' }
  }
}
