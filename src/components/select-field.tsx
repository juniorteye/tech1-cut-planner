import type { ComponentProps } from "react";

type SelectFieldProps = ComponentProps<"select"> & {
  label: string;
};

export function SelectField({ label, children, ...props }: SelectFieldProps) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <select
        className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-base"
        {...props}
      >
        {children}
      </select>
    </label>
  );
}
