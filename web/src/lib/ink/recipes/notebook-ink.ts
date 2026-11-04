import type { Ink } from '@/lib/ink/builder'
import { box } from '@/lib/ink/shapes'
import { defineRecipe } from '@/lib/ink/recipes'
import { MIRROR, holePunch, litEdge, num, pathTag, reinforcement, stackSvg, tok, type PathAttrs } from '@/lib/ink/recipes/paper-set-ink'
import { shadowMark } from '@/lib/ink/paper/faces'
import type { Accent } from '@/lib/ink/paper/props'

export type NotebookBinding = 'spiral' | 'rings' | 'stitched' | 'none'
export type NotebookSide = 'start' | 'top'

export interface NotebookParams {
  binding: NotebookBinding
  side: NotebookSide
  pages: number
  tone: 'steel' | Accent
  curl?: boolean
}

export const NOTEBOOK = { holeX: 15, pitch: 24, inset: 20 } as const

export function notebookHoles(len: number, binding: NotebookBinding): number[] {
  if (binding === 'none') return []
  if (binding === 'rings') {
    if (len >= 360) return [len * 0.14, len * 0.5, len * 0.86]
    if (len >= 190) return [len * 0.3, len * 0.7]
    return [len / 2]
  }
  const pitch = binding === 'stitched' ? 22 : NOTEBOOK.pitch
  const room = len - 2 * NOTEBOOK.inset
  const count = Math.max(1, Math.floor(room / pitch) + 1)
  if (count === 1) return [len / 2]
  return Array.from({ length: count }, (_, i) => NOTEBOOK.inset + (room * i) / (count - 1))
}

const wire = (d: string, w: number, base: string, extra: Partial<PathAttrs> = {}) =>
  pathTag(d, { stroke: tok('ink'), sw: w + 1.3, op: 0.2, transform: 'translate(.9 1.7)', ...extra }) +
  pathTag(d, { stroke: base, sw: w, ...extra }) +
  pathTag(d, { stroke: tok('ink'), sw: w * 0.36, op: 0.5, transform: 'translate(.5 .7)', ...extra }) +
  pathTag(d, { stroke: tok('photo'), sw: w * 0.3, op: 0.9, transform: 'translate(-.4 -.55)', ...extra })

