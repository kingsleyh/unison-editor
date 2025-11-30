import * as monaco from 'monaco-editor';
import { MonacoLspClient } from './monacoLspClient';

/**
 * Register Monaco language providers that communicate with LSP
 */
export function registerLspProviders(
  monacoInstance: typeof monaco,
  lspClient: MonacoLspClient,
  languageId: string = 'unison',
  getDocumentUri?: (monacoUri: string) => string
) {
  // Helper to get the document URI - use the provided mapper or fall back to Monaco URI
  const resolveUri = (monacoUri: string) => {
    return getDocumentUri ? getDocumentUri(monacoUri) : monacoUri;
  };
  // Register Hover Provider
  monacoInstance.languages.registerHoverProvider(languageId, {
    async provideHover(model, position) {
      try {
        const result = await lspClient.sendLspRequest('textDocument/hover', {
          textDocument: {
            uri: resolveUri(model.uri.toString()),
          },
          position: {
            line: position.lineNumber - 1,
            character: position.column - 1,
          },
        });

        if (!result || !result.contents) {
          return null;
        }

        // Handle different content formats
        let contents: monaco.IMarkdownString[];
        if (typeof result.contents === 'string') {
          contents = [{ value: result.contents }];
        } else if (Array.isArray(result.contents)) {
          contents = result.contents.map((c: any) => ({
            value: typeof c === 'string' ? c : c.value,
          }));
        } else if (result.contents.value) {
          contents = [{ value: result.contents.value }];
        } else {
          return null;
        }

        return {
          contents,
          range: result.range ? {
            startLineNumber: result.range.start.line + 1,
            startColumn: result.range.start.character + 1,
            endLineNumber: result.range.end.line + 1,
            endColumn: result.range.end.character + 1,
          } : undefined,
        };
      } catch (error) {
        console.error('Hover provider error:', error);
        return null;
      }
    },
  });

  // Register Completion Provider
  monacoInstance.languages.registerCompletionItemProvider(languageId, {
    async provideCompletionItems(model, position) {
      try {
        const result = await lspClient.sendLspRequest('textDocument/completion', {
          textDocument: {
            uri: resolveUri(model.uri.toString()),
          },
          position: {
            line: position.lineNumber - 1,
            character: position.column - 1,
          },
        });

        if (!result) {
          return { suggestions: [] };
        }

        const items = Array.isArray(result) ? result : result.items || [];

        const suggestions = items.map((item: any) => ({
          label: item.label,
          kind: mapCompletionItemKind(item.kind),
          detail: item.detail,
          documentation: item.documentation,
          insertText: item.insertText || item.label,
          range: undefined,
        }));

        return { suggestions };
      } catch (error) {
        console.error('Completion provider error:', error);
        return { suggestions: [] };
      }
    },
  });

  // Register Definition Provider
  monacoInstance.languages.registerDefinitionProvider(languageId, {
    async provideDefinition(model, position) {
      try {
        const result = await lspClient.sendLspRequest('textDocument/definition', {
          textDocument: {
            uri: resolveUri(model.uri.toString()),
          },
          position: {
            line: position.lineNumber - 1,
            character: position.column - 1,
          },
        });

        if (!result) {
          return null;
        }

        const locations = Array.isArray(result) ? result : [result];

        return locations.map((loc: any) => ({
          uri: monacoInstance.Uri.parse(loc.uri),
          range: {
            startLineNumber: loc.range.start.line + 1,
            startColumn: loc.range.start.character + 1,
            endLineNumber: loc.range.end.line + 1,
            endColumn: loc.range.end.character + 1,
          },
        }));
      } catch (error) {
        console.error('Definition provider error:', error);
        return null;
      }
    },
  });

  // Register Signature Help Provider
  monacoInstance.languages.registerSignatureHelpProvider(languageId, {
    signatureHelpTriggerCharacters: ['(', ','],
    async provideSignatureHelp(model, position) {
      try {
        const result = await lspClient.sendLspRequest('textDocument/signatureHelp', {
          textDocument: {
            uri: resolveUri(model.uri.toString()),
          },
          position: {
            line: position.lineNumber - 1,
            character: position.column - 1,
          },
        });

        if (!result || !result.signatures) {
          return null;
        }

        return {
          value: {
            activeSignature: result.activeSignature || 0,
            activeParameter: result.activeParameter || 0,
            signatures: result.signatures.map((sig: any) => ({
              label: sig.label,
              documentation: sig.documentation,
              parameters: sig.parameters?.map((p: any) => ({
                label: p.label,
                documentation: p.documentation,
              })) || [],
            })),
          },
          dispose: () => {},
        };
      } catch (error) {
        console.error('Signature help provider error:', error);
        return null;
      }
    },
  });

  console.log('LSP providers registered for', languageId);
}

/**
 * Map LSP CompletionItemKind to Monaco CompletionItemKind
 */
function mapCompletionItemKind(kind: number | undefined): monaco.languages.CompletionItemKind {
  if (!kind) return monaco.languages.CompletionItemKind.Text;

  const kindMap: Record<number, monaco.languages.CompletionItemKind> = {
    1: monaco.languages.CompletionItemKind.Text,
    2: monaco.languages.CompletionItemKind.Method,
    3: monaco.languages.CompletionItemKind.Function,
    4: monaco.languages.CompletionItemKind.Constructor,
    5: monaco.languages.CompletionItemKind.Field,
    6: monaco.languages.CompletionItemKind.Variable,
    7: monaco.languages.CompletionItemKind.Class,
    8: monaco.languages.CompletionItemKind.Interface,
    9: monaco.languages.CompletionItemKind.Module,
    10: monaco.languages.CompletionItemKind.Property,
    11: monaco.languages.CompletionItemKind.Unit,
    12: monaco.languages.CompletionItemKind.Value,
    13: monaco.languages.CompletionItemKind.Enum,
    14: monaco.languages.CompletionItemKind.Keyword,
    15: monaco.languages.CompletionItemKind.Snippet,
    16: monaco.languages.CompletionItemKind.Color,
    17: monaco.languages.CompletionItemKind.File,
    18: monaco.languages.CompletionItemKind.Reference,
    19: monaco.languages.CompletionItemKind.Folder,
    20: monaco.languages.CompletionItemKind.EnumMember,
    21: monaco.languages.CompletionItemKind.Constant,
    22: monaco.languages.CompletionItemKind.Struct,
    23: monaco.languages.CompletionItemKind.Event,
    24: monaco.languages.CompletionItemKind.Operator,
    25: monaco.languages.CompletionItemKind.TypeParameter,
  };

  return kindMap[kind] || monaco.languages.CompletionItemKind.Text;
}
