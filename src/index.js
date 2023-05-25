require("dotenv").config();
const express = require("express");
const { verifySignature } = require("./github");
const { Slackbot } = require("./slack");

const config = {
  GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET,
  SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
  SLACK_CHANNEL_ID: process.env.SLACK_CHANNEL_ID,
  SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET,
  PORT: process.env.PORT ?? 3000,
};

const app = express();
app.disable("x-powered-by");
app.use(
  express.raw({
    type: "*/*",
    limit: "5mb",
  })
);

const slack = new Slackbot({
  slackBotToken: config.SLACK_BOT_TOKEN,
  slackSigningSecret: config.SLACK_SIGNING_SECRET,
  channelId: config.SLACK_CHANNEL_ID,
});

app.get("/internal/healthy", (req, res) => {
  res.status(200).end("OK");
});

app.post("/webhook", async (req, res) => {
  const bufferBody = req.body;
  const signature = req.headers["x-hub-signature-256"];
  const eventType = req.headers["x-github-event"];

  if (!Buffer.isBuffer(bufferBody)) {
    console.log("Received bad payload type (expected buffer)");
    return res.status(400).end("Bad request");
  }

  const body = bufferBody.toString();

  if (!verifySignature(body, signature, config.GITHUB_WEBHOOK_SECRET)) {
    console.log("Received bad signature for payload");
    res.status(403).end("Invalid signature");
    return;
  }

  const data = JSON.parse(body);
  console.log(
    `Received payload with type ${eventType} for repository ${data?.repository?.full_name}`
  );
  res.status(200).end(JSON.stringify({ success: true }));
  await handleHook(eventType, data);
});

const handleHook = (function () {
  const severityEmojis = {
    low: ":severity-low:",
    medium: ":severity-medium:",
    high: ":severity-high:",
    critical: ":severity-critical:",
  };

  const handlers = {
    ping: () => {},
    dependabot_alert: async ({ repository, action, alert }) => {
      const severity = alert?.security_advisory?.severity;
      console.log(
        `Dependabot alert for ${
          repository?.full_name
        }: ${action} [${severity?.toUpperCase()}] ${
          alert?.security_advisory?.summary
        } (${alert?.dependency?.package?.name})`
      );
      if (action === "created") {
        const emoji = severityEmojis[severity] ?? ":dependabot:";
        const text = `[${severity}] ${repository.name}: ${alert?.security_advisory?.summary} in ${alert?.dependency?.package?.name}`;
        const blocks = [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `${emoji} <${repository.html_url}|${repository.name}>: Vulnerability *<${alert?.html_url}|${alert?.security_advisory?.summary}>* in \`${alert?.dependency?.package?.name}\``,
            },
          },
        ];
        await slack.sendMessage({
          blocks,
          text,
        });
      }
    },
  };

  return async (eventType, data) => {
    const handler = handlers[eventType];
    if (handler) {
      await handler(data);
    } else {
      console.log(`Unexpected event type: ${eventType}`);
    }
  };
})();

app.listen(config.PORT, () => {
  console.log(`Started webhook receiver on port ${config.PORT}`);
});
