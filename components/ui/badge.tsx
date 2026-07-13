import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-mono font-semibold uppercase tracking-wider transition-colors",
  {
    variants: {
      variant: {
        default: "border-app-accent/40 bg-app-accent/10 text-app-accent",
        green:   "border-transparent bg-app-green/15 text-app-green",
        amber:   "border-transparent bg-app-amber/15 text-app-amber",
        red:     "border-transparent bg-app-red/15 text-app-red",
        accent:    "border-transparent bg-app-accent/15 text-app-accent",
        violet:  "border-transparent bg-app-violet/15 text-app-violet",
        gray:    "border-transparent bg-app-surface-mid text-app-muted",
        outline: "border-app-line text-app-secondary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
