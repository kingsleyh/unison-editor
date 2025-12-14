/**
 * Monaco Document Highlight Provider for Unison
 *
 * Highlights all occurrences of the symbol under cursor.
 * Uses text-based matching with word boundaries.
 *
 * Features:
 * - Highlights all occurrences when cursor is on an identifier
 * - Distinguishes between read and write occurrences
 * - Handles Unison's identifier patterns (including ' and ! suffixes)
 */

import * as monaco from 'monaco-editor';

let isRegistered = false;

/**
 * Register the document highlight provider for Unison language.
 * Only registers once to prevent duplicates.
 */
export function registerDocumentHighlightProvider(): monaco.IDisposable | null {
  if (isRegistered) {
    return null;
  }

  isRegistered = true;

  return monaco.languages.registerDocumentHighlightProvider('unison', {
    provideDocumentHighlights(
      model: monaco.editor.ITextModel,
      position: monaco.Position
    ): monaco.languages.ProviderResult<monaco.languages.DocumentHighlight[]> {
      // Get the word at current position
      // Use custom word definition to handle Unison identifiers (with ' and !)
      const wordInfo = model.getWordAtPosition(position);
      if (!wordInfo) {
        return [];
      }

      const searchWord = wordInfo.word;
      if (!searchWord || searchWord.length < 2) {
        // Don't highlight single characters
        return [];
      }

      const highlights: monaco.languages.DocumentHighlight[] = [];
      const lines = model.getLinesContent();

      // Build regex for word boundary matching
      // Unison identifiers can contain letters, numbers, underscores, and end with ' or !
      const escapedWord = escapeRegex(searchWord);
      // Word boundary that works with Unison identifiers
      const regex = new RegExp(`(?<![\\w'])${escapedWord}(?![\\w'!])`, 'g');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let match;

        while ((match = regex.exec(line)) !== null) {
          const startColumn = match.index + 1;
          const endColumn = startColumn + searchWord.length;

          // Determine if this is a write (assignment) or read
          const kind = isWriteOccurrence(line, match.index, searchWord)
            ? monaco.languages.DocumentHighlightKind.Write
            : monaco.languages.DocumentHighlightKind.Read;

          highlights.push({
            range: {
              startLineNumber: i + 1,
              startColumn,
              endLineNumber: i + 1,
              endColumn,
            },
            kind,
          });
        }

        // Reset regex lastIndex for next line
        regex.lastIndex = 0;
      }

      return highlights;
    },
  });
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Check if the occurrence is a write (definition/assignment).
 * Looks for patterns like:
 * - name = value
 * - name : Type
 * - type Name
 * - ability Name
 */
function isWriteOccurrence(line: string, index: number, word: string): boolean {
  const afterWord = line.substring(index + word.length).trimStart();

  // Check if followed by = (assignment) or : (type signature)
  if (afterWord.startsWith('=') || afterWord.startsWith(':')) {
    // Make sure it's at the start of the line (not in an expression)
    const beforeWord = line.substring(0, index);
    if (beforeWord.trim() === '') {
      return true;
    }
  }

  // Check if this is a type/ability definition
  const beforeWord = line.substring(0, index).trimEnd();
  if (
    beforeWord.endsWith('type') ||
    beforeWord.endsWith('ability') ||
    beforeWord.match(/^(unique\s+|structural\s+)?type\s*$/) ||
    beforeWord.match(/^(unique\s+)?ability\s*$/)
  ) {
    return true;
  }

  return false;
}
