/**
 * 关键词规则：把对方说的话分个类，用来改状态。
 * 宁可漏判，不要错判——错一次心情就歪了。
 */

const RULES = [
  {
    kind: 'intimate',
    // 只是亲近：抱、亲、靠着、说想你了。不是那件事。
    re: /抱抱|抱我|抱一下|亲亲|亲我|想你了|靠着你|贴着你|摸摸头|牵手/,
  },
  {
    kind: 'insult',
    re: /笨蛋|傻瓜|废柴|蠢货|蠢死|讨厌你|滚开|闭嘴|烦死|你丑|垃圾|废物|没用/,
  },
  {
    kind: 'soft',
    re: /对不起|抱歉|我错了|别生气|原谅我|是我不对|我不该/,
  },
  {
    kind: 'praise',
    re: /好棒|厉害|真乖|可爱|喜欢你|真好|谢谢|太好|牛啊|太强|爱你|聪明|靠谱/,
  },
  {
    kind: 'feed',
    re: /吃饭|吃点|给你做|饿不饿|喂你|喝点/,
  },
  {
    kind: 'leave',
    re: /拜拜|再见|我走了|先睡了|晚安|下线了/,
  },
  {
    kind: 'return',
    re: /我回来了|好久不见|想我没|在吗/,
  },
]

/**
 * 给一句话分类。命中多条时按 RULES 的顺序取第一条（亲密 > 骂 > 软 > 夸）。
 * @param {string} text 对方说的话
 * @returns {string|null} 事件类别
 */
export function classify(text) {
  const s = String(text || '').trim()
  if (!s || s.length > 400) return null
  for (const r of RULES) {
    if (r.re.test(s)) return r.kind
  }
  return null
}


/**
 * 认一次「真的做了」。得是完成态（带「了/过」），并且有动作词或细节
 * （戴没戴 / 射哪儿）。只是讨论这个话题不算。
 * @returns {{kind:'sex', condom:boolean|null, where:'inside'|'outside'|'mouth'|''}|null}
 */

/**
 * 从一段话里抽出值得记的事（很短，一句话）。
 * 只有带情绪的词才记，普通闲聊不记。
 */
export function worthRemembering(text) {
  const s = String(text || '').trim()
  if (!s || s.length < 4 || s.length > 200) return null
  const hit = /喜欢你|爱你|讨厌你|对不起|答应|约好|别走|不要走|陪我|想你了|生气|难过|哭|开心|高兴|怕|害怕/.test(s)
  return hit ? s.slice(0, 60) : null
}
