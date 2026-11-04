"use client"

import * as React from "react"

import { ensureInkDefs, inkFrame, inkViewBox, useInkContext, useInkSeed, useMergedRef } from "@/lib/ink"
import type { Frame, Recipe } from "@/lib/ink"
import { GUESS_RATIOS, lineMetrics, type FontRatios, type LineParams } from "@/lib/ink/recipes/text-marks-ink"

export type MarkPhase = "idle" | "in" | "off"

export interface MarkRect {
  x: number
  y: number
  w: number
  h: number
}

interface Measured {
  rects: MarkRect[]
  ratios: FontRatios
  fs: number
}

export interface UseMarkInkOptions<P extends LineParams> {
  recipe: Recipe<P>
  params: Omit<P, keyof LineParams>
  kind: string
  seed?: string | number
  mode?: "lines" | "box"
  over?: boolean
  animate?: boolean
  show?: boolean
  delay?: number
}

export interface UseMarkInkResult {
  hostRef: React.RefCallback<HTMLElement>
  hostProps: Record<string, string | undefined>
  nodes: React.ReactNode
  phase: MarkPhase
  ready: boolean
  seed: string
}

export const MARK_WIPE =
  "data-animate:data-[mark=idle]:[&>svg]:[clip-path:inset(-10%_var(--ll-wipe-r,100%)_-10%_var(--ll-wipe-l,-4%))] data-animate:data-[mark=in]:[&>svg]:animate-[ll-wipe_var(--ll-dur-draw)_var(--ll-ease-out)_var(--ll-draw-delay,0s)_both]"

export const MARK_REVEAL =
  "data-animate:[&>svg_[data-part=reveal]]:[stroke-dasharray:1] data-animate:data-[mark=idle]:[&>svg_[data-part=reveal]]:[stroke-dashoffset:1] data-animate:data-[mark=in]:[&>svg_[data-part=reveal]]:animate-[ll-draw_var(--ll-dur-draw)_var(--ll-ease-out)_var(--ll-draw-delay,0s)_both]"

interface RectLike {
  left: number
  top: number
  width: number
  height: number
}

export function mergeLineRects(list: readonly RectLike[]): RectLike[] {
  const out: RectLike[] = []
  for (const r of list) {
    if (!(r.width >= 0.5 && r.height >= 0.5)) continue
    const same = out.find((o) => Math.min(o.top + o.height, r.top + r.height) - Math.max(o.top, r.top) > 0.6 * Math.min(o.height, r.height))
    if (same) {
      const left = Math.min(same.left, r.left)
      const top = Math.min(same.top, r.top)
      const right = Math.max(same.left + same.width, r.left + r.width)
      const bottom = Math.max(same.top + same.height, r.top + r.height)
      same.left = left
      same.top = top
      same.width = right - left
      same.height = bottom - top
    } else out.push({ left: r.left, top: r.top, width: r.width, height: r.height })
  }
  return out
}

let canvas: { measureText(t: string): TextMetrics; font: string } | null | undefined
function canvasContext(): typeof canvas {
  if (canvas !== undefined) return canvas
  canvas = null
  try {
    if (typeof OffscreenCanvas !== "undefined") canvas = new OffscreenCanvas(1, 1).getContext("2d")
    else if (typeof document !== "undefined" && !/jsdom/i.test(navigator.userAgent)) canvas = document.createElement("canvas").getContext("2d")
  } catch {
    canvas = null
  }
  return canvas
}

const ratioCache = new Map<string, FontRatios>()

function fontRatios(cs: CSSStyleDeclaration): FontRatios | null {
  const ctx = canvasContext()
  if (!ctx) return null
  const font = `${cs.fontStyle} ${cs.fontWeight} 100px ${cs.fontFamily}`
  const cached = ratioCache.get(font)
  if (cached) return cached
  try {
    ctx.font = font
    const m = ctx.measureText("x")
    if (typeof m.fontBoundingBoxAscent !== "number") return null
    const cap = ctx.measureText("H").actualBoundingBoxAscent / 100
    const pd = ctx.measureText("p").actualBoundingBoxDescent / 100
    const r: FontRatios = { asc: m.fontBoundingBoxAscent / 100, desc: m.fontBoundingBoxDescent / 100, xh: m.actualBoundingBoxAscent / 100, cap: cap || GUESS_RATIOS.cap, pdesc: pd || GUESS_RATIOS.pdesc }
    if (typeof document !== "undefined" && document.fonts?.check && !document.fonts.check(`100px ${cs.fontFamily}`)) return r
    ratioCache.set(font, r)
    return r
  } catch {
    return null
  }
}

const q = (v: number) => Math.round(v * 4) / 4

export const MAX_MARK_LINES = 60

