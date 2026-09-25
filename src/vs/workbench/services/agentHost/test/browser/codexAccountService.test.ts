/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Action, SubmenuAction } from '../../../../../base/common/actions.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { NullAgentHostService } from '../../../../../platform/agentHost/browser/nullAgentHostService.js';
import { CODEX_ACCOUNT_META_KEY, CODEX_ACCOUNT_SIGN_IN_REQUEST_KEY, ICodexAccountInfo } from '../../../../../platform/agentHost/common/codexAccount.js';
import { AgentHostCodexAgentEnabledSettingId, CodexPreferAgentHostEditorSettingId, IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IRootConfigChangedAction } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { CODEX_AGENT_PROVIDER_ID } from '../../../../../platform/agentHost/common/agent.js';
import type { IAgentSubscription } from '../../../../../platform/agentHost/common/state/agentSubscription.js';
import type { RootState } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { ChatAIDisabledSettingId } from '../../../../../platform/chat/common/chatSettings.js';
import { OpenOptions } from '../../../../../platform/opener/common/opener.js';
import { NullOpenerService } from '../../../../../platform/opener/test/common/nullOpenerService.js';
import { ContentEncoding } from '../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { CodexAccountService, ICodexAccountService, createCodexAccountMenuActions, hasSignedInCodexChatGPTAccount, openCodexAuthUrl, readCodexProfileImageDataUri, shouldShowCodexAccount } from '../../browser/codexAccountService.js';

