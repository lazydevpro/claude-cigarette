import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type { Reading, Setup } from '../types'
import { BAND_SIZE, cigaretteSvg } from './cigarette'
import type { Kind, Look, Tone } from './cigarette'

const PANE = 'cigarette'
const TITLE = '5h burn'
// Kept in $.store too, so a new session shows the last reading, model and
// effort before its first response arrives.
const STORE_KEY = 'reading'
const SETUP_KEY = 'setup'
const MINUTE = 60_000
// Past this age the label says when the reading was taken: other sessions
// burn the same limit, and only this session's responses refresh it.
const STALE_AFTER = 10 * MINUTE
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
const NOUNS: Record<Kind, string> = {
  cigar: 'cigar',
  cigarette: 'cigarette',
  slim: 'slim cigarette',
  pipe: "wizard's pipe",
}

// Change a tag when its value's fields change: it declines what an earlier
// version stored, which outlives a reload.
const reading = atom({ plugin: 'cigarette', key: 'reading' } as const, null, {
  shape: 'reading-1',
})
const setup = atom(
  { plugin: 'cigarette', key: 'setup' } as const,
  { model: null, effort: null },
  { shape: 'setup-1' },
)
const isWorking = atom({ plugin: 'cigarette', key: 'isWorking' } as const, false)
// An "ultrathink" turn: the smoke goes cosmic until the turn ends.
const cosmic = atom({ plugin: 'cigarette', key: 'cosmic' } as const, false)
// The pane opens by itself once per session; after that, /cigarette.
const hasOpened = atom({ plugin: 'cigarette', key: 'hasOpened' } as const, false)
// Rewritten every minute so the countdown redraws.
const tick = atom({ plugin: 'cigarette', key: 'tick' } as const, 0)

function fromLimits(
  limits: readonly SessionRateLimit[],
  seenAt: number,
): Reading | null {
  const window = limits.find(limit => limit.kind === 'five_hour')
  if (!window) return null

  const resetsAt = window.resetsAt ? Date.parse(window.resetsAt) : NaN

  return Number.isFinite(resetsAt)
    ? { percentUsed: window.percentUsed, resetsAt, seenAt }
    : { percentUsed: window.percentUsed, seenAt }
}

function fromStore(value: unknown): Reading | null {
  if (typeof value !== 'object' || value === null) return null
  const { percentUsed, resetsAt, seenAt } = value as Record<string, unknown>
  if (typeof percentUsed !== 'number' || typeof seenAt !== 'number') return null

  return typeof resetsAt === 'number'
    ? { percentUsed, resetsAt, seenAt }
    : { percentUsed, seenAt }
}

function setupFromStore(value: unknown): Setup {
  const { model, effort } =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}

  return {
    model: typeof model === 'string' ? model : null,
    effort: typeof effort === 'string' || typeof effort === 'number' ? effort : null,
  }
}

function newer(a: Reading | null, b: Reading | null): Reading | null {
  if (!a) return b
  if (!b) return a

  return b.seenAt >= a.seenAt ? b : a
}

async function remember($: EngineInterface, next: Reading) {
  await update($, reading, current => newer(current, next))
  await $.store.set(STORE_KEY, next)
}

// Records the model and effort in use; a change redraws and is kept.
async function noteSetup($: EngineInterface, change: Partial<Setup>) {
  const current = await read($, setup)
  const next = { ...current, ...change }
  if (next.model === current.model && next.effort === current.effort) return

  await update($, setup, () => next)
  await $.store.set(SETUP_KEY, next)
}

function kindOf(model: string | null): Kind {
  const name = (model ?? '').toLowerCase()
  if (name.includes('fable')) return 'pipe'
  if (name.includes('opus')) return 'cigar'
  if (name.includes('haiku')) return 'slim'

  return 'cigarette'
}

/** Effort as 0 (low) to 4 (max); medium when it is not known yet. */
function effortLevel(effort: string | number | null): number {
  if (typeof effort === 'number') {
    // A thinking budget, in tokens.
    if (effort < 4_000) return 0
    if (effort < 12_000) return 1
    if (effort < 24_000) return 2
    if (effort < 48_000) return 3
    return 4
  }

  const level = EFFORTS.findIndex(name => name === effort)

  return level === -1 ? 1 : level
}

function effortName(effort: string | number | null): string {
  if (typeof effort === 'number') return `${effort}-token`

  return effort ?? 'medium'
}

