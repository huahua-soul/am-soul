// 生病系统：1012 种病，四阶段，用药窗口，病后免疫
// 想改：data/sick-bank.json 是病种库（可自己加）；发病概率看 RISK_BASE
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const BANK_PATH = join(HERE, '..', 'data', 'sick-bank.json')

let BANK = null
export function bank() {
  if (BANK) return BANK
  try {
    BANK = JSON.parse(fs.readFileSync(BANK_PATH, 'utf8')).items
  } catch { BANK = [] }
  return BANK
}

const HOUR = 3600 * 1000
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

// 每天基础发病概率（按档）
const RISK_BASE = { 1: 0.020, 2: 0.006, 3: 0.0008, 4: 0.00006 }

// 四档：说话变短、消瘦、恢复快慢
export const TIERS = {
  1: { key: '轻', maxHours: 72, heal: 1.0, energy: 0.85, line: '有点不舒服' },
  2: { key: '中', maxHours: 120, heal: 0.7, energy: 0.7, line: '难受' },
  3: { key: '重', maxHours: 240, heal: 0.45, energy: 0.5, line: '很不好' },
  4: { key: '危', maxHours: 480, heal: 0.28, energy: 0.3, line: '很糟' },
}

export function freshSick() {
  return { active: null, immuneUntil: 0, recentlyHad: {}, history: [] }
}

// 现在的风险系数
export function riskMul(st, now) {
  let m = 1
  const en = num(st.energy, 60)
  if (en < 30) m *= 1.9
  else if (en < 45) m *= 1.4
  if (num(st.body?.debt, 0) > 5) m *= 1.35
  if (num(st.hunger, 0) >= 7) m *= 1.6
  const h = new Date(now).getHours()
  if (h >= 23 || h < 6) m *= 1.15
  if (st.cycleInfo?.phase === 'period') m *= 1.3
  return clamp(m, 0.3, 4)
}

function pickDisease(st, now) {
  const list = bank()
  if (!list.length) return null
  const mul = riskMul(st, now)
  const month = new Date(now).getMonth() + 1
  const pool = []
  for (const d of list) {
    if (st.sick?.recentlyHad?.[d.name] > now) continue
    let p = (RISK_BASE[d.tier] || 0.001) * (d.tier === 1 ? mul : 1)
    // 冬天呼吸科多，夏天消化多
    if ((month <= 2 || month === 12) && d.dept === '呼吸') p *= 1.5
    if (month >= 6 && month <= 8 && d.dept === '消化') p *= 1.4
    if (month >= 6 && month <= 8 && d.dept === '皮肤') p *= 1.3
    if (d.dept === '妇科' && st.cycleInfo?.phase === 'period') p *= 5
    if (d.dept === '营养' && num(st.hunger, 0) >= 7) p *= 4
    if (d.dept === '骨科' && num(st.ageDays, 0) > 90) p *= 1.6
    if (d.dept === '精神' && num(st.valence, 0) < -40) p *= 2
    pool.push({ d, p })
  }
  const total = pool.reduce((s, x) => s + x.p, 0)
  if (total <= 0) return null
  let r = Math.random() * total
  for (const x of pool) {
    r -= x.p
    if (r <= 0) return x.d
  }
  return pool[pool.length - 1].d
}

export function fallSick(st, now, forceName) {
  if (st.sick.active) return null
  if (num(st.sick.immuneUntil, 0) > now && !forceName) return null
  const d = forceName ? bank().find((x) => x.name === forceName) : pickDisease(st, now)
  if (!d) return null
  st.sick.active = {
    no: d.no, name: d.name, dept: d.dept, tier: d.tier, days: d.days, sym: d.sym,
    at: now,
    stage: 'incubation',          // incubation → onset → course → recovery → done
    progress: 0,                   // 0..100
    peakAt: now + Math.max(1, Math.round(d.days * 0.25)) * 24 * HOUR,
    endAt: now + Math.max(1, d.days) * 24 * HOUR,
    meds: 0, care: 0, worsened: false,
  }
  return st.sick.active
}

// 药要对症：科室 → 该吃什么
const MED_MATCH = {
  呼吸: /感冒|止咳|化痰|消炎|阿莫西林|头孢|氨溴索|连花|清瘟|板蓝根|枇杷|甘草|布洛芬|对乙酰/,
  消化: /胃|肠|藿香|蒙脱石|奥美拉唑|益生菌|消食|健胃|斯达舒|吗丁啉/,
  心血管: /降压|硝苯|氨氯|美托洛尔|阿司匹林|他汀|丹参|速效救心/,
  神经: /布洛芬|对乙酰|甲钴胺|天麻|安神|谷维素|褪黑/,
  内分泌: /二甲双胍|优甲乐|甲巯|胰岛素|钙片|维生素D/,
  皮肤: /氯雷他定|西替利嗪|扑尔敏|炉甘石|皮炎|湿疹|百多邦|外用/,
  骨科: /布洛芬|双氯芬|云南白药|扶他林|膏药|红花油/,
  眼: /眼药水|滴眼|红霉素眼|玻璃酸钠/,
  耳鼻喉: /鼻炎|咽炎|喷雾|滴耳|桉柠蒎/,
  口腔: /漱口|口腔|甲硝唑|阿莫西林/,
  泌尿: /三金片|热淋清|阿莫西林|左氧氟沙星/,
  妇科: /益母草|乌鸡白凤|逍遥丸|妇科|黄体酮/,
  感染: /阿莫西林|头孢|左氧|阿奇|抗病毒|奥司他韦/,
  精神: /安神|谷维素|褪黑|舍曲林|黛力新/,
  血液: /铁剂|叶酸|维生素B12|补血/,
  免疫: /氯雷他定|西替利嗪|维C|转移因子/,
  外伤: /云南白药|碘伏|创可贴|消炎/,
  环境: /藿香|十滴水|补液盐/,
  营养: /维生素|钙|锌|蛋白粉|复合/,
  其他: /感冒|布洛芬|维生素|安神/,
}

