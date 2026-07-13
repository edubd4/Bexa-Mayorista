import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

// Select nativo estilado con tokens app-*. Suficiente para forms del MVP.
// Cuando necesitemos custom rendering / búsqueda, migramos a @radix-ui/react-select.
const Select = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "flex h-10 w-full appearance-none rounded-md border border-app-line bg-app-input px-3 py-2 pr-9 text-sm text-app-text shadow-sm transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/50 focus-visible:border-app-accent/40",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-app-muted" />
    </div>
  )
)
Select.displayName = "Select"

export { Select }
