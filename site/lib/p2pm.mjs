import { digestObject } from "./core.mjs";

export async function buildArtifactCandidate({ identity, ledger, markResult }) {
  if (identity?.status !== "claimed") {
    throw new Error("Ghost sessions cannot mint. Claim the local session first.");
  }
  if (!Array.isArray(ledger) || ledger.length === 0 || !markResult) {
    throw new TypeError("A signed ledger and MARK result are required.");
  }

  return {
    schema: "gzg.p2pm.artifact-candidate/0.1",
    kind: "mark-replay",
    owner: identity.oracle_id,
    owner_public_key: identity.public_key,
    rules: {
      d10: "scaled-d10/0.1",
      action_economy: "base-10/0.1",
    },
    content: markResult,
    evidence: {
      ledger_head: ledger.at(-1).id,
      ledger_digest: await digestObject(ledger),
      event_count: ledger.length,
    },
    chain_anchor: {
      network: "JOKE",
      status: "not-implemented",
      transaction: null,
    },
  };
}
export async function mineArtifact(
  candidate,
  {
    difficulty = 3,
    maxAttempts = 2_000_000,
    yieldEvery = 256,
    onProgress = null,
  } = {},
) {
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 6) {
    throw new RangeError("Alpha proof difficulty must be an integer from 1 through 6.");
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError("maxAttempts must be a positive integer.");
  }

  const target = "0".repeat(difficulty);
  for (let nonce = 0; nonce < maxAttempts; nonce += 1) {
    const work = { candidate, nonce };
    const hash = await digestObject(work);
    if (hash.startsWith(target)) {
      return {
        schema: "gzg.p2pm.artifact/0.1",
        artifact_id: `p2pm:${hash}`,
        candidate,
        proof: {
          algorithm: "SHA-256",
          difficulty_hex_zeros: difficulty,
          nonce,
          hash,
          attempts: nonce + 1,
        },
      };
    }

    if (nonce > 0 && nonce % yieldEvery === 0) {
      onProgress?.(nonce);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  throw new Error(`No proof found within ${maxAttempts} attempts.`);
}

export async function verifyArtifact(artifact) {
  const errors = [];
  const difficulty = artifact?.proof?.difficulty_hex_zeros;
  const nonce = artifact?.proof?.nonce;
  const claimedHash = artifact?.proof?.hash;

  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 64) {
    errors.push("Invalid proof difficulty.");
  }
  if (!Number.isInteger(nonce) || nonce < 0) {
    errors.push("Invalid proof nonce.");
  }

  let expectedHash = null;
  try {
    expectedHash = await digestObject({ candidate: artifact.candidate, nonce });
  } catch {
    errors.push("Artifact candidate is not canonical.");
  }

  if (expectedHash !== claimedHash) {
    errors.push("Proof hash does not match the artifact.");
  }
  if (expectedHash && !expectedHash.startsWith("0".repeat(difficulty ?? 0))) {
    errors.push("Proof hash does not satisfy its difficulty.");
  }
  if (artifact?.artifact_id !== `p2pm:${expectedHash}`) {
    errors.push("Artifact identifier does not match the proof.");
  }
  if (artifact?.candidate?.chain_anchor?.status !== "not-implemented") {
    errors.push("Alpha artifact must not claim live chain settlement.");
  }

  return {
    valid: errors.length === 0,
    hash: expectedHash,
    errors,
  };
}
