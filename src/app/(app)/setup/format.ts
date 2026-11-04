import type { Pesewas } from "@/lib/types";

export function formatMoneyInput(pesewas: Pesewas) {
  return (pesewas / 100).toFixed(2);
}
