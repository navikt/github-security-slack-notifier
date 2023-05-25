const { verifySignature } = require("./github");

describe("GitHub", () => {
  test("Signature verification", () => {
    const payload = '{"a": 5}';
    const secret = "hei";
    const signature =
      "sha256=873bd357c9d8de2fb10c9481af74b20bbe9193d78a58ccf45558ac53dea7b3ff";
    expect(verifySignature(payload, signature, secret)).toBeTruthy();
  });
});
