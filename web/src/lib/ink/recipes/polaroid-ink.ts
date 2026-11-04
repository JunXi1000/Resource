import type { Ink } from '@/lib/ink/builder'
import { blobFill, bandFill, hatch, wash } from '@/lib/ink/fills'
import { TAU, ellipsePoly, rectPoly, spline } from '@/lib/ink/geom'
import { defineRecipe } from '@/lib/ink/recipes'
import type { Rng } from '@/lib/ink/rng'
import { noise1 } from '@/lib/ink/noise'
import type { Pt } from '@/lib/ink/types'

export type PolaroidScene = 'hills' | 'sea' | 'house' | 'night'
export const POLAROID_SCENES: readonly PolaroidScene[] = ['hills', 'sea', 'house', 'night']

export interface PolaroidPhotoParams {
  scene: PolaroidScene
}

function ridge(r: Rng, w: number, h: number, y0: number, amp: number, wl: number): Pt[] {
  const f = noise1(r, w + 40, wl)
  const top: Pt[] = []
  for (let x = -6; x <= w + 6; x += 8) top.push([x, y0 + amp * (f(x + 6) - 0.5) * 2])
  return [...spline(top, 4), [w + 8, h + 8], [-8, h + 8]]
}

const disc = (cx: number, cy: number, r: number): Pt[] => ellipsePoly(cx, cy, r, r * 0.97, 22)

const pen = (ink: Ink, pts: Pt[], name: 'ink' | 'ink.fine' | 'pencil' | 'pencil.fine' | 'f_tangerine' | 'greenfelt', o: { alpha?: number; width?: number; poly?: boolean } = {}) =>
  ink.stroke(pts, name, { simple: true, ...o })

function ring(ink: Ink, cx: number, cy: number, rx: number, ry: number, name: 'ink' | 'f_tangerine' | 'greenfelt') {
  const r = ink.next('ring')
  const a0 = r.range(0, TAU)
  const pts: Pt[] = []
  for (let i = 0; i <= 26; i++) {
    const t = a0 + (i / 26) * TAU * 1.06
    const k = 1 + 0.018 * Math.sin(t * 2 + a0) + (i / 26) * 0.03
    pts.push([cx + Math.cos(t) * rx * k, cy + Math.sin(t) * ry * k])
  }
  pen(ink, spline(pts, 3), name)
}

function puff(ink: Ink, cx: number, cy: number, w: number, h: number) {
  const r = ink.next('puff')
  const bumps = w > h * 3 ? 4 : 3
  const sw = w / bumps
  const base = cy + h / 2
  const pts: Pt[] = [[cx - w / 2 - 3, base + 0.6]]
  for (let i = 0; i < bumps; i++) {
    const mid = i > 0 && i < bumps - 1
    const lift = h * (mid ? r.range(1.05, 1.35) : r.range(0.6, 0.8))
    const xc = cx - w / 2 + sw * (i + 0.5)
    for (let k = 0; k <= 8; k++) {
      const a = Math.PI + (k / 8) * Math.PI
      pts.push([xc + Math.cos(a) * sw * 0.55, base - Math.sin(-a) * lift + (Math.abs(Math.cos(a)) > 0.95 ? 0 : 0)])
    }
  }
  pts.push([cx + w / 2 + 3, base + 0.4])
  pen(ink, spline(pts, 2.5), 'pencil')
}

function twinkle(ink: Ink, cx: number, cy: number, r: number) {
  blobFill(ink, [[cx, cy - r], [cx + r * 0.28, cy - r * 0.28], [cx + r, cy], [cx + r * 0.28, cy + r * 0.28], [cx, cy + r], [cx - r * 0.28, cy + r * 0.28], [cx - r, cy], [cx - r * 0.28, cy - r * 0.28]], 'lemon', { alpha: 0.95, mis: 0.6, rough: 0.3 })
}

function sun(ink: Ink, cx: number, cy: number, r: number, rays = 9) {
  blobFill(ink, disc(cx, cy, r), 'lemon', { alpha: 0.95 })
  ring(ink, cx, cy, r * 1.02, r, 'f_tangerine')
  const g = ink.next('rays')
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 + g.range(-0.12, 0.12)
    const r0 = r * 1.5, r1 = r * g.range(1.85, 2.25)
    pen(ink, [[cx + Math.cos(a) * r0, cy + Math.sin(a) * r0], [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1]], 'f_tangerine')
  }
}

