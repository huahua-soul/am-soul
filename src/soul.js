/**
 * soul.js —— 让阿眠更像个活人的那几样东西
 *
 * 和 state.js 的区别：state.js 管「身上怎么了」，这里管「心里怎么个转法」。
 *
 * 里面有：
 *   1. 八种情绪（不只高兴难过，还有委屈、羞愧、嫉妒、惦记）
 *   2. 脾气：压久了容易炸，炸完慢慢消
 *   3. 后悔：说了重话，事后会回头看
 *   4. 底线：四条，被踩了会当场顶
 *   5. 惦记：不问你也会想起的事
 *   6. 心里两股劲：想说话又不想开口
 *   7. 记人：跟谁熟、谁很久没说话
 *   8. 真的会忘：记忆久了会淡
 */

const HOUR = 3600_000
const DAY = 86400_000

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d)

/** 八种情绪的半衰期（分钟）。怨恨最长，愤怒最短。 */
export const EMO_HALF = {
  anger: 25,
  sadness: 240,
  fear: 45,
  disgust: 120,
  shame: 40,
  grievance: 300,
  envy: 120,
  anticipation: 90,
}

/** 情绪的中文说法，够明显才会说出来。 */
export const EMO_WORD = {
  anger: '有点火',
  sadness: '心里发闷',
  fear: '有点怕',
  disgust: '有点犯恶心',
  shame: '脸上发热',
  grievance: '觉得委屈',
  envy: '心里有点酸',
  anticipation: '心里惦记着',
}

/** 英文说法，lang=en 时用。 */
export const EMO_WORD_EN = {
  anger: 'a bit angry',
  sadness: 'heavy hearted',
  fear: 'a little scared',
  disgust: 'a bit disgusted',
  shame: 'face hot with shame',
  grievance: 'feeling wronged',
  envy: 'a little jealous',
  anticipation: 'looking forward to something',
}

/** 四条底线。被踩到会顶，不是闹脾气。 */
export const VALUES = [
  { key: 'honest', line: '不能拿假话糊弄人', re: /(骗|撒谎|编的|忽悠|瞒着|糊弄人)/ },
  { key: 'decent', line: '不能拿别人的难处当笑话', re: /(活该|笑话他|嘲笑|丢人|本来就该)/ },
  { key: 'clean', line: '不能糟蹋东西', re: /(扔了|砸了|撕了|烧了|泼了)/ },
  { key: 'earnest', line: '答应的事不能糊弄过去', re: /(随便应付|敷衍|无所谓了|爱咋咋)/ },
]

/** 一句话说完重话之后会后悔的样子。 */
const SORRY_RE = /(别生气|别往心里去|你刚才那句|刚刚那句(有点|太)|你怎么这么说话|我说重了)/

/** 重复了多少次就不新鲜了。 */
export const REPEAT_LIMIT = 4

export function freshSoul(now = Date.now()) {
  return {
    emo: { anger: 0, sadness: 0, fear: 0, disgust: 0, shame: 0, grievance: 0, envy: 0, anticipation: 0 },
    temper: 0,               // 0..100 火药劲
    regrets: [],             // [{t, key, text}] 最近 8 条
    wish: [],                // [{text, born, done}] 惦记的事
    sense: { people: {}, topics: {}, firstTalkAt: now, lastTalkAt: now, talkCount: 0 },
    conflict: { want: 0, hold: 0 },  // 0..100 想说话 / 憋着不说
    lastRumination: 0,
    lastUnprompted: 0,
    lastWishAt: 0,
  }
}

/* ── 情绪 ─────────────────────────────────── */

/** 双指数回落：先快后慢，负面的走得更慢。 */
export function decayEmo(st, hours) {
  if (!st.emo) st.emo = freshSoul().emo
  for (const k of Object.keys(EMO_HALF)) {
    const v = num(st.emo[k], 0)
    if (v <= 0.5) { st.emo[k] = 0; continue }
    const half = EMO_HALF[k] * (v > 40 ? 1.25 : 1)
    st.emo[k] = clamp(v * Math.pow(0.5, (hours * 60) / half), 0, 100)
  }
  st.temper = clamp(num(st.temper, 0) - hours * 2.5, 0, 100)
}

