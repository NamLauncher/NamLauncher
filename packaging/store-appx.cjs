// NamLauncher Microsoft Store packaging profile.
// Author/creator: nattapat2871 (https://nattapat2871.me)
//
// This profile intentionally creates an AppX/MSIX-style package without
// requiring a SignPath or CA certificate. Microsoft Store re-signs the
// submitted package after certification. It is kept separate from the
// website NSIS build so the two update channels cannot overwrite each other.

const packageJson = require('../package.json')

const build = packageJson.build || {}
const storeIdentityName = process.env.NAMLAUNCHER_STORE_IDENTITY_NAME || 'NamLauncher.Test'
const storePublisher = process.env.NAMLAUNCHER_STORE_PUBLISHER || 'CN=Nattapat2871'
const storePublisherDisplayName = process.env.NAMLAUNCHER_STORE_PUBLISHER_DISPLAY_NAME || 'Nattapat2871'

module.exports = {
  ...build,
  directories: {
    ...(build.directories || {}),
    output: process.env.NAMLAUNCHER_STORE_OUTPUT || 'release-store'
  },
  extraResources: [
    ...(build.extraResources || []),
    {
      from: 'packaging/microsoft-store/package-type',
      to: 'package-type'
    }
  ],
  win: {
    ...(build.win || {}),
    target: [{ target: 'appx', arch: ['x64'] }]
  },
  appx: {
    ...(build.appx || {}),
    applicationId: 'NamLauncher',
    identityName: storeIdentityName,
    publisher: storePublisher,
    publisherDisplayName: storePublisherDisplayName,
    displayName: 'NamLauncher',
    backgroundColor: '#07111d',
    showNameOnTiles: true,
    artifactName: 'NamLauncher-${version}-Microsoft-Store.${ext}'
  },
  forceCodeSigning: false
}
