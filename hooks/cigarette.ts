// Draws the smoke as SVG: a cigar, a cigarette, a slim or a wizard's pipe.
// Pure: the same look gives the same text, so a redraw that changes nothing
// leaves the animation running.

export type Kind = 'cigar' | 'cigarette' | 'slim' | 'pipe'

export type Look = {
  kind: Kind
  /** 0 to 1: how much is gone. */
  burned: number
  /** False before any reading: drawn unlit. */
  isLit: boolean
  /** A turn is running: a hotter ember and more smoke. */
  isWorking: boolean
  /** Reasoning effort, 0 (low) to 4 (max): how hard it burns and smokes. */
  effort: number
  /** Printed where it never burns (filter, label, bowl): the percent used. */
  imprint?: string
  /** `warning` tints the imprint; `alarm` tints it red and pulses. */
  tone?: Tone
}

export type Tone = 'calm' | 'warning' | 'alarm'

/**
 * `pane`: the whole scene, the smoke rising tall. `band`: cropped for the
 * band above the prompt, which clips whatever leaves it, so there the smoke
 * drifts back over the stick and fades out before it reaches the edge.
 */
export type Layout = 'pane' | 'band'

const WIDTH = 640
// The stick's center line; the smoke rises above it.
const CENTER_Y = 270
const PANE_TOP = CENTER_Y - 260
const PANE_HEIGHT = 300
const BAND_TOP = CENTER_Y - 80
const BAND_BOTTOM = CENTER_Y + 34

/** The band's drawing in CSS pixels: the SVG at half size. */
export const BAND_SIZE = { width: WIDTH / 2, height: (BAND_BOTTOM - BAND_TOP) / 2 }

type Stick = {
  radius: number
  /** The mouth end's x. */
  head: number
  /** Where the filter ends; a cigar has none. */
  filterEnd: number
  /** The ring between filter and paper, or a cigar's label. */
  ring: [number, number]
  paperStart: number
  paperMax: number
  ashMax: number
  filter: 'cork' | 'white' | 'none'
  ringFill: 'gold' | 'blue' | 'label'
  wrap: 'paper' | 'leaf'
  /** How thick its smoke is next to a cigarette's. */
  smoke: number
}

const STICKS: Record<Exclude<Kind, 'pipe'>, Stick> = {
  cigarette: {
    radius: 17,
    head: 24,
    filterEnd: 144,
    ring: [144, 150],
    paperStart: 150,
    paperMax: 420,
    ashMax: 46,
    filter: 'cork',
    ringFill: 'gold',
    wrap: 'paper',
    smoke: 1,
  },
  slim: {
    radius: 12,
    head: 24,
    filterEnd: 132,
    ring: [132, 136],
    paperStart: 136,
    paperMax: 440,
    ashMax: 36,
    filter: 'white',
    ringFill: 'blue',
    wrap: 'paper',
    smoke: 0.75,
  },
  cigar: {
    radius: 27,
    head: 24,
    filterEnd: 24,
    ring: [62, 172],
    paperStart: 180,
    paperMax: 380,
    ashMax: 84,
    filter: 'none',
    ringFill: 'label',
    wrap: 'leaf',
    smoke: 1.4,
  },
}

// A long churchwarden pipe: a thin stem, a gold ferrule, a deep bowl.
const PIPE = {
  bitEnd: 70,
  stemY: CENTER_Y + 12,
  bowlX: 474,
  bowlWidth: 58,
  rimY: CENTER_Y - 24,
  bowlBottom: CENTER_Y + 30,
}

function clamp(n: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, n))
}

function round(n: number): number {
  return Math.round(n * 10) / 10
}

function hundredths(n: number): number {
  return Math.round(n * 100) / 100
}

// Fixed pseudo-random points, so speckles stay put between redraws.
function scatter(count: number, seed: number): Array<[number, number]> {
  let state = seed
  const next = () => {
    state = (state * 1103515245 + 12345) % 2147483648
    return state / 2147483648
  }

  return Array.from({ length: count }, () => [next(), next()])
}

