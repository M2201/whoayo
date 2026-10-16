import React, { useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowDown,
  Fingerprint,
  FlaskConical,
  Blocks,
  Code2,
  FileText,
  Clock3,
  Sparkles,
  Plus,
  ArrowRight,
  LockKeyhole,
} from "lucide-react";
import ConceptProvenance from "./ConceptProvenance.jsx";
import ScrollText from "./ScrollText.jsx";
import "./public-site.css";
import "./signal-story.css";

const examples = [
  {
    label: "Researchers",
    icon: FlaskConical,
    title: "An experiment worth pursuing.",
    description:
      "Keep your hypothesis, sources and revisions together as you turn a question into a testable plan.",
    record: "A lower-water greenhouse trial",
    idea: "Compare scheduled watering with a soil-moisture trigger across two small greenhouse beds. Record water use and plant growth over four weeks.",
    skill: "Design an experiment",
    next: "Define the control group, measurements and conditions that would challenge this hypothesis.",
  },
  {
    label: "No-code builders",
    icon: Blocks,
    title: "A useful tool starts with your idea.",
    description:
      "Describe the problem in your own words. Preserve the starting point, then break the solution into manageable steps.",
    record: "A volunteer shift planner",
    idea: "Let volunteers share availability and flag unfilled shifts. Give the coordinator a simple weekly view without making everyone maintain another spreadsheet.",
    skill: "Clarify the idea",
    next: "Identify the users, essential screens and smallest useful version of the planner.",
  },
  {
    label: "Low-code developers",
    icon: Code2,
    title: "Build forward. Keep the origin.",
    description:
      "Connect your original intent to technical decisions, source files and clearly attributed AI contributions.",
    record: "A duplicate-invoice checker",
    idea: "Flag possible duplicate invoices using supplier, amount and invoice date. Keep the final decision with the reviewer and record why each match was suggested.",
    skill: "Plan the build",
    next: "Outline the data model, matching rules, review flow and false-positive tests.",
  },
];
const stages = [
  { title: "Record", icon: FileText },
  { title: "Timestamp", icon: Clock3 },
  { title: "Develop", icon: Sparkles },
];
const cosmicTwinkles = [
  { x: "54%", y: "13%", size: "2px", duration: "9.4s", delay: "-2.1s" },
  { x: "66%", y: "8%", size: "3px", duration: "12.2s", delay: "-7.3s" },
  { x: "78%", y: "17%", size: "2px", duration: "10.7s", delay: "-4.8s" },
  { x: "91%", y: "24%", size: "3px", duration: "13.1s", delay: "-8.6s" },
  { x: "70%", y: "31%", size: "2px", duration: "11.8s", delay: "-1.4s" },
  { x: "61%", y: "43%", size: "2px", duration: "9.9s", delay: "-6.2s" },
  { x: "82%", y: "46%", size: "3px", duration: "12.8s", delay: "-3.5s" },
  { x: "92%", y: "56%", size: "2px", duration: "10.2s", delay: "-7.9s" },
  { x: "75%", y: "63%", size: "2px", duration: "13.6s", delay: "-5.1s" },
  { x: "58%", y: "72%", size: "3px", duration: "11.1s", delay: "-9.7s" },
  { x: "84%", y: "77%", size: "2px", duration: "9.7s", delay: "-4.2s" },
  { x: "95%", y: "84%", size: "2px", duration: "12.5s", delay: "-6.8s" },
];

