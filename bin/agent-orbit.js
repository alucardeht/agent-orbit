#!/usr/bin/env node

const { program } = require('commander');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { runSetup } = require('../lib/setup');
const { runDaemon } = require('../lib/daemon');
const { syncAll, pullAndDistribute } = require('../lib/syncer');
const { loadConfig, getConfigPath } = require('../lib/config');
const { getAgentPaths } = require('../lib/paths');
const { runPM2Command, isPM2Installed } = require('../lib/pm2-command');
const gitManager = require('../lib/git');

const pkg = require('../package.json');

program
  .name('agent-orbit')
  .description(pkg.description)
  .version(pkg.version);

program
  .command('init')
  .description('Launch the interactive configuration and bootstrap wizard')
  .action(async () => {
    try {
      await runSetup();
    } catch (err) {
      console.error(chalk.red(`[Error] Setup failed: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command('sync')
  .description('Manually push all local modified agent rules to GitHub')
  .option('-m, --message <msg>', 'Custom commit message')
  .option('--dry-run', 'Stage files and verify mappings without performing Git push')
  .action(async (options) => {
    const config = loadConfig();
    const repoPath = path.join(path.dirname(getConfigPath()), 'repo');
    
    console.log(chalk.cyan('[Orbit] Synchronizing local rules to GitHub...'));
    try {
      const res = await syncAll(config, repoPath, options);
      if (res && res.pushed) {
        console.log(chalk.green(`✓ Sync complete: ${res.message}`));
      } else {
        console.log(chalk.yellow('Sync check: No changes detected.'));
      }
    } catch (err) {
      console.error(chalk.red(`[Error] Sync failed: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command('pull')
  .description('Pull rules from GitHub and distribute them locally')
  .action(async () => {
    const config = loadConfig();
    const repoPath = path.join(path.dirname(getConfigPath()), 'repo');

    console.log(chalk.cyan('[Orbit] Pulling rules from GitHub...'));
    try {
      await pullAndDistribute(config, repoPath);
      console.log(chalk.green('✓ Rules pulled and successfully distributed locally!'));
    } catch (err) {
      console.error(chalk.red(`[Error] Pull failed: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command('watch')
  .description('Run the active files watcher in the foreground')
  .action(() => {
    runDaemon();
  });

program
  .command('start')
  .description('Start the background watcher daemon under PM2')
  .action(() => {
    runPM2Command('start');
  });

program
  .command('stop')
  .description('Stop the PM2 background watcher daemon')
  .action(() => {
    runPM2Command('stop');
  });

program
  .command('restart')
  .description('Restart the PM2 background watcher daemon')
  .action(() => {
    runPM2Command('restart');
  });

program
  .command('status')
  .description('Display status and details of the background daemon')
  .action(() => {
    const config = loadConfig();
    console.log(chalk.bold.green('=== Agent Orbit Status ==='));
    console.log(`Version: ${pkg.version}`);
    console.log(`Config Path: ${getConfigPath()}`);
    console.log(`Last Sync: ${config.lastSync || 'Never'}`);
    console.log(`GitHub Repository: ${config.github.owner}/${config.github.repo} (${config.github.authMethod})`);
    
    console.log(chalk.cyan('\nActive Targets:'));
    Object.keys(config.targets).forEach(agent => {
      const tgt = config.targets[agent];
      console.log(`  - ${chalk.bold(agent)}: ${tgt.enabled ? chalk.green('ENABLED') : chalk.red('DISABLED')}`);
    });

    console.log(chalk.cyan('\nWatcher Daemon Status:'));
    const configDir = path.dirname(getConfigPath());
    const pidFilePath = path.join(configDir, 'daemon.pid');
    let nativeRunning = false;
    let nativePid = null;
    if (fs.existsSync(pidFilePath)) {
      try {
        const pidStr = fs.readFileSync(pidFilePath, 'utf8').trim();
        const pid = parseInt(pidStr, 10);
        if (!isNaN(pid)) {
          process.kill(pid, 0);
          nativeRunning = true;
          nativePid = pid;
        }
      } catch (err) {}
    }

    if (nativeRunning) {
      console.log(`  Native Watcher: ${chalk.green('RUNNING')} (PID: ${nativePid})`);
    } else {
      console.log(`  Native Watcher: ${chalk.red('STOPPED')}`);
    }

    if (isPM2Installed()) {
      console.log(chalk.cyan('\nPM2 Daemon Status:'));
      runPM2Command('status');
    }
  });

program
  .command('logs')
  .description('Display log streams from the PM2 daemon')
  .action(() => {
    const { execSync } = require('child_process');
    try {
      execSync('pm2 logs "agent-orbit"', { stdio: 'inherit' });
    } catch (err) {
      console.error(chalk.red('[Error] Failed to display logs. PM2 might not be active.'));
    }
  });

program
  .command('enable-autostart')
  .description('Configure native OS autostart to run the watcher daemon on system boot')
  .action(() => {
    const platform = process.platform;
    if (platform === 'darwin') {
      const { enableAutostart } = require('../lib/autostart-macos');
      enableAutostart();
    } else if (platform === 'win32') {
      const { enableAutostart } = require('../lib/autostart-win');
      enableAutostart();
    } else {
      console.error(chalk.red(`[Error] Autostart not supported on platform: ${platform}`));
    }
  });

program
  .command('disable-autostart')
  .description('Disable and remove native OS autostart daemon configurations')
  .action(() => {
    const platform = process.platform;
    if (platform === 'darwin') {
      const { disableAutostart } = require('../lib/autostart-macos');
      disableAutostart();
    } else if (platform === 'win32') {
      const { disableAutostart } = require('../lib/autostart-win');
      disableAutostart();
    } else {
      console.error(chalk.red(`[Error] Autostart not supported on platform: ${platform}`));
    }
  });

program
  .command('doctor')
  .description('Audit local configurations and verify path/dependencies health')
  .action(async () => {
    console.log(chalk.bold.green('=== Agent Orbit Doctor ==='));
    const config = loadConfig();
    let warnings = 0;

    // 1. Audit SSH Keys and GitHub Connection
    console.log(chalk.cyan('\nAuditing SSH Credentials...'));
    const sshCheck = await gitManager.checkSSHConnection();
    if (sshCheck.success) {
      console.log(chalk.green('  ✓ SSH Connection: Authenticated successfully with GitHub.'));
    } else {
      console.log(chalk.yellow(`  ✕ SSH connection warning: ${sshCheck.message}`));
      warnings++;
    }

    // 2. Audit Paths for Active Targets
    Object.keys(config.targets).forEach(agentName => {
      const target = config.targets[agentName];
      if (!target.enabled) return;

      console.log(chalk.cyan(`\nChecking ${agentName.toUpperCase()} paths...`));
      const paths = getAgentPaths(agentName, target);
      if (!paths) {
        console.log(chalk.red('  ✕ Failed to resolve paths.'));
        warnings++;
        return;
      }

      // Check rules path
      if (paths.rules) {
        if (fs.existsSync(paths.rules)) {
          console.log(`  ✓ Rules File: ${paths.rules}`);
        } else {
          console.log(chalk.yellow(`  ✕ Rules File missing: ${paths.rules}`));
        }
      }

      // Check rulesDir (Kimi)
      if (paths.rulesDir) {
        if (fs.existsSync(paths.rulesDir)) {
          console.log(`  ✓ Rules Directory: ${paths.rulesDir}`);
        } else {
          console.log(chalk.yellow(`  ✕ Rules Directory missing: ${paths.rulesDir}`));
        }
      }

      // Check skills
      if (paths.skillsDir) {
        if (fs.existsSync(paths.skillsDir)) {
          console.log(`  ✓ Skills Folder: ${paths.skillsDir}`);
        } else {
          console.log(chalk.yellow(`  ✕ Skills Folder missing: ${paths.skillsDir}`));
        }
      }

      // Check agents
      if (paths.agentsDir) {
        if (fs.existsSync(paths.agentsDir)) {
          console.log(`  ✓ Agents Folder: ${paths.agentsDir}`);
        } else {
          console.log(chalk.yellow(`  ✕ Agents Folder missing: ${paths.agentsDir}`));
        }
      }
    });

    console.log('\n--------------------');
    if (warnings === 0) {
      console.log(chalk.bold.green('✓ All active target directories and SSH credentials resolved cleanly! Your system is healthy.'));
    } else {
      console.log(chalk.bold.yellow(`⚠ Found ${warnings} audit warnings. (Some folders might not exist yet or SSH connection is inactive).`));
    }
  });

program
  .command('uninstall')
  .description('Completely stop background processes, clear native autostarts, and delete local config cache (preserving actual agent rules/skills)')
  .action(() => {
    console.log(chalk.bold.red('=== Deactivating and Resetting Agent Orbit ==='));
    const platform = process.platform;

    // 1. Disable native OS autostarts
    console.log(chalk.cyan('Clearing native OS autostarts...'));
    if (platform === 'darwin') {
      const { disableAutostart } = require('../lib/autostart-macos');
      disableAutostart();
    } else if (platform === 'win32') {
      const { disableAutostart } = require('../lib/autostart-win');
      disableAutostart();
    }

    // 2. Kill and delete PM2 watcher daemon
    console.log(chalk.cyan('Stopping background daemons...'));
    runPM2Command('stop');
    runPM2Command('delete');

    // 3. Delete ~/.config/agent-orbit directory recursively
    const { getConfigDir } = require('../lib/config');
    const configDir = getConfigDir();
    if (fs.existsSync(configDir)) {
      console.log(chalk.cyan(`Deleting local config directory: ${configDir}...`));
      fs.rmSync(configDir, { recursive: true, force: true });
    }

    console.log(chalk.bold.green('\n✓ Reset successful! All background tasks and local configuration cache have been cleared.'));
    console.log(chalk.green('✓ Actual AI rules, skills, and agents were kept 100% untouched and safe.'));
  });

program.parse(process.argv);
