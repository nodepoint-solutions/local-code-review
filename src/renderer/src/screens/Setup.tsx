import { Fragment, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { IntegrationStatus } from '../../../shared/types'
import styles from './Setup.module.css'

interface SetupProps {
  onComplete: () => void
}

function toolStatusLabel(i: IntegrationStatus): { text: string; ok: boolean } {
  if (i.installed && i.skillInstalled) return { text: 'Configured', ok: true }
  if (i.installed && !i.skillInstalled) return { text: 'MCP installed, skill missing', ok: false }
  if (i.detected) return { text: 'Not installed', ok: false }
  return { text: 'Not detected', ok: false }
}

const STEPS = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'tools', label: 'AI Tools' },
  { id: 'directory', label: 'Directory' },
  { id: 'gitignore', label: 'Gitignore' },
]

export default function Setup({ onComplete }: SetupProps): JSX.Element {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')
  const [animKey, setAnimKey] = useState(0)

  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([])
  const [installing, setInstalling] = useState(false)
  const [scanDir, setScanDir] = useState<string | null>(null)
  const [gitignoreStatus, setGitignoreStatus] = useState<'pending' | 'installed' | 'skipped'>('pending')
  const [gitignoreInstalling, setGitignoreInstalling] = useState(false)
  const [gitignoreError, setGitignoreError] = useState<string | null>(null)

  useEffect(() => {
    window.api.getIntegrations().then(setIntegrations)
    window.api.getSetting('scan_base_dir').then(setScanDir)
    window.api.checkGlobalGitignore().then(({ installed }) => {
      if (installed) setGitignoreStatus('installed')
    })
  }, [])

  const anyDetected = integrations.some((i) => i.detected)

  function goTo(nextStep: number): void {
    setDirection(nextStep > step ? 'forward' : 'back')
    setAnimKey((k) => k + 1)
    setStep(nextStep)
  }

  async function handleInstall(): Promise<void> {
    setInstalling(true)
    try {
      await window.api.installIntegrations()
      const updated = await window.api.getIntegrations()
      setIntegrations(updated)
    } finally {
      setInstalling(false)
    }
  }

  async function handleChangeScanDir(): Promise<void> {
    const result = await window.api.openScanDirPicker()
    if (!result) return
    await window.api.setSetting('scan_base_dir', result)
    setScanDir(result)
  }

  async function handleInstallGitignore(): Promise<void> {
    setGitignoreInstalling(true)
    setGitignoreError(null)
    try {
      const result = await window.api.installGlobalGitignore()
      if (result.success) {
        setGitignoreStatus('installed')
      } else {
        setGitignoreError(result.error ?? 'Unknown error')
      }
    } finally {
      setGitignoreInstalling(false)
    }
  }

  async function handleFinish(): Promise<void> {
    await window.api.setSetting('setup_complete', 'true')
    onComplete()
    navigate('/')
  }

  return (
    <div className={styles.page}>
      <div className={styles.backdrop} />

      <div className={styles.container}>
        {step > 0 && (
          <div className={styles.stepIndicator}>
            {STEPS.slice(1).map((s, idx) => (
              <Fragment key={s.id}>
                <div className={styles.stepItem}>
                  <div
                    className={[
                      styles.stepDot,
                      step - 1 === idx ? styles.stepDotActive : '',
                      step - 1 > idx ? styles.stepDotDone : '',
                    ].join(' ')}
                  >
                    {step - 1 > idx ? (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path
                          d="M1.5 5L4 7.5L8.5 2.5"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <span>{idx + 1}</span>
                    )}
                  </div>
                  <span
                    className={[
                      styles.stepLabel,
                      step - 1 === idx ? styles.stepLabelActive : '',
                    ].join(' ')}
                  >
                    {s.label}
                  </span>
                </div>
                {idx < STEPS.length - 2 && (
                  <div
                    className={[
                      styles.stepLine,
                      step - 1 > idx ? styles.stepLineDone : '',
                    ].join(' ')}
                  />
                )}
              </Fragment>
            ))}
          </div>
        )}

        <div
          key={animKey}
          className={[
            styles.stepContent,
            direction === 'forward' ? styles.slideInRight : styles.slideInLeft,
          ].join(' ')}
        >
          {step === 0 && (
            <div className={styles.welcomeStep}>
              <div className={styles.logoMark}>
                <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
                  <rect width="52" height="52" rx="14" fill="var(--accent)" fillOpacity="0.12" />
                  <rect width="52" height="52" rx="14" stroke="var(--accent)" strokeOpacity="0.3" strokeWidth="1" />
                  <path d="M14 18h24M14 26h18M14 34h12" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
                  <circle cx="38" cy="34" r="7" fill="var(--accent)" fillOpacity="0.15" stroke="var(--accent)" strokeWidth="1.5" />
                  <path
                    d="M35 34l2 2 4-4"
                    stroke="var(--accent)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              <div className={styles.welcomeText}>
                <h1 className={styles.welcomeTitle}>Local Review</h1>
                <p className={styles.welcomeSubtitle}>
                  AI-powered code review, running entirely on your machine. Let&apos;s get you
                  set up in a few quick steps.
                </p>
              </div>

              <div className={styles.featureList}>
                {[
                  { icon: '⚡', text: 'Works with Claude Code, Cursor, and more' },
                  { icon: '🔒', text: 'All data stays on your machine' },
                  { icon: '🔍', text: 'Auto-discovers your git repositories' },
                ].map(({ icon, text }) => (
                  <div key={text} className={styles.feature}>
                    <span className={styles.featureIcon}>{icon}</span>
                    <span>{text}</span>
                  </div>
                ))}
              </div>

              <button
                className={[styles.btn, styles.btnPrimary, styles.btnLarge].join(' ')}
                onClick={() => goTo(1)}
              >
                Get Started
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M3 8h10M9 4l4 4-4 4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          )}

          {step === 1 && (
            <div className={styles.formStep}>
              <div className={styles.stepHeader}>
                <h2 className={styles.stepTitle}>AI Tools</h2>
                <p className={styles.stepDesc}>
                  Local Review connects to AI coding tools you already have installed.
                </p>
              </div>

              {!anyDetected && (
                <div className={styles.notice}>
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                    <circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.2" />
                    <path
                      d="M7.5 4.5v4M7.5 10v.5"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                  </svg>
                  No AI tools detected — you can configure them later from Settings.
                </div>
              )}

              <div className={styles.toolList}>
                {integrations.map((i, idx) => {
                  const { text, ok } = toolStatusLabel(i)
                  return (
                    <div
                      key={i.id}
                      className={styles.toolRow}
                      style={{ animationDelay: `${idx * 55}ms` }}
                    >
                      <div className={styles.toolInfo}>
                        <span className={styles.toolName}>{i.name}</span>
                        <span className={ok ? styles.statusOk : styles.statusNeutral}>{text}</span>
                      </div>
                      <div
                        className={[
                          styles.toolIndicator,
                          ok
                            ? styles.toolIndicatorOk
                            : i.detected
                              ? styles.toolIndicatorPending
                              : styles.toolIndicatorOff,
                        ].join(' ')}
                      />
                    </div>
                  )
                })}
              </div>

              <div className={styles.stepActions}>
                <button
                  className={[styles.btn, styles.btnSecondary].join(' ')}
                  onClick={handleInstall}
                  disabled={installing || !anyDetected}
                >
                  {installing ? (
                    <>
                      <span className={styles.spinner} />
                      Installing…
                    </>
                  ) : (
                    'Install integrations'
                  )}
                </button>
                <button
                  className={[styles.btn, styles.btnPrimary].join(' ')}
                  onClick={() => goTo(2)}
                >
                  Continue
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M2.5 7h9M8 3.5L11.5 7 8 10.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className={styles.formStep}>
              <div className={styles.stepHeader}>
                <h2 className={styles.stepTitle}>Scan Directory</h2>
                <p className={styles.stepDesc}>
                  Choose a base directory for Local Review to scan and auto-discover git
                  repositories.
                </p>
              </div>

              <div className={styles.dirPicker}>
                <div className={styles.dirPath}>
                  {scanDir ? (
                    <>
                      <span className={styles.dirIcon}>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path
                            d="M1.5 4.5C1.5 3.95 1.95 3.5 2.5 3.5H5.5L7 5H11.5C12.05 5 12.5 5.45 12.5 6V10.5C12.5 11.05 12.05 11.5 11.5 11.5H2.5C1.95 11.5 1.5 11.05 1.5 10.5V4.5Z"
                            stroke="var(--accent)"
                            strokeWidth="1.2"
                            fill="var(--accent)"
                            fillOpacity="0.1"
                          />
                        </svg>
                      </span>
                      <span className={styles.dirText}>{scanDir}</span>
                    </>
                  ) : (
                    <span className={styles.dirPlaceholder}>No directory selected</span>
                  )}
                </div>
                <button
                  className={[styles.btn, styles.btnSecondary].join(' ')}
                  onClick={handleChangeScanDir}
                >
                  {scanDir ? 'Change' : 'Browse…'}
                </button>
              </div>

              <div className={styles.stepActions}>
                <button
                  className={[styles.btn, styles.btnGhost].join(' ')}
                  onClick={() => goTo(1)}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M11.5 7h-9M6 3.5L2.5 7 6 10.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Back
                </button>
                <button
                  className={[styles.btn, styles.btnPrimary].join(' ')}
                  onClick={() => goTo(3)}
                >
                  Continue
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M2.5 7h9M8 3.5L11.5 7 8 10.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className={styles.formStep}>
              <div className={styles.stepHeader}>
                <h2 className={styles.stepTitle}>Global .gitignore</h2>
                <p className={styles.stepDesc}>
                  Local Review stores data in{' '}
                  <code className={styles.code}>.reviews</code> folders inside each repo. A
                  global gitignore rule prevents these from being accidentally committed across
                  all your projects.
                </p>
              </div>

              {gitignoreStatus === 'installed' && (
                <div className={styles.successState}>
                  <div className={styles.successIcon}>
                    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                      <circle
                        cx="11"
                        cy="11"
                        r="9.5"
                        fill="var(--added-text)"
                        fillOpacity="0.12"
                        stroke="var(--added-text)"
                        strokeWidth="1.2"
                      />
                      <path
                        d="M7 11l2.5 2.5 5.5-5.5"
                        stroke="var(--added-text)"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  Global .gitignore rule installed
                </div>
              )}

              {gitignoreStatus === 'skipped' && (
                <div className={styles.skippedState}>
                  Skipped — add <code className={styles.code}>.reviews</code> to each
                  repository&apos;s .gitignore manually.
                </div>
              )}

              {gitignoreStatus === 'pending' && (
                <div className={styles.gitignoreActions}>
                  <button
                    className={[styles.btn, styles.btnSecondary].join(' ')}
                    onClick={handleInstallGitignore}
                    disabled={gitignoreInstalling}
                  >
                    {gitignoreInstalling ? (
                      <>
                        <span className={styles.spinner} />
                        Installing…
                      </>
                    ) : (
                      'Install global rule'
                    )}
                  </button>
                  <button
                    className={[styles.btn, styles.btnGhost].join(' ')}
                    onClick={() => setGitignoreStatus('skipped')}
                  >
                    Skip for now
                  </button>
                  {gitignoreError && <p className={styles.errorText}>{gitignoreError}</p>}
                </div>
              )}

              <div className={styles.stepActions}>
                <button
                  className={[styles.btn, styles.btnGhost].join(' ')}
                  onClick={() => goTo(2)}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M11.5 7h-9M6 3.5L2.5 7 6 10.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Back
                </button>
                <button
                  className={[styles.btn, styles.btnPrimary].join(' ')}
                  onClick={handleFinish}
                  disabled={gitignoreStatus === 'pending'}
                >
                  Finish setup
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M2.5 7h9M8 3.5L11.5 7 8 10.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
