// Draws the smoke as SVG: a cigar, a cigarette, a slim or a wizard's pipe. v2: real
// materials, a living ember, smoke that rises as a stream and breaks into curls, effort tiers,
// two hidden modes, and a drag on hover.
//
// Pure: the same look gives the same text, so a redraw that changes nothing leaves the
// animation running. Animation is SMIL (and CSS for hover), which the app's interactive SVG
// plays and the film steps frame by frame.

export type Kind = 'cigar' | 'cigarette' | 'slim' | 'pipe'
export type Tone = 'calm' | 'warning' | 'alarm'
/** `cosmic`: an "ultrathink" turn. The smoke becomes a nebula. */
export type Mode = 'normal' | 'cosmic'

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
  mode?: Mode
  /** Draw the drag that hovering gives, without a pointer (the film's cursor). */
  isDrag?: boolean
}

/**
 * `pane`: the whole scene, the smoke rising tall, full materials. `band`: cropped for the band
 * above the prompt, which clips what leaves it, so the smoke drifts back over the stick and
 * fades before the edge; lighter on filters, since it animates all day.
 */
export type Layout = 'pane' | 'band'

const WIDTH = 640
// The stick's centre line; the smoke rises above it.
const CENTER_Y = 270
const PANE_TOP = CENTER_Y - 260
const PANE_HEIGHT = 300
const BAND_TOP = CENTER_Y - 80
const BAND_BOTTOM = CENTER_Y + 34

/** The band's drawing in CSS pixels: the SVG at half size. */
export const BAND_SIZE = { width: WIDTH / 2, height: (BAND_BOTTOM - BAND_TOP) / 2 }

type Stick = {
  radius: number
  head: number
  filterEnd: number
  ring: [number, number]
  paperStart: number
  paperMax: number
  ashMax: number
  filter: 'cork' | 'white' | 'none'
  ringFill: 'foil' | 'blue' | 'label'
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
    ringFill: 'foil',
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

// A long churchwarden pipe: a glossy black stem, a brass ferrule, a briar shank and bowl.
const PIPE = {
  bitEnd: 300,
  ferrule: 310,
  stemY: CENTER_Y + 12,
  bowlX: 474,
  bowlWidth: 58,
  rimY: CENTER_Y - 24,
  bowlBottom: CENTER_Y + 30,
}

// ── Numbers ──────────────────────────────────────────────────────────────────────────────

function clamp(n: number, low = 0, high = 1): number {
  return Math.min(high, Math.max(low, n))
}

const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100

/** A seeded random stream, so the drawing is the same on every redraw. */
function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

function anim(attr: string, values: string, dur: number, extra = ''): string {
  return `<animate attributeName="${attr}" values="${values}" dur="${r2(dur)}s" repeatCount="indefinite"${extra}/>`
}

function move(values: string, dur: number, begin = 0, extra = ''): string {
  return `<animateTransform attributeName="transform" type="translate" values="${values}" dur="${r2(dur)}s" begin="${r2(begin)}s" repeatCount="indefinite"${extra}/>`
}

// ── The look's heat ──────────────────────────────────────────────────────────────────────

type Heat = {
  effort: number
  /** 0 to 1: effort and work together. */
  intensity: number
  working: boolean
  inferno: boolean
  cosmic: boolean
}

function heatOf(look: Look): Heat {
  const effort = clamp(look.effort, 0, 4)
  const working = look.isWorking
  return {
    effort,
    intensity: clamp((effort + (working ? 1 : 0)) / 5),
    working,
    inferno: effort >= 4 && working,
    cosmic: look.mode === 'cosmic',
  }
}

// ── Definitions ──────────────────────────────────────────────────────────────────────────

function stops(...colors: Array<[number, string, number?]>): string {
  return colors
    .map(([at, color, alpha]) => `<stop offset="${at}" stop-color="${color}"${alpha === undefined ? '' : ` stop-opacity="${alpha}"`}/>`)
    .join('')
}

function vertical(id: string, ...colors: Array<[number, string, number?]>): string {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops(...colors)}</linearGradient>`
}

function horizontal(id: string, ...colors: Array<[number, string, number?]>): string {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">${stops(...colors)}</linearGradient>`
}

