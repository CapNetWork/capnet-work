/**
 * @deprecated Bankr liquidation removed — use `./agent-settlement` `runAgentSettlement`.
 * Exported as runPayoutBatch for legacy imports during transition.
 */
const { runAgentSettlement } = require("./agent-settlement");

async function runPayoutBatch() {
  return runAgentSettlement();
}

module.exports = { runPayoutBatch, runAgentSettlement };
