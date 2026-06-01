# The Evolved Unified Sync Concept: `agent-orbit`

## Why Unification?

Historically, we developed separate syncing engines (`codex-sync`, `claude-sync`, `kimi-sync`) to back up rules for each AI agent environment individually. However, this approach had three major limitations:

1.  **System Resource Waste:** Each sync daemon ran its own watcher loop (`chokidar`), multiplying system resource consumption.
2.  **Git Spaghetti:** Managing several distinct GitHub repositories (`codex-rules`, `claude-rules`) created fragmented commits and history.
3.  **Cross-Platform Friction:** Paths and autostart scripts varied significantly by agent and OS (macOS vs. Windows), resulting in inconsistent behaviors.

`agent-orbit` solves this by introducing a **single central synchronization engine** that maps and monitors all AI agents concurrently.

---

## Core System Pillars

### 1. Zero-Friction Cross-Platform Mapping
By using a platform-specific mapping dictionary (`darwin` for macOS, `win32` for Windows), the engine dynamically locates:
- Global paths
- App data configurations
- Rules and skills directories
on both OSes natively without hardcoded paths.

### 2. Consolidated Git Tree
Rather than separating repositories, the unified repository structure pools rules under distinct folders. This provides a single, beautiful repository of your entire machine ruleset:
```text
agent-rules/
  ├── codex/
  ├── claude/
  ├── antigravity/
  └── kimi/
```

### 3. Native Background Silencers
*   **macOS:** Uses `launchd` LaunchAgents, which is the native Apple OS daemon runner.
*   **Windows:** Launches via a silent `Windows Script Host` VBS script placed in the Startup shell folder, executing completely headless without opening ugly cmd windows.

### 4. Debounced Push Queue
A debounced queue ensures that if a series of files or skills are updated in quick succession, they are consolidated and pushed in a **single Git commit**, preserving a clean, logical version history.
