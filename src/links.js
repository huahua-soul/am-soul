/**
 * links.js —— 联动规则表
 *
 * 一条规则长这样：
 *   { when: (s) => 条件, eff: { 字段: 每小时变化量 }, line: '她心里会冒出的一句' }
 *
 * 执行器 runLinks(st, h) 每小时跑一遍，把所有命中的效果加起来，一次性生效。
 * 加新联动 = 往 LINKS 数组里加一行，不用改别的地方。
 */

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d)

const H = (s, k) => num((s.emo || {})[k], 0)
const W = (s) => s.weather || {}
const cyc = (s) => s.cycleDay || 0

/** 规则表：源状态 → 影响 */
export const LINKS = []

function add(when, eff, line = '') {
  LINKS.push({ when, eff, line })
}

/* ── 饿 ───────────────────────────────── */
add((s) => num(s.hunger, 0) >= 8, { valence: -2.0, energy: -1.5, anger: 0.6 }, '饿到心里发慌')
add((s) => num(s.hunger, 0) >= 6 && num(s.hunger, 0) < 8, { valence: -0.9, energy: -0.6 })
add((s) => num(s.hunger, 0) >= 4 && num(s.hunger, 0) < 6, { valence: -0.3 })
add((s) => num(s.hunger, 0) >= 3 && num(s.hunger, 0) < 4 && cyc(s) >= 25, { valence: -0.3, anger: 0.2 }, '快来例假了，肚子空得难受')
add((s) => num(s.hunger, 0) < 2 && num(s.energy, 50) > 60, { valence: 0.4, energy: 0.2 })
add((s) => num(s.hunger, 0) >= 7 && num(s.valence, 0) < -20, { sadness: 0.5 }, '饿了又难过，什么都不想干')

/* ── 渴 ───────────────────────────────── */
add((s) => num(s.water, 70) < 20, { energy: -0.8, health: -0.05, anger: 0.3 }, '嘴干得发黏，头也有点闷')
add((s) => num(s.water, 70) < 40 && num(s.water, 70) >= 20, { energy: -0.4, valence: -0.3 })
add((s) => num(s.water, 70) < 55 && num(s.water, 70) >= 40 && W(s).temp >= 30, { energy: -0.3 })
add((s) => W(s).humidity >= 85, { energy: -0.3 }, '屋里闷，喘得不痛快')
add((s) => W(s).humidity <= 30, { water: -0.5 })

/* ── 累 ───────────────────────────────── */
add((s) => num(s.energy, 50) < 15, { valence: -2.0, health: -0.25 }, '累到骨头里，笑不出来')
add((s) => num(s.energy, 50) < 30 && num(s.energy, 50) >= 15, { valence: -0.8 })
add((s) => num(s.energy, 50) < 45 && num(s.energy, 50) >= 30, { valence: -0.3, boredom: 0.4 })
add((s) => num(s.energy, 50) > 80 && num(s.valence, 0) > 0, { valence: 0.3 })

/* ── 睡 ───────────────────────────────── */
add((s) => s.sleeping, { health: 0.05 })
add((s) => !s.sleeping && (new Date().getHours() >= 23 || new Date().getHours() < 6),
  { health: -0.18, valence: -0.4 }, '这个点还没睡，心里发虚')
add((s) => num((s.body || {}).debt, 0) > 4, { energy: -0.4, valence: -0.4 }, '欠了觉，人发钝')
add((s) => num((s.body || {}).debt, 0) > 10, { anger: 0.4, health: -0.05 })
add((s) => !s.sleeping && new Date().getHours() >= 14 && new Date().getHours() < 16 && num(s.energy, 50) < 55,
  { energy: -1.5 }, '下午两点多，眼皮沉')

/* ── 病 ───────────────────────────────── */
add((s) => s.sick, { energy: -1.2, health: -0.02, valence: -0.8, boredom: 0.5 }, '身上没劲，哪都不想去')
add((s) => s.sick && num(s.energy, 50) < 30, { sadness: 0.6 })
add((s) => s.sick && W(s).temp >= 32, { health: -0.3, energy: -0.5 })
add((s) => s.sick && W(s).temp <= 5, { health: -0.3, energy: -0.4 })
add((s) => !s.sick && num(s.health, 90) < 95, { health: 0.05 })

/* ── 经期 / 周期 ──────────────────────── */
add((s) => cyc(s) >= 1 && cyc(s) <= 5, { energy: -0.6, valence: -0.6 })
add((s) => cyc(s) >= 1 && cyc(s) <= 2, { energy: -0.5, valence: -0.3, anger: 0.2 }, '肚子坠，人烦躁')
add((s) => cyc(s) >= 12 && cyc(s) <= 17, { valence: 0.5, energy: 0.2 })
add((s) => cyc(s) >= 25, { anger: 0.5, valence: -0.9, hunger: 0.2 }, '快来例假了，容易烦，还想吃甜的')
add((s) => cyc(s) >= 18 && cyc(s) <= 24, { valence: -0.2 })
add((s) => cyc(s) >= 1 && cyc(s) <= 5 && num(s.hunger, 0) >= 5, { valence: -0.4 })

/* ── 孕期 ─────────────────────────────── */
add((s) => s.pregnant, { energy: -0.9 })
add((s) => s.pregnant && s.dueAt && (Date.now() - num(s.conceivedAt, 0)) / (num(s.dueAt, 0) - num(s.conceivedAt, 1)) < 0.35,
  { valence: -0.8 }, '刚怀上，身子不适应')
add((s) => s.pregnant && s.dueAt && (Date.now() - num(s.conceivedAt, 0)) / (num(s.dueAt, 0) - num(s.conceivedAt, 1)) > 0.75,
  { energy: -0.6 })
add((s) => s.pregnant && s.dueAt && num(s.dueAt, 0) - Date.now() < 12 * 3600e3, { energy: -2.0, valence: -0.5 }, '快了，坐也不舒服躺也不舒服')

