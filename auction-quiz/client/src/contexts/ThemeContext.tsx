import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

type Theme = "default" | "bidforc" | "sunrise" | "terminal";
const VALID_THEMES: Theme[] = ["default", "bidforc", "sunrise", "terminal"];

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem("theme");
    return VALID_THEMES.includes(saved as Theme) ? (saved as Theme) : "default";
  });

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem("theme", newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

/** Apply a server-pushed theme to the document + persist it locally. Safe to
 *  call from any screen's socket listener (state:full sync or a live
 *  theme:changed event) — this is how theme changes reach every route
 *  instantly without each page needing its own copy of this logic. */
export function applyTheme(theme: string): void {
  if (!VALID_THEMES.includes(theme as Theme)) return;
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem("theme", theme);
  } catch {
    /* ignore */
  }
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}

export type { Theme };
