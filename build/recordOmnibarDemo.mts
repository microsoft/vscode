/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Records the omnibar demo fixture to a video file.
//
// The demo is driven by timers and requestAnimationFrame, both of which browsers
// throttle hard in background tabs (setInterval clamps to ~1Hz, rAF pauses
// outright). So this drives a dedicated headed browser where the page is the
// foreground tab, rather than screen-capturing an existing window.
//
//   node --experimental-strip-types build/recordOmnibarDemo.mts [--out demo.webm]
//
// Requires the component explorer to be serving (see test/componentFixtures).

import { chromium } from 'playwright';
import { mkdir, readdir, rename, rm } from 'fs/promises';
import path from 'path';

const FIXTURE = process.env.OMNIBAR_THEME === 'light'
	? 'voice%2FomnibarDemo%2FomnibarDemo%2FDemo%2FLight'
	: 'voice%2FomnibarDemo%2FomnibarDemo%2FDemo%2FDark';
const URL = `http://localhost:5123/___explorer?fixture=${FIXTURE}&mode=embedded`;

/** One full pass of the script, plus a little lead-in and tail. */
const SCRIPT_MS = 182000;
const LEAD_IN_MS = 1200;
const TAIL_MS = 600;

const VIEWPORT = { width: 640, height: 600 };

async function main(): Promise<void> {
	const outArg = process.argv.indexOf('--out');
	const out = path.resolve(outArg > -1 ? process.argv[outArg + 1] : 'omnibar-demo-v4.webm');
	const tmpDir = path.join(path.dirname(out), '.omnibar-recording');

	await rm(tmpDir, { recursive: true, force: true });
	await mkdir(tmpDir, { recursive: true });

	const browser = await chromium.launch({ headless: false });
	const context = await browser.newContext({
		viewport: VIEWPORT,
		deviceScaleFactor: 2,
		recordVideo: { dir: tmpDir, size: { width: VIEWPORT.width * 2, height: VIEWPORT.height * 2 } },
	});
	const page = await context.newPage();

	console.log(`Loading ${URL}`);
	await page.goto(URL, { waitUntil: 'networkidle' });

	// Wait for the fixture to actually mount before the recording gets interesting.
	await page.waitForFunction(() => {
		const visit = (node: Document | ShadowRoot): Element | null => {
			const hit = node.querySelector('.omnibar-surface');
			if (hit) {
				return hit;
			}
			for (const el of node.querySelectorAll('*')) {
				if (el.shadowRoot) {
					const nested = visit(el.shadowRoot);
					if (nested) {
						return nested;
					}
				}
			}
			return null;
		};
		return !!visit(document);
	}, undefined, { timeout: 30_000 });

	await page.waitForTimeout(LEAD_IN_MS);
	console.log(`Recording ${(SCRIPT_MS / 1000).toFixed(1)}s of the script...`);
	await page.waitForTimeout(SCRIPT_MS + TAIL_MS);

	await context.close();
	await browser.close();

	const [file] = (await readdir(tmpDir)).filter(f => f.endsWith('.webm'));
	if (!file) {
		throw new Error(`No video was produced in ${tmpDir}`);
	}
	await rm(out, { force: true });
	await rename(path.join(tmpDir, file), out);
	await rm(tmpDir, { recursive: true, force: true });

	console.log(`Wrote ${out}`);
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});
