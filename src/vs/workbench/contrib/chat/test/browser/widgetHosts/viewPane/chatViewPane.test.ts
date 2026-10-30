/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../../../../base/common/cancellation.js';
import { DeferredPromise, timeout } from '../../../../../../../base/common/async.js';
import { Event } from '../../../../../../../base/common/event.js';
import { constObservable } from '../../../../../../../base/common/observable.js';
import { MutableDisposable } from '../../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { AgentHostClaudeAgentEnabledSettingId } from '../../../../../../../platform/agentHost/common/agentService.js';
import { COPILOT_TEMPORARY_ALLOW_LOCAL_HARNESS_KEY, NullManagedSettingsService } from '../../../../../../../platform/policy/common/copilotManagedSettings.js';
import { NullLogService } from '../../../../../../../platform/log/common/log.js';
import { AccountPolicyGateState } from '../../../../../../services/policies/common/accountPolicyService.js';
import { TestContextService, TestStorageService } from '../../../../../../test/common/workbenchTestServices.js';
import { ChatViewPane } from '../../../../browser/widgetHosts/viewPane/chatViewPane.js';
import { ChatOpenDiagnosticsService } from '../../../../common/chatOpenDiagnosticsService.js';
import { MockChatSessionsService } from '../../../common/mockChatSessionsService.js';
import { IChatModelReference } from '../../../../common/chatService/chatService.js';
import { getChatSessionType } from '../../../../common/model/chatUri.js';
import { SessionType } from '../../../../common/chatSessionsService.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { IChatModel, IInputModel, IPortableChatDraft } from '../../../../common/model/chatModel.js';

suite('ChatViewPane managed permission rules', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const [policyKey, policyValue, required] of [
		['permissions.deny', '["Shell"]', true],
		['permissions.deny', '[]', false],
		['permissions.ask', '["Shell"]', false],
		['permissions.allow', '[]', false],
		['permissions.disableBypassPermissionsMode', 'disable', false],
		['permissions.defaultMode', 'manual', false],
		['sandbox.enabled', true, true],
		[COPILOT_TEMPORARY_ALLOW_LOCAL_HARNESS_KEY, false, true],
	] as const) {
		for (const result of ['missing', 'error'] as const) {
			test(`${policyKey}=${policyValue} waits for policy and ${required ? 'prohibits' : 'preserves'} Local with ${result} Copilot`, async () => {
				const ready = new DeferredPromise<void>();
				let rules: string | boolean | undefined = undefined;
				const selected: string[] = [];
				const errors: string[] = [];
				const localModel = { object: upcastPartial<IChatModel>({}), dispose: () => { } };
				let localStarts = 0;
				const pane: { acquireDefaultNewSession(token: CancellationToken): Promise<{ modelRef?: IChatModelReference }> } = Object.assign(Object.create(ChatViewPane.prototype), {
					accountPolicyGateService: { gateInfo: { state: AccountPolicyGateState.Inactive }, onDidChangeGateInfo: Event.None, whenInitialized: () => ready.p },
					managedSettingsService: new class extends NullManagedSettingsService {
						override getManagedSettingValue(key: string) { return key === policyKey ? rules : undefined; }
						override getManagedSettings() { return rules === undefined ? {} : { [policyKey]: rules }; }
					}(),
					configurationService: new TestConfigurationService(),
					workspaceContextService: new TestContextService(),
					storageService: store.add(new TestStorageService()),
					chatSessionsService: new MockChatSessionsService(),
					agentHostEnablementService: { enabled: constObservable(false), managedSandboxEnforced: constObservable(false) },
					logService: new NullLogService(),
					notificationService: { error: (message: string) => errors.push(message) },
					chatService: {
						startNewLocalSession: () => { localStarts++; return localModel; },
						acquireOrLoadSession: async (resource: URI): Promise<IChatModelReference | undefined> => {
							selected.push(getChatSessionType(resource));
							if (result === 'error') {
								throw new Error('host unavailable');
							}
							return undefined;
						},
					},
				});
				const pending = pane.acquireDefaultNewSession(CancellationToken.None);
				const before = [...selected];
				rules = policyValue;
				ready.complete();
				if (required) {
					await assert.rejects(pending);
				} else {
					assert.strictEqual((await pending).modelRef, localModel);
				}
				assert.deepStrictEqual({ before, selected, localStarts, explained: errors.some(error => error.includes('organization requires the new Copilot experience')) }, {
					before: [], selected: required ? [SessionType.AgentHostCopilot] : [], localStarts: required ? 0 : 1, explained: required,
				});
			});
		}
	}
});

