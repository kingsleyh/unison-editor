# Monaco Editor Integration Architecture

## Overview

The Unison editor uses a **hybrid approach** combining UCM's HTTP API with LSP for optimal IDE features:

- **UCM API**: Provides rich codebase-aware features (hover, completion, go-to-definition)
- **LSP**: Provides live diagnostics and type checking for scratch files

This architecture gives you the best of both worlds: full codebase context from UCM, plus real-time validation from LSP.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Monaco Editor                           │
│  ┌───────────────────────────────────────────────────────┐  │
│  │            Editor Component (Editor.tsx)              │  │
│  └───────────────────────────────────────────────────────┘  │
│                    │                 │                       │
│                    ▼                 ▼                       │
│     ┌──────────────────┐   ┌─────────────────┐             │
│     │  UCM Providers   │   │  LSP Connection │             │
│     │  (monacoUcmPro-  │   │  (monacoLspCli- │             │
│     │   viders.ts)     │   │   ent.ts)       │             │
│     └──────────────────┘   └─────────────────┘             │
│              │                      │                        │
└──────────────┼──────────────────────┼────────────────────────┘
               │                      │
               ▼                      ▼
    ┌──────────────────┐   ┌─────────────────────┐
    │   UCM Context    │   │  WebSocket Proxy     │
    │   (ucmContext.   │   │  (Rust/Tauri)        │
    │    ts)           │   │  Port 5758           │
    └──────────────────┘   └─────────────────────┘
               │                      │
               ▼                      ▼
    ┌──────────────────┐   ┌─────────────────────┐
    │  Tauri Commands  │   │  UCM LSP Server      │
    │  (commands.rs)   │   │  (TCP Port 5757)     │
    └──────────────────┘   └─────────────────────┘
               │
               ▼
    ┌──────────────────┐
    │  UCM HTTP API    │
    │  (Port 5858)     │
    └──────────────────┘
```

## Components

### 1. UCM Context Service (`src/services/ucmContext.ts`)

Manages the current UCM project/branch context:
- Polls UCM for current context every 5 seconds
- Notifies listeners of context changes
- Provides centralized access to project/branch/path

**Key Methods:**
- `initialize()` - Start context polling
- `getProjectName()` - Get current project
- `getBranchName()` - Get current branch
- `onChange(listener)` - Subscribe to context changes

### 2. UCM Monaco Providers (`src/services/monacoUcmProviders.ts`)

Implements Monaco language features using UCM API:

**Hover Provider:**
- Shows type signatures and documentation
- Uses `get_definition` UCM API
- 30-second cache for performance
- Formats signatures as markdown code blocks

**Completion Provider:**
- Provides intelligent autocomplete
- Uses `find_definitions` UCM API with search
- 10-second cache for fast typing
- Triggers on word characters and dots
- Returns up to 50 completions

**Definition Provider:**
- Go-to-definition support (returns null for now - see Future Enhancements)
- Queries `get_definition` UCM API
- Could be extended with location mapping

**Signature Help Provider:**
- Shows function parameter hints
- Parses function calls to extract name
- Displays full type signature

**Performance Features:**
- Intelligent caching with configurable TTL
- Cancellation token support for abandoned requests
- Parallel API calls where possible

### 3. LSP Integration (`src/services/monacoLspClient.ts`)

Maintains connection to UCM's LSP server:
- **Only used for diagnostics** (type errors, parse errors)
- Connects via WebSocket proxy (port 5758)
- Sends `textDocument/didOpen` for file analysis
- Receives `textDocument/publishDiagnostics` for errors

**Why keep LSP?**
- Real-time type checking as you type
- Parse error detection
- Works on scratch files before they're saved
- Complements UCM API nicely

### 4. Editor Component (`src/components/Editor.tsx`)

Main editor integration:
- Initializes UCM context on mount
- Registers UCM providers for IDE features
- Connects LSP for diagnostics only
- Shows status indicators for both systems

## API Usage

### UCM API Endpoints Used:

1. **`GET /codebase/api/ucm/current`**
   - Get current project/branch/path context
   - Used by: UCM Context Service

2. **`GET /codebase/api/projects/{project}/branches/{branch}/getDefinition?names={name}`**
   - Get full definition with source and docs
   - Used by: Hover Provider, Signature Help Provider
   - Returns: Type signature, source segments, documentation

3. **`GET /codebase/api/projects/{project}/branches/{branch}/find?query={query}&limit={limit}`**
   - Search for definitions by name/pattern
   - Used by: Completion Provider
   - Returns: Matching terms and types with hashes

## Performance Characteristics

### Response Times (typical):
- **Hover**: 10-50ms (cached) / 100-300ms (network)
- **Completion**: 20-100ms (due to search)
- **Context refresh**: 50-200ms every 5 seconds (background)

### Caching Strategy:
- **Hover**: 30-second TTL (definitions don't change often)
- **Completion**: 10-second TTL (faster invalidation for active editing)
- **Context**: Polling-based with change detection

### Network Optimization:
- Cancellation tokens prevent wasted requests
- Cache prevents duplicate API calls
- Parallel provider registration
- Debounced completion triggers (via Monaco)

## Future Enhancements

### Short-term:
1. **Go-to-definition location mapping**
   - Build file location index from workspace
   - Map definitions to actual file positions
   - Enable Cmd+Click navigation

2. **Enhanced diagnostics**
   - Merge LSP diagnostics with UCM API errors
   - Show warnings from UCM

3. **Context-aware completion**
   - Filter completions by scope
   - Rank by relevance/usage
   - Include import suggestions

### Long-term:
1. **Semantic highlighting**
   - Color code by term type (function, type, constructor)
   - Show hash changes visually
   - Indicate term status (test, doc, plain)

2. **Inline documentation**
   - Doc previews in editor
   - Example usage from docs
   - Related terms suggestions

3. **Dependency graph navigation**
   - Visual dependency browser
   - Show dependents on hover
   - Navigate to dependencies

## Development

### Adding a New Provider:

```typescript
class MyProvider implements monaco.languages.SomeProvider {
  private cache = new ProviderCache<ResultType>(30000);