function bindingSvg(ink: Ink, len: number, p: NotebookParams): string {
  const r = ink.next('binding')
  const base = p.tone === 'steel' ? tok('pencil') : tok(p.tone)
  const ys = notebookHoles(len, p.binding)
  const id = `ll-nb${ink.seed.toString(36)}`
  let holes = ''
  let metal = ''
  const gutter = (wd: number, op: number) =>
    `<linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${tok('ink')}" stop-opacity="${op}"/><stop offset="1" stop-color="${tok('ink')}" stop-opacity="0"/></linearGradient><rect x="0" y="0" width="${wd}" height="${num(len)}" fill="url(#${id}g)"/>`
  if (p.binding === 'spiral') {
    holes += gutter(20, 0.07)
    const x = NOTEBOOK.holeX
    const d = `M${num(x + 0.4)} 0.3C${num(x - 6)} -2.5 ${num(-2)} -7.2 ${num(-6.5)} -6.8C${num(-12.2)} -6.4 ${num(-13.4)} 0.8 ${num(-10.4)} 4.2C${num(-8)} 7.2 ${num(-3.8)} 8.6 ${num(0.5)} 8.4`
    holes += `<defs><g id="${id}c">${holePunch(`${id}h`, x, 0, 3.9, 20)}${wire(d, 2.3, base, { cap: 'butt' })}</g></defs>`
    ys.forEach((y0) => {
      holes += `<use href="#${id}c" transform="translate(${num(r.gauss(0, 0.35))} ${num(y0 + r.gauss(0, 0.5))}) rotate(${num(r.gauss(0, 1.6))} ${num(x)} 0)"/>`
    })
  } else if (p.binding === 'rings') {
    holes += gutter(26, 0.08)
    ys.forEach((y0, i) => {
      const y = y0 + r.gauss(0, 0.6)
      const x = 17 + r.gauss(0, 0.4)
      holes += reinforcement(x, y, 6.2) + holePunch(`${id}h${i}`, x, y, 6.2, r.range(-25, 25))
      const ry = 16.5 + r.gauss(0, 0.4)
      const d = `M${num(-3)} ${num(y - ry)}C${num(x + 17)} ${num(y - ry - 1)} ${num(x + 17)} ${num(y + ry + 1)} ${num(-3)} ${num(y + ry)}`
      metal += wire(d, 3.1, base)
    })
    const top = ys[0] - 26
    const bot = ys[ys.length - 1] + 26
    const strip = `M${num(-8)} ${num(top)}H${num(-1)}V${num(bot)}H${num(-8)}z`
    metal = pathTag(strip, { fill: tok('ink'), op: 0.18, transform: 'translate(1 1.6)' }) + pathTag(strip, { fill: tok('pencil-mark') }) + pathTag(strip, { stroke: tok('ink'), sw: 0.7, op: 0.4 }) + pathTag(`M${num(-7)} ${num(top + 1)}V${num(bot - 1)}`, { stroke: tok('photo'), sw: 1, op: 0.85 }) + metal
  } else if (p.binding === 'stitched') {
    holes += gutter(24, 0.09)
    const thread = p.tone === 'steel' ? tok('ink-you') : tok(p.tone)
    let stitch = ''
    const pts: Array<[number, number]> = ys.map((y0) => [NOTEBOOK.holeX - 3 + r.gauss(0, 0.3), y0 + r.gauss(0, 0.4)])
    pts.forEach(([x, y], i) => {
      holes += holePunch(`${id}h${i}`, x, y, 2.6, 0)
      const next = pts[i + 1]
      if (next && i % 2 === 0) stitch += `M${num(x)} ${num(y + 2.8)}Q${num(x + r.gauss(0, 0.5))} ${num((y + next[1]) / 2)} ${num(next[0])} ${num(next[1] - 2.8)}`
    })
    metal += pathTag(stitch, { stroke: tok('ink'), sw: 3.1, op: 0.16, transform: 'translate(.9 1.1)' })
    metal += pathTag(stitch, { stroke: thread, sw: 2.3 })
    metal += pathTag(stitch, { stroke: tok('photo'), sw: 0.6, op: 0.6, transform: 'translate(-.5 -.2)' })
  }
  return holes + metal
}

export const notebookRecipe = defineRecipe<NotebookParams>({
  id: 'notebook-decor',
  kind: 'notebook',
  layers: ['rest'],
  pad: 26,
  draw(ink, { w, h }, p, ctx) {
    const id = `ll-nk${ink.seed.toString(36)}`
    ink.layer('rest', () => {
      const r = ink.next('stack')
      let s = stackSvg(w, h, p.pages, r, id)
      if (p.curl && p.pages > 0 && !ctx.calm) {
        const c = 34
        const x0 = w - c
        const y0 = h - c
        const notch = `M${num(x0 - 1)} ${num(h + 1)}H${num(w + 1)}V${num(y0 - 1)}z`
        s +=
          `<linearGradient id="${id}n" gradientUnits="userSpaceOnUse" x1="${num(x0 + c / 2)}" y1="${num(y0 + c / 2)}" x2="${num(x0 + c * 0.86)}" y2="${num(y0 + c * 0.86)}"><stop offset="0" stop-color="${tok('ink')}" stop-opacity=".16"/><stop offset="1" stop-color="${tok('ink')}" stop-opacity="0"/></linearGradient>` +
          pathTag(notch, { fill: tok('paper-shade') }) +
          pathTag(notch, { fill: `url(#${id}n)` })
      }
      if (p.binding !== 'none') {
        const len = p.side === 'top' ? w : h
        const edge = bindingSvg(ink, len, p)
        let t = p.side === 'top' ? `translate(${num(w)} 0) rotate(90)` : ''
        if (ctx.dir === 'rtl' && p.side === 'start') t = `translate(${num(w)} 0) scale(-1 1)`
        s += t ? `<g transform="${t}">${edge}</g>` : edge
      }
      ink.raw(s, 'top')
      ink.grow([-26, -26, w + 26, h + 26])
    })
  },
})