suite('ChatViewPane chat open diagnostics', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const chat = URI.parse('vscode-chat-session://local/abc');
	const other = URI.parse('vscode-chat-session://local/other');

	function createPane(options: { shown?: URI; restored?: boolean; acquired?: URI | undefined; fail?: boolean; acquiring?: Promise<void> }) {
		const events: string[] = [];
		const pane: { loadSession(resource: URI): Promise<IChatModel | undefined>; loadSessionCts: { value: CancellationTokenSource | undefined } } = Object.assign(Object.create(ChatViewPane.prototype), {
			_openDiagnostics: store.add(new MutableDisposable()),
			logService: new NullLogService(),
			chatOpenDiagnosticsService: store.add(new ChatOpenDiagnosticsService(new class extends NullLogService {
				override info(message: string): void { events.push(message); }
			}())),
			layoutService: { isRestored: () => options.restored ?? true },
			notificationService: { error: () => { } },
			progressService: { withProgress: (_: unknown, task: () => Promise<unknown>) => task() },
			loadSessionCts: { value: undefined, },
			element: { ownerDocument: { hidden: false } },
			_widget: { viewModel: options.shown ? { sessionResource: options.shown } : undefined, visible: true, getInput: () => '' },
			chatService: {
				acquireOrLoadSession: async () => {
					await options.acquiring;
					if (options.fail) {
						throw new Error('boom');
					}
					return options.acquired ? { object: { sessionResource: options.acquired }, dispose: () => { } } : undefined;
				},
			},
			showModel: async (_token: CancellationToken, modelRef: { object: IChatModel } | undefined) => modelRef?.object,
		});
		return { pane, events };
	}

	const summarize = (events: string[]) => events.map(summary => [summary.split(' ')[1], summary.split(' ')[2], summary.endsWith('alreadyShown=true')]);

	test('loading the requested chat completes the open', async () => {
		const { pane, events } = createPane({ acquired: chat });
		await pane.loadSession(chat);
		assert.deepStrictEqual(summarize(events), [['panel', 'completed', false]]);
	});

	test('showing another chat in its place fails the open', async () => {
		const { pane, events } = createPane({ acquired: other });
		await pane.loadSession(chat);
		assert.deepStrictEqual(summarize(events), [['panel', 'failed', false]]);
	});

	test('an error loading the chat fails the open', async () => {
		const { pane, events } = createPane({ fail: true });
		await pane.loadSession(chat);
		assert.deepStrictEqual(summarize(events), [['panel', 'failed', false]]);
	});

	test('showing the chat again is reported as a re-show', async () => {
		const { pane, events } = createPane({ shown: chat, acquired: chat });
		await pane.loadSession(chat);
		assert.deepStrictEqual(summarize(events), [['panel', 'completed', true]]);
	});

	test('a re-show that cannot load the requested chat is not logged as completed', async () => {
		const { pane, events } = createPane({ shown: chat, fail: true });
		await pane.loadSession(chat);
		assert.deepStrictEqual(summarize(events), [['panel', 'failed', true]]);
	});

	test('an open cancelled by a newer load, such as New Chat, is cancelled', async () => {
		const acquiring = new DeferredPromise<void>();
		const { pane, events } = createPane({ acquired: chat, acquiring: acquiring.p });
		const loading = pane.loadSession(chat);
		await timeout(0);
		pane.loadSessionCts.value?.cancel();
		acquiring.complete();
		await loading;
		assert.deepStrictEqual(summarize(events), [['panel', 'cancelled', false]]);
	});

	test('opens during restore are not measured', async () => {
		const { pane, events } = createPane({ restored: false, acquired: chat });
		await pane.loadSession(chat);
		assert.deepStrictEqual(summarize(events), []);
	});
});

