/**
 * Small inline stroke-icon set (16/20/24px grid, single consistent style)
 * used in place of emoji across the live screens.
 */
import type { CSSProperties } from "react";

interface IconProps {
  size?: number;
  color?: string;
  style?: CSSProperties;
}

export function CheckCircleIcon({ size = 20, color = "currentColor", style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" />
      <path d="M8 12.5l2.5 2.5L16 9.5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function XCircleIcon({ size = 20, color = "currentColor", style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" />
      <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function TargetIcon({ size = 20, color = "currentColor", style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" />
      <circle cx="12" cy="12" r="5" stroke={color} strokeWidth="2" />
      <circle cx="12" cy="12" r="1.4" fill={color} />
    </svg>
  );
}

export function CrownIcon({ size = 20, color = "currentColor", style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={style}>
      <path d="M4.5 7 2 5.5l1 8.5h18l1-8.5L19.5 7l-3.2-4.4L12 6l-4.3-3.4L4.5 7Z" />
    </svg>
  );
}

export function BoltIcon({ size = 20, color = "currentColor", style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill={color} />
    </svg>
  );
}

export function HourglassIcon({ size = 20, color = "currentColor", style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M6 3h12M6 21h12M7 3c0 5 5 6.5 5 9s-5 4-5 9M17 3c0 5-5 6.5-5 9s5 4 5 9" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FlagIcon({ size = 20, color = "currentColor", style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M5 21V4" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M5 4h13l-3 4 3 4H5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SpeakerIcon({ size = 20, color = "currentColor", style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M11 5 6 9H2v6h4l5 4V5Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function CoinIcon({ size = 20, color = "currentColor", style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
      <circle cx="12" cy="12" r="8" stroke={color} strokeWidth="2" />
      <path d="M12 8v8M9 10.5c0-1 1-1.5 3-1.5s3 .8 3 2-1 1.5-3 1.7-3 .9-3 2 1.3 1.8 3 1.8 3-.5 3-1.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function StarIcon({ size = 20, color = "currentColor", style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M12 2 15 8l6 1-4.5 4.5L17.5 20 12 17l-5.5 3 1-6.5L3 9l6-1 3-6Z" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
