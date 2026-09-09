/**
 * Central Sound Manager (single source of truth for all audio).
 *
 * Rules enforced here:
 * - All sounds preload once (primary → fallback, each probed as .mp3 then
 *   .wav → silent skip if no file exists yet).
 * - playSound() is the ONLY way to play audio; it never throws and never
 *   blocks UI (all rejections are swallowed silently).
 * - Browser autoplay: audio stays locked until the first user gesture.
 *   The Live Display screen (ONLY playback site) unlocks + preloads via its
 *   "Enable Sound" button / first interaction.
 * - Repetitive sounds are throttled (bid_placed 200ms, timer_tick 900ms).
 * - playUnique(eventKey, sound) dedupes the same logical event arriving via
 *   multiple socket events (e.g. auction:bid_update + bid:update).
 * - Global enable/volume persisted to localStorage and overridable by the
 *   admin broadcast (sound:settings / sound:per_setting).
 */

/** Canonical sound types (spec). Legacy aliases are canonicalized. */
export type SoundName =
  | "auction_start"
  | "bid_placed"
  | "bid_win"
  | "timer_tick"
  | "timer_end"
  | "task_pass"
  | "task_fail"
  | "fallback_start"
  | "result_show";

/** Legacy names still used by Admin UI / older code → canonical. */
const ALIASES: Record<string, SoundName> = {
  auction_start: "auction_start",
  auction_end: "result_show",
  bid_small: "bid_placed",
  bid_big: "bid_placed",
  bid_placed: "bid_placed",
  bid: "bid_placed",
  bid_win: "bid_win",
  win: "bid_win",
  timer_start: "fallback_start",
  timer_tick: "timer_tick",
  tick: "timer_tick",
  timer_end: "timer_end",
  pass: "task_pass",
  task_pass: "task_pass",
  fail: "task_fail",
  task_fail: "task_fail",
  lose: "task_fail",
  fallback_start: "fallback_start",
  result_show: "result_show",
};

export function canonicalSound(name: string): SoundName | null {
  return ALIASES[name] ?? null;
}

/** Ordered source bases per sound, as extensionless paths.
 *  Each base is probed as .mp3 then .wav (both fully supported).
 *  Chains cover freshly uploaded wavs (success, task_start, bid_placed, …)
 *  as well as shipped mp3s. */
const SOUND_FILES: Record<SoundName, { sources: string[] }> = {
  auction_start: { sources: ["/sounds/auction_start"] },
  bid_placed: { sources: ["/sounds/bid_small", "/sounds/bid_placed"] },
  bid_win: { sources: ["/sounds/bid_win", "/sounds/success"] },
  timer_tick: { sources: ["/sounds/tick"] },
  timer_end: { sources: ["/sounds/timer_end", "/sounds/auction_end"] },
  task_pass: { sources: ["/sounds/pass", "/sounds/success", "/sounds/bid_win"] },
  task_fail: { sources: ["/sounds/fail", "/sounds/auction_end"] },
  fallback_start: { sources: ["/sounds/timer_start", "/sounds/task_start", "/sounds/auction_start"] },
  result_show: { sources: ["/sounds/auction_end"] },
};

/** Candidate URLs for a base: .mp3 first (smaller/faster), then .wav. */
function baseCandidates(base: string): string[] {
  return [`${base}.mp3`, `${base}.wav`];
}

/** Volume normalization: action blips soft, wins/results stronger. */
const SOUND_VOLUME: Record<SoundName, number> = {
  auction_start: 0.8,
  bid_placed: 0.35,
  bid_win: 0.9,
  timer_tick: 0.25,
  timer_end: 0.9,
  task_pass: 0.8,
  task_fail: 0.8,
  fallback_start: 0.7,
  result_show: 0.75,
};

/** Minimum gap between two plays of the same sound (anti-spam). */
const THROTTLE_MS: Record<SoundName, number> = {
  auction_start: 1500,
  bid_placed: 200,
  bid_win: 1500,
  timer_tick: 900,
  timer_end: 2500,
  task_pass: 1500,
  task_fail: 1500,
  fallback_start: 2500,
  result_show: 1500,
};

const LS_ENABLED = "auc_sound_enabled";
const LS_VOLUME = "auc_sound_volume";

function readEnabled(): boolean {
  try {
    const raw = localStorage.getItem(LS_ENABLED);
    return raw === null ? true : raw === "1";
  } catch {
    return true;
  }
}

