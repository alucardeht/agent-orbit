const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const lock = require('./lock');

const BACKUP_DIR = path.join(os.homedir(), '.config', 'agent-orbit', 'backups');

function toGitPath(filePath) {
  return filePath.replace(/\\/g, '/');
}

class GitManager {
  constructor() {
    this.repoPath = null;
    this.git = null;
    
    // Bind all methods to ensure "this" context is preserved even when destructured
    this.initRepository = this.initRepository.bind(this);
    this.commitAndPush = this.commitAndPush.bind(this);
    this.pullFromRemote = this.pullFromRemote.bind(this);
    this.pull = this.pull.bind(this);
    this.fetchRemoteHash = this.fetchRemoteHash.bind(this);
    this.getLocalHash = this.getLocalHash.bind(this);
    this.getStatus = this.getStatus.bind(this);
    this.getLastCommit = this.getLastCommit.bind(this);
    this.getRepoPath = this.getRepoPath.bind(this);
    this.backupRepo = this.backupRepo.bind(this);
    this.getGitInstance = this.getGitInstance.bind(this);
    this.checkSSHConnection = this.checkSSHConnection.bind(this);
  }

  setRepoPath(repoPath) {
    this.repoPath = path.resolve(repoPath);
    if (!fs.existsSync(this.repoPath)) {
      fs.mkdirSync(this.repoPath, { recursive: true });
    }
    this.git = simpleGit(this.repoPath);
  }

  // Pre-flight check: validates that SSH authentication with GitHub is functional
  checkSSHConnection() {
    return new Promise((resolve) => {
      exec('ssh -o ConnectTimeout=3 -T git@github.com', (error, stdout, stderr) => {
        const output = stderr + stdout;
        if (output.includes('successfully authenticated') || output.includes('You\'ve successfully authenticated')) {
          resolve({ success: true, message: 'SSH Authentication successful.' });
        } else {
          resolve({ 
            success: false, 
            message: 'SSH Authentication failed. Make sure your local public key (~/.ssh/id_rsa.pub) is authorized in your GitHub Settings -> SSH and GPG keys.' 
          });
        }
      });
    });
  }

