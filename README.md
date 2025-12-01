# Unison Editor

A modern, desktop IDE for the [Unison programming language](https://www.unison-lang.org/) built with Tauri 2, React 19, and Monaco Editor.

## Download

Pre-built installers for macOS and Linux are available at:

**[https://kingsleyh.github.io/unison-editor/](https://kingsleyh.github.io/unison-editor/)**

## Features

### Core Editor
- **Monaco Editor** with Unison syntax highlighting and dark theme
- **Tab-based editing** with multiple files open simultaneously
- **File Explorer** with drag-and-drop, multi-select, and context menus
- **Workspace persistence** - tabs, layout, and window state restored on reopen

### UCM Integration
- **Integrated UCM Terminal** - Full PTY-based terminal with xterm.js
- **Automatic UCM lifecycle management** - UCM spawns automatically when opening a workspace
- **Project & Branch switching** - Switch between Unison projects and branches
- **Namespace Browser** - Tree view for exploring the codebase with lazy loading

### Code Intelligence (via UCM API)
- **Hover information** - Type signatures and documentation on hover
- **Autocomplete** - Intelligent completions from the codebase
- **Go-to-definition** - Click-through navigation to definitions
- **Definition Cards** - UCM Desktop-style stacked definition viewer
- **Syntax help** - Built-in help for Unison keywords and operators

### LSP Integration
- **Real-time diagnostics** - Errors and warnings from UCM's LSP server
- **WebSocket proxy** - Bridges the frontend to UCM's LSP server

### Evaluation & Testing
- **Watch expressions** - Lines starting with `>` can be evaluated
- **Test runner** - Run tests defined with `test>` expressions
- **Run pane** - Displays evaluation results with syntax highlighting

### File Operations
- **Create/rename/delete** files and folders
- **Unison file support** (`.u` extension)
- **Scratch files** for quick experiments

## Prerequisites

1. **Rust** (1.77.2 or later) - [Install Rust](https://rustup.rs/)
2. **Node.js** (v18 or later) - [Install Node.js](https://nodejs.org/)
3. **UCM** (Unison Codebase Manager) - [Install Unison](https://www.unison-lang.org/docs/installation/)

UCM is typically installed via Homebrew:
```bash
brew install unisonweb/unison/unison
```

## Quick Start

### Install Dependencies

```bash
npm install
```

### Development Mode

```bash
npm run tauri dev
```

This starts the Vite dev server and launches the Tauri app with hot module replacement.

### Production Build

```bash
npm run tauri build
```

Creates platform-specific bundles:
- **macOS**: `.dmg` and `.app` in `src-tauri/target/release/bundle/`
- **Linux**: `.AppImage` in `src-tauri/target/release/bundle/`

## Usage

### Opening a Workspace

1. Launch the app - you'll see the Welcome Screen
2. Click "Open Folder" to select a workspace directory
3. UCM starts automatically and connects to the codebase
4. If no Unison codebase exists, you can create one or link to an existing project

### Editor Layout

- **Left Sidebar**: File Explorer and Namespace Browser
- **Center**: Editor tabs with Monaco editor
- **Right Panel**: Definition Stack (collapsible)
- **Bottom Panel**: UCM Terminal, Output, and General Terminal (collapsible)

### Working with Definitions

- Browse the namespace tree to explore definitions
- Click a definition to open it in the Definition Stack
- Click "Add to Scratch" to copy source code to a scratch file
- Use the search box in the Namespace Browser to find definitions

### Watch Expressions

In any `.u` file, prefix a line with `>` to create a watch expression:
```
> 1 + 1
> List.map (x -> x * 2) [1, 2, 3]
```

Click the play button in the gutter to evaluate.

### Tests

Define tests with the `test>` prefix:
```
test> myTest = check (1 + 1 == 2)
```

## Project Structure

```
unison-editor/
├── src/                          # React frontend
│   ├── components/               # React components
│   │   ├── Editor.tsx            # Monaco editor wrapper
│   │   ├── UCMTerminal.tsx       # Integrated UCM terminal
│   │   ├── NamespaceBrowser.tsx  # Codebase tree browser
│   │   ├── FileExplorer.tsx      # Workspace file browser
│   │   ├── DefinitionStack.tsx   # Definition cards viewer
│   │   └── ...
│   ├── services/                 # Business logic
│   │   ├── ucmApi.ts             # UCM HTTP API client
│   │   ├── lspService.ts         # LSP client
│   │   ├── ucmLifecycle.ts       # UCM process management
│   │   └── monacoUcmProviders.ts # Hover/completion providers
│   ├── editor/                   # Editor configuration
│   │   └── unisonLanguage.ts     # Syntax highlighting
│   ├── store/                    # State management
│   │   └── unisonStore.ts        # Zustand store
│   └── theme/                    # Theming
│       └── unisonTheme.ts        # Dark theme config
├── src-tauri/                    # Rust backend
│   └── src/
│       ├── lib.rs                # Tauri app setup
│       ├── commands.rs           # Tauri commands
│       ├── ucm_api.rs            # UCM HTTP API client
│       ├── ucm_pty.rs            # PTY management for UCM
│       ├── lsp_proxy.rs          # LSP WebSocket proxy
│       └── port_utils.rs         # Port allocation
├── package.json
└── README.md
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│   Tauri Desktop App                                         │
│   ┌───────────────────────────────────────────────────────┐ │
│   │  React Frontend (Vite + TypeScript)                   │ │
│   │  • Monaco Editor with Unison syntax                   │ │
│   │  • xterm.js for UCM terminal                          │ │
│   │  • Zustand for state management                       │ │
│   └───────────────────────────────────────────────────────┘ │
│   ┌───────────────────────────────────────────────────────┐ │
│   │  Rust Backend (Tauri 2)                               │ │
│   │  • UCM PTY management (portable-pty)                  │ │
│   │  • HTTP client for UCM API (reqwest)                  │ │
│   │  • LSP WebSocket proxy (tokio-tungstenite)            │ │
│   │  • File system operations                             │ │
│   └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │  UCM (spawned by app)         │
              │  • HTTP API (dynamic port)    │
              │  • LSP Server (port 5757)     │
              │  • SQLite Codebase            │
              └───────────────────────────────┘
```

## Development

### Running Tests

```bash
# Frontend tests
npm test           # Watch mode
npm run test:run   # Single run

# Rust tests
cd src-tauri
cargo test
```

### Building

```bash
# Check TypeScript
npx tsc --noEmit

# Check Rust
cd src-tauri && cargo check
```

## Configuration

### Workspace Settings

Each workspace stores its configuration in `.unison-editor/`:
- `config.json` - Linked project, default branch
- `editor-state.json` - Open tabs, layout, window state

### Ports

UCM services use dynamic port allocation:
- **UCM API**: Starting at 5858
- **LSP Server**: Fixed at 5757 (UCM limitation)
- **LSP WebSocket Proxy**: Starting at 5758

## Troubleshooting

### UCM Not Found

If you see "UCM Not Found" when opening a workspace:
1. Ensure UCM is installed: `which ucm`
2. If installed via Homebrew, ensure `/opt/homebrew/bin` is in your PATH
3. The app automatically adds common paths, but custom installations may need manual configuration

### UCM Already Running

If you see "UCM Already Running":
- Another UCM instance is using the same codebase
- Close the other UCM instance (terminal, other editor) and click Retry

### Connection Issues

1. Check the UCM Terminal panel for error messages
2. Verify UCM started successfully
3. Try closing and reopening the workspace

## Tech Stack

### Frontend
- **React 19** with TypeScript
- **Zustand** for state management
- **Monaco Editor** for code editing
- **xterm.js** for terminal emulation
- **Vite 7** for bundling

### Backend
- **Tauri 2** for desktop app framework
- **portable-pty** for PTY management
- **reqwest** for HTTP requests
- **tokio** for async runtime
- **tokio-tungstenite** for WebSocket proxy

## License

MIT

## Acknowledgments

- Built with inspiration from the Unison team's UCM Desktop
- Syntax highlighting adapted from Unison language definitions
- Icons from the Unison project
