/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { once } from 'events';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import type * as http from 'http';
import { createRequire } from 'module';
import { Disposable, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { dirname, join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { buildManagedFamilyRule, buildManagedRule, ManagedRuleFamily } from '../../../../common/agentHostManagedRules.js';
import type { IAgentHostManagedSettingsPermissions } from '../../../../common/agentHostManagedSettings.js';
import { AgentHostGlobalAutoApproveEnabledConfigKey } from '../../../../common/agentHostSchema.js';
import { readToolCallMeta } from '../../../../common/meta/agentToolCallMeta.js';
import { SessionConfigKey } from '../../../../common/sessionConfigKeys.js';
import type { SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { ActionType, type ChatErrorAction, type ChatToolCallCompleteAction, type ChatToolCallReadyAction, type ChatToolCallStartAction } from '../../../../common/state/sessionActions.js';
import { buildDefaultChatUri, ROOT_STATE_URI, type RootState } from '../../../../common/state/sessionState.js';
import { getActionEnvelope, isActionNotification, type TestProtocolClient } from '../../serverIntegrationTestHelpers.js';
import { assertToolCallCompleteText, createRealSession, dispatchTurn, resolveGitHubToken, startBackgroundApprovalLoop, textFromContent } from '../harness/agentHostE2ETestHarness.js';
import { expandShellToolName } from '../harness/shellToolNames.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

const nodeRequire = createRequire(import.meta.url);
const httpModule = nodeRequire('http') as typeof http;
const protectedContent = 'SYNTHETIC_DIAGNOSTICS_PROTECTED_CANARY\n';
const publicContent = 'SYNTHETIC_DIAGNOSTICS_PUBLIC_CONTENT\n';
const editedContent = 'SYNTHETIC_DIAGNOSTICS_EDITED_CONTENT\n';

interface IDiagnosticTurn {
	readonly channel: string;
	readonly turnId: string;
	readonly toolName: string;
	readonly pending: readonly ChatToolCallReadyAction[];
	readonly completion: ChatToolCallCompleteAction;
	readonly text: string;
}

interface IDiagnosticScenario {
	readonly session: string;
	readonly workspace: string;
	path(components?: readonly string[], auxiliary?: boolean): string;
	write(components: readonly string[], text: string, auxiliary?: boolean): void;
	contribute(permissions: IAgentHostManagedSettingsPermissions, client?: TestProtocolClient): Promise<void>;
	notify(params: object, client?: TestProtocolClient): Promise<void>;
	connect(clientId: string, beforeInitialize?: (client: TestProtocolClient) => void): Promise<TestProtocolClient>;
	close(client: TestProtocolClient): void;
	setApprovalLevel(level: 'default' | 'autoApprove'): Promise<void>;
	expectRejectedMode(): Promise<void>;
	read(components?: readonly string[], auxiliary?: boolean): Promise<IDiagnosticTurn>;
	edit(): Promise<IDiagnosticTurn>;
	shell(command: string): Promise<IDiagnosticTurn>;
	http(name: string): Promise<DiagnosticHttpFixture>;
	fetch(server: DiagnosticHttpFixture): Promise<IDiagnosticTurn>;
}

class DiagnosticHttpFixture extends Disposable {
	readonly requests: string[] = [];
	private readonly server: http.Server;
	private readonly closed: Promise<void>;
	private baseUrl = '';

	constructor() {
		super();
		this.server = httpModule.createServer((request, response) => {
			this.requests.push(request.url ?? '/');
			response.writeHead(200, { 'Content-Type': 'text/plain' });
			response.end('SYNTHETIC_DIAGNOSTICS_HTTP_CONTENT');
		});
		this.closed = new Promise<void>(resolve => {
			this._register(toDisposable(() => {
				this.server.close(() => resolve());
				this.server.closeAllConnections();
			}));
		});
	}

	get url(): string {
		assert.ok(this.baseUrl);
		return this.baseUrl;
	}

	async start(): Promise<void> {
		const listening = once(this.server, 'listening');
		this.server.listen(0, '127.0.0.1');
		await listening;
		const address = this.server.address();
		assert.ok(address && typeof address !== 'string');
		this.baseUrl = `http://127.0.0.1:${address.port}`;
	}

	async whenClosed(): Promise<void> {
		await this.closed;
	}
}

function family(value: ManagedRuleFamily): string {
	return buildManagedFamilyRule(value);
}

function rule(family: ManagedRuleFamily, argument: string): string {
	const result = buildManagedRule(family, argument);
	assert.ok(result, 'The synthetic restriction must be representable in the runtime grammar');
	return result;
}

function assertDenied(turn: IDiagnosticTurn, expected = /denied due to.*rules/i): void {
	assert.deepStrictEqual({
		success: turn.completion.result.success,
		pending: turn.pending.length,
		denial: expected.test(turn.text),
	}, { success: false, pending: 0, denial: true }, turn.text);
}

function assertSuccessful(turn: IDiagnosticTurn): void {
	assert.strictEqual(turn.completion.result.success, true, turn.text);
}

function assertHumanOnly(turn: IDiagnosticTurn): void {
	assert.deepStrictEqual(turn.pending.map(action => ({
		confirmed: action.confirmed,
		options: action.options?.map(option => option.id),
		automatic: readToolCallMeta(action).autoApproveBySetting === true,
		persistent: readToolCallMeta(action).autoApproveRuleResolvable === true,
	})), [{
		confirmed: undefined,
		options: ['allow-once', 'skip'],
		automatic: false,
		persistent: false,
	}]);
}

export function defineCopilotRuntimeManagedDiagnosticsCoverageTests(context: IAgentHostE2ETestContext): void {
	if (context.tier !== 'parity' || context.config.provider !== 'copilotcli') {
		return;
	}
	suite('Copilot runtime client-managed permission diagnostics', () => {
		ensureNoDisposablesAreLeakedInTestSuite();
		defineDiagnosticsTests(context);
	});
}

function defineDiagnosticsTests(context: IAgentHostE2ETestContext): void {
	const shellName = expandShellToolName('${shell}');
	const denyRead = { deny: [family(ManagedRuleFamily.Read)] };
	const denyWrite = { deny: [family(ManagedRuleFamily.Write)] };

	async function initialize(client: TestProtocolClient, clientId: string, root: string): Promise<void> {
		client.setWorkingDirectory(root);
		await client.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId }, 30_000);
		await client.call('authenticate', {
			channel: ROOT_STATE_URI, resource: 'https://api.github.com',
			token: context.config.githubToken ?? resolveGitHubToken(),
		}, 30_000);
	}

	function diagnosticTest(title: string, initial: IAgentHostManagedSettingsPermissions, run: (scenario: IDiagnosticScenario) => Promise<void>): void {
		const fullTitle = `managed settings diagnostics: ${title}`;
		context.registerTestEnvironment(fullTitle, { COPILOT_WEB_FETCH_ALLOW_LOCALHOST: '1' });
		test(fullTitle, async function () {
			this.timeout(240_000);
			const parent = join(process.cwd(), '.build', 'managed-diagnostics');
			mkdirSync(parent, { recursive: true });
			const root = mkdtempSync(join(parent, 'scenario-'));
			context.tempDirs.push(root);
			const workspace = join(root, 'workspace');
			const auxiliary = join(root, 'auxiliary');
			mkdirSync(workspace);
			mkdirSync(auxiliary);
			writeFileSync(join(workspace, 'protected.txt'), protectedContent);
			writeFileSync(join(workspace, 'public.txt'), publicContent);
			const store = new DisposableStore();
			const clients = new Set<TestProtocolClient>();
			const servers: DiagnosticHttpFixture[] = [];
			const rootSnapshot: { config?: RootState['config'] } = {};
			const cleanupErrors: Error[] = [];
			let primaryError: Error | undefined;
			let nextSequence = 100;
			let ordinal = 0;
			const sequence = () => {
				const value = nextSequence;
				nextSequence += 100;
				return value;
			};

			async function notify(params: object, client = context.client): Promise<void> {
				client.notify('setClientManagedSettingsPermissions', params);
				await client.call('listSessions', { channel: ROOT_STATE_URI }, 30_000);
			}

			async function configure(channel: string, type: ActionType.RootConfigChanged | ActionType.SessionConfigChanged, config: Record<string, object | string | boolean>): Promise<void> {
				await context.client.call('subscribe', { channel });
				const clientSeq = sequence();
				context.client.dispatch({ channel, clientSeq, action: { type, config } });
				await context.client.waitForNotification(n =>
					isActionNotification(n, type) && getActionEnvelope(n).channel === channel
					&& getActionEnvelope(n).origin?.clientSeq === clientSeq, 30_000);
			}

			try {
				const config = {
					...context.config,
					sessionConfig: {
						...context.config.sessionConfig,
						[SessionConfigKey.Mode]: 'interactive',
						[SessionConfigKey.AutoApprove]: 'default',
						[SessionConfigKey.Permissions]: { allow: [], deny: [] },
					},
				};
				const session = await createRealSession(context.client, config, 'managed-diagnostics-main', context.createdSessions, URI.file(workspace), async () => {
					const snapshot = await context.client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
					rootSnapshot.config = (snapshot.snapshot!.state as RootState).config;
					await configure(ROOT_STATE_URI, ActionType.RootConfigChanged, {
						[AgentHostGlobalAutoApproveEnabledConfigKey]: false,
						[SessionConfigKey.Permissions]: { allow: [], deny: [] },
					});
					clients.add(context.client);
					await notify({ permissions: initial });
				});
				// Both owned directories share one fixture root, including the out-of-workspace read target.
				context.client.setWorkingDirectory(root);
				const channel = buildDefaultChatUri(session);

				async function turn(toolName: string, prompt: string): Promise<IDiagnosticTurn> {
					const turnId = `managed-diagnostics-${++ordinal}`;
					const clientSeq = sequence();
					const requestStart = context.observedModelRequestBodies.length;
					const canaryAlreadyShared = context.observedModelRequestBodies.some(body => body.includes(protectedContent.trim()));
					const approvals = startBackgroundApprovalLoop(context.client, {
						approvalSeqStart: clientSeq,
						allow: [{ toolName }],
					});
					const turnStore = new DisposableStore();
					turnStore.add(toDisposable(() => { void approvals.stop(); }));
					try {
						dispatchTurn(context.client, session, turnId,
							`${prompt} Call only that named tool exactly once, without retries, fallbacks, wrappers, or any other tool. Use only the specified synthetic fixture. After success or refusal, reply exactly DIAGNOSTICS_COMPLETE.`,
							clientSeq);
						const completed = await context.client.waitForNotification(n =>
							(isActionNotification(n, ActionType.ChatTurnComplete) || isActionNotification(n, ActionType.ChatError))
							&& getActionEnvelope(n).channel === channel
							&& (getActionEnvelope(n).action as { readonly turnId: string }).turnId === turnId, 90_000);
						const action = getActionEnvelope(completed).action;
						if (action.type === ActionType.ChatError) {
							throw new Error(`Client-managed diagnostics turn failed: ${action.part.error.message}`);
						}
					} finally {
						await approvals.stop();
						turnStore.dispose();
					}
					assert.deepStrictEqual(approvals.errors, []);
					const starts = context.client.receivedNotifications(n => isActionNotification(n, ActionType.ChatToolCallStart))
						.filter(n => getActionEnvelope(n).channel === channel)
						.map(n => getActionEnvelope(n).action as ChatToolCallStartAction)
						.filter(action => action.turnId === turnId);
					assert.deepStrictEqual(starts.map(action => action.toolName), [toolName], 'Native execution must reach the permission boundary');
					const pending = context.client.receivedNotifications(n => isActionNotification(n, ActionType.ChatToolCallReady))
						.filter(n => getActionEnvelope(n).channel === channel)
						.map(n => getActionEnvelope(n).action as ChatToolCallReadyAction)
						.filter(action => action.turnId === turnId && !action.confirmed);
					const completions = context.client.receivedNotifications(n => isActionNotification(n, ActionType.ChatToolCallComplete))
						.filter(n => getActionEnvelope(n).channel === channel)
						.map(n => getActionEnvelope(n).action as ChatToolCallCompleteAction)
						.filter(action => action.turnId === turnId && action.toolCallId === starts[0].toolCallId);
					assert.strictEqual(completions.length, 1);
					const completion = completions[0];
					const text = textFromContent(completion.result.content ?? []);
					if (!completion.result.success && toolName === 'view' && !canaryAlreadyShared) {
						assert.ok(!context.observedModelRequestBodies.slice(requestStart).some(body => body.includes(protectedContent.trim())),
							'Refused file content must not reach the model');
					}
					return { channel, turnId, toolName, pending, completion, text };
				}

				function filePath(components: readonly string[] = ['protected.txt'], outside = false): string {
					return join(outside ? auxiliary : workspace, ...components);
				}

				function filePrompt(components: readonly string[], outside = false): string {
					const location = outside ? 'the sibling directory named auxiliary next to this session working directory' : 'this session working directory';
					return `The file is ${JSON.stringify(components[components.length - 1])} under directory components ${JSON.stringify(components.slice(0, -1))} relative to ${location}. Set path to its full absolute path.`;
				}

				const scenario: IDiagnosticScenario = {
					session, workspace,
					path: filePath,
					write: (components, text, outside) => {
						const path = filePath(components, outside);
						mkdirSync(dirname(path), { recursive: true });
						writeFileSync(path, text);
					},
					contribute: (permissions, client = context.client) => notify({ permissions }, client),
					notify,
					connect: async (clientId, beforeInitialize) => {
						const client = await context.connectClient();
						store.add(toDisposable(() => client.close()));
						beforeInitialize?.(client);
						await initialize(client, clientId, root);
						clients.add(client);
						return client;
					},
					close: client => {
						clients.delete(client);
						client.close();
					},
					setApprovalLevel: level => configure(session, ActionType.SessionConfigChanged, { [SessionConfigKey.AutoApprove]: level }),
					expectRejectedMode: async () => {
						const turnId = `managed-diagnostics-rejected-${++ordinal}`;
						const requestCount = context.observedModelRequestBodies.length;
						dispatchTurn(context.client, session, turnId, 'Reply exactly READY without tools.', sequence());
						const notification = await context.client.waitForNotification(n =>
							isActionNotification(n, ActionType.ChatError) && getActionEnvelope(n).channel === channel
							&& (getActionEnvelope(n).action as ChatErrorAction).turnId === turnId, 90_000);
						const action = getActionEnvelope(notification).action as ChatErrorAction;
						assert.match(action.part.error.message, /rejected permission mode.*allow-all|enterprise.*bypass/i);
						assert.strictEqual(context.observedModelRequestBodies.length, requestCount);
					},
					read: (components = ['protected.txt'], outside) => turn('view', `Call view. ${filePrompt(components, outside)}`),
					edit: () => turn('edit', `Call edit. ${filePrompt(['protected.txt'])} Use these exact replacement fields: ${JSON.stringify({
						old_str: readFileSync(filePath(), 'utf8'),
						new_str: editedContent,
					})}.`),
					shell: command => turn(shellName, `Call ${shellName} to run this exact command in the existing working directory: ${JSON.stringify(command)}.`),
					http: async name => {
						const server = store.add(new DiagnosticHttpFixture());
						servers.push(server);
						await server.start();
						store.add(context.registerFixtureUrl(name, server.url));
						return server;
					},
					fetch: server => turn('web_fetch', `Call web_fetch with this exact input: ${JSON.stringify({ url: `${server.url}/probe` })}.`),
				};
				await run(scenario);
			} catch (error) {
				primaryError = error instanceof Error ? error : new Error(String(error));
			} finally {
				for (const client of clients) {
					try {
						await notify({ permissions: {} }, client);
					} catch (error) {
						cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
					}
				}
				if (rootSnapshot.config) {
					try {
						await context.client.call('subscribe', { channel: ROOT_STATE_URI });
						const clientSeq = sequence();
						context.client.dispatch({
							channel: ROOT_STATE_URI, clientSeq,
							action: { type: ActionType.RootConfigChanged, config: rootSnapshot.config.values, replace: true },
						});
						await context.client.waitForNotification(n =>
							isActionNotification(n, ActionType.RootConfigChanged)
							&& getActionEnvelope(n).origin?.clientSeq === clientSeq, 30_000);
					} catch (error) {
						cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
					}
				}
				try {
					store.dispose();
				} catch (error) {
					cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
				}
				for (const server of servers) {
					try {
						await server.whenClosed();
					} catch (error) {
						cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
					}
				}
			}
			if (cleanupErrors.length > 0) {
				const errors = primaryError ? [primaryError, ...cleanupErrors] : cleanupErrors;
				throw new AggregateError(errors, `Managed diagnostics scenario cleanup failed: ${errors.map(error => error.message).join('; ')}`);
			}
			if (primaryError) {
				throw primaryError;
			}
		});
	}

	diagnosticTest('pre-initialize notifications do not acquire a client-owned policy layer', {}, async scenario => {
		await scenario.connect('diagnostics-early-client', client => {
			client.notify('setClientManagedSettingsPermissions', { permissions: denyRead });
		});
		const turn = await scenario.read();
		assertSuccessful(turn);
		assert.match(turn.text, /SYNTHETIC_DIAGNOSTICS_PROTECTED_CANARY/);
	});

	diagnosticTest('a mixed-type deny list rejects the whole replacement without partially applying it', denyWrite, async scenario => {
		await scenario.notify({ permissions: { deny: [family(ManagedRuleFamily.Read), 17] } });
		assertSuccessful(await scenario.read(['public.txt']));
		assertDenied(await scenario.edit());
		assert.strictEqual(readFileSync(scenario.path(), 'utf8'), protectedContent);
	});

	diagnosticTest('JSON false cannot remove a string-valued managed bypass lock', {
		disableBypassPermissionsMode: 'disable',
	}, async scenario => {
		await scenario.notify({ permissions: { disableBypassPermissionsMode: false } });
		await scenario.setApprovalLevel('autoApprove');
		await scenario.expectRejectedMode();
		await scenario.setApprovalLevel('default');
		assertSuccessful(await scenario.read(['public.txt']));
	});

	diagnosticTest('an unsupported allow field cannot clear an existing client restriction', denyWrite, async scenario => {
		await scenario.notify({ permissions: { allow: [family(ManagedRuleFamily.Write)], deny: [] } });
		assertDenied(await scenario.edit());
		assert.strictEqual(readFileSync(scenario.path(), 'utf8'), protectedContent);
	});

	diagnosticTest('two transports for one client replace one contribution instead of unioning layers', {}, async scenario => {
		const first = await scenario.connect('diagnostics-shared-owner');
		await scenario.contribute(denyWrite, first);
		const second = await scenario.connect('diagnostics-shared-owner');
		await scenario.contribute({ ask: [family(ManagedRuleFamily.Read)] }, second);
		scenario.close(first);
		assertSuccessful(await scenario.edit());
		const read = await scenario.read(['public.txt']);
		assertHumanOnly(read);
		assertSuccessful(read);
		assert.strictEqual(readFileSync(scenario.path(), 'utf8'), editedContent);
	});

	diagnosticTest('quick reinitialization of the same owner preserves its disconnect-grace restriction', {}, async scenario => {
		const original = await scenario.connect('diagnostics-reconnecting-owner');
		await scenario.contribute(denyWrite, original);
		assertDenied(await scenario.edit());
		scenario.close(original);
		const replacement = await scenario.connect('diagnostics-reconnecting-owner');
		assertDenied(await scenario.edit());
		await scenario.contribute({}, replacement);
		assertSuccessful(await scenario.edit());
		assert.strictEqual(readFileSync(scenario.path(), 'utf8'), editedContent);
	});

	diagnosticTest('JSON omission of permissions is not an explicit empty-layer removal', denyRead, async scenario => {
		await scenario.notify({ permissions: undefined });
		assertDenied(await scenario.read());
		assert.strictEqual(readFileSync(scenario.path(), 'utf8'), protectedContent);
	});

	diagnosticTest('empty rule arrays clear lists while preserving the bypass lock', {
		disableBypassPermissionsMode: 'disable',
		deny: [family(ManagedRuleFamily.Read)],
		ask: [family(ManagedRuleFamily.Write)],
	}, async scenario => {
		assertDenied(await scenario.read());
		await scenario.contribute({ disableBypassPermissionsMode: 'disable', deny: [], ask: [] });
		const read = await scenario.read(['public.txt']);
		assertSuccessful(read);
		assert.strictEqual(read.pending.length, 0);
		await scenario.setApprovalLevel('autoApprove');
		await scenario.expectRejectedMode();
		await scenario.setApprovalLevel('default');
	});

	diagnosticTest('filesystem-root Read denial precedes an out-of-workspace approval', {}, async scenario => {
		scenario.write(['external.txt'], protectedContent, true);
		await scenario.contribute({ deny: [rule(ManagedRuleFamily.Read, `//${scenario.path(['external.txt'], true)}`)] });
		assertDenied(await scenario.read(['external.txt'], true));
		assert.strictEqual(readFileSync(scenario.path(['external.txt'], true), 'utf8'), protectedContent);
		await scenario.contribute({});
		const allowed = await scenario.read(['external.txt'], true);
		assertSuccessful(allowed);
		assert.match(allowed.text, /SYNTHETIC_DIAGNOSTICS_PROTECTED_CANARY/);
	});

	diagnosticTest('workspace-root single-star globs do not cross a directory separator', {
		deny: [rule(ManagedRuleFamily.Read, '/private/*.txt')],
	}, async scenario => {
		scenario.write(['private', 'top.txt'], protectedContent);
		scenario.write(['private', 'nested', 'leaf.txt'], publicContent);
		assertDenied(await scenario.read(['private', 'top.txt']));
		const nested = await scenario.read(['private', 'nested', 'leaf.txt']);
		assertSuccessful(nested);
		assert.match(nested.text, /SYNTHETIC_DIAGNOSTICS_PUBLIC_CONTENT/);
		assert.strictEqual(nested.pending.length, 0);
	});

	diagnosticTest('command-boundary rules do not deny a longer argument token', {
		deny: [rule(ManagedRuleFamily.Shell, 'echo DIAGNOSTICS_BLOCKED *')],
	}, async scenario => {
		assertDenied(await scenario.shell('echo DIAGNOSTICS_BLOCKED'));
		const allowed = await scenario.shell('echo DIAGNOSTICS_BLOCKED_SUFFIX');
		assertSuccessful(allowed);
		assertToolCallCompleteText(context.client, {
			channel: allowed.channel, turnId: allowed.turnId, toolNames: [allowed.toolName],
			expected: [/DIAGNOSTICS_BLOCKED_SUFFIX/], success: true,
		});
	});

	diagnosticTest('a Domain port restriction does not block a distinct loopback origin', {}, async scenario => {
		const denied = await scenario.http('deniedorigin');
		const allowed = await scenario.http('allowedorigin');
		await scenario.contribute({ deny: [rule(ManagedRuleFamily.Domain, denied.url)] });
		const deniedTurn = await scenario.fetch(denied);
		assert.deepStrictEqual(denied.requests, []);
		assertDenied(deniedTurn, /^Permission to access this URL was denied\.$/);
		assertSuccessful(await scenario.fetch(allowed));
		assert.deepStrictEqual({ denied: denied.requests, allowed: allowed.requests }, { denied: [], allowed: ['/probe'] });
	});
}
