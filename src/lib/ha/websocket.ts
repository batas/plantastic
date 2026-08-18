import WebSocket from 'ws'
import { getConfig } from '@/lib/settings'

let cmdId = 0

interface WsResult<T = unknown> {
  id: number
  type: string
  success?: boolean
  result?: T
  error?: { code: string; message: string }
}

export async function wsCommand<T = unknown>(type: string, data?: Record<string, unknown>): Promise<T> {
  const cfg = getConfig()
  const rawUrl = cfg.ha?.url
  const token = cfg.ha?.token
  if (!rawUrl || !token) throw new Error('Brak adresu URL lub tokena HA')

  const wsUrl = rawUrl.replace(/^http/, 'ws').replace(/\/+$/, '') + '/api/websocket'

  return new Promise<T>((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const timeout = setTimeout(() => {
      ws.close()
      reject(new Error('HA WebSocket timeout'))
    }, 15000)

    const myId = ++cmdId

    ws.on('open', () => {
      console.log(`[ha/ws] connected to ${wsUrl}`)
    })

    ws.on('message', (raw) => {
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return
      }

      if (msg.type === 'auth_required') {
        ws.send(JSON.stringify({ type: 'auth', access_token: token }))
      } else if (msg.type === 'auth_ok') {
        console.log('[ha/ws] auth OK, sending command:', type)
        ws.send(JSON.stringify({ id: myId, type, ...(data ?? {}) }))
      } else if (msg.type === 'auth_invalid') {
        clearTimeout(timeout)
        ws.close()
        reject(new Error(`HA auth failed: ${msg.message ?? 'unknown'}`))
      } else if (msg.type === 'result' && msg.id === myId) {
        clearTimeout(timeout)
        ws.close()
        const result = msg as unknown as WsResult<T>
        if (result.success === false) {
          reject(new Error(`HA WS error: ${result.error?.message ?? 'unknown'}`))
        } else {
          resolve(result.result as T)
        }
      }
    })

    ws.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })

    ws.on('close', () => {
      clearTimeout(timeout)
    })
  })
}
