# Microsoft Store packaging

Author/creator: nattapat2871 (https://nattapat2871.me)

NamLauncher is registered in Microsoft Partner Center as an **MSIX or PWA app**. The product is currently a draft and has not been submitted for certification or made public.

## Reserved product identity

- Product name: `NamLauncher`
- Store ID: `9NWF3PDZG590`
- Package identity name: `Nattapat2871.NamLauncher`
- Package publisher: `CN=1D87CE2F-D8CB-4D34-8B9A-CD416F0DDBD6`
- Publisher display name: `Nattapat2871`

These values must match `AppxManifest.xml` exactly. The Microsoft Store build is intentionally unsigned: Microsoft validates and signs the accepted package during Store certification.

## Build and verification

Run the same local pipeline used by GitHub Actions:

```powershell
npm ci
npm test
npm run dist:win:store
```

The output directory contains the validated `.msix`, its SHA-256 checksum, and `microsoft-store-package.json`. The Store build includes a `microsoft-store` package marker, disables the website installer updater, and leaves application updates to Microsoft Store.

GitHub Actions runs this pipeline for pull requests, pushes to `main`, and manual dispatches. It uploads a short-lived build artifact but does not publish a GitHub Release or submit to Partner Center automatically.
