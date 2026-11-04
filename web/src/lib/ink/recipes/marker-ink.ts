import { line, underline } from '@/lib/ink/shapes'
import { clamp } from '@/lib/ink/rng'
import { defineRecipe } from '@/lib/ink/recipes'

export type MarkerSide = 'start' | 'end' | 'full'
export type MarkerTone = 'default' | 'new'

export interface MarkerRuleParams {
  side: MarkerSide
  tone: MarkerTone
  style?: 'line' | 'wavy'
}

export const markerRuleRecipe = defineRecipe<MarkerRuleParams>({
  id: 'marker-rule',
  kind: 'rule',
  layers: ['rest'],
  pad: 8,
  draw(ink, { w, h }, { side, tone, style = 'line' }, ctx) {
    const y = h / 2
    const rtl = ctx.dir === 'rtl'
    const towardsWords: 'left' | 'right' | 'none' = side === 'full' ? 'none' : (side === 'start') === !rtl ? 'right' : 'left'
    const gap = clamp(w * 0.02, 1, 4) + 1
    const x1 = towardsWords === 'left' ? gap : 0
    const x2 = towardsWords === 'right' ? w - gap : w
    ink.layer('rest', () => {
      if (ctx.calm) line(ink, x1, y, x2, y, { pen: 'pencil.fine', opts: { alpha: tone === 'new' ? 0.9 : 0.7, simple: true, color: tone === 'new' ? 'red' : undefined } })
      else if (style === 'wavy' && side === 'full') underline(ink, x1, y, x2 - x1, { kind: 'wavy', pen: tone === 'new' ? 'red' : 'pencil' })
      else line(ink, x1, y, x2, y, { pen: tone === 'new' ? 'red' : 'pencil' })
    })
  },
})
