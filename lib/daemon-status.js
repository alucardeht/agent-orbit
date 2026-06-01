const { execSync } = require('child_process');
const { buildPm2Invocation } = require('./pm2-command');

function isDaemonRunning() {
  try {
    const invocation = buildPm2Invocation(['jlist']);
    if (!invocation) {
      return false;
    }

    const output = execSync(invocation.displayCommand, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const processes = JSON.parse(output);

    const codexSync = processes.find(p => p.name === 'codex-sync');
    return codexSync && codexSync.pm2_env.status === 'online';
  } catch (error) {
    return false;
  }
}

module.exports = { isDaemonRunning };
