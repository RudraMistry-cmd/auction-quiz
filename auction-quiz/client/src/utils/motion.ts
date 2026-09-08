import { type Variants, type Transition, type TargetAndTransition } from "framer-motion";

/* ─── Timing Constants ─── */
export const DURATION = {
  fast: 0.2,
  base: 0.3,
  slow: 0.4,
  reveal: 0.6,
} as const;

export const EASE = {
  out: "easeOut",
  inOut: "easeInOut",
  spring: [0.34, 1.56, 0.64, 1],
} as const;

/* ─── Page Transitions ─── */
export const pageTransition = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: DURATION.base, ease: EASE.out },
};

/* ─── Fade Variants ─── */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

export const fadeScale: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1 },
};

/* ─── Scale Pop (for numbers) ─── */
export const scalePop: Variants = {
  idle: { scale: 1 },
  pop: {
    scale: [1, 1.08, 1],
    transition: { duration: DURATION.base, ease: EASE.out },
  },
};

/* ─── Score Flash ─── */
export const scoreFlash: Variants = {
  idle: { scale: 1, boxShadow: "0 0 0 0 rgba(212,175,55,0)" },
  flash: {
    scale: [1, 1.05, 1],
    boxShadow: [
      "0 0 0 0 rgba(212,175,55,0)",
      "0 0 24px 4px rgba(212,175,55,0.3)",
      "0 0 0 0 rgba(212,175,55,0)",
    ],
    transition: { duration: 0.5, ease: EASE.out },
  },
};

/* ─── Timer Urgency Pulse ─── */
export const timerPulse: Variants = {
  normal: { scale: 1 },
  urgent: {
    scale: [1, 1.04, 1],
    transition: { duration: 0.8, repeat: Infinity, ease: EASE.out },
  },
};

/* ─── Winner Reveal ─── */
export const winnerReveal: Variants = {
  hidden: { opacity: 0, scale: 0.6 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: DURATION.reveal, ease: EASE.out },
  },
};

export const winnerGlow: TargetAndTransition = {
  boxShadow: [
    "0 0 0 0 rgba(34,197,94,0)",
    "0 0 60px 20px rgba(34,197,94,0.4)",
    "0 0 30px 10px rgba(34,197,94,0.2)",
  ],
};

/* ─── PASS Animation ─── */
export const passAnimation: TargetAndTransition = {
  scale: [1, 1.1, 1],
  boxShadow: [
    "0 0 0 0 rgba(34,197,94,0)",
    "0 0 40px 12px rgba(34,197,94,0.5)",
    "0 0 0 0 rgba(34,197,94,0)",
  ],
};

/* ─── FAIL Animation ─── */
export const failAnimation: TargetAndTransition = {
  x: [0, -8, 8, -6, 6, -3, 3, 0],
  transition: { duration: 0.5, ease: EASE.out },
};

/* ─── Hover Scale ─── */
export const hoverScale: TargetAndTransition = {
  scale: 1.02,
  transition: { duration: DURATION.fast, ease: EASE.out },
};

export const tapScale: TargetAndTransition = {
  scale: 0.98,
};

/* ─── List Reorder (for scoreboard) ─── */
export const listReorder: Transition = {
  type: "spring",
  stiffness: 300,
  damping: 30,
};

/* ─── Stagger Children ─── */
export const staggerContainer: Variants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
    },
  },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE.out } },
};
