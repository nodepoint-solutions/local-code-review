import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { IntegrationStatus } from '../../../shared/types'
import styles from './Setup.module.css'

interface SetupProps {
  onComplete: () => void
}

function toolStatusLabel(i: IntegrationStatus): { text: string; ok: boolean } {
  if (i.installed && i.skillInstalled) return { text: '✓ Configured', ok: true }
  if (i.installed && !i.skillInstalled) return { text: 'MCP installed, skill missing', ok: false }
  if (i.detected) return { text: 'Not installed', ok: false }
  return { text: 'Not detected', ok: false }
}

export default function Setup({ onComplete }: SetupProps): JSX.Element {
  const navigate = useNavigate()
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([])
  const [installing, setInstalling] = useState(false)
  const [scanDir, setScanDir] = useState<string | null>(null)
  const [showFinishWarning, setShowFinishWarning] = useState(false)

  useEffect(() => {
    window.api.getIntegrations().then(setIntegrations)
    window.api.getSetting('scan_base_dir').then(setScanDir)
  }, [])

  const anyDetected = integrations.some((i) => i.detected)
  const anyConfigured = integrations.some((i) => i.installed && i.skillInstalled)

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

  async function handleFinish(): Promise<void> {
    await window.api.setSetting('setup_complete', 'true')
    onComplete()
    if (!anyConfigured) {
      setShowFinishWarning(true)
      setTimeout(() => navigate('/'), 1500)
    } else {
      navigate('/')
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <div className={styles.header}>
          <h1 className={styles.title}>Welcome to Local Review</h1>
          <p className={styles.subtitle}>
            Set up your AI tools to get the most out of Local Review.
          </p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>AI Tools</h2>
          {!anyDetected && (
            <div className={styles.warning}>
              Local Review works best with AI tools installed — you can add them at any time from Settings.
            </div>
          )}
          <table className={styles.toolTable}>
            <tbody>
              {integrations.map((i) => {
                const { text, ok } = toolStatusLabel(i)
                return (
                  <tr key={i.id}>
                    <td className={styles.toolName}>{i.name}</td>
                    <td className={ok ? styles.toolStatusOk : styles.toolStatus}>{text}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className={styles.actions}>
            <button onClick={handleInstall} disabled={installing || !anyDetected}>
              {installing ? 'Installing…' : 'Install'}
            </button>
          </div>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Scan directory</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            Local Review scans this directory to auto-discover git repositories.
          </p>
          <div className={styles.scanRow}>
            <span className={styles.scanPath}>
              {scanDir ?? <em className={styles.scanNone}>Not configured</em>}
            </span>
            <button onClick={handleChangeScanDir}>
              {scanDir ? 'Change' : 'Set directory'}
            </button>
          </div>
        </div>

        <div>
          <div className={styles.actions}>
            <button onClick={handleFinish}>Finish Setup</button>
          </div>
          {showFinishWarning && (
            <p className={styles.finishWarning}>
              No AI tools configured yet — you can install them later from Settings.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