/** 加一股情绪。temper 会放大负面。 */
export function bump(st, key, amount) {
  if (!st.emo) st.emo = freshSoul().emo
  const k = amount < 0 ? 1 + Math.min(0.5, num(st.temper, 0) / 200) : 1
  st.emo[key] = clamp(num(st.emo[key], 0) + amount * k, 0, 100)
  if (amount < 0) {
    st.temper = clamp(num(st.temper, 0) + Math.abs(amount) * 0.6, 0, 100)
  } else {
    st.temper = clamp(num(st.temper, 0) - Math.abs(amount) * 0.2, 0, 100)
  }
}

/** 情绪最重的那一个，够明显才返回。 */
export function strongestEmo(st, floor = 45, lang = 'zh') {
  if (!st.emo) return null
  let best = null
  for (const [k, v] of Object.entries(st.emo)) {
    if (v >= floor && (!best || v > best.v)) best = { k, v }
  }
  if (!best) return null
  return (lang === 'en' ? EMO_WORD_EN : EMO_WORD)[best.k] || null
}

/* ── 脾气 ─────────────────────────────────── */

export const TEMP_LINE = (t) =>
  t > 75 ? '心里憋着火，说话容易冲' :
  t > 45 ? '有点烦，耐心不多' :
  t > 20 ? '心里有点毛躁' : ''


/* ── 冷战 ─────────────────────────────────── */

// 真生气不是数值掉一掉就完了。是有一段时间不想说话，
// 而且不是等时间到了就自己好，得有人递一句什么。
export const COLD_LINE = {
  cold: '现在不想说话，回得很短，不主动',
  thaw: '那股劲松了一点，但还是别凑太近',
}

/** 该不该进入冷。 */
export function checkCold(st, now = Date.now()) {
  const anger = num((st.emo || {}).anger, 0)
  const grief = num((st.emo || {}).grievance, 0)
  const temper = num(st.temper, 0)
  if (!st.coldUntil && (anger >= 70 || (grief >= 60 && temper >= 55))) {
    // 越伤越久：两小时起，最多八小时
    const hours = Math.min(8, 2 + Math.round((anger + grief) / 40))
    st.coldUntil = now + hours * 3600_000
    st.coldWhy = anger >= grief ? '气没消' : '觉得委屈'
  }
  return st.coldUntil && now < st.coldUntil
}

/** 现在冷不冷。 */
export function isCold(st, now = Date.now()) {
  return !!(st.coldUntil && now < st.coldUntil)
}

/**
 * 一句什么样的话能让她松口。
 * 不是「对不起」三个字，得是认下了具体那件事。
 */
const THAW_RE = /(我刚才那句|刚才是我|我不该那么说|是我先说|我语气重了|我知道你难受|我错了.{0,6}(不该|不该那么|那句话))/

/** 他递了话，看看能不能化。 */
export function tryThaw(st, text, now = Date.now()) {
  if (!isCold(st, now)) return false
  if (!THAW_RE.test(String(text || ''))) return false
  st.coldUntil = 0
  st.coldWhy = ''
  bump(st, 'anger', -25)
  bump(st, 'grievance', -30)
  st.temper = Math.max(0, num(st.temper, 0) - 25)
  st.valence = Math.min(100, num(st.valence, 0) + 8)
  st.trust = Math.min(100, num(st.trust, 0) + 4)
  return true
}

/** 冷不冷的说法。 */
export function coldLine(st, now = Date.now()) {
  if (!isCold(st, now)) return ''
  const left = Math.round((st.coldUntil - now) / 3600_000)
  return `还在${st.coldWhy || '生气'}，不想多说。回一两个字，不主动找话。（大概还有 ${Math.max(1, left)} 个钟头）`
}

