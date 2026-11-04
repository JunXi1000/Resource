import { defineRecipe } from '@/lib/ink/recipes'
import { MIRROR, circleD, litEdge, num, paperFill, pathTag, polyD, tok } from '@/lib/ink/recipes/paper-set-ink'
import type { Accent } from '@/lib/ink/paper/props'
import type { StockName } from '@/lib/ink/paper/stocks'
import type { Pt } from '@/lib/ink/types'

export type TagShape = 'price' | 'round' | 'luggage'

export interface LabelTagParams {
  stock: StockName
  shape: TagShape
  string: number
  twine: 'natural' | Accent
  eyelet: 'brass' | 'steel' | 'none'
}

export const TAG = { hole: 4.4, eyelet: 18, patch: 11.5, chamfer: 22 } as const

export function tagHole(w: number, h: number, shape: TagShape): Pt {
  return shape === 'luggage' ? [TAG.eyelet + 2, h / 2] : [w / 2, shape === 'round' ? TAG.eyelet + 2 : TAG.eyelet]
}

export function tagPath(w: number, h: number, shape: TagShape, r: { gauss: (m: number, s: number) => number }, mirror = false): string {
  const c = Math.min(TAG.chamfer, w * 0.24, h * 0.3)
  const k = 3
  const j = () => r.gauss(0, 0.22)
  if (shape === 'round') {
    const R = w / 2
    return `M0 ${num(R)}A${num(R)} ${num(R)} 0 0 1 ${num(w)} ${num(R)}V${num(h - k)}Q${num(w)} ${num(h)} ${num(w - k)} ${num(h)}H${num(k)}Q0 ${num(h)} 0 ${num(h - k)}z`
  }
  const pts: Pt[] =
    shape === 'luggage'
      ? [[c, j()], [w * 0.5, j()], [w - k, j()], [w + j(), k], [w + j(), h / 2], [w + j(), h - k], [w - k, h + j()], [w * 0.5, h + j()], [c, h + j()], [j(), h - c], [j(), h / 2], [j(), c]]
      : [[c, j()], [w / 2, j()], [w - c, j()], [w + j(), c], [w + j(), h / 2], [w + j(), h - k], [w - k, h + j()], [w / 2, h + j()], [k, h + j()], [j(), h - k], [j(), h / 2], [j(), c]]
  return polyD(mirror ? pts.map(([x, y]): Pt => [w - x, y]) : pts, true)
}

const TWINE_STROKE = (t: LabelTagParams['twine']) => (t === 'natural' ? tok('orange-text') : tok(t))

