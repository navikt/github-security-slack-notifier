const crypto = require("crypto");
const { App } = require("octokit");

function verifySignature(body, signature, secret) {
  if (!secret || !signature) {
    return false;
  }
  const hash =
    "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
  return hash === signature;
}

class Github {
  constructor({ appId, installationId, privateKey }) {
    this.installationId = installationId;

    this.github = new App({
      appId,
      privateKey,
    });
  }

  async auth() {
    this.octokit = await this.github.getInstallationOctokit(
      this.installationId
    );
  }

  async getTeamsForRepo(owner, repo) {
    const resp = await this.octokit.rest.repos.listTeams({
      repo,
      owner,
      per_page: 100,
    });

    return resp.data;
  }
}

module.exports = {
  verifySignature,
  Github,
};
