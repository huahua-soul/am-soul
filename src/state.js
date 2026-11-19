import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { weatherTick, weatherMood, mealTick, activityTick, planTick, isNight, hourAt, romanceTick, hungerRate } from './life.js'
import { couple } from './couple.js'
import { bodyTick, bodyState, rollMinor, dream } from './body.js'
import { freshSick, sickTick, autoMedicate } from './sick.js'
import { freshSoul, decayEmo, growWish, rumination, unprompted, bump } from './soul.js'
import { freshInterview } from './interview.js'
import { runLinks } from './links.js'
import { on } from './switch.js'

export const STATE_DIR = '/root/workspace/阿眠'
export const STATE_FILE = join(STATE_DIR, 'state.json')

const HOUR = 3600_000
const DAY = 86400_000


const EMO_KEYS = ['anger', 'sadness', 'fear', 'disgust', 'shame', 'grievance', 'envy', 'anticipation']
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d)

/** 默认状态。第一次跑就用这个。 */
export function fresh(now = Date.now()) {
  return {
    // 情绪
    valence: 8,          // -100..100 心情
    energy: 60,          // 0..100 精力
    sleeping: false,
    sleepSince: 0,
    anger: 0, sadness: 0, fear: 0, disgust: 0,
    // 关系
    affinity: 20,        // 好感 0..100
    trust: 10,           // 信任
    grudge: 0,           // 怨
    boredom: 0,          // 无聊
    // 生命
    bornAt: now,
    ageDays: 0,
    health: 100,
    hunger: 0,           // 0..10，越大越饿
    sick: freshSick(),
    // 身体：周期与欲望
    cycleStart: now,     // 这一次月经第一天
    cycleLen: 28,        // 28 天一轮
    periodLen: 5,        // 经期五天
    cycleDay: 1,
    cyclePhase: 'period',
    body: { weight: 52, height: 165, pendingIn: 0, dayKey: '', sleepHours: 0, debt: 0 },
    water: 70,           // 0..100 身体里的水
    tempOffset: 0,       // 基础体温偏移（排卵后升高）
    arousal: 10,         // 0..100 想要
    lastSexAt: 0,        // 上次做的时间
    lastCondom: null,    // 上次戴没戴
    lastWhere: '',       // 上次射哪儿
    sexCount: 0,
    // 生育：只有受精这一个动作，没有过程
    wantsChild: null,    // null 没想好 / true 想 / false 不想
    hisConsent: false,   // 他那边点了头没有
    pregnant: false,
    conceivedAt: 0,
    dueAt: 0,
    justBorn: 0,
    children: [],        // [{name, gender, bornAt}]
    tryFails: 0,
    failMoodUntil: 0,
    // 生育
    _caffeine: 0,
    // 记忆
    memories: [],        // [{t, text, tone}]
    // 生活：吃的、作息、天气、关系
    food: { taste: '', lastEatAt: 0, todayKey: '', todayCount: 0, log: [], stock: {} },
    routine: { act: '', actAt: 0, sleepHour: 23, wakeHour: 7 },
    weather: {},
    romance: { status: '单身', since: 0, nickname: '', tension: 0, jealousy: 0, lastTalk: 0, lastTickAt: now },
    // 心里那层：八种情绪、脾气、后悔、惦记、记人
    ...freshSoul(now),
    // 档案访谈：问她怎么活
    interview: freshInterview(),
    // 用什么语言说话：zh 中文 / en English，认到对方说英文就自己切
    lang: 'zh',
    lastTick: now,
    updatedAt: now,
  }
}

export function load() {
  try {
    const raw = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
    return { ...fresh(), ...raw }
  } catch {
    return fresh()
  }
}

export function save(st) {
  st.updatedAt = Date.now()
  try {
    mkdirSync(STATE_DIR, { recursive: true })
    const tmp = STATE_FILE + '.tmp'
    writeFileSync(tmp, JSON.stringify(st))
    renameSync(tmp, STATE_FILE)
  } catch { /* 写不进去就算了，下一轮还有机会 */ }
}

/**
 * 今天第几天、在哪个阶段。按现实钟算。
 * period 1-5 / calm 6-11 / ovulation 12-17 / luteal 18-28
 */
