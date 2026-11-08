// Shared setup of the two movie scripts (movie.mjs, movie-install.mjs): browser, sign-in, and a mask
// that shows public-looking addresses instead of the local demo's and hides Ghost's integration keys.
import { chromium } from 'playwright'

export const B = (process.env.BASE_URL || 'http://www.example.com').replace(/\/+$/, '')
const RESOLVE_TO = process.env.RESOLVE_TO || '127.0.0.1'
/** What the movie shows instead of the demo's own address and the stand-in's. */
export const SHOWN_SITE = 'https://blog.example.com'
const LIVE_API = 'https://api.supertext.com/v1/'

export async function open() {
  const browser = await chromium.launch({
    args: [`--host-resolver-rules=MAP ${new URL(B).hostname} ${RESOLVE_TO}`],
    executablePath: process.env.CHROMIUM_PATH || undefined,
  })
  const page = await browser.newPage({ deviceScaleFactor: 1, locale: 'en-US', viewport: { height: 720, width: 1280 } })
  page.setDefaultTimeout(90_000)
  await page.addInitScript(
    ([site, host, shown, live]) => {
      const fix = (s) =>
        s
          .split(site).join(shown)
          .split(host).join(shown.replace(/^https:\/\//, ''))
          .replace(/https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/v1\/?/g, live)
      const key = /^[0-9a-f]{24}:[0-9a-f]{20,}$|^[0-9a-f]{24,26}$/
      const run = () => {
        if (!document.body) return
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const t = n.textContent
          if (key.test(t.trim())) n.textContent = '•'.repeat(26)
          else if (t.includes(host) || /127\.0\.0\.1|localhost/.test(t)) n.textContent = fix(t)
        }
        for (const el of document.querySelectorAll('input, textarea')) {
          const v = el.value ?? ''
          if (key.test(v.trim())) el.value = '•'.repeat(26)
          else if (v.includes(host) || /127\.0\.0\.1|localhost/.test(v)) el.value = fix(v)
          el.spellcheck = false
        }
      }
      new MutationObserver(run).observe(document, { characterData: true, childList: true, subtree: true })
      setInterval(run, 150)
    },
    [B, new URL(B).host, SHOWN_SITE, LIVE_API],
  )
  return { browser, page }
}

/** Signs in to Ghost Admin (not recorded). */
export async function signIn(page, email, password) {
  await page.goto(`${B}/ghost/`)
  await page.waitForSelector('input[type=email]', { timeout: 120_000 })
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', password)
  await page.keyboard.press('Enter')
  await page.waitForURL(/#\/(site|dashboard|posts|analytics)/, { timeout: 60_000 })
}

/** Admin API call from inside the page, with the signed-in user's session. */
export const adminApi = (page, path) =>
  page.evaluate(async (url) => (await fetch(url, { headers: { 'Accept-Version': 'v6.0' } })).json(), `${B}/ghost/api/admin/${path}`)
