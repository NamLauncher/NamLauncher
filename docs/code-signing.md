# Open-source code-signing preparation

<!-- Author/creator: nattapat2871 (https://nattapat2871.me) -->

NamLauncher is preparing to request free Windows code signing through the
[SignPath Foundation](https://signpath.org/). No private key or certificate is
stored in this repository, on a maintainer computer, or in a release archive.

## Current boundary

- The signing workflow is manual-only and checks out an existing stable tag.
- It builds and tests the source attached to that exact tag.
- It stops unless the operator enters the exact approval phrase
  `SIGNPATH_APPROVED`.
- It submits only after the protected `signpath-production` environment
  approves the job.
- Signed output is retained as a short-lived GitHub Actions artifact for one
  day. The workflow never creates, edits, or uploads to a GitHub Release.
- Version `1.2.4` may remain unsigned if the Foundation application is not
  approved before qualification completes. SHA-256 verification and Microsoft
  Defender submission remain independent controls, not substitutes for a
  publisher signature.

## Open-source eligibility boundary

The launcher and its bundled Minecraft companion components are public under
GPL-3.0-only:

- Launcher: `NamLauncher/NamLauncher`
- Companion sources and build tooling: `NamLauncher/minecraft-companions`

The companion repository includes the Fabric, Forge, and NeoForge source,
compatibility tests, build definitions, immutable legacy artifacts, and the
verified bundle exporter. Its full Git history and current worktree were
secret-scanned before publication, and its public CI build passed before the
repository visibility changed.

Hosted backend, Discord bot, administrative, and operational services remain
private because their source is not embedded in the signed installer. Their
network and privacy behavior must still be documented accurately in the
application. If SignPath requests a reproducible rebuild of a retained legacy
JAR rather than its pinned source, hash, and GPL declaration, satisfy that
request before submitting an artifact for signing.

## Free preparation on other platforms

- macOS: the manual workflow builds an unsigned universal DMG, generates
  SHA-256 metadata, and smoke-tests it on Apple Silicon and Intel runners. This
  is integrity and compatibility evidence only. Gatekeeper-trusted public
  distribution still requires an Apple Developer ID and notarization.
- Linux: local packaging builds AppImage, DEB, RPM, Flatpak, and pacman outputs,
  then stages per-file SHA-256 checksums, a platform manifest, and AUR metadata.
  A dedicated Linux CI job and a project-identity signature or keyless
  provenance attestation are still required before public Linux artifacts are
  described as signed.

## SignPath Foundation application

1. Keep the launcher source public under GPL-3.0-only with a public build,
   contribution guide, security policy, issue tracker, and maintained release
   history.
2. Apply at the SignPath Foundation website using the
   `NamLauncher/NamLauncher` repository and identify
   `nattapat2871 (https://nattapat2871.me)` as the project author and
   maintainer.
3. Ask SignPath to sign the Windows installer artifact produced only by the
   public GitHub Actions build. Backend, Discord bot, operational repositories,
   access tokens, and user data are outside the signing project.
4. Record the approved artifact configuration and signing policy in SignPath.
   Do not broaden it to arbitrary files or workflow runs.

## GitHub environment configuration

Create a protected environment named `signpath-production`, require a
maintainer review, and restrict deployment branches and tags to approved stable
release tags. Add these environment secrets only after SignPath provides them:

- `SIGNPATH_API_TOKEN`
- `SIGNPATH_ORGANIZATION_ID`
- `SIGNPATH_PROJECT_SLUG`
- `SIGNPATH_SIGNING_POLICY_SLUG`
- `NAMLAUNCHER_ERROR_REPORT_TOKEN`

The repository workflow pins
`SignPath/github-action-submit-signing-request` to the exact v2.3 commit and
uses the official GitHub Actions connector. Rotate the API token immediately if
it is ever printed, copied into source, or exposed outside the protected
environment.

## Qualification before publication

For every signed candidate:

1. Confirm the source tag resolves to the reviewed release commit.
2. Confirm CI, unit tests, companion integrity checks, and packaging gates pass.
3. Verify `Get-AuthenticodeSignature` reports `Valid` and inspect the expected
   publisher before distribution.
4. Record SHA-256 for the signed bytes. A signature changes the file hash, so
   never reuse the unsigned checksum.
5. Test clean Current User installation, repair/reinstall, update from the
   previous stable release, rollback on failed health confirmation, and
   uninstall in a disposable Windows VM.
6. Publish only after a separate explicit release decision. Signing approval
   by itself is not publication approval.

The Current User application-bundle updater remains integrity-protected by its
manifest, SHA-256 digest, correlated process health check, and rollback. Signing
the executable inside that bundle requires a separate two-stage packaging
configuration because changing an executable invalidates the bundle manifest;
that expansion is planned for `1.2.5` after the first SignPath policy is
approved.
