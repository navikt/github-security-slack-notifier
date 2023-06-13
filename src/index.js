require("dotenv").config();
const express = require("express");
const RateLimit = require("express-rate-limit");
const { Github, verifySignature } = require("./github");
const { Slackbot } = require("./slack");

const config = {
  GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET,
  GITHUB_APP_ID: process.env.GITHUB_APP_ID,
  GITHUB_INSTALLATION_ID: process.env.GITHUB_INSTALLATION_ID,
  GITHUB_ORG_NAME: process.env.GITHUB_ORG_NAME,
  GITHUB_PRIVATE_KEY: process.env.GITHUB_PRIVATE_KEY,

  SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
  SLACK_CHANNEL_ID: process.env.SLACK_CHANNEL_ID,
  SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET,

  PORT: process.env.PORT ?? 3000,
};

const app = express();

const rateLimiter = RateLimit({
  windowMs: 1 * 60 * 1000,
  max: 50,
});
app.use(rateLimiter);

app.disable("x-powered-by");
app.use(
  express.raw({
    type: "*/*",
    limit: "5mb",
  })
);

const github = new Github({
  appId: config.GITHUB_APP_ID,
  installationId: config.GITHUB_INSTALLATION_ID,
  privateKey: config.GITHUB_PRIVATE_KEY,
});

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

const getAdminTeamsForRepo = (function () {
  const repoAdminTeamsCache = {};

  return async (repository) => {
    const owner = repository.owner.login;
    const repo = repository.name;
    if (owner !== config.GITHUB_ORG_NAME) {
      // Ignore non-NAV repos
      return [];
    }
    const cacheKey = repository.full_name;
    const cachedTeams = repoAdminTeamsCache[cacheKey];
    if (cachedTeams) return cachedTeams;

    try {
      const teams = await github.getTeamsForRepo(owner, repo);
      const adminTeams = teams
        .filter((team) => team?.permissions?.admin)
        .map((team) => ({
          name: team.name,
          url: team.html_url,
        }));
      repoAdminTeamsCache[cacheKey] = adminTeams;
      console.log(
        `Looked up admin teams for ${cacheKey}, found ${adminTeams.length}`
      );
      return adminTeams;
    } catch (e) {
      console.log(`Error looking up admin teams for ${cacheKey}`, e);
      return [];
    }
  };
})();

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
      const emoji = severityEmojis[severity] ?? ":dependabot:";
      const text = `${action}: [${severity}] ${repository.name}: ${alert?.security_advisory?.summary} in ${alert?.dependency?.package?.name}`;
      const teams = await getAdminTeamsForRepo(repository);
      if (["created", "reintroduced"].includes(action)) {
        const blocks = [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `${emoji} <${repository.html_url}|${repository.name}>: ${action} *<${alert?.html_url}|${alert?.security_advisory?.summary}>* in \`${alert?.dependency?.package?.name}\``,
            },
          },
        ];
        if (teams.length) {
          const teamsString = teams
            .map((team) => `*<${team.url}|${team.name}>*`)
            .join(", ");
          blocks.push({
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `Teams (admin): ${teamsString}`,
              },
            ],
          });
        }
        await slack.sendMessage({
          blocks,
          text,
        });
      } else if (["fixed", "dismissed"].includes(action)) {
        const blocks = [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `:tada: ${emoji} <${repository.html_url}|${repository.name}>: ${action} *<${alert?.html_url}|${alert?.security_advisory?.summary}>* in \`${alert?.dependency?.package?.name}\``,
            },
          },
        ];
        if (teams.length) {
          const teamsString = teams
            .map((team) => `*<${team.url}|${team.name}>*`)
            .join(", ");
          blocks.push({
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `Teams (admin): ${teamsString}`,
              },
            ],
          });
        }
        await slack.sendMessage({
          blocks,
          text,
        });
      }
    },
  };

  return async (eventType, data) => {
    const handler = handlers[eventType];
    if (typeof handler === "function") {
      await handler(data);
    } else {
      console.log(`Unexpected event type: ${eventType}`);
    }
  };
})();

(async () => {
  app.listen(config.PORT, async () => {
    console.log(`Started webhook receiver on port ${config.PORT}`);
  });

  try {
    await github.auth();
    console.log("Authenticated with Github API");
  } catch (e) {
    console.log("Error authenticating with Github", e);
  }
})();
