import { useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { useStore } from './store'
import Home from './screens/Home'
import Repo from './screens/Repo'
import OpenPR from './screens/OpenPR'
import PR from './screens/PR'
import Settings from './screens/Settings'
import './App.css'

function ThemeApplier(): null {
  const { theme } = useStore()
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])
  return null
}

export default function App(): JSX.Element {
  return (
    <HashRouter>
      <ThemeApplier />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/repo/:repoId" element={<Repo />} />
        <Route path="/repo/:repoId/open-pr" element={<OpenPR />} />
        <Route path="/repo/:repoId/pr/:prId" element={<PR />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </HashRouter>
  )
}
