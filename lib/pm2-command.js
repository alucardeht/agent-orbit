const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function getPM2Command() {
  const localPM2 = path.resolve(path.join(__dirname, '..', 'node_modules', 'pm2', 'bin', 'pm2'));
  if (!fs.existsSync(localPM2)) {
    try {
      execSync('npm install --no-audit --no-fund', { cwd: path.resolve(path.join(__dirname, '..')), stdio: 'ignore' });
    } catch (err) {
      return null;
    }
  }
  if (fs.existsSync(localPM2)) {
    return `node "${localPM2}"`;
  }
  return null;
}

function isPM2Installed() {
  return getPM2Command() !== null;
}

function runPM2Command(action) {
  const pm2Cmd = getPM2Command();
  if (!pm2Cmd) {
    return false;
  }

  const scriptPath = path.resolve(path.join(__dirname, '..', 'bin', 'agent-orbit.js'));

  try {
    if (action === 'start') {
      execSync(`${pm2Cmd} start "${scriptPath}" --name "agent-orbit" -- watch`, { stdio: 'inherit' });
      execSync(`${pm2Cmd} save`, { stdio: 'ignore' });
      console.log('[Orbit] Successfully started background watcher daemon under PM2.');
    } else if (action === 'stop') {
      execSync(`${pm2Cmd} stop "agent-orbit" 2>/dev/null || true`, { stdio: 'inherit' });
      console.log('[Orbit] Successfully stopped background watcher daemon.');
    } else if (action === 'restart') {
      execSync(`${pm2Cmd} restart "agent-orbit" 2>/dev/null || ${pm2Cmd} start "${scriptPath}" --name "agent-orbit" -- watch`, { stdio: 'inherit' });
      console.log('[Orbit] Successfully restarted background watcher daemon.');
    } else if (action === 'status') {
      try {
        execSync(`${pm2Cmd} show "agent-orbit"`, { stdio: 'inherit' });
      } catch (_) {
        console.log('  PM2: No active process registered for "agent-orbit".');
      }
    } else if (action === 'delete') {
      execSync(`${pm2Cmd} delete "agent-orbit" 2>/dev/null || true`, { stdio: 'ignore' });
    }
    return true;
  } catch (err) {
    console.error(`[Error] Failed to execute PM2 command "${action}": ${err.message}`);
    return false;
  }
}

module.exports = {
  isPM2Installed,
  runPM2Command,
  getPM2Command
};
