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

  async sendMessage({ text, blocks }) {
    await this.app.client.chat.postMessage({
      channel: this.channelId,
      unfurl_links: false,
      text,
      blocks,
    });
  }
}

module.exports = { Slackbot };
