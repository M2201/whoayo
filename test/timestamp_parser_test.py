import io
import hashlib
import importlib.util
import unittest
from pathlib import Path

from opentimestamps.core.op import OpSHA256
from opentimestamps.core.serialize import BytesSerializationContext
from opentimestamps.core.timestamp import DetachedTimestampFile
from opentimestamps.core.notary import PendingAttestation, BitcoinBlockHeaderAttestation

spec = importlib.util.spec_from_file_location("inspector", Path(__file__).resolve().parents[1] / "scripts/inspect-timestamp.py")
inspector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inspector)


class TimestampParserTest(unittest.TestCase):
    def fixture(self, attestation):
        proof = DetachedTimestampFile.from_fd(OpSHA256(), io.BytesIO(b"synthetic fingerprint only"))
        proof.timestamp.attestations.add(attestation)
        ctx = BytesSerializationContext()
        proof.serialize(ctx)
        return ctx.getbytes()

    def test_pending_receipt_keeps_correct_digest_and_never_claims_bitcoin_verification(self):
        raw = self.fixture(PendingAttestation("https://alice.btc.calendar.opentimestamps.org"))
        result = inspector.inspect_proof(raw)
        self.assertEqual(result["payloadSha256"], hashlib.sha256(b"synthetic fingerprint only").hexdigest())
        self.assertEqual(result["proofSha256"], hashlib.sha256(raw).hexdigest())
        self.assertEqual(result["pendingCalendars"], ["https://alice.btc.calendar.opentimestamps.org"])
        self.assertEqual(result["bitcoinHeights"], [])
        self.assertFalse(result["bitcoinVerified"])

    def test_block_attestation_without_chain_verification_is_not_verified(self):
        result = inspector.inspect_proof(self.fixture(BitcoinBlockHeaderAttestation(100)))
        self.assertEqual(result["bitcoinHeights"], [100])
        self.assertFalse(result["bitcoinVerified"])

    def test_invalid_truncated_oversized_and_trailing_proofs_fail(self):
        valid = self.fixture(PendingAttestation("https://alice.btc.calendar.opentimestamps.org"))
        for bad in [b"", b"not an OTS file", valid[:-1], valid + b"extra", b"x" * (1024 * 1024 + 1)]:
            with self.subTest(size=len(bad)), self.assertRaises(Exception):
                inspector.inspect_proof(bad)


if __name__ == "__main__":
    unittest.main()
