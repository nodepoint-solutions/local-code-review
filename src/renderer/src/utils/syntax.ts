import hljs from 'highlight.js'

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  cs: 'csharp',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  c: 'c',
  h: 'c',
  hpp: 'cpp',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'xml',
  htm: 'xml',
  xml: 'xml',
  svg: 'xml',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'ini',
  md: 'markdown',
  mdx: 'markdown',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'bash',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  swift: 'swift',
  kt: 'kotlin',
  kts: 'kotlin',
  php: 'php',
  r: 'r',
  lua: 'lua',
  ex: 'elixir',
  exs: 'elixir',
  hs: 'haskell',
  scala: 'scala',
  clj: 'clojure',
  tf: 'hcl',
  hcl: 'hcl',
}

export function getLanguageForFile(filePath: string): string | null {
  const basename = filePath.split('/').pop() ?? ''
  const lower = basename.toLowerCase()

  if (lower === 'dockerfile') return 'dockerfile'
  if (lower === 'makefile' || lower === 'gnumakefile') return 'makefile'
  if (lower === '.env' || lower.startsWith('.env.')) return 'bash'
  if (lower === '.gitignore' || lower === '.npmignore') return 'bash'

  const dotIdx = lower.lastIndexOf('.')
  if (dotIdx === -1) return null
  const ext = lower.slice(dotIdx + 1)
  return EXT_TO_LANG[ext] ?? null
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function highlightLine(content: string, language: string | null): string {
  if (!language) return escapeHtml(content)
  try {
    const result = hljs.highlight(content, { language, ignoreIllegals: true })
    return result.value
  } catch {
    return escapeHtml(content)
  }
}
