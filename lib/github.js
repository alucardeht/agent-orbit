const { Octokit } = require('octokit');
const { execSync } = require('child_process');

class GitHubManager {
  constructor() {
    this.octokit = null;
  }

  async validateToken(token) {
    try {
      const octokit = new Octokit({ auth: token });
      const { data } = await octokit.rest.users.getAuthenticated();
      return { valid: true, username: data.login, name: data.name };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  checkRepoViaGit(repoUrl) {
    try {
      execSync(`git ls-remote "${repoUrl}" HEAD`, {
        timeout: 15000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return { exists: true, accessible: true };
    } catch (error) {
      const stderr = (error.stderr || '').toString();
      if (stderr.includes('not found') || stderr.includes('does not appear to be a git repository')) {
        return { exists: false, accessible: false, error: 'Repository not found' };
      }
      if (stderr.includes('Permission denied') || stderr.includes('permission denied')) {
        return { exists: true, accessible: false, error: 'Permission denied — check your SSH key has access to this repository' };
      }
      if (stderr.includes('Host key verification failed')) {
        return { exists: false, accessible: false, error: 'SSH host key verification failed — run: ssh -T git@github.com' };
      }
      return { exists: false, accessible: false, error: stderr.trim() || error.message };
    }
  }

  async checkRepo(owner, repo, token = null, authMethod = 'ssh') {
    if (authMethod === 'ssh' && !token) {
      const sshUrl = `git@github.com:${owner}/${repo}.git`;
      const gitCheck = this.checkRepoViaGit(sshUrl);

      if (gitCheck.exists && gitCheck.accessible) {
        return {
          exists: true,
          private: true,
          url: `https://github.com/${owner}/${repo}`,
          cloneUrl: `https://github.com/${owner}/${repo}.git`,
          sshUrl: sshUrl,
          fullName: `${owner}/${repo}`,
        };
      }

      if (gitCheck.exists && !gitCheck.accessible) {
        throw new Error(gitCheck.error);
      }

      try {
        const octokit = new Octokit();
        const { data } = await octokit.rest.repos.get({ owner, repo });
        return {
          exists: true,
          private: data.private,
          url: data.html_url,
          cloneUrl: data.clone_url,
          sshUrl: data.ssh_url,
          fullName: data.full_name,
        };
      } catch (_) {
        return { exists: false, gitError: gitCheck.error };
      }
    }

    try {
      const config = token ? { auth: token } : {};
      const octokit = new Octokit(config);

      const { data } = await octokit.rest.repos.get({
        owner,
        repo,
      });

      return {
        exists: true,
        private: data.private,
        url: data.html_url,
        cloneUrl: data.clone_url,
        sshUrl: data.ssh_url,
        fullName: data.full_name,
      };
    } catch (error) {
      if (error.status === 404) {
        return { exists: false };
      }
      throw new Error(`Failed to check repository: ${error.message}`);
    }
  }

  async createRepo(name, token, isPrivate = true) {
    try {
      const octokit = new Octokit({ auth: token });

      const { data } = await octokit.rest.repos.createForAuthenticatedUser({
        name,
        private: isPrivate,
        description: 'Global Codex configuration backup repository',
        auto_init: true,
      });

      return {
        created: true,
        url: data.html_url,
        cloneUrl: data.clone_url,
        sshUrl: data.ssh_url,
        fullName: data.full_name,
      };
    } catch (error) {
      if (error.status === 422) {
        throw new Error('Repository already exists');
      }
      throw new Error(`Failed to create repository: ${error.message}`);
    }
  }

  parseRepoUrl(url) {
    const patterns = [
      /github\.com[:/]([^/]+)\/([^/.]+)(\.git)?$/,
      /^([^/]+)\/([^/]+)$/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return {
          owner: match[1],
          repo: match[2].replace('.git', ''),
        };
      }
    }

    return null;
  }

  buildRepoUrl(owner, repo, authMethod = 'ssh') {
    if (authMethod === 'ssh') {
      return `git@github.com:${owner}/${repo}.git`;
    }
    return `https://github.com/${owner}/${repo}.git`;
  }
}

module.exports = new GitHubManager();
