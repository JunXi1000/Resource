import type { Ink } from '@/lib/ink/builder'
import type { Line, PenName, PenSpec, Pt, StrokeOpts } from '@/lib/ink/types'
import { paint } from '@/lib/ink/paint'
import { hashSeed } from '@/lib/ink/rng'

export interface MarkRevealOpts {
  id: string
  lines: Array<Line>
  pen: PenName | PenSpec
  box: { w: number; h: number }
  pad: number
  width?: number
  opts?: StrokeOpts
  revealWidth?: number
}

export function markRevealId(seed: string, name: string): string {
  return `ll-mr-${hashSeed(seed).toString(36)}${name}`
}

export function revealMark(ink: Ink, o: MarkRevealOpts): void {
  const sym = ink.define(() => ink.lines(o.lines, o.pen, { ...o.opts, width: o.width }))
  const d = o.lines.map((l) => l.pts.map((p: Pt, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('')).join('')
  ink.raw(
    `<mask id="${o.id}" maskUnits="userSpaceOnUse" x="${-o.pad}" y="${-o.pad}" width="${o.box.w + 2 * o.pad}" height="${o.box.h + 2 * o.pad}">` +
      `<path data-part="reveal" d="${d}" pathLength="1" fill="none" stroke="${paint('photo')}" stroke-width="${(o.revealWidth ?? 6).toFixed(1)}" stroke-linejoin="round" stroke-linecap="round"/>` +
      `</mask>`,
    'under',
  )
  ink.raw(`<g mask="url(#${o.id})"><use href="#${sym}"/></g>`, 'top')
}
