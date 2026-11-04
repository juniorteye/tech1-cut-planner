"use client";

import { useState, type ComponentProps } from "react";

type PasswordFieldProps = Omit<ComponentProps<"input">, "type"> & {
  label: string;
};

export function PasswordField({ label, ...props }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <span className="relative mt-1 block">
        <input
          type={visible ? "text" : "password"}
          className="w-full rounded-md border border-line bg-white py-2 pl-3 pr-11 text-base"
          {...props}
        />
        <button
          type="button"
          aria-label={visible ? "Hide password" : "Show password"}
          onClick={() => setVisible(!visible)}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
            {visible && <path d="M4 4l16 16" />}
          </svg>
        </button>
      </span>
    </label>
  );
}