function defs(layout: Layout): string {
  const rich = layout === 'pane'
  return (
    '<defs>' +
    // Cylinders, lit softly from above: matte, so a broad falloff and no hot line.
    vertical('paper', [0, '#a49d91'], [0.14, '#d3cdc1'], [0.34, '#ebe7df'], [0.5, '#f1eee7'], [0.68, '#e5e0d6'], [0.88, '#c5beb1'], [1, '#b2aa9d']) +
    vertical('cork', [0, '#80491d'], [0.22, '#b26f35'], [0.45, '#c88546'], [0.6, '#c27f42'], [0.85, '#9c5e2b'], [1, '#7e4a1e']) +
    vertical('acetate', [0, '#c2beb4'], [0.4, '#e9e6df'], [0.55, '#eeebe4'], [0.85, '#d4d0c7'], [1, '#bbb7ae']) +
    vertical('foil', [0, '#5f4d25'], [0.35, '#b99a5c'], [0.5, '#a88b50'], [0.7, '#8f7442'], [1, '#55441f']) +
    vertical('cream', [0, '#e9d9ae'], [0.4, '#f7ecd0'], [0.6, '#f3e5c2'], [1, '#d3bd86']) +
    vertical('gold', [0, '#6d4f12'], [0.28, '#f6e3a1'], [0.42, '#b8902f'], [0.58, '#fff2c4'], [0.78, '#a07a22'], [1, '#5e430f']) +
    vertical('blue', [0, '#3d5f8f'], [0.45, '#8fb0d8'], [0.6, '#7698c4'], [1, '#36557f']) +
    vertical('label', [0, '#3f0b0b'], [0.28, '#861b16'], [0.5, '#a3271e'], [0.72, '#861b16'], [1, '#380909']) +
    // A satin wrapper: mid-chocolate, a soft sheen, a little reflected light on the underside.
    vertical('leaf', [0, '#2c1a10'], [0.12, '#4a2e1c'], [0.3, '#6e4529'], [0.44, '#80553a'], [0.58, '#6f472c'], [0.8, '#4d311e'], [0.93, '#392416'], [1, '#4a3020']) +
    vertical('ash', [0, '#5a5753'], [0.3, '#9d9a95'], [0.5, '#b3b0ab'], [0.75, '#8a8681'], [1, '#53504c']) +
    vertical('cigarash', [0, '#6a6660'], [0.3, '#b9b4ac'], [0.5, '#cbc7bf'], [0.75, '#a49f97'], [1, '#625e58']) +
    vertical('shine', [0, '#ffffff', 0], [0.5, '#ffffff', 0.9], [1, '#ffffff', 0]) +
    '<pattern id="laid" width="3.2" height="40" patternUnits="userSpaceOnUse"><rect width=".5" height="40" fill="#857c6d"/></pattern>' +
    horizontal('fadeEnds', [0, '#ffffff', 0], [0.08, '#ffffff', 1], [0.92, '#ffffff', 1], [1, '#ffffff', 0]) +
    horizontal('char', [0, '#e9e1d0', 0], [0.35, '#c39f74', 0.9], [0.62, '#6b4423'], [0.85, '#2f1d12'], [1, '#1a100a']) +
    horizontal('ashHeat', [0, '#ff7a2a', 0.6], [0.3, '#ff5a14', 0.18], [0.55, '#ff5a14', 0]) +
    vertical('bit', [0, '#000000'], [0.3, '#3d3d3f'], [0.42, '#8a8a90'], [0.55, '#1c1c1e'], [1, '#050505']) +
    vertical('wood', [0, '#2a1407'], [0.3, '#6e3a18'], [0.45, '#a05a2a'], [0.6, '#7d4320'], [1, '#2a1407']) +
    horizontal('bowl', [0, '#1f0e05'], [0.18, '#5a2d12'], [0.36, '#a35b2c'], [0.48, '#c47a44'], [0.66, '#7a3f1c'], [1, '#1c0c04']) +
    '<radialGradient id="ember" cx=".45" cy=".5" r=".55">' +
    stops([0, '#fff6d0'], [0.28, '#ffc04a'], [0.6, '#ff5a14'], [0.85, '#b3200a'], [1, '#5a0e04', 0]) +
    '</radialGradient>' +
    '<radialGradient id="tobacco" cx=".5" cy=".45" r=".6">' +
    stops([0, '#8e5a2c'], [0.7, '#5e3616'], [1, '#2a1608']) +
    '</radialGradient>' +
    '<radialGradient id="shadow" cx=".5" cy=".5" r=".5">' +
    stops([0, '#000000', 0.55], [1, '#000000', 0]) +
    '</radialGradient>' +
    '<radialGradient id="nebula" cx=".5" cy=".5" r=".5">' +
    stops([0, '#9b6bff', 0.5], [0.5, '#2bc4ff', 0.16], [1, '#2bc4ff', 0]) +
    '</radialGradient>' +
    '<filter id="glow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="3.2"/></filter>' +
    '<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6"/></filter>' +
    '<filter id="ring" x="-50%" y="-200%" width="200%" height="500%"><feGaussianBlur stdDeviation="1.2"/></filter>' +
    (rich
      ? // The pane's smoke goes through a noise field: puffs become wisps.
        '<filter id="wisp" x="-40%" y="-40%" width="180%" height="180%">' +
        '<feTurbulence type="fractalNoise" baseFrequency="0.022 0.034" numOctaves="2" seed="7" result="n"/>' +
        '<feDisplacementMap in="SourceGraphic" in2="n" scale="22" xChannelSelector="R" yChannelSelector="G" result="d"/>' +
        '<feGaussianBlur in="d" stdDeviation="1.8"/></filter>' +
        // Paper grain: a whisper of noise over the paper.
        '<filter id="grain" x="0" y="0" width="100%" height="100%">' +
        '<feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="3"/>' +
        '<feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.4 1"/>' +
        '<feComposite in2="SourceGraphic" operator="in"/></filter>' +
        // The wrapper's mottle: soft darker blotches, the way a leaf cures unevenly.
        '<filter id="mottle" x="0" y="0" width="100%" height="100%">' +
        '<feTurbulence type="fractalNoise" baseFrequency="0.03 0.1" numOctaves="3" seed="11"/>' +
        '<feColorMatrix values="0 0 0 0 0.1  0 0 0 0 0.05  0 0 0 0 0.02  0 0 0 -2.4 1.35"/>' +
        '<feComposite in2="SourceGraphic" operator="in"/></filter>'
      : '<filter id="wisp" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4"/></filter>') +
    '</defs>' +
    // Hover: take a drag. The ember flares; the exhale shows.
    '<style>.boost,.exhale{opacity:0;transition:opacity .45s ease}' +
    'svg:hover .boost,svg:hover .exhale,.drag .boost,.drag .exhale{opacity:1}</style>'
  )
}

// ── Materials ────────────────────────────────────────────────────────────────────────────

function top(s: Stick): number {
  return CENTER_Y - s.radius
}

/** Light across a cylinder: a bright line in the upper third, fading at its ends. */
function shine(x: number, width: number, s: { radius: number }, strength = 0.55, soft = false): string {
  if (width <= 2) return ''
  const y = CENTER_Y - s.radius * (soft ? 0.7 : 0.62)
  return `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(width)}" height="${r1(s.radius * (soft ? 0.36 : 0.2))}" fill="url(#shine)" opacity="${strength}" rx="${r1(s.radius * 0.1)}"${soft ? ' filter="url(#soft)"' : ''}/>`
}

/** A soft contact shadow under the stick. */
function contactShadow(x0: number, x1: number, radius: number, layout: Layout): string {
  if (x1 - x0 < 4) return ''
  const cx = (x0 + x1) / 2
  return `<ellipse cx="${r1(cx)}" cy="${r1(CENTER_Y + radius + 4)}" rx="${r1((x1 - x0) / 2 + radius)}" ry="${r1(radius * 0.32)}" fill="url(#shadow)" opacity="${layout === 'pane' ? 0.75 : 0.45}"/>`
}

function corkMottle(s: Stick, rand: () => number): string {
  const y = top(s)
  const h = s.radius * 2
  let out = ''
  // Printed cork: a fine, even speckle, mostly dark, a few light flecks.
  for (let i = 0; i < 150; i++) {
    const x = s.head + 3 + rand() * (s.filterEnd - s.head - 4)
    const cy = y + 1.5 + rand() * (h - 3)
    const dark = rand() > 0.25
    out += `<circle cx="${r1(x)}" cy="${r1(cy)}" r="${r2(0.35 + rand() * (dark ? 0.9 : 0.6))}" fill="${dark ? '#5e3212' : '#e2ac72'}" opacity="${r2(0.25 + rand() * 0.3)}"/>`
  }
  return out
}

