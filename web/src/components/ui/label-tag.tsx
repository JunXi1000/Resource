"use client"

import * as React from "react"
import { Slot } from "radix-ui"

import { useShapedSheet } from "@/hooks/use-paper-object"
import type { Accent } from "@/lib/ink/paper/props"
import type { StockName } from "@/lib/ink/paper/stocks"
import { labelTagRecipe, TAG, type TagShape } from "@/lib/ink/recipes/label-tag-ink"
import { cn } from "@/lib/utils"

type LabelTagProps = React.ComponentProps<"div"> & {
  asChild?: boolean
  stock?: StockName
  shape?: TagShape
  string?: number
  twine?: "natural" | Accent
  eyelet?: "brass" | "steel" | "none"
  tilt?: boolean | number
  seed?: string | number
  size?: readonly [number, number]
}

function LabelTag({ className, style, children, ref, asChild, stock = "kraft", shape = "price", string = 36, twine = "natural", eyelet = "brass", tilt, seed, size, ...props }: LabelTagProps) {
  const o = useShapedSheet({ recipe: labelTagRecipe, params: { stock, shape, string, twine, eyelet }, ref, seed, tilt, tiltMax: 2, size, still: !asChild })
  const Comp = asChild ? Slot.Root : "div"
  const horizontal = shape === "luggage"
  const pad = string + 14
  const pivot = horizontal ? `${pad + TAG.eyelet + 2}px 50%` : `50% ${pad + (shape === "round" ? TAG.eyelet + 2 : TAG.eyelet)}px`
  const pivotRtl = horizontal ? `calc(100% - ${pad + TAG.eyelet + 2}px) 50%` : pivot
  return (
    <Comp
      data-slot="label-tag"
      data-shape={shape}
      {...o.root}
      {...props}
      className={cn(
        "relative isolate break-words text-ink [&>:is(svg,[data-slot=paper-face])]:[transform-origin:var(--tag-origin)] rtl:[&>:is(svg,[data-slot=paper-face])]:[transform-origin:var(--tag-origin-rtl)]",
        horizontal ? "ms-(--tag-string) flex h-24 min-w-44 items-center gap-2 py-3 ps-11 pe-5" : "mt-(--tag-string) flex w-32 min-h-40 flex-col gap-1 px-3 pt-11 pb-4",
        shape === "round" && "pt-12",
        !o.ready && "bg-index-card shadow-card",
        asChild && "cursor-pointer hover:[&>:is(svg,[data-slot=paper-face])]:[rotate:var(--ll-hover-tilt)]",
        className,
      )}
      style={{ ...o.root.style, "--tag-string": `${string}px`, "--tag-origin": pivot, "--tag-origin-rtl": pivotRtl,...(asChild ? { "--ll-hover-tilt": "-2.6deg" } : null), ...style } as React.CSSProperties}
    >
      <Slot.Slottable>{children}</Slot.Slottable>
      {o.node}
    </Comp>
  )
}

function LabelTagTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="label-tag-title" className={cn("font-script text-[1.65rem] leading-none font-bold", className)} {...props} />
}

function LabelTagDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="label-tag-description" className={cn("text-sm leading-tight text-ink-soft", className)} {...props} />
}

function LabelTagPrice({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="label-tag-price" className={cn("ll-num mt-auto font-type text-xl leading-none text-[color-mix(in_srgb,var(--ll-red)_60%,var(--ll-ink))]", className)} {...props} />
}

export { LabelTag, LabelTagTitle, LabelTagDescription, LabelTagPrice }
export type { LabelTagProps }
