const inquirer = require('inquirer');
const chalk = require('chalk');
const boxen = require('boxen');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { saveConfig, loadConfig, getConfigPath } = require('./config');
const gitManager = require('./git');
const { syncAll, pullAndDistribute } = require('./syncer');
const { isPM2Installed } = require('./pm2-command');

// Checks if the daemon is currently running under PM2
function checkAndPauseDaemon() {
  if (!isPM2Installed()) {
    return false; // PM2 is not installed, no daemon can be running under it
  }
  try {
    const list = execSync('pm2 jlist 2>/dev/null', { encoding: 'utf8' });
    const apps = JSON.parse(list);
    const daemonApp = apps.find(app => app.name === 'agent-orbit' && app.pm2_env.status === 'online');
    if (daemonApp) {
      console.log(chalk.yellow('\n[Orbit] Active background watcher daemon detected. Pausing daemon for setup...'));
      execSync('pm2 stop "agent-orbit" 2>/dev/null', { stdio: 'ignore' });
      return true; // was paused
    }
  } catch (_) {}
  return false; // was not running
}

async function runSetup() {
  console.log(boxen(chalk.bold.green('Agent Orbit Setup Wizard') + '\n\nThis wizard will bootstrap your unified cross-platform AI agent syncing engine.', {
    padding: 1,
    margin: 1,
    borderStyle: 'round',
    borderColor: 'green'
  }));

  const config = loadConfig();

  // 1. Run Pre-flight SSH Connection Diagnostics
  console.log(chalk.cyan('[Orbit] Running pre-flight SSH diagnostics...'));
  const sshCheck = await gitManager.checkSSHConnection();
  if (!sshCheck.success) {
    console.error(boxen(chalk.bold.red('✕ SSH Diagnostic Check Failed!') + `\n\n${sshCheck.message}\n\n${chalk.bold.yellow('Troubleshooting Help:')}\n1. Run "ssh-add -l" to check if your SSH key is loaded.\n2. Ensure your key is copied to your clipboard (pbcopy < ~/.ssh/id_rsa.pub) and registered in your GitHub Account Settings under "SSH and GPG keys".\n3. Confirm that "ssh -T git@github.com" returns a successful authentication message.`, {
      padding: 1,
      margin: 1,
      borderStyle: 'double',
      borderColor: 'red'
    }));
    process.exit(1);
  }
  console.log(chalk.green('  ✓ SSH connection diagnosed successfully. Key is authenticated with GitHub.\n'));

  // 2. Pause background daemon if active to prevent lockups
  const daemonWasPaused = checkAndPauseDaemon();

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'owner',
      message: 'Enter your GitHub username/owner:',
      default: config.github.owner || 'alucardeht'
    },
    {
      type: 'input',
      name: 'repo',
      message: 'Enter your GitHub backup repository name:',
      default: config.github.repo || 'agent-rules'
    },
    {
      type: 'list',
      name: 'authMethod',
      message: 'Select Git authentication method:',
      choices: ['ssh', 'https'],
      default: config.github.authMethod || 'ssh'
    },
    {
      type: 'input',
      name: 'token',
      message: 'Enter GitHub Personal Access Token (only required for HTTPS):',
      when: (answers) => answers.authMethod === 'https',
      default: config.github.token || ''
    }
  ]);

  // Update configuration
  config.github.owner = answers.owner.trim();
  config.github.repo = answers.repo.trim();
  config.github.authMethod = answers.authMethod;
  config.github.token = answers.token ? answers.token.trim() : null;

  saveConfig(config);
  console.log(chalk.green('\n[Success] Configuration saved successfully to: ') + getConfigPath());

  // Construct repository URL
  let cloneUrl = '';
  if (config.github.authMethod === 'ssh') {
    cloneUrl = `git@github.com:${config.github.owner}/${config.github.repo}.git`;
  } else {
    cloneUrl = `https://github.com/${config.github.owner}/${config.github.repo}.git`;
    if (config.github.token) {
      cloneUrl = `https://${config.github.owner}:${config.github.token}@github.com/${config.github.owner}/${config.github.repo}.git`;
    }
  }

  const repoPath = path.join(path.dirname(getConfigPath()), 'repo');
  gitManager.setRepoPath(repoPath);

  console.log(chalk.cyan(`\n[Orbit] Connecting to GitHub repository: ${cloneUrl}...`));

  const spinner = (await import('ora')).default('Initializing Git repository local clone...').start();
  
  try {
    await gitManager.initRepository(cloneUrl);
    spinner.succeed(chalk.green('Git repository initialized and connected.'));
  } catch (err) {
    spinner.fail(chalk.red(`Failed to connect to Git: ${err.message}`));
    console.log(chalk.yellow('\n[Troubleshooting] Make sure:'));
    console.log(`1. The private repository "${config.github.repo}" has been created on your GitHub profile.`);
    console.log('2. Your SSH keys are fully authorized in your GitHub Settings.');
    process.exit(1);
  }

  // 3. Inspect if remote repository already contains history or is empty
  let remoteHasHistory = false;
  try {
    const gitInstance = gitManager.getGitInstance(repoPath);
    await gitInstance.fetch('origin');
    const branches = await gitInstance.branch(['-r']);
    remoteHasHistory = branches.all.includes('origin/main');
  } catch (_) {}

  // Determine initial action automatically if possible, or advise
  let choice = 'push';
  if (remoteHasHistory) {
    console.log(chalk.cyan('\n[Orbit] Existing backup rules detected in the remote repository.'));
    const syncAction = await inquirer.prompt([
      {
        type: 'list',
        name: 'choice',
        message: 'Choose initial sync action:',
        choices: [
          { name: 'Pull rules from GitHub (Restore backup onto this machine) [Recommended]', value: 'pull' },
          { name: 'Push local rules to GitHub (Overwrite backup with this machine rules)', value: 'push' }
        ]
      }
    ]);
    choice = syncAction.choice;
  } else {
    console.log(chalk.green('\n[Orbit] Empty remote repository detected. Defaulting to Publish local rules.'));
  }

  const syncSpinner = (await import('ora')).default('Performing initial synchronization...').start();
  try {
    if (choice === 'pull') {
      await pullAndDistribute(config, repoPath);
      syncSpinner.succeed(chalk.green('Successfully pulled and restored your AI rules onto this machine!'));
    } else {
      await syncAll(config, repoPath, { message: '[Orbit] Initial base backup' });
      syncSpinner.succeed(chalk.green('Successfully backed up and published this machine rules to GitHub!'));
    }

    config.lastSync = new Date().toISOString();
    saveConfig(config);
    
    // 4. AUTOMATIC AUTOSTART REGISTRATION & DEPLOYMENT
    console.log(chalk.cyan('\n[Orbit] Automatically enabling background autostart daemon...'));
    const platform = process.platform;
    if (platform === 'darwin') {
      const { enableAutostart } = require('./autostart-macos');
      enableAutostart();
    } else if (platform === 'win32') {
      const { enableAutostart } = require('./autostart-win');
      enableAutostart();
    }

    // Programmatically restart daemon
    console.log(chalk.cyan('[Orbit] Starting/resuming PM2 background watcher...'));
    const { runPM2Command } = require('./pm2-command');
    runPM2Command('start');

    console.log(boxen(chalk.bold.green('✓ Setup & Background Autostart Fully Complete!') + '\n\nThe daemon is now active in the background. Rules will auto-sync on modifications silently!', {
      padding: 1,
      margin: 1,
      borderStyle: 'double',
      borderColor: 'green'
    }));

  } catch (err) {
    syncSpinner.fail(chalk.red(`Sync failed: ${err.message}`));
    // Try to restart daemon if it was running before
    if (daemonWasPaused) {
      console.log(chalk.yellow('[Orbit] Restoring background PM2 daemon...'));
      const { runPM2Command } = require('./pm2-command');
      runPM2Command('start');
    }
    process.exit(1);
  }
}

module.exports = {
  runSetup
};
