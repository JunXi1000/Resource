import * as React from "react"

import { BlockSvg, MARK_WIPE, useMarkPhase } from "@/hooks/use-mark-ink"
import { useInkContext, useInkCore, useMergedRef } from "@/lib/ink/react"
import type { MarkPen, MarkWeight } from "@/lib/ink/recipes/text-marks-ink"
import { tallyBox, tallyRecipe } from "@/lib/ink/recipes/tally-ink"
import { cn } from "@/lib/utils"

const SIZES = { sm: 14, md: 22, lg: 34 } as const

function Tally({
  count,
  size = "md",
  tone = "ink",
  weight = "regular",
  label,
  animate = false,
  show = true,
  delay,
  seed,
  className,
  style,
  ref,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & {
  count: number
  size?: keyof typeof SIZES | number
  tone?: MarkPen
  weight?: MarkWeight
  label?: string
  animate?: boolean
  show?: boolean
  delay?: number
  seed?: string | number
}) {
  const n = Math.max(0, Math.min(99, Math.floor(Number.isFinite(count) ? count : 0)))
  const gh = typeof size === "number" ? size : SIZES[size]
  const box = tallyBox(n, gh)
  const { dir } = useInkContext()
  const { hostRef, hostProps, frame } = useInkCore({
    recipe: tallyRecipe,
    params: { count: n, gh, tone, weight, rtl: dir === "rtl" },
    size: [Math.max(4, box.w), box.h],
    seed,
  })
  const { phaseRef, phaseProps } = useMarkPhase({ animate, show })
  return (
    <span
      data-slot="tally"
      data-count={n}
      role="img"
      aria-label={label ?? String(n)}
      ref={useMergedRef<HTMLElement>(hostRef, phaseRef, ref as React.Ref<HTMLElement> | undefined)}
      {...(show ? hostProps : {})}
      {...phaseProps}
      style={{ width: box.w, height: box.h, ...(animate ? ({ "--ll-draw-delay": `${delay ?? 0}ms` } as React.CSSProperties) : undefined), ...style }}
      className={cn("relative isolate inline-block shrink-0 align-middle outline-none", animate && MARK_WIPE, className)}
      {...props}
    >
      {show && frame ? <BlockSvg kind="tally" frame={frame} keep /> : null}
    </span>
  )
}

export { Tally }
