import { useEffect, useRef, useState } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useStore } from './store'
import Home from './screens/Home'
import Repo from './screens/Repo'
import OpenPR from './screens/OpenPR'
import PR from './screens/PR'
import Settings from './screens/Settings'
import Setup from './screens/Setup'
import Demo from './screens/Demo'
import './App.css'

interface UpdateInfo { version: string; url: string; dmgUrl: string | null }

const bannerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
  padding: '8px 16px',
  background: 'var(--accent)',
  color: 'var(--accent-fg, #fff)',
  fontSize: 13,
  flexShrink: 0,
}

const linkStyle: React.CSSProperties = { color: 'inherit', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer' }

const dismissBtnStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', color: 'inherit',
  cursor: 'pointer', padding: '0 4px', fontSize: 16, lineHeight: 1, opacity: 0.7,
}

const installBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)',
  borderRadius: 4, color: 'inherit', cursor: 'pointer', fontSize: 12,
  fontWeight: 600, padding: '3px 10px',
}

function UpdateBanner({ info, onDismiss }: { info: UpdateInfo; onDismiss: () => void }): JSX.Element {
  const [installing, setInstalling] = useState(false)
  const [progress, setProgress] = useState<{ stage: string; pct: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const unsubRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!installing) return
    unsubRef.current = window.api.onUpdateProgress((data) => setProgress(data))
    return () => { unsubRef.current?.(); unsubRef.current = null }
  }, [installing])

  async function handleInstall(): Promise<void> {
    if (!info.dmgUrl) return
    setInstalling(true)
    setError(null)
    const result = await window.api.installUpdate(info.dmgUrl)
    if ('error' in result) {
      unsubRef.current?.()
      setInstalling(false)
      setError(result.error)
    }
    // On success the app quits — nothing more to do
  }

  function openUrl(): void { window.open(info.url) }

  if (installing) {
    return (
      <div style={bannerStyle}>
        <span>{progress?.stage ?? 'Installing…'}{progress ? ` ${progress.pct}%` : ''}</span>
      </div>
    )
  }

  if (error) {
    return (
      <div style={bannerStyle}>
        <span>Update failed — <span style={linkStyle} onClick={openUrl}>download manually</span></span>
        <button onClick={onDismiss} style={dismissBtnStyle} title="Dismiss">×</button>
      </div>
    )
  }

  return (
    <div style={bannerStyle}>
      <span>Version <strong>{info.version}</strong> is available</span>
      {info.dmgUrl && window.api.platform === 'darwin' && (
        <button onClick={handleInstall} style={installBtnStyle}>Install &amp; Relaunch</button>
      )}
      <span style={linkStyle} onClick={openUrl}>Download manually</span>
      <button onClick={onDismiss} style={dismissBtnStyle} title="Dismiss">×</button>
    </div>
  )
}

function ThemeApplier(): null {
  const { theme } = useStore()
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])
  return null
}

export default function App(): JSX.Element {
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null)
  const [update, setUpdate] = useState<UpdateInfo | null>(null)

  useEffect(() => {
    window.api.getSetting('setup_complete')
      .then((val) => setSetupComplete(val === 'true'))
      .catch(() => setSetupComplete(false))
  }, [])

  useEffect(() => {
    window.api.checkUpdate()
      .then((info) => { if (info) setUpdate(info) })
      .catch(() => {})
  }, [])

  if (setupComplete === null) return <></>

  return (
    <HashRouter>
      <ThemeApplier />
      {update && <UpdateBanner info={update} onDismiss={() => setUpdate(null)} />}
      <Routes>
        <Route path="/setup" element={<Setup onComplete={() => setSetupComplete(true)} />} />
        {!setupComplete ? (
          <Route path="*" element={<Navigate to="/setup" replace />} />
        ) : (
          <>
            <Route path="/demo" element={<Demo />} />
            <Route path="/" element={<Home />} />
            <Route path="/repo/:repoId" element={<Repo />} />
            <Route path="/repo/:repoId/open-pr" element={<OpenPR />} />
            <Route path="/repo/:repoId/pr/:prId" element={<PR />} />
            <Route path="/settings" element={<Settings />} />
          </>
        )}
      </Routes>
    </HashRouter>
  )
}
