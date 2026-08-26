import https from 'https'
import { app } from 'electron'

export interface UpdateInfo {
  version: string
  url: string
  dmgUrl: string | null
}

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

function fetchJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'local-code-review-app' } }, (res) => {
      let data = ''
      res.on('data', (chunk: Buffer) => {
        data += chunk
      })
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (e) {
          reject(e)
        }
      })
    })
    req.on('error', reject)
    req.setTimeout(10_000, () => {
      req.destroy()
      reject(new Error('timeout'))
    })
  })
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const currentVersion = app.getVersion()
  const current = parseSemver(currentVersion)
  if (!current) return null

  try {
    const release = (await fetchJson(
      'https://api.github.com/repos/nodepoint-solutions/local-code-review/releases/latest'
    )) as {
      tag_name: string
      html_url: string
      assets: { name: string; browser_download_url: string }[]
    }

    const latest = parseSemver(release.tag_name)
    if (!latest || !isNewer(latest, current)) return null

    // Prefer arch-specific DMG, fall back to any DMG
    const arch = process.arch
    const dmgAsset = release.assets.find((a) => a.name.endsWith(`${arch}.dmg`))

    return {
      version: release.tag_name,
      url: release.html_url,
      dmgUrl: dmgAsset?.browser_download_url ?? null,
    }
  } catch {
    return null
  }
}
