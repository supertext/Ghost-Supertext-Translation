#!/usr/bin/env node
/**
 * Records the install and configuration movie (a narrated MP4 that isn't committed) with the shared Supertext
 * movie kit (movie/movie-kit.mjs): the install commands from docs/INSTALLATION.md in a terminal, then, as the
 * demo's administrator (Ghost Owner), the "Supertext Translation" custom integration with its webhooks (keys
 * hidden), the connector's start with the variables (fake API key), the status page's Connection section and
 * Language mapping, and the internal tags editors use. Run it against a demo whose connector talks to
 * stand-in.mjs. See docs/DEVELOPER.md → Demo movie.
 *
 *   BASE_URL (default http://www.example.com), RESOLVE_TO (default 127.0.0.1), DEMO_ADMIN_EMAIL / DEMO_ADMIN_PASSWORD
 *   MOVIE_OUT: where the MP4 goes (default test/docs/movie/out/Ghost-Supertext-Translation-install.mp4, git-ignored)
 */
import { fileURLToPath } from 'node:url'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MovieKit } from './movie/movie-kit.mjs'
import { B, SHOWN_SITE, adminApi, open, signIn } from './movie/ghost.mjs'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const mp4 = process.env.MOVIE_OUT ?? here('movie/out/Ghost-Supertext-Translation-install.mp4')
const workDir = mkdtempSync(join(tmpdir(), 'ghost-install-movie-'))

const { browser, page } = await open()
await signIn(page, process.env.DEMO_ADMIN_EMAIL || 'admin@demo.example.com', process.env.DEMO_ADMIN_PASSWORD || 'Demo-Admin-2026!x')
const integration = (await adminApi(page, 'integrations/?include=webhooks')).integrations.find((i) => i.name === 'Supertext Translation')
if (!integration) throw new Error('The demo has no "Supertext Translation" integration yet.')

const kit = await MovieKit.start(page, { assets: here('movie/assets'), voiceCache: here('movie/voice'), workDir })

/** Opens a page without recording the loading. */
const goto = async (path, ready) => {
  kit.pause()
  await page.goto('about:blank') // after kit.terminal() the URL is still Ghost Admin's: a hash change wouldn't reload
  await page.goto(B + path)
  await ready()
  await page.waitForTimeout(1200)
  kit.resume()
}
const scrollTo = async (locator, block = 'start') => {
  await locator.evaluate((el, block) => el.scrollIntoView({ behavior: 'smooth', block }), block)
  await page.waitForTimeout(900)
}

// 1. Install (docs/INSTALLATION.md → Install).
await kit.say('The connector is a small Node.js service next to Ghost. Clone it from GitHub, install its dependencies, and build it.', {
  caption: 'Get the connector and build it',
  during: () =>
    kit.terminal({
      lines: [
        { cmd: 'git clone https://github.com/Supertext/Ghost-Supertext-Translation.git' },
        { out: "Cloning into 'Ghost-Supertext-Translation'..." },
        { cmd: 'cd Ghost-Supertext-Translation' },
        { cmd: 'npm ci && npm run build' },
        { out: 'added 51 packages in 3s' },
        { out: '> tsc -p tsconfig.build.json' },
      ],
      title: 'my-site',
    }),
})

// 2. The custom integration with its webhooks (docs/INSTALLATION.md → Create the integration in Ghost).
await goto('/ghost/#/settings', () => page.getByText('General settings').first().waitFor())
await kit.say('In Ghost Admin, open Settings, then Integrations.', {
  caption: '<b>Settings → Integrations</b>',
  during: async () => {
    await kit.click(page.getByText('Integrations', { exact: true }).first())
    await page.waitForTimeout(800)
  },
})
await kit.say('Add a custom integration called Supertext Translation, and copy its Admin API key.', {
  caption: '<b>Add custom integration</b> “Supertext Translation”, copy the <b>Admin API key</b>',
  during: async () => {
    await kit.moveTo(page.getByText('Add custom integration', { exact: true }).first())
    await kit.click(page.getByRole('tab', { name: 'Custom' }).first())
    await kit.click(page.getByText('Supertext Translation', { exact: true }).first())
    await page.getByText('Admin API key').first().waitFor()
    await kit.moveTo(page.getByText('Admin API key').first())
  },
})
const dialog = page.locator('body')
const webhooks = dialog.getByText('Supertext: post.added').first()
await kit.say('Then add four webhooks, for posts and pages, created and updated, all pointing at the connector, with the same secret.', {
  caption: 'Add four webhooks to <b>/supertext/webhook</b>, with one <b>Secret</b>',
  during: async () => {
    await scrollTo(webhooks, 'center')
    await kit.moveTo(webhooks)
  },
})