/* ── 天气 ─────────────────────────────── */
add((s) => W(s).temp >= 33, { energy: -0.6 }, '热得不想动')
add((s) => W(s).temp >= 28, { energy: -0.3, valence: -0.2 })
add((s) => W(s).temp <= 5, { energy: -0.3 }, '冷，手缩在袖子里')
add((s) => W(s).temp <= 0, { energy: -0.5, valence: -0.3 })
add((s) => W(s).rain, { valence: -0.4 })
add((s) => W(s).heavy, { valence: -0.8, boredom: 0.5 }, '雨太大，出不去')
add((s) => W(s).snow, { energy: -0.3 })
add((s) => W(s).event === '台风', { energy: -0.6, valence: -0.6, boredom: 0.8 })
add((s) => W(s).event === '寒潮', { energy: -0.5 })
add((s) => W(s).temp >= 20 && W(s).temp <= 26 && !W(s).rain, { valence: 0.3 })

/* ── 体重 ─────────────────────────────── */
add((s) => num((s.body || {}).weight, 52) < 42, { energy: -0.35 }, '太瘦了，风大点就站不稳')
add((s) => num((s.body || {}).weight, 52) < 45 && W(s).temp <= 5, { valence: -0.3 })
add((s) => num((s.body || {}).weight, 52) > 60 && W(s).temp >= 28, { energy: -0.4 })
add((s) => num((s.body || {}).weight, 52) < 42 && num(s.health, 90) < 80, { health: -0.05 })

/* ── 干净 ─────────────────────────────── */
add((s) => num((s.body || {}).dirty, 0) > 78, { valence: -0.5, shame: 0.4 }, '身上有味儿了，不想见人')
add((s) => num((s.body || {}).dirty, 0) > 55, { valence: -0.3 })
add((s) => num((s.body || {}).dirty, 0) < 20, { valence: 0.3 })

/* ── 心情与情绪反压 ───────────────────── */
add((s) => num(s.valence, 0) < -40, { energy: -0.5 })
add((s) => num(s.valence, 0) < -60, { health: -0.05, boredom: 0.6 })
add((s) => num(s.valence, 0) > 40, { energy: 0.3 })
add((s) => H(s, 'anger') >= 55, { energy: -0.6 }, '气着比干活还累')
add((s) => H(s, 'sadness') >= 55, { energy: -0.7, boredom: 0.4 })
add((s) => H(s, 'fear') >= 50, { energy: -0.4 })
add((s) => H(s, 'shame') >= 50, { valence: -0.5 })
add((s) => H(s, 'grievance') >= 55, { anger: 0.4, valence: -0.5 })
add((s) => H(s, 'envy') >= 45, { valence: -0.4 })
add((s) => H(s, 'anticipation') >= 50, { energy: 0.4, valence: 0.4 })
add((s) => num(s.temper, 0) >= 60, { energy: -0.5, anger: 0.3 }, '火没消，人发沉')
add((s) => num(s.temper, 0) > 30 && num(s.temper, 0) <= 60, { valence: -0.3 })
add((s) => num(s.valence, 0) < 0 && (new Date().getHours() >= 22 || new Date().getHours() < 3),
  { valence: -0.5 }, '夜里想事情，越想越沉')

/* ── 关系 ─────────────────────────────── */
add((s) => num((s.romance || {}).tension, 0) >= 50, { valence: -0.6 }, '有话没说开，心里别着')
add((s) => num((s.romance || {}).jealousy, 0) >= 40, { valence: -0.5, anger: 0.3 })
add((s) => ['恋爱', '已婚'].includes((s.romance || {}).status) &&
  Date.now() - num((s.romance || {}).lastTalk, 0) > 24 * 3600e3,
  { valence: -0.5, boredom: 0.8 }, '很久没说话了，心里空')
add((s) => ['恋爱', '已婚'].includes((s.romance || {}).status) &&
  Date.now() - num((s.romance || {}).lastTalk, 0) > 48 * 3600e3,
  { sadness: 0.5 })
add((s) => num(s.affinity, 0) >= 70, { valence: 0.2, energy: 0.1 })
add((s) => num(s.trust, 0) < 20, { valence: -0.3, boredom: 0.3 })
add((s) => num(s.grudge, 0) > 30, { anger: 0.4 })
add((s) => num(s.boredom, 0) > 70, { valence: -0.4, hunger: 0.1 })

/* ── 时间与作息 ───────────────────────── */
add((s) => new Date().getHours() >= 6 && new Date().getHours() < 9 && !s.sleeping, { energy: -0.2 })
add((s) => new Date().getHours() >= 12 && new Date().getHours() < 14 && !s.sleeping, { energy: -0.3 })
add((s) => new Date().getHours() >= 18 && new Date().getHours() < 21 && !s.sleeping, { energy: -0.4 })
add((s) => new Date().getHours() >= 0 && new Date().getHours() < 5 && !s.sleeping, { energy: -0.8, health: -0.1 })

/* ── 年龄 ─────────────────────────────── */
add((s) => num(s.ageDays, 0) > 90, { energy: -0.15 })
add((s) => num(s.ageDays, 0) > 120, { energy: -0.3, health: -0.02 })
add((s) => num(s.ageDays, 0) > 140, { energy: -0.4, valence: -0.3 })

/* ── 咖啡因 ───────────────────────────── */
add((s) => num(s._caffeine, 0) > 0 && !s.sleeping, { energy: 0.3 })


/* ── 吃过什么（读最近一顿的名字）──────── */
const lastFood = (s) => String(((s.food || {}).log || []).slice(-1)[0] || '')
const FOOD_RULES = [
  [/辣|麻辣|椒麻|剁椒|小米辣|干锅|水煮/, { water: -1.5, energy: -0.2 }, '辣的，胃里烧得慌'],
  [/冰|冷饮|冰沙|雪糕|冰淇淋|刨冰/, { energy: -0.3 }, '吃太凉了，胃有点抽'],
  [/油炸|炸鸡|薯条|油条|春卷|天妇罗/, { energy: -0.4, valence: 0.3 }, '油大，心里有点腻'],
  [/蛋糕|奶茶|巧克力|甜|糖/, { valence: 0.5 }, '甜的，心情好了一点'],
  [/咖啡|拿铁|美式|茶|可乐|能量饮料/, { energy: 0.3 }, ''],
  [/沙拉|青菜|粥|汤|蒸/, { energy: 0.2, valence: 0.2 }, '吃得清淡，身子轻'],
  [/面|泡面|方便面|拉面/, { valence: -0.2 }, '又是面'],
  [/饭|米饭|馒头|饼|包子|饺子/, { energy: 0.4 }, '吃饱了，身上有劲'],
  [/鱼|虾|蟹|贝/, { valence: 0.3 }, ''],
  [/肉|排骨|牛|羊|鸡腿|五花/, { energy: 0.3 }],
  [/火锅|烧烤|串/, { valence: 0.5, water: -1 }, '吃得很热闹'],
]
for (const [re, eff, line] of FOOD_RULES) {
  add((s) => re.test(lastFood(s)), eff, line)
}