function stops(...colors: Array<[number, string]>): string {
  return colors.map(([at, color]) => `<stop offset="${at}" stop-color="${color}"/>`).join('')
}

function band(id: string, ...colors: Array<[number, string]>): string {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops(...colors)}</linearGradient>`
}

const DEFS =
  '<defs>' +
  band('paper', [0, '#cfcac0'], [0.35, '#f7f4ee'], [0.5, '#ffffff'], [0.85, '#e6e1d8'], [1, '#bdb7ac']) +
  band('cork', [0, '#a5662d'], [0.4, '#d89b5b'], [0.55, '#e6b072'], [1, '#b06f35']) +
  band('white', [0, '#d9d9d6'], [0.45, '#fbfbf9'], [0.6, '#ffffff'], [1, '#cfcfcb']) +
  band('gold', [0, '#9c7a26'], [0.5, '#f1d483'], [1, '#9c7a26']) +
  band('blue', [0, '#4c7fbf'], [0.5, '#a9cdf5'], [1, '#4c7fbf']) +
  band('label', [0, '#6e1010'], [0.45, '#c0392b'], [0.6, '#d2483a'], [1, '#6e1010']) +
  band('leaf', [0, '#3a2213'], [0.3, '#7a4a26'], [0.5, '#93603a'], [0.75, '#6b3f1f'], [1, '#2e1a0e']) +
  band('wood', [0, '#3b1f0e'], [0.35, '#7d4522'], [0.5, '#9a5a2e'], [1, '#2c170a']) +
  band('bit', [0, '#000000'], [0.4, '#3a3a3a'], [1, '#050505']) +
  band('ash', [0, '#5f5f5f'], [0.45, '#a9a9a9'], [0.7, '#8c8c8c'], [1, '#4f4f4f']) +
  band('cigarash', [0, '#7d7a76'], [0.4, '#d6d3ce'], [0.7, '#b3afa9'], [1, '#6a6762']) +
  '<linearGradient id="bowl" x1="0" y1="0" x2="1" y2="0">' +
  stops([0, '#2e170a'], [0.3, '#7d4522'], [0.45, '#a6653a'], [0.7, '#6b3a1c'], [1, '#24120a']) +
  '</linearGradient>' +
  '<linearGradient id="char" x1="0" y1="0" x2="1" y2="0">' +
  '<stop offset="0" stop-color="#2b1d16" stop-opacity="0"/>' +
  stops([0.5, '#5a3b22'], [1, '#1f140e']) +
  '</linearGradient>' +
  '<radialGradient id="ember" cx=".5" cy=".5" r=".5">' +
  stops([0, '#fff2b0'], [0.35, '#ffb02e'], [0.75, '#ff4d12']) +
  '<stop offset="1" stop-color="#b3200a" stop-opacity="0"/></radialGradient>' +
  '<filter id="glow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="3.2"/></filter>' +
  '<filter id="soft" x="-150%" y="-150%" width="400%" height="400%"><feGaussianBlur stdDeviation="7"/></filter>' +
  '<filter id="haze" x="-50%" y="-200%" width="200%" height="500%"><feGaussianBlur stdDeviation="1.4"/></filter>' +
  '</defs>'

function top(s: Stick): number {
  return CENTER_Y - s.radius
}

function veins(s: Stick, from: number, to: number): string {
  const y = top(s)
  let out = ''
  for (let x = from + 18; x + 16 < to; x += 37) {
    out += `<path d="M${x} ${y + 3}l16 ${s.radius * 2 - 6}" stroke="#2a170b" stroke-width="1.3" opacity=".35"/>`
  }
  return out
}

function headPart(s: Stick): string {
  const y = top(s)
  const height = s.radius * 2

  if (s.filter === 'none') {
    // A cigar's rounded cap and the head behind its band, never smoked.
    const x = s.head + s.radius
    return (
      `<path d="M${x} ${y}A${s.radius} ${s.radius} 0 0 0 ${x} ${y + height}L${s.paperStart + 1} ${y + height}L${s.paperStart + 1} ${y}Z" fill="url(#leaf)"/>` +
      veins(s, x, s.paperStart)
    )
  }

  if (s.filter === 'white') {
    return (
      `<rect x="${s.head}" y="${y}" width="${s.filterEnd - s.head + 2}" height="${height}" rx="3" fill="url(#white)"/>` +
      `<rect x="${s.filterEnd - 16}" y="${y}" width="1.6" height="${height}" fill="#7aa7dc" opacity=".8"/>` +
      `<rect x="${s.filterEnd - 11}" y="${y}" width="1.6" height="${height}" fill="#7aa7dc" opacity=".8"/>`
    )
  }

  const specks = scatter(26, 7)
    .map(([u, v]) => {
      const x = round(s.head + 6 + u * (s.filterEnd - s.head - 10))
      const sy = round(y + 4 + v * (height - 8))
      return `<ellipse cx="${x}" cy="${sy}" rx="1.6" ry="1.1" fill="#7d4a1f" opacity=".45"/>`
    })
    .join('')

  return `<rect x="${s.head}" y="${y}" width="${s.filterEnd - s.head + 4}" height="${height}" rx="5" fill="url(#cork)"/>${specks}`
}

function wrapPart(s: Stick, paper: number): string {
  if (paper <= 0.5) return ''

  const y = top(s)
  const height = s.radius * 2
  const fill = s.wrap === 'leaf' ? 'url(#leaf)' : 'url(#paper)'
  let out = `<rect x="${s.paperStart}" y="${y}" width="${round(paper)}" height="${height}" fill="${fill}"/>`

  if (s.wrap === 'leaf') {
    // The wrapper leaf's veins, slanting across it.
    out += veins(s, s.paperStart, s.paperStart + paper)
  }

  return out
}

function ringPart(s: Stick, paperEnd: number): string {
  const [from, to] = s.ring
  const end = Math.min(to, paperEnd)
  if (end <= from) return ''

  const y = top(s)
  const height = s.radius * 2
  const ring = `<rect x="${from}" y="${y}" width="${round(end - from)}" height="${height}" fill="url(#${s.ringFill})"/>`

  if (s.ringFill !== 'label') return ring

  // A cigar's label: gold edges, the imprint between them.
  return (
    ring +
    `<rect x="${from}" y="${y}" width="2.5" height="${height}" fill="#e9c46a"/>` +
    (to <= paperEnd ? `<rect x="${to - 2.5}" y="${y}" width="2.5" height="${height}" fill="#e9c46a"/>` : '')
  )
}

function ashPart(s: Stick, x: number, length: number): string {
  if (length <= 0.5) return ''

  const y = top(s)
  const height = s.radius * 2
  const isCigar = s.wrap === 'leaf'
  const marks = scatter(Math.max(2, Math.round(length / (isCigar ? 9 : 6))), 11)
    .map(([u, v]) => {
      const fx = round(x + 2 + u * (length - 4))
      // A cigar's ash rings around; a cigarette's flecks.
      return isCigar
        ? `<rect x="${fx}" y="${y + 2}" width="1.6" height="${height - 4}" fill="#5e5b57" opacity=".3"/>`
        : `<rect x="${fx}" y="${round(y + 3 + v * (height - 6))}" width="1.4" height="${round(3 + v * 6)}" fill="#3f3f3f" opacity=".35"/>`
    })
    .join('')
  // Ash sags and narrows a little toward its end.
  const end = x + length
  const shape =
    `M${round(x)} ${y + 1}L${round(end - 3)} ${y + 3}Q${round(end + 1)} ${CENTER_Y} ${round(end - 3)} ${y + height - 1}` +
    `L${round(x)} ${y + height - 1}Z`

  return `<path d="${shape}" fill="url(#${isCigar ? 'cigarash' : 'ash'})"/>${marks}`
}

function pace(effort: number, isWorking: boolean): string {
  return `${round((isWorking ? 1.4 : 3) - 0.15 * effort)}s`
}

function heatOf(effort: number, isWorking: boolean): number {
  return clamp(0.5 + 0.1 * effort + (isWorking ? 0.15 : 0), 0, 1)
}

function flicker(heat: number): string {
  return `${round(heat * 0.45)};${round(heat)};${round(heat * 0.6)};${round(heat * 0.95)};${round(heat * 0.45)}`
}

function emberPart(s: Stick, x: number, effort: number, isWorking: boolean): string {
  const r = s.radius
  const heat = heatOf(effort, isWorking)
  const beat = pace(effort, isWorking)
  // A thin burn line: a narrow glow hugging it, wider only a little with effort.
  const halo = round(r * 0.28 + 0.8 * effort)
  const tall = round(r + 1 + effort)
  const char = round(r * 0.25)

  return (
    `<ellipse cx="${round(x + 1)}" cy="${CENTER_Y}" rx="${halo}" ry="${tall}" fill="#ff5a1f" filter="url(#glow)" opacity="${round(heat)}">` +
    `<animate attributeName="opacity" values="${flicker(heat)}" dur="${beat}" repeatCount="indefinite"/></ellipse>` +
    `<rect x="${round(x - char)}" y="${top(s)}" width="${char}" height="${r * 2}" fill="url(#char)"/>` +
    `<ellipse cx="${round(x + 1)}" cy="${CENTER_Y}" rx="${round(r * 0.16)}" ry="${r - 1}" fill="url(#ember)">` +
    `<animate attributeName="rx" values="${round(r * 0.12)};${round(r * 0.2)};${round(r * 0.14)};${round(r * 0.18)};${round(r * 0.12)}" dur="${beat}" repeatCount="indefinite"/></ellipse>`
  )
}

type Plume = {
  /** Where the smoke leaves: the tip, or the pipe's rim. */
  x: number
  y: number
  /** Thickness next to a cigarette's. */
  scale: number
  effort: number
  isWorking: boolean
  layout: Layout
}

// How far the smoke may go: up and tall in the pane; in the band, low and
// back over the stick, gone before the band's edge.
function reach(p: Plume) {
  const working = p.isWorking ? 1 : 0

  if (p.layout === 'pane') {
    return {
      rise: Math.round(Math.min(250, (100 + 28 * p.effort + working * 50) * (0.85 + 0.15 * p.scale))),
      drift: 0,
      size: p.scale,
    }
  }

  return {
    rise: Math.round(Math.min(p.y - BAND_TOP - 26, 26 + 4 * p.effort + working * 6)),
    // Never so far it reaches the band's left edge.
    drift: Math.round(Math.min(p.x - 70, 50 + 26 * p.effort + working * 40)),
    size: p.scale * 0.5,
  }
}

// Many small, blurred, overlapping puffs read as one drifting plume. Effort
// makes it denser and longer; a running turn, more so.
function plumePart(p: Plume): string {
  const working = p.isWorking ? 1 : 0
  const thickness = p.scale > 1 ? 1.15 : p.scale < 1 ? 0.8 : 1
  const puffs = Math.round((7 + 4 * p.effort + working * (6 + 3 * p.effort)) * thickness)
  const seconds = round((p.isWorking ? 4.2 : 6.5) - 0.35 * p.effort)
  const peak = Math.min(0.5, (0.15 + 0.045 * p.effort + working * 0.08) * thickness)
  const { rise, drift, size } = reach(p)
  const fade = `0;${hundredths(peak)};${hundredths(peak * 0.8)};${hundredths(peak * 0.35)};0`

  return Array.from({ length: puffs }, (_, i) => {
    const [u = 0.5, v = 0.5] = scatter(1, 101 + i)[0] ?? []
    const sway = (u - 0.5) * 2
    const begin = round(-(i * seconds) / puffs)
    const path =
      `0 0;${round(3 * sway - drift * 0.15)} ${round(-rise * 0.25)};${round(-10 * sway - drift * 0.4)} ${round(-rise * 0.55)};` +
      `${round(14 * sway + 6 - drift * 0.7)} ${round(-rise * 0.8)};${round(-8 * sway + 10 - drift)} ${-rise}`
    const grow = [2, 6 + v * 3, 14 + v * 6, 24 + v * 10, 32 + v * 12]
      .map(r => round(r * size))
      .join(';')

    return (
      `<circle cx="${round(p.x)}" cy="${round(p.y)}" r="2" fill="#cfcfcf" opacity="0" filter="url(#soft)">` +
      `<animateTransform attributeName="transform" type="translate" values="${path}" dur="${seconds}s" begin="${begin}s" repeatCount="indefinite"/>` +
      `<animate attributeName="r" values="${grow}" dur="${seconds}s" begin="${begin}s" repeatCount="indefinite"/>` +
      `<animate attributeName="opacity" values="${fade}" dur="${seconds}s" begin="${begin}s" repeatCount="indefinite"/>` +
      `</circle>`
    )
  }).join('')
}

// A pipe's smoke: rings that widen as they rise, a thin haze between them.
function ringsPart(p: Plume): string {
  const working = p.isWorking ? 1 : 0
  const rings = 2 + p.effort + working * 2
  const seconds = round((p.isWorking ? 3.4 : 5.2) - 0.3 * p.effort)
  const peak = hundredths(Math.min(0.75, 0.4 + 0.07 * p.effort + working * 0.1))
  const { rise, drift } = reach(p)
  const wide = p.layout === 'pane' ? 30 : 15

  const haze = plumePart({ ...p, effort: Math.max(0, p.effort - 2), isWorking: false, scale: 0.5 })

  return (
    haze +
    Array.from({ length: rings }, (_, i) => {
      const begin = round(-(i * seconds) / rings)
      const lean = i % 2 === 0 ? 1 : -1
      const path = `0 0;${round(4 * lean - drift * 0.3)} ${round(-rise * 0.4)};${round(-6 * lean - drift * 0.7)} ${round(-rise * 0.75)};${round(8 * lean - drift)} ${-rise}`

      return (
        `<ellipse cx="${round(p.x)}" cy="${round(p.y)}" rx="3" ry="1" fill="none" stroke="#d6d6d6" stroke-width="3" opacity="0" filter="url(#haze)">` +
        `<animateTransform attributeName="transform" type="translate" values="${path}" dur="${seconds}s" begin="${begin}s" repeatCount="indefinite"/>` +
        `<animate attributeName="rx" values="3;${round(wide * 0.5)};${round(wide * 0.8)};${wide}" dur="${seconds}s" begin="${begin}s" repeatCount="indefinite"/>` +
        `<animate attributeName="ry" values="1;${round(wide * 0.17)};${round(wide * 0.26)};${round(wide * 0.32)}" dur="${seconds}s" begin="${begin}s" repeatCount="indefinite"/>` +
        `<animate attributeName="stroke-width" values="3;2.6;2;1.4" dur="${seconds}s" begin="${begin}s" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="0;${peak};${hundredths(peak * 0.6)};0" dur="${seconds}s" begin="${begin}s" repeatCount="indefinite"/>` +
        `</ellipse>`
      )
    }).join('')
  )
}

function unlitEnd(s: Stick, x: number): string {
  const y = top(s)
  const height = s.radius * 2
  const isCigar = s.wrap === 'leaf'
  const specks = scatter(Math.round(height / 3.5), 3)
    .map(([u, v]) => {
      const sy = round(y + 4 + v * (height - 8))
      return `<circle cx="${round(x - 1 + u * 3)}" cy="${sy}" r="1.2" fill="#2e1a0c" opacity=".6"/>`
    })
    .join('')

  return `<ellipse cx="${round(x)}" cy="${CENTER_Y}" rx="${round(s.radius * 0.25)}" ry="${s.radius - 1}" fill="${isCigar ? '#5a3418' : '#8b5a2b'}"/>${specks}`
}

function stickScene(look: Look, layout: Layout, kind: Exclude<Kind, 'pipe'>) {
  const s = STICKS[kind]
  const effort = clamp(look.effort, 0, 4)
  const gone = look.isLit ? clamp(look.burned, 0, 1) : 0
  const paper = s.paperMax * (1 - gone)
  const paperEnd = s.paperStart + paper
  const isOut = look.isLit && gone >= 0.999
  const ash = look.isLit && !isOut ? Math.min(s.ashMax, s.paperMax * gone) : 0

  let end: string
  if (!look.isLit) {
    end = unlitEnd(s, paperEnd)
  } else if (isOut) {
    end = `<rect x="${s.paperStart - 4}" y="${top(s)}" width="6" height="${s.radius * 2}" fill="url(#char)"/>`
  } else {
    end = ashPart(s, paperEnd, ash) + emberPart(s, paperEnd, effort, look.isWorking)
  }

  const smoke = isSmoking(look)
    ? plumePart({
        x: paperEnd + ash,
        y: top(s) + 3,
        scale: s.smoke,
        effort,
        isWorking: look.isWorking,
        layout,
      })
    : ''

  return {
    stick: headPart(s) + wrapPart(s, paper) + ringPart(s, paperEnd) + end,
    smoke,
  }
}

// The pipe stays whole; what burns is the bowl's tobacco, its top going from
// brown to grey ash as the limit is used, its ember shrinking with it.
function pipeScene(look: Look, layout: Layout) {
  const { bitEnd, stemY, bowlX, bowlWidth, rimY, bowlBottom } = PIPE
  const effort = clamp(look.effort, 0, 4)
  const gone = look.isLit ? clamp(look.burned, 0, 1) : 0
  const isOut = look.isLit && gone >= 0.999
  const center = bowlX + bowlWidth / 2
  const right = bowlX + bowlWidth

  const bit =
    `<path d="M24 ${stemY - 3}Q20 ${stemY} 24 ${stemY + 3}L${bitEnd} ${stemY + 4.5}L${bitEnd} ${stemY - 4.5}Z" fill="url(#bit)"/>` +
    `<rect x="${bitEnd}" y="${stemY - 5}" width="7" height="10" fill="url(#gold)"/>`
  const stem = `<path d="M${bitEnd + 7} ${stemY - 4.5}L${bowlX + 6} ${stemY - 6.5}L${bowlX + 6} ${stemY + 6.5}L${bitEnd + 7} ${stemY + 4.5}Z" fill="url(#wood)"/>`
  const bowl =
    `<path d="M${bowlX} ${rimY}L${right} ${rimY}C${right} ${bowlBottom - 12} ${right - 9} ${bowlBottom} ${center} ${bowlBottom}` +
    `C${bowlX + 9} ${bowlBottom} ${bowlX} ${bowlBottom - 12} ${bowlX} ${rimY}Z" fill="url(#bowl)"/>` +
    `<ellipse cx="${center}" cy="${rimY}" rx="${bowlWidth / 2}" ry="6" fill="#24120a"/>`

  const innerX = bowlWidth / 2 - 4
  const tobacco = `<ellipse cx="${center}" cy="${rimY}" rx="${innerX}" ry="4" fill="${isOut ? '#8a8a8a' : '#6b4423'}"/>`

  let top = ''
  if (look.isLit && !isOut) {
    const heat = heatOf(effort, look.isWorking)
    const beat = pace(effort, look.isWorking)
    const ember = round(innerX * (0.9 - 0.6 * gone))
    top =
      `<ellipse cx="${center}" cy="${rimY - 2}" rx="${round(bowlWidth / 2 - 8 + effort)}" ry="${round(3 + effort)}" fill="#ff5a1f" filter="url(#glow)" opacity="${round(heat)}">` +
      `<animate attributeName="opacity" values="${flicker(heat)}" dur="${beat}" repeatCount="indefinite"/></ellipse>` +
      `<ellipse cx="${center}" cy="${rimY}" rx="${ember}" ry="3.4" fill="url(#ember)">` +
      `<animate attributeName="rx" values="${round(ember * 0.8)};${ember};${round(ember * 0.85)};${round(ember * 0.95)};${round(ember * 0.8)}" dur="${beat}" repeatCount="indefinite"/></ellipse>` +
      `<ellipse cx="${center}" cy="${rimY}" rx="${innerX}" ry="4" fill="#9a9a9a" opacity="${hundredths(0.1 + 0.8 * gone)}"/>`
  }

  const smoke = isSmoking(look)
    ? ringsPart({ x: center, y: rimY - 3, scale: 1, effort, isWorking: look.isWorking, layout })
    : ''

  return { stick: bit + stem + bowl + tobacco + top, smoke }
}

