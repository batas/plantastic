export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { connectMqtt } = await import('@/lib/mqtt')
    await connectMqtt().catch((err) => console.error('[startup] mqtt', err))
    const { runReminderWorker } = await import('@/lib/services/reminders')
    runReminderWorker()
  }
}
