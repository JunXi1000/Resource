"use client"

import * as React from "react"
import { Slot } from "radix-ui"

import { MARK_WIPE, useMarkInk } from "@/hooks/use-mark-ink"
import { useMergedRef } from "@/lib/ink/react"
import { highlightRecipe } from "@/lib/ink/recipes/highlight-ink"
import type { HighlightTone } from "@/lib/ink/recipes/text-marks-ink"
import { cn } from "@/lib/utils"

const FAT = { light: 0.82, regular: 1, heavy: 1.22 } as const

function Highlight({
  tone = "yellow",
  weight = "regular",
  cover = "full",
  animate = false,
  show = true,
  delay,
  seed,
  asChild = false,
  className,
  children,
  ref,
  ...props
}: React.ComponentProps<"mark"> & {
  tone?: HighlightTone
  weight?: keyof typeof FAT
  cover?: "full" | "under"
  animate?: boolean
  show?: boolean
  delay?: number
  seed?: string | number
  asChild?: boolean
}) {
  const { hostRef, hostProps, nodes } = useMarkInk({
    recipe: highlightRecipe,
    params: { tone, fat: FAT[weight], cover },
    kind: "highlight",
    seed,
    animate,
    show,
    delay,
  })
  const Comp = asChild ? Slot.Root : "mark"
  return (
    <Comp
      data-slot="highlight"
      data-tone={tone}
      data-cover={cover}
      ref={useMergedRef<HTMLElement>(hostRef, ref as React.Ref<HTMLElement> | undefined)}
      {...hostProps}
      className={cn(
        "relative isolate text-inherit data-[ink-ready]:bg-transparent data-[mark=off]:bg-transparent not-focus-visible:outline-none forced-colors:not-focus-visible:outline-none!",
        animate && "bg-transparent noscript:bg-hi-select",
        animate && MARK_WIPE,
        className,
      )}
      {...props}
    >
      <Slot.Slottable>{children}</Slot.Slottable>
      {nodes}
    </Comp>
  )
}

export { Highlight }