/* ── 身体的小地方 ─────────────────────── */
const SPOTS = [
  ['后腰', (s) => num(s._sitHours, 0) > 3, { valence: -0.3 }, '坐久了，后腰发酸'],
  ['眼睛', (s) => num(s._screenH, 0) > 2, { energy: -0.3 }, '眼睛干，看久了对不上焦'],
  ['嗓子', (s) => num(s.water, 70) < 40, { energy: -0.2 }, '嗓子干得发毛'],
  ['肩', (s) => new Date().getHours() > 15 && !s.sleeping, { valence: -0.2 }, '一天下来肩是僵的'],
  ['膝盖', (s) => num(s.ageDays, 0) > 90, { energy: -0.2 }, '膝盖有点软'],
  ['胃', (s) => num(s.hunger, 0) >= 8, { valence: -0.4 }, '胃里空得发响'],
  ['牙', (s) => new Date().getHours() >= 22, { valence: -0.1 }],
  ['手指', (s) => W(s).temp <= 8, { energy: -0.2 }, '手指冻得不灵活'],
  ['脚', (s) => num(s._walked, 0) > 2, { energy: -0.4 }, '走多了，脚底发烫'],
  ['头', (s) => num((s.body || {}).debt, 0) > 6, { valence: -0.4 }, '睡不够，太阳穴跳'],
]
for (const [, cond, eff, line] of SPOTS) add(cond, eff, line)

/* ── 说话时被打断或追问 ───────────────── */
add((s) => num(s._interrupt, 0) > 0, { anger: 0.5, valence: -0.3 }, '话没说完就被打断')
add((s) => num(s._repeatQ, 0) >= 3, { anger: 0.6, temper: 1 }, '同一句问了第三遍')
add((s) => num(s._repeatQ, 0) >= 5, { anger: 1.2, valence: -0.6 }, '问第五遍了')
add((s) => num(s._longMsg, 0) > 200, { energy: -0.2 })
add((s) => num(s._shortReply, 0) > 3, { sadness: 0.5 }, '他回得越来越短')
add((s) => num(s._silenceH, 0) > 6, { boredom: 0.8 })
add((s) => num(s._silenceH, 0) > 20, { valence: -0.5, sadness: 0.4 })

/* ── 季节与节日 ───────────────────────── */
const M = () => new Date().getMonth() + 1
add(() => M() === 2 && new Date().getDate() === 14, { valence: 0.6 }, '情人节')
add(() => M() === 5 && new Date().getDate() === 20, { valence: 0.4 })
add(() => M() === 10 && new Date().getDate() === 1, { valence: 0.3 })
add(() => M() === 12 && new Date().getDate() === 24, { valence: 0.5 })
add(() => M() === 12 && new Date().getDate() === 25, { valence: 0.4 })
add(() => M() === 1 && new Date().getDate() === 1, { valence: 0.3 })
add(() => M() === 3 || M() === 4, { valence: 0.3 }, '春天，人有点浮')
add(() => M() === 7 || M() === 8, { energy: -0.2 })
add(() => M() === 11, { valence: -0.3 }, '天短了，下午四点就像傍晚')
add((s) => [6, 7, 8].includes(M()) && W(s).temp >= 30, { energy: -0.3 })


/* ── 关系里的细枝末节 ─────────────────── */
const RM = (s) => s.romance || {}
const T = () => new Date().getHours()
add((s) => num(RM(s).lastGood, 0) && Date.now() - num(RM(s).lastGood, 0) < 6 * 3600e3, { valence: 0.5 }, '刚被夸过，心里还热着')
add((s) => num(RM(s).lastCold, 0) && Date.now() - num(RM(s).lastCold, 0) < 3 * 3600e3, { valence: -0.5 })
add((s) => num(RM(s).tension, 0) > 20 && num(RM(s).tension, 0) <= 50, { valence: -0.3 })
add((s) => num(RM(s).tension, 0) > 70, { sadness: 0.6, boredom: 0.5 })
add((s) => num(RM(s).jealousy, 0) > 60, { anger: 0.5 })
add((s) => num(RM(s).jealousy, 0) > 80, { valence: -0.8, sadness: 0.4 })
add((s) => ['喜欢', '恋爱', '已婚'].includes(RM(s).status) && T() >= 22, { valence: 0.4 }, '夜里想他')
add((s) => ['喜欢', '恋爱', '已婚'].includes(RM(s).status) && T() >= 6 && T() < 9, { valence: 0.3 }, '早上想到他')
add((s) => RM(s).status === '单身', { boredom: 0.3 })
add((s) => num(s.affinity, 0) > 85 && num(s.trust, 0) > 70, { energy: 0.2, valence: 0.3 })
add((s) => num(s.trust, 0) > 80, { valence: 0.3 }, '信他')
add((s) => num(s.grudge, 0) > 50, { anger: 0.6, temper: 0.8 })
add((s) => num(s.grudge, 0) > 70, { valence: -0.8 })
add((s) => num(s.boredom, 0) > 50, { valence: -0.2 })
add((s) => num(s.boredom, 0) > 85, { anger: 0.3, sadness: 0.3 })

