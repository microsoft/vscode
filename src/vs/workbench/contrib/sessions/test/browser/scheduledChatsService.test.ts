/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { parse } from '../../../../../base/common/marshalling.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IPickOptions, IQuickInputService, IQuickPickItem, QuickPickInput } from '../../../../../platform/quickinput/common/quickInput.js';
import { InMemoryStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { ChatInteractivity, IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IWorkingCopyService } from '../../../../services/workingCopy/common/workingCopyService.js';
import { IChatDraft } from '../../../chat/common/attachments/chatDraft.js';
import { ChatRequestVariableSet } from '../../../chat/common/attachments/chatVariableEntries.js';
import { ChatAttachmentModel } from '../../../chat/browser/attachments/chatAttachmentModel.js';
import { IChatWidget } from '../../../chat/browser/chat.js';
import { ChatInputPart } from '../../../chat/browser/widget/input/chatInputPart.js';
import { IChatViewModel } from '../../../chat/common/model/chatViewModel.js';
import { MockChatModel } from '../../../chat/test/common/model/mockChatModel.js';
import { IChatService } from '../../../chat/common/chatService/chatService.js';
import { IAutomationDescriptor, IAutomationRun } from '../../../chat/common/automations/automation.js';
import { AutomationMutationGuard, IAutomationService, ICreateAutomationOptions, IUpdateAutomationOptions } from '../../../chat/common/automations/automationService.js';
import { CHAT_AUTOMATIONS_ENABLED_SETTING } from '../../../chat/common/automations/automationsEnabled.js';
import { ScheduledChatsService } from '../../browser/scheduledChatsService.js';
import { ISessionsService } from '../../browser/sessionsService.js';
import { ISessionDraftsService } from '../../browser/sessionDraftsService.js';
import { ISessionGroupsService } from '../../browser/sessionGroupsService.js';
import { ISavedSessionDraftTarget } from '../../common/savedSessionDrafts.js';
import { ChatInputCanScheduleContext } from '../../common/contextkeys.js';
import { SESSIONS_DRAFTS_ENABLED_SETTING, SESSIONS_SEND_LATER_ENABLED_SETTING } from '../../common/sessionConfig.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../common/sessionsManagement.js';

suite('Scheduled chat handoffs', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const input: IChatDraft = { inputText: 'Review the changes', attachments: [] };
	const target: ISavedSessionDraftTarget = { providerId: 'local', sessionTypeId: 'copilot' };
	const session = new class extends mock<ISession>() {
		override readonly providerId = 'local';
		override readonly sessionType = 'copilot';
	};

	function create(sendLater = true, savedDrafts = true) {
		const storage = disposables.add(new InMemoryStorageService());
		const config = new TestConfigurationService({
			[SESSIONS_SEND_LATER_ENABLED_SETTING]: sendLater,
			[SESSIONS_DRAFTS_ENABLED_SETTING]: savedDrafts,
			[CHAT_AUTOMATIONS_ENABLED_SETTING]: true,
		});
		const calls: string[] = [];
		const requests: ICreateAutomationOptions[] = [];
		let failCreate = false;
		let failDelete = false;
		let publishBeforeFailure = false;
		let conflict = false;
		let occupied = false;
		let picks = 0;
		const automations = observableValue<readonly IAutomationDescriptor[]>('automations', []);
		const runs = observableValue<readonly IAutomationRun[]>('runs', []);
		const sessionsChanged = disposables.add(new Emitter<ISessionsChangeEvent>());
		const sessions = new Map<string, ISession>();
		const memberships = new Map<string, string>();
		const automationService = new class extends mock<IAutomationService>() {
			override readonly automations = automations;
			override readonly runs = runs;
			override readonly catalogueState = constObservable('ready' as const);
			override readonly availableProviders = constObservable([{ id: 'local', label: 'Local', supportsOneTimeAutomation: true, supportsExistingChatAutomation: true }]);
			override canCreateAutomation() { return true; }
			override canRunAutomation() { return true; }
			override async refresh() { calls.push('refresh'); }
			override async createAutomation(options: ICreateAutomationOptions, guard?: AutomationMutationGuard): Promise<IAutomationDescriptor> {
				guard?.();
				assert.ok(storage.get('sessions.scheduledChatHandoffs', StorageScope.PROFILE), 'The complete handoff must be durable before dispatch');
				requests.push(options);
				const definition: IAutomationDescriptor = { ...options, id: 'opaque:definition', enabled: options.enabled ?? true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
				if (!failCreate || publishBeforeFailure) {
					automations.set([definition], undefined);
				}
				if (failCreate) {
					throw new Error('Acknowledgement lost');
				}
				return definition;
			}
			override async updateAutomationIfUnchanged(id: string, patch: IUpdateAutomationOptions, expected: IAutomationDescriptor, guard?: AutomationMutationGuard) {
				guard?.();
				if (expected.purpose === 'scheduledChat' && !expected.enabled) {
					throw new Error('Cancelled scheduled chats cannot be updated');
				}
				calls.push('disable');
				if (conflict) {
					return { kind: 'conflict' as const, current: expected };
				}
				const updated = { ...expected, enabled: patch.enabled ?? expected.enabled };
				automations.set([updated], undefined);
				return { kind: 'updated' as const, automation: updated };
			}
			override async deleteAutomation() {
				calls.push('delete');
				if (failDelete) {
					throw new Error('Deletion failed');
				}
				automations.set([], undefined);
			}
		};
		const drafts = new class extends mock<ISessionDraftsService>() {
			override readonly enabled = constObservable(savedDrafts);
			override save(input: IChatDraft, target: ISavedSessionDraftTarget) {
				calls.push('save');
				return { id: 'recovery', revision: 'revision', input, target, createdAt: 0, updatedAt: 0 };
			}
			override async open() { calls.push('open'); }
			override async restoreRecovery() {
				calls.push('recover');
				if (occupied) {
					throw new Error('Composer occupied');
				}
			}
		};
		const quickInput = new class extends mock<IQuickInputService>() {
			override pick<T extends IQuickPickItem>(items: QuickPickInput<T>[] | Promise<QuickPickInput<T>[]>, options?: IPickOptions<T> & { canPickMany: true }): Promise<T[] | undefined>;
			override pick<T extends IQuickPickItem>(items: QuickPickInput<T>[] | Promise<QuickPickInput<T>[]>, options?: IPickOptions<T> & { canPickMany: false }): Promise<T | undefined>;
			override pick<T extends IQuickPickItem>(items: QuickPickInput<T>[] | Promise<QuickPickInput<T>[]>, options?: Omit<IPickOptions<T>, 'canPickMany'>): Promise<T | undefined>;
			override async pick<T extends IQuickPickItem>(items: QuickPickInput<T>[] | Promise<QuickPickInput<T>[]>, options?: IPickOptions<T>): Promise<T | T[] | undefined> {
				picks++;
				const item = (await items).find((item): item is T => item.type !== 'separator');
				return options?.canPickMany ? item && [item] : item;
			}
		};
		const service = disposables.add(new ScheduledChatsService(config, automationService,
			new class extends mock<ISessionsManagementService>() {
				override readonly onDidChangeSessions = sessionsChanged.event;
				override getSession(resource: URI) { return sessions.get(resource.toString()); }
				override async getAutomationSessionConfiguration() { return { sessionTemplate: { modelId: 'chosen-model', config: { permission: 'default' } } }; }
			}, drafts,
			new class extends mock<IChatEntitlementService>() {
				override readonly sentiment = {};
				override readonly onDidChangeSentiment = Event.None;
			}, quickInput, new TestDialogService({ confirmed: true }), storage,
			new class extends mock<ITextModelService>() { }, new class extends mock<IFileService>() { },
			new class extends mock<IWorkingCopyService>() { override isDirty() { return false; } },
			new class extends mock<IChatService>() { }, new class extends mock<ISessionsService>() { },
			new class extends mock<ISessionGroupsService>() {
				override getGroup(id: string) { return { id, name: 'Group', createdAt: 0 }; }
				override getGroupOfSession(id: string) { return memberships.get(id); }
				override addToGroup(ids: string | Iterable<string>, groupId: string) {
					for (const id of typeof ids === 'string' ? [ids] : ids) {
						memberships.set(id, groupId);
						calls.push('group');
					}
				}
			}));
		return {
			service, storage, config, calls, requests, automations, runs, sessions, sessionsChanged, memberships,
			get picks() { return picks; },
			set failCreate(value: boolean) { failCreate = value; },
			set failDelete(value: boolean) { failDelete = value; },
			set publishBeforeFailure(value: boolean) { publishBeforeFailure = value; },
			set conflict(value: boolean) { conflict = value; },
			set occupied(value: boolean) { occupied = value; },
		};
	}

	function registerInput(service: ScheduledChatsService) {
		const resource = URI.parse('agent-host-copilot:/session/non-main');
		const interactivity = observableValue('interactivity', ChatInteractivity.Full);
		const chat = upcastPartial<IChat>({ resource, interactivity, isArchived: constObservable(false) });
		const currentSession = upcastPartial<ISession>({
			resource: URI.parse('agent-host-copilot:/session'), providerId: 'local', sessionType: 'copilot',
			status: constObservable(SessionStatus.Completed), chats: constObservable([chat]),
			isArchived: constObservable(false), workspace: constObservable(undefined), isQuickChat: constObservable(true),
			environment: 'local', harness: 'copilot', application: constObservable({ id: 'vscode', label: 'VS Code' }),
		});
		const model = disposables.add(new MockChatModel(resource));
		let text = input.inputText;
		let enabled = true;
		const context = disposables.add(new MockContextKeyService());
		const widget = upcastPartial<IChatWidget>({
			scopedContextKeyService: context,
			viewModel: upcastPartial<IChatViewModel>({ model, sessionResource: resource }),
			getInput: () => text,
			setInput: value => { text = value ?? ''; },
			getContrib: () => undefined,
			attachmentModel: upcastPartial<ChatAttachmentModel>({ clearAndSetContext: () => { } }),
			input: upcastPartial<ChatInputPart>({
				getAttachedContext: () => new ChatRequestVariableSet(),
				setInputEnabled: value => { enabled = value; },
			}),
		});
		disposables.add(service.registerChatInput(widget, constObservable(currentSession), constObservable(resource), constObservable(true)));
		return { widget, context, interactivity, get text() { return text; }, get enabled() { return enabled; } };
	}

	test('draft and send-later gates are independent in all four combinations', () => {
		assert.deepStrictEqual([false, true].flatMap(sendLater => [false, true].map(savedDrafts => {
			const { service } = create(sendLater, savedDrafts);
			return service.canSchedule(session);
		})), [false, false, true, true]);
	});

	test('an existing chat clears only after acceptance, retains rejected input, and blocks an uncertain ordinary send', async () => {
		const fixture = create();
		const source = registerInput(fixture.service);
		fixture.failCreate = true;
		await assert.rejects(() => fixture.service.scheduleChatInput(source.widget), /Acknowledgement lost/);
		const retained = { text: source.text, enabled: source.enabled };
		assert.throws(() => fixture.service.assertChatInputUnscheduled(source.widget, source.text), /being scheduled/);
		fixture.failCreate = false;
		await fixture.service.scheduleChatInput(source.widget);
		assert.deepStrictEqual({ retained, text: source.text, enabled: source.enabled, picks: fixture.picks }, {
			retained: { text: input.inputText, enabled: true }, text: '', enabled: true, picks: 1,
		});
	});

	test('existing chat availability follows interactivity and live setting changes, including stale commands', async () => {
		const fixture = create();
		const source = registerInput(fixture.service);
		source.interactivity.set(ChatInteractivity.ReadOnly, undefined);
		const readOnly = source.context.getContextKeyValue(ChatInputCanScheduleContext.key);
		await assert.rejects(() => fixture.service.scheduleChatInput(source.widget), /not available/);
		source.interactivity.set(ChatInteractivity.Full, undefined);
		await fixture.config.setUserConfiguration(SESSIONS_SEND_LATER_ENABLED_SETTING, false);
		fixture.config.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: key => key === SESSIONS_SEND_LATER_ENABLED_SETTING, affectedKeys: new Set([SESSIONS_SEND_LATER_ENABLED_SETTING]), source: 1, change: { keys: [SESSIONS_SEND_LATER_ENABLED_SETTING], overrides: [] } });
		await assert.rejects(() => fixture.service.scheduleChatInput(source.widget), /not available/);
		assert.deepStrictEqual({ readOnly, disabled: source.context.getContextKeyValue(ChatInputCanScheduleContext.key), requests: fixture.requests.length, text: source.text }, {
			readOnly: false, disabled: false, requests: 0, text: input.inputText,
		});
	});

	test('persists immutable input and configuration before accepting a schedule', async () => {
		const fixture = create();
		await fixture.service.schedule(input, target, session, 'composition');
		const request = fixture.requests[0];
		const stored = parse(fixture.storage.get('sessions.scheduledChatHandoffs', StorageScope.PROFILE)!);
		assert.deepStrictEqual({
			prompt: request.request?.text, model: request.sessionTemplate?.modelId,
			schedule: stored.handoffs[0].schedule, accepted: stored.handoffs[0].automationId,
			creationId: stored.handoffs[0].id, picks: fixture.picks,
		}, { prompt: input.inputText, model: 'chosen-model', schedule: request.schedule, accepted: 'opaque:definition', creationId: request.creationId, picks: 1 });
	});

	test('lost acknowledgements replay the same identity, time and captured message without asking for a new time', async () => {
		const fixture = create();
		fixture.failCreate = true;
		await assert.rejects(() => fixture.service.schedule(input, target, session, 'composition'), /Acknowledgement lost/);
		assert.throws(() => fixture.service.assertUnscheduled('composition', input), /scheduling handoff/);
		fixture.failCreate = false;
		await fixture.service.schedule(input, target, session, 'composition');
		assert.deepStrictEqual({ requests: fixture.requests, picks: fixture.picks }, { requests: [fixture.requests[0], fixture.requests[0]], picks: 1 });
	});

	test('reconciliation recognizes an accepted definition without another create', async () => {
		const fixture = create();
		fixture.failCreate = true;
		fixture.publishBeforeFailure = true;
		await assert.rejects(() => fixture.service.schedule(input, target, session, 'composition'), /Acknowledgement lost/);
		await fixture.service.schedule(input, target, session, 'composition');
		assert.deepStrictEqual({ creates: fixture.requests.length, pending: fixture.service.hasPendingHandoff('composition', input) }, { creates: 1, pending: false });
	});

	test('a follow-up keeps the exact non-main chat and does not capture or reapply a session template', async () => {
		const fixture = create();
		const conversation = { sessionResource: URI.parse('agent-host-copilot:/session'), chatResource: URI.parse('agent-host-copilot:/opaque-secondary-chat') };
		await fixture.service.schedule(input, target, session, 'follow-up', conversation);
		assert.deepStrictEqual({
			conversation: fixture.requests[0].conversation,
			template: fixture.requests[0].sessionTemplate,
			request: fixture.requests[0].request,
		}, { conversation, template: undefined, request: { text: input.inputText, origin: { kind: 'user' } } });
	});

	test('identical input in another conversation does not reconcile the wrong handoff', async () => {
		const fixture = create();
		const conversation = { sessionResource: URI.parse('agent-host-copilot:/session'), chatResource: URI.parse('agent-host-copilot:/first') };
		fixture.failCreate = true;
		await assert.rejects(() => fixture.service.schedule(input, target, session, 'first', conversation), /Acknowledgement lost/);
		fixture.failCreate = false;
		const other = { ...conversation, chatResource: URI.parse('agent-host-copilot:/second') };
		await fixture.service.schedule(input, target, session, 'second', other);
		assert.deepStrictEqual({ targets: fixture.requests.map(request => request.conversation), picks: fixture.picks }, { targets: [conversation, other], picks: 2 });
	});

	test('cancellation conflicts never release editable content; confirmed cancellation saves before deletion', async () => {
		const fixture = create();
		await fixture.service.schedule(input, target, session, 'composition');
		const action = fixture.service.sections.get()[0].items[0].actions.find(action => action.id === 'sessions.scheduled.edit')!;
		fixture.conflict = true;
		await assert.rejects(async () => action.run(), /changed or has started/);
		const conflictCalls = [...fixture.calls];
		fixture.conflict = false;
		await action.run();
		assert.deepStrictEqual({ conflictCalls, successCalls: fixture.calls.slice(conflictCalls.length) }, { conflictCalls: ['disable'], successCalls: ['disable', 'save', 'delete', 'open'] });
		assert.doesNotThrow(() => fixture.service.assertUnscheduled('composition', input));
	});

	test('with saved drafts disabled an occupied composer leaves cancelled content recoverable', async () => {
		const fixture = create(true, false);
		await fixture.service.schedule(input, target, session, 'composition');
		fixture.occupied = true;
		await assert.rejects(async () => fixture.service.sections.get()[0].items[0].actions.find(action => action.id === 'sessions.scheduled.edit')!.run(), /Composer occupied/);
		assert.deepStrictEqual({
			calls: fixture.calls, enabled: fixture.automations.get()[0].enabled,
			retained: !!fixture.storage.get('sessions.scheduledChatHandoffs', StorageScope.PROFILE),
		}, { calls: ['disable', 'recover'], enabled: false, retained: true });
		fixture.occupied = false;
		await fixture.service.sections.get()[0].items[0].actions.find(action => action.id === 'sessions.scheduled.edit')!.run();
		assert.deepStrictEqual({ calls: fixture.calls, remaining: fixture.service.sections.get() }, {
			calls: ['disable', 'recover', 'recover', 'delete'], remaining: [],
		});
	});

	test('durable dispatch confirmation hides a consumed schedule even after run history eviction', async () => {
		const fixture = create();
		await fixture.service.schedule(input, target, session, 'composition');
		fixture.automations.set([{ ...fixture.automations.get()[0], oneTimeRunId: 'opaque:run', oneTimeDispatchedAt: new Date().toISOString() }], undefined);
		assert.deepStrictEqual(fixture.service.sections.get(), []);
	});

	test('only a positively rejected dispatch allows consumed-request recovery', async () => {
		const fixture = create();
		await fixture.service.schedule(input, target, session, 'composition');
		const claimed = { ...fixture.automations.get()[0], oneTimeRunId: 'run' };
		fixture.automations.set([claimed], undefined);
		const uncertain = fixture.service.sections.get()[0].items[0].actions.find(action => action.id === 'sessions.scheduled.edit')!.enabled;
		fixture.automations.set([{ ...claimed, oneTimeDispatchRejectedAt: new Date().toISOString() }], undefined);
		await fixture.service.sections.get()[0].items[0].actions.find(action => action.id === 'sessions.scheduled.edit')!.run();
		assert.deepStrictEqual({ uncertain, calls: fixture.calls, claimed: [...fixture.service.claimedDraftIds.get()] }, {
			uncertain: false, calls: ['save', 'delete', 'open'], claimed: [],
		});
	});

	test('unresolved conversations remain read-only, including stale action invocations', async () => {
		const fixture = create();
		await fixture.service.schedule(input, target, session, 'composition');
		fixture.automations.set([{ ...fixture.automations.get()[0], readOnlyReason: 'Original conversation unavailable' }], undefined);
		const item = fixture.service.sections.get()[0].items[0];
		const edit = item.actions.find(action => action.id === 'sessions.scheduled.edit')!;
		await assert.rejects(async () => edit.run(), /Original conversation unavailable/);
		assert.deepStrictEqual({ enabled: item.actions.map(action => action.enabled), calls: fixture.calls }, {
			enabled: [true, false, false, false, false], calls: [],
		});
	});

	test('retrying failed deletion does not overwrite recovered draft edits', async () => {
		const fixture = create();
		await fixture.service.schedule(input, target, session, 'composition');
		fixture.failDelete = true;
		await assert.rejects(async () => fixture.service.sections.get()[0].items[0].actions.find(action => action.id === 'sessions.scheduled.edit')!.run(), /Deletion failed/);
		fixture.failDelete = false;
		await fixture.service.sections.get()[0].items[0].actions.find(action => action.id === 'sessions.scheduled.edit')!.run();
		assert.deepStrictEqual(fixture.calls, ['disable', 'save', 'delete', 'delete', 'open']);
	});

	test('sidebar reconciliation keeps the original chat input guarded until it is released', async () => {
		const fixture = create();
		const source = registerInput(fixture.service);
		fixture.failCreate = true;
		await assert.rejects(() => fixture.service.scheduleChatInput(source.widget), /Acknowledgement lost/);
		fixture.failCreate = false;
		await fixture.service.sections.get()[0].items[0].open();
		assert.throws(() => fixture.service.assertChatInputUnscheduled(source.widget, source.text), /being scheduled/);
		await fixture.service.scheduleChatInput(source.widget);
		assert.deepStrictEqual({ input: source.text, requests: fixture.requests.length, picks: fixture.picks }, {
			input: '', requests: 2, picks: 1,
		});
	});

	test('newly dispatched sessions inherit the captured group without later overriding user moves', async () => {
		const fixture = create();
		await fixture.service.schedule(input, { ...target, groupId: 'chosen-group' }, session, 'composition');
		const resource = URI.parse('agent-host-copilot:/created');
		const created = upcastPartial<ISession>({ resource, sessionId: 'created' });
		fixture.runs.set([{
			id: 'run', automationId: fixture.automations.get()[0].id, status: 'running', trigger: 'schedule',
			startedAt: new Date().toISOString(), sessionResource: resource,
		}], undefined);
		fixture.automations.set([{ ...fixture.automations.get()[0], oneTimeRunId: 'run', oneTimeDispatchedAt: new Date().toISOString() }], undefined);
		fixture.sessions.set(resource.toString(), created);
		fixture.sessionsChanged.fire({ added: [created], removed: [], changed: [] });
		const inherited = fixture.memberships.get('created');
		fixture.memberships.set('created', 'user-moved');
		fixture.runs.set([...fixture.runs.get()], undefined);
		assert.deepStrictEqual({ inherited, current: fixture.memberships.get('created'), calls: fixture.calls }, {
			inherited: 'chosen-group', current: 'user-moved', calls: ['group'],
		});
	});
});