function WorkflowExample() {
  const [audience, setAudience] = useState(0);
  const [stage, setStage] = useState(0);
  const example = examples[audience];
  return (
    <section id="workflow" className="site-workflow">
      <div className="site-container">
        <div className="story-flow-lead">
          <div className="site-section-heading" data-scroll-reveal>
            <div>
              <span className="site-kicker">03 / LET IT TAKE SHAPE</span>
              <h2>
                For people who <br />
                <em>ask, imagine and build.</em>
              </h2>
            </div>
            <p>
              Your idea is the starting point. Not a file lost in a chat, and
              not an AI response mistaken for your original work.
            </p>
          </div>
        </div>
        <div
          className="audience-options"
          role="group"
          aria-label="Choose an example"
        >
          {examples.map(({ label, icon: Icon }, i) => (
            <button
              key={label}
              aria-pressed={audience === i}
              onClick={() => setAudience(i)}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </div>
        <div className="workflow-example">
          <div className="workflow-story" aria-live="polite">
            <span className="example-number">
              0{audience + 1} / BUILT AROUND YOUR PROCESS
            </span>
            <h3>{example.title}</h3>
            <p>{example.description}</p>
            <div className="example-source">
              <LockKeyhole size={16} />
              <span>Illustrative example. Nothing is saved or sent.</span>
            </div>
          </div>
          <div className="example-tool" aria-label="Illustrative workflow">
            <div
              className="example-stages"
              role="group"
              aria-label="Workflow stage"
            >
              {stages.map(({ title, icon: Icon }, i) => (
                <button
                  key={title}
                  aria-pressed={stage === i}
                  onClick={() => setStage(i)}
                >
                  <Icon size={16} />
                  <span>{title}</span>
                </button>
              ))}
            </div>
            <div className="example-body" aria-live="polite">
              <span className="example-label">
                {stage === 0
                  ? "EXACT WORDS / ORIGINAL RECORD"
                  : stage === 1
                    ? "INDEPENDENT EVIDENCE / PLANNED"
                    : "YOUR NEXT STEP / BUILT-IN SKILL"}
              </span>
              <h4>{example.record}</h4>
              {stage === 0 && (
                <>
                  <p className="example-idea">{example.idea}</p>
                  <div className="example-meta">
                    <span>AI-written illustrative example</span>
                    <span>Version 1 / demonstration only</span>
                  </div>
                </>
              )}
              {stage === 1 && (
                <>
                  <p>
                    Preserve the exact version. Create its fingerprint. Verify
                    an independent timestamp against that fingerprint.
                  </p>
                  <dl className="example-proof">
                    <div>
                      <dt>Example status</dt>
                      <dd>Not timestamped</dd>
                    </div>
                    <div>
                      <dt>Live verification</dt>
                      <dd>Not connected</dd>
                    </div>
                  </dl>
                  <p className="example-limit">
                    A timestamp can establish that exact content existed by a
                    verified time. It does not establish originality or
                    ownership.
                  </p>
                </>
              )}
              {stage === 2 && (
                <>
                  <span className="example-skill">
                    <Sparkles size={17} />
                    {example.skill}
                  </span>
                  <p>{example.next}</p>
                  <p className="example-limit">
                    In the workspace, AI uses an enabled model connection. This
                    example makes no model call. External AI requires a verified
                    receipt; the live timestamp service is not enabled yet.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function PublicSite({
  children,
  signedIn,
  onAccount,
  hostedPreview = false,
}) {
  const root = useRef(null);
  return (
    <div className="public-site story-site" ref={root}>
      <a className="site-skip" href="#site-main">
        Skip to content
      </a>
      <header className="site-header">
        <a className="site-logo" href="#site-main" aria-label="WHOAYO home">
          <Fingerprint size={28} />
          <span>WHOAYO</span>
        </a>
        <nav aria-label="Public website">
          <a href="#our-evidence">Our evidence</a>
          <a href="#workflow">The workflow</a>
          <a href="#questions">Questions</a>
        </nav>
        {hostedPreview ? (
          <a className="site-nav-action" href="#account">
            Read-only pilot <ArrowUpRight size={16} />
          </a>
        ) : signedIn ? (
          <a className="site-nav-action" href="/">
            Workspace <ArrowUpRight size={16} />
          </a>
        ) : (
          <button
            className="site-nav-action"
            onClick={() => onAccount("login")}
          >
            Member sign in <ArrowUpRight size={16} />
          </button>
        )}
      </header>
      <main id="site-main">
        <section
          className="story-hero"
          id="beginning"
          aria-labelledby="site-title"
        >
          <img
            className="story-evidence-art"
            src="/origin-evidence-field.jpg"
            alt=""
            aria-hidden="true"
            width="1536"
            height="1024"
            fetchPriority="high"
          />
          <div className="story-cosmos" aria-hidden="true">
            <img
              className="story-cosmos-art"
              src="/origin-evidence-field.jpg"
              alt=""
              width="1536"
              height="1024"
            />
            {cosmicTwinkles.map((star, index) => (
              <span
                className="cosmic-twinkle"
                key={`${star.x}-${star.y}`}
                data-cosmic-star={index + 1}
                style={{
                  "--star-x": star.x,
                  "--star-y": star.y,
                  "--star-size": star.size,
                  "--star-duration": star.duration,
                  "--star-delay": star.delay,
                }}
              />
            ))}
          </div>
          <div className="site-container story-hero-inner">
            <div className="story-hero-copy">
              <span className="site-kicker">
                PRIVATE IDEAS. TRACEABLE BEGINNINGS.
              </span>
              <h1 id="site-title">WHOAYO</h1>
              <p className="story-promise">Your ideas should be yours.</p>
              <p className="story-definition">
                Preserve the starting point.
                <br />
                Document what happens next.
              </p>
            </div>
            <div className="story-hero-bottom">
              <a
                className="story-hero-proof"
                href="#our-evidence"
                aria-label="WHOAYO's origin concept, preserved under the former Origin Studio name. October 5, 2026 at 04:52:27 UTC. Read our story and evidence."
              >
                <Fingerprint size={26} />
                <span>
                  <small>WHOAYO's origin, timestamped as Origin Studio.</small>
                  <strong>
                    October 5, 2026 <span aria-hidden="true">&middot;</span>{" "}
                    04:52:27 UTC
                  </strong>
                  <span className="hero-proof-method">
                    We used our own process. See the story.
                  </span>
                </span>
                <ArrowUpRight size={16} />
              </a>
              <div className="story-hero-entry">
                <div className="story-hero-actions">
                  {hostedPreview ? (
                    <a className="site-cta" href="#account">
                      Explore the project <ArrowUpRight size={18} />
                    </a>
                  ) : signedIn ? (
                    <a className="site-cta" href="/">
                      Open your workspace <ArrowUpRight size={18} />
                    </a>
                  ) : (
                    <button
                      className="site-cta"
                      onClick={() => onAccount("register")}
                    >
                      Start your idea <ArrowUpRight size={18} />
                    </button>
                  )}
                  <a href="#our-evidence" className="story-discover">
                    Explore the evidence <ArrowDown size={16} />
                  </a>
                </div>
                <p className="story-release">
                  {hostedPreview
                    ? "Read-only hosting pilot / Accounts and payments closed"
                    : "Local preview / Public sign-up not open"}
                </p>
              </div>
            </div>
          </div>
          <a className="story-next" href="#our-evidence">
            <span>01 / THE BEGINNING</span>
            <span>Every next step connects back to here.</span>
            <ArrowDown size={18} />
          </a>
        </section>
        <div
          className="story-sequence"
          aria-label="From idea to working history"
        >
          <span>
            <b>01</b> Your original words <ArrowRight size={16} />
          </span>
          <span>
            <b>02</b> Evidence of existence <ArrowRight size={16} />
          </span>
          <span>
            <b>03</b> A history that stays with you
          </span>
        </div>
        <ConceptProvenance featured />
        <WorkflowExample />
        <section className="site-workspace" id="workspace-preview">
          <div className="site-container">
            <div className="story-flow-lead story-lead-reverse">
              <div className="site-section-heading" data-scroll-reveal>
                <div>
                  <span className="site-kicker">04 / ROOM TO GROW</span>
                  <h2>
                    The origin stays. <br />
                    <em>The work moves forward.</em>
                  </h2>
                </div>
                <p>
                  Ideas, conversations, source files and evidence belong in one
                  working history. Built-in skills help you clarify, plan and
                  design experiments.
                </p>
              </div>
            </div>
            <figure className="workspace-figure">
              <img
                src="/origin-workspace-preview.jpg"
                alt="WHOAYO local workspace, captured under the former Origin Studio name, with a synthetic greenhouse idea, skills, model selector, files and evidence navigation."
                width="1440"
                height="1050"
                loading="lazy"
              />
              <figcaption>
                Actual local workspace, synthetic example. No customer records
                shown.
              </figcaption>
            </figure>
            <div className="site-models">
              <span>Your idea. A choice of AI models.</span>
              <p>
                OpenAI <span>/</span> Anthropic <span>/</span> Gemini{" "}
                <span>/</span> Kimi
              </p>
              <small>
                Choose an enabled model to research, plan and draft code inside
                your project. Keep the response and your own work connected to
                the original idea. Model access depends on configured API
                accounts; these names do not mean every model is enabled.
              </small>
            </div>
            <div
              className="product-direction"
              aria-label="Development platform availability"
            >
              <div>
                <span className="site-kicker">
                  AVAILABLE IN THE LOCAL WORKSPACE
                </span>
                <h3>From conversation to source files.</h3>
                <p>
                  Record ideas, use built-in planning skills, request code from
                  an enabled API model, and save useful responses as versioned
                  files. An API response is a draft, not a tested or deployed
                  application.
                </p>
              </div>
              <div>
                <span className="site-kicker">IN DEVELOPMENT</span>
                <h3>Build, test and publish with agents.</h3>
                <p>
                  The next layer is isolated code execution, test results,
                  working previews and reviewed publishing. Agents will propose
                  changes; external releases will remain an explicit decision.
                </p>
              </div>
              <div>
                <span className="site-kicker">PLANNED CONNECTIONS</span>
                <h3>A copy where you choose.</h3>
                <p>
                  Authorize Google Drive or an approved storage destination,
                  choose which projects to copy and set a schedule. Connection
                  permissions, encrypted copies, restore checks and failure
                  alerts must work before automatic copies are enabled.
                </p>
              </div>
              <div>
                <span className="site-kicker">PLANNED MEMBERSHIP</span>
                <h3>Enroll. Choose your usage plan.</h3>
                <p>
                  The intended service combines an enrollment fee with a
                  recurring usage plan. Included model and build usage, limits
                  and any additional charges will be shown before purchase.
                  Pricing is not set, and this preview does not take payments.
                </p>
              </div>
            </div>
          </div>
        </section>
        <section className="site-questions" id="questions">
          <div className="site-container questions-layout">
            <div className="story-questions-intro">
              <div data-scroll-reveal>
                <span className="site-kicker">05 / CLARITY ALONG THE WAY</span>
                <h2>
                  Good questions. <br />
                  <em>Straight answers.</em>
                </h2>
              </div>
            </div>
            <div className="question-list">
              <details>
                <summary>
                  Does a timestamp make an idea mine?
                  <Plus size={18} />
                </summary>
                <p>
                  No. It provides evidence about when exact content existed. It
                  does not establish ownership, originality, authorship or
                  whether someone had a similar idea earlier.
                </p>
              </details>
              <details>
                <summary>
                  Will my idea be published on a blockchain?
                  <Plus size={18} />
                </summary>
                <p>
                  The intended timestamp flow submits a fingerprint, not your
                  private concept text. Publishing the concept is a separate
                  decision. The signed-receipt workflow is implemented; its live
                  service is not enabled yet. A separate OpenTimestamps proof
                  for WHOAYO's preserved origin concept, recorded under the
                  former Origin Studio name, has been completed and
                  cross-checked against a public Bitcoin explorer; no local
                  Bitcoin node was used.
                </p>
              </details>
              <details>
                <summary>
                  Was WHOAYO's idea minted as an NFT?
                  <Plus size={18} />
                </summary>
                <p>
                  No. We preserved the concept under our former Origin Studio
                  name and obtained a Bitcoin-backed timestamp for its
                  fingerprint. There is no NFT, token purchase or transfer of
                  ownership. The date shows that this exact version existed by
                  that time.
                </p>
              </details>
              <details>
                <summary>
                  Do I need to know how to code?
                  <Plus size={18} />
                </summary>
                <p>
                  No code is needed to record an idea, keep notes or use the
                  built-in planning skills with an enabled model. Running and
                  deploying generated applications is not part of this local
                  release.
                </p>
              </details>
              <details>
                <summary>
                  Can I sign up from another device today?
                  <Plus size={18} />
                </summary>
                <p>
                  {hostedPreview
                    ? "Not yet. This hosted preview does not create accounts or accept private ideas. "
                    : "Not yet. This preview creates accounts on this Mac only. "}
                  Hosted sign-up, verified email, password recovery and
                  cross-device access must be connected before public launch.
                </p>
              </details>
            </div>
          </div>
        </section>
        <section
          className="site-join"
          id="account"
          aria-labelledby="join-title"
        >
          <div className="site-container join-layout">
            <div className="join-intro">
              <div data-scroll-reveal>
                <span className="site-kicker">06 / YOUR BEGINNING</span>
                <h2 id="join-title" tabIndex={-1}>
                  Your next <em>idea.</em>
                </h2>
                <p>Give it a place to begin. Keep a record of how it grows.</p>
              </div>
              <div className="join-availability">
                <Clock3 size={20} />
                <div>
                  <strong>
                    {hostedPreview
                      ? "Read-only hosting pilot."
                      : "Local evaluation is available."}
                  </strong>
                  <p>
                    {hostedPreview
                      ? "Public accounts are not open. Identity, recovery and backup acceptance must be completed before customer access."
                      : "Public accounts are not open yet. This preview stays on this Mac; it is not a hosted service."}
                  </p>
                </div>
              </div>
            </div>
            <div className="join-form">
              {signedIn ? (
                <div className="site-return">
                  <Fingerprint size={38} />
                  <h3>Your workspace is ready.</h3>
                  <p>You are already signed in on this Mac.</p>
                  <a className="site-cta" href="/">
                    Return to workspace <ArrowRight size={18} />
                  </a>
                </div>
              ) : (
                children
              )}
            </div>
          </div>
        </section>
      </main>
      <footer className="site-footer site-container">
        <a className="site-logo" href="#site-main">
          <Fingerprint size={24} />
          <span>WHOAYO</span>
        </a>
        <p>Preserve the starting point. Document what happens next.</p>
        <a
          href="https://github.com/M2201/whoayo"
          target="_blank"
          rel="noopener noreferrer"
        >
          Source · AGPL-3.0 <ArrowUpRight size={15} />
        </a>
        <a href="#our-evidence">
          Our evidence <ArrowUpRight size={15} />
        </a>
      </footer>
      <ScrollText rootRef={root} />
    </div>
  );
}
