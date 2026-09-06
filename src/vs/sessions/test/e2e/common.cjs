/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

/**
 * Shared helpers for the Sessions E2E test infrastructure.
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const APP_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const SCENARIOS_DIR = path.join(__dirname, 'scenarios');

// ---------------------------------------------------------------------------
// Scenario parser
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
// playwright-cli wrapper
// ---------------------------------------------------------------------------

function runPlaywrightCli(args) {
	const argList = Array.isArray(args)
		? args
		: (args.match(/"[^"]*"|\S+/g) || []).map(s => s.replace(/^"|"$/g, ''));
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

function getSnapshot() {
	const result = runPlaywrightCli(['snapshot']);
	if (!result.ok) {
		console.error(`  [snapshot] failed: ${result.stderr}`);
		return {
			stdout: '',
			path: ''
		};
	}
	const fileMatch = result.stdout.match(/\[Snapshot\]\((.+?\.yml)\)/);
	let pathStr = '';
	if (fileMatch) {
		pathStr = path.join(APP_ROOT, fileMatch[1]);
		try {
			const content = fs.readFileSync(pathStr, 'utf-8');
			if (!content.trim()) { console.error(`  [snapshot] file is empty`); }
			return { stdout: content, path: pathStr };
		} catch (e) {
			console.error(`  [snapshot] failed to read: ${e.message}`);
		}
	}
	return {
		stdout: result.stdout,
		path: pathStr
	};
}

// ---------------------------------------------------------------------------
// Server management
// ---------------------------------------------------------------------------

function startServer(port, { mock = false } = {}) {
	const args = ['--no-open', '--port', String(port)];
	if (mock) { args.push('--mock'); }
	const server = cp.spawn(process.execPath, [
		path.join(APP_ROOT, 'scripts', 'code-sessions-web.js'),
		...args,
	], {
		cwd: APP_ROOT,
		stdio: ['ignore', 'pipe', 'pipe'],
		env: { ...process.env },
	});
	server.stdout.on('data', () => { });
	server.stderr.on('data', () => { });
	return server;
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

// ---------------------------------------------------------------------------
// Commands file paths
// ---------------------------------------------------------------------------

function commandsPathForScenario(scenarioPath) {
	const dir = path.join(path.dirname(scenarioPath), 'generated');
	const name = path.basename(scenarioPath, '.scenario.md') + '.commands.json';
	return path.join(dir, name);
}

module.exports = {
	APP_ROOT,
	SCENARIOS_DIR,
	parseScenario,
	discoverScenarios,
	runPlaywrightCli,
	getSnapshot,
	startServer,
	waitForServer,
	commandsPathForScenario,
};
