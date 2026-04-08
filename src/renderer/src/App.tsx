import { HashRouter, Routes, Route } from 'react-router-dom'
import Home from './screens/Home'
import Repo from './screens/Repo'
import OpenPR from './screens/OpenPR'
import PR from './screens/PR'
import './app.css'

export default function App(): JSX.Element {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/repo/:repoId" element={<Repo />} />
        <Route path="/repo/:repoId/open-pr" element={<OpenPR />} />
        <Route path="/repo/:repoId/pr/:prId" element={<PR />} />
      </Routes>
    </HashRouter>
  )
}
