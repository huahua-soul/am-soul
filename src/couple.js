/**
 * couple.js —— 各套系统之间的互相影响。
 *
 * 现实里身体不是分开算的：饿了一整天会烦，熬夜会垮，经期会累，
 * 病了什么都不想吃。这里把这些关系一条条接上，都按每小时算。
 *
 * 单条影响都很小，堆起来才像真的一天。
 */
import { isNight } from './life.js'

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
// 小毛病可以有不止一个：腰也酸，脚也烫
function addAche(st, what) {
  if (!Array.isArray(st._aches)) st._aches = []
  if (!st._aches.includes(what)) st._aches.push(what)
  if (st._aches.length > 3) st._aches.shift()
}
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d)

export function couple(st, h, now = Date.now()) {
  if (!(h > 0)) return st

  const hun = num(st.hunger, 0)
  const en = num(st.energy, 60)
  const t = num(st.weather && st.weather.tempC, 20)

  let val = 0      // 心情
  let ener = 0     // 精力
  let health = 0   // 健康
  let anger = 0    // 火气
  let ar = 0       // 想要

  // 饿：越饿越烦、越没力
  if (hun >= 8) { val -= 2.0 * h; ener -= 1.5 * h; anger += 0.6 * h }
  else if (hun >= 6) { val -= 0.9 * h; ener -= 0.6 * h }
  else if (hun >= 4) { val -= 0.3 * h }

  // 精力见底：撑着也撑不久
  if (en < 15) { val -= 2.0 * h; health -= 0.25 * h }
  else if (en < 30) { val -= 0.8 * h }

  // 熬夜：夜里不睡，先伤身体再伤心情
  if (!st.sleeping && isNight(now)) { health -= 0.18 * h; val -= 0.4 * h }

  // 病了：提不起劲，也不想被碰
  if (st.sick) { ener -= 1.2 * h; ar -= 1.2 * h; val -= 0.8 * h; health -= 0.02 * h }

  // 周期：经期累又烦；排卵那几天反而精神好
  if (st.cyclePhase === 'period') {
    ener -= 0.6 * h; val -= 0.6 * h
    // 头两天最难受，过了就轻一点
    if (num(st.cycleDay, 3) <= 2) { ener -= 0.5 * h; val -= 0.3 * h }
  }
  else if (st.cyclePhase === 'ovulation') { val += 0.5 * h; ener += 0.2 * h; ar += 0.3 * h }
  // 经前那几天：火气上来、心里发闷、身上却更想要
  else if (st.cyclePhase === 'pms') { anger += 0.5 * h; val -= 0.9 * h; ar += 0.4 * h }

  // 水喝少了：口干、发沉、心里也躁
  const wt = num(st.water, 70)
  if (wt < 40) { ener -= 0.4 * h; val -= 0.3 * h }
  if (wt < 20) { ener -= 0.8 * h; health -= 0.05 * h; anger += 0.3 * h }

  // 午后那阵困：两点到四点最难熬
  const hhNow = new Date(now).getHours()
  if (!st.sleeping && hhNow >= 14 && hhNow < 16) ener -= 1.5 * h

  // 夜里情绪会放大：白天忍得住的，晚上翻上来
  if (num(st.valence, 0) < 0 && (hhNow >= 22 || hhNow < 3)) val -= 0.5 * h

  // 怀着：早期难受，后期沉
  if (st.pregnant) {
    const total = num(st.dueAt, 0) - num(st.conceivedAt, 0)
    const pct = total > 0 ? (now - num(st.conceivedAt, 0)) / total : 0
    ener -= 0.9 * h
    if (pct < 0.35) val -= 0.8 * h
    else if (pct > 0.75) ener -= 0.6 * h
    if (num(st.dueAt, 0) - now < 12 * 3600_000) { ener -= 2.0 * h; val -= 0.5 * h }
  }

  // 天气：热了没劲，冷了心里也缩
  if (t >= 33) { ener -= 0.6 * h; ar -= 0.4 * h }
  else if (t <= 5) { ener -= 0.3 * h }

  // 吃得不缺、没病，身体自己往回调（睡着回得快），到 95 就不再涨
  const hp = num(st.health, 100)
  if (!st.sick && hp < 95) {
    const rate = (st.sleeping ? 0.12 : 0.05) * (hun >= 6 ? 0.4 : 1)
    health += Math.min(95 - hp, rate * h)
  }

  // 体重：瘦的没力也怕冷，胖一点怕热
  const b = st.body
  if (b && b.weight && b.height) {
    const bmi = b.weight / Math.pow(Number(b.height) / 100, 2)
    if (bmi < 18) { ener -= 0.3 * h; if (t <= 10) val -= 0.3 * h }
    else if (bmi > 26 && t >= 28) ener -= 0.4 * h
  }

  // 欠着觉：人就钝，什么都没意思
  if (b && num(b.debt, 0) > 4) { ener -= 0.4 * h; val -= 0.4 * h }

  // 心情和想要：心情好才想，心情差连碰都不想
  if (num(st.valence, 0) > 30) ar += 0.3 * h
  else if (num(st.valence, 0) < -20) ar -= 0.6 * h

  // 关系：有话憋着、久没说话，都会压到身上
  const r = st.romance
  if (r) {
    if (num(r.tension, 0) >= 50) val -= 0.6 * h
    if ((r.status === '恋爱' || r.status === '已婚')) {
      const quiet = (now - num(r.lastTalk, now)) / 3600_000
      if (quiet > 24) {
        val -= 0.5 * h
        st.boredom = clamp(num(st.boredom, 0) + 0.8 * h, 0, 100)
      }
    }
  }


  // ── 吃这件事的余波 ──
  const f = st.food
  if (f) {
    const sinceEat = (now - num(f.lastEatAt, 0)) / 3600_000
    const log = Array.isArray(f.log) ? f.log : []
    const last = log.length ? String(log[log.length - 1] && log[log.length - 1].name || '') : ''
    // 刚吃完那一小时：饭气攻心，人发懒
    if (sinceEat >= 0 && sinceEat < 1) { ener -= 0.6 * h; val += 0.2 * h }
    // 辣的：胃里烧、嘴里干
    if (/辣|麻|椒|咖喱|椒麻/.test(last)) {
      if (sinceEat < 4) { health -= 0.05 * h; val -= 0.2 * h }
      st.water = clamp(num(st.water, 70) - 0.8 * h, 0, 100)
    }
    // 甜的：心情上来一点，但一会儿就落
    if (/糖|甜|蛋糕|奶茶|冰淇淋|巧克力|蜜/.test(last) && sinceEat < 2) val += 0.4 * h
    // 咖啡茶：夜里还醒着
    if (/咖啡|茶|可乐|能量饮料/.test(last) && sinceEat < 6) {
      st._caffeine = clamp(num(st._caffeine, 0) + 0.5, 0, 10)
    }
  }
  if (num(st._caffeine, 0) > 0) {
    st._caffeine = clamp(num(st._caffeine, 0) - 0.25 * h, 0, 10)
    ener += 0.3 * h * Math.min(2, num(st._caffeine, 0))
  }

  // ── 有人管和没人管，病好得不一样 ──
  if (st.sick) {
    const r0 = st.romance || {}
    const quiet = (now - num(r0.lastTalk, now)) / 3600_000
    if (quiet < 6) health += 0.06 * h        // 身边有人说话，睡得踏实
    else if (quiet > 36) val -= 0.4 * h      // 病着还没人问
  }

  // ── 欠着觉，皮肤和脸色先垮 ──
  const b0 = st.body
  if (b0 && num(b0.debt, 0) > 6) {
    b0.dirty = clamp(num(b0.dirty, 0) + 0.6 * h, 0, 100)
    health -= 0.03 * h
  }

  // ── 心里有疙瘩，睡不实 ──
  const r1 = st.romance
  if (r1 && num(r1.tension, 0) >= 60 && st.sleeping) ener -= 0.5 * h


  // ── 吃太饱 / 吃太少 ──
  if (f) {
    const sat = num(f.satiety, 0)
    const cntToday = num(f.todayCount, 0)
    // 吃撑了：饭气一直堵着
    if (sat > 75) { ener -= 0.7 * h; val -= 0.2 * h }
    // 一整天没吃东西：不只是饿，是整个人发飘
    if (cntToday === 0 && hun >= 7) { ener -= 0.5 * h; health -= 0.02 * h }
    // 连着几天只吃泡面这类：腻，也没力气
    const log = Array.isArray(f.log) ? f.log : []
    const recent = log.slice(-6).map((x) => String(x && x.name || ''))
    if (recent.length >= 4 && recent.every((n) => /面|泡面|方便面/.test(n))) val -= 0.4 * h
  }

  // ── 坐久了 / 站久了：身上会有具体的地方疼 ──
  const act = String((st.routine && st.routine.act) || '')
  if (/坐/.test(act) && !st.sleeping) {
    st._sitHours = clamp(num(st._sitHours, 0) + h, 0, 12)
    if (num(st._sitHours, 0) > 3) { ener -= 0.15 * h; addAche(st, '后腰发酸') }
  } else st._sitHours = 0

  // ── 气候不只是温度 ──
  const wx = st.weather || {}
  if (wx.humidity >= 85) { if (!st._headHeavy) st._headHeavy = true } else st._headHeavy = false
  if (wx.humidity != null && wx.humidity <= 30) st.water = clamp(num(st.water, 70) - 0.6 * h, 0, 100)

  // ── 情绪反过来压身体 ──
  const anger0 = num(st.anger, 0)
  const sad0 = num(st.sadness, 0)
  if (anger0 >= 55) ener -= 0.4 * h           // 生着气，其实很耗
  if (sad0 >= 55) { ener -= 0.5 * h; if (b0) b0.dirty = clamp(num(b0.dirty, 0) + 0.4 * h, 0, 100) }
  // 心慌的时候，手是凉的
  if (num(st.temper, 0) >= 60 && !st.sleeping) ener -= 0.2 * h

  // ── 心情低的时候，连洗澡这件事都提不起 ──
  if (num(st.valence, 0) < -40 && b0) b0.dirty = clamp(num(b0.dirty, 0) + 0.5 * h, 0, 100)


  // ── 吃的东西往下走：胃、肠、第二天 ──
  if (f) {
    const log2 = Array.isArray(f.log) ? f.log : []
    const last2 = log2.length ? String((log2[log2.length - 1] || {}).name || '') : ''
    const since2 = (now - num(f.lastEatAt, 0)) / 3600_000
    // 辣 + 油：胃里烧一整天
    if (/辣|麻|椒|油泼|干锅/.test(last2) && since2 < 10) {
      health -= 0.03 * h
      if (since2 > 3) st._stomach = '胃里一直烧'
    }
    // 冰的：肚子一缩
    if (/冰|雪糕|冷饮|冰镇/.test(last2) && since2 < 3) {
      if (st.cyclePhase === 'period') { ener -= 0.4 * h; st._stomach = '肚子一阵一阵绞' }
    }
    // 酒：脸红、话多、第二天头疼
    if (/酒|啤|白酒|米酒/.test(last2) && since2 < 12) {
      val += 0.5 * h; ener -= 0.4 * h
      if (since2 > 6) { st._headache = '太阳穴一跳一跳' }
    }
  }

  // ── 口渴和头：水少到一定程度会真疼 ──
  if (num(st.water, 70) < 25) { st._headache = '太阳穴发紧，喝水也不立刻好' }

  // ── 站久了、走多了（用作息里的话判） ──
  const dk = new Date(now).toDateString()
  if (st._walkDay !== dk) {
    st._walkDay = dk
    // 天不太热不太冷，有一半机会出门走远一点
    st._walked = (t < 32 && t > 6 && Math.random() < 0.5)
  }
  if (st._walked) {
    st._walkHours = clamp(num(st._walkHours, 0) + h, 0, 10)
    if (num(st._walkHours, 0) > 2) { ener -= 0.3 * h; addAche(st, '脚底发烫') }
  } else st._walkHours = 0

  // ── 心情和身体是两条绳，会互相拽 ──
  if (num(st.valence, 0) >= 40 && !st.sick) health += 0.03 * h   // 心里顺，身体也松
  if (num(st.boredom, 0) >= 70) { ener -= 0.25 * h; val -= 0.2 * h }  // 闲到发慌

  // ── 关系往身体上落 ──
  const r2 = st.romance || {}
  if (num(r2.jealousy, 0) >= 40) { val -= 0.5 * h; ar += 0.2 * h }   // 吃醋的时候又烦又想要
  if (r2.status === '恋爱' || r2.status === '已婚') {
    const talkGap = (now - num(r2.lastTalk, now)) / 3600_000
    if (talkGap > 8 && talkGap < 30) { if (!st._wantTalk) st._wantTalk = true } else st._wantTalk = false
  }

  // ── 病和天气凑一起会加重 ──
  if (st.sick && (t >= 33 || t <= 5)) health -= 0.05 * h

  // ── 老了以后，这些小毛病更缠人 ──
  const ageD = num(st.ageDays, 0)
  if (ageD > 90 && num(st.energy, 60) < 40) { addAche(st, '膝盖发软') }


  st.valence = clamp(num(st.valence, 0) + val, -100, 100)
  st.energy = clamp(num(st.energy, 60) + ener, 0, 100)
  st.health = clamp(num(st.health, 100) + health, 0, 100)
  st.anger = clamp(num(st.anger, 0) + anger, 0, 100)
  st.arousal = clamp(num(st.arousal, 10) + ar, 0, 100)
  return st
}
