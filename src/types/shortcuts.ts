/**
 * Keyboard Shortcuts Type Definitions
 *
 * Types for the configurable keyboard shortcuts system.
 */

/**
 * Represents a keyboard binding with modifiers
 */
export interface KeyBinding {
  /** The main key (e.g., 's', 'Enter', 'ArrowRight', '1') */
  key: string;
  /** Meta key (Cmd on Mac, Windows key on Windows) */
  meta: boolean;
  /** Ctrl key */
  ctrl: boolean;
  /** Alt/Option key */
  alt: boolean;
  /** Shift key */
  shift: boolean;
}

/**
 * Category for grouping shortcuts in the UI
 */
export type ShortcutCategory =
  | 'general'     // Save, Command Palette, Settings
  | 'navigation'  // Panel focus, tab switching
  | 'editor'      // Format, run tests, run watches
  | 'view';       // Toggle panels

/**
 * Scope determines where a shortcut is active
 */
export type ShortcutScope =
  | 'global'      // Always active
  | 'editor'      // Only when editor is focused
  | 'terminal';   // Only when terminal is focused

/**
 * Definition of a keyboard shortcut
 */
export interface ShortcutDefinition {
  /** Unique identifier (e.g., 'general.save', 'nav.focusEditor') */
  id: string;
  /** Human-readable label */
  label: string;
  /** Optional description for settings UI */
  description?: string;
  /** Category for grouping in UI */
  category: ShortcutCategory;
  /** Where the shortcut is active */
  scope: ShortcutScope;
  /** Default key binding */
  defaultBinding: KeyBinding;
  /** The action to execute */
  action: () => void | Promise<void>;
  /** Optional condition for when shortcut is available */
  when?: () => boolean;
}

/**
 * Registered shortcut with potential user override
 */
export interface RegisteredShortcut extends ShortcutDefinition {
  /** User's custom binding (undefined = use default, null = disabled) */
  userBinding?: KeyBinding | null;
}

/**
 * User's custom keybinding configuration (stored in localStorage)
 */
export interface UserKeybindingsConfig {
  version: 1;
  /** Map of shortcut ID to custom binding (null = disabled) */
  bindings: Record<string, KeyBinding | null>;
}

/**
 * Conflict information when two shortcuts have the same binding
 */
export interface ShortcutConflict {
  /** The shortcut that already has this binding */
  existingShortcut: ShortcutDefinition;
  /** The binding that conflicts */
  binding: KeyBinding;
}

/**
 * Command for the Command Palette
 */
export interface PaletteCommand {
  /** Unique identifier */
  id: string;
  /** Display label */
  label: string;
  /** Category for grouping */
  category?: string;
  /** Current keybinding (formatted for display) */
  keybinding?: string;
  /** The action to execute */
  execute: () => void | Promise<void>;
  /** Optional condition for when command is available */
  when?: () => boolean;
}

/**
 * Helper to create a KeyBinding from a shorthand string
 * E.g., 'Cmd+S', 'Ctrl+Shift+P', 'Alt+1'
 */
export function parseBindingString(str: string): KeyBinding {
  const parts = str.split('+').map(p => p.trim().toLowerCase());
  const key = parts[parts.length - 1];

  return {
    key: normalizeKey(key),
    meta: parts.includes('cmd') || parts.includes('meta'),
    ctrl: parts.includes('ctrl'),
    alt: parts.includes('alt') || parts.includes('option'),
    shift: parts.includes('shift'),
  };
}

/**
 * Normalize key names for consistency
 */
function normalizeKey(key: string): string {
  const keyMap: Record<string, string> = {
    'arrowright': 'ArrowRight',
    'arrowleft': 'ArrowLeft',
    'arrowup': 'ArrowUp',
    'arrowdown': 'ArrowDown',
    'enter': 'Enter',
    'escape': 'Escape',
    'tab': 'Tab',
    'space': ' ',
    'backspace': 'Backspace',
    'delete': 'Delete',
    'pageup': 'PageUp',
    'pagedown': 'PageDown',
    'home': 'Home',
    'end': 'End',
  };

  return keyMap[key.toLowerCase()] || key.toUpperCase();
}

/**
 * Format a KeyBinding for display
 * Uses platform-appropriate modifier symbols
 */
