import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import styles from './NavBar.module.css'

interface Crumb {
  label: string
  to?: string
}

interface Props {
  crumbs?: Crumb[]
  right?: React.ReactNode
}

function SunIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
}

function MoonIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function GitBranchIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  )
}

export default function NavBar({ crumbs = [], right }: Props): JSX.Element {
  const { theme, setTheme } = useStore()
  const navigate = useNavigate()

  return (
    <nav className={styles.nav}>
      <div className={styles.left}>
        <button className={styles.logoBtn} onClick={() => navigate('/')}>
          <GitBranchIcon />
          <span className={styles.logoText}>Local Review</span>
        </button>

        {crumbs.length > 0 && (
          <>
            <span className={styles.sep}>/</span>
            {crumbs.map((crumb, i) => (
              <span key={i} className={styles.crumbGroup}>
                {crumb.to ? (
                  <button className={styles.crumbLink} onClick={() => navigate(crumb.to!)}>
                    {crumb.label}
                  </button>
                ) : (
                  <span className={styles.crumbCurrent}>{crumb.label}</span>
                )}
                {i < crumbs.length - 1 && <span className={styles.sep}>/</span>}
              </span>
            ))}
          </>
        )}
      </div>

      <div className={styles.right}>
        {right}
        <button
          className={styles.themeBtn}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>
    </nav>
  )
}