function measure(host: HTMLElement, origin: HTMLElement | null): Measured | null {
  const cs = getComputedStyle(host)
  if (cs.display === "none") return null
  const fs = Number.parseFloat(cs.fontSize) || 16
  const raw = mergeLineRects(Array.from(host.getClientRects()))
  const o = origin?.getBoundingClientRect()
  let rects: MarkRect[]
  if (raw.length > MAX_MARK_LINES) rects = []
  else if (raw.length && o) rects = raw.map((r) => ({ x: q(r.left - o.left), y: q(r.top - o.top), w: q(r.width), h: q(r.height) }))
  else {
    const w = host.offsetWidth, h = host.offsetHeight
    if (!(w > 0 && h > 0)) return null
    rects = [{ x: 0, y: 0, w, h }]
  }
  return { rects, ratios: fontRatios(cs) ?? GUESS_RATIOS, fs }
}

function sameMeasure(a: Measured | null, b: Measured | null): boolean {
  if (a === b) return true
  if (!a || !b || a.rects.length !== b.rects.length || a.fs !== b.fs) return false
  const ra = a.ratios, rb = b.ratios
  if (ra !== rb && (ra.asc !== rb.asc || ra.desc !== rb.desc || ra.xh !== rb.xh || ra.cap !== rb.cap || ra.pdesc !== rb.pdesc)) return false
  return a.rects.every((r, i) => r.x === b.rects[i].x && r.y === b.rects[i].y && r.w === b.rects[i].w && r.h === b.rects[i].h)
}

function boxParent(el: HTMLElement): HTMLElement {
  let p: HTMLElement = el
  for (let i = 0; i < 8; i++) {
    const cs = getComputedStyle(p)
    if (cs.display !== "inline" && cs.display !== "contents") return p
    if (!p.parentElement) return p
    p = p.parentElement
  }
  return p
}

function detectDir(el: Element): "ltr" | "rtl" | null {
  const d = el.closest("[dir]")?.getAttribute("dir") ?? el.ownerDocument.documentElement.getAttribute("dir")
  return d === "rtl" || d === "ltr" ? d : null
}

export interface MarkPhaseState {
  phase: MarkPhase
  phaseRef: React.RefCallback<HTMLElement>
  phaseProps: { "data-mark": MarkPhase; "data-animate"?: "" }
}

export function useMarkPhase(o: { animate?: boolean; show?: boolean }): MarkPhaseState {
  const show = o.show !== false
  const animate = !!o.animate
  const [inView, setInView] = React.useState(false)
  const watching = animate && show && !inView
  const phaseRef = React.useCallback(
    (el: HTMLElement | null) => {
      if (!el || !watching) return
      if (typeof IntersectionObserver === "undefined") {
        setInView(true)
        return
      }
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            setInView(true)
            io.disconnect()
          }
        },
        { rootMargin: "0px 0px -12% 0px" },
      )
      io.observe(el)
      let dwell: ReturnType<typeof setTimeout> | undefined
      const edge = new IntersectionObserver((entries) => {
        const seen = entries.some((e) => e.isIntersecting)
        if (seen && dwell === undefined) dwell = setTimeout(() => setInView(true), 1200)
        else if (!seen && dwell !== undefined) {
          clearTimeout(dwell)
          dwell = undefined
        }
      })
      edge.observe(el)
      return () => {
        io.disconnect()
        edge.disconnect()
        if (dwell !== undefined) clearTimeout(dwell)
      }
    },
    [watching],
  )
  const phase: MarkPhase = !show ? "off" : animate && !inView ? "idle" : "in"
  return { phase, phaseRef, phaseProps: animate ? { "data-mark": phase, "data-animate": "" } : { "data-mark": phase } }
}