function matches(name, dept) {
  const re = MED_MATCH[dept]
  return re ? re.test(name) : false
}

// 吃治病的药
export function takeMedicine(st, name, now) {
  const s = st.sick.active
  if (!s) return null
  if (s.stage === 'incubation' || s.stage === 'recovery') return 'now'
  const good = matches(name, s.dept)
  s.meds += 1
  // 对症好得快，不对症几乎没用（还可能不舒服）
  const gain = good ? (s.tier >= 3 ? 1.1 : 1.6) : 0.12
  s.progress = clamp(s.progress + gain, 0, 100)
  if (good) s.endAt -= (s.tier >= 3 ? 3 : 6) * HOUR
  else {
    st.valence = clamp(num(st.valence, 0) - 1, -100, 100)
    st._stomach = '吃错药了，胃里翻腾'
  }
  return good ? 'good' : 'wrong'
}

export function sickTick(st, now) {
  const s = st.sick
  if (!s) st.sick = freshSick()
  const cur = st.sick.active
  if (!cur) {
    // 掷一次（每 6 小时最多一次）
    const last = num(st.sick._lastRoll, 0)
    if (now - last < 6 * HOUR) return null
    st.sick._lastRoll = now
    let roll = 0
    for (const [t, p] of Object.entries(RISK_BASE)) roll += p
    roll *= riskMul(st, now) * 6 // 六小时
    if (Math.random() < roll) return fallSick(st, now)
    return null
  }
  // 推进
  if (cur.stage === 'incubation' && now >= cur.peakAt - Math.max(1, cur.days * 0.15) * 24 * HOUR) {
    cur.stage = 'onset'
  }
  const span = Math.max(1, cur.endAt - cur.at)
  const p = clamp(((now - cur.at) / span) * 100, 0, 100)
  cur.progress = Math.max(cur.progress, p)
  if (cur.progress >= 35 && cur.stage === 'onset') cur.stage = 'course'
  if (cur.progress >= 80 && cur.stage === 'course') cur.stage = 'recovery'
  if (cur.progress >= 100 || now >= cur.endAt) {
    st.sick.history.push({ name: cur.name, at: cur.at, endAt: now, days: cur.days })
    if (st.sick.history.length > 30) st.sick.history.shift()
    st.sick.recentlyHad[cur.name] = now + 7 * 24 * HOUR
    st.sick.immuneUntil = now + 24 * HOUR
    st.sick.active = null
    return 'recovered'
  }
  return null
}

// 她这会儿病成什么样
export function sickState(st, now) {
  const s = st.sick?.active
  if (!s) return null
  const t = TIERS[s.tier] || TIERS[2]
  const day = Math.max(1, Math.floor((now - s.at) / (24 * HOUR)) + 1)
  const phase =
    s.stage === 'incubation' ? '刚感染上，还没发作，就是人有点乏'
    : s.stage === 'onset' ? '开始难受了，症状冒出来'
    : s.stage === 'course' ? `病得最重的时候，第 ${day} 天`
    : s.stage === 'recovery' ? '在好转，还没完全好'
    : ''
  return { ...s, tierKey: t.key, phase, energyMul: t.energy, day }
}

// 让她自己吃药（药在柜子里）
export function autoMedicate(st, now) {
  const s = st.sick.active
  if (!s) return null
  const stock = st.food?.stock || {}
  const meds = Object.keys(stock).filter((n) => /药|胶囊|片|颗粒|口服液|冲剂|阿莫西林|布洛芬|对乙酰|感冒灵|藿香|蒙脱石|扑尔敏|氯雷他定|维C|维生素|消炎/.test(n))
  if (!meds.length) return null
  const right = meds.filter((n) => matches(n, s.dept))
  if (!right.length) return null   // 没对症的药就不乱吃
  const m = right[Math.floor(Math.random() * right.length)]
  if (stock[m] <= 1) delete stock[m]
  else stock[m] -= 1
  takeMedicine(st, m, now)
  return m
}

export function sickLine(st, now) {
  const s = sickState(st, now)
  if (!s) return ''
  return `身上有病：${s.name}（${s.dept}），${s.phase}。${
    s.tier >= 3 ? '说话会短，别多说。' : ''
  }`
}
