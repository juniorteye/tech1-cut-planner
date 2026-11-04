import type { ComponentProps } from "react";

type FormFieldProps = ComponentProps<"input"> & {
  label: string;
};

export function FormField({ label, ...props }: FormFieldProps) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <input
        className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-base"
        {...props}
      />
    </label>
  );
}
