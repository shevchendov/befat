const fs = require('fs')
const path = require('path')

const changelogPath = path.resolve(__dirname, '..', 'CHANGELOG.md')

let content
try {
  content = fs.readFileSync(changelogPath, 'utf-8')
} catch {
  console.error('ERROR: CHANGELOG.md not found at', changelogPath)
  process.exit(1)
}

const entries = content.split(/(?=^## \[)/m)
const pending = []

for (const entry of entries) {
  if (!entry.includes('⚠️ 待确认：以下云函数')) continue

  const hashLine = entry.match(/^## \[([^\]]+)\] ([a-f0-9]+)/m)
  const date = hashLine ? hashLine[1] : '??'
  const hash = hashLine ? hashLine[2] : '??'

  const subjectLine = entry.match(/\*\*(.+?)\*\*/)
  const subject = subjectLine ? subjectLine[1] : '??'

  const deployMatch = entry.match(/⚠️ 待确认：以下云函数是否已重新部署 → (.+)/)
  const deployTargets = deployMatch ? deployMatch[1].split(',').map(s => s.trim()) : []

  pending.push({ date, hash, subject, deployTargets })
}

if (pending.length === 0) {
  console.log('\n  ✅ 没有待确认的云函数部署记录。\n')
  process.exit(0)
}

console.log('\n' + '='.repeat(60))
console.log('  ⚠️  以下记录标记了云函数需重新部署，请逐条确认')
console.log('='.repeat(60) + '\n')

for (const item of pending) {
  console.log(`  [${item.date}] ${item.hash}`)
  console.log(`  ${item.subject}`)
  console.log(`  需部署: ${item.deployTargets.join(', ')}`)
  console.log(`  状态:   ❓ 待确认`)
  console.log('-'.repeat(60))
}

console.log(`\n  共 ${pending.length} 条待确认记录。`)
console.log('  请登录微信云开发控制台，检查对应云函数是否已重新部署。\n')