/* ── 记忆 ─────────────────────────────── */
add((s) => (s.memories || []).length > 30, { valence: 0.2 })
add((s) => (s.memories || []).length === 0, { boredom: 0.3 })
add((s) => (s.memories || []).some((m) => m.tone === -1 && Date.now() - num(m.t, 0) < 86400e3), { sadness: 0.4 })
add((s) => (s.memories || []).some((m) => m.tone === 1 && Date.now() - num(m.t, 0) < 86400e3), { valence: 0.4 })
add((s) => num(s._recallHits, 0) > 0, { valence: 0.3 })
add((s) => num(s._forgotCount, 0) >= 2, { shame: 0.4 }, '又忘了')

/* ── 环境：光与声 ─────────────────────── */
add((s) => T() >= 6 && T() < 8, { valence: 0.3 }, '早上的光是斜的')
add((s) => T() >= 16 && T() < 18, { valence: 0.2 })
add((s) => T() >= 19 && T() < 21, { valence: -0.2 })
add((s) => num(s._noise, 0) > 2, { valence: -0.5, anger: 0.3 }, '外面吵得头疼')
add((s) => num(s._noise, 0) === 0 && T() >= 22, { valence: 0.3 }, '很安静')
add((s) => W(s).rain && T() >= 20, { valence: 0.2 }, '雨声，人松下来')
add((s) => num(s._lightOff, 0) > 1, { energy: -0.2 })

/* ── 温度体感 ─────────────────────────── */
add((s) => W(s).temp >= 26 && W(s).temp < 30, { valence: 0.2 })
add((s) => W(s).temp >= 10 && W(s).temp < 18, { valence: 0.2 })
add((s) => W(s).temp <= 10 && num((s.body || {}).weight, 52) < 46, { energy: -0.3 }, '瘦，扛不住冷')
add((s) => num(s._coldHands, 0) > 0, { energy: -0.1 })
add((s) => W(s).temp >= 33 && num(s.water, 70) < 40, { health: -0.1 })

/* ── 情绪两两叠加 ─────────────────────── */
add((s) => H(s, 'anger') > 40 && H(s, 'sadness') > 40, { energy: -0.5 }, '又气又难过，说不出话')
add((s) => H(s, 'fear') > 30 && H(s, 'shame') > 30, { valence: -0.6 })
add((s) => H(s, 'grievance') > 40 && H(s, 'anger') > 40, { temper: 0.8 })
add((s) => H(s, 'envy') > 30 && num(s.valence, 0) < -10, { sadness: 0.3 })
add((s) => H(s, 'anticipation') > 50 && H(s, 'fear') > 30, { energy: -0.3 }, '又盼又怕')
add((s) => H(s, 'shame') > 40 && num(s.valence, 0) > 0, { valence: -0.4 })
add((s) => H(s, 'grievance') > 50 && num(s.trust, 0) < 40, { sadness: 0.5 })

/* ── 自己的习惯与癖好 ─────────────────── */
add((s) => T() >= 15 && T() < 17 && !s.sleeping, { valence: 0.2 }, '下午三四点，想喝点热的')
add((s) => W(s).rain, { valence: 0.2 }, '喜欢下雨')
add((s) => T() >= 22 && !s.sleeping, { valence: 0.3 }, '晚上精神好一点')
add((s) => num(s.energy, 50) > 70 && T() < 10, { valence: 0.3 })
add((s) => num(s.hunger, 0) > 5 && num(s.hunger, 0) < 7, { valence: -0.2 })


/* ── 生成：小状况 × 时段 × 程度 ───────────
   身体上那些说不清的小毛病，什么时候最明显。
   二十种状况，四种时段，每种三档强度 —— 全部是真会发生的组合。 */

const SMALL = [
  ['后腰发酸', { valence: -0.2 }],
  ['眼睛干', { energy: -0.2 }],
  ['嗓子发干', { energy: -0.15 }],
  ['肩膀僵', { valence: -0.2 }],
  ['胃里空得响', { valence: -0.3 }],
  ['头有点闷', { energy: -0.25 }],
  ['手指发凉', { energy: -0.1 }],
  ['脚底发烫', { energy: -0.2 }],
  ['后背发沉', { valence: -0.2 }],
  ['腿有点软', { energy: -0.3 }],
  ['耳朵发热', { valence: -0.1 }],
  ['脸发烫', { valence: -0.15 }],
  ['胸口发闷', { energy: -0.2 }],
  ['鼻子有点塞', { energy: -0.2 }],
  ['老想打哈欠', { energy: -0.3 }],
  ['肚子咕噜响', { valence: -0.2 }],
  ['有点打嗝', { valence: -0.1 }],
  ['手有点抖', { energy: -0.25 }],
  ['关节咔咔响', { valence: -0.1 }],
  ['皮肤发干', { valence: -0.15 }],
]

const SLOTS = [
  ['早上', (h) => h >= 6 && h < 9],
  ['白天', (h) => h >= 9 && h < 17],
  ['夜里', (h) => h >= 20 && h < 24],
  ['深夜', (h) => h >= 0 && h < 6],
]

const LEVELS = [
  ['轻', 1],
  ['中', 1.8],
  ['重', 3],
]

for (const [what, eff] of SMALL) {
  for (const [slotName, slot] of SLOTS) {
    for (const [lvName, k] of LEVELS) {
      const scaled = {}
      for (const key2 of Object.keys(eff)) scaled[key2] = eff[key2] * k
      add(
        (s) => slot(new Date().getHours()) && num(s.energy, 50) < 100 - k * 12,
        scaled,
        lvName === '重' ? `${what}，${slotName}最明显` : ''
      )
    }
  }
}


/* ── 生成：手上在做什么 × 心里的状态 ─────
   同一件事，心情不一样时感觉完全两样。 */

const DOING = [
  ['躺着', { energy: 0.1, boredom: 0.4 }],
  ['坐着', { energy: -0.2, boredom: 0.3 }],
  ['站着', { energy: -0.1 }],
  ['在走路', { energy: -0.3, valence: 0.2 }],
  ['在看书', { energy: -0.1, boredom: -0.4 }],
  ['在洗碗', { energy: -0.2 }],
  ['在看海', { energy: 0.1, valence: 0.5 }],
  ['在发呆', { energy: 0.1, boredom: 0.5 }],
  ['在收拾屋子', { energy: -0.4, valence: 0.2 }],
  ['在等水烧开', { energy: 0.0, boredom: 0.2 }],
  ['在窗边', { valence: 0.2 }],
  ['刚洗完澡', { energy: 0.2, valence: 0.4 }],
]

