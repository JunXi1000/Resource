"use client"

import * as React from "react"

import { Paper, type PaperProps } from "@/components/ui/paper"
import { useInk, useMergedRef } from "@/lib/ink/react"
import { polaroidPhotoRecipe, type PolaroidScene } from "@/lib/ink/recipes/polaroid-ink"
import { cn } from "@/lib/utils"

type PolaroidProps = Omit<PaperProps, "stock" | "rules" | "as"> & {
  as?: "figure" | "div" | "article"
}

function Polaroid({ className, as = "figure", ...props }: PolaroidProps) {
  return <Paper data-slot="polaroid" as={as} stock="photo" rules="none" className={cn("flex w-64 flex-col gap-2.5 px-3.5 pt-3.5 pb-3 text-ink", className)} {...props} />
}

type PolaroidImageProps = React.ComponentProps<"div"> & {
  scene?: PolaroidScene
  date?: string
  develop?: boolean
  label?: string
  seed?: string | number
}

function PolaroidImage({ className, children, scene, date, develop, label, seed, ref, ...props }: PolaroidImageProps) {
  const { hostRef, hostProps, node } = useInk({ recipe: polaroidPhotoRecipe, params: { scene: scene ?? "hills" }, kind: "photo", seed, still: true })
  const merged = useMergedRef<HTMLDivElement>(scene ? hostRef : undefined, ref)
  return (
    <div
      data-slot="polaroid-image"
      ref={merged}
      {...(scene && node ? hostProps : {})}
      role={scene && label ? "img" : undefined}
      aria-label={scene && label ? label : undefined}
      className={cn(
        "relative isolate aspect-square w-full overflow-hidden bg-paper-shade/60 [&_img]:size-full [&_img]:object-cover",
        "after:pointer-events-none after:absolute after:inset-0 after:z-(--ll-z-ink) after:shadow-[inset_0_2px_4px_rgb(var(--ll-shade)/0.26),inset_0_0_0_1px_rgb(var(--ll-shade)/0.12)]",
        className,
      )}
      {...props}
    >
      {scene ? node : null}
      {children}
      {date ? (
        <span aria-hidden="true" className="pointer-events-none absolute end-2.5 bottom-2 z-(--ll-z-ink) font-mono text-[11px] tracking-wider text-tangerine [text-shadow:0_0_2px_rgb(var(--ll-shade)/0.7),0_0_6px_rgb(var(--ll-shade)/0.45)] calm:[text-shadow:none]">
          {date}
        </span>
      ) : null}
      {develop ? (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-(--ll-z-ink) animate-out bg-photo fade-out-0 fill-mode-forwards delay-500 duration-(--ll-dur-soak)" />
      ) : null}
    </div>
  )
}

function PolaroidCaption({ className, ...props }: React.ComponentProps<"figcaption">) {
  return <figcaption data-slot="polaroid-caption" className={cn("flex min-h-12 items-center justify-center px-1 text-center break-words font-script text-[1.65rem] leading-[1.05] font-semibold text-balance", className)} {...props} />
}

export { Polaroid, PolaroidImage, PolaroidCaption }
export type { PolaroidProps, PolaroidImageProps }
