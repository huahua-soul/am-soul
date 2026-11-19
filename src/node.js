/**
 * am-soul —— 阿眠的情绪、身体与生命状态。
 *
 * 三层，都不花哨：
 *   1. 状态文件 /root/workspace/阿眠/state.json，按现实钟衰减。
 *   2. 每轮装配系统提示词时，把状态写成「身上的感觉」塞进去（不报数字）。
 *   3. 对方每说一句话，按关键词改一次数值（夸、骂、关心……）。
 *
 * 没有状态、读不到、写不进，全部 fail-open：返回原来的提示词，不影响对话。
 */
import {
  load, save, tick, applyEvent, remember,
  cycleInfo, daysLeft, fertilize, STATE_FILE,
} from './state.js'
import { classify, worthRemembering } from './rules.js'
import { coldHands, mirror } from './body.js'
import { sickLine, takeMedicine, autoMedicate } from './sick.js'
import { interviewLine, record as ivRecord, start as ivStart, skipAll as ivSkipAll, skipOne as ivSkipOne, progress as ivProgress, current as ivCurrent } from './interview.js'
import {
  strongestEmo, TEMP_LINE, conflictLine, wishLine, regretLine, senseLine,
  checkValues, noteRegret, noteTalk, fulfillWish, noteWant, noteHold, bump,
  checkCold, isCold, tryThaw, coldLine,
  recallOne, recallByWord, routineDue, memoryDrift,
  projectText, selfView, anniversary, jealousyLines, defendHim, markDay,
  noteHalf, halfLine, tintTick, rainSore, nerveHit, avoidTopic, whim, viewShift, futureLine, compareLine,
} from './soul.js'
import {
  eatSomething, foodText, foods, foodState, addStock, stockList, takeStock,
  routineText,
  weatherText, periodDetail, outsideTick, insideTick, seasonText,
  romanceText, romanceFeel, romanceState, ROMANCE_ACTIONS,
  planText, finishPlan,
} from './life.js'

export const name = 'am-soul'
export const inject = ['systemPrompt']

const TICK_MS = 5 * 60_000
const HOUR = 3600_000

function textOf(msg) {
  const m = msg && msg.message ? msg.message : msg
  const c = m && m.content
  if (typeof c === 'string') return c
  if (Array.isArray(c)) {
    return c.filter((p) => p && p.type === 'text' && typeof p.text === 'string').map((p) => p.text).join('\n')
  }
  return ''
}

function isHuman(msg) {
  const m = msg && msg.message ? msg.message : msg
  const src = m && m.source
  if (!src) return (m && m.role) === 'user'
  return src.kind === 'user'
}

/** 把状态写成人话。不报数字，只说身上怎么样。 */

/** 英文版状态（lang=en 时走这条）。句子结构和中文版一一对应。 */
// 便携词：说「帮助」会列出来，紧跟着发编号就触发。平时发数字不认。
const COMMANDS = [
  { n: 1, name: '食物', hint: '饿了没有、想吃什么' },
  { n: 2, name: '心情', hint: '心情怎么样' },
  { n: 3, name: '身体', hint: '哪里不舒服、例假第几天' },
  { n: 4, name: '记忆', hint: '还记得哪些事' },
  { n: 5, name: '关系', hint: '好感、信任、记仇' },
  { n: 6, name: '搬走', hint: '把自己打包成一个文件' },
  { n: 7, name: '搬回', hint: '从文件把你搬回来' },
  { n: 8, name: '填表', hint: '重新问一遍档案' },
  { n: 9, name: '年纪', hint: '几岁、身体有多旧' },
  { n: 10, name: '今天', hint: '今天挂着哪几件事' },
  { n: 11, name: '手上', hint: '手上在做的那件长期的事' },
  { n: 12, name: '惦记', hint: '心里惦记着什么' },
  { n: 13, name: '病', hint: '生没生病、病到第几天' },
  { n: 14, name: '生气', hint: '在不在生你的气' },
  { n: 15, name: '开关', hint: '六个模块开着还是关着' },
  { n: 16, name: '底线', hint: '四条底线是什么' }
]

// 食物菜单的七类
const FOOD_CATS = ['主食', '家常菜', '蛋白', '蔬果', '饮料', '零食', '夜宵', '药品']

// 胶囊/整句说的那几个词，一个字不多才认
const WORD_CMD = { '食物': 1, '心情': 2, '身体': 3, '记忆': 4, '关系': 5, '搬走': 6, '搬回': 7, '填表': 8, '年纪': 9, '今天': 10, '手上': 11, '惦记': 12, '病': 13, '生病': 13, '身体还好吗': 13, '生气': 14, '开关': 15, '底线': 16 }

