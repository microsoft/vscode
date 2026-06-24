/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

/**
 * Compile .scenario.md files into .commands.json using Copilot CLI.
 *
 * For each scenario, this script:
 * 1. Starts the web server and opens the Sessions window in playwright-cli
 * 2. Takes a snapshot of the current page state
 * 3. Sends each step + snapshot to Copilot CLI to get the playwright-cli commands
 * 4. Executes the commands (to advance UI state for the next step)
 * 5. Writes the compiled commands to a .commands.json file
 *
 * Usage:
 *   node generate.cjs                    # compile all scenarios
 *   node generate.cjs 01-repo-picker     # compile matching scenario(s)
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const {
	APP_ROOT,
	discoverScenarios,
	runPlaywrightCli,
	getSnapshot,
	startServer,
	waitForServer,
	commandsPathForScenario,
} = require('./common.cjs');

const PORT = 9100 + Math.floor(Math.random() * 900);
const BASE_URL = `http://localhost:${PORT}/?skip-sessions-welcome`;

const SYSTEM_PROMPT = [
	'You are a test automation assistant. Given a snapshot of a web page\'s',
	'accessibility tree and a test step written in natural language, output the',
	'exact semantic commands needed to execute that step.',
	'',
	'Rules:',
	'- Output ONLY the commands, one per line. No explanation, no markdown.',
	'- Use SEMANTIC selectors with role and label, NOT element refs.',
	'  Examples:',
	'    click button "Send"',
	'    click textbox "Chat input"',
	'    click listitem "Today sessions section"',
	'    click tab "Changes - 3 files changed"',
	'    click treeitem "build.ts"',
	'- The format is: <action> <role> "<label>"',
	'- For typing text, use: type "the text here"',
	'- For pressing keys, use: press Enter (or other key name)',
	'- For assertions that something is visible, output: # ASSERT_VISIBLE: the text to check for',
	'- For assertions that a button is disabled, output: # ASSERT_DISABLED: the button label',
	'- For assertions that a button is enabled, output: # ASSERT_ENABLED: the button label',
	'- Icon characters (like codicons from the Unicode Private Use Area) appear in labels.',
	'  Strip them from your selectors — match by readable text only.',
	'- For labels with leading/trailing whitespace or icon chars, use only the readable text portion.',
	'- NEVER use element refs like e43, e155, etc. Always use role "label" selectors.',
	'- NEVER include dates, times, or timestamps in selectors — they change between runs.',
	'  Use only the stable portion of the label. For example, instead of:',
	'    click listitem "Background session explain the code (Completed), created 3/5/2026, 8:48:50 PM"',
	'  Use:',
	'    click listitem "explain the code"',
].join('\n');

// ---------------------------------------------------------------------------
// Ask Copilot CLI to translate a step
// ---------------------------------------------------------------------------

function askCopilot(step, snapshot) {
	const prompt = `Snapshot:\n\`\`\`\n${snapshot}\n\`\`\`\n\nStep: ${step}\n\nOutput the semantic commands:`;

	const result = cp.spawnSync('copilot', ['-p', `${SYSTEM_PROMPT}\n\n${prompt}`, '--model', 'claude-sonnet-4.6'], {
		cwd: APP_ROOT,
		stdio: ['ignore', 'pipe', 'pipe'],
		timeout: 60_000,
		env: { ...process.env },
	});

	const stdout = (result.stdout || '').toString().trim();
	const stderr = (result.stderr || '').toString().trim();

	if (result.status !== 0) {
		throw new Error(`Copilot CLI failed: ${stderr || stdout}`);
	}

	return stdout.split('\n')
		.map(l => l.trim())
		.filter(l => l.length > 0);
}

// ---------------------------------------------------------------------------
// Resolve a semantic command to a ref-based command using a snapshot
// ---------------------------------------------------------------------------

function resolveSemanticCommand(cmd, snapshotText) {
	// Match: <action> <role> "<label>"
	const match = cmd.match(/^(click|focus)\s+(\w+)\s+"([^"]+)"$/);
	if (!match) { return cmd; }

	const [, action, role, label] = match;
	const needle = label.replace(/[\uE000-\uF8FF]/g, '').trim().toLowerCase();

	for (const line of snapshotText.split('\n')) {
		const refMatch = line.match(/\[ref=(e\d+)\]/);
		if (!refMatch) { continue; }
		if (!line.includes(role)) { continue; }
		const labelMatch = line.match(/"([^"]+)"/);
		if (!labelMatch) { continue; }
		const lineLabel = labelMatch[1].replace(/[\uE000-\uF8FF]/g, '').trim().toLowerCase();
		if (lineLabel.includes(needle) || needle.includes(lineLabel)) {
			return `${action} ${refMatch[1]}`;
		}
	}

	// Fallback: return as-is (will likely fail, but gives a clear error)
	console.error(`    ⚠ Could not resolve: ${cmd}`);
	return cmd;
}

// ---------------------------------------------------------------------------
// Compile a single scenario
// ---------------------------------------------------------------------------

function compileScenario(scenario) {
	console.log(`\n▶ Compiling: ${scenario.name}`);

	const compiledSteps = [];
	for (const [i, step] of scenario.steps.entries()) {
		console.log(`  step ${i + 1}: ${step}`);

		const snapshot = getSnapshot();
		if (!snapshot.stdout) {
			console.error(`    ⚠ Could not get snapshot, skipping step`);
			compiledSteps.push({ description: step, commands: [], error: 'Failed to get snapshot' });
			continue;
		}

		try {
			const commands = askCopilot(step, snapshot.stdout);
			console.log(`    → ${commands.join(' ; ')}`);

			compiledSteps.push({ description: step, commands });

			// Execute the commands to advance the UI state for the next step
			// Resolve semantic selectors to refs using the current snapshot
			for (const cmd of commands) {
				if (cmd.startsWith('#')) { continue; }
				const resolved = resolveSemanticCommand(cmd, snapshot.stdout);
				if (resolved !== cmd) {
					console.log(`      [resolve] ${cmd} → ${resolved}`);
				}
				const result = runPlaywrightCli(resolved);
				if (!result.ok) {
					console.error(`    ⚠ Command failed: ${resolved} — ${result.stderr}`);
				}
			}

			cp.spawnSync('sleep', ['1']);
		} catch (err) {
			console.error(`    ✗ ${err.message}`);
			compiledSteps.push({ description: step, commands: [], error: err.message });
		}
	}

	return {
		scenario: scenario.name,
		generatedAt: new Date().toISOString(),
		steps: compiledSteps,
	};
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	const filter = process.argv[2] || '';
	let scenarios = discoverScenarios();

	if (filter) {
		scenarios = scenarios.filter(s =>
			s.filePath.includes(filter) || s.name.toLowerCase().includes(filter.toLowerCase())
		);
	}

	if (scenarios.length === 0) {
		console.error('No scenarios found' + (filter ? ` matching "${filter}"` : ''));
		process.exit(1);
	}

	console.log(`Found ${scenarios.length} scenario(s) to compile`);

	// Start web server
	console.log(`Starting sessions web server on port ${PORT}…`);
	const server = startServer(PORT, { mock: true });
	await waitForServer(`http://localhost:${PORT}/`, 30_000);
	console.log('Server ready.');

	// Open browser
	const openResult = runPlaywrightCli(['open', '--headed']);
	if (!openResult.ok) {
		console.error('Failed to open browser:', openResult.stdout, openResult.stderr);
		cleanup(server);
		process.exit(1);
	}
	const gotoResult = runPlaywrightCli(['goto', BASE_URL]);
	if (!gotoResult.ok) {
		console.error('Failed to navigate:', gotoResult.stdout, gotoResult.stderr);
		cleanup(server);
		process.exit(1);
	}

	// Wait for workbench to render
	cp.spawnSync('sleep', ['5']);

	for (const scenario of scenarios) {
		// Reset state between scenarios
		runPlaywrightCli(['press', 'Escape']);
		runPlaywrightCli(['goto', BASE_URL]);
		cp.spawnSync('sleep', ['3']);

		const compiled = compileScenario(scenario);
		const outPath = commandsPathForScenario(scenario.filePath);
		fs.mkdirSync(path.dirname(outPath), { recursive: true });
		fs.writeFileSync(outPath, JSON.stringify(compiled, null, '\t') + '\n');
		console.log(`  ✓ Saved: ${outPath}`);
	}

	cleanup(server);
	console.log('\nDone.');
}

function cleanup(server) {
	runPlaywrightCli('close');
	server.kill('SIGTERM');
}

main();
