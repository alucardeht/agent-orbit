const fs = require('fs');
const path = require('path');
const { getAgentPaths, resolvePath } = require('./paths');
const { getGitInstance, commitAndPush, pullFromRemote } = require('./git');

// Helper to recursively copy directories
function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Helper to safely copy a file
function copyFileSync(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

// Helper to clear a directory before restoring
function clearDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      clearDirSync(fullPath);
      fs.rmdirSync(fullPath);
    } else {
      fs.unlinkSync(fullPath);
    }
  }
}

function syncAll(config, repoPath, options = {}) {
  const git = getGitInstance(repoPath);
  let changed = false;

  Object.keys(config.targets).forEach(agentName => {
    const target = config.targets[agentName];
    if (!target.enabled) return;

    const paths = getAgentPaths(agentName, target);
    if (!paths) return;

    const agentRepoDir = path.join(repoPath, agentName);
    fs.mkdirSync(agentRepoDir, { recursive: true });

    // 1. Copy Rules
    if (paths.rules && fs.existsSync(paths.rules) && target.syncGlobalRules) {
      const destFile = path.join(agentRepoDir, path.basename(paths.rules));
      copyFileSync(paths.rules, destFile);
      changed = true;
    }
    
    // 2. Copy Kimi Rules Directory
    if (paths.rulesDir && fs.existsSync(paths.rulesDir) && target.syncGlobalRules) {
      const destDir = path.join(agentRepoDir, 'rules');
      copyDirSync(paths.rulesDir, destDir);
      changed = true;
    }

    // 3. Copy Agents directory
    if (paths.agentsDir && fs.existsSync(paths.agentsDir) && target.syncAgents) {
      const destDir = path.join(agentRepoDir, 'agents');
      copyDirSync(paths.agentsDir, destDir);
      changed = true;
    }

    // 4. Copy Skills directory
    if (paths.skillsDir && fs.existsSync(paths.skillsDir) && target.syncSkills) {
      const destDir = path.join(agentRepoDir, 'skills');
      copyDirSync(paths.skillsDir, destDir);
      changed = true;
    }


  });

  if (options.dryRun) {
    console.log('[Dry Run] Files staged for sync inside local repo.');
    return Promise.resolve(false);
  }

  const commitMessage = options.message || `[Orbit] Unified agent sync: ${new Date().toISOString()}`;
  return commitAndPush(git, commitMessage);
}

function pullAndDistribute(config, repoPath, options = {}) {
  const git = getGitInstance(repoPath);

  return pullFromRemote(git)
    .then(() => {
      Object.keys(config.targets).forEach(agentName => {
        const target = config.targets[agentName];
        if (!target.enabled) return;

        const paths = getAgentPaths(agentName, target);
        if (!paths) return;

        const agentRepoDir = path.join(repoPath, agentName);
        if (!fs.existsSync(agentRepoDir)) return;

        // 1. Restore Rules File
        if (paths.rules && target.syncGlobalRules) {
          const repoFile = path.join(agentRepoDir, path.basename(paths.rules));
          if (fs.existsSync(repoFile)) {
            copyFileSync(repoFile, paths.rules);
          }
        }

        // 2. Restore Kimi Rules Directory
        if (paths.rulesDir && target.syncGlobalRules) {
          const repoDir = path.join(agentRepoDir, 'rules');
          if (fs.existsSync(repoDir)) {
            clearDirSync(paths.rulesDir);
            copyDirSync(repoDir, paths.rulesDir);
          }
        }

        // 3. Restore Agents Directory
        if (paths.agentsDir && target.syncAgents) {
          const repoDir = path.join(agentRepoDir, 'agents');
          if (fs.existsSync(repoDir)) {
            clearDirSync(paths.agentsDir);
            copyDirSync(repoDir, paths.agentsDir);
          }
        }

        // 4. Restore Skills Directory
        if (paths.skillsDir && target.syncSkills) {
          const repoDir = path.join(agentRepoDir, 'skills');
          if (fs.existsSync(repoDir)) {
            clearDirSync(paths.skillsDir);
            copyDirSync(repoDir, paths.skillsDir);
          }
        }


      });

      console.log('[Orbit] Successfully pulled and distributed all active rules.');
      return true;
    });
}

module.exports = {
  syncAll,
  pullAndDistribute
};
