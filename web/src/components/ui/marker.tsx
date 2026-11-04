import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { useInk } from "@/lib/ink/react"
import { markerRuleRecipe, type MarkerSide, type MarkerTone } from "@/lib/ink/recipes/marker-ink"
import { cn } from "@/lib/utils"

const markerVariants = cva(
  "group/marker relative flex min-h-4 w-full items-center gap-2 text-start font-hand text-sm text-muted-foreground [&_svg:not([class*='size-']):not(.absolute)]:size-4 [a]:underline [a]:underline-offset-3 [a]:hover:text-foreground",
  {
    variants: {
      variant: {
        default: "",
        separator: "",
        border: "pb-3",
      },
    },
  }
)

function MarkerRule({ side, tone, seed, wavy }: { side: MarkerSide; tone: MarkerTone; seed?: string | number; wavy?: boolean }) {
  const { hostRef, hostProps, node } = useInk({
    recipe: markerRuleRecipe,
    params: { side, tone, style: wavy ? "wavy" : "line" },
    kind: "rule",
    seed: seed === undefined ? undefined : `${seed}|${side}`,
    still: true,
  })
  return (
    <span
      data-slot="marker-rule"
      data-side={side}
      ref={hostRef}
      {...hostProps}
      className={cn(
        "relative isolate block h-4 min-w-0 forced-colors:h-2 forced-colors:border-b-2 forced-colors:border-[CanvasText] forced-colors:outline-none!",
        side === "full" ? "absolute inset-x-0 bottom-0" : "flex-1"
      )}
    >
      {node}
    </span>
  )
}

function Marker({
  className,
  variant = "default",
  tone = "default",
  rule = "line",
  seed,
  asChild = false,
  children,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof markerVariants> & {
    asChild?: boolean
    tone?: "default" | "new"
    rule?: "line" | "wavy"
    seed?: string | number
  }) {
  const Comp = asChild ? Slot.Root : "div"
  const t: MarkerTone = tone ?? "default"
  const v = variant ?? "default"
  const inner = asChild ? <Slot.Slottable>{children}</Slot.Slottable> : children
  return (
    <Comp
      data-slot="marker"
      data-variant={v}
      data-tone={t === "new" ? "new" : undefined}
      className={cn(markerVariants({ variant: v }), className)}
      {...props}
    >
      {v === "separator" ? <MarkerRule side="start" tone={t} seed={seed} /> : null}
      {inner}
      {v === "separator" ? <MarkerRule side="end" tone={t} seed={seed} /> : null}
      {v === "border" ? <MarkerRule side="full" tone={t} seed={seed} wavy={rule === "wavy"} /> : null}
    </Comp>
  )
}

function MarkerIcon({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="marker-icon"
      aria-hidden="true"
      className={cn("size-4 shrink-0 group-data-[tone=new]/marker:text-red [&_svg:not([class*='size-']):not(.absolute)]:size-4", className)}
      {...props}
    />
  )
}

function MarkerContent({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="marker-content"
      className={cn(
        "min-w-0 wrap-break-word group-data-[variant=separator]/marker:flex-none group-data-[variant=separator]/marker:text-center group-data-[variant=separator]/marker:font-script group-data-[variant=separator]/marker:text-xl group-data-[variant=separator]/marker:leading-none group-data-[tone=new]/marker:ll-swipe group-data-[tone=new]/marker:px-2 group-data-[tone=new]/marker:font-bold *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Marker, MarkerIcon, MarkerContent, markerVariants }
