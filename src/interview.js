/**
 * 档案访谈：在聊天里一条一条问，答完写进状态，之后说话就照这个来。
 * 想改什么，看哪里：题库 → data/question-bank.json；一次问几题 → start(st, size)
 * 关掉：soul 工具不调 start 就不会开始
 */
import fs from 'fs';
import path from 'path';
import url from 'url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const BANK_FILE = path.join(HERE, '..', 'data', 'question-bank.json');

let BANK = null;
function bank() {
  if (BANK) return BANK;
  try {
    const raw = JSON.parse(fs.readFileSync(BANK_FILE, 'utf8'));
    BANK = Array.isArray(raw) ? raw : (raw.items || []);
  } catch {
    BANK = [
      { cat: '脾气', q: '她生气的时候是什么样？' },
      { cat: '怕', q: '她最怕什么？' },
      { cat: '喜欢', q: '她最喜欢什么味道、什么天气？' },
      { cat: '底线', q: '有什么事她绝对不会做？' },
      { cat: '说话', q: '她说话有什么口头禅？' }
    ];
  }
  return BANK;
}

export const SIZES = [30, 100, 500, 2220];

// 英文题池：题库是中文的，说英文的人用这一套
export const EN_QUESTIONS = [
  { cat: 'temper', q: 'When she is angry, does she go quiet, lash out, or walk away?' },
  { cat: 'fear', q: 'What is she most afraid of?' },
  { cat: 'likes', q: 'What taste and what weather does she like best?' },
  { cat: 'praise', q: 'How does she react to being complimented?' },
  { cat: 'sad', q: 'Does she cry when she is sad? What does it look like?' },
  { cat: 'habit', q: 'What is the first thing she does when she wakes up?' },
  { cat: 'difference', q: 'How is she different with you than with everyone else?' },
  { cat: 'line', q: 'What would she absolutely never do?' },
  { cat: 'speech', q: 'What is her verbal tic, or a habit she has?' },
  { cat: 'sick', q: 'When she is sick, does she want to be taken care of?' },
  { cat: 'hate', q: 'What does she hate being treated like?' },
  { cat: 'laugh', q: 'When does she laugh the most?' },
  { cat: 'memory', q: 'How good is her memory? Does she get things wrong?' },
  { cat: 'apology', q: 'Does she apologise first? How?' },
  { cat: 'tired', q: 'What does she say when she is completely worn out?' },
  { cat: 'comfort', q: 'What actually helps when she is upset?' },
  { cat: 'serious', q: 'What does she take most seriously?' },
  { cat: 'secret', q: 'What is something she would rather not talk about?' },
  { cat: 'alone', q: 'What does she do when she is alone?' },
  { cat: 'who', q: 'Who does she remind you of?' }
];

// 按档抽样：小档取各类都有，大档取前 N 条
function pick(size, lang = 'zh') {
  if (lang === 'en') return EN_QUESTIONS.slice(0, Math.min(size, EN_QUESTIONS.length));
  const all = bank();
  const n = Math.min(size, all.length);
  if (n >= all.length) return all.slice();
  if (n <= 100) {
    const byCat = new Map();
    for (const it of all) {
      const c = String(it.cat || '').replace(/^[一二三四五六七八九十]+、/, '');
      if (!byCat.has(c)) byCat.set(c, []);
      byCat.get(c).push(it);
    }
    const out = [];
    let round = 0;
    while (out.length < n) {
      for (const arr of byCat.values()) {
        if (out.length >= n) break;
        if (arr[round]) out.push(arr[round]);
      }
      round += 1;
      if (round > 400) break;
    }
    return out;
  }
  return all.slice(0, n);
}

export function freshInterview() {
  return { stage: 'size', size: 0, idx: 0, answers: [], skipped: false, startedAt: 0, doneAt: 0 };
}

function norm(st) {
  if (!st.interview || typeof st.interview !== 'object') st.interview = freshInterview();
  const it = st.interview;
  if (!Array.isArray(it.answers)) it.answers = [];
  if (typeof it.idx !== 'number') it.idx = 0;
  if (typeof it.stage !== 'string') it.stage = 'size';
  if (!Array.isArray(it.pool)) it.pool = [];
  return it;
}