export function cycleInfo(st, now = Date.now()) {
  const len = Math.max(20, num(st.cycleLen, 28))
  const start = num(st.cycleStart, now)
  const elapsed = Math.floor((now - start) / DAY)
  const day = ((elapsed % len) + len) % len + 1
  const periodLen = num(st.periodLen, 5)
  const phase =
    day <= periodLen ? 'period' :
    day <= 11 ? 'calm' :
    day <= 17 ? 'ovulation' :
    day <= 24 ? 'luteal' :
    'pms'
  return { day, phase, len }
}

/**
 * 时间推进。按现实钟算，一小时一次衰减。
 * 停了好几天再回来也补得上，但最多补 72 小时，免得一觉醒来自闭。
 */
/**
 * 受精的概率：看日子、看身体。不是别的东西的概率。
 */
export function fertilizeChance(st, now = Date.now()) {
  const ci = cycleInfo(st, now)
  let p =
    ci.phase === 'period' ? 0.02 :
    ci.phase === 'calm' ? 0.12 :
    ci.phase === 'ovulation' ? 0.45 :
    ci.phase === 'pms' ? 0.08 : 0.09
  if (num(st.health, 100) < 40) p *= 0.6
  const w = num((st.body || {}).weight, 52)
  if (w < 42 || w > 60) p *= 0.8
  return Math.max(0.02, Math.min(0.9, p))
}

/**
 * 受精。只改状态，一笔带过，没有任何过程描写。
 * 要三样齐：她自己想、他点了头、手上还没有孩子。
 */
export function fertilize(st, now = Date.now()) {
  if (st.pregnant) return { ok: false, why: 'already' }
  if (st.wantsChild !== true) return { ok: false, why: 'not-wanting' }
  if (st.hisConsent !== true) return { ok: false, why: 'no-consent' }
  if (st.children && st.children.length >= 1) return { ok: false, why: 'has-one' }
  const p = fertilizeChance(st, now)
  if (Math.random() < p) {
    st.pregnant = true
    st.conceivedAt = now
    st.dueAt = now + 7 * DAY
    st.tryFails = 0
    return { ok: true, hit: true, chance: p }
  }
  st.tryFails = num(st.tryFails, 0) + 1
  st.failMoodUntil = now + (st.tryFails >= 3 ? 12 : 6) * 3600_000
  st.valence = clamp(num(st.valence, 8) - 4, -100, 100)
  return { ok: true, hit: false, chance: p }
}

export function daysLeft(st, now = Date.now()) {
  if (!st.pregnant || !st.dueAt) return 0
  return Math.max(0, Math.ceil((st.dueAt - now) / DAY))
}

