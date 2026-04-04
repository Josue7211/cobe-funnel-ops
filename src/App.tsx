import './App.css'
import {
  automationRules,
  bookings,
  capiEvents,
  conversations,
  demoScenarios,
  eventLog,
  leads,
  repoModules,
  revenueMetrics,
  summaryStats,
} from './data'

function App() {
  const activeConversation = conversations[0]

  return (
    <div className="app-shell">
      <header className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Interview Build • Creator Funnel Ops</p>
          <h1>DM automation, no-show recovery, and revenue tracking in one operator console.</h1>
          <p className="hero-text">
            This demo is scoped around the job post itself: a ManyChat-style DM sprint funnel,
            GHL-style routing and recovery, and a dashboard that keeps Stripe and CAPI-ready
            events visible.
          </p>
          <div className="hero-actions">
            <a href="#dm-funnel" className="button button-primary">
              Walk the DM funnel
            </a>
            <a href="#dashboard" className="button button-secondary">
              See revenue + ops
            </a>
          </div>
        </div>
        <div className="hero-card">
          <div className="hero-card-header">
            <span>Outcome Fit</span>
            <span>Week-one ready</span>
          </div>
          <ul className="check-list">
            <li>ManyChat-style DM qualification and tagging</li>
            <li>Stripe checkout handoff and webhook outcomes</li>
            <li>Call routing, no-show state, and recovery branch</li>
            <li>Meta CAPI-ready event naming and payload mapping</li>
          </ul>
        </div>
      </header>

      <section className="stats-grid">
        {summaryStats.map((stat) => (
          <article key={stat.label} className="stat-card">
            <p className="stat-label">{stat.label}</p>
            <p className="stat-value">{stat.value}</p>
            <p className="stat-note">{stat.note}</p>
          </article>
        ))}
      </section>

      <section className="module-strip">
        {repoModules.map((module) => (
          <article key={module.name} className="module-card">
            <p className="module-name">{module.name}</p>
            <p>{module.summary}</p>
          </article>
        ))}
      </section>

      <section className="scenario-strip">
        {demoScenarios.map((scenario) => (
          <article key={scenario.id} className="scenario-card">
            <div className="scenario-header">
              <div>
                <p className="module-name">Demo path</p>
                <h2>{scenario.title}</h2>
              </div>
              <span className="status-pill">Loom-ready</span>
            </div>
            <p className="scenario-outcome">{scenario.outcome}</p>
            <ol className="scenario-steps">
              {scenario.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </article>
        ))}
      </section>

      <main className="workspace">
        <section id="dm-funnel" className="panel panel-wide">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Module 1</p>
              <h2>DM Sprint Funnel</h2>
            </div>
            <span className="status-pill">ManyChat-style automation</span>
          </div>
          <div className="funnel-layout">
            <article className="inbox-card">
              <div className="inbox-header">
                <div>
                  <p className="mini-label">Active conversation</p>
                  <h3>{leads[0].name}</h3>
                </div>
                <div className="score-badge">{activeConversation.score} intent score</div>
              </div>
              <div className="message-stack">
                {activeConversation.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`message-bubble ${
                      message.sender === 'bot' ? 'message-bot' : 'message-lead'
                    }`}
                  >
                    <span>{message.text}</span>
                    <small>{message.timestamp}</small>
                  </div>
                ))}
              </div>
              <div className="automation-summary">
                <p className="mini-label">Automation result</p>
                <p>{activeConversation.automationSummary}</p>
              </div>
            </article>

            <article className="lead-card">
              <div className="lead-header">
                <div>
                  <p className="mini-label">Lead profile</p>
                  <h3>{leads[0].handle}</h3>
                </div>
                <span className="stage-badge">{leads[0].stage}</span>
              </div>
              <dl className="detail-grid">
                <div>
                  <dt>Offer</dt>
                  <dd>{leads[0].offer}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{leads[0].source}</dd>
                </div>
                <div>
                  <dt>Owner</dt>
                  <dd>{leads[0].owner}</dd>
                </div>
                <div>
                  <dt>Next action</dt>
                  <dd>{leads[0].nextAction}</dd>
                </div>
              </dl>
              <div className="tag-row">
                {leads[0].tags.map((tag) => (
                  <span key={tag} className="tag">
                    {tag}
                  </span>
                ))}
              </div>
            </article>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Rules</p>
              <h2>Automation Logic</h2>
            </div>
            <span className="status-pill">Low-code friendly</span>
          </div>
          <div className="rule-stack">
            {automationRules.map((rule) => (
              <article key={rule.id} className="rule-card">
                <p className="mini-label">{rule.system}</p>
                <h3>{rule.trigger}</h3>
                <p className="rule-condition">{rule.condition}</p>
                <ul className="rule-actions">
                  {rule.actions.map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Module 2</p>
              <h2>Routing + No-Show Recovery</h2>
            </div>
            <span className="status-pill">GHL mirror</span>
          </div>
          <div className="booking-stack">
            {bookings.map((booking) => {
              const lead = leads.find((entry) => entry.id === booking.leadId)
              return (
                <article key={booking.id} className="booking-card">
                  <div className="booking-topline">
                    <div>
                      <h3>{lead?.name}</h3>
                      <p>{booking.slot}</p>
                    </div>
                    <span className={`booking-status booking-${booking.status}`}>
                      {booking.status}
                    </span>
                  </div>
                  <p className="booking-owner">Closer: {booking.owner}</p>
                  <p>{booking.recoveryAction}</p>
                </article>
              )
            })}
          </div>
        </section>

        <section id="dashboard" className="panel panel-wide">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Module 3</p>
              <h2>Revenue + Tracking Dashboard</h2>
            </div>
            <span className="status-pill">Stripe + Meta-ready</span>
          </div>

          <div className="dashboard-layout">
            <div className="metric-grid">
              {revenueMetrics.map((metric) => (
                <article key={metric.label} className="metric-card">
                  <p className="metric-label">{metric.label}</p>
                  <p className="metric-value">{metric.value}</p>
                  <p className="metric-delta">{metric.delta}</p>
                </article>
              ))}
            </div>

            <article className="capi-card">
              <div className="subsection-header">
                <h3>CAPI-ready server events</h3>
                <p>Clean naming, match keys, and payload status for a future Meta handoff.</p>
              </div>
              <div className="capi-table">
                {capiEvents.map((event) => (
                  <div key={event.eventName} className="capi-row">
                    <div>
                      <p className="event-name">{event.eventName}</p>
                      <p>{event.source}</p>
                    </div>
                    <div>
                      <p className="mini-label">Match keys</p>
                      <p>{event.matchKeys.join(', ')}</p>
                    </div>
                    <div>
                      <p className="mini-label">Status</p>
                      <p>{event.payloadStatus}</p>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>

        <section className="panel panel-wide">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Audit Trail</p>
              <h2>Recent Event Log</h2>
            </div>
            <span className="status-pill">Operator visibility</span>
          </div>
          <div className="event-table">
            {eventLog.map((entry) => (
              <div key={entry.id} className="event-row">
                <div>
                  <p className="event-name">{entry.event}</p>
                  <p>{entry.detail}</p>
                </div>
                <div>
                  <p className="mini-label">Lead</p>
                  <p>{entry.leadId}</p>
                </div>
                <div>
                  <p className="mini-label">Channel</p>
                  <p>{entry.channel}</p>
                </div>
                <div>
                  <p className={`event-status event-${entry.status}`}>{entry.status}</p>
                  <p>{entry.timestamp}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
