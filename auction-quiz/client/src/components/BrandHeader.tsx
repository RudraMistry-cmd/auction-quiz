import { tokens as T } from "../design-system";

type BrandVariant = "live" | "scoreboard" | "admin" | "team";

interface BrandHeaderProps {
  variant?: BrandVariant;
  showTagline?: boolean;
  className?: string;
}

const variants: Record<BrandVariant, { logoHeight: number; logoMaxWidth: number; titleSize: string; subtitleSize: string; justify: string }> = {
  live: { logoHeight: 80, logoMaxWidth: 160, titleSize: "clamp(2rem, 4vw, 3.5rem)", subtitleSize: "clamp(0.8rem, 1.2vw, 1.1rem)", justify: "center" },
  scoreboard: { logoHeight: 70, logoMaxWidth: 140, titleSize: "clamp(1.5rem, 3vw, 2.5rem)", subtitleSize: "clamp(0.7rem, 1vw, 0.95rem)", justify: "center" },
  admin: { logoHeight: 40, logoMaxWidth: 80, titleSize: "1.1rem", subtitleSize: "0.7rem", justify: "flex-start" },
  team: { logoHeight: 32, logoMaxWidth: 64, titleSize: "0.9rem", subtitleSize: "0.65rem", justify: "flex-start" },
};

export function BrandHeader({ variant = "admin", showTagline = false, className }: BrandHeaderProps) {
  const v = variants[variant];

  return (
    <div className={className} style={{
      display: "flex",
      alignItems: "center",
      justifyContent: v.justify,
      gap: "12px",
      padding: variant === "live" ? "24px 0 8px" : "8px 0",
      animation: "brandFadeIn 0.6s ease-out",
    }}>
      <img
        src="/assets/logo.png"
        alt="Bid for C"
        style={{
          height: `${v.logoHeight}px`,
          maxWidth: `${v.logoMaxWidth}px`,
          objectFit: "contain",
          filter: variant === "live" ? "drop-shadow(0 0 12px rgba(11,60,93,0.35))" : "none",
          transition: "filter 0.3s ease",
        }}
      />
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: variant === "live" || variant === "scoreboard" ? "center" : "flex-start",
      }}>
        <span style={{
          fontFamily: T.font.heading,
          fontSize: v.titleSize,
          fontWeight: 700,
          color: T.color.primary,
          letterSpacing: variant === "live" || variant === "scoreboard" ? "0.08em" : "normal",
          textTransform: (variant === "live" || variant === "scoreboard") ? "uppercase" : "none",
          lineHeight: 1.1,
        }}>
          BID FOR C
        </span>
        {variant === "scoreboard" && (
          <span style={{
            fontFamily: T.font.body,
            fontSize: v.subtitleSize,
            color: T.color.muted,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}>
            LEADERBOARD
          </span>
        )}
      </div>
      {showTagline && (
        <div style={{
          position: "absolute",
          bottom: "24px",
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: T.font?.body || "'Inter', sans-serif",
          fontSize: "clamp(0.85rem, 1.2vw, 1.1rem)",
          color: "#475569",
          letterSpacing: "0.04em",
          opacity: 0.85,
        }}>
          Bid Smart. Code Fast. Win Big.
        </div>
      )}
    </div>
  );
}

/* Keyframes injected once via <style> in App or index */
