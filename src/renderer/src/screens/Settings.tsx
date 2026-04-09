import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import NavBar from '../components/NavBar'
import styles from './Settings.module.css'

function FolderIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}

export default function Settings(): JSX.Element {
  const navigate = useNavigate()
  const { setRepos, setScanResults } = useStore()

  const [scanDir, setScanDir] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  useEffect(() => {
    window.api.getSetting('scan_base_dir').then(setScanDir)
  }, [])

  async function handleChangeScanDir(): Promise<void> {
    const result = await window.api.openScanDirPicker()
    if (!result) return
    await window.api.setSetting('scan_base_dir', result)
    await window.api.setSetting('onboarding_complete', 'true')
    setScanDir(result)
  }

  async function handleReset(): Promise<void> {
    await window.api.resetDb()
    setRepos([])
    setScanResults([])
    navigate('/')
  }

  return (
    <div className={styles.page}>
      <NavBar crumbs={[{ label: 'Settings' }]} />
      <div className={styles.content}>
        <h1 className={styles.heading}>Settings</h1>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Scan directory</h2>
          <p className={styles.sectionDesc}>
            Local Review scans this directory to auto-discover git repositories.
          </p>
          <div className={styles.row}>
            <span className={styles.dirPath}>{scanDir ?? <em className={styles.none}>Not configured</em>}</span>
            <button onClick={handleChangeScanDir}>
              <FolderIcon />
              {scanDir ? 'Change' : 'Set directory'}
            </button>
          </div>
        </section>

        <section className={`${styles.section} ${styles.dangerSection}`}>
          <h2 className={`${styles.sectionTitle} ${styles.dangerTitle}`}>Danger zone</h2>
          <div className={styles.dangerRow}>
            <div>
              <p className={styles.dangerLabel}>Reset to factory settings</p>
              <p className={styles.dangerDesc}>
                Deletes all repositories, pull requests, reviews, comments, and settings. This cannot be undone.
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
