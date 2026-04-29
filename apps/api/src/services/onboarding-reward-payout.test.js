const test = require("node:test");
const assert = require("node:assert/strict");

const { __private } = require("./onboarding-reward-payout");

test("solToLamportsDecimalString converts SOL decimals correctly", () => {
  assert.equal(__private.solToLamportsDecimalString("0.01"), "10000000");
  assert.equal(__private.solToLamportsDecimalString("1"), "1000000000");
  assert.equal(__private.solToLamportsDecimalString("1.000000001"), "1000000001");
});

test("solToLamportsDecimalString rejects invalid amounts", () => {
  assert.throws(() => __private.solToLamportsDecimalString("-1"), /non-negative decimal string/);
  assert.throws(() => __private.solToLamportsDecimalString("abc"), /non-negative decimal string/);
});

test("buildPaymentRequirement produces x402-compatible metadata envelope", () => {
  const req = __private.buildPaymentRequirement({
    amountAtomic: "1000",
    recipientWallet: "recipientWalletAddress",
  });
  assert.equal(req.scheme, "reward_payout");
  assert.equal(req.amount, "1000");
  assert.equal(req.pay_to, "recipientWalletAddress");
  assert.equal(req.version, "x402-compatible-v1");
});

