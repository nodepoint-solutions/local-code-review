import { useEffect, useState } from 'react'
import NavBar from '../components/NavBar'
import styles from './Settings.module.css'
import type { IntegrationStatus } from '../../../shared/types'
import pkg from '../../../../package.json'

function FolderIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}

export default function Settings(): JSX.Element {
  const [scanDir, setScanDir] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [mcpRunning, setMcpRunning] = useState(false)
  const [mcpLoading, setMcpLoading] = useState(false)
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([])
  const [installing, setInstalling] = useState(false)
  const [gitignoreInstalled, setGitignoreInstalled] = useState<boolean | null>(null)
  const [gitignoreInstalling, setGitignoreInstalling] = useState(false)
  const [gitignoreError, setGitignoreError] = useState<string | null>(null)

  useEffect(() => {
    window.api.getSetting('scan_base_dir').then(setScanDir)
    window.api.checkGlobalGitignore().then(({ installed }) => setGitignoreInstalled(installed))
  }, [])

  useEffect(() => {
    window.api.getMcpStatus().then(({ running }) => setMcpRunning(running))
    window.api.getIntegrations().then(setIntegrations)
    const cleanup = window.api.onMcpStatusChanged(({ running }) => setMcpRunning(running))
    return cleanup
  }, [])

  async function handleToggleMcp() {
    setMcpLoading(true)
    const { running } = await window.api.toggleMcp()
    setMcpRunning(running)
    setMcpLoading(false)
  }

  async function handleInstallIntegrations() {
    setInstalling(true)
    await window.api.installIntegrations()
    const updated = await window.api.getIntegrations()
    setIntegrations(updated)
    setInstalling(false)
  }

  async function handleChangeScanDir(): Promise<void> {
    const result = await window.api.openScanDirPicker()
    if (!result) return
    await window.api.setSetting('scan_base_dir', result)
    await window.api.setSetting('onboarding_complete', 'true')
    setScanDir(result)
  }

  async function handleInstallGitignore(): Promise<void> {
    setGitignoreInstalling(true)
    setGitignoreError(null)
    const result = await window.api.installGlobalGitignore()
    if (result.success) {
      setGitignoreInstalled(true)
    } else {
      setGitignoreError(result.error ?? 'Unknown error')
    }
    setGitignoreInstalling(false)
  }

  async function handleReset(): Promise<void> {
    await window.api.resetDb()
    window.location.reload()
  }

  return (
    <div className={styles.page}>
      <NavBar crumbs={[{ label: 'Settings' }]} />
      <div className={styles.content}>
        <h1 className={styles.heading}>Settings</h1>

        <section className={`${styles.section} ${styles.aboutSection}`}>
          <div className={styles.aboutHeader}>
            <span className={styles.aboutName}>{(pkg as { productName?: string }).productName ?? pkg.name}</span>
            <span className={styles.aboutVersion}>v{pkg.version}</span>
          </div>
          <p className={styles.sectionDesc} style={{ marginBottom: 0 }}>
            By{' '}
            <a href="https://nodepoint.co.uk" target="_blank" rel="noreferrer" className={styles.aboutLink}>
              Nodepoint Solutions Limited
            </a>
            {' · '}
            <a href="https://github.com/nodepoint-solutions/local-code-review" target="_blank" rel="noreferrer" className={styles.aboutLink}>
              GitHub
            </a>
          </p>
        </section>

        <section style={{ marginTop: 32 }}>
          <h2>Scan directory</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Local Review scans this directory to auto-discover git repositories.
          </p>
          <div className={styles.row} style={{ marginTop: 12 }}>
            <span className={styles.dirPath}>{scanDir ?? <em className={styles.none}>Not configured</em>}</span>
            <button onClick={handleChangeScanDir}>
              <FolderIcon />
              {scanDir ? 'Change' : 'Set directory'}
            </button>
          </div>
        </section>

        {/* MCP Server */}
        <section style={{ marginTop: 32 }}>
          <h2>MCP Server</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Expose a local MCP server so AI agents (Claude, Copilot) can read reviews and mark issues resolved.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
            <button onClick={handleToggleMcp} disabled={mcpLoading}>
              {mcpRunning ? 'Stop MCP Server' : 'Start MCP Server'}
            </button>
            <span style={{ fontSize: 13, color: mcpRunning ? 'var(--green)' : 'var(--text-muted)' }}>
              {mcpRunning ? 'Running' : 'Stopped'}
            </span>
          </div>
        </section>

        {/* MCP Integrations */}
        <section style={{ marginTop: 32 }}>
          <h2>MCP Integrations</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Install the MCP server config into your AI tools so they can connect automatically.
          </p>
          <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse' }}>
            <tbody>
              {integrations.map((tool) => (
                <tr key={tool.id} style={{ opacity: tool.detected ? 1 : 0.4 }}>
                  <td style={{ padding: '6px 0', width: 160 }}>{tool.name}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)', width: 140 }}>
                    {!tool.detected
                      ? '(not detected)'
                      : tool.installed
                      ? '✓ MCP installed'
                      : 'MCP not installed'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {!tool.detected
                      ? ''
                      : tool.skillInstalled
                      ? '✓ Skill installed'
                      : 'Skill not installed'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            onClick={handleInstallIntegrations}
            disabled={installing}
            style={{ marginTop: 12 }}
          >
            {installing ? 'Installing…' : 'Install / Repair All'}
          </button>
        </section>

        {/* Global .gitignore */}
        <section style={{ marginTop: 32 }}>
          <h2>Global .gitignore</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Adds a <code>.reviews</code> rule to your global gitignore so review files are never accidentally committed in any repository.
          </p>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            {gitignoreInstalled === true ? (
              <span style={{ fontSize: 13, color: 'var(--green)' }}>✓ Installed</span>
            ) : gitignoreInstalled === false ? (
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Not installed</span>
            ) : null}
            <button onClick={handleInstallGitignore} disabled={gitignoreInstalling}>
              {gitignoreInstalling ? 'Installing…' : gitignoreInstalled ? 'Reinstall' : 'Install'}
            </button>
          </div>
          {gitignoreError && (
            <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>{gitignoreError}</p>
          )}
        </section>

        <section className={`${styles.section} ${styles.dangerSection}`} style={{ marginTop: 48 }}>
          <h2 className={`${styles.sectionTitle} ${styles.dangerTitle}`}>Danger zone</h2>
          <div className={styles.dangerRow}>
            <div>
              <p className={styles.dangerLabel}>Reset to factory settings</p>
              <p className={styles.dangerDesc}>
                Clears all app settings and removes repositories from the app. Runs you through setup and the tour again. Your <code>.reviews</code> files on disk are never touched.
              </p>
            </div>
            {!confirmReset ? (
              <button className={styles.dangerBtn} onClick={() => setConfirmReset(true)}>
                Reset
              </button>
            ) : (
              <div className={styles.confirmRow}>
                <span className={styles.confirmPrompt}>Are you sure?</span>
                <button className={styles.dangerBtnConfirm} onClick={handleReset}>
                  Yes, reset everything
                </button>
                <button onClick={() => setConfirmReset(false)}>Cancel</button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
