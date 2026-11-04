import { memo, renderSticker, type Silhouette } from '@/lib/ink/art-draw'
import { n } from '@/lib/ink/paint'
import { stickerBatches, stickers } from '@/lib/ink/art/stickers'
import type { StickerDef } from '@/lib/ink/art/types'

export function stickerLabel(name: string): string {
  const words = name.replace(/[-_]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const CATEGORY_LABEL: Record<string, string> = {
  statusPointers: 'Status & pointers',
  spaceWeather: 'Space & weather',
  foodDrink: 'Food & drink',
  officeDesk: 'Office & desk',
  natureAnimals: 'Nature & animals',
  facesCelebrate: 'Faces & celebrate',
  badgesStamps: 'Badges & stamps',
}

export function categoryLabel(key: string): string {
  return CATEGORY_LABEL[key] ?? stickerLabel(key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase())
}

export interface StickerCatalogEntry {
  name: string
  label: string
  category: string
  categoryLabel: string
  tags: readonly string[]
}

export function stickerCatalog(): StickerCatalogEntry[] {
  return catalog()
}

const catalog = (): StickerCatalogEntry[] =>
  memo('sticker-catalog', () =>
    Object.entries(stickerBatches as Record<string, Record<string, StickerDef>>).flatMap(([category, defs]) =>
      Object.entries(defs).map(([name, def]) => ({
        name,
        label: stickerLabel(name),
        category,
        categoryLabel: categoryLabel(category),
        tags: (def as { tags?: readonly string[] }).tags ?? [],
      }))
    ), 4)

export function hasSticker(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(stickers, name)
}

export type CutShape =
  | { kind: 'path'; fills: readonly string[]; lines: readonly string[]; W: number; border: number }
  | { kind: 'rect' }

export interface StickerFace {
  name: string
  w: number
  h: number
  box: { x: number; y: number; w: number; h: number }
  svg: string
  cut: CutShape
}

export interface FaceOpts {
  peel?: boolean | number
  idPrefix?: string
  border?: number
}

export function stickerFace(name: string, px: number, seed: string, o: FaceOpts = {}): StickerFace | null {
  const def = (stickers as Record<string, StickerDef>)[name]
  if (!def) return null
  const size = Math.max(32, Math.round(px))
  const key = `face|${name}|${size}|${seed}|${o.peel ? o.peel : ''}|${o.border ?? ''}|${o.idPrefix ?? ''}`
  return memo(
    key,
    () => {
      const res = renderSticker(def, size, seed, { peel: o.peel ? o.peel : undefined, border: o.border, idPrefix: o.idPrefix })
      const sil = (res as { silhouette?: Silhouette }).silhouette
      const border = (res as { border?: number }).border
      const cut: CutShape = sil && border !== undefined ? { kind: 'path', fills: sil.fills, lines: sil.lines, W: sil.W, border } : { kind: 'rect' }
      return { name, w: res.w, h: res.h, box: tightBox(res.w, res.h, sil, border), svg: res.svg, cut }
    },
    400
  )
}

function tightBox(w: number, h: number, sil: Silhouette | undefined, border: number | undefined): StickerFace['box'] {
  if (!sil || border === undefined || sil.pts.length === 0) return { x: 0, y: 0, w, h }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of sil.pts) {
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  const m = border + 1.5
  x0 = Math.max(0, Math.floor(x0 - m))
  y0 = Math.max(0, Math.floor(y0 - m))
  x1 = Math.min(w, Math.ceil(x1 + m))
  y1 = Math.min(h, Math.ceil(y1 + m))
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

export function kissCut(face: StickerFace, id: string): string {
  const { w, h, cut } = face
  const ring = 1.4
  const shapeOf = (paint: string, extra: number, more = ''): string => {
    if (cut.kind === 'rect') {
      const r = Math.min(w, h) * 0.08
      const inset = 3.5 - extra / 2
      return `<rect x="${n(inset)}" y="${n(inset)}" width="${n(w - 2 * inset)}" height="${n(h - 2 * inset)}" rx="${n(r)}" fill="${paint}" ${more}/>`
    }
    const sw = 2 * cut.border + extra
    const g = `fill="${paint}" stroke="${paint}" stroke-width="${n(sw)}" stroke-linejoin="round" stroke-linecap="round"`
    const lines = `fill="none" stroke="${paint}" stroke-width="${n(sw + cut.W)}" stroke-linejoin="round" stroke-linecap="round"`
    return `<g ${g} ${more}>${cut.fills.map((d) => `<path d="${d}"/>`).join('')}</g><g ${lines} ${more}>${cut.lines.map((d) => `<path d="${d}"/>`).join('')}</g>`
  }
  const mask = `<mask id="${id}m" maskUnits="userSpaceOnUse" x="-12" y="-12" width="${n(w + 24)}" height="${n(h + 24)}">${shapeOf('white', ring)}${shapeOf('black', 0)}</mask>`
  const catchLine = `<g transform="translate(.9 1)" opacity=".8"><rect x="-12" y="-12" width="${n(w + 24)}" height="${n(h + 24)}" fill="var(--ll-photo)" mask="url(#${id}m)"/></g>`
  const cutLine = `<rect x="-12" y="-12" width="${n(w + 24)}" height="${n(h + 24)}" fill="var(--ll-pencil)" opacity=".62" mask="url(#${id}m)"/>`
  return `<defs>${mask}</defs><g opacity=".07">${shapeOf('var(--ll-ink)', 0)}</g>${catchLine}${cutLine}`
}
