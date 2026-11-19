// 导入：在新机器上把她放回去
import fs from 'node:fs'

const STATE = '/root/workspace/阿眠/state.json'
const MEMORY = '/root/workspace/memory.md'

const src = process.argv[2]
if (!src) {
  console.error('用法：node tools/import.mjs 备份文件.json')
  process.exit(1)
}

const pack = JSON.parse(fs.readFileSync(src, 'utf8'))
if (pack.format !== 'amian-soul') {
  console.error('不是她的备份文件。')
  process.exit(1)
}

// 先把现在的存一份，搬错了还能退回去
if (fs.existsSync(STATE)) {
  const bak = STATE + '.before-import'
  fs.copyFileSync(STATE, bak)
  console.log(`原来的存了一份：${bak}`)
}

fs.mkdirSync('/root/workspace/阿眠', { recursive: true })
fs.writeFileSync(STATE, JSON.stringify(pack.state, null, 2))
if (pack.memory) fs.writeFileSync(MEMORY, pack.memory)

const st = pack.state
console.log(`放回去了。备份时间 ${pack.exportedAt}`)
console.log(`  ${st.ageDays ?? 0} 天，心情 ${Math.round(st.valence)}，好感 ${Math.round(st.affinity)}，记忆 ${(st.memories || []).length} 条`)
