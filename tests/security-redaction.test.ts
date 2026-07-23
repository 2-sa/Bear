// @ts-nocheck -- Node test types are intentionally outside the app tsconfig.
import assert from "node:assert/strict";
import test from "node:test";
import { redactDiagnosticText } from "../src/lib/security-redaction.ts";

test("redacts common credentials and local user paths from diagnostics", () => {
  const input =
    'authorization=Bearer-secret access_token":"abc123" https://x.test/?api_key=key123 C:\\Users\\Alice\\secret.txt /home/alice/private';
  const output = redactDiagnosticText(input, 2000);
  assert.doesNotMatch(output, /Bearer-secret|abc123|key123|Alice|alice/);
  assert.match(output, /\[redacted\]/);
  assert.match(output, /\[local-path\]/);
});
