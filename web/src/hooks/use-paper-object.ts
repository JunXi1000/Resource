import * as React from "react"

import { useInkFaces } from "@/lib/ink/paper/sheet-layers"
import { tiltFor } from "@/lib/ink/paper/shadows"
import { useInk, useInkSeed, useMergedRef } from "@/lib/ink/react"
import type { Recipe } from "@/lib/ink/recipes"

const DECOR_TILT = "[&>svg[data-ink]:not([data-ink=sheet],[data-ink=tape],[data-ink=sticker],[data-ink=prop])]:[rotate:clamp(calc(var(--ll-tilt-max)*-1),var(--ll-tilt-decor,0deg),var(--ll-tilt-max))]"

interface PaperObjectOptions<P> {
  recipe: Recipe<P>
  params: P
  kind: string
  ref?: React.Ref<HTMLElement>
  seed?: string | number
  tilt?: boolean | number
  tiltMax?: number
  size?: readonly [number, number]
  enabled?: boolean
}

export function usePaperDecor<P>({ recipe, params, kind, ref, seed: seedProp, tilt, tiltMax = 0.6, size, enabled = true }: PaperObjectOptions<P>) {
  const seed = useInkSeed(seedProp)
  const deg = tilt === false ? 0 : typeof tilt === "number" ? tilt : tiltFor(seed, tiltMax)
  const ink = useInk({ recipe, params, kind, seed: `${seed}|decor`, size: enabled ? size : undefined, still: true })
  const merged = useMergedRef<HTMLElement>(enabled ? ink.hostRef : undefined, ref)
  const decor = enabled ? ink.node : null
  return {
    seed,
    tilt: deg,
    decor,
    paper: {
      seed,
      tilt: deg,
      ref: merged,
      className: DECOR_TILT,
      style: { "--ll-tilt-decor": `${deg}deg` } as React.CSSProperties,
      ...(decor ? ink.hostProps : {}),
    },
  }
}

export function useShapedSheet<P>({ recipe, params, ref, seed: seedProp, tilt, tiltMax = 0.8, size, kind = "sheet", still = true }: Omit<PaperObjectOptions<P>, "enabled" | "kind"> & { kind?: string; still?: boolean }) {
  const seed = useInkSeed(seedProp)
  const deg = tilt === false ? 0 : typeof tilt === "number" ? tilt : tiltFor(seed, tiltMax)
  const ink = useInkFaces({ recipe, params, kind, seed, size, still: still ? true : undefined })
  const merged = useMergedRef<HTMLElement>(ink.hostRef, ref)
  return {
    seed,
    tilt: deg,
    node: ink.node,
    ready: ink.node !== null,
    root: {
      ref: merged,
      style: { "--ll-tilt": `${deg}deg` } as React.CSSProperties,
      ...(ink.node ? ink.hostProps : {}),
    },
  }
}