const INKS: Record<'cork' | 'white' | 'gold', Record<Tone, string>> = {
  cork: { calm: '#4a2a10', warning: '#9a4a00', alarm: '#b71c1c' },
  white: { calm: '#2f4d7a', warning: '#a65a00', alarm: '#c62828' },
  gold: { calm: '#f3d27a', warning: '#ffc24d', alarm: '#ff8a7a' },
}

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Printed like a brand mark: on the cork, the white filter, the cigar's
// label or the pipe's bowl, none of which burns away.
function imprintPart(look: Look): string {
  if (!look.imprint) return ''

  const tone = look.tone ?? 'calm'
  const place =
    look.kind === 'pipe'
      ? { x: PIPE.bowlX + PIPE.bowlWidth / 2, y: CENTER_Y + 4, size: 17, ink: INKS.gold }
      : look.kind === 'cigar'
        ? { x: (STICKS.cigar.ring[0] + STICKS.cigar.ring[1]) / 2, y: CENTER_Y, size: 22, ink: INKS.gold }
        : look.kind === 'slim'
          ? { x: (STICKS.slim.head + STICKS.slim.filterEnd) / 2, y: CENTER_Y, size: 16, ink: INKS.white }
          : { x: (STICKS.cigarette.head + STICKS.cigarette.filterEnd) / 2, y: CENTER_Y, size: 19, ink: INKS.cork }
  const pulse =
    tone === 'alarm'
      ? '<animate attributeName="opacity" values="1;.3;1" dur="1.6s" repeatCount="indefinite"/>'
      : ''

  return (
    `<text x="${place.x}" y="${place.y}" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="${place.size}" ` +
    `letter-spacing=".5" fill="${place.ink[tone]}">${escapeText(look.imprint)}${pulse}</text>`
  )
}

