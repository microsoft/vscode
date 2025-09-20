/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';

// Basic CI detection consistent with other scripts
const isCI = !!process.env.CI;

// Allow an override, otherwise place screenshots under the existing artifact path (.build/logs)
// using a dedicated 'screenshots' subfolder to avoid mixing with other logs.
const DEFAULT_SCREENSHOT_DIR = path.resolve(process.cwd(), '.build', 'logs', 'screenshots');
const TEST_LOG_DIR = process.env.VSCODE_TEST_LOG_DIR ? path.resolve(process.env.VSCODE_TEST_LOG_DIR) : DEFAULT_SCREENSHOT_DIR;

/**
 * Produce a filesystem-safe screenshot filename derived from a string or Mocha test context.
 */
export async function generateScreenShotFileName(contextOrFileName: string | Mocha.Context): Promise<string> {
	let base: string;
	if (typeof contextOrFileName === 'string') {
		base = contextOrFileName;
	} else {
		// Attempt to extract a descriptive test title
		// @ts-ignore - mocha types at runtime
		const testObj = contextOrFileName.currentTest ?? contextOrFileName.test ?? contextOrFileName;
		const title = typeof testObj.fullTitle === 'function' ? testObj.fullTitle() : (testObj.title || 'test');
		base = title;
	}
	base = base.replace(/[^A-Za-z0-9_.-]+/g, '_').slice(0, 100);
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	return `${base}-${timestamp}.png`;
}

/**
 * Capture a desktop screenshot (best-effort) when running in CI. Silent no-op locally.
 */
export async function captureScreenShot(contextOrFileName: string | Mocha.Context): Promise<void> {
	if (!isCI) {
		return;
	}
	try {
		fs.mkdirSync(TEST_LOG_DIR, { recursive: true });
	} catch {
		// ignore mkdir errors
	}
	const filename = path.join(TEST_LOG_DIR, await generateScreenShotFileName(contextOrFileName));
	try {
		const screenshot = require('screenshot-desktop');
		await screenshot({ filename });
		// Provide a concise log line so builds clearly show a screenshot was captured
		// (relative path keeps log noise low).
		const rel = path.relative(process.cwd(), filename);
		console.log(`[screenshot] Captured ${rel}`);
	} catch (ex) {
		// Do not fail tests due to inability to capture screenshot
		console.error(`Failed to capture screenshot into ${filename}`, ex);
	}
}