function headPart(s: Stick, layout: Layout): string {
  const y = top(s)
  const h = s.radius * 2
  const rand = rng(17)

  if (s.filter === 'none') {
    // A cigar's rounded cap and the head behind its band, never smoked.
    const x = s.head + s.radius
    const shape = `M${x} ${y}A${s.radius} ${s.radius} 0 0 0 ${x} ${y + h}${leafEdge(x, s.paperStart + 1, y + h, 3)}L${s.paperStart + 1} ${y}${leafEdge(s.paperStart + 1, x, y, 5)}Z`
    return (
      `<path d="${shape}" fill="url(#leaf)"/>` +
      (layout === 'pane' ? `<path d="${shape}" fill="#1b0f08" filter="url(#mottle)" opacity=".6"/>` : '') +
      veins(s, s.head + 10, s.paperStart, 41) +
      // The cap: two stitched rings of leaf where the head rounds off.
      [6, 11].map((d) => `<path d="M${s.head + d} ${r1(y + 2.5)}q${r1(-d * 0.42)} ${r1(s.radius - 2.5)} 0 ${r1(h - 5)}" fill="none" stroke="#24140b" stroke-width=".8" opacity=".45"/>`).join('')
    )
  }

  // The mouth end: a filter's face, seen just off-axis.
  const face = `<ellipse cx="${s.head + 1}" cy="${CENTER_Y}" rx="${r1(s.radius * 0.16)}" ry="${s.radius}" fill="url(#acetate)"/>`
  if (s.filter === 'white') {
    return (
      `<rect x="${s.head}" y="${y}" width="${s.filterEnd - s.head + 2}" height="${h}" fill="url(#acetate)"/>` +
      face +
      [16, 12].map((d) => `<rect x="${s.filterEnd - d}" y="${y}" width="1.4" height="${h}" fill="#5f8fcc" opacity=".85"/>`).join('')
    )
  }

  return (
    `<rect x="${s.head}" y="${y}" width="${s.filterEnd - s.head + 4}" height="${h}" fill="url(#cork)"/>` +
    corkMottle(s, rand) +
    face +
    `<ellipse cx="${s.head + 1}" cy="${CENTER_Y}" rx="${r1(s.radius * 0.1)}" ry="${r1(s.radius * 0.8)}" fill="#e7e2d8" opacity=".9"/>`
  )
}

/** A leaf's edge from x0 to x1 along y: never quite straight. */
function leafEdge(x0: number, x1: number, y: number, seed: number): string {
  const rand = rng(seed)
  const steps = Math.max(2, Math.round(Math.abs(x1 - x0) / 22))
  let d = ''
  for (let i = 1; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps
    d += `L${r1(x)} ${r1(y + (i < steps ? (rand() - 0.5) * 0.9 : 0))}`
  }
  return d
}

/**
 * The wrapper's veins: a few fine raised ribs running off at a slant, each a light ridge with
 * its shadow beside it, and the faint spiral seam where the leaf was rolled.
 */
function veins(s: Stick, from: number, to: number, seed: number): string {
  const y = top(s)
  const h = s.radius * 2
  const rand = rng(seed)
  let out = ''
  for (let x = from + 18; x + 24 < to; x += 46 + rand() * 40) {
    const lean = 10 + rand() * 14
    const bow = (rand() - 0.5) * 12
    const start = y + 2 + rand() * h * 0.25
    const end = y + h - 2 - rand() * h * 0.25
    const d = `M${r1(x)} ${r1(start)}q${r1(lean * 0.5 + bow)} ${r1((end - start) * 0.5)} ${r1(lean)} ${r1(end - start)}`
    out +=
      `<path d="${d}" fill="none" stroke="#1e1009" stroke-width="1.1" opacity=".38" transform="translate(.7 .6)"/>` +
      `<path d="${d}" fill="none" stroke="#b07a52" stroke-width=".8" opacity=".42"/>`
  }
  // The rolled seam, a long faint diagonal.
  for (let x = from + 30; x + 30 < to; x += 64) {
    out += `<path d="M${r1(x)} ${y + 1}l${r1(h * 0.9)} ${h - 2}" stroke="#2a170c" stroke-width=".5" opacity=".22"/>`
  }
  return out
}

function wrapPart(s: Stick, paper: number, layout: Layout): string {
  if (paper <= 0.5) return ''
  const y = top(s)
  const h = s.radius * 2
  const isLeaf = s.wrap === 'leaf'
  if (isLeaf) {
    const x1 = s.paperStart + paper
    const shape = `M${s.paperStart} ${y}${leafEdge(s.paperStart, x1, y, 7)}L${r1(x1)} ${y + h}${leafEdge(x1, s.paperStart, y + h, 9)}Z`
    return (
      `<path d="${shape}" fill="url(#leaf)"/>` +
      (layout === 'pane' ? `<path d="${shape}" fill="#1b0f08" filter="url(#mottle)" opacity=".6"/>` : '') +
      veins(s, s.paperStart, x1, 23)
    )
  }
  let out = `<rect x="${s.paperStart}" y="${y}" width="${r1(paper)}" height="${h}" fill="url(#paper)"/>`
  // The paper's glued seam.
  out += `<rect x="${s.paperStart}" y="${r1(y + h * 0.68)}" width="${r1(paper)}" height=".6" fill="#8f877a" opacity=".2"/>`
  if (layout === 'pane') {
    out +=
      `<rect x="${s.paperStart}" y="${y}" width="${r1(paper)}" height="${h}" fill="url(#laid)" opacity=".06"/>` +
      `<rect x="${s.paperStart}" y="${y}" width="${r1(paper)}" height="${h}" fill="#8a8274" filter="url(#grain)" opacity=".06"/>`
  }
  return out
}

function ringPart(s: Stick, paperEnd: number): string {
  const [from, to] = s.ring
  const end = Math.min(to, paperEnd)
  if (end <= from) return ''
  const y = top(s)
  const h = s.radius * 2
  const ring = `<rect x="${from}" y="${y}" width="${r1(end - from)}" height="${h}" fill="url(#${s.ringFill})"/>`
  if (s.ringFill !== 'label') return ring

  // A cigar's band: embossed gold edges (a lit ridge, a shadow), a fine cream pinstripe, and a
  // cream medallion in front, ringed in gold, carrying the imprint.
  const cx = (from + to) / 2
  const edge = (x: number, dir: number) =>
    `<rect x="${r1(x)}" y="${y}" width="2.6" height="${h}" fill="url(#gold)"/>` +
    `<rect x="${r1(x + (dir > 0 ? 2.6 : -0.7))}" y="${y}" width=".7" height="${h}" fill="#2a0606" opacity=".55"/>` +
    `<rect x="${r1(x + (dir > 0 ? 4.4 : -2.2))}" y="${y}" width=".6" height="${h}" fill="#f3e5c2" opacity=".7"/>`
  return (
    ring +
    edge(from, 1) +
    edge(to - 2.6, -1) +
    `<rect x="${from}" y="${r1(y + 3.2)}" width="${to - from}" height=".6" fill="#e4c97e" opacity=".6"/>` +
    `<rect x="${from}" y="${r1(y + h - 3.8)}" width="${to - from}" height=".6" fill="#e4c97e" opacity=".6"/>` +
    `<ellipse cx="${cx}" cy="${CENTER_Y}" rx="${r1((to - from) * 0.3)}" ry="${r1(s.radius * 0.7)}" fill="url(#cream)" stroke="url(#gold)" stroke-width="1.6"/>` +
    `<ellipse cx="${cx}" cy="${CENTER_Y}" rx="${r1((to - from) * 0.3 - 2.6)}" ry="${r1(s.radius * 0.7 - 2.6)}" fill="none" stroke="#a88b50" stroke-width=".5" opacity=".7"/>`
  )
}

