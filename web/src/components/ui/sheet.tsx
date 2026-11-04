import * as React from "react"
import { Dialog as SheetPrimitive } from "radix-ui"

import { Paper, type PaperProps } from "@/components/ui/paper"
import { useInk, useInkScope, useInkSeed } from "@/lib/ink/react"
import { closeMarkRecipe } from "@/lib/ink/recipes/overlay-ink"
import { sheetBindingRecipe, type BindingEdge, type BindingKind } from "@/lib/ink/recipes/sheet-ink"
import { cn } from "@/lib/utils"

type Side = "top" | "right" | "bottom" | "left"
type Binding = "spiral" | "holes" | "perf" | "torn" | "none"

const INNER: Record<Side, BindingEdge> = { right: "left", left: "right", top: "bottom", bottom: "top" }

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  const scope = useInkScope()
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      {...scope}
      className={cn(
        "fixed inset-0 z-(--ll-z-overlay) [background:var(--ll-overlay-dim)] duration-(--ll-dur-sheet) data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

function SheetBinding({ edge, kind, seed }: { edge: BindingEdge; kind: BindingKind; seed: string }) {
  const { hostRef, hostProps, node } = useInk({ recipe: sheetBindingRecipe, params: { edge, kind }, kind: "binding", seed })
  return (
    <span
      data-slot="sheet-binding"
      aria-hidden="true"
      ref={hostRef}
      {...hostProps}
      className={cn(
        "pointer-events-none absolute isolate z-(--ll-z-ink) calm:hidden",
        edge === "left" && "inset-y-0 left-0 w-7",
        edge === "right" && "inset-y-0 right-0 w-7",
        edge === "top" && "inset-x-0 top-0 h-7",
        edge === "bottom" && "inset-x-0 bottom-0 h-7"
      )}
    >
      {node}
    </span>
  )
}

function SheetCloseMark({ className, seed }: { className?: string; seed?: string }) {
  const { hostRef, hostProps, node } = useInk({ recipe: closeMarkRecipe, params: {}, kind: "close", size: [32, 32], seed })
  return (
    <SheetPrimitive.Close
      data-slot="sheet-close"
      data-part="x"
      ref={hostRef}
      {...hostProps}
      className={cn("absolute z-(--ll-z-raised) grid size-8 place-items-center text-ink", className)}
    >
      {node}
      <span aria-hidden="true" className="hidden font-hand text-xl leading-none forced-colors:block">
        ×
      </span>
      <span className="sr-only">Close</span>
    </SheetPrimitive.Close>
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  binding = "spiral",
  stock = "paper",
  rules,
  seed: seedProp,
  onInteractOutside,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> &
  Pick<PaperProps, "stock" | "rules" | "seed"> & {
    side?: Side
    showCloseButton?: boolean
    binding?: Binding
  }) {
  const scope = useInkScope()
  const seed = useInkSeed(seedProp)
  const edge = INNER[side]
  const bound = binding === "spiral" || binding === "holes"
  const paperEdge = binding === "perf" || binding === "torn" ? { [edge]: binding } : undefined
  const xClass = bound && edge === "right" ? "end-9 top-3" : bound && edge === "top" ? "end-3 top-9" : bound && edge === "left" ? "end-3 top-3 rtl:end-9" : "end-3 top-3"
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        asChild
        {...props}
        onInteractOutside={(e) => {
          onInteractOutside?.(e)
          if ((e.target as Element | null)?.closest?.("[data-sonner-toaster]")) e.preventDefault()
        }}
      >
        <Paper
          data-slot="sheet-content"
          data-side={side}
          data-binding={binding}
          stock={stock}
          edge={paperEdge}
          tilt={false}
          rules={rules ?? "none"}
          seed={seed}
          {...scope}
          className={cn(
            "group/sheet fixed z-(--ll-z-overlay) flex flex-col gap-4 text-foreground outline-hidden",
            "data-[side=right]:[--ll-sheet-shadow:-7px_0_18px_-6px_rgb(var(--ll-shade)/calc(0.34*var(--ll-shadow-k))),-1px_0_1.5px_rgb(var(--ll-shade)/calc(0.24*var(--ll-shadow-k)))]",
            "data-[side=left]:[--ll-sheet-shadow:7px_0_18px_-6px_rgb(var(--ll-shade)/calc(0.34*var(--ll-shadow-k))),1px_0_1.5px_rgb(var(--ll-shade)/calc(0.24*var(--ll-shadow-k)))]",
            "data-[side=top]:[--ll-sheet-shadow:0_7px_18px_-6px_rgb(var(--ll-shade)/calc(0.34*var(--ll-shadow-k))),0_1px_1.5px_rgb(var(--ll-shade)/calc(0.24*var(--ll-shadow-k)))]",
            "data-[side=bottom]:[--ll-sheet-shadow:0_-7px_18px_-6px_rgb(var(--ll-shade)/calc(0.34*var(--ll-shadow-k))),0_-1px_1.5px_rgb(var(--ll-shade)/calc(0.24*var(--ll-shadow-k)))]",
            "duration-(--ll-dur-sheet) ease-out data-[state=closed]:animate-out data-[state=open]:animate-in",
            side === "right" && "inset-y-0 right-0 h-full w-3/4 pb-[env(safe-area-inset-bottom)] data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
            side === "left" && "inset-y-0 left-0 h-full w-3/4 pb-[env(safe-area-inset-bottom)] data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
            side === "top" && "inset-x-0 top-0 h-auto max-h-[85dvh] data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
            side === "bottom" && "inset-x-0 bottom-0 h-auto max-h-[85dvh] pb-[env(safe-area-inset-bottom)] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
            bound && edge === "left" && "pl-6",
            bound && edge === "right" && "pr-6",
            bound && edge === "top" && "pt-6",
            bound && edge === "bottom" && "pb-6",
            className
          )}
        >
          {bound && <SheetBinding edge={edge} kind={binding} seed={`${seed}|bind`} />}
          {children}
          {showCloseButton && <SheetCloseMark className={xClass} seed={`${seed}|x`} />}
        </Paper>
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-header" className={cn("flex flex-col gap-1.5 p-4 group-has-[[data-part=x]]/sheet:pe-12", className)} {...props} />
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-footer" className={cn("mt-auto flex flex-col gap-2 p-4", className)} {...props} />
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title data-slot="sheet-title" className={cn("font-script text-[1.7rem] leading-none font-semibold text-foreground", className)} {...props} />
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return <SheetPrimitive.Description data-slot="sheet-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
}

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription }
