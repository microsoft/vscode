#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

/**
 * Automated test runner for Agent Sessions E2E scenarios.
 *
 * Usage:
 *   node src/vs/sessions/test/e2e/run.js
 *
 * This script:
 * 1. Starts the sessions web server on a random port
 * 2. Opens the sessions window in playwright-cli
 * 3. Reads each *.scenario.md and translates steps to playwright-cli commands
 * 4. Reports pass/fail per step
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const APP_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const SCENARIOS_DIR = path.join(__dirname, 'scenarios');
const PORT = 9100 + Math.floor(Math.random() * 900);
const BASE_URL = `http://localhost:${PORT}/?skip-sessions-welcome`;

// ---------------------------------------------------------------------------
// Scenario parser (same logic as scenarioParser.ts but in plain JS)
// ---------------------------------------------------------------------------

function parseScenario(filePath) {
	const raw = fs.readFileSync(filePath, 'utf-8');
	const lines = raw.split('\n');
	let name = path.basename(filePath, '.scenario.md');
	const steps = [];
	let inSteps = false;

	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed.startsWith('# ')) { name = trimmed.slice(2).trim(); }
		if (/^## steps?$/i.test(trimmed)) { inSteps = true; continue; }
		if (trimmed.startsWith('## ')) { inSteps = false; continue; }
		if (inSteps) {
			const m = trimmed.match(/^(?:-|\d+\.)\s+(.*)/);
			if (m) { steps.push(m[1].trim()); }
		}
	}
	return { name, steps, filePath };
}

function discoverScenarios() {
	return fs.readdirSync(SCENARIOS_DIR)
		.filter(f => f.endsWith('.scenario.md'))
		.sort()
		.map(f => parseScenario(path.join(SCENARIOS_DIR, f)));
}

// ---------------------------------------------------------------------------
// Step → playwright-cli command translation
// ---------------------------------------------------------------------------

function stepToCommands(step) {
	let m;

	// Click button "<text>" — snapshot, find ref, click ref
	if ((m = step.match(/^click button "(.+?)"$/i))) {
		return [{ type: 'click-button', label: m[1] }];
	}

	// Type "<text>" in the chat input
	if ((m = step.match(/^type "(.+?)" in the chat input$/i))) {
		return [{ type: 'cli', args: ['type', m[1]] }];
	}

	// Press Enter to submit
	if (/^press Enter to submit$/i.test(step)) {
		return [{ type: 'cli', args: ['press', 'Enter'] }];
	}

	// Press <key>
	if ((m = step.match(/^press (.+)$/i))) {
		return [{ type: 'cli', args: ['press', m[1]] }];
	}

	// Verify the "<label>" button is disabled
	if ((m = step.match(/^verify the? "(.+?)" button is disabled$/i))) {
		return [{ type: 'assert-button-disabled', label: m[1] }];
	}

	// Verify the "<label>" button is enabled
	if ((m = step.match(/^verify the? "(.+?)" button is enabled$/i))) {
		return [{ type: 'assert-button-enabled', label: m[1] }];
	}

	// Verify the repository picker dropdown is visible
	if (/^verify the repository picker dropdown is visible$/i.test(step)) {
		return [{ type: 'assert-visible', text: 'Pick Repository' }];
	}

	// Verify <element> is visible
	if ((m = step.match(/^verify (.+?) is visible$/i))) {
		return [{ type: 'assert-visible', text: m[1] }];
	}

	return [{ type: 'unknown', step }];
}

// ---------------------------------------------------------------------------
// Helpers for snapshot-based interaction
// ---------------------------------------------------------------------------

function getSnapshot() {
	const result = runPlaywrightCli(['snapshot']);
	return result.ok ? result.stdout : '';
}

function findRefByButtonName(snapshotText, label) {
	// Look for: button "Label" [ref=eNN] or button "Label" [disabled] [ref=eNN]
	const lines = snapshotText.split('\n');
	for (const line of lines) {
		if (line.includes(`"${label}"`) && line.includes('button')) {
			const refMatch = line.match(/\[ref=(e\d+)\]/);
			if (refMatch) { return refMatch[1]; }
		}
	}
	return null;
}

// ---------------------------------------------------------------------------
// Execute a single playwright-cli command
// ---------------------------------------------------------------------------

function runPlaywrightCli(args) {
	const argList = Array.isArray(args) ? args : args.match(/"[^"]*"|\S+/g)?.map(s => s.replace(/^"|"$/g, '')) ?? [];
	const result = cp.spawnSync('playwright-cli', argList, {
		cwd: APP_ROOT,
		stdio: ['ignore', 'pipe', 'pipe'],
		timeout: 30_000,
		env: { ...process.env },
	});
	const stdout = (result.stdout || '').toString();
	const stderr = (result.stderr || '').toString();
	return { ok: result.status === 0, stdout, stderr };
}

function executeStep(step) {
	const commands = stepToCommands(step);

	for (const cmd of commands) {
		switch (cmd.type) {
			case 'cli': {
				const result = runPlaywrightCli(cmd.args);
				if (!result.ok) {
					return { ok: false, message: `playwright-cli ${cmd.args.join(' ')} failed:\n${result.stderr || result.stdout}` };
				}
				break;
			}

			case 'click-button': {
				const snap = getSnapshot();
				if (!snap) { return { ok: false, message: 'Failed to take snapshot' }; }
				const ref = findRefByButtonName(snap, cmd.label);
				if (!ref) { return { ok: false, message: `Button "${cmd.label}" not found in snapshot` }; }
				const result = runPlaywrightCli(['click', ref]);
				if (!result.ok) {
					return { ok: false, message: `Click on "${cmd.label}" (${ref}) failed:\n${result.stderr || result.stdout}` };
				}
				break;
			}

			case 'assert-visible': {
				const snap = getSnapshot();
				if (!snap) { return { ok: false, message: 'Failed to take snapshot' }; }
				if (!snap.includes(cmd.text)) {
					return { ok: false, message: `Expected "${cmd.text}" to be visible in snapshot but it was not found` };
				}
				break;
			}

			case 'assert-button-disabled': {
				const snap = getSnapshot();
				if (!snap) { return { ok: false, message: 'Failed to take snapshot' }; }
				const lines = snap.split('\n');
				const buttonLine = lines.find(l => l.includes(`"${cmd.label}"`) && l.includes('button'));
				if (!buttonLine) {
					return { ok: false, message: `Button "${cmd.label}" not found in snapshot` };
				}
				if (!buttonLine.includes('[disabled]')) {
					return { ok: false, message: `Expected button "${cmd.label}" to be disabled but it is enabled` };
				}
				break;
			}

			case 'assert-button-enabled': {
				const snap = getSnapshot();
				if (!snap) { return { ok: false, message: 'Failed to take snapshot' }; }
				const lines = snap.split('\n');
				const buttonLine = lines.find(l => l.includes(`"${cmd.label}"`) && l.includes('button'));
				if (!buttonLine) {
					return { ok: false, message: `Button "${cmd.label}" not found in snapshot` };
				}
				if (buttonLine.includes('[disabled]')) {
					return { ok: false, message: `Expected button "${cmd.label}" to be enabled but it is disabled` };
				}
				break;
			}

			case 'unknown':
				return { ok: false, message: `No translation for step: "${cmd.step}"` };
		}
	}

	return { ok: true };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	const scenarios = discoverScenarios();
	if (scenarios.length === 0) {
		console.error('No scenarios found in', SCENARIOS_DIR);
		process.exit(1);
	}

	// Start web server
	console.log(`Starting sessions web server on port ${PORT}…`);
	const server = cp.spawn(process.execPath, [path.join(APP_ROOT, 'scripts', 'code-sessions-web.js'), '--no-open', '--port', String(PORT)], {
		cwd: APP_ROOT,
		stdio: ['ignore', 'pipe', 'pipe'],
		env: { ...process.env },
	});
	server.stdout.on('data', d => { /* silent */ });
	server.stderr.on('data', d => { /* silent */ });

	// Wait for server to be ready
	await waitForServer(`http://localhost:${PORT}/`, 30_000);
	console.log(`Server ready.\n`);

	// Open browser, then navigate to the sessions URL
	runPlaywrightCli(['open', '--headed']);
	const gotoResult = runPlaywrightCli(['goto', BASE_URL]);
	if (!gotoResult.ok) {
		console.error('Failed to navigate:', gotoResult.stderr);
		server.kill();
		process.exit(1);
	}

	// Wait a moment for the workbench to render
	cp.spawnSync('sleep', ['3']);

	let passed = 0;
	let failed = 0;

	for (const scenario of scenarios) {
		console.log(`▶ ${scenario.name}`);

		// Press Escape to dismiss any leftover overlays between scenarios
		runPlaywrightCli('press Escape');

		for (const [i, step] of scenario.steps.entries()) {
			const label = `  step ${i + 1}: ${step}`;
			const result = executeStep(step);
			if (result.ok) {
				console.log(`  ✅ ${label}`);
				passed++;
			} else {
				console.error(`  ❌ ${label}`);
				console.error(`     ${result.message}`);
				// Take a screenshot on failure
				runPlaywrightCli(`screenshot --filename=failure-${path.basename(scenario.filePath, '.scenario.md')}-step${i + 1}.png`);
				failed++;
			}
		}
		console.log();
	}

	// Cleanup
	runPlaywrightCli('close');
	server.kill();

	console.log(`Results: ${passed} passed, ${failed} failed`);
	process.exit(failed > 0 ? 1 : 0);
}

async function waitForServer(url, timeoutMs) {
	const http = require('http');
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const ok = await new Promise(resolve => {
			const req = http.get(url, res => { res.resume(); resolve(res.statusCode === 200); });
			req.on('error', () => resolve(false));
			req.setTimeout(1000, () => { req.destroy(); resolve(false); });
		});
		if (ok) { return; }
		await new Promise(r => setTimeout(r, 500));
	}
	throw new Error(`Server at ${url} did not start within ${timeoutMs}ms`);
}

main();
