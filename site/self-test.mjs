import { appendEvent, deriveArtifactOwnership } from "./lib/ledger.mjs";
import { claimOracleIdentity, createOracleIdentity } from "./lib/oracle.mjs";
import {
  buildArtifactCandidate,
  mineArtifact,
  verifyArtifact,
} from "./lib/p2pm.mjs";

export async function runSelfTest() {
  const identity = await claimOracleIdentity(
    await createOracleIdentity(),
    "P2Pm Port",
  );
  let ledger = await appendEvent([], identity, "ORACLE_SESSION_CLAIMED", {
    claim: identity.claim,
  });
  const markResult = {
    schema: "gzg.mark.result/0.1",
    port_test: true,
    outcome: "portable",
  };
  const candidate = await buildArtifactCandidate({ identity, ledger, markResult });
  const artifact = await mineArtifact(candidate, { difficulty: 1 });
  const proof = await verifyArtifact(artifact);
  ledger = await appendEvent(ledger, identity, "P2PM_ARTIFACT_MINTED", {
    artifact_id: artifact.artifact_id,
    owner: identity.oracle_id,
    proof: artifact.proof,
    chain_status: "unanchored",
  });
  const ownership = deriveArtifactOwnership(ledger, artifact.artifact_id);
  return {
    pass: proof.valid
      && ownership.status === "active"
      && ownership.owner === identity.oracle_id,
    summary: "Claimed identity → literal work → derived owner",
    checks: [
      { name: "Proof valid", pass: proof.valid },
      { name: "Owner derived", pass: ownership.owner === identity.oracle_id },
      { name: "No fake chain", pass: candidate.chain_anchor.status === "not-implemented" },
    ],
    evidence: {
      artifact_id: artifact.artifact_id,
      attempts: artifact.proof.attempts,
      owner: ownership.owner,
      chain_status: candidate.chain_anchor.status,
    },
  };
}
