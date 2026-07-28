import {
  base64ToBytes,
  bytesToBase64,
  canonicalBytes,
  sha256Hex,
} from "./core.mjs";

const ALGORITHM = Object.freeze({ name: "Ed25519" });

function validateHandle(handle) {
  const normalized = String(handle ?? "").trim();
  if (normalized.length < 2 || normalized.length > 32) {
    throw new RangeError("A local handle must contain 2–32 characters.");
  }
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._'-]*$/u.test(normalized)) {
    throw new TypeError("The handle contains unsupported characters.");
  }
  return normalized;
}
export async function createOracleIdentity({ status = "ghost" } = {}) {
  if (status !== "ghost") {
    throw new TypeError("New local ORACLE sessions must begin as Ghosts.");
  }
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto is unavailable in this browser.");
  }

  let keyPair;
  try {
    keyPair = await globalThis.crypto.subtle.generateKey(
      ALGORITHM,
      true,
      ["sign", "verify"],
    );
  } catch (error) {
    throw new Error("This browser does not support the Ed25519 alpha session.", {
      cause: error,
    });
  }

  const publicKeyBytes = new Uint8Array(
    await globalThis.crypto.subtle.exportKey("raw", keyPair.publicKey),
  );
  const fingerprint = await sha256Hex(publicKeyBytes);

  return {
    schema: "gzg.oracle.local-session/0.1",
    oracle_id: `oracle:${fingerprint.slice(0, 32)}`,
    fingerprint,
    algorithm: "Ed25519",
    public_key: bytesToBase64(publicKeyBytes),
    status: "ghost",
    handle: null,
    claim: null,
    key_pair: keyPair,
  };
}

export async function signCanonical(identity, record) {
  if (!identity?.key_pair?.privateKey) {
    throw new TypeError("A live local identity is required to sign.");
  }
  const signature = await globalThis.crypto.subtle.sign(
    ALGORITHM,
    identity.key_pair.privateKey,
    canonicalBytes(record),
  );
  return bytesToBase64(new Uint8Array(signature));
}

export async function verifyCanonical(record, signature, publicKey) {
  try {
    const imported = await globalThis.crypto.subtle.importKey(
      "raw",
      base64ToBytes(publicKey),
      ALGORITHM,
      false,
      ["verify"],
    );
    return globalThis.crypto.subtle.verify(
      ALGORITHM,
      imported,
      base64ToBytes(signature),
      canonicalBytes(record),
    );
  } catch {
    return false;
  }
}

export async function claimOracleIdentity(identity, requestedHandle) {
  if (!identity?.key_pair) {
    throw new TypeError("A live Ghost session is required.");
  }
  if (identity.status !== "ghost") {
    throw new Error("This local session is already claimed.");
  }

  const handle = validateHandle(requestedHandle);
  const claimRecord = {
    schema: "gzg.oracle.local-claim/0.1",
    oracle_id: identity.oracle_id,
    public_key: identity.public_key,
    handle,
    claim_kind: "local-development-session",
    chain_status: "unanchored",
  };
  const signature = await signCanonical(identity, claimRecord);

  return {
    ...identity,
    status: "claimed",
    handle,
    claim: {
      record: claimRecord,
      signature,
      algorithm: "Ed25519",
    },
  };
}

export function publicIdentity(identity) {
  if (!identity) {
    return null;
  }
  return {
    schema: identity.schema,
    oracle_id: identity.oracle_id,
    fingerprint: identity.fingerprint,
    algorithm: identity.algorithm,
    public_key: identity.public_key,
    status: identity.status,
    handle: identity.handle,
    claim: identity.claim,
  };
}

export async function verifyIdentityClaim(identity) {
  if (identity?.status !== "claimed" || !identity.claim) {
    return false;
  }
  return verifyCanonical(
    identity.claim.record,
    identity.claim.signature,
    identity.public_key,
  );
}
