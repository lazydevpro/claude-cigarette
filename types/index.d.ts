/** The last `five_hour` rate-limit reading: times in epoch milliseconds. */
export type Reading = { percentUsed: number; resetsAt?: number; seenAt: number }

/** The main loop's model and reasoning effort, as last seen. */
export type Setup = { model: string | null; effort: string | number | null }

declare module 'claude-code' {
  interface PluginState {
    cigarette: {
      reading: Shaped<Reading | null>
      setup: Shaped<Setup>
      isWorking: boolean
      hasOpened: boolean
      tick: number
    }
  }
}
