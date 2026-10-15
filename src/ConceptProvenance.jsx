import React from "react";
import { Fingerprint } from "lucide-react";
import evidence from "./concept-evidence.json";

export default function ConceptProvenance({ featured = false }) {
  // Public-safe metadata only. Exact private package/proof linkage checked offline.
  if (featured)
    return (
      <section
        id="our-evidence"
        className="concept-provenance provenance-featured"
        aria-label="Completed timestamp evidence"
      >
        <div className="site-container provenance-layout">
          <div className="provenance-intro" data-scroll-reveal>
            <span className="site-kicker">02 / A TRACEABLE BEGINNING</span>
            <h2>
              Our idea. <br />
              <em>Our first example.</em>
            </h2>
            <p>
              Before becoming WHOAYO, we used the name Origin Studio to preserve
              this exact concept: a workspace where you record an idea, develop
              it with AI, and keep evidence of how the work evolves.
            </p>
            <p>
              This is that concept's timestamp, not a demonstration record. The
              preserved version is linked to a completed Bitcoin proof. We are
              using the same approach we are building for you.
            </p>
            <ol className="origin-story-steps">
              <li>
                <strong>Record the concept.</strong> Preserve the description
                without rewriting it.
              </li>
              <li>
                <strong>Timestamp its fingerprint.</strong> Keep the concept
                private and retain the proof.
              </li>
              <li>
                <strong>Keep building.</strong> Record later revisions and AI
                contributions separately.
              </li>
            </ol>
          </div>
          <div className="provenance-record completed-proof">
            <div className="completed-proof-label">
              <Fingerprint size={25} aria-hidden="true" />
              <span>
                WHOAYO origin record <span aria-hidden="true">&middot;</span>{" "}
                preserved as Origin Studio
              </span>
            </div>
            <time dateTime={evidence.attestedAt} data-scroll-reveal>
              <span>October 5, 2026</span>
              <strong>04:52:27 UTC</strong>
            </time>
            <p className="proof-time-label">
              This preserved concept existed by this time.
            </p>
            <p className="story-evidence-limit">
              Evidence that the exact fingerprint existed by this time. Not
              proof of ownership, originality or who first had the idea.
            </p>
            <details>
              <summary>View the evidence and its limits</summary>
              <dl>
                <div>
                  <dt>Attestations</dt>
                  <dd>Two, from Alice and Bob calendars</dd>
                </div>
                <div>
                  <dt>Cross-check</dt>
                  <dd>Public transaction, block, Merkle root and time data</dd>
                </div>
                <div>
                  <dt>Local Bitcoin node</dt>
                  <dd>Not used</dd>
                </div>
                <div>
                  <dt>Original receipt</dt>
                  <dd>
                    Preserved unchanged; completed proof stored separately
                  </dd>
                </div>
                <div>
                  <dt>Covered concept</dt>
                  <dd>
                    {evidence.title}: {evidence.coveredVersion}
                  </dd>
                </div>
                <div>
                  <dt>Fingerprint linkage</dt>
                  <dd>
                    Private package, original payload and completed proof
                    matched on {evidence.mappingCheckedOn}
                  </dd>
                </div>
                <div>
                  <dt>Fingerprint payload SHA-256</dt>
                  <dd className="proof-digest">{evidence.payloadSha256}</dd>
                </div>
                <div>
                  <dt>Bitcoin block heights</dt>
                  <dd>{evidence.blockHeights.join(" and ")}</dd>
                </div>
                <div>
                  <dt>Public explorer cross-check</dt>
                  <dd>October 7, 2026. Not local-node verification.</dd>
                </div>
              </dl>
              <p>
                The preserved package explicitly names Origin Studio and
                describes the concept now carried forward as WHOAYO. The
                timestamp covers that version, not the later name, every later
                feature or the entire codebase. It does not establish when the
                idea was first conceived or that it was recorded before all AI
                conversations or development.
              </p>
              <p>
                No concept text, nonce, private package or account identifier is
                published here. This summary does not perform a new verification
                or enable the separate timestamp-before-AI service.
              </p>
            </details>
          </div>
        </div>
      </section>
    );
  return (
    <section
      className="concept-provenance"
      aria-label="WHOAYO concept provenance"
    >
      <div>
        <div className="provenance-record">
          <div className="concept-provenance-heading">
            <Fingerprint size={23} aria-hidden="true" />
            <div>
              <h2>WHOAYO origin concept</h2>
              <span>Timestamp reference</span>
            </div>
            <span className="concept-provenance-status">
              Concept linked to proof
            </span>
          </div>
          <details>
            <summary>View timestamp status</summary>
            <dl>
              <div>
                <dt>Existed by</dt>
                <dd>October 5, 2026 at 04:52:27 UTC</dd>
              </div>
              <div>
                <dt>Method</dt>
                <dd>Public explorer cross-check; no local Bitcoin node</dd>
              </div>
              <div>
                <dt>Covered version</dt>
                <dd>{evidence.coveredVersion}</dd>
              </div>
            </dl>
            <p>
              Before the WHOAYO name, we used Origin Studio to preserve this
              concept. The exact preserved package matches the completed proof.
              This is evidence of existence, not ownership, originality or a
              timestamp for later work.
            </p>
            <p>
              This reference is for WHOAYO's own origin record. Your private
              idea records are separate and are not published here.
            </p>
          </details>
        </div>
      </div>
    </section>
  );
}
