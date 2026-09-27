import { generateWalkthrough } from "../src/claude.mjs";
import { buildSystemPrompt, buildUserPrompt, WALKTHROUGH_TOOL } from "../src/prompt.mjs";
import { formatComment } from "../src/format.mjs";

const mockDiff = `--- a/src/payments/webhook.js
+++ b/src/payments/webhook.js
@@ -39,6 +39,10 @@ async function handleWebhook(event) {
   const orderId = event.data.order_id;
+  if (await isAlreadyProcessed(orderId)) {
+    return;
+  }
   const charge = event.data.charge;
-  await processPayment(orderId, charge);
+  await processPayment(orderId, charge.amount);
+  await markProcessed(orderId);
 }
`;

const walkthrough = await generateWalkthrough({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseUrl: process.env.ANTHROPIC_BASE_URL,
  model: process.env.TEST_MODEL || "claude-sonnet-5",
  system: buildSystemPrompt(),
  userPrompt: buildUserPrompt({
    prTitle: "Add idempotency check to payment webhook",
    prBody: "Prevents double-charging on retried webhook deliveries.",
    diffText: mockDiff,
    truncated: false,
    omittedFiles: [],
  }),
  tool: WALKTHROUGH_TOOL,
});

console.log(formatComment({ walkthrough, model: process.env.TEST_MODEL || "claude-sonnet-5", truncated: false, omittedFiles: [] }));
