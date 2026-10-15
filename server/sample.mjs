export function createSample(store, uid) {
  let p = store.create(uid, {
    title: "Fieldnotes",
    description:
      "A synthetic research project: an offline notebook for field observations.",
    sample: true,
  });
  const act = (input) => {
    p = store.action(uid, p.id, {
      revision: p.revision,
      origin: "ai-assisted",
      ...input,
    });
  };
  act({
    action: "idea.record",
    title: "A notebook that works off the grid",
    origin: "ai-assisted",
    content:
      "SYNTHETIC SAMPLE\n\nResearchers working in the field need to capture observations before they have a stable connection. Fieldnotes is a small offline notebook that preserves each observation, records edits, and exports a reproducible research bundle.\n\nThe first experiment: compare capture time and missing observations with a paper notebook. No real study has been conducted.\n\nThis sample was prepared with AI to demonstrate the workspace; it is not a claim of an original invention.",
  });
  act({
    action: "business.profile.save",
    name: "Fieldnotes",
    stage: "discovery",
    summary:
      "A synthetic example of an offline-first field notebook. No commercial validation has occurred.",
    targetCustomers:
      "Researchers who collect observations where connectivity is unreliable.",
    knownFacts:
      "The sample application can preserve local notes and revisions in this demonstration.",
    assumptions:
      "Researchers may value faster capture and fewer missing observations. This has not been tested.",
    constraints:
      "Synthetic data only; no participant identities, real interviews or market claims.",
  });
  act({
    action: "business.record.save",
    type: "experiment",
    title: "Offline capture comparison",
    classification: "planned-action",
    status: "planned",
    statement:
      "Compare note-capture time and missing observations between the prototype and a paper notebook.",
    evidence: "No result exists; this is a proposed synthetic experiment.",
    outcome: "",
    measure: "Median capture time and missing observations over ten trials.",
    owner: "Sample researcher",
    dueDate: "",
  });
  act({
    action: "business.scenario.save",
    title: "Illustrative subscription case",
    classification: "unverified-assumption",
    currency: "USD",
    pricePerUnit: "20.00",
    unitsPerMonth: "50",
    variableCostPerUnit: "3.00",
    fixedMonthlyCost: "600.00",
    notes:
      "Synthetic assumptions for demonstrating deterministic arithmetic; not a forecast or market estimate.",
  });
  act({
    action: "artifact.save",
    name: "research-plan.md",
    content:
      "# Fieldnotes research plan\n\nStatus: synthetic example, not an executed study.\n\n## Question\nCan offline capture reduce missing field observations?\n\n## Prototype\n- Capture a note with a timestamp.\n- Keep revisions in a local journal.\n- Export observations as structured data.\n\n## Evaluation\nMeasure time to capture, missing entries, and researcher confidence. Keep raw observations separate from interpretation.",
  });
  act({
    action: "artifact.save",
    name: "observation.ts",
    content:
      "export interface Observation {\n  id: string;\n  recordedAt: string;\n  content: string;\n  revision: number;\n}\n\nexport function revise(entry: Observation, content: string): Observation {\n  return { ...entry, content, revision: entry.revision + 1 };\n}\n",
  });
  act({
    action: "reference.add",
    title: "Web storage documentation",
    url: "https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API",
    notes:
      "Potential browser persistence layer. Saved as a reference only; page content has not been retrieved.",
  });
  act({
    action: "note.add",
    threadId: p.threads[0].id,
    content:
      "First milestone: record observations locally, preserve revisions, and export a research bundle. Keep participant identities out of the prototype.",
  });
  return p;
}
