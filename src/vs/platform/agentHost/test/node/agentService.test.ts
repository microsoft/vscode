/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type Anthropic from '@anthropic-ai/sdk';
import type { CCAModel } from '@vscode/copilot-api';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore, IReference, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { hasKey } from '../../../../base/common/types.js';
import { NullLogService } from '../../../log/common/log.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { AgentSession, GITHUB_COPILOT_PROTECTED_RESOURCE } from '../../common/agentService.js';
import { ISessionDatabase, ISessionDataService } from '../../common/sessionDataService.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { ActionType, ActionEnvelope } from '../../common/state/sessionActions.js';
import { ChangesetStatus, CustomizationType, MessageAttachmentKind, MessageKind, SessionActiveClient, ResponsePartKind, ROOT_STATE_URI, SessionLifecycle, SessionStatus, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, TurnState, buildSubagentSessionUri, customizationId, isSubagentSession, type ChangesetState, type MarkdownResponsePart, type ToolCallCompletedState, type ToolCallResponsePart } from '../../common/state/sessionState.js';
import { type MessageResourceAttachment } from '../../common/state/protocol/state.js';
import { IProductService } from '../../../product/common/productService.js';
import { AgentService } from '../../node/agentService.js';
import { MockAgent, ScriptedMockAgent } from './mockAgent.js';
import { mapSessionEventsToHistoryRecords } from './historyRecordFixtures.js';
import { type ISessionEvent } from '../../node/copilot/mapSessionEvents.js';
import { createNoopGitService, createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';
import { NULL_CHECKPOINT_SERVICE } from '../../common/agentHostCheckpointService.js';
import { buildSessionChangesetUri, buildUncommittedChangesetUri } from '../../common/changesetUri.js';
import { type ICopilotApiService, type ICopilotApiServiceRequestOptions, type ICopilotUtilityChatCompletionRequest } from '../../node/shared/copilotApiService.js';

/**
 * Loads a JSONL fixture of raw Copilot SDK events, runs them through
 * {@link mapSessionEventsToHistoryRecords}, and returns the result
 * suitable for setting on {@link MockAgent.sessionMessages}. Tests the
 * full pipeline: SDK events → IHistoryRecord → buildTurnsFromHistory →
 * Turn[].
 *
 * Fixture files live in `test-cases/` and are sanitized copies of real
 * `events.jsonl` files from `~/.copilot/session-state/`.
 */
async function loadFixtureMessages(fixtureName: string, session: URI) {
	// Resolve the fixture from the source tree (test-cases/ is not compiled to out/)
	const thisFile = fileURLToPath(import.meta.url);
	// Navigate from out/vs/... to src/vs/... by replacing the out/ prefix.
	// Use a regex that handles both / and \ separators for Windows compat.
	const srcFile = thisFile.replace(/[/\\]out[/\\]/, (m) => m.replace('out', 'src'));
	const lastSep = Math.max(srcFile.lastIndexOf('/'), srcFile.lastIndexOf('\\'));
	const fixtureDir = srcFile.substring(0, lastSep);
	const sep = srcFile.includes('\\') ? '\\' : '/';
	const raw = readFileSync(`${fixtureDir}${sep}test-cases${sep}${fixtureName}`, 'utf-8');
	const events: ISessionEvent[] = raw.trim().split('\n').map(line => JSON.parse(line));
	return mapSessionEventsToHistoryRecords(session, undefined, events);
}

class TestCopilotApiService implements ICopilotApiService {
	declare readonly _serviceBrand: undefined;

	readonly utilityCalls: { token: string; request: ICopilotUtilityChatCompletionRequest; options?: ICopilotApiServiceRequestOptions }[] = [];
	response = 'Generated session title';
	responsePromise: Promise<string> | undefined;
	error: Error | undefined;

	messages(_githubToken: string, _request: Anthropic.MessageCreateParamsStreaming, _options?: ICopilotApiServiceRequestOptions): AsyncGenerator<Anthropic.MessageStreamEvent>;
	messages(_githubToken: string, _request: Anthropic.MessageCreateParamsNonStreaming, _options?: ICopilotApiServiceRequestOptions): Promise<Anthropic.Message>;
	messages(): AsyncGenerator<Anthropic.MessageStreamEvent> | Promise<Anthropic.Message> {
		throw new Error('not used');
	}
	async countTokens(): Promise<Anthropic.MessageTokensCount> { throw new Error('not used'); }
	async models(): Promise<CCAModel[]> { return []; }
	async responses(): Promise<Response> { throw new Error('not used'); }
	async utilityChatCompletion(githubToken: string, request: ICopilotUtilityChatCompletionRequest, options?: ICopilotApiServiceRequestOptions): Promise<string> {
		this.utilityCalls.push({ token: githubToken, request, options });
		if (this.error) {
			throw this.error;
		}
		if (this.responsePromise) {
			return this.responsePromise;
		}
		return this.response;
	}
}

suite('AgentService (node dispatcher)', () => {

	const disposables = new DisposableStore();
	let service: AgentService;
	let copilotAgent: MockAgent;
	let fileService: FileService;
	let nullSessionDataService: ISessionDataService;

	setup(async () => {
		nullSessionDataService = {
			_serviceBrand: undefined,
			getSessionDataDir: () => URI.parse('inmemory:/session-data'),
			getSessionDataDirById: () => URI.parse('inmemory:/session-data'),
			openDatabase: () => { throw new Error('not implemented'); },
			tryOpenDatabase: async () => undefined,
			deleteSessionData: async () => { },
			onWillDeleteSessionData: Event.None,
			cleanupOrphanedData: async () => { },
			whenIdle: async () => { },
		};

		fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));

		// Seed a directory for browseDirectory tests
		await fileService.createFolder(URI.from({ scheme: Schemas.inMemory, path: '/testDir' }));
		await fileService.writeFile(URI.from({ scheme: Schemas.inMemory, path: '/testDir/file.txt' }), VSBuffer.fromString('hello'));

		service = disposables.add(new AgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
		copilotAgent = new MockAgent('copilot');
		disposables.add(toDisposable(() => copilotAgent.dispose()));
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	// ---- Provider registration ------------------------------------------

	suite('registerProvider', () => {

		test('registers a provider successfully', () => {
			service.registerProvider(copilotAgent);
			// No throw - success
		});

		test('throws on duplicate provider registration', () => {
			service.registerProvider(copilotAgent);
			const duplicate = new MockAgent('copilot');
			disposables.add(toDisposable(() => duplicate.dispose()));
			assert.throws(() => service.registerProvider(duplicate), /already registered/);
		});

		test('maps progress events to protocol actions via onDidAction', async () => {
			service.registerProvider(copilotAgent);
			const session = await service.createSession({ provider: 'copilot' });

			// Start a turn so there's an active turn to map events to
			service.dispatchAction(
				session.toString(),
				{ type: ActionType.SessionTurnStarted, turnId: 'turn-1', message: { text: 'hello', origin: { kind: MessageKind.User } } },
				'test-client', 1,
			);

			const envelopes: ActionEnvelope[] = [];
			disposables.add(service.onDidAction(e => envelopes.push(e)));

			copilotAgent.fireProgress({
				kind: 'action', session,
				action: { type: ActionType.SessionResponsePart, turnId: 'turn-1', part: { kind: ResponsePartKind.Markdown, id: 'msg-1', content: 'hello' } },
			});
			assert.ok(envelopes.some(e => e.action.type === ActionType.SessionResponsePart));
		});
	});

	// ---- createSession --------------------------------------------------

	suite('dispatchAction', () => {

		async function waitForCondition(predicate: () => boolean | Promise<boolean>, message: string): Promise<void> {
			for (let i = 0; i < 20; i++) {
				if (await predicate()) {
					return;
				}
				await new Promise(resolve => setTimeout(resolve, 5));
			}
			assert.ok(await predicate(), message);
		}

		async function setupTitleGeneration(copilotApiService: TestCopilotApiService): Promise<{ svc: AgentService; agent: MockAgent; session: URI; db: TestSessionDatabase }> {
			const db = new TestSessionDatabase();
			const sessionDataService = createSessionDataService(db);
			const svc = disposables.add(new AgentService(
				new NullLogService(),
				fileService,
				sessionDataService,
				{ _serviceBrand: undefined } as IProductService,
				createNoopGitService(),
				NULL_CHECKPOINT_SERVICE,
				undefined,
				undefined,
				undefined,
				copilotApiService,
			));
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			svc.registerProvider(agent);
			await svc.authenticate({
				resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource,
				scopes: GITHUB_COPILOT_PROTECTED_RESOURCE.scopes_supported,
				token: 'gh-token',
			});
			const session = await svc.createSession({ provider: 'copilot' });
			return { svc, agent, session, db };
		}

		test('applies and persists root config changes from clients', async () => {
			const tempDir = URI.file(mkdtempSync(`${tmpdir()}/agent-host-config-`));
			// Use a local DisposableStore so that svc can be explicitly disposed
			// before cleaning up the temp directory. On Windows, rmSync fails with
			// EPERM if the AgentService (and its child AgentConfigurationService)
			// still holds references while the directory is being deleted.
			const localDisposables = new DisposableStore();
			try {
				const rootConfigResource = joinPath(tempDir, 'agent-host-config.json');
				const svc = localDisposables.add(new AgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService(), NULL_CHECKPOINT_SERVICE, rootConfigResource));
				const agent = new MockAgent('copilot');
				localDisposables.add(toDisposable(() => agent.dispose()));
				svc.registerProvider(agent);

				const customization = { uri: 'file:///plugin-a', displayName: 'Plugin A' };
				svc.dispatchAction(ROOT_STATE_URI, {
					type: ActionType.RootConfigChanged,
					config: { customizations: [customization] },
				}, 'test-client', 1);

				let persisted = false;
				for (let attempt = 0; attempt < 20; attempt++) {
					try {
						const parsed = JSON.parse(readFileSync(rootConfigResource.fsPath, 'utf8'));
						assert.deepStrictEqual(
							parsed.customizations,
							[customization],
						);
						persisted = true;
						break;
					} catch {
						// Wait for the serialized root-config write to complete.
					}
					if (attempt === 19) {
						break;
					}
					await new Promise(resolve => setTimeout(resolve, 5));
				}

				assert.ok(persisted, 'should persist the root config change');

				// Drain any in-flight root-config write so its file handle is
				// closed before we delete the temp directory.
				await svc.configurationService.whenIdle();
			} finally {
				localDisposables.dispose();
				rmSync(tempDir.fsPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
			}
		});

		test('generates and persists an AI title after first-turn fallback title', async () => {
			const copilotApiService = new TestCopilotApiService();
			copilotApiService.response = '"Fix TypeScript compile errors."';
			const { svc, session, db } = await setupTitleGeneration(copilotApiService);
			const titleActions: string[] = [];
			disposables.add(svc.onDidAction(e => {
				if (e.action.type === ActionType.SessionTitleChanged) {
					titleActions.push(e.action.title);
				}
			}));

			svc.dispatchAction(
				session.toString(),
				{ type: ActionType.SessionTurnStarted, turnId: 'turn-1', message: { text: 'Please help me fix the TypeScript compile errors', origin: { kind: MessageKind.User } } },
				'test-client', 1,
			);

			await waitForCondition(() => svc.stateManager.getSessionState(session.toString())?.summary.title === 'Fix TypeScript compile errors', 'generated title should be applied');
			await waitForCondition(async () => await db.getMetadata('customTitle') !== undefined, 'generated title should be persisted');

			assert.deepStrictEqual({
				titles: titleActions,
				token: copilotApiService.utilityCalls[0]?.token,
				promptIncludesUserText: copilotApiService.utilityCalls[0]?.request.messages.some(message => message.content.includes('Please help me fix the TypeScript compile errors')),
				persistedTitle: await db.getMetadata('customTitle'),
			}, {
				titles: ['Please help me fix the TypeScript compile errors', 'Fix TypeScript compile errors'],
				token: 'gh-token',
				promptIncludesUserText: true,
				persistedTitle: 'Fix TypeScript compile errors',
			});
		});

		test('leaves fallback title when AI title generation fails', async () => {
			const copilotApiService = new TestCopilotApiService();
			copilotApiService.error = new Error('title failed');
			const { svc, session, db } = await setupTitleGeneration(copilotApiService);

			svc.dispatchAction(
				session.toString(),
				{ type: ActionType.SessionTurnStarted, turnId: 'turn-1', message: { text: 'Explain workspace search indexing', origin: { kind: MessageKind.User } } },
				'test-client', 1,
			);

			await waitForCondition(() => copilotApiService.utilityCalls.length === 1, 'title generation should be attempted');
			await Promise.resolve();

			assert.deepStrictEqual({
				title: svc.stateManager.getSessionState(session.toString())?.summary.title,
				persistedTitle: await db.getMetadata('customTitle'),
			}, {
				title: 'Explain workspace search indexing',
				persistedTitle: undefined,
			});
		});

		test('does not overwrite a manual rename with delayed AI title', async () => {
			const copilotApiService = new TestCopilotApiService();
			let resolveTitle!: (title: string) => void;
			copilotApiService.responsePromise = new Promise(resolve => { resolveTitle = resolve; });
			const { svc, session, db } = await setupTitleGeneration(copilotApiService);

			svc.dispatchAction(
				session.toString(),
				{ type: ActionType.SessionTurnStarted, turnId: 'turn-1', message: { text: 'Create tests for terminal persistence', origin: { kind: MessageKind.User } } },
				'test-client', 1,
			);
			await waitForCondition(() => copilotApiService.utilityCalls.length === 1, 'title generation should be in flight');

			svc.dispatchAction(
				session.toString(),
				{ type: ActionType.SessionTitleChanged, title: 'Manual title' },
				'test-client', 2,
			);
			resolveTitle('Terminal persistence tests');
			await waitForCondition(async () => await db.getMetadata('customTitle') === 'Manual title', 'manual title should be persisted');

			assert.deepStrictEqual({
				title: svc.stateManager.getSessionState(session.toString())?.summary.title,
				persistedTitle: await db.getMetadata('customTitle'),
			}, {
				title: 'Manual title',
				persistedTitle: 'Manual title',
			});
		});

		test('aborts pending AI title generation when session is disposed', async () => {
			const copilotApiService = new TestCopilotApiService();
			let resolveTitle!: (title: string) => void;
			copilotApiService.responsePromise = new Promise(resolve => { resolveTitle = resolve; });
			const { svc, session, db } = await setupTitleGeneration(copilotApiService);

			svc.dispatchAction(
				session.toString(),
				{ type: ActionType.SessionTurnStarted, turnId: 'turn-1', message: { text: 'Investigate flaky terminal tests', origin: { kind: MessageKind.User } } },
				'test-client', 1,
			);
			await waitForCondition(() => copilotApiService.utilityCalls.length === 1, 'title generation should be in flight');

			await svc.disposeSession(session);
			resolveTitle('Flaky terminal tests');
			await Promise.resolve();

			assert.deepStrictEqual({
				aborted: copilotApiService.utilityCalls[0].options?.signal?.aborted,
				state: svc.stateManager.getSessionState(session.toString()),
				persistedTitle: await db.getMetadata('customTitle'),
			}, {
				aborted: true,
				state: undefined,
				persistedTitle: undefined,
			});
		});

		test('does not generate an AI title for forked sessions with an existing title', async () => {
			const copilotApiService = new TestCopilotApiService();
			copilotApiService.response = 'Source generated title';
			const { svc, session: sourceSession } = await setupTitleGeneration(copilotApiService);

			svc.dispatchAction(
				sourceSession.toString(),
				{ type: ActionType.SessionTurnStarted, turnId: 'source-turn', message: { text: 'Seed fork title', origin: { kind: MessageKind.User } } },
				'test-client', 1,
			);
			await waitForCondition(() => svc.stateManager.getSessionState(sourceSession.toString())?.summary.title === 'Source generated title', 'source generated title should be applied');
			svc.dispatchAction(
				sourceSession.toString(),
				{ type: ActionType.SessionTurnComplete, turnId: 'source-turn' },
				'test-client', 2,
			);
			await waitForCondition(() => (svc.stateManager.getSessionState(sourceSession.toString())?.turns.length ?? 0) === 1, 'source turn should be complete before forking');
			const forkedSession = await svc.createSession({
				provider: 'copilot',
				fork: {
					session: sourceSession,
					turnIndex: 0,
					turnId: 'source-turn',
				},
			});

			svc.dispatchAction(
				forkedSession.toString(),
				{ type: ActionType.SessionTurnStarted, turnId: 'fork-turn-1', message: { text: 'Continue from the fork', origin: { kind: MessageKind.User } } },
				'test-client', 3,
			);

			assert.deepStrictEqual({
				title: svc.stateManager.getSessionState(forkedSession.toString())?.summary.title,
				utilityCalls: copilotApiService.utilityCalls.length,
			}, {
				title: 'Forked: Source generated title',
				utilityCalls: 1,
			});
		});
	});

	// ---- attachment rewriting ------------------------------------------

	suite('user-message attachment rewriting', () => {

		/**
		 * Sets up an {@link AgentService} backed by an in-memory file system
		 * and a {@link createSessionDataService} that points at a fixed
		 * directory. Returns the wired-up service and the URI under which
		 * snapshotted attachments should land.
		 */
		async function setup(): Promise<{
			svc: AgentService;
			agent: MockAgent;
			session: URI;
			attachmentsRoot: URI;
			warnings: string[];
		}> {
			const sessionDataDir = URI.from({ scheme: Schemas.inMemory, path: '/session-data' });
			const attachmentsRoot = joinPath(sessionDataDir, 'attachments');
			await fileService.createFolder(attachmentsRoot);
			const sessionDataService = createSessionDataService();
			// Override getSessionDataDir so the rewriter writes under our
			// in-memory file system instead of the helper's default path.
			sessionDataService.getSessionDataDir = () => sessionDataDir;
			const warnings: string[] = [];
			const logService = new class extends NullLogService {
				override warn(message: string): void { warnings.push(message); }
			};
			const svc = disposables.add(new AgentService(logService, fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			svc.registerProvider(agent);
			const session = await svc.createSession({ provider: 'copilot' });
			return { svc, agent, session, attachmentsRoot, warnings };
		}

		async function dispatchTurnAndWait(svc: AgentService, agent: MockAgent, session: URI, attachments: MessageResourceAttachment[] | { type: MessageAttachmentKind.EmbeddedResource; label: string; data: string; contentType: string; displayKind?: string }[]): Promise<void> {
			svc.dispatchAction(
				session.toString(),
				{
					type: ActionType.SessionTurnStarted,
					turnId: 'turn-1',
					message: { text: 'hello', origin: { kind: MessageKind.User }, attachments: attachments as never },
				},
				'test-client', 1,
			);
			// dispatchAction queues an async rewrite and the side-effect
			// handler is invoked from the same continuation; poll until the
			// agent has observed the (rewritten) sendMessage.
			for (let i = 0; i < 20 && agent.sendMessageCalls.length === 0; i++) {
				await new Promise(r => setTimeout(r, 5));
			}
		}

		test('snapshots EmbeddedResource attachments to disk and rewrites to a Resource URI under the session attachments folder', async () => {
			const { svc, agent, session, attachmentsRoot } = await setup();
			const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

			await dispatchTurnAndWait(svc, agent, session, [{
				type: MessageAttachmentKind.EmbeddedResource,
				label: 'paste.png',
				data: encodeBase64(VSBuffer.wrap(png)),
				contentType: 'image/png',
				displayKind: 'image',
			} as never]);

			assert.strictEqual(agent.sendMessageCalls.length, 1);
			const rewritten = agent.sendMessageCalls[0].attachments;
			assert.strictEqual(rewritten?.length, 1);
			const a = rewritten[0];
			assert.strictEqual(a.type, MessageAttachmentKind.Resource);
			if (a.type !== MessageAttachmentKind.Resource) { return; }
			assert.strictEqual(a.label, 'paste.png');
			assert.strictEqual(a.displayKind, 'image');
			assert.ok(a.uri.startsWith(attachmentsRoot.toString() + '/'), `attachment uri ${a.uri} should be under ${attachmentsRoot.toString()}/`);
			// File on disk holds exactly the original bytes
			const written = await fileService.readFile(URI.parse(a.uri));
			assert.deepStrictEqual([...written.value.buffer], [...png]);
		});

		test('preserves existing displayKind / range / selection / _meta on rewrite', async () => {
			const { svc, agent, session } = await setup();
			const range = { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } };

			await dispatchTurnAndWait(svc, agent, session, [{
				type: MessageAttachmentKind.EmbeddedResource,
				label: 'note.txt',
				data: encodeBase64(VSBuffer.fromString('alpha\nbeta\ngamma')),
				contentType: 'text/plain',
				// EmbeddedResource carries optional selection too
				// (textual resources only); make sure the rewriter copies it.
				displayKind: 'selection',
			} as never]);

			const rewritten = agent.sendMessageCalls[0].attachments![0];
			assert.strictEqual(rewritten.type, MessageAttachmentKind.Resource);
			if (rewritten.type !== MessageAttachmentKind.Resource) { return; }
			// `displayKind` is preserved as-is from the original attachment.
			assert.strictEqual(rewritten.displayKind, 'selection');

			void range; // selection round-trip on EmbeddedResource is covered by the next test
		});

		test('snapshots Resource attachments by reading the original file and rewriting to a local snapshot', async () => {
			const { svc, agent, session, attachmentsRoot, warnings } = await setup();
			const sourceUri = URI.from({ scheme: Schemas.inMemory, path: '/workspace/source.txt' });
			await fileService.writeFile(sourceUri, VSBuffer.fromString('hello world'));

			await dispatchTurnAndWait(svc, agent, session, [{
				type: MessageAttachmentKind.Resource,
				uri: sourceUri.toString(),
				label: 'source.txt',
				displayKind: 'document',
			}]);

			const rewritten = agent.sendMessageCalls[0].attachments![0];
			assert.strictEqual(rewritten.type, MessageAttachmentKind.Resource);
			if (rewritten.type !== MessageAttachmentKind.Resource) { return; }
			assert.notStrictEqual(rewritten.uri, sourceUri.toString(), `should be rewritten to the snapshot URI; warnings=${JSON.stringify(warnings)}; got ${rewritten.uri}`);
			assert.ok(rewritten.uri.startsWith(attachmentsRoot.toString() + '/'));
			assert.strictEqual(rewritten.label, 'source.txt');
			assert.strictEqual(rewritten.displayKind, 'document');

			const snapshot = await fileService.readFile(URI.parse(rewritten.uri));
			assert.strictEqual(snapshot.value.toString(), 'hello world');
		});

		test('passes through existing file:// Resource attachments unchanged (#319314)', async () => {
			const { svc, agent, session } = await setup();
			// Register a file-scheme provider so the attachment URI resolves to
			// an existing file on the agent host side.
			disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
			const fileUri = URI.from({ scheme: Schemas.file, path: '/host/source.txt' });
			await fileService.writeFile(fileUri, VSBuffer.fromString('on host'));

			await dispatchTurnAndWait(svc, agent, session, [{
				type: MessageAttachmentKind.Resource,
				uri: fileUri.toString(),
				label: 'source.txt',
				displayKind: 'document',
			}]);

			assert.deepStrictEqual(agent.sendMessageCalls[0].attachments, [{
				type: MessageAttachmentKind.Resource,
				uri: fileUri.toString(),
				label: 'source.txt',
				displayKind: 'document',
			}]);
		});

		test('preserves selection range on Resource rewrite', async () => {
			const { svc, agent, session, attachmentsRoot } = await setup();
			const sourceUri = URI.from({ scheme: Schemas.inMemory, path: '/workspace/sel.txt' });
			await fileService.writeFile(sourceUri, VSBuffer.fromString('alpha\nbeta\ngamma'));
			const range = { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } };

			await dispatchTurnAndWait(svc, agent, session, [{
				type: MessageAttachmentKind.Resource,
				uri: sourceUri.toString(),
				label: 'sel.txt',
				displayKind: 'selection',
				selection: { range },
			}]);

			const rewritten = agent.sendMessageCalls[0].attachments![0];
			assert.strictEqual(rewritten.type, MessageAttachmentKind.Resource);
			if (rewritten.type !== MessageAttachmentKind.Resource) { return; }
			assert.ok(rewritten.uri.startsWith(attachmentsRoot.toString() + '/'), 'should be rewritten to a snapshot URI');
			assert.deepStrictEqual(rewritten.selection?.range, range);
			assert.strictEqual(rewritten.displayKind, 'selection');
		});

		test('passes directory Resource attachments through unchanged', async () => {
			const { svc, agent, session } = await setup();
			const dirUri = URI.from({ scheme: Schemas.inMemory, path: '/workspace/dir' });

			await dispatchTurnAndWait(svc, agent, session, [{
				type: MessageAttachmentKind.Resource,
				uri: dirUri.toString(),
				label: 'dir',
				displayKind: 'directory',
			}]);

			assert.deepStrictEqual(agent.sendMessageCalls[0].attachments, [{
				type: MessageAttachmentKind.Resource,
				uri: dirUri.toString(),
				label: 'dir',
				displayKind: 'directory',
			}]);
		});

		test('does not re-snapshot attachments that already point under the session attachments folder', async () => {
			const { svc, agent, session, attachmentsRoot } = await setup();
			const existing = joinPath(attachmentsRoot, 'previous-id', 'note.txt');
			await fileService.writeFile(existing, VSBuffer.fromString('already snapshotted'));

			await dispatchTurnAndWait(svc, agent, session, [{
				type: MessageAttachmentKind.Resource,
				uri: existing.toString(),
				label: 'note.txt',
				displayKind: 'document',
			}]);

			const a = agent.sendMessageCalls[0].attachments?.[0];
			assert.ok(a && a.type === MessageAttachmentKind.Resource);
			assert.strictEqual(a.uri, existing.toString(), 'second-pass rewrite should be a no-op');
		});

		test('preserves the original attachment when the source cannot be read', async () => {
			const { svc, agent, session } = await setup();
			const missingUri = URI.from({ scheme: Schemas.inMemory, path: '/workspace/missing.txt' });

			await dispatchTurnAndWait(svc, agent, session, [{
				type: MessageAttachmentKind.Resource,
				uri: missingUri.toString(),
				label: 'missing.txt',
				displayKind: 'document',
			}]);

			assert.deepStrictEqual(agent.sendMessageCalls[0].attachments, [{
				type: MessageAttachmentKind.Resource,
				uri: missingUri.toString(),
				label: 'missing.txt',
				displayKind: 'document',
			}]);
		});
	});

	suite('createSession', () => {

		test('creates session via specified provider', async () => {
			service.registerProvider(copilotAgent);

			const session = await service.createSession({ provider: 'copilot' });
			assert.strictEqual(AgentSession.provider(session), 'copilot');
		});

		test('honors requested session URI', async () => {
			service.registerProvider(copilotAgent);

			const requestedSession = AgentSession.uri('copilot', 'requested-session');
			const session = await service.createSession({ provider: 'copilot', session: requestedSession });
			assert.strictEqual(session.toString(), requestedSession.toString());
		});

		test('scripted mock agent honors requested session URI', async () => {
			const agent = new ScriptedMockAgent();
			disposables.add(toDisposable(() => agent.dispose()));

			const requestedSession = AgentSession.uri('mock', 'requested-session');
			const result = await agent.createSession({ session: requestedSession });
			const sessions = await agent.listSessions();

			assert.deepStrictEqual({
				created: result.session.toString(),
				listed: sessions.some(s => s.session.toString() === requestedSession.toString()),
			}, {
				created: requestedSession.toString(),
				listed: true,
			});
		});

		test('uses default provider when none specified', async () => {
			service.registerProvider(copilotAgent);

			const session = await service.createSession();
			assert.strictEqual(AgentSession.provider(session), 'copilot');
		});

		test('throws when no providers are registered at all', async () => {
			await assert.rejects(() => service.createSession(), /No agent provider/);
		});
	});

	// ---- disposeSession -------------------------------------------------

	suite('disposeSession', () => {

		test('dispatches to the correct provider and cleans up tracking', async () => {
			service.registerProvider(copilotAgent);

			const session = await service.createSession({ provider: 'copilot' });
			await service.disposeSession(session);

			assert.strictEqual(copilotAgent.disposeSessionCalls.length, 1);
		});

		test('is a no-op for unknown sessions', async () => {
			service.registerProvider(copilotAgent);
			const unknownSession = URI.from({ scheme: 'unknown', path: '/nope' });

			// Should not throw
			await service.disposeSession(unknownSession);
		});
	});

	// ---- listSessions / listModels --------------------------------------

	suite('aggregation', () => {

		test('listSessions aggregates sessions from all providers', async () => {
			service.registerProvider(copilotAgent);

			await service.createSession({ provider: 'copilot' });

			const sessions = await service.listSessions();
			assert.strictEqual(sessions.length, 1);
		});

		test('listSessions overlays custom title from session database', async () => {
			// Pre-seed a custom title in an in-memory database
			const db = disposables.add(await SessionDatabase.open(':memory:'));
			await db.setMetadata('customTitle', 'My Custom Title');

			const sessionId = 'test-session-abc';
			const sessionUri = AgentSession.uri('copilot', sessionId);

			const sessionDataService: ISessionDataService = {
				_serviceBrand: undefined,
				getSessionDataDir: () => URI.parse('inmemory:/session-data'),
				getSessionDataDirById: () => URI.parse('inmemory:/session-data'),
				openDatabase: (): IReference<ISessionDatabase> => ({
					object: db,
					dispose: () => { },
				}),
				tryOpenDatabase: async (): Promise<IReference<ISessionDatabase> | undefined> => ({
					object: db,
					dispose: () => { },
				}),
				deleteSessionData: async () => { },
				onWillDeleteSessionData: Event.None,
				cleanupOrphanedData: async () => { },
				whenIdle: async () => { },
			};

			// Create a mock that returns a session with that ID
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			agent.sessionMetadataOverrides = { summary: 'SDK Title' };
			// Manually add the session to the mock
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(sessionId, sessionUri);

			const svc = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			svc.registerProvider(agent);

			const sessions = await svc.listSessions();
			assert.strictEqual(sessions.length, 1);
			assert.strictEqual(sessions[0].summary, 'My Custom Title');
		});

		test('listSessions uses SDK title when no custom title exists', async () => {
			service.registerProvider(copilotAgent);
			copilotAgent.sessionMetadataOverrides = { summary: 'Auto-generated Title' };

			await service.createSession({ provider: 'copilot' });

			const sessions = await service.listSessions();
			assert.strictEqual(sessions.length, 1);
			assert.strictEqual(sessions[0].summary, 'Auto-generated Title');
		});

		test('listSessions never returns subagent sessions', async () => {
			service.registerProvider(copilotAgent);
			const parentSession = await service.createSession({ provider: 'copilot' });

			// Simulate a live subagent being spawned: `_handleSubagentStarted`
			// registers the child session via `restoreSession`, which records
			// it in the announced-summary map that `listSessions` overlays
			// onto provider results.
			const childSessionUri = buildSubagentSessionUri(parentSession.toString(), 'tc-sub');
			service.stateManager.restoreSession(
				{
					resource: childSessionUri,
					provider: 'subagent',
					title: 'Explore',
					status: SessionStatus.Idle,
					createdAt: Date.now(),
					modifiedAt: Date.now(),
				},
				[],
			);

			// Sanity: the subagent child session is announced.
			assert.ok(
				service.stateManager.getAllSessionSummaries().some(s => s.resource === childSessionUri),
				'subagent child session should be listed',
			);

			const listed = await service.listSessions();
			assert.deepStrictEqual(
				{
					subagentSessions: listed.filter(s => isSubagentSession(s.session.toString())).map(s => s.session.toString()),
					includesParent: listed.some(s => s.session.toString() === parentSession.toString()),
				},
				{
					subagentSessions: [],
					includesParent: true,
				},
			);
		});

		test.skip('listSessions synthesizes the session changeset catalogue from persisted diffs for unopened sessions', async () => {
			// Pre-seed a `'diffs'` blob in the in-memory DB. The agent's
			// `listSessions()` returns the session metadata but the session
			// is NOT live in the state manager (no createSession /
			// restoreSession call), so the synthesised catalogue path runs.
			const db = disposables.add(await SessionDatabase.open(':memory:'));
			const persistedDiffs = [
				{
					after: { uri: 'file:///wd/a.ts', content: { uri: 'file:///wd/a.ts' } },
					diff: { added: 5, removed: 2 },
				},
				{
					after: { uri: 'file:///wd/b.ts', content: { uri: 'file:///wd/b.ts' } },
					diff: { added: 3, removed: 0 },
				},
			];
			await db.setMetadata('diffs', JSON.stringify(persistedDiffs));

			const sessionId = 'persisted-session';
			const sessionUri = AgentSession.uri('copilot', sessionId);
			const sessionDataService: ISessionDataService = {
				_serviceBrand: undefined,
				getSessionDataDir: () => URI.parse('inmemory:/session-data'),
				getSessionDataDirById: () => URI.parse('inmemory:/session-data'),
				openDatabase: (): IReference<ISessionDatabase> => ({ object: db, dispose: () => { } }),
				tryOpenDatabase: async (): Promise<IReference<ISessionDatabase> | undefined> => ({ object: db, dispose: () => { } }),
				deleteSessionData: async () => { },
				onWillDeleteSessionData: Event.None,
				cleanupOrphanedData: async () => { },
				whenIdle: async () => { },
			};

			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(sessionId, sessionUri);

			const svc = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			svc.registerProvider(agent);

			const sessions = await svc.listSessions();
			assert.strictEqual(sessions.length, 1);
			assert.deepStrictEqual(sessions[0].changesets, [
				{
					label: 'Branch Changes',
					uriTemplate: `${sessionUri.toString()}/changeset/session`,
					additions: 8,
					deletions: 2,
					files: 2,
				},
				{
					label: 'Uncommitted Changes',
					uriTemplate: `${sessionUri.toString()}/changeset/uncommitted`,
					description: 'Show uncommitted changes in this session',
				},
			]);
		});

		test.skip('listSessions silently ignores malformed persisted diffs', async () => {
			const db = disposables.add(await SessionDatabase.open(':memory:'));
			await db.setMetadata('diffs', '{ not valid json');

			const sessionId = 'bad-diffs-session';
			const sessionUri = AgentSession.uri('copilot', sessionId);
			const sessionDataService: ISessionDataService = {
				_serviceBrand: undefined,
				getSessionDataDir: () => URI.parse('inmemory:/session-data'),
				getSessionDataDirById: () => URI.parse('inmemory:/session-data'),
				openDatabase: (): IReference<ISessionDatabase> => ({ object: db, dispose: () => { } }),
				tryOpenDatabase: async (): Promise<IReference<ISessionDatabase> | undefined> => ({ object: db, dispose: () => { } }),
				deleteSessionData: async () => { },
				onWillDeleteSessionData: Event.None,
				cleanupOrphanedData: async () => { },
				whenIdle: async () => { },
			};

			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(sessionId, sessionUri);

			const svc = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			svc.registerProvider(agent);

			const sessions = await svc.listSessions();
			assert.strictEqual(sessions.length, 1);
			assert.strictEqual(sessions[0].changesets, undefined);
		});

		test.skip('listSessions advertises persisted changeset counts without seeding state; changeset subscribe restores lazily', async () => {
			const db = disposables.add(await SessionDatabase.open(':memory:'));
			const persistedDiffs = [
				{
					after: { uri: 'file:///wd/a.ts', content: { uri: 'file:///wd/a.ts' } },
					diff: { added: 5, removed: 2 },
				},
			];
			await db.setMetadata('diffs', JSON.stringify(persistedDiffs));

			const sessionId = 'unopened-with-diffs';
			const sessionUri = AgentSession.uri('copilot', sessionId);
			const sessionDataService: ISessionDataService = {
				_serviceBrand: undefined,
				getSessionDataDir: () => URI.parse('inmemory:/session-data'),
				getSessionDataDirById: () => URI.parse('inmemory:/session-data'),
				openDatabase: (): IReference<ISessionDatabase> => ({ object: db, dispose: () => { } }),
				tryOpenDatabase: async (): Promise<IReference<ISessionDatabase> | undefined> => ({ object: db, dispose: () => { } }),
				deleteSessionData: async () => { },
				onWillDeleteSessionData: Event.None,
				cleanupOrphanedData: async () => { },
				whenIdle: async () => { },
			};

			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(sessionId, sessionUri);

			const svc = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			svc.registerProvider(agent);

			const sessions = await svc.listSessions();
			const changesetUri = buildSessionChangesetUri(sessionUri.toString());

			assert.deepStrictEqual({
				listCatalogueEntry: sessions[0].changesets?.find(c => c.uriTemplate === changesetUri),
				listSeededSnapshot: svc.stateManager.getSnapshot(changesetUri),
			}, {
				listCatalogueEntry: {
					label: 'Branch Changes',
					uriTemplate: changesetUri,
					additions: 5,
					deletions: 2,
					files: 1,
				},
				listSeededSnapshot: undefined,
			});

			const snapshot = await svc.subscribe(URI.parse(changesetUri), 'client-changeset');
			const state = snapshot.state as { status: string; files: Array<{ id: string }> };
			assert.strictEqual(state.status, 'ready');
			assert.deepStrictEqual(state.files.map(f => f.id), ['file:///wd/a.ts']);
		});

		test.skip('listSessions prefers ready live changeset state over stale persisted diffs for unopened sessions', async () => {
			const db = disposables.add(await SessionDatabase.open(':memory:'));
			// Stale persisted diffs — obviously different totals so the
			// source-of-truth choice is visible.
			const persistedDiffs = [
				{ after: { uri: 'file:///wd/x.ts', content: { uri: 'file:///wd/x.ts' } }, diff: { added: 99, removed: 0 } },
				{ after: { uri: 'file:///wd/y.ts', content: { uri: 'file:///wd/y.ts' } }, diff: { added: 0, removed: 0 } },
				{ after: { uri: 'file:///wd/z.ts', content: { uri: 'file:///wd/z.ts' } }, diff: { added: 0, removed: 0 } },
			];
			await db.setMetadata('diffs', JSON.stringify(persistedDiffs));

			const sessionId = 'unopened-stale-diffs';
			const sessionUri = AgentSession.uri('copilot', sessionId);
			const sessionDataService: ISessionDataService = {
				_serviceBrand: undefined,
				getSessionDataDir: () => URI.parse('inmemory:/session-data'),
				getSessionDataDirById: () => URI.parse('inmemory:/session-data'),
				openDatabase: (): IReference<ISessionDatabase> => ({ object: db, dispose: () => { } }),
				tryOpenDatabase: async (): Promise<IReference<ISessionDatabase> | undefined> => ({ object: db, dispose: () => { } }),
				deleteSessionData: async () => { },
				onWillDeleteSessionData: Event.None,
				cleanupOrphanedData: async () => { },
				whenIdle: async () => { },
			};

			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(sessionId, sessionUri);

			const svc = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			svc.registerProvider(agent);

			// Seed live changeset state directly: a single file with
			// different counts than the stale persisted blob.
			const changesetUri = svc.stateManager.registerChangeset(buildSessionChangesetUri(sessionUri.toString()));
			svc.stateManager.dispatchServerAction(changesetUri, {
				type: ActionType.ChangesetFileSet,
				file: {
					id: 'file:///wd/live.ts',
					edit: { after: { uri: 'file:///wd/live.ts', content: { uri: 'file:///wd/live.ts' } }, diff: { added: 1, removed: 0 } }
				},
			});
			svc.stateManager.dispatchServerAction(changesetUri, {
				type: ActionType.ChangesetStatusChanged,
				status: ChangesetStatus.Ready,
			});

			const sessions = await svc.listSessions();
			assert.deepStrictEqual(sessions[0].changesets, [
				{
					label: 'Branch Changes',
					uriTemplate: changesetUri,
					additions: 1,
					deletions: 0,
					files: 1,
				},
				{
					label: 'Uncommitted Changes',
					uriTemplate: `${sessionUri.toString()}/changeset/uncommitted`,
					description: 'Show uncommitted changes in this session',
				},
			]);
		});

		test.skip('listSessions does not request the diffs metadata key when a live source can answer', async () => {
			const requestedKeys: string[][] = [];
			const db: ISessionDatabase = {
				dispose: () => { },
				getMetadata: async () => undefined,
				getMetadataObject: async <T extends Record<string, unknown>>(obj: T): Promise<{ [K in keyof T]: string | undefined }> => {
					requestedKeys.push(Object.keys(obj));
					return Object.fromEntries(Object.keys(obj).map(k => [k, undefined])) as { [K in keyof T]: string | undefined };
				},
				setMetadata: async () => { },
				deleteMetadata: async () => { },
				appendEvent: async () => { },
				readEvents: async () => [],
				readEventCount: async () => 0,
			} as unknown as ISessionDatabase;

			const sessionId = 'unopened-live-source';
			const sessionUri = AgentSession.uri('copilot', sessionId);
			const sessionDataService: ISessionDataService = {
				_serviceBrand: undefined,
				getSessionDataDir: () => URI.parse('inmemory:/session-data'),
				getSessionDataDirById: () => URI.parse('inmemory:/session-data'),
				openDatabase: (): IReference<ISessionDatabase> => ({ object: db, dispose: () => { } }),
				tryOpenDatabase: async (): Promise<IReference<ISessionDatabase> | undefined> => ({ object: db, dispose: () => { } }),
				deleteSessionData: async () => { },
				onWillDeleteSessionData: Event.None,
				cleanupOrphanedData: async () => { },
				whenIdle: async () => { },
			};

			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(sessionId, sessionUri);

			const svc = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			svc.registerProvider(agent);

			// Seed a ready (zero-file) live changeset state — this alone
			// must be authoritative enough to suppress the persisted-diffs
			// read.
			const changesetUri = svc.stateManager.registerChangeset(buildSessionChangesetUri(sessionUri.toString()));
			svc.stateManager.dispatchServerAction(changesetUri, {
				type: ActionType.ChangesetStatusChanged,
				status: ChangesetStatus.Ready,
			});

			await svc.listSessions();

			assert.strictEqual(requestedKeys.length, 1);
			assert.strictEqual(requestedKeys[0].includes('diffs'), false, `expected listSessions to skip the 'diffs' key when ready live changeset state exists; requested=${requestedKeys[0].join(',')}`);
		});

		test.skip('listSessions still reads persisted diffs when only a computing (not ready) changeset state exists', async () => {
			const db = disposables.add(await SessionDatabase.open(':memory:'));
			const persistedDiffs = [
				{ after: { uri: 'file:///wd/p.ts', content: { uri: 'file:///wd/p.ts' } }, diff: { added: 7, removed: 1 } },
			];
			await db.setMetadata('diffs', JSON.stringify(persistedDiffs));

			const sessionId = 'unopened-computing-changeset';
			const sessionUri = AgentSession.uri('copilot', sessionId);
			const sessionDataService: ISessionDataService = {
				_serviceBrand: undefined,
				getSessionDataDir: () => URI.parse('inmemory:/session-data'),
				getSessionDataDirById: () => URI.parse('inmemory:/session-data'),
				openDatabase: (): IReference<ISessionDatabase> => ({ object: db, dispose: () => { } }),
				tryOpenDatabase: async (): Promise<IReference<ISessionDatabase> | undefined> => ({ object: db, dispose: () => { } }),
				deleteSessionData: async () => { },
				onWillDeleteSessionData: Event.None,
				cleanupOrphanedData: async () => { },
				whenIdle: async () => { },
			};

			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			(agent as unknown as { _sessions: Map<string, URI> })._sessions.set(sessionId, sessionUri);

			const svc = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			svc.registerProvider(agent);

			// Register a changeset but leave it in the default
			// `Computing` status (no ChangesetStatusChanged dispatch).
			svc.stateManager.registerChangeset(buildSessionChangesetUri(sessionUri.toString()));

			const sessions = await svc.listSessions();
			assert.deepStrictEqual(sessions[0].changesets, [
				{
					label: 'Branch Changes',
					uriTemplate: `${sessionUri.toString()}/changeset/session`,
					additions: 7,
					deletions: 1,
					files: 1,
				},
				{
					label: 'Uncommitted Changes',
					uriTemplate: `${sessionUri.toString()}/changeset/uncommitted`,
					description: 'Show uncommitted changes in this session',
				},
			]);
		});

		test.skip('listSessions overlays live state manager title over SDK title', async () => {
			service.registerProvider(copilotAgent);

			const session = await service.createSession({ provider: 'copilot' });

			// Simulate immediate title change via state manager
			service.stateManager.dispatchServerAction(session.toString(), {
				type: ActionType.SessionTitleChanged,
				title: 'User first message',
			});

			const sessions = await service.listSessions();
			assert.strictEqual(sessions.length, 1);
			assert.strictEqual(sessions[0].summary, 'User first message');
		});

		test('createSession attaches git state into state _meta when working directory is present', async () => {
			const workingDirectory = URI.file('/workspace/repo');
			const gitState = {
				hasGitHubRemote: true,
				branchName: 'feature/x',
				baseBranchName: 'main',
				upstreamBranchName: 'origin/feature/x',
				incomingChanges: 1,
				outgoingChanges: 2,
				uncommittedChanges: 3,
			};
			const calls: string[] = [];
			const gitService = {
				_serviceBrand: undefined,
				isInsideWorkTree: async () => true,
				getCurrentBranch: async () => undefined,
				getDefaultBranch: async () => undefined,
				getBranches: async () => [],
				getRepositoryRoot: async () => undefined,
				getWorktreeRoots: async () => [],
				addWorktree: async () => { },
				addExistingWorktree: async () => { },
				removeWorktree: async () => { },
				branchExists: async () => false,
				hasUncommittedChanges: async () => false,
				commitAll: async () => { },
				hasUpstream: async () => false,
				pushBranch: async () => { },
				getSessionGitState: async (uri: URI) => { calls.push(uri.fsPath); return gitState; },
				computeSessionFileDiffs: async () => undefined,
				showBlob: async () => undefined,
				captureWorkingTreeAsTree: async () => undefined,
				commitTree: async () => undefined,
				updateRef: async () => { },
				deleteRefs: async () => { },
				revParse: async () => undefined,
				computeFileDiffsBetweenRefs: async () => undefined,
			};
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			agent.resolvedWorkingDirectory = workingDirectory;
			agent.sessionMetadataOverrides = { workingDirectory };
			localService.registerProvider(agent);

			const session = await localService.createSession({ provider: 'copilot' });

			// _attachGitState is fire-and-forget; drain microtasks until the
			// git service's promise has resolved and setSessionMeta has run.
			for (let i = 0; i < 5; i++) {
				await Promise.resolve();
			}

			const sessions = await localService.listSessions();
			assert.strictEqual(sessions.length, 1);
			assert.deepStrictEqual(calls, [workingDirectory.fsPath]);
			assert.deepStrictEqual(
				localService.stateManager.getSessionState(session.toString())?._meta,
				{ git: gitState },
			);
		});

		test.skip('createSession refreshes branch and uncommitted changesets after git state attaches', async () => {
			const workingDirectory = URI.file('/workspace/repo');
			const gitState = {
				hasGitHubRemote: false,
				branchName: 'feature/x',
				baseBranchName: 'main',
				upstreamBranchName: undefined,
				incomingChanges: 0,
				outgoingChanges: 0,
				uncommittedChanges: 0,
			};
			const computeCalls: Array<{ sessionUri: string; baseBranch: string | undefined }> = [];
			const gitService = createNoopGitService();
			gitService.getSessionGitState = async () => gitState;
			gitService.computeSessionFileDiffs = async (_wd, opts) => {
				computeCalls.push({ sessionUri: opts.sessionUri, baseBranch: opts.baseBranch });
				return [];
			};
			const sessionDb = new SessionDatabase(':memory:');
			disposables.add(toDisposable(() => sessionDb.close()));
			const sessionDataService = createSessionDataService(sessionDb);
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			agent.resolvedWorkingDirectory = workingDirectory;
			agent.sessionMetadataOverrides = { workingDirectory };
			localService.registerProvider(agent);

			const session = await localService.createSession({ provider: 'copilot' });
			for (let i = 0; i < 100 && computeCalls.length < 2; i++) {
				await new Promise(resolve => setTimeout(resolve, 2));
			}

			assert.deepStrictEqual(
				computeCalls.sort((a, b) => (a.baseBranch ?? '').localeCompare(b.baseBranch ?? '')),
				[
					{ sessionUri: session.toString(), baseBranch: undefined },
					{ sessionUri: session.toString(), baseBranch: 'main' },
				],
			);
		});

		test('createSession skips git overlay when no working directory or no git state', async () => {
			const gitService = {
				_serviceBrand: undefined,
				isInsideWorkTree: async () => false,
				getCurrentBranch: async () => undefined,
				getDefaultBranch: async () => undefined,
				getBranches: async () => [],
				getRepositoryRoot: async () => undefined,
				getWorktreeRoots: async () => [],
				addWorktree: async () => { },
				addExistingWorktree: async () => { },
				removeWorktree: async () => { },
				branchExists: async () => false,
				hasUncommittedChanges: async () => false,
				commitAll: async () => { },
				hasUpstream: async () => false,
				pushBranch: async () => { },
				getSessionGitState: async () => undefined,
				computeSessionFileDiffs: async () => undefined,
				showBlob: async () => undefined,
				captureWorkingTreeAsTree: async () => undefined,
				commitTree: async () => undefined,
				updateRef: async () => { },
				deleteRefs: async () => { },
				revParse: async () => undefined,
				computeFileDiffsBetweenRefs: async () => undefined,
			};
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			// No resolvedWorkingDirectory set on the mock.
			localService.registerProvider(agent);

			const session = await localService.createSession({ provider: 'copilot' });
			for (let i = 0; i < 5; i++) {
				await Promise.resolve();
			}
			const sessions = await localService.listSessions();

			assert.strictEqual(sessions.length, 1);
			assert.strictEqual(localService.stateManager.getSessionState(session.toString())?._meta, undefined);
		});

		test.skip('createSession strips git-only catalogue entries for non-git working directory', async () => {
			const workingDirectory = URI.file('/workspace/not-a-repo');
			const gitService = createNoopGitService();
			// Probe runs but reports "not a git repo".
			gitService.getSessionGitState = async () => undefined;

			const localService = disposables.add(new AgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			agent.resolvedWorkingDirectory = workingDirectory;
			agent.sessionMetadataOverrides = { workingDirectory };
			localService.registerProvider(agent);

			const session = await localService.createSession({ provider: 'copilot' });
			for (let i = 0; i < 5; i++) {
				await Promise.resolve();
			}

			const state = localService.stateManager.getSessionState(session.toString());
			assert.ok(state);
			assert.deepStrictEqual(state!.changesets?.length, 0);
		});

		test.skip('createSession keeps git-only catalogue entries for a git working directory', async () => {
			const workingDirectory = URI.file('/workspace/repo');
			const gitState = {
				hasGitHubRemote: false,
				branchName: 'main',
				baseBranchName: 'main',
				upstreamBranchName: undefined,
				incomingChanges: 0,
				outgoingChanges: 0,
				uncommittedChanges: 0,
			};
			const gitService = createNoopGitService();
			gitService.getSessionGitState = async () => gitState;

			const localService = disposables.add(new AgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			agent.resolvedWorkingDirectory = workingDirectory;
			agent.sessionMetadataOverrides = { workingDirectory };
			localService.registerProvider(agent);

			const session = await localService.createSession({ provider: 'copilot' });
			for (let i = 0; i < 5; i++) {
				await Promise.resolve();
			}

			const state = localService.stateManager.getSessionState(session.toString());
			assert.ok(state);
			assert.deepStrictEqual(state!.changesets, [
				{ label: 'Branch Changes', uriTemplate: `${session.toString()}/changeset/session`, description: 'main', changeKind: 'session' },
				{ label: 'Uncommitted Changes', uriTemplate: `${session.toString()}/changeset/uncommitted`, description: 'Show uncommitted changes in this session', changeKind: 'uncommitted' },
			]);
		});

		test.skip('createSession sets Branch Changes description from worktree branch info', async () => {
			const workingDirectory = URI.file('/workspace/repo');
			const gitState = {
				hasGitHubRemote: false,
				branchName: 'feature/x',
				baseBranchName: 'main',
				upstreamBranchName: undefined,
				incomingChanges: 0,
				outgoingChanges: 0,
				uncommittedChanges: 0,
			};
			const gitService = createNoopGitService();
			gitService.getSessionGitState = async () => gitState;

			const localService = disposables.add(new AgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			agent.resolvedWorkingDirectory = workingDirectory;
			agent.sessionMetadataOverrides = { workingDirectory };
			localService.registerProvider(agent);

			const session = await localService.createSession({ provider: 'copilot' });
			for (let i = 0; i < 5; i++) {
				await Promise.resolve();
			}

			const state = localService.stateManager.getSessionState(session.toString());
			assert.ok(state);
			assert.deepStrictEqual(state!.changesets, [
				{ label: 'Branch Changes', uriTemplate: `${session.toString()}/changeset/session`, description: 'feature/x → main', changeKind: 'session' },
				{ label: 'Uncommitted Changes', uriTemplate: `${session.toString()}/changeset/uncommitted`, description: 'Show uncommitted changes in this session', changeKind: 'uncommitted' },
			]);
		});

		test('subscribe lazily attaches git state when an existing session has no _meta.git', async () => {
			// Regression test: previously AgentService was constructed without
			// a git service, so _attachGitState always bailed and `_meta.git`
			// was never populated. This test ensures the lazy-fire path on
			// subscribe() actually invokes the git service and writes git
			// state into the session's `_meta`.
			const workingDirectory = URI.file('/workspace/repo');
			const gitState = {
				hasGitHubRemote: false,
				branchName: 'feature/lazy',
				baseBranchName: 'main',
				upstreamBranchName: undefined,
				incomingChanges: 0,
				outgoingChanges: 0,
				uncommittedChanges: 0,
			};
			const calls: string[] = [];
			const gitService = createNoopGitService();
			gitService.getSessionGitState = async (uri: URI) => { calls.push(uri.fsPath); return gitState; };
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, nullSessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
			const agent = new MockAgent('copilot');
			disposables.add(toDisposable(() => agent.dispose()));
			agent.resolvedWorkingDirectory = workingDirectory;
			agent.sessionMetadataOverrides = { workingDirectory };
			localService.registerProvider(agent);

			// Seed a session and clear its _meta so subscribe must lazily
			// recompute git state.
			const session = await localService.createSession({ provider: 'copilot' });
			for (let i = 0; i < 5; i++) {
				await Promise.resolve();
			}
			localService.stateManager.setSessionMeta(session.toString(), undefined);
			calls.length = 0;

			await localService.subscribe(session, 'client-1');
			for (let i = 0; i < 5; i++) {
				await Promise.resolve();
			}

			assert.deepStrictEqual(calls, [workingDirectory.fsPath]);
			assert.deepStrictEqual(
				localService.stateManager.getSessionState(session.toString())?._meta,
				{ git: gitState },
			);
		});

		test('subscribe to a registered session changeset URI returns a changeset snapshot', async () => {
			service.registerProvider(copilotAgent);
			const session = await service.createSession({ provider: 'copilot' });

			const changesetUri = buildSessionChangesetUri(session.toString());
			const snapshot = await service.subscribe(URI.parse(changesetUri), 'client-cs-known');

			assert.deepStrictEqual(
				{
					resource: snapshot.resource.toString(),
					files: (snapshot.state as ChangesetState).files.length,
				},
				{
					resource: changesetUri,
					files: 0,
				},
			);
		});

		test('subscribe to an unknown changeset id fails without restoring the parent session', async () => {
			service.registerProvider(copilotAgent);
			// Build a changeset URI with a producer-defined id we don't
			// recognise (`staged`). The unknown-changeset early throw must
			// fire before the session-restore fallback so the parent session
			// is not materialized as a side effect of subscribing to a child
			// changeset URI.
			const sessionUri = URI.from({ scheme: 'copilot', path: '/missing-session' }).toString();
			const changesetUri = `${sessionUri}/changeset/staged`;

			await assert.rejects(
				() => service.subscribe(URI.parse(changesetUri), 'client-cs-unknown'),
				/unknown changeset resource/,
			);
			assert.strictEqual(
				service.stateManager.getSessionState(sessionUri),
				undefined,
				'parent session must not be materialized as a side effect of an unknown changeset subscription',
			);
		});

		test('createSession stores live session config', async () => {
			service.registerProvider(copilotAgent);

			const config = { isolation: 'worktree', branch: 'feature/config' };
			const session = await service.createSession({ provider: 'copilot', config });

			assert.deepStrictEqual(service.stateManager.getSessionState(session.toString())?.config?.values, config);
		});

		test('seeds activeClient into the initial session state when provided', async () => {
			service.registerProvider(copilotAgent);

			const envelopes: ActionEnvelope[] = [];
			disposables.add(service.onDidAction(env => envelopes.push(env)));

			const activeClient: SessionActiveClient = {
				clientId: 'client-eager',
				tools: [{ name: 't1', description: 'd', inputSchema: { type: 'object' } }],
				customizations: [{ type: CustomizationType.Plugin, id: customizationId('file:///plugin-a'), uri: 'file:///plugin-a', name: 'A', enabled: true }],
			};
			const session = await service.createSession({ provider: 'copilot', activeClient });

			assert.deepStrictEqual({
				activeClient: service.stateManager.getSessionState(session.toString())?.activeClient,
				dispatchedActiveClientChanged: envelopes.some(e => e.action.type === ActionType.SessionActiveClientChanged),
			}, {
				activeClient,
				dispatchedActiveClientChanged: false,
			});
		});

		test('omits activeClient from the initial session state when not provided', async () => {
			service.registerProvider(copilotAgent);

			const session = await service.createSession({ provider: 'copilot' });

			assert.strictEqual(service.stateManager.getSessionState(session.toString())?.activeClient, undefined);
		});
	});

	// ---- authenticate ---------------------------------------------------

	suite('authenticate', () => {

		test('routes token to provider matching the resource', async () => {
			service.registerProvider(copilotAgent);

			const result = await service.authenticate({ resource: 'https://api.github.com', token: 'ghp_test123' });

			assert.deepStrictEqual(result, { authenticated: true });
			assert.deepStrictEqual(copilotAgent.authenticateCalls, [{ resource: 'https://api.github.com', token: 'ghp_test123' }]);
		});

		test('returns not authenticated for unknown resource', async () => {
			service.registerProvider(copilotAgent);

			const result = await service.authenticate({ resource: 'https://unknown.example.com', token: 'tok' });

			assert.deepStrictEqual({ result, token: service.getAuthToken({ resource: 'https://unknown.example.com' }), authenticateCalls: copilotAgent.authenticateCalls }, {
				result: { authenticated: false },
				token: undefined,
				authenticateCalls: [],
			});
		});

		test('stores GitHub Copilot token for operation handlers', async () => {
			service.registerProvider(copilotAgent);

			const result = await service.authenticate({ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, token: 'copilot-token' });

			assert.deepStrictEqual({ result, token: service.getAuthToken({ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, scopes: GITHUB_COPILOT_PROTECTED_RESOURCE.scopes_supported }), authenticateCalls: copilotAgent.authenticateCalls }, {
				result: { authenticated: true },
				token: 'copilot-token',
				authenticateCalls: [{ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, token: 'copilot-token' }],
			});
		});

		test('stores tokens for the same resource by scopes', async () => {
			service.registerProvider(copilotAgent);

			await service.authenticate({ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, scopes: ['read:user'], token: 'read-token' });
			await service.authenticate({ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, scopes: ['read:user', 'user:email'], token: 'profile-token' });

			assert.deepStrictEqual({
				readToken: service.getAuthToken({ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, scopes: ['read:user'] }),
				profileToken: service.getAuthToken({ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, scopes: ['user:email', 'read:user'] }),
				supersetToken: service.getAuthToken({ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, scopes: ['user:email'] }),
			}, {
				readToken: 'read-token',
				profileToken: 'profile-token',
				supersetToken: 'profile-token',
			});
		});

		test('fans out to every provider that owns the resource', async () => {
			// Two providers share the same protected resource (the real
			// motivating example: both Copilot CLI and Claude consume the
			// GitHub Copilot token). Both must see the token — the
			// previous for-loop short-circuit only delivered to the first.
			const claudeAgent = new MockAgent('claude');
			claudeAgent.getProtectedResources = () => [{ resource: 'https://api.github.com', authorization_servers: ['https://github.com/login/oauth'], required: true }];
			disposables.add(toDisposable(() => claudeAgent.dispose()));
			service.registerProvider(copilotAgent);
			service.registerProvider(claudeAgent);

			const result = await service.authenticate({ resource: 'https://api.github.com', token: 'tok' });

			assert.deepStrictEqual({
				result,
				copilotCalls: copilotAgent.authenticateCalls,
				claudeCalls: claudeAgent.authenticateCalls,
			}, {
				result: { authenticated: true },
				copilotCalls: [{ resource: 'https://api.github.com', token: 'tok' }],
				claudeCalls: [{ resource: 'https://api.github.com', token: 'tok' }],
			});
		});

		test('isolates a provider that throws — others still authenticate', async () => {
			// Regression: if any provider's authenticate() rejects, the
			// fan-out must NOT sink the others. Previously the call used
			// Promise.all, which propagated the first rejection.
			const flakyAgent = new MockAgent('claude');
			flakyAgent.getProtectedResources = () => [{ resource: 'https://api.github.com', authorization_servers: ['https://github.com/login/oauth'], required: true }];
			flakyAgent.authenticate = async () => { throw new Error('proxy bind failed'); };
			disposables.add(toDisposable(() => flakyAgent.dispose()));
			service.registerProvider(copilotAgent);
			service.registerProvider(flakyAgent);

			const result = await service.authenticate({ resource: 'https://api.github.com', token: 'tok' });

			assert.deepStrictEqual({
				result,
				copilotCalls: copilotAgent.authenticateCalls,
			}, {
				result: { authenticated: true },
				copilotCalls: [{ resource: 'https://api.github.com', token: 'tok' }],
			});
		});

		test('reports not authenticated when every matching provider rejects', async () => {
			// All matching providers fail — the result must be
			// { authenticated: false } rather than a thrown error.
			const flakyA = new MockAgent('claude');
			const flakyB = new MockAgent('mock');
			flakyA.getProtectedResources = () => [{ resource: 'https://api.github.com', authorization_servers: ['https://github.com/login/oauth'], required: true }];
			flakyB.getProtectedResources = () => [{ resource: 'https://api.github.com', authorization_servers: ['https://github.com/login/oauth'], required: true }];
			flakyA.authenticate = async () => { throw new Error('A'); };
			flakyB.authenticate = async () => { throw new Error('B'); };
			disposables.add(toDisposable(() => flakyA.dispose()));
			disposables.add(toDisposable(() => flakyB.dispose()));
			service.registerProvider(flakyA);
			service.registerProvider(flakyB);

			const result = await service.authenticate({ resource: 'https://api.github.com', token: 'tok' });

			assert.deepStrictEqual(result, { authenticated: false });
		});
	});

	// ---- shutdown -------------------------------------------------------

	suite('shutdown', () => {

		test('shuts down all providers', async () => {
			let copilotShutdown = false;
			copilotAgent.shutdown = async () => { copilotShutdown = true; };

			service.registerProvider(copilotAgent);

			await service.shutdown();
			assert.ok(copilotShutdown);
		});
	});

	// ---- restoreSession -------------------------------------------------

	suite('restoreSession', () => {

		test('restores a session with message history', async () => {
			service.registerProvider(copilotAgent);
			const { session } = await copilotAgent.createSession();
			const sessions = await copilotAgent.listSessions();
			const sessionResource = sessions[0].session;

			copilotAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi there!', toolRequests: [] },
			];

			await service.restoreSession(sessionResource);

			const state = service.stateManager.getSessionState(sessionResource.toString());
			assert.ok(state, 'session should be in state manager');
			assert.strictEqual(state!.lifecycle, SessionLifecycle.Ready);
			assert.strictEqual(state!.turns.length, 1);
			assert.strictEqual(state!.turns[0].message.text, 'Hello');
			const mdPart = state!.turns[0].responseParts.find((p): p is MarkdownResponsePart => p.kind === ResponsePartKind.Markdown);
			assert.ok(mdPart);
			assert.strictEqual(mdPart.content, 'Hi there!');
			assert.strictEqual(state!.turns[0].state, TurnState.Complete);
		});

		test('restores a session with tool calls', async () => {
			service.registerProvider(copilotAgent);
			const { session } = await copilotAgent.createSession();
			const sessions = await copilotAgent.listSessions();
			const sessionResource = sessions[0].session;

			copilotAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Run a command', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'I will run a command.', toolRequests: [{ toolCallId: 'tc-1', name: 'shell' }] },
				{ type: 'tool_start', session, toolCallId: 'tc-1', toolName: 'shell', displayName: 'Shell', invocationMessage: 'Running command...' },
				{ type: 'tool_complete', session, toolCallId: 'tc-1', result: { success: true, pastTenseMessage: 'Ran command', content: [{ type: ToolResultContentType.Text, text: 'output' }] } },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-3', content: 'Done!', toolRequests: [] },
			];

			await service.restoreSession(sessionResource);

			const state = service.stateManager.getSessionState(sessionResource.toString());
			assert.ok(state);
			const turn = state!.turns[0];
			const toolCallParts = turn.responseParts.filter((p): p is ToolCallResponsePart => p.kind === ResponsePartKind.ToolCall);
			assert.strictEqual(toolCallParts.length, 1);
			const tc = toolCallParts[0].toolCall as ToolCallCompletedState;
			assert.strictEqual(tc.status, ToolCallStatus.Completed);
			assert.strictEqual(tc.toolCallId, 'tc-1');
			assert.strictEqual(tc.confirmed, ToolCallConfirmationReason.NotNeeded);
		});

		test('interleaves reasoning, markdown, and tool calls in stream order on resume', async () => {
			service.registerProvider(copilotAgent);
			const { session } = await copilotAgent.createSession();
			const sessions = await copilotAgent.listSessions();
			const sessionResource = sessions[0].session;

			copilotAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'u-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'a-1', content: 'Reply A', reasoningText: 'Thinking A', toolRequests: [{ toolCallId: 'tc-1', name: 'shell' }] },
				{ type: 'tool_start', session, toolCallId: 'tc-1', toolName: 'shell', displayName: 'Shell', invocationMessage: 'Running...' },
				{ type: 'tool_complete', session, toolCallId: 'tc-1', result: { success: true, pastTenseMessage: 'Ran', content: [{ type: ToolResultContentType.Text, text: 'ok' }] } },
				{ type: 'message', session, role: 'assistant', messageId: 'a-2', content: 'Reply B', reasoningText: 'Thinking B', toolRequests: [] },
			];

			await service.restoreSession(sessionResource);

			const state = service.stateManager.getSessionState(sessionResource.toString());
			assert.ok(state);
			const turn = state!.turns[0];
			const summary = turn.responseParts.map(p => {
				if (p.kind === ResponsePartKind.Reasoning) { return ['reasoning', p.content]; }
				if (p.kind === ResponsePartKind.Markdown) { return ['markdown', p.content]; }
				if (p.kind === ResponsePartKind.ToolCall) { return ['toolCall', p.toolCall.toolCallId]; }
				return ['other'];
			});
			assert.deepStrictEqual(summary, [
				['reasoning', 'Thinking A'],
				['markdown', 'Reply A'],
				['toolCall', 'tc-1'],
				['reasoning', 'Thinking B'],
				['markdown', 'Reply B'],
			]);
		});

		test('flushes interrupted turns', async () => {
			service.registerProvider(copilotAgent);
			const { session } = await copilotAgent.createSession();
			const sessions = await copilotAgent.listSessions();
			const sessionResource = sessions[0].session;

			copilotAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Interrupted', toolRequests: [] },
				{ type: 'message', session, role: 'user', messageId: 'msg-2', content: 'Retried', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-3', content: 'Answer', toolRequests: [] },
			];

			await service.restoreSession(sessionResource);

			const state = service.stateManager.getSessionState(sessionResource.toString());
			assert.ok(state);
			assert.strictEqual(state!.turns.length, 2);
			assert.strictEqual(state!.turns[0].state, TurnState.Cancelled);
			assert.strictEqual(state!.turns[1].state, TurnState.Complete);
		});

		test('throws when session is not found on backend', async () => {
			service.registerProvider(copilotAgent);
			await assert.rejects(
				() => service.restoreSession(AgentSession.uri('copilot', 'nonexistent')),
				/Session not found on backend/,
			);
		});

		test('restores known session without listing all provider sessions', async () => {
			service.registerProvider(copilotAgent);
			const { session } = await copilotAgent.createSession();
			service.stateManager.deleteSession(session.toString());

			copilotAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
			];

			let listSessionsCalled = false;
			copilotAgent.listSessions = async () => {
				listSessionsCalled = true;
				throw new Error('restoreSession should not enumerate sessions');
			};

			await service.restoreSession(session);

			assert.strictEqual(listSessionsCalled, false);
			assert.ok(service.stateManager.getSessionState(session.toString()));
		});

		test('falls back to listing sessions when direct metadata restore fails', async () => {
			service.registerProvider(copilotAgent);
			const { session } = await copilotAgent.createSession();
			service.stateManager.deleteSession(session.toString());

			copilotAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
			];

			copilotAgent.getSessionMetadata = async () => {
				throw new Error('direct metadata unavailable');
			};
			const originalListSessions = copilotAgent.listSessions.bind(copilotAgent);
			let listSessionsCalled = false;
			copilotAgent.listSessions = async () => {
				listSessionsCalled = true;
				return originalListSessions();
			};

			await service.restoreSession(session);

			assert.deepStrictEqual({
				listSessionsCalled,
				restored: !!service.stateManager.getSessionState(session.toString()),
			}, {
				listSessionsCalled: true,
				restored: true,
			});
		});

		test('restores a session with subagent tool calls', async () => {
			service.registerProvider(copilotAgent);
			const { session } = await copilotAgent.createSession();
			const sessions = await copilotAgent.listSessions();
			const sessionResource = sessions[0].session;

			copilotAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Review this code', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: '', toolRequests: [{ toolCallId: 'tc-sub', name: 'task' }] },
				{ type: 'tool_start', session, toolCallId: 'tc-sub', toolName: 'task', displayName: 'Task', invocationMessage: 'Delegating...', toolKind: 'subagent' as const, subagentDescription: 'Find related files', subagentAgentName: 'explore' },
				{ type: 'subagent_started', session, toolCallId: 'tc-sub', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores the codebase' },
				// Inner tool calls from the subagent (have parentToolCallId)
				{ type: 'tool_start', session, toolCallId: 'tc-inner-1', toolName: 'bash', displayName: 'Bash', invocationMessage: 'Running ls...', parentToolCallId: 'tc-sub' },
				{ type: 'tool_complete', session, toolCallId: 'tc-inner-1', result: { success: true, pastTenseMessage: 'Ran ls', content: [{ type: ToolResultContentType.Text, text: 'file1.ts' }] }, parentToolCallId: 'tc-sub' },
				{ type: 'tool_start', session, toolCallId: 'tc-inner-2', toolName: 'view', displayName: 'View File', invocationMessage: 'Reading file1.ts', parentToolCallId: 'tc-sub' },
				{ type: 'tool_complete', session, toolCallId: 'tc-inner-2', result: { success: true, pastTenseMessage: 'Read file1.ts' }, parentToolCallId: 'tc-sub' },
				// Parent tool completes
				{ type: 'tool_complete', session, toolCallId: 'tc-sub', result: { success: true, pastTenseMessage: 'Delegated task', content: [{ type: ToolResultContentType.Text, text: 'Found 3 issues' }] } },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-3', content: 'The review found 3 issues.', toolRequests: [] },
			];

			await service.restoreSession(sessionResource);

			const state = service.stateManager.getSessionState(sessionResource.toString());
			assert.ok(state);

			// Should produce exactly one turn
			assert.strictEqual(state!.turns.length, 1, `Expected 1 turn but got ${state!.turns.length}`);

			const turn = state!.turns[0];
			assert.strictEqual(turn.message.text, 'Review this code');

			// The parent turn should only have the parent tool call — inner
			// tool calls are excluded from the parent and belong to the
			// child subagent session instead.
			const toolCallParts = turn.responseParts.filter((p): p is ToolCallResponsePart => p.kind === ResponsePartKind.ToolCall);
			assert.strictEqual(toolCallParts.length, 1, `Expected 1 tool call (parent only) but got ${toolCallParts.length}`);

			// Parent subagent tool call
			const parentTc = toolCallParts[0].toolCall as ToolCallCompletedState;
			assert.strictEqual(parentTc.toolCallId, 'tc-sub');
			assert.strictEqual(parentTc.status, ToolCallStatus.Completed);
			assert.strictEqual(parentTc._meta?.toolKind, 'subagent');
			assert.strictEqual(parentTc._meta?.subagentDescription, 'Find related files');
			assert.strictEqual(parentTc._meta?.subagentAgentName, 'explore');

			// Parent tool should have subagent content entry
			const content = parentTc.content ?? [];
			const subagentEntry = content.find(c => hasKey(c, { type: true }) && c.type === ToolResultContentType.Subagent);
			assert.ok(subagentEntry, 'Completed tool call should have subagent content entry');

			// Subscribing to the child session should restore it with inner tool calls
			const childSessionUri = buildSubagentSessionUri(sessionResource.toString(), 'tc-sub');
			const snapshot = await service.subscribe(URI.parse(childSessionUri), 'client-test');
			const childState = service.stateManager.getSessionState(childSessionUri);
			assert.ok(snapshot?.state, 'Child session snapshot should exist');
			assert.ok(childState, 'Child session state should exist');
			assert.strictEqual(childState!.turns.length, 1, 'Child session should have 1 turn');
			const childToolParts = childState!.turns[0].responseParts.filter((p): p is ToolCallResponsePart => p.kind === ResponsePartKind.ToolCall);
			assert.strictEqual(childToolParts.length, 2, `Child session should have 2 inner tool calls but got ${childToolParts.length}`);
			assert.ok(childToolParts.some(p => p.toolCall.toolCallId === 'tc-inner-1'), 'Should have tc-inner-1');
			assert.ok(childToolParts.some(p => p.toolCall.toolCallId === 'tc-inner-2'), 'Should have tc-inner-2');

			// The turn should also have the final markdown
			const mdParts = turn.responseParts.filter((p): p is MarkdownResponsePart => p.kind === ResponsePartKind.Markdown);
			assert.ok(mdParts.some(p => p.content.includes('3 issues')), 'Should have the final markdown response');
		});

		test('inner assistant messages from subagent do not create extra turns (fixture)', async () => {
			service.registerProvider(copilotAgent);
			const { session } = await copilotAgent.createSession();
			const sessions = await copilotAgent.listSessions();
			const sessionResource = sessions[0].session;

			// Load real SDK events from fixture (sanitized from ~/.copilot/session-state/)
			copilotAgent.sessionMessages = await loadFixtureMessages('subagent-session.jsonl', session);

			await service.restoreSession(sessionResource);

			const state = service.stateManager.getSessionState(sessionResource.toString());
			assert.ok(state);
			assert.strictEqual(state!.turns.length, 1, `Expected 1 turn but got ${state!.turns.length}: ${state!.turns.map(t => `"${t.message.text.substring(0, 40)}"`).join(', ')}`);
			assert.strictEqual(state!.turns[0].message.text, 'Run a sync subagent to do some searches, just testing subagent rendering');
			assert.strictEqual(state!.turns[0].state, TurnState.Complete);

			// Should have the parent subagent tool call with subagent content
			const toolCallParts = state!.turns[0].responseParts.filter((p): p is ToolCallResponsePart => p.kind === ResponsePartKind.ToolCall);
			const parentTc = toolCallParts.find(p => p.toolCall.toolName === 'task');
			assert.ok(parentTc, 'Should have a task tool call');
			assert.strictEqual(parentTc!.toolCall._meta?.toolKind, 'subagent');

			// Inner tool calls should NOT be in the parent turn — they belong
			// to the child subagent session.
			const parentToolCallId = parentTc!.toolCall.toolCallId;
			const nonParentTools = toolCallParts.filter(p => p.toolCall.toolCallId !== parentToolCallId);
			assert.strictEqual(nonParentTools.length, 0, `Parent turn should only contain the task tool call, but found ${nonParentTools.length} extra tool calls`);

			// Subscribe to the child subagent session and verify inner tools
			const childSessionUri = buildSubagentSessionUri(sessionResource.toString(), parentToolCallId);
			const snapshot = await service.subscribe(URI.parse(childSessionUri), 'client-test');
			assert.ok(snapshot?.state, 'Child session snapshot should exist');
			const childState = service.stateManager.getSessionState(childSessionUri);
			assert.ok(childState, 'Child session state should exist');
			assert.strictEqual(childState!.turns.length, 1, 'Child session should have 1 turn');
			const childToolParts = childState!.turns[0].responseParts.filter((p): p is ToolCallResponsePart => p.kind === ResponsePartKind.ToolCall);
			assert.ok(childToolParts.length > 0, `Child session should have inner tool calls but got ${childToolParts.length}`);

			// Should have the final markdown
			const mdParts = state!.turns[0].responseParts.filter((p): p is MarkdownResponsePart => p.kind === ResponsePartKind.Markdown);
			assert.ok(mdParts.length > 0, 'Should have markdown content');
		});
	});

	// ---- subscriber refcount + idle eviction ----------------------------

	suite('subscriber refcount eviction', () => {

		test('an empty session created in this lifetime stays observable until GC fires', async () => {
			service.registerProvider(copilotAgent);
			const sessionResource = await service.createSession({ provider: 'copilot' });

			service.addSubscriber(sessionResource, 'client-1');
			service.unsubscribe(sessionResource, 'client-1');

			// Empty sessions are routed to the GC pipeline rather than the
			// eviction pipeline, so their state stays observable in the
			// grace window for a re-subscribe to find.
			assert.ok(service.stateManager.getSessionState(sessionResource.toString()), 'empty created session must remain observable for the GC grace window');
		});

		test('a session with an active turn is NOT evicted when its last subscriber drops', async () => {
			service.registerProvider(copilotAgent);
			const sessionResource = await service.createSession({ provider: 'copilot' });

			service.addSubscriber(sessionResource, 'client-1');
			// Simulate an in-flight turn — eviction must skip this session even
			// when the refcount reaches zero, otherwise we'd drop live state
			// mid-response.
			service.dispatchAction(
				sessionResource.toString(),
				{ type: ActionType.SessionTurnStarted, turnId: 'turn-1', message: { text: 'hello', origin: { kind: MessageKind.User } } },
				'client-1', 1,
			);

			service.unsubscribe(sessionResource, 'client-1');

			assert.ok(service.stateManager.getSessionState(sessionResource.toString()), 'active-turn session must not be evicted');
		});

		test('a restored idle session is evicted when its last subscriber drops', async () => {
			service.registerProvider(copilotAgent);
			const { session } = await copilotAgent.createSession();
			const sessions = await copilotAgent.listSessions();
			const sessionResource = sessions[0].session;

			copilotAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
			];
			await service.restoreSession(sessionResource);
			service.addSubscriber(sessionResource, 'client-1');

			service.unsubscribe(sessionResource, 'client-1');

			assert.strictEqual(service.stateManager.getSessionState(sessionResource.toString()), undefined, 'restored idle session should be evicted');
		});

		test('multiple subscribers keep a restored session alive until all drop', async () => {
			service.registerProvider(copilotAgent);
			const { session } = await copilotAgent.createSession();
			const sessions = await copilotAgent.listSessions();
			const sessionResource = sessions[0].session;

			copilotAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
			];
			await service.restoreSession(sessionResource);
			service.addSubscriber(sessionResource, 'client-1');
			service.addSubscriber(sessionResource, 'client-2');

			service.unsubscribe(sessionResource, 'client-1');
			assert.ok(service.stateManager.getSessionState(sessionResource.toString()), 'still subscribed by client-2');

			service.unsubscribe(sessionResource, 'client-2');
			assert.strictEqual(service.stateManager.getSessionState(sessionResource.toString()), undefined, 'evicted after last subscriber');
		});

		test('subagent subscriber pins the parent session against eviction', async () => {
			service.registerProvider(copilotAgent);
			const { session } = await copilotAgent.createSession();
			const sessions = await copilotAgent.listSessions();
			const sessionResource = sessions[0].session;

			copilotAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Review', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: '', toolRequests: [{ toolCallId: 'tc-sub', name: 'task' }] },
				{ type: 'tool_start', session, toolCallId: 'tc-sub', toolName: 'task', displayName: 'Task', invocationMessage: 'Delegating', toolKind: 'subagent' as const, subagentDescription: 'Find files', subagentAgentName: 'explore' },
				{ type: 'subagent_started', session, toolCallId: 'tc-sub', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores' },
				{ type: 'tool_start', session, toolCallId: 'tc-inner', toolName: 'bash', displayName: 'Bash', invocationMessage: 'ls', parentToolCallId: 'tc-sub' },
				{ type: 'tool_complete', session, toolCallId: 'tc-inner', result: { success: true, pastTenseMessage: 'ran', content: [{ type: ToolResultContentType.Text, text: 'a' }] }, parentToolCallId: 'tc-sub' },
				{ type: 'tool_complete', session, toolCallId: 'tc-sub', result: { success: true, pastTenseMessage: 'done', content: [{ type: ToolResultContentType.Text, text: 'ok' }] } },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-3', content: 'Done', toolRequests: [] },
			];
			await service.restoreSession(sessionResource);
			const childUri = URI.parse(buildSubagentSessionUri(sessionResource.toString(), 'tc-sub'));
			await service.subscribe(childUri, 'client-child');

			service.addSubscriber(sessionResource, 'client-parent');

			// Parent drops — child still subscribed, parent must not be evicted
			service.unsubscribe(sessionResource, 'client-parent');
			assert.ok(service.stateManager.getSessionState(sessionResource.toString()), 'parent must stay while child is subscribed');
			assert.ok(service.stateManager.getSessionState(childUri.toString()), 'child still present');

			// Child drops — both can now be evicted
			service.unsubscribe(childUri, 'client-child');
			assert.strictEqual(service.stateManager.getSessionState(sessionResource.toString()), undefined, 'parent evicted after subagent drops');
			assert.strictEqual(service.stateManager.getSessionState(childUri.toString()), undefined, 'child also evicted with parent');
		});

		test('nested subagent subscriber pins ancestor session against eviction', async () => {
			service.registerProvider(copilotAgent);
			const { session } = await copilotAgent.createSession();
			const sessions = await copilotAgent.listSessions();
			const sessionResource = sessions[0].session;

			copilotAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Review', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: '', toolRequests: [{ toolCallId: 'tc-sub', name: 'task' }] },
				{ type: 'tool_start', session, toolCallId: 'tc-sub', toolName: 'task', displayName: 'Task', invocationMessage: 'Delegating', toolKind: 'subagent' as const, subagentDescription: 'Find files', subagentAgentName: 'explore' },
				{ type: 'subagent_started', session, toolCallId: 'tc-sub', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores' },
				{ type: 'tool_start', session, toolCallId: 'tc-inner', toolName: 'bash', displayName: 'Bash', invocationMessage: 'ls', parentToolCallId: 'tc-sub' },
				{ type: 'tool_complete', session, toolCallId: 'tc-inner', result: { success: true, pastTenseMessage: 'ran', content: [{ type: ToolResultContentType.Text, text: 'a' }] }, parentToolCallId: 'tc-sub' },
				{ type: 'tool_complete', session, toolCallId: 'tc-sub', result: { success: true, pastTenseMessage: 'done', content: [{ type: ToolResultContentType.Text, text: 'ok' }] } },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-3', content: 'Done', toolRequests: [] },
			];
			await service.restoreSession(sessionResource);
			const childUri = URI.parse(buildSubagentSessionUri(sessionResource, 'tc-sub'));
			await service.subscribe(childUri, 'client-child');
			const nestedChildUri = URI.parse(buildSubagentSessionUri(childUri, 'tc-nested'));

			service.addSubscriber(sessionResource, 'client-parent');
			service.addSubscriber(nestedChildUri, 'client-nested-child');
			service.unsubscribe(sessionResource, 'client-parent');

			assert.ok(service.stateManager.getSessionState(sessionResource.toString()), 'ancestor parent must stay while nested child is subscribed');
			assert.ok(service.stateManager.getSessionState(childUri.toString()), 'intermediate child still present');
		});

		test('depth-2 subagent eviction evicts the root session state', async () => {
			// Regression: when a depth-2 subagent URI unsubscribes the eviction
			// must reach all the way to the root, not stop at the intermediate
			// parent and leave root state cached indefinitely.
			service.registerProvider(copilotAgent);
			const { session } = await copilotAgent.createSession();
			const sessions = await copilotAgent.listSessions();
			const sessionResource = sessions[0].session;

			copilotAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'hi', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'done', toolRequests: [] },
			];
			await service.restoreSession(sessionResource);

			// Simulate a client that only subscribed to the depth-2 URI.
			const childUri = URI.parse(buildSubagentSessionUri(sessionResource, 'tc-sub'));
			const nestedUri = URI.parse(buildSubagentSessionUri(childUri, 'tc-nested'));
			service.addSubscriber(nestedUri, 'client-nested');
			service.unsubscribe(nestedUri, 'client-nested');

			assert.strictEqual(service.stateManager.getSessionState(sessionResource.toString()), undefined, 'root state must be evicted when no subscribers remain');
		});
	});

	// ---- handshake fast-path: uncommitted refresh on addSubscriber ----

	suite('addSubscriber triggers uncommitted refresh', () => {

		test('addSubscriber for <session>/changeset/uncommitted triggers the first git diff refresh', async () => {
			const workingDirectory = URI.from({ scheme: Schemas.inMemory, path: '/wd-refresh' });
			copilotAgent.resolvedWorkingDirectory = workingDirectory;
			copilotAgent.sessionMetadataOverrides = { workingDirectory };

			// Recording git service: a call to `computeSessionFileDiffs`
			// with `baseBranch=undefined` is the signature of the uncommitted
			// refresh fired by `_triggerUncommittedRefresh`.
			const computeCalls: { wd: string; baseBranch: string | undefined }[] = [];
			const gitService = createNoopGitService();
			gitService.computeSessionFileDiffs = async (wd: URI, opts: { sessionUri: string; baseBranch?: string }) => {
				computeCalls.push({ wd: wd.toString(), baseBranch: opts.baseBranch });
				return undefined;
			};

			const sessionDataService = createSessionDataService();
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
			localService.registerProvider(copilotAgent);
			const sessionResource = await localService.createSession({ provider: 'copilot' });
			const uncommittedUri = URI.parse(buildUncommittedChangesetUri(sessionResource.toString()));

			// The handshake fast-path used during connect/initialize when
			// `getSnapshot(uri)` is already populated. This is the path
			// that previously skipped the refresh for sessions that were
			// already active when the Agents Window opened.
			localService.addSubscriber(uncommittedUri, 'client-1');

			// Refresh is scheduled through the per-session sequencer;
			// allow it to drain.
			await new Promise(r => setTimeout(r, 20));

			assert.ok(
				computeCalls.some(c => c.baseBranch === undefined && c.wd === workingDirectory.toString()),
				`expected an uncommitted-kind git diff against the working dir, got: ${JSON.stringify(computeCalls)}`,
			);

			localService.unsubscribe(uncommittedUri, 'client-1');
		});

		test('addSubscriber for the session URI or session-changeset URI triggers a static refresh', async () => {
			// The Agents Window subscribes to the session URI (list /
			// detail) rather than to either of the static changeset URIs
			// directly, so the chip would never refresh on session open
			// without this trigger. Subscribing to the session-changeset
			// URI from any other client must also fire its own refresh.
			const workingDirectory = URI.from({ scheme: Schemas.inMemory, path: '/wd-refresh-2' });
			copilotAgent.resolvedWorkingDirectory = workingDirectory;
			copilotAgent.sessionMetadataOverrides = { workingDirectory };

			const computeCalls: { wd: string; baseBranch: string | undefined }[] = [];
			const gitService = createNoopGitService();
			gitService.computeSessionFileDiffs = async (wd: URI, opts: { sessionUri: string; baseBranch?: string }) => {
				computeCalls.push({ wd: wd.toString(), baseBranch: opts.baseBranch });
				return undefined;
			};

			const sessionDataService = createSessionDataService();
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
			localService.registerProvider(copilotAgent);
			const sessionResource = await localService.createSession({ provider: 'copilot' });
			const sessionChangesetUri = URI.parse(buildSessionChangesetUri(sessionResource.toString()));

			localService.addSubscriber(sessionChangesetUri, 'client-1');
			localService.addSubscriber(sessionResource, 'client-2');
			await new Promise(r => setTimeout(r, 20));

			assert.ok(
				computeCalls.some(c => c.wd === workingDirectory.toString()),
				`session-URI / session-changeset subscriptions must trigger a git diff against the working dir, got: ${JSON.stringify(computeCalls)}`,
			);

			localService.unsubscribe(sessionChangesetUri, 'client-1');
			localService.unsubscribe(sessionResource, 'client-2');
		});

		test('restoreSession drains a pending uncommitted refresh deferred by an earlier addSubscriber', async () => {
			// Reproduces the cold-open race that broke §3:
			// 1. Client subscribes to `<session>/changeset/uncommitted`
			//    before the session has been restored on the server.
			// 2. addSubscriber's 0→1 trigger fires `_triggerUncommittedRefresh`,
			//    which reads `summary.workingDirectory` from live state
			//    — finds nothing (session not restored yet) — and defers
			//    via `_pendingUncommittedRefreshes`.
			// 3. restoreSession then runs (driven by the chat-view path or
			//    a separate subscribe), populates `summary.workingDirectory`
			//    from disk, and MUST drain the pending refresh.
			const workingDirectory = URI.from({ scheme: Schemas.inMemory, path: '/wd-restore-drain' });
			copilotAgent.resolvedWorkingDirectory = workingDirectory;
			copilotAgent.sessionMetadataOverrides = { workingDirectory };

			const computeCalls: { wd: string; baseBranch: string | undefined }[] = [];
			const gitService = createNoopGitService();
			gitService.computeSessionFileDiffs = async (wd: URI, opts: { sessionUri: string; baseBranch?: string }) => {
				computeCalls.push({ wd: wd.toString(), baseBranch: opts.baseBranch });
				return undefined;
			};

			const sessionDataService = createSessionDataService();
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, gitService));
			localService.registerProvider(copilotAgent);

			// Seed a session on the agent without calling
			// `localService.createSession` — mirrors a restored-from-disk
			// session not yet in the service's state manager.
			const { session } = await copilotAgent.createSession();
			const sessions = await copilotAgent.listSessions();
			const sessionResource = sessions[0].session;
			const uncommittedUri = URI.parse(buildUncommittedChangesetUri(sessionResource.toString()));

			// Step 1+2: subscribe before restore. Trigger defers.
			localService.addSubscriber(uncommittedUri, 'client-1');
			await new Promise(r => setTimeout(r, 20));
			assert.strictEqual(
				computeCalls.length,
				0,
				`no compute should fire while the session is not restored (workingDirectory unknown), got: ${JSON.stringify(computeCalls)}`,
			);

			// Step 3: restoreSession runs (chat-view path / a parallel
			// session-URI subscribe). After this, the pending refresh
			// must drain and `_tryComputeGitDiffs` must run for the
			// uncommitted slot.
			copilotAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hi', toolRequests: [] },
			];
			await localService.restoreSession(sessionResource);
			await new Promise(r => setTimeout(r, 20));

			assert.ok(
				computeCalls.some(c => c.baseBranch === undefined && c.wd === workingDirectory.toString()),
				`restoreSession must drain the pending refresh; got compute calls: ${JSON.stringify(computeCalls)}`,
			);

			localService.unsubscribe(uncommittedUri, 'client-1');
		});
	});

	// ---- empty-session GC ----------------------------------------------

	suite('empty-session GC', () => {

		test('an empty unsubscribed session is disposed after the grace period', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				service.registerProvider(copilotAgent);
				const sessionResource = await service.createSession({ provider: 'copilot' });
				service.addSubscriber(sessionResource, 'client-1');

				service.unsubscribe(sessionResource, 'client-1');

				// Before the grace period, dispose has not been called.
				assert.strictEqual(copilotAgent.disposeSessionCalls.length, 0, 'no GC before grace expires');

				// After the grace period, the session is disposed entirely.
				await new Promise(resolve => setTimeout(resolve, 30_000));
				assert.deepStrictEqual(
					copilotAgent.disposeSessionCalls.map(u => u.toString()),
					[sessionResource.toString()],
					'GC fired after grace period',
				);
			});
		});

		test('a session with at least one turn is not GC-disposed', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				service.registerProvider(copilotAgent);
				const sessionResource = await service.createSession({ provider: 'copilot' });
				service.addSubscriber(sessionResource, 'client-1');
				service.dispatchAction(
					sessionResource.toString(),
					{ type: ActionType.SessionTurnStarted, turnId: 'turn-1', message: { text: 'hello', origin: { kind: MessageKind.User } } },
					'client-1', 1,
				);
				service.dispatchAction(
					sessionResource.toString(),
					{ type: ActionType.SessionTurnComplete, turnId: 'turn-1' },
					'client-1', 2,
				);

				service.unsubscribe(sessionResource, 'client-1');
				await new Promise(resolve => setTimeout(resolve, 30_000));

				assert.strictEqual(copilotAgent.disposeSessionCalls.length, 0, 'session with turns must not be GC-disposed');
			});
		});

		test('resubscribe within the grace period cancels GC', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				service.registerProvider(copilotAgent);
				const sessionResource = await service.createSession({ provider: 'copilot' });
				service.addSubscriber(sessionResource, 'client-1');

				service.unsubscribe(sessionResource, 'client-1');
				// Resubscribe before the timer fires.
				await new Promise(resolve => setTimeout(resolve, 5_000));
				service.addSubscriber(sessionResource, 'client-1');
				await new Promise(resolve => setTimeout(resolve, 30_000));

				assert.strictEqual(copilotAgent.disposeSessionCalls.length, 0, 'GC must be cancelled after resubscribe');
			});
		});

		test('GC is rearmed after a resubscribe-then-unsubscribe cycle', () => {
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				service.registerProvider(copilotAgent);
				const sessionResource = await service.createSession({ provider: 'copilot' });
				service.addSubscriber(sessionResource, 'client-1');

				service.unsubscribe(sessionResource, 'client-1');
				await new Promise(resolve => setTimeout(resolve, 5_000));
				service.addSubscriber(sessionResource, 'client-1');
				service.unsubscribe(sessionResource, 'client-1');

				// Old timer was cancelled; a fresh 30s timer is now armed.
				await new Promise(resolve => setTimeout(resolve, 29_000));
				assert.strictEqual(copilotAgent.disposeSessionCalls.length, 0, 'rearmed timer not yet fired');
				await new Promise(resolve => setTimeout(resolve, 2_000));
				assert.strictEqual(copilotAgent.disposeSessionCalls.length, 1, 'rearmed timer fires after fresh 30s');
			});
		});

		test('createSession on the same URI cancels a pending GC', () => {
			// Models the reconnect path: client subscribes to a session,
			// drops the subscription (GC armed), then re-issues
			// `createSession` for the same URI before the grace expires.
			// Without explicit cancellation, the timer would fire and
			// dispose the just-revived session.
			return runWithFakedTimers({ useFakeTimers: true }, async () => {
				service.registerProvider(copilotAgent);
				const sessionResource = await service.createSession({ provider: 'copilot', session: AgentSession.uri('copilot', 'recreate-test') });
				service.addSubscriber(sessionResource, 'client-1');
				service.unsubscribe(sessionResource, 'client-1');

				// Re-issue createSession mid-grace.
				await new Promise(resolve => setTimeout(resolve, 5_000));
				await service.createSession({ provider: 'copilot', session: AgentSession.uri('copilot', 'recreate-test') });

				// Wait past the original grace window. If GC wasn't
				// cancelled by createSession, dispose would have fired.
				await new Promise(resolve => setTimeout(resolve, 30_000));
				assert.strictEqual(copilotAgent.disposeSessionCalls.length, 0, 'createSession on same URI must cancel pending GC');
			});
		});
	});

	suite('session config persistence', () => {

		test('createSession persists initial config values to the session DB', async () => {
			const sessionDb = disposables.add(await SessionDatabase.open(':memory:'));
			const sessionDataService = createSessionDataService(sessionDb);
			const localAgent = new MockAgent('copilot');
			disposables.add(toDisposable(() => localAgent.dispose()));
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			localService.registerProvider(localAgent);

			await localService.createSession({ provider: 'copilot', config: { autoApprove: 'autoApprove' } });

			// Persistence is fire-and-forget; wait for it to flush
			await new Promise(r => setTimeout(r, 50));

			const persisted = await sessionDb.getMetadata('configValues');
			assert.ok(persisted, 'configValues should be persisted');
			assert.deepStrictEqual(JSON.parse(persisted!), { autoApprove: 'autoApprove' });
		});

		test('createSession does not write configValues when there are no values', async () => {
			const sessionDb = disposables.add(await SessionDatabase.open(':memory:'));
			const sessionDataService = createSessionDataService(sessionDb);
			const localAgent = new MockAgent('copilot');
			disposables.add(toDisposable(() => localAgent.dispose()));
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			localService.registerProvider(localAgent);

			await localService.createSession({ provider: 'copilot' });

			await new Promise(r => setTimeout(r, 50));

			const persisted = await sessionDb.getMetadata('configValues');
			assert.strictEqual(persisted, undefined);
		});

		test('restoreSession overlays persisted config values onto the resolved config', async () => {
			const sessionDb = disposables.add(await SessionDatabase.open(':memory:'));
			const sessionDataService = createSessionDataService(sessionDb);
			const localAgent = new MockAgent('copilot');
			disposables.add(toDisposable(() => localAgent.dispose()));
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			localService.registerProvider(localAgent);

			// Create a session on the agent backend (no config) so listSessions can find it
			const { session } = await localAgent.createSession();
			const sessions = await localAgent.listSessions();
			const sessionResource = sessions[0].session;

			// Pre-seed persisted config values
			await sessionDb.setMetadata('configValues', JSON.stringify({ autoApprove: 'autoApprove' }));

			localAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
			];

			await localService.restoreSession(sessionResource);

			const state = localService.stateManager.getSessionState(sessionResource.toString());
			assert.ok(state);
			// MockAgent.resolveSessionConfig echoes params.config back as values, so the
			// persisted values are forwarded through and end up on state.config.values.
			assert.deepStrictEqual(state!.config?.values, { autoApprove: 'autoApprove' });
		});

		test.skip('restoreSession seeds the session changeset from persisted diffs', async () => {
			const sessionDb = disposables.add(await SessionDatabase.open(':memory:'));
			const sessionDataService = createSessionDataService(sessionDb);
			const localAgent = new MockAgent('copilot');
			disposables.add(toDisposable(() => localAgent.dispose()));
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			localService.registerProvider(localAgent);

			const { session } = await localAgent.createSession();
			const sessions = await localAgent.listSessions();
			const sessionResource = sessions[0].session;

			const persistedDiffs = [
				{
					after: { uri: 'file:///wd/a.ts', content: { uri: 'file:///wd/a.ts' } },
					diff: { added: 5, removed: 2 },
				},
			];
			await sessionDb.setMetadata('diffs', JSON.stringify(persistedDiffs));

			localAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
			];

			await localService.restoreSession(sessionResource);

			const state = localService.stateManager.getSessionState(sessionResource.toString());
			assert.ok(state);
			// The session has no working directory, so `_attachGitState`
			// treats it as transient and does NOT strip the two git-only
			// catalogue entries. The Branch Changes entry receives the
			// persisted diff counts seeded by the changeset coordinator.
			assert.deepStrictEqual(state!.changesets, [
				{
					label: 'Branch Changes',
					uriTemplate: `${sessionResource.toString()}/changeset/session`,
					changeKind: 'session',
				},
				{
					label: 'Uncommitted Changes',
					description: 'Show uncommitted changes in this session',
					uriTemplate: `${sessionResource.toString()}/changeset/uncommitted`,
					changeKind: 'uncommitted',
				},
			]);

			const changesetSnapshot = localService.stateManager.getSnapshot(`${sessionResource.toString()}/changeset/session`);
			assert.ok(changesetSnapshot);
			const changesetState = changesetSnapshot.state as { status: string; files: Array<{ id: string }> };
			assert.strictEqual(changesetState.status, 'ready');
			assert.deepStrictEqual(changesetState.files.map(f => f.id), ['file:///wd/a.ts']);
		});

		test.skip('restoreSession silently ignores malformed persisted diffs', async () => {
			const sessionDb = disposables.add(await SessionDatabase.open(':memory:'));
			const sessionDataService = createSessionDataService(sessionDb);
			const localAgent = new MockAgent('copilot');
			disposables.add(toDisposable(() => localAgent.dispose()));
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			localService.registerProvider(localAgent);

			const { session } = await localAgent.createSession();
			const sessions = await localAgent.listSessions();
			const sessionResource = sessions[0].session;

			await sessionDb.setMetadata('diffs', '{ not valid json');

			localAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
			];

			await localService.restoreSession(sessionResource);

			const state = localService.stateManager.getSessionState(sessionResource.toString());
			assert.ok(state);
			// Catalogue is seeded by `_buildInitialSummary` / `restoreSession`.
			// The session has no working directory, so `_attachGitState` does
			// NOT strip the git-only entries — they remain advertised but
			// without counts until a real compute lands.
			assert.deepStrictEqual(state!.changesets, [
				{
					label: 'Branch Changes',
					uriTemplate: `${sessionResource.toString()}/changeset/session`,
					changeKind: 'session',
				},
				{
					description: 'Show uncommitted changes in this session',
					label: 'Uncommitted Changes',
					uriTemplate: `${sessionResource.toString()}/changeset/uncommitted`,
					changeKind: 'uncommitted',
				},
			]);

			const changesetSnapshot = localService.stateManager.getSnapshot(`${sessionResource.toString()}/changeset/session`);
			assert.ok(changesetSnapshot);
			const changesetState = changesetSnapshot.state as { status: string; files: Array<{ id: string }> };
			assert.strictEqual(changesetState.status, 'computing');
			assert.strictEqual(changesetState.files.length, 0);
		});

		test('createSession + restoreSession round-trip restores initial config without any mid-session changes', async () => {
			// Regression test: when a session is created with initial config but no
			// mid-session SessionConfigChanged actions are dispatched, restoring it
			// must still rehydrate the initial values.
			const sessionDb = disposables.add(await SessionDatabase.open(':memory:'));
			const sessionDataService = createSessionDataService(sessionDb);
			const localAgent = new MockAgent('copilot');
			disposables.add(toDisposable(() => localAgent.dispose()));
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			localService.registerProvider(localAgent);

			const session = await localService.createSession({ provider: 'copilot', config: { autoApprove: 'autoApprove' } });

			// Wait for the fire-and-forget persistence to flush
			await new Promise(r => setTimeout(r, 50));

			// Simulate a server restart: drop the in-memory state
			localService.stateManager.removeSession(session.toString());

			localAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
			];
			await localService.restoreSession(session);

			const state = localService.stateManager.getSessionState(session.toString());
			assert.ok(state);
			assert.deepStrictEqual(state!.config?.values, { autoApprove: 'autoApprove' });
		});

		test('restoreSession ignores malformed persisted configValues', async () => {
			const sessionDb = disposables.add(await SessionDatabase.open(':memory:'));
			const sessionDataService = createSessionDataService(sessionDb);
			const localAgent = new MockAgent('copilot');
			disposables.add(toDisposable(() => localAgent.dispose()));
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			localService.registerProvider(localAgent);

			const { session } = await localAgent.createSession();
			const sessions = await localAgent.listSessions();
			const sessionResource = sessions[0].session;

			await sessionDb.setMetadata('configValues', '{not json');

			localAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
			];

			// Should not throw despite the malformed JSON
			await localService.restoreSession(sessionResource);

			const state = localService.stateManager.getSessionState(sessionResource.toString());
			assert.ok(state);
			// MockAgent has a workingDirectory? No — but the metadata supplies it as undefined.
			// _resolveCreatedSessionConfig bails when both .config and .workingDirectory are
			// missing, so state.config is undefined here. The key point is: no throw.
			assert.strictEqual(state!.config, undefined);
		});
	});

	// ---- resourceList ------------------------------------------------

	suite('resourceList', () => {

		test('throws when the directory does not exist', async () => {
			await assert.rejects(
				() => service.resourceList(URI.from({ scheme: Schemas.inMemory, path: '/nonexistent' })),
				/Directory not found/,
			);
		});

		test('throws when the target is not a directory', async () => {
			await assert.rejects(
				() => service.resourceList(URI.from({ scheme: Schemas.inMemory, path: '/testDir/file.txt' })),
				/Not a directory/,
			);
		});
	});

	// ---- worktree working directory -------------------------------------

	suite('worktree working directory', () => {

		test('createSession uses agent-resolved working directory in state', async () => {
			// Simulate an agent that resolves a worktree path different from the input
			const worktreeDir = URI.file('/source/repo.worktrees/agents-xyz');
			copilotAgent.resolvedWorkingDirectory = worktreeDir;
			service.registerProvider(copilotAgent);

			const sourceDir = URI.file('/source/repo');
			const session = await service.createSession({ provider: 'copilot', workingDirectory: sourceDir });

			// The state manager should have the worktree path, not the source path
			const state = service.stateManager.getSessionState(session.toString());
			assert.strictEqual(state?.summary.workingDirectory, worktreeDir.toString());
		});

		test('createSession falls back to config working directory when agent does not resolve', async () => {
			// Agent does not override the working directory (e.g. folder isolation)
			copilotAgent.resolvedWorkingDirectory = undefined;
			service.registerProvider(copilotAgent);

			const sourceDir = URI.file('/source/repo');
			const session = await service.createSession({ provider: 'copilot', workingDirectory: sourceDir });

			const state = service.stateManager.getSessionState(session.toString());
			assert.strictEqual(state?.summary.workingDirectory, sourceDir.toString());
		});

		test('restoreSession uses agent working directory in state', async () => {
			// Agent returns the worktree path through listSessions
			const worktreeDir = URI.file('/source/repo.worktrees/agents-xyz');
			copilotAgent.sessionMetadataOverrides = { workingDirectory: worktreeDir };
			service.registerProvider(copilotAgent);

			const session = await service.createSession({ provider: 'copilot' });

			// Delete from state to simulate a server restart
			service.stateManager.deleteSession(session.toString());
			assert.strictEqual(service.stateManager.getSessionState(session.toString()), undefined);

			// Restore the session (simulates a client subscribing after restart)
			await service.restoreSession(session);

			const state = service.stateManager.getSessionState(session.toString());
			assert.strictEqual(state?.summary.workingDirectory, worktreeDir.toString());
		});
	});

	// ---- Item-2 regression: initial changeset seeding happens at create time --

	/**
	 * These tests pin the create-time invariant that both halves of initial
	 * changeset seeding — the summary catalogue (`buildDefaultChangesetCatalogue`
	 * inside `_buildInitialSummary`) and the backing per-changeset states
	 * (`AgentHostChangesetService.registerStaticChangesets`) — run as part
	 * of session creation, never deferred to materialization. They assert
	 * both halves through the public snapshot surface only, never inspecting
	 * state-manager internals.
	 */
	suite.skip('item-2: initial changeset seeding at create time', () => {

		/** Returns `true` when both static changeset URIs exist with `status: 'computing'`. */
		function assertBackingChangesetsComputing(stateManager: AgentService['stateManager'], sessionStr: string): void {
			const uncommitted = stateManager.getSnapshot(buildUncommittedChangesetUri(sessionStr));
			const sessionWide = stateManager.getSnapshot(buildSessionChangesetUri(sessionStr));
			assert.ok(uncommitted, `expected ${sessionStr}/changeset/uncommitted to be subscribable`);
			assert.ok(sessionWide, `expected ${sessionStr}/changeset/session to be subscribable`);
			assert.strictEqual((uncommitted.state as { status: string }).status, ChangesetStatus.Computing);
			assert.strictEqual((sessionWide.state as { status: string }).status, ChangesetStatus.Computing);
		}

		function defaultCatalogue(sessionStr: string) {
			// These tests have no working directory resolved, so
			// `_attachGitState` treats it as transient and does NOT strip
			// the two git-only entries. All three default entries are
			// advertised (without counts) until a real compute lands.
			return [
				{
					label: 'Branch Changes',
					uriTemplate: `${sessionStr}/changeset/session`,
					changeKind: 'session',

				},
				{
					label: 'Uncommitted Changes',
					description: 'Show uncommitted changes in this session',
					uriTemplate: `${sessionStr}/changeset/uncommitted`,
					changeKind: 'uncommitted',
				},
			];
		}

		test('createSession seeds both halves before SessionReady', async () => {
			service.registerProvider(copilotAgent);

			const session = await service.createSession({ provider: 'copilot' });
			const sessionStr = session.toString();

			const state = service.stateManager.getSessionState(sessionStr);
			assert.ok(state);
			assert.deepStrictEqual(state!.changesets, defaultCatalogue(sessionStr));
			assertBackingChangesetsComputing(service.stateManager, sessionStr);
		});

		test('forked createSession seeds both halves on the forked session', async () => {
			service.registerProvider(copilotAgent);

			// Set up a source session with at least one completed turn. The
			// fork path at agentService.ts:493-504 intentionally drops
			// `config.fork` when the source has zero turns and falls through
			// to the non-fork create path; without this prelude the test
			// would silently exercise the non-fork branch and pass vacuously.
			const sourceSession = await service.createSession({ provider: 'copilot' });
			const sourceState = service.stateManager.getSessionState(sourceSession.toString())!;
			const sourceTurnId = 'turn-src-1';
			sourceState.turns = [{
				id: sourceTurnId,
				state: TurnState.Complete,
				message: { text: 'hi', origin: { kind: MessageKind.User } },
				responseParts: [],
				usage: undefined,
			}];

			const forked = await service.createSession({
				provider: 'copilot',
				fork: { session: sourceSession, turnIndex: 0, turnId: sourceTurnId },
			});
			assert.notStrictEqual(forked.toString(), sourceSession.toString(), 'fork should produce a distinct session URI');
			const forkedStr = forked.toString();

			const forkedState = service.stateManager.getSessionState(forkedStr);
			assert.ok(forkedState);
			assert.deepStrictEqual(forkedState!.changesets, defaultCatalogue(forkedStr));
			// Note: source-session turn was seeded directly on state, so the
			// reducer never saw a SessionTurnStarted/Complete pair for it;
			// the fork branch (agentService.ts:548 path) is still exercised
			// because `config.fork` survives the L493-504 turn-count check.
			assert.ok(forkedState!.turns.length > 0, 'forked session should carry copied turns');
			assertBackingChangesetsComputing(service.stateManager, forkedStr);
		});

		test('provisional session materialization preserves both halves', async () => {
			// Custom mock that returns `provisional: true` and exposes a hook
			// to fire `onDidMaterializeSession` later, simulating the
			// "session created in-memory now, persisted on first sendMessage"
			// flow that Copilot CLI / Claude actually use in production.
			class ProvisionalMockAgent extends MockAgent {
				private readonly _onDidMaterialize = new Emitter<{ session: URI; workingDirectory: URI | undefined; project: { uri: URI; displayName: string } | undefined }>();
				readonly onDidMaterializeSession = this._onDidMaterialize.event;
				override async createSession(config?: import('../../common/agentService.js').IAgentCreateSessionConfig): Promise<import('../../common/agentService.js').IAgentCreateSessionResult> {
					const result = await super.createSession(config);
					return { ...result, provisional: true };
				}
				materialize(session: URI, workingDirectory?: URI): void {
					this._onDidMaterialize.fire({ session, workingDirectory, project: undefined });
				}
			}

			const provisionalAgent = new ProvisionalMockAgent('copilot');
			disposables.add(toDisposable(() => provisionalAgent.dispose()));
			service.registerProvider(provisionalAgent);

			const session = await service.createSession({ provider: 'copilot' });
			const sessionStr = session.toString();

			// Snapshot the create-time state BEFORE materialization.
			const stateBefore = service.stateManager.getSessionState(sessionStr);
			assert.ok(stateBefore, 'provisional session should already have state');
			assert.deepStrictEqual(stateBefore!.changesets, defaultCatalogue(sessionStr));
			assertBackingChangesetsComputing(service.stateManager, sessionStr);

			// `markSessionPersisted` (called from `_onDidMaterializeSession`)
			// re-spreads `state.summary`. A future change to that spread
			// could drop the catalogue or invalidate the backing snapshots;
			// the post-materialization re-assertion is what catches it.
			provisionalAgent.materialize(session, URI.file('/wd'));

			const stateAfter = service.stateManager.getSessionState(sessionStr);
			assert.ok(stateAfter, 'materialized session should still have state');
			assert.deepStrictEqual(stateAfter!.changesets, defaultCatalogue(sessionStr));
			assertBackingChangesetsComputing(service.stateManager, sessionStr);
		});

		test('restoreSession with no persisted diffs seeds both halves in computing state', async () => {
			const sessionDb = disposables.add(await SessionDatabase.open(':memory:'));
			const sessionDataService = createSessionDataService(sessionDb);
			const localAgent = new MockAgent('copilot');
			disposables.add(toDisposable(() => localAgent.dispose()));
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			localService.registerProvider(localAgent);

			const { session } = await localAgent.createSession();
			const sessions = await localAgent.listSessions();
			const sessionResource = sessions[0].session;
			const sessionStr = sessionResource.toString();

			localAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
			];

			await localService.restoreSession(sessionResource);

			const state = localService.stateManager.getSessionState(sessionStr);
			assert.ok(state);
			assert.deepStrictEqual(state!.changesets, defaultCatalogue(sessionStr));
			assertBackingChangesetsComputing(localService.stateManager, sessionStr);
		});
	});
});