export function formatBinding(binding: KeyBinding, isMac: boolean): string {
  const parts: string[] = [];

  if (isMac) {
    if (binding.ctrl) parts.push('Ctrl');
    if (binding.alt) parts.push('\u2325'); // Option symbol
    if (binding.shift) parts.push('\u21E7'); // Shift symbol
    if (binding.meta) parts.push('\u2318'); // Cmd symbol
  } else {
    if (binding.ctrl) parts.push('Ctrl');
    if (binding.alt) parts.push('Alt');
    if (binding.shift) parts.push('Shift');
    if (binding.meta) parts.push('Win');
  }

  // Format the key nicely
  let keyDisplay = binding.key;
  if (keyDisplay === ' ') keyDisplay = 'Space';
  if (keyDisplay === 'ArrowRight') keyDisplay = isMac ? '\u2192' : 'Right';
  if (keyDisplay === 'ArrowLeft') keyDisplay = isMac ? '\u2190' : 'Left';
  if (keyDisplay === 'ArrowUp') keyDisplay = isMac ? '\u2191' : 'Up';
  if (keyDisplay === 'ArrowDown') keyDisplay = isMac ? '\u2193' : 'Down';
  if (keyDisplay === 'Enter') keyDisplay = isMac ? '\u21A9' : 'Enter';
  if (keyDisplay === 'Escape') keyDisplay = 'Esc';
  if (keyDisplay === 'Backspace') keyDisplay = isMac ? '\u232B' : 'Backspace';
  if (keyDisplay === 'Delete') keyDisplay = isMac ? '\u2326' : 'Del';

  parts.push(keyDisplay);

  return isMac ? parts.join('') : parts.join('+');
}

/**
 * Check if two bindings are equivalent
 */
export function bindingsEqual(a: KeyBinding, b: KeyBinding): boolean {
  return (
    a.key.toLowerCase() === b.key.toLowerCase() &&
    a.meta === b.meta &&
    a.ctrl === b.ctrl &&
    a.alt === b.alt &&
    a.shift === b.shift
  );
}

/**
 * Create a KeyBinding from a KeyboardEvent
 */
export function bindingFromEvent(event: KeyboardEvent): KeyBinding {
  return {
    key: event.key.length === 1 ? event.key.toUpperCase() : event.key,
    meta: event.metaKey,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
  };
}

/**
 * Map from event.code to the logical key name
 * Used when Option/Alt modifies the character output (e.g., Option+2 = ™ on Mac)
 */
function codeToKey(code: string): string | null {
  // Digit keys
  if (code.startsWith('Digit')) return code.charAt(5);
  // Letter keys
  if (code.startsWith('Key')) return code.substring(3);
  // Special keys
  const codeMap: Record<string, string> = {
    'Slash': '/',
    'Backslash': '\\',
    'BracketLeft': '[',
    'BracketRight': ']',
    'Semicolon': ';',
    'Quote': "'",
    'Comma': ',',
    'Period': '.',
    'Minus': '-',
    'Equal': '=',
    'Backquote': '`',
  };
  return codeMap[code] || null;
}

/**
 * Check if a KeyboardEvent matches a KeyBinding
 * On Mac, treats Cmd as the primary modifier
 * On Windows/Linux, treats Ctrl as the primary modifier
 */
export function eventMatchesBinding(
  event: KeyboardEvent,
  binding: KeyBinding,
  isMac: boolean
): boolean {
  // Normalize the key comparison
  // On Mac, Option+key produces special characters, so we also check event.code
  const eventKey = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  const bindingKey = binding.key.length === 1 ? binding.key.toUpperCase() : binding.key;

  let keyMatches = eventKey === bindingKey;

  // If key doesn't match and Alt is pressed, try matching via event.code
  // This handles Mac's Option+key producing special characters
  if (!keyMatches && event.altKey) {
    const codeKey = codeToKey(event.code);
    if (codeKey) {
      const normalizedCodeKey = codeKey.length === 1 ? codeKey.toUpperCase() : codeKey;
      keyMatches = normalizedCodeKey === bindingKey;
    }
  }

  if (!keyMatches) return false;

  // Check modifiers
  // On Mac: meta = Cmd, ctrl = Ctrl
  // On Windows/Linux: meta = Win key (rarely used), ctrl = Ctrl
  // For cross-platform shortcuts, we use meta on Mac and ctrl on Windows

  if (binding.meta) {
    // Binding wants the "primary" modifier (Cmd on Mac, Ctrl on Win/Linux)
    if (isMac) {
      if (!event.metaKey) return false;
    } else {
      // On Windows/Linux, meta binding means Ctrl
      if (!event.ctrlKey) return false;
    }
  } else {
    // No meta in binding - make sure it's not pressed
    if (isMac && event.metaKey) return false;
  }

  // Ctrl is always explicit Ctrl (rarely used on Mac)
  if (binding.ctrl !== event.ctrlKey) {
    // Exception: on Windows, we already checked ctrl for meta bindings
    if (isMac || !binding.meta) {
      return false;
    }
  }

  if (binding.alt !== event.altKey) return false;
  if (binding.shift !== event.shiftKey) return false;

  return true;
}
