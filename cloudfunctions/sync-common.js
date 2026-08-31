// cloudfunctions/sync-common.js
// 将 cloudfunctions/common/ 下的共享代码，按「文件 → 目标函数」精确分发。
//
// 设计原则：
// 1. 精确映射：只把某个共享文件复制给「真正 require 它的函数」，不产生死文件。
// 2. 非破坏性：只覆盖白名单文件，绝不整目录删除重建，避免误删函数独有的 common 文件
//    （如 getNearbyPoi 的 intent.js/schema.js）。
// 3. 统一源头：cloudfunctions/common/ 是唯一事实来源，任何对共享文件的修改都应先改这里，
//    再跑本脚本分发到各函数。
//
// 维护约定：当某函数新增/移除了对共享文件的依赖，请同步更新下方的 SYNC_MAP。

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname)
const SRC = path.join(ROOT, 'common')

// 共享文件 → 需要它的目标函数列表
const SYNC_MAP = {
  'logger.js': [
    'calcTarget', 'parseFoodLog', 'getDailySummary', 'saveWeightLog',
    'deleteUserData', 'exportUserData', 'checkMealReminder',
    'recalcTarget', 'updateTargetManual', 'resetUserData', 'getStats',
    'getDailyMenu', 'toggleFavoriteRecipe', 'getMealDetail', 'getFavorites',
    'updateFavoriteDetail', 'getNearbyPoi'
  ],
  'deleteHelper.js': ['deleteUserData', 'resetUserData'],
  'targetCalc.js': ['calcTarget', 'recalcTarget', 'updateTargetManual'],
  'config.js': ['getDailyMenu', 'getMealDetail']
}

// 该函数是否有「非共享、独有」的 common 文件（脚本会在同步时跳过，绝不触碰）
function listExtraFiles(name) {
  const dir = path.join(ROOT, name, 'common')
  if (!fs.existsSync(dir)) return []
  const known = new Set(Object.keys(SYNC_MAP))
  return fs.readdirSync(dir)
    .filter(f => fs.statSync(path.join(dir, f)).isFile() && !known.has(f))
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error('common/ 目录不存在')
    process.exit(1)
  }

  let totalCopied = 0
  const touchedFunctions = new Set()

  for (const [file, targets] of Object.entries(SYNC_MAP)) {
    const srcFile = path.join(SRC, file)
    if (!fs.existsSync(srcFile)) {
      console.error('✗ 缺少共享文件 ' + file + '，跳过')
      continue
    }
    for (const name of targets) {
      const dstDir = path.join(ROOT, name, 'common')
      fs.mkdirSync(dstDir, { recursive: true })
      fs.copyFileSync(srcFile, path.join(dstDir, file))
      touchedFunctions.add(name)
      totalCopied++
    }
  }

  // 报告各函数保留下来的独有文件（不受脚本影响）
  console.log('同步完成：' + totalCopied + ' 次复制，涉及 ' + touchedFunctions.size + ' 个函数\n')
  for (const name of touchedFunctions) {
    const extras = listExtraFiles(name)
    if (extras.length > 0) {
      console.log(('  ' + name + '/common/').padEnd(28) + '独有文件：' + extras.join(', '))
    }
  }
}

main()