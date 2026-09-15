// Author/creator: nattapat2871 (https://nattapat2871.me)

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const workflow = await readFile(
  new URL('../.github/workflows/sign-windows.yml', import.meta.url),
  'utf8'
)
const guide = await readFile(new URL('../docs/code-signing.md', import.meta.url), 'utf8')

test('keeps SignPath submission manual, approved, tag-bound, and non-publishing', () => {
  assert.match(workflow, /Author\/creator: nattapat2871/)
  assert.match(workflow, /^\s*workflow_dispatch:/m)
  assert.doesNotMatch(workflow, /^\s*(?:push|pull_request|pull_request_target|release|schedule):/m)
  assert.match(workflow, /environment: signpath-production/)
  assert.match(workflow, /SIGNPATH_APPROVED/)
  assert.match(workflow, /ref: refs\/tags\/\$\{\{ inputs\.release_tag \}\}/)
  assert.match(workflow, /refs\/tags\/\$expectedTag\^\{commit\}/)
  assert.match(workflow, /git diff --exit-code/)
  assert.doesNotMatch(workflow, /gh release|softprops\/action-gh-release|contents:\s*write/)
})

test('pins the official SignPath and GitHub actions to immutable commits', () => {
  assert.match(
    workflow,
    /SignPath\/github-action-submit-signing-request@c92b958760219087e01f8d67a1669ed57afe2627/
  )
  assert.match(workflow, /actions\/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09/)
  assert.match(workflow, /actions\/setup-node@a0853c24544627f65ddf259abe73b1d18a591444/)
  assert.equal(
    (workflow.match(/actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/g) ?? []).length,
    2
  )
  assert.doesNotMatch(workflow, /uses:\s+[^\n]+@v\d/)
})

test('keeps signing secrets scoped to the signing request and build step', () => {
  assert.match(workflow, /secrets\.SIGNPATH_API_TOKEN/)
  assert.match(workflow, /secrets\.SIGNPATH_ORGANIZATION_ID/)
  assert.match(workflow, /secrets\.SIGNPATH_PROJECT_SLUG/)
  assert.match(workflow, /secrets\.SIGNPATH_SIGNING_POLICY_SLUG/)
  assert.match(workflow, /steps\.unsigned\.outputs\.artifact-id/)
  assert.match(workflow, /Get-AuthenticodeSignature/)
  assert.match(workflow, /Status -ne 'Valid'/)
  assert.match(workflow, /retention-days: 1/)
})

test('documents approval dependencies and the unsigned updater-bundle boundary', () => {
  assert.match(guide, /SignPath Foundation/)
  assert.match(guide, /protected environment named `signpath-production`/)
  assert.match(guide, /never creates, edits, or uploads to a GitHub Release/)
  assert.match(guide, /changing an executable invalidates the bundle manifest/)
  assert.match(guide, /planned for `1\.2\.5`/)
})
