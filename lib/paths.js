const os = require('os');
const path = require('path');
const fs = require('fs');

function resolvePath(dirPath) {
  if (!dirPath) return '';
  if (dirPath.startsWith('~')) {
    return path.join(os.homedir(), dirPath.slice(1));
  }
  return path.resolve(dirPath);
}

function getPlatformPath(pathObj) {
  const platform = process.platform; // 'darwin' (macOS) or 'win32' (Windows)
  const targetPath = pathObj[platform] || pathObj['darwin'];
  return resolvePath(targetPath);
}

function getAgentPaths(agentName, targetConfig) {
  const home = getPlatformPath(targetConfig.home);
  
  if (agentName === 'codex') {
    return {
      home,
      rules: path.join(home, 'AGENTS.md'),
      agentsDir: path.join(home, 'agents'),
      skillsDir: path.join(home, 'skills')
    };
  } else if (agentName === 'antigravity') {
    const configHome = getPlatformPath(targetConfig.configHome || {
      darwin: '~/.gemini/config',
      win32: '~/.gemini/config'
    });
    return {
      home,
      rules: path.join(path.dirname(home), 'GEMINI.md'),
      skillsDir: path.join(home, 'skills')
    };
  } else if (agentName === 'claude') {
    return {
      home,
      rules: path.join(home, 'CLAUDE.md'),
      skillsDir: path.join(home, 'skills')
    };
  } else if (agentName === 'kimi') {
    const configHome = getPlatformPath(targetConfig.configHome || {
      darwin: '~/.config/agents',
      win32: '~/.config/agents'
    });
    // Check if ~/.kimi-code exists, else fallback to ~/.kimi
    let actualHome = home;
    if (!fs.existsSync(home)) {
      const fallbackHome = resolvePath('~/.kimi');
      if (fs.existsSync(fallbackHome)) {
        actualHome = fallbackHome;
      }
    }
    return {
      home: actualHome,
      rulesDir: path.join(configHome, 'rules'),
      skillsDir: path.join(configHome, 'skills')
    };
  } else if (agentName === 'minimax') {
    return {
      home,
      rules: path.join(home, 'MINIMAX.md'),
      skillsDir: path.join(home, 'skills')
    };
  }
  return null;
}

module.exports = {
  resolvePath,
  getPlatformPath,
  getAgentPaths
};
