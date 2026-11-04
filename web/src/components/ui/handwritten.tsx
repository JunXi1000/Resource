"use client"

import * as React from "react"

import { makeRng } from "@/lib/ink/rng"
import { useDensity, useInkSeed } from "@/lib/ink/react"
import { cn } from "@/lib/utils"

const SKIP = new Set(["code", "pre", "kbd", "samp", "var", "a", "svg", "math", "textarea", "input", "select", "button", "script", "style", "img", "video", "audio", "canvas", "iframe"])

const CSS = `[data-written] .ll-w{display:inline;position:relative;translate:none;rotate:none;opacity:1;padding-inline-end:0;margin-inline-end:0;top:calc(var(--jy,0px)*var(--ll-jitter-k,1));color:color-mix(in srgb,currentColor calc((1 - (1 - var(--jo,1))*var(--ll-jitter-k,1))*100%),transparent)}`

interface Walk {
  n: number
  seed: string
  k: number
}

function word(text: string, w: Walk): React.ReactNode {
  const r = makeRng(w.seed).fork(w.n)
  const i = w.n++
  const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v))
  const style = {
    "--jy": `${clamp(r.gauss(0, 0.55) * 1.5 * w.k, 1.6).toFixed(2)}px`,
    "--jr": `${clamp(r.gauss(0, 0.6) * 1.4 * w.k, 1.7).toFixed(2)}deg`,
    "--jo": (1 - r.range(0, 0.12) * w.k).toFixed(2),
  } as React.CSSProperties
  return (
    <span key={i} className="ll-w [text-decoration:inherit]" style={style}>
      {text}
    </span>
  )
}

function walk(children: React.ReactNode, w: Walk): React.ReactNode[] {
  return React.Children.toArray(children).map((node, at) => {
    if (typeof node === "string" || typeof node === "number") {
      const words = String(node)
        .split(/(\s+)/)
        .map((part) => (part === "" ? null : /^\s+$/.test(part) ? part : word(part, w)))
      return <React.Fragment key={`t${at}`}>{words}</React.Fragment>
    }
    if (!React.isValidElement<{ children?: React.ReactNode; "data-handwritten"?: string }>(node) || node.props["data-handwritten"] === "off") return node
    const walked = node.type === React.Fragment || (typeof node.type === "string" && !SKIP.has(node.type))
    if (!walked || node.props.children == null) return node
    return React.cloneElement(node, undefined, ...walk(node.props.children, w))
  })
}

function Handwritten({
  as: Comp = "span",
  strength = 1,
  seed,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"span">, "ref"> & {
  as?: React.ElementType
  strength?: number
  seed?: string | number
  ref?: React.Ref<HTMLElement>
}) {
  const id = useInkSeed(seed)
  const density = useDensity()
  const k = Math.max(0, strength) * (density === "compact" ? 0.7 : 1)
  return (
    <Comp data-slot="handwritten" data-written={k > 0 ? "" : undefined} className={cn(k > 0 && "ll-hand-jitter", className)} {...props}>
      {k > 0 ? (
        <style href="ll-handwritten" precedence="low">
          {CSS}
        </style>
      ) : null}
      {k > 0 ? walk(children, { n: 0, seed: `hw|${id}`, k }) : children}
    </Comp>
  )
}

export { Handwritten }
