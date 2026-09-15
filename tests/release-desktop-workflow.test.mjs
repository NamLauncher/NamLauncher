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