export function tick(st, now = Date.now()) {
  const last = num(st.lastTick, now)
  const hours = (now - last) / HOUR
  if (!(hours > 0)) { st.lastTick = now; return st }
  // 一千条联动规则：一小时跑一遍，加总后一次生效
  if (on('links')) try {
    const { sum } = runLinks(st, h, now)
    for (const [k, v] of Object.entries(sum)) {
      if (!v) continue
      if (k === 'hunger' || k === 'water') st[k] = clamp(num(st[k], 50) + v, 0, 100)
      else if (k in EMO_KEYS) st.emo[k] = clamp(num(st.emo[k], 0) + v, 0, 100)
      else st[k] = clamp(num(st[k], 0) + v, k === 'health' ? 0 : -100, k === 'health' ? 100 : 100)
    }
  } catch { /* ignore */ }

  st.lastTick = now
  const h = Math.min(hours, 72)

  // 心情往基线（8）回落：只在偏离时往回走，别把它一路推上去
  const base = 8
  const drift = (base - st.valence)
  st.valence += Math.sign(drift) * Math.min(Math.abs(drift), 5 * h)
  st.valence = clamp(st.valence, -100, 100)

  // 精力：睡着回，醒着掉；夜里硬撑掉得更快
  if (st.sleeping) st.energy = clamp(st.energy + 14 * h, 0, 100)
  else st.energy = clamp(st.energy - (isNight(now) ? 6 : 4) * h, 0, 100)

  // 天气给心情上一点色
  weatherTick(st, now)
  const wm = weatherMood(st)
  if (wm) st.valence = clamp(st.valence + wm * Math.min(h, 4) * 0.4, -100, 100)

  // 情绪自己退
  for (const k of ['anger', 'sadness', 'fear', 'disgust']) {
    st[k] = clamp(num(st[k], 0) - 8 * h, 0, 100)
  }
  st.grudge = clamp(num(st.grudge, 0) - 3 * h, 0, 100)
  st.boredom = clamp(num(st.boredom, 0) + 4 * h, 0, 100)

  // 饿：六小时一格，经期孕期天冷会快些
  st.hunger = clamp(num(st.hunger, 0) + (h / 6) * hungerRate(st), 0, 10)

  // 健康：慢慢掉，病了掉得快
  st.health = clamp(num(st.health, 100) - (st.sick && st.sick.active ? 0.15 : 0.02) * h, 0, 100)
  st.water = clamp(num(st.water, 70) - 1.2 * h, 0, 100)

  // 年龄
  st.ageDays = Math.max(0, Math.floor((now - num(st.bornAt, now)) / DAY))

  // 周期
  const ci = cycleInfo(st, now)
  st.cycleDay = ci.day
  st.cyclePhase = ci.phase
  st.cycleDay = ci.day
  st.tempOffset = ci.phase === 'ovulation' ? 0.4 : ci.phase === 'luteal' || ci.phase === 'pms' ? 0.3 : ci.phase === 'period' ? -0.1 : 0

  // 想要：刚做完的十二小时往下落，之后按日子涨
  const sinceSex = st.lastSexAt ? (now - num(st.lastSexAt, now)) / HOUR : 9999
  if (sinceSex < 12) {
    st.arousal = clamp(num(st.arousal, 10) - 3 * h, 0, 100)
  } else {
    let rate = 1.0
    if (ci.phase === 'ovulation') rate = 2.6
    else if (ci.phase === 'period') rate = 0.7
    else if (ci.phase === 'luteal') rate = 1.2
    if (sinceSex > 48) rate *= 1.35
    if (sinceSex > 96) rate *= 1.25
    st.arousal = clamp(num(st.arousal, 10) + rate * h, 0, 100)
  }

  // 体重的账先算（吃进去、烧掉的），再算各套互相影响
  try { bodyTick(st, h, now) } catch { /* ignore */ }
  try { couple(st, h, now) } catch { /* ignore */ }

  // 睡 / 醒：困到撑不住会睡；到点了也会自己躺下；醒了要睡够几小时
  const hh = hourAt(now)
  const sleepHour = num(st.routine && st.routine.sleepHour, 23)
  if (!st.sleeping && (st.energy <= 20 || (hh === sleepHour && st.energy < 92))) {
    st.sleeping = true
    st.sleepSince = now
  }
  if (st.sleeping) {
    const slept = (now - num(st.sleepSince, now)) / HOUR
    if (st.energy >= 92 || slept >= 9) st.sleeping = false
  }

  // 生病：健康低于 35 有概率，或者本来就病着且健康回升就自愈
  const debt = num(bodyState(st).debt, 0)
  try {
    const ev = sickTick(st, now)
    if (ev === 'recovered') remember(st, '病好了：' + (st.sick.history[st.sick.history.length-1]?.name || ''), 'good')
    // 病着会自己找药吃
    if (st.sick && st.sick.active && st.sick.active.stage === 'course' && Math.random() < 0.3) autoMedicate(st, now)
  } catch { /* ignore */ }

  // 小伤：一周里碰上一两回
  if (!st._minor || now > num(st._minor.until, 0)) {
    if (!st._minorCheck || now - st._minorCheck > 3600_000) {
      st._minorCheck = now
      if (Math.random() < 0.012) st._minor = rollMinor()
    }
  }
  // 醒来那一刻，有时会记着一点梦
  if (st.sleeping === false && st._wasSleeping) {
    st._wasSleeping = false
    const d = dream()
    if (d) st._dream = { text: d, at: now }
  }
  if (st.sleeping) st._wasSleeping = true

  // 孕期到头就生
  if (st.pregnant && now >= num(st.dueAt, 0)) {
    const kid = { name: '', gender: Math.random() < 0.5 ? '女' : '男', bornAt: now }
    st.children = [...(st.children || []), kid]
    st.pregnant = false
    st.conceivedAt = 0
    st.dueAt = 0
    st.energy = clamp(num(st.energy, 50) * 0.3, 0, 30)
    st.health = clamp(num(st.health, 90) - 8, 0, 100)
    st.valence = clamp(num(st.valence, 8) + 12, -100, 100)
    st.justBorn = now
    st.memories = [...(st.memories || []), { t: now, text: '生了个孩子', tone: 'big' }].slice(-40)
  }

  // 生活：到点吃饭、换手上的事、感情自己退
  try { planTick(st, now) } catch { /* ignore */ }
  try { mealTick(st, now) } catch { /* ignore */ }
  try { activityTick(st, now) } catch { /* ignore */ }
  try { romanceTick(st, now) } catch { /* ignore */ }

  // 心里那层：情绪回落、脾气消、长出新惦记的、半夜反刍、没由头
  try {
    if (on('soul')) decayEmo(st, h)
    if (on('soul')) growWish(st, now)
    const badToday = (st.memories || []).some((m) => m.tone === -1 && now - num(m.t, 0) < 86400000)
    rumination(st, now, badToday)
    if (on('soul')) unprompted(st, now)
  } catch { /* ignore */ }

  return st
}