export interface NotebookCoverParams {
  tone: Accent | 'ink'
  band: boolean
}

export const SPINE = 15

export const notebookCoverRecipe = defineRecipe<NotebookCoverParams>({
  id: 'notebook-cover',
  kind: 'sheet',
  layers: ['rest'],
  pad: 6,
  draw(ink, { w, h }, { tone, band }, ctx) {
    const r = ink.next('cover')
    const j = () => r.gauss(0, 0.25)
    const id = `ll-nc${ink.seed.toString(36)}`
    const R = 9
    const s0 = 3
    const d = `M${num(s0)} ${num(j())}H${num(w - R)}Q${num(w)} 0 ${num(w + j())} ${num(R)}V${num(h - R)}Q${num(w)} ${num(h)} ${num(w - R)} ${num(h + j())}H${num(s0)}Q0 ${num(h)} ${num(j())} ${num(h - s0)}V${num(s0)}Q0 0 ${num(s0)} 0z`
    ink.layer('rest', () => {
      const cloth = tone === 'ink' ? tok('ink') : tok(tone)
      let s = `<clipPath id="${id}c"><path d="${d}"/></clipPath>`
      s += pathTag(d, { fill: cloth })
      s += `<g clip-path="url(#${id}c)">`
      let g = ''
      for (let x = 2; x < w; x += 3.2) g += `M${num(x)} 0V${num(h)}`
      for (let y = 2; y < h; y += 3.2) g += `M0 ${num(y)}H${num(w)}`
      s += pathTag(g, { stroke: tok('ink'), sw: 0.5, op: 0.07 })
      s += `<linearGradient id="${id}l" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${tok('photo')}" stop-opacity=".3"/><stop offset=".45" stop-color="${tok('photo')}" stop-opacity="0"/><stop offset="1" stop-color="${tok('ink')}" stop-opacity=".16"/></linearGradient>`
      s += pathTag(`M0 0H${num(w)}V${num(h)}H0z`, { fill: `url(#${id}l)` })
      s += pathTag(`M0 0H${num(SPINE)}V${num(h)}H0z`, { fill: tok('ink'), op: 0.24 })
      s += pathTag(`M${num(SPINE)} 0V${num(h)}`, { stroke: tok('ink'), sw: 1.2, op: 0.3 })
      s += pathTag(`M${num(SPINE + 1.4)} 0V${num(h)}`, { stroke: tok('photo'), sw: 1, op: 0.45 })
      s += pathTag(`M${num(SPINE / 2)} 6V${num(h - 6)}`, { stroke: tok('photo'), sw: 1.1, op: 0.5, extra: 'stroke-dasharray="5 3.4"' })
      if (band) {
        const bx = w - Math.max(22, w * 0.15)
        s += pathTag(`M${num(bx)} 0V${num(h)}`, { stroke: tok('ink'), sw: 6.4, op: 0.2, transform: 'translate(1 .6)' })
        s += pathTag(`M${num(bx)} 0V${num(h)}`, { stroke: tok('ink'), sw: 5.4, op: 0.82 })
        s += pathTag(`M${num(bx - 1.6)} 0V${num(h)}`, { stroke: tok('photo'), sw: 0.9, op: 0.28 })
      }
      s += `</g>`
      s += pathTag(d, { stroke: tok('ink'), sw: 0.9, op: 0.4 })
      s += litEdge(`M${num(SPINE + 2)} 0.7H${num(w - R)}`, 0.4)
      const rtl = ctx.dir === 'rtl'
      ink.raw(shadowMark('lift', rtl ? [9, 3, 3, 9] : [3, 9, 9, 3]) + (rtl ? `<g transform="${MIRROR(w)}">${s}</g>` : s), 'under')
      ink.grow([-1, -1, w + 1, h + 1])
      if (!ctx.calm) box(ink, 0.5, 0.5, w - 1, h - 1, { pen: 'ink.fine', corner: 9, opts: { alpha: 0.5, simple: true } })
    })
  },
})
