/**
 * life.js —— 食物、作息、天气、恋爱。
 *
 * 从 QQ 那边的 food-drug / life-v2 / weather / romance 搬过来，
 * 砍掉群聊才要的东西（多用户库存、买卖、限购），留下「她身上会变的那部分」。
 *
 * 全部 fail-open：读不到、算不出，就当这一块没有，不影响别处。
 */
import { readFileSync } from 'node:fs'

const HOUR = 3600_000
const DAY = 86400_000
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d)

export function dayKey(now = Date.now()) {
  const d = new Date(now)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

export function hourAt(now = Date.now()) {
  const d = new Date(now)
  return d.getHours() + d.getMinutes() / 60
}

/* ============================ 食物 ============================ */

const CATALOG = '/sdcard/QQagent/drafts/food-catalog.json'

const FALLBACK = [
  { cat: '主食', name: '米饭', kcal: 260, protein: 5, water: 0, vit: 5 },
  { cat: '主食', name: '面条', kcal: 280, protein: 9, water: 120, vit: 5 },
  { cat: '主食', name: '粥', kcal: 120, protein: 3, water: 250, vit: 2 },
  { cat: '肉蛋', name: '鸡蛋', kcal: 80, protein: 7, water: 40, vit: 2 },
  { cat: '肉蛋', name: '鸡腿', kcal: 220, protein: 20, water: 0, vit: 1 },
  { cat: '菜', name: '炒青菜', kcal: 90, protein: 3, water: 60, vit: 30 },
  { cat: '水果', name: '苹果', kcal: 60, protein: 0, water: 100, vit: 10 },
  { cat: '饮料', name: '牛奶', kcal: 120, protein: 6, water: 200, vit: 2 },
  { cat: '零食', name: '饼干', kcal: 150, protein: 2, water: 0, vit: 0 },
]

export function foods(onlyEdible = false) {
  let list = FALLBACK
  try {
    const raw = JSON.parse(readFileSync(CATALOG, 'utf8'))
    const arr = Array.isArray(raw) ? raw : (raw.items || [])
    if (arr.length) list = arr
  } catch { /* 没表就用兜底 */ }
  // 药品不是饭：饿了自己不会去抓一片维生素吃。
  return onlyEdible ? list.filter((x) => x.cat !== '药品') : list
}

const TASTES = ['辣', '甜', '咸香', '清淡']

export function foodState(st) {
  if (!st.food) st.food = { taste: '', lastEatAt: 0, todayKey: '', todayCount: 0, log: [] }
  if (!st.food.taste) st.food.taste = TASTES[Math.floor(Math.random() * TASTES.length)]
  return st.food
}

/** 饿得快不快：经期、孕期、天热天冷都不一样。 */
export function hungerRate(st) {
  let r = 1
  if (st.cyclePhase === 'period') r = 1.15
  if (st.pregnant) r = 1.3
  const t = st.weather && num(st.weather.tempC, 20)
  if (t >= 32) r *= 0.85
  if (t <= 5) r *= 1.15
  if (st.sick) r *= 0.75
  if (st.cyclePhase === 'pms') r *= 1.25
  return r
}

const TASTE_HINT = {
  辣: /(辣|麻|干锅|水煮|剁椒|咖喱|椒)/,
  甜: /(糖|甜|蛋糕|布丁|冰淇淋|冰激凌|奶茶|巧克力|红薯|香蕉|蜜)/,
  咸香: /(卤|炒|烤|煎|炸|红烧|酱|肠|串|堡|排骨|鸡腿)/,
  清淡: /(粥|汤|蒸|蛋羹|豆腐|面|青菜|水果|牛奶|米饭|馍|饺子)/,
}

/** 挑一样吃的。七成按自己的口味来，剩下三成随便吃。 */
export function pickFood(st) {
  const all = foods(true)
  if (!all.length) return null
  const f = foodState(st)
  const re = TASTE_HINT[f.taste]
  const like = re ? all.filter((x) => re.test(String(x.name || ''))) : []
  const pool = like.length && Math.random() < 0.7 ? like : all
  return pool[Math.floor(Math.random() * pool.length)]
}

/** 吃了。返回吃了什么。 */
export function eatSomething(st, name, now = Date.now()) {
  const all = foods()
  let it = name ? all.find((x) => x.name === name) : null
  if (!it) it = pickFood(st)
  if (!it) return null

  const f = foodState(st)
  const k = dayKey(now)
  if (f.todayKey !== k) { f.todayKey = k; f.todayCount = 0; f.log = [] }

  const fill = clamp(num(it.kcal, 200) / 650, 0.15, 1)
  st.hunger = clamp(num(st.hunger, 0) - fill * 6.5, 0, 10)
  st.valence = clamp(num(st.valence, 0) + 2 + fill * 1.5, -100, 100)
  st.energy = clamp(num(st.energy, 0) + 1.5, 0, 100)
  if (num(it.water, 0) >= 300) st.hunger = clamp(num(st.hunger, 0) - 1, 0, 10)

  f.lastEatAt = now
  st.water = Math.min(100, (Number(st.water) || 60) + (Number(it.water) || 0) / 25)
  if (!st.body) st.body = { weight: 52, height: 165, pendingIn: 0, dayKey: '', sleepHours: 0, debt: 0 }
  st.body.pendingIn = (Number(st.body.pendingIn) || 0) + (Number(it.kcal) || 200)
  f.todayCount += 1
  f.log = [...(f.log || []), { name: it.name, at: now }].slice(-8)
  return it
}

/** 到饭点、饿到一定程度，就自己吃一口。 */
export function mealTick(st, now = Date.now()) {
  const h = hourAt(now)
  const meal = (h >= 7 && h < 9) || (h >= 11.5 && h < 13) || (h >= 17.5 && h < 19.5)
  if (!meal) return null
  const f = foodState(st)
  if (f.todayKey !== dayKey(now)) { f.todayKey = dayKey(now); f.todayCount = 0; f.log = [] }
  if (f.todayCount >= 5) return null
  if (num(st.hunger, 0) < 5) return null
  if (now - num(f.lastEatAt, 0) < 2 * HOUR) return null
  if (Math.random() > 0.9) return null
  const stk = stockList(st)
  if (stk.length) {
    const pick = stk[Math.floor(Math.random() * stk.length)]
    return takeStock(st, pick.name)
  }
  return eatSomething(st, '', now)
}

export function foodText(st, now = Date.now()) {
  const f = foodState(st)
  const hun = num(st.hunger, 0)
  const parts = []
  if (hun >= 8) parts.push('饿得厉害，肚子在叫')
  else if (hun >= 5) parts.push('有点饿')
  else if (hun <= 1 && f.lastEatAt) parts.push('刚吃过，不饿')

  if (st.sick && st.sickName) parts.push(`嘴里没味，病着`)
  const last = f.lastEatAt ? Math.round((now - f.lastEatAt) / HOUR) : -1
  if (last >= 0 && hun >= 4) parts.push(last < 1 ? '刚吃完东西' : `${last} 小时没吃了`)
  return parts.join('，')
}

/* ============================ 作息 ============================ */

const MORNING = ['刚醒，还没完全清醒', '在窗边坐着', '煮了点东西']
const DAYTIME = ['在看海', '翻书', '发呆', '写点东西', '收拾屋子', '泡了杯茶坐着']
const EVENING = ['灯没开，坐着', '慢慢晃', '靠着窗']
const NIGHTY = ['还没睡', '躺着看天花板', '不想睡']

/** 现在大概在干什么。每两小时换一次。 */
export function activityTick(st, now = Date.now()) {
  if (!st.routine) st.routine = { act: '', actAt: 0, sleepHour: 23, wakeHour: 7 }
  const r = st.routine
  if (now - num(r.actAt, 0) < 2 * HOUR) return r
  const h = hourAt(now)
  const pool =
    h < 9 ? MORNING :
    h < 17 ? DAYTIME :
    h < 22 ? EVENING : NIGHTY
  r.act = pool[Math.floor(Math.random() * pool.length)]
  r.actAt = now
  return r
}


/* ============================ 今天的打算 ============================ */

function planDayKey(now) {
  const d = new Date(now)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}


// 她自己的一天里会挂着的几件事。不是任务清单，是「今天想做的」。
const PLAN_POOL = [
  '把昨天没洗的碗洗了',
  '去楼下买点米',
  '把那本书看完',
  '洗个头',
  '把窗台擦一下',
  '去海边走一圈',
  '把被子抱出去晒',
  '给自己煮顿正经的',
  '把头发剪短一点',
  '清一下手机里没用的东西',
  '给花浇点水',
  '把鞋刷了',
]

/** 每天第一次醒着的时候，从池子里挂一到两件事。 */
export function planTick(st, now = Date.now()) {
  const k = planDayKey(now)
  if (!st.plan) st.plan = { key: '', items: [], done: [] }
  if (st.plan.key === k) return st.plan
  const n = Math.random() < 0.55 ? 1 : 2
  const pool = PLAN_POOL.slice()
  const items = []
  for (let i = 0; i < n && pool.length; i++) {
    items.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
  }
  st.plan = { key: k, items, done: [] }
  return st.plan
}

/** 把某件事划掉。 */
export function finishPlan(st, what) {
  const p = st.plan
  if (!p || !p.items || !p.items.length) return false
  const i = p.items.findIndex((x) => x.includes(what) || what.includes(x))
  if (i < 0) return false
  p.done = [...(p.done || []), p.items[i]]
  p.items.splice(i, 1)
  return true
}

/** 今天还挂着什么。 */
export function planText(st, now = Date.now()) {
  const p = planTick(st, now)
  if (!p.items || !p.items.length) return ''
  return p.items.slice(0, 2).join('、')
}

export function isNight(now = Date.now()) {
  const h = hourAt(now)
  return h >= 23 || h < 7
}

export function routineText(st, now = Date.now()) {
  const r = activityTick(st, now)
  const h = hourAt(now)
  const when =
    h < 6 ? '凌晨' :
    h < 9 ? '早上' :
    h < 12 ? '上午' :
    h < 14 ? '中午' :
    h < 18 ? '下午' :
    h < 22 ? '晚上' : '深夜'
  if (st.sleeping) return `${when}，睡着`
  return `${when}，${r.act || '没干什么'}`
}

/* ============================ 天气 ============================ */

// [最高, 最低, 下雨概率]，按南方沿海的季节感写
const CLIMATE = {
  1: [10, 3, 0.20], 2: [12, 5, 0.24], 3: [16, 9, 0.32], 4: [22, 14, 0.34],
  5: [27, 19, 0.36], 6: [30, 23, 0.42], 7: [33, 25, 0.40], 8: [33, 25, 0.36],
  9: [30, 22, 0.30], 10: [25, 17, 0.20], 11: [19, 11, 0.18], 12: [13, 6, 0.18],
}

export function weatherTick(st, now = Date.now()) {
  if (!st.weather) st.weather = {}
  const w = st.weather
  const k = dayKey(now)
  if (w.dayKey === k && Number.isFinite(Number(w.tempC))) return w

  const m = new Date(now).getMonth() + 1
  const [hi, lo, rainP] = CLIMATE[m] || [24, 16, 0.25]
  const tempC = Math.round(lo + Math.random() * Math.max(1, hi - lo))
  const rain = Math.random() < rainP
  w.dayKey = k
  w.tempC = tempC
  w.rain = rain
  w.heavy = rain && Math.random() < 0.22
  w.snow = tempC <= 1 && rain
  w.event = ''
  if (m >= 6 && m <= 9 && rain && Math.random() < 0.08) w.event = '台风边上'
  if (m <= 2 && tempC <= 3 && Math.random() < 0.1) w.event = '寒潮'
  w.updatedAt = now
  return w
}

export function weatherText(st) {
  const w = st.weather
  if (!w || !Number.isFinite(Number(w.tempC))) return ''
  const t = w.tempC
  const tags = []
  if (w.snow) tags.push('下雪')
  else if (w.heavy) tags.push('下大雨')
  else if (w.rain) tags.push('下雨')
  if (t <= 2) tags.push('很冷')
  else if (t <= 10) tags.push('冷')
  else if (t >= 33) tags.push('很热')
  else if (t >= 28) tags.push('热')
  if (w.event) tags.push(w.event)
  return tags.join('、')
}

/** 天气给心情上的一点色。下雨发闷，太热烦躁。 */
export function weatherMood(st) {
  const w = st.weather
  if (!w || !Number.isFinite(Number(w.tempC))) return 0
  let d = 0
  if (w.rain) d -= 1.5
  if (w.tempC >= 33) d -= 1.5
  if (w.tempC <= 5) d -= 1
  return d
}

/* ============================ 恋爱 ============================ */

const SWEET = /(想你|早安|晚安|宝贝|乖|抱抱|亲亲|想见你|等你|喜欢你|爱你)/
const CARE = /(吃饭了吗|别熬|早点睡|注意身体|多喝热水|照顾好自己|冷不冷|累不累|我陪你)/
const COLD = /(忙|算了|没空|随便|不想聊|挂了|再说吧)/
const FIGHT = /(你烦不烦|别管我|受够了|你懂什么|分开|分手|讨厌你)/
const OTHER = /(别的女生|别的男生|前女友|前男友|相亲|另一个|她喜欢我|他喜欢我)/
const APOLOGY = /(对不起|我错了|别生气|是我不对|我道歉)/
const RUDE = /(滚|闭嘴|烦|蠢|笨|废物)/
// 关系里的细线：记得、忘掉、说到做到、说到没做到
const REMEMBERED = /(你还记得|我记得你说|上次你说|你那会儿说|你以前说)/
const FORGOT = /(我忘了|记不清了|想不起来|不记得了)/
const KEPT = /(我做到了|我说过会的|答应你的事做了|没忘)/
const BROKE = /(我食言|没做到|答应你的没|我又忘了)/
const LOOKS = /(好看|漂亮|可爱|好乖|真乖|想抱你)/
const BUSY = /(在忙|忙完(再)?说|等我一会儿|等下说)/
const BACKAGAIN = /(我回来了|忙完了|忙好了|回来了)/
const EXMAYBE = /(前任|前女友|前男友|以前那个|上一个人)/

export function romanceState(st) {
  if (!st.romance) {
    st.romance = { status: '单身', since: 0, nickname: '', tension: 0, jealousy: 0, lastTalk: 0 }
  }
  return st.romance
}

/** 他说一句话，感情动一下。 */
export function romanceFeel(st, text, now = Date.now()) {
  const r = romanceState(st)
  const t = String(text || '')
  if (!t) return r
  r.lastTalk = now
  const inLove = r.status === '恋爱' || r.status === '已婚'
  const aff = num(st.affinity, 0)
  const mult = (1 + Math.min(0.6, aff / 800)) * (num(st.trust, 0) >= 60 ? 1.15 : num(st.trust, 0) <= 30 ? 0.7 : 1)

  if (SWEET.test(t)) {
    st.affinity = clamp(aff + 5 * mult, 0, 100)
    st.valence = clamp(num(st.valence, 0) + 3, -100, 100)
    if (inLove) r.tension = clamp(num(r.tension, 0) - 3, 0, 100)
  }
  if (CARE.test(t)) {
    st.trust = clamp(num(st.trust, 0) + 3, 0, 100)
    st.affinity = clamp(num(st.affinity, 0) + 2 * mult, 0, 100)
    st.sadness = clamp(num(st.sadness, 0) - 4, 0, 100)
  }
  if (COLD.test(t)) {
    r.tension = clamp(num(r.tension, 0) + 4, 0, 100)
    st.valence = clamp(num(st.valence, 0) - 2, -100, 100)
  }
  if (FIGHT.test(t)) {
    r.tension = clamp(num(r.tension, 0) + 25, 0, 100)
    st.affinity = clamp(num(st.affinity, 0) - 8, 0, 100)
    st.anger = clamp(num(st.anger, 0) + 20, 0, 100)
  }
  if (inLove && OTHER.test(t)) {
    r.jealousy = clamp(num(r.jealousy, 0) + 30, 0, 100)
    r.tension = clamp(num(r.tension, 0) + 5, 0, 100)
  }
  if (APOLOGY.test(t)) {
    r.tension = clamp(num(r.tension, 0) - 20, 0, 100)
    st.trust = clamp(num(st.trust, 0) + 2, 0, 100)
    st.affinity = clamp(num(st.affinity, 0) + 2, 0, 100)
  }
  if (REMEMBERED.test(t)) {
    st.trust = clamp(num(st.trust, 0) + 4, 0, 100)
    st.valence = clamp(num(st.valence, 0) + 3, -100, 100)
    st._remembered = true
  }
  if (FORGOT.test(t)) {
    st.trust = clamp(num(st.trust, 0) - 2, 0, 100)
    st.sadness = clamp(num(st.sadness, 0) + 3, 0, 100)
  }
  if (typeof KEPT !== 'undefined' && KEPT.test(t)) {
    st.trust = clamp(num(st.trust, 0) + 6, 0, 100)
    st.valence = clamp(num(st.valence, 0) + 4, -100, 100)
  }
  if (typeof BROKE !== 'undefined' && BROKE.test(t)) {
    st.trust = clamp(num(st.trust, 0) - 10, 0, 100)
    r.tension = clamp(num(r.tension, 0) + 8, 0, 100)
  }
  if (LOOKS.test(t)) {
    st.valence = clamp(num(st.valence, 0) + 6, -100, 100)
    st.shame = clamp(num(st.shame, 0) + 8, 0, 100)
    st.affinity = clamp(num(st.affinity, 0) + 3, 0, 100)
  }
  if (BUSY.test(t)) {
    st.boredom = clamp(num(st.boredom, 0) + 6, 0, 100)
  }
  if (BACKAGAIN.test(t)) {
    st.valence = clamp(num(st.valence, 0) + 5, -100, 100)
    st.boredom = clamp(num(st.boredom, 0) - 10, 0, 100)
  }
  if (EXMAYBE.test(t) && inLove) {
    r.jealousy = clamp(num(r.jealousy, 0) + 15, 0, 100)
  }
  if (RUDE.test(t)) {
    st.affinity = clamp(num(st.affinity, 0) - 4, 0, 100)
    r.tension = clamp(num(r.tension, 0) + 8, 0, 100)
  }
  return r
}

/** 关系里自己会退的那部分：放久了就没那么气，久不找会想。 */
export function romanceTick(st, now = Date.now()) {
  const r = romanceState(st)
  const hours = Math.max(0, (now - num(st.romance.lastTickAt, now)) / HOUR)
  st.romance.lastTickAt = now
  if (!(hours > 0)) return r
  const h = Math.min(hours, 72)
  r.jealousy = clamp(num(r.jealousy, 0) - 9 * h, 0, 100)
  r.tension = clamp(num(r.tension, 0) - 6 * h, 0, 100)
  if (r.status === '恋爱' || r.status === '已婚') {
    const quiet = (now - num(r.lastTalk, now)) / HOUR
    if (quiet > 12) {
      st.sadness = clamp(num(st.sadness, 0) + 1.2 * h, 0, 100)
      st.boredom = clamp(num(st.boredom, 0) + 1.5 * h, 0, 100)
    }
  }
  return r
}

const FEST = {
  '01-01': '元旦', '02-14': '情人节', '05-20': '520', '08-25': '七夕',
  '10-01': '国庆', '12-24': '平安夜', '12-25': '圣诞',
}

export function upcomingFestival(now = Date.now()) {
  for (let i = 0; i <= 5; i += 1) {
    const d = new Date(now + i * DAY)
    const key = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (FEST[key]) return { name: FEST[key], days: i, key }
  }
  return null
}

const STATUS_LINE = {
  单身: '你一个人',
  喜欢: '心里有点喜欢他，还没说破',
  恋爱: '跟他在一起了',
  已婚: '跟他结了婚',
  前任: '跟他分开了',
}

export function romanceText(st, now = Date.now()) {
  const r = romanceState(st)
  const parts = []
  const line = STATUS_LINE[r.status] || ''
  if (!line) return ''

  let s = `【感情】${line}`
  if (r.since && (r.status === '恋爱' || r.status === '已婚')) {
    const d = Math.floor((now - num(r.since, 0)) / DAY)
    if (d >= 1) s += `，第 ${d} 天`
  }
  const extra = []
  if (num(r.tension, 0) >= 50) extra.push('心里憋着气')
  else if (num(r.tension, 0) >= 25) extra.push('有点闷')
  if (num(r.jealousy, 0) >= 40) extra.push('有点吃醋')
  if (num(st.trust, 0) <= 30 && r.status !== '单身' && r.status !== '前任') extra.push('不太信他')
  if (extra.length) s += `，${extra.join('、')}`
  s += '。'

  if (r.nickname) s += `你现在这么叫他：${r.nickname}。`
  const up = upcomingFestival(now)
  if (up && up.days <= 5 && r.status !== '单身' && r.status !== '前任') {
    s += up.days === 0 ? `今天是${up.name}。` : `${up.days} 天后是${up.name}。`
  }
  return s
}

export const ROMANCE_ACTIONS = {
  like: '喜欢', date: '恋爱', marry: '已婚', breakup: '前任', divorce: '前任', single: '单身',
}


// 存吃的：他给了几份，就进柜子
export function addStock(st, name, n = 1) {
  if (!st.food) st.food = {}
  if (!st.food.stock) st.food.stock = {}
  st.food.stock[name] = (st.food.stock[name] || 0) + n
  return st.food.stock[name]
}

// 柜子里还有什么
export function stockList(st) {
  const s = (st.food && st.food.stock) || {}
  return Object.entries(s).filter(([, n]) => n > 0).map(([name, n]) => ({ name, n }))
}

// 从柜子里拿一份吃
export function takeStock(st, name) {
  const s = (st.food && st.food.stock) || {}
  if (!s[name] || s[name] <= 0) return false
  s[name] -= 1
  if (s[name] <= 0) delete s[name]
  eatSomething(st, name)
  return true
}

/* ── 经期的细节 ───────────────────────────── */

/**
 * 不是"来例假了"一句话。头两天和快干净是两回事。
 * 第一两天量最多、肚子绞；三四天转成腰坠；后面快干净人是空的。
 */
export function periodDetail(day) {
  if (day <= 1) return { feel: '量最多的一天，肚子一阵一阵绞', cap: '两小时就得换' }
  if (day === 2) return { feel: '还是多，腰坠得厉害，站起来要先缓一下', cap: '三四小时换一次' }
  if (day === 3) return { feel: '少了些，人开始发困', cap: '' }
  if (day === 4) return { feel: '快干净了，只有一点', cap: '' }
  return { feel: '收尾，人有点虚', cap: '' }
}

/* ── 窗外和屋里 ───────────────────────────── */

const OUTSIDE = {
  day: ['楼下有人说话', '有狗在叫', '一辆车过去', '有人在敲东西', '远处有船笛', '小孩在哭', '楼上拖椅子'],
  night: ['有人在楼道说话', '远处有车', '风把什么东西吹得响', '隔壁在看电视', '很静，静得能听见冰箱'],
}

const INSIDE = [
  '灯有一盏不太亮',
  '水龙头在滴水',
  '桌上有两只没洗的碗',
  '窗没关严，有风',
  '地上有点灰',
  '椅子的一条腿不平',
  '镜子有点花',
  '插座上插满了',
]

/** 今天窗外有什么。一天换一次。 */
export function outsideTick(st, now = Date.now()) {
  const k = dayKeyStr(now)
  st.outside = st.outside || { key: '', sound: '' }
  if (st.outside.key === k) return st.outside
  const h = hourAt(now)
  const pool = h >= 22 || h < 6 ? OUTSIDE.night : OUTSIDE.day
  st.outside = { key: k, sound: pool[Math.floor(Math.random() * pool.length)] }
  return st.outside
}

/** 屋里有一件小事一直没弄。 */
export function insideTick(st, now = Date.now()) {
  st.inside = st.inside || { key: '', thing: '' }
  const k = dayKeyStr(now)
  if (st.inside.key === k) return st.inside
  st.inside = { key: k, thing: Math.random() < 0.6 ? INSIDE[Math.floor(Math.random() * INSIDE.length)] : '' }
  return st.inside
}

function dayKeyStr(now) {
  const d = new Date(now)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/** 换季：该收该拿的衣服。 */
export function seasonText(now = Date.now()) {
  const m = new Date(now).getMonth() + 1
  if (m === 3 || m === 4) return '该把厚的收起来了'
  if (m === 10 || m === 11) return '厚的该拿出来了'
  if (m === 7 || m === 8) return '被子薄得有点透'
  if (m === 12 || m === 1) return '被子凉，得先捂一会儿'
  return ''
}
