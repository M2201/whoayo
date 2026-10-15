import React, { useEffect, useState } from "react";
import { Download, Fingerprint, RefreshCw, ShieldCheck } from "lucide-react";

export function useTimestampStatus(project, api) {
  const [status, setStatus] = useState(null);
  const refresh = async () =>
    setStatus(await api(`/projects/${project.id}/timestamp-status`));
  useEffect(() => {
    let cancelled = false;
    setStatus(null);
    api(`/projects/${project.id}/timestamp-status`)
      .then((value) => {
        if (!cancelled) setStatus(value);
      })
      .catch(() => {
        if (!cancelled)
          setStatus({
            ready: false,
            paths: [],
            reason:
              "Receipt status is unavailable. Try checking again; private notes remain available.",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [project.id, project.revision]);
  return [status, refresh];
}

export default function TimestampPanel({
  project,
  status,
  api,
  saveProject,
  refresh,
  Button,
  Modal,
  download,
  disabled,
}) {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState("");
  const [review, setReview] = useState(null);
  const [approved, setApproved] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [changePath, setChangePath] = useState(false);
  const choice = status?.paths.find((p) => p.id === path);
  const close = () => {
    if (!working) {
      setOpen(false);
      setReview(null);
      setApproved(false);
      setError("");
      setChangePath(false);
    }
  };
  const perform = async (fn) => {
    setWorking(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setWorking(false);
    }
  };
  const prepare = () =>
    perform(async () => {
      const result = await api(`/projects/${project.id}/timestamp-prepare`, {
        revision: project.revision,
        ideaId: project.ideas.at(-1)?.id,
        path,
      });
      await saveProject(result.project);
      setReview(result.approval);
      setApproved(false);
    });
  const submit = () =>
    perform(async () => {
      try {
        const result = await api(`/projects/${project.id}/timestamp-submit`, {
          id: review.id,
          revision: project.revision,
          approvalToken: review.approvalToken,
          payloadSha256: review.payloadSha256,
          approved: true,
        });
        await saveProject(result);
      } finally {
        setReview(null);
        setApproved(false);
        await saveProject(await api(`/projects/${project.id}`));
        await refresh();
      }
    });
  const proof = status?.proof;
  return (
    <>
      <section
        className={`timestamp-strip ${status?.ready ? "ready" : ""}`}
        aria-label="Idea timestamp"
      >
        {status?.ready ? <ShieldCheck size={19} /> : <Fingerprint size={19} />}
        <div>
          <strong>
            {status?.ready
              ? `${proof?.synthetic ? "Synthetic test: " : ""}signed timestamp verified`
              : "Timestamp required before AI"}
          </strong>
          <span>
            {status
              ? `Idea version ${status.ideaVersion || project.ideas.length} · ${status.ready ? "Not Bitcoin-confirmed" : "Private notes remain available"}`
              : "Checking receipt..."}
          </span>
        </div>
        <Button
          icon={Fingerprint}
          disabled={disabled || !status}
          onClick={() => {
            setOpen(true);
            setPath(status?.selection?.path || "");
          }}
        >
          {status?.ready ? "View timestamp receipt" : "Timestamp setup"}
        </Button>
      </section>
      {open && (
        <Modal
          title="Your idea timestamp"
          close={close}
          error={error}
          canClose={!working}
        >
          <div className="timestamp-dialog" aria-busy={working}>
            <p className="fine">
              Idea version {status?.ideaVersion || project.ideas.length}. New
              ideas or later changes need their own receipt. A timestamp is
              evidence of existence, not ownership or originality.
            </p>
            {status?.ready && proof && (
              <section
                className="timestamp-verified"
                aria-label="Verified receipt"
              >
                <h3>
                  {proof.synthetic
                    ? "Synthetic test receipt verified"
                    : "Signed receipt verified"}
                </h3>
                <dl>
                  <dt>Authority</dt>
                  <dd>{proof.authority}</dd>
                  <dt>Authority time (UTC)</dt>
                  <dd>
                    {proof.authorityTime || "Offline provider-only fixture"}
                  </dd>
                  <dt>Bitcoin</dt>
                  <dd>Not verified</dd>
                </dl>
                {proof.receiptId && (
                  <Button
                    icon={Download}
                    disabled={working}
                    onClick={() =>
                      perform(async () => {
                        const receipt = await api(
                          `/projects/${project.id}/signed-receipt?receipt=${encodeURIComponent(proof.receiptId)}`,
                        );
                        const preserved = await api(
                          `/projects/${project.id}/snapshot?snapshot=${encodeURIComponent(proof.snapshotId)}`,
                        );
                        download(
                          `origin-timestamp-v${status.ideaVersion}.json`,
                          { receipt, preserved },
                        );
                      })
                    }
                  >
                    Download receipt and private package
                  </Button>
                )}
              </section>
            )}
            {!status?.ready && (
              <p className="notice" role="status">
                {status?.reason || "No verified receipt for this version."}
              </p>
            )}
            {status?.lastAttempt && !status.ready && (
              <p className="notice">
                Last request: {status.lastAttempt.status}.{" "}
                {status.lastAttempt.reason}
              </p>
            )}
            {status?.ready && !changePath && (
              <div className="modal-foot">
                <Button disabled={working} onClick={() => setChangePath(true)}>
                  Change timestamp choice
                </Button>
                <Button variant="primary" disabled={working} onClick={close}>
                  Done
                </Button>
              </div>
            )}
            {!review && (!status?.ready || changePath) && (
              <>
                <fieldset disabled={working} className="timestamp-paths">
                  <legend>Choose your timestamp path</legend>
                  {(status?.paths || []).map((p) => (
                    <label key={p.id}>
                      <input
                        type="radio"
                        name="timestamp-path"
                        value={p.id}
                        checked={path === p.id}
                        disabled={!p.available}
                        onChange={() => {
                          setPath(p.id);
                          setError("");
                        }}
                      />
                      <span>
                        <strong>
                          {p.name}
                          {p.synthetic ? " (synthetic test)" : ""}
                        </strong>
                        <span>{p.explanation}</span>
                        {p.available ? (
                          <span>
                            {p.authority} ·{" "}
                            {p.costUsd === 0
                              ? "No authority fee"
                              : "Fee not confirmed"}
                          </span>
                        ) : (
                          <span className="timestamp-unavailable">
                            Unavailable: {p.reason}
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                </fieldset>
                <div className="modal-foot">
                  <Button
                    icon={RefreshCw}
                    disabled={working}
                    onClick={() => perform(refresh)}
                  >
                    Check status
                  </Button>
                  <Button
                    variant="primary"
                    icon={Fingerprint}
                    disabled={
                      working || !choice?.available || !project.ideas.length
                    }
                    onClick={prepare}
                  >
                    Review fingerprint
                  </Button>
                </div>
              </>
            )}
            {review && (
              <>
                <h3>Approve this exact submission</h3>
                <dl className="timestamp-review">
                  <dt>Destination</dt>
                  <dd>{review.destination}</dd>
                  <dt>Version</dt>
                  <dd>{review.ideaVersion}</dd>
                  <dt>SHA-256 fingerprint</dt>
                  <dd>
                    <code>{review.payloadSha256}</code>
                  </dd>
                  <dt>Authority fee</dt>
                  <dd>{review.feeUsd === 0 ? "$0" : "Not confirmed"}</dd>
                </dl>
                <p className="fine">
                  Only the fingerprint and timestamp protocol metadata leave
                  this server. Your idea text and private package are not sent
                  to the authority. This is not a Bitcoin transaction.
                </p>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={approved}
                    disabled={working}
                    onChange={(e) => setApproved(e.target.checked)}
                  />
                  I approve this fingerprint submission.
                </label>
                <div className="modal-foot">
                  <Button
                    disabled={working}
                    onClick={() => {
                      setReview(null);
                      setApproved(false);
                    }}
                  >
                    Back
                  </Button>
                  <Button
                    variant="primary"
                    icon={ShieldCheck}
                    disabled={working || !approved}
                    onClick={submit}
                  >
                    {working
                      ? "Verifying receipt..."
                      : "Submit approved fingerprint"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