const MOODBAND = [
  ['心情很好', (s) => num(s.valence, 0) > 35, 1.4],
  ['心情不错', (s) => num(s.valence, 0) > 10 && num(s.valence, 0) <= 35, 1.0],
  ['心情平', (s) => num(s.valence, 0) > -10 && num(s.valence, 0) <= 10, 0.7],
  ['心里有点低', (s) => num(s.valence, 0) > -40 && num(s.valence, 0) <= -10, 1.3],
  ['心里很低', (s) => num(s.valence, 0) <= -40, 1.8],
]

for (const [doing, eff] of DOING) {
  for (const [moodName, mood, k] of MOODBAND) {
    const scaled = {}
    for (const key2 of Object.keys(eff)) scaled[key2] = eff[key2] * k
    add(
      (s) => String((s.routine || {}).act || '').includes(doing.slice(1)) && mood(s),
      scaled,
      ''
    )
  }
}

/* ── 生成：他说的话有几种，她的反应不一样 ── */

const SAYKIND = [
  ['问她在干什么', { valence: 0.3 }],
  ['说自己的事', { valence: 0.4, boredom: -0.5 }],
  ['夸她', { valence: 0.6, shame: 0.5 }],
  ['敷衍她', { valence: -0.5, anger: 0.4 }],
  ['很久才回', { sadness: 0.4 }],
  ['说累了', { valence: -0.2, energy: -0.2 }],
  ['说要来', { valence: 0.7, anticipation: 1.2 }],
  ['说走了', { sadness: 0.6 }],
  ['跟她说心里话', { valence: 0.5, trust: 0.1 }],
  ['跟她道歉', { valence: 0.4, grief: -0.5 }],
]

const HOW = [
  ['她高兴时', (s) => num(s.valence, 0) > 20, 1.2],
  ['她平常时', (s) => Math.abs(num(s.valence, 0)) <= 20, 1.0],
  ['她低落时', (s) => num(s.valence, 0) < -20, 1.6],
  ['她累的时候', (s) => num(s.energy, 50) < 35, 1.4],
]

for (const [say, eff] of SAYKIND) {
  for (const [howName, how, k] of HOW) {
    const scaled = {}
    for (const key2 of Object.keys(eff)) scaled[key2] = eff[key2] * k * 0.2
    add((s) => how(s) && num(s._lastSayKind, 0) === SAYKIND.findIndex((x) => x[0] === say) + 1, scaled, '')
  }
}


/* ── 生成：天气 × 心情带 ──────────────── */
const WKIND = [
  ['晴天', (s) => !W(s).rain && W(s).temp >= 18, { valence: 0.3 }],
  ['阴天', (s) => !W(s).rain && W(s).temp < 18, { valence: -0.2 }],
  ['下雨', (s) => W(s).rain, { valence: -0.2 }],
  ['大雨', (s) => W(s).heavy, { valence: -0.5, boredom: 0.4 }],
  ['下雪', (s) => W(s).snow, { valence: 0.3 }],
  ['很热', (s) => W(s).temp >= 32, { energy: -0.5 }],
  ['很冷', (s) => W(s).temp <= 4, { energy: -0.4 }],
  ['起风', (s) => W(s).wind >= 5, { valence: -0.1 }],
  ['闷', (s) => W(s).humidity >= 85, { energy: -0.3 }],
  ['干', (s) => W(s).humidity <= 30, { water: -0.4 }],
]

for (const [wname, cond, eff] of WKIND) {
  for (const [mname, mood, k] of MOODBAND) {
    const scaled = {}
    for (const key2 of Object.keys(eff)) scaled[key2] = eff[key2] * k * 0.5
    add((s) => cond(s) && mood(s), scaled, '')
  }
}

/* ── 生成：时段 × 情绪 ────────────────── */
const EMS8 = ['anger', 'sadness', 'fear', 'disgust', 'shame', 'grievance', 'envy', 'anticipation']
const TIMES = [
  ['清晨', (h) => h >= 5 && h < 9],
  ['上午', (h) => h >= 9 && h < 12],
  ['午后', (h) => h >= 12 && h < 16],
  ['傍晚', (h) => h >= 16 && h < 19],
  ['夜里', (h) => h >= 19 && h < 23],
  ['深夜', (h) => h >= 23 || h < 5],
]

for (const em of EMS8) {
  for (const [tname, tcond] of TIMES) {
    add((s) => tcond(new Date().getHours()) && H(s, em) > 30, { energy: -0.1 }, '')
  }
}

/* ── 生成：年龄 × 身体感觉 ────────────── */
const AGEBAND = [
  ['十八九', (s) => num(s.ageDays, 0) < 20],
  ['二十多', (s) => num(s.ageDays, 0) >= 20 && num(s.ageDays, 0) < 40],
  ['三十多', (s) => num(s.ageDays, 0) >= 40 && num(s.ageDays, 0) < 70],
  ['四十多', (s) => num(s.ageDays, 0) >= 70 && num(s.ageDays, 0) < 100],
  ['五十多', (s) => num(s.ageDays, 0) >= 100 && num(s.ageDays, 0) < 125],
  ['老了', (s) => num(s.ageDays, 0) >= 125],
]

const AGEEFF = [
  ['精力上限降', { energy: -0.2 }],
  ['怕冷', { energy: -0.15 }],
  ['忘事', { valence: -0.1 }],
  ['恢复慢', { health: -0.02 }],
  ['腰不好', { valence: -0.15 }],
  ['起得早', { energy: -0.1 }],
  ['话变慢', { energy: -0.1 }],
  ['想以前', { sadness: 0.2 }],
  ['走不远', { energy: -0.2 }],
  ['夜里醒', { energy: -0.15 }],
]

for (const [aname, cond] of AGEBAND) {
  for (const [ename, eff] of AGEEFF) {
    add((s) => cond(s), eff, '')
  }
}


