/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { parse } from '../../../../../base/common/marshalling.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IInputOptions, IPickOptions, IQuickInputService, IQuickPickItem, QuickPickInput } from '../../../../../platform/quickinput/common/quickInput.js';
import { InMemoryStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { ChatInteractivity, IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IWorkingCopyService } from '../../../../services/workingCopy/common/workingCopyService.js';
import { IChatDraft } from '../../../chat/common/attachments/chatDraft.js';
import { ChatRequestVariableSet } from '../../../chat/common/attachments/chatVariableEntries.js';
import { ChatAttachmentModel } from '../../../chat/browser/attachments/chatAttachmentModel.js';
import { IChatWidget } from '../../../chat/browser/chat.js';
import { ChatInputPart } from '../../../chat/browser/widget/input/chatInputPart.js';
import { IChatScheduledRequest, IChatViewModel } from '../../../chat/common/model/chatViewModel.js';
import { IChatModel, IChatModelInputState } from '../../../chat/common/model/chatModel.js';
import { MockChatModel } from '../../../chat/test/common/model/mockChatModel.js';
import { IChatService } from '../../../chat/common/chatService/chatService.js';
import { IAutomationDescriptor, IAutomationRun } from '../../../chat/common/automations/automation.js';
import { AutomationMutationGuard, IAutomationService, ICreateAutomationOptions, IUpdateAutomationOptions } from '../../../chat/common/automations/automationService.js';
import { CHAT_AUTOMATIONS_ENABLED_SETTING } from '../../../chat/common/automations/automationsEnabled.js';
import { IScheduledChatRequestOptions, ScheduledChatsService } from '../../browser/scheduledChatsService.js';
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

	function create(sendLater = true, savedDrafts = true, pickerWait?: Promise<void>, existingStorage?: InMemoryStorageService) {
		const storage = existingStorage ?? disposables.add(new InMemoryStorageService());
		const config = new TestConfigurationService({
			[SESSIONS_SEND_LATER_ENABLED_SETTING]: sendLater,
			[SESSIONS_DRAFTS_ENABLED_SETTING]: savedDrafts,
			[CHAT_AUTOMATIONS_ENABLED_SETTING]: true,
		});
		const calls: string[] = [];
		const openedDrafts: Parameters<ISessionDraftsService['open']>[] = [];
		const loadedChats: URI[] = [];
		const openedChats: URI[] = [];
		const recoveredInputs: Parameters<IChatModel['inputModel']['setState']>[0][] = [];
		const requests: ICreateAutomationOptions[] = [];
		let failCreate = false;
		let failDelete = false;
		let publishBeforeFailure = false;
		let conflict = false;
		let occupied = false;
		let picks = 0;
		let customTime = false;
		const pickerAnchors: Pick<IPickOptions<IQuickPickItem>, 'anchor' | 'anchorPosition'>[] = [];
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
			override getAutomation(id: string) { return automations.get().find(automation => automation.id === id); }
			override async refresh() { calls.push('refresh'); }
			override async createAutomation(options: ICreateAutomationOptions, guard?: AutomationMutationGuard): Promise<IAutomationDescriptor> {
				guard?.();
				assert.ok(storage.get('sessions.scheduledChatHandoffs', StorageScope.PROFILE), 'The complete handoff must be durable before dispatch');
				const { onWillCreate, ...request } = options;
				onWillCreate?.('opaque:definition');
				requests.push(request);
				assert.strictEqual(JSON.parse(storage.get('sessions.scheduledChatHandoffs', StorageScope.PROFILE)!).handoffs.at(-1).requestedAutomationId, 'opaque:definition');
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
				calls.push(patch.enabled === false ? 'disable' : 'update');
				if (conflict) {
					return { kind: 'conflict' as const, current: expected };
				}
				const updated = {
					...expected, enabled: patch.enabled ?? expected.enabled,
					name: patch.name ?? expected.name, prompt: patch.prompt ?? expected.prompt,
					request: patch.request ?? expected.request, schedule: patch.schedule ?? expected.schedule,
				};
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
			override async open(...args: Parameters<ISessionDraftsService['open']>) {
				calls.push('open');
				openedDrafts.push(args);
			}
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
				pickerAnchors.push({ anchor: options?.anchor, anchorPosition: options?.anchorPosition });
				await pickerWait;
				const choices = (await items).filter((item): item is T => item.type !== 'separator');
				const item = customTime ? choices.at(-1) : choices[0];
				return options?.canPickMany ? item && [item] : item;
			}
			override async input(options?: IInputOptions) {
				pickerAnchors.push({ anchor: options?.anchor, anchorPosition: options?.anchorPosition });
				return '2099-01-15 09:30';
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
			}, quickInput, new class extends TestDialogService {
				override async confirm(): Promise<never> { throw new Error('Scheduling must not open a confirmation dialog'); }
			}(), storage,
			new class extends mock<ITextModelService>() { }, new class extends mock<IFileService>() { },
			new class extends mock<IWorkingCopyService>() { override isDirty() { return false; } },
			new class extends mock<IChatService>() {
				override async acquireOrLoadSession(resource: URI) {
					calls.push('load');
					loadedChats.push(resource);
					return {
						object: upcastPartial<IChatModel>({
							inputModel: upcastPartial<IChatModel['inputModel']>({
								state: constObservable<IChatModelInputState | undefined>(occupied ? {
									inputText: 'already typing', attachments: [], contrib: {},
									mode: { id: 'agent', kind: undefined }, selectedModel: undefined, selections: [],
								} : undefined),
								setState: state => { calls.push('restore'); recoveredInputs.push(state); },
							}),
						}),
						dispose: () => { calls.push('release'); },
					};
				}
			}, new class extends mock<ISessionsService>() {
				override async openChat(_session: ISession, resource: URI) {
					calls.push('openChat');
					openedChats.push(resource);
				}
			},
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
			service, storage, config, calls, openedDrafts, loadedChats, openedChats, recoveredInputs, requests, automations, runs, sessions, sessionsChanged, memberships, pickerAnchors,
			set customTime(value: boolean) { customTime = value; },
			get picks() { return picks; },
			set failCreate(value: boolean) { failCreate = value; },
			set failDelete(value: boolean) { failDelete = value; },
			set publishBeforeFailure(value: boolean) { publishBeforeFailure = value; },
			set conflict(value: boolean) { conflict = value; },
			set occupied(value: boolean) { occupied = value; },
		};
	}

	function registerInput(service: ScheduledChatsService, resource = URI.parse('agent-host-copilot:/session/non-main'), sessionResource = URI.parse('agent-host-copilot:/session')) {
		const interactivity = observableValue('interactivity', ChatInteractivity.Full);
		const chat = upcastPartial<IChat>({ resource, interactivity, isArchived: constObservable(false) });
		const currentSession = upcastPartial<ISession>({
			resource: sessionResource, providerId: 'local', sessionType: 'copilot',
			status: constObservable(SessionStatus.Completed), chats: constObservable([chat]),
			isArchived: constObservable(false), workspace: constObservable(undefined), isQuickChat: constObservable(true),
			environment: 'local', harness: 'copilot', application: constObservable({ id: 'vscode', label: 'VS Code' }),
		});
		const model = disposables.add(new MockChatModel(resource));
		let text = input.inputText;
		let enabled = true;
		let scheduled: readonly IChatScheduledRequest[] = [];
		const context = disposables.add(new MockContextKeyService());
		const anchor = $('div');
		const widget = upcastPartial<IChatWidget>({
			scopedContextKeyService: context,
			onDidChangeViewModel: Event.None,
			viewModel: upcastPartial<IChatViewModel>({ model, sessionResource: resource, setScheduledRequests: requests => { scheduled = requests; } }),
			getInput: () => text,
			setInput: value => { text = value ?? ''; },
			getContrib: () => undefined,
			attachmentModel: upcastPartial<ChatAttachmentModel>({ clearAndSetContext: () => { } }),
			input: upcastPartial<ChatInputPart>({
				executeToolbarElement: anchor,
				getAttachedContext: () => new ChatRequestVariableSet(),
				setInputEnabled: value => { enabled = value; },
			}),
		});
		disposables.add(service.registerChatInput(widget, constObservable(currentSession), constObservable(resource), constObservable(true)));
		return { widget, context, interactivity, resource, anchor, get scheduled() { return scheduled; }, get text() { return text; }, get enabled() { return enabled; } };
	}

	for (const existingChat of [false, true]) {
		test(`anchors the time picker and custom input above the send controls (existing chat: ${existingChat})`, async () => {
			const fixture = create();
			fixture.customTime = true;
			const source = registerInput(fixture.service);
			if (existingChat) {
				await fixture.service.scheduleChatInput(source.widget);
			} else {
				await fixture.service.schedule(input, target, session, 'new-composition', undefined, source.anchor);
			}
			assert.deepStrictEqual(fixture.pickerAnchors, [
				{ anchor: source.anchor, anchorPosition: 'above' },
				{ anchor: source.anchor, anchorPosition: 'above' },
			]);
		});
	}

	test('opening the time picker retains dropdown availability but prevents duplicate scheduling', async () => {
		const picker = new DeferredPromise<void>();
		const fixture = create(true, true, picker.p);
		const source = registerInput(fixture.service);
		const scheduling = fixture.service.scheduleChatInput(source.widget);
		const during = { available: source.context.getContextKeyValue(ChatInputCanScheduleContext.key), inputEnabled: source.enabled };
		await assert.rejects(() => fixture.service.scheduleChatInput(source.widget), /not available/);
		picker.complete();
		await scheduling;
		assert.deepStrictEqual({ during, picks: fixture.picks, inputEnabled: source.enabled }, {
			during: { available: true, inputEnabled: false }, picks: 1, inputEnabled: true,
		});
	});

	test('rescheduling anchors both time pickers above the scheduled message', async () => {
		const fixture = create();
		const source = registerInput(fixture.service);
		await fixture.service.scheduleChatInput(source.widget);
		fixture.customTime = true;
		const anchor = $('div.rendered-markdown');
		await source.scheduled[0].actions.find(action => action.id === 'sessions.scheduled.reschedule')!.run(anchor);
		assert.deepStrictEqual({
			anchors: fixture.pickerAnchors.slice(1),
			runAt: fixture.automations.get()[0].schedule.runAt,
		}, {
			anchors: [{ anchor, anchorPosition: 'above' }, { anchor, anchorPosition: 'above' }],
			runAt: new Date(2099, 0, 15, 9, 30).toISOString(),
		});
	});

	test('scheduled messages belong only to their exact session and chat, and disappear after dispatch', async () => {
		const fixture = create();
		const source = registerInput(fixture.service);
		const otherChat = registerInput(fixture.service, URI.parse('agent-host-copilot:/session/other'));
		const otherSession = registerInput(fixture.service, source.resource, URI.parse('agent-host-copilot:/other-session'));
		await fixture.service.scheduleChatInput(source.widget);
		const before = [source, otherChat, otherSession].map(input => input.scheduled.map(request => request.text));
		fixture.automations.set([{ ...fixture.automations.get()[0], oneTimeDispatchedAt: new Date().toISOString() }], undefined);
		assert.deepStrictEqual({ before, after: source.scheduled }, { before: [[input.inputText], [], []], after: [] });
	});

	test('draft and send-later gates are independent in all four combinations', () => {
		assert.deepStrictEqual([false, true].flatMap(sendLater => [false, true].map(savedDrafts => {
			const { service } = create(sendLater, savedDrafts);
			return service.canSchedule(session);
		})), [false, false, true, true]);
	});

	test('scheduled conversation messages offer Edit and inline management actions, not draft or preview actions', async () => {
		const fixture = create();
		const conversation = { sessionResource: URI.parse('agent-host-copilot:/session'), chatResource: URI.parse('agent-host-copilot:/session/secondary') };
		fixture.sessions.set(conversation.sessionResource.toString(), session);
		await fixture.service.schedule(input, target, session, 'composition', conversation);
		// Older descriptors can omit the conversation; the durable handoff still identifies it.
		fixture.automations.set([{ ...fixture.automations.get()[0], conversation: undefined }], undefined);
		const item = fixture.service.items.get()[0];
		await item.editAction!.run();
		const editing = fixture.service.items.get()[0].editing!;
		assert.deepStrictEqual({
			actions: item.actions.map(action => ({ label: action.label, hasIcon: !!action.class })),
			editIsShared: item.editAction === item.actions[0],
			calls: fixture.calls, loadedChats: fixture.loadedChats, openedChats: fixture.openedChats,
			input: fixture.recoveredInputs.map(input => input.inputText), editingText: editing.text,
			enabled: fixture.automations.get()[0].enabled,
		}, {
			actions: ['Edit', 'Send Now', 'Reschedule...', 'Cancel Schedule'].map(label => ({ label, hasIcon: true })),
			editIsShared: true, calls: [], loadedChats: [], openedChats: [],
			input: [], editingText: input.inputText, enabled: true,
		});
	});

	test('scheduled conversation edits update text and send time without occupying the chat input', async () => {
		const fixture = create();
		const conversation = { sessionResource: URI.parse('agent-host-copilot:/session'), chatResource: URI.parse('agent-host-copilot:/session/secondary') };
		fixture.sessions.set(conversation.sessionResource.toString(), session);
		await fixture.service.schedule(input, target, session, 'composition', conversation);
		fixture.occupied = true;
		await fixture.service.items.get()[0].editAction!.run();
		const editing = fixture.service.items.get()[0].editing!;
		editing.text = 'Changed scheduled message';
		fixture.customTime = true;
		const anchor = $('button');
		await editing.selectTime.run(anchor);
		await editing.save();
		const updated = fixture.automations.get()[0];
		assert.deepStrictEqual({
			text: updated.request?.text, prompt: updated.prompt, enabled: updated.enabled,
			runAt: updated.schedule.runAt, calls: fixture.calls, recoveredInputs: fixture.recoveredInputs,
			editing: fixture.service.items.get()[0].editing,
			anchors: fixture.pickerAnchors.slice(1).map(options => options.anchor === anchor && options.anchorPosition === 'above'),
			recoveryText: parse(fixture.storage.get('sessions.scheduledChatHandoffs', StorageScope.PROFILE)!).handoffs[0].input.inputText,
		}, {
			text: 'Changed scheduled message', prompt: 'Changed scheduled message', enabled: true,
			runAt: new Date(2099, 0, 15, 9, 30).toISOString(), calls: ['update'], recoveredInputs: [],
			editing: undefined, anchors: [true, true], recoveryText: 'Changed scheduled message',
		});
	});

	test('scheduled conversation edit conflicts preserve edits and cancellation keeps the original schedule', async () => {
		const fixture = create();
		const conversation = { sessionResource: URI.parse('agent-host-copilot:/session'), chatResource: URI.parse('agent-host-copilot:/session/secondary') };
		await fixture.service.schedule(input, target, session, 'composition', conversation);
		const original = fixture.automations.get()[0];
		await fixture.service.items.get()[0].editAction!.run();
		const editing = fixture.service.items.get()[0].editing!;
		editing.text = 'Unsaved change';
		fixture.conflict = true;
		await assert.rejects(() => editing.save(), /changed or has started/);
		const retainedText = fixture.service.items.get()[0].editing?.text;
		editing.cancel();
		assert.deepStrictEqual({
			retainedText, editing: fixture.service.items.get()[0].editing,
			unchanged: fixture.automations.get()[0] === original, calls: fixture.calls,
		}, {
			retainedText: 'Unsaved change', editing: undefined, unchanged: true, calls: ['update'],
		});
	});

	test('scheduled conversation edits keep attachments and clear stale inline ranges, including attachment-only edits', async () => {
		for (const text of ['Changed text', '']) {
			const fixture = create();
			const resource = URI.file('/workspace/notes.txt');
			const attached: IChatDraft = {
				inputText: '#notes Review this',
				attachments: [{ kind: 'file', id: 'notes', name: 'notes.txt', value: resource, range: { start: 0, endExclusive: 6 } }],
				references: [{ id: 'notes', data: resource, range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 7 } }],
			};
			const conversation = { sessionResource: URI.parse('agent-host-copilot:/session'), chatResource: URI.parse('agent-host-copilot:/session/secondary') };
			await fixture.service.schedule(attached, target, session, 'composition', conversation);
			// Older descriptors rely on the durable handoff for captured attachments.
			fixture.automations.set([{ ...fixture.automations.get()[0], request: undefined }], undefined);
			await fixture.service.items.get()[0].editAction!.run();
			const editing = fixture.service.items.get()[0].editing!;
			editing.text = text;
			await editing.save();
			const stored = parse(fixture.storage.get('sessions.scheduledChatHandoffs', StorageScope.PROFILE)!).handoffs[0];
			assert.deepStrictEqual({
				request: fixture.automations.get()[0].request,
				recovery: stored.input, durableRequest: stored.request,
			}, {
				request: { text, origin: { kind: 'user' }, attachments: [{ type: 'resource', label: 'notes.txt', uri: resource.toString(), displayKind: 'document', range: undefined }] },
				recovery: { inputText: text, attachments: [{ kind: 'file', id: 'notes', name: 'notes.txt', value: resource }], references: [] },
				durableRequest: { text, origin: { kind: 'user' }, attachments: [{ type: 'resource', label: 'notes.txt', uri: resource.toString(), displayKind: 'document' }] },
			});
		}
	});

	test('scheduled edits add and remove context without recapturing retained snapshots', async () => {
		const fixture = create();
		const conversation = { sessionResource: URI.parse('agent-host-copilot:/session'), chatResource: URI.parse('agent-host-copilot:/session/secondary') };
		const attached: IChatDraft = {
			inputText: 'Review context',
			attachments: [
				{ kind: 'string', id: 'keep', name: 'Snapshot', value: 'captured content', uri: URI.file('/workspace/snapshot'), handle: 1 },
				{ kind: 'string', id: 'remove', name: 'Removed', value: 'remove this', uri: URI.file('/workspace/removed'), handle: 2 },
			],
		};
		await fixture.service.schedule(attached, target, session, 'composition', conversation);
		await fixture.service.items.get()[0].editAction!.run();
		const editing = fixture.service.items.get()[0].editing!;
		editing.input = {
			inputText: attached.inputText,
			attachments: [
				{ kind: 'string', id: 'keep', name: 'Snapshot', value: 'changed since scheduling', uri: URI.file('/workspace/snapshot'), handle: 1 },
				{ kind: 'string', id: 'new', name: 'Added', value: 'new content', uri: URI.file('/workspace/added'), handle: 3 },
			],
		};
		await editing.save();
		assert.deepStrictEqual({
			attachments: fixture.automations.get()[0].request?.attachments,
			recoveryIds: parse(fixture.storage.get('sessions.scheduledChatHandoffs', StorageScope.PROFILE)!).handoffs[0].input.attachments.map((entry: { id: string }) => entry.id),
			saving: editing.isSaving?.get(),
		}, {
			attachments: [
				{ type: 'simple', label: 'Snapshot', modelRepresentation: 'captured content' },
				{ type: 'simple', label: 'Added', modelRepresentation: 'new content' },
			],
			recoveryIds: ['keep', 'new'], saving: false,
		});
	});

	test('scheduled edits without a local recovery copy keep captured context when adding attachments', async () => {
		const fixture = create();
		const conversation = { sessionResource: URI.parse('agent-host-copilot:/session'), chatResource: URI.parse('agent-host-copilot:/session/secondary') };
		await fixture.service.schedule({
			inputText: 'Review',
			attachments: [{ kind: 'string', id: 'original', name: 'Snapshot', value: 'original content', uri: URI.file('/workspace/snapshot'), handle: 1 }],
		}, target, session, 'composition', conversation);
		fixture.storage.remove('sessions.scheduledChatHandoffs', StorageScope.PROFILE);
		await fixture.service.items.get()[0].editAction!.run();
		const editing = fixture.service.items.get()[0].editing!;
		editing.input = { inputText: 'Review', attachments: [{ kind: 'string', id: 'new', name: 'Added', value: 'new content', uri: URI.file('/workspace/added'), handle: 2 }] };
		await editing.save();
		assert.deepStrictEqual(fixture.automations.get()[0].request?.attachments, [
			{ type: 'simple', label: 'Snapshot', modelRepresentation: 'original content' },
			{ type: 'simple', label: 'Added', modelRepresentation: 'new content' },
		]);
	});

	test('expired scheduled conversation edits retain unsaved text without changing the schedule', async () => {
		const fixture = create();
		const source = registerInput(fixture.service);
		await fixture.service.scheduleChatInput(source.widget);
		const original = fixture.automations.get()[0];
		await source.scheduled[0].editAction!.run();
		const editing = source.scheduled[0].editing!;
		editing.text = 'Keep this edit';
		editing.runAt = '2000-01-01T00:00:00Z';
		await assert.rejects(() => editing.save(), /future send time/);
		assert.deepStrictEqual({
			text: source.scheduled[0].editing?.text, unchanged: fixture.automations.get()[0] === original, calls: fixture.calls,
		}, { text: 'Keep this edit', unchanged: true, calls: [] });
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

	function toolRequest(conversation?: IAutomationDescriptor['conversation']): IScheduledChatRequestOptions {
		return {
			name: 'Check build', prompt: input.inputText,
			schedule: { interval: 'once', runAt: '2099-01-01T10:00:00.000Z', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			target: { kind: 'quickChat', providerId: 'local', sessionTypeId: 'copilot' },
			conversation,
		};
	}

	test('tool scheduling uses durable handoffs without opening a picker or claiming composer input', async () => {
		const fixture = create();
		const conversation = { sessionResource: URI.parse('agent-host-copilot:/session'), chatResource: URI.parse('agent-host-copilot:/peer') };
		const result = await fixture.service.scheduleRequest(toolRequest(conversation), 'chat/call');
		assert.deepStrictEqual({
			status: result.status, picks: fixture.picks, claimed: [...fixture.service.claimedDraftIds.get()],
			pending: fixture.service.hasPendingHandoff('composer', input),
			conversation: fixture.requests[0].conversation, request: fixture.requests[0].request,
			recovered: fixture.recoveredInputs,
		}, {
			status: 'accepted', picks: 0, claimed: [], pending: false, conversation,
			request: { text: input.inputText, origin: { kind: 'user' } }, recovered: [],
		});
	});

	test('tool retries after reload reuse the saved identity and do not duplicate accepted schedules', async () => {
		const first = create();
		first.failCreate = true;
		const unknown = await first.service.scheduleRequest(toolRequest(), 'chat/call');
		const pending = first.service.getPendingRequests();
		first.service.dispose();
		const restored = create(true, true, undefined, first.storage);
		const accepted = await restored.service.scheduleRequest(toolRequest(), 'chat/call');
		await restored.service.scheduleRequest(toolRequest(), 'chat/call');
		assert.deepStrictEqual({
			outcomes: [unknown.status, accepted.status],
			pendingIds: pending.map(request => request.automationId),
			creates: restored.requests,
			remaining: restored.service.getPendingRequests(),
			composerClaim: restored.service.hasPendingHandoff('composer', input),
		}, {
			outcomes: ['unknown', 'accepted'], pendingIds: ['opaque:definition'],
			creates: [first.requests[0]], remaining: [], composerClaim: false,
		});
	});

	test('tool operation identities serialize duplicates but allow intentionally identical new requests', async () => {
		const fixture = create();
		await Promise.all([
			fixture.service.scheduleRequest(toolRequest(), 'chat/call'),
			fixture.service.scheduleRequest(toolRequest(), 'chat/call'),
		]);
		await fixture.service.scheduleRequest(toolRequest(), 'chat/another-call');
		assert.deepStrictEqual({ count: fixture.requests.length, identities: new Set(fixture.requests.map(request => request.creationId)).size, picks: fixture.picks }, { count: 2, identities: 2, picks: 0 });
	});

	test('a restored overdue tool handoff reuses captured configuration instead of reading live settings again', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const first = create();
		first.failCreate = true;
		const options = { ...toolRequest(), schedule: { ...toolRequest().schedule, runAt: new Date(Date.now() + 60_000).toISOString() } };
		await first.service.scheduleRequest(options, 'chat/call', undefined, async () => ({ modelId: 'original', config: { autoApprove: 'default' } }));
		first.service.dispose();
		await timeout(60_001);
		const restored = create(true, true, undefined, first.storage);
		const result = await restored.service.scheduleRequest(options, 'chat/call', undefined, async () => {
			throw new Error('Live configuration is unavailable');
		});
		assert.deepStrictEqual({ status: result.status, template: restored.requests[0].sessionTemplate }, {
			status: 'accepted', template: { modelId: 'original', config: { autoApprove: 'default' } },
		});
	}));

	test('tool replay compares resource identity and persisted templates rather than URI caches or undefined keys', async () => {
		for (const existingChat of [false, true]) {
			const first = create();
			const folderUri = URI.file('/workspace');
			const conversation = { sessionResource: URI.parse('agent-host-copilot:/session'), chatResource: URI.parse('agent-host-copilot:/peer') };
			const options: IScheduledChatRequestOptions = existingChat ? toolRequest(conversation) : {
				...toolRequest(), sessionTemplate: { modelId: undefined, config: { mode: 'plan' } },
				target: { kind: 'workspace', folderUri, isolation: { kind: 'default' }, providerId: 'local', sessionTypeId: 'copilot' },
			};
			folderUri.toString();
			void folderUri.fsPath;
			conversation.chatResource.toString();
			first.failCreate = true;
			await first.service.scheduleRequest(options, 'chat/call');
			first.service.dispose();
			const restored = create(true, true, undefined, first.storage);
			const replay = await restored.service.scheduleRequest({
				...options,
				...(options.target.kind === 'workspace' ? { target: { ...options.target, folderUri: URI.file('/workspace') } } : {}),
				conversation: existingChat ? {
					sessionResource: URI.parse('agent-host-copilot:/session'),
					chatResource: URI.parse('agent-host-copilot:/peer'),
				} : undefined,
			}, 'chat/call');
			assert.deepStrictEqual({ status: replay.status, creates: restored.requests.length }, { status: 'accepted', creates: 1 });
		}
	});

	test('catalogue reconciliation durably records lost acknowledgements before definition removal', async () => {
		const fixture = create();
		fixture.failCreate = true;
		await fixture.service.scheduleRequest(toolRequest(), 'chat/call');
		fixture.automations.set([{
			...fixture.requests[0], id: 'opaque:definition', enabled: true,
			createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
		}], undefined);
		const acceptedId = parse(fixture.storage.get('sessions.scheduledChatHandoffs', StorageScope.PROFILE)!).handoffs[0].automationId;
		fixture.automations.set([], undefined);
		fixture.service.dispose();
		const restored = create(true, true, undefined, fixture.storage);
		await assert.rejects(restored.service.scheduleRequest(toolRequest(), 'chat/call'), /already accepted.*will not be recreated/);
		assert.deepStrictEqual({ acceptedId, pending: restored.service.getPendingRequests(), creates: restored.requests }, {
			acceptedId: 'opaque:definition', pending: [], creates: [],
		});
	});

	for (const complete of [false, true]) {
		test(`tool ${complete ? 'dispatch' : 'recovery'} compacts payloads to durable replay receipts`, async () => {
			const fixture = create();
			await fixture.service.scheduleRequest({ ...toolRequest(), sessionTemplate: { modelId: 'captured' } }, 'chat/call');
			if (complete) {
				fixture.automations.set(fixture.automations.get().map(automation => ({ ...automation, oneTimeDispatchedAt: '2026-01-01T00:00:00.000Z' })), undefined);
			} else {
				await fixture.service.items.get()[0].open();
			}
			const handoffs = parse(fixture.storage.get('sessions.scheduledChatHandoffs', StorageScope.PROFILE)!).handoffs;
			const receipts = parse(fixture.storage.get('sessions.scheduledChatReceipts', StorageScope.PROFILE)!).receipts;
			assert.deepStrictEqual({ handoffs, receipts, pending: fixture.service.getPendingRequests(), known: fixture.service.hasRequest('chat/call') }, {
				handoffs: [], receipts: [{ operationId: 'chat/call', automationId: 'opaque:definition' }], pending: [], known: true,
			});
		});
	}

	test('tool scheduling rejects past instants and changed operations without replaying a different request', async () => {
		const fixture = create();
		await assert.rejects(fixture.service.scheduleRequest({ ...toolRequest(), schedule: { ...toolRequest().schedule, runAt: '2000-01-01T00:00:00.000Z' } }, 'past'), /future send time/);
		await fixture.service.scheduleRequest(toolRequest(), 'chat/call');
		await assert.rejects(fixture.service.scheduleRequest({ ...toolRequest(), prompt: 'Different request' }, 'chat/call'), /different saved request/);
		await assert.rejects(fixture.service.scheduleRequest({ ...toolRequest(), sessionTemplate: { modelId: 'different-model' } }, 'chat/call'), /different saved request/);
		fixture.automations.set([], undefined);
		await assert.rejects(fixture.service.scheduleRequest(toolRequest(), 'chat/call'), /will not be recreated/);
		assert.deepStrictEqual({ creates: fixture.requests.length, pending: fixture.service.getPendingRequests() }, { creates: 1, pending: [] });
	});

	test('tool prompt edits update recovery content as well as the durable request', async () => {
		const fixture = create();
		await fixture.service.scheduleRequest(toolRequest(), 'chat/call');
		const automation = fixture.automations.get()[0];
		await fixture.service.updateRequest(automation, { prompt: 'Changed', request: { ...automation.request!, text: 'Changed' } });
		const stored = parse(fixture.storage.get('sessions.scheduledChatHandoffs', StorageScope.PROFILE)!);
		assert.deepStrictEqual({ request: stored.handoffs[0].request.text, recovery: stored.handoffs[0].input.inputText, host: fixture.automations.get()[0].request?.text }, { request: 'Changed', recovery: 'Changed', host: 'Changed' });
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
		fixture.automations.set(fixture.automations.get().map(automation => ({ ...automation, creationId: undefined })), undefined);
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

	test('a released new-session source can schedule an identical new composition', async () => {
		const fixture = create();
		await fixture.service.schedule(input, target, session, 'first');
		fixture.service.releaseSource('first');
		await fixture.service.schedule(input, target, session, 'second');
		assert.strictEqual(fixture.requests.length, 2);
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
		const action = fixture.service.items.get()[0].actions.find(action => action.id === 'sessions.scheduled.edit')!;
		fixture.conflict = true;
		await assert.rejects(async () => action.run(), /changed or has started/);
		const conflictCalls = [...fixture.calls];
		fixture.conflict = false;
		await action.run();
		assert.deepStrictEqual({ conflictCalls, successCalls: fixture.calls.slice(conflictCalls.length) }, { conflictCalls: ['disable'], successCalls: ['disable', 'save', 'delete', 'open'] });
		assert.doesNotThrow(() => fixture.service.assertUnscheduled('composition', input));
	});

	for (const savedDrafts of [true, false]) {
		test(`opening a scheduled draft cancels and restores it with saved drafts ${savedDrafts ? 'enabled' : 'disabled'}`, async () => {
			const fixture = create(true, savedDrafts);
			await fixture.service.schedule(input, target, session, 'composition');
			const creationId = fixture.automations.get()[0].creationId;
			await fixture.service.items.get()[0].open();
			assert.deepStrictEqual({
				calls: fixture.calls, remaining: fixture.service.items.get(), openedDrafts: fixture.openedDrafts,
			}, {
				calls: savedDrafts ? ['disable', 'save', 'delete', 'open'] : ['disable', 'recover', 'delete'],
				remaining: [], openedDrafts: savedDrafts ? [[creationId, { removeFromDrafts: true }]] : [],
			});
		});
	}

	test('with saved drafts disabled an occupied composer leaves cancelled content recoverable', async () => {
		const fixture = create(true, false);
		await fixture.service.schedule(input, target, session, 'composition');
		fixture.occupied = true;
		await assert.rejects(async () => fixture.service.items.get()[0].open(), /Composer occupied/);
		assert.deepStrictEqual({
			calls: fixture.calls, enabled: fixture.automations.get()[0].enabled,
			retained: !!fixture.storage.get('sessions.scheduledChatHandoffs', StorageScope.PROFILE),
		}, { calls: ['disable', 'recover'], enabled: false, retained: true });
		fixture.occupied = false;
		await fixture.service.items.get()[0].open();
		assert.deepStrictEqual({ calls: fixture.calls, remaining: fixture.service.items.get() }, {
			calls: ['disable', 'recover', 'recover', 'delete'], remaining: [],
		});
	});

	test('durable dispatch confirmation hides a consumed schedule even after run history eviction', async () => {
		const fixture = create();
		await fixture.service.schedule(input, target, session, 'composition');
		fixture.automations.set([{ ...fixture.automations.get()[0], oneTimeRunId: 'opaque:run', oneTimeDispatchedAt: new Date().toISOString() }], undefined);
		assert.deepStrictEqual(fixture.service.items.get(), []);
	});

	test('only a positively rejected dispatch allows consumed-request recovery', async () => {
		const fixture = create();
		await fixture.service.schedule(input, target, session, 'composition');
		const claimed = { ...fixture.automations.get()[0], oneTimeRunId: 'run' };
		fixture.automations.set([claimed], undefined);
		const uncertain = fixture.service.items.get()[0].actions.find(action => action.id === 'sessions.scheduled.edit')!.enabled;
		fixture.automations.set([{ ...claimed, oneTimeDispatchRejectedAt: new Date().toISOString() }], undefined);
		await fixture.service.items.get()[0].actions.find(action => action.id === 'sessions.scheduled.edit')!.run();
		assert.deepStrictEqual({ uncertain, calls: fixture.calls, claimed: [...fixture.service.claimedDraftIds.get()] }, {
			uncertain: false, calls: ['save', 'delete', 'open'], claimed: [],
		});
	});

	test('unresolved conversations remain read-only, including stale action invocations', async () => {
		const fixture = create();
		await fixture.service.schedule(input, target, session, 'composition');
		fixture.automations.set([{ ...fixture.automations.get()[0], readOnlyReason: 'Original conversation unavailable' }], undefined);
		const item = fixture.service.items.get()[0];
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
		await assert.rejects(async () => fixture.service.items.get()[0].actions.find(action => action.id === 'sessions.scheduled.edit')!.run(), /Deletion failed/);
		fixture.failDelete = false;
		await fixture.service.items.get()[0].actions.find(action => action.id === 'sessions.scheduled.edit')!.run();
		assert.deepStrictEqual(fixture.calls, ['disable', 'save', 'delete', 'delete', 'open']);
	});

	test('sidebar reconciliation keeps the original chat input guarded until it is released', async () => {
		const fixture = create();
		const source = registerInput(fixture.service);
		fixture.failCreate = true;
		await assert.rejects(() => fixture.service.scheduleChatInput(source.widget), /Acknowledgement lost/);
		fixture.failCreate = false;
		await fixture.service.items.get()[0].open();
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