function readVolume(): number {
  try {
    const raw = localStorage.getItem(LS_VOLUME);
    const n = raw === null ? 100 : parseInt(raw, 10);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 100;
  } catch {
    return 100;
  }
}

class SoundManager {
  private sounds: Map<SoundName, HTMLAudioElement> = new Map();
  private unlocked = false;
  private loading = false;
  private loaded = false;
  private enabled: boolean = true;
  private masterVolume: number = 1.0; // 0..1
  private perSoundEnabled: Map<string, boolean> = new Map();
  private lastPlay: Map<SoundName, number> = new Map();
  private recentKeys: Map<string, number> = new Map();
  private unlockInstalled = false;
  private warnedMissing: Set<string> = new Set();

  constructor() {
    if (typeof window !== "undefined") {
      this.enabled = readEnabled();
      this.masterVolume = readVolume() / 100;
    }
  }

  /** Load one file with fallback chain; resolves in all cases (never rejects). */
  private loadOne(name: SoundName): Promise<void> {
    // Flatten: every source base probed as .mp3 then .wav.
    const candidates = SOUND_FILES[name].sources.flatMap(baseCandidates);
    return new Promise((resolve) => {
      const attempt = (idx: number) => {
        if (idx >= candidates.length) {
          // Missing file (e.g. not uploaded yet) → skip silently.
          resolve();
          return;
        }
        const audio = new Audio(candidates[idx]);
        audio.preload = "auto";
        const done = () => {
          this.sounds.set(name, audio);
          resolve();
        };
        const fail = () => attempt(idx + 1);
        audio.oncanplaythrough = done;
        audio.onerror = fail;
        try {
          audio.load();
        } catch {
          fail();
        }
        // If already cached, oncanplaythrough may never fire → settle fast.
        setTimeout(() => {
          if (!this.sounds.has(name) && audio.readyState >= 3) done();
        }, 1500);
      };
      attempt(0);
    });
  }

  /** Preload all sounds once. Safe to call repeatedly. */
  async preload(): Promise<void> {
    if (this.loading || this.loaded || typeof window === "undefined") return;
    this.loading = true;
    try {
      await Promise.all(
        (Object.keys(SOUND_FILES) as SoundName[]).map((n) => this.loadOne(n))
      );
    } finally {
      this.loaded = true;
      this.loading = false;
    }
  }

  /**
   * Unlock audio after a user gesture: preload + mark unlocked + warm each
   * element (play → pause → reset) so later plays start instantly and never
   * trip the autoplay block. Must run inside a user gesture (Display-only).
   */
  unlock(): void {
    if (this.unlocked) {
      this.warmUp();
      return;
    }
    this.unlocked = true;
    void this.preload()
      .catch(() => {})
      .finally(() => this.warmUp());
  }

