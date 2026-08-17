import { readFileSync, writeFileSync } from 'node:fs'

const token = process.env.SUPERVISOR_TOKEN
if (!token) process.exit(0)

let ingressUrl
try {
  const res = await fetch('http://supervisor/addons/self', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) process.exit(0)
  const data = await res.json()
  ingressUrl = data.ingress_url
} catch { process.exit(0) }

if (!ingressUrl) process.exit(0)

const basePath = ingressUrl.replace(/\/+$/, '')
if (!basePath) process.exit(0)

console.log(`[addon] Patching basePath to: ${basePath}`)

function patchFile(path, replacements) {
  try {
    let content = readFileSync(path, 'utf8')
    for (const [s, r] of replacements) content = content.replaceAll(s, r)
    writeFileSync(path, content)
  } catch (err) {
    console.error(`[addon] Failed to patch ${path}:`, err.message)
  }
}

patchFile('/app/server.js', [
  [`"basePath":""`, `"basePath":"${basePath}"`],
])
patchFile('/app/.next/routes-manifest.json', [
  [`"basePath": ""`, `"basePath": "${basePath}"`],
])
patchFile('/app/.next/required-server-files.json', [
  [`"basePath": ""`, `"basePath": "${basePath}"`],
])

console.log('[addon] BasePath patched successfully')