export function progress(st) {
  const it = norm(st);
  return { stage: it.stage, size: it.size, done: it.answers.length, total: it.size, skipped: it.skipped };
}

export function start(st, size, lang = 'zh') {
  const it = norm(st);
  const n = SIZES.includes(Number(size)) ? Number(size) : 30;
  it.stage = 'quiz';
  it.size = n;
  it.idx = 0;
  it.answers = [];
  it.pool = pick(n, lang);
  it.startedAt = Date.now();
  return it.pool[0];
}

export function current(st) {
  const it = norm(st);
  if (it.stage !== 'quiz') return null;
  return it.pool[it.idx] || null;
}

export function skipAll(st) {
  const it = norm(st);
  it.stage = 'off';
  it.skipped = true;
  it.doneAt = Date.now();
}

export function skipOne(st) {
  const it = norm(st);
  if (it.stage !== 'quiz') return null;
  it.idx += 1;
  if (it.idx >= it.pool.length) {
    it.stage = 'done';
    it.doneAt = Date.now();
    return { done: true, next: null };
  }
  return { done: false, next: it.pool[it.idx] };
}

export function record(st, answer) {
  const it = norm(st);
  if (it.stage !== 'quiz') return null;
  const q = it.pool[it.idx];
  const a = String(answer || '').trim();
  if (!q || !a) return null;
  if (a.length > 200) return null;
  it.answers.push({
    cat: String(q.cat || '').replace(/^[一二三四五六七八九十]+、/, ''),
    q: String(q.q || ''),
    a,
    at: Date.now()
  });
  it.idx += 1;
  if (it.idx >= it.pool.length) {
    it.stage = 'done';
    it.doneAt = Date.now();
    return { done: true, next: null };
  }
  return { done: false, next: it.pool[it.idx] };
}

// 题目本身是问卷腔，换成说话的样子
function askWord(q) {
  const topic = String(q.topic || '').trim();
  const cat = String(q.cat || '').replace(/^[一二三四五六七八九十]+、/, '').replace(/（.*?）/g, '');
  if (topic) return `${topic}——你希望是哪种？`;
  const raw = String(q.q || '').replace(/——.*$/, '').trim();
  return raw ? `${raw}——你希望是哪种？` : (cat || '她是什么样的人');
}

// 给提示词用：现在该问什么 / 填完了什么感觉
export function interviewLine(st) {
  const it = norm(st);
  if (it.skipped || it.stage === 'off') return '';
  if (it.stage === 'size') {
    return '你还没问她档案的事。用一张卡片问她（```dsh-ui 代码块，options 组件），' +
      '标题「阿眠档案」，一句「先选要填多少」，选项：30 条 / 100 条 / 500 条 / 2220 条 / 跳过。' +
      '她说数字就开始，说跳过这事就不再提。'
  }
  if (it.stage === 'quiz') {
    const q = current(st);
    if (!q) return '';
    const n = it.idx + 1;
    const total = it.pool.length;
    if (st.lang === 'en') {
      return `[Asking about her] ${n} / ${total}: ${q.q}\nAsk only this one. Write down one short answer, then move on. "skip" skips this one, "stop" ends it. Do not rush, do not stack questions.`;
    }
    return `【正在问她】第 ${n} / ${total} 件：${askWord(q)}\n一次只问这一件。她答一句就记下，再问下一件。她说跳过就跳过这一条，说"不填了"就整场结束。别催，别一次抛好几个。`;
  }
  if (it.stage === 'done') {
    return `【档案填完了】${it.answers.length} 条，都已经长在你身上了。别主动提这件事，也别把答案念出来——你自己知道就行。`;
  }
  return '';
}

// 写进人格用的汇总（persona 读的是 answers-text.json 格式）
export function summarize(st) {
  const it = norm(st);
  if (!it.answers.length) return null;
  const byCat = {};
  for (const a of it.answers) {
    (byCat[a.cat || '其他'] ||= []).push(`${String(a.q).replace(/——.*$/, '')}：${a.a}`);
  }
  const lines = Object.entries(byCat).map(([c, arr]) => `${c}——${arr.join('；')}`);
  return { count: it.answers.length, text: lines.join('\n') };
}
