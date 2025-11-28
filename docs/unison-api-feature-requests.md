# Unison Editor: UCM API Capabilities & Feature Requests

This document summarizes how the Unison Editor uses UCM's APIs and proposes enhancements that would improve the editor development experience.

---

## Part 1: Current UCM API Capabilities

### 1.1 MCP (Model Context Protocol) Tools

The editor communicates with UCM via the `ucm mcp` subprocess using JSON-RPC 2.0 over stdio. UCM provides **19 MCP tools**:

#### Code Operations
| Tool | Description | Parameters |
|------|-------------|------------|
| `typecheck-code` | Typecheck code without saving, evaluate watch expressions (`>`) and tests (`test>`) | `projectContext`, `code` (sourceCode or filePath) |
| `update-definitions` | Typecheck and save definitions to codebase | `projectContext`, `code` (text or filePath) |
| `run` | Execute a function with IO abilities | `projectContext`, `mainFunctionName`, `args[]` |
| `run-tests` | Run pure tests in codebase | `projectContext`, `subnamespace` (optional) |

#### Definition Inspection
| Tool | Description | Parameters |
|------|-------------|------------|
| `view-definitions` | Get source code of definitions | `projectContext`, `names[]` |
| `docs` | Fetch documentation for a definition | `projectContext`, `name` |
| `list-project-definitions` | List all definitions in project | `projectContext` |
| `list-library-definitions` | List definitions in a library | `projectContext`, `libName` |
| `search-definitions-by-name` | Search by name | `projectContext`, `query` |
| `search-by-type` | Search by type signature | `projectContext`, `query` |
| `list-definition-dependencies` | Get what a definition depends on | `projectContext`, `definitionName` |
| `list-definition-dependents` | Get what depends on a definition | `projectContext`, `definitionName` |

#### Project Navigation
| Tool | Description | Parameters |
|------|-------------|------------|
| `list-local-projects` | List all local projects | (none) |
| `list-project-branches` | List branches of a project | `projectName` |
| `get-current-project-context` | Get current project/branch | (none) |
| `list-project-libraries` | List installed libraries | `projectContext` |

#### Library Management
| Tool | Description | Parameters |
|------|-------------|------------|
| `lib-install` | Install library from Unison Share | `projectContext`, `libProjectName`, `libBranchName` (optional) |

#### Unison Share Integration
| Tool | Description | Parameters |
|------|-------------|------------|
| `share-project-search` | Search projects on Unison Share | `query` |
| `share-project-readme` | Fetch README from Share | `projectName`, `projectOwnerHandle` |

### 1.2 HTTP API Endpoints

The editor also uses UCM's HTTP API (default: `http://127.0.0.1:5858/codebase/api`):

| Endpoint | Description |
|----------|-------------|
| `GET /projects` | List all projects |
| `GET /projects/{project}/branches` | List branches |
| `GET /ucm/current` | Get current context (project/branch/path) |
| `GET /projects/{project}/branches/{branch}/list` | Browse namespace contents |
| `GET /projects/{project}/branches/{branch}/getDefinition` | Get definition details (source, type, docs) |
| `GET /projects/{project}/branches/{branch}/find` | Fuzzy search definitions |
| `GET /projects/{project}/branches/{branch}/getDefinitionDependencies` | Get dependencies |
| `GET /projects/{project}/branches/{branch}/getDefinitionDependents` | Get dependents |

### 1.3 LSP Server

UCM provides an LSP server (default: `tcp://127.0.0.1:5757`) for:
- Real-time diagnostics (type errors, parse errors)
- We proxy this via WebSocket for Monaco editor compatibility

---

## Part 2: How the Editor Uses These APIs

### Currently Working Well

| Feature | API Used | Status |
|---------|----------|--------|
| Project/branch listing | HTTP API | ✅ Working |
| Namespace browsing | HTTP API `/list` | ✅ Working |
| Definition lookup | HTTP API `/getDefinition` | ✅ Working |
| Fuzzy search | HTTP API `/find` | ✅ Working |
| Dependencies/dependents | HTTP API | ✅ Working |
| Typechecking scratch files | MCP `typecheck-code` | ✅ Working |
| Watch expressions (`>`) | MCP `typecheck-code` output parsing | ✅ Working |
| Inline tests (`test>`) | MCP `typecheck-code` output parsing | ✅ Working |
| Save to codebase | MCP `update-definitions` | ✅ Working |
| Run IO functions | MCP `run` | ✅ Working (requires save first) |
| LSP diagnostics | LSP via WebSocket proxy | ✅ Working |

### Current Workarounds

