import React, { useState, useEffect } from "react";
import { BRAND } from "../design-system";

export type Variant = "centered" | "left" | "compact" | "live" | "scoreboard" | "admin" | "team";

export interface BrandHeaderProps {
  variant?: Variant;
  subtitle?: string;
  showTagline?: boolean;
  inverted?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

interface VariantConfig {
  direction: "row" | "column";
  align: string;
  justify: string;
  logoSize: number;
  textSize: string;
  gap: string;
  marginBottom: string;
}

const variantMap: Record<"centered" | "left" | "compact", VariantConfig> = {
  centered: {
    direction: "column",
    align: "center",
    justify: "center",
    logoSize: 72,
    textSize: "clamp(32px, 4vw, 38px)",
    gap: "10px",
    marginBottom: "20px",
  },
  left: {
    direction: "row",
    align: "center",
    justify: "flex-start",
    logoSize: 44,
    textSize: "22px",
    gap: "10px",
    marginBottom: "16px",
  },
  compact: {
    direction: "row",
    align: "center",
    justify: "flex-start",
    logoSize: 54,
    textSize: "28px",
    gap: "10px",
    marginBottom: "0px",
  },
};

export function BrandHeader({
  variant = "centered",
  subtitle,
  showTagline = false,
  inverted = false,
  className,
  style,
}: BrandHeaderProps) {
  const [logoError, setLogoError] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  // Normalize legacy variant names
  const canonical: "centered" | "left" | "compact" =
    variant === "live" || variant === "scoreboard"
      ? "centered"
      : variant === "admin"
      ? "left"
      : variant === "team"
      ? "compact"
      : variant;

  // Responsive small screen detection: auto-switch to compact on mobile
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(max-width: 640px)");
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsSmallScreen(e.matches);
    };
    handler(mql);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const activeVariant: "centered" | "left" | "compact" =
    isSmallScreen && canonical === "centered" ? "compact" : canonical;

  const cfg = variantMap[activeVariant];

  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: cfg.direction,
        alignItems: cfg.align,
        justifyContent: cfg.justify,
        gap: cfg.gap,
        marginBottom: style?.marginBottom !== undefined ? style.marginBottom : cfg.marginBottom,
        animation: "fadeUp 0.4s ease forwards",
        userSelect: "none",
        ...style,
      }}
    >
      {/* Event Logo (Image) */}
      {!logoError && (
        <img
          src={BRAND.logo}
          alt={BRAND.name}
          onError={() => setLogoError(true)}
          style={{
            height: `${cfg.logoSize}px`,
            width: "auto",
            maxWidth: `${cfg.logoSize * 2.2}px`,
            objectFit: "contain",
            filter: inverted
              ? "drop-shadow(0 0 16px rgba(212,175,55,0.4))"
              : "drop-shadow(0 2px 8px rgba(212,175,55,0.25))",
            transition: "filter 0.3s ease, transform 0.3s ease",
            flexShrink: 0,
          }}
        />
      )}

      {/* Event Name & Optional Subtitle */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: activeVariant === "centered" ? "center" : "flex-start",
          textAlign: activeVariant === "centered" ? "center" : "left",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-wordmark, 'Luckiest Guy', 'Poppins', sans-serif)",
            fontSize: cfg.textSize,
            fontWeight: 400,
            letterSpacing: "0.03em",
            color: inverted ? "#FFFFFF" : "var(--color-primary, #0B3C5D)",
            textShadow: inverted
              ? "-1.5px -1.5px 0 rgba(0,0,0,0.4), 1.5px -1.5px 0 rgba(0,0,0,0.4), -1.5px 1.5px 0 rgba(0,0,0,0.4), 1.5px 1.5px 0 rgba(0,0,0,0.4), 3px 3px 6px rgba(0,0,0,0.25)"
              : "-1.5px -1.5px 0 var(--color-primary-dark, #082C44), 1.5px -1.5px 0 var(--color-primary-dark, #082C44), -1.5px 1.5px 0 var(--color-primary-dark, #082C44), 1.5px 1.5px 0 var(--color-primary-dark, #082C44), 2px 2px 4px rgba(0,0,0,0.12)",
            textTransform: "uppercase",
            lineHeight: 1,
            whiteSpace: "nowrap",
            display: "inline-flex",
            alignItems: "baseline",
            gap: "0.2em",
          }}
        >
          <span>BID FOR</span>
          <span
            style={{
              color: "var(--color-accent, #D4AF37)",
              fontSize: "1.3em",
              textShadow:
                "-1.5px -1.5px 0 var(--color-accent-dark, #B8962E), 1.5px -1.5px 0 var(--color-accent-dark, #B8962E), -1.5px 1.5px 0 var(--color-accent-dark, #B8962E), 1.5px 1.5px 0 var(--color-accent-dark, #B8962E), 3px 3px 0 var(--color-accent-dark, #B8962E), 5px 5px 8px rgba(0,0,0,0.3)",
            }}
          >
            C
          </span>
        </span>

        {subtitle && (
          <span
            style={{
              fontFamily: "var(--font-body, 'Inter', sans-serif)",
              fontSize: activeVariant === "centered" ? "0.85rem" : "0.75rem",
              color: inverted ? "rgba(255, 255, 255, 0.75)" : "var(--color-muted, #64748B)",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              marginTop: "4px",
              fontWeight: 600,
            }}
          >
            {subtitle}
          </span>
        )}
      </div>

      {showTagline && (
        <div
          style={{
            fontFamily: "var(--font-body, 'Inter', sans-serif)",
            fontSize: "clamp(0.85rem, 1.2vw, 1.05rem)",
            color: inverted ? "rgba(255, 255, 255, 0.7)" : "var(--color-muted, #64748B)",
            letterSpacing: "0.05em",
            marginTop: "6px",
            fontStyle: "italic",
          }}
        >
          Bid Smart. Code Fast. Win Big.
        </div>
      )}
    </div>
  );
}
