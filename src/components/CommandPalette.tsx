/**
 * Command Palette Component
 *
 * VSCode-style command palette with fuzzy search and keyboard navigation.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { getKeyboardShortcutService } from '../services/keyboardShortcutService';
import type { PaletteCommand } from '../types/shortcuts';
import './CommandPalette.css';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Simple fuzzy search scoring
 * Returns a score (higher = better match), or -1 if no match
 */
function fuzzyMatch(text: string, query: string): number {
  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();

  // Exact match - highest score
  if (textLower === queryLower) return 100;

  // Starts with query - high score
  if (textLower.startsWith(queryLower)) return 80;

  // Contains query as substring - medium score
  if (textLower.includes(queryLower)) return 60;

  // Fuzzy character match - accumulate score
  let score = 0;
  let queryIndex = 0;
  let lastMatchIndex = -1;

  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      // Consecutive matches get bonus
      if (lastMatchIndex === i - 1) {
        score += 10;
      } else {
        score += 5;
      }
      lastMatchIndex = i;
      queryIndex++;
    }
  }

  // All query characters must be found
  if (queryIndex === queryLower.length) {
    return score;
  }

  return -1;
}

/**
 * Search and rank commands based on query
 */
function searchCommands(
  commands: PaletteCommand[],
  query: string
): PaletteCommand[] {
  if (!query.trim()) {
    // No query - return all commands, grouped by category
    return commands;
  }

  const results: { command: PaletteCommand; score: number }[] = [];

  for (const command of commands) {
    // Try matching against label
    let score = fuzzyMatch(command.label, query);

    // Also try matching against category
    if (command.category) {
      const categoryScore = fuzzyMatch(command.category, query);
      if (categoryScore > score) {
        score = categoryScore * 0.8; // Category matches slightly lower priority
      }
    }

    // Also try matching against id
    const idScore = fuzzyMatch(command.id, query);
    if (idScore > score) {
      score = idScore * 0.7; // ID matches even lower priority
    }

    if (score > 0) {
      results.push({ command, score });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results.map((r) => r.command);
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const service = getKeyboardShortcutService();

  // Get all commands from the service
  // Note: We recalculate when isOpen changes to ensure we get the latest actions
  // (actions are wired up after initial mount)
  const allCommands = useMemo(() => service.getPaletteCommands(), [service, isOpen]);

  // Filter commands based on query
  const filteredCommands = useMemo(
    () => searchCommands(allCommands, query),
    [allCommands, query]
  );

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      // Focus input after modal renders
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands.length]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const selectedItem = list.children[selectedIndex] as HTMLElement;
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Execute the selected command
  const executeCommand = useCallback(
    (command: PaletteCommand) => {
      onClose();
      // Execute after closing to ensure clean state
      requestAnimationFrame(() => {
        try {
          const result = command.execute();
          if (result instanceof Promise) {
            result.catch((err) => {
              console.error('[CommandPalette] Error executing command:', err);
            });
          }
        } catch (err) {
          console.error('[CommandPalette] Error executing command:', err);
        }
      });
    },
    [onClose]
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) =>
            Math.min(i + 1, filteredCommands.length - 1)
          );
          break;

        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;

        case 'Enter':
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            executeCommand(filteredCommands[selectedIndex]);
          }
          break;

        case 'Escape':
          e.preventDefault();
          onClose();
          break;

        case 'Tab':
          // Prevent tab from moving focus out of the palette
          e.preventDefault();
          break;
      }
    },
    [filteredCommands, selectedIndex, executeCommand, onClose]
  );

  if (!isOpen) return null;

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div
        className="command-palette"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="command-palette-input-container">
          <span className="command-palette-icon">&gt;</span>
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            placeholder="Type a command..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className="command-palette-list" ref={listRef}>
          {filteredCommands.length === 0 ? (
            <div className="command-palette-empty">No commands found</div>
          ) : (
            filteredCommands.map((command, index) => (
              <CommandItem
                key={command.id}
                command={command}
                isSelected={index === selectedIndex}
                onClick={() => executeCommand(command)}
                onMouseEnter={() => setSelectedIndex(index)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

interface CommandItemProps {
  command: PaletteCommand;
  isSelected: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}

function CommandItem({
  command,
  isSelected,
  onClick,
  onMouseEnter,
}: CommandItemProps) {
  return (
    <div
      className={`command-palette-item ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      <div className="command-palette-item-content">
        <span className="command-palette-item-label">{command.label}</span>
        {command.category && (
          <span className="command-palette-item-category">
            {command.category}
          </span>
        )}
      </div>
      {command.keybinding && (
        <span className="command-palette-item-keybinding">
          {command.keybinding}
        </span>
      )}
    </div>
  );
}