// 3. Start the connector with the variables (docs/INSTALLATION.md → Install, API key).
await kit.say("Now start the connector with your site's URL, the integration's Admin API key and webhook secret, your Supertext API key, and the languages to translate into. Once it reaches Ghost, it creates the translate tags.", {
  caption: 'Start it with <b>SUPERTEXT_API_KEY</b> and the Ghost settings',
  during: () =>
    kit.terminal({
      lines: [
        {
          cmd: [
            `GHOST_URL=${SHOWN_SITE} \\`,
            '  GHOST_ADMIN_API_KEY=… GHOST_WEBHOOK_SECRET=… \\',
            '  SUPERTEXT_API_KEY=st-demo-0000-0000-0000 TARGET_LANGUAGES=de-CH,fr-CH \\',
            '  GHOST_UPSTREAM=http://ghost:2368 npm start',
          ].join('\n'),
        },
        { out: '[supertext] en → de-CH, fr-CH; Supertext API https://api.supertext.com/v1/' },
        { out: '[supertext] Ghost connection OK, tags in place', wait: 400 },
      ],
      title: 'my-site/Ghost-Supertext-Translation',
    }),
})
await kit.say('Generate your API key at supertext.com, Integrations, API. No account yet? Create one at supertext.com.', {
  caption: 'Generate your API key at <b>supertext.com → Integrations → API</b>. No account yet? Create one at supertext.com.',
})

// 4. The status page: key check.
await goto('/ghost/supertext/', () => page.locator('#settings').waitFor())
const connection = page.locator('#settings')
const keyCheck = connection.getByText('API key checked: the connection to Supertext works.')
await kit.say('Signed in as a Ghost administrator, open the status page at ghost, supertext. Under Connection, the API key works.', {
  caption: 'Status page <b>/ghost/supertext/</b> → <b>Connection</b>: the API key works',
  during: async () => {
    await kit.hold(600)
    await scrollTo(connection)
    await kit.moveTo(keyCheck)
  },
})

// 5. Language mapping.
const mapping = page.locator('#mapping')
const german = page.locator('#map-de-ch')
await kit.say('Under Language mapping, each language has its Supertext language. German is sent as German, Switzerland. Pick another variant here if you like.', {
  caption: '<b>Language mapping</b>: German → <b>German (Switzerland) (de-CH)</b>',
  during: async () => {
    await scrollTo(mapping)
    await kit.click(german)
    await page.keyboard.press('Escape')
    await german.selectOption('de-CH')
  },
})
await kit.say('Translation review can be ticked for each language. Leave it off for now, and click Save.', {
  caption: '<b>Translation review</b>: optional, per language. Click <b>Save</b>',
  during: async () => {
    await kit.moveTo(mapping.locator('input[type=checkbox]').first())
    await kit.click(mapping.getByRole('button', { name: 'Save' }))
    await page.waitForLoadState('load')
    await page.waitForTimeout(800)
  },
})

// 6. Where editors find it.
await goto('/ghost/#/tags?type=internal', () => page.getByText('#translate-de-ch').first().waitFor())
await kit.say('Done. Editors now find the translate tags under Tags, Internal tags, and add them to a post in its settings.', {
  caption: 'Editors add <b>#translate-de-ch</b> to a post: a German draft appears',
  during: () => kit.moveTo(page.getByText('#translate-de-ch', { exact: true }).first()),
})
await kit.caption('')

await kit.finish(mp4, { kind: 'install', repo: 'Ghost-Supertext-Translation', system: 'Ghost' })
await browser.close()
rmSync(workDir, { force: true, recursive: true })
console.log(`Saved ${mp4}`)