export function useMarkInk<P extends LineParams>(o: UseMarkInkOptions<P>): UseMarkInkResult {
  const ctx = useInkContext()
  const seed = useInkSeed(o.seed)
  const show = o.show !== false
  const animate = !!o.animate
  const originEl = React.useRef<HTMLSpanElement | null>(null)
  const [measured, setMeasured] = React.useState<Measured | null>(null)
  const [hostDir, setHostDir] = React.useState<"ltr" | "rtl" | null>(null)
  const hasProvider = ctx.hasProvider

  const measureRef = React.useCallback(
    (el: HTMLElement | null) => {
      if (!el) return
      const update = () => {
        const next = measure(el, originEl.current)
        setMeasured((prev) => (sameMeasure(prev, next) ? prev : next ?? prev))
      }
      update()
      const d = detectDir(el)
      if (d) setHostDir(d)
      if (!hasProvider) ensureInkDefs()
      const stops: Array<() => void> = []
      if (typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(update)
        ro.observe(el)
        const parent = boxParent(el)
        if (parent !== el) ro.observe(parent)
        stops.push(() => ro.disconnect())
      }
      if (typeof MutationObserver !== "undefined") {
        const mo = new MutationObserver(update)
        mo.observe(el, { childList: true, characterData: true, subtree: true })
        stops.push(() => mo.disconnect())
      }
      const fonts = typeof document !== "undefined" ? document.fonts : undefined
      if (fonts) {
        fonts.addEventListener?.("loadingdone", update)
        void fonts.ready?.then(update)
        stops.push(() => fonts.removeEventListener?.("loadingdone", update))
      }
      return () => {
        for (const s of stops) s()
      }
    },
    [hasProvider],
  )

  const { phase, phaseRef, phaseProps } = useMarkPhase({ animate, show })
  const hostRef = useMergedRef<HTMLElement>(measureRef, phaseRef)
  const dir = hostDir ?? ctx.dir
  const paramsKey = JSON.stringify(o.params)

  const drawn = React.useMemo(() => {
    if (!measured || !show) return []
    const { rects, ratios, fs } = measured
    if (!rects.length) return []
    let list: MarkRect[] = rects
    if (o.mode === "box") {
      const x0 = Math.min(...rects.map((r) => r.x)), x1 = Math.max(...rects.map((r) => r.x + r.w))
      const y0 = Math.min(...rects.map((r) => r.y)), y1 = Math.max(...rects.map((r) => r.y + r.h))
      list = [{ x: q(x0), y: q(y0), w: q(x1 - x0), h: q(y1 - y0) }]
    }
    return list.map((r, i) => {
      const lm = lineMetrics(o.mode === "box" ? Math.min(r.h, Math.round((ratios.asc + ratios.desc) * fs)) : r.h, fs, ratios)
      const params = { ...(o.params as object), ...lm, first: i === 0, last: i === list.length - 1, n: list.length, animate } as unknown as P
      const frame = inkFrame(o.recipe, { box: { w: r.w, h: r.h }, params, seed: `${seed}:${i}`, tier: ctx.tier, density: ctx.density, dir, knobs: ctx.knobs })
      return { r, i, frame }
    })
  }, [measured, show, o.recipe, o.mode, paramsKey, animate, seed, ctx.tier, ctx.density, dir, ctx.knobs])

  const ready = drawn.length > 0
  const nodes = (
    <>
      <span ref={originEl} data-part="mark-origin" aria-hidden="true" className="pointer-events-none absolute size-0" style={{ left: 0, top: 0 }} />
      {drawn.map(({ r, i, frame }) => (
        <MarkSvg key={i} kind={o.kind} frame={frame} rect={r} over={!!o.over} delay={(o.delay ?? 0) + i * 380} line={i} />
      ))}
    </>
  )

  const hostProps: Record<string, string | undefined> = { ...phaseProps }
  if (ready) {
    hostProps["data-ink-host"] = ""
    hostProps["data-ink-ready"] = ""
  }
  return { hostRef, hostProps, nodes, phase, ready, seed }
}

function MarkSvg({ kind, frame, rect, over, delay, line }: { kind: string; frame: Frame; rect: MarkRect; over: boolean; delay: number; line: number }) {
  const pad = frame.pad
  return (
    <svg
      data-ink={kind}
      data-line={line}
      aria-hidden="true"
      focusable="false"
      className="pointer-events-none absolute"
      viewBox={inkViewBox(frame)}
      preserveAspectRatio="none"
      style={
        {
          position: "absolute",
          pointerEvents: "none",
          left: rect.x - pad,
          top: rect.y - pad,
          width: rect.w + 2 * pad,
          height: rect.h + 2 * pad,
          overflow: "visible",
          zIndex: over ? 1 : -1,
          "--ll-draw-delay": `${delay}ms`,
        } as React.CSSProperties
      }
    >
      {frame.layers.map((name) => (
        <g key={name} data-layer={name} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: frame.parts[name] ?? "" }} />
      ))}
    </svg>
  )
}

export function BlockSvg({ kind, frame, keep }: { kind: string; frame: Frame; keep?: boolean }) {
  const pad = frame.pad
  return (
    <svg
      data-ink={kind}
      data-ink-keep={keep ? "" : undefined}
      aria-hidden="true"
      focusable="false"
      className="pointer-events-none absolute"
      viewBox={inkViewBox(frame)}
      preserveAspectRatio="none"
      style={{ position: "absolute", pointerEvents: "none", left: -pad, top: -pad, width: `calc(100% + ${2 * pad}px)`, height: `calc(100% + ${2 * pad}px)`, overflow: "visible", zIndex: -1 }}
    >
      {frame.layers.map((name) => (
        <g key={name} data-layer={name} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: frame.parts[name] ?? "" }} />
      ))}
    </svg>
  )
}