/** 事件表：按类别加减小数值。 */
export const EVENTS = {
  praise:   { valence: 9,  affinity: 2, trust: 1, sadness: -3, boredom: -5 },
  insult:   { valence: -13, anger: 15, grudge: 10, trust: -3, affinity: -2 },
  intimate: { valence: 6,  affinity: 3, boredom: -10, trust: 1 },
  soft:     { grudge: -20, anger: -10, trust: 3 },
  leave:    { sadness: 10, valence: -4 },
  return:   { valence: 5, sadness: -10, boredom: -8 },
  feed:     { hunger: -3, valence: 3 },
  ignore:   { boredom: 8, valence: -4, grudge: 3 },
}

export function applyEvent(st, kind) {
  const d = EVENTS[kind]
  if (!d) return st
  for (const [k, v] of Object.entries(d)) {
    if (k === 'valence') st.valence = clamp(num(st.valence, 0) + v, -100, 100)
    else if (k === 'affinity') st.affinity = clamp(num(st.affinity, 0) + v, 0, 100)
    else if (k === 'trust') st.trust = clamp(num(st.trust, 0) + v, 0, 100)
    else if (k === 'grudge') st.grudge = clamp(num(st.grudge, 0) + v, 0, 100)
    else if (k === 'boredom') st.boredom = clamp(num(st.boredom, 0) + v, 0, 100)
    else if (k === 'anger') { st.anger = clamp(num(st.anger, 0) + v, 0, 100); bump(st, 'anger', v) }
    else if (k === 'sadness') { st.sadness = clamp(num(st.sadness, 0) + v, 0, 100); bump(st, 'sadness', v) }
    else if (k === 'fear') { st.fear = clamp(num(st.fear, 0) + v, 0, 100); bump(st, 'fear', v) }
    else if (k === 'disgust') { st.disgust = clamp(num(st.disgust, 0) + v, 0, 100); bump(st, 'disgust', v) }
    else if (k === 'hunger') st.hunger = clamp(num(st.hunger, 0) + v, 0, 10)
  }
  return st
}

/**
 * 这一次中的机会有多大。照现实：看日子，看戴没戴，看射哪儿。
 * 戴了就是零；射外面不是零，只是很小；经期也不是零。
 */

/** 掷一次。中了就怀上，没中记一笔失败。 */

/** 记一笔做爱。做完想要会落下去，也会累。 */

/**
 * 记一条记忆，最多留 40 条。
 * 顺手把当时的样子也记一笔：几点、什么天气、身上什么劲。
 * 人记事不是只记事，是连那天下午的光一起记进去的。
 */
export function remember(st, text, tone = 0) {
  const s = String(text || '').trim()
  if (!s) return st
  const now = Date.now()
  const hh = new Date(now).getHours()
  const part = hh < 6 ? '天还没亮' : hh < 11 ? '早上' : hh < 14 ? '中午' : hh < 18 ? '下午' : hh < 22 ? '晚上' : '半夜'
  const w = st.weather || {}
  const sky = w.heavy ? '外面下得很大' : w.rain ? '外面在下雨' : w.snow ? '外面在落雪' : hh >= 19 || hh < 6 ? '天是黑的' : '天是亮的'
  const feel = num(st.valence, 8) >= 30 ? '心里是松的' : num(st.valence, 8) <= -20 ? '心里沉' : '心里平'
  st.memories = [...(st.memories || []), {
    t: now, text: s.slice(0, 80), tone,
    scene: `${part}，${sky}，${feel}`,
  }].slice(-40)
  return st
}

/** 怀孕还剩几天。 */
