# Unison Editor

A modern, desktop editor for the [Unison programming language](https://www.unison-lang.org/) built with Tauri, React, and Monaco Editor. This editor provides a seamless development experience tailored to Unison's content-addressed, file-less architecture.

## Features

### Current Features (MVP)

- ✅ **Monaco Editor Integration** with Unison syntax highlighting
- ✅ **Project & Branch Management** - Easy switching between projects and branches
- ✅ **Namespace Browser** - Visual tree view for exploring definitions
- ✅ **Definition Search** - Fuzzy find across the codebase
- ✅ **UCM API Integration** - Direct communication with Unison Codebase Manager
- ✅ **Tab-based Editing** - Multiple definitions open simultaneously
- ✅ **Connection Status** - Visual indication of UCM connectivity

### Planned Features

- 🔄 **LSP Integration** - Hover information, autocomplete, diagnostics
- 🔄 **Go-to-Definition** - Jump to definition anywhere in the codebase
- 🔄 **Find References** - See all usages of a definition
- 🔄 **Rename Refactoring** - Safe renaming via LSP
- 🔄 **Virtual File System** - In-memory editing without physical files
- 🔄 **Save to UCM** - Direct integration with `add`/`update` commands
- 🔄 **Dependency Visualization** - View dependencies and dependents
- 🔄 **Git-like Operations** - Branch creation, merging via UI

## Prerequisites

Before running the Unison Editor, you need:

1. **Rust** (latest stable) - [Install Rust](https://rustup.rs/)
2. **Node.js** (v18 or later) - [Install Node.js](https://nodejs.org/)
3. **Unison** - [Install Unison](https://www.unison-lang.org/docs/quickstart/)
4. **A running UCM instance** with:
   - HTTP API enabled (default port: 5858)
   - LSP server enabled (default port: 5757)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Start UCM

In a separate terminal, start Unison Codebase Manager:

```bash
ucm
```

UCM will automatically start the HTTP API server and LSP server. You should see output like:

```
Codebase API server started at http://127.0.0.1:5858
LSP server started on port 5757
```

### 3. Run the Editor

#### Development Mode

```bash
npm run tauri dev
```

This will:
- Start the Vite dev server for the React frontend
- Launch the Tauri app in development mode
- Enable hot module replacement (HMR)

#### Production Build

```bash
npm run tauri build
```

This creates a production build in `src-tauri/target/release/`.

## Configuration

### UCM Connection Settings

By default, the editor connects to UCM at:
- **Host:** `127.0.0.1`
- **API Port:** `5858`
- **LSP Port:** `5757`

To use different settings, you can modify the values in `src/store/unisonStore.ts`.

### Environment Variables

Set these before starting UCM to customize ports:

```bash
export UCM_PORT=5858        # HTTP API port
export UNISON_LSP_PORT=5757 # LSP server port
ucm
```

## Architecture

```
┌─────────────────────────────────────────┐
│   Tauri Desktop App                     │
│   ┌─────────────────────────────────┐   │
│   │  React Frontend                 │   │
│   │  - Monaco Editor (Unison)       │   │
│   │  - Project/Branch Selector      │   │
│   │  - Namespace Browser            │   │
│   │  - Tab Management               │   │
│   └─────────────────────────────────┘   │
│   ┌─────────────────────────────────┐   │
│   │  Rust Backend (Tauri)           │   │
│   │  - HTTP Client (UCM API)        │   │
│   │  - LSP Client (future)          │   │
│   │  - File Management              │   │
│   └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
                    │
                    ▼
    ┌───────────────────────────────┐
    │  UCM (Unison Codebase Mgr)    │
    │  - HTTP API (port 5858)       │
    │  - LSP Server (port 5757)     │
    │  - SQLite Codebase            │
    └───────────────────────────────┘
```

## Project Structure

```
unison-editor/
├── src/                      # React frontend
│   ├── components/           # React components
│   │   ├── Editor.tsx        # Monaco editor wrapper
│   │   ├── ProjectBranchSelector.tsx
│   │   └── NamespaceBrowser.tsx
│   ├── editor/               # Editor configuration
│   │   └── unisonLanguage.ts # Unison syntax highlighting
│   ├── services/             # API clients
│   │   └── ucmApi.ts         # UCM HTTP API client
│   ├── store/                # State management
│   │   └── unisonStore.ts    # Zustand store
│   ├── App.tsx               # Main app component
│   └── main.tsx              # Entry point
├── src-tauri/                # Rust backend
│   ├── src/
│   │   ├── commands.rs       # Tauri commands
│   │   ├── ucm_api.rs        # UCM API client (Rust)
│   │   └── lib.rs            # Main Rust entry
│   └── Cargo.toml            # Rust dependencies
├── package.json
└── README.md
```

## Usage

### Opening Definitions

1. Select a project and branch from the header
2. Browse the namespace in the left sidebar
3. Click on a definition to open it in the editor
4. Or use the search box to find definitions

### Editing Code

1. Click "+ New" to create a new file
2. Edit code in the Monaco editor
3. Unsaved changes are indicated with a "•" next to the tab name
4. (Future) Save changes back to UCM

### Searching

Enter a query in the search box and press Enter or click "Search" to find definitions across the codebase.

## Development

### Building the Rust Backend

```bash
cd src-tauri
cargo build
```

### Running Tests

```bash
# Frontend tests
npm test

# Rust tests
cd src-tauri
cargo test
```

### Code Structure

#### Frontend
- **React + TypeScript** for type safety
- **Zustand** for state management
- **Monaco Editor** for code editing
- **@tauri-apps/api** for Rust backend communication

#### Backend
- **Tauri** for desktop app framework
- **reqwest** for HTTP API calls to UCM
- **tokio** for async runtime
- **serde** for JSON serialization

## Troubleshooting

### Editor shows "Not Connected to UCM"

1. Ensure UCM is running: `ucm` in a terminal
2. Check that UCM API is accessible:
   ```bash
   curl http://127.0.0.1:5858/api/projects
   ```
3. Verify ports match in editor configuration

### No projects showing up

1. Make sure you have projects in your UCM codebase
2. Try creating a project:
   ```
   .> project.create my-project
   ```

### Build errors

1. Ensure Rust is installed and up to date:
   ```bash
   rustup update
   ```
2. Clear node modules and reinstall:
   ```bash
   rm -rf node_modules
   npm install
   ```

## Contributing

This is a work in progress! Contributions are welcome.

### Roadmap

1. **Phase 1 (Current)** - Basic editor with browsing
2. **Phase 2** - LSP integration for intelligent editing
3. **Phase 3** - Virtual file system and save functionality
4. **Phase 4** - Advanced features (refactoring, diffs, etc.)

## Resources

- [Unison Documentation](https://www.unison-lang.org/docs/)
- [Unison Codebase](https://github.com/unisonweb/unison)
- [UCM Desktop (Elm Reference)](https://github.com/unisonweb/ucm-desktop)
- [Tauri Documentation](https://tauri.app/)
- [Monaco Editor](https://microsoft.github.io/monaco-editor/)

## License

MIT

## Acknowledgments

- Built with inspiration from the Unison team's UCM Desktop
- Syntax highlighting adapted from Unison's Vim plugin
- Leverages Unison's excellent LSP server and HTTP API
