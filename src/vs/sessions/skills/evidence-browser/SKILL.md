---
name: evidence-browser
description: Record a short narrated WebM video in the Integrated Browser that demos what the agent just built or fixed, as evidence for the user. Use when the user asks to 'record evidence', 'demo the change', 'show me it works', 'record a video', or 'capture a screencast' of a web page or web UI change.
---
<!-- Customize this skill and select save to override its behavior. Delete that copy to restore the built-in behavior. -->

# Evidence Browser

Demo the outcome of the current task in the Integrated Browser while recording it to a `.webm` file. The video should let the user watch what changed without reproducing it themselves.

The recording uses Playwright's `page.screencast` API through the `runPlaywrightCode` tool. It needs no ffmpeg, no OS screen recorder, and no separate Playwright install.

## Guidelines

- **Show the real outcome.** Never fake or stage a result. If a step fails, keep the failure in the video and report it. Don't quietly re-record to hide it.
- **Never solve CAPTCHAs** or bypass bot protection, logins, or paywalls. Hand control to the user (keep recording if they agree) or stop.
- **Don't enter credentials or secrets**, and avoid recording pages that show them.
- **Ask before side effects** on real services, such as submitting forms, purchasing, posting, or sending messages. Local dev servers and test data are fine.
- Prefer privacy-preserving options in consent dialogs (for example "Reject all").
- Keep the video short: 3–6 chapters, ideally under 60 seconds.

## Prerequisites

- The browser tools (`openBrowserPage`, `runPlaywrightCode`, `readPage`, …) must be available. If they are deferred, load them with tool search first. If they are missing, tell the user to enable the `workbench.browser.enableChatTools` setting and stop.
- The thing to demo must be reachable by URL: a local dev server, a `file:///` page, or a public site. If the change has no browser-observable outcome (for example a CLI or library change), say so and offer an alternative instead of recording an empty video.

## Workflow

### 1. Plan the demo

Summarize what was done in this session, then write a short script. Each chapter is a title, the actions, and the expected visible outcome. Share the script in one or two lines before recording.

If a server is needed, start it in the background and confirm it responds (for example with `curl`) before opening the browser.

### 2. Open the page and check that it is visible

Open a fresh page on `about:blank` so the first navigation is in the video:

`openBrowserPage` with `{ "url": "about:blank", "forceNew": true }`. Keep the returned page ID.

The page must be **visible on screen** while recording. A hidden browser tab stops painting, so clicks hang ("waiting for element to be visible, enabled and stable") and the video gets no frames. `page.bringToFront()` does **not** reveal the tab. Check:

```js
return page.evaluate(() => document.visibilityState);
```

If it returns `hidden`, ask the user to click the browser tab, then wait for it with a polling interval (the default polling uses `requestAnimationFrame`, which is stalled while hidden):

```js
await page.waitForFunction(() => document.visibilityState === 'visible', undefined, { polling: 500, timeout: 60000 });
```

### 3. Do a dry run if selectors are unknown

Navigate without recording and use `readPage` to find stable role- or text-based locators. This keeps the recorded run free of fumbling. Return to `about:blank` when done.

### 4. Start recording

Pick an absolute output path: the session's files or artifacts folder if your environment provides one, otherwise the system temp directory. Name it `evidence-<short-slug>.webm`. The file is written by the VS Code process that hosts the Integrated Browser. With a remote agent host, that's the user's machine, not the agent host.

```js
const vp = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
const even = n => Math.max(2, Math.floor(n / 2) * 2);
const scale = Math.min(1, 1280 / vp.w);
await page.screencast.start({
  path: '<absolute path>/evidence-<slug>.webm',
  size: { width: even(vp.w * scale), height: even(vp.h * scale) },
});
await page.screencast.showActions();
return 'recording';
```

If `page.screencast` is undefined, the bundled Playwright is too old. Tell the user and stop.

### 5. Perform the chapters

Use one `runPlaywrightCode` call per chapter and raise `timeoutMs` as needed (the default is 5 seconds). The recording keeps running between calls, including the idle time while you decide the next step. Prepare all chapters before starting (step 3) and run them back to back without other tool calls in between.

```js
await page.screencast.showChapter('Add a todo', { description: 'Type a title and press Enter' });
await page.goto('http://localhost:3000');
const input = page.getByRole('textbox', { name: 'New todo' });
await input.click();
await input.pressSequentially('Buy milk', { delay: 80 });
await input.press('Enter');
await page.getByText('Buy milk').waitFor();
await page.waitForTimeout(1500);
return { url: page.url(), title: await page.title() };
```

- Pace it for a human viewer: type with `pressSequentially(text, { delay })` and pause about 1–2 s after each visible outcome.
- End each chapter by waiting for the expected outcome (`locator.waitFor()`, `page.waitForURL(...)`). This makes the video prove the result.
- Use `page.screencast.showOverlay(html, { duration })` for short captions, such as "Before" and "After".
- If the user must act (CAPTCHA, sign-in, a native dialog), ask them, then wait with `page.waitForURL(...)` or `locator.waitFor({ timeout })` and a matching `timeoutMs`.

### 6. Stop recording, always

The file is only written on stop. Stop even if a chapter failed:

```js
await page.screencast.stop();
return 'stopped';
```

### 7. Verify and report

- If the file is on a machine your shell can reach, confirm it exists and is not tiny (for example `ls -la <path>`, plus `ffprobe -v error -show_entries format=duration -of default=nw=1 <path>` if ffprobe is installed).
- Reply with a link to the `.webm` file and a short table of chapters with the result of each (✅ or ❌, plus what was seen).
- If an artifact-registration tool is available, register the video as an artifact.
- Mention anything the video does not show (for example, steps the user performed by hand).