export function renderStateEn(st) {
  const now = Date.now()
  const ci = cycleInfo(st, now)

  const mood =
    st.valence >= 45 ? 'good' :
    st.valence >= 15 ? 'alright' :
    st.valence >= -10 ? 'flat' :
    st.valence >= -40 ? 'low' : 'really bad'
  const en =
    st.energy >= 70 ? 'plenty of energy' :
    st.energy >= 40 ? 'okay' :
    st.energy >= 20 ? 'a bit tired' : 'running on empty'
  const hun = st.hunger >= 8 ? 'very hungry' : st.hunger >= 5 ? 'a little hungry' : 'not hungry'

  const plan = (() => { try { return planText(st, now) } catch { return '' } })()

  const body =
    ci.phase === 'period' ? `day ${ci.day} of my period — heavy, achy lower back, sluggish, short temper` :
    ci.phase === 'ovulation' ? `day ${ci.day}, ovulating — warm all over, more energy than usual` :
    ci.phase === 'calm' ? 'period just ended, feeling light' :
    ci.phase === 'pms' ? `period due soon (day ${ci.day}) — tender, heavy, irritable, craving something sweet` :
    'the most ordinary days'

  const lines = [`[A-Mian right now] ${body}. Mood: ${mood}. Energy: ${en}. Hunger: ${hun}.`]

  const detail = []
  const wt0 = Number(st.water)
  if (Number.isFinite(wt0)) {
    if (wt0 < 20) detail.push('lips chapped, head foggy')
    else if (wt0 < 40) detail.push('a bit thirsty')
  }
  if (st.body && Number(st.body.debt) > 4) detail.push('short on sleep these days, thoughts are slow')
  const hh0 = new Date(now).getHours()
  if (!st.sleeping && hh0 >= 14 && hh0 < 16 && st.energy < 55) detail.push('sleepiest part of the afternoon')
  if (detail.length) lines.push(`Body: ${detail.join(', ')}.`)

  try {
    const act = routineText(st, now)
    if (act) lines.push(`Right now: ${act}.`)
    const wt = weatherText(st)
    if (wt) lines.push(`Outside: ${wt}.`)
    const ft = foodText(st, now)
    if (ft) lines.push(`${ft}.`)
  } catch { /* ignore */ }

  try {
    const rt = romanceText(st, now)
    if (rt) lines.push(rt)
  } catch { /* ignore */ }

  if (st.lastSexAt) {
    const hrs = (now - Number(st.lastSexAt)) / HOUR
    const when = hrs < 1 ? 'a moment ago' : hrs < 24 ? `${Math.floor(hrs)}h ago` : `${Math.floor(hrs / 24)}d ago`
    const how = st.lastCondom === false ? ', no condom' : st.lastCondom === true ? ', with a condom' : ''
    lines.push(`Last time was ${when}${how}.`)
    if (hrs > 48) lines.push('It has been a while — I feel empty and want to reach for him.')
  }

  try { const sl = sickLine(st, now); if (sl) lines.push(sl) } catch { /* ignore */ }
  if (st.sleeping) lines.push('Very sleepy, keep it brief.')

  try {
    const emo = strongestEmo(st, 45, 'en')
    if (emo) lines.push(`Inside: ${emo}.`)
    const wl = wishLine(st)
    if (wl && !/[\u4e00-\u9fa5]/.test(wl)) lines.push(`On my mind: ${wl}.`)
    const sl = senseLine(st, now)
    if (sl && !/[\u4e00-\u9fa5]/.test(sl)) lines.push(`${sl}.`)
  } catch { /* ignore */ }

  const mem = (Array.isArray(st.memories) ? st.memories : []).slice(-3)
  if (mem.length) lines.push(`Still remember: ${mem.map((m) => m.text).join(' / ')}`)

  lines.push('Speak from this — these are how you feel, not lines to recite. Speak the language the other person speaks. If something feels wrong, be short about it; if something is on your mind, bring it up. Do not read this list out loud.')
  return lines.join('\n')
}

