const fs = require('fs')
const path = require('path')

const TARGETS = [
  'calcTarget', 'parseFoodLog', 'getDailySummary', 'saveWeightLog',
  'deleteUserData', 'exportUserData', 'checkMealReminder', 'generateRecipeInit',
  'manageRecipe', 'toggleFavorite', 'getFavorites', 'getShareCard', 'getWxacode',
  'recalcTarget', 'updateTargetManual', 'resetUserData'
]

const ROOT = path.resolve(__dirname)
const SRC = path.join(ROOT, 'common')

function main() {
  if (!fs.existsSync(SRC)) {
    console.error('common/ 目录不存在')
    process.exit(1)
  }

  const files = fs.readdirSync(SRC).filter(f => fs.statSync(path.join(SRC, f)).isFile())
  if (files.length === 0) {
    console.log('common/ 下没有文件，无需同步')
    return
  }

  for (const name of TARGETS) {
    const dst = path.join(ROOT, name, 'common')
    if (fs.existsSync(dst)) {
      fs.rmSync(dst, { recursive: true, force: true })
    }
    fs.mkdirSync(dst, { recursive: true })
    for (const f of files) {
      fs.copyFileSync(path.join(SRC, f), path.join(dst, f))
    }
    console.log((name + '/common/').padEnd(26) + files.length + ' 个文件')
  }

  console.log()
  console.log('同步完成，共复制 ' + files.length + ' 个文件到 ' + TARGETS.length + ' 个函数')
}

main()
