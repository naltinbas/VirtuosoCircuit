import { STORAGE_PREFIX } from "../app/Config";

/** The slice of the Storage interface the game uses. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * localStorage when it exists and a write actually goes through. Private
 * browsing modes expose the object and then throw on setItem, so the probe
 * write is the only way to know.
 */
export function safeLocalStorage(): StorageLike | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const probe = `${STORAGE_PREFIX}probe`;
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

/** A store that lives for the session only. Used when localStorage is refused. */
export function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}