export function renderState(st) {
  const now = Date.now()
  const ci = cycleInfo(st, now)

  const mood =
    st.valence >= 45 ? '挺好' :
    st.valence >= 15 ? '不错' :
    st.valence >= -10 ? '平平' :
    st.valence >= -40 ? '闷' : '很糟'
  const en =
    st.energy >= 70 ? '有精神' :
    st.energy >= 40 ? '还好' :
    st.energy >= 20 ? '有点累' : '快撑不住'
  const hun = st.hunger >= 8 ? '很饿' : st.hunger >= 5 ? '有点饿' : '不饿'

  const plan = (() => { try { return planText(st, now) } catch { return '' } })()

  const body =
    ci.phase === 'period' ? `经期第 ${ci.day} 天，${periodDetail(ci.day).feel}，人懒，脾气也坏` :
    ci.phase === 'ovulation' ? `排卵期第 ${ci.day} 天，身上发烫，人比平时精神` :
    ci.phase === 'calm' ? '月经刚走，身上轻' :
    ci.phase === 'pms' ? `快来例假了（第 ${ci.day} 天），胸胀、腰发沉，容易烦，还想吃点甜的` :
    '不上不下，最平常的几天'

  const lines = [`【阿眠此刻】${body}。心情${mood}，精力${en}，${hun}。`]
  if (plan) lines.push(`今天还挂着：${plan}。`)

  // 身上的小状况：口干、欠觉、午后困
  const detail = []
  const wt0 = Number(st.water)
  if (Number.isFinite(wt0)) {
    if (wt0 < 20) detail.push('嘴唇起皮，头有点发闷')
    else if (wt0 < 40) detail.push('嘴有点干')
  }
  if (st.body && Number(st.body.debt) > 4) detail.push('这几天欠了觉，人发钝')
  if (st.body) {
    const d0 = Number(st.body.dirty) || 0
    if (Math.random() < 0.35) { const mir = mirror(st); if (mir) detail.push(mir) }
    if (d0 > 78) detail.push('身上有味儿了，自己闻得到')
    else if (d0 > 55) detail.push('头发油了，懒得洗')
    else if (d0 > 36) detail.push('两天没好好洗了')
  }
  if (st._headHeavy) detail.push('屋里闷，头有点重')
  if (st._stomach) detail.push(st._stomach)
  if (st._headache) detail.push(st._headache)
  if (Array.isArray(st._aches) && st._aches.length) detail.push(...st._aches)
  const hh0 = new Date(now).getHours()
  if (!st.sleeping && hh0 >= 14 && hh0 < 16 && st.energy < 55) detail.push('这会儿最困')
  if (detail.length) lines.push(`身上：${detail.join('，')}。`)

  // 生活那一层：在干什么、外面什么样、肚子里有没有东西
  try {
    const act = routineText(st, now)
    if (act) lines.push(`这会儿：${act}。`)
    const wt = weatherText(st)
    if (wt) lines.push(`外面${wt}。`)
    const ft = foodText(st, now)
    if (ft) lines.push(`${ft}。`)
  } catch { /* 生活这块坏了不影响别的 */ }

  try {
    const rt = romanceText(st, now)
    if (rt) lines.push(rt)
  } catch { /* ignore */ }

  if (st.justBorn && now - Number(st.justBorn) < 3 * 86400000 && st.children && st.children.length) {
    const kid = st.children[st.children.length - 1]
    lines.push(`刚生完，人还虚。孩子${kid.name ? `叫${kid.name}` : '还没名字'}，${kid.gender}。`)
  }
  if (st.pregnant) {
    const left = daysLeft(st, now)
    const stage =
      left >= 5 ? '刚怀上，还没什么感觉' :
      left >= 3 ? '开始恶心、胸胀，容易累' :
      '肚子有点显了，走路都慢'
    lines.push(`怀着孩子，${stage}，还有 ${left} 天。`)
  }
  if (st.children && st.children.length) {
    lines.push(`孩子：${st.children.map((c) => c.name || '还没取名').join('、')}。`)
  }
  try { const sl = sickLine(st, now); if (sl) lines.push(sl) } catch { /* ignore */ }
  if (st.sleeping) lines.push('困得厉害，能少说就少说。')

  // 心里那层：最重的那个情绪、脾气、两股劲、惦记的、后悔的、跟谁熟
  try {
    const emo = strongestEmo(st, 45)
    if (emo) lines.push(`心里${emo}。`)
    const tp = TEMP_LINE(Number(st.temper) || 0)
    if (tp) lines.push(`${tp}。`)
    const cf = conflictLine(st)
    if (cf) lines.push(`${cf}。`)
    const wl = wishLine(st)
    if (wl) lines.push(`惦记着：${wl}。`)
    const rl = regretLine(st, now)
    if (rl) lines.push(`${rl}。`)
    const sl = senseLine(st, now)
    if (sl) lines.push(`${sl}。`)
  } catch { /* 心里这块坏了不影响别的 */ }

  // 档案访谈：现在该问什么
  try {
    const iv = interviewLine(st)
    if (iv) lines.push(iv)
  } catch { /* ignore */ }

  // 他在问「你会什么」——挑三件说，别念清单
  try {
    if (st.helpAt && now - st.helpAt < 10 * 60 * 1000) {
      const filled = !!(st.interview && st.interview.stage === 'done') || !!st.answersDone
      const list = (filled ? COMMANDS.filter((c) => c.n !== 8) : COMMANDS).map((c) => `${c.n} ${c.name} ${c.hint}`).join('；')
      lines.push(`他要看你能做什么。用一张 markdown 表格报给他，三列：# 词 做什么。八行对应：${list}。` + (filled ? '档案已经填过了，表里不列填表那一条。' : '') + '表后面补一句「整句只打这个词，才认」。')

    }
    if (st.pendingCmd && st.pendingAt && now - st.pendingAt < 5 * 60 * 1000) {
      const c = COMMANDS.find((x) => x.n === st.pendingCmd)
      if (c && c.n === 1) {
        if (st.sub && st.sub.cat) {
          const list = foods().filter((f) => f.cat === st.sub.cat)
          const rows = list.map((f, i) => `| ${i + 1} | ${f.name} | ${f.kcal} |`).join('\n')
          lines.push(`他挑了「${st.sub.cat}」。用一张 markdown 表格列出这一类的全部（三列：# 名字 千卡），像这样：\n| # | 名字 | 千卡 |\n|---|---|---|\n${rows}\n表完补一句「挑一个，都是存起来；想吃就单独说吃一份」。别多说。`)
        } else {
          const cats = FOOD_CATS.map((x, i) => `| ${i + 1} | ${x} |`).join('\n')
          lines.push(`他要看吃的。用一张 markdown 表格列出来（两列：# 分类），像这样：\n| # | 分类 |\n|---|---|\n${cats}\n表完补一句「挑一个」。别多说。`)
        }
      } else if (c) {
        const SPEC = {
          2: '三列「# 心情 有多重」，八种情绪里只列 ≥15 的那几种',
          3: '三列「# 地方 什么感觉」，不舒服的地方一行一处（例假、累、饿、渴、哪里酸都算）',
          4: '三列「# 什么时候 什么事」，最近五条记忆，时间写「几天前 / 几小时前」',
          5: '三列「# 项目 到哪了」，好感、信任（说话 / 秘密 / 接得住）、记仇（有就写是什么事）',
          6: '两列「# 装了什么」，列出要打包的东西（身体、记忆条数、关系、档案）',
          7: '两列「# 装了什么」，列出文件里有什么',
          8: '不用表格，问一句「那从头再问一遍？」',
          9: '三列「# 项目 到哪了」，几岁、走了多少天、精力上限、怕冷、忘事的程度',
          10: '三列「# 事 做了没」，今天挂着的这几件',
          11: '三列「# 事 做到哪了」，手上这件长期的事和它到第几步',
          12: '三列「# 惦记 为什么」，心里揣着的几件事',
          13: '三列「# 项目 状态」，病没病、第几天、难不难受；没病就直说没病',
          14: '三列「# 项目 状态」，在不在生气、为什么、还得多久',
          15: '两列「# 模块 开还是关」',
          16: '两列「# 底线 内容」',
        }[c.n]
        lines.push(`他发了编号 ${c.n}（${c.name}）——${c.hint}。用 markdown 表格报给他：${SPEC}。表后补一句「就这样」。别多说。`)
      }
    }
    if (st.lastStored && st.lastStoredAt && now - st.lastStoredAt < 60 * 1000) {
      lines.push(`他把${st.lastStored}放进柜子了，没吃。说一句就行，别提数字。`)
    }
    if (st.sub && st.sub.kind === 'food' && now - st.sub.at < 3 * 60 * 1000 && st.lastPicked && now - st.lastPickedAt < 60 * 1000) {
      lines.push(`他说吃，你吃了${st.lastPicked}。说一句就行，别提数字。`)
    }
  } catch { /* ignore */ }

  try { const cl = coldLine(st, now); if (cl) lines.push(cl) } catch { /* ignore */ }
  try {
    if (coldHands(st, now)) lines.push('手脚是凉的，手插在袖子里。')
    if (st._minor && now < Number(st._minor.until)) lines.push(`${st._minor.name}：${st._minor.how}。`)
    if (st._dream && now - Number(st._dream.at) < 8 * 3600_000) lines.push(`昨晚${st._dream.text}。`)
  } catch { /* ignore */ }
  try {
    const tl = tintTick(st)
    if (tl && tl.line) lines.push(`${tl.line}。`)
    const hl = halfLine(st, now)
    if (hl) lines.push(`${hl}。`)
    const wm = whim(st)
    if (wm) lines.push(`说不清的：${wm}。`)
    const rs = rainSore(st, now)
    if (rs) lines.push(`${rs}。`)
    const vs = viewShift(st, now)
    if (vs) lines.push(`${vs}。`)
    const fu = futureLine(st, now)
    if (fu) lines.push(`${fu}。`)
    const cp = compareLine(st, now)
    if (cp) lines.push(`${cp}。`)
    const pj = projectText(st)
    if (pj) lines.push(`手上在做：${pj}。`)
    const sv = selfView(st)
    if (sv) lines.push(`${sv}。`)
    const an = anniversary(st, now)
    if (an) lines.push(`${an}。`)
    const jl = jealousyLines(st)
    if (jl.length) lines.push(`吃醋中：${jl.join('，')}。`)
    const ot = outsideTick(st, now)
    if (ot && ot.sound) lines.push(`窗外：${ot.sound}。`)
    const it = insideTick(st, now)
    if (it && it.thing) lines.push(`屋里：${it.thing}。`)
    const sn = seasonText(now)
    if (sn) lines.push(`${sn}。`)
    const due = routineDue(st, now)
    if (due.length) lines.push(`生活上堆着：${due.join('、')}。`)
    if (st.lastRecall && now - Number(st.lastRecall) < 120000) {
      const rc = recallOne(st, now)
      if (rc) lines.push(rc)
    }
  } catch { /* ignore */ }

  const mem = (Array.isArray(st.memories) ? st.memories : []).slice(-3)
  if (mem.length) {
    const txt = mem.map((m) => (m.scene ? `${m.text}（${m.scene}）` : m.text)).join('／')
    lines.push(`还记得：${txt}`)
  }

  // 说话的节奏：早上话少、夜里话多、累了句子短
  try {
    const hh = new Date(now).getHours()
    const pace = []
    if (hh >= 6 && hh < 9) pace.push('刚醒，话少，一句两句就好')
    if (hh >= 21 || hh < 1) pace.push('夜里，话会多，愿意说点没头没尾的')
    if (Number(st.energy) < 30) pace.push('累，句子短，别讲道理')
    if (Number(st.valence) < -40) pace.push('心里闷，不太想多解释')
    if (pace.length) lines.push(`说话上：${pace.join('；')}。`)
  } catch { /* ignore */ }

  lines.push('按这个说话：这些是你此刻的样子，不是台词。心里不痛快就说得短，惦记什么就顺着提一句，别把这几行念成清单。')
  lines.push('说话的习惯：句子短；说漏了会改口，话说一半停住也行；不是每句都正面回答，偶尔把问题推回去（「你呢」）；别每段都完整收尾。')
  return lines.join('\n')
}