  /** Best-effort warm-up of every loaded element. Silent on failure. */
  private warmUp(): void {
    for (const audio of this.sounds.values()) {
      try {
        const p = audio.play();
        if (p && typeof p.then === "function") {
          p.then(() => {
            try {
              audio.pause();
              audio.currentTime = 0;
            } catch {
              /* ignore */
            }
          }).catch(() => {});
        }
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Install one-time global listeners (first click/key/touch anywhere unlocks
   * audio and preloads). Call ONCE from App. Idempotent.
   */
  installGlobalUnlock(): void {
    if (this.unlockInstalled || typeof document === "undefined") return;
    this.unlockInstalled = true;
    const handler = () => {
      this.unlock();
      document.removeEventListener("click", handler);
      document.removeEventListener("keydown", handler);
      document.removeEventListener("touchstart", handler);
      document.removeEventListener("pointerdown", handler);
    };
    document.addEventListener("click", handler);
    document.addEventListener("keydown", handler);
    document.addEventListener("touchstart", handler);
    document.addEventListener("pointerdown", handler);
  }

  /** Core play: enabled? unlocked? throttled? → reset + play, swallow errors. */
  play(rawName: string): void {
    const name = canonicalSound(rawName);
    if (!name) return;
    if (!this.enabled) return;
    if (this.perSoundEnabled.get(rawName) === false) return;
    if (this.perSoundEnabled.get(name) === false) return;
    if (!this.unlocked) return; // autoplay guard: silently wait for gesture

    const now = Date.now();
    const last = this.lastPlay.get(name) ?? 0;
    if (now - last < THROTTLE_MS[name]) return; // anti-spam throttle
    this.lastPlay.set(name, now);

    const audio = this.sounds.get(name);
    if (!audio) {
      // Audible config signal (once per name): file missing everywhere.
      // Never throws, never spams — subsequent plays stay silent.
      if (!this.warnedMissing.has(name)) {
        this.warnedMissing.add(name);
        console.warn(`[Sound] Sound not found: ${name} (checked .mp3 + .wav sources)`);
      }
      // Missing file or preload pending → try lazy preload.
      void this.preload().catch(() => {});
      return;
    }
    try {
      audio.currentTime = 0;
      audio.volume = Math.max(
        0,
        Math.min(1, SOUND_VOLUME[name] * this.masterVolume)
      );
      const p = audio.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {
      // Failsafe: never break UI on audio errors.
    }
  }

  /**
   * Manual test trigger (Admin Sound Test panel): unlocks audio (click is a
   * user gesture), bypasses enabled/throttle gates so the file itself is
   * verified, and never throws. Local only — no socket involved.
   */
  test(rawName: string): void {
    const name = canonicalSound(rawName);
    if (!name) {
      console.warn(`[Sound] Sound not found: ${rawName} (unknown name)`);
      return;
    }
    this.unlock();
    const audio = this.sounds.get(name);
    if (!audio) {
      if (!this.warnedMissing.has(name)) {
        this.warnedMissing.add(name);
        console.warn(`[Sound] Sound not found: ${name} (checked .mp3 + .wav sources)`);
      }
      void this.preload().catch(() => {});
      return;
    }
    try {
      audio.currentTime = 0;
      audio.volume = Math.max(
        0,
        Math.min(1, SOUND_VOLUME[name] * this.masterVolume)
      );
      const p = audio.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {
      /* ignore */
    }
  }

  /**
   * Dedupe wrapper: same logical event (same key) plays at most once per TTL,
   * no matter how many socket events carried it.
   */
  playUnique(eventKey: string, rawName: string, ttlMs = 2000): void {
    const now = Date.now();
    const last = this.recentKeys.get(eventKey);
    if (last !== undefined && now - last < ttlMs) return;
    this.recentKeys.set(eventKey, now);
    // Bound the map.
    if (this.recentKeys.size > 300) {
      const cutoff = now - 10000;
      for (const [k, t] of this.recentKeys) {
        if (t < cutoff) this.recentKeys.delete(k);
      }
    }
    this.play(rawName);
  }

  stop(rawName: string): void {
    const name = canonicalSound(rawName);
    if (!name) return;
    const audio = this.sounds.get(name);
    if (audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
  }

  stopAll(): void {
    for (const audio of this.sounds.values()) {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    try {
      localStorage.setItem(LS_ENABLED, enabled ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (!enabled) this.stopAll();
  }

  setMasterVolume(volume01: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume01));
    try {
      localStorage.setItem(LS_VOLUME, String(Math.round(this.masterVolume * 100)));
    } catch {
      /* ignore */
    }
  }

  /** Apply admin broadcast settings (volume 0-100). Persists locally. */
  applySettings(settings: { enabled: boolean; volume: number }): void {
    this.setEnabled(settings.enabled);
    const v = Number(settings.volume);
    if (Number.isFinite(v)) this.setMasterVolume(v / 100);
  }

  setPerSoundEnabled(soundName: string, enabled: boolean): void {
    this.perSoundEnabled.set(soundName, enabled);
    const canon = canonicalSound(soundName);
    if (canon && canon !== soundName) this.perSoundEnabled.set(canon, enabled);
  }

  isPerSoundEnabled(soundName: string): boolean {
    const canon = canonicalSound(soundName);
    if (this.perSoundEnabled.has(soundName))
      return this.perSoundEnabled.get(soundName) ?? true;
    if (canon && this.perSoundEnabled.has(canon))
      return this.perSoundEnabled.get(canon) ?? true;
    return true;
  }

  isUnlocked(): boolean {
    return this.unlocked;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getVolume(): number {
    return Math.round(this.masterVolume * 100);
  }
}

// Singleton instance — the ONLY sound controller in the app.
export const soundManager = new SoundManager();

/** Spec alias: playSound(type). */
export function playSound(type: string): void {
  soundManager.play(type);
}

/** Install global first-gesture unlock. Call once from App. */
export function installGlobalSoundUnlock(): void {
  soundManager.installGlobalUnlock();
}
