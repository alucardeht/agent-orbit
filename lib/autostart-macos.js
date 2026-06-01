const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

function getPlistPath() {
  return path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.alucardeht.agent-orbit.plist');
}

function enableAutostart() {
  const plistPath = getPlistPath();
  const plistDir = path.dirname(plistPath);

  if (!fs.existsSync(plistDir)) {
    fs.mkdirSync(plistDir, { recursive: true });
  }

  const nodePath = process.execPath;
  const scriptPath = path.resolve(path.join(__dirname, '..', 'bin', 'agent-orbit.js'));

  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.alucardeht.agent-orbit</string>
    <key>ProgramArguments</key>
    <array>
        <string>${nodePath}</string>
        <string>${scriptPath}</string>
        <string>watch</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${path.join(os.homedir(), '.config', 'agent-orbit', 'launchd.out.log')}</string>
    <key>StandardErrorPath</key>
    <string>${path.join(os.homedir(), '.config', 'agent-orbit', 'launchd.err.log')}</string>
</dict>
</plist>`;

  fs.writeFileSync(plistPath, plistContent, 'utf8');

  try {
    execSync(`launchctl unload ${plistPath} 2>/dev/null || true`);
    execSync(`launchctl load ${plistPath}`);
    console.log('[Orbit] Successfully enabled autostart via launchd plist.');
    return true;
  } catch (err) {
    console.error(`[Error] Failed to load launchd Plist: ${err.message}`);
    return false;
  }
}

function disableAutostart() {
  const plistPath = getPlistPath();
  if (fs.existsSync(plistPath)) {
    try {
      execSync(`launchctl unload ${plistPath} 2>/dev/null || true`);
      fs.unlinkSync(plistPath);
      console.log('[Orbit] Successfully disabled launchd autostart.');
      return true;
    } catch (err) {
      console.error(`[Error] Failed to unload launchd Plist: ${err.message}`);
      return false;
    }
  }
  return true;
}

module.exports = {
  enableAutostart,
  disableAutostart
};