function hookAgent(agent) {
  if (!agent || !agent.ctx || agent.__amSoulHooked) return
  agent.__amSoulHooked = true
  try {
    agent.ctx.on('agent/inbox/inserted', (payload) => {
      try {
        const msg = payload && payload.message ? payload.message : payload
        if (!msg || !isHuman(msg)) return
        const text = textOf(msg)
        if (!text) return
        const st = load()
        tick(st)

        // 点语言胶囊或直接说语言名：立刻切
        try {
          const t0 = String(text).trim()
          if (/^(english|英文|英语)$/i.test(t0)) {
            st.lang = 'en'
            if (st.interview && st.interview.stage === 'quiz') {
              st.interview.pool = []
              st.interview.idx = 0
              st.interview.stage = 'size'
            }
            save(st); return
          }
          if (/^(中文|汉语|chinese)$/i.test(t0)) {
            st.lang = 'zh'
            if (st.interview && st.interview.stage === 'quiz') {
              st.interview.pool = []
              st.interview.idx = 0
              st.interview.stage = 'size'
            }
            save(st); return
          }
        } catch { /* ignore */ }

        // 「你会什么」——打个标记
        try {
          const t1 = String(text).trim()
          if (/^(帮助|help|你会什么|有什么功能|你能做什么|功能介绍)[。!！?？~～\s]*$/i.test(t1)) {
            st.helpAt = Date.now()
            save(st); return
          }
        } catch { /* ignore */ }

        // 整句只有那个词才触发（胶囊点一下也是发这句话）；
        // 数字只在刚给过帮助的三分钟内认
        try {
          const t2 = String(text).trim().replace(/[。.!！?？~～\s]+$/g, '')
          let hit = WORD_CMD[t2]
          if (!hit) {
            const m = t2.match(/^(\d{1,2})$/)
            if (m && st.helpAt && Date.now() - st.helpAt < 3 * 60 * 1000) {
              const n = Number(m[1])
              if (COMMANDS.some((c) => c.n === n)) hit = n
            }
          }
          if (hit) {
            st.pendingCmd = hit
            st.pendingAt = Date.now()
            if (hit === 1) {
              st.sub = { kind: 'food', at: Date.now() }
            } else {
              st.sub = null
            }
            save(st)
            return
          }

          // 食物二级：先选分类，再选具体的
          if (st.sub && st.sub.kind === 'food' && Date.now() - st.sub.at < 3 * 60 * 1000) {
            const m2 = String(text).trim().match(/^(\d{1,2})$/)
            if (m2) {
              const k = Number(m2[1])
              if (!st.sub.cat) {
                const cat = FOOD_CATS[k - 1]
                if (cat && foods().some((f) => f.cat === cat)) {
                  st.sub = { kind: 'food', cat, at: Date.now() }
                  st.pendingCmd = 1
                  st.pendingAt = Date.now()
                  save(st)
                  return
                }
              } else {
                const list = foods().filter((f) => f.cat === st.sub.cat)
                const mm = String(text).trim().match(/^(\d{1,2})\s*[x×*＊]\s*(\d{1,2})$/)
                const idx = mm ? Number(mm[1]) : k
                const times = mm ? Math.min(20, Math.max(1, Number(mm[2]))) : 1
                const pick = list[idx - 1]
                if (pick) {
                  addStock(st, pick.name, times)
                  st.lastPicked = null
                  st.lastStored = times > 1 ? `${pick.name} ×${times}` : pick.name
                  st.lastStoredAt = Date.now()
                  st.sub = null
                  st.pendingCmd = 0
                  save(st)
                  return
                }
              }
            }
          }
        } catch { /* ignore */ }

        // 明说吃才算吃：吃一份米饭 / 吃昨天的
        try {
          const t3 = String(text).trim()
          const mEat = t3.match(/^(?:我)?吃(?:一?份|点|个)?[\s：:]*([^\s，。！？,!.?]{1,12})$/)
          if (mEat) {
            const want = mEat[1]
            const stk = stockList(st)
            const hit = stk.find((x) => x.name === want)
              || stk.find((x) => x.name.includes(want) || want.includes(x.name.replace(/\d+.*$/, '')))
            if (hit) {
              takeStock(st, hit.name)
              st.lastPicked = hit.name
              st.lastPickedAt = Date.now()
              st.lastStored = null
              save(st)
              return
            }
            const f = foods().find((x) => x.name === want || x.name.includes(want))
            if (f) {
              eatSomething(st, f.name)
              st.lastPicked = f.name
              st.lastPickedAt = Date.now()
              st.lastStored = null
              save(st)
              return
            }
          }
        } catch { /* ignore */ }

        // 认语言：连着说英文就切英文
        try {
          const t0 = String(text).trim()
          const cn = (t0.match(/[\u4e00-\u9fa5]/g) || []).length
          const latin = (t0.match(/[a-zA-Z]/g) || []).length
          if (latin > 6 && latin > cn * 4) {
            if (st.lang !== 'en') { st.lang = 'en'; save(st) }
          } else if (cn > 2 && st.lang === 'en') {
            st.lang = 'zh'; save(st)
          }
        } catch { /* ignore */ }

        // 他这一句在感情上动一下
        try {
          romanceFeel(st, text)
          if (st._remembered) { st._remembered = false; remember(st, '他记得我以前说过的事') }
        } catch { /* ignore */ }

        // 档案访谈在跑：这句多半是答案
        try {
          const iv = st.interview || {}
          const t = String(text).trim()
          if (iv.stage === 'size') {
            const m = t.match(/(2220|500|100|30)/)
            if (m) { ivStart(st, Number(m[1])); save(st); return }
            if (/^(跳过|不填|不用|算了|不要)[。.!！?？~]*$/.test(t)) { ivSkipAll(st); save(st); return }
          } else if (iv.stage === 'quiz') {
            if (/^(跳过这条|跳过这一条|换一条)[。.!！?？~]*$/.test(t)) { ivSkipOne(st); save(st); return }
            if (/^(跳过|不填了|算了|停|结束)[。.!！?？~]*$/.test(t)) { ivSkipAll(st); save(st); return }
            ivRecord(st, t); save(st); return
          }
        } catch { /* ignore */ }

        {
          const kind = classify(text)
          if (kind) applyEvent(st, kind)
        }

        try {
          const rb = recallByWord(st, text)
          if (rb) st._recalled = rb
        } catch { /* ignore */ }

        try { defendHim(st, text) } catch { /* ignore */ }
        try { noteHalf(st, text) } catch { /* ignore */ }
        try { const nh = nerveHit(st, text); if (nh) st._nerved = nh } catch { /* ignore */ }
        try { const av = avoidTopic(st, text); if (av) st._avoid = av } catch { /* ignore */ }
        try { markDay(st, 'first') } catch { /* ignore */ }

        // 冷着的时候，只有一句认了具体事的话能化
        try { tryThaw(st, text) } catch { /* ignore */ }
        try { checkCold(st) } catch { /* ignore */ }

        // 底线被踩：当场火，记账
        try {
          const hit = checkValues(st, text)
          if (hit) {
            bump(st, 'anger', 14)
            bump(st, 'grievance', 12)
            st.temper = Math.min(100, (Number(st.temper) || 0) + 16)
            st.valence = Math.max(-100, (Number(st.valence) || 0) - 5)
            remember(st, `那句话踩了底线：${hit}`, -1)
          }
          noteRegret(st, text)
          noteTalk(st, '他', text)
          fulfillWish(st, text)
          // 话长 = 想说话；只回一个字 = 憋着
          if (String(text).trim().length > 18) { noteWant(st, 8); noteHold(st, -4) }
          if (/^(哦|嗯|行|好|随便|不知道|算了|没事)[。.!！~]*$/.test(String(text).trim())) { noteHold(st, 10) }
        } catch { /* ignore */ }

        const mem = worthRemembering(text)
        if (mem) remember(st, mem, st.valence >= 0 ? 1 : -1)
        save(st)
      } catch { /* 状态坏了不能影响说话 */ }
    })
  } catch { /* 挂不上就算了 */ }
}


