# Quick Start Guide - Unison Editor

This guide will get you up and running with the Unison Editor in 5 minutes.

## Prerequisites Check

Before starting, verify you have:

```bash
# Check Rust
rustc --version
# Should show: rustc 1.x.x or later

# Check Node.js
node --version
# Should show: v18.x.x or later

# Check Unison
ucm --version
# Should show: unison 0.x.x or later
```

If any are missing, install them:
- **Rust:** https://rustup.rs/
- **Node.js:** https://nodejs.org/
- **Unison:** https://www.unison-lang.org/docs/quickstart/

## Step 1: Install Dependencies

```bash
cd unison-editor
npm install
```

This will install all JavaScript and TypeScript dependencies.

## Step 2: Start UCM

Open a **separate terminal** and start the Unison Codebase Manager:

```bash
# Navigate to a directory with a Unison codebase
# Or initialize a new one
mkdir ~/my-unison-project
cd ~/my-unison-project
ucm
```

You should see output like:

```
Unison Codebase Manager
Loading codebase...
Codebase API server started at http://127.0.0.1:5858
LSP server started on port 5757

.>
```

Keep this terminal open with UCM running!

## Step 3: Create a Sample Project (Optional)

If you're starting fresh, create a sample project in UCM:

```unison
.> project.create my-first-project
my-first-project/main>
```

Create a simple definition to test with. In your favorite editor, create `hello.u`:

```unison
hello : Text
hello = "Hello, Unison!"

greet : Text -> Text
greet name = "Hello, " ++ name ++ "!"
```

Load it in UCM:

```unison
my-first-project/main> load hello.u
my-first-project/main> add
```

## Step 4: Start the Editor

In your original terminal (in the unison-editor directory):

```bash
npm run tauri dev
```

This will:
1. Start the Vite development server
2. Compile the Rust backend
3. Launch the Tauri desktop app

First launch may take a minute to compile Rust dependencies.

## Step 5: Verify Everything Works

In the Unison Editor window:

1. **Check Connection Status**
   - Top right should show a green "●" (online status)
   - If red, verify UCM is running

2. **Select Project and Branch**
   - Choose "my-first-project" from the Project dropdown
   - Choose "main" from the Branch dropdown

3. **Browse Definitions**
   - Look in the left sidebar
   - You should see your `hello` and `greet` definitions
   - Click on `hello` to open it

4. **Search**
   - Type "greet" in the search box
   - Press Enter
   - Click on the result to open it

5. **Create New File**
   - Click "+ New" button
   - Try writing some Unison code
   - See syntax highlighting in action

## What You Can Do Now

✅ **Browse** all definitions in your codebase
✅ **Search** for any definition
✅ **View** definition source code
✅ **Open multiple tabs** for different definitions
✅ **Switch** between projects and branches

## What's Not Yet Implemented

❌ **Save changes** back to UCM (read-only for now)
❌ **Autocomplete** (LSP integration pending)
❌ **Go-to-definition** (LSP integration pending)
❌ **Type hints on hover** (LSP integration pending)
❌ **Error checking** in real-time (LSP integration pending)

See `DEVELOPMENT.md` for roadmap and next steps.

## Troubleshooting

### "Not Connected to UCM"

**Problem:** Editor shows connection error

**Solutions:**
1. Make sure UCM is running in another terminal
2. Check UCM started its API server:
   ```bash
   curl http://127.0.0.1:5858/api/projects
   ```
   Should return JSON with your projects

3. Verify port 5858 is not blocked
4. Try restarting UCM

### "No projects showing up"

**Problem:** Project dropdown is empty

**Solutions:**
1. Create a project in UCM:
   ```
   .> project.create test-project
   ```
2. Make sure you're in a valid codebase directory
3. Check for errors in the UCM terminal

### Build Errors

**Problem:** `npm run tauri dev` fails

**Solutions:**
1. Update Rust:
   ```bash
   rustup update
   ```
2. Clear cache and reinstall:
   ```bash
   rm -rf node_modules
   npm install
   ```
3. Make sure you're in the `unison-editor` directory

### Monaco Editor Not Loading

**Problem:** Editor area is blank

**Solutions:**
1. Check browser console (Cmd+Option+I on Mac, Ctrl+Shift+I on Windows)
2. Make sure Monaco dependencies installed correctly:
   ```bash
   npm install @monaco-editor/react monaco-editor
   ```
3. Try hard refresh (Cmd+Shift+R or Ctrl+Shift+R)

## Development Workflow

### For Unison Development

1. Keep UCM running
2. Keep the editor running
3. Edit `.u` files in external editor (VSCode, etc.)
4. Run `load` and `add`/`update` in UCM
5. Click "Search" in editor to refresh
6. Open updated definitions

### For Editor Development

1. Make changes to React/TypeScript code
2. Vite will hot-reload automatically
3. For Rust changes:
   ```bash
   # Stop the editor (Ctrl+C)
   npm run tauri dev
   ```

## Next Steps

1. **Read the README.md** for full feature list
2. **Check DEVELOPMENT.md** for technical details
3. **Try the example workflow** in the Examples section below
4. **Report issues** or suggest features

## Example Workflow

Here's a complete example to try:

### 1. In UCM Terminal:

```unison
.> project.create calculator
calculator/main> load

-- Paste this into scratch.u file:
```

```unison
add : Nat -> Nat -> Nat
add x y = x + y

subtract : Nat -> Nat -> Nat
subtract x y =
  if x >= y then x - y
  else 0

multiply : Nat -> Nat -> Nat
multiply x y = x * y

divide : Nat -> Nat -> Optional Nat
divide x y =
  if y == 0 then None
  else Some (x / y)
```

```unison
calculator/main> add
```

### 2. In Unison Editor:

1. Select "calculator" project
2. Select "main" branch
3. See your definitions in the sidebar
4. Click on `divide` to see the implementation
5. Search for "add" to find it quickly
6. Open multiple functions in tabs

## Tips

- **Cmd/Ctrl + F** to focus search box
- **Click definition names** in code to (future) jump to definition
- **Watch the UCM terminal** for errors when loading code
- **Keep editor open** while developing for quick reference
- **Use tabs** to compare multiple definitions

## Getting Help

- **Slack:** https://unison-lang.org/slack
- **Forum:** https://share.unison-lang.org/
- **Docs:** https://www.unison-lang.org/docs/

Enjoy building with Unison! 🎉
