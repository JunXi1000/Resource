import { createContext, useEffect, useState } from "react";
import type { FC, ReactNode } from "react";
import type { ColorTheme } from "@/components/theme/helpers/themes";
import { loadTheme } from "@/components/theme/helpers/themes";

// Looseleaf is a light-only paper theme. Dark mode was removed on purpose:
// the app always renders the light paper palette regardless of OS preference.
interface IThemeContext {
  colorTheme: ColorTheme;
  setColorTheme: (theme: ColorTheme) => void;
}

export const ThemeContext = createContext<IThemeContext | undefined>(undefined);

interface IThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: FC<IThemeProviderProps> = ({ children }) => {
  const [colorTheme, setColorThemeState] = useState<ColorTheme>(() => {
    const saved = localStorage.getItem("color-theme");
    return (saved as ColorTheme) || "default";
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark");
    root.classList.add("light");
    localStorage.removeItem("theme-mode");
  }, []);

  // Load color theme CSS
  useEffect(() => {
    loadTheme(colorTheme).catch((error) => {
      console.error("Failed to load theme:", error);
    });
  }, [colorTheme]);

  const setColorTheme = (newTheme: ColorTheme) => {
    setColorThemeState(newTheme);
    localStorage.setItem("color-theme", newTheme);
  };

  return (
    <ThemeContext.Provider value={{ colorTheme, setColorTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
