/**
 * Design System — Reusable Style Factories
 *
 * Usage:
 *   import { ds, button, card, badge, table } from "../design-system";
 *   <div style={card()}> ... </div>
 *   <button style={button("primary")}>Submit</button>
 *
 * Colors use CSS variables for runtime theme switching.
 * Theme is applied via data-theme attribute on :root.
 */

import type { CSSProperties } from "react";

/* ═══════════════════════════════════════════════════
   Branding Constants
   ═══════════════════════════════════════════════════ */

export const BRAND = {
  name: "BID FOR C",
  logo: "/assets/logo.png",
};

export const tokens = {
  color: {
    primary: "var(--color-primary)",
    primaryLight: "var(--color-primary-light)",
    primaryDark: "var(--color-primary-dark)",
    accent: "var(--color-accent)",
    accentLight: "var(--color-accent-light)",
    accentDark: "var(--color-accent-dark)",
    bg: "var(--color-bg)",
    surface: "var(--color-surface)",
    text: "var(--color-text)",
    textSecondary: "var(--color-text-secondary)",
    muted: "var(--color-muted)",
    border: "var(--color-border)",
    borderLight: "var(--color-border-light)",
    success: "var(--color-success)",
    successBg: "var(--color-success-bg)",
    successBorder: "var(--color-success-border)",
    warning: "var(--color-warning)",
    warningBg: "var(--color-warning-bg)",
    warningBorder: "var(--color-warning-border)",
    danger: "var(--color-danger)",
    dangerBg: "var(--color-danger-bg)",
    dangerBorder: "var(--color-danger-border)",
    info: "var(--color-info)",
    infoBg: "var(--color-info-bg)",
    infoBorder: "var(--color-info-border)",
    easyBg: "var(--color-easy-bg)",
    easyFg: "var(--color-easy-fg)",
    mediumBg: "var(--color-medium-bg)",
    mediumFg: "var(--color-medium-fg)",
    hardBg: "var(--color-hard-bg)",
    hardFg: "var(--color-hard-fg)",
  },
  font: {
    heading: "var(--font-heading)",
    body: "var(--font-body)",
    mono: "var(--font-mono)",
  },
  space: {
    0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20,
    6: 24, 7: 32, 8: 40, 9: 48, 10: 64, 11: 80, 12: 96,
  } as Record<number, number | string>,
  radius: { sm: "6px", md: "10px", lg: "14px", xl: "18px", full: "999px" },
  shadow: {
    xs: "0 1px 2px rgba(0,0,0,0.04)",
    sm: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
    md: "0 4px 12px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.04)",
    lg: "0 10px 24px rgba(0,0,0,0.08), 0 4px 8px rgba(0,0,0,0.04)",
    xl: "0 20px 40px rgba(0,0,0,0.1), 0 8px 16px rgba(0,0,0,0.06)",
    gold: "0 0 24px rgba(212,175,55,0.2)",
    navy: "0 0 24px rgba(11,60,93,0.15)",
  },
  transition: {
    fast: "150ms ease",
    base: "200ms ease",
    slow: "300ms ease",
    spring: "400ms cubic-bezier(0.34,1.56,0.64,1)",
  },
} as const;

/* ═══════════════════════════════════════════════════
   Shared Base Styles
   ═══════════════════════════════════════════════════ */

/** Tabular numerals for ticking digits. */
export const tabular: CSSProperties = {
  fontVariantNumeric: "tabular-nums",
};

/** Uppercase section label. */
export const labelStyle: CSSProperties = {
  fontFamily: tokens.font.body,
  fontWeight: 600,
  fontSize: "0.75rem",
  color: tokens.color.muted,
  textTransform: "uppercase",
  letterSpacing: "0.18em",
};

/** Heading font family helper. */
const heading = (size: string, weight: number = 700): CSSProperties => ({
  fontFamily: tokens.font.heading,
  fontWeight: weight,
  fontSize: size,
  lineHeight: 1.2,
  color: tokens.color.text,
});

/* ═══════════════════════════════════════════════════
   Component Styles
   ═══════════════════════════════════════════════════ */

/* ── Button ── */
export type ButtonVariant = "primary" | "accent" | "danger" | "ghost" | "outline";
export type ButtonSize = "sm" | "md" | "lg";

export function button(variant: ButtonVariant = "primary", size: ButtonSize = "md"): CSSProperties {
  const sizes: Record<ButtonSize, CSSProperties> = {
    sm: { padding: "8px 16px", fontSize: "0.8rem" },
    md: { padding: "10px 24px", fontSize: "0.9rem" },
    lg: { padding: "14px 32px", fontSize: "1rem" },
  };

  const variants: Record<ButtonVariant, CSSProperties> = {
    primary: {
      backgroundColor: tokens.color.primary,
      color: "#FFFFFF",
      border: `2px solid ${tokens.color.primary}`,
    },
    accent: {
      backgroundColor: tokens.color.accent,
      color: tokens.color.primary,
      border: `2px solid ${tokens.color.accent}`,
    },
    danger: {
      backgroundColor: tokens.color.danger,
      color: "#FFFFFF",
      border: `2px solid ${tokens.color.danger}`,
    },
    ghost: {
      backgroundColor: "transparent",
      color: tokens.color.muted,
      border: `2px solid transparent`,
    },
    outline: {
      backgroundColor: "transparent",
      color: tokens.color.primary,
      border: `2px solid ${tokens.color.border}`,
    },
  };

  return {
    ...sizes[size],
    ...variants[variant],
    fontFamily: tokens.font.body,
    fontWeight: 600,
    borderRadius: tokens.radius.md,
    cursor: "pointer",
    transition: `all ${tokens.transition.fast}`,
    outline: "none",
    userSelect: "none",
    whiteSpace: "nowrap" as const,
  };
}

