---
name: record-video
description: Record a short WebM video of a web page or web-based app with Playwright's page.screencast, demonstrating a feature or bug fix. Use when asked to record evidence, demo a change, show that it works, record a video, or capture a screencast.
---

# Record video

Record a short `.webm` video of the real outcome with Playwright's
`page.screencast`, and return it with the script that produced it.

Use whichever Playwright `page` is available: the Integrated Browser's
`runPlaywrightCode` tool, or a Playwright session another skill attaches to an
app (for example `@playwright/cli run-code`). If a skill exists for launching
the app under test, follow it to get the page.

## Rules

- Show real behavior. Never fake a result or hide a failed assertion.
- Don't bypass sign-in, CAPTCHAs, or paywalls; don't record secrets or
  private data; ask before side effects on real services.
- Keep it under a minute, in a few clear chapters.

## Prepare

1. Get a Playwright page for the app and make sure it is visible
   (`document.visibilityState === 'visible'`); ask the user to reveal it if not.
   For the Integrated Browser, open a fresh page with `openBrowserPage`
   (`forceNew: true`); if the browser tools are missing, explain that
   `workbench.browser.enableChatTools` must be enabled and stop.
2. Dry-run the scenario without recording. Find stable role/name locators and
   check the assertions. Reset test data to a known start state.
3. Write the complete script before recording, so no locators need to be
   discovered mid-recording.

## Record in one call

Run the whole script in a single Playwright call so pauses between calls don't
end up in the video. Allow enough timeout for the scenario.

Save the video and script in the current session's storage folder, not in
the workspace, and name them after the scenario, for example
`<session folder>/add-and-complete-task.webm`.

```js
const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
const even = v => Math.max(2, Math.floor(v / 2) * 2);
const scale = Math.min(1, 1280 / viewport.width);
await page.screencast.start({
  path: '<session folder>/add-and-complete-task.webm',
  size: { width: even(viewport.width * scale), height: even(viewport.height * scale) },
});
try {
  await page.screencast.showActions();
  await page.screencast.showChapter('Add a task');
  const input = page.getByRole('textbox', { name: 'New task' });
  await input.pressSequentially('Buy milk', { delay: 60 });
  await input.press('Enter');
  const task = page.getByRole('checkbox', { name: 'Buy milk', exact: true });
  if (await task.isChecked()) {
    throw new Error('New task was unexpectedly completed.');
  }
  await page.waitForTimeout(1000);
  await page.screencast.showChapter('Complete the task');
  await task.check();
  if (!await task.isChecked()) {
    throw new Error('Task did not become completed.');
  }
  await page.waitForTimeout(1500);
} finally {
  await page.screencast.stop();
}
```

The video is only finalized by `stop()`, so always use `try/finally`. If the
scenario fails, keep the partial video and report the error.

## Hand off

Return links to the video and the script, plus a short list of expected vs.
actual outcomes. A demo supplements tests and code review; it doesn't replace them.