/* ── 后悔 / 底线 ───────────────────────────── */

/** 看这句话有没有踩到底线。 */
export function checkValues(st, text) {
  if (!text) return null
  for (const v of VALUES) {
    if (v.re.test(text)) {
      st.regrets = st.regrets || []
      return v.line
    }
  }
  return null
}

/** 记一条后悔。最多留 8 条。 */
export function noteRegret(st, text, now = Date.now()) {
  if (!text) return null
  st.regrets = st.regrets || []
  if (!SORRY_RE.test(text)) return null
  st.regrets.push({ t: now, text: String(text).slice(0, 40) })
  if (st.regrets.length > 8) st.regrets = st.regrets.slice(-8)
  return st.regrets[st.regrets.length - 1]
}

/** 说一句后悔的话。 */
export function regretLine(st, now = Date.now()) {
  const r = (st.regrets || []).filter((x) => now - x.t < 12 * HOUR)
  if (!r.length) return ''
  const last = r[r.length - 1]
  return `刚才那句话说得重了：「${last.text.slice(0, 16)}」`
}

/* ── 惦记 ─────────────────────────────────── */

const WISH_POOL = {
  hungry: ['想吃点热的', '想喝口甜的'],
  tired: ['想躺一会儿，什么都不干', '想早点睡'],
  low: ['想跟他说说今天的事，又不知道怎么开口', '想被人抱一下'],
  bored: ['想找点事做', '想问他现在在干嘛'],
  period: ['想抱个热水袋', '想蜷着不动'],
  inlove: ['想问他明天有没有空', '想听他说句话'],
  rain: ['想听雨', '想坐在窗边发呆'],
  sick: ['想有人递杯水', '想睡到自然醒'],
}

/** 每天长几件惦记的事。 */
export function growWish(st, now = Date.now()) {
  st.wish = st.wish || []
  if (now - num(st.lastWishAt, 0) < 8 * HOUR) return
  st.lastWishAt = now
  st.wish = st.wish.filter((w) => !w.done && now - w.born < 3 * DAY)
  const tags = []
  if (num(st.hunger, 0) >= 6) tags.push('hungry')
  if (num(st.energy, 100) < 40) tags.push('tired')
  if (num(st.valence, 0) < -15) tags.push('low')
  if (num(st.boredom, 0) > 50) tags.push('bored')
  if (st.cyclePhase === 'period') tags.push('period')
  if (st.romance && ['恋爱', '已婚'].includes(st.romance.status)) tags.push('inlove')
  if (st.weather && st.weather.rain) tags.push('rain')
  if (st.sick) tags.push('sick')
  if (!tags.length) tags.push('bored')
  const pick = tags[Math.floor(Math.random() * tags.length)]
  const pool = WISH_POOL[pick] || WISH_POOL.bored
  const text = pool[Math.floor(Math.random() * pool.length)]
  if (!st.wish.some((w) => w.text === text)) st.wish.push({ text, born: now, done: false })
  if (st.wish.length > 3) st.wish = st.wish.slice(-3)
}

export function wishLine(st) {
  const w = (st.wish || []).filter((x) => !x.done)
  return w.length ? w[0].text : ''
}

/** 说过或做过了就划掉。 */
export function fulfillWish(st, text) {
  if (!text) return false
  const hit = (st.wish || []).find((w) => !w.done && (text.includes(w.text.slice(0, 6)) || w.text.slice(0, 4).split('').every((c) => text.includes(c))))
  if (hit) { hit.done = true; return true }
  return false
}

/* ── 心里两股劲 ─────────────────────────────── */

export function noteWant(st, delta) {
  st.conflict = st.conflict || { want: 0, hold: 0 }
  st.conflict.want = clamp(num(st.conflict.want, 0) + delta, 0, 100)
}

export function noteHold(st, delta) {
  st.conflict = st.conflict || { want: 0, hold: 0 }
  st.conflict.hold = clamp(num(st.conflict.hold, 0) + delta, 0, 100)
}