  async provideSomething(model, position, token) {
    try {
      // 1. Check cache
      const cached = this.cache.get(key);
      if (cached) return cached;

      // 2. Get UCM context
      const projectName = ucmContext.getProjectName();
      const branchName = ucmContext.getBranchName();
      if (!projectName || !branchName) return null;

      // 3. Query UCM API
      const result = await invoke('some_command', {
        projectName,
        branchName,
        // ... params
      });

      // 4. Check cancellation
      if (token.isCancellationRequested) return null;

      // 5. Transform result
      const transformed = transformResult(result);

      // 6. Cache and return
      this.cache.set(key, transformed);
      return transformed;
    } catch (error) {
      console.error('Provider error:', error);
      return null;
    }
  }
}

// Register in monacoUcmProviders.ts
monaco.languages.registerSomeProvider('unison', new MyProvider());
```

### Testing:

1. **Test hover**: Hover over terms in different files
2. **Test completion**: Type partial names and verify suggestions
3. **Test context changes**: Switch branches and verify completions update
4. **Test cache**: Hover same term twice, verify second is instant
5. **Test error handling**: Disconnect UCM and verify graceful degradation

## Troubleshooting

### Hover not working:
- Check UCM context status (should show "UCM: Ready")
- Verify project/branch context is set (check console logs)
- Ensure UCM is running and accessible (port 5858)
- Check browser console for API errors

### Completions not appearing:
- Type at least 2 characters
- Check if UCM context is initialized
- Verify find_definitions API is accessible
- Check cache if results seem stale

### LSP diagnostics not showing:
- Check LSP connection status (should show green checkmark)
- Verify WebSocket proxy is running (port 5758)
- Check if textDocument/didOpen was sent (console logs)
- Ensure UCM LSP is enabled and running (port 5757)

### Performance issues:
- Check if API responses are slow (network tab)
- Verify cache is working (should see cache hits in logs)
- Check if context polling is too frequent
- Look for cancellation token usage

## Migration Notes

### From LSP-only:
- UCM providers replace LSP hover/completion/definition
- LSP now only handles diagnostics
- Context now comes from UCM API polling
- Caching is built into UCM providers

### From Manual UCM Calls:
- Context is now automatic (no manual tracking)
- Providers handle caching automatically
- Monaco integration is standardized
- Error handling is built-in
