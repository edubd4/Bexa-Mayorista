import { Badge } from "@/components/ui/badge"
import {
  ESTADO_CAMPANA_LABEL,
  ESTADO_CAMPANA_VARIANT,
  type EstadoCampanaEfectivo,
} from "@/lib/validators/campana"

export function CampanaEstadoBadge({ estado }: { estado: EstadoCampanaEfectivo }) {
  return (
    <Badge variant={ESTADO_CAMPANA_VARIANT[estado]}>
      {ESTADO_CAMPANA_LABEL[estado]}
    </Badge>
  )
}
