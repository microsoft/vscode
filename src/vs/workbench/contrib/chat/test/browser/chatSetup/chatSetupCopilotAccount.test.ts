/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { autorun, constObservable } from '../../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { CopilotAccountContext, copilotAccountContextKey, ICopilotServiceChoice } from '../../../../../../platform/agentHost/common/copilotAccountContext.js';
import { RootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IProgressService } from '../../../../../../platform/progress/common/progress.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../../platform/quickinput/common/quickInput.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IActivityService } from '../../../../../services/activity/common/activity.js';
import { AuthenticationSession, IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { ChatEntitlement, ChatEntitlementContext, ChatEntitlementRequests, chatRequiresSetup } from '../../../../../services/chat/common/chatEntitlementService.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';
import { TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { IExtensionsWorkbenchService } from '../../../../extensions/common/extensions.js';
import { IAgentHostCopilotAccountService } from '../../../browser/agentSessions/agentHost/agentHostCopilotAccountService.js';
import { ChatSetupController } from '../../../browser/chatSetup/chatSetupController.js';
import { ChatSetupAnonymous } from '../../../browser/chatSetup/chatSetup.js';
import { observeCopilotAccountContext } from '../../../../../services/agentHost/common/copilotAccountContext.js';

suite('Microsoft Copilot setup UI', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const choices: readonly ICopilotServiceChoice[] = [
		{ service: 'github', resource: 'https://github.example/copilot', selectionId: 'github-handle', host: 'https://github.example', accountName: 'emu-login', displayName: 'emu-login' },
		{ service: 'm365', resource: 'https://m365.example/copilot', selectionId: 'm365-handle', host: 'https://m365.example', accountName: 'm365-login', displayName: 'm365-login' },
	];
	const offered: CopilotAccountContext = { kind: 'choiceRequired', entraAccountId: 'account-a', discoveryId: 'discovery-a', choices };
	const ready = (choice = choices[1]): CopilotAccountContext => ({ kind: 'ready', entraAccountId: 'account-a', discoveryId: 'discovery-a', derivedFrom: 'base-a', choice });

	function fixture(initial: CopilotAccountContext = { kind: 'signedOut' }) {
		const changed = store.add(new Emitter<RootState>());
		const root: RootState = { agents: [], config: { schema: { type: 'object', properties: {} }, values: { [copilotAccountContextKey]: initial } } };
		const host = upcastPartial<IAgentHostService>({
			authenticationPending: constObservable(true), onAgentHostStart: Event.None, onAgentHostExit: Event.None,
			rootState: upcastPartial<IAgentHostService['rootState']>({ value: root, onDidChange: changed.event }),
		});
		const setContext = (value: CopilotAccountContext | undefined) => {
			root.config!.values[copilotAccountContextKey] = value;
			changed.fire(root);
		};
		const config = new TestConfigurationService();
		const context = store.add(new ChatEntitlementContext(store.add(new MockContextKeyService()), store.add(new TestStorageService()), new NullLogService(), config, NullTelemetryService));
		context.setCopilotAccountContext(observeCopilotAccountContext(host, store.add(new DisposableStore())));
		const session: AuthenticationSession = { id: 'microsoft-session', account: { id: 'account-a', label: 'Microsoft Account A' }, accessToken: 'synthetic', scopes: ['User.Read'] };
		const calls: string[] = [];
		const state = {
			sessions: [] as AuthenticationSession[], discovery: offered, pick: undefined as number | undefined, retry: false,
			picks: [] as readonly IQuickPickItem[][],
			discoveryError: undefined as Error | undefined,
			errorDetails: [] as Array<Parameters<IDialogService['confirm']>[0]['detail']>,
		};
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(IAgentHostService, host);
		instantiation.stub(IConfigurationService, config);
		instantiation.stub(ITelemetryService, NullTelemetryService);
		instantiation.stub(ILogService, new NullLogService());
		instantiation.stub(IProductService, { quality: 'stable' });
		instantiation.stub(IActivityService, { showViewContainerActivity: () => Disposable.None });
		instantiation.stub(IProgressService, { withProgress: async (_options, task) => task({ report() { } }) });
		instantiation.stub(IExtensionsWorkbenchService, { local: [], install: async () => { calls.push('install'); return undefined!; } });
		instantiation.stub(ILifecycleService, { willShutdown: false });
		instantiation.stub(IDefaultAccountService, {});
		instantiation.stub(IDialogService, { confirm: async options => { calls.push('retry'); state.errorDetails.push(options.detail); const confirmed = state.retry; state.retry = false; if (confirmed) { state.discovery = offered; } return { confirmed }; } });
		instantiation.stub(IQuickInputService, {
			pick: async items => {
				const resolved = await items;
				state.picks = [...state.picks, resolved.filter((item): item is typeof item & IQuickPickItem => item.type !== 'separator')];
				calls.push('pick');
				return state.pick === undefined ? undefined : resolved[state.pick];
			}
		});
		instantiation.stub(IAuthenticationService, {
			getSessions: async provider => { assert.strictEqual(provider, 'microsoft'); calls.push('sessions'); return state.sessions; },
			createSession: async () => { calls.push('signIn'); state.sessions = [session]; return session; },
		});
		instantiation.stub(IAgentHostCopilotAccountService, {
			discover: async (connection, sessionId) => {
				assert.deepStrictEqual([connection === host, sessionId], [true, session.id]);
				calls.push('discover');
				setContext(state.discovery);
				if (state.discoveryError) {
					throw state.discoveryError;
				}
				return state.discovery;
			},
			select: async (connection, discoveryId, selectionId) => {
				assert.deepStrictEqual([connection === host, discoveryId], [true, 'discovery-a']);
				calls.push(`select:${selectionId}`);
				const result = ready(choices.find(choice => choice.selectionId === selectionId));
				setContext(result);
				return result;
			},
		});
		const requests = upcastPartial<ChatEntitlementRequests>({ signIn: async () => { calls.push('legacySignIn'); return {}; } });
		const controller = store.add(instantiation.createInstance(ChatSetupController, context, requests));
		return { context, controller, calls, state, setContext, config, session, host };
	}

	test('unrelated host updates do not invalidate the account presentation', () => {
		const f = fixture(ready());
		const context = observeCopilotAccountContext(f.host, store.add(new DisposableStore()));
		const updates: (string | undefined)[] = [];
		store.add(autorun(reader => {
			const value = context.read(reader);
			updates.push(typeof value === 'object' && !(value instanceof Error) ? value.kind : undefined);
		}));
		f.setContext(ready());
		f.setContext(ready());
		f.setContext(offered);
		assert.deepStrictEqual(updates, ['ready', 'choiceRequired']);
	});

	test('observes account mode after a previously unavailable host connects', () => {
		const started = store.add(new Emitter<void>());
		let connected = false;
		const root: RootState = { agents: [], config: { schema: { type: 'object', properties: {} }, values: { [copilotAccountContextKey]: ready() } } };
		const host = upcastPartial<IAgentHostService>({
			get authenticationPending() { return constObservable(connected); },
			initializeResult: constObservable(undefined),
			onAgentHostStart: started.event,
			onAgentHostExit: Event.None,
			get rootState() {
				assert.ok(connected, 'Do not read an unsupported host subscription');
				return upcastPartial<IAgentHostService['rootState']>({ value: root, onDidChange: Event.None });
			},
		});
		const context = observeCopilotAccountContext(host, store.add(new DisposableStore()));
		const updates: (string | undefined)[] = [];
		store.add(autorun(reader => {
			const value = context.read(reader);
			updates.push(typeof value === 'object' && !(value instanceof Error) ? value.kind : undefined);
		}));
		connected = true;
		started.fire();
		assert.deepStrictEqual(updates, [undefined, 'ready']);
	});

	test('cancellation retains Microsoft sign-in and resume reoffers both services', async () => {
		const f = fixture();
		const canceled = await f.controller.setupWithProvider({ useSocialProvider: 'microsoft' });
		const afterCancel = { result: canceled, completed: f.context.state.completed, calls: [...f.calls] };
		f.state.pick = 1;
		const resumed = await f.controller.setup();
		assert.deepStrictEqual({
			afterCancel, resumed, sessions: f.state.sessions.map(session => session.id),
			signIns: f.calls.filter(call => call === 'signIn').length,
			selections: f.calls.filter(call => call.startsWith('select:')),
			labels: f.state.picks.map(items => items.map(item => item.label)),
		}, {
			afterCancel: { result: undefined, completed: false, calls: ['sessions', 'signIn', 'discover', 'pick'] },
			resumed: true, sessions: ['microsoft-session'], signIns: 1, selections: ['select:m365-handle'],
			labels: [['GitHub Copilot', 'Microsoft 365 Copilot'], ['GitHub Copilot', 'Microsoft 365 Copilot']],
		});
	});

	for (const index of [0, 1]) {
		test(`explicitly activates only service ${choices[index].service}`, async () => {
			const f = fixture();
			f.state.pick = index;
			assert.deepStrictEqual({ result: await f.controller.setup(), selected: f.calls.filter(call => call.startsWith('select:')) },
				{ result: true, selected: [`select:${choices[index].selectionId}`] });
		});
	}

	test('uses authoritative ready completion without another chooser', async () => {
		const f = fixture();
		f.state.discovery = ready();
		assert.deepStrictEqual({ result: await f.controller.setup(), calls: f.calls }, {
			result: true, calls: ['sessions', 'signIn', 'discover', 'install'],
		});
	});

	test('distinguishes confirmed discovery failure from Microsoft sign-in failure', async () => {
		const f = fixture();
		f.state.discovery = { kind: 'error', stage: 'discovery', entraAccountId: 'account-a' };
		f.state.discoveryError = new Error('Authentication failed for resource: https://graph.microsoft.com');
		await assert.rejects(f.controller.setup(), /Authentication failed for resource/);
		assert.deepStrictEqual({
			details: f.state.errorDetails,
			sessions: f.state.sessions.map(session => session.id),
			choices: f.state.picks,
		}, {
			details: ['Microsoft sign-in succeeded, but Copilot service discovery failed. Your Microsoft sign-in has been retained. Retry discovery, or check the Agent Host log for details.'],
			sessions: ['microsoft-session'],
			choices: [],
		});
	});

	test('reuses one Microsoft account with multiple cached resource sessions', async () => {
		const f = fixture();
		f.state.sessions = [f.session, { ...f.session, id: 'resource-session', scopes: ['service/.default'] }];
		await f.controller.setup();
		assert.deepStrictEqual(f.calls, ['sessions', 'discover', 'pick']);
	});

	test('does not replace a missing intended account with another signed-in account', async () => {
		const f = fixture(offered);
		f.state.sessions = [{ ...f.session, account: { id: 'other', label: 'Other account' } }];
		await assert.rejects(f.controller.setup(), /intended account/);
		assert.deepStrictEqual(f.calls, ['sessions', 'retry']);
	});

	test('requested opt-in is not startup-effective account mode', async () => {
		const f = fixture();
		f.setContext(undefined);
		await f.config.setUserConfiguration('chat.agentHost.copilot.m365.enabled', true);
		assert.deepStrictEqual({ result: await f.controller.setup({ forceAnonymous: ChatSetupAnonymous.EnabledWithDialog }), calls: f.calls },
			{ result: true, calls: ['install'] });
	});

	for (const discovery of [
		{ kind: 'incomplete', entraAccountId: 'account-a' } as const,
		{ kind: 'error', stage: 'discovery', entraAccountId: 'account-a' } as const,
	]) {
		test(`${discovery.kind} retries discovery with the same sign-in, never as sole/no access`, async () => {
			const f = fixture();
			f.state.discovery = discovery;
			f.state.retry = true;
			f.state.pick = 0;
			const result = await f.controller.setup();
			assert.deepStrictEqual({ result, calls: f.calls }, {
				result: true, calls: ['sessions', 'signIn', 'discover', 'retry', 'sessions', 'discover', 'pick', 'select:github-handle', 'install'],
			});
		});
	}

	test('direct provider setup respects AI hiding and administrator agent disablement', async () => {
		for (const setting of ['chat.disableAIFeatures', 'chat.agent.enabled']) {
			const f = fixture();
			await f.config.setUserConfiguration(setting, setting === 'chat.disableAIFeatures');
			await assert.rejects(f.controller.setupWithProvider({ useSocialProvider: 'microsoft' }));
			assert.deepStrictEqual(f.calls, ['retry']);
		}
	});

	test('authentication and stored completion cannot satisfy watchers before host readiness', async () => {
		const f = fixture();
		await f.context.update({ completed: true });
		const observations = [];
		for (const state of [offered, { kind: 'incomplete', entraAccountId: 'account-a' } as const, ready(), { kind: 'signedOut' } as const]) {
			f.setContext(state);
			observations.push({
				kind: state.kind, completed: f.context.state.completed, requiresSetup: chatRequiresSetup({
					completed: !!f.context.state.completed, copilotAccountReady: f.context.state.copilotAccountReady,
					entitlement: ChatEntitlement.Pro, disabled: false, untrusted: false, anonymous: true, hasByokModels: true,
				})
			});
		}
		assert.deepStrictEqual(observations, [
			{ kind: 'choiceRequired', completed: false, requiresSetup: true },
			{ kind: 'incomplete', completed: false, requiresSetup: true },
			{ kind: 'ready', completed: true, requiresSetup: false },
			{ kind: 'signedOut', completed: false, requiresSetup: true },
		]);
	});

	test('pre-canceled setup never acquires credentials or starts discovery', async () => {
		const f = fixture();
		const cancellation = store.add(new CancellationTokenSource());
		cancellation.cancel();
		assert.deepStrictEqual({ result: await f.controller.setup({ cancellationToken: cancellation.token }), calls: f.calls }, { result: undefined, calls: [] });
	});
});
