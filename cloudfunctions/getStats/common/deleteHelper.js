// 分页删除某 openid 下某集合的全部文档（每批 100，避免一次性拉全量超限）
// 供 deleteUserData / resetUserData 共用
async function batchDeleteByOpenid(db, collectionName, openid) {
  const limit = 100
  let hasMore = true
  let total = 0
  while (hasMore) {
    const res = await db.collection(collectionName).where({ _openid: openid }).limit(limit).get()
    if (res.data.length === 0) {
      hasMore = false
      break
    }
    total += res.data.length
    const tasks = res.data.map(doc => db.collection(collectionName).doc(doc._id).remove())
    await Promise.all(tasks)
    if (res.data.length < limit) hasMore = false
  }
  return total
}

module.exports = { batchDeleteByOpenid }
