import { highlight } from '@/lib/ink/fills'
import { defineRecipe } from '@/lib/ink/recipes'
import { highlighterPen, overshoot, type HighlightTone, type LineParams } from '@/lib/ink/recipes/text-marks-ink'

export interface HighlightParams extends LineParams {
  tone: HighlightTone
  fat?: number
  cover?: 'full' | 'under'
}

export const highlightRecipe = defineRecipe<HighlightParams>({
  id: 'highlight',
  kind: 'highlight',
  layers: ['rest'],
  pad: 10,
  draw(ink, { w, h }, p, ctx) {
    const { pen, opts } = highlighterPen(p.tone)
    const o = overshoot(p.fs)
    const under = p.cover === 'under'
    const top = under ? p.base - p.xh * 0.42 : p.base - p.cap - p.fs * 0.14
    const bot = p.base + p.desc * (under ? 0.95 : 0.85) + p.fs * 0.06
    const band = Math.min(h, (bot - top) * (p.fat ?? 1))
    const y = Math.max(0, top + ((bot - top) - band) / 2)
    const x0 = p.first ? -o * 0.6 : -1
    const x1 = p.last ? w + o * 0.6 : w + 1
    ink.layer('rest', () => {
      highlight(ink, x0, y, x1 - x0, band, { pen, opts })
      if (!ctx.calm && x1 - x0 > 4.5 * p.fs) {
        const r = ink.next('again')
        highlight(ink, x0 + r.range(0.1, 0.25) * (x1 - x0), y + r.range(-1.2, 1.2), (x1 - x0) * r.range(0.4, 0.62), band * 0.8, { pen, opts: { ...opts, alpha: (opts.alpha ?? 1) * 0.5 } })
      }
    })
  },
})
