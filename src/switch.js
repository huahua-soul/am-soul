/**
 * switch.js —— 模块开关
 *
 * data/modules.json 里写：
 *   { "links": true, "soul": true, "body": true, "life": true, "couple": true, "interview": true }
 *
 * 关掉哪个，那部分就不跑，也不会崩。没写的默认开。
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'

const DIR = '/root/workspace/阿眠'
const FILE = DIR + '/modules.json'

const DEFAULTS = {
  links: true,
  soul: true,
  body: true,
  life: true,
  couple: true,
  interview: true,
}

export const MODULE_NAMES = {
  links: '联动规则（一千条）',
  soul: '心里的事（情绪/惦记/后悔/底线）',
  body: '身体（体重/睡眠债/干净度）',
  life: '生活（吃/作息/天气/感情）',
  couple: '互相影响（饿就烦、熬夜伤身）',
  interview: '填表',
}

let cache = null

export function mods() {
  if (cache) return cache
  let raw = {}
  try {
    if (existsSync(FILE)) raw = JSON.parse(readFileSync(FILE, 'utf8')) || {}
  } catch { raw = {} }
  const out = { ...DEFAULTS }
  for (const k of Object.keys(DEFAULTS)) {
    if (typeof raw[k] === 'boolean') out[k] = raw[k]
  }
  cache = out
  return out
}

export function on(name) {
  return mods()[name] !== false
}

export function setMod(name, val) {
  if (!(name in DEFAULTS)) return false
  const m = { ...mods(), [name]: !!val }
  try {
    if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true })
    writeFileSync(FILE, JSON.stringify(m, null, 2))
  } catch { /* ignore */ }
  cache = null
  return true
}

export function resetCache() { cache = null }

export function switchText() {
  const m = mods()
  return Object.keys(DEFAULTS)
    .map((k) => `${m[k] ? '开' : '关'} ${k}　${MODULE_NAMES[k]}`)
    .join('\n')
}
