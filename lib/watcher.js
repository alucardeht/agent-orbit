const chokidar = require('chokidar');
const { getAgentPaths } = require('./paths');
const fs = require('fs');
const path = require('path');

function startWatcher(config, onChange) {
  const pathsToWatch = [];
  const activeAgentPaths = {};

  Object.keys(config.targets).forEach(agent => {
    const target = config.targets[agent];
    if (target.enabled) {
      const paths = getAgentPaths(agent, target);
      if (paths) {
        activeAgentPaths[agent] = paths;
        
        // Add rules file
        if (paths.rules && fs.existsSync(paths.rules)) {
          pathsToWatch.push(paths.rules);
        }
        
        // Add rules directory (like Kimi rules/)
        if (paths.rulesDir) {
          if (!fs.existsSync(paths.rulesDir)) fs.mkdirSync(paths.rulesDir, { recursive: true });
          pathsToWatch.push(paths.rulesDir);
        }

        // Add agents directory
        if (paths.agentsDir) {
          if (!fs.existsSync(paths.agentsDir)) fs.mkdirSync(paths.agentsDir, { recursive: true });
          pathsToWatch.push(paths.agentsDir);
        }

        // Add skills directory
        if (paths.skillsDir) {
          if (!fs.existsSync(paths.skillsDir)) fs.mkdirSync(paths.skillsDir, { recursive: true });
          pathsToWatch.push(paths.skillsDir);
        }


      }
    }
  });

  if (pathsToWatch.length === 0) {
    throw new Error('No active paths to watch. Please verify config.json targets.');
  }

  const watcher = chokidar.watch(pathsToWatch, {
    ignored: (filePath) => {
      const basename = path.basename(filePath);
      if (basename === '.git' || basename === '.DS_Store' || basename === 'node_modules') {
        return true;
      }
      if (basename.startsWith('.') && !['.codex', '.claude', '.gemini', '.config', '.minimax', '.kimi', '.kimi-code', '.codeium'].includes(basename)) {
        return true;
      }
      return false;
    },
    persistent: true,
    ignoreInitial: true,
    depth: 99
  });

  watcher.on('all', (event, filePath) => {
    // Resolve which agent this file belongs to
    let detectedAgent = 'unknown';
    for (const [agent, paths] of Object.entries(activeAgentPaths)) {
      if ((paths.rules && filePath === paths.rules) ||
         filePath.startsWith(paths.home) || 
         (paths.rulesDir && filePath.startsWith(paths.rulesDir)) ||
         (paths.skillsDir && filePath.startsWith(paths.skillsDir))) {
        detectedAgent = agent;
        break;
      }
    }
    onChange(event, filePath, detectedAgent);
  });

  return watcher;
}

module.exports = {
  startWatcher
};