export const labelTagRecipe = defineRecipe<LabelTagParams>({
  id: 'label-tag-sheet',
  kind: 'sheet',
  layers: ['rest', 'hover'],
  pad: (_b, p) => Math.ceil(p.string + 14),
  draw(ink, { w, h }, { stock, shape, string, twine, eyelet }, ctx) {
    const r = ink.next('tag')
    const [hx, hy] = tagHole(w, h, shape)
    const horizontal = shape === 'luggage'
    const flip = horizontal && ctx.dir === 'rtl'
    const body = tagPath(w, h, shape, r, flip)
    ink.layer('rest', () => {
      const L = string
      const dir = horizontal ? ([-1, 0] as const) : ([0, -1] as const)
      const across = horizontal ? ([0, 1] as const) : ([1, 0] as const)
      const at = (along: number, side: number): Pt => [hx + dir[0] * along + across[0] * side, hy + dir[1] * along + across[1] * side]
      const P = (p: Pt) => `${num(p[0])} ${num(p[1])}`
      const wob = r.gauss(0, 1.5)
      const back = `M${P(at(0, 1.2))}C${P(at(L * 0.35, 15 + wob))} ${P(at(L * 1.02, 15 + wob))} ${P(at(L, 1))}`
      const front = `M${P(at(0, -1.2))}C${P(at(L * 0.35, -15 - wob))} ${P(at(L * 1.02, -15 - wob))} ${P(at(L, -1))}`
      const colour = TWINE_STROKE(twine)
      const cord = (d: string) =>
        pathTag(d, { stroke: tok('ink'), sw: 3.8, op: 0.2, transform: 'translate(.8 1.4)' }) +
        pathTag(d, { stroke: colour, sw: 3 }) +
        pathTag(d, { stroke: tok('ink'), sw: 0.7, op: 0.55, extra: 'stroke-dasharray="1.2 2.6"' }) +
        pathTag(d, { stroke: tok('photo'), sw: 0.8, op: 0.55, transform: 'translate(-.4 -.5)', extra: 'stroke-dasharray="1.6 2.2"' })
      const mirrored = (m: string) => (flip ? `<g transform="${MIRROR(w)}">${m}</g>` : m)
      const under = cord(back)
      const cut = shape === 'round' ? w / 2 : Math.min(TAG.chamfer, w * 0.24, h * 0.3)
      const inset: [number, number, number, number] = shape !== 'luggage' ? [cut, 1, 1, 1] : flip ? [1, cut, 1, 1] : [1, 1, 1, cut]
      const paper = paperFill(ink.seed, body + circleD(flip ? w - hx : hx, hy, TAG.hole), { stock, evenodd: true, shadow: true, inset })
      let s = ''
      const R = w / 2
      s += litEdge(shape === 'round' ? `M0.6 ${num(R)}A${num(R - 0.6)} ${num(R - 0.6)} 0 0 1 ${num(w - 0.6)} ${num(R)}` : horizontal ? `M${num(TAG.chamfer)} 0.6H${num(w - 4)}` : `M${num(TAG.chamfer)} 0.6H${num(w - TAG.chamfer)}`, 0.7)
      const patch = `${circleD(hx, hy, TAG.patch)}${circleD(hx, hy, TAG.hole)}`
      s += pathTag(patch, { fill: tok('ink'), op: 0.14, transform: 'translate(.6 1.1)', extra: 'fill-rule="evenodd"' })
      s += pathTag(patch, { fill: tok('paper'), extra: 'fill-rule="evenodd"' })
      s += pathTag(circleD(hx, hy, TAG.patch), { stroke: tok('ink'), sw: 0.6, op: 0.28 })
      s += pathTag(circleD(hx, hy, TAG.patch - 1.6), { stroke: tok('paper-shade'), sw: 0.7, op: 0.8 })
      if (eyelet !== 'none') {
        const metal = eyelet === 'brass' ? tok('hi-deep') : tok('pencil-mark')
        const ring = `${circleD(hx, hy, TAG.hole + 2.6)}${circleD(hx, hy, TAG.hole - 0.4)}`
        s += pathTag(ring, { fill: tok('ink'), op: 0.2, transform: 'translate(.7 1.2)', extra: 'fill-rule="evenodd"' })
        s += pathTag(ring, { fill: metal, extra: 'fill-rule="evenodd"' })
        s += pathTag(`M${num(hx - TAG.hole - 1.6)} ${num(hy - 0.5)}A${num(TAG.hole + 1.6)} ${num(TAG.hole + 1.6)} 0 0 1 ${num(hx + 0.5)} ${num(hy - TAG.hole - 1.6)}`, { stroke: tok('photo'), sw: 1.1, op: 0.9 })
        s += pathTag(`M${num(hx + TAG.hole + 1.4)} ${num(hy + 0.5)}A${num(TAG.hole + 1.6)} ${num(TAG.hole + 1.6)} 0 0 1 ${num(hx - 0.5)} ${num(hy + TAG.hole + 1.6)}`, { stroke: tok('ink'), sw: 1, op: 0.35 })
      }
      s += cord(front)
      ink.raw(mirrored(under) + paper + mirrored(s), 'under')
      ink.grow([-string - 6, -string - 6, w + string + 6, h + 6])
    })
    ink.layer('hover', () => {
      if (eyelet === 'none') return
      const gl = pathTag(`M${num(hx - 3)} ${num(hy - 6)}l2 -2.5M${num(hx + 4)} ${num(hy - 7)}l-1 -2.8`, { stroke: tok('photo'), sw: 1.2, op: 0.95 })
      ink.raw(flip ? `<g transform="${MIRROR(w)}">${gl}</g>` : gl, 'top')
    })
  },
})