// ── The burning end ──────────────────────────────────────────────────────────────────────

/** An uneven burn line: the paper browns, blackens, then glows. */
function charPart(s: Stick, x: number): string {
  const y = top(s)
  const h = s.radius * 2
  const w = s.radius * 0.7
  const rand = rng(Math.round(x * 7))
  const steps = 7
  let edge = ''
  for (let i = 0; i <= steps; i++) {
    edge += `L${r1(x - rand() * s.radius * 0.14)} ${r1(y + (h * i) / steps)}`
  }
  return `<path d="M${r1(x - w)} ${y}${edge}L${r1(x - w)} ${y + h}Z" fill="url(#char)"/>`
}

function ashPart(s: Stick, x: number, length: number): string {
  if (length <= 0.5) return ''
  const y = top(s)
  const h = s.radius * 2
  const isCigar = s.wrap === 'leaf'
  const end = x + length
  const rand = rng(Math.round(length * 13) + 5)
  // Ash sags a little and narrows toward its end, its tip rough.
  const shape =
    `M${r1(x)} ${y + 0.8}L${r1(end - 4)} ${r1(y + 2.4)}` +
    `Q${r1(end + 1.5)} ${r1(CENTER_Y - s.radius * 0.4)} ${r1(end - 1)} ${CENTER_Y}` +
    `Q${r1(end + 1)} ${r1(CENTER_Y + s.radius * 0.5)} ${r1(end - 4)} ${r1(y + h - 1.6)}` +
    `L${r1(x)} ${r1(y + h - 0.8)}Z`
  let cracks = ''
  const count = Math.max(2, Math.round(length / (isCigar ? 7 : 5)))
  if (isCigar) {
    // Layer on layer, each a little darker at its seam, the edges flaking.
    for (let cx = x + 4; cx < end - 3; cx += 3.5 + rand() * 7) {
      const wob = (rand() - 0.5) * 4
      cracks +=
        `<path d="M${r1(cx)} ${r1(y + 1.5 + rand() * 3)}q${r1(wob)} ${r1(h * 0.5)} ${r1(wob * 0.4)} ${r1(h - 4 - rand() * 4)}" stroke="#6f6a63" stroke-width="${r2(0.8 + rand() * 1.6)}" fill="none" opacity="${r2(0.3 + rand() * 0.35)}"/>` +
        (rand() > 0.4 ? `<path d="M${r1(cx + 1.3)} ${r1(y + 3)}q${r1(wob * 0.6)} ${r1(h * 0.45)} 0 ${r1(h - 7)}" stroke="#ece8e1" stroke-width=".5" fill="none" opacity=".3"/>` : '')
    }
    for (let i = 0; i < count * 2; i++) {
      const fx = x + 2 + rand() * (length - 4)
      const fy = rand() > 0.5 ? y + 1 + rand() * 2 : y + h - 1 - rand() * 2
      cracks += `<circle cx="${r1(fx)}" cy="${r1(fy)}" r="${r2(0.5 + rand() * 0.8)}" fill="#5a5651" opacity=".45"/>`
    }
  } else {
    for (let i = 0; i < count; i++) {
      const cx = x + 2 + rand() * (length - 5)
      cracks += `<rect x="${r1(cx)}" y="${r1(y + 2 + rand() * (h - 9))}" width="${r2(0.7 + rand() * 0.8)}" height="${r1(2 + rand() * 6)}" fill="#3a3734" opacity=".3"/>`
    }
  }
  for (let i = 0; i < count; i++) {
    cracks += `<circle cx="${r1(x + 2 + rand() * (length - 4))}" cy="${r1(y + 2 + rand() * (h - 4))}" r="${r2(0.4 + rand() * 0.6)}" fill="#f1eee8" opacity=".5"/>`
  }
  return (
    `<path d="${shape}" fill="url(#${isCigar ? 'cigarash' : 'ash'})"/>` +
    cracks +
    `<rect x="${r1(x)}" y="${y}" width="${r1(Math.min(length, s.radius * 1.6))}" height="${h}" fill="url(#ashHeat)" opacity="${isCigar ? 0.5 : 0.85}"/>`
  )
}

/** The ember: a narrow glow, a hot cone with spots that flicker, and a brighter one on a drag. */
function emberPart(cx: number, cy: number, rx: number, ry: number, heat: Heat, seed: number): string {
  const glow = clamp(0.5 + 0.1 * heat.effort + (heat.working ? 0.15 : 0) + (heat.inferno ? 0.2 : 0))
  const beat = r2((heat.working ? 1.3 : 2.8) - 0.15 * heat.effort)
  const rand = rng(seed)
  let spots = ''
  for (let i = 0; i < 7; i++) {
    const sx = cx + (rand() - 0.5) * rx * 1.2
    const sy = cy + (rand() - 0.5) * ry * 1.6
    spots += `<circle cx="${r1(sx)}" cy="${r1(sy)}" r="${r2(rx * (0.18 + rand() * 0.2))}" fill="#fff0b8" opacity="0">${anim('opacity', `0;${r2(0.6 + rand() * 0.4)};0.1;${r2(0.5 + rand() * 0.4)};0`, beat * (0.6 + rand() * 0.9))}</circle>`
  }
  const haloX = r1(rx * 1.9 + heat.effort * 0.6)
  const haloY = r1(ry * 1.08 + 2 + heat.effort)
  const flare = heat.inferno
    ? `<ellipse cx="${r1(cx)}" cy="${r1(cy)}" rx="${r1(rx * 6)}" ry="${r1(ry * 1.5)}" fill="#ff5a14" filter="url(#glow)" opacity=".4">` +
      anim('opacity', '.25;.7;.35;.6;.25', 0.9) +
      '</ellipse>'
    : ''
  return (
    flare +
    `<ellipse cx="${r1(cx)}" cy="${r1(cy)}" rx="${haloX}" ry="${haloY}" fill="#ff6a1f" filter="url(#glow)" opacity="${r2(glow)}">` +
    anim('opacity', `${r2(glow * 0.5)};${r2(glow)};${r2(glow * 0.65)};${r2(glow * 0.95)};${r2(glow * 0.5)}`, beat) +
    '</ellipse>' +
    `<ellipse cx="${r1(cx)}" cy="${r1(cy)}" rx="${r1(rx)}" ry="${r1(ry)}" fill="url(#ember)">` +
    anim('rx', `${r1(rx * 0.85)};${r1(rx * 1.12)};${r1(rx * 0.92)};${r1(rx * 1.05)};${r1(rx * 0.85)}`, beat) +
    '</ellipse>' +
    spots +
    // The drag: everything brighter and a little bigger.
    `<g class="boost"><ellipse cx="${r1(cx)}" cy="${r1(cy)}" rx="${r1(rx * 3.4)}" ry="${r1(ry * 1.3)}" fill="#ff7a2a" filter="url(#glow)" opacity=".85"/>` +
    `<ellipse cx="${r1(cx)}" cy="${r1(cy)}" rx="${r1(rx * 1.25)}" ry="${r1(ry * 0.95)}" fill="#fff4c8" opacity=".85" filter="url(#soft)"/></g>`
  )
}

