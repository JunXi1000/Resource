"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { useEnsureInkDefs } from "@/lib/ink/react"
import { stickers, type StickerName } from "@/lib/ink/art/stickers"
import { memo, renderSticker } from "@/lib/ink/art-draw"
import { hashSeed } from "@/lib/ink/rng"
import type { StickerDef } from "@/lib/ink/art/types"

const autoTilt = (seed: string): number => ((hashSeed(seed) % 640) - 320) / 100

function Sticker({
  name,
  size = 96,
  peel = false,
  rotate = "auto",
  border,
  shadow = true,
  seed,
  label,
  className,
  style,
  ...props
}: Omit<React.ComponentProps<"svg">, "name" | "children" | "viewBox"> & {
  name: StickerName | (string & {})
  size?: number
  peel?: boolean | number
  rotate?: number | "auto"
  border?: number
  shadow?: boolean
  seed?: string | number
  label?: string
}) {
  useEnsureInkDefs()
  const def = (stickers as Record<string, StickerDef>)[name]
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "")
  if (!def) return null
  const px = Math.max(32, Math.round(size))
  const s = `${seed ?? name}`
  const res = memo(`sticker|${name}|${px}|${peel}|${border ?? ""}|${s}|${uid}`, () => renderSticker(def, px, s, { peel: peel === false ? undefined : peel, border, idPrefix: `ll-${uid}` }), 120)
  const tilt = rotate === "auto" ? autoTilt(s) : rotate
  return (
    <svg
      data-slot="sticker"
      data-ink="sticker"
      data-sticker={name}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      focusable="false"
      viewBox={`0 0 ${res.w} ${res.h}`}
      width={res.w}
      height={res.h}
      style={rotate === "auto" ? ({ "--ll-tilt": `${tilt}deg`, ...style } as React.CSSProperties) : tilt ? { rotate: `${tilt}deg`, ...style } : style}
      className={cn("pointer-events-none shrink-0 overflow-visible", shadow && "ll-drop-sticker", rotate === "auto" && "ll-tilt-layer", className)}
      dangerouslySetInnerHTML={{ __html: res.svg }}
      {...props}
    />
  )
}

export { Sticker }
export type { StickerName }
