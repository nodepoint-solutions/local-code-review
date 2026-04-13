import { useEffect, useState } from 'react'
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

interface UpdateInfo { version: string; url: string }

function UpdateBanner({ info, onDismiss }: { info: UpdateInfo; onDismiss: () => void }): JSX.Element {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      padding: '8px 16px',
      background: 'var(--accent)',
      color: 'var(--accent-fg, #fff)',
      fontSize: 13,
      flexShrink: 0,
    }}>
      <span>
        A new version is available: <strong>{info.version}</strong>
      </span>
      <a
        href={info.url}
        style={{ color: 'inherit', fontWeight: 600, textDecoration: 'underline' }}
        onClick={(e) => { e.preventDefault(); window.open(info.url) }}
      >
        Download
      </a>
      <button
        onClick={onDismiss}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'inherit',
          cursor: 'pointer',
          padding: '0 4px',
          fontSize: 16,
          lineHeight: 1,
          opacity: 0.7,
        }}
        title="Dismiss"
      >
        ×
      </button>
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
