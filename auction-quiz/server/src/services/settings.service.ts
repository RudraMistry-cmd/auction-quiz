import fs from "fs";
import path from "path";

/**
 * Small persisted-settings store (active theme + auction round length).
 * Survives server restarts so whatever the admin last picked stays the
 * default the next time the system is launched.
 */

const SETTINGS_PATH = path.join(__dirname, "../../data/settings.json");
export const VALID_THEMES = ["default", "bidforc", "sunrise", "terminal"] as const;
export type ThemeName = (typeof VALID_THEMES)[number];

export const MIN_AUCTION_DURATION = 5;
export const MAX_AUCTION_DURATION = 600;
export const DEFAULT_AUCTION_DURATION = 30;

interface Settings {
  theme: ThemeName;
  auctionDuration: number;
}

const DEFAULT_SETTINGS: Settings = {
  theme: "default",
  auctionDuration: DEFAULT_AUCTION_DURATION,
};

function isValidDuration(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_AUCTION_DURATION &&
    value <= MAX_AUCTION_DURATION
  );
}

function readSettings(): Settings {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const raw = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
      if (raw) {
        return {
          theme: VALID_THEMES.includes(raw.theme) ? raw.theme : DEFAULT_SETTINGS.theme,
          auctionDuration: isValidDuration(raw.auctionDuration)
            ? Math.round(raw.auctionDuration)
            : DEFAULT_SETTINGS.auctionDuration,
        };
      }
    }
  } catch (err) {
    console.error("[Settings] Failed to read settings.json:", err);
  }
  return { ...DEFAULT_SETTINGS };
}

function writeSettings(settings: Settings): void {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
  } catch (err) {
    console.error("[Settings] Failed to write settings.json:", err);
  }
}

class SettingsService {
  private settings: Settings;

  constructor() {
    this.settings = readSettings();
  }

  public getTheme(): ThemeName {
    return this.settings.theme;
  }

  public setTheme(theme: string): ThemeName {
    if (!VALID_THEMES.includes(theme as ThemeName)) {
      throw new Error(`Invalid theme: ${theme}`);
    }
    this.settings = { ...this.settings, theme: theme as ThemeName };
    writeSettings(this.settings);
    return this.settings.theme;
  }

  public getAuctionDuration(): number {
    return this.settings.auctionDuration;
  }

  public setAuctionDuration(seconds: number): number {
    const value = Math.round(Number(seconds));
    if (!isValidDuration(value)) {
      throw new Error(
        `Auction duration must be between ${MIN_AUCTION_DURATION} and ${MAX_AUCTION_DURATION} seconds`
      );
    }
    this.settings = { ...this.settings, auctionDuration: value };
    writeSettings(this.settings);
    return this.settings.auctionDuration;
  }
}

export const settingsService = new SettingsService();
