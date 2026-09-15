// Author/creator: nattapat2871 (https://nattapat2871.me)
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')

test('keeps native window controls visible while the launcher width contracts', () => {
  const titlebars = appSource.match(/<header className="titlebar[^\n]+/g) || []
  assert.equal(titlebars.length, 2)

  for (const titlebar of titlebars) {
    assert.match(titlebar, /min-w-0/)
    assert.match(titlebar, /gap-2/)
  }

  const controlGroups = appSource.match(/className="no-drag flex shrink-0 items-center gap-1" data-testid="window-controls"/g) || []
  assert.equal(controlGroups.length, 2)
  assert.ok((appSource.match(/h-8 w-8 shrink-0 items-center/g) || []).length >= 6)
  assert.match(appSource, /flex min-w-0 flex-1 items-center gap-3 overflow-hidden/)
  assert.match(appSource, /min-w-0 flex-1 truncate text-xs/)
})