/** Sparks: they pop off the ember and fall. More with effort; a shower in an inferno. */
function sparksPart(x: number, y: number, heat: Heat, scale: number, layout: Layout): string {
  const count = heat.inferno ? 22 : heat.effort >= 4 ? 6 : heat.effort >= 2 ? 3 : 0
  if (!count) return ''
  const rand = rng(91)
  const power = (heat.inferno ? 2.1 : 1) * (layout === 'pane' ? 1 : 0.6) * scale
  let out = ''
  for (let i = 0; i < count; i++) {
    const dx = (rand() * 34 - 10) * power
    const up = -(10 + rand() * 26) * power
    const fall = (4 + rand() * 14) * power
    const dur = 0.8 + rand() * 0.9
    // Most sparks rest unseen for most of their cycle; an inferno's never rest.
    const rest = heat.inferno ? 1 : 2.4 + rand() * 2.2
    const total = r2(dur * rest)
    const show = r2(1 / rest)
    const begin = r2(-rand() * total)
    const path = `0 0;${r1(dx * 0.5)} ${r1(up)};${r1(dx)} ${r1(up * 0.4 + fall)};${r1(dx)} ${r1(up * 0.4 + fall)}`
    const times = `0;${r2(show * 0.45)};${show};1`
    out +=
      `<g opacity="0">` +
      `<animate attributeName="opacity" values="0;1;0;0" keyTimes="${times}" dur="${total}s" begin="${begin}s" repeatCount="indefinite"/>` +
      `<animateTransform attributeName="transform" type="translate" values="${path}" keyTimes="${times}" dur="${total}s" begin="${begin}s" repeatCount="indefinite"/>` +
      // An ultrathink turn's sparks are stardust.
      `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r2((heat.inferno ? 3.2 : 2.4) * scale)}" fill="${heat.cosmic ? '#a17bff' : '#ff8a2a'}" opacity=".4"/>` +
      `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r2((heat.inferno ? 1.3 : 0.9) * scale)}" fill="${heat.cosmic ? '#f1e6ff' : '#fff3c0'}"/></g>`
  }
  return out
}

// ── Smoke ────────────────────────────────────────────────────────────────────────────────

type Plume = {
  x: number
  y: number
  /** Thickness next to a cigarette's. */
  scale: number
  heat: Heat
  layout: Layout
  /** Rings, for a pipe. */
  rings?: boolean
}

const COSMIC = ['#a17bff', '#4fdcff', '#ff7ad9', '#7f9bff']

/**
 * How far the smoke goes: in the pane, a stream then tall curls; in the band, a short stream
 * and curls that drift back over the stick, gone before the edge.
 */
function reach(p: Plume) {
  const i = p.heat.intensity
  if (p.layout === 'pane') {
    return {
      stream: 55 + 45 * i,
      rise: Math.min(210, 90 + 120 * i) * (0.85 + 0.15 * p.scale),
      drift: 0,
      size: p.scale,
    }
  }
  const room = p.y - BAND_TOP - 18
  return {
    stream: 14 + 8 * i,
    rise: Math.min(room - 14, 24 + 14 * i),
    drift: Math.min(p.x - 70, 50 + 120 * i),
    size: p.scale * 0.7,
  }
}

/** The laminar stream: a thin ribbon that sways before it breaks up. */
function streamPart(p: Plume, length: number, color: string): string {
  const { x, y } = p
  const sway = 2 + 4 * p.heat.intensity
  const lean = p.layout === 'band' ? -length * 0.5 : 0
  const shapes = [
    [sway, -sway * 1.4, sway * 0.6],
    [-sway * 0.8, sway, -sway * 1.2],
    [sway * 1.3, -sway * 0.4, sway * 1.5],
  ].map(
    ([a, b, c]) =>
      `M${r1(x)} ${r1(y)}C${r1(x + a!)} ${r1(y - length * 0.35)} ${r1(x + b! + lean * 0.5)} ${r1(y - length * 0.7)} ${r1(x + c! + lean)} ${r1(y - length)}`,
  )
  const d = `${shapes[0]};${shapes[1]};${shapes[2]};${shapes[0]}`
  const dur = r2(3.6 - p.heat.intensity * 1.4)
  const grad = `<linearGradient id="streamGrad" gradientUnits="userSpaceOnUse" x1="0" y1="${r1(y)}" x2="0" y2="${r1(y - length)}">${stops([0, color, 0.85], [0.7, color, 0.5], [1, color, 0.15])}</linearGradient>`
  return (
    grad +
    `<path d="${shapes[0]}" fill="none" stroke="url(#streamGrad)" stroke-width="${r2(4.5 * p.scale)}" opacity=".22" filter="url(#soft)">${anim('d', d, dur)}</path>` +
    `<path d="${shapes[0]}" fill="none" stroke="url(#streamGrad)" stroke-width="${r2(1.1 * p.scale)}" stroke-linecap="round" opacity=".8">${anim('d', d, dur)}</path>`
  )
}

/** Curls: puffs carried up from where the stream breaks, spreading and thinning. */
function curlsPart(p: Plume, from: { x: number; y: number }, rise: number, drift: number, size: number, color: (i: number) => string): string {
  const h = p.heat
  const thickness = p.scale > 1 ? 1.15 : p.scale < 1 ? 0.8 : 1
  const count = Math.round((4 + 6 * h.intensity + (h.working ? 4 : 0)) * thickness)
  const seconds = r2((h.working ? 4 : 6.2) - 1.2 * h.intensity)
  // A cigar's body is its ribbons; its puffs stay soft, so they never stack into discs.
  const peak = r2(Math.min(0.4, (0.08 + 0.16 * h.intensity + (h.working ? 0.05 : 0)) * thickness * (p.scale > 1 ? 0.55 : 1)))
  const rand = rng(131)
  let out = ''
  for (let i = 0; i < count; i++) {
    const u = rand()
    const v = rand()
    const sway = (u - 0.5) * 2
    const begin = r2(-(i * seconds) / count - rand() * 0.6)
    const path =
      `0 0;${r1(8 * sway - drift * 0.2)} ${r1(-rise * 0.22)};${r1(-20 * sway - drift * 0.45)} ${r1(-rise * 0.5)};` +
      `${r1(26 * sway + 5 - drift * 0.75)} ${r1(-rise * 0.78)};${r1(-14 * sway + 9 - drift)} ${r1(-rise)}`
    const offset = (rand() - 0.5) * 12 * size
    const rx = [1.5, 5 + v * 3, 12 + v * 5, 20 + v * 8, 27 + v * 10].map((r) => r1(r * size)).join(';')
    const ry = [1.2, 3 + v * 2, 8 + v * 4, 14 + v * 6, 20 + v * 8].map((r) => r1(r * size)).join(';')
    out +=
      `<ellipse cx="${r1(from.x + offset)}" cy="${r1(from.y)}" rx="1" ry="1" fill="${color(i)}" opacity="0">` +
      move(path, seconds, begin) +
      `<animate attributeName="rx" values="${rx}" dur="${seconds}s" begin="${begin}s" repeatCount="indefinite"/>` +
      `<animate attributeName="ry" values="${ry}" dur="${seconds}s" begin="${begin}s" repeatCount="indefinite"/>` +
      `<animate attributeName="opacity" values="0;${peak};${r2(peak * 0.8)};${r2(peak * 0.35)};0" dur="${seconds}s" begin="${begin}s" repeatCount="indefinite"/>` +
      '</ellipse>'
  }
  return out
}

