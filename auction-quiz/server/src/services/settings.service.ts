import fs from "fs";
import path from "path";

/**
 * Small persisted-settings store (currently just the active theme). Survives
 * server restarts so whichever theme the admin last picked stays the
 * default the next time the system is launched.
 */

const SETTINGS_PATH = path.join(__dirname, "../../data/settings.json");
export const VALID_THEMES = ["default", "bidforc", "sunrise", "terminal"] as const;
export type ThemeName = (typeof VALID_THEMES)[number];

interface Settings {
  theme: ThemeName;
}

const DEFAULT_SETTINGS: Settings = { theme: "default" };

function readSettings(): Settings {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const raw = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
      if (raw && VALID_THEMES.includes(raw.theme)) {
        return { theme: raw.theme };
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
}

export const settingsService = new SettingsService();
