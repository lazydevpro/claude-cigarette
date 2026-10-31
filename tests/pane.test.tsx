import { expect, mock, test } from 'claude-code/testing'
import type { Engine, Mounted } from 'claude-code/testing'
import type { On, SessionRateLimit } from 'claude-code'

const T0 = Date.parse('2026-10-31T12:00:00Z')
const MINUTE = 60_000
const SVG_SURFACES = ['desktop', 'vscode'] as const

const PANE = {
  plugin: 'cigarette',
  component: 'Pane',
  requestId: 'cigarette',
  props: {
    title: '5h burn',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const BAND = {
  plugin: 'cigarette',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 12,
    bodyColumns: 85,
    scroll: { offset: 0, bodyRows: 12 },
    view: {},
  },
} as const

function fiveHour(percentUsed: number, resetsInMs: number): SessionRateLimit {
  return {
    kind: 'five_hour',
    percentUsed,
    resetsAt: new Date(T0 + resetsInMs).toISOString(),
  }
}

// Stands for the engine beneath the plugin; returns the panes it was asked to open.
function engine(
  on: On,
  { rateLimits = [], model = 'claude-sonnet-5-5' }: { rateLimits?: SessionRateLimit[]; model?: string } = {},
): string[] {
  const opened: string[] = []
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('session.usage', () => ({
    value: { startedAt: T0, context: { window: 200_000 }, rateLimits },
  }))
  on('session.model', () => ({ value: model }))
  on('command.register', () => ({ value: { command: 'cigarette' } }))
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.step', async function* (_, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn' as const,
      usage: null,
    }
  })
  return opened
}

async function start($: Engine) {
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
}

async function measure($: Engine, limit: SessionRateLimit) {
  await $.session.measure({
    context: { window: 200_000 },
    rateLimits: [limit],
    changed: ['rateLimits'],
  })
}

async function step(
  $: Engine,
  input: { model: string; effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'; agentId?: string },
) {
  const stream = $.turn.step({ turnId: 't1', index: 0, messageCount: 1, ...input })
  for await (const _ of stream) {
    // Drain it.
  }
  await stream.result
}

async function svgs(ui: Pick<Mounted, 'findAll'>) {
  return (await ui.findAll({ type: 'Svg' })).map(found => ({
    source: String(found.props.source ?? ''),
    alt: String(found.props.alt ?? ''),
    width: found.props.width,
    height: found.props.height,
  }))
}

async function words(ui: Pick<Mounted, 'findAll'>): Promise<string> {
  return (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
}

/** The smoke's moving parts: every puff, ring and exhale animates its height. */
function puffs(source: string): number {
  return source.split('attributeName="ry"').length - 1
}

async function paneSvg($: Engine) {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const [found] = await svgs(ui)
  await ui.unmount()
  return found ?? { source: '', alt: '' }
}

test('before any reading it is unlit', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)

  for (const surface of SVG_SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const [found] = await svgs(ui)
    expect(found?.alt).toBe('An unlit cigarette')
    expect(found?.source).not.toContain('url(#ember)')
    expect(await words(ui)).toContain('Not lit yet')
    await ui.unmount()
  }
})

test('the 5-hour reading burns it down and lights the ember', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  await measure($, fiveHour(42, 2 * 60 * MINUTE + 14 * MINUTE))

  for (const surface of SVG_SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const [found] = await svgs(ui)
    expect(found?.alt).toBe('A cigarette, 42% burned, at medium effort')
    // 420 units of paper, 58% left.
    expect(found?.source).toContain('width="243.6"')
    expect(found?.source).toContain('url(#ember)')
    expect(found?.source.length).toBeLessThan(131_072)
    const text = await words(ui)
    expect(text).toContain('42% of the 5-hour limit burned · resets in 2h 14m')
    expect(text).toContain('Cigarette · medium effort')
    await ui.unmount()
  }

  await clock.advance(MINUTE)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await words(ui)).toContain('resets in 2h 13m')
  await ui.unmount()
})

