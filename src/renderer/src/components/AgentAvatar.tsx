interface AvatarProps {
  size?: number
}

export function ClaudeAvatar({ size = 20 }: AvatarProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="Claude Code">
      <circle cx="12" cy="12" r="12" fill="#D97B3B" />
      {/* Anthropic-inspired "A" mark */}
      <path d="M12 5L5 19H8.2L12 10.5L15.8 19H19L12 5Z" fill="white" opacity="0.95" />
      <rect x="8.5" y="14.5" width="7" height="1.6" rx="0.8" fill="white" opacity="0.95" />
    </svg>
  )
}

export function CopilotAvatar({ size = 20 }: AvatarProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="GitHub Copilot">
      <circle cx="12" cy="12" r="12" fill="#6B44C2" />
      {/* Head */}
      <circle cx="12" cy="11.5" r="4" fill="white" opacity="0.92" />
      {/* Eyes */}
      <circle cx="10.3" cy="11" r="0.95" fill="#6B44C2" />
      <circle cx="13.7" cy="11" r="0.95" fill="#6B44C2" />
      {/* Headphone arc */}
      <path d="M8 11C8 8.2 9.8 6.5 12 6.5C14.2 6.5 16 8.2 16 11" stroke="white" strokeWidth="1.3" strokeLinecap="round" fill="none" opacity="0.88" />
      {/* Ear cups */}
      <rect x="5.8" y="10.5" width="2.6" height="2.2" rx="1.1" fill="white" opacity="0.88" />
      <rect x="15.6" y="10.5" width="2.6" height="2.2" rx="1.1" fill="white" opacity="0.88" />
    </svg>
  )
}

export function GenericAgentAvatar({ name, size = 20 }: { name: string; size?: number }): JSX.Element {
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label={name}>
      <circle cx="12" cy="12" r="12" fill="#4A5568" />
      <text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="600" fill="white" fontFamily="system-ui, sans-serif">{initials}</text>
    </svg>
  )
}

export function AgentAvatar({ resolvedBy, size = 20 }: { resolvedBy: string; size?: number }): JSX.Element {
  const lower = resolvedBy.toLowerCase()
  if (lower.includes('claude')) return <ClaudeAvatar size={size} />
  if (lower.includes('copilot') || lower.includes('vscode') || lower.includes('cursor') || lower.includes('windsurf')) return <CopilotAvatar size={size} />
  return <GenericAgentAvatar name={resolvedBy} size={size} />
}

export function AgentIcon({ assignee, size = 16 }: { assignee: 'claude' | 'vscode'; size?: number }): JSX.Element {
  return assignee === 'claude' ? <ClaudeAvatar size={size} /> : <CopilotAvatar size={size} />
}
