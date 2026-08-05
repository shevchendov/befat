const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

// 返回如：2026年8月4日 周二
function formatDateCN(date) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const w = WEEKDAYS[date.getDay()];
  return `${y}年${m}月${d}日 ${w}`;
}

// 返回如：8月4日 周二（无年份，用于首屏简洁展示场景）
function formatDateShortCN(date) {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const w = WEEKDAYS[date.getDay()];
  return `${m}月${d}日 ${w}`;
}

// 返回如：14:51:46
function formatTimeCN(date) {
  const h = pad2(date.getHours());
  const min = pad2(date.getMinutes());
  const s = pad2(date.getSeconds());
  return `${h}:${min}:${s}`;
}

// 返回如：08:30（时:分，无秒，用于列表类简洁展示场景）
function formatTimeShortCN(date) {
  const h = pad2(date.getHours());
  const min = pad2(date.getMinutes());
  return `${h}:${min}`;
}

// 返回如：2026-08-04 14:51:46
function formatDateTimeCN(date) {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${m}-${d} ${formatTimeCN(date)}`;
}

module.exports = { formatDateCN, formatDateShortCN, formatTimeCN, formatTimeShortCN, formatDateTimeCN };