function tree(ink: Ink, x: number, y: number, s: number, crown: 'grass' | 'tomato' = 'grass') {
  blobFill(ink, rectPoly(x - s * 0.035, y - s * 0.56, s * 0.08, s * 0.56), 'orange-text', { alpha: 0.85, mis: 1 })
  ink.stroke([[x - s * 0.035, y], [x - s * 0.04, y - s * 0.52]], 'ink', { width: 1.1 })
  const cy = y - s * 0.86
  blobFill(ink, ellipsePoly(x, cy, s * 0.42, s * 0.4, 22, 0.2), crown, { alpha: 0.92 })
  ring(ink, x - s * 0.02, cy, s * 0.43, s * 0.4, 'greenfelt')
  const g = ink.next('fruit')
  for (let i = 0; i < 3; i++) ink.dot(x + g.range(-s * 0.22, s * 0.22), cy + g.range(-s * 0.2, s * 0.2), s * 0.045, 'f_tomato')
}

function drawHills(ink: Ink, w: number, h: number) {
  const r = ink.next('scene')
  wash(ink, rectPoly(0, 0, w, h * 0.62), 'sky', { alpha: 0.46, inset: -4 })
  sun(ink, w * 0.72, h * 0.25, w * 0.085)
  puff(ink, w * 0.27, h * 0.2, w * 0.28, h * 0.1)
  puff(ink, w * 0.5, h * 0.37, w * 0.15, h * 0.055)
  blobFill(ink, ridge(r.fork('far'), w, h, h * 0.55, h * 0.045, 60), 'teal', { alpha: 0.55 })
  blobFill(ink, ridge(r.fork('mid'), w, h, h * 0.66, h * 0.05, 70), 'grass', { alpha: 0.72 })
  bandFill(ink, ridge(r.fork('near'), w, h, h * 0.83, h * 0.035, 50), 'grass', { alpha: 0.9, angle: 0.15 })
  hatch(ink, [w * 0.06, h * 0.9, w * 0.88, h * 0.08], { angle: 62, gap: 9, pen: 'pencil', alpha: 0.35 })
  tree(ink, w * 0.25, h * 0.8, h * 0.34)
  const g = r.fork('flowers')
  for (let i = 0; i < 5; i++) ink.dot(w * g.range(0.45, 0.92), h * g.range(0.86, 0.96), h * 0.014, i % 2 ? 'f_bubblegum' : 'f_lemon')
}

function drawSea(ink: Ink, w: number, h: number) {
  const r = ink.next('scene')
  wash(ink, rectPoly(0, 0, w, h * 0.55), 'tangerine', { alpha: 0.24, inset: -4 })
  blobFill(ink, disc(w * 0.66, h * 0.5, w * 0.11), 'lemon', { alpha: 0.96 })
  ring(ink, w * 0.66, h * 0.5, w * 0.115, w * 0.11, 'f_tangerine')
  bandFill(ink, rectPoly(-4, h * 0.52, w + 8, h * 0.5), 'sky', { alpha: 0.8, angle: 0.03 })
  wash(ink, rectPoly(-4, h * 0.72, w + 8, h * 0.3), 'teal', { alpha: 0.6, inset: -2 })
  pen(ink, [[-2, h * 0.52], [w * 0.5, h * 0.522], [w + 2, h * 0.516]], 'ink.fine')
  const g = r.fork('waves')
  for (let i = 0; i < 9; i++) {
    const y = h * (0.6 + 0.36 * (i / 9)) + g.range(-3, 3)
    const x = w * g.range(0.02, 0.7)
    const len = w * g.range(0.14, 0.26)
    pen(ink, spline([[x, y], [x + len * 0.25, y - 3.4], [x + len * 0.5, y], [x + len * 0.75, y - 3.4], [x + len, y]], 3), 'pencil.fine', { alpha: 0.8 })
  }
  const bx = w * 0.3, by = h * 0.68, s = w * 0.2
  blobFill(ink, [[bx - s * 0.5, by], [bx + s * 0.55, by], [bx + s * 0.38, by + s * 0.22], [bx - s * 0.32, by + s * 0.22]], 'tomato', { alpha: 0.95, mis: 1 })
  pen(ink, [[bx - s * 0.5, by], [bx + s * 0.55, by], [bx + s * 0.38, by + s * 0.22], [bx - s * 0.32, by + s * 0.22], [bx - s * 0.5, by]], 'ink', { poly: true, width: 0.8 })
  pen(ink, [[bx + s * 0.02, by], [bx + s * 0.02, by - s * 1.05]], 'ink')
  blobFill(ink, [[bx + s * 0.08, by - s * 1.0], [bx + s * 0.08, by - s * 0.08], [bx + s * 0.48, by - s * 0.1]], 'paper', { alpha: 0.98, mis: 1 })
  ink.stroke([[bx + s * 0.08, by - s * 1.0], [bx + s * 0.08, by - s * 0.08], [bx + s * 0.48, by - s * 0.1], [bx + s * 0.08, by - s * 1.0]], 'ink', { poly: true, width: 0.8 })
  blobFill(ink, [[bx - s * 0.04, by - s * 0.9], [bx - s * 0.04, by - s * 0.1], [bx - s * 0.36, by - s * 0.12]], 'photo', { alpha: 0.98, mis: 1 })
  pen(ink, [[bx - s * 0.04, by - s * 0.9], [bx - s * 0.04, by - s * 0.1], [bx - s * 0.36, by - s * 0.12], [bx - s * 0.04, by - s * 0.9]], 'ink', { poly: true, width: 0.8 })
  for (const [gx, gy] of [[0.2, 0.18], [0.34, 0.26], [0.13, 0.3]] as const) {
    pen(ink, spline([[w * gx - 7, h * gy], [w * gx - 3, h * gy - 4], [w * gx, h * gy], [w * gx + 3, h * gy - 4], [w * gx + 7, h * gy]], 3), 'ink.fine')
  }
}