1. **FQN Resolution**: HTTP API returns relative names; we use search to find full FQNs
2. **Output Parsing**: MCP returns text with emoji/Unicode markers; we parse with regex
3. **LSP Protocol**: Monaco needs WebSocket; we built a TCP→WS proxy
4. **Context Sync**: No push notifications; we poll every 5 seconds

---

## Part 3: Feature Requests for Unison Team

### High Priority

#### 1. Add `code` parameter to `run` MCP tool

**Current behavior**: The `run` tool only accepts `mainFunctionName` and requires the function to already exist in the codebase.

**Requested change**: Allow `run` to accept inline code (like `typecheck-code` does), so users can run IO functions from scratch files without saving first.

```haskell
-- Current
data RunToolArguments = RunToolArguments
  { projectContext :: ProjectContext,
    mainFunctionName :: Name,
    args :: [Text]
  }

-- Proposed
data RunToolArguments = RunToolArguments
  { projectContext :: ProjectContext,
    mainFunctionName :: Name,
    args :: [Text],
    code :: Maybe (Either FilePath Text)  -- NEW: optional inline code
  }
```

**Rationale**: The editor shows a "run" button for IO functions, but users must click "Save to Codebase" first. This breaks the fast iteration workflow that watch expressions provide.

#### 2. Structured output for watch/test results

**Current behavior**: `typecheck-code` returns watch and test results as formatted text with Unicode markers (`⧩`, `✅`, `🚫`). We parse this with complex regex.

**Requested change**: Return structured JSON for watch and test results.

```json
{
  "watchResults": [
    { "lineNumber": 5, "expression": "square 4", "result": "16", "type": "Nat" }
  ],
  "testResults": [
    { "name": "square.tests.ex1", "passed": true, "message": "Passed" }
  ],
  "typeErrors": [...],
  "outputMessages": [...]
}
```

**Rationale**: Would eliminate fragile text parsing and make editor integration more reliable.

#### 3. File location information in definition responses

**Current behavior**: HTTP API `/getDefinition` returns source code but no file path or line number.

**Requested change**: Include source location when available.

```json
{
  "termDefinitions": {
    "#hash": {
      "sourceLocation": {
        "filePath": "/path/to/file.u",
        "startLine": 10,
        "endLine": 15
      },
      ...
    }
  }
}
```

**Rationale**: Would enable proper "Go to Definition" that opens the file at the correct line, rather than showing in a side panel.

### Medium Priority

#### 4. Full FQN in definition responses

**Current behavior**: `/getDefinition` returns `bestTermName` as a relative name (e.g., `map` instead of `List.map`).

**Requested change**: Always include the fully qualified name.

```json
{
  "bestTermName": "map",
  "fullyQualifiedName": "lib.base.data.List.map"  // NEW
}
```

**Rationale**: Editor needs FQN for tree navigation. Currently we make an extra search call to resolve this.

#### 5. WebSocket support for LSP

**Current behavior**: LSP server uses raw TCP.

**Requested change**: Support WebSocket connections (or provide an option).

**Rationale**: Monaco editor only supports WebSocket for LSP. We had to build a TCP→WebSocket proxy which adds complexity and potential failure points.

#### 6. Push notifications for context changes

**Current behavior**: No way to know when user changes project/branch in UCM.

**Requested change**: Either:
- WebSocket endpoint that pushes context changes, OR
- Long-polling endpoint, OR
- Event stream (SSE)

**Rationale**: Currently polling every 5 seconds, which is inefficient and can miss rapid changes.

### Lower Priority

#### 7. Rename refactoring tool

**Request**: MCP tool to rename a definition across the codebase.

```json
{
  "tool": "rename-definition",
  "arguments": {
    "projectContext": {...},
    "oldName": "myOldFunction",
    "newName": "myNewFunction"
  }
}
```

#### 8. Delete definition tool

**Request**: MCP tool to remove a definition from the codebase.

#### 9. Get type of expression

**Request**: MCP tool to get the type of an arbitrary expression without running it.

```json
{
  "tool": "get-type",
  "arguments": {
    "projectContext": {...},
    "expression": "List.map (+1)"
  }
}
// Returns: "[Nat] -> [Nat]"
```

---

## Summary

The UCM API is quite comprehensive and has enabled us to build a functional editor. The highest-impact improvements would be:

1. **Inline code support for `run`** - Enables running IO functions without saving
2. **Structured watch/test output** - Eliminates fragile text parsing
3. **Source locations in definitions** - Enables proper Go to Definition

These changes would significantly improve the editor development experience and make the integration more robust.
