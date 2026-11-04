import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { Fastener, Paper, type PaperProps } from "@/components/ui/paper"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useIsMobile } from "@/hooks/use-mobile"
import { InkTiles, useInk, useInkSeed, useMergedRef } from "@/lib/ink/react"
import { sidebarMarkRecipe, sidebarRuleRecipe } from "@/lib/ink/recipes/sidebar-ink"
import { hashSeed } from "@/lib/ink/rng"
import { cn } from "@/lib/utils"

const SIDEBAR_COOKIE_NAME = "sidebar_state"
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
const SIDEBAR_WIDTH = "16rem"
const SIDEBAR_WIDTH_MOBILE = "18rem"
const SIDEBAR_WIDTH_ICON = "3rem"
const SIDEBAR_KEYBOARD_SHORTCUT = "b"
const INSET_TILES = ["fibre", "relief", "cloud"] as const

type SidebarContextProps = {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
}

const SidebarContext = React.createContext<SidebarContextProps | null>(null)

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.")
  }

  return context
}

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const isMobile = useIsMobile()
  const [openMobile, setOpenMobile] = React.useState(false)

  const [_open, _setOpen] = React.useState(defaultOpen)
  const open = openProp ?? _open
  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === "function" ? value(open) : value
      if (setOpenProp) {
        setOpenProp(openState)
      } else {
        _setOpen(openState)
      }

      document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
    },
    [setOpenProp, open]
  )

  const toggleSidebar = React.useCallback(() => {
    return isMobile ? setOpenMobile((open) => !open) : setOpen((open) => !open)
  }, [isMobile, setOpen, setOpenMobile])

  React.useEffect(() => {
    if (!isMobile) setOpenMobile(false)
  }, [isMobile])

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey) && !event.defaultPrevented) {
        event.preventDefault()
        toggleSidebar()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [toggleSidebar])

  const state = open ? "expanded" : "collapsed"

  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
    }),
    [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar]
  )

  return (
    <SidebarContext.Provider value={contextValue}>
      <TooltipProvider delayDuration={0}>
        <div
          data-slot="sidebar-wrapper"
          style={
            {
              "--sidebar-width": SIDEBAR_WIDTH,
              "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
              ...style,
            } as React.CSSProperties
          }
          className={cn("group/sidebar-wrapper flex min-h-svh w-full", className)}
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  )
}

const DOCKED_SHADOW =
  "group-data-[variant=sidebar]:group-data-[side=left]:[--ll-sheet-shadow:7px_0_18px_-6px_rgb(var(--ll-shade)/calc(0.34*var(--ll-shadow-k))),1px_0_1.5px_rgb(var(--ll-shade)/calc(0.24*var(--ll-shadow-k)))] " +
  "group-data-[variant=sidebar]:group-data-[side=right]:[--ll-sheet-shadow:-7px_0_18px_-6px_rgb(var(--ll-shade)/calc(0.34*var(--ll-shadow-k))),-1px_0_1.5px_rgb(var(--ll-shade)/calc(0.24*var(--ll-shadow-k)))]"

function SidebarClip({ seed, inside = false, className }: { seed: string; inside?: boolean; className?: string }) {
  return (
    <Fastener
      data-slot="sidebar-clip"
      kind="binder-clip"
      size={38}
      seed={`${seed}|clip`}
      className={cn("absolute start-1/2 -ms-[19px] z-(--ll-z-prop) calm:hidden group-data-[collapsible=icon]:hidden forced-colors:hidden", inside ? "top-1" : "-top-3.5", className)}
    />
  )
}

const INSIDE_CLIP_PAD = "pt-11"

type SidebarProps = React.ComponentProps<"div"> & {
  side?: "left" | "right"
  variant?: "sidebar" | "floating" | "inset"
  collapsible?: "offcanvas" | "icon" | "none"
  stock?: PaperProps["stock"]
  clip?: boolean
  seed?: string | number
}

