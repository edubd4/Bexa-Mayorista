import * as React from "react"
import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-app-line bg-app-input px-3 py-2 text-sm text-app-text shadow-sm transition-colors",
        "placeholder:text-app-muted",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/50 focus-visible:border-app-accent/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
)
Textarea.displayName = "Textarea"

export { Textarea }