test('the model picks the smoke: a pipe for Fable, a cigar for Opus, a slim for Haiku', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on, { model: 'claude-opus-5-5' })
  await start($)
  await measure($, fiveHour(20, 60 * MINUTE))

  let found = await paneSvg($)
  expect(found.alt).toBe('A cigar, 20% burned, at medium effort')
  expect(found.source).toContain('url(#leaf)')
  expect(found.source).toContain('url(#label)')

  await step($, { model: 'claude-haiku-5-5', effort: 'low' })
  found = await paneSvg($)
  expect(found.alt).toBe('A slim cigarette, 20% burned, at low effort')
  expect(found.source).toContain('url(#acetate)')

  await step($, { model: 'claude-fable-5-1', effort: 'high' })
  const pipe = await paneSvg($)
  expect(pipe.alt).toBe("A wizard's pipe, 20% burned, at high effort")
  expect(pipe.source).toContain('url(#bowl)')
  // Smoke rings, more with more effort.
  expect(pipe.source.split('filter="url(#ring)"').length - 1).toBe(4)

  await step($, { model: 'claude-sonnet-5-5', effort: 'high' })
  expect((await paneSvg($)).alt).toBe('A cigarette, 20% burned, at high effort')
})

test('more effort, more smoke; a subagent does not change it', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  await measure($, fiveHour(30, 60 * MINUTE))

  await step($, { model: 'claude-sonnet-5-5', effort: 'low' })
  const low = puffs((await paneSvg($)).source)

  await step($, { model: 'claude-sonnet-5-5', effort: 'max' })
  const max = puffs((await paneSvg($)).source)
  expect(max).toBeGreaterThan(low)

  await step($, { model: 'claude-haiku-5-5', effort: 'low', agentId: 'a1' })
  const after = await paneSvg($)
  expect(after.alt).toBe('A cigarette, 30% burned, at max effort')
})

test('it smokes harder while the main turn runs, not a subagent', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  await measure($, fiveHour(30, 60 * MINUTE))
  const idle = puffs((await paneSvg($)).source)

  await $.turn.start({ text: 'hi', turnId: 'sub', agentId: 'a1' })
  expect(puffs((await paneSvg($)).source)).toBe(idle)

  await $.turn.start({ text: 'hi', turnId: 't1' })
  const working = await paneSvg($)
  expect(puffs(working.source)).toBeGreaterThan(idle)
  expect(working.alt).toContain('smoking hard while Claude works')

  await $.turn.complete({
    answer: 'done',
    durationMs: 1000,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  expect(puffs((await paneSvg($)).source)).toBe(idle)
})

test('at 100% it is burnt out, and after the reset a fresh one waits', async ($, on) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  await measure($, fiveHour(100, 30 * MINUTE))

  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const [out] = await svgs(ui)
  expect(out?.alt).toBe('A burnt-out cigarette')
  expect(out?.source).not.toContain('url(#ember)')
  expect(puffs(out?.source ?? '')).toBe(0)
  expect(await words(ui)).toContain('Burnt out: the 5-hour limit is used up · resets in 30m')
  await ui.unmount()

  await clock.advance(31 * MINUTE)
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await svgs(ui))[0]?.alt).toBe('An unlit cigarette')
  expect(await words(ui)).toContain('the 5-hour window reset')
  await ui.unmount()
})

test('the terminal draws it in colored cells', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  await measure($, fiveHour(50, 60 * MINUTE))

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const text = await words(ui)
  expect(text).toContain('██████')
  expect(text).toContain('▓')
  expect(text).toContain('50% of the 5-hour limit burned · resets in 1h')
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  await ui.unmount()
})

test('the pane opens once a session, not again on a reload', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  const opened = engine(on)
  await start($)
  await start($)

  expect(opened).toEqual(['cigarette'])
})