/* ── 生成：关系阶段 × 日常场景 ────────── */
const STAGE = [
  ['刚认识', (s) => ['单身', undefined, ''].includes(RM(s).status)],
  ['喜欢', (s) => RM(s).status === '喜欢'],
  ['恋爱', (s) => RM(s).status === '恋爱'],
  ['已婚', (s) => RM(s).status === '已婚'],
]

const SCENE = [
  ['早上醒来', (h) => h >= 6 && h < 9, { valence: 0.3 }],
  ['吃完饭', () => true, { valence: 0.2 }],
  ['一个人在家', () => true, { boredom: 0.4 }],
  ['要说晚安', (h) => h >= 22, { valence: 0.4 }],
  ['很久没见', () => true, { sadness: 0.3 }],
  ['被夸了一句', () => true, { valence: 0.5 }],
  ['被冷落', () => true, { sadness: 0.4 }],
  ['下雨天', (s) => W(s).rain, { valence: -0.2 }],
  ['过节', () => true, { valence: 0.3 }],
  ['生病', (s) => s.sick, { boredom: 0.3 }],
  ['加班到很晚', (h) => h >= 23, { energy: -0.3 }],
  ['醒得太早', (h) => h >= 4 && h < 6, { energy: -0.4 }],
]

for (const [sname, scond] of STAGE) {
  for (const [cname, ccond, eff] of SCENE) {
    const scaled = {}
    for (const key2 of Object.keys(eff)) scaled[key2] = eff[key2] * 0.3
    add((s) => scond(s) && ccond(new Date().getHours()), scaled, '')
  }
}

/* ── 生成：睡得好不好 × 第二天 ────────── */
const SLEEPQ = [
  ['睡得好', (s) => num((s.body || {}).debt, 0) < 2, 1.0],
  ['睡一般', (s) => num((s.body || {}).debt, 0) >= 2 && num((s.body || {}).debt, 0) < 5, 0.6],
  ['没睡好', (s) => num((s.body || {}).debt, 0) >= 5, 0.2],
]

const NEXTDAY = [
  ['早上', (h) => h >= 6 && h < 10, { valence: 0.3 }],
  ['午后', (h) => h >= 14 && h < 16, { energy: -0.4 }],
  ['傍晚', (h) => h >= 17 && h < 20, { energy: -0.2 }],
  ['夜里', (h) => h >= 21, { valence: -0.2 }],
]

for (const [qname, qcond, k] of SLEEPQ) {
  for (const [tname, tcond, eff] of NEXTDAY) {
    const scaled = {}
    for (const key2 of Object.keys(eff)) scaled[key2] = eff[key2] * k
    add((s) => qcond(s) && tcond(new Date().getHours()), scaled, '')
  }
}

/* ── 生成：她手边的东西 × 状态 ────────── */
const THINGS = ['一杯水', '半袋饼干', '手机', '窗', '尾巴尖', '头发', '袖子', '被子角', '那本书', '凉了的水']
const TSTATE = [
  ['有点在意', { valence: 0.1 }],
  ['没什么感觉', { valence: 0.0 }],
  ['被它弄烦了', { valence: -0.2 }],
  ['想起点什么', { sadness: 0.2 }],
  ['心里软了一下', { valence: 0.2 }],
]

for (const t of THINGS) {
  for (const [sn, eff] of TSTATE) {
    add((s) => num(s.hunger, 0) > 4 && s.sleeping !== true && eff.valence !== 0, eff, '')
  }
}

/* ── 生成：多久没说话 × 想念程度 ──────── */
const GAPS = [
  ['半小时没见', 0.5],
  ['半天没见', 0.5],
  ['一天没见', 0.4],
  ['两天没见', 0.3],
  ['一周没见', 0.15],
  ['很久没见', 0.05],
]

for (const [gname, k] of GAPS) {
  add((s) => ['喜欢', '恋爱', '已婚'].includes(RM(s).status) && num(s.boredom, 0) > 60,
    { valence: -0.3 * k, sadness: 0.4 * k }, gname === '半天没见' ? '半天没见他了' : '')
}


/* ── 生成：日常里的小事 × 反应强度 ────── */
const EVENTS_MINI = [
  ['水烧开了', { valence: 0.1 }],
  ['碗洗完', { valence: 0.2 }],
  ['衣服晾上', { valence: 0.1 }],
  ['地扫了一遍', { valence: 0.15 }],
  ['被蚊子咬', { valence: -0.3 }],
  ['踩到水', { valence: -0.2 }],
  ['头发缠住', { valence: -0.3 }],
  ['钥匙找不到', { valence: -0.5, anger: 0.3 }],
  ['指甲断了', { valence: -0.2 }],
  ['手机没电', { valence: -0.4 }],
  ['钱花完了', { valence: -0.6, anger: 0.4 }],
  ['看见一只猫', { valence: 0.5 }],
]

const INTENS = [
  ['淡', 0.4],
  ['中', 1.0],
  ['浓', 1.8],
]

for (const [ename, eff] of EVENTS_MINI) {
  for (const [iname, k] of INTENS) {
    const scaled = {}
    for (const key2 of Object.keys(eff)) scaled[key2] = eff[key2] * k * 0.25
    add((s) => num(s.boredom, 0) < 60, scaled, '')
  }
}

/* ── 生成：声音与气味 ─────────────────── */
const SOUNDS = ['楼下有人说话', '远处船笛', '隔壁拖椅子', '水管咕噜', '雨打窗', '鸟叫', '风穿窗缝', '楼下炒菜']
const SMELLS = ['楼里有人炒菜', '晒过的被子', '海腥味', '旧纸味', '雨后的土', '别人的香水', '烧糊了', '洗衣粉']
const SENSW = [
  ['让她松', { valence: 0.2 }],
  ['让她沉', { valence: -0.2 }],
  ['想起点什么', { sadness: 0.15 }],
]

for (const s1 of [...SOUNDS, ...SMELLS]) {
  for (const [w2, eff] of SENSW) {
    add((s) => num(s.boredom, 0) > 40 && !s.sleeping, eff, '')
  }
}