function capitalized(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`
}

/** "Opus · " for claude-opus-5-5; nothing for a model it does not know. */
function family(model: string | null): string {
  const name = /fable|opus|sonnet|haiku/.exec((model ?? '').toLowerCase())?.[0]

  return name ? `${capitalized(name)} · ` : ''
}

const TONE_COLORS: Record<Tone, 'warning' | 'error' | undefined> = {
  calm: undefined,
  warning: 'warning',
  alarm: 'error',
}

function duration(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / MINUTE))
  if (minutes < 60) return `${minutes}m`

  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60

  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

type Scene = {
  burned: number
  isLit: boolean
  isOut: boolean
  label: string
  note?: string
  /** Printed on the stick: the percent used. */
  imprint?: string
  tone: Tone
}

function scene(last: Reading | null, now: number): Scene {
  if (!last) {
    return {
      burned: 0,
      isLit: false,
      isOut: false,
      label: "Not lit yet: it lights with Claude's next response.",
      tone: 'calm',
    }
  }

  if (last.resetsAt !== undefined && last.resetsAt <= now) {
    return {
      burned: 0,
      isLit: false,
      isOut: false,
      label: "A fresh one: the 5-hour window reset. It lights with Claude's next response.",
      tone: 'calm',
    }
  }

  const percent = Math.round(last.percentUsed)
  const resets =
    last.resetsAt === undefined ? '' : ` · resets in ${duration(last.resetsAt - now)}`
  const age = now - last.seenAt
  const note = age > STALE_AFTER ? `as of ${duration(age)} ago` : undefined
  const isOut = percent >= 100

  return {
    burned: isOut ? 1 : last.percentUsed / 100,
    isLit: true,
    isOut,
    label: isOut
      ? `Burnt out: the 5-hour limit is used up${resets}`
      : `${percent}% of the 5-hour limit burned${resets}`,
    ...(note ? { note } : {}),
    imprint: `${Math.min(100, percent)}%`,
    tone: percent >= 90 ? 'alarm' : percent >= 70 ? 'warning' : 'calm',
  }
}

// The terminal draws no SVG: a one-line stick of colored cells.
function cells(kind: Kind, shown: Scene, columns: number) {
  const isBurning = shown.isLit && !shown.isOut

  if (kind === 'pipe') {
    // A pipe does not shorten: its bowl's top turns from ember to ash.
    return {
      filter: '▬'.repeat(Math.max(8, Math.min(24, columns - 8))),
      filterColor: '#7d4522',
      paper: '█',
      paperColor: '#6b3a1c',
      ember: isBurning && shown.burned < 0.5 ? '▓' : '',
      ash: isBurning && shown.burned >= 0.5 ? '▒' : '',
      smoke: isBurning ? ' o' : '',
    }
  }

  const filter = kind === 'cigar' ? 0 : 6
  const paperMax = Math.max(8, Math.min(34, columns - filter - 4))
  const paper = shown.isLit
    ? Math.round(paperMax * (1 - Math.min(1, shown.burned)))
    : paperMax

  return {
    filter: '█'.repeat(filter),
    filterColor: kind === 'slim' ? '#f2f2f0' : '#c98a4b',
    paper: '█'.repeat(paper),
    paperColor: kind === 'cigar' ? '#7a4a26' : '#eeeae2',
    ember: isBurning ? '▓' : '',
    ash: isBurning && shown.burned > 0.02 ? '▒' : '',
    smoke: isBurning ? ' ~' : '',
  }
}

type Part = { text: string; color: string }

// How thick each smoke is drawn: a lower block, resting on the baseline like
// a stick on a table, so the smoke rises above it.
const BLOCKS: Record<Kind, string> = {
  slim: '▃',
  cigarette: '▄',
  cigar: '▅',
  pipe: '▂',
}

// The footer draws text alone, so its smoke is block art: a solid stick that
// shortens as it burns, and smoke that thickens with effort. Its slot holds
// about 24 characters, so the art stays short.
function footerArt(kind: Kind, shown: Scene, look: Look, isCompact: boolean): Part[] {
  const block = BLOCKS[kind]
  const isBurning = shown.isLit && !shown.isOut
  const length = 6
  const paper = shown.isLit ? Math.round(length * (1 - Math.min(1, shown.burned))) : length
  const strength = Math.min(4, look.effort + (look.isWorking ? 1 : 0))
  // Beside mode labels there is no room for smoke: the percent comes first.
  const smoke = isBurning && !isCompact
    ? (kind === 'pipe' ? ['°', '°o', '°oO', 'o°oO', 'O°o°O'] : ['~', '∿', '∿∿', '∿∿∿', '∿∿∿∿'])[strength] ?? ''
    : ''
  const cosmicSmoke = ['✧', '✧✦', '✦✧✦', '✧✦✧✦', '✦✧✦✧✦'][strength] ?? '✦'
  const puff: Part[] = !smoke
    ? []
    : look.mode === 'cosmic'
      ? [{ text: ` ${cosmicSmoke}`, color: '#b79bff' }]
      : [
          { text: ` ${smoke}`, color: '#9a9a9a' },
          ...(isInferno(look) ? [{ text: ' ⁂', color: '#ffb347' }] : []),
        ]
  // The burning end is a sliver: a half-width quadrant, ember while lit,
  // tobacco while not.
  const tail: Part[] = [
    ...(isBurning ? [{ text: '▖', color: '#ff5a1f' }] : []),
    ...(!shown.isLit ? [{ text: '▖', color: '#8b5a2b' }] : []),
    ...puff,
  ]

  switch (kind) {
    case 'pipe':
      // A thin stem, then a tall bowl, glowing while it burns.
      return [
        { text: '▂'.repeat(length + 1), color: '#9a5a2e' },
        {
          text: '▇',
          color: isBurning ? '#c4521c' : shown.isOut ? '#5a3418' : '#7d4522',
        },
        ...puff,
      ]
    case 'cigar':
      return [
        { text: block, color: '#7a4a26' },
        { text: block, color: '#c0392b' },
        { text: block.repeat(paper), color: '#8b5a2b' },
        ...tail,
      ]
    case 'slim':
      return [
        { text: block.repeat(2), color: '#e8e8e4' },
        { text: block.repeat(paper), color: '#f5f3ee' },
        ...tail,
      ]
    default:
      return [
        { text: block.repeat(2), color: '#c98a4b' },
        { text: block.repeat(paper), color: '#f3efe7' },
        ...tail,
      ]
  }
}

/** Max effort while Claude works: the drawing throws a shower of sparks. */
function isInferno(look: Look): boolean {
  return look.effort >= 4 && look.isWorking
}

function altText(kind: Kind, shown: Scene, look: Look, effort: string): string {
  const noun = NOUNS[kind]
  if (!shown.isLit) return `An unlit ${noun}`
  if (shown.isOut) return `A burnt-out ${noun}`

  const percent = Math.round(shown.burned * 100)
  const working = isInferno(look)
    ? ', throwing sparks while Claude works'
    : look.isWorking
      ? ', smoking hard while Claude works'
      : ''
  const egg = look.mode === 'cosmic' ? ', its smoke gone cosmic' : ''

  return `A ${noun}, ${percent}% burned, at ${effort} effort${working}${egg}`
}

// Everything a drawing needs, read so that a change to any of it redraws.
async function view($: EngineInterface) {
  const last = await read($, reading)
  const { model, effort } = await read($, setup)
  const working = await read($, isWorking)
  const isCosmic = await read($, cosmic)
  await read($, tick)
  const shown = scene(last, await $.clock.now())
  const kind = kindOf(model)
  const look: Look = {
    kind,
    burned: shown.burned,
    isLit: shown.isLit,
    isWorking: working,
    effort: effortLevel(effort),
    tone: shown.tone,
    mode: isCosmic ? 'cosmic' : 'normal',
    ...(shown.imprint ? { imprint: shown.imprint } : {}),
  }
  const egg = isCosmic ? ' · ultrathink' : isInferno(look) ? ' · inferno' : ''
  const detail = `${family(model)}${capitalized(NOUNS[kind])} · ${effortName(effort)} effort${egg}`

  return { shown, kind, look, alt: altText(kind, shown, look, effortName(effort)), detail }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'cigarette',
      description: 'Show a smoke that burns down with your 5-hour usage limit',
    })

    const now = await $.clock.now()
    const live = fromLimits((await $.session.usage()).rateLimits, now)
    const stored = fromStore(await $.store.get(STORE_KEY))

    await update($, reading, current => newer(current, newer(stored, live)))
    if (live) await $.store.set(STORE_KEY, live)
    await update($, tick, () => now)

    // The model is read now; the effort arrives with the first model
    // request, so until then the last one seen stands.
    const kept = setupFromStore(await $.store.get(SETUP_KEY))
    const model = await $.session.model().catch(() => null)
    await update($, setup, current => ({
      model: model ?? current.model ?? kept.model,
      effort: current.effort ?? kept.effort,
    }))

    $.clock.every(MINUTE, () => {
      void (async () => {
        const time = await $.clock.now()
        await update($, tick, () => time)
        const latest = await $.session.model().catch(() => null)
        if (latest) await noteSetup($, { model: latest })
      })().catch(() => undefined)
    })

    if (!(await read($, hasOpened))) {
      await update($, hasOpened, () => true)
      void $.ui.open({ id: PANE, title: TITLE })
    }

    return next(e)
  })

  on('command.run', { command: 'cigarette' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: TITLE })

    return {
      text: opened.isPlaced
        ? 'Cigarette pane opened.'
        : 'The cigarette pane is waiting for room to open.',
    }
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      const live = fromLimits(e.rateLimits, await $.clock.now())
      if (live) await remember($, live)
    }

    return next(e)
  })

  // Each main-thread model request names the model and effort it runs at.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      await noteSetup($, { model: e.model, effort: e.effort ?? null }).catch(
        () => undefined,
      )
    }

    return yield* next(e)
  })

  // The easter egg: ask Claude to ultrathink, and the smoke becomes a nebula for that turn.
  on('prompt.submit', async ($, e, next) => {
    if (!e.isMeta && /\bultrathink\b/i.test(e.text)) await update($, cosmic, () => true)

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) await update($, isWorking, () => true)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await update($, isWorking, () => false)
      await update($, cosmic, () => false)
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { shown, kind, look, alt, detail } = await view($)
    const toneColor = TONE_COLORS[shown.tone]
    const labelLook = toneColor ? { color: toneColor } : shown.isLit ? {} : { dimColor: true }

    if (e.surface === 'terminal') {
      const { Box, Text } = $.ui.resolve(e)
      const cig = cells(kind, shown, e.props.bodyColumns)

      return (
        <Box flexDirection="column">
          <Box>
            <Text color={cig.filterColor}>{cig.filter}</Text>
            <Text color={cig.paperColor}>{cig.paper}</Text>
            <Text color="#ff5a1f">{cig.ember}</Text>
            <Text color="#8c8c8c">{cig.ash}</Text>
            <Text dimColor>{cig.smoke}</Text>
          </Box>
          <Text {...labelLook}>{shown.label}</Text>
          <Text dimColor>{shown.note ? `${detail} · ${shown.note}` : detail}</Text>
        </Box>
      )
    }

    const { Box, Svg, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Svg source={cigaretteSvg(look, 'pane')} alt={alt} isInteractive />
        <Text {...labelLook}>{shown.label}</Text>
        <Text dimColor>{shown.note ? `${detail} · ${shown.note}` : detail}</Text>
      </Box>
    )
  })

  // The band above the prompt: the smoke alone, its numbers printed on it,
  // the rest in a card shown while the pointer rests on it.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const { shown, kind, look, alt, detail } = await view($)
    const toneColor = TONE_COLORS[shown.tone]
    const when = shown.note ? `${shown.label} · ${shown.note}` : shown.label

    if (e.surface === 'terminal') {
      const { Box, Text } = $.ui.resolve(e)
      const cig = cells(kind, shown, e.props.bodyColumns - 12)

      return (
        <Box>
          <Text color={cig.filterColor}>{cig.filter}</Text>
          <Text color={cig.paperColor}>{cig.paper}</Text>
          <Text color="#ff5a1f">{cig.ember}</Text>
          <Text color="#8c8c8c">{cig.ash}</Text>
          <Text dimColor>{cig.smoke} </Text>
          {shown.imprint && (
            <Text {...(toneColor ? { color: toneColor } : { dimColor: true })}>{shown.imprint}</Text>
          )}
        </Box>
      )
    }

    const { Box, Svg, Text } = $.ui.resolve(e)

    return (
      <Box key="smoke">
        <Svg
          source={cigaretteSvg(look, 'band')}
          alt={alt}
          width={BAND_SIZE.width}
          height={BAND_SIZE.height}
          isInteractive
        />
        <Box
          position="absolute"
          display="none"
          hover={{ display: 'flex' }}
          flexDirection="column"
        >
          <Text {...(toneColor ? { color: toneColor } : {})}>{when}</Text>
          <Text dimColor>{detail}</Text>
        </Box>
      </Box>
    )
  })

  // The footer beside the model name, where the app draws text alone: the
  // smoke in line art, its percent, and any mode labels after them.
  on('ui.render', { component: 'SessionMode' }, async ($, e) => {
    const { shown, kind, look } = await view($)
    const { Box, Text } = $.ui.resolve(e)
    const toneColor = TONE_COLORS[shown.tone]

    return (
      <Box>
        {footerArt(kind, shown, look, e.props.modes.length > 0).map(part => (
          <Text color={part.color}>{part.text}</Text>
        ))}
        {shown.imprint && (
          <Text {...(toneColor ? { color: toneColor } : { dimColor: true })}>
            {' '}
            {shown.imprint}
          </Text>
        )}
        {e.props.modes.length > 0 && <Text dimColor> · {e.props.modes.join(' & ')}</Text>}
      </Box>
    )
  })
}