function svg(viewBox: [number, number, number, number], body: string): string {
  const [, , width, height] = viewBox

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(' ')}" width="${width}" height="${height}">${body}</svg>`
}

/** Whether this look gives off smoke at all: lit, and not burnt out. */
export function isSmoking(look: Look): boolean {
  return look.isLit && look.burned < 0.999
}

export function cigaretteSvg(look: Look, layout: Layout = 'pane'): string {
  const scene =
    look.kind === 'pipe' ? pipeScene(look, layout) : stickScene(look, layout, look.kind)
  const stick = scene.stick + imprintPart(look)
  const { smoke } = scene

  if (layout === 'band') {
    // The band clips at its edge: the smoke fades out well before it.
    const height = BAND_BOTTOM - BAND_TOP
    const fade =
      '<defs><linearGradient id="fadeTopGrad" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#000"/><stop offset=".12" stop-color="#000"/>' +
      '<stop offset=".5" stop-color="#fff"/></linearGradient>' +
      `<mask id="fadeTop" maskUnits="userSpaceOnUse" x="0" y="${BAND_TOP}" width="${WIDTH}" height="${height}">` +
      `<rect x="0" y="${BAND_TOP}" width="${WIDTH}" height="${height}" fill="url(#fadeTopGrad)"/></mask></defs>`

    return svg(
      [0, BAND_TOP, WIDTH, height],
      DEFS + fade + `<g mask="url(#fadeTop)">${smoke}</g>` + stick,
    )
  }

  return svg([0, PANE_TOP, WIDTH, PANE_HEIGHT], DEFS + stick + smoke)
}
