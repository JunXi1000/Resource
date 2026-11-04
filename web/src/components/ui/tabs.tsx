"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Tabs as TabsPrimitive } from "radix-ui"

import { useInk, useMergedRef } from "@/lib/ink/react"
import { tabsRecipe } from "@/lib/ink/recipes/tabs-ink"
import { cn } from "@/lib/utils"

const TabsContext = React.createContext<{ orientation: "horizontal" | "vertical"; variant: "default" | "line" }>({ orientation: "horizontal", variant: "default" })

const WIPE_WHEN_ACTIVE = "data-[state=active]:[&>svg_[data-part=swipe]]:animate-[ll-wipe_var(--ll-dur-sheet)_var(--ll-ease-out)_both]"

function Tabs({ className, orientation = "horizontal", ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  const ctx = React.useContext(TabsContext)
  const value = React.useMemo(() => ({ ...ctx, orientation }), [ctx, orientation])
  return (
    <TabsContext.Provider value={value}>
      <TabsPrimitive.Root
        data-slot="tabs"
        data-orientation={orientation}
        orientation={orientation}
        className={cn("group/tabs flex gap-3 data-[orientation=horizontal]:flex-col", className)}
        {...props}
      />
    </TabsContext.Provider>
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-end justify-center text-muted-foreground aria-[orientation=horizontal]:h-10 aria-[orientation=vertical]:h-fit aria-[orientation=vertical]:flex-col aria-[orientation=vertical]:items-stretch",
  {
    variants: {
      variant: {
        default: "gap-1",
        line: "gap-1",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({ className, variant = "default", ...props }: React.ComponentProps<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>) {
  const ctx = React.useContext(TabsContext)
  const value = React.useMemo(() => ({ ...ctx, variant: variant ?? "default" }), [ctx, variant])
  return (
    <TabsContext.Provider value={value}>
      <TabsPrimitive.List data-slot="tabs-list" data-variant={variant} className={cn(tabsListVariants({ variant }), className)} {...props} />
    </TabsContext.Provider>
  )
}

function TabsTrigger({
  className,
  seed,
  disabled,
  ref,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger> & {
  seed?: string | number
}) {
  const { orientation, variant } = React.useContext(TabsContext)
  const { hostRef, hostProps, node } = useInk({ recipe: tabsRecipe, params: { variant, orientation, disabled: !!disabled }, kind: "tab", seed, still: true })
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      data-orientation={orientation}
      ref={useMergedRef<HTMLButtonElement>(hostRef, ref)}
      {...hostProps}
      disabled={disabled}
      className={cn(
        "relative isolate inline-flex h-9 flex-1 items-center justify-center gap-1.5 px-4 font-hand text-[15px] font-bold whitespace-nowrap text-muted-foreground transition-[translate,color] duration-(--ll-dur-hover) ease-settle hover:text-foreground data-[state=active]:text-foreground disabled:pointer-events-none disabled:text-pencil-text compact:h-8 calm:h-7 calm:text-sm",
        "data-[orientation=horizontal]:pt-1 data-[orientation=vertical]:pt-0.5 data-[orientation=vertical]:w-full data-[orientation=vertical]:justify-start",
        variant === "default" && "data-[orientation=horizontal]:data-[state=active]:-translate-y-0.5 data-[orientation=vertical]:data-[state=active]:translate-x-0.5 data-[orientation=vertical]:rtl:data-[state=active]:-translate-x-0.5",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not(.absolute):not([class*='size-'])]:size-4",
        WIPE_WHEN_ACTIVE,
        className
      )}
      {...props}
    >
      {node}
      {children}
    </TabsPrimitive.Trigger>
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-(--ll-dur-fade)", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
