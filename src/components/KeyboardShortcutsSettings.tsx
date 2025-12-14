/**
 * Keyboard Shortcuts Settings Component
 *
 * Modal for viewing and customizing keyboard shortcuts.
 */

import { useState, useCallback, useMemo } from 'react';
import { useKeybindingCapture } from '../hooks/useKeyboardShortcuts';
import { getKeyboardShortcutService } from '../services/keyboardShortcutService';
import {
  formatBinding,
  type KeyBinding,
  type ShortcutCategory,
  type RegisteredShortcut,
} from '../types/shortcuts';
import './KeyboardShortcutsSettings.css';

interface KeyboardShortcutsSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<ShortcutCategory, string> = {
  general: 'General',
  navigation: 'Navigation',
  editor: 'Editor',
  view: 'View',
};

const CATEGORY_ORDER: ShortcutCategory[] = [
  'general',
  'navigation',
  'editor',
  'view',
];

export function KeyboardShortcutsSettings({
  isOpen,
  onClose,
}: KeyboardShortcutsSettingsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const service = getKeyboardShortcutService();
  const isMac = service.isMac;

  // Get shortcuts directly from service (refreshes on render or when refreshKey changes)
  const shortcutsByCategory = useMemo(
    () => service.getShortcutsByCategory(),
    [service, refreshKey]
  );

  // Force refresh when shortcuts change within this modal
  const refreshShortcuts = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // Filter shortcuts based on search
  const filteredByCategory = useMemo(() => {
    if (!searchQuery.trim()) {
      return shortcutsByCategory;
    }

    const query = searchQuery.toLowerCase();
    const filtered = new Map<ShortcutCategory, RegisteredShortcut[]>();

    for (const [category, shortcuts] of shortcutsByCategory) {
      const matching = shortcuts.filter(
        (s) =>
          s.label.toLowerCase().includes(query) ||
          s.description?.toLowerCase().includes(query) ||
          s.id.toLowerCase().includes(query)
      );
      if (matching.length > 0) {
        filtered.set(category, matching);
      }
    }

    return filtered;
  }, [shortcutsByCategory, searchQuery]);

  const handleResetAll = useCallback(() => {
    if (
      confirm(
        'Are you sure you want to reset all keyboard shortcuts to their defaults?'
      )
    ) {
      service.resetAllToDefaults();
      refreshShortcuts();
    }
  }, [service, refreshShortcuts]);

  if (!isOpen) return null;

  return (
    <div className="shortcuts-settings-overlay" onClick={onClose}>
      <div
        className="shortcuts-settings-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shortcuts-settings-header">
          <h2>Keyboard Shortcuts</h2>
          <button className="modal-close-btn" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="shortcuts-settings-search">
          <input
            type="text"
            placeholder="Search shortcuts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
        </div>

        <div className="shortcuts-settings-content">
          {CATEGORY_ORDER.map((category) => {
            const shortcuts = filteredByCategory.get(category);
            if (!shortcuts || shortcuts.length === 0) return null;

            return (
              <div key={category} className="shortcuts-category">
                <h3 className="shortcuts-category-title">
                  {CATEGORY_LABELS[category]}
                </h3>
                <div className="shortcuts-list">
                  {shortcuts.map((shortcut) => (
                    <ShortcutRow
                      key={shortcut.id}
                      shortcut={shortcut}
                      isMac={isMac}
                      isEditing={editingId === shortcut.id}
                      onStartEdit={() => setEditingId(shortcut.id)}
                      onStopEdit={() => setEditingId(null)}
                      onBindingChange={refreshShortcuts}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {filteredByCategory.size === 0 && (
            <div className="shortcuts-empty">
              No shortcuts match your search
            </div>
          )}
        </div>

        <div className="shortcuts-settings-footer">
          <button
            className="btn-secondary"
            onClick={handleResetAll}
          >
            Reset All to Defaults
          </button>
          <button className="btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

interface ShortcutRowProps {
  shortcut: RegisteredShortcut;
  isMac: boolean;
  isEditing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onBindingChange: () => void;
}

function ShortcutRow({
  shortcut,
  isMac,
  isEditing,
  onStartEdit,
  onStopEdit,
  onBindingChange,
}: ShortcutRowProps) {
  const service = getKeyboardShortcutService();
  const [conflict, setConflict] = useState<string | null>(null);

  const activeBinding = service.getActiveBinding(shortcut.id);
  const isCustomized =
    shortcut.userBinding !== undefined && shortcut.userBinding !== null;
  const isDisabled = shortcut.userBinding === null;

  const handleCapture = useCallback(
    (binding: KeyBinding) => {
      // Check for conflicts
      const conflictInfo = service.findConflict(binding, shortcut.id);
      if (conflictInfo) {
        setConflict(
          `This shortcut is already used by "${conflictInfo.existingShortcut.label}"`
        );
        // Still allow the change but show warning
      } else {
        setConflict(null);
      }

      service.setUserBinding(shortcut.id, binding);
      onBindingChange();
      onStopEdit();
    },
    [service, shortcut.id, onStopEdit, onBindingChange]
  );

  const handleReset = useCallback(() => {
    service.resetToDefault(shortcut.id);
    setConflict(null);
    onBindingChange();
  }, [service, shortcut.id, onBindingChange]);

  const handleDisable = useCallback(() => {
    service.setUserBinding(shortcut.id, null);
    setConflict(null);
    onBindingChange();
    onStopEdit();
  }, [service, shortcut.id, onStopEdit, onBindingChange]);

  const { isCapturing, startCapture } = useKeybindingCapture(
    handleCapture,
    onStopEdit
  );

  const handleStartEdit = useCallback(() => {
    onStartEdit();
    startCapture();
  }, [onStartEdit, startCapture]);

  return (
    <div className={`shortcut-row ${isCustomized ? 'customized' : ''}`}>
      <div className="shortcut-info">
        <span className="shortcut-label">{shortcut.label}</span>
        {shortcut.description && (
          <span className="shortcut-description">{shortcut.description}</span>
        )}
      </div>

      <div className="shortcut-binding">
        {isEditing && isCapturing ? (
          <div className="shortcut-capture">
            <span className="shortcut-capture-text">
              Press keys... (Esc to cancel)
            </span>
            <button
              className="shortcut-disable-btn"
              onClick={handleDisable}
              title="Disable shortcut"
            >
              Disable
            </button>
          </div>
        ) : (
          <>
            <button
              className={`shortcut-key-btn ${isDisabled ? 'disabled' : ''}`}
              onClick={handleStartEdit}
              title="Click to change"
            >
              {isDisabled
                ? '(disabled)'
                : activeBinding
                ? formatBinding(activeBinding, isMac)
                : '(none)'}
            </button>

            {isCustomized && (
              <button
                className="shortcut-reset-btn"
                onClick={handleReset}
                title="Reset to default"
              >
                Reset
              </button>
            )}
          </>
        )}
      </div>

      {conflict && <div className="shortcut-conflict">{conflict}</div>}
    </div>
  );
}