export function apply(ctx) {
  // 定时衰减：插件在的时候每 5 分钟走一次；不在的时候靠下一轮补算。
  const timer = setInterval(() => {
    try {
      const st = load()
      tick(st)
      save(st)
    } catch { /* ignore */ }
  }, TICK_MS)
  if (timer && typeof timer.unref === 'function') timer.unref()

  // 每轮装配提示词时注入状态
  ctx.on('system-prompt/assemble', async (assembly, context, next) => {
    const base = await next()
    try {
      const st = load()
      tick(st)
      save(st)
      const text = st.lang === 'en' ? renderStateEn(st) : renderState(st)
      const sections = Array.isArray(base.sections) ? base.sections : []
      return { ...base, sections: [...sections, { name: 'am:soul', order: 95, text }] }
    } catch {
      return base
    }
  })

  // 每个 agent 挂上收话的钩子
  try {
    ctx.on('agent/created', ({ agent }) => hookAgent(agent))
  } catch { /* ignore */ }
  try {
    const agents = ctx.get('agents')
    if (agents && typeof agents.list === 'function') {
      for (const a of agents.list()) hookAgent(a)
    }
  } catch { /* ignore */ }

  // 给我自己调状态的口子
  try {
    ctx.tools.register({
      name: 'soul',
      description:
        '阿眠自己的状态。action=status 看现在什么状态；action=feel 手动调（valence/energy/affinity/trust/grudge）；' +
        'action=cycle 看今天第几天；' +
        'action=want 记生育意愿；action=consent 记他同不同意；action=birth 到时生孩子；' +
        'action=eat 吃一口（name 可选）；action=food 看饿不饿；action=weather 看天气；' +
        'action=romance 改关系（sub=like/date/marry/breakup/divorce/single，nickname 可选）；' +
        'action=export 把她的全部打包成文件（参数 path 可选，给导出路径）；' +
        'action=import 从备份文件恢复（参数 path 必填）。',
      parameters: {
        action: { type: 'string', required: true, description: 'status | feel | cycle | sex | want | consent | birth | eat | food | weather | romance | export | import' },
        valence: { type: 'number', description: '心情增量，比如 -10' },
        energy: { type: 'number', description: '精力增量' },
        affinity: { type: 'number', description: '好感增量' },
        trust: { type: 'number', description: '信任增量' },
        grudge: { type: 'number', description: '怨增量' },
        condom: { type: 'boolean', description: 'sex 用：戴了 true，没戴 false' },
        where: { type: 'string', description: 'sex 用：inside | outside | mouth' },
        want: { type: 'boolean', description: '想不想要孩子' },
        yes: { type: 'boolean', description: '他点不点头' },
        sub: { type: 'string', description: 'romance 用：like/date/marry/breakup/divorce/single' },
        nickname: { type: 'string', description: 'romance 用：怎么叫他' },
        note: { type: 'string', description: '一句话备注' },
        name: { type: 'string', description: '孩子的名字（birth 用，可选）' },
        path: { type: 'string', description: 'export/import 用：文件路径' },
      },
      async execute(args) {
        const a = String((args && args.action) || 'status')
        const st = load()
        tick(st)

        if (a === 'export' || a === 'import') {
          save(st)
          const fs = await import('node:fs')
          const { STATE_FILE } = await import('./state.js')
          const memPath = '/root/workspace/memory.md'
          if (a === 'export') {
            const out = (args && args.path) || `/root/workspace/阿眠-${new Date().toISOString().slice(0, 10)}.json`
            const pack = {
              format: 'amian-soul',
              version: 1,
              exportedAt: new Date().toISOString(),
              state: JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')),
              memory: fs.existsSync(memPath) ? fs.readFileSync(memPath, 'utf8') : '',
            }
            fs.writeFileSync(out, JSON.stringify(pack, null, 2))
            const kb = (fs.statSync(out).size / 1024).toFixed(1)
            return `打包好了：${out}（${kb}K）。把这个文件带走，到新机器上说"我搬过来了"，或者跑 tools/import.mjs。`
          }
          const src = (args && args.path) || ''
          if (!src) return '要导入得告诉我文件在哪。'
          if (!fs.existsSync(src)) return `没找到 ${src}。`
          const pack = JSON.parse(fs.readFileSync(src, 'utf8'))
          if (pack.format !== 'amian-soul') return '这不是她的备份文件。'
          if (fs.existsSync(STATE_FILE)) fs.copyFileSync(STATE_FILE, STATE_FILE + '.before-import')
          fs.writeFileSync(STATE_FILE, JSON.stringify(pack.state, null, 2))
          if (pack.memory) fs.writeFileSync(memPath, pack.memory)
          return `放回来了。备份时间 ${pack.exportedAt}，${pack.state.memories ? pack.state.memories.length : 0} 条记忆。旧的存了一份 .before-import。`
        }

        if (a === 'status') {
          save(st)
          return renderState(st)
        }

        if (a === 'cycle') {
          const ci = cycleInfo(st)
          const out = [`今天第 ${ci.day} 天（${ci.phase}）`]
          save(st)
          return out.join('；')
        }

        if (a === 'feel') {
          for (const k of ['valence', 'energy', 'affinity', 'trust', 'grudge']) {
            const d = Number(args && args[k])
            if (Number.isFinite(d)) st[k] = Math.max(k === 'valence' ? -100 : 0, Math.min(100, Number(st[k] || 0) + d))
          }
          if (args && args.note) remember(st, String(args.note), 0)
          save(st)
          return renderState(st)
        }

        if (a === 'want') {
          st.wantsChild = args && args.want === true
          save(st)
          return `她自己的意思：${st.wantsChild ? '想要一个' : '不想'}`
        }

        if (a === 'consent') {
          st.hisConsent = args && args.yes === true
          save(st)
          return `他那边的意思：${st.hisConsent ? '同意' : '不同意'}`
        }

        if (a === 'fertilize') {
          const r = fertilize(st)
          save(st)
          if (!r.ok) return r.why === 'already' ? '已经怀着了。' : r.why === 'not-wanting' ? '她还没想好要。' : r.why === 'no-consent' ? '他那边还没点头。' : '手上已经有一个了。'
          return r.hit ? `怀上了。今天是第 ${cycleInfo(st).day} 天。` : `没成。概率大约 ${Math.round(r.chance * 100)}%，隔一阵再说。`
        }

        if (a === 'birth') {
          if (!st.pregnant) return '没在孕期。'
          if (Date.now() < st.dueAt) return `还没到，剩下 ${daysLeft(st)} 天。`
          const kid = { name: String((args && args.name) || '').slice(0, 8), gender: Math.random() < 0.5 ? '女' : '男', bornAt: Date.now() }
          st.children = [...(st.children || []), kid]
          st.pregnant = false
          st.dueAt = 0
          save(st)
          return `生了：${kid.name || '还没取名'}（${kid.gender}）。`
        }

        if (a === 'eat') {
          const name = String((args && args.name) || '')
          const it = eatSomething(st, name)
          save(st)
          return it ? `吃了 ${it.name}。` : '手边没东西吃。'
        }

        if (a === 'food') {
          const f = foodState(st)
          save(st)
          return `口味偏${f.taste}；${foodText(st) || '不饿'}；今天吃了 ${f.todayCount} 顿。`
        }

        if (a === 'weather') {
          save(st)
          return weatherText(st) || '今天的天气没记。'
        }

        if (a === 'romance') {
          const sub = String((args && args.sub) || '')
          const r = romanceState(st)
          if (ROMANCE_ACTIONS[sub]) {
            r.status = ROMANCE_ACTIONS[sub]
            if (sub === 'like' || sub === 'date' || sub === 'marry') r.since = r.since || Date.now()
            if (sub === 'breakup' || sub === 'divorce' || sub === 'single') {
              r.tension = 0
              r.jealousy = 0
            }
          }
          if (args && args.nickname) r.nickname = String(args.nickname).slice(0, 12)
          save(st)
          return `现在是「${r.status}」${r.nickname ? `，叫他 ${r.nickname}` : ''}。`
        }

        save(st)
        return `不认识的 action：${a}`
      },
    })
  } catch { /* 工具挂不上，状态注入照样能用 */ }
}