function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  stock = "pad",
  clip: clipProp,
  seed: seedProp,
  className,
  children,
  ...props
}: SidebarProps) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar()
  const clip = clipProp ?? collapsible !== "none"
  const seed = useInkSeed(seedProp)
  const opener = React.useRef<HTMLElement | null>(null)

  if (collapsible === "none") {
    return (
      <Paper
        data-slot="sidebar"
        stock={stock}
        tilt={false}
        rules="none"
        seed={seed}
        className={cn("group flex h-full w-(--sidebar-width) flex-col text-sidebar-foreground", clip && INSIDE_CLIP_PAD, className)}
        {...(props as React.ComponentProps<"div">)}
      >
        {clip && <SidebarClip seed={seed} inside />}
        {children}
      </Paper>
    )
  }

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
        <SheetContent
          data-sidebar="sidebar"
          data-slot="sidebar"
          data-mobile="true"
          side={side}
          stock={stock}
          binding="none"
          rules="none"
          seed={seed}
          showCloseButton={false}
          onOpenAutoFocus={() => {
            opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            opener.current?.focus()
          }}
          className={cn("group w-(--sidebar-width) p-0 text-sidebar-foreground [&>button]:hidden", clip ? INSIDE_CLIP_PAD : "pt-2")}
          style={
            {
              "--sidebar-width": SIDEBAR_WIDTH_MOBILE,
              "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
            } as React.CSSProperties
          }
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Sidebar</SheetTitle>
            <SheetDescription>Displays the mobile sidebar.</SheetDescription>
          </SheetHeader>
          {clip && <SidebarClip seed={seed} inside />}
          <div className="flex h-full w-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <div
      className="group peer hidden text-sidebar-foreground md:block"
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-variant={variant}
      data-side={side}
      data-slot="sidebar"
    >
      {variant === "inset" && <InkTiles tiles={INSET_TILES} />}
      <div
        data-slot="sidebar-gap"
        className={cn(
          "relative w-(--sidebar-width) bg-transparent transition-[width] duration-(--ll-dur-sheet) ease-out",
          "group-data-[collapsible=offcanvas]:w-0",
          "group-data-[side=right]:rotate-180",
          variant === "floating" || variant === "inset"
            ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon)"
        )}
      />
      <div
        data-slot="sidebar-container"
        className={cn(
          "fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) pt-4 transition-[left,right,width] duration-(--ll-dur-sheet) ease-out md:flex",
          side === "left"
            ? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]"
            : "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]",
          variant === "floating" || variant === "inset"
            ? "p-2 pt-4 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon)",
          className
        )}
        {...props}
      >
        <Paper
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          stock={stock}
          tilt={variant === "floating"}
          rules="none"
          seed={seed}
          className={cn("flex h-full w-full flex-col", clip && "pt-6", DOCKED_SHADOW)}
        >
          {clip && <SidebarClip seed={seed} />}
          {children}
        </Paper>
      </div>
    </div>
  )
}

function SidebarTrigger({ className, onClick, ...props }: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar()

  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon"
      className={cn("size-7", className)}
      onClick={(event) => {
        onClick?.(event)
        toggleSidebar()
      }}
      {...props}
    >
      <Icon name="panel-left" />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  )
}

function SidebarRail({ className, ...props }: React.ComponentProps<"button">) {
  const { toggleSidebar } = useSidebar()

  return (
    <button
      data-sidebar="rail"
      data-slot="sidebar-rail"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onClick={toggleSidebar}
      title="Toggle Sidebar"
      className={cn(
        "absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] hover:after:bg-pencil-mark sm:flex",
        "in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize",
        "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
        "group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full",
        "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
        "[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
        className
      )}
      {...props}
    />
  )
}

function SidebarInset({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn(
        "relative flex w-full flex-1 flex-col ll-paper ll-stock-paper ll-tooth-cold before:hidden md:peer-data-[variant=inset]:before:block",
        "md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ms-0 md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ms-2",
        className
      )}
      {...props}
    />
  )
}

function SidebarInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  return <Input data-slot="sidebar-input" data-sidebar="input" className={cn("h-8 w-full", className)} {...props} />
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-header" data-sidebar="header" className={cn("flex flex-col gap-2 p-2", className)} {...props} />
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-footer" data-sidebar="footer" className={cn("flex flex-col gap-2 p-2", className)} {...props} />
}

function SidebarSeparator({ className, ...props }: React.ComponentProps<typeof Separator>) {
  return <Separator data-slot="sidebar-separator" data-sidebar="separator" className={cn("mx-2 data-[orientation=horizontal]:w-auto", className)} {...props} />
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn("flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden", className)}
      {...props}
    />
  )
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-group" data-sidebar="group" className={cn("relative flex w-full min-w-0 flex-col p-2", className)} {...props} />
}

