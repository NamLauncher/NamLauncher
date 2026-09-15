# NamLauncher

NamLauncher is an open-source Minecraft launcher for Windows, Linux, and macOS.
This repository contains the Electron desktop launcher, packaging files,
automated tests, and integrity-checked prebuilt Minecraft companion artifacts.

The public history starts from the cleaned `1.2.3` source baseline. Website,
API, Discord bot, authentication services, error-report processing, deployment
configuration, private keys, and operational data are intentionally maintained
outside this repository.

## Release policy

- Stable users move directly from `1.2.3` to `1.2.4`, then to `1.2.5`.
- Beta builds are for local testing and are not published as user downloads.
- Download installers only from the official NamLauncher website or a verified
  organization release.

## Build and test

Requirements: Node.js 22 or newer, npm, and the platform tools required by
Electron Builder.

```text
npm ci
npm run build
npm test
```

`npm run prepare:game-bridge` verifies the bundled companion manifest, sizes,
SHA-256 hashes, mod identities, and protected icon resources. It never compiles
the companion source in this repository; those sources and their build tooling
are maintained in the separate public
[`NamLauncher/minecraft-companions`](https://github.com/NamLauncher/minecraft-companions)
repository.

## Verified CI releases

The `Build and publish stable desktop release` workflow builds Windows x64,
Linux x64, and a macOS universal package from one immutable commit. A dry run
only uploads short-lived GitHub Actions artifacts. Stable publication additionally
requires an exact `vX.Y.Z` tag, SignPath approval for the Windows installer,
successful SHA-256 and provenance checks, and approval through the protected
`stable-production` GitHub environment. Windows signing is an explicit release
input: version `1.2.4` is published unsigned, while SignPath signing is reserved
for `1.2.5` and later after the Foundation project is approved.

Normal pushes and pull requests never publish downloads. Beta, alpha, and RC
versions are rejected by the stable release workflow. Production download
deployment is performed from the private Platform repository after it verifies
the public GitHub Release.

See [docs/architecture.md](docs/architecture.md) for repository ownership and
[docs/development.md](docs/development.md) for the supported branch workflow.
The manual, approval-gated Windows signing preparation is documented in
[docs/code-signing.md](docs/code-signing.md).

### Unsigned macOS test build

Run `npm run dist:mac` on macOS to create the free unsigned DMG used for local
testing. Verify the published SHA-256 checksum before opening any downloaded
build, including a GitHub Actions artifact.

Because the test build is unsigned, macOS may block its first launch. Use the
per-app approval flow: Control-click NamLauncher, choose Open, or review the
blocked app under System Settings > Privacy & Security. Never disable Gatekeeper
globally. Signed and notarized automatic updates remain a separate future
release path.

## Code signing policy

Free code signing provided by [SignPath.io](https://signpath.io/), certificate
by [SignPath Foundation](https://signpath.org/).

NamLauncher signs only release artifacts produced from its own public source
and public build scripts. Every signing request must be created from a reviewed
release commit and manually approved; signing never publishes a release by
itself. The complete policy, team roles, scope, and verification process are in
[CODE_SIGNING_POLICY.md](CODE_SIGNING_POLICY.md). The user-data and network
behavior covered by signed releases is documented in the
[NamLauncher Privacy Notice](https://namlauncher.nattapat2871.me/legal).

## Security and privacy

Never commit credentials, signing keys, OAuth secrets, database files, user
reports, or production configuration. See [SECURITY.md](SECURITY.md) for the
responsible reporting process.

## License

NamLauncher source code is licensed under GPL-3.0-only. Third-party libraries,
loader icons, provider icons, fonts, and other bundled assets remain under
their respective licenses and notices. NamLauncher branding is covered by the
separate trademark notice in [TRADEMARKS.md](TRADEMARKS.md).

Author/creator: [nattapat2871](https://nattapat2871.me)