function drawHouse(ink: Ink, w: number, h: number) {
  const r = ink.next('scene')
  wash(ink, rectPoly(0, 0, w, h * 0.7), 'sky', { alpha: 0.4, inset: -4 })
  sun(ink, w * 0.16, h * 0.17, w * 0.075, 8)
  blobFill(ink, ridge(r.fork('lawn'), w, h, h * 0.7, h * 0.02, 80), 'grass', { alpha: 0.85 })
  hatch(ink, [w * 0.04, h * 0.76, w * 0.92, h * 0.2], { angle: 64, gap: 9, pen: 'greenfelt', alpha: 0.35, width: 0.7 })
  const x = w * 0.36, y = h * 0.46, ww = w * 0.36, hh = h * 0.27
  blobFill(ink, rectPoly(x, y, ww, hh), 'lemon', { alpha: 0.92, mis: 2.4 })
  ink.stroke([[x, y + hh], [x, y], [x + ww, y], [x + ww, y + hh]], 'ink', { poly: true })
  pen(ink, [[x - 4, y + hh], [x + ww + 4, y + hh]], 'ink')
  const roof: Pt[] = [[x - ww * 0.1, y + 1], [x + ww / 2, y - hh * 0.62], [x + ww * 1.1, y + 1]]
  blobFill(ink, roof, 'tomato', { alpha: 0.95, mis: 2 })
  ink.stroke([...roof, roof[0]], 'ink', { poly: true })
  pen(ink, [[x + ww * 0.78, y - hh * 0.32], [x + ww * 0.78, y - hh * 0.72], [x + ww * 0.94, y - hh * 0.72], [x + ww * 0.94, y - hh * 0.14]], 'ink', { poly: true, width: 0.85 })
  blobFill(ink, rectPoly(x + ww * 0.14, y + hh * 0.36, ww * 0.24, hh * 0.64), 'grape', { alpha: 0.9, mis: 1 })
  pen(ink, [[x + ww * 0.14, y + hh], [x + ww * 0.14, y + hh * 0.36], [x + ww * 0.38, y + hh * 0.36], [x + ww * 0.38, y + hh]], 'ink', { poly: true, width: 0.9 })
  blobFill(ink, rectPoly(x + ww * 0.56, y + hh * 0.26, ww * 0.26, ww * 0.24), 'sky', { alpha: 0.95, mis: 1 })
  pen(ink, [[x + ww * 0.56, y + hh * 0.26], [x + ww * 0.82, y + hh * 0.26], [x + ww * 0.82, y + hh * 0.26 + ww * 0.24], [x + ww * 0.56, y + hh * 0.26 + ww * 0.24], [x + ww * 0.56, y + hh * 0.26]], 'ink', { poly: true, width: 0.9 })
  pen(ink, [[x + ww * 0.69, y + hh * 0.26], [x + ww * 0.69, y + hh * 0.26 + ww * 0.24]], 'ink.fine')
  const smoke: Pt[] = [[x + ww * 0.86, y - hh * 0.78], [x + ww * 0.92, y - hh * 0.98], [x + ww * 0.82, y - hh * 1.16], [x + ww * 0.92, y - hh * 1.32]]
  pen(ink, spline(smoke, 3), 'pencil', { alpha: 0.8 })
  tree(ink, w * 0.13, h * 0.8, h * 0.36, 'tomato')
  pen(ink, spline([[x + ww * 0.26, y + hh], [x + ww * 0.1, h * 0.86], [w * 0.3, h * 0.97]], 3), 'pencil', { alpha: 0.7 })
}

