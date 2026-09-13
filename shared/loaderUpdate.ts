// Author/creator: nattapat2871 (https://nattapat2871.me)

export type LoaderUpdateVersion = {
  id: string
  type?: string
}

export type LoaderUpdateCandidate = {
  currentVersion: string
  latestVersion: string
  releaseType: string
}

type LoaderUpdateRequest = {
  loader: string
  minecraftVersion: string
  currentVersion: string
  versions: readonly LoaderUpdateVersion[]
}

const versionComparer = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base'
})

const normalizeVersion = (value: string) => String(value || '')
  .trim()
  .replace(/^(?:fabric-loader-|quilt-loader-|neoforge-)/i, '')

export const normalizeLoaderVersion = (
  loader: string,
  minecraftVersion: string,
  value: string
) => {
  const normalized = normalizeVersion(value)
  if (loader.trim().toLowerCase() !== 'forge') return normalized
  const prefix = `${minecraftVersion.trim()}-`
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized
}

export const compareLoaderVersions = (left: string, right: string) => (
  versionComparer.compare(normalizeVersion(left), normalizeVersion(right))
)

const selectNewest = (versions: readonly LoaderUpdateVersion[]) => [...versions]
  .sort((left, right) => compareLoaderVersions(right.id, left.id))[0]

export const getLoaderUpdateCandidate = ({
  loader,
  minecraftVersion,
  currentVersion,
  versions
}: LoaderUpdateRequest): LoaderUpdateCandidate | null => {
  const normalizedLoader = loader.trim().toLowerCase()
  if (!normalizedLoader || normalizedLoader === 'vanilla' || !currentVersion.trim()) return null

  const usableVersions = versions
    .map((version) => ({
      id: normalizeLoaderVersion(normalizedLoader, minecraftVersion, version.id),
      type: String(version.type || '').trim().toLowerCase() || 'unknown'
    }))
    .filter((version) => version.id)
    .filter((version, index, items) => items.findIndex((candidate) => candidate.id === version.id) === index)

  if (usableVersions.length === 0) return null

  const preference = normalizedLoader === 'forge'
    ? ['latest', 'stable', 'recommended', 'unknown', 'unstable']
    : ['stable', 'recommended', 'latest', 'unknown', 'unstable']
  const selected = preference
    .map((type) => selectNewest(usableVersions.filter((version) => version.type === type)))
    .find(Boolean) || selectNewest(usableVersions)
  const current = normalizeLoaderVersion(normalizedLoader, minecraftVersion, currentVersion)

  if (!selected || compareLoaderVersions(selected.id, current) <= 0) return null

  return {
    currentVersion: current,
    latestVersion: selected.id,
    releaseType: selected.type || 'unknown'
  }
}
