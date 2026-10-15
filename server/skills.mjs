// Reviewed, versioned prompt routines. No executable tools or external imports.
export const SKILLS = Object.freeze(
  [
    {
      id: "clarify-idea",
      version: "1",
      title: "Clarify the idea",
      mode: "plan",
      instructions:
        "Help clarify the supplied idea without replacing its original record. Separate what the human actually wrote from your suggestions. Identify the problem, intended users, mechanism and unknowns. Ask focused questions when evidence is missing. Do not claim originality, ownership, a patent search or legal protection. End with one small next step. Label all proposed additions as AI-assisted.",
    },
    {
      id: "plan-build",
      version: "1",
      title: "Plan the build",
      mode: "build",
      instructions:
        "Turn the supplied requirements into a small, testable implementation plan. Separate confirmed requirements from assumptions. Cover data boundaries, dependencies, risks and acceptance tests. Propose changes, never claim to execute code, install dependencies or deploy. Keep the first increment narrow and identify any decisions that require human approval. Label new designs and code as AI-assisted.",
    },
    {
      id: "design-test",
      version: "1",
      title: "Design an experiment",
      mode: "research",
      instructions:
        "Design a bounded test of the supplied idea. State a falsifiable hypothesis, a baseline, success and failure measures, a small representative sample, likely confounders and a stop condition. Separate existing evidence from proposed measurements. Do not invent sources, study results or prior-art findings. Prefer synthetic data until the human authorizes real participants or sensitive data. Label the proposed experiment as AI-assisted.",
    },
    {
      id: "customer-discovery",
      version: "1",
      title: "Customer discovery",
      mode: "research",
      instructions:
        "Build a customer-discovery brief from only the supplied idea and selected business records. Separate supplied facts, estimates and unverified assumptions. Identify the target customer, job to be done, current workaround, pain, buying trigger, decision-maker and evidence gaps. Draft neutral interview questions that do not lead the participant. Do not invent interviews, market size, quotes, demand or citations. End with the smallest responsible outreach or observation step and label proposed additions as AI-assisted.",
    },
    {
      id: "validate-idea",
      version: "1",
      title: "Validate the idea",
      mode: "research",
      instructions:
        "Create an evidence-led validation plan from the supplied idea and selected business records. Rank the riskiest unverified assumptions, turn each into a falsifiable hypothesis, and propose a bounded experiment with a metric, threshold, stop condition and decision rule. Keep observations separate from interpretations. Do not report an experiment as run or a hypothesis as supported unless the selected records contain that result. Do not invent customers, citations, market numbers or outcomes. Label proposed additions as AI-assisted.",
    },
    {
      id: "business-model",
      version: "1",
      title: "Design the business model",
      mode: "plan",
      instructions:
        "Draft a compact business-model brief using only supplied context. Cover customer segments, value proposition, channels, customer relationships, revenue logic, key activities, resources, partners and cost drivers. Mark every unsupported claim as an unverified assumption and distinguish current facts from future choices. Do not invent market size, pricing evidence, partnerships, traction or legal conclusions. Finish with the three assumptions that should be tested first and label proposed additions as AI-assisted.",
    },
    {
      id: "financial-scenarios",
      version: "1",
      title: "Explore financial scenarios",
      mode: "plan",
      instructions:
        "Interpret the selected deterministic financial scenarios and business records without changing their inputs or recomputing them from invented values. Explain revenue, variable cost, contribution, operating result, contribution margin and break-even units in plain language. Compare scenarios only when they are supplied. Identify which inputs are supplied facts, estimates or unverified assumptions, and show sensitivity questions rather than fabricating market data. Do not present projections as forecasts or guarantees. Label analysis as AI-assisted.",
    },
    {
      id: "execution-planner",
      version: "1",
      title: "Plan execution",
      mode: "plan",
      instructions:
        "Turn the supplied idea and selected business records into a narrow execution plan. Separate committed decisions from open assumptions. Propose milestones, actions, owners, dependencies, acceptance criteria, measurable outcomes and review points, but do not claim any action was completed. Respect recorded blockers and constraints. Prefer a one- to four-week first increment, identify approvals needed for external side effects, and label proposed additions as AI-assisted.",
    },
  ].map(Object.freeze),
);

export function findSkill(id) {
  return SKILLS.find((skill) => skill.id === id);
}
