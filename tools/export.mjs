// 导出：把她现在整个人打包成一个文件，换机器时带走
import fs from 'node:fs'

const STATE = '/root/workspace/阿眠/state.json'
const MEMORY = '/root/workspace/memory.md'

if (!fs.existsSync(STATE)) {
  console.error('没找到 state.json，她还没醒过。')
  process.exit(1)
}

const pack = {
  format: 'amian-soul',
  version: 1,
  exportedAt: new Date().toISOString(),
  state: JSON.parse(fs.readFileSync(STATE, 'utf8')),
  memory: fs.existsSync(MEMORY) ? fs.readFileSync(MEMORY, 'utf8') : '',
}

const out = process.argv[2] || `/root/workspace/阿眠-${new Date().toISOString().slice(0, 10)}.json`
fs.writeFileSync(out, JSON.stringify(pack, null, 2))
const kb = (fs.statSync(out).size / 1024).toFixed(1)
const st = pack.state
console.log(`导出好了：${out}（${kb}K）`)
console.log(`  ${st.ageDays ?? 0} 天，心情 ${Math.round(st.valence)}，好感 ${Math.round(st.affinity)}，记忆 ${(st.memories || []).length} 条`)