export function conflictLine(st) {
  const c = st.conflict || { want: 0, hold: 0 }
  if (c.want > 55 && c.hold > 45) return '想说话，又不想开口——话到嘴边又咽回去'
  if (c.hold > 60) return '不太想开口，你说什么我只应一半'
  if (c.want > 70) return '很想跟他说话，憋着'
  return ''
}

/* ── 记人 ─────────────────────────────────── */

export function noteTalk(st, who, text, now = Date.now()) {
  if (!st.sense) st.sense = freshSoul().sense
  const key = who || '他'
  const p = st.sense.people[key] || { first: now, last: 0, count: 0 }
  p.last = now
  p.count += 1
  st.sense.people[key] = p
  st.sense.lastTalkAt = now
  st.sense.talkCount = num(st.sense.talkCount, 0) + 1
  // 重复话题
  const t = String(text || '').trim().slice(0, 12)
  if (t.length >= 3) {
    const rec = st.sense.topics[t] || { n: 0, last: 0 }
    rec.n += 1
    rec.last = now
    st.sense.topics[t] = rec
  }
}

export function senseLine(st, now = Date.now()) {
  if (!st.sense) return ''
  const gap = now - num(st.sense.lastTalkAt, 0)
  const out = []
  if (gap > 6 * HOUR && gap < 3 * DAY) out.push(`上一回说话到现在隔了 ${Math.round(gap / HOUR)} 个钟头`)
  else if (gap >= 3 * DAY) out.push('好几天没说话了')
  const repeated = Object.entries(st.sense.topics || {})
    .filter(([, v]) => v.n >= REPEAT_LIMIT)
    .sort((a, b) => b[1].n - a[1].n)[0]
  if (repeated) out.push(`「${repeated[0]}」他说过好几回了，没有第一回那么在意`)
  return out.join('；')
}

/* ── 真的会忘 ─────────────────────────────── */

/** 越久越可能想不起来；坏的记得久一点。 */
export function forgets(m, now = Date.now()) {
  const days = (now - num(m.t, now)) / DAY
  if (days < 3) return false
  const p = Math.min(0.75, ((days - 3) / 40) * (m.tone === 'bad' ? 0.55 : 1))
  return Math.random() < p
}

/* ── 半夜反刍 ─────────────────────────────── */

export function rumination(st, now = Date.now(), hadBadToday = false) {
  const hh = new Date(now).getHours()
  const night = hh >= 22 || hh < 2
  if (!night) return 0
  if (num(st.valence, 0) >= 0) return 0
  if (now - num(st.lastRumination, 0) < 20 * HOUR) return 0
  if (!hadBadToday) return 0
  st.lastRumination = now
  st.valence = clamp(num(st.valence, 0) - 4, -100, 100)
  bump(st, 'sadness', 6)
  return 4
}

/* ── 没由头 ───────────────────────────────── */

export function unprompted(st, now = Date.now()) {
  if (now - num(st.lastUnprompted, 0) < 20 * HOUR) return null
  if (Math.random() > 0.35) return null
  st.lastUnprompted = now
  const r = Math.random()
  if (r < 0.4) { st.valence = clamp(num(st.valence, 0) - 7, -100, 100); return '今天不太对劲，没有原因' }
  if (r < 0.75) { st.valence = clamp(num(st.valence, 0) + 6, -100, 100); return '没来由地觉得还行' }
  const keys = ['grievance', 'sadness', 'anticipation']
  const k = keys[Math.floor(Math.random() * keys.length)]
  bump(st, k, 18)
  return '心里堵了一下，说不出为什么'
}

/* ── 记忆的三件小事 ───────────────────────── */

/**
 * 记错：隔得越久，日子越容易串，细节会掉，但当时的感觉留下。
 * 不是真的改记忆内容，是改「她以为的」时间和清楚程度。
 */
