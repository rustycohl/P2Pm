import { cloneCanonical, digestObject } from "./core.mjs";
import { signCanonical, verifyCanonical } from "./oracle.mjs";

export const GENESIS = "GENESIS";

export async function appendEvent(ledger, identity, type, payload = {}) {
  if (!Array.isArray(ledger)) {
    throw new TypeError("Ledger must be an array.");
  }
  if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(type)) {
    throw new TypeError("Event type must be an uppercase protocol identifier.");
  }

  const sequence = ledger.length;
  const record = {
    schema: "gzg.event/0.1",
    sequence,
    logical_tick: sequence,
    previous: sequence === 0 ? GENESIS : ledger[sequence - 1].id,
    type,
    actor: {
      oracle_id: identity.oracle_id,
      public_key: identity.public_key,
      status: identity.status,
    },
    payload: cloneCanonical(payload),
  };
  const id = await digestObject(record);
  const signature = await signCanonical(identity, record);

  return [
    ...ledger,
    {
      id,
      algorithm: "Ed25519",
      signature,
      record,
    },
  ];
}
export async function verifyLedger(ledger) {
  const errors = [];
  if (!Array.isArray(ledger)) {
    return { valid: false, count: 0, head: null, errors: ["Ledger is not an array."] };
  }

  let previous = GENESIS;
  for (let index = 0; index < ledger.length; index += 1) {
    const entry = ledger[index];
    if (entry?.record?.sequence !== index) {
      errors.push(`Event ${index}: sequence mismatch.`);
    }
    if (entry?.record?.logical_tick !== index) {
      errors.push(`Event ${index}: logical tick mismatch.`);
    }
    if (entry?.record?.previous !== previous) {
      errors.push(`Event ${index}: previous hash mismatch.`);
    }

    let expectedId = null;
    try {
      expectedId = await digestObject(entry.record);
    } catch {
      errors.push(`Event ${index}: record is not canonical.`);
    }
    if (expectedId !== entry?.id) {
      errors.push(`Event ${index}: identifier mismatch.`);
    }

    const signatureValid = await verifyCanonical(
      entry?.record,
      entry?.signature,
      entry?.record?.actor?.public_key,
    );
    if (!signatureValid) {
      errors.push(`Event ${index}: signature invalid.`);
    }
    previous = entry?.id ?? "";
  }

  return {
    valid: errors.length === 0,
    count: ledger.length,
    head: ledger.at(-1)?.id ?? null,
    errors,
  };
}

export function deriveArtifactOwnership(ledger, artifactId) {
  let state = {
    artifact_id: artifactId,
    owner: null,
    status: "unseen",
    last_event: null,
  };

  for (const entry of ledger) {
    const { type, payload } = entry.record;
    if (payload?.artifact_id !== artifactId) {
      continue;
    }

    if (type === "P2PM_ARTIFACT_MINTED" && state.status === "unseen") {
      state = {
        artifact_id: artifactId,
        owner: payload.owner,
        status: "active",
        last_event: entry.id,
      };
    } else if (
      type === "P2PM_ARTIFACT_TRANSFERRED"
      && state.status === "active"
      && payload.from === state.owner
    ) {
      state = {
        artifact_id: artifactId,
        owner: payload.to,
        status: "active",
        last_event: entry.id,
      };
    } else if (
      type === "P2PM_ARTIFACT_DEFUNCT"
      && state.status === "active"
      && payload.owner === state.owner
    ) {
      state = {
        artifact_id: artifactId,
        owner: null,
        status: "defunct",
        last_event: entry.id,
      };
    }
  }

  return state;
}
