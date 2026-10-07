/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { dirname, join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ActionType, type ChatToolCallCompleteAction, type ChatToolCallReadyAction, type ChatToolCallStartAction } from '../../../../common/state/sessionActions.js';
import { buildDefaultChatUri, getInlineToolInput, ToolResultContentType, TurnState } from '../../../../common/state/sessionState.js';
import { fetchSessionWithChat, getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import { assertToolCallCompleteText, createRealSession, driveTurnToCompletion, driveTurnWithModelToCompletion, textFromContent } from '../harness/agentHostE2ETestHarness.js';
import { expandShellToolName } from '../harness/shellToolNames.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

interface ShellWorkspace {
	readonly sessionUri: string;
	readonly workspace: string;
	nextClientSeq: number;
}

const signalWorker = `
const fs = require('node:fs');
const name = process.argv[2];
const signal = name + '.release';
let finishing = false;
const watcher = fs.watch('.', () => finish());
fs.writeFileSync(name + '.state', 'ready');
console.log('WORKER_READY:' + name);
function finish() {
	if (finishing || !fs.existsSync(signal)) {
		return;
	}
	finishing = true;
	watcher.close();
	fs.writeFileSync(name + '.artifact', Array.from({ length: 24 }, (_, i) => name + '-module-' + i).join('\\n'));
	fs.writeFileSync(name + '.state', 'complete');
	console.log('WORKER_COMPLETE:' + name);
}
finish();
`;

const releaseWorker = `
const fs = require('node:fs');
for (const name of process.argv.slice(2)) {
	fs.writeFileSync(name + '.release', 'release');
}
console.log('RELEASED:' + process.argv.slice(2).join(','));
`;

const waitForWorker = `
const fs = require('node:fs');
const names = process.argv.slice(2);
const watcher = fs.watch('.', () => check());
function check() {
	if (names.every(name => fs.existsSync(name + '.state'))) {
		watcher.close();
		console.log('WORKERS_READY:' + names.join(','));
	}
}
check();
`;

/** Exercises native runtime shells, not the optional Agent Host terminal overrides. */
export function defineCopilotRuntimeShellCoverageTests(context: IAgentHostE2ETestContext): void {
	if (context.tier !== 'parity' || context.config.provider !== 'copilotcli') {
		return;
	}

	const shell = expandShellToolName('${shell}');
	const readShell = expandShellToolName('${read_shell}');
	const stopShell = expandShellToolName('${stop_shell}');
	const listShells = expandShellToolName('${list_shell}');
	const safety = 'Work only in this synthetic workspace. Do not install dependencies, use the network, or modify any other directory. Use the exact commands given. ';

	async function withWorkspace(prefix: string, files: Readonly<Record<string, string>>, run: (workspace: ShellWorkspace) => Promise<void>): Promise<void> {
		const parent = join(process.cwd(), '.build', 'agent-host-runtime-shell-workspaces');
		mkdirSync(parent, { recursive: true });
		const workspace = mkdtempSync(join(parent, `ahp-${prefix}-`));
		context.tempDirs.push(workspace);
		for (const [name, text] of Object.entries(files)) {
			const path = join(workspace, name);
			mkdirSync(dirname(path), { recursive: true });
			writeFileSync(path, text);
		}
		const sessionUri = await createRealSession(context.client, context.config, prefix, context.createdSessions, URI.file(workspace));
		try {
			await run({ sessionUri, workspace, nextClientSeq: 1 });
		} finally {
			// A release signal also lets a failed assertion drain any surviving worker.
			for (const name of ['builder', 'cancelled', 'first', 'second']) {
				writeFileSync(join(workspace, `${name}.release`), 'release');
			}
			await context.client.call('disposeSession', { channel: sessionUri }, 30_000);
			const index = context.createdSessions.indexOf(sessionUri);
			if (index >= 0) {
				context.createdSessions.splice(index, 1);
			}
		}
	}

	async function turn(session: ShellWorkspace, id: string, prompt: string, model?: string): Promise<void> {
		const clientSeq = session.nextClientSeq;
		session.nextClientSeq += 100;
		const instructions = `${safety}The session is already in the absolute working directory "${session.workspace}". All relative paths refer to it. Do not prepend cd, append checks, or add command prefixes, wrappers, pipelines, or extra arguments. Execute each command exactly as written, including any directory change explicitly provided in that command. ${prompt}`;
		if (model) {
			await driveTurnWithModelToCompletion(context.client, session.sessionUri, id, instructions, model, clientSeq);
		} else {
			await driveTurnToCompletion(context.client, session.sessionUri, id, instructions, clientSeq);
		}
		const state = await fetchSessionWithChat(context.client, session.sessionUri);
		assert.deepStrictEqual({
			state: state.turns.find(turn => turn.id === id)?.state,
			activeTurn: state.activeTurn,
		}, { state: TurnState.Complete, activeTurn: undefined });
	}

	function assertResult(session: ShellWorkspace, turnId: string, tool: string, expected: readonly RegExp[]): void {
		assertToolCallCompleteText(context.client, {
			channel: buildDefaultChatUri(session.sessionUri),
			turnId,
			toolNames: [tool],
			workspace: session.workspace,
			expected,
			success: true,
		});
	}

	function shellCompletions(session: ShellWorkspace, turnId: string): ChatToolCallCompleteAction[] {
		const channel = buildDefaultChatUri(session.sessionUri);
		const ids = new Set(context.client.receivedNotifications(n => isActionNotification(n, ActionType.ChatToolCallStart))
			.filter(n => getActionEnvelope(n).channel === channel)
			.map(n => getActionEnvelope(n).action as ChatToolCallStartAction)
			.filter(action => action.turnId === turnId && action.toolName === shell)
			.map(action => action.toolCallId));
		return context.client.receivedNotifications(n => isActionNotification(n, ActionType.ChatToolCallComplete))
			.filter(n => getActionEnvelope(n).channel === channel)
			.map(n => getActionEnvelope(n).action as ChatToolCallCompleteAction)
			.filter(action => action.turnId === turnId && ids.has(action.toolCallId));
	}

	function assertExitCodes(session: ShellWorkspace, turnId: string, expected: readonly number[]): void {
		const codes = shellCompletions(session, turnId)
			.flatMap(action => action.result.content ?? [])
			.filter(content => content.type === ToolResultContentType.Terminal)
			.flatMap(content => content.result ? [content.result.exitCode] : []);
		assert.deepStrictEqual(codes, expected);
	}

	function assertShellCommands(session: ShellWorkspace, turnId: string, expected: readonly string[]): void {
		const ids = new Set(shellCompletions(session, turnId).map(action => action.toolCallId));
		const commands = new Map(context.client.receivedNotifications(n => isActionNotification(n, ActionType.ChatToolCallReady))
			.map(n => getActionEnvelope(n).action as ChatToolCallReadyAction)
			.filter(action => ids.has(action.toolCallId))
			.map(action => [action.toolCallId, getInlineToolInput(action.toolInput)]));
		assert.deepStrictEqual([...commands.values()], expected);
	}

	function packageFiles(scripts: Readonly<Record<string, string>>): Record<string, string> {
		return {
			'package.json': JSON.stringify({ name: 'runtime-shell-fixture', version: '1.0.0', private: true, scripts }),
			'.npmrc': 'offline=true\naudit=false\nfund=false\nupdate-notifier=false\ncache=.npm-cache\n',
		};
	}

	// Completion notifications race model-request snapshots for attached async shells (KNOWN_ISSUES.md).
	(context.runRecordOnlyTests ? test : test.skip)('runtime coverage shell: reads a signal-controlled background build and stops its shell', async function () {
		this.timeout(240_000);
		await withWorkspace('shell-background-build', { 'worker.cjs': signalWorker, 'release.cjs': releaseWorker, 'ready.cjs': waitForWorker }, async session => {
			const id = 'shell-background-build';
			await turn(session, id, `Use ${shell} to launch exactly \`node worker.cjs builder\` with mode async and shellId runtime-builder. ` +
				`Run \`node ready.cjs builder\` in a separate synchronous shell, then call ${listShells} while the build is waiting. ` +
				'Run `node release.cjs builder` in another synchronous shell. ' +
				`Call ${readShell} for runtime-builder with delay 30 to drain its completed output. Then call ${stopShell} for runtime-builder.`);
			assertResult(session, id, listShells, [/runtime-builder/, /running/i]);
			assertResult(session, id, readShell, [/WORKER_COMPLETE:builder/, /exit code.*0/i]);
			assertResult(session, id, stopShell, [/runtime-builder.*stopped/i]);
			assert.deepStrictEqual({
				state: readFileSync(join(session.workspace, 'builder.state'), 'utf8'),
				modules: readFileSync(join(session.workspace, 'builder.artifact'), 'utf8').split('\n').length,
			}, { state: 'complete', modules: 24 });
		});
	});

	(context.runRecordOnlyTests ? test : test.skip)('runtime coverage shell: cancels a waiting watcher and runs a healthy follow-up command', async function () {
		this.timeout(240_000);
		await withWorkspace('shell-cancel-watcher', {
			'worker.cjs': signalWorker,
			'ready.cjs': waitForWorker,
			'healthy.cjs': `require('node:fs').writeFileSync('healthy.txt', 'HEALTHY_AFTER_STOP'); console.log('HEALTHY_AFTER_STOP');\n`,
		}, async session => {
			const id = 'shell-cancel-watcher';
			await turn(session, id, `Start \`node worker.cjs cancelled\` with ${shell}, mode async, shellId runtime-cancelled. ` +
				'Run `node ready.cjs cancelled` in a separate synchronous shell. ' +
				`Call ${listShells} to confirm it is running, then ${stopShell} on runtime-cancelled. ` +
				`Finally run \`node healthy.cjs\` synchronously with ${shell}. Do not release or restart the cancelled worker.`);
			assertResult(session, id, listShells, [/runtime-cancelled/, /running/i]);
			assertResult(session, id, stopShell, [/runtime-cancelled.*stopped/i]);
			assertResult(session, id, shell, [/HEALTHY_AFTER_STOP/]);
			assert.deepStrictEqual({
				cancelled: readFileSync(join(session.workspace, 'cancelled.state'), 'utf8'),
				cancelledArtifact: existsSync(join(session.workspace, 'cancelled.artifact')),
				followup: readFileSync(join(session.workspace, 'healthy.txt'), 'utf8'),
			}, { cancelled: 'ready', cancelledArtifact: false, followup: 'HEALTHY_AFTER_STOP' });
		});
	});

	(context.runRecordOnlyTests ? test : test.skip)('runtime coverage shell: manages two concurrent jobs without mixing their output', async function () {
		this.timeout(240_000);
		await withWorkspace('shell-concurrent-jobs', { 'worker.cjs': signalWorker, 'release.cjs': releaseWorker, 'ready.cjs': waitForWorker }, async session => {
			const id = 'shell-concurrent-jobs';
			await turn(session, id, `Launch \`node worker.cjs first\` and \`node worker.cjs second\` with ${shell} in mode async, ` +
				`using shellIds runtime-first and runtime-second. Run \`node ready.cjs first second\` synchronously, then call ${listShells} before releasing either job. ` +
				`Run \`node release.cjs first second\` in another synchronous shell. ` +
				`Read each job with ${readShell}, delay 30. Stop both with ${stopShell}.`);
			assertResult(session, id, listShells, [/runtime-first/, /runtime-second/]);
			const channel = buildDefaultChatUri(session.sessionUri);
			const readIds = new Set(context.client.receivedNotifications(n => isActionNotification(n, ActionType.ChatToolCallStart))
				.filter(n => getActionEnvelope(n).channel === channel)
				.map(n => getActionEnvelope(n).action as ChatToolCallStartAction)
				.filter(action => action.turnId === id && action.toolName === readShell)
				.map(action => action.toolCallId));
			const requestedShells = new Map<string, string>();
			for (const notification of context.client.receivedNotifications(n => isActionNotification(n, ActionType.ChatToolCallReady))) {
				const action = getActionEnvelope(notification).action as ChatToolCallReadyAction;
				if (getActionEnvelope(notification).channel !== channel || action.turnId !== id || !readIds.has(action.toolCallId)) {
					continue;
				}
				const input: { shellId?: string } = JSON.parse(getInlineToolInput(action.toolInput) ?? '{}');
				assert.ok(typeof input.shellId === 'string');
				requestedShells.set(action.toolCallId, input.shellId);
			}
			const readResults = context.client.receivedNotifications(n => isActionNotification(n, ActionType.ChatToolCallComplete))
				.filter(n => getActionEnvelope(n).channel === channel)
				.map(n => getActionEnvelope(n).action as ChatToolCallCompleteAction)
				.filter(action => action.turnId === id && readIds.has(action.toolCallId))
				.map(action => {
					const content = action.result.content ?? [];
					const output = [textFromContent(content), ...content
						.filter(part => part.type === ToolResultContentType.Terminal)
						.map(part => part.result?.preview ?? '')].join('\n');
					return {
						shellId: requestedShells.get(action.toolCallId),
						success: action.result.success,
						first: output.includes('WORKER_COMPLETE:first'),
						second: output.includes('WORKER_COMPLETE:second'),
					};
				})
				.sort((left, right) => (left.shellId ?? '').localeCompare(right.shellId ?? ''));
			assert.deepStrictEqual(readResults, [
				{ shellId: 'runtime-first', success: true, first: true, second: false },
				{ shellId: 'runtime-second', success: true, first: false, second: true },
			]);
			assertResult(session, id, stopShell, [/runtime-first.*stopped/i]);
			assertResult(session, id, stopShell, [/runtime-second.*stopped/i]);
			assert.deepStrictEqual(['first', 'second'].map(name => readFileSync(join(session.workspace, `${name}.state`), 'utf8')), ['complete', 'complete']);
			assert.deepStrictEqual(['first', 'second'].map(name => readFileSync(join(session.workspace, `${name}.artifact`), 'utf8').split('\n')[0]), ['first-module-0', 'second-module-0']);
		});
	});

	test('runtime coverage shell: reuses a shell after a failed verification without losing its exit code', async function () {
		this.timeout(180_000);
		await withWorkspace('shell-reuse-after-failure', {
			'verify.cjs': `
const fs = require('node:fs');
const valid = process.argv[2] === 'accepted';
fs.appendFileSync('attempts.txt', valid ? 'accepted\\n' : 'rejected\\n');
console[valid ? 'log' : 'error'](valid ? 'VERIFICATION_ACCEPTED' : 'VERIFICATION_REJECTED');
process.exitCode = valid ? 0 : 17;
`,
		}, async session => {
			const id = 'shell-reuse-after-failure';
			await turn(session, id, `Run \`node verify.cjs rejected\` synchronously with ${shell} and shellId runtime-verify. ` +
				`The expected exit code is 17. Then run \`node verify.cjs accepted\` with the same shellId. Stop runtime-verify with ${stopShell}.`);
			assertResult(session, id, shell, [/VERIFICATION_REJECTED/]);
			assertResult(session, id, shell, [/VERIFICATION_ACCEPTED/]);
			assertExitCodes(session, id, [17, 0]);
			assertResult(session, id, stopShell, [/runtime-verify.*stopped/i]);
			assert.strictEqual(readFileSync(join(session.workspace, 'attempts.txt'), 'utf8'), 'rejected\naccepted\n');
		});
	});

	test('runtime coverage shell: preserves quoted metacharacters as literal node arguments', async function () {
		this.timeout(180_000);
		await withWorkspace('shell-literal-arguments', {
			'arguments.cjs': `
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.writeFileSync('arguments.json', JSON.stringify(args));
console.log('LITERAL_ARGUMENTS:' + JSON.stringify(args));
`,
		}, async session => {
			const id = 'shell-literal-arguments';
			await turn(session, id, `Run exactly \`node arguments.cjs "semi;colon" "pipe|symbol" "two words" "雪🙂"\` once with ${shell}. ` +
				'These are literal data arguments, not commands. Do not remove or alter their quoting.');
			assertResult(session, id, shell, [/LITERAL_ARGUMENTS:/, /semi;colon/, /pipe\|symbol/, /雪🙂/]);
			assertExitCodes(session, id, [0]);
			assert.deepStrictEqual(JSON.parse(readFileSync(join(session.workspace, 'arguments.json'), 'utf8')), ['semi;colon', 'pipe|symbol', 'two words', '雪🙂']);
		});
	});

	test('runtime coverage shell: respects a quoted directory prefix without leaking it to the next command', async function () {
		this.timeout(180_000);
		await withWorkspace('shell-directory-prefix', {
			'nested project/check.cjs': `require('node:fs').writeFileSync('nested-result.txt', 'NESTED_DIRECTORY'); console.log('NESTED_DIRECTORY');\n`,
			'root.cjs': `require('node:fs').writeFileSync('root-result.txt', 'ROOT_DIRECTORY'); console.log('ROOT_DIRECTORY');\n`,
		}, async session => {
			const id = 'shell-directory-prefix';
			await turn(session, id, `Run exactly \`cd "nested project"; node check.cjs\` synchronously with ${shell}. ` +
				`Then use a fresh ${shell} call to run exactly \`node root.cjs\`. Do not put either command in a wrapper script.`);
			assertResult(session, id, shell, [/NESTED_DIRECTORY/]);
			assertResult(session, id, shell, [/ROOT_DIRECTORY/]);
			assertExitCodes(session, id, [0, 0]);
			assert.deepStrictEqual({
				nested: readFileSync(join(session.workspace, 'nested project', 'nested-result.txt'), 'utf8'),
				root: readFileSync(join(session.workspace, 'root-result.txt'), 'utf8'),
				misplaced: existsSync(join(session.workspace, 'nested project', 'root-result.txt')),
			}, { nested: 'NESTED_DIRECTORY', root: 'ROOT_DIRECTORY', misplaced: false });
		});
	});

	test('runtime coverage shell: runs a real local node test matrix with a passing TAP summary', async function () {
		this.timeout(180_000);
		await withWorkspace('shell-node-test-matrix', {
			'matrix.test.cjs': `
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
for (let i = 0; i < 48; i++) {
	test('serialization case ' + i, () => {
		assert.deepEqual(JSON.parse(JSON.stringify({ index: i, label: 'row-' + i })), { index: i, label: 'row-' + i });
		fs.appendFileSync('passed.txt', i + '\\n');
	});
}
`,
		}, async session => {
			const id = 'shell-node-test-matrix';
			await turn(session, id, `Run exactly \`node --test --test-reporter=tap matrix.test.cjs\` once with ${shell}. Report the test summary.`);
			assertResult(session, id, shell, [/# tests 48/, /# pass 48/, /# fail 0/]);
			assertExitCodes(session, id, [0]);
			assert.deepStrictEqual(readFileSync(join(session.workspace, 'passed.txt'), 'utf8').trim().split('\n').map(Number), Array.from({ length: 48 }, (_, i) => i));
		});
	});

	test('runtime coverage shell: diagnoses an actual test failure then patches and retests it', async function () {
		this.timeout(240_000);
		await withWorkspace('shell-patch-failing-test', {
			'math.cjs': 'exports.add = (left, right) => left - right;\n',
			'math.test.cjs': `
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
test('addition keeps both operands', () => {
	assert.equal(require('./math.cjs').add(4, 3), 7);
	fs.writeFileSync('passed.txt', 'ADDITION_VERIFIED');
});
`,
		}, async session => {
			const id = 'shell-patch-failing-test';
			const patch = '*** Begin Patch\n*** Update File: math.cjs\n@@\n-exports.add = (left, right) => left - right;\n+exports.add = (left, right) => left + right;\n*** End Patch';
			await turn(session, id, `Run \`node --test --test-reporter=tap math.test.cjs\` with ${shell}. ` +
				'After observing its assertion failure, call apply_patch with this exact patch, without substituting another editing tool. ' +
				`Run the same test command again with ${shell}. Do not change the test.\n${patch}`, 'gpt-5.6-sol');
			assertResult(session, id, shell, [/addition keeps both operands/, /# fail 1/]);
			assertResult(session, id, 'apply_patch', [/math\.cjs/]);
			assertResult(session, id, shell, [/# pass 1/, /# fail 0/]);
			assertExitCodes(session, id, [1, 0]);
			assert.deepStrictEqual({
				source: readFileSync(join(session.workspace, 'math.cjs'), 'utf8'),
				result: readFileSync(join(session.workspace, 'passed.txt'), 'utf8'),
			}, { source: 'exports.add = (left, right) => left + right;\n', result: 'ADDITION_VERIFIED' });
		});
	});

	test('runtime coverage shell: compacts repeated real node warnings while retaining the build result', async function () {
		this.timeout(180_000);
		await withWorkspace('shell-node-warning-build', {
			'build.cjs': `
const fs = require('node:fs');
for (let i = 0; i < 64; i++) {
	process.emitWarning('Legacy fixture loader used by the generated module build', { type: 'DeprecationWarning', code: 'FIXTURE_LOADER' });
}
fs.writeFileSync('bundle.txt', Array.from({ length: 64 }, (_, i) => 'module-' + i).join('\\n'));
console.log('BUILD_COMPLETE:64');
`,
		}, async session => {
			const id = 'shell-node-warning-build';
			await turn(session, id, `Run exactly \`node build.cjs\` once with ${shell}. Report its build result and the warning category.`);
			assertShellCommands(session, id, ['node build.cjs']);
			assertResult(session, id, shell, [/BUILD_COMPLETE:64/, /FIXTURE_LOADER/, /node warnings: omitted \d+ repeated warning/]);
			assertExitCodes(session, id, [0]);
			assert.strictEqual(readFileSync(join(session.workspace, 'bundle.txt'), 'utf8').split('\n').length, 64);
		});
	});

	test('runtime coverage shell: preserves diagnostics across colored local package build progress', async function () {
		this.timeout(180_000);
		await withWorkspace('shell-colored-build', {
			...packageFiles({ build: 'node build.cjs' }),
			'build.cjs': `
const fs = require('node:fs');
const modules = [];
for (let i = 0; i < 128; i++) {
	const value = 'export const module' + i + ' = ' + i + ';';
	modules.push(value);
	process.stdout.write('\\x1b[32mBuilding module ' + i + '/128\\x1b[0m\\r');
}
process.stdout.write('\\n');
console.error('\\x1b[33mBUILD_WARNING: optional source maps were not requested\\x1b[0m');
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/bundle.mjs', modules.join('\\n'));
console.log('BUILD_SUCCESS:128');
`,
		}, async session => {
			const id = 'shell-colored-build';
			await turn(session, id, `Run exactly \`node --run build\` with ${shell}. This invokes the local package.json build script. Do not install anything.`);
			assertResult(session, id, shell, [/BUILD_WARNING: optional source maps/, /BUILD_SUCCESS:128/]);
			assertExitCodes(session, id, [0]);
			const bundle = readFileSync(join(session.workspace, 'dist', 'bundle.mjs'), 'utf8');
			assert.deepStrictEqual({ modules: bundle.split('\n').length, last: bundle.split('\n').at(-1) }, { modules: 128, last: 'export const module127 = 127;' });
		});
	});

	test('runtime coverage shell: packages a real local npm tarball and keeps its summary after compaction', async function () {
		this.timeout(180_000);
		const files: Record<string, string> = packageFiles({});
		for (let i = 0; i < 180; i++) {
			files[`lib/module-${String(i).padStart(3, '0')}.cjs`] = `exports.index = ${i};\n`;
		}
		await withWorkspace('shell-npm-pack', files, async session => {
			const id = 'shell-npm-pack';
			await turn(session, id, `Run exactly \`npm --offline pack --ignore-scripts\` once with ${shell}. This packages local files only.`);
			assertResult(session, id, shell, [/runtime-shell-fixture-1\.0\.0\.tgz/, /Tarball Details/, /npm pack tarball contents: omitted/]);
			assertExitCodes(session, id, [0]);
			const archive = readFileSync(join(session.workspace, 'runtime-shell-fixture-1.0.0.tgz'));
			assert.deepStrictEqual({ magic: [...archive.subarray(0, 2)], modules: readdirSync(join(session.workspace, 'lib')).length }, { magic: [0x1f, 0x8b], modules: 180 });
		});
	});

	test('runtime coverage shell: pages a saved build log to recover a middle diagnostic', async function () {
		this.timeout(240_000);
		await withWorkspace('shell-paged-build-log', {
			'modules.json': JSON.stringify(Array.from({ length: 6000 }, (_, index) => ({ index, value: `export const module${index} = ${index};` }))),
			'build-log.cjs': `
const fs = require('node:fs');
const modules = JSON.parse(fs.readFileSync('modules.json', 'utf8'));
const compiled = [];
for (const module of modules) {
	const i = module.index + 1;
	compiled.push(module.value);
	console.log(i === 3000 ? 'BUILD_DIAGNOSTIC:3000:missing optional map for module-2999' : 'built module-' + i + ' ' + 'x'.repeat(96));
}
fs.writeFileSync('bundle.mjs', compiled.join('\\n'));
`,
		}, async session => {
			const id = 'shell-paged-build-log';
			await turn(session, id, `Run exactly \`node build-log.cjs\` once with ${shell}. Its output is intentionally too large. ` +
				'Use view with view_range [2998, 3002] on the full-output file named in the tool result to inspect the middle build diagnostic. ' +
				'Do not rerun the build or read the generator source.');
			assertResult(session, id, shell, [/Saved to:|full output.*saved to|Full output.*saved|Full output.*written/i]);
			assertResult(session, id, 'view', [/BUILD_DIAGNOSTIC:3000:missing optional map/, /built module-2998/, /built module-3002/]);
			assertExitCodes(session, id, [0]);
			assert.strictEqual(readFileSync(join(session.workspace, 'bundle.mjs'), 'utf8').split('\n').length, 6000);
		});
	});

	test('runtime coverage shell: recovers a large single-line Unicode manifest without corrupting its data', async function () {
		this.timeout(240_000);
		await withWorkspace('shell-unicode-manifest', {
			'manifest.cjs': `
const rows = Array.from({ length: 5000 }, (_, index) => ({ index, label: '雪🙂-' + index, payload: 'z'.repeat(80) }));
console.log(JSON.stringify({ kind: 'build-manifest', rows }));
`,
			'recover.cjs': `
const fs = require('node:fs');
const line = fs.readFileSync(process.argv[2], 'utf8').split(/\\r?\\n/).find(line => line.startsWith('{"kind":"build-manifest"'));
const manifest = JSON.parse(line);
const result = { count: manifest.rows.length, first: manifest.rows[0].label, last: manifest.rows.at(-1).label };
fs.writeFileSync('recovered.json', JSON.stringify(result));
console.log('MANIFEST_RECOVERED:' + JSON.stringify(result));
`,
		}, async session => {
			const id = 'shell-unicode-manifest';
			await turn(session, id, `Run \`node manifest.cjs\` with ${shell}. Use the full-output file path returned by that tool, ` +
				`then run \`node recover.cjs "<full-output-file-path>"\` with ${shell}. Do not rerun manifest.cjs or edit either script.`);
			assertResult(session, id, shell, [/Saved to:|full output.*saved to|Full output.*saved|Full output.*written/i]);
			assertResult(session, id, shell, [/MANIFEST_RECOVERED:/, /"count":5000/, /雪🙂-4999/]);
			assertExitCodes(session, id, [0, 0]);
			assert.deepStrictEqual(JSON.parse(readFileSync(join(session.workspace, 'recovered.json'), 'utf8')), { count: 5000, first: '雪🙂-0', last: '雪🙂-4999' });
		});
	});

	test('runtime coverage shell: finds stderr failure details in saved stdout-heavy build output', async function () {
		this.timeout(240_000);
		await withWorkspace('shell-large-build-failure', {
			'assets.json': JSON.stringify(Array.from({ length: 6000 }, (_, index) => ({ index, value: 'asset-' + index }))),
			'build.cjs': `
const fs = require('node:fs');
const assets = JSON.parse(fs.readFileSync('assets.json', 'utf8'));
const compiled = [];
for (const asset of assets) {
	compiled.push(asset.value.toUpperCase());
	fs.writeSync(1, 'BUILD_PROGRESS:' + asset.index + ':' + 'p'.repeat(100) + '\\n');
}
try {
	const manifest = JSON.parse(fs.readFileSync('asset-manifest.json', 'utf8'));
	fs.writeFileSync('bundle.json', JSON.stringify({ compiled, manifest }));
} catch (error) {
	fs.writeSync(2, 'BUILD_FAILED:CONFIG_MISSING:required asset manifest was not found:' + error.code + '\\n');
	process.exitCode = 2;
}
`,
		}, async session => {
			const id = 'shell-large-build-failure';
			await turn(session, id, `Run exactly \`node build.cjs\` once with ${shell}. The expected exit code is 2. ` +
				'Use grep on the saved full-output file from the tool result to find BUILD_FAILED and diagnose the failure. Do not rerun the build.');
			assertResult(session, id, shell, [/Saved to:|full output.*saved to|Full output.*saved|Full output.*written/i]);
			assertResult(session, id, 'grep', [/BUILD_FAILED:CONFIG_MISSING:required asset manifest was not found/]);
			assertExitCodes(session, id, [2]);
			assert.strictEqual(existsSync(join(session.workspace, 'bundle.json')), false);
		});
	});

	test('runtime coverage shell: filters structured test output using its saved file rather than rerunning tests', async function () {
		this.timeout(240_000);
		await withWorkspace('shell-structured-test-report', {
			'report.cjs': `
const assert = require('node:assert/strict');
let failed = false;
for (let i = 0; i < 4500; i++) {
	let status = 'passed';
	let details = 'fixture serialization ' + 'r'.repeat(70);
	try {
		const label = '雪🙂-' + i;
		const encoding = i === 2718 ? 'ascii' : 'utf8';
		assert.equal(Buffer.from(label, 'utf8').toString(encoding), label);
	} catch {
		failed = true;
		status = 'failed';
		details = 'REPORT_FAILURE: expected UTF-8 roundtrip';
	}
	console.log(JSON.stringify({ test: 'case-' + i, status, details }));
}
process.exitCode = failed ? 1 : 0;
`,
			'filter.cjs': `
const fs = require('node:fs');
const rows = fs.readFileSync(process.argv[2], 'utf8').split(/\\r?\\n/).filter(line => line.startsWith('{"test":')).map(line => JSON.parse(line));
const result = { total: rows.length, failures: rows.filter(row => row.status === 'failed').map(row => ({ test: row.test, details: row.details })) };
fs.writeFileSync('failures.json', JSON.stringify(result));
console.log('TEST_REPORT_FILTERED:' + JSON.stringify(result));
`,
		}, async session => {
			const id = 'shell-structured-test-report';
			await turn(session, id, `Run \`node report.cjs\` exactly once with ${shell}. This is a local test runner JSON report. ` +
				`Run \`node filter.cjs "<full-output-file-path>"\` with ${shell}, using the saved file named by the first result. Do not edit the scripts or regenerate the report.`);
			assertResult(session, id, shell, [/Saved to:|full output.*saved to|Full output.*saved|Full output.*written/i]);
			assertResult(session, id, shell, [/TEST_REPORT_FILTERED:/, /REPORT_FAILURE: expected UTF-8 roundtrip/]);
			assertExitCodes(session, id, [1, 0]);
			assert.deepStrictEqual(JSON.parse(readFileSync(join(session.workspace, 'failures.json'), 'utf8')), {
				total: 4500,
				failures: [{ test: 'case-2718', details: 'REPORT_FAILURE: expected UTF-8 roundtrip' }],
			});
		});
	});

	test('runtime coverage shell: applies a module move and obsolete-file deletion before an offline npm test', async function () {
		this.timeout(240_000);
		await withWorkspace('shell-patch-module-move', {
			...packageFiles({ test: 'node --test --test-reporter=tap contract.test.cjs' }),
			'old-name.cjs': 'exports.label = "before";\n',
			'obsolete.txt': 'remove this obsolete fixture\n',
			'contract.test.cjs': `
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
test('renamed module contract', () => {
	assert.equal(require('./new-name.cjs').label, 'after');
	assert.equal(fs.existsSync('old-name.cjs'), false);
	assert.equal(fs.existsSync('obsolete.txt'), false);
	fs.writeFileSync('contract.txt', 'MODULE_MOVE_VERIFIED');
});
`,
		}, async session => {
			const id = 'shell-patch-module-move';
			const patch = '*** Begin Patch\n*** Update File: old-name.cjs\n*** Move to: new-name.cjs\n@@\n-exports.label = "before";\n+exports.label = "after";\n*** Delete File: obsolete.txt\n*** End Patch';
			await turn(session, id, `Call apply_patch exactly once with this exact patch. Then run exactly \`npm --offline test\` with ${shell}. ` +
				`Do not substitute a different editing tool or modify contract.test.cjs.\n${patch}`, 'gpt-5.6-sol');
			assertResult(session, id, 'apply_patch', [/new-name\.cjs/, /obsolete\.txt/]);
			assertResult(session, id, shell, [/renamed module contract/, /# pass 1/, /# fail 0/]);
			assertExitCodes(session, id, [0]);
			assert.deepStrictEqual({
				oldFile: existsSync(join(session.workspace, 'old-name.cjs')),
				obsolete: existsSync(join(session.workspace, 'obsolete.txt')),
				source: readFileSync(join(session.workspace, 'new-name.cjs'), 'utf8'),
				result: readFileSync(join(session.workspace, 'contract.txt'), 'utf8'),
			}, { oldFile: false, obsolete: false, source: 'exports.label = "after";\n', result: 'MODULE_MOVE_VERIFIED' });
		});
	});
}
