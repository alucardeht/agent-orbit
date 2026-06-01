# Agent Orbit (`agent-orbit`)

`agent-orbit` is a premium, unified, cross-platform CLI tool designed to automatically back up and synchronize all your AI agent rules, skills, and custom agents across multiple developer machines in real-time.

Instead of running multiple background watchers and maintaining separate repositories for each tool, `agent-orbit` consolidates **Codex**, **Claude Code**, **Antigravity**, and **Kimi** rules and skills into a **single, secure, private GitHub repository** and a **single low-overhead PM2 background watcher daemon**.

---

## 🚀 Key Stability Features

### 🛡️ 1. The Unbreakable Git Shield
When working on multiple machines simultaneously, merge conflicts in rules can easily occur. `agent-orbit` features an automatic **Git Shield** to prevent background crashes:
*   If a merge conflict occurs during synchronization, the daemon **instantly aborts the rebase** (`git rebase --abort`) to prevent repository corruption.
*   It saves a copy of your conflicted local rules safely under `~/.config/agent-orbit/backups/`.
*   It performs a hard reset to the remote head (`git reset --hard origin/main`) to restore system alignment.
*   Your local repository is backed up safely before resetting, ensuring no changes are ever permanently lost.
*   **The background watcher daemon never crashes or gets stuck in a broken Git state.**

### 🔒 2. Single Process PID Lock Guard (No Zombie Duplication)
To prevent duplicate watchers or CPU spikes, the tool enforces strict process exclusivity:
*   At startup, `agent-orbit watch` reads the process lock file `~/.config/agent-orbit/daemon.pid`.
*   If a pre-existing PID is detected, the script uses OS-level diagnostics to check if the process is alive.
*   If a stale/zombie watcher is active, **it programmatically terminates it (`SIGKILL`)** to clear the socket and slate.
*   It registers its new unique PID, guaranteeing that **exactly one active daemon watcher** runs on the machine at any single moment.

### 🖥️ 3. Zero-Friction Cross-Platform Mapping
Path resolution is fully dynamic and platform-specific, supporting both **macOS (`darwin`)** and **Windows (`win32`)**:
*   **macOS Home:** Resolves `~` to `/Users/username/`.
*   **Windows Home:** Resolves `%USERPROFILE%` natively to `C:\Users\username\`.

### 🔄 4. Quiet OS Autostart (Persistence)
*   **macOS (`launchd`):** Generates an Apple LaunchAgent plist at `~/Library/LaunchAgents/com.alucardeht.agent-orbit.plist` with `KeepAlive: true` to automatically restart the daemon in case of system reboots or crash anomalies.
*   **Windows (`Startup`):** Creates a completely silent WSH wrapper shortcut (`agent-orbit.bat` and `agent-orbit-silent.vbs`) inside the system Startup folder `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\`. This fires the watcher headlessly in the background on startup, without opening console pop-up windows. It writes startup status to `~/.config/agent-orbit/windows-boot.log` for easy auditing.

---

## 📂 Supported AI Agents & Config Mappings

Unified repository structure pools rules under distinct folders:

| Agent / Target | Files Synchronized | macOS Paths | Windows Paths |
| :--- | :--- | :--- | :--- |
| **Codex** | Rules (`AGENTS.md`), Agents (`agents/*`), Skills (`skills/*`) | `~/.codex` | `~/.codex` |
| **Claude** | Rules (`CLAUDE.md`), Skills (`skills/*`) | `~/.claude` | `~/.claude` |
| **Antigravity** | Rules (`antigravity_rules.md`), Skills (`skills/*`) | `~/.gemini/config`<br>`~/.gemini/antigravity` | `~/.gemini/config`<br>`~/.gemini/antigravity` |
| **Kimi** | Rules (`rules/*`), Skills (`skills/*`) | `~/.kimi-code`<br>`~/.config/agents` | `~/.kimi-code`<br>`~/.config/agents` |

---

## 💻 Commands Reference

### 1. First-Time Setup
Launch the interactive configuration wizard. It runs pre-flight SSH connection checks to verify GitHub connectivity before starting:
```bash
agent-orbit init
```

### 2. Manual Backup & Restore
Force a manual push of your local configurations to your GitHub private repository:
```bash
agent-orbit sync   # Pushes local changes
agent-orbit pull   # Pulls from GitHub and distributes locally
```

### 3. Background Daemon Steering
Manage the PM2 background watcher daemon:
```bash
agent-orbit start     # Starts the background watcher daemon under PM2
agent-orbit stop      # Stops the daemon
agent-orbit restart   # Restarts the daemon
agent-orbit status    # Checks status and displays target configs
agent-orbit logs      # Stream active logs in real-time
```

### 4. OS Startup Registry
Register or remove native system startup daemons:
```bash
agent-orbit enable-autostart    # Configure launchd (Mac) or Startup (Windows)
agent-orbit disable-autostart   # Remove OS autostart configurations
```

### 5. Health Audits
Inspect your system for path health and SSH credentials integrity:
```bash
agent-orbit doctor
```

---

## 📅 Daily Workflow & Best Practices

1.  **Edit your rules normally:** Edit global `AGENTS.md` (Codex), `CLAUDE.md` (Claude), or `antigravity_rules.md` (Antigravity).
2.  **Auto-Sync in 5 seconds:** The daemon automatically watches these files. When you save a file, it debounces the change for 5 seconds (to group multiple quick modifications into a single transaction) and pushes it quietly to GitHub.
3.  **Cross-machine Pull:** When you sit at your second machine, simply fire `agent-orbit pull` (or let the active daemon auto-pull) to distribute the latest changes instantly!
