/**
 * Centralized Sound Manager
 * 
 * Preloads all audio files and provides methods to play sounds.
 * Handles anti-spam, overlap prevention, and browser autoplay unlock.
 * Supports admin-controlled enabled/volume settings.
 */

type SoundName = 
  | "auction_start" 
  | "auction_end" 
  | "bid_small" 
  | "bid_big" 
  | "bid_win" 
  | "timer_start" 
  | "timer_end" 
  | "pass" 
  | "fail" 
  | "tick";

const SOUND_FILES: Record<SoundName, string> = {
  auction_start: "/sounds/auction_start.mp3",
  auction_end: "/sounds/auction_end.mp3",
  bid_small: "/sounds/bid_small.mp3",
  bid_big: "/sounds/bid_big.mp3",
  bid_win: "/sounds/bid_win.mp3",
  timer_start: "/sounds/timer_start.mp3",
  timer_end: "/sounds/timer_end.mp3",
  pass: "/sounds/pass.mp3",
  fail: "/sounds/fail.mp3",
  tick: "/sounds/tick.mp3",
};

class SoundManager {
  private sounds: Map<SoundName, HTMLAudioElement> = new Map();
  private unlocked: boolean = false;
  private loading: boolean = false;
  private loaded: boolean = false;
  private enabled: boolean = true;
  private masterVolume: number = 1.0;
  private perSoundEnabled: Map<SoundName, boolean> = new Map();

  /**
   * Preload all audio files. Call once on app start.
   */
  async preload(): Promise<void> {
    if (this.loading || this.loaded) return;
    this.loading = true;

    const promises = Object.entries(SOUND_FILES).map(([name, src]) => {
      return new Promise<void>((resolve) => {
        const audio = new Audio(src);
        audio.preload = "auto";
        audio.volume = this.masterVolume;
        
        audio.oncanplaythrough = () => {
          this.sounds.set(name as SoundName, audio);
          resolve();
        };
        
        audio.onerror = () => {
          console.warn(`[Sound] Failed to load: ${src}`);
          resolve(); // Continue even if one fails
        };

        // Start loading
        audio.load();
      });
    });

    await Promise.all(promises);
    this.loaded = true;
    this.loading = false;
    console.log(`[Sound] Loaded ${this.sounds.size} sounds`);
  }

  /**
   * Unlock audio context on user interaction.
   * Must be called after a user gesture (click, tap, keypress).
   */
  unlock(): void {
    if (this.unlocked) return;

    // Try to play and immediately pause a silent sound to unlock
    const audio = this.sounds.values().next().value;
    if (audio) {
      audio.play().then(() => {
        audio.pause();
        audio.currentTime = 0;
        this.unlocked = true;
        console.log("[Sound] Audio context unlocked");
      }).catch(() => {
        // Will retry on next interaction
      });
    }
  }

  /**
   * Play a sound by name.
   * Prevents overlap by resetting currentTime before playing.
   */
  play(soundName: SoundName): void {
    if (!this.enabled) {
      return;
    }

    // Check per-sound enable/disable
    if (this.perSoundEnabled.has(soundName) && !this.perSoundEnabled.get(soundName)) {
      return;
    }

    if (!this.unlocked) {
      console.warn("[Sound] Audio not unlocked. Call unlock() after user interaction.");
      return;
    }

    const audio = this.sounds.get(soundName);
    if (!audio) {
      console.warn(`[Sound] Sound not found: ${soundName}`);
      return;
    }

    // Prevent overlap
    audio.currentTime = 0;
    audio.volume = this.masterVolume;
    audio.play().catch((err) => {
      console.warn(`[Sound] Failed to play ${soundName}:`, err);
    });
  }

  /**
   * Stop a sound immediately.
   */
  stop(soundName: SoundName): void {
    const audio = this.sounds.get(soundName);
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  }

  /**
   * Stop all playing sounds.
   */
  stopAll(): void {
    this.sounds.forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
  }

  /**
   * Set volume for a specific sound (0.0 to 1.0).
   */
  setVolume(soundName: SoundName, volume: number): void {
    const audio = this.sounds.get(soundName);
    if (audio) {
      audio.volume = Math.max(0, Math.min(1, volume));
    }
  }

  /**
   * Set master volume for all sounds (0.0 to 1.0).
   */
  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    this.sounds.forEach((audio) => {
      audio.volume = this.masterVolume;
    });
  }

  /**
   * Enable or disable all sounds.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stopAll();
    }
  }

  /**
   * Apply settings from admin.
   */
  applySettings(settings: { enabled: boolean; volume: number }): void {
    this.setEnabled(settings.enabled);
    this.setMasterVolume(settings.volume / 100); // Convert 0-100 to 0-1
    console.log(`[Sound] Settings applied: enabled=${settings.enabled}, volume=${settings.volume}%`);
  }

  /**
   * Set per-sound enable/disable.
   */
  setPerSoundEnabled(soundName: string, enabled: boolean): void {
    this.perSoundEnabled.set(soundName as SoundName, enabled);
    console.log(`[Sound] Per-sound setting: ${soundName}=${enabled}`);
  }

  /**
   * Get per-sound enabled state.
   */
  isPerSoundEnabled(soundName: string): boolean {
    if (!this.perSoundEnabled.has(soundName as SoundName)) {
      return true; // Default to enabled
    }
    return this.perSoundEnabled.get(soundName as SoundName) ?? true;
  }

  /**
   * Check if audio is unlocked.
   */
  isUnlocked(): boolean {
    return this.unlocked;
  }

  /**
   * Check if sounds are loaded.
   */
  isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Check if sound is enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get current master volume (0-100).
   */
  getVolume(): number {
    return Math.round(this.masterVolume * 100);
  }
}

// Singleton instance
export const soundManager = new SoundManager();