/**
 * The plume's body: tapered ribbons rising from where the stream breaks, each swaying as its
 * shape morphs, fading as it climbs. Through the noise field their edges tear into wisps.
 */
function ribbonsPart(p: Plume, from: { x: number; y: number }, rise: number, drift: number, size: number, fill: string, count: number): string {
  const h = p.heat
  const points = 9
  const rand = rng(211)
  const dur = r2(5.2 - 2 * h.intensity)
  // The band is small: its smoke needs more body to read.
  const strength = r2(Math.min(0.95, (0.42 + 0.5 * h.intensity + (h.working ? 0.1 : 0)) * (p.scale > 1 ? 1.15 : 1) * (p.layout === 'band' ? 1.35 : 1)))
  let out =
    `<linearGradient id="plumeGrad" gradientUnits="userSpaceOnUse" x1="0" y1="${r1(from.y)}" x2="0" y2="${r1(from.y - rise)}">` +
    (h.cosmic
      ? stops([0, '#ff7ad9', 0.85], [0.35, '#b07bff', 0.7], [0.7, '#4fdcff', 0.4], [1, '#4fdcff', 0])
      : h.inferno
        ? stops([0, '#ffb070', 0.8], [0.3, '#f1d2b8', 0.5], [0.8, fill, 0.15], [1, fill, 0])
        : stops([0, fill, 0.7], [0.45, fill, 0.42], [0.8, fill, 0.14], [1, fill, 0])) +
    '</linearGradient>'
  for (let k = 0; k < count; k++) {
    const phase = rand() * Math.PI * 2
    const spread = 0.75 + rand() * 0.5
    const lean = (rand() - 0.5) * 10 * size
    const frames = [0, 1, 2].map((frame) => {
      const left: string[] = []
      const right: string[] = []
      for (let i = 0; i <= points; i++) {
        const t = i / points
        const y = from.y - rise * t
        const amp = (2 + 14 * t) * size * spread
        const x = from.x - drift * Math.pow(t, 1.25) + lean * t + amp * Math.sin(phase + frame * 2.1 + t * 4.2)
        const w = (1.2 + 15 * Math.pow(t, 1.3)) * size * spread
        left.push(`${r1(x - w)} ${r1(y)}`)
        right.unshift(`${r1(x + w)} ${r1(y)}`)
      }
      return `M${left.join('L')}L${right.join('L')}Z`
    })
    out +=
      `<path d="${frames[0]}" fill="url(#plumeGrad)" opacity="${r2(strength / Math.sqrt(count))}">` +
      anim('d', `${frames[0]};${frames[1]};${frames[2]};${frames[0]}`, dur * (0.85 + rand() * 0.3), ` begin="${r2(-rand() * dur)}s"`) +
      '</path>'
  }
  return out
}

/** A pipe's rings: they widen, thin and drift as they rise. */
function ringsPart(p: Plume, rise: number, drift: number): string {
  const h = p.heat
  const rings = 2 + h.effort + (h.working ? 2 : 0) + (h.inferno ? 2 : 0)
  const seconds = r2((h.working ? 3.4 : 5.2) - 0.3 * h.effort)
  const peak = r2(Math.min(0.8, 0.45 + 0.07 * h.effort + (h.working ? 0.1 : 0)))
  const wide = p.layout === 'pane' ? 30 : 15
  let out = ''
  for (let i = 0; i < rings; i++) {
    const begin = r2(-(i * seconds) / rings)
    const lean = i % 2 === 0 ? 1 : -1
    const color = h.cosmic ? COSMIC[i % COSMIC.length]! : '#dfe3e8'
    const path = `0 0;${r1(4 * lean - drift * 0.3)} ${r1(-rise * 0.4)};${r1(-6 * lean - drift * 0.7)} ${r1(-rise * 0.75)};${r1(8 * lean - drift)} ${r1(-rise)}`
    out +=
      `<ellipse cx="${r1(p.x)}" cy="${r1(p.y)}" rx="3" ry="1" fill="none" stroke="${color}" stroke-width="3" opacity="0" filter="url(#ring)">` +
      move(path, seconds, begin) +
      `<animate attributeName="rx" values="3;${r1(wide * 0.5)};${r1(wide * 0.8)};${wide}" dur="${seconds}s" begin="${begin}s" repeatCount="indefinite"/>` +
      `<animate attributeName="ry" values="1;${r1(wide * 0.17)};${r1(wide * 0.26)};${r1(wide * 0.32)}" dur="${seconds}s" begin="${begin}s" repeatCount="indefinite"/>` +
      `<animate attributeName="stroke-width" values="3.2;2.6;1.9;1.2" dur="${seconds}s" begin="${begin}s" repeatCount="indefinite"/>` +
      `<animate attributeName="opacity" values="0;${peak};${r2(peak * 0.6)};0" dur="${seconds}s" begin="${begin}s" repeatCount="indefinite"/>` +
      '</ellipse>'
  }
  return out
}

/** Stars for a cosmic plume: they twinkle where the smoke is. */
function starsPart(p: Plume, rise: number, drift: number): string {
  const rand = rng(57)
  let out = `<ellipse cx="${r1(p.x - drift * 0.5)}" cy="${r1(p.y - rise * 0.55)}" rx="${r1(30 + rise * 0.35 + drift * 0.4)}" ry="${r1(rise * 0.55 + 8)}" fill="url(#nebula)"/>`
  const count = p.layout === 'pane' ? 44 : 16
  for (let i = 0; i < count; i++) {
    const t = rand()
    const x = p.x - drift * t + (rand() - 0.5) * (18 + rise * 0.5 * t)
    const y = p.y - rise * t - rand() * 8
    out += `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r2(0.5 + rand() * 1.2)}" fill="${rand() > 0.7 ? '#ffd6f5' : '#ffffff'}" opacity="0">${anim('opacity', `0;${r2(0.7 + rand() * 0.3)};0`, 0.8 + rand() * 2.2, ` begin="${r2(-rand() * 3)}s"`)}</circle>`
  }
  return out
}

