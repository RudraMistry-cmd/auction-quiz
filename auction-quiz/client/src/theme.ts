import type { CSSProperties } from "react";

// Projector-first theme for the college auction event.
// High-contrast tokens shared by Team / Admin / Display screens.

export const colors = {
  bg: "#0B1020",
  surface: "#151D33",
  surfaceBorder: "#2A3658",
  ink: "#FFFFFF",
  gold: "#FFB800",
  silver: "#C9D2E0",
  bronze: "#E09A5F",
  violet: "#B79CFF",
  green: "#3DDC84",
  red: "#FF5C5C",
  muted: "#9AA4C0",
} as const;

export const fontFamily = "'Inter', 'Segoe UI', Arial, sans-serif";

// Uppercase section labels: TIME LEFT, CURRENT BID, LEADING TEAM…
export const label: CSSProperties = {
  color: colors.muted,
  textTransform: "uppercase",
  letterSpacing: "0.3em",
  fontWeight: 600,
};

// Tabular numerals so ticking digits don't jitter.
export const tabular: CSSProperties = {
  fontVariantNumeric: "tabular-nums",
};

export const page: CSSProperties = {
  backgroundColor: colors.bg,
  color: colors.ink,
  fontFamily,
};

export const card: CSSProperties = {
  backgroundColor: colors.surface,
  border: `1px solid ${colors.surfaceBorder}`,
  borderRadius: "1rem",
};
