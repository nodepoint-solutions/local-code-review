import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClaudeAvatar } from '../components/AgentAvatar'
import styles from './Demo.module.css'

const AUTO_ADVANCE_MS = 7500

interface Step {
  id: string
  hint: string
  headline: string
  description: string
}

const STEPS: Step[] = [
  {
    id: 'open',
    hint: '01 — Open',
    headline: 'Open a local PR in seconds',
    description:
      'Pick any two branches from your repo. Local Review creates a full diff — no GitHub required, no premature commits, no noise for your team.',
  },
  {
    id: 'review',
    hint: '02 — Review',
    headline: 'Navigate and comment on the diff',
    description:
      'Browse changed files in the file tree, toggle between unified and split views, and click any line to leave an inline comment. Everything stays on your machine.',
  },
  {
    id: 'submit',
    hint: '03 — Assign',
    headline: 'Submit the review and assign to an agent',
    description:
      'Submit your review, then assign it to Claude Code or Copilot from the Overview tab. The agent gets notified and picks up every comment automatically.',
  },
  {
    id: 'agent',
    hint: '04 — Fix',
    headline: 'Watch your agent work through the comments',
    description:
      'Your agent reads each comment via MCP, makes targeted fixes, commits, and marks the comment resolved — one logical group at a time. You see it happen live.',
  },
  {
    id: 'ship',
    hint: '05 — Ship',
    headline: 'Open the PR on GitHub when it\'s ready',
    description:
      'Once the code meets your bar, one button transfers the PR to GitHub. Clean history, no half-baked commits, and no noise for the rest of your team.',
  },
]

// ─── Shared mock chrome elements ─────────────────────────────────────────────

function MockNav({
  crumbs,
  rightSlot,
}: {
  crumbs: string[]
  rightSlot?: React.ReactNode
}): JSX.Element {
  return (
    <div className={styles.mockNav}>
      <span className={styles.mockNavLogo}>Local Review</span>
      {crumbs.map((crumb, i) => (
        <span key={i} className={styles.mockNavSep}>
          ›{' '}
          <span className={i === crumbs.length - 1 ? styles.mockNavCrumbActive : styles.mockNavCrumb}>
            {crumb}
          </span>
        </span>
      ))}
      {rightSlot && <div className={styles.mockNavRight}>{rightSlot}</div>}
    </div>
  )
}

function MockPrHeader({
  title,
  compareBranch,
  baseBranch,
  status,
  meta,
}: {
  title: string
  compareBranch: string
  baseBranch: string
  status: 'open' | 'submitted'
  meta: string
}): JSX.Element {
  return (
    <div className={styles.mockPrHeader}>
      <div className={styles.mockPrTitleRow}>
        <span className={styles.mockPrTitle}>{title}</span>
        <span className={`${styles.mockStatusBadge} ${status === 'open' ? styles.mockStatusOpen : styles.mockStatusSubmitted}`}>
          {status === 'open' ? 'Open' : 'Closed'}
        </span>
      </div>
      <div className={styles.mockPrMeta}>
        <code className={styles.mockBranch}>{compareBranch}</code>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
        </svg>
        <code className={styles.mockBranch}>{baseBranch}</code>
        <span className={styles.mockMetaDot}>·</span>
        <span>{meta}</span>
      </div>
    </div>
  )
}

function MockTabBar({
  tabs,
  active,
  rightSlot,
}: {
  tabs: { key: string; label: string; count?: number }[]
  active: string
  rightSlot?: React.ReactNode
}): JSX.Element {
  return (
    <div className={styles.mockTabBar}>
      <div className={styles.mockTabs}>
        {tabs.map((t) => (
          <div
            key={t.key}
            className={t.key === active ? `${styles.mockTab} ${styles.mockTabActive}` : styles.mockTab}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={styles.mockTabCount}>{t.count}</span>
            )}
          </div>
        ))}
      </div>
      {rightSlot}
    </div>
  )
}


// ─── Mockup 1: Open a PR (OpenPR screen) ─────────────────────────────────────

