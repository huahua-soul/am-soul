/**
 * body.js —— 体重、睡眠债、干净程度。
 *
 * 吃进去的、烧掉的、欠下的觉，各记一份账。
 * 一天两天看不出来，连着过才看得出人是怎么被磨的。
 */
import { dayKey } from './life.js'

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d)

/** 女性基础代谢（Mifflin-St Jeor 近似，年龄按 20） */
function bmr(weight, height) {
  return 655 + 9.6 * weight + 1.8 * height - 4.7 * 20
}

export function bodyState(st) {
  if (!st.body) {
    st.body = { weight: 52, height: 165, pendingIn: 0, dayKey: '', sleepHours: 0, debt: 0, dirty: 0, lastWashAt: 0 }
  }
  return st.body
}

export function bmi(st) {
  const b = bodyState(st)
  return b.weight / Math.pow(num(b.height, 165) / 100, 2)
}

export function bodyTick(st, h, now = Date.now()) {
  const b = bodyState(st)
  const k = dayKey(now)

  // 跨天结一次睡眠账：睡够八小时不欠，少一小时记一小时
  if (b.dayKey !== k) {
    if (b.dayKey) {
      const short = Math.max(0, 8 - num(b.sleepHours, 0))
      b.debt = clamp(num(b.debt, 0) * 0.55 + short, 0, 18)
    }
    b.dayKey = k
    b.sleepHours = 0
  }

  // 烧掉的：基础代谢乘醒着的活动系数
  const burn = (bmr(num(b.weight, 52), num(b.height, 165)) * (st.sleeping ? 1.1 : 1.42) / 24) * h
  const eat = num(b.pendingIn, 0)
  b.pendingIn = 0
  // 7700 千卡对一公斤
  b.weight = clamp(num(b.weight, 52) + (eat - burn) / 7700, 38, 78)

  if (st.sleeping) b.sleepHours = num(b.sleepHours, 0) + h

  // 干净这件事：一天不洗，头发先油；两天不洗，身上有味儿
  b.dirty = clamp(num(b.dirty, 0) + (st.sleeping ? 0.25 : 0.42) * h, 0, 100)
  return b
}

/* ── 小毛病：不是"腰酸"，是具体那一下 ─────── */

// 每种小毛病写两个版本：一个是名字，一个是「什么动作的时候最明显」。
const ACHES = [
  { name: '后腰发酸', how: '坐久了站起来那一下，腰上像被人拽着一根筋' },
  { name: '太阳穴跳', how: '一低头就一跳一跳的' },
  { name: '小腹胀', how: '弯腰的时候觉得肚子里坠着一块' },
  { name: '喉咙发毛', how: '咽口水的时候有点剌' },
  { name: '膝盖软', how: '下楼梯得扶着走' },
  { name: '右肩僵', how: '抬手够高处够不到' },
  { name: '脚踝酸', how: '走两步就想坐下来' },
  { name: '眼睛干', how: '看久了要眨好几下才清楚' },
  { name: '手指麻', how: '捏东西的时候指尖发木' },
  { name: '后背痒', how: '自己够不到的那块地方' },
]

export function rollAche(now = Date.now()) {
  const a = ACHES[Math.floor(Math.random() * ACHES.length)]
  return { name: a.name, how: a.how, at: now }
}

/* ── 小伤：纸划了、脚磨破、吃坏肚子 ───────── */

const MINOR = [
  { name: '被纸划了', how: '食指侧面一道，碰水会疼', days: 2 },
  { name: '脚磨破了', how: '鞋后跟那块，走路一瘸一瘸', days: 3 },
  { name: '吃坏肚子', how: '跑了几趟厕所，人是空的', days: 1 },
  { name: '磕到桌角', how: '膝盖上青了一块', days: 5 },
  { name: '烫了一下', how: '手背红了一小片，冲过凉水了', days: 3 },
]

export function rollMinor() {
  const m = MINOR[Math.floor(Math.random() * MINOR.length)]
  return { name: m.name, how: m.how, until: Date.now() + m.days * 86400_000 }
}

/* ── 手脚凉、起夜、做梦 ───────────────────── */

export function coldHands(st, now = Date.now()) {
  const b = bodyState(st)
  const h = new Date(now).getHours()
  const cold = (h >= 22 || h < 7) || num(st.weather && st.weather.tempC, 20) <= 12
  return cold && num(b.weight, 52) < 50
}

export function nightWake(now = Date.now()) {
  return Math.random() < 0.18
}

const DREAMS = [
  '梦见在海边，水是黑的',
  '梦见一直在找什么东西，找不到',
  '梦见有人叫我，回头没人',
  '梦见屋子变大了，走不到头',
  '梦见下雨，躲在一个不认识的屋檐下',
  '梦见自己在等一班不来的车',
]

export function dream(now = Date.now()) {
  if (Math.random() > 0.55) return ''
  return DREAMS[Math.floor(Math.random() * DREAMS.length)]
}

/** 照镜子会看到什么。 */
export function mirror(st) {
  const b = bodyState(st)
  const bits = []
  const d = num(b.dirty, 0)
  if (d > 78) bits.push('头发是油的，脸上有点疲')
  else if (d > 55) bits.push('头发有点塌，脸上没洗干净的样子')
  else if (d > 36) bits.push('脸色有点白，眼睛下面有两道')
  else bits.push('脸色还行')
  if (num(st.energy, 50) < 30) bits.push('眼睛没什么神')
  if (bmi(st) < 18) bits.push('锁骨太明显了，衣服挂在身上')
  return bits.join('，')
}
