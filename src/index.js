const express = require("express");
const crypto = require("crypto");

const config = {
  GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET,
};

const app = express();
app.disable("x-powered-by");
app.use(
  express.raw({
    type: "*/*",
    limit: "5mb",
  })
);

app.get("/internal/healthy", (req, res) => {
  res.status(200).end("OK");
});

app.post("/webhook", (req, res) => {
  const bufferBody = req.body;
  const signature = req.headers["x-hub-signature-256"];

  if (!Buffer.isBuffer(bufferBody)) {
    console.log("Received bad payload type (expected buffer)");
    return res.status(400).end("Bad request");
  }

  const body = bufferBody.toString();

  if (!verifySignature(body, signature)) {
    console.log("Received bad signature for payload");
    res.status(403).end("Invalid signature");
    return;
  }

  console.log("Received payload", body);
  res.status(200).end(JSON.stringify({ success: true }));
});

function verifySignature(body, signature) {
  const secret = config.GITHUB_WEBHOOK_SECRET;
  if (!secret || !signature) {
    return false;
  }
  const hash =
    "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
  return hash === signature;
}
