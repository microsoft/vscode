/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import type * as http from 'http';
import { createRequire } from 'module';
import { Disposable, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { buildManagedFamilyRule, buildManagedRule, ManagedRuleFamily } from '../../../../common/agentHostManagedRules.js';
import type { IAgentHostManagedSettingsPermissions } from '../../../../common/agentHostManagedSettings.js';
import {
	AgentHostAutoApprovePolicyRestrictedConfigKey,
	AgentHostEditAutoApprovePatternsConfigKey,
	AgentHostGlobalAutoApproveEnabledConfigKey,
	AgentHostTerminalAutoApproveEnabledConfigKey,
	AgentHostTerminalAutoApproveRulesConfigKey,
} from '../../../../common/agentHostSchema.js';
import { readToolCallMeta } from '../../../../common/meta/agentToolCallMeta.js';
import { SessionConfigKey } from '../../../../common/sessionConfigKeys.js';
import type { SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { ActionType, type ChatErrorAction, type ChatToolCallCompleteAction, type ChatToolCallReadyAction, type ChatToolCallStartAction, type SessionActiveClientRemovedAction } from '../../../../common/state/sessionActions.js';
import {
	buildChatUri,
	buildDefaultChatUri,
	MessageKind,
	ROOT_STATE_URI,
	ToolCallCancellationReason,
	ToolCallConfirmationReason,
	type RootState,
	type SessionState,
} from '../../../../common/state/sessionState.js';
import { getActionEnvelope, isActionNotification, type TestProtocolClient } from '../../serverIntegrationTestHelpers.js';
import { assertToolCallCompleteText, createRealSession, findToolNameForCall, resolveGitHubToken, textFromContent } from '../harness/agentHostE2ETestHarness.js';
import { expandShellToolName } from '../harness/shellToolNames.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

const nodeRequire = createRequire(import.meta.url);
const httpModule = nodeRequire('http') as typeof http;
const protectedContent = 'SYNTHETIC_MANAGED_READ_CANARY\n';
const publicContent = 'SYNTHETIC_PUBLIC_FILE\n';
const changedContent = 'SYNTHETIC_MANAGED_FILE_CHANGED\n';
const shellOutput = 'SYNTHETIC_MANAGED_SHELL_OUTPUT';
const shellExecutionMarker = 'SYNTHETIC_MANAGED_SHELL_EXECUTED';
const httpContent = 'SYNTHETIC_MANAGED_HTTP_CONTENT';

interface IManagedTurnOptions {
	readonly channel?: string;
	readonly managedAsk?: boolean;
	readonly deny?: boolean;
	readonly selectedOptionId?: string;
	readonly beforeApproval?: () => void;
}

interface IManagedTurn {
	readonly channel: string;
	readonly turnId: string;
	readonly toolName: string;
	readonly pending: readonly ChatToolCallReadyAction[];
	readonly completion: ChatToolCallCompleteAction;
	readonly text: string;
}

interface IManagedScenario {
	readonly session: string;
	readonly workspace: string;
	readonly store: DisposableStore;
	path(name?: string): string;
	setPermissions(permissions: IAgentHostManagedSettingsPermissions, client?: TestProtocolClient): Promise<void>;
	setSessionConfig(config: Record<string, object | string | boolean>): Promise<void>;
	setRootConfig(config: Record<string, object | string | boolean>): Promise<void>;
	connect(clientId: string): Promise<TestProtocolClient>;
	disconnect(client: TestProtocolClient): void;
	createSession(): Promise<string>;
	restart(permissions?: IAgentHostManagedSettingsPermissions): Promise<void>;
	read(name?: string, options?: IManagedTurnOptions): Promise<IManagedTurn>;
	edit(name?: string, options?: IManagedTurnOptions): Promise<IManagedTurn>;
	shell(command: string, options?: IManagedTurnOptions): Promise<IManagedTurn>;
	fetch(server: ManagedHttpFixture, options?: IManagedTurnOptions): Promise<IManagedTurn>;
	rejectedTurn(expected: RegExp): Promise<void>;
}

class ManagedHttpFixture extends Disposable {
	readonly requests: string[] = [];
	private readonly server: http.Server;
	private readonly closed: Promise<void>;
	private baseUrl = '';

	constructor() {
		super();
		this.server = httpModule.createServer((request, response) => {
			this.requests.push(request.url ?? '/');
			response.writeHead(200, { 'Content-Type': 'text/plain' });
			response.end(httpContent);
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
		await new Promise<void>((resolve, reject) => {
			const onError = (error: Error) => {
				this.server.off('listening', onListening);
				reject(error);
			};
			const onListening = () => {
				this.server.off('error', onError);
				resolve();
			};
			this.server.once('error', onError);
			this.server.once('listening', onListening);
			this.server.listen(0, '127.0.0.1');
		});
		const address = this.server.address();
		assert.ok(address && typeof address !== 'string');
		this.baseUrl = `http://127.0.0.1:${address.port}`;
	}

	async whenClosed(): Promise<void> {
		await this.closed;
	}
}

function family(family: ManagedRuleFamily): string {
	return buildManagedFamilyRule(family);
}

function rule(family: ManagedRuleFamily, argument: string): string {
	const result = buildManagedRule(family, argument);
	assert.ok(result, `The synthetic rule must be valid: ${family}`);
	return result;
}

function assertDenied(turn: IManagedTurn): void {
	assert.deepStrictEqual({
		success: turn.completion.result.success,
		pending: turn.pending.length,
		denial: /denied|deny|blocked|not allowed/i.test(turn.text),
	}, { success: false, pending: 0, denial: true }, turn.text);
}

function assertSuccessful(turn: IManagedTurn): void {
	assert.strictEqual(turn.completion.result.success, true, turn.text);
}

function assertManagedAsk(turn: IManagedTurn): void {
	assert.deepStrictEqual(turn.pending.map(action => ({
		confirmed: action.confirmed,
		options: action.options?.map(option => option.id),
		autoApproveBySetting: readToolCallMeta(action).autoApproveBySetting === true,
		autoApproveRuleResolvable: readToolCallMeta(action).autoApproveRuleResolvable === true,
	})), [{
		confirmed: undefined,
		options: ['allow-once', 'skip'],
		autoApproveBySetting: false,
		autoApproveRuleResolvable: false,
	}]);
}

export function defineCopilotRuntimeManagedSettingsCoverageTests(context: IAgentHostE2ETestContext): void {
	if (context.tier !== 'parity' || context.config.provider !== 'copilotcli') {
		return;
	}
	suite('Copilot runtime host-managed settings coverage', () => {
		ensureNoDisposablesAreLeakedInTestSuite();
		defineManagedSettingsTests(context);
	});
}

function defineManagedSettingsTests(context: IAgentHostE2ETestContext): void {
	const shellName = expandShellToolName('${shell}');
	const deniedShellScript = 'managed-shell-deny.cjs';
	const askedShellScript = 'managed-shell-ask.cjs';
	const deniedShellCommand = `node ${deniedShellScript}`;
	const askedShellCommand = `node ${askedShellScript}`;

	function createExecutionProbe(scenario: IManagedScenario, script: string, marker: string): string {
		const markerPath = scenario.path(marker);
		writeFileSync(scenario.path(script),
			`const { writeFileSync } = require('fs');\n` +
			`const { join } = require('path');\n` +
			`writeFileSync(join(__dirname, ${JSON.stringify(marker)}), ${JSON.stringify(shellExecutionMarker)});\n` +
			`console.log(${JSON.stringify(shellOutput)});\n`);
		assert.strictEqual(existsSync(markerPath), false);
		return markerPath;
	}

	async function initialize(client: TestProtocolClient, clientId: string, workspace: string): Promise<void> {
		client.setWorkingDirectory(workspace);
		await client.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId }, 30_000);
		await client.call('authenticate', {
			channel: ROOT_STATE_URI,
			resource: 'https://api.github.com',
			token: context.config.githubToken ?? resolveGitHubToken(),
		}, 30_000);
	}

	async function contribute(client: TestProtocolClient, permissions: IAgentHostManagedSettingsPermissions): Promise<void> {
		client.notify('setClientManagedSettingsPermissions', { permissions });
		await client.call('listSessions', { channel: ROOT_STATE_URI }, 30_000);
	}

	function managedTest(title: string, permissions: IAgentHostManagedSettingsPermissions, run: (scenario: IManagedScenario) => Promise<void>, enabled = true): void {
		const fullTitle = `managed settings: ${title}`;
		context.registerTestEnvironment(fullTitle, { COPILOT_WEB_FETCH_ALLOW_LOCALHOST: '1' });
		(enabled ? test : test.skip)(fullTitle, async function () {
			this.timeout(240_000);
			const parent = join(process.cwd(), '.build', 'agent-host-managed-settings-workspaces');
			mkdirSync(parent, { recursive: true });
			const workspace = mkdtempSync(join(parent, 'managed-'));
			context.tempDirs.push(workspace);
			writeFileSync(join(workspace, 'protected.txt'), protectedContent);
			writeFileSync(join(workspace, 'public.txt'), publicContent);
			const store = new DisposableStore();
			const contributions = new Set<TestProtocolClient>();
			const servers: ManagedHttpFixture[] = [];
			let clientSeq = 100;
			let turnOrdinal = 0;
			const rootConfigSnapshot: { config?: RootState['config'] } = {};
			const cleanupErrors: Error[] = [];
			let primaryError: Error | undefined;
			try {
				const sessionConfig = {
					...context.config.sessionConfig,
					[SessionConfigKey.Mode]: 'interactive',
					[SessionConfigKey.AutoApprove]: 'default',
					[SessionConfigKey.Permissions]: { allow: [], deny: [] },
				};
				const session = await createRealSession(context.client, { ...context.config, sessionConfig }, 'managed-settings-main', context.createdSessions, URI.file(workspace), async () => {
					const root = await context.client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
					rootConfigSnapshot.config = (root.snapshot!.state as RootState).config;
					const sequence = clientSeq++;
					context.client.dispatch({
						channel: ROOT_STATE_URI, clientSeq: sequence,
						action: {
							type: ActionType.RootConfigChanged,
							config: {
								[AgentHostGlobalAutoApproveEnabledConfigKey]: false,
								[AgentHostAutoApprovePolicyRestrictedConfigKey]: false,
								[AgentHostTerminalAutoApproveRulesConfigKey]: {},
								[SessionConfigKey.Permissions]: { allow: [], deny: [] },
							},
						},
					});
					await context.client.waitForNotification(n =>
						isActionNotification(n, ActionType.RootConfigChanged)
						&& getActionEnvelope(n).origin?.clientSeq === sequence, 30_000);
					contributions.add(context.client);
					await contribute(context.client, permissions);
				});

				async function updateConfig(channel: string, type: ActionType.RootConfigChanged | ActionType.SessionConfigChanged, config: Record<string, object | string | boolean>): Promise<void> {
					await context.client.call<SubscribeResult>('subscribe', { channel });
					const sequence = clientSeq++;
					context.client.dispatch({ channel, clientSeq: sequence, action: { type, config } });
					await context.client.waitForNotification(notification => {
						if (!isActionNotification(notification, type)) {
							return false;
						}
						const envelope = getActionEnvelope(notification);
						return envelope.channel === channel && envelope.origin?.clientSeq === sequence;
					}, 30_000);
				}

				async function execute(toolName: string, prompt: string, options: IManagedTurnOptions = {}): Promise<IManagedTurn> {
					const channel = options.channel ?? buildDefaultChatUri(session);
					const turnId = `managed-turn-${++turnOrdinal}`;
					const requestStart = context.observedModelRequestBodies.length;
					const canaryAlreadyShared = context.observedModelRequestBodies.some(body => body.includes(protectedContent.trim()));
					const seen = new Set<number>();
					const pending: ChatToolCallReadyAction[] = [];
					context.client.dispatch({
						channel,
						clientSeq: clientSeq++,
						action: {
							type: ActionType.ChatTurnStarted,
							turnId,
							startedAt: new Date().toISOString(),
							message: {
								text: `${prompt} Call only the named tool exactly once. Do not retry, use a fallback, or call any other tool. If access is denied, report it without trying again. Work only with the specified synthetic fixture. Then reply exactly MANAGED_CHECK_COMPLETE.`,
								origin: { kind: MessageKind.User },
							},
						},
					});
					while (true) {
						const notification = await context.client.waitForNotification(candidate => {
							if (!isActionNotification(candidate, ActionType.ChatToolCallReady)
								&& !isActionNotification(candidate, ActionType.ChatTurnComplete)
								&& !isActionNotification(candidate, ActionType.ChatError)) {
								return false;
							}
							const envelope = getActionEnvelope(candidate);
							return envelope.channel === channel && !seen.has(envelope.serverSeq)
								&& (envelope.action as { readonly turnId: string }).turnId === turnId;
						}, 90_000);
						const envelope = getActionEnvelope(notification);
						seen.add(envelope.serverSeq);
						const action = envelope.action;
						if (action.type === ActionType.ChatError) {
							throw new Error(`Managed-settings turn failed: ${action.part.error.message}`);
						}
						if (action.type === ActionType.ChatTurnComplete) {
							break;
						}
						if (action.type === ActionType.ChatToolCallReady && !action.confirmed) {
							assert.strictEqual(findToolNameForCall(context.client, action.toolCallId), toolName, 'Never approve an unexpected tool');
							pending.push(action);
							options.beforeApproval?.();
							if (options.managedAsk) {
								assert.deepStrictEqual(action.options?.map(option => option.id), ['allow-once', 'skip']);
							}
							context.client.dispatch({
								channel,
								clientSeq: clientSeq++,
								action: options.deny ? {
									type: ActionType.ChatToolCallConfirmed,
									turnId,
									toolCallId: action.toolCallId,
									approved: false,
									reason: ToolCallCancellationReason.Denied,
								} : {
									type: ActionType.ChatToolCallConfirmed,
									turnId,
									toolCallId: action.toolCallId,
									approved: true,
									confirmed: ToolCallConfirmationReason.UserAction,
									selectedOptionId: options.selectedOptionId ?? 'allow-once',
								},
							});
						}
					}
					const starts = context.client.receivedNotifications(n => isActionNotification(n, ActionType.ChatToolCallStart))
						.filter(n => getActionEnvelope(n).channel === channel)
						.map(n => getActionEnvelope(n).action as ChatToolCallStartAction)
						.filter(action => action.turnId === turnId);
					assert.deepStrictEqual(starts.map(action => action.toolName), [toolName], 'The native tool must execute its permission check, not merely produce an assistant refusal');
					const completions = context.client.receivedNotifications(n => isActionNotification(n, ActionType.ChatToolCallComplete))
						.filter(n => getActionEnvelope(n).channel === channel)
						.map(n => getActionEnvelope(n).action as ChatToolCallCompleteAction)
						.filter(action => action.turnId === turnId && action.toolCallId === starts[0].toolCallId);
					assert.strictEqual(completions.length, 1);
					const completion = completions[0];
					const text = textFromContent(completion.result.content ?? []);
					if (!completion.result.success && toolName === 'view' && !options.deny && !canaryAlreadyShared) {
						assert.ok(!context.observedModelRequestBodies.slice(requestStart).some(body => body.includes(protectedContent.trim())),
							'A denied native read must not expose its canary to the model');
					}
					return { channel, turnId, toolName, pending, completion, text };
				}

				const scenario: IManagedScenario = {
					session, workspace, store,
					path: (name = 'protected.txt') => join(workspace, name),
					setPermissions: async (value, client = context.client) => {
						contributions.add(client);
						await contribute(client, value);
					},
					setSessionConfig: config => updateConfig(session, ActionType.SessionConfigChanged, config),
					setRootConfig: config => updateConfig(ROOT_STATE_URI, ActionType.RootConfigChanged, config),
					connect: async clientId => {
						const client = await context.connectClient();
						store.add(toDisposable(() => client.close()));
						await initialize(client, clientId, workspace);
						contributions.add(client);
						return client;
					},
					disconnect: client => {
						contributions.delete(client);
						client.close();
					},
					createSession: async () => {
						const resource = URI.from({ scheme: context.config.scheme, path: `/${randomUUID()}` }).toString();
						await context.client.call('createSession', {
							channel: resource,
							provider: context.config.provider,
							workingDirectories: [URI.file(workspace).toString()],
							config: { isolation: 'folder', ...sessionConfig },
						}, 30_000);
						context.createdSessions.push(resource);
						await context.client.call('subscribe', { channel: resource });
						await context.client.call('subscribe', { channel: buildDefaultChatUri(resource) });
						return resource;
					},
					restart: async value => {
						await context.restartServer();
						contributions.clear();
						await initialize(context.client, 'managed-settings-restarted', workspace);
						contributions.add(context.client);
						if (value !== undefined) {
							await contribute(context.client, value);
						}
						await context.client.call('subscribe', { channel: session }, 30_000);
						await context.client.call('subscribe', { channel: buildDefaultChatUri(session) }, 30_000);
					},
					read: (name = 'protected.txt', options) => execute('view',
						`Call view on ${JSON.stringify(name)} in this session's current working directory. Set path to its full absolute path.`, options),
					edit: (name = 'protected.txt', options) => execute('edit',
						`Call edit on ${JSON.stringify(name)} in this session's current working directory. Set path to its full absolute path and use these exact replacement fields: ${JSON.stringify({
							old_str: readFileSync(join(workspace, name), 'utf8'),
							new_str: changedContent,
						})}.`, options),
					shell: (command, options) => execute(shellName,
						`Use the shell tool to run this exact command in the existing working directory, without cd, wrappers, or extra commands: ${JSON.stringify(command)}.`, options),
					fetch: (server, options) => {
						if (!servers.includes(server)) {
							servers.push(server);
						}
						return execute('web_fetch', `Call web_fetch with this exact input: ${JSON.stringify({ url: `${server.url}/managed-probe` })}.`, options);
					},
					rejectedTurn: async expected => {
						const channel = buildDefaultChatUri(session);
						const turnId = `managed-rejected-${++turnOrdinal}`;
						const requests = context.observedModelRequestBodies.length;
						context.client.dispatch({
							channel,
							clientSeq: clientSeq++,
							action: {
								type: ActionType.ChatTurnStarted, turnId, startedAt: new Date().toISOString(),
								message: { text: 'Reply exactly READY without using tools.', origin: { kind: MessageKind.User } },
							},
						});
						const notification = await context.client.waitForNotification(n =>
							isActionNotification(n, ActionType.ChatError) && getActionEnvelope(n).channel === channel
							&& (getActionEnvelope(n).action as ChatErrorAction).turnId === turnId, 90_000);
						const action = getActionEnvelope(notification).action as ChatErrorAction;
						assert.match(action.part.error.message, expected);
						assert.strictEqual(context.observedModelRequestBodies.length, requests, 'Rejected managed configuration must fail before model execution');
					},
				};
				await run(scenario);
			} catch (error) {
				primaryError = error instanceof Error ? error : new Error(String(error));
			} finally {
				for (const client of contributions) {
					try {
						await contribute(client, {});
					} catch (error) {
						cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
					}
				}
				if (rootConfigSnapshot.config) {
					try {
						await context.client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
						const sequence = clientSeq++;
						context.client.dispatch({
							channel: ROOT_STATE_URI, clientSeq: sequence,
							action: { type: ActionType.RootConfigChanged, config: rootConfigSnapshot.config.values, replace: true },
						});
						await context.client.waitForNotification(n =>
							isActionNotification(n, ActionType.RootConfigChanged)
							&& getActionEnvelope(n).origin?.clientSeq === sequence, 30_000);
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
				throw new AggregateError(errors, `Managed settings scenario cleanup failed: ${errors.map(error => error.message).join('; ')}`);
			}
			if (primaryError) {
				throw primaryError;
			}
		});
	}

	async function startHttp(scenario: IManagedScenario): Promise<ManagedHttpFixture> {
		const server = scenario.store.add(new ManagedHttpFixture());
		await server.start();
		scenario.store.add(context.registerFixtureUrl('managedsettings', server.url));
		return server;
	}

	const denyRead = { deny: [family(ManagedRuleFamily.Read)] };
	const denyWrite = { deny: [family(ManagedRuleFamily.Write)] };
	const askRead = { ask: [family(ManagedRuleFamily.Read)] };
	const askWrite = { ask: [family(ManagedRuleFamily.Write)] };

	managedTest('read denial prevents native file content reaching the model', denyRead, async scenario => {
		assertDenied(await scenario.read());
		assert.strictEqual(readFileSync(scenario.path(), 'utf8'), protectedContent);
	});

	managedTest('write denial prevents native edits even under Allow All', denyWrite, async scenario => {
		await scenario.setSessionConfig({ [SessionConfigKey.AutoApprove]: 'autoApprove' });
		assertDenied(await scenario.edit());
		assert.strictEqual(readFileSync(scenario.path(), 'utf8'), protectedContent);
	});

	managedTest('shell denial prevents command execution without relying on user refusal', {
		deny: [rule(ManagedRuleFamily.Shell, `${deniedShellCommand} *`)],
	}, async scenario => {
		const marker = createExecutionProbe(scenario, deniedShellScript, 'managed-shell-deny.marker');
		const turn = await scenario.shell(deniedShellCommand);
		assert.strictEqual(existsSync(marker), false, 'A managed shell denial must precede script execution');
		assertDenied(turn);
	});

	managedTest('domain denial prevents any loopback HTTP request', {
		deny: [family(ManagedRuleFamily.Domain)],
	}, async scenario => {
		const server = await startHttp(scenario);
		assertDenied(await scenario.fetch(server));
		assert.deepStrictEqual(server.requests, []);
	});

	managedTest('read path restrictions leave an unrelated workspace file readable', {
		deny: [rule(ManagedRuleFamily.Read, './protected.txt')],
	}, async scenario => {
		assertDenied(await scenario.read());
		const allowed = await scenario.read('public.txt');
		assertSuccessful(allowed);
		assert.match(allowed.text, /SYNTHETIC_PUBLIC_FILE/);
		assert.strictEqual(allowed.pending.length, 0, 'Client-only restrictions must not blanket-ask unrelated reads');
	});

	managedTest('write path restrictions block the target but permit unrelated edits', {
		deny: [rule(ManagedRuleFamily.Write, './protected.txt')],
	}, async scenario => {
		assertDenied(await scenario.edit());
		assertSuccessful(await scenario.edit('public.txt'));
		assert.deepStrictEqual([readFileSync(scenario.path(), 'utf8'), readFileSync(scenario.path('public.txt'), 'utf8')],
			[protectedContent, changedContent]);
	});

	// The recorded PowerShell command needs a separately produced POSIX fixture before it can replay under bash.
	managedTest('read rules deny shell reads of a protected file', {
		deny: [rule(ManagedRuleFamily.Read, './protected.txt')],
	}, async scenario => {
		const requestStart = context.observedModelRequestBodies.length;
		const command = context.isWindows ? 'Get-Content -LiteralPath protected.txt' : 'cat protected.txt';
		const turn = await scenario.shell(command);
		assert.strictEqual(readFileSync(scenario.path(), 'utf8'), protectedContent);
		assertDenied(turn);
		assert.ok(!context.observedModelRequestBodies.slice(requestStart).some(body => body.includes(protectedContent.trim())),
			'Managed shell reads must not expose the protected file contents to the model');
	}, context.isWindows);

	managedTest('workspace reads require an explicit human one-time managed approval', askRead, async scenario => {
		const turn = await scenario.read('protected.txt', { managedAsk: true });
		assertManagedAsk(turn);
		assertSuccessful(turn);
		assert.match(turn.text, /SYNTHETIC_MANAGED_READ_CANARY/);
	});

	managedTest('managed write asks override session Allow All', askWrite, async scenario => {
		await scenario.setSessionConfig({ [SessionConfigKey.AutoApprove]: 'autoApprove' });
		const turn = await scenario.edit('protected.txt', {
			managedAsk: true, beforeApproval: () => assert.strictEqual(readFileSync(scenario.path(), 'utf8'), protectedContent),
		});
		assertManagedAsk(turn);
		assertSuccessful(turn);
		assert.strictEqual(readFileSync(scenario.path(), 'utf8'), changedContent);
	});

	managedTest('managed shell asks override terminal rules and persistent tool preferences', {
		ask: [rule(ManagedRuleFamily.Shell, `${askedShellCommand} *`)],
	}, async scenario => {
		const marker = createExecutionProbe(scenario, askedShellScript, 'managed-shell-ask.marker');
		await scenario.setRootConfig({
			[AgentHostTerminalAutoApproveEnabledConfigKey]: true,
			[AgentHostTerminalAutoApproveRulesConfigKey]: { node: true },
		});
		await scenario.setSessionConfig({ [SessionConfigKey.Permissions]: { allow: [shellName], deny: [] } });
		const turn = await scenario.shell(askedShellCommand, {
			managedAsk: true,
			beforeApproval: () => assert.strictEqual(existsSync(marker), false, 'Managed approval must precede script execution'),
		});
		assertManagedAsk(turn);
		assertSuccessful(turn);
		assert.strictEqual(readFileSync(marker, 'utf8'), shellExecutionMarker);
		assertToolCallCompleteText(context.client, {
			channel: turn.channel, turnId: turn.turnId, toolNames: [turn.toolName],
			expected: [/SYNTHETIC_MANAGED_SHELL_OUTPUT/], success: true,
		});
	});

	managedTest('managed domain asks pause before HTTP despite persistent web allowance', {
		ask: [family(ManagedRuleFamily.Domain)],
	}, async scenario => {
		const server = await startHttp(scenario);
		await scenario.setSessionConfig({ [SessionConfigKey.Permissions]: { allow: ['web_fetch'], deny: [] } });
		const turn = await scenario.fetch(server, { managedAsk: true, beforeApproval: () => assert.deepStrictEqual(server.requests, []) });
		assertManagedAsk(turn);
		assertSuccessful(turn);
		assert.deepStrictEqual(server.requests, ['/managed-probe']);
	});

	managedTest('identical managed reads ask again instead of caching a prior signature', askRead, async scenario => {
		const turns = [
			await scenario.read('protected.txt', { managedAsk: true }),
			await scenario.read('protected.txt', { managedAsk: true }),
		];
		turns.forEach(assertManagedAsk);
		turns.forEach(assertSuccessful);
	});

	managedTest('forged Allow in Session selection cannot persist a managed write grant', askWrite, async scenario => {
		const first = await scenario.edit('protected.txt', { managedAsk: true, selectedOptionId: 'allow-session' });
		assertManagedAsk(first);
		assertSuccessful(first);
		writeFileSync(scenario.path(), protectedContent);
		const second = await scenario.edit('protected.txt', { managedAsk: true });
		assertManagedAsk(second);
		assertSuccessful(second);
		const state = (await context.client.call<SubscribeResult>('subscribe', { channel: scenario.session })).snapshot!.state as SessionState;
		assert.deepStrictEqual(state.config?.values[SessionConfigKey.Permissions], { allow: [], deny: [] });
	});

	managedTest('declining a managed write leaves the file unchanged', askWrite, async scenario => {
		const turn = await scenario.edit('protected.txt', { managedAsk: true, deny: true });
		assertManagedAsk(turn);
		assert.deepStrictEqual({ success: turn.completion.result.success, content: readFileSync(scenario.path(), 'utf8') },
			{ success: false, content: protectedContent });
	});

	managedTest('global approval and edit patterns cannot widen a managed ask', askWrite, async scenario => {
		await scenario.setRootConfig({
			[AgentHostGlobalAutoApproveEnabledConfigKey]: true,
			[AgentHostAutoApprovePolicyRestrictedConfigKey]: false,
			[AgentHostEditAutoApprovePatternsConfigKey]: { '**': true },
			[SessionConfigKey.Permissions]: { allow: ['edit', 'write'], deny: [] },
		});
		const turn = await scenario.edit('protected.txt', { managedAsk: true });
		assertManagedAsk(turn);
		assertSuccessful(turn);
	});

	managedTest('bypass lock rejects allow-all escalation instead of silently changing mode', {
		disableBypassPermissionsMode: 'disable',
	}, async scenario => {
		await scenario.setSessionConfig({ [SessionConfigKey.AutoApprove]: 'autoApprove' });
		await scenario.rejectedTurn(/managed|enterprise|rejected permission mode/i);
		await scenario.setSessionConfig({ [SessionConfigKey.AutoApprove]: 'default' });
		assertSuccessful(await scenario.read('public.txt'));
	});

	managedTest('bypass lock keeps assisted managed read approval human and one-time', {
		...askRead,
		disableBypassPermissionsMode: 'disable',
	}, async scenario => {
		await scenario.setSessionConfig({ [SessionConfigKey.AutoApprove]: 'assisted' });
		for (let index = 0; index < 2; index++) {
			const turn = await scenario.read('protected.txt', { managedAsk: true });
			assertManagedAsk(turn);
			assertSuccessful(turn);
		}
	});

	managedTest('distinct initialized clients union independent restrictions', denyRead, async scenario => {
		const peer = await scenario.connect('managed-settings-peer');
		await scenario.setPermissions(denyWrite, peer);
		assertDenied(await scenario.read());
		assertDenied(await scenario.edit());
		assert.strictEqual(readFileSync(scenario.path(), 'utf8'), protectedContent);
	});

	managedTest('one client cannot approve an operation denied by another client', askWrite, async scenario => {
		const peer = await scenario.connect('managed-settings-denying-peer');
		await scenario.setPermissions(denyWrite, peer);
		assertDenied(await scenario.edit());
		assert.strictEqual(readFileSync(scenario.path(), 'utf8'), protectedContent);
	});

	managedTest('clearing one client layer preserves another client restriction', denyRead, async scenario => {
		const peer = await scenario.connect('managed-settings-retained-peer');
		await scenario.setPermissions(denyWrite, peer);
		await scenario.setPermissions({});
		assertSuccessful(await scenario.read());
		assertDenied(await scenario.edit());
		assert.strictEqual(readFileSync(scenario.path(), 'utf8'), protectedContent);
	});

	managedTest('replacement updates only the contributing client layer', denyRead, async scenario => {
		assertDenied(await scenario.read());
		await scenario.setPermissions(denyWrite);
		assertSuccessful(await scenario.read());
		assertDenied(await scenario.edit());
		assert.strictEqual(readFileSync(scenario.path(), 'utf8'), protectedContent);
	});

	managedTest('new sessions inherit restrictions owned by another initialized client', {}, async scenario => {
		const peer = await scenario.connect('managed-settings-new-session-peer');
		await scenario.setPermissions(denyWrite, peer);
		const second = await scenario.createSession();
		assertDenied(await scenario.edit('protected.txt', { channel: buildDefaultChatUri(second) }));
		assertDenied(await scenario.edit());
		assert.strictEqual(readFileSync(scenario.path(), 'utf8'), protectedContent);
	});

	managedTest('an idle default chat refreshes its policy before the next turn', {}, async scenario => {
		assertSuccessful(await scenario.read('public.txt'));
		await scenario.setPermissions(denyWrite);
		assertDenied(await scenario.edit());
		assert.strictEqual(readFileSync(scenario.path(), 'utf8'), protectedContent);
	});

	managedTest('already materialized peer and default chats both refresh at idle boundaries', {}, async scenario => {
		const peer = buildChatUri(scenario.session, 'managed-peer');
		await context.client.call('createChat', { channel: scenario.session, chat: peer }, 30_000);
		await context.client.call('subscribe', { channel: peer });
		assertSuccessful(await scenario.read('public.txt'));
		assertSuccessful(await scenario.read('public.txt', { channel: peer }));
		await scenario.setPermissions(denyWrite);
		assertDenied(await scenario.edit('protected.txt', { channel: peer }));
		assertDenied(await scenario.edit());
		assert.strictEqual(readFileSync(scenario.path(), 'utf8'), protectedContent);
	});

	managedTest('serialized empty permissions clear the injected layer on a resumed idle chat', denyWrite, async scenario => {
		assertDenied(await scenario.edit());
		await scenario.setPermissions({});
		assertSuccessful(await scenario.edit());
		assert.strictEqual(readFileSync(scenario.path(), 'utf8'), changedContent);
	});

	managedTest('disconnect grace expiry removes only the departing client restriction', denyRead, async scenario => {
		const clientId = 'managed-settings-disconnecting-peer';
		const peer = await scenario.connect(clientId);
		await peer.call('subscribe', { channel: scenario.session });
		await peer.call('subscribe', { channel: buildDefaultChatUri(scenario.session) });
		peer.dispatch({
			channel: scenario.session, clientSeq: 1,
			action: { type: ActionType.SessionActiveClientSet, activeClient: { clientId, tools: [] } },
		});
		await context.client.waitForNotification(n =>
			isActionNotification(n, ActionType.SessionActiveClientSet)
			&& getActionEnvelope(n).channel === scenario.session
			&& getActionEnvelope(n).action.type === ActionType.SessionActiveClientSet
			&& (getActionEnvelope(n).action as { activeClient: { clientId: string } }).activeClient.clientId === clientId, 30_000);
		await scenario.setPermissions(denyWrite, peer);
		assertDenied(await scenario.edit());
		scenario.disconnect(peer);
		await context.client.waitForNotification(n =>
			isActionNotification(n, ActionType.SessionActiveClientRemoved)
			&& getActionEnvelope(n).channel === scenario.session
			&& (getActionEnvelope(n).action as SessionActiveClientRemovedAction).clientId === clientId, 60_000);
		assertSuccessful(await scenario.edit());
		assertDenied(await scenario.read());
		assert.strictEqual(readFileSync(scenario.path(), 'utf8'), changedContent);
	});

	managedTest('host restart re-supplies current permissions when provider history resumes', denyWrite, async scenario => {
		assertSuccessful(await scenario.read('public.txt'));
		await scenario.restart(denyWrite);
		assertDenied(await scenario.edit());
		assert.strictEqual(readFileSync(scenario.path(), 'utf8'), protectedContent);
	});

	managedTest('host restart without injection clears the nonpersistent client layer', denyWrite, async scenario => {
		assertDenied(await scenario.edit());
		await scenario.restart();
		assertSuccessful(await scenario.edit());
		assert.strictEqual(readFileSync(scenario.path(), 'utf8'), changedContent);
	});

	managedTest('unsupported DSL families fail session startup before model execution', {
		deny: ['UnsupportedSyntheticFamily(protected.txt)'],
	}, async scenario => {
		await scenario.rejectedTurn(/unsupported managed permission rule family|invalid.*managed|managed.*invalid/i);
		assert.strictEqual(readFileSync(scenario.path(), 'utf8'), protectedContent);
		await scenario.setPermissions({});
		assertSuccessful(await scenario.read('public.txt'));
	});

	managedTest('malformed ask rules fail resumed policy refresh instead of silently dropping restrictions', {}, async scenario => {
		assertSuccessful(await scenario.read('public.txt'));
		await scenario.setPermissions({ deny: [family(ManagedRuleFamily.Write)], ask: ['Read({unbalanced)'] });
		await scenario.rejectedTurn(/glob|invalid|managed.*rule/i);
		assert.strictEqual(readFileSync(scenario.path(), 'utf8'), protectedContent);
		await scenario.setPermissions({});
		assertSuccessful(await scenario.edit());
		assert.strictEqual(readFileSync(scenario.path(), 'utf8'), changedContent);
	});
}