test('an earlier session leaves its reading and effort behind', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on, {
    reading: { percentUsed: 61, resetsAt: T0 + 45 * MINUTE, seenAt: T0 - 30 * MINUTE },
    setup: { model: 'claude-sonnet-5-5', effort: 'xhigh' },
  })
  engine(on, { model: 'claude-opus-5-5' })
  await start($)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await svgs(ui))[0]?.alt).toBe('A cigar, 61% burned, at xhigh effort')
  const text = await words(ui)
  expect(text).toContain('resets in 45m')
  expect(text).toContain('as of 30m ago')
  await ui.unmount()
})

test('the band keeps its smoke inside, fading before the edge', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on, { model: 'claude-opus-5-5' })
  await start($)
  await measure($, fiveHour(4, 3 * 60 * MINUTE + 52 * MINUTE))

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const drawn = await svgs(ui)
  expect(drawn).toHaveLength(1)
  const [band] = drawn
  expect(band?.alt).toBe('A cigar, 4% burned, at medium effort')
  expect([band?.width, band?.height]).toEqual([320, 57])
  expect(band?.source).toContain('url(#ember)')
  expect(band?.source).toContain('<g mask="url(#fadeTop)">')
  expect(puffs(band?.source ?? '')).toBeGreaterThan(0)
  // The percent printed on the cigar band's cream medallion.
  expect(band?.source).toContain('fill="#6e1010">4%</text>')
  // The rest in a card shown on hover, not beside the cigar.
  const card = (await ui.findAll({ type: 'Box' })).find(
    box => box.props.display === 'none' && box.props.position === 'absolute',
  )
  expect(card).toBeDefined()
  expect(await words(ui)).toBe(
    '4% of the 5-hour limit burned · resets in 3h 52m\nOpus · Cigar · medium effort',
  )
  await ui.unmount()
})

test('the imprint warns at 70% and pulses red from 90%', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)

  await measure($, fiveHour(50, 60 * MINUTE))
  let found = await paneSvg($)
  expect(found.source).toContain('fill="#4a2a10">50%</text>')

  await measure($, fiveHour(75, 60 * MINUTE))
  found = await paneSvg($)
  expect(found.source).toContain('fill="#9a4a00">75%</text>')
  expect(found.source).not.toContain('values="1;.3;1"')

  await measure($, fiveHour(93, 60 * MINUTE))
  found = await paneSvg($)
  expect(found.source).toContain('fill="#b71c1c">93%')
  expect(found.source).toContain('values="1;.3;1"')
})

test('an unlit band has no smoke', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const [band] = await svgs(ui)
  expect(puffs(band?.source ?? '')).toBe(0)
  expect(band?.source).not.toContain('</text>')
  expect(await words(ui)).toContain("Not lit yet: it lights with Claude's next response.")
  await ui.unmount()
})

test('the band in a terminal is a line of colored cells', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  await measure($, fiveHour(100, 20 * MINUTE))

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const text = await words(ui)
  expect(text).toContain('██████')
  expect(text).toContain('100%')
  expect(text).not.toContain('▓')
  await ui.unmount()
})

test('the band yields to a survey', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await start($)

  const ui = await $.ui.mount({
    ...BAND,
    surface: 'desktop',
    props: { ...BAND.props, hasSurvey: true },
  })
  expect(await words(ui)).toBe('engine')
  await ui.unmount()
})

const FOOTER = {
  plugin: 'cigarette',
  component: 'SessionMode',
  props: { modes: [] as readonly string[] },
} as const

async function line(ui: Pick<Mounted, 'findAll'>): Promise<string> {
  return (await ui.findAll({ type: 'Text' })).map(t => t.text).join('')
}

test('the footer draws it in thick block art beside its percent', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  await measure($, fiveHour(42, 60 * MINUTE))

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...FOOTER, surface })
    // Filter, 3 of 6 paper, a sliver of ember, medium-effort smoke, the percent.
    expect(await line(ui)).toBe('▄▄▄▄▄▖ ∿ 42%')
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    await ui.unmount()
  }
})

