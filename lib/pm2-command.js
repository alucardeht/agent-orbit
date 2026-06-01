const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function isPM2Installed() {
  try {
    execSync('pm2 --version', { stdio: 'ignore' });
    return true;
  } catch (err) {
    return false;
  }
}

function runPM2Command(action) {
  if (!isPM2Installed()) {
    console.warn('[Warning] PM2 is not installed globally. Falling back to platform autostart hooks.');
    return false;
  }

  const scriptPath = path.resolve(path.join(__dirname, '..', 'bin', 'agent-orbit.js'));

  try {
    if (action === 'start') {
      execSync(`pm2 start "${scriptPath}" --name "agent-orbit" -- watch`, { stdio: 'inherit' });
      execSync('pm2 save', { stdio: 'ignore' });
      console.log('[Orbit] Successfully started background watcher daemon under PM2.');
    } else if (action === 'stop') {
      execSync('pm2 stop "agent-orbit" 2>/dev/null || true', { stdio: 'inherit' });
      console.log('[Orbit] Successfully stopped background watcher daemon.');
    } else if (action === 'restart') {
      execSync('pm2 restart "agent-orbit" 2>/dev/null || pm2 start "' + scriptPath + '" --name "agent-orbit" -- watch', { stdio: 'inherit' });
      console.log('[Orbit] Successfully restarted background watcher daemon.');
    } else if (action === 'status') {
      execSync('pm2 show "agent-orbit"', { stdio: 'inherit' });
    } else if (action === 'delete') {
      execSync('pm2 delete "agent-orbit" 2>/dev/null || true', { stdio: 'ignore' });
    }
    return true;
  } catch (err) {
    console.error(`[Error] Failed to execute PM2 command "${action}": ${err.message}`);
    return false;
  }
}

module.exports = {
  isPM2Installed,
  runPM2Command
};
