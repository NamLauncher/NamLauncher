// Author/creator: nattapat2871 (https://nattapat2871.me)
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const workflow = await readFile(
  new URL('../.github/workflows/release-desktop.yml', import.meta.url),
  'utf8'
)

test('publishes 1.2.4 without invoking SignPath when signing is disabled', () => {
  assert.match(workflow, /sign_windows:[\s\S]*type: boolean[\s\S]*default: false/)
  assert.match(workflow, /sign-windows:[\s\S]*if: \$\{\{ inputs\.publish && inputs\.sign_windows \}\}/)
  assert.match(workflow, /name: release-windows-prepared-\$\{\{ inputs\.version \}\}/)
  assert.match(workflow, /--windows-signature "\$\{\{ inputs\.sign_windows && 'signpath' \|\| 'unsigned' \}\}"/)
})

test('keeps signed publishing available as an explicit 1.2.5 opt-in', () => {
  assert.match(workflow, /SignPath\/github-action-submit-signing-request@c92b958760219087e01f8d67a1669ed57afe2627/)
  assert.match(workflow, /name: release-windows-signed-\$\{\{ inputs\.version \}\}/)
  assert.match(workflow, /inputs\.sign_windows == false \|\| needs\.sign-windows\.result == 'success'/)
})

test('keeps full Git history in every packaging job for the immutable metadata gate', () => {
  const checkoutBlocks = workflow.match(/uses: actions\/checkout@[^\n]+\n        with:\n          ref: \$\{\{ needs\.preflight\.outputs\.commit_sha \}\}[\s\S]*?persist-credentials: false/g) || []
  assert.equal(checkoutBlocks.length, 5)
  for (const block of checkoutBlocks) assert.match(block, /fetch-depth: 0/)
})
