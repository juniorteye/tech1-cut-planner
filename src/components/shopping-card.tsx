import type { ShoppingList } from "@/lib/planner/shopping";
import { formatMetres, formatMoney } from "@/lib/units";

/** Boards to buy per type, banding per colour and the total: the list he takes to the timber market. */
export function ShoppingCard({ list }: { list: ShoppingList }) {
  return (
    <div className="space-y-3">
      {list.items.length > 0 && (
        <table className="w-full text-left">
          <thead className="font-mono text-xs uppercase text-muted">
            <tr>
              <th className="py-1 pr-2">Buy</th>
              <th className="py-1 pr-2">Qty</th>
              <th className="py-1 text-right">Cost</th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((item) => (
              <tr key={`${item.name}-${item.size}`} className="border-t border-line">
                <td className="py-1.5 pr-2">
                  {item.name}
                  <span className="block text-sm text-muted">
                    {item.size} · {formatMoney(item.unitPrice)} each
                  </span>
                </td>
                <td className="py-1.5 pr-2">{item.count}</td>
                <td className="whitespace-nowrap py-1.5 text-right">{formatMoney(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {list.banding.length > 0 && (
        <div>
          <p className="font-semibold">Edge banding</p>
          <ul className="text-sm">
            {list.banding.map((line) => (
              <li key={line.colour}>
                {line.colour}: <span className="font-semibold">{formatMetres(line.mm)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="border-t-2 border-ink pt-2 font-display text-xl font-bold">
        Total for the wood: {formatMoney(list.total)}
      </p>
      {list.fromStore > 0 && (
        <p className="text-sm text-muted">
          {list.fromStore} {list.fromStore === 1 ? "piece comes" : "pieces come"} from the offcut store, not bought.
        </p>
      )}
    </div>
  );
}