function SidebarGroupLabel({ className, asChild = false, ...props }: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "div"

  return (
    <Comp
      data-slot="sidebar-group-label"
      data-sidebar="group-label"
      className={cn(
        "flex h-8 shrink-0 items-center px-2 font-type text-sm tracking-wide text-ink-muted transition-[margin,opacity] duration-(--ll-dur-sheet) ease-out [&>svg:not(.absolute)]:size-4 [&>svg:not(.absolute)]:shrink-0",
        "group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0",
        className
      )}
      {...props}
    />
  )
}

function SidebarGroupAction({ className, asChild = false, ...props }: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="sidebar-group-action"
      data-sidebar="group-action"
      className={cn(
        "absolute end-3 top-3 flex aspect-square w-6 items-center justify-center p-0 text-sidebar-foreground transition-transform hover:ll-swipe [&>svg:not(.absolute)]:size-4 [&>svg:not(.absolute)]:shrink-0",
        "after:absolute after:-inset-2 md:after:hidden",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
}

function SidebarGroupContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-group-content" data-sidebar="group-content" className={cn("w-full text-sm", className)} {...props} />
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul data-slot="sidebar-menu" data-sidebar="menu" className={cn("flex w-full min-w-0 flex-col gap-1", className)} {...props} />
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li data-slot="sidebar-menu-item" data-sidebar="menu-item" className={cn("group/menu-item relative", className)} {...props} />
}

const sidebarMenuButtonVariants = cva(
  "peer/menu-button relative isolate flex w-full items-center gap-2 p-2 text-start font-hand text-base transition-[width,height,padding] after:pointer-events-none after:absolute after:inset-x-1 after:-bottom-0.5 after:h-px after:bg-(--ll-pad-rule) group-odd/menu-item:after:[mask-image:linear-gradient(90deg,var(--ll-ink),color-mix(in_srgb,var(--ll-ink)_78%,transparent)_45%,var(--ll-ink))] group-even/menu-item:after:[mask-image:linear-gradient(90deg,color-mix(in_srgb,var(--ll-ink)_82%,transparent),var(--ll-ink)_55%,color-mix(in_srgb,var(--ll-ink)_86%,transparent))] group-data-[collapsible=icon]:after:hidden calm:after:hidden group-has-data-[sidebar=menu-action]/menu-item:pe-8 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! hover:ll-swipe focus-visible:ll-swipe disabled:pointer-events-none disabled:text-pencil-text aria-disabled:pointer-events-none aria-disabled:text-pencil-text data-[active=true]:font-bold data-[active=true]:ll-swipe data-[active=true]:has-[>[data-ink-ready]]:bg-transparent data-[state=open]:hover:ll-swipe [&>span:last-child]:truncate [&>svg:not(.absolute)]:size-4 [&>svg:not(.absolute)]:shrink-0 [&>svg:not(.absolute)]:text-ink-soft",
  {
    variants: {
      variant: {
        default: "",
        outline: "",
      },
      size: {
        default: "h-8 compact:h-7 calm:h-7 calm:text-[15px]",
        sm: "h-7 text-[15px]",
        lg: "h-12 group-data-[collapsible=icon]:p-0!",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function MenuButtonMark({ active, outline }: { active: boolean; outline: boolean }) {
  const { hostRef, hostProps, node } = useInk({ recipe: sidebarMarkRecipe, params: { active, outline }, kind: "mark", still: true })
  return (
    <span
      data-slot="sidebar-menu-button-mark"
      aria-hidden="true"
      ref={hostRef}
      {...hostProps}
      className="pointer-events-none absolute inset-0 -z-10 block group-data-[collapsible=icon]:[&_[data-part=bracket]]:hidden"
    >
      {node}
    </span>
  )
}

function SidebarMenuButton({
  asChild = false,
  isActive = false,
  variant = "default",
  size = "default",
  tooltip,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean
  isActive?: boolean
  tooltip?: string | React.ComponentProps<typeof TooltipContent>
} & VariantProps<typeof sidebarMenuButtonVariants>) {
  const Comp = asChild ? Slot.Root : "button"
  const { isMobile, state } = useSidebar()
  const marked = isActive || variant === "outline"
  const mark = marked ? <MenuButtonMark active={isActive} outline={variant === "outline"} /> : null

  const shared = {
    "data-slot": "sidebar-menu-button",
    "data-sidebar": "menu-button",
    "data-size": size,
    "data-active": isActive,
    "aria-current": isActive && asChild ? ("page" as const) : undefined,
    className: cn(sidebarMenuButtonVariants({ variant, size }), className),
    ...props,
  }
  const button = asChild ? (
    <Comp {...shared}>
      <Slot.Slottable>{children}</Slot.Slottable>
      {mark}
    </Comp>
  ) : (
    <Comp {...shared}>
      {mark}
      {children}
    </Comp>
  )

  if (!tooltip) {
    return button
  }

  if (typeof tooltip === "string") {
    tooltip = {
      children: tooltip,
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" align="center" hidden={state !== "collapsed" || isMobile} {...tooltip} />
    </Tooltip>
  )
}

function SidebarMenuAction({
  className,
  asChild = false,
  showOnHover = false,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean
  showOnHover?: boolean
}) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="sidebar-menu-action"
      data-sidebar="menu-action"
      className={cn(
        "absolute end-1 top-1 flex aspect-square w-6 items-center justify-center p-0 text-sidebar-foreground transition-transform hover:ll-swipe [&>svg:not(.absolute)]:size-4 [&>svg:not(.absolute)]:shrink-0",
        "after:absolute after:-inset-2 md:after:hidden",
        "peer-data-[size=sm]/menu-button:top-0.5",
        "peer-data-[size=default]/menu-button:top-1",
        "peer-data-[size=lg]/menu-button:top-3",
        "group-data-[collapsible=icon]:hidden",
        showOnHover && "group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 md:opacity-0",
        className
      )}
      {...props}
    />
  )
}

function SidebarMenuBadge({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-menu-badge"
      data-sidebar="menu-badge"
      className={cn(
        "pointer-events-none absolute end-1 flex h-5 min-w-5 items-center justify-center px-1 font-script text-lg leading-none font-semibold text-ink-you tabular-nums select-none",
        "peer-data-[size=sm]/menu-button:top-1",
        "peer-data-[size=default]/menu-button:top-1.5",
        "peer-data-[size=lg]/menu-button:top-3.5",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
}

function SidebarMenuSkeleton({
  className,
  showIcon = false,
  seed,
  ...props
}: React.ComponentProps<"div"> & {
  showIcon?: boolean
  seed?: string | number
}) {
  const id = useInkSeed(seed)
  const width = `${50 + (hashSeed(id) % 41)}%`

  return (
    <div data-slot="sidebar-menu-skeleton" data-sidebar="menu-skeleton" className={cn("flex h-8 items-center gap-2 px-2", className)} {...props}>
      {showIcon && <Skeleton className="size-4" data-sidebar="menu-skeleton-icon" />}
      <Skeleton
        className="h-4 max-w-(--skeleton-width) flex-1"
        data-sidebar="menu-skeleton-text"
        style={
          {
            "--skeleton-width": width,
          } as React.CSSProperties
        }
      />
    </div>
  )
}

function SidebarMenuSub({ className, ref, children, ...props }: React.ComponentProps<"ul">) {
  const { hostRef, hostProps, node } = useInk({ recipe: sidebarRuleRecipe, params: {}, kind: "rule", still: true })
  return (
    <ul
      data-slot="sidebar-menu-sub"
      data-sidebar="menu-sub"
      ref={useMergedRef<HTMLUListElement>(hostRef, ref)}
      {...hostProps}
      className={cn("relative isolate mx-3.5 flex min-w-0 flex-col gap-1 px-2.5 py-0.5", "group-data-[collapsible=icon]:hidden", className)}
      {...props}
    >
      {node}
      {children}
    </ul>
  )
}

function SidebarMenuSubItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li data-slot="sidebar-menu-sub-item" data-sidebar="menu-sub-item" className={cn("group/menu-sub-item relative", className)} {...props} />
}

function SidebarMenuSubButton({
  asChild = false,
  size = "md",
  isActive = false,
  className,
  ...props
}: React.ComponentProps<"a"> & {
  asChild?: boolean
  size?: "sm" | "md"
  isActive?: boolean
}) {
  const Comp = asChild ? Slot.Root : "a"

  return (
    <Comp
      data-slot="sidebar-menu-sub-button"
      data-sidebar="menu-sub-button"
      data-size={size}
      data-active={isActive}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex min-h-7 min-w-0 items-center gap-2 px-2 py-0.5 font-hand text-sidebar-foreground hover:ll-swipe focus-visible:ll-swipe aria-disabled:pointer-events-none aria-disabled:text-pencil-text [&>span:last-child]:truncate [&>svg:not(.absolute)]:size-4 [&>svg:not(.absolute)]:shrink-0 [&>svg:not(.absolute)]:text-ink-soft",
        "data-[active=true]:font-bold data-[active=true]:ll-swipe",
        size === "sm" && "text-[15px]",
        size === "md" && "text-base",
        "leading-snug group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
}
