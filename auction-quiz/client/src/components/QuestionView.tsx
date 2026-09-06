import { colors, fontFamily, label, tabular } from "../theme";

interface QuestionViewProps {
  text: string | null | undefined;
  options?: unknown[] | Record<string, unknown> | null;
  reward?: number | null;
  /** Compact variant for side panels (admin). Full size for stage/team. */
  compact?: boolean;
  /** Override the internal scroll cap (default 46vh, 30vh compact). */
  maxHeight?: string;
}

type Block = { kind: "text"; value: string } | { kind: "code"; value: string };

/** Split ``` fenced code blocks out of question text. */
function splitBlocks(text: string): Block[] {
  return text
    .split("```")
    .map((part, i): Block =>
      i % 2 === 1
        ? { kind: "code", value: part.replace(/^\n/, "").replace(/\s+$/, "") }
        : { kind: "text", value: part }
    )
    .filter((b) => b.value.trim().length > 0);
}

/** Typography tier shrinks as content grows so long questions stay on screen. */
function textTier(totalLen: number, compact?: boolean): React.CSSProperties {
  if (compact) return { fontSize: "1.05rem" };
  if (totalLen < 120) return { fontSize: "clamp(1.75rem, 5vw, 3.25rem)" };
  if (totalLen < 400) return { fontSize: "clamp(1.4rem, 3.6vw, 2.3rem)" };
  return { fontSize: "clamp(1.1rem, 2.6vw, 1.6rem)" };
}

/**
 * Single renderer for bank questions everywhere.
 *
 * Layout: card container → header row (eyebrow + reward) → body
 * (prose with embedded code panels) → options grid → internal scroll.
 * - Long text auto-shrinks a tier and left-aligns past 400 chars.
 * - Code fences render as inset panels with a CODE tag and h-scroll.
 * - Short options pair into 2 columns on wide screens; long ones stack.
 */
export default function QuestionView({ text, options, reward, compact, maxHeight }: QuestionViewProps) {
  if (!text) return null;

  const entries: Array<[string, unknown]> = Array.isArray(options)
    ? options.map((o, i) => [String.fromCharCode(65 + i), o])
    : options && typeof options === "object"
      ? Object.entries(options)
      : [];

  const blocks = splitBlocks(text);
  const textLen = text.length;
  const long = textLen >= 400;
  // Two-column options only when every choice is short and few.
  const grid2col =
    !compact &&
    entries.length > 1 &&
    entries.length <= 4 &&
    entries.every(([, v]) => String(v).length <= 40);

  return (
    <div
      style={{
        ...styles.box,
        ...(compact ? styles.boxCompact : null),
        ...(maxHeight ? { maxHeight } : null),
      }}
    >
      <div style={styles.headRow}>
        <span style={styles.eyebrow}>Question</span>
        {typeof reward === "number" && (
          <span style={{ ...styles.reward, ...(compact ? styles.rewardCompact : null) }}>
            Reward: {reward} pts
          </span>
        )}
      </div>

      <div
        style={{
          ...styles.body,
          ...textTier(textLen, compact),
          textAlign: long && !compact ? "left" : "center",
        }}
      >
        {blocks.map((b, i) =>
          b.kind === "code" ? (
            <div key={i} style={styles.codeWrap}>
              <div style={styles.codeTag}>CODE</div>
              <pre style={styles.code}>{b.value}</pre>
            </div>
          ) : (
            <div key={i} style={styles.para}>
              {b.value}
            </div>
          )
        )}
      </div>

      {entries.length > 0 && (
        <div style={{ ...styles.opts, ...(grid2col ? styles.optsGrid : null) }}>
          {entries.map(([k, v]) => (
            <div key={k} style={{ ...styles.opt, ...(compact ? styles.optCompact : null) }}>
              <span style={styles.optKey}>{k}</span>
              <span>{String(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  box: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    width: "100%",
    maxWidth: "1100px",
    maxHeight: "46vh",
    overflowY: "auto",
    backgroundColor: colors.surface,
    border: `1px solid ${colors.surfaceBorder}`,
    borderRadius: "1rem",
    padding: "clamp(16px, 3vw, 32px)",
    fontFamily,
  },
  boxCompact: {
    maxHeight: "30vh",
    gap: "10px",
    padding: "12px 16px",
  },
  headRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    width: "100%",
  },
  eyebrow: {
    ...label,
    fontSize: "0.95rem",
    color: colors.muted,
  },
  reward: {
    ...tabular,
    display: "inline-block",
    fontSize: "clamp(1.1rem, 2.6vw, 1.5rem)",
    fontWeight: 800,
    color: colors.bg,
    backgroundColor: colors.gold,
    borderRadius: "999px",
    padding: "6px 24px",
    whiteSpace: "nowrap",
  },
  rewardCompact: {
    fontSize: "0.85rem",
    padding: "4px 16px",
  },
  body: {
    width: "100%",
    fontWeight: 700,
    color: colors.ink,
    whiteSpace: "pre-wrap",
    lineHeight: 1.35,
  },
  para: {
    marginBottom: "0.6em",
  },
  codeWrap: {
    margin: "12px 0",
    border: `1px solid ${colors.surfaceBorder}`,
    borderRadius: "0.75rem",
    overflow: "hidden",
    backgroundColor: colors.bg,
  },
  codeTag: {
    fontSize: "0.7rem",
    fontWeight: 800,
    letterSpacing: "0.25em",
    color: colors.muted,
    padding: "6px 16px",
    borderBottom: `1px solid ${colors.surfaceBorder}`,
    textAlign: "left",
  },
  code: {
    fontFamily: "'Consolas', 'Menlo', monospace",
    fontSize: "0.62em",
    textAlign: "left",
    padding: "14px 18px",
    margin: 0,
    overflowX: "auto",
    whiteSpace: "pre",
    lineHeight: 1.5,
  },
  opts: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    width: "100%",
  },
  optsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
  },
  opt: {
    display: "flex",
    gap: "16px",
    alignItems: "baseline",
    fontSize: "clamp(1.2rem, 2.8vw, 1.6rem)",
    color: colors.ink,
    backgroundColor: colors.bg,
    border: `1px solid ${colors.surfaceBorder}`,
    borderRadius: "0.75rem",
    padding: "12px 20px",
    textAlign: "left",
    lineHeight: 1.4,
  },
  optCompact: {
    fontSize: "0.95rem",
    padding: "8px 14px",
  },
  optKey: {
    fontWeight: 800,
    color: colors.violet,
    minWidth: "2rem",
  },
};
