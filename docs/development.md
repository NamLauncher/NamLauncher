# Development Workflow

`main` contains the latest published stable source.
`develop` contains the next release integration source. The `codex/release-1.2.4`
branch qualifies version `1.2.4` without publishing it.

1. Create focused branches from `develop`.
2. Install dependencies with `npm ci`.
3. Run `npm run prepare:game-bridge`, `npm run build`, and `npm test`.
4. Open a pull request into `develop` and wait for CI.
5. Promote an audited stable commit to `main` only through a dedicated release
   pull request. Stable users must never be directed through a beta download.

Release publication, production deployment, Discord announcements, and updates
to website download metadata are separate guarded operations. A source push by
itself does not authorize any of them.

## Desktop release automation

1. Promote an audited stable source commit to `main` and ensure the version and
   root `CHANGELOG.md` entry agree.
2. Run `Build and publish stable desktop release` with `publish` disabled to
   verify native Windows, Linux, and macOS packaging from the same commit.
3. Create the exact stable tag `vX.Y.Z` at that verified commit.
4. Run the workflow again from that tag with `publish` enabled.
5. Approve Windows signing in the `stable-signing` environment and SignPath,
   then approve GitHub publication in `stable-production`.
6. Allow the private Platform workflow to verify and atomically promote the
   immutable GitHub Release files. Never upload a locally built replacement.

Stable release assets are immutable. A corrected build uses a new patch version
instead of replacing a file under an existing tag.

Author/creator: [nattapat2871](https://nattapat2871.me)