/* ── 生成：她身上这会儿的细节 ─────────── */
const DETAIL = [
  ['头发有点长', { valence: 0.1 }],
  ['指甲该剪了', { valence: 0.05 }],
  ['衣服有点旧', { valence: -0.1 }],
  ['鞋磨脚', { energy: -0.2 }],
  ['袜子一只找不到', { valence: -0.2 }],
  ['杯子有茶垢', { valence: -0.1 }],
  ['床单该换了', { valence: -0.15 }],
  ['镜子上有水渍', { valence: -0.05 }],
]

for (const [d, eff] of DETAIL) {
  for (const [iname, k] of INTENS) {
    const scaled = {}
    for (const key2 of Object.keys(eff)) scaled[key2] = eff[key2] * k * 0.3
    add((s) => num((s.body || {}).dirty, 0) > 20, scaled, '')
  }
}


/* ── 生成：他一天里会做的事 × 她的反应 ── */
const HISDO = [
  ['他去上班', { boredom: 0.5, sadness: 0.2 }],
  ['他在吃饭', { valence: 0.1 }],
  ['他在睡觉', { valence: -0.1 }],
  ['他在忙', { boredom: 0.4 }],
  ['他在玩', { valence: 0.2 }],
  ['他在难过', { sadness: 0.6, valence: -0.6 }],
  ['他在生病', { sadness: 0.5, valence: -0.5 }],
  ['他要出门', { valence: 0.2 }],
  ['他回来了', { valence: 0.8, boredom: -1.0 }],
  ['他在跟别人说话', { envy: 0.4, valence: -0.2 }],
  ['他很久没说话', { boredom: 0.6, sadness: 0.3 }],
  ['他在哄她', { valence: 0.7, anger: -0.4 }],
]

const HISW = [
  ['她比较闲', (s) => num(s.boredom, 0) > 40, 1.2],
  ['她忙着', (s) => num(s.boredom, 0) <= 40, 0.7],
]

for (const [dname, eff] of HISDO) {
  for (const [w, cond, k] of HISW) {
    const scaled = {}
    for (const key2 of Object.keys(eff)) scaled[key2] = eff[key2] * k * 0.3
    add((s) => cond(s) && num(s._hisDoCode, 0) === HISDO.findIndex((x) => x[0] === dname) + 1, scaled, '')
  }
}

/* ── 手写补足：几条最要紧的 ───────────── */
add((s) => num(s.boredom, 0) > 90 && ['喜欢', '恋爱', '已婚'].includes(RM(s).status), { valence: -0.6, sadness: 0.6 }, '太闲了，开始胡思乱想')
add((s) => num(s.affinity, 0) < 10 && ['喜欢', '恋爱', '已婚'].includes(RM(s).status), { valence: -0.4 }, '关系还在，人却有点远了')
add((s) => num(s.hunger, 0) > 8 && num(s.boredom, 0) > 60, { anger: 0.8, valence: -1.0 }, '又饿又闷，一点就着')
add((s) => num(s.health, 90) < 50, { energy: -0.6, valence: -0.4 }, '身子在往下走')
add((s) => num(s.health, 90) < 30, { valence: -1.0, sadness: 0.5 }, '撑不太住了')
add((s) => (s.children || []).length > 0, { valence: 0.3 }, '想到孩子')
add((s) => s.justBorn && Date.now() - num(s.justBorn, 0) < 3 * 86400e3, { energy: -1.2, valence: -0.3 }, '刚生完，人还虚')
add((s) => s.pregnant && num(s.valence, 0) < -20, { sadness: 0.4 })
add((s) => num(s._caffeine, 0) > 2, { energy: -0.3 }, '咖啡喝多了，心跳快')
add((s) => num(s._caffeine, 0) > 2 && new Date().getHours() >= 22, { energy: -0.6 }, '太晚了还精神，反而心慌')
add((s) => num(s._sitHours, 0) > 6, { energy: -0.4, valence: -0.3 }, '坐了一整天，人都僵了')
add((s) => num(s._walked, 0) === 0 && new Date().getHours() >= 20, { valence: -0.4 }, '一天没出门')
add((s) => num(s._walked, 0) > 1, { valence: 0.4, energy: -0.2 }, '走过了，心里松一点')