  async _retryWithBackoff(fn, options = {}) {
    const { maxRetries = 3, initialDelay = 1000, operationName = 'git' } = options;
    let delay = initialDelay;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        console.warn(`[Warning] Git operation "${operationName}" failed (attempt ${attempt}/${maxRetries}). Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
  }

  async _pushWithPullRetry() {
    try {
      await this._retryWithBackoff(
        () => this.git.push('origin', 'main'),
        { operationName: 'git push' }
      );
    } catch (pushError) {
      console.log('  Push failed, attempting rebase pull first...');
      // During push conflicts, resolve auto-merges prioritizing local changes (ours)
      await this._pullWithStrategyInner('ours', this.git);
      await this._retryWithBackoff(
        () => this.git.push('origin', 'main'),
        { operationName: 'git push after rebase' }
      );
    }
  }

  async initRepository(cloneUrl) {
    return lock.withLock(async () => {
      if (!fs.existsSync(this.repoPath)) {
        fs.mkdirSync(this.repoPath, { recursive: true });
      }

      this.git = simpleGit(this.repoPath);

      // Check if it's already a git repository
      if (fs.existsSync(path.join(this.repoPath, '.git'))) {
        try {
          await this.git.remote(['set-url', 'origin', cloneUrl]);
        } catch (_) {
          try {
            await this.git.addRemote('origin', cloneUrl);
          } catch (_) {}
        }
        return true;
      }

      try {
        await this.git.clone(cloneUrl, this.repoPath);
        this.git = simpleGit(this.repoPath);
        return true;
      } catch (cloneError) {
        try {
          this.git = simpleGit(this.repoPath);
          await this.git.init();
          try {
            await this.git.remote(['set-url', 'origin', cloneUrl]);
          } catch (_) {
            await this.git.addRemote('origin', cloneUrl);
          }

          let remoteHasHistory = false;
          try {
            await this._retryWithBackoff(
              () => this.git.fetch('origin'),
              { operationName: 'git fetch' }
            );
            const branches = await this.git.branch(['-r']);
            remoteHasHistory = branches.all.includes('origin/main');
          } catch (_) {}

          if (remoteHasHistory) {
            await this.git.checkout(['-b', 'main']);
            await this.git.reset(['--hard', 'origin/main']);
            return true;
          }

          const readmePath = path.join(this.repoPath, 'README.md');
          if (!fs.existsSync(readmePath)) {
            fs.writeFileSync(
              readmePath,
              '# Agent Orbit Backup Repository\n\nThis repository contains synchronized global configurations for your AI Agents:\n- Codex (`/codex/`)\n- Claude (`/claude/`)\n- Antigravity (`/antigravity/`)\n- Kimi (`/kimi/`)\n- Minimax (`/minimax/`)\n- Cascade (`/cascade/`)\n',
              'utf8'
            );
          }

          for (const dir of ['codex', 'claude', 'antigravity', 'kimi', 'minimax', 'cascade']) {
            const dirPath = path.join(this.repoPath, dir);
            if (!fs.existsSync(dirPath)) {
              fs.mkdirSync(dirPath, { recursive: true });
              fs.writeFileSync(path.join(dirPath, '.gitkeep'), '', 'utf8');
            }
          }

          await this.git.add('.');
          const status = await this.git.status();
          if (status.files.length > 0) {
            await this.git.commit('Initial commit');
            await this._retryWithBackoff(
              () => this.git.push(['-u', 'origin', 'main']),
              { operationName: 'git push' }
            );
          }

          return true;
        } catch (initError) {
          throw new Error(`Failed to initialize repository: ${initError.message}`);
        }
      }
    });
  }

  async commitAndPush(gitInstance, commitMessage) {
    return lock.withLock(async () => {
      const activeGit = gitInstance || this.git;
      if (!activeGit) {
        throw new Error('Git instance not initialized.');
      }
      await activeGit.add('.');
      const status = await activeGit.status();
      let hasNewCommit = false;
      if (status.files.length > 0) {
        await activeGit.commit(commitMessage);
        hasNewCommit = true;
      }
      
      try {
        await this._retryWithBackoff(
          () => activeGit.push('origin', 'main'),
          { operationName: 'git push' }
        );
      } catch (pushError) {
        console.log('  Push failed, attempting rebase pull first...');
        // Prioritize local changes (ours) on pushes
        await this._pullWithStrategyInner('ours', activeGit);
        await this._retryWithBackoff(
          () => activeGit.push('origin', 'main'),
          { operationName: 'git push after rebase' }
        );
      }

      return { pushed: true, message: hasNewCommit ? 'Successfully pushed new changes to GitHub' : 'Successfully aligned and pushed to GitHub' };
    });
  }

  // The Unbreakable Git Shield: pulls using explicit merge strategy options
  async pullFromRemote(gitInstance) {
    // Default to prioritising remote changes (theirs) for clean, automatic updates during pulls
    return this.pullWithStrategy('theirs', gitInstance);
  }

  async pullWithStrategy(strategyName = 'theirs', gitInstance = null) {
    return lock.withLock(async () => {
      return this._pullWithStrategyInner(strategyName, gitInstance);
    });
  }

  async _pullWithStrategyInner(strategyName = 'theirs', gitInstance = null) {
      const activeGit = gitInstance || this.git;
      if (!activeGit) {
        throw new Error('Git instance not initialized.');
      }
      
      const status = await activeGit.status();
      if (status.files.length > 0) {
        await activeGit.add('.');
        await activeGit.commit('Auto-commit pending local changes before pull');
      }

      try {
        // Run rebase with built-in merge strategy options (-Xours or -Xtheirs) to automatically resolve conflicts!
        console.log(`[Orbit] Fetching and rebasing from remote using auto-merge strategy: -X ${strategyName}`);
        await this._retryWithBackoff(
          () => activeGit.pull('origin', 'main', { '--rebase': null, '-X': strategyName }),
          { operationName: `git pull --rebase -X ${strategyName}` }
        );
      } catch (pullError) {
        const msg = (pullError.message || String(pullError)).toLowerCase();

        // Fallback: If Git is still stuck in an unresolvable logical merge block
        if (msg.includes('conflict') || msg.includes('rebase') || msg.includes('could not apply')) {
          console.warn('[Orbit] [Warning] Direct auto-merge strategy halted. Invoking Git Shield disaster recovery...');
          
          try { 
            // 1. Instantly abort the rebase to clear local Git status and prevent hangs
            await activeGit.rebase({ '--abort': null }); 
          } catch (_) {}

          // 2. Backup the entire local repository safely
          const backupDir = await this.backupRepo();
          console.warn(`[Orbit] [Git Shield] Conflicted repository backed up safely to: ${backupDir}`);

          // 3. Force alignment: Hard reset to remote origin to keep local clean
          await this._retryWithBackoff(
            () => activeGit.fetch('origin'),
            { operationName: 'git fetch' }
          );
          await activeGit.reset(['--hard', 'origin/main']);
          
          console.warn('[Orbit] [Git Shield] Repository successfully restored to origin/main.');
          return;
        }

        throw pullError;
      }
  }

  async pull() {
    return this.pullFromRemote(this.git);
  }

  async fetchRemoteHash() {
    return lock.withLock(async () => {
      if (!this.git) {
        this.git = simpleGit(this.repoPath);
      }

      await this._retryWithBackoff(
        () => this.git.fetch('origin'),
        { operationName: 'git fetch' }
      );

      try {
        const remoteLog = await this.git.log(['origin/main', '-1']);
        return remoteLog && remoteLog.latest ? remoteLog.latest.hash : null;
      } catch (_) {
        return null;
      }
    });
  }

  async getLocalHash() {
    if (!this.git) {
      this.git = simpleGit(this.repoPath);
    }

    try {
      const log = await this.git.log(['-1']);
      return log && log.latest ? log.latest.hash : null;
    } catch (_) {
      return null;
    }
  }

  async getStatus() {
    if (!this.git) {
      this.git = simpleGit(this.repoPath);
    }
    return await this.git.status();
  }

  async getLastCommit() {
    if (!this.git) {
      this.git = simpleGit(this.repoPath);
    }

    try {
      const log = await this.git.log({ maxCount: 1 });
      if (log && log.latest) {
        return {
          message: log.latest.message,
          date: log.latest.date,
          hash: log.latest.hash,
        };
      }
    } catch (e) {}

    return null;
  }

  getRepoPath() {
    return this.repoPath;
  }

  async backupRepo() {
    if (!fs.existsSync(this.repoPath)) return null;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `repo-backup-${timestamp}`);

    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    fs.cpSync(this.repoPath, backupPath, { recursive: true });
    return backupPath;
  }

  getGitInstance(repoPath) {
    if (repoPath) {
      const resolved = path.resolve(repoPath);
      if (!fs.existsSync(resolved)) {
        fs.mkdirSync(resolved, { recursive: true });
      }
      return simpleGit(resolved);
    }
    if (!this.git) {
      if (!fs.existsSync(this.repoPath)) {
        fs.mkdirSync(this.repoPath, { recursive: true });
      }
      this.git = simpleGit(this.repoPath);
    }
    return this.git;
  }
}

module.exports = new GitManager();