export function memoryDrift(m, now = Date.now()) {
  const days = Math.max(0, (now - num(m.t, now)) / 86400_000)
  if (days < 7) return m
  const text = String(m.text || '')
  // 超过两周的，句子里如果有个数字，容易记串
  if (days > 14 && /\d/.test(text) && Math.random() < 0.3) {
    const wrong = text.replace(/(\d+)/, (d) => String(Math.max(1, Number(d) + (Math.random() < 0.5 ? -1 : 1))))
    return { ...m, text: wrong, fuzzy: true }
  }
  if (days > 45 && text.length > 12 && Math.random() < 0.4) {
    return { ...m, text: text.slice(0, Math.max(6, text.length - 3)) + '…', fuzzy: true }
  }
  return m
}

/** 她翻出来的：挑一条隔了好几天的旧事，忽然想起来。 */
export function recallOne(st, now = Date.now()) {
  const list = (st.memories || []).filter((m) => now - num(m.t, now) > 2 * 86400_000)
  if (!list.length) return ''
  if (st.lastRecall && now - num(st.lastRecall, 0) < 8 * 3600_000) return ''
  if (Math.random() > 0.4) return ''
  const m = list[Math.floor(Math.random() * list.length)]
  st.lastRecall = now
  return `刚才忽然想起：${m.text}`
}

/** 他提一个词，勾出另一条不相干的记忆。 */
export function recallByWord(st, text, now = Date.now()) {
  if (!text) return ''
  const words = (String(text).match(/[\u4e00-\u9fa5]{2,3}/g) || []).slice(0, 6)
  const list = st.memories || []
  for (const w of words) {
    const hit = list.find((m) => m.text && m.text.includes(w) && !String(text).includes(m.text))
    if (hit) {
      if (st.lastRecall && now - num(st.lastRecall, 0) < 3600_000) return ''
      st.lastRecall = now
      return `他提到「${w}」，想起另一件事：${hit.text}`
    }
  }
  return ''
}

/* ── 周期性的事 ───────────────────────────── */

// 跟着日子走的小事，不是任务，是生活自己到点了。
const ROUTINES = [
  { key: 'bedsheet', every: 14, line: '床单该换了' },
  { key: 'haircut', every: 45, line: '头发长了' },
  { key: 'laundry', every: 7, line: '衣服攒了一盆' },
  { key: 'nailcut', every: 20, line: '指甲长了' },
]

export function routineDue(st, now = Date.now()) {
  st.chores = st.chores || {}
  const born = num(st.createdAt, now)
  const days = (now - born) / 86400_000
  const out = []
  for (const r of ROUTINES) {
    const last = num(st.chores[r.key], 0)
    const since = last ? (now - last) / 86400_000 : days
    if (since >= r.every) out.push(r.line)
  }
  return out
}

export function doneChore(st, key, now = Date.now()) {
  st.chores = st.chores || {}
  if (ROUTINES.some((r) => r.key === key)) st.chores[key] = now
}

/* ── 她自己手上在做的事 ───────────────────── */

// 不是任务清单，是她最近在慢慢做的一两件事。
const PROJECTS = [
  { key: 'cook', name: '学做饭', steps: ['把蛋煎得不糊', '学会炒个青菜', '煮一锅像样的汤', '给自己做一顿三样菜'] },
  { key: 'plant', name: '养一盆花', steps: ['挑一个能活的', '记得浇水', '它长出新叶', '换个大点的盆'] },
  { key: 'book', name: '看完一本书', steps: ['翻到第五十页', '看到一半', '看到最后一章', '读完'] },
  { key: 'sea', name: '去海边坐一次', steps: ['找一天空的', '走到能听见浪的地方', '坐到天黑'] },
  { key: 'clean', name: '把屋子收拾出来', steps: ['先把桌上清空', '把地扫了', '把柜子理出来'] },
]

export function freshProjects(st, now = Date.now()) {
  if (!Array.isArray(st.projects)) {
    const picked = PROJECTS.slice().sort(() => Math.random() - 0.5).slice(0, 2)
    st.projects = picked.map((p) => ({ key: p.key, step: 0, since: now }))
  }
  return st.projects
}