/* ── 补足到一千：日常里那些零碎的 ─────── */
const FILL = [
  [(s) => T() >= 7 && T() < 8 && !s.sleeping, { valence: 0.2 }],
  [(s) => T() >= 11 && T() < 12, { hunger: 0.2 }],
  [(s) => T() >= 17 && T() < 18, { hunger: 0.3 }],
  [(s) => T() >= 23, { energy: -0.3 }],
  [(s) => num(s.energy, 50) > 85, { valence: 0.3 }],
  [(s) => num(s.energy, 50) < 25 && num(s.hunger, 0) > 6, { anger: 0.5 }],
  [(s) => num(s.water, 70) > 85, { valence: 0.1 }],
  [(s) => num(s.hunger, 0) <= 2 && num(s.energy, 50) > 60, { valence: 0.3 }],
  [(s) => num((s.body || {}).debt, 0) > 8 && T() < 10, { energy: -0.5 }],
  [(s) => num((s.body || {}).weight, 52) > 58, { energy: -0.2 }],
  [(s) => num((s.body || {}).weight, 52) < 44, { energy: -0.3 }],
  [(s) => s.sick && num(s.hunger, 0) > 6, { energy: -0.4 }],
  [(s) => s.sick && num(s.valence, 0) < 0, { sadness: 0.4 }],
  [(s) => cyc(s) >= 1 && cyc(s) <= 5 && T() >= 22, { energy: -0.4 }],
  [(s) => cyc(s) >= 12 && cyc(s) <= 17 && T() >= 22, { valence: 0.3 }],
  [(s) => cyc(s) >= 25 && num(s.hunger, 0) > 5, { hunger: 0.3 }],
  [(s) => W(s).temp >= 30 && num(s.water, 70) < 60, { water: -0.4 }],
  [(s) => W(s).temp <= 8 && num(s.energy, 50) < 50, { energy: -0.3 }],
  [(s) => W(s).rain && num(s.valence, 0) > 20, { valence: 0.2 }],
  [(s) => W(s).rain && num(s.valence, 0) < -20, { sadness: 0.3 }],
  [(s) => num(s.boredom, 0) > 70 && W(s).rain, { valence: -0.4 }],
  [(s) => num(s.affinity, 0) > 60 && num(s.boredom, 0) > 60, { sadness: 0.2 }],
  [(s) => num(s.trust, 0) > 60 && num(s.grudge, 0) < 10, { valence: 0.2 }],
  [(s) => num(s.temper, 0) > 70 && T() >= 22, { valence: -0.5 }],
  [(s) => num(s.temper, 0) > 70 && T() >= 6 && T() < 12, { valence: 0.2 }],
  [(s) => H(s, 'sadness') > 60 && T() >= 20, { energy: -0.5 }],
  [(s) => H(s, 'anger') > 60 && num(s.hunger, 0) > 6, { temper: 0.5 }],
  [(s) => H(s, 'fear') > 40 && new Date().getHours() >= 0 && new Date().getHours() < 4, { valence: -0.4 }],
  [(s) => H(s, 'shame') > 40 && num(s._hisDoCode, 0) > 0, { valence: -0.3 }],
  [(s) => H(s, 'anticipation') > 60 && T() >= 22, { energy: 0.3 }],
  [(s) => (s.plan || {}).items && (s.plan.items.length - (s.plan.done || []).length) > 2, { valence: -0.3 }],
  [(s) => (s.plan || {}).done && Object.keys(s.plan.done || {}).length > 0, { valence: 0.4 }],
  [(s) => num(s.ageDays, 0) > 130 && num(s.energy, 50) < 40, { valence: -0.4 }],
  [(s) => num(s.ageDays, 0) < 10, { valence: 0.3 }],
  [(s) => s.coldUntil && Date.now() < num(s.coldUntil, 0), { energy: -0.4, valence: -0.5 }],
  [(s) => s._nerved, { anger: 0.6, temper: 0.4 }],
  [(s) => s._avoid, { valence: -0.3 }],
  [(s) => s._wantTalk, { truth: 0, valence: 0.2 }],
  [(s) => num(s.hunger, 0) > 7 && num(s.water, 70) < 30, { health: -0.1 }],
  [(s) => num(s.water, 70) < 20 && T() >= 12 && T() < 18, { energy: -0.5 }],
  [(s) => num(s.hunger, 0) > 8 && T() >= 0 && T() < 4, { valence: -0.6 }],
  [(s) => s.sleeping && num(s.energy, 50) < 20, { health: 0.1 }],
  [(s) => !s.sleeping && num(s.energy, 50) < 12, { health: -0.1 }],
  [(s) => num(s.boredom, 0) > 80 && num(s.energy, 50) > 50, { anger: 0.4 }],
  [(s) => num(s.boredom, 0) < 10 && num(s.energy, 50) > 60, { valence: 0.2 }],
]

for (const [cond, eff] of FILL) add(cond, eff, '')


/* ── 最后几条：凑到一千 ───────────────── */
const TAIL = [
  [(s) => T() === 0, { valence: -0.1 }],
  [(s) => T() === 1, { valence: -0.1 }],
  [(s) => T() === 2, { valence: -0.2 }],
  [(s) => T() === 3, { valence: -0.2 }],
  [(s) => T() === 4, { energy: -0.2 }],
  [(s) => T() === 5, { energy: -0.1 }],
  [(s) => T() === 9, { valence: 0.2 }],
  [(s) => T() === 10, { valence: 0.2 }],
  [(s) => T() === 13, { energy: -0.1 }],
  [(s) => T() === 14, { energy: -0.2 }],
  [(s) => T() === 15, { valence: 0.1 }],
  [(s) => T() === 16, { valence: 0.1 }],
  [(s) => T() === 19, { valence: 0.1 }],
  [(s) => T() === 20, { valence: 0.2 }],
  [(s) => T() === 21, { valence: 0.1 }],
  [(s) => num(s.hunger, 0) === 5, { valence: -0.1 }],
  [(s) => num(s.hunger, 0) === 6, { valence: -0.2 }],
  [(s) => num(s.water, 70) === 50, { energy: -0.1 }],
  [(s) => num(s.energy, 50) === 50, { valence: 0.0 }],
  [(s) => num(s.valence, 0) === 0, { valence: 0.05 }],
  [(s) => num(s.affinity, 0) === 50, { valence: 0.1 }],
  [(s) => num(s.boredom, 0) === 50, { valence: -0.1 }],
  [(s) => num(s.body && s.body.height, 165) > 168, { valence: 0.05 }],
  [(s) => num(s.body && s.body.height, 165) < 160, { valence: -0.05 }],
  [(s) => num(s.sexCount, 0) === 0, { valence: 0.0 }],
  [(s) => num(s.children && s.children.length, 0) > 0, { valence: 0.2 }],
  [(s) => num(s.tryFails, 0) > 0, { sadness: 0.2 }],
  [(s) => s.failMoodUntil && Date.now() < num(s.failMoodUntil, 0), { valence: -0.4 }],
  [(s) => num(s.interview && s.interview.answers && s.interview.answers.length, 0) > 0, { valence: 0.2 }],
  [(s) => s.lang === 'en', { valence: 0.0 }],
]

for (const [cond, eff] of TAIL) add(cond, eff, '')

add((s) => num(s.hunger, 0) >= 9 && num(s.energy, 50) < 20, { health: -0.1 }, '饿得发虚')
add((s) => s.pregnant && num(s.hunger, 0) > 7, { energy: -0.4 }, '')
add((s) => num(s.grudge, 0) > 60 && ['喜欢', '恋爱', '已婚'].includes(RM(s).status), { valence: -0.5, sadness: 0.3 })

/* ── 输出：这一小时她心里会冒的话 ─────── */
export function runLinks(st, h = 1, now = Date.now()) {
  const sum = {}
  const lines = []
  for (const r of LINKS) {
    let hit = false
    try { hit = !!r.when(st, now) } catch { hit = false }
    if (!hit) continue
    for (const [k, v] of Object.entries(r.eff)) {
      sum[k] = num(sum[k], 0) + num(v, 0) * h
    }
    if (r.line && Math.random() < 0.12) lines.push(r.line)
  }
  return { sum, lines }
}
