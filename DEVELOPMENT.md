# Development Notes - Unison Editor

## What Has Been Built

This document outlines what has been implemented in the Unison Editor and provides guidance for future development.

## ✅ Completed Features (MVP Phase 1)

### 1. Core Architecture
- **Tauri Desktop Application** - Rust backend with React frontend
- **Monaco Editor Integration** - Full-featured code editor
- **State Management** - Zustand store for application state
- **UCM Communication** - HTTP API client for codebase operations

### 2. Unison Language Support
**File:** `src/editor/unisonLanguage.ts`

Implemented comprehensive syntax highlighting based on Unison's Vim plugin:
- Keywords: `ability`, `do`, `type`, `match`, `cases`, `let`, `if`, `then`, `else`, etc.
- Type system highlighting (types start with uppercase)
- Definition names (identifiers followed by `:`)
- Doc blocks (`{{ ... }}`)
- Comments (line and block)
- Literals (numbers, strings, characters)
- Operators and delimiters

### 3. Rust Backend (UCM API Client)
**Files:**
- `src-tauri/src/ucm_api.rs` - HTTP client for UCM API
- `src-tauri/src/commands.rs` - Tauri command handlers

**Implemented Commands:**
- `get_projects` - List all projects in codebase
- `get_branches` - List branches for a project
- `get_current_context` - Get current project/branch/path
- `list_namespace` - Browse namespace contents
- `get_definition` - Load definition source code
- `find_definitions` - Search/fuzzy find
- `get_dependencies` - Get definition dependencies
- `get_dependents` - Get definition dependents
- `check_ucm_connection` - Health check
- `configure_ucm` - Change connection settings

### 4. React Components

#### Editor Component (`src/components/Editor.tsx`)
- Monaco editor wrapper
- Unison syntax highlighting
- Read-only mode support
- Dark theme by default

#### Project/Branch Selector (`src/components/ProjectBranchSelector.tsx`)
- Visual project and branch selection
- Connection status indicator
- Auto-loads projects/branches
- Auto-selects first available option

#### Namespace Browser (`src/components/NamespaceBrowser.tsx`)
- Tree view for browsing definitions
- Search functionality
- Click to open definitions
- Icons for different item types (namespace, term, type)

### 5. Main Application (`src/App.tsx`)
- Tab-based editing interface
- Connection status checking
- Definition loading
- Unsaved changes indicator
- Tab management (open, close, switch)

### 6. Styling (`src/App.css`)
- VS Code-inspired dark theme
- Responsive layout
- Professional UI components

## 🔄 Next Steps (Phase 2 - LSP Integration)

### Priority 1: LSP Client Implementation

The Unison LSP server (port 5757) provides:
- Hover information
- Autocomplete
- Go-to-definition
- Find references
- Rename refactoring
- Format on save
- Diagnostics (type errors, parse errors)

**Implementation Approach:**

1. **Add LSP Dependencies**
   ```bash
   npm install monaco-languageclient vscode-ws-jsonrpc
   ```

2. **Create WebSocket Bridge in Rust**
   ```rust
   // src-tauri/src/lsp_bridge.rs
   // Create WebSocket server that proxies to TCP LSP server
   ```

3. **Connect Monaco to LSP**
   ```typescript
   // src/services/lspClient.ts
   import { MonacoLanguageClient } from 'monaco-languageclient';
   ```

**Reference Files from Investigation:**
- Unison LSP: `/Users/kings/dev/projects/unison/unison-cli/src/Unison/LSP.hs`
- LSP Features: Lines 47-60 show all supported capabilities

### Priority 2: Virtual File System

Currently, definitions are loaded into memory but not saved back to UCM.

**Implementation:**
1. Create temporary `.u` files when editing
2. Watch for changes and trigger UCM `load` command
3. Implement `add`/`update` workflow
4. Handle success/failure feedback from UCM

**Files to Study:**
- `/Users/kings/dev/projects/unison/unison-cli/src/Unison/Codebase/Editor/HandleInput/Load.hs`
- `/Users/kings/dev/projects/unison/unison-cli/src/Unison/Codebase/Watch.hs`

### Priority 3: Code Navigation

Leverage LSP for:
- **Go-to-Definition:** `textDocument/definition`
- **Find References:** `textDocument/references`
- **Document Symbols:** `textDocument/documentSymbol`