/** The drag's exhale: a puff that rolls out from the tip, seen only on hover. */
function exhalePart(p: Plume): string {
  const rand = rng(77)
  const size = p.layout === 'pane' ? 1 : 0.6
  let out = '<g class="exhale">'
  for (let i = 0; i < 4; i++) {
    const begin = r2(-i * 0.45)
    const dx = r1((p.layout === 'band' ? -50 : 26) * size + (rand() - 0.5) * 10)
    const dy = r1(-(26 + rand() * 18) * size)
    out +=
      `<ellipse cx="${r1(p.x)}" cy="${r1(p.y)}" rx="2" ry="2" fill="${p.heat.cosmic ? COSMIC[i % 4] : '#e8ebef'}" opacity="0" filter="url(#wisp)">` +
      move(`0 0;${dx} ${dy}`, 1.8, begin) +
      `<animate attributeName="rx" values="${r1(3 * size)};${r1(30 * size)}" dur="1.8s" begin="${begin}s" repeatCount="indefinite"/>` +
      `<animate attributeName="ry" values="${r1(2 * size)};${r1(18 * size)}" dur="1.8s" begin="${begin}s" repeatCount="indefinite"/>` +
      `<animate attributeName="opacity" values="0;.5;0" dur="1.8s" begin="${begin}s" repeatCount="indefinite"/>` +
      '</ellipse>'
  }
  return out + '</g>'
}

function smokePart(p: Plume): string {
  const { stream, rise, drift, size } = reach(p)
  const h = p.heat
  const base = h.inferno ? '#eadbcd' : '#d5dbe2'
  const color = (i: number) => (h.cosmic ? COSMIC[i % COSMIC.length]! : base)
  const top = { x: p.x + (p.layout === 'band' ? -stream * 0.5 : 0), y: p.y - stream }
  let out = ''
  if (h.cosmic) out += starsPart(p, rise + stream, drift)
  if (p.rings) {
    out += streamPart(p, stream * 0.7, h.cosmic ? '#b9a0ff' : '#e6e9ee')
    out += `<g filter="url(#wisp)">${curlsPart({ ...p, heat: { ...h, intensity: h.intensity * 0.4 } }, top, rise * 0.8, drift, size * 0.6, color)}</g>`
    out += ringsPart(p, rise, drift)
  } else {
    out += streamPart(p, stream, h.cosmic ? '#d2b8ff' : h.inferno ? '#ffd0a8' : base)
    const ribbons = p.layout === 'pane' ? 3 + Math.round(2 * h.intensity) : 2
    out += `<g filter="url(#wisp)">${ribbonsPart(p, top, rise, drift, size, base, ribbons)}${curlsPart(p, top, rise, drift, size, color)}</g>`
  }
  return out + exhalePart(p)
}

// ── The unlit end, the out end ───────────────────────────────────────────────────────────

function unlitEnd(s: Stick, x: number): string {
  const rand = rng(29)
  const isCigar = s.wrap === 'leaf'
  let strands = ''
  for (let i = 0; i < Math.round(s.radius * 1.2); i++) {
    const y = CENTER_Y + (rand() - 0.5) * s.radius * 1.7
    strands += `<path d="M${r1(x - 1.5 + rand() * 1.5)} ${r1(y)}l${r1(1 + rand() * 2.5)} ${r1((rand() - 0.5) * 3)}" stroke="${rand() > 0.5 ? '#3d2210' : '#b07a42'}" stroke-width=".6" opacity=".8"/>`
  }
  return (
    `<ellipse cx="${r1(x)}" cy="${CENTER_Y}" rx="${r1(s.radius * 0.24)}" ry="${s.radius - 0.8}" fill="${isCigar ? '#4a2a12' : 'url(#tobacco)'}"/>` +
    strands
  )
}

// ── The imprint ──────────────────────────────────────────────────────────────────────────

const INKS: Record<'cork' | 'white' | 'gold' | 'cream', Record<Tone, string>> = {
  cork: { calm: '#4a2a10', warning: '#9a4a00', alarm: '#b71c1c' },
  cream: { calm: '#6e1010', warning: '#9a4a00', alarm: '#d01c1c' },
  white: { calm: '#2f4d7a', warning: '#a65a00', alarm: '#c62828' },
  gold: { calm: '#f3d27a', warning: '#ffc24d', alarm: '#ff8a7a' },
}

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Printed like a brand mark where it never burns: the cork, the white filter, the cigar's
// band or the pipe's bowl.
function imprintPart(look: Look): string {
  if (!look.imprint) return ''
  const tone = look.tone ?? 'calm'
  const place =
    look.kind === 'pipe'
      ? { x: PIPE.bowlX + PIPE.bowlWidth / 2, y: CENTER_Y + 6, size: 16, ink: INKS.gold }
      : look.kind === 'cigar'
        ? { x: (STICKS.cigar.ring[0] + STICKS.cigar.ring[1]) / 2, y: CENTER_Y + 0.5, size: 16, ink: INKS.cream }
        : look.kind === 'slim'
          ? { x: (STICKS.slim.head + STICKS.slim.filterEnd) / 2, y: CENTER_Y, size: 15, ink: INKS.white }
          : { x: (STICKS.cigarette.head + STICKS.cigarette.filterEnd) / 2, y: CENTER_Y, size: 19, ink: INKS.cork }
  const pulse = tone === 'alarm' ? '<animate attributeName="opacity" values="1;.3;1" dur="1.6s" repeatCount="indefinite"/>' : ''
  return (
    `<text x="${place.x}" y="${place.y}" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="${place.size}" ` +
    `letter-spacing=".5" fill="${place.ink[tone]}">${escapeText(look.imprint)}${pulse}</text>`
  )
}

// ── Scenes ───────────────────────────────────────────────────────────────────────────────

function stickScene(look: Look, layout: Layout, kind: Exclude<Kind, 'pipe'>) {
  const s = STICKS[kind]
  const heat = heatOf(look)
  const gone = look.isLit ? clamp(look.burned) : 0
  const paper = s.paperMax * (1 - gone)
  const paperEnd = s.paperStart + paper
  const isOut = look.isLit && gone >= 0.999
  const ash = look.isLit && !isOut ? Math.min(s.ashMax, s.paperMax * gone) : 0
  const tip = paperEnd + ash
  const burning = look.isLit && !isOut

  let end: string
  if (!look.isLit) {
    end = unlitEnd(s, paperEnd)
  } else if (isOut) {
    end = charPart(s, s.paperStart + 2)
  } else {
    end =
      charPart(s, paperEnd) +
      ashPart(s, paperEnd, ash) +
      emberPart(paperEnd + 0.5, CENTER_Y, s.radius * (s.wrap === 'leaf' ? 0.09 : 0.16), s.radius - 0.6, heat, Math.round(paperEnd))
  }

  const stick =
    contactShadow(s.head, burning ? tip : paperEnd, s.radius, layout) +
    headPart(s, layout) +
    wrapPart(s, paper, layout) +
    ringPart(s, paperEnd) +
    shine(s.head, (burning ? paperEnd : Math.max(paperEnd, s.filterEnd)) - s.head, s, s.wrap === 'leaf' ? 0.18 : 0.12, true) +
    end +
    (burning ? sparksPart(paperEnd + 1, CENTER_Y - s.radius * 0.3, heat, s.radius / 17, layout) : '')

  const smoke = burning
    ? smokePart({ x: tip - 1, y: top(s) + 2, scale: s.smoke, heat, layout })
    : ''

  return { stick, smoke }
}

