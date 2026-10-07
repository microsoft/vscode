/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, truncateSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { retry } from '../../../../../../base/common/async.js';
import { basename, dirname, join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import type { SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { CustomizationEnablementKind } from '../../../../common/state/protocol/state.js';
import { ActionType } from '../../../../common/state/sessionActions.js';
import { buildDefaultChatUri, customizationId, CustomizationType, type ClientPluginCustomization, type PluginCustomization, type SessionState } from '../../../../common/state/sessionState.js';
import { getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import { assertToolCallCompleteText, createRealSession, driveTurnToCompletion } from '../harness/agentHostE2ETestHarness.js';
import { assertRecordedAhpSnapshot } from '../harness/ahpSnapshot.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

interface ILspTrace {
	readonly method?: string;
	readonly id?: number | string;
	readonly result?: object | null;
	readonly error?: { readonly code: number; readonly message: string };
	readonly direction?: 'clientToServer' | 'serverToClient';
	readonly event?: string;
	readonly cwd?: string;
	readonly environment?: { readonly marker: string; readonly fallback: string; readonly workspace: string; readonly pluginRoot: string };
	readonly params?: {
		readonly position?: { readonly line: number; readonly character: number };
		readonly context?: { readonly includeDeclaration: boolean };
		readonly initializationOptions?: object;
		readonly textDocument?: { readonly uri: string; readonly text?: string; readonly languageId?: string };
		readonly capabilities?: { readonly workspace?: { readonly didChangeWatchedFiles?: { readonly dynamicRegistration?: boolean; readonly relativePatternSupport?: boolean } } };
		readonly changes?: readonly { readonly uri: string; readonly type: number }[];
	};
}

interface ILspWatcher {
	readonly globPattern: string | { readonly baseUri: string | { readonly uri: string; readonly name: string }; readonly pattern: string };
	readonly kind?: number;
}

interface ILspWatchRegistration {
	readonly id: string;
	readonly watchers: readonly ILspWatcher[];
}

interface ILspWatchControl {
	readonly method: 'client/registerCapability' | 'client/unregisterCapability';
	readonly registrations?: readonly ILspWatchRegistration[];
	readonly unregisterIds?: readonly string[];
}

interface ILspInput {
	readonly operation: string;
	readonly file?: string;
	readonly line?: number;
	readonly character?: number;
	readonly includeDeclaration?: boolean;
	readonly newName?: string;
	readonly query?: string;
	readonly language?: string;
}

interface ILspFixtureOptions {
	readonly configuration?: 'file' | 'manifest' | 'fallback';
	readonly scenario?: 'normal' | 'empty' | 'error-once' | 'callbacks' | 'watch';
	readonly secondServer?: boolean;
	readonly launchExpansion?: boolean;
	readonly watchMode?: 'root' | 'relative' | 'overlap';
}

const lspServer = String.raw`
const { appendFileSync, existsSync, readFileSync, unlinkSync } = require('fs');
const { join } = require('path');
const { pathToFileURL } = require('url');
const trace = process.argv[2];
const label = process.argv[3];
const documents = new Map();
let pending = Buffer.alloc(0);
let scenario = 'normal';
let firstFailure = true;
let callbacksPending = 0;
let watchSequence = 0;
let watchReady = false;
let watchRegistrationError;
let watchRegistrations = [];
const watchCallbacks = new Map();
const waiting = [];
const range = (line = 0, start = 0, end = 5) => ({ start: { line, character: start }, end: { line, character: end } });
const uri = name => pathToFileURL(join(process.cwd(), name)).href;
const location = (name, line = 0) => ({ uri: uri(name), range: range(line) });
const item = (name, file = 'fixture.rtlang') => ({
	name, kind: 12, uri: uri(file), range: range(), selectionRange: range()
});
const record = message => appendFileSync(trace, JSON.stringify(message) + '\n');
const send = message => {
	if (scenario === 'watch') {
		record({ ...message, direction: 'serverToClient' });
	}
	const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...message }));
	process.stdout.write('Content-Length: ' + body.length + '\r\n\r\n');
	process.stdout.write(body);
};
const respond = (id, result) => send({ id, result });
const watchRequest = (method, params, onReply) => {
	const id = 'runtime-watch-' + (++watchSequence);
	callbacksPending++;
	const guard = setTimeout(() => {
		record({ event: 'watchCallbackTimeout', id });
		process.exit(3);
	}, 20000);
	guard.unref();
	watchCallbacks.set(id, { guard, onReply });
	send({ id, method, params });
};
const watchRegistrationParams = registrations => ({
	registrations: registrations.map(registration => ({
		id: registration.id, method: 'workspace/didChangeWatchedFiles',
		registerOptions: { watchers: registration.watchers }
	}))
});
const takeWatchControl = () => {
	const path = join(process.cwd(), 'lsp-control.json');
	if (!existsSync(path)) { return undefined; }
	const control = JSON.parse(readFileSync(path, 'utf8'));
	unlinkSync(path);
	return control;
};
record({ event: 'spawn', cwd: process.cwd(), environment: {
	marker: process.env.RUNTIME_MARKER || '',
	fallback: process.env.RUNTIME_FALLBACK || '',
	workspace: process.env.RUNTIME_WORKSPACE || '',
	pluginRoot: process.env.RUNTIME_PLUGIN_ROOT || ''
} });
const runOperation = message => {
	const { id, method, params = {} } = message;
	if (scenario === 'empty') {
		respond(id, method === 'textDocument/hover' ? null : []);
		return;
	}
	if (scenario === 'error-once' && method === 'textDocument/documentSymbol' && firstFailure) {
		firstFailure = false;
		send({ id, error: { code: -32603, message: 'RUNTIME_LSP_RECOVERABLE_ERROR' } });
		return;
	}
	switch (method) {
		case 'textDocument/definition':
			respond(id, [{ targetUri: uri('definition.rtlang'), targetRange: range(1), targetSelectionRange: range(1) }]);
			break;
		case 'textDocument/references':
			respond(id, [location('fixture.rtlang'), location('reference.rtlang', 1)]);
			break;
		case 'textDocument/implementation':
			respond(id, location('implementation.rtlang', 2));
			break;
		case 'textDocument/hover':
			if (scenario === 'watch') {
				const control = takeWatchControl();
				if (control) {
					const controlParams = control.method === 'client/registerCapability'
						? watchRegistrationParams(control.registrations)
						: { unregisterations: control.unregisterIds.map(id => ({ id, method: 'workspace/didChangeWatchedFiles' })) };
					watchRequest(control.method, controlParams, () => respond(id, { contents: 'RUNTIME_WATCH_CONTROL_ACK' }));
					break;
				}
			}
			respond(id, { contents: [
				{ language: 'rtlang', value: 'RUNTIME_HOVER_' + label },
				'RUNTIME_DOCUMENT:' + (documents.get(params.textDocument.uri) || '').trim(),
				...(scenario === 'watch' ? [watchReady ? 'RUNTIME_WATCH_READY' : 'RUNTIME_WATCH_REGISTRATION_ERROR:' + watchRegistrationError] : [])
			] });
			break;
		case 'textDocument/documentSymbol':
			respond(id, [{ name: 'RuntimeContainer', kind: 5, range: range(), selectionRange: range(), children: [
				{ name: 'runtimeChild', kind: 6, range: range(1), selectionRange: range(1) }
			] }]);
			break;
		case 'workspace/symbol':
			respond(id, [
				{ name: 'RuntimeWorkspace_' + label, kind: 12, containerName: 'RuntimeContainer', location: location('fixture.rtlang') },
				{ name: 'RuntimeUnresolved_' + label, kind: 5, location: { uri: uri('reference.rtlang') } }
			]);
			break;
		case 'textDocument/prepareCallHierarchy':
			respond(id, [item('runtimeTarget')]);
			break;
		case 'callHierarchy/incomingCalls':
			respond(id, [{ from: item('runtimeCaller', 'reference.rtlang'), fromRanges: [range(1), range(2)] }]);
			break;
		case 'callHierarchy/outgoingCalls':
			respond(id, [{ to: item('runtimeCallee', 'definition.rtlang'), fromRanges: [range(2)] }]);
			break;
		case 'textDocument/prepareRename':
			respond(id, { range: range(0, 3, 8), placeholder: 'alpha' });
			break;
		case 'textDocument/rename':
			respond(id, { changes: {
				[uri('fixture.rtlang')]: [{ range: range(0, 3, 8), newText: params.newName }],
				[uri('reference.rtlang')]: [{ range: range(0, 0, 5), newText: params.newName }]
			} });
			break;
		default:
			respond(id, null);
	}
};
const handle = message => {
	record(scenario === 'watch' ? { ...message, direction: 'clientToServer' } : message);
	const { id, method, params = {} } = message;
	if (!method) {
		if (typeof id === 'string' && id.startsWith('runtime-')) {
			const watchCallback = watchCallbacks.get(id);
			if (watchCallback) {
				clearTimeout(watchCallback.guard);
				watchCallbacks.delete(id);
				watchCallback.onReply(message);
			}
			if (id === 'runtime-progress') {
				send({ method: '$/progress', params: { token: 'runtime-loading', value: { kind: 'begin', title: 'Runtime indexing' } } });
				send({ method: '$/progress', params: { token: 'runtime-loading', value: { kind: 'end' } } });
			}
			callbacksPending--;
			if (callbacksPending === 0) {
				for (const request of waiting.splice(0)) {
					runOperation(request);
				}
			}
		}
		return;
	}
	if (method === 'initialize') {
		scenario = params.initializationOptions?.scenario || 'normal';
		watchRegistrations = params.initializationOptions?.watchRegistrations || [];
		respond(id, { capabilities: {
			textDocumentSync: { openClose: true, change: 1 },
			definitionProvider: true, referencesProvider: true, implementationProvider: true,
			hoverProvider: true, documentSymbolProvider: true, workspaceSymbolProvider: true,
			callHierarchyProvider: true, renameProvider: { prepareProvider: true }
		}, serverInfo: { name: 'runtime-synthetic-lsp', version: '1.0.0' } });
		return;
	}
	if (method === 'initialized') {
		if (scenario === 'callbacks') {
			callbacksPending = 3;
			send({ id: 'runtime-config', method: 'workspace/configuration', params: { items: [{ section: 'runtime' }] } });
			send({ id: 'runtime-folders', method: 'workspace/workspaceFolders', params: {} });
			send({ id: 'runtime-progress', method: 'window/workDoneProgress/create', params: { token: 'runtime-loading' } });
		} else if (scenario === 'watch') {
			watchRequest('client/registerCapability', watchRegistrationParams(watchRegistrations), reply => {
				watchReady = !reply.error;
				watchRegistrationError = reply.error?.code;
			});
		}
		return;
	}
	if (method === 'textDocument/didOpen') {
		documents.set(params.textDocument.uri, params.textDocument.text);
		return;
	}
	if (method === 'textDocument/didClose') {
		documents.delete(params.textDocument.uri);
		return;
	}
	if (method === 'shutdown') {
		respond(id, null);
		return;
	}
	if (method === 'exit') {
		process.exit(0);
	}
	if (id !== undefined) {
		if (callbacksPending) {
			waiting.push(message);
		} else {
			runOperation(message);
		}
	}
};
process.stdin.on('data', chunk => {
	pending = Buffer.concat([pending, chunk]);
	while (true) {
		const headerEnd = pending.indexOf('\r\n\r\n');
		if (headerEnd < 0) { return; }
		const match = /Content-Length:\s*(\d+)/i.exec(pending.subarray(0, headerEnd).toString());
		if (!match) { process.exit(2); }
		const length = Number(match[1]);
		if (pending.length < headerEnd + 4 + length) { return; }
		const body = pending.subarray(headerEnd + 4, headerEnd + 4 + length);
		pending = pending.subarray(headerEnd + 4 + length);
		handle(JSON.parse(body.toString()));
	}
});
process.stdin.on('end', () => process.exit(0));
`;

export function defineCopilotRuntimeCustomizationCoverageTests(context: IAgentHostE2ETestContext): void {
	if (context.tier !== 'parity' || context.config.provider !== 'copilotcli') {
		return;
	}

	function customizationTest(title: string, run: () => Promise<void>): void {
		test(title, async function () {
			this.timeout(180_000);
			await run();
			await assertRecordedAhpSnapshot(this.test!, context.client, { profile: 'behavior' });
		});
	}

	function watcherTest(title: string, run: () => Promise<void>): void {
		context.registerTestEnvironment(title, {
			COPILOT_EXP_COPILOT_SWE_AGENT_LSP_FILE_WATCHER: 'true',
			COPILOT_FEATURE_FLAGS: 'copilot_swe_agent_lsp_file_watcher',
		});
		customizationTest(title, run);
	}

	function fixtureRoot(): { root: string; workspace: string; plugin: string } {
		const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'ahp-coverage-runtime-customization-')));
		context.tempDirs.push(root);
		const workspace = join(root, 'workspace');
		const plugin = join(root, 'plugin');
		mkdirSync(workspace);
		mkdirSync(join(plugin, '.plugin'), { recursive: true });
		execFileSync('git', ['init', '--quiet', workspace]);
		writeFileSync(join(plugin, '.plugin', 'plugin.json'), JSON.stringify({ name: 'runtime-customization' }));
		writeSkill(plugin, 'runtime-note', 'Returns the runtime skill sentinel', 'Reply exactly RUNTIME_SKILL_READY. Do not call tools.');
		return { root, workspace, plugin };
	}

	function writeSkill(plugin: string, name: string, description: string, body: string, frontmatter: readonly string[] = []): void {
		const directory = join(plugin, 'skills', name);
		mkdirSync(directory, { recursive: true });
		writeFileSync(join(directory, 'SKILL.md'), ['---', `name: ${name}`, `description: ${description}`, ...frontmatter, '---', body].join('\n'));
	}

	async function attachPlugin(workspace: string, plugin: string): Promise<string> {
		const clientId = 'runtime-customization-client';
		const sessionUri = await createRealSession(context.client, context.config, clientId, context.createdSessions, URI.file(workspace));
		const pluginUri = URI.file(plugin).toString();
		const customization: ClientPluginCustomization = {
			type: CustomizationType.Plugin, id: customizationId(pluginUri), uri: pluginUri,
			name: 'runtime-customization', nonce: '1',
			enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }],
		};
		context.client.dispatch({
			channel: sessionUri, clientSeq: 1,
			action: { type: ActionType.SessionActiveClientSet, activeClient: { clientId, tools: [], customizations: [customization] } },
		});
		await retry(async () => {
			const result = await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri });
			const pluginState = (result.snapshot!.state as SessionState).customizations?.find((item): item is PluginCustomization =>
				item.type === CustomizationType.Plugin && item.uri === pluginUri);
			assert.ok(pluginState?.children?.some(child => child.type === CustomizationType.Skill));
		}, 100, 100);
		// Snapshot the turn contract, not concurrent plugin resource materialization.
		context.client.clearAhpSnapshot();
		return sessionUri;
	}

	async function lspFixture(options: ILspFixtureOptions = {}) {
		const { workspace, plugin } = fixtureRoot();
		for (const [file, content] of [
			['fixture.rtlang', '😀 alpha\nruntimeChild\n'],
			['reference.rtlang', 'alpha\nruntimeCaller\nruntimeCallee\n'],
			['definition.rtlang', 'runtimeDefinition\nalpha\n'],
			['implementation.rtlang', 'runtimeInterface\nruntimeImplementation\nalpha\n'],
			['secondary.otherlang', 'runtimeSecondary\n'],
			['unsupported.txt', 'runtimeUnsupported\n'],
		]) {
			writeFileSync(join(workspace, file), content);
		}
		const watchDirectory = join(workspace, options.watchMode === 'relative' ? 'watched space Ω' : 'watched');
		let watchRegistrations: readonly ILspWatchRegistration[] = [];
		if (options.watchMode) {
			mkdirSync(join(watchDirectory, 'nested'), { recursive: true });
			writeFileSync(join(watchDirectory, 'seed.rtlang'), 'RUNTIME_WATCH_SEED\n');
			writeFileSync(join(watchDirectory, 'nested', 'child.rtlang'), 'RUNTIME_WATCH_CHILD\n');
			writeFileSync(join(watchDirectory, 'café😀.rtlang'), 'α😀\nRUNTIME_WATCH_UNICODE_BEFORE\n');
			watchRegistrations = options.watchMode === 'relative' ? [{
				id: 'runtime-relative',
				watchers: [{ globPattern: { baseUri: URI.file(watchDirectory).toString(), pattern: '**/*.rtlang' }, kind: 2 }],
			}] : options.watchMode === 'overlap' ? [{
				id: 'runtime-parent',
				watchers: [{ globPattern: { baseUri: { uri: URI.file(workspace).toString(), name: 'workspace' }, pattern: '**/*.rtlang' } }],
			}, {
				id: 'runtime-child',
				watchers: [{ globPattern: { baseUri: { uri: URI.file(watchDirectory).toString(), name: 'watched' }, pattern: '**/*.rtlang' } }],
			}] : [{ id: 'runtime-root', watchers: [{ globPattern: '**/*.rtlang' }] }];
		}
		writeFileSync(join(plugin, 'server.cjs'), lspServer);
		const trace = join(workspace, 'lsp-trace.jsonl');
		writeFileSync(trace, '');
		const server = {
			command: process.execPath,
			args: [join('${CLAUDE_PLUGIN_ROOT}', 'server.cjs'), join('${workspaceFolder}', 'lsp-trace.jsonl'), 'primary'],
			cwd: '${workspaceFolder}',
			env: {
				ELECTRON_RUN_AS_NODE: '1',
				...(options.launchExpansion ? {
					RUNTIME_MARKER: 'RUNTIME_ENV_OK', RUNTIME_FALLBACK: '${AHP_RUNTIME_MISSING_VARIABLE:-RUNTIME_DEFAULT_OK}',
					RUNTIME_WORKSPACE: '${workspaceFolder}', RUNTIME_PLUGIN_ROOT: '${CLAUDE_PLUGIN_ROOT}',
				} : {}),
			},
			fileExtensions: { '.rtlang': 'rtlang' },
			initializationOptions: {
				scenario: options.scenario ?? 'normal', marker: 'RUNTIME_INITIALIZATION_OK',
				...(options.watchMode ? { watchRegistrations } : {}),
			},
			requestTimeoutMs: 10_000, initializationTimeoutMs: 10_000, warmupTimeoutMs: 1_000,
		};
		const lspServers = {
			'runtime-primary': server,
			...(options.secondServer ? {
				'runtime-secondary': { ...server, args: [...server.args.slice(0, -1), 'secondary'], fileExtensions: { '.otherlang': 'otherlang' } },
			} : {}),
		};
		if (options.configuration === 'manifest') {
			writeFileSync(join(plugin, '.plugin', 'plugin.json'), JSON.stringify({ name: 'runtime-customization', lspServers }));
		} else if (options.configuration === 'fallback') {
			writeFileSync(join(plugin, '.lsp.json'), '{ this is deliberately invalid JSON');
			writeFileSync(join(plugin, 'lsp.json'), JSON.stringify({ lspServers }));
		} else {
			writeFileSync(join(plugin, '.lsp.json'), JSON.stringify({ lspServers }));
		}
		const sessionUri = await attachPlugin(workspace, plugin);
		return { sessionUri, workspace, plugin, trace, watchDirectory };
	}

	function messages(trace: string): ILspTrace[] {
		return readFileSync(trace, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line) as ILspTrace);
	}

	function overwriteFile(file: string, content: string): void {
		// Avoid O_CREAT so FSEvents does not classify an existing-file edit as another creation.
		writeFileSync(file, content, { flag: 'r+' });
		truncateSync(file, Buffer.byteLength(content));
	}

	function removeWatchedFile(fixture: Awaited<ReturnType<typeof lspFixture>>, file: string): void {
		if (process.platform === 'darwin') {
			// Move out of the watched root so FSEvents cannot coalesce unlink with a metadata change.
			const retired = join(fixture.plugin, `${basename(file)}.removed`);
			renameSync(file, retired);
			rmSync(retired);
		} else {
			rmSync(file);
		}
		assert.strictEqual(existsSync(file), false);
	}

	async function runLsp(fixture: Awaited<ReturnType<typeof lspFixture>>, input: ILspInput, expected: readonly RegExp[], success = true, turnId = 'runtime-lsp', clientSeq = 2): Promise<void> {
		const { file, ...parameters } = input;
		const fileInstruction = file ? `Set the file parameter to this exact absolute path: ${join(fixture.workspace, file)}. ` : '';
		await driveTurnToCompletion(context.client, fixture.sessionUri, turnId,
			`The workspace is ${fixture.workspace}. Call lsp exactly once with these parameters: ${JSON.stringify(parameters)}. ${fileInstruction}Do not call other tools. After the tool finishes, reply exactly RUNTIME_LSP_DONE.`, clientSeq);
		assertToolCallCompleteText(context.client, {
			channel: buildDefaultChatUri(fixture.sessionUri), turnId, toolNames: ['lsp'],
			workspace: fixture.workspace, expected, success,
		});
		const starts = context.client.receivedNotifications(n => isActionNotification(n, ActionType.ChatToolCallStart))
			.map(n => getActionEnvelope(n))
			.filter(envelope => envelope.channel === buildDefaultChatUri(fixture.sessionUri)
				&& envelope.action.type === ActionType.ChatToolCallStart && envelope.action.turnId === turnId);
		assert.deepStrictEqual(starts.map(envelope => envelope.action.type === ActionType.ChatToolCallStart ? envelope.action.toolName : ''), ['lsp']);
	}

	function canonicalFilePath(file: string): string {
		let ancestor = file;
		const suffix: string[] = [];
		while (!existsSync(ancestor)) {
			suffix.unshift(basename(ancestor));
			const parent = dirname(ancestor);
			assert.notStrictEqual(parent, ancestor);
			ancestor = parent;
		}
		const canonical = join(realpathSync.native(ancestor), ...suffix);
		return context.isWindows ? canonical.toLowerCase() : canonical;
	}

	function watchReplies(fixture: Awaited<ReturnType<typeof lspFixture>>): ILspTrace[] {
		return messages(fixture.trace).filter(message => message.direction === 'clientToServer'
			&& !message.method && typeof message.id === 'string' && message.id.startsWith('runtime-watch-'));
	}

	function assertWatchReply(fixture: Awaited<ReturnType<typeof lspFixture>>, sequence: number, errorCode?: number): void {
		const replies = watchReplies(fixture).filter(message => message.id === `runtime-watch-${sequence}`);
		assert.deepStrictEqual(replies.map(message => ({ result: message.result, errorCode: message.error?.code })),
			[{ result: errorCode === undefined ? null : undefined, errorCode }]);
	}

	async function watcherFixture(mode: NonNullable<ILspFixtureOptions['watchMode']> = 'root') {
		const fixture = await lspFixture({ scenario: 'watch', watchMode: mode });
		await runLsp(fixture, { operation: 'hover', file: 'fixture.rtlang', line: 1, character: 4 }, [/RUNTIME_WATCH_READY/], true, 'watch-initialized');
		assert.deepStrictEqual(messages(fixture.trace).find(message => message.method === 'initialize')?.params?.capabilities?.workspace?.didChangeWatchedFiles,
			{ dynamicRegistration: true, relativePatternSupport: true });
		assertWatchReply(fixture, 1);
		const seed = join(fixture.watchDirectory, 'seed.rtlang');
		await mutateWatchedFile(fixture, seed, 2, () => overwriteFile(seed, 'RUNTIME_WATCH_SEED\n'));
		return fixture;
	}

	async function waitWatchChange(fixture: Awaited<ReturnType<typeof lspFixture>>, file: string, type: number, after: number): Promise<void> {
		const expectedPath = canonicalFilePath(file);
		await retry(async () => {
			const changes = messages(fixture.trace).slice(after)
				.filter(message => message.direction === 'clientToServer' && message.method === 'workspace/didChangeWatchedFiles')
				.flatMap(message => message.params?.changes ?? []);
			assert.ok(changes.some(change => canonicalFilePath(URI.parse(change.uri).fsPath) === expectedPath && change.type === type),
				`Expected LSP watched-file change ${type} for ${file}; observed ${JSON.stringify(changes)}`);
		}, 100, 100);
	}

	async function mutateWatchedFile(fixture: Awaited<ReturnType<typeof lspFixture>>, file: string, type: number, mutate: () => void): Promise<void> {
		const after = messages(fixture.trace).length;
		mutate();
		await waitWatchChange(fixture, file, type, after);
	}

	async function controlWatch(fixture: Awaited<ReturnType<typeof lspFixture>>, control: ILspWatchControl, sequence: number, errorCode?: number): Promise<void> {
		writeFileSync(join(fixture.workspace, 'lsp-control.json'), JSON.stringify(control));
		await runLsp(fixture, { operation: 'hover', file: 'fixture.rtlang', line: 1, character: 4 }, [/^RUNTIME_WATCH_CONTROL_ACK$/],
			true, `watch-control-${sequence}`, sequence * 100);
		assertWatchReply(fixture, sequence, errorCode);
	}

	const position = { file: 'fixture.rtlang', line: 1, character: 4 };
	const operations: readonly { title: string; input: ILspInput; expected: readonly RegExp[]; method: string }[] = [
		{ title: 'definition links resolve target ranges', input: { operation: 'goToDefinition', ...position }, expected: [/definition\.rtlang:2/], method: 'textDocument/definition' },
		{ title: 'references preserve declaration exclusion and multiple locations', input: { operation: 'findReferences', ...position, includeDeclaration: false }, expected: [/Found 2 reference\(s\)/, /\$\{workdir\}\/fixture\.rtlang:\n\s+1:1/, /\$\{workdir\}\/reference\.rtlang:\n\s+2:1/], method: 'textDocument/references' },
		{ title: 'hover formats marked strings and document content', input: { operation: 'hover', ...position }, expected: [/```rtlang\nRUNTIME_HOVER_primary\n```/, /RUNTIME_DOCUMENT:😀 alpha/], method: 'textDocument/hover' },
		{ title: 'document symbols preserve nested symbol kinds', input: { operation: 'documentSymbol', file: 'fixture.rtlang' }, expected: [/RuntimeContainer \(class\) - line 1\n  runtimeChild \(method\) - line 2/], method: 'textDocument/documentSymbol' },
		{ title: 'workspace symbols combine resolved and unresolved locations', input: { operation: 'workspaceSymbol', query: 'Runtime' }, expected: [/RuntimeWorkspace_primary \(function\) in RuntimeContainer/, /RuntimeUnresolved_primary \(class\)/], method: 'workspace/symbol' },
		{ title: 'implementation accepts a single location result', input: { operation: 'goToImplementation', ...position }, expected: [/implementation\.rtlang:3/], method: 'textDocument/implementation' },
		{ title: 'incoming call hierarchy preserves caller ranges', input: { operation: 'incomingCalls', ...position }, expected: [/Incoming calls to runtimeTarget/, /runtimeCaller \(function\)/, /\[calls at: line 2, line 3\]/], method: 'callHierarchy/incomingCalls' },
		{ title: 'outgoing call hierarchy preserves callee ranges', input: { operation: 'outgoingCalls', ...position }, expected: [/Outgoing calls from runtimeTarget/, /runtimeCallee \(function\)/, /\[called at: line 3\]/], method: 'callHierarchy/outgoingCalls' },
	];
	for (const operation of operations) {
		customizationTest(`runtime coverage customization: ${operation.title}`, async () => {
			const fixture = await lspFixture();
			await runLsp(fixture, operation.input, operation.expected);
			const requests = messages(fixture.trace).filter(message => message.method === operation.method);
			assert.strictEqual(requests.length, 1);
			if (operation.input.line !== undefined) {
				const positional = messages(fixture.trace).find(message => message.params?.position);
				assert.deepStrictEqual(positional?.params?.position, { line: 0, character: 3 });
			}
			if (operation.input.operation === 'findReferences') {
				assert.deepStrictEqual(requests[0].params?.context, { includeDeclaration: false });
			}
		});
	}

	customizationTest('runtime coverage customization: rename applies UTF16 edits across two files', async () => {
		const fixture = await lspFixture();
		await runLsp(fixture, { operation: 'rename', ...position, newName: 'beta' },
			[/Successfully renamed symbol to "beta"/, /Files changed: 2/, /Total edits applied: 2/]);
		assert.deepStrictEqual({
			main: readFileSync(join(fixture.workspace, 'fixture.rtlang'), 'utf8'),
			reference: readFileSync(join(fixture.workspace, 'reference.rtlang'), 'utf8'),
			requests: messages(fixture.trace).filter(message => ['textDocument/prepareRename', 'textDocument/rename'].includes(message.method ?? '')).map(message => message.method),
		}, { main: '😀 beta\nruntimeChild\n', reference: 'beta\nruntimeCaller\nruntimeCallee\n', requests: ['textDocument/prepareRename', 'textDocument/rename'] });
	});

	customizationTest('runtime coverage customization: plugin launch expands environment cwd and initialization options', async () => {
		const fixture = await lspFixture({ launchExpansion: true });
		await runLsp(fixture, { operation: 'hover', ...position }, [/RUNTIME_HOVER_primary/]);
		const trace = messages(fixture.trace);
		const spawned = trace.find(message => message.event === 'spawn')!;
		assert.deepStrictEqual({
			cwd: canonicalFilePath(spawned.cwd!),
			marker: spawned.environment?.marker,
			fallback: spawned.environment?.fallback,
			workspace: canonicalFilePath(spawned.environment!.workspace),
			pluginRootHasServer: readFileSync(join(spawned.environment!.pluginRoot, 'server.cjs'), 'utf8') === lspServer,
			options: trace.find(message => message.method === 'initialize')?.params?.initializationOptions,
		}, {
			cwd: canonicalFilePath(fixture.workspace), marker: 'RUNTIME_ENV_OK', fallback: 'RUNTIME_DEFAULT_OK', workspace: canonicalFilePath(fixture.workspace),
			pluginRootHasServer: true, options: { scenario: 'normal', marker: 'RUNTIME_INITIALIZATION_OK' },
		});
	});

	customizationTest('runtime coverage customization: configuration progress and unsupported server callbacks receive replies', async () => {
		const fixture = await lspFixture({ scenario: 'callbacks' });
		await runLsp(fixture, { operation: 'hover', ...position }, [/RUNTIME_HOVER_primary/]);
		assert.deepStrictEqual(messages(fixture.trace).filter(message => typeof message.id === 'string' && message.id.startsWith('runtime-'))
			.map(message => ({ id: message.id, result: message.result, error: message.error }))
			.sort((a, b) => String(a.id).localeCompare(String(b.id))), [
			{ id: 'runtime-config', result: [null], error: undefined },
			{ id: 'runtime-folders', result: undefined, error: { code: -32601, message: 'Unhandled method workspace/workspaceFolders' } },
			{ id: 'runtime-progress', result: null, error: undefined },
		]);
	});

	customizationTest('runtime coverage customization: closing documents reloads changed content without respawning the server', async () => {
		const fixture = await lspFixture();
		await runLsp(fixture, { operation: 'hover', ...position }, [/RUNTIME_DOCUMENT:😀 alpha/]);
		writeFileSync(join(fixture.workspace, 'fixture.rtlang'), '😀 omega\nRUNTIME_REOPENED\n');
		await runLsp(fixture, { operation: 'hover', ...position }, [/RUNTIME_DOCUMENT:😀 omega\nRUNTIME_REOPENED/], true, 'runtime-lsp-reopened', 100);
		await retry(async () => assert.strictEqual(messages(fixture.trace).filter(message => message.method === 'textDocument/didClose').length, 2), 100, 100);
		const trace = messages(fixture.trace);
		assert.deepStrictEqual({
			spawns: trace.filter(message => message.event === 'spawn').length,
			opens: trace.filter(message => message.method === 'textDocument/didOpen').map(message => message.params?.textDocument?.text),
			closes: trace.filter(message => message.method === 'textDocument/didClose').length,
		}, { spawns: 1, opens: ['😀 alpha\nruntimeChild\n', '😀 omega\nRUNTIME_REOPENED\n'], closes: 2 });
	});

	customizationTest('runtime coverage customization: empty definition results are successful and explicit', async () => {
		const fixture = await lspFixture({ scenario: 'empty' });
		await runLsp(fixture, { operation: 'goToDefinition', ...position }, [/No definition(?:s)? found at line 1, character 4/]);
		assert.strictEqual(messages(fixture.trace).filter(message => message.method === 'textDocument/definition').length, 1);
	});

	customizationTest('runtime coverage customization: a language server RPC error does not poison the next request', async () => {
		const fixture = await lspFixture({ scenario: 'error-once' });
		await runLsp(fixture, { operation: 'documentSymbol', file: 'fixture.rtlang' }, [/^RUNTIME_LSP_RECOVERABLE_ERROR$/], false);
		await runLsp(fixture, { operation: 'documentSymbol', file: 'fixture.rtlang' }, [/RuntimeContainer \(class\)/, /runtimeChild \(method\)/], true, 'runtime-lsp-recovered', 100);
		assert.deepStrictEqual({
			spawns: messages(fixture.trace).filter(message => message.event === 'spawn').length,
			symbolRequests: messages(fixture.trace).filter(message => message.method === 'textDocument/documentSymbol').length,
		}, { spawns: 1, symbolRequests: 2 });
	});

	customizationTest('runtime coverage customization: workspace symbol language filtering excludes sibling servers', async () => {
		const fixture = await lspFixture({ secondServer: true });
		await runLsp(fixture, { operation: 'workspaceSymbol', query: 'Runtime', language: 'runtime-primary' },
			[/RuntimeWorkspace_primary/, /RuntimeUnresolved_primary/]);
		assert.deepStrictEqual(messages(fixture.trace).filter(message => message.event === 'spawn').length, 1);
		assert.strictEqual(messages(fixture.trace).filter(message => message.method === 'workspace/symbol').length, 1);
	});

	customizationTest('runtime coverage customization: unsupported file extensions fail without launching a language server', async () => {
		const fixture = await lspFixture();
		await runLsp(fixture, { operation: 'hover', file: 'unsupported.txt', line: 1, character: 1 },
			[/^No LSP client available$/], false);
		assert.deepStrictEqual(messages(fixture.trace), []);
	});

	customizationTest('runtime coverage customization: manifest inline LSP configuration starts a usable server', async () => {
		const fixture = await lspFixture({ configuration: 'manifest' });
		await runLsp(fixture, { operation: 'hover', ...position }, [/RUNTIME_HOVER_primary/]);
		assert.strictEqual(messages(fixture.trace).filter(message => message.method === 'initialize').length, 1);
	});

	customizationTest('runtime coverage customization: malformed preferred LSP configuration falls back to a valid sibling', async () => {
		const fixture = await lspFixture({ configuration: 'fallback' });
		await runLsp(fixture, { operation: 'documentSymbol', file: 'fixture.rtlang' }, [/RuntimeContainer \(class\)/, /runtimeChild \(method\)/]);
		assert.strictEqual(messages(fixture.trace).filter(message => message.method === 'textDocument/documentSymbol').length, 1);
	});

	customizationTest('runtime coverage customization: skill allowed tools read a supporting plugin resource', async () => {
		const { workspace, plugin } = fixtureRoot();
		const skill = join(plugin, 'skills', 'runtime-resource');
		mkdirSync(skill, { recursive: true });
		writeFileSync(join(skill, 'reference.txt'), 'RUNTIME_SKILL_RESOURCE_OK');
		writeSkill(plugin, 'runtime-resource', 'Reads the runtime supporting reference',
			'Use view to read reference.txt in this skill base directory. Reply with exactly its contents.',
			['allowed-tools: view']);
		const sessionUri = await attachPlugin(workspace, plugin);
		const turnId = 'runtime-skill-resource';
		await driveTurnToCompletion(context.client, sessionUri, turnId,
			`The workspace is ${workspace}. Invoke the runtime-resource skill exactly once and read the reference from its absolute skill base directory, not the workspace. Follow its instructions. Do not use shell tools.`, 2);
		assertToolCallCompleteText(context.client, {
			channel: buildDefaultChatUri(sessionUri), turnId, toolNames: ['view'], expected: [/^RUNTIME_SKILL_RESOURCE_OK$/], success: true,
		});
		const skillCalls = new Set(context.client.receivedNotifications(n => isActionNotification(n, ActionType.ChatToolCallStart))
			.map(n => getActionEnvelope(n))
			.filter(envelope => envelope.channel === buildDefaultChatUri(sessionUri)
				&& envelope.action.type === ActionType.ChatToolCallStart && envelope.action.turnId === turnId && envelope.action.toolName === 'skill')
			.map(envelope => envelope.action.type === ActionType.ChatToolCallStart ? envelope.action.toolCallId : ''));
		const skillCompletions = context.client.receivedNotifications(n => isActionNotification(n, ActionType.ChatToolCallComplete))
			.map(n => getActionEnvelope(n))
			.flatMap(envelope => {
				if (envelope.channel !== buildDefaultChatUri(sessionUri) || envelope.action.type !== ActionType.ChatToolCallComplete
					|| envelope.action.turnId !== turnId || !skillCalls.has(envelope.action.toolCallId)) {
					return [];
				}
				const result = envelope.action.result;
				const message = typeof result.pastTenseMessage === 'string' ? result.pastTenseMessage : result.pastTenseMessage.markdown;
				return [{ success: result.success, namesSkill: message.includes('runtime-resource'), linksSkillFile: message.includes('/skills/runtime-resource/SKILL.md') }];
			});
		assert.deepStrictEqual(skillCompletions, [{ success: true, namesSkill: true, linksSkillFile: true }]);
	});

	customizationTest('runtime coverage customization: sibling skill resources stay isolated by skill base directory', async () => {
		const { workspace, plugin } = fixtureRoot();
		for (const name of ['runtime-left', 'runtime-right']) {
			writeSkill(plugin, name, `Reads the ${name} reference`,
				'Use view to read reference.txt in this skill base directory. Reply with exactly its contents.');
			writeFileSync(join(plugin, 'skills', name, 'reference.txt'), name === 'runtime-left' ? 'RUNTIME_LEFT_OK' : 'RUNTIME_RIGHT_OK');
		}
		const sessionUri = await attachPlugin(workspace, plugin);
		for (const [index, name, expected] of [[0, 'runtime-left', /^RUNTIME_LEFT_OK$/], [1, 'runtime-right', /^RUNTIME_RIGHT_OK$/]] as const) {
			const turnId = `runtime-skill-${index}`;
			await driveTurnToCompletion(context.client, sessionUri, turnId,
				`The workspace is ${workspace}. Invoke the ${name} skill exactly once and read the reference from its absolute skill base directory, not the workspace. Follow its instructions. Do not use shell tools.`, index * 100 + 2);
			assertToolCallCompleteText(context.client, {
				channel: buildDefaultChatUri(sessionUri), turnId, toolNames: ['view'], expected: [expected], success: true,
			});
		}
	});

	watcherTest('runtime coverage customization: watcher default kinds deliver create change and delete events', async () => {
		const fixture = await watcherFixture();
		const created = join(fixture.workspace, 'watch-lifecycle.rtlang');
		const changed = join(fixture.workspace, 'definition.rtlang');
		const deleted = join(fixture.workspace, 'reference.rtlang');
		// Separate paths prevent FSEvents from coalescing a short-lived file's create and delete.
		await mutateWatchedFile(fixture, created, 1, () => writeFileSync(created, 'RUNTIME_WATCH_CREATED\n'));
		await mutateWatchedFile(fixture, changed, 2, () => overwriteFile(changed, 'RUNTIME_WATCH_CHANGED\n'));
		await mutateWatchedFile(fixture, deleted, 3, () => removeWatchedFile(fixture, deleted));
		const trace = messages(fixture.trace);
		const acknowledgement = trace.findIndex(message => message.id === 'runtime-watch-1' && message.direction === 'clientToServer');
		const notification = trace.findIndex(message => message.method === 'workspace/didChangeWatchedFiles');
		assert.ok(acknowledgement >= 0 && notification > acknowledgement);
		await runLsp(fixture, { operation: 'hover', file: 'fixture.rtlang', line: 1, character: 4 }, [/RUNTIME_WATCH_READY/], true, 'watch-lifecycle-complete', 100);
	});

	watcherTest('runtime coverage customization: watcher relative patterns preserve Unicode paths and document text', async () => {
		const fixture = await watcherFixture('relative');
		const file = join(fixture.watchDirectory, 'café😀.rtlang');
		await mutateWatchedFile(fixture, file, 2, () => overwriteFile(file, 'β😀\nRUNTIME_WATCH_UNICODE_AFTER\n'));
		await runLsp(fixture, { operation: 'hover', file: join('watched space Ω', 'café😀.rtlang'), line: 1, character: 1 },
			[/RUNTIME_DOCUMENT:β😀\nRUNTIME_WATCH_UNICODE_AFTER/, /RUNTIME_WATCH_READY/], true, 'watch-unicode-document', 100);
		assert.deepStrictEqual(messages(fixture.trace).filter(message => message.method === 'textDocument/didOpen')
			.map(message => ({ text: message.params?.textDocument?.text, language: message.params?.textDocument?.languageId })).at(-1),
			{ text: 'β😀\nRUNTIME_WATCH_UNICODE_AFTER\n', language: 'rtlang' });
	});

	watcherTest('runtime coverage customization: watcher overlapping roots keep child delivery after parent unregistration', async () => {
		const fixture = await watcherFixture('overlap');
		const file = join(fixture.watchDirectory, 'nested', 'child.rtlang');
		await controlWatch(fixture, { method: 'client/unregisterCapability', unregisterIds: ['runtime-parent'] }, 2);
		await mutateWatchedFile(fixture, file, 2, () => overwriteFile(file, 'RUNTIME_WATCH_RETAINED_CHILD\n'));
		await runLsp(fixture, { operation: 'hover', file: join('watched', 'nested', 'child.rtlang'), line: 1, character: 1 },
			[/RUNTIME_DOCUMENT:RUNTIME_WATCH_RETAINED_CHILD/, /RUNTIME_WATCH_READY/], true, 'watch-retained-child', 300);
		assert.strictEqual(messages(fixture.trace).filter(message => message.event === 'spawn').length, 1);
	});

	watcherTest('runtime coverage customization: watcher unregister and re-register acknowledges before renewed delivery', async () => {
		const fixture = await watcherFixture();
		await controlWatch(fixture, { method: 'client/unregisterCapability', unregisterIds: ['runtime-root'] }, 2);
		await controlWatch(fixture, {
			method: 'client/registerCapability',
			registrations: [{ id: 'runtime-renewed', watchers: [{ globPattern: '**/*.rtlang', kind: 2 }] }],
		}, 3);
		const file = join(fixture.workspace, 'fixture.rtlang');
		const after = messages(fixture.trace).length;
		await mutateWatchedFile(fixture, file, 2, () => overwriteFile(file, '😀 renewed\nRUNTIME_WATCH_RENEWED\n'));
		const trace = messages(fixture.trace);
		const acknowledgement = trace.findIndex(message => message.id === 'runtime-watch-3' && message.direction === 'clientToServer');
		const notification = trace.findIndex((message, index) => index >= after && message.method === 'workspace/didChangeWatchedFiles');
		assert.ok(acknowledgement >= 0 && notification > acknowledgement);
		await runLsp(fixture, { operation: 'hover', file: 'fixture.rtlang', line: 1, character: 4 },
			[/RUNTIME_DOCUMENT:😀 renewed\nRUNTIME_WATCH_RENEWED/, /RUNTIME_WATCH_READY/], true, 'watch-renewed-document', 400);
	});

	watcherTest('runtime coverage customization: watcher duplicate registration is rejected without changing event masks', async () => {
		const fixture = await watcherFixture();
		await controlWatch(fixture, {
			method: 'client/registerCapability',
			registrations: [{ id: 'runtime-root', watchers: [{ globPattern: '**/*.rtlang', kind: 5 }] }],
		}, 2, -32602);
		assert.match(watchReplies(fixture).find(message => message.id === 'runtime-watch-2')!.error!.message,
			/file-watch registration id 'runtime-root' is already registered/);
		const created = join(fixture.workspace, 'watch-mask.rtlang');
		const changed = join(fixture.workspace, 'definition.rtlang');
		const deleted = join(fixture.workspace, 'reference.rtlang');
		await mutateWatchedFile(fixture, created, 1, () => writeFileSync(created, 'RUNTIME_WATCH_MASK_CREATED\n'));
		await mutateWatchedFile(fixture, changed, 2, () => overwriteFile(changed, 'RUNTIME_WATCH_MASK_CHANGED\n'));
		await mutateWatchedFile(fixture, deleted, 3, () => removeWatchedFile(fixture, deleted));
		await runLsp(fixture, { operation: 'hover', file: 'fixture.rtlang', line: 1, character: 4 }, [/RUNTIME_WATCH_READY/], true, 'watch-mask-complete', 300);
		assert.strictEqual(messages(fixture.trace).filter(message => message.event === 'spawn').length, 1);
	});

	watcherTest('runtime coverage customization: watcher directory moves expand descendant deletion and creation events', async () => {
		const fixture = await watcherFixture();
		const destination = join(fixture.workspace, 'moved-watched');
		const after = messages(fixture.trace).length;
		renameSync(fixture.watchDirectory, destination);
		for (const relative of ['seed.rtlang', join('nested', 'child.rtlang'), 'café😀.rtlang']) {
			await waitWatchChange(fixture, join(fixture.watchDirectory, relative), 3, after);
			await waitWatchChange(fixture, join(destination, relative), 1, after);
		}
		await runLsp(fixture, { operation: 'hover', file: join('moved-watched', 'nested', 'child.rtlang'), line: 1, character: 1 },
			[/RUNTIME_DOCUMENT:RUNTIME_WATCH_CHILD/, /RUNTIME_WATCH_READY/], true, 'watch-moved-document', 100);
		assert.strictEqual(readFileSync(join(destination, 'seed.rtlang'), 'utf8'), 'RUNTIME_WATCH_SEED\n');
	});

	watcherTest('runtime coverage customization: watcher invalid relative registration leaves the active watch usable', async () => {
		const fixture = await watcherFixture();
		await controlWatch(fixture, {
			method: 'client/registerCapability',
			registrations: [{
				id: 'runtime-invalid',
				watchers: [{ globPattern: { baseUri: `${URI.file(fixture.workspace).toString()}/invalid%2Froot`, pattern: '**/*.rtlang' }, kind: 2 }],
			}],
		}, 2, -32602);
		assert.match(watchReplies(fixture).find(message => message.id === 'runtime-watch-2')!.error!.message, /encoded separators/);
		const file = join(fixture.workspace, 'reference.rtlang');
		await mutateWatchedFile(fixture, file, 2, () => overwriteFile(file, 'RUNTIME_WATCH_AFTER_INVALID_REGISTRATION\n'));
		await runLsp(fixture, { operation: 'hover', file: 'reference.rtlang', line: 1, character: 1 },
			[/RUNTIME_DOCUMENT:RUNTIME_WATCH_AFTER_INVALID_REGISTRATION/, /RUNTIME_WATCH_READY/], true, 'watch-after-invalid-registration', 300);
	});

	watcherTest('runtime coverage customization: watcher newly created nested directories become recursively watched', async () => {
		const fixture = await watcherFixture();
		const directory = join(fixture.workspace, 'watch-new-parent', 'new-child');
		const file = join(directory, 'arrived.rtlang');
		await mutateWatchedFile(fixture, file, 1, () => {
			mkdirSync(directory, { recursive: true });
			writeFileSync(file, 'RUNTIME_WATCH_NESTED_CREATED\n');
		});
		await mutateWatchedFile(fixture, file, 2, () => overwriteFile(file, 'RUNTIME_WATCH_NESTED_CHANGED\n'));
		await runLsp(fixture, { operation: 'hover', file: join('watch-new-parent', 'new-child', 'arrived.rtlang'), line: 1, character: 1 },
			[/RUNTIME_DOCUMENT:RUNTIME_WATCH_NESTED_CHANGED/, /RUNTIME_WATCH_READY/], true, 'watch-new-nested-document', 100);
	});
}
