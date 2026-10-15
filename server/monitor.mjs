import { secretFindings } from "./gateway.mjs";

export class Monitor {
  constructor(store) {
    this.store = store;
    this.latest = new Map();
    this.timer = null;
  }
  scan(uid) {
    const findings = [];
    let verified = 0,
      records = 0;
    for (const p of this.store.list(uid)) {
      try {
        const proof = this.store.verify(uid, p.id);
        verified++;
        records += proof.records;
        const state = this.store.project(uid, p.id);
        const texts = [
          ...state.ideas.map((i) => i.content),
          ...state.artifacts.map((a) => a.versions.at(-1).content),
        ];
        if (texts.some((t) => secretFindings(t).length))
          findings.push({
            projectId: p.id,
            severity: "warning",
            kind: "credential-pattern",
            message:
              "A possible credential exists in this project. Review locally before sharing context.",
          });
        if (
          state.disclosures.some((d) =>
            ["attempted", "outcome-unknown"].includes(d.status),
          )
        )
          findings.push({
            projectId: p.id,
            severity: "warning",
            kind: "incomplete-disclosure",
            message:
              "A provider request has an unresolved outcome. Review its disclosure record before retrying.",
          });
      } catch {
        findings.push({
          projectId: p.id,
          severity: "critical",
          kind: "integrity",
          message:
            "Project evidence failed verification. External AI requests are blocked for this project.",
        });
      }
    }
    const report = {
      checkedAt: new Date().toISOString(),
      projects: verified,
      records,
      findings,
      engine: "rule-based",
      intervalSeconds: 60,
    };
    this.latest.set(uid, report);
    return report;
  }
  start() {
    this.timer = setInterval(() => {
      for (const { id } of this.store.db
        .prepare("SELECT id FROM users")
        .all()) {
        try {
          this.scan(id);
        } catch {
          this.latest.set(id, {
            checkedAt: new Date().toISOString(),
            engine: "rule-based",
            findings: [
              {
                severity: "critical",
                kind: "scan-failed",
                message: "The security review could not complete.",
              },
            ],
          });
        }
      }
    }, 60000);
    this.timer.unref();
  }
  stop() {
    clearInterval(this.timer);
  }
}
