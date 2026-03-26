"use client";

import { useShellControls } from "./app-shell";

type SearchTriggerProps = {
  label: string;
  className?: string;
};

export function SearchTrigger({
  label,
  className = "shell-button shell-button--primary",
}: SearchTriggerProps) {
  const { openSearch } = useShellControls();

  return (
    <button type="button" className={className} onClick={openSearch}>
      {label}
    </button>
  );
}