/* ── Card ── */
export function card(opts?: { hover?: boolean; padding?: string }): CSSProperties {
  return {
    backgroundColor: tokens.color.surface,
    border: `1px solid ${tokens.color.border}`,
    borderRadius: tokens.radius.lg,
    boxShadow: tokens.shadow.sm,
    padding: opts?.padding ?? tokens.space[6] + "px",
    transition: opts?.hover ? `box-shadow ${tokens.transition.base}` : undefined,
  };
}

/* ── Badge ── */
export type BadgeVariant = "easy" | "medium" | "hard" | "success" | "warning" | "danger" | "info" | "muted";

export function badge(variant: BadgeVariant = "muted"): CSSProperties {
  const map: Record<BadgeVariant, { bg: string; fg: string }> = {
    easy: { bg: tokens.color.easyBg, fg: tokens.color.easyFg },
    medium: { bg: tokens.color.mediumBg, fg: tokens.color.mediumFg },
    hard: { bg: tokens.color.hardBg, fg: tokens.color.hardFg },
    success: { bg: tokens.color.successBg, fg: "#166534" },
    warning: { bg: tokens.color.warningBg, fg: "#92400E" },
    danger: { bg: tokens.color.dangerBg, fg: "#991B1B" },
    info: { bg: tokens.color.infoBg, fg: "#1E40AF" },
    muted: { bg: tokens.color.borderLight, fg: tokens.color.muted },
  };
  const s = map[variant];
  return {
    backgroundColor: s.bg,
    color: s.fg,
    fontFamily: tokens.font.body,
    fontWeight: 700,
    fontSize: "0.75rem",
    letterSpacing: "0.1em",
    padding: "4px 12px",
    borderRadius: tokens.radius.sm,
  };
}

/* ── Table ── */
export const table = {
  wrapper: (): CSSProperties => ({
    width: "100%",
    borderCollapse: "collapse" as const,
    fontFamily: tokens.font.body,
  }),
  th: (): CSSProperties => ({
    ...labelStyle,
    textAlign: "left" as const,
    padding: "12px 16px",
    borderBottom: `2px solid ${tokens.color.border}`,
    fontWeight: 700,
  }),
  td: (opts?: { align?: "left" | "center" | "right" }): CSSProperties => ({
    padding: "12px 16px",
    borderBottom: `1px solid ${tokens.color.borderLight}`,
    fontSize: "0.9rem",
    color: tokens.color.text,
    textAlign: opts?.align ?? "left",
    fontVariantNumeric: "tabular-nums",
  }),
  row: (opts?: { striped?: boolean; index?: number }): CSSProperties => ({
    backgroundColor: opts?.striped && (opts.index ?? 0) % 2 === 1
      ? tokens.color.borderLight
      : "transparent",
    transition: `background-color ${tokens.transition.fast}`,
  }),
};

/* ── Input ── */
export function input(opts?: { error?: boolean }): CSSProperties {
  return {
    fontFamily: tokens.font.body,
    fontSize: "0.9rem",
    padding: "10px 14px",
    borderRadius: tokens.radius.md,
    border: `2px solid ${opts?.error ? tokens.color.danger : tokens.color.border}`,
    backgroundColor: tokens.color.surface,
    color: tokens.color.text,
    outline: "none",
    transition: `border-color ${tokens.transition.fast}`,
    width: "100%",
  };
}

/* ── Modal Overlay ── */
export const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(15, 23, 42, 0.5)",
  backdropFilter: "blur(4px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 400,
};

/* ── Page Container ── */
export const page: CSSProperties = {
  minHeight: "100vh",
  backgroundColor: tokens.color.bg,
  color: tokens.color.text,
  fontFamily: tokens.font.body,
  userSelect: "none",
  padding: "clamp(16px, 3vw, 48px)",
};

/* ── Divider ── */
export const divider: CSSProperties = {
  height: "1px",
  backgroundColor: tokens.color.border,
  border: "none",
  margin: "16px 0",
};

/* ── Avatar ── */
export function avatar(size: number = 36): CSSProperties {
  return {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: tokens.radius.full,
    backgroundColor: tokens.color.primary,
    color: "#FFFFFF",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: tokens.font.heading,
    fontWeight: 700,
    fontSize: `${Math.round(size * 0.4)}px`,
    flexShrink: 0,
  };
}

/* ═══════════════════════════════════════════════════
   Convenience Re-export
   ═══════════════════════════════════════════════════ */

/** Shorthand namespace: `import { ds } from "../design-system"` */
export const ds = {
  BRAND,
  tokens,
  button,
  card,
  badge,
  table,
  input,
  overlay,
  page,
  divider,
  avatar,
  tabular,
  labelStyle,
  heading,
};
