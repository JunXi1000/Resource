"use client"

import * as React from "react"

import { useInkSeed } from "@/lib/ink/react"
import { hashSeed } from "@/lib/ink/rng"
import { SKELETON_FRAMES, skeletonCss } from "@/lib/ink/recipes/skeleton-ink"
import { cn } from "@/lib/utils"

function Skeleton({ className, style, seed, ...props }: React.ComponentProps<"div"> & { seed?: string | number }) {
  const id = useInkSeed(seed)
  const phase = hashSeed(id) % SKELETON_FRAMES
  return (
    <>
      <style href="ll-skeleton" precedence="low">
        {skeletonCss()}
      </style>
      <div data-slot="skeleton" style={{ "--ll-sk-phase": phase, ...style } as React.CSSProperties} className={cn("block", className)} {...props} />
    </>
  )
}

export { Skeleton }
