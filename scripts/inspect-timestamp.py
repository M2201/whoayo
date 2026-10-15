"""Read-only OTS parsing; never contacts calendars or verifies Bitcoin consensus."""
import hashlib
import io
import json
import sys

from opentimestamps.core.op import OpSHA256
from opentimestamps.core.serialize import StreamDeserializationContext
from opentimestamps.core.timestamp import DetachedTimestampFile
from opentimestamps.core.notary import PendingAttestation, BitcoinBlockHeaderAttestation


def inspect_proof(raw):
    if not raw or len(raw) > 1024 * 1024:
        raise ValueError("Invalid proof size")
    proof = DetachedTimestampFile.deserialize(StreamDeserializationContext(io.BytesIO(raw)))
    if not isinstance(proof.file_hash_op, OpSHA256):
        raise ValueError("Expected a SHA-256 timestamp")
    attestations = [a for _, a in proof.timestamp.all_attestations()]
    return {
        "payloadSha256": proof.file_digest.hex(),
        "proofSha256": hashlib.sha256(raw).hexdigest(),
        "pendingCalendars": sorted({a.uri for a in attestations if isinstance(a, PendingAttestation)}),
        "bitcoinHeights": sorted({a.height for a in attestations if isinstance(a, BitcoinBlockHeaderAttestation)}),
        "bitcoinVerified": False,
    }


if __name__ == "__main__":
    try:
        with open(sys.argv[1], "rb") as source:
            raw = source.read(1024 * 1024 + 1)
        print(json.dumps(inspect_proof(raw)))
    except Exception:
        print("Timestamp proof could not be parsed. No network request was made.", file=sys.stderr)
        sys.exit(1)
