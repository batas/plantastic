export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getConfig } = await import('@/lib/settings')
    const cfg = getConfig()
    if (cfg.mqtt?.host && (cfg.mqtt?.user || cfg.mqtt?.password)) {
      const { connectMqtt } = await import('@/lib/mqtt')
      await connectMqtt().catch((err) => console.error('[startup] mqtt', err))
    } else {
      console.log('[startup] mqtt: pominięto — brak konfiguracji (host + user/password)')
    }
    const { runReminderWorker } = await import('@/lib/services/reminders')
    runReminderWorker()
    const { startPlanRegenerator } = await import('@/lib/services/plan-regenerator')
    startPlanRegenerator()
  }
}