**Additional API Calls:**
- Use `get_dependencies` and `get_dependents` for visual dependency graph

### Priority 4: Enhanced UI Features

1. **Dependency Panel**
   - Show dependencies/dependents for active definition
   - Click to navigate
   - Visual graph (optional)

2. **Diff Viewer**
   - Use UCM's diff endpoints
   - Compare definitions across branches
   - Merge conflict resolution

3. **Branch Management**
   - Create new branches
   - Switch branches
   - Merge branches
   - Visual branch graph

4. **Search Improvements**
   - Filter by type (term/type/namespace)
   - Search history
   - Recent definitions

## Technical Notes

### UCM API Endpoints

Based on investigation of Unison codebase:

**Base URL:** `http://127.0.0.1:5858/api`

| Endpoint | Purpose |
|----------|---------|
| `GET /projects` | List projects |
| `GET /projects/{project}/branches` | List branches |
| `GET /projects/{project}/branches/{branch}/list` | List namespace |
| `GET /projects/{project}/branches/{branch}/getDefinition` | Get definition |
| `GET /projects/{project}/branches/{branch}/find` | Search |
| `GET /projects/{project}/branches/{branch}/getDefinitionDependencies` | Dependencies |
| `GET /projects/{project}/branches/{branch}/getDefinitionDependents` | Dependents |
| `GET /ucm/current` | Current context |

### LSP Configuration

From investigation, the Unison LSP supports these configuration options:

```json
{
  "formattingWidth": 80,
  "maxCompletions": 100
}
```

### Content-Addressed Model

Key insights from investigation:
- Definitions are stored by content hash in SQLite
- Names are just pointers to hashes
- Multiple names can point to same definition
- Perfect incremental compilation (only changed definitions recompile)
- No traditional "save" - use `add` or `update` to persist

### File Watching Workflow

Traditional Unison workflow:
1. Edit `.u` file
2. UCM watches file
3. On save, UCM parses and typechecks
4. Use `add` to add new definitions
5. Use `update` to update existing definitions

**Adaptation for Editor:**
- Create temp `.u` files in background
- Trigger UCM load via CLI command
- Parse UCM output for errors
- Show errors in Monaco diagnostics

## Architecture Decisions

### Why Tauri?
- Lightweight (compared to Electron)
- Native Rust integration (perfect for UCM CLI calls)
- Smaller bundle size
- Better performance

### Why Not Use UCM Desktop's Approach?
UCM Desktop (Elm) is read-only. We need:
- Full editing capabilities
- LSP integration
- More complex state management
- Monaco's advanced features

### Why Monaco?
- Industry standard (VS Code uses it)
- Excellent LSP support
- Feature-rich out of the box
- Great TypeScript/React integration

## Testing Strategy

### Manual Testing
1. Start UCM: `ucm`
2. Start editor: `npm run tauri dev`
3. Verify connection
4. Browse namespaces
5. Open definitions
6. Test search

### Automated Testing (Future)
- Unit tests for API client
- Integration tests for UCM communication
- E2E tests with Playwright/Tauri

## Known Limitations

1. **No LSP Yet** - Limited to syntax highlighting
2. **Read-Only** - Can't save changes back to UCM
3. **No Namespace Navigation** - Can't click into namespaces
4. **API Error Handling** - Basic error messages
5. **No Offline Mode** - Requires UCM to be running

## References

Key files from investigation:

**Unison Codebase:**
- LSP Implementation: `/Users/kings/dev/projects/unison/unison-cli/src/Unison/LSP.hs`
- API Server: `/Users/kings/dev/projects/unison/unison-share-api/src/Unison/Server/CodebaseServer.hs`
- Syntax: `/Users/kings/dev/projects/unison/editor-support/vim/syntax/unison.vim`

**UCM Desktop:**
- API Client: `/Users/kings/dev/projects/ucm-desktop/src/Ucm/Api.elm`

## Getting Help

- [Unison Slack](https://unison-lang.org/slack)
- [Unison Forum](https://share.unison-lang.org/)
- [GitHub Issues](https://github.com/unisonweb/unison/issues)
- [Documentation](https://www.unison-lang.org/docs/)

## Contributing

To add features:
1. Check this document for planned features
2. Study the referenced files from Unison codebase
3. Implement in small, testable increments
4. Update this document with learnings
5. Test with a real UCM instance

## License

MIT - Same as Unison