test('the footer keeps the mode labels after it', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  await measure($, fiveHour(10, 60 * MINUTE))

  const ui = await $.ui.mount({
    ...FOOTER,
    surface: 'desktop',
    props: { modes: ['focus', 'memory paused'] },
  })
  // No smoke beside mode labels: the percent keeps its room.
  expect(await line(ui)).toBe('▄▄▄▄▄▄▄▖ 10% · focus & memory paused')
  await ui.unmount()
})

test('a pipe in the footer blows more rings at max effort while working', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on, { model: 'claude-fable-5-1' })
  await start($)
  await measure($, fiveHour(20, 60 * MINUTE))

  await step($, { model: 'claude-fable-5-1', effort: 'low' })
  let ui = await $.ui.mount({ ...FOOTER, surface: 'desktop' })
  expect(await line(ui)).toBe('▂▂▂▂▂▂▂▇ ° 20%')
  await ui.unmount()

  await step($, { model: 'claude-fable-5-1', effort: 'max' })
  await $.turn.start({ text: 'hi', turnId: 't2' })
  ui = await $.ui.mount({ ...FOOTER, surface: 'desktop' })
  expect(await line(ui)).toBe('▂▂▂▂▂▂▂▇ O°o°O ⁂ 20%')
  await ui.unmount()
})

test('an unlit footer has no smoke and no percent', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)

  const ui = await $.ui.mount({ ...FOOTER, surface: 'desktop' })
  expect(await line(ui)).toBe('▄▄▄▄▄▄▄▄▖')
  await ui.unmount()
})

test('"ultrathink" turns the smoke cosmic for that turn', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  await measure($, fiveHour(30, 60 * MINUTE))

  await $.prompt.submit({ text: 'please ultrathink about this migration', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'please ultrathink about this migration', turnId: 't1' })
  let pane = await paneSvg($)
  expect(pane.source).toContain('url(#nebula)')
  expect(pane.alt).toContain('its smoke gone cosmic')
  let ui = await $.ui.mount({ ...FOOTER, surface: 'desktop' })
  expect(await line(ui)).toContain('✦')
  await ui.unmount()

  await $.turn.complete({ answer: 'done', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' })
  pane = await paneSvg($)
  expect(pane.source).not.toContain('url(#nebula)')
  ui = await $.ui.mount({ ...FOOTER, surface: 'desktop' })
  expect(await line(ui)).not.toContain('✦')
  await ui.unmount()
})

test('a prompt that only mentions thinking stays normal', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  await measure($, fiveHour(30, 60 * MINUTE))

  await $.prompt.submit({ text: 'think hard about the ultra-wide layout', wait: false, origin: { kind: 'composer' } })
  expect((await paneSvg($)).source).not.toContain('url(#nebula)')
})

test('max effort while Claude works throws an inferno', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  await measure($, fiveHour(40, 60 * MINUTE))

  await step($, { model: 'claude-sonnet-5-5', effort: 'max' })
  const idle = await paneSvg($)
  await $.turn.start({ text: 'go', turnId: 't1' })
  const inferno = await paneSvg($)
  expect(inferno.alt).toContain('throwing sparks while Claude works')
  // A shower of sparks: far more than max effort at rest.
  const sparks = (source: string) => source.split('fill="#fff3c0"/></g>').length - 1
  expect(sparks(inferno.source)).toBe(22)
  expect(sparks(idle.source)).toBe(6)
  const ui = await $.ui.mount({ ...FOOTER, surface: 'desktop' })
  expect(await line(ui)).toContain('⁂')
  await ui.unmount()
})

test('hovering the smoke takes a drag', async ($, on) => {
  mock.clock(on, { now: T0 })
  mock.store(on)
  engine(on)
  await start($)
  await measure($, fiveHour(20, 60 * MINUTE))

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const [band] = await svgs(ui)
  expect(band?.source).toContain('svg:hover .boost')
  expect(band?.source).toContain('class="boost"')
  expect(band?.source).toContain('class="exhale"')
  await ui.unmount()
})