export function crescent(cx: number, cy: number, R: number, bx: number, by: number, r2: number, n = 14): Pt[] {
  const d = Math.hypot(bx, by)
  const ux = bx / d
  const uy = by / d
  const a = (R * R - r2 * r2 + d * d) / (2 * d)
  const hh = Math.sqrt(Math.max(0, R * R - a * a))
  const mx = cx + a * ux
  const my = cy + a * uy
  const ends: Pt[] = [
    [mx - hh * uy, my + hh * ux],
    [mx + hh * uy, my - hh * ux],
  ]
  const away = Math.atan2(-uy, -ux)
  const wrap = (t: number) => Math.atan2(Math.sin(t), Math.cos(t))
  const rel = (p: Pt, ox: number, oy: number) => wrap(Math.atan2(p[1] - oy, p[0] - ox) - away)
  const [lo, hi] = rel(ends[0], cx, cy) < rel(ends[1], cx, cy) ? [ends[0], ends[1]] : [ends[1], ends[0]]
  const pts: Pt[] = []
  const t0 = rel(lo, cx, cy)
  const t1 = rel(hi, cx, cy)
  for (let i = 0; i <= n; i++) {
    const t = away + t0 + ((t1 - t0) * i) / n
    pts.push([cx + Math.cos(t) * R, cy + Math.sin(t) * R * 0.97])
  }
  const e0 = rel(hi, cx + bx, cy + by)
  const e1 = rel(lo, cx + bx, cy + by)
  for (let i = 0; i <= n; i++) {
    const t = away + e0 + ((e1 - e0) * i) / n
    pts.push([cx + bx + Math.cos(t) * r2, cy + by + Math.sin(t) * r2 * 0.97])
  }
  return pts
}

function drawNight(ink: Ink, w: number, h: number) {
  const r = ink.next('scene')
  wash(ink, rectPoly(0, 0, w, h), 'grape', { alpha: 0.5, inset: -4 })
  wash(ink, rectPoly(0, 0, w, h), 'ink', { alpha: 0.42, inset: -4 })
  blobFill(ink, crescent(w * 0.68, h * 0.26, w * 0.1, w * 0.05, -w * 0.03, w * 0.088), 'lemon', { alpha: 0.98, mis: 1 })
  const g = r.fork('stars')
  for (let i = 0; i < 9; i++) {
    const sx = w * g.range(0.06, 0.94)
    const sy = h * g.range(0.05, 0.5)
    const sr = w * g.range(0.014, 0.034)
    if (Math.hypot(sx - w * 0.7, sy - h * 0.25) > w * 0.17) twinkle(ink, sx, sy, sr)
  }
  const roofs: Pt[] = [[-6, h + 6], [-6, h * 0.8]]
  let x = -6
  while (x < w + 6) {
    const bw = w * g.range(0.2, 0.3)
    const top = h * g.range(0.64, 0.79)
    roofs.push([x, top], [x + bw / 2, top - bw * 0.35], [x + bw, top])
    x += bw
  }
  roofs.push([w + 6, h * 0.8], [w + 6, h + 6])
  blobFill(ink, roofs, 'ink', { alpha: 0.9, mis: 1 })
  for (let i = 0; i < 7; i++) {
    const wx = w * g.range(0.05, 0.92)
    const wy = h * (wx > w * 0.62 ? g.range(0.81, 0.845) : g.range(0.81, 0.9))
    blobFill(ink, rectPoly(wx, wy, w * 0.035, w * 0.045), 'lemon', { alpha: 0.95, mis: 0, material: 'top' })
  }
}

export const polaroidPhotoRecipe = defineRecipe<PolaroidPhotoParams>({
  id: 'polaroid-photo',
  kind: 'photo',
  layers: ['rest'],
  pad: 4,
  draw(ink, { w, h }, { scene }) {
    ink.layer('rest', () => {
      if (scene === 'sea') drawSea(ink, w, h)
      else if (scene === 'house') drawHouse(ink, w, h)
      else if (scene === 'night') drawNight(ink, w, h)
      else drawHills(ink, w, h)
    })
  },
})
