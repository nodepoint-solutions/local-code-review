import https from 'https'
import { app } from 'electron'

function parseSemver(tag: string): [number, number, number] | null {
  const match = tag.match(/^v?(\d+)\.(\d+)\.(\d+)$/)
  if (!match) return null
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)]
}

function isNewer(candidate: [number, number, number], current: [number, number, number]): boolean {
  for (let i = 0; i < 3; i++) {
    if (candidate[i] > current[i]) return true
    if (candidate[i] < current[i]) return false
  }
  return false
}

export async function checkForUpdate(): Promise<{ version: string; url: string } | null> {
  const currentVersion = app.getVersion()
  const current = parseSemver(currentVersion)
  if (!current) return null

  return new Promise((resolve) => {
    const req = https.get(
      'https://api.github.com/repos/nodepoint-solutions/local-code-review/tags',
      { headers: { 'User-Agent': 'local-code-review-app' } },
      (res) => {
        let data = ''
        res.on('data', (chunk: Buffer) => { data += chunk })
        res.on('end', () => {
          try {
            const tags: { name: string }[] = JSON.parse(data)
            let latestVersion: [number, number, number] | null = null
            let latestTag = ''

            for (const { name } of tags) {
              const parsed = parseSemver(name)
              if (!parsed) continue
              if (!latestVersion || isNewer(parsed, latestVersion)) {
                latestVersion = parsed
                latestTag = name
              }
            }

            if (latestVersion && isNewer(latestVersion, current)) {
              resolve({
                version: latestTag,
                url: `https://github.com/nodepoint-solutions/local-code-review/releases/tag/${latestTag}`,
              })
            } else {
              resolve(null)
            }
          } catch {
            resolve(null)
          }
        })
      }
    )
    req.on('error', () => resolve(null))
    req.setTimeout(10_000, () => { req.destroy(); resolve(null) })
  })
}
