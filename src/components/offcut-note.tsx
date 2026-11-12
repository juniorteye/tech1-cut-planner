/** Offcuts are already in the workshop, so they are never in the count to buy. */
export function OffcutNote({ count }: { count: number }) {
  return (
    <p className="text-sm">
      Also uses {count} {count === 1 ? "offcut" : "offcuts"} from your leftover store, not counted in the boards to buy.
    </p>
  );
}
