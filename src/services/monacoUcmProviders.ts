import * as monaco from 'monaco-editor';
import { invoke } from '@tauri-apps/api/core';
import { ucmContext } from './ucmContext';
import type { DefinitionSummary, SourceSegment } from '../types/syntax';

// Re-export for consumers
export type { DefinitionSummary, SourceSegment };

/**
 * Monaco Providers powered by UCM API
 *
 * Production-quality IDE features using UCM's HTTP API instead of LSP.
 * Provides: hover, completion, go-to-definition with full codebase context.
 */

// ============================================================================
// Types
// ============================================================================

interface SearchResult {
  name: string;
  type: string;
  hash: string;
}

// ============================================================================
// Built-in Syntax Help Text (from ucm-desktop)
// ============================================================================

const SYNTAX_HELP: Record<string, string> = {
  // Keywords
  'do': '`do` introduces a delayed computation, something with the form `() -> a`.',
  'cases': "It's common to pattern match on a function argument, like `(a -> match a with a1 -> ...)`. `cases` shortens this to `cases a1 -> ...`",
  'match': 'Introduces a way to check a value against a pattern. The expression to the right of `match` is the target value of the match, and the statement(s) following `with` are the potential patterns.',
  'with': 'Introduces a way to check a value against a pattern. The expression to the right of `match` is the target value of the match, and the statement(s) following `with` are the potential patterns.',
  'handle': 'The `handle` keyword indicates that a function is an ability handler. The first argument is an expression performing a particular ability to handle and what follows dictates how the ability should be handled.',
  'ability': 'Introduces an ability definition. The name of the ability follows the keyword and the operations that the ability can perform are listed as function signatures after the `where` keyword.',
  'where': 'Used after an ability name to list the operations that the ability can perform.',
  'if': 'A conditional statement. If the Boolean expression argument is true, the first branch of the statement will be executed, if it is false, the second branch will be run instead.',
  'then': 'A conditional statement. If the Boolean expression argument is true, the first branch of the statement will be executed, if it is false, the second branch will be run instead.',
  'else': 'A conditional statement. If the Boolean expression argument is true, the first branch of the statement will be executed, if it is false, the second branch will be run instead.',
  'use': 'A `use` clause tells Unison to allow identifiers from a given namespace to be used without prefixing in the lexical scope where the use clause appears.',
  'type': 'Introduces a type definition.',
  'unique': 'A unique type modifier. Unique types are identified by their name and structure.',
  'structural': 'A structural type modifier. Structural types are identified only by their structure.',
  'forall': 'Describes a type that is universally quantified.',
  '∀': 'Describes a type that is universally quantified.',
  'let': 'Introduces a local binding.',
  'and': 'Boolean AND operator.',
  'or': 'Boolean OR operator.',
  'true': 'Boolean literal `true`.',
  'false': 'Boolean literal `false`.',
  'True': 'Boolean literal `True`.',
  'False': 'Boolean literal `False`.',

  // Operators/symbols
  '@': "In a pattern match, `@` is an 'as-pattern'. It is a way of binding a variable to an element in the pattern match.",
  '+:': 'List cons operator. Adds an element to the front of a list.',
  ':+': 'List snoc operator. Adds an element to the end of a list.',
  '++': 'List concatenation operator.',
  '->': 'Arrow in a function type or lambda expression.',
  '=>': 'Used in ability handlers.',
  '|': 'Pattern separator in match expressions.',
};

/**
 * Get help text for built-in syntax constructs
 */
function getSyntaxHelp(word: string): string | null {
  return SYNTAX_HELP[word] || null;
}

// ============================================================================
// Performance Cache
// ============================================================================

class ProviderCache<T> {
  private cache = new Map<string, { value: T; timestamp: number }>();
  private ttl: number;

