import { defineRecipe } from '@/lib/ink/recipes'
import { markPen, type MarkPen, type MarkWeight } from '@/lib/ink/recipes/text-marks-ink'
import { tallyLines } from '@/lib/ink/shapes'

export interface TallyParams {
  count: number
  gh: number
  tone: MarkPen
  weight: MarkWeight
  rtl?: boolean
}

export function tallyBox(count: number, gh: number): { w: number; h: number } {
  const n = Math.max(0, Math.min(99, Math.floor(count)))
  const step = 0.26 * gh
  const gw = 1.05 * gh + 6
  const full = Math.floor(n / 5)
  const rem = n % 5
  const x0 = Math.ceil(0.6 * step) + 1
  let w: number
  if (n === 0) w = 0
  else if (rem === 0) w = x0 + (full - 1) * gw + 3.6 * step + 2
  else w = x0 + full * gw + (rem - 1) * step + 3
  return { w: Math.ceil(w), h: Math.ceil(gh + 4) }
}

export const tallyRecipe = defineRecipe<TallyParams>({
  id: 'tally',
  kind: 'tally',
  layers: ['rest'],
  pad: 8,
  draw(ink, { w }, p, ctx) {
    const n = Math.max(0, Math.min(99, Math.floor(p.count)))
    if (n === 0) return
    const { pen, width } = markPen(p.tone, p.weight, Math.max(14, p.gh * 0.9))
    const x0 = Math.ceil(0.6 * 0.26 * p.gh) + 1
    const { lines } = tallyLines(ink.next('tally'), x0, 2, n, p.gh)
    const mirror = p.rtl ?? ctx.dir === 'rtl'
    ink.layer('rest', () => {
      if (mirror) ink.group({ transform: `translate(${w} 0) scale(-1 1)` }, () => ink.lines(lines, pen, { width }))
      else ink.lines(lines, pen, { width })
    })
  },
})
