/**
 * Theme — backward-compatible re-export from design system.
 *
 * Existing code:  import { colors, fontFamily, label, tabular, page, card } from "../theme"
 * New code:       import { ds, tokens, button, card, badge } from "../design-system"
 */
import type { CSSProperties } from "react";
import { tokens } from "./design-system";

// ── Legacy color map (kept for existing imports) ──
export const colors = {
  bg: tokens.color.bg,
  surface: tokens.color.surface,
  surfaceBorder: tokens.color.border,
  ink: tokens.color.text,
  gold: tokens.color.accent,
  silver: "#C9D2E0",
  bronze: "#E09A5F",
  violet: "#B79CFF",
  green: tokens.color.success,
  red: tokens.color.danger,
  muted: tokens.color.muted,
} as const;

export const fontFamily = tokens.font.body;

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