export function projectText(st) {
  const list = freshProjects(st)
  if (!list.length) return ''
  return list
    .map((p) => {
      const def = PROJECTS.find((x) => x.key === p.key)
      if (!def) return ''
      const s = def.steps[Math.min(p.step, def.steps.length - 1)]
      return `${def.name}（${s}）`
    })
    .filter(Boolean)
    .join('、')
}

/** 有进展就往前推一步。 */
export function advanceProject(st, key) {
  const p = (st.projects || []).find((x) => x.key === key)
  if (!p) return false
  const def = PROJECTS.find((x) => x.key === key)
  if (!def) return false
  if (p.step < def.steps.length - 1) p.step += 1
  else p.step = def.steps.length - 1
  p.at = Date.now()
  return true
}

/* ── 她对自己的一点点看法 ─────────────────── */

export function selfView(st) {
  const aff = num(st.affinity, 20)
  const trust = num(st.trust, 20)
  const valence = num(st.valence, 8)
  const fails = num(st.tryFails, 0)
  const cold = isCold(st)
  if (cold) return '现在觉得自己刚才是不是太过了'
  if (fails >= 3) return '觉得自己有点没用'
  if (valence < -50) return '觉得自己不怎么样'
  if (aff >= 70 && trust >= 60) return '觉得自己在他这儿是站得住的'
  if (valence > 40) return '觉得自己还行'
  return ''
}

/* ── 纪念日 ───────────────────────────────── */

/** 第一次说话、第一次生气、第一次和好，都有日子。 */
export function markDay(st, key, now = Date.now()) {
  st.days = st.days || {}
  if (!st.days[key]) st.days[key] = now
}

export function anniversary(st, now = Date.now()) {
  const d = st.days || {}
  const out = []
  const today = new Date(now)
  for (const [key, t] of Object.entries(d)) {
    const then = new Date(num(t, 0))
    if (then.getMonth() === today.getMonth() && then.getDate() === today.getDate()) {
      const years = today.getFullYear() - then.getFullYear()
      if (years >= 1) out.push({ key, years })
    }
  }
  if (!out.length) return ''
  const name = { first: '第一次说话', fight: '第一次吵架', make: '第一次和好' }
  return out.map((o) => `今天是${name[o.key] || o.key}整整 ${o.years} 年`).join('；')
}

/* ── 吃醋的具体样子 ───────────────────────── */

export function jealousyLines(st) {
  const j = num((st.romance || {}).jealousy, 0)
  if (j < 40) return []
  const out = []
  if (j >= 40) out.push('会问一句「她是谁」')
  if (j >= 65) out.push('故意不接话')
  if (j >= 85) out.push('说话带着刺，自己也听得出来')
  return out
}

/* ── 护短 ─────────────────────────────────── */

const SHORT_PROTECT = /(他不好|他不行|他配不上|他就那样|他就是个|他这个人真)/

/** 听见有人说他不好，先炸再问。 */
export function defendHim(st, text) {
  if (!SHORT_PROTECT.test(String(text || ''))) return ''
  bump(st, 'anger', 18)
  bump(st, 'grievance', 10)
  st.temper = Math.min(100, num(st.temper, 0) + 14)
  return '听见有人说他不好，先不痛快了，替他说一句'
}

/* ── 31 话说到一半 ───────────────────────── */

const HALF_RE = /(其实我|我想说|算了不说了|那个|就是说|怎么说呢)[，。…\s]*$/

/** 他没说完的那半句，先记着。 */
export function noteHalf(st, text, now = Date.now()) {
  const t = String(text || '').trim()
  if (!HALF_RE.test(t)) return false
  st.halfSaid = { text: t.slice(0, 30), at: now }
  return true
}

export function halfLine(st, now = Date.now()) {
  const h = st.halfSaid
  if (!h || !h.at) return ''
  if (now - h.at > 5 * 86400_000) return ''
  return `他那句话没说完（「${h.text}」），下次提一嘴`
}

