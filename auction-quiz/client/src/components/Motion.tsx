import { motion, type MotionProps } from "framer-motion";
import {
  pageTransition,
  fadeUp,
  scalePop,
  scoreFlash,
  timerPulse,
  winnerReveal,
  hoverScale,
  tapScale,
  staggerContainer,
  staggerItem,
  DURATION,
  EASE,
} from "../utils/motion";

/* ─── Page Wrapper ─── */
export const PageTransition = motion.div;

export const pageMotion: MotionProps = {
  initial: pageTransition.initial,
  animate: pageTransition.animate,
  exit: pageTransition.exit,
  transition: pageTransition.transition,
};

/* ─── Fade In ─── */
export const FadeIn = motion.div;

export const fadeInMotion: MotionProps = {
  variants: fadeUp,
  initial: "hidden",
  animate: "visible",
};

/* ─── Scale Pop (for numbers) ─── */
export const ScalePop = motion.div;

export function useScalePop(isAnimating: boolean): MotionProps {
  return {
    variants: scalePop,
    animate: isAnimating ? "pop" : "idle",
  };
}

/* ─── Score Flash ─── */
export const ScoreFlash = motion.div;

export function useScoreFlash(isFlashing: boolean): MotionProps {
  return {
    variants: scoreFlash,
    animate: isFlashing ? "flash" : "idle",
  };
}

/* ─── Timer Urgency ─── */
export const TimerPulse = motion.div;

export function useTimerPulse(isUrgent: boolean): MotionProps {
  return {
    variants: timerPulse,
    animate: isUrgent ? "urgent" : "normal",
  };
}

/* ─── Winner Reveal ─── */
export const WinnerReveal = motion.div;

export const winnerMotion: MotionProps = {
  variants: winnerReveal,
  initial: "hidden",
  animate: "visible",
};

/* ─── Hover Card ─── */
export const HoverCard = motion.div;

export const hoverCardMotion: MotionProps = {
  whileHover: hoverScale,
  whileTap: tapScale,
  transition: { duration: DURATION.fast, ease: EASE.out },
};

/* ─── Stagger List ─── */
export const StaggerList = motion.div;

export const staggerListMotion: MotionProps = {
  variants: staggerContainer,
  initial: "hidden",
  animate: "visible",
};

export const StaggerItem = motion.div;

export const staggerItemMotion: MotionProps = {
  variants: staggerItem,
};

/* ─── Animated Number Display ─── */
interface AnimatedNumberProps {
  value: number;
  style?: React.CSSProperties;
  format?: (n: number) => string;
}

export function AnimatedNumber({ value, style, format }: AnimatedNumberProps) {
  const displayValue = format ? format(value) : value.toLocaleString();
  return (
    <motion.span
      key={value}
      initial={{ scale: 1, opacity: 1 }}
      animate={{
        scale: [1, 1.08, 1],
        opacity: 1,
      }}
      transition={{ duration: DURATION.base, ease: EASE.out }}
      style={{ display: "inline-block", fontVariantNumeric: "tabular-nums", ...style }}
    >
      {displayValue}
    </motion.span>
  );
}

/* ─── PASS/FAIL Result Animation ─── */
interface ResultAnimationProps {
  result: "pass" | "fail" | null;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function ResultAnimation({ result, children, style }: ResultAnimationProps) {
  return (
    <motion.div
      animate={
        result === "pass"
          ? {
              scale: [1, 1.1, 1],
              boxShadow: [
                "0 0 0 0 rgba(34,197,94,0)",
                "0 0 40px 12px rgba(34,197,94,0.5)",
                "0 0 0 0 rgba(34,197,94,0)",
              ],
            }
          : result === "fail"
          ? {
              x: [0, -8, 8, -6, 6, -3, 3, 0],
            }
          : {}
      }
      transition={{ duration: 0.5, ease: EASE.out }}
      style={style}
    >
      {children}
    </motion.div>
  );
}