suite('CodexAccountService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createAccountHost() {
		const changed = disposables.add(new Emitter<RootState>());
		const started = disposables.add(new Emitter<void>());
		const exited = disposables.add(new Emitter<number>());
		let state: RootState = { agents: [] };
		const requests: IRootConfigChangedAction[] = [];
		const rootState: IAgentSubscription<RootState> = {
			get value() { return state; },
			get verifiedValue() { return state; },
			onDidChange: changed.event,
			onWillApplyAction: Event.None,
			onDidApplyAction: Event.None,
		};
		const connection = new class extends NullAgentHostService {
			override readonly onAgentHostStart = started.event;
			override readonly onAgentHostExit = exited.event;
			override get rootState(): IAgentSubscription<RootState> { return rootState; }
			override dispatch(_channel: string, action: IRootConfigChangedAction): void {
				requests.push(action);
			}
		}();
		return {
			connection, requests,
			start: () => started.fire(),
			exit: () => exited.fire(0),
			setAccount: (account: ICodexAccountInfo) => {
				state = { agents: [], _meta: { [CODEX_ACCOUNT_META_KEY]: account } };
				changed.fire(state);
			},
			hasListeners: () => changed.hasListeners(),
			nonce: () => {
				const nonce = requests.at(-1)?.config[CODEX_ACCOUNT_SIGN_IN_REQUEST_KEY];
				assert.ok(typeof nonce === 'string');
				return nonce;
			},
		};
	}

	function service(status: ICodexAccountService['account']['status'], email?: string): ICodexAccountService & { signInCalls: number; signOutCalls: number } {
		return {
			_serviceBrand: undefined,
			agent: CODEX_AGENT_PROVIDER_ID,
			account: { status, email },
			onDidChangeAccount: Event.None,
			signInCalls: 0,
			signOutCalls: 0,
			signIn() { this.signInCalls++; },
			signOut() { this.signOutCalls++; },
		};
	}

	test('shows verified ChatGPT identities with sign-out', async () => {
		const accountService = service('signedIn', 'person@example.com');
		const actions = createCodexAccountMenuActions(accountService);
		const accountAction = actions[0] as SubmenuAction;
		await accountAction.actions[0].run();
		assert.deepStrictEqual({
			label: accountAction.label,
			submenu: accountAction.actions.map(action => action.label),
			signOutCalls: accountService.signOutCalls,
		}, {
			label: 'person@example.com (ChatGPT)',
			submenu: ['Sign Out'],
			signOutCalls: 1,
		});
		assert.deepStrictEqual(createCodexAccountMenuActions(service('unavailable')), []);
	});

	test('does not duplicate the ChatGPT label when email is unavailable', () => {
		const actions = createCodexAccountMenuActions(service('signedIn'));
		assert.strictEqual(actions[0].label, 'ChatGPT');
	});

	test('only presents a verified visible ChatGPT identity in shared account chrome', () => {
		assert.strictEqual(hasSignedInCodexChatGPTAccount(service('signedIn').account), true);
		assert.strictEqual(hasSignedInCodexChatGPTAccount(service('signedIn').account, false), false);
		assert.strictEqual(hasSignedInCodexChatGPTAccount(service('unknown').account), false);
		assert.strictEqual(hasSignedInCodexChatGPTAccount(service('signedOut').account), false);
		assert.strictEqual(hasSignedInCodexChatGPTAccount(service('unavailable').account), false);
		assert.strictEqual(hasSignedInCodexChatGPTAccount(service('error').account), false);
	});

	test('offers sign-in without claiming an unknown account is signed out', async () => {
		const accountService = service('unknown');
		const actions = createCodexAccountMenuActions(accountService);
		assert.ok(actions[0] instanceof Action);
		disposables.add(actions[0] as Action);
		assert.strictEqual(actions[0].label, 'Sign in to ChatGPT');
		await actions[0].run();
		assert.strictEqual(accountService.signInCalls, 1);
	});

	test('shows download status instead of sign-in while the Codex binary is downloading', () => {
		const accountService = service('downloading');
		const actions = createCodexAccountMenuActions(accountService);
		disposables.add(actions[0] as Action);

		assert.deepStrictEqual(actions.map(action => ({ label: action.label, enabled: action.enabled })), [
			{ label: 'Downloading Codex Agent…', enabled: false },
		]);
	});

	test('hides signed-in and sign-in actions when the account surface is unavailable', () => {
		assert.deepStrictEqual(createCodexAccountMenuActions(service('signedIn'), false), []);
		assert.deepStrictEqual(createCodexAccountMenuActions(service('signedOut'), false), []);
	});

	test('only shows ChatGPT accounts where the Codex agent host is available', () => {
		function configuration(codexEnabled: boolean, preferAgentHost: boolean, aiDisabled = false) {
			return {
				getValue<T>(key: string): T | undefined {
					return ({
						[AgentHostCodexAgentEnabledSettingId]: codexEnabled,
						[CodexPreferAgentHostEditorSettingId]: preferAgentHost,
						[ChatAIDisabledSettingId]: aiDisabled,
					} as Record<string, boolean>)[key] as T;
				}
			};
		}

		assert.deepStrictEqual({
			agentsDisabled: shouldShowCodexAccount(configuration(false, false), true),
			agentsEnabled: shouldShowCodexAccount(configuration(true, false), true),
			agentsAIHidden: shouldShowCodexAccount(configuration(true, false, true), true),
			editorCodexDisabled: shouldShowCodexAccount(configuration(false, true), false),
			editorPreferenceDisabled: shouldShowCodexAccount(configuration(true, false), false),
			editorEnabled: shouldShowCodexAccount(configuration(true, true), false),
			editorAIHidden: shouldShowCodexAccount(configuration(true, true, true), false),
		}, {
			agentsDisabled: false,
			agentsEnabled: true,
			agentsAIHidden: false,
			editorCodexDisabled: false,
			editorPreferenceDisabled: false,
			editorEnabled: true,
			editorAIHidden: false,
		});

	});

	test('signs in on the selected remote and only opens its matching authorization response', () => {
		const ambient = createAccountHost();
		const first = createAccountHost();
		const second = createAccountHost();
		let connected: IAgentConnection[] = [ambient.connection, first.connection, second.connection];
		const onDidChangeConnections = disposables.add(new Emitter<void>());
		const connectionsService = new class extends mock<IAgentHostConnectionsService>() {
			override readonly onDidChangeConnections = onDidChangeConnections.event;
			override get connections() {
				return connected.map((connection, index) => ({ connection, authority: `${index}`, name: `${index}`, address: undefined, isAmbient: connection === ambient.connection }));
			}
		}();
		const opened: string[] = [];
		const accountService = disposables.add(new CodexAccountService(ambient.connection, connectionsService, {
			...NullOpenerService,
			async open(resource) {
				opened.push(resource.toString());
				return true;
			},
		}));
		accountService.signIn(first.connection);
		accountService.signIn(first.connection);
		accountService.signIn(second.connection);
		second.setAccount({ status: 'signedOut', authUrl: 'https://auth.openai.com/wrong-host', authUrlNonce: first.nonce() });
		first.setAccount({ status: 'signedOut', authUrl: 'https://auth.openai.com/first', authUrlNonce: first.nonce() });
		first.setAccount({ status: 'signedOut', authUrl: 'https://auth.openai.com/first', authUrlNonce: first.nonce() });
		connected = [ambient.connection, first.connection];
		onDidChangeConnections.fire();
		second.setAccount({ status: 'signedOut', authUrl: 'https://auth.openai.com/disconnected', authUrlNonce: second.nonce() });
		assert.throws(() => accountService.signIn(second.connection), /disconnected/);

		assert.deepStrictEqual({
			requestCounts: [ambient.requests.length, first.requests.length, second.requests.length],
			opened,
			remoteListeners: [first.hasListeners(), second.hasListeners()],
			ambientStatus: accountService.account.status,
		}, {
			requestCounts: [0, 1, 1],
			opened: ['https://auth.openai.com/first'],
			remoteListeners: [false, false],
			ambientStatus: 'unknown',
		});
	});

	for (const { name, disconnect } of [
		{ name: 'keeps a queued sign-in response listener through the initial host start', disconnect: false },
		{ name: 'discards a queued sign-in response after the ambient host exits', disconnect: true },
	]) {
		test(name, () => {
			const host = createAccountHost();
			const connectionsService = new class extends mock<IAgentHostConnectionsService>() {
				override readonly onDidChangeConnections = Event.None;
				override readonly connections = [{ connection: host.connection, authority: 'local', name: 'Local', address: undefined, isAmbient: true }];
			}();
			const opened: string[] = [];
			const accountService = disposables.add(new CodexAccountService(host.connection, connectionsService, {
				...NullOpenerService,
				async open(resource) {
					opened.push(resource.toString());
					return true;
				},
			}));

			accountService.signIn();
			const rootBeforeStart = host.connection.rootState;
			if (disconnect) {
				host.exit();
			}
			host.start();
			host.setAccount({ status: 'signedOut', authUrl: 'https://auth.openai.com/queued', authUrlNonce: host.nonce() });

			assert.deepStrictEqual({
				sameRoot: host.connection.rootState === rootBeforeStart,
				requests: host.requests.length,
				opened,
			}, {
				sameRoot: true,
				requests: 1,
				opened: disconnect ? [] : ['https://auth.openai.com/queued'],
			});
		});
	}

	test('retrying an existing account error keeps the matching authorization response listener', () => {
		const host = createAccountHost();
		const staleAccount: ICodexAccountInfo = { status: 'error', authUrlNonce: 'previous-request' };
		host.setAccount(staleAccount);
		const connectionsService = new class extends mock<IAgentHostConnectionsService>() {
			override readonly onDidChangeConnections = Event.None;
			override readonly connections = [{ connection: host.connection, authority: 'local', name: 'Local', address: undefined, isAmbient: true }];
		}();
		const opened: string[] = [];
		const accountService = disposables.add(new CodexAccountService(host.connection, connectionsService, {
			...NullOpenerService,
			async open(resource) {
				opened.push(resource.toString());
				return true;
			},
		}));

		accountService.signIn();
		const request = host.nonce();
		host.setAccount(staleAccount);
		accountService.signIn();
		host.setAccount({ status: 'signedOut', authUrl: 'https://auth.openai.com/retry', authUrlNonce: request });

		assert.deepStrictEqual({
			requestCount: host.requests.length,
			opened,
		}, {
			requestCount: 1,
			opened: ['https://auth.openai.com/retry'],
		});
	});

	for (const status of ['error', 'signedIn'] as const) {
		test(`only a matching ${status} response completes its pending sign-in request`, () => {
			const host = createAccountHost();
			const connectionsService = new class extends mock<IAgentHostConnectionsService>() {
				override readonly onDidChangeConnections = Event.None;
				override readonly connections = [{ connection: host.connection, authority: 'local', name: 'Local', address: undefined, isAmbient: true }];
			}();
			const opened: string[] = [];
			const accountService = disposables.add(new CodexAccountService(host.connection, connectionsService, {
				...NullOpenerService,
				async open(resource) {
					opened.push(resource.toString());
					return true;
				},
			}));

			accountService.signIn();
			const firstRequest = host.nonce();
			host.setAccount({ status, authUrlNonce: firstRequest });
			accountService.signIn();
			const retryRequest = host.nonce();
			host.setAccount({ status, authUrlNonce: firstRequest });
			accountService.signIn();
			host.setAccount({ status: 'signedOut', authUrl: 'https://auth.openai.com/retry', authUrlNonce: retryRequest });

			assert.deepStrictEqual({
				requestCount: host.requests.length,
				distinctRequests: firstRequest !== retryRequest,
				opened,
			}, {
				requestCount: 2,
				distinctRequests: true,
				opened: ['https://auth.openai.com/retry'],
			});
		});
	}

	test('opens expected authentication URLs without validation prompts', async () => {
		let call: { resource: string; options: OpenOptions | undefined } | undefined;
		await openCodexAuthUrl({
			open: async (resource, options) => {
				call = { resource: resource.toString(), options };
				return true;
			}
		}, 'https://auth.openai.com/oauth/authorize?token=secret');

		assert.deepStrictEqual(call, {
			resource: 'https://auth.openai.com/oauth/authorize?token=secret',
			options: { openExternal: true, skipValidation: true },
		});
	});

	test('rejects unexpected authentication URLs', async () => {
		let openCalls = 0;
		const opener = {
			open: async () => {
				openCalls++;
				return true;
			}
		};
		const opened = await Promise.all([
			openCodexAuthUrl(opener, 'https://example.com/login'),
			openCodexAuthUrl(opener, 'custom-protocol:/login'),
		]);

		assert.deepStrictEqual({ opened, openCalls }, { opened: [false, false], openCalls: 0 });
	});

	test('reads profile-image bytes through the Agent Host resource connection', async () => {
		const nonce = 'a'.repeat(64);
		const reference = {
			uri: `vscode-codex-profile-image:/profile-${nonce}.jpg`,
			contentType: 'image/jpeg',
			sizeHint: 3,
			nonce,
		};
		const dataUri = await readCodexProfileImageDataUri({
			resourceRead: async () => ({ data: 'AQID', encoding: ContentEncoding.Base64, contentType: 'image/jpg' }),
		}, reference);
		assert.strictEqual(dataUri, 'data:image/jpeg;base64,AQID');

		const invalidDataUri = await readCodexProfileImageDataUri({
			resourceRead: async () => ({ data: 'AQID', encoding: ContentEncoding.Base64, contentType: 'image/png' }),
		}, reference);
		assert.strictEqual(invalidDataUri, undefined);
	});

	test('retries a failed profile-image read for the same reference', async () => {
		const nonce = 'a'.repeat(64);
		const reference = {
			uri: `vscode-codex-profile-image:/profile-${nonce}.png`,
			contentType: 'image/png',
			sizeHint: 3,
			nonce,
		};
		const state: RootState = {
			agents: [],
			_meta: { [CODEX_ACCOUNT_META_KEY]: { status: 'signedIn', profileImage: reference } },
		};
		const rootStateEmitter = new Emitter<RootState>();
		const rootState: IAgentSubscription<RootState> = {
			value: state,
			verifiedValue: state,
			onDidChange: rootStateEmitter.event,
			onWillApplyAction: Event.None,
			onDidApplyAction: Event.None,
		};
		const firstReadStarted = new DeferredPromise<void>();
		let readCount = 0;
		const agentHostService = new class extends NullAgentHostService {
			override get rootState(): IAgentSubscription<RootState> {
				return rootState;
			}

			override async resourceRead(_uri: URI, _encoding?: ContentEncoding) {
				if (++readCount === 1) {
					firstReadStarted.complete();
					throw new Error('transient read failure');
				}
				return { data: 'AQID', encoding: ContentEncoding.Base64, contentType: 'image/png' };
			}
		}();
		const connectionsService = new class extends mock<IAgentHostConnectionsService>() {
			override readonly onDidChangeConnections = Event.None;
		}();
		const accountService = disposables.add(new CodexAccountService(agentHostService, connectionsService, NullOpenerService));
		disposables.add(rootStateEmitter);

		await firstReadStarted.p;
		await timeout(0);
		const loadedAccount = Event.toPromise(Event.filter(accountService.onDidChangeAccount, account => !!account.profileImageDataUri));
		rootStateEmitter.fire(state);

		assert.deepStrictEqual({
			readCount,
			profileImageDataUri: (await loadedAccount).profileImageDataUri,
		}, {
			readCount: 2,
			profileImageDataUri: 'data:image/png;base64,AQID',
		});
	});

});