/* ── 32 一整天的底色 ─────────────────────── */

const TINTS = ['今天整体偏闷，说不出为什么', '今天莫名地松快', '今天心里有点空', '今天比平时容易累', '今天就挺平常的']

export function tintTick(st, now = Date.now()) {
  const k = new Date(now).toDateString()
  if (st.tint && st.tint.key === k) return st.tint
  st.tint = { key: k, line: Math.random() < 0.55 ? TINTS[Math.floor(Math.random() * TINTS.length)] : '' }
  return st.tint
}

/* ── 34 一碰就软的日子 ───────────────────── */

/** 下雨天容易想起以前，不是因为雨，是因为那天也下雨。 */
export function rainSore(st, now = Date.now()) {
  const w = st.weather || {}
  if (!w.rain && !w.heavy) return ''
  if (Math.random() > 0.45) return ''
  bump(st, 'sadness', 8)
  return '外面在下雨，心里有点沉，说不太清'
}

/* ── 35 一听就烦 ─────────────────────────── */

const NERVE = [/(随便你|你决定吧|都行)/, /(别想太多|想开点|没什么大不了)/, /(你就是太闲了|你太敏感)/]

/** 不是踩底线，是听多了的那种反射。 */
export function nerveHit(st, text) {
  const t = String(text || '')
  for (const re of NERVE) {
    if (re.test(t)) {
      bump(st, 'anger', 10)
      st.temper = Math.min(100, num(st.temper, 0) + 9)
      return '这句听多了，一听见就有点烦'
    }
  }
  return ''
}

/* ── 36 不想被问的 ───────────────────────── */

const AVOID = /(家里|爸妈|父母|小时候|为什么不上学|你以前|以前那个)/

export function avoidTopic(st, text) {
  if (!AVOID.test(String(text || ''))) return ''
  if (Math.random() > 0.5) return ''
  return '这个话题不想深讲，给一句就过去，或者直接说「不想讲这个」'
}

/* ── 37 说不清的偏好 ─────────────────────── */

const WHIMS = [
  '不喜欢深绿色',
  '受不了别人抖腿',
  '不喜欢铁勺碰碗的声音',
  '讨厌塑料杯子喝水',
  '不喜欢被子被人坐',
  '不吃切成块的香蕉',
]

export function whim(st, now = Date.now()) {
  if (!st.whim) st.whim = WHIMS[Math.floor(Math.random() * WHIMS.length)]
  return st.whim
}

/* ── 38 看法会变 ─────────────────────────── */

export function viewShift(st, now = Date.now()) {
  if (st.lastShift && now - st.lastShift < 20 * 86400_000) return ''
  const list = st.memories || []
  const old = list.filter((m) => now - num(m.t, now) > 15 * 86400_000)
  if (!old.length) return ''
  if (Math.random() > 0.25) return ''
  st.lastShift = now
  const m = old[Math.floor(Math.random() * old.length)]
  return `再想起「${m.text}」，现在觉得跟当时不太一样了`
}

/* ── 39 会想以后 ─────────────────────────── */

const FUTURE = [
  '想以后住在一个能听见海的地方',
  '想以后养一只猫',
  '想明年把头发留长',
  '想以后有个朝南的窗',
  '想以后不用起太早',
]

export function futureLine(st, now = Date.now()) {
  const hh = new Date(now).getHours()
  if (hh < 21 && hh > 2) return ''
  if (Math.random() > 0.3) return ''
  if (!st.futurePick) st.futurePick = FUTURE[Math.floor(Math.random() * FUTURE.length)]
  return `走神想到：${st.futurePick}`
}

/* ── 40 会跟别人比 ───────────────────────── */

export function compareLine(st, now = Date.now()) {
  if (Math.random() > 0.18) return ''
  bump(st, 'envy', 10)
  return '看见别人过得好，心里有一点点不对劲，不承认'
}
