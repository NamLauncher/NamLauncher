# Code signing policy

Free code signing provided by [SignPath.io](https://signpath.io/), certificate
by [SignPath Foundation](https://signpath.org/).

## Scope

The policy applies only to official NamLauncher Windows release artifacts built
from the public [`NamLauncher/NamLauncher`](https://github.com/NamLauncher/NamLauncher)
source repository. Bundled NamLauncher Minecraft companion components are
maintained from public source in
[`NamLauncher/minecraft-companions`](https://github.com/NamLauncher/minecraft-companions).
NamLauncher does not use its signing subscription to sign third-party upstream
binaries, private backend services, the Discord bot, operational tooling, user
data, or arbitrary files.

## Team roles

- Authors and committers: [Nattapat2871](https://github.com/Nattapat2871)
- Reviewers: [Nattapat2871](https://github.com/Nattapat2871)
- Approvers: [Nattapat2871](https://github.com/Nattapat2871)

The project is currently maintained by one person, so the same maintainer fills
all three roles. Every person assigned one of these roles must enable
multi-factor authentication for both the source repository and SignPath before
receiving signing access. Changes from other contributors must be reviewed
before merge, and each signing request requires a separate manual approval by
the approver.

## Build and approval rules

1. The release source and all project-owned build scripts must be public under
   the OSI-approved GPL-3.0-only license.
2. CI must build the requested artifact from the exact reviewed release commit
   and record the source revision.
3. Tests, dependency checks, companion integrity checks, and packaging checks
   must pass before a signing request is submitted.
4. Product-name metadata must identify NamLauncher, and product-version
   metadata must match the release version consistently.
5. The approver must manually review every signing request. A signature does
   not authorize publication; publishing remains a separate explicit decision.
6. After signing, the maintainer verifies the Authenticode signature, expected
   publisher, release metadata, and a fresh SHA-256 digest before distribution.

## Privacy and security

The [NamLauncher Privacy Notice](https://namlauncher.nattapat2871.me/legal)
describes user data, network requests, automatic sanitized error reports,
connected services, retention, and user choices. Security issues should be
reported through [SECURITY.md](SECURITY.md). Credentials, signing material,
private configuration, user reports, production data, and operational logs are
never committed to this public repository or included as source inputs to the
signing process.

## Revocation and incident response

If a signed artifact is suspected of violating this policy, distribution is
paused while the source, build record, signature, and hashes are investigated.
The project will cooperate with SignPath Foundation, revoke or replace affected
artifacts when required, and publish corrected verification information only
after the incident is understood.

Author/creator: [nattapat2871](https://nattapat2871.me)
