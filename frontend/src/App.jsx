import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
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

  async function runResearch(event) {
    event?.preventDefault();
    const cleanTopic = topic.trim();
    if (!cleanTopic || isRunning) return;
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
      setResult(payload);
      setActiveStage(stages.length);
    } catch (requestError) {
      let details;
      try {
        details = JSON.parse(requestError.message);
      } catch {
        details = {};
      }
      setError({
        code: details.code || "connection_error",
        message:
          details.message ||
          "The research service could not be reached. Check that the backend is running and try again.",
        retryable: details.retryable ?? true,
      });
    } finally {
      setIsRunning(false);
    }
  }

  function startNewResearch() {
    setResult(null);
    setError(null);
    setActiveStage(-1);
    setTopic("");
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
        <div className="side-label">Workspace</div>
        <div className="side-item active" title="Current study">
          <span className="side-dot" />
          Current study
        </div>
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