function MockupOpen(): JSX.Element {
  return (
    <div className={styles.m1Wrap}>
      <MockNav crumbs={['my-repo', 'New pull request']} />
      <div className={styles.m1Content}>
        <div className={styles.m1Card}>
          <div className={styles.m1CardHeader}>
            <div className={styles.m1CardTitle}>New pull request</div>
            <div className={styles.m1CardSub}>
              Compare changes between two branches in <strong>my-repo</strong>
            </div>
          </div>
          <div className={styles.m1Form}>
            <div className={styles.m1BranchRow}>
              <div className={styles.m1BranchField}>
                <label className={styles.m1Label}>Base branch</label>
                <div className={styles.m1Select}>
                  <span>main</span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
                </div>
                <span className={styles.m1FieldHint}>The branch you want to merge into</span>
              </div>
              <div className={styles.m1Arrow}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                </svg>
              </div>
              <div className={styles.m1BranchField}>
                <label className={styles.m1Label}>Compare branch</label>
                <div className={styles.m1Select}>
                  <span>feature/auth-refactor</span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
                </div>
                <span className={styles.m1FieldHint}>The branch with your changes</span>
              </div>
            </div>
            <div className={styles.m1Divider} />
            <div className={styles.m1TitleField}>
              <label className={styles.m1Label}>Title</label>
              <div className={styles.m1TitleInput}>Refactor auth middleware</div>
            </div>
            <div className={styles.m1Actions}>
              <div className={styles.m1CancelBtn}>Cancel</div>
              <div className={styles.m1CreateBtn}>Create pull request</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


// ─── Mockup 2: Review the diff (PR screen — Files Changed tab) ────────────────

type DiffLineType = 'context' | 'removed' | 'added'

interface DiffLine {
  type: DiffLineType
  content: string
}

const DIFF_LINES: DiffLine[] = [
  { type: 'context', content: "import { Request } from 'express'" },
  { type: 'context', content: '' },
  { type: 'removed', content: 'const token = req.headers.authorization' },
  { type: 'added',   content: 'const token = extractToken(req)' },
  { type: 'context', content: '' },
  { type: 'added',   content: 'function extractToken(req: Request) {' },
  { type: 'added',   content: "  return req.headers.authorization?.split(' ')[1]" },
  { type: 'added',   content: '}' },
]

const SIDEBAR_FILES = [
  { name: 'auth.ts',       active: true  },
  { name: 'middleware.ts', active: false },
  { name: 'utils/',        active: false },
  { name: 'token.ts',      active: false },
  { name: 'types.ts',      active: false },
]

function MockupReview(): JSX.Element {
  return (
    <div className={styles.m2Wrap}>
      <MockNav
        crumbs={['my-repo', 'Refactor auth middleware']}
        rightSlot={
          <div className={`${styles.mockNavBtn} ${styles.mockNavBtnActive}`}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Review
            <span className={styles.mockNavBtnBadge}>2</span>
          </div>
        }
      />
      <MockPrHeader
        title="Refactor auth middleware"
        compareBranch="feature/auth-refactor"
        baseBranch="main"
        status="open"
        meta="opened 2h ago"
      />
      <MockTabBar
        tabs={[
          { key: 'overview', label: 'Overview' },
          { key: 'commits',  label: 'Commits' },
          { key: 'files',    label: 'Files changed', count: 14 },
        ]}
        active="files"
        rightSlot={
          <div className={styles.mockViewToggle}>
            <div className={`${styles.mockToggleBtn} ${styles.mockToggleActive}`}>≡</div>
            <div className={styles.mockToggleBtn}>⊟</div>
          </div>
        }
      />
      <div className={styles.m2Body}>
        <div className={styles.m2Sidebar}>
          <div className={styles.m2SidebarLabel}>src /</div>
          {SIDEBAR_FILES.map((f, i) => (
            <div
              key={f.name}
              className={f.active ? `${styles.m2SidebarFile} ${styles.m2SidebarFileActive}` : styles.m2SidebarFile}
              style={{ animationDelay: `${0.35 + i * 0.06}s` }}
            >
              {f.name}
            </div>
          ))}
        </div>
        <div className={styles.m2Diff}>
          <div className={styles.m2DiffFileHeader}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
            </svg>
            <span className={styles.m2DiffFileName}>auth.ts</span>
          </div>
          {DIFF_LINES.map((line, i) => (
            <div
              key={i}
              className={
                line.type === 'removed'
                  ? `${styles.m2Line} ${styles.m2LineRemoved}`
                  : line.type === 'added'
                    ? `${styles.m2Line} ${styles.m2LineAdded}`
                    : styles.m2Line
              }
              style={{ animationDelay: `${0.35 + i * 0.055}s` }}
            >
              <span className={styles.m2LineGutter}>
                {line.type === 'removed' ? '−' : line.type === 'added' ? '+' : ''}
              </span>
              <code className={styles.m2LineCode}>{line.content || ' '}</code>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}


// ─── Mockup 3: Assign to agent (PR Overview tab after submitting) ─────────────

function MockupSubmit(): JSX.Element {
  return (
    <div className={styles.m5Wrap}>
      <MockNav crumbs={['my-repo', 'Refactor auth middleware']} />
      <MockPrHeader
        title="Refactor auth middleware"
        compareBranch="feature/auth-refactor"
        baseBranch="main"
        status="open"
        meta="opened 2h ago"
      />
      <MockTabBar
        tabs={[
          { key: 'overview', label: 'Overview' },
          { key: 'commits',  label: 'Commits' },
          { key: 'files',    label: 'Files changed', count: 14 },
        ]}
        active="overview"
      />
      <div className={styles.m5Overview}>
        {/* Main: activity */}
        <div className={styles.m5Main}>
          <div className={styles.m5Card}>
            <div className={styles.m5CardHeader}>Activity</div>
            <div className={styles.m5CardBody}>
              <div className={styles.m5ActivityItem}>
                <span className={`${styles.m5ActivityDot} ${styles.m5ActivityDotGreen}`} />
                <span>Review submitted · 3 comments</span>
              </div>
              <div className={styles.m5ActivityItem}>
                <span className={styles.m5ActivityDot} />
                <span>Assigned to Claude Code</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar with assignee */}
        <div className={styles.m5Sidebar}>
          <div className={styles.m5SidebarSection} style={{ animationDelay: '0.35s' }}>
            <div className={styles.m5SidebarLabel}>Status</div>
            <span className={`${styles.mockStatusBadge} ${styles.mockStatusOpen}`}>Open</span>
          </div>
          <div className={styles.m5SidebarSection} style={{ animationDelay: '0.45s' }}>
            <div className={styles.m5SidebarLabel}>Review</div>
            <span className={styles.m3ReviewSubmitted}>Submitted</span>
          </div>
          <div className={styles.m5SidebarSection} style={{ animationDelay: '0.55s' }}>
            <div className={styles.m5SidebarLabel}>Assignees</div>
            <div className={styles.m3AssigneeChip}>
              <ClaudeAvatar size={16} />
              <span>Claude Code</span>
            </div>
          </div>
          <div className={styles.m5SidebarSection} style={{ animationDelay: '0.65s' }}>
            <div className={styles.m5SidebarLabel}>Branches</div>
            <div className={styles.m5BranchStack}>
              <div className={styles.m5BranchRow}>
                <span className={styles.m5BranchLabel}>base</span>
                <code className={styles.m5BranchCode}>main</code>
              </div>
              <div className={styles.m5BranchRow}>
                <span className={styles.m5BranchLabel}>compare</span>
                <code className={styles.m5BranchCode}>feature/auth-refactor</code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


// ─── Mockup 4: Agent resolves ─────────────────────────────────────────────────

interface TermLine {
  delay: number
  prefix: string
  text: string
  variant: 'cmd' | 'info' | 'success'
}

const TERM_LINES: TermLine[] = [
  { delay: 0,    prefix: '$', text: 'claude-code',                                  variant: 'cmd'     },
  { delay: 450,  prefix: '›', text: 'Loaded review: auth-refactor',                 variant: 'info'    },
  { delay: 950,  prefix: '›', text: '3 open comments across 2 files',               variant: 'info'    },
  { delay: 1500, prefix: '›', text: 'Fixing auth.ts:12 — validate token format…',   variant: 'info'    },
  { delay: 2400, prefix: '›', text: 'Committing: "fix: validate token format"',     variant: 'info'    },
  { delay: 3100, prefix: '✓', text: 'auth.ts:12 resolved',                          variant: 'success' },
  { delay: 3600, prefix: '›', text: 'Fixing utils/token.ts:8 — error annotation…',  variant: 'info'    },
  { delay: 4400, prefix: '✓', text: 'utils/token.ts:8 resolved',                    variant: 'success' },
  { delay: 4600, prefix: '›', text: 'Fixing auth.ts:22 — optional chaining…',       variant: 'info'    },
  { delay: 4900, prefix: '✓', text: 'All 3 comments resolved',                      variant: 'success' },
]

interface AgentComment {
  file: string
  line: string
  text: string
  resolvedDelay: number
}

const AGENT_COMMENTS: AgentComment[] = [
  { file: 'auth.ts',         line: '12', text: 'Validate token format before use',   resolvedDelay: 3100 },
  { file: 'utils/token.ts',  line: '8',  text: 'Add error annotation for null case', resolvedDelay: 4400 },
  { file: 'auth.ts',         line: '22', text: 'Use optional chaining here',          resolvedDelay: 4900 },
]

function MockupAgent(): JSX.Element {
  return (
    <div className={styles.m4Wrap}>

      {/* ─── Left: app pane (timeline + comments) ─── */}
      <div className={styles.m4AppPane}>
        <div className={styles.m4AppNav}>
          <span className={styles.m4AppNavCrumb}>my-repo</span>
          <span className={styles.m4AppNavSep}>›</span>
          <span className={styles.m4AppNavActive}>Refactor auth middleware</span>
        </div>
        <div className={styles.m4TlWrap}>

          {/* Entry: Review submitted */}
          <div className={styles.m4TlEntry} style={{ animationDelay: '0.2s' }}>
            <div className={styles.m4TlRail}>
              <div className={`${styles.m4TlDot} ${styles.m4TlDotAccent}`} />
              <div className={styles.m4TlLine} />
            </div>
            <div className={styles.m4TlContent}>
              <div className={styles.m4TlHeader}>
                <span className={styles.m4TlTitle}>Review submitted</span>
                <span className={styles.m4TlMeta}>just now</span>
              </div>
              <div className={styles.m4CommentList}>
                {AGENT_COMMENTS.map((c, i) => (
                  <div
                    key={i}
                    className={styles.m4CommentItem}
                    style={{ animationDelay: `${200 + i * 100}ms` }}
                  >
                    <div className={styles.m4CommentIconWrap}>
                      <span className={styles.m4CommentCircle} style={{ animationDelay: `${c.resolvedDelay}ms` }} />
                      <span className={styles.m4CommentCheck} style={{ animationDelay: `${c.resolvedDelay}ms` }}>✓</span>
                    </div>
                    <div className={styles.m4CommentBody}>
                      <code className={styles.m4CommentFile}>{c.file}:{c.line}</code>
                      <span className={styles.m4CommentText}>{c.text}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Entry: Feedback implemented (appears after all resolved) */}
          <div className={styles.m4TlEntry} style={{ animationDelay: '5100ms' }}>
            <div className={styles.m4TlRail}>
              <div className={`${styles.m4TlDot} ${styles.m4TlDotGreen}`} />
            </div>
            <div className={styles.m4TlContent}>
              <div className={styles.m4TlHeader}>
                <span className={styles.m4TlTitle}>Review feedback implemented</span>
              </div>
              <div className={styles.m4CommitCount}>3 commits created</div>
            </div>
          </div>

        </div>
      </div>

      {/* ─── Right: terminal pane ─── */}
      <div className={styles.m4TermPane}>
        <div className={styles.m4Terminal}>
          <div className={styles.m4TermChrome}>
            <span className={styles.m4ChromeDot} style={{ background: '#ff5f56' }} />
            <span className={styles.m4ChromeDot} style={{ background: '#ffbd2e' }} />
            <span className={styles.m4ChromeDot} style={{ background: '#27c93f' }} />
            <span className={styles.m4TermTitle}>claude-code</span>
          </div>
          <div className={styles.m4TermBody}>
            {TERM_LINES.map((line, i) => (
              <div
                key={i}
                className={
                  line.variant === 'success'
                    ? `${styles.m4Line} ${styles.m4LineSuccess}`
                    : line.variant === 'cmd'
                      ? `${styles.m4Line} ${styles.m4LineCmd}`
                      : styles.m4Line
                }
                style={{ animationDelay: `${line.delay}ms` }}
              >
                <span className={styles.m4LinePrefix}>{line.prefix}</span>
                <span>{line.text}</span>
              </div>
            ))}
            <span className={styles.m4Cursor} style={{ animationDelay: '5400ms' }} />
          </div>
        </div>
      </div>

    </div>
  )
}


// ─── Mockup 5: Open on GitHub (focused actions card) ─────────────────────────

function MockupShip(): JSX.Element {
  return (
    <div className={styles.m5ShipWrap}>
      <div className={styles.m5ShipCard}>
        <div className={styles.m5ShipRow} style={{ animationDelay: '0.15s' }}>
          <span className={styles.m5ShipLabel}>Status</span>
          <span className={`${styles.mockStatusBadge} ${styles.mockStatusOpen}`}>Open</span>
        </div>
        <div className={styles.m5ShipRow} style={{ animationDelay: '0.25s' }}>
          <span className={styles.m5ShipLabel}>Review</span>
          <span className={styles.m5ReviewComplete}>✓ Complete</span>
        </div>
        <div className={styles.m5ShipRow} style={{ animationDelay: '0.35s' }}>
          <span className={styles.m5ShipLabel}>Branches</span>
          <span className={styles.m5ShipBranches}>
            <code className={styles.m5BranchCode}>feature/auth-refactor</code>
            <span className={styles.m5ShipArrow}>→</span>
            <code className={styles.m5BranchCode}>main</code>
          </span>
        </div>
        <div className={styles.m5ShipDivider} style={{ animationDelay: '0.4s' }} />
        <div className={styles.m5ShipActions} style={{ animationDelay: '0.5s' }}>
          <div className={`${styles.m5ActionBtn} ${styles.m5ActionBtnGitHub}`}>
            Open PR with GitHub
          </div>
          <div className={styles.m5ActionBtn}>Close PR</div>
        </div>
      </div>
    </div>
  )
}


// ─── Mockup router ────────────────────────────────────────────────────────────

function renderMockup(stepIndex: number): JSX.Element {
  switch (stepIndex) {
    case 0: return <MockupOpen />
    case 1: return <MockupReview />
    case 2: return <MockupSubmit />
    case 3: return <MockupAgent />
    case 4: return <MockupShip />
    default: return <MockupOpen />
  }
}


// ─── Demo screen ─────────────────────────────────────────────────────────────

export default function Demo(): JSX.Element {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')
  const [animKey, setAnimKey] = useState(0)

  const isLastStep = step === STEPS.length - 1

  function goTo(next: number): void {
    if (next < 0 || next >= STEPS.length) return
    setDirection(next > step ? 'forward' : 'back')
    setAnimKey((k) => k + 1)
    setStep(next)
  }

  useEffect(() => {
    if (isLastStep) return
    const timer = setTimeout(() => {
      setDirection('forward')
      setAnimKey((k) => k + 1)
      setStep((s) => s + 1)
    }, AUTO_ADVANCE_MS)
    return () => clearTimeout(timer)
  }, [step, isLastStep])

  function handleFinish(): void {
    navigate('/')
  }

  const slideClass = direction === 'forward' ? styles.slideForward : styles.slideBack

  return (
    <div className={styles.page}>
      <div className={styles.panel}>

        {/* Window chrome */}
        <div className={styles.chrome}>
          <div className={styles.chromeDots}>
            <span className={`${styles.chromeDot} ${styles.chromeDotRed}`} />
            <span className={`${styles.chromeDot} ${styles.chromeDotYellow}`} />
            <span className={`${styles.chromeDot} ${styles.chromeDotGreen}`} />
          </div>
          <span className={styles.chromeTitle}>Local Review — Quick tour</span>
          <button className={styles.chromeSkip} onClick={handleFinish}>
            Skip tour
          </button>
        </div>

        {/* Mockup area */}
        <div className={styles.mockupArea}>
          <div key={animKey} className={slideClass}>
            {renderMockup(step)}
          </div>
        </div>

        {/* Progress bar */}
        <div className={styles.progressTrack}>
          {!isLastStep && (
            <div
              key={`progress-${step}`}
              className={styles.progressFill}
              style={{ animationDuration: `${AUTO_ADVANCE_MS}ms` }}
            />
          )}
        </div>

        {/* Step text */}
        <div className={styles.stepBody}>
          <div
            key={`text-${animKey}`}
            className={direction === 'forward' ? styles.stepTextForward : styles.stepTextBack}
          >
            <span className={styles.hint}>{STEPS[step].hint}</span>
            <h2 className={styles.headline}>{STEPS[step].headline}</h2>
            <p className={styles.description}>{STEPS[step].description}</p>
          </div>
        </div>

        {/* Navigation */}
        <div className={styles.nav}>
          <div className={styles.dots}>
            {STEPS.map((_, i) => (
              <button
                key={i}
                className={i === step ? `${styles.dot} ${styles.dotActive}` : styles.dot}
                onClick={() => goTo(i)}
                aria-label={`Go to step ${i + 1}`}
              />
            ))}
          </div>
          <div className={styles.navButtons}>
            {step > 0 && (
              <button className={styles.btnPrev} onClick={() => goTo(step - 1)}>
                ← Back
              </button>
            )}
            {isLastStep ? (
              <button className={styles.btnFinish} onClick={handleFinish}>
                Get started →
              </button>
            ) : (
              <button className={styles.btnNext} onClick={() => goTo(step + 1)}>
                Next →
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
