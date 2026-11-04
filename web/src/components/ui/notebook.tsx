import * as React from "react"
import { Slot } from "radix-ui"

import { Paper, type PaperProps } from "@/components/ui/paper"
import { usePaperDecor } from "@/hooks/use-paper-object"
import type { Accent } from "@/lib/ink/paper/props"
import { useShapedSheet } from "@/hooks/use-paper-object"
import { notebookCoverRecipe, notebookRecipe, type NotebookBinding, type NotebookSide } from "@/lib/ink/recipes/notebook-ink"
import { cn } from "@/lib/utils"

type NotebookContextValue = { value: string | undefined; setValue: (value: string) => void }
const NotebookContext = React.createContext<NotebookContextValue | null>(null)

type NotebookProps = Omit<PaperProps, "as"> & {
  as?: "div" | "section" | "article" | "figure"
  binding?: NotebookBinding
  side?: NotebookSide
  pages?: 0 | 1 | 2 | 3
  tone?: "steel" | Accent
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
}

function Notebook({
  className,
  children,
  ref,
  as = "div",
  binding = "spiral",
  side = "start",
  pages = 2,
  tone = "steel",
  curl = false,
  rules,
  stock = "paper",
  value: valueProp,
  defaultValue,
  onValueChange,
  tilt,
  seed,
  size,
  style,
  ...props
}: NotebookProps) {
  const top = side === "top"
  const [inner, setInner] = React.useState(defaultValue)
  const controlled = valueProp !== undefined
  const value = controlled ? valueProp : inner
  const ctx = React.useMemo<NotebookContextValue>(
    () => ({
      value,
      setValue: (v) => {
        if (!controlled) setInner(v)
        onValueChange?.(v)
      },
    }),
    [value, controlled, onValueChange],
  )
  const o = usePaperDecor({
    recipe: notebookRecipe,
    params: { binding, side, pages, tone, curl },
    kind: "notebook",
    ref,
    seed,
    tilt,
    tiltMax: 0.3,
    size,
    enabled: binding !== "none" || pages > 0,
  })
  return (
    <NotebookContext.Provider value={ctx}>
      <Paper
        data-slot="notebook"
        data-binding={binding}
        data-side={side}
        as={as}
        stock={stock}
        curl={curl}
        rules={rules ?? (top ? "pad" : "ruled")}
        size={size}
        {...o.paper}
        {...props}
        className={cn(
          o.paper.className,
          "group/notebook font-hand text-[17px] rtl:[&>[data-slot=paper-rules]]:-scale-x-100",
          top ? "pt-10 pe-6 pb-6 ps-6 leading-[30px]" : "pt-4 pe-6 pb-7 ps-14 leading-7 calm:leading-6",
          className,
        )}
        style={{ ...o.paper.style, ...style }}
      >
        {o.decor}
        {children}
      </Paper>
    </NotebookContext.Provider>
  )
}

type NotebookPageProps = React.ComponentProps<"section"> & {
  value?: string
}

function NotebookPage({ className, value, ...props }: NotebookPageProps) {
  const ctx = React.useContext(NotebookContext)
  const paged = value !== undefined && ctx?.value !== undefined
  const active = !paged || ctx?.value === value
  const [armed, setArmed] = React.useState(false)
  React.useEffect(() => setArmed(true), [])
  return (
    <section
      data-slot="notebook-page"
      data-state={active ? "active" : "inactive"}
      hidden={!active}
      className={cn(
        "flex flex-col",
        paged && armed && "transition-[clip-path] duration-(--ll-dur-soak) ease-(--ll-ease-out) [clip-path:polygon(0_0,100%_0,100%_100%,0_100%)] starting:[clip-path:polygon(100%_100%,100%_100%,100%_100%,100%_100%)]",
        className,
      )}
      {...props}
    />
  )
}

function NotebookTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="notebook-title"
      className={cn(
        "relative top-[calc(2.8px-var(--ll-rule-offset,8px))] font-script text-[1.75rem] leading-7 font-bold calm:top-[calc(0.8px-var(--ll-rule-offset,6px))] calm:leading-6",
        "group-data-[side=top]/notebook:top-[calc(3.8px-var(--ll-rule-offset,9px))] group-data-[side=top]/notebook:leading-[30px]",
        className
      )}
      {...props}
    />
  )
}

type NotebookTurnProps = React.ComponentProps<"button"> & {
  to?: string
  asChild?: boolean
}

function NotebookTurn({ className, to, asChild, onClick, children, type, ...props }: NotebookTurnProps) {
  const ctx = React.useContext(NotebookContext)
  const Comp = asChild ? Slot.Root : "button"
  return (
    <Comp
      data-slot="notebook-turn"
      type={asChild ? undefined : (type ?? "button")}
      className={cn("absolute right-0 bottom-0 z-(--ll-z-prop) size-[34px] cursor-pointer", className)}
      onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(e)
        if (!e.defaultPrevented && to !== undefined) ctx?.setValue(to)
      }}
      {...props}
    >
      {asChild ? children : <span className="sr-only">{children ?? "Turn the page"}</span>}
    </Comp>
  )
}

type NotebookCoverProps = React.ComponentProps<"div"> & {
  tone?: Accent | "ink"
  band?: boolean
  tilt?: boolean | number
  seed?: string | number
  size?: readonly [number, number]
}

function NotebookCover({ className, style, children, ref, tone = "tomato", band = true, tilt, seed, size, ...props }: NotebookCoverProps) {
  const o = useShapedSheet({ recipe: notebookCoverRecipe, params: { tone, band }, ref, seed, tilt, tiltMax: 1.4, size })
  return (
    <div
      data-slot="notebook-cover"
      data-tone={tone}
      {...o.root}
      {...props}
      className={cn("relative isolate h-60 w-44 text-ink", !o.ready && "border border-pencil-mark bg-paper-shade shadow-card", className)}
      style={{ ...o.root.style, ...style }}
    >
      {o.node}
      <div data-slot="notebook-cover-body" className="absolute inset-0 flex flex-col items-center pt-[3.25rem] ps-5 pe-[calc(max(22px,15%)+6px)]">
        {children}
      </div>
    </div>
  )
}

function NotebookCoverLabel({ className, ...props }: Omit<PaperProps, "stock" | "as">) {
  return <Paper data-slot="notebook-cover-label" stock="index-card" rules="none" className={cn("w-full px-3 py-2 text-center font-script text-xl leading-tight font-bold text-ink", className)} {...props} />
}

export { Notebook, NotebookPage, NotebookTitle, NotebookTurn, NotebookCover, NotebookCoverLabel }
export type { NotebookProps, NotebookPageProps, NotebookTurnProps, NotebookCoverProps }
