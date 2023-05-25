const crypto = require("crypto");

function verifySignature(body, signature, secret) {
  if (!secret || !signature) {
    return false;
  }
  const hash =
    "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
  return hash === signature;
}

module.exports = {
  verifySignature,
};
