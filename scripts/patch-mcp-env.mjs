// One-off dev patch: add ELECTRON_RUN_AS_NODE to the cross-agent-sync MCP
// entries the app wrote before that fix. Backs up both files first.
import fs from 'node:fs'

const codex = 'C:/Users/LSR/.codex/config.toml'
const zcode = 'C:/Users/LSR/Desktop/测试开发1/.zcode/config.json'

let t = fs.readFileSync(codex, 'utf8')
if (!/ELECTRON_RUN_AS_NODE/.test(t)) {
  fs.copyFileSync(codex, codex + '.cas-bak')
  t = t.replace(/env = \{ CAS_DB_PATH/, 'env = { ELECTRON_RUN_AS_NODE = "1", CAS_DB_PATH')
  fs.writeFileSync(codex, t)
  console.log('config.toml: patched (backup .cas-bak)')
} else {
  console.log('config.toml: already has ELECTRON_RUN_AS_NODE')
}

if (fs.existsSync(zcode)) {
  const j = JSON.parse(fs.readFileSync(zcode, 'utf8'))
  const srv = j?.mcp?.servers?.['cross-agent-sync']
  if (srv) {
    if (!srv.env?.ELECTRON_RUN_AS_NODE) {
      fs.copyFileSync(zcode, zcode + '.cas-bak')
      srv.env = { ELECTRON_RUN_AS_NODE: '1', ...(srv.env || {}) }
      fs.writeFileSync(zcode, JSON.stringify(j, null, 2) + '\n')
      console.log('zcode config: patched (backup .cas-bak)')
    } else {
      console.log('zcode config: already has ELECTRON_RUN_AS_NODE')
    }
  } else {
    console.log('zcode config: cross-agent-sync entry missing')
  }
} else {
  console.log('zcode config: not found')
}