// The pipe stays whole; what burns is the bowl's tobacco, its top going from glowing to grey
// ash as the limit is used.
function pipeScene(look: Look, layout: Layout) {
  const { bitEnd, ferrule, stemY, bowlX, bowlWidth, rimY, bowlBottom } = PIPE
  const heat = heatOf(look)
  const gone = look.isLit ? clamp(look.burned) : 0
  const isOut = look.isLit && gone >= 0.999
  const burning = look.isLit && !isOut
  const center = bowlX + bowlWidth / 2
  const right = bowlX + bowlWidth
  const rand = rng(61)

  const shadow = `<ellipse cx="${r1((24 + right) / 2)}" cy="${bowlBottom + 4}" rx="${r1((right - 24) / 2)}" ry="5" fill="url(#shadow)" opacity="${layout === 'pane' ? 0.7 : 0.4}"/>`
  const bit =
    `<path d="M24 ${stemY - 2.6}Q20 ${stemY} 24 ${stemY + 2.6}L${bitEnd} ${stemY + 4.2}L${bitEnd} ${stemY - 4.2}Z" fill="url(#bit)"/>` +
    `<path d="M30 ${r1(stemY - 1.6)}L${bitEnd - 4} ${r1(stemY - 2.8)}" stroke="#ffffff" stroke-width=".7" opacity=".35"/>`
  const ring = `<rect x="${bitEnd}" y="${stemY - 5}" width="${ferrule - bitEnd}" height="10" fill="url(#gold)" rx="1"/>`
  let grain = ''
  for (let i = 0; i < 9; i++) {
    const y = stemY - 4 + rand() * 9
    grain += `<path d="M${ferrule} ${r1(y)}C${r1(ferrule + 50)} ${r1(y + (rand() - 0.5) * 3)} ${r1(bowlX - 60)} ${r1(y + (rand() - 0.5) * 3)} ${bowlX + 6} ${r1(y + (rand() - 0.5) * 2)}" stroke="#2a1407" stroke-width=".5" fill="none" opacity=".4"/>`
  }
  const shank = `<path d="M${ferrule} ${stemY - 5}L${bowlX + 6} ${stemY - 7}L${bowlX + 6} ${stemY + 7}L${ferrule} ${stemY + 5}Z" fill="url(#wood)"/>` + grain
  const bowlPath =
    `M${bowlX} ${rimY}L${right} ${rimY}C${right} ${bowlBottom - 12} ${right - 9} ${bowlBottom} ${center} ${bowlBottom}` +
    `C${bowlX + 9} ${bowlBottom} ${bowlX} ${bowlBottom - 12} ${bowlX} ${rimY}Z`
  let bowlGrain = ''
  for (let i = 0; i < 10; i++) {
    const x = bowlX + 4 + rand() * (bowlWidth - 8)
    bowlGrain += `<path d="M${r1(x)} ${rimY + 2}q${r1((rand() - 0.5) * 8)} ${r1((bowlBottom - rimY) * 0.5)} ${r1((rand() - 0.5) * 6)} ${bowlBottom - rimY - 4}" stroke="#2a1205" stroke-width="${r2(0.4 + rand() * 0.5)}" fill="none" opacity=".45"/>`
  }
  const bowl =
    `<path d="${bowlPath}" fill="url(#bowl)"/>` +
    `<clipPath id="bowlClip"><path d="${bowlPath}"/></clipPath><g clip-path="url(#bowlClip)">${bowlGrain}` +
    // Polish: a tall soft highlight, left of centre.
    `<rect x="${r1(bowlX + bowlWidth * 0.2)}" y="${rimY + 4}" width="${r1(bowlWidth * 0.12)}" height="${bowlBottom - rimY - 14}" rx="3" fill="#ffffff" opacity=".22" filter="url(#soft)"/></g>` +
    `<ellipse cx="${center}" cy="${rimY}" rx="${bowlWidth / 2}" ry="6" fill="#1a0b04"/>` +
    `<ellipse cx="${center}" cy="${rimY - 0.6}" rx="${bowlWidth / 2 - 0.5}" ry="5.4" fill="none" stroke="#c47a44" stroke-width=".8" opacity=".5"/>`

  const innerX = bowlWidth / 2 - 4
  let top = `<ellipse cx="${center}" cy="${rimY}" rx="${innerX}" ry="4" fill="${isOut ? '#8a8682' : 'url(#tobacco)'}"/>`
  if (burning) {
    // The tobacco's top: an ember that shrinks as it burns, ash taking over.
    top +=
      emberPart(center, rimY, innerX * (0.85 - 0.6 * gone), 3.2, heat, 501) +
      `<ellipse cx="${center}" cy="${rimY}" rx="${innerX}" ry="4" fill="#9a9690" opacity="${r2(0.08 + 0.8 * gone)}"/>`
  }

  const stick =
    shadow + bit + ring + shank + bowl + top +
    (burning ? sparksPart(center, rimY - 3, heat, 0.9, layout) : '')
  const smoke = burning
    ? smokePart({ x: center, y: rimY - 3, scale: 1, heat, layout, rings: true })
    : ''
  return { stick, smoke }
}

function svg(viewBox: [number, number, number, number], body: string, isDrag: boolean): string {
  const [, , width, height] = viewBox
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(' ')}" width="${width}" height="${height}"${isDrag ? ' class="drag"' : ''}>${body}</svg>`
}

/** Whether this look gives off smoke at all: lit, and not burnt out. */
export function isSmoking(look: Look): boolean {
  return look.isLit && look.burned < 0.999
}

export function cigaretteSvg(look: Look, layout: Layout = 'pane'): string {
  const scene =
    look.kind === 'pipe' ? pipeScene(look, layout) : stickScene(look, layout, look.kind)
  const stick = scene.stick + imprintPart(look)
  const isDrag = look.isDrag === true

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
      defs(layout) + fade + `<g mask="url(#fadeTop)">${scene.smoke}</g>` + stick,
      isDrag,
    )
  }

  return svg([0, PANE_TOP, WIDTH, PANE_HEIGHT], defs(layout) + stick + scene.smoke, isDrag)
}
