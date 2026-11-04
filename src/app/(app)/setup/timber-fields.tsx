import { FormField } from "@/components/form-field";
import { PLANK_LENGTHS_FT } from "@/lib/defaults";
import type { Timber } from "@/lib/types";
import { parseLength } from "@/lib/units";
import { formatMoneyInput } from "./format";

export function TimberFields({ timber }: { timber?: Timber }) {
  const priceFor = (feet: number) => {
    const length = timber?.lengths.find((l) => l.lengthMm === parseLength(`${feet}ft`, "mm"));
    return length ? formatMoneyInput(length.pricePerPiece) : undefined;
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {timber && <input type="hidden" name="id" value={timber.id} />}
      <FormField label="Name" name="name" defaultValue={timber?.name} placeholder="2 × 4" required />
      <FormField
        label="Shortest offcut to keep (mm)"
        name="minLength"
        inputMode="decimal"
        defaultValue={timber?.minLeftoverLengthMm}
        placeholder="300"
      />
      <p className="text-sm text-muted sm:col-span-2">
        Enter a price for each length you buy. Leave the others empty.
      </p>
      {PLANK_LENGTHS_FT.map((feet) => (
        <FormField
          key={feet}
          label={`${feet} ft price (GH¢)`}
          name={`price${feet}`}
          inputMode="decimal"
          defaultValue={priceFor(feet)}
        />
      ))}
    </div>
  );
}
