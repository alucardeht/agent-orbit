const fs = require('fs');
const path = require('path');
const os = require('os');

function getConfigDir() {
  const configHome = process.env.AGENT_ORBIT_CONFIG_DIR || path.join(os.homedir(), '.config', 'agent-orbit');
  return path.resolve(configHome);
}

function getConfigPath() {
  return path.join(getConfigDir(), 'config.json');
}

function getDefaultConfig() {
  return {
    version: "2.0.0",
    github: {
      repo: "agent-rules",
      owner: "alucardeht",
      authMethod: "ssh",
      token: null
    },
    targets: {
      codex: {
        enabled: true,
        home: {
          darwin: "~/.codex",
          win32: "~/.codex"
        },
        syncGlobalRules: true,
        syncSkills: true,
        syncAgents: true
      },
      claude: {
        enabled: true,
        home: {
          darwin: "~/.claude",
          win32: "~/.claude"
        },
        syncGlobalRules: true,
        syncSkills: true
      },
      antigravity: {
        enabled: true,
        home: {
          darwin: "~/.gemini/antigravity",
          win32: "~/.gemini/antigravity"
        },
        configHome: {
          darwin: "~/.gemini/config",
          win32: "~/.gemini/config"
        },
        syncGlobalRules: true,
        syncSkills: true
      },
      kimi: {
        enabled: true,
        home: {
          darwin: "~/.kimi-code",
          win32: "~/.kimi-code"
        },
        configHome: {
          darwin: "~/.config/agents",
          win32: "~/.config/agents"
        },
        syncGlobalRules: true,
        syncSkills: true
      }
    },
    autoSync: true,
    lastSync: null
  };
}

function loadConfig() {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    const defaultConfig = getDefaultConfig();
    saveConfig(defaultConfig);
    return defaultConfig;
  }

  try {
    const rawData = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(rawData);
  } catch (err) {
    console.error(`[Error] Failed to load configuration file at ${configPath}. Using defaults.`);
    return getDefaultConfig();
  }
}

function saveConfig(config) {
  const configDir = getConfigDir();
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

module.exports = {
  getConfigDir,
  getConfigPath,
  loadConfig,
  saveConfig,
  getDefaultConfig
};
