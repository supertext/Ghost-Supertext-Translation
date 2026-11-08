#!/usr/bin/env node
/**
 * Records the README's demo movie (docs/images/demo.gif, plus a narrated MP4 that isn't committed) with the
 * shared Supertext movie kit (movie/movie-kit.mjs), as the demo's editor: the sample post in English, the
 * tag #translate-de-ch in the post settings, the German draft in the posts list, the draft opened.
 * Run it against a fresh demo whose connector talks to stand-in.mjs. See docs/DEVELOPER.md → Demo movie.
 *
 *   BASE_URL (default http://www.example.com), RESOLVE_TO (default 127.0.0.1), DEMO_EDITOR_EMAIL / DEMO_EDITOR_PASSWORD
 *   MOVIE_OUT: where the MP4 goes (default test/docs/movie/out/Ghost-Supertext-Translation.mp4, git-ignored)
 */
import { fileURLToPath } from 'node:url'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MovieKit } from './movie/movie-kit.mjs'
import { B, adminApi, open, signIn } from './movie/ghost.mjs'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const mp4 = process.env.MOVIE_OUT ?? here('movie/out/Ghost-Supertext-Translation.mp4')
const gif = here('../../docs/images/demo.gif')
const workDir = mkdtempSync(join(tmpdir(), 'ghost-movie-'))
const SOURCE_TITLE = 'Translate your Ghost posts with Supertext'
const GERMAN_TITLE = 'Übersetzen Sie Ihre Ghost-Beiträge mit Supertext'

const { browser, page } = await open()
await signIn(page, process.env.DEMO_EDITOR_EMAIL || 'editor@demo.example.com', process.env.DEMO_EDITOR_PASSWORD || 'Demo-Editor-2026!x')
const posts = await adminApi(page, `posts/?filter=${encodeURIComponent('tag:hash-lang-de-ch')}`)
if (posts.posts?.length) throw new Error('The German translation exists already: record against a fresh demo.')

// The post in the editor (opening it isn't recorded).
await page.goto(`${B}/ghost/#/posts`)
await page.getByText(SOURCE_TITLE, { exact: true }).first().click()
await page.getByRole('button', { name: 'Settings' }).waitFor()
await page.waitForTimeout(1500)

const kit = await MovieKit.start(page, { assets: here('movie/assets'), voiceCache: here('movie/voice'), workDir })

// 1. The post in English.
await kit.say("Here's a post in Ghost, written in English.", {
  caption: 'A post in English',
  during: () => kit.moveTo(page.locator('h2', { hasText: 'How it works' }).last()),
})

// 2. The translate action: an internal tag in the post settings.
const settings = page.getByRole('button', { name: 'Settings' })
await kit.say('To translate it, open the post settings.', { caption: 'Open the <b>Post settings</b>', during: () => kit.click(settings) })
const tagInput = page.locator('aside label', { hasText: /^Tags$/ }).locator('xpath=..').locator('input').first()
await kit.say('Under Tags, add the internal tag translate D E C H, for German.', {
  caption: 'Add the tag <b>#translate-de-ch</b>',
  during: async () => {
    await kit.click(tagInput)
    await tagInput.pressSequentially('#translate-de', { delay: 70 })
    await page.waitForTimeout(500)
    await kit.click(page.getByRole('option', { name: '#translate-de-ch' }).first())
    await page.keyboard.press('Escape')
  },
})

// 3. Waiting: Ghost saves the tag right away, its webhook starts the translation.
await kit.say('Ghost saves the tag right away, and Supertext translates the content.', {
  caption: 'Supertext translates the content…',
  during: () => kit.hold(1200),
})
kit.pause()
for (let i = 0; i < 120; i++) {
  const found = await adminApi(page, `posts/?filter=${encodeURIComponent('tag:hash-lang-de-ch')}`)
  if (found.posts?.length) break
  await page.waitForTimeout(1000)
}
await page.goto(`${B}/ghost/#/posts`)
await page.getByText(GERMAN_TITLE).first().waitFor()
await page.waitForTimeout(1200)
kit.resume()

// 4. The result.
const draft = page.getByText(GERMAN_TITLE).first()
await kit.say('A few seconds later, the German version is in your posts list, as a draft.', {
  caption: 'The German draft is in the posts list',
  during: () => kit.moveTo(draft),
})
await kit.say('Open it to check the translation.', { caption: 'Open the German draft', during: () => kit.click(draft) })
kit.pause()
await page.locator('h2', { hasText: 'So funktioniert es' }).last().waitFor()
await page.waitForTimeout(800)
kit.resume()
await kit.say('The German version is ready. Review it, and publish it as usual.', {
  caption: 'The German version is ready – review it and publish',
  during: () => kit.moveTo(page.locator('h2', { hasText: 'So funktioniert es' }).last()),
})
await kit.caption('')

await kit.finish(mp4, { gif, repo: 'Ghost-Supertext-Translation', system: 'Ghost' })
await browser.close()
rmSync(workDir, { force: true, recursive: true })
console.log(`Saved ${mp4} and ${gif} (${(statSync(gif).size / 1e6).toFixed(2)} MB)`)
