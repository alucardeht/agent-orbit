const fs = require('fs');
const path = require('path');
const { loadConfig, getConfigPath } = require('./config');
const { startWatcher } = require('./watcher');
const { syncAll } = require('./syncer');
const gitManager = require('./git');

let syncTimeout = null;
const DEBOUNCE_DELAY = 5000; // 5 seconds debouncing

// Enforces a strict single process instance using an OS-level PID lock file
function acquirePIDLock() {
  const configDir = path.dirname(getConfigPath());
  const pidFilePath = path.join(configDir, 'daemon.pid');

  if (fs.existsSync(pidFilePath)) {
    try {
      const oldPidStr = fs.readFileSync(pidFilePath, 'utf8').trim();
      const oldPid = parseInt(oldPidStr, 10);

      if (!isNaN(oldPid)) {
        // Send a diagnostic signal 0 to check if the process is alive
        process.kill(oldPid, 0);
        
        // If no error was thrown, the process is alive!
        console.warn(`[Orbit] [Warning] Zombie background watcher detected (PID: ${oldPid}). Initiating force kill...`);
        try {
          process.kill(oldPid, 'SIGKILL');
          console.warn(`[Orbit] Zombie process ${oldPid} successfully terminated.`);
        } catch (killError) {
          console.error(`[Error] Failed to kill zombie process ${oldPid}: ${killError.message}`);
        }
      }
    } catch (err) {
      // If error code is ESRCH, the process is not running. Safe to clean the stale file.
      if (err.code !== 'ESRCH') {
        console.warn(`[Warning] PID lock check encountered unexpected error: ${err.message}`);
      }
    }
    
    // Clean up the stale or processed lock file
    try { fs.unlinkSync(pidFilePath); } catch (_) {}
  }

  // Register current process PID
  try {
    fs.writeFileSync(pidFilePath, process.pid.toString(), 'utf8');
    
    // Ensure lock file is cleaned up on exit
    const cleanupLock = () => {
      try {
        if (fs.existsSync(pidFilePath)) {
          const currentPid = fs.readFileSync(pidFilePath, 'utf8').trim();
          if (currentPid === process.pid.toString()) {
            fs.unlinkSync(pidFilePath);
          }
        }
      } catch (_) {}
    };

    process.on('exit', cleanupLock);
    process.on('SIGINT', () => {
      cleanupLock();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      cleanupLock();
      process.exit(0);
    });
  } catch (err) {
    console.error(`[Error] Failed to write PID lock file: ${err.message}`);
  }
}

function runDaemon() {
  console.log('[Orbit] Initializing environment audits...');
  
  // Enforce Single Process Watcher Exclusivity
  acquirePIDLock();

  const config = loadConfig();
  if (!config.github || !config.github.repo) {
    console.error('[Error] GitHub repository not configured. Run "agent-orbit init" first.');
    process.exit(1);
  }

  // Initialize Git manager
  const repoPath = path.join(path.dirname(getConfigPath()), 'repo');
  gitManager.setRepoPath(repoPath);

  console.log(`[Orbit] Repository resolved at: ${repoPath}`);
  console.log('[Orbit] Enabled targets:');
  Object.keys(config.targets).forEach(agent => {
    if (config.targets[agent].enabled) {
      console.log(`  - ${agent}`);
    }
  });

  // Start the file system watcher
  let watcher;
  try {
    watcher = startWatcher(config, (event, filePath, agent) => {
      console.log(`[Orbit] [Change Detected] [${agent.toUpperCase()}] ${event} -> ${path.basename(filePath)}`);
      
      // Debounce the sync to group multiple fast file changes
      if (syncTimeout) clearTimeout(syncTimeout);

      syncTimeout = setTimeout(() => {
        console.log(`[Orbit] Starting auto-sync for changes...`);
        const commitMessage = `[Orbit] Auto-sync changes: [${agent.toUpperCase()}] ${path.basename(filePath)}`;
        
        syncAll(config, repoPath, { message: commitMessage })
          .then((res) => {
            if (res && res.pushed) {
              console.log('[Orbit] Push successful: ' + res.message);
              // Update lastSync timestamp in config
              config.lastSync = new Date().toISOString();
              const { saveConfig } = require('./config');
              saveConfig(config);
            } else {
              console.log('[Orbit] Sync checked: ' + (res ? res.message : 'No changes'));
            }
          })
          .catch((err) => {
            console.error('[Error] Auto-sync failed: ', err.message);
          });
      }, DEBOUNCE_DELAY);
    });

    console.log('[Orbit] Active filesystem watcher is listening for modifications. Press Ctrl+C to exit.');
  } catch (err) {
    console.error(`[Error] Failed to initialize watcher: ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  runDaemon
};
