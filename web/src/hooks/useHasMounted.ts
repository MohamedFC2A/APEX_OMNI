import { useEffect, useState, useMemo } from "react";

// Import translations
import enMessages from "../../messages/en.json";
import arMessages from "../../messages/ar.json";

export type Locale = "ar" | "en";
type Messages = typeof enMessages;

const translations: Record<Locale, Messages> = {
  en: enMessages,
  ar: arMessages,
};

/**
 * Custom hook to check if component has mounted on client
 * Useful for preventing hydration errors with localStorage or other client-only APIs
 */
export function useHasMounted() {
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  return hasMounted;
}

/**
 * Hook for safely accessing localStorage with SSR support
 */
export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === "undefined") {
      return initialValue;
    }
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  };

  return [storedValue, setValue] as const;
}

/**
 * Hook for detecting language preference with SSR support and translations
 */
export function useLanguage() {
  const [language, setLanguage] = useState<"ar" | "en">(() => {
    if (typeof window === "undefined") {
      return "en";
    }
    const saved = window.localStorage.getItem("nexus-language");
    if (saved === "ar" || saved === "en") {
      return saved;
    }
    // Detect browser language
    const browserLang = navigator.language.toLowerCase();
    return browserLang.startsWith("ar") ? "ar" : "en";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("nexus-language", language);
      document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
      document.documentElement.lang = language;
      
      // Add RTL class to body for additional styling support
      if (language === "ar") {
        document.documentElement.classList.add("rtl");
      } else {
        document.documentElement.classList.remove("rtl");
      }
    }
  }, [language]);

  const toggleLanguage = () => {
    setLanguage((prev) => (prev === "ar" ? "en" : "ar"));
  };

  // Memoize messages to prevent unnecessary re-renders
  const messages = useMemo(() => translations[language], [language]);

  // Translation function with nested key support
  const t = useMemo(() => {
    return (key: string, replacements?: Record<string, string | number>): string => {
      const keys = key.split(".");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let value: any = messages;
      
      for (const k of keys) {
        if (value && typeof value === "object" && k in value) {
          value = value[k];
        } else {
          console.warn(`Translation key not found: ${key}`);
          return key;
        }
      }
      
      if (typeof value !== "string") {
        console.warn(`Translation value is not a string: ${key}`);
        return key;
      }
      
      // Replace placeholders like {min} with actual values
      if (replacements) {
        return Object.entries(replacements).reduce(
          (str, [placeholder, replacement]) => 
            str.replace(new RegExp(`\\{${placeholder}\\}`, "g"), String(replacement)),
          value
        );
      }
      
      return value;
    };
  }, [messages]);

  return { language, setLanguage, toggleLanguage, t, messages };
}

