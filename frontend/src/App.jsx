import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { jsPDF } from "jspdf";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const stages = [
  {
    key: "search",
    label: "Searching the open web",
    detail: "Finding recent, credible sources",
  },
  {
    key: "scrape",
    label: "Reading source material",
    detail: "Pulling context from the strongest result",
  },
  {
    key: "report",
    label: "Writing the report",
    detail: "Connecting evidence into a clear answer",
  },
  {
    key: "critique",
    label: "Quality checking",
    detail: "Looking for gaps, overclaims, and weak evidence",
  },
];

function App() {
  const [topic, setTopic] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [researches, setResearches] = useState([]);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [activeResearchId, setActiveResearchId] = useState(null);
  const activeResearchIdRef = useRef(null);
  const [apiStatus, setApiStatus] = useState("checking");
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 800);
  const [activeStage, setActiveStage] = useState(-1);
  const [expanded, setExpanded] = useState({
    sources: true,
    reading: false,
    critique: true,
  });

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((response) => setApiStatus(response.ok ? "ready" : "offline"))
      .catch(() => setApiStatus("offline"));
  }, []);

  useEffect(() => {
    if (!isRunning) return undefined;
    const timer = window.setInterval(
      () =>
        setActiveStage((current) => Math.min(current + 1, stages.length - 1)),
      5200,
    );
    return () => window.clearInterval(timer);
  }, [isRunning]);

  async function runResearch(event, existingResearchId = null) {
    event?.preventDefault();
    const cleanTopic = topic.trim();
    if (!cleanTopic || isRunning) return;
    const researchId = existingResearchId || crypto.randomUUID();
    setResearches((current) =>
      existingResearchId
        ? current.map((research) =>
            research.id === researchId
              ? { ...research, status: "running", error: null, activeStage: 0 }
              : research,
          )
        : [
            {
              id: researchId,
              topic: cleanTopic,
              status: "running",
              result: null,
              error: null,
              activeStage: 0,
            },
            ...current,
          ],
    );
    setActiveResearchId(researchId);
    activeResearchIdRef.current = researchId;
    setIsRunning(true);
    setActiveStage(0);
    setResult(null);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: cleanTopic }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(payload.error || {}));
      if (activeResearchIdRef.current === researchId) setResult(payload);
      setResearches((current) =>
        current.map((research) =>
          research.id === researchId
            ? {
                ...research,
                status: "complete",
                result: payload,
                activeStage: stages.length,
              }
            : research,
        ),
      );
      setActiveStage(stages.length);
    } catch (requestError) {
      let details;
      try {
        details = JSON.parse(requestError.message);
      } catch {
        details = {};
      }
      const nextError = {
        code: details.code || "connection_error",
        message:
          details.message ||
          "The research service could not be reached. Check that the backend is running and try again.",
        retryable: details.retryable ?? true,
      };
      if (activeResearchIdRef.current === researchId) setError(nextError);
      setResearches((current) =>
        current.map((research) =>
          research.id === researchId
            ? {
                ...research,
                status: "error",
                error: nextError,
                activeStage: -1,
              }
            : research,
        ),
      );
    } finally {
      if (activeResearchIdRef.current === researchId) setIsRunning(false);
    }
  }

  function startNewResearch() {
    setResult(null);
    setError(null);
    setActiveStage(-1);
    setTopic("");
    setActiveResearchId(null);
    activeResearchIdRef.current = null;
    setIsRunning(false);
  }
  function selectResearch(research) {
    setActiveResearchId(research.id);
    activeResearchIdRef.current = research.id;
    setTopic(research.topic);
    setResult(research.result);
    setError(research.error);
    setIsRunning(research.status === "running");
    setActiveStage(research.activeStage);
  }
  function confirmDeleteResearch() {
    if (!pendingDelete) return;
    const researchId = pendingDelete.id;
    const remaining = researches.filter(
      (research) => research.id !== researchId,
    );
    setResearches(remaining);
    setPendingDelete(null);
    if (activeResearchId !== researchId) return;
    const nextResearch = remaining[0];
    if (nextResearch) selectResearch(nextResearch);
    else startNewResearch();
  }
  function downloadReport() {
    if (!result?.report) return;
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const lines = pdf.splitTextToSize(
      result.report.replace(/[`*_#>-]/g, ""),
      pageWidth - 96,
    );
    let y = 64;
    pdf.setFont("times", "normal");
    pdf.setFontSize(12);
    lines.forEach((line) => {
      if (y > pageHeight - 56) {
        pdf.addPage();
        y = 56;
      }
      pdf.text(line, 48, y);
      y += 18;
    });
    pdf.save("deep-research-report.pdf");
  }
  function stopResearch() {
    if (!activeResearchId) return;
    setIsRunning(false);
    setResearches((current) =>
      current.map((research) =>
        research.id === activeResearchId
          ? { ...research, status: "stopped", activeStage }
          : research,
      ),
    );
  }
  function togglePanel(panel) {
    setExpanded((current) => ({ ...current, [panel]: !current[panel] }));
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "is-open" : "is-collapsed"}`}>
        {sidebarOpen && (
          <button
            className="sidebar-close"
            type="button"
            aria-label="Close sidebar"
            title="Close sidebar"
            onClick={() => setSidebarOpen(false)}
          >
            <span aria-hidden="true">×</span>
          </button>
        )}
        <div className="brand">
          <span className="brand-mark">R</span>
          <span>Research / desk</span>
        </div>
        <div className="sidebar-rule" />
        <button
          className="new-research"
          type="button"
          onClick={startNewResearch}
        >
          <span>+</span> New research
        </button>
        {researches.length > 0 && (
          <>
            <div className="side-label research-list-label">Research</div>
            <div className="research-list">
              {researches.map((research) => (
                <div
                  className={`research-item ${research.id === activeResearchId ? "selected" : ""}`}
                  key={research.id}
                  title={research.topic}
                >
                  <button
                    className="research-select"
                    type="button"
                    onClick={() => selectResearch(research)}
                  >
                    <span className={`research-status ${research.status}`} />
                    <span>{research.topic}</span>
                  </button>
                  <button
                    className="research-delete"
                    type="button"
                    aria-label={`Delete research: ${research.topic}`}
                    title="Delete research"
                    onClick={() => setPendingDelete(research)}
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24">
                      <path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
        <div
          className="sidebar-footer"
          title={`Provider status: ${apiStatus === "ready" ? "Ready" : apiStatus === "offline" ? "Offline" : "Checking"}`}
        >
          <span className="status-dot" />
          Provider status{" "}
          <strong>
            {apiStatus === "checking"
              ? "Checking"
              : apiStatus === "ready"
                ? "Ready"
                : "Offline"}
          </strong>
        </div>
      </aside>
      {sidebarOpen && (
        <button
          className="sidebar-backdrop"
          type="button"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <main className="main-content">
        <header className="topbar">
          <button
            className="sidebar-toggle"
            type="button"
            aria-label={sidebarOpen ? "Collapse sidebar" : "Open sidebar"}
            title={sidebarOpen ? "Collapse sidebar" : "Open sidebar"}
            onClick={() => setSidebarOpen((current) => !current)}
          >
            <span />
            <span />
            <span />
          </button>
          <span className="topbar-title">Deep research agent</span>
          <span className="topbar-note">Evidence before opinion</span>
        </header>
        {!activeResearchId && (
          <section className="hero-section">
            <p className="eyebrow">A considered answer, not a quick one</p>
            <h1>
              What would you like
              <br />
              <em>to understand?</em>
            </h1>
            <p className="intro">
              I’ll search the web, read the strongest source material, and shape
              it into a report you can trust.
            </p>
            <form className="research-form" onSubmit={runResearch}>
              <textarea
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    runResearch(event);
                  }
                }}
                placeholder="Ask a research question..."
                rows="3"
                maxLength="500"
                disabled={isRunning}
              />
              <div className="form-footer">
                <span>{topic.length}/500</span>
                <button
                  className="run-button"
                  type="submit"
                  disabled={!topic.trim() || isRunning}
                >
                  {isRunning ? "Working..." : "Begin research"} <span>↗</span>
                </button>
              </div>
            </form>
            {error && (
              <section className="error-panel" role="alert">
                <div className="error-icon">!</div>
                <div>
                  <strong>
                    {error.code === "connection_error"
                      ? "The desk is offline"
                      : "Research paused"}
                  </strong>
                  <p>{error.message}</p>
                  {error.retryable && (
                    <button type="button" onClick={runResearch}>
                      Try again <span>↗</span>
                    </button>
                  )}
                </div>
              </section>
            )}
          </section>
        )}
        {activeResearchId && !result && (
          <section className="research-header appear">
            <div>
              <p className="eyebrow">Research workspace</p>
              <h1>{topic}</h1>
              <p className="research-state">
                {isRunning
                  ? "Research is running in the background."
                  : result
                    ? "Research complete."
                    : "Research needs your attention."}
              </p>
            </div>
            <div className="research-actions">
              {isRunning && (
                <button
                  className="stop-button"
                  type="button"
                  onClick={stopResearch}
                >
                  Stop <span>■</span>
                </button>
              )}
              <button
                className="quiet-button"
                type="button"
                onClick={startNewResearch}
              >
                Go back <span>↩</span>
              </button>
            </div>
          </section>
        )}
        {activeResearchId && error && (
          <section className="error-panel active-error" role="alert">
            <div className="error-icon">!</div>
            <div>
              <strong>Research paused</strong>
              <p>{error.message}</p>
              <div className="error-actions">
                {error.retryable && (
                  <button
                    type="button"
                    onClick={() => runResearch(undefined, activeResearchId)}
                  >
                    Try again <span>↗</span>
                  </button>
                )}
                <button type="button" onClick={startNewResearch}>
                  Go back <span>↩</span>
                </button>
              </div>
            </div>
          </section>
        )}
        {isRunning && (
          <section className="progress-section appear">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Live progress</p>
                <h2>Building your answer</h2>
              </div>
              <span className="pulse-label">
                <i /> In progress
              </span>
            </div>
            <div className="stage-list">
              {stages.map((stage, index) => (
                <div
                  className={`stage ${index < activeStage ? "done" : ""} ${index === activeStage ? "current" : ""}`}
                  key={stage.key}
                >
                  <span className="stage-index">
                    {index < activeStage ? "✓" : `0${index + 1}`}
                  </span>
                  <div>
                    <strong>{stage.label}</strong>
                    <p>
                      {index === activeStage
                        ? stage.detail
                        : index < activeStage
                          ? "Complete"
                          : "Queued"}
                    </p>
                  </div>
                  <span className="stage-line" />
                </div>
              ))}
            </div>
            <p className="wait-note">
              This usually takes a minute or two. You can leave this tab open
              while I work through the sources.
            </p>
          </section>
        )}
        {result && (
          <section className="results-section appear">
            <div className="result-header">
              <div>
                <p className="eyebrow">Research complete</p>
                <h2>{result.topic}</h2>
              </div>
              <button
                className="quiet-button"
                type="button"
                onClick={startNewResearch}
              >
                New study <span>+</span>
              </button>
            </div>
            <Panel
              title="Sources found"
              meta="Search results"
              open={expanded.sources}
              onToggle={() => togglePanel("sources")}
            >
              <MarkdownPreview className="content-text source-text">
                {result.search_results}
              </MarkdownPreview>
            </Panel>
            <Panel
              title="Source reading"
              meta="Context gathered"
              open={expanded.reading}
              onToggle={() => togglePanel("reading")}
            >
              <MarkdownPreview className="content-text">
                {result.scraper_results}
              </MarkdownPreview>
            </Panel>
            <article className="report-block">
              <p className="eyebrow">The report</p>
              <MarkdownPreview className="report-copy">
                {result.report}
              </MarkdownPreview>
              <button
                className="download-button"
                type="button"
                onClick={downloadReport}
              >
                Download report <span>↓</span>
              </button>
            </article>
            <Panel
              title="Critical review"
              meta="Quality check"
              open={expanded.critique}
              onToggle={() => togglePanel("critique")}
            >
              <MarkdownPreview className="critique-copy">
                {result.critique}
              </MarkdownPreview>
            </Panel>
          </section>
        )}
        {activeResearchId && !isRunning && !result && !error && (
          <section className="stopped-panel appear">
            <p className="eyebrow">Research stopped</p>
            <h2>This research is paused</h2>
            <p>
              You can return home to start a new workspace, or select another
              research from the sidebar.
            </p>
          </section>
        )}
        {!isRunning && !result && !error && (
          <div className="suggestions">
            <span>Try a question like</span>
            <button
              type="button"
              onClick={() =>
                setTopic(
                  "How is Bitcoin mining changing its environmental footprint?",
                )
              }
            >
              How is Bitcoin mining changing its environmental footprint?
            </button>
            <button
              type="button"
              onClick={() =>
                setTopic(
                  "What are the most promising approaches to sustainable aviation?",
                )
              }
            >
              What are the most promising approaches to sustainable aviation?
            </button>
          </div>
        )}
      </main>
      {pendingDelete && (
        <div className="dialog-backdrop" role="presentation">
          <section
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-title"
          >
            <p className="eyebrow">Delete research</p>
            <h2 id="delete-title">Remove this research?</h2>
            <p>
              This will remove “{pendingDelete.topic}” from your workspace. This
              action cannot be undone.
            </p>
            <div className="dialog-actions">
              <button
                className="quiet-button"
                type="button"
                onClick={() => setPendingDelete(null)}
              >
                Cancel
              </button>
              <button
                className="delete-confirm-button"
                type="button"
                onClick={confirmDeleteResearch}
              >
                Delete research
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function MarkdownPreview({ children, className }) {
  return (
    <div className={`${className} markdown-preview`}>
      <ReactMarkdown
        components={{
          a: ({ href, children: linkChildren }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {linkChildren}
            </a>
          ),
        }}
      >
        {children || ""}
      </ReactMarkdown>
    </div>
  );
}

function Panel({ title, meta, open, onToggle, children }) {
  return (
    <section className={`result-panel ${open ? "is-open" : ""}`}>
      <button className="panel-toggle" type="button" onClick={onToggle}>
        <span className="panel-chevron">{open ? "⌄" : "›"}</span>
        <strong>{title}</strong>
        <span>{meta}</span>
      </button>
      {open && <div className="panel-body">{children}</div>}
    </section>
  );
}

export default App;