suite('ChatViewPane restored chat with a harness disabled by policy', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const unsent = { inputText: 'unsent prompt', attachments: [], selections: [] };

	function createPane(sessionResource: URI, hasRequests: boolean, policy: { claudeDisabled: boolean }, whileShowing?: () => void) {
		const configurationService = new TestConfigurationService();
		const inspect = configurationService.inspect.bind(configurationService);
		configurationService.inspect = <T>(key: string) => {
			const value = inspect<T>(key);
			return policy.claudeDisabled && key === AgentHostClaudeAgentEnabledSettingId ? { ...value, policyValue: false as T } : value;
		};
		const chatSessionsService = new MockChatSessionsService();
		chatSessionsService.setContributions([{ type: SessionType.AgentHostClaude, name: 'claude', displayName: 'Claude', description: 'Claude' }]);
		const events = { disposed: false, cleared: [] as (IPortableChatDraft | undefined)[] };
		const widget: { viewModel?: { model: IChatModel } } = {};
		const model = upcastPartial<IChatModel>({
			sessionResource,
			hasRequests,
			inputModel: upcastPartial<IInputModel>({ state: constObservable({ ...unsent, mode: { id: 'claude-mode', kind: undefined }, selectedModel: undefined, contrib: { claude: true } }) }),
		});
		const pane: {
			acquireTransferredOrPersistedSession(token: CancellationToken, debugOwner: string): Promise<{ modelRef?: IChatModelReference; draft?: IPortableChatDraft }>;
			_applyModel(token: CancellationToken): Promise<void>;
			replaceUnusableEmptyDraft(trigger: 'restored' | 'availabilityChanged'): void;
		} = Object.assign(Object.create(ChatViewPane.prototype), {
			viewState: { sessionResource },
			_widget: widget,
			managedSettingsService: new NullManagedSettingsService(),
			// Restoring must not wait on account policy, which can need a network round trip.
			accountPolicyGateService: { gateInfo: { state: AccountPolicyGateState.Inactive }, onDidChangeGateInfo: Event.None, whenInitialized: () => new Promise<void>(() => { }) },
			configurationService,
			workspaceContextService: new TestContextService(),
			storageService: store.add(new TestStorageService()),
			chatSessionsService,
			agentHostEnablementService: { enabled: constObservable(true), managedSandboxEnforced: constObservable(false) },
			chatService: {
				transferredSessionResource: undefined,
				acquireOrLoadSession: async (): Promise<IChatModelReference> => ({ object: model, dispose: () => { events.disposed = true; } }),
			},
			showModel: async (_token: CancellationToken, modelRef: IChatModelReference | undefined) => {
				widget.viewModel = modelRef && { model: modelRef.object };
				whileShowing?.();
			},
			clear: async (draft?: IPortableChatDraft) => { events.cleared.push(draft); },
		});
		return { pane, events };
	}

	async function restore(sessionResource: URI, hasRequests: boolean, claudeDisabled: boolean) {
		const { pane, events } = createPane(sessionResource, hasRequests, { claudeDisabled });
		const { modelRef, draft } = await pane.acquireTransferredOrPersistedSession(CancellationToken.None, 'test');
		return { restored: !!modelRef, disposed: events.disposed, draft };
	}

	test('skips only an empty draft of the disabled harness and carries its unsent content', async () => {
		const draft = URI.from({ scheme: SessionType.AgentHostClaude, path: '/untitled-abc' });
		const saved = URI.from({ scheme: SessionType.AgentHostClaude, path: '/abc' });
		assert.deepStrictEqual({
			emptyDraft: await restore(draft, false, true),
			draftWithRequests: await restore(draft, true, true),
			savedChat: await restore(saved, false, true),
			allowedDraft: await restore(draft, false, false),
		}, {
			emptyDraft: { restored: false, disposed: true, draft: unsent },
			draftWithRequests: { restored: true, disposed: false, draft: undefined },
			savedChat: { restored: true, disposed: false, draft: undefined },
			allowedDraft: { restored: true, disposed: false, draft: undefined },
		});
	});

	test('replaces a restored draft when policy arrives after its model was acquired, without waiting for policy', async () => {
		const draft = URI.from({ scheme: SessionType.AgentHostClaude, path: '/untitled-abc' });

		// Policy settles while the restored draft is being shown.
		const showingPolicy = { claudeDisabled: false };
		const whileShowing = createPane(draft, false, showingPolicy, () => showingPolicy.claudeDisabled = true);
		await whileShowing.pane._applyModel(CancellationToken.None);

		// Policy arrives after the draft is shown, which withdraws the provider and changes availability.
		const shownPolicy = { claudeDisabled: false };
		const afterShown = createPane(draft, false, shownPolicy);
		await afterShown.pane._applyModel(CancellationToken.None);
		const beforePolicy = [...afterShown.events.cleared];
		shownPolicy.claudeDisabled = true;
		afterShown.pane.replaceUnusableEmptyDraft('availabilityChanged');

		assert.deepStrictEqual({
			whileShowing: whileShowing.events.cleared,
			afterShown: { beforePolicy, afterPolicy: afterShown.events.cleared },
		}, {
			whileShowing: [unsent],
			afterShown: { beforePolicy: [], afterPolicy: [unsent] },
		});
	});
});
