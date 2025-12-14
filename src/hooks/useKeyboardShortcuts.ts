/**
 * React hooks for keyboard shortcuts
 */

import { useEffect, useCallback, useState } from 'react';
import {
  getKeyboardShortcutService,
  type KeyboardShortcutService,
} from '../services/keyboardShortcutService';
import type { RegisteredShortcut, KeyBinding, ShortcutCategory } from '../types/shortcuts';

/**
 * Hook to initialize the keyboard shortcut service and start listening
 * Call this once at the app root (App.tsx)
 */
export function useKeyboardShortcutListener(): KeyboardShortcutService {
  const service = getKeyboardShortcutService();

  useEffect(() => {
    service.startListening();
    return () => service.stopListening();
  }, [service]);

  return service;
}

/**
 * Hook to get all shortcuts and subscribe to changes
 */
export function useKeyboardShortcuts(): {
  shortcuts: RegisteredShortcut[];
  shortcutsByCategory: Map<ShortcutCategory, RegisteredShortcut[]>;
  service: KeyboardShortcutService;
} {
  const service = getKeyboardShortcutService();
  // Version state triggers re-render when shortcuts change
  const [, setVersion] = useState(0);

  // Subscribe to changes
  useEffect(() => {
    return service.subscribe(() => setVersion((v) => v + 1));
  }, [service]);

  // Get shortcuts (will be recalculated when version changes)
  const shortcuts = service.getAllShortcuts();
  const shortcutsByCategory = service.getShortcutsByCategory();

  return { shortcuts, shortcutsByCategory, service };
}

/**
 * Hook to get a specific shortcut and its formatted binding
 */
export function useShortcut(id: string): {
  shortcut: RegisteredShortcut | undefined;
  binding: KeyBinding | null;
  formattedBinding: string;
  setBinding: (binding: KeyBinding | null | undefined) => void;
  resetToDefault: () => void;
} {
  const service = getKeyboardShortcutService();
  // Version state triggers re-render when shortcuts change
  const [, setVersion] = useState(0);

  // Subscribe to changes
  useEffect(() => {
    return service.subscribe(() => setVersion((v) => v + 1));
  }, [service]);

  // Get data (will be recalculated when version changes)
  const shortcut = service.getShortcut(id);
  const binding = service.getActiveBinding(id);
  const formattedBinding = service.formatShortcut(id);

  const setBinding = useCallback(
    (newBinding: KeyBinding | null | undefined) => {
      service.setUserBinding(id, newBinding);
    },
    [service, id]
  );

  const resetToDefault = useCallback(() => {
    service.resetToDefault(id);
  }, [service, id]);

  return { shortcut, binding, formattedBinding, setBinding, resetToDefault };
}

/**
 * Hook for capturing a new keybinding
 * Returns a ref callback to attach to the element that captures keys
 */
export function useKeybindingCapture(
  onCapture: (binding: KeyBinding) => void,
  onCancel: () => void
): {
  isCapturing: boolean;
  startCapture: () => void;
  stopCapture: () => void;
} {
  const [isCapturing, setIsCapturing] = useState(false);

  const startCapture = useCallback(() => {
    setIsCapturing(true);
  }, []);

  const stopCapture = useCallback(() => {
    setIsCapturing(false);
  }, []);

  useEffect(() => {
    if (!isCapturing) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Escape cancels capture
      if (e.key === 'Escape') {
        setIsCapturing(false);
        onCancel();
        return;
      }

      // Ignore modifier-only keys
      if (
        e.key === 'Meta' ||
        e.key === 'Control' ||
        e.key === 'Alt' ||
        e.key === 'Shift'
      ) {
        return;
      }

      // Must have at least one modifier (unless it's a function key)
      const hasModifier = e.metaKey || e.ctrlKey || e.altKey;
      const isFunctionKey = /^F\d+$/.test(e.key);

      if (!hasModifier && !isFunctionKey) {
        // Single key without modifier - not a valid shortcut
        return;
      }

      const binding: KeyBinding = {
        key: e.key.length === 1 ? e.key.toUpperCase() : e.key,
        meta: e.metaKey,
        ctrl: e.ctrlKey,
        alt: e.altKey,
        shift: e.shiftKey,
      };

      setIsCapturing(false);
      onCapture(binding);
    };

    // Use capture phase to intercept before other handlers
    window.addEventListener('keydown', handleKeyDown, { capture: true });

    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [isCapturing, onCapture, onCancel]);

  return { isCapturing, startCapture, stopCapture };
}

/**
 * Hook to check if the platform is Mac
 */
export function useIsMac(): boolean {
  const service = getKeyboardShortcutService();
  return service.isMac;
}
