const chokidar = require('chokidar');
const { getAgentPaths } = require('./paths');
const fs = require('fs');

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
        if (paths.rulesDir && fs.existsSync(paths.rulesDir)) {
          pathsToWatch.push(paths.rulesDir);
        }

        // Add agents directory
        if (paths.agentsDir && fs.existsSync(paths.agentsDir)) {
          pathsToWatch.push(paths.agentsDir);
        }

        // Add skills directory
        if (paths.skillsDir && fs.existsSync(paths.skillsDir)) {
          pathsToWatch.push(paths.skillsDir);
        }


      }
    }
  });

  if (pathsToWatch.length === 0) {
    throw new Error('No active paths to watch. Please verify config.json targets.');
  }

  const watcher = chokidar.watch(pathsToWatch, {
    ignored: /(^|[\/\\])\../, // ignore hidden files
    persistent: true,
    ignoreInitial: true,
    depth: 99
  });

  watcher.on('all', (event, filePath) => {
    // Resolve which agent this file belongs to
    let detectedAgent = 'unknown';
    for (const [agent, paths] of Object.entries(activeAgentPaths)) {
      if (filePath.startsWith(paths.home) || 
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
