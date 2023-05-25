const { App } = require("@slack/bolt");

class Slackbot {
  constructor({ slackBotToken, slackSigningSecret, channelId }) {
    this.app = new App({
      token: slackBotToken,
      signingSecret: slackSigningSecret,
    });
    this.channelId = channelId;
  }

  async sendText(text) {
    await this.app.client.chat.postMessage({
      channel: this.channelId,
      unfurl_links: false,
      text,
    });
  }
}

module.exports = { Slackbot };