  constructor(ttlMs: number = 30000) {
    this.ttl = ttlMs;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  set(key: string, value: T): void {
    this.cache.set(key, { value, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the word/identifier under the cursor position
 */
function getWordAtPosition(
  model: monaco.editor.ITextModel,
  position: monaco.Position
): string | null {
  const word = model.getWordAtPosition(position);
  if (!word) {
    console.debug('[getWordAtPosition] No word found by Monaco');
    return null;
  }

  // Get the full qualified name if it includes dots
  const lineContent = model.getLineContent(position.lineNumber);

  // Get text before the word starts (not before cursor)
  const beforeWord = lineContent.substring(0, word.startColumn - 1);
  // Get text after the word ends
  const afterWord = lineContent.substring(word.endColumn - 1);

  // Capture dotted prefix (e.g., "base.List." before "map")
  const beforeMatch = beforeWord.match(/[\w.]*$/);
  // Capture dotted suffix (e.g., ".something" after current word)
  const afterMatch = afterWord.match(/^[\w.]*/);

  const before = beforeMatch ? beforeMatch[0] : '';
  const after = afterMatch ? afterMatch[0] : '';

  const fullWord = before + word.word + after;
  console.debug('[getWordAtPosition] Found:', fullWord, '(before:', before, 'word:', word.word, 'after:', after, ')');

  return fullWord;
}

/**
 * Resolve a potentially short name to a fully qualified name using the find API.
 * Returns the best matching FQN, or null if no match found.
 */
async function resolveToFQN(
  projectName: string,
  branchName: string,
  name: string
): Promise<{ fqn: string; hash: string; type: 'term' | 'type' } | null> {
  try {
    // Search for the name using the find API
    const results = await invoke<SearchResult[]>('find_definitions', {
      projectName,
      branchName,
      query: name,
      limit: 10,
    });

    if (!results || results.length === 0) {
      return null;
    }

    // Find exact match or best partial match
    // Prefer exact suffix match (e.g., "andAlso" matches "validation.andAlso")
    for (const result of results) {
      const parts = result.name.split('.');
      const lastPart = parts[parts.length - 1];
      if (lastPart === name || result.name === name) {
        return {
          fqn: result.name,
          hash: result.hash,
          type: result.type as 'term' | 'type',
        };
      }
    }

    // If no exact match, return the first result as best guess
    return {
      fqn: results[0].name,
      hash: results[0].hash,
      type: results[0].type as 'term' | 'type',
    };
  } catch (error) {
    console.error('[resolveToFQN] Error:', error);
    return null;
  }
}

/**
 * Convert UCM source segments to formatted markdown
 */
function segmentsToMarkdown(segments: SourceSegment[]): string {
  const source = segments.map(seg => seg.segment).join('');
  return '```unison\n' + source + '\n```';
}

/**
 * Extract type signature from segments
 */
function extractTypeSignature(segments: SourceSegment[]): string | null {
  // Look for the type signature in the segments (usually after ":")
  const source = segments.map(seg => seg.segment).join('');
  const match = source.match(/:\s*(.+?)(?:\n|$)/);
  return match ? match[1].trim() : null;
}

// ============================================================================
// Hover Provider
// ============================================================================

class UCMHoverProvider implements monaco.languages.HoverProvider {
  private cache = new ProviderCache<monaco.languages.Hover>(30000);
  // Track in-flight requests to prevent duplicate API calls
  private pendingRequests = new Map<string, Promise<monaco.languages.Hover | null>>();

  async provideHover(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    token: monaco.CancellationToken
  ): Promise<monaco.languages.Hover | null> {
    try {
      const word = getWordAtPosition(model, position);
      if (!word) {
        console.debug('[Hover] No word at position');
        return null;
      }

      // Check cache first
      const cacheKey = `${word}`;
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }

      // Check if there's already a pending request for this word
      const pending = this.pendingRequests.get(cacheKey);
      if (pending) {
        return pending;
      }

      // Create the request promise and store it
      const requestPromise = this.doProvideHover(word, model, position, token, cacheKey);
      this.pendingRequests.set(cacheKey, requestPromise);

      try {
        return await requestPromise;
      } finally {
        // Clean up pending request
        this.pendingRequests.delete(cacheKey);
      }
    } catch (error) {
      console.error('Hover provider error:', error);
      return null;
    }
  }

  private async doProvideHover(
    word: string,
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    token: monaco.CancellationToken,
    cacheKey: string
  ): Promise<monaco.languages.Hover | null> {
    try {
      // First, check if it's a built-in syntax construct
      const syntaxHelp = getSyntaxHelp(word);
      if (syntaxHelp) {
        const hover: monaco.languages.Hover = {
          contents: [{ value: syntaxHelp }],
        };
        this.cache.set(cacheKey, hover);
        return hover;
      }

      // Check if it looks like a string literal (inside quotes)
      const lineContent = model.getLineContent(position.lineNumber);
      const beforeCursor = lineContent.substring(0, position.column - 1);

      // Simple check for string literal context
      const inString = (beforeCursor.split('"').length - 1) % 2 === 1;
      if (inString) {
        const hover: monaco.languages.Hover = {
          contents: [{ value: 'The value inside the double quotes is a `Text` literal.' }],
        };
        // Don't cache string literal hovers as position-dependent
        return hover;
      }

      // Check if it's a numeric literal
      if (/^-?\d+(\.\d+)?$/.test(word)) {
        let helpText = 'A numeric literal. ';
        if (word.includes('.')) {
          helpText += 'This is a `Float` value.';
        } else if (word.startsWith('-')) {
          helpText += 'This is an `Int` value (negative integer).';
        } else {
          helpText += 'This is a `Nat` value (natural number). Use `-` prefix for `Int`.';
        }
        const hover: monaco.languages.Hover = {
          contents: [{ value: helpText }],
        };
        return hover;
      }

      // Get current context
      const projectName = ucmContext.getProjectName();
      const branchName = ucmContext.getBranchName();

      if (!projectName || !branchName) {
        console.warn('[Hover] No UCM project/branch context available');
        return null;
      }

      // First, try the exact name as given
      let definition = await invoke<DefinitionSummary | null>('get_definition', {
        projectName,
        branchName,
        name: word,
      });

      // If not found, try to resolve to FQN using find API
      if (!definition && !token.isCancellationRequested) {
        const resolved = await resolveToFQN(projectName, branchName, word);

        if (resolved && !token.isCancellationRequested) {
          definition = await invoke<DefinitionSummary | null>('get_definition', {
            projectName,
            branchName,
            name: resolved.fqn,
          });
        }
      }

      if (!definition || token.isCancellationRequested) {
        return null;
      }

      // Build hover content based on definition type
      const contents: monaco.IMarkdownString[] = [];
      const defType = definition.type; // 'term' or 'type'

      // Check if this is an ability by looking at the source segments
      const sourceText = definition.segments?.map(seg => seg.segment).join('') || '';
      const isAbility = sourceText.startsWith('ability ') || sourceText.includes('ability ');

      if (defType === 'type') {
        // For types, show "type TypeName" or "ability AbilityName"
        if (isAbility) {
          contents.push({
            value: `\`\`\`unison\nability ${definition.name}\n\`\`\``
          });
        } else {
          contents.push({
            value: `\`\`\`unison\ntype ${definition.name}\n\`\`\``
          });
        }
      } else {
        // For terms (functions), show just the signature
        const signature = definition.signature || extractTypeSignature(definition.segments);

        if (signature) {
          // Just show the signature, not the name
          contents.push({
            value: `\`\`\`unison\n${signature}\n\`\`\``
          });
        } else if (definition.segments && definition.segments.length > 0) {
          // Show full source from segments if no signature
          const markdown = segmentsToMarkdown(definition.segments);
          contents.push({
            value: markdown
          });
        }
      }

      // Add documentation if available
      if (definition.documentation) {
        contents.push({
          value: '---\n' + definition.documentation
        });
      }

      // Don't show hash/type info anymore per user request
      // (removed the type/hash line)

      const hover: monaco.languages.Hover = {
        contents,
      };

      // Cache the result
      this.cache.set(cacheKey, hover);

      return hover;
    } catch (error) {
      console.error('Hover provider error:', error);
      return null;
    }
  }
}

// ============================================================================
// Completion Provider
// ============================================================================

class UCMCompletionProvider implements monaco.languages.CompletionItemProvider {
  private cache = new ProviderCache<monaco.languages.CompletionList>(10000);

  // Trigger on any word character or dot
  triggerCharacters = ['.'];

  async provideCompletionItems(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    _context: monaco.languages.CompletionContext,
    token: monaco.CancellationToken
  ): Promise<monaco.languages.CompletionList | null> {
    try {
      // Get the partial word being typed
      const word = model.getWordUntilPosition(position);
      const lineContent = model.getLineContent(position.lineNumber);
      const prefix = lineContent.substring(0, position.column - 1);

      // Extract the full partial identifier (including dots)
      const match = prefix.match(/[\w.]*$/);
      const query = match ? match[0] : word.word;

      if (!query || query.length < 2) {
        return { suggestions: [] };
      }

      // Check cache
      const cacheKey = `${query}`;
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;

      // Get current context
      const projectName = ucmContext.getProjectName();
      const branchName = ucmContext.getBranchName();

      if (!projectName || !branchName) {
        return { suggestions: [] };
      }

      // Search UCM for completions
      const results = await invoke<SearchResult[]>('find_definitions', {
        projectName,
        branchName,
        query,
        limit: 50,
      });

      if (token.isCancellationRequested) {
        return { suggestions: [] };
      }

      // Convert to Monaco completion items
      const suggestions = results.map(result => ({
        label: result.name,
        kind: result.type === 'term'
          ? monaco.languages.CompletionItemKind.Function
          : monaco.languages.CompletionItemKind.Class,
        detail: result.type,
        documentation: {
          value: `Hash: \`${result.hash.substring(0, 8)}...\``
        },
        insertText: result.name.split('.').pop() || result.name,
        range: {
          startLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endLineNumber: position.lineNumber,
          endColumn: word.endColumn,
        },
      }));

      const completionList: monaco.languages.CompletionList = {
        suggestions,
        incomplete: results.length >= 50, // More results may be available
      };

      // Cache the result
      this.cache.set(cacheKey, completionList);

      return completionList;
    } catch (error) {
      console.error('Completion provider error:', error);
      return { suggestions: [] };
    }
  }
}

// ============================================================================
// Definition Provider
// ============================================================================

// Store reference to Monaco editor for getting word at position on click
let monacoEditorInstance: monaco.editor.IStandaloneCodeEditor | null = null;

class UCMDefinitionProvider implements monaco.languages.DefinitionProvider {
  private onDefinitionClick?: (name: string, type: 'term' | 'type') => void;

  setOnDefinitionClick(callback: (name: string, type: 'term' | 'type') => void) {
    this.onDefinitionClick = callback;
  }

  /**
   * Called when user actually cmd+clicks
   * Gets the word at current cursor position and triggers callback immediately
   */
  async triggerDefinitionClick() {
    if (!monacoEditorInstance || !this.onDefinitionClick) {
      console.log('[Definition] No editor or callback available');
      return;
    }

    const position = monacoEditorInstance.getPosition();
    const model = monacoEditorInstance.getModel();

    if (!position || !model) {
      console.log('[Definition] No position or model');
      return;
    }

    const word = getWordAtPosition(model, position);
    if (!word) {
      console.log('[Definition] No word at position');
      return;
    }

    console.log('[Definition] Cmd+click on word:', word);

    // Get context for FQN resolution
    const projectName = ucmContext.getProjectName();
    const branchName = ucmContext.getBranchName();

    if (!projectName || !branchName) {
      console.warn('[Definition] No UCM context, using word as-is');
      // Still trigger callback with the word - let DefinitionStack handle the lookup
      this.onDefinitionClick(word, 'term');
      return;
    }

    // Try to resolve to FQN first for better lookup
    const resolved = await resolveToFQN(projectName, branchName, word);

    if (resolved) {
      console.log('[Definition] Resolved to FQN:', resolved.fqn, 'type:', resolved.type);
      this.onDefinitionClick(resolved.fqn, resolved.type);
    } else {
      // Fall back to the word as-is
      console.log('[Definition] Could not resolve FQN, using word:', word);
      // Guess type based on capitalization (types start with uppercase)
      const guessedType = /^[A-Z]/.test(word) ? 'type' : 'term';
      this.onDefinitionClick(word, guessedType);
    }
  }

  async provideDefinition(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    _token: monaco.CancellationToken
  ): Promise<monaco.languages.Definition | null> {
    // This is called on cmd+hover to show the link preview
    // We don't need to do anything here - just return null
    // The actual definition lookup happens in triggerDefinitionClick
    const word = getWordAtPosition(model, position);
    if (!word) return null;

    console.log('[Definition] provideDefinition called for:', word, '(hover preview only)');

    // Return null - UCM doesn't have file locations
    // The definition panel opening is handled by triggerDefinitionClick
    return null;
  }
}

// ============================================================================
// Signature Help Provider
// ============================================================================

class UCMSignatureHelpProvider implements monaco.languages.SignatureHelpProvider {
  signatureHelpTriggerCharacters = ['(', ' '];
  signatureHelpRetriggerCharacters = [','];

  async provideSignatureHelp(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    token: monaco.CancellationToken,
    _context: monaco.languages.SignatureHelpContext
  ): Promise<monaco.languages.SignatureHelpResult | null> {
    try {
      // Find the function being called
      const lineContent = model.getLineContent(position.lineNumber);
      const beforeCursor = lineContent.substring(0, position.column - 1);

      // Look for function name before the opening parenthesis
      const match = beforeCursor.match(/([\w.]+)\s*\([^)]*$/);
      if (!match) return null;

      const functionName = match[1];

      // Get current context
      const projectName = ucmContext.getProjectName();
      const branchName = ucmContext.getBranchName();

      if (!projectName || !branchName) {
        return null;
      }

      // First try direct lookup
      let definition = await invoke<DefinitionSummary | null>('get_definition', {
        projectName,
        branchName,
        name: functionName,
      });

      // If not found, try to resolve to FQN
      if (!definition && !token.isCancellationRequested) {
        const resolved = await resolveToFQN(projectName, branchName, functionName);
        if (resolved) {
          definition = await invoke<DefinitionSummary | null>('get_definition', {
            projectName,
            branchName,
            name: resolved.fqn,
          });
        }
      }

      if (!definition || token.isCancellationRequested) {
        return null;
      }

      // Extract signature
      const signature = extractTypeSignature(definition.segments);
      if (!signature) return null;

      // Build signature help
      return {
        value: {
          signatures: [
            {
              label: `${functionName} : ${signature}`,
              documentation: definition.documentation,
              parameters: [], // Could parse parameters from signature
            },
          ],
          activeSignature: 0,
          activeParameter: 0,
        },
        dispose: () => {},
      };
    } catch (error) {
      console.error('Signature help provider error:', error);
      return null;
    }
  }
}

// ============================================================================
// Registration
// ============================================================================

// Singleton definition provider instance so we can set callbacks
let definitionProviderInstance: UCMDefinitionProvider | null = null;

export type DefinitionClickCallback = (name: string, type: 'term' | 'type') => void;

/**
 * Set the callback for when user cmd+clicks on a definition
 */
export function setOnDefinitionClick(callback: DefinitionClickCallback): void {
  if (definitionProviderInstance) {
    definitionProviderInstance.setOnDefinitionClick(callback);
    console.log('[UCM] Definition click callback set');
  } else {
    console.warn('[UCM] Definition provider not yet registered');
  }
}

/**
 * Set the Monaco editor instance (needed for getting word at cursor on click)
 */
export function setMonacoEditor(editor: monaco.editor.IStandaloneCodeEditor): void {
  monacoEditorInstance = editor;
  console.log('[UCM] Monaco editor instance set');
}

/**
 * Trigger the definition click callback (call this when user actually cmd+clicks)
 */
export function triggerDefinitionClick(): void {
  if (definitionProviderInstance) {
    definitionProviderInstance.triggerDefinitionClick();
  }
}

/**
 * Register all UCM-powered Monaco providers
 */
export function registerUCMProviders(
  monacoInstance: typeof monaco,
  languageId: string = 'unison'
): void {
  // Register providers
  monacoInstance.languages.registerHoverProvider(
    languageId,
    new UCMHoverProvider()
  );

  monacoInstance.languages.registerCompletionItemProvider(
    languageId,
    new UCMCompletionProvider()
  );

  // Create singleton definition provider
  definitionProviderInstance = new UCMDefinitionProvider();
  monacoInstance.languages.registerDefinitionProvider(
    languageId,
    definitionProviderInstance
  );

  monacoInstance.languages.registerSignatureHelpProvider(
    languageId,
    new UCMSignatureHelpProvider()
  );

  console.log('UCM providers registered for', languageId);
}
