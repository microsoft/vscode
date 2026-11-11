/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationHandle, INotificationService, IPromptChoice, NotificationsFilter, Severity } from '../../../../../platform/notification/common/notification.js';
import { IInputOptions, IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { Progress } from '../../../../../platform/progress/common/progress.js';
import { IChatInputNotificationService } from '../../../../../workbench/contrib/chat/browser/widget/input/chatInputNotificationService.js';
import { toPasteVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IAutomationDescriptor } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationDialogService } from '../../../../../workbench/contrib/chat/common/automations/automationDialogService.js';
import { AutomationMutationGuard, IAutomationService, ICreateAutomationOptions, IUpdateAutomationOptions } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { CHAT_AUTOMATIONS_ENABLED_SETTING } from '../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { AUTOMATION_REMINDERS_ENABLED_SETTING } from '../../../../../workbench/contrib/chat/common/automations/automationReminders.js';
import { ChatAgentLocation } from '../../../../../workbench/contrib/chat/common/constants.js';
import { IChatSlashCallback, IChatSlashCommandService, IChatSlashData } from '../../../../../workbench/contrib/chat/common/participants/chatSlashCommands.js';
import { ISessionsService } from '../../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { ISendRequestSentEvent, ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { IHostService } from '../../../../../workbench/services/host/browser/host.js';
import { ISessionsPartService } from '../../../../../workbench/services/sessions/browser/sessionsPartService.js';
import { IChat, ISession, SessionStatus } from '../../../../../workbench/services/sessions/common/session.js';
import { AutomationRemindersService } from '../../browser/automationReminders.js';

suite('Automation reminders', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(initial: readonly IAutomationDescriptor[] = [], source?: ISession) {
		const sent = disposables.add(new Emitter<ISendRequestSentEvent>());
		const updated = new DeferredPromise<void>();
		const errors: unknown[] = [];
		const information: string[] = [];
		const patches: IUpdateAutomationOptions[] = [];
		const inputs: IInputOptions[] = [];
		const answers: ((options: IInputOptions) => string | undefined)[] = [];
		const opened: URI[] = [];
		const dialogs = new TestDialogService(undefined, {});
		const prompt = sinon.spy(dialogs, 'prompt');
		const configuration = new TestConfigurationService({ [CHAT_AUTOMATIONS_ENABLED_SETTING]: true, [AUTOMATION_REMINDERS_ENABLED_SETTING]: true });
		let choices: readonly IPromptChoice[] = [];
		let sessionOpens = 0;
		const draftSession = upcastPartial<ISession>({ sessionId: 'draft' });
		let callback: IChatSlashCallback | undefined;
		const automations = new class extends mock<IAutomationService>() {
			override readonly automations = observableValue<readonly IAutomationDescriptor[]>(this, initial);
			override readonly availableProviders = constObservable([{ id: 'local-agent-host', label: 'Local', supportsReminders: true }]);
			override getAutomation(id: string) { return this.automations.get().find(item => item.id === id); }
			override async createAutomation(options: ICreateAutomationOptions, guard?: AutomationMutationGuard) {
				guard?.();
				const value: IAutomationDescriptor = { ...options, id: 'reminder', enabled: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
				this.automations.set([value], undefined);
				return value;
			}
			override async updateAutomationIfUnchanged(id: string, patch: IUpdateAutomationOptions, expected: IAutomationDescriptor, guard?: AutomationMutationGuard) {
				guard?.();
				patches.push(patch);
				if (this.getAutomation(id) !== expected) {
					return { kind: 'conflict' as const, current: this.getAutomation(id) };
				}
				const automation: IAutomationDescriptor = { ...expected, name: patch.name ?? expected.name, prompt: patch.prompt ?? expected.prompt, schedule: patch.schedule ?? expected.schedule, reminder: patch.reminder ?? expected.reminder };
				this.automations.set([automation], undefined);
				await updated.complete();
				return { kind: 'updated' as const, automation };
			}
		}();
		const notifications = new class extends mock<INotificationService>() {
			override getFilter() { return NotificationsFilter.ERROR; }
			override error(error: unknown) { errors.push(error); }
			override info(message: string) { information.push(message); }
			override prompt(_severity: Severity, _message: string, promptChoices: IPromptChoice[]) {
				choices = promptChoices;
				return new class extends mock<INotificationHandle>() { override close() { } }();
			}
		}();
		const service = disposables.add(new AutomationRemindersService(
			automations,
			new class extends mock<IQuickInputService>() {
				override async input(options: IInputOptions) {
					inputs.push(options);
					return answers.shift()?.(options);
				}
			}(),
			notifications,
			new class extends mock<IChatInputNotificationService>() { override setNotification() { } }(),
			new class extends mock<IChatSlashCommandService>() {
				override registerSlashCommand(_data: IChatSlashData, handler: IChatSlashCallback) {
					callback = handler;
					return Disposable.None;
				}
			}(),
			new class extends mock<ICommandService>() { }(),
			configuration,
			new class extends mock<ISessionsService>() {
				override async openNewSession() { sessionOpens++; return { session: draftSession, trustDeclined: false }; }
				override async openSession(resource: URI) { opened.push(resource); }
			}(),
			new class extends mock<ISessionsPartService>() {
				override getSessionView(session: string | ISession | undefined) {
					return session === draftSession ? upcastPartial<NonNullable<ReturnType<ISessionsPartService['getSessionView']>>>({ applyDraft: async () => 'preserved' }) : undefined;
				}
			}(),
			new class extends mock<ISessionsManagementService>() {
				override onDidSendRequest = sent.event;
				override getSessionForChatResource() { return source ? { session: source, chat: source.mainChat.get() } : undefined; }
			}(),
			new class extends mock<IModelService>() { }(),
			new NullLogService(),
			new class extends mock<IAccessibilitySignalService>() { override async playSignal() { } }(),
			new class extends mock<IHostService>() { }(),
			dialogs,
			new class extends mock<IAutomationDialogService>() { }(),
		));
		return { service, callback, automations, sent, updated, patches, errors, information, inputs, answers, opened, prompt, configuration, choices: () => choices, sessionOpens: () => sessionOpens };
	}

	test('slash capture creates only a reminder with explicit context and no session services', async () => {
		const test = createService();
		assert.ok(test.callback);
		const before = Date.now();
		const result = await test.callback('me in one hour to Review PR #42', new Progress(() => { }), [], ChatAgentLocation.Chat, URI.parse('draft:/input'), CancellationToken.None,
			{ attachedContext: [toPasteVariableEntry('Notes', 'Explicit context')] }, { input: '/remind me in one hour to Review PR #42', inputUri: URI.parse('chat-input:/one') });
		const [created] = test.automations.automations.get();
		const timestamp = Date.parse(created.schedule.at!);
		assert.deepStrictEqual({
			text: created.prompt, target: created.target, status: created.reminder?.status,
			timeWithinBounds: timestamp >= before + 3_600_000 && timestamp <= Date.now() + 3_600_000,
			context: created.reminder?.draft?.attachments.includes('Explicit context'), source: created.reminder?.sourceSessionResource,
			preserveInput: result?.preserveInput, errors: test.errors, sessionOpens: test.sessionOpens(),
		}, {
			text: 'Review PR #42', target: { kind: 'reminder', providerId: 'local-agent-host' }, status: 'scheduled',
			timeWithinBounds: true, context: true, source: undefined, preserveInput: false, errors: [], sessionOpens: 0,
		});
	});

	test('only a successful matching draft submission moves a due reminder to sent history', async () => {
		const reminder: IAutomationDescriptor = {
			id: 'one', name: 'Review', prompt: 'Review',
			target: { kind: 'reminder', providerId: 'local-agent-host' },
			schedule: { interval: 'once', at: '2026-01-01T00:00:00Z', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			reminder: { status: 'due', handoffId: 'handoff-one' },
			enabled: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
		};
		const test = createService([reminder]);
		test.sent.fire(upcastPartial<ISendRequestSentEvent>({ options: { query: 'Unrelated', handoffId: 'other' } }));
		const beforeMatchingSend = test.patches.length;
		const resource = URI.parse('session:/canonical-session');
		test.sent.fire(upcastPartial<ISendRequestSentEvent>({ options: { query: 'Edited reminder', handoffId: 'handoff-one' }, session: upcastPartial<ISession>({ resource }) }));
		await test.updated.p;
		assert.deepStrictEqual({ beforeMatchingSend, reminder: test.automations.getAutomation('one')?.reminder, errors: test.errors }, {
			beforeMatchingSend: 0, reminder: { status: 'sent', sessionResource: resource, handoffId: undefined }, errors: [],
		});
	});

	test('a repeated handoff preserves the token of the existing draft', async () => {
		const reminder: IAutomationDescriptor = {
			id: 'one', name: 'Review', prompt: 'Review',
			target: { kind: 'reminder', providerId: 'local-agent-host' },
			schedule: { interval: 'once', at: '2026-01-01T00:00:00Z', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			reminder: { status: 'due', handoffId: 'existing-draft' },
			enabled: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
		};
		const test = createService([reminder]);
		await test.choices()[0].run();
		assert.deepStrictEqual({
			reminder: test.automations.getAutomation('one')?.reminder,
			sessionOpens: test.sessionOpens(),
			informed: test.information.some(message => message.includes('Your existing draft was kept')),
			errors: test.errors,
		}, { reminder: { status: 'due', handoffId: 'existing-draft' }, sessionOpens: 1, informed: true, errors: [] });
	});

	test('slash capture preserves a created source session but never an unsent draft', async () => {
		const resource = URI.parse('session:/original');
		const sources: (string | undefined)[] = [];
		for (const status of [SessionStatus.Untitled, SessionStatus.Completed]) {
			const source = upcastPartial<ISession>({ resource, status: constObservable(status), mainChat: constObservable(upcastPartial<IChat>({})) });
			const test = createService([], source);
			await test.callback!('me in one hour to Revisit this approach', new Progress(() => { }), [], ChatAgentLocation.Chat, URI.parse('chat:/original'), CancellationToken.None);
			const item = test.automations.getAutomation('reminder')!;
			sources.push(item.reminder?.sourceSessionResource?.toString());
		}
		assert.deepStrictEqual(sources, [undefined, resource.toString()]);
	});

	test('editing overdue text keeps the saved time, status and source; explicit rescheduling clears the handoff', async () => {
		const sourceSessionResource = URI.parse('session:/original');
		const item: IAutomationDescriptor = {
			id: 'one', name: 'Review', prompt: 'Review', enabled: true,
			target: { kind: 'reminder', providerId: 'local-agent-host' },
			schedule: { interval: 'once', at: '2020-01-02T03:04:05.123Z', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			reminder: { status: 'due', sourceSessionResource, handoffId: 'old-draft' },
			createdAt: '2020-01-01T00:00:00Z', updatedAt: '2020-01-01T00:00:00Z',
		};
		const test = createService([item]);
		test.answers.push(() => 'Updated wording', options => options.value);
		await test.service.execute('edit', item.id);
		const edited = test.automations.getAutomation(item.id)!;
		const validation = await test.inputs[1].validateInput?.(test.inputs[1].value!);
		const unchangedTimeIsValid = typeof validation === 'object' && validation?.severity === Severity.Info;
		test.answers.push(() => 'in two hours');
		await test.service.execute('postpone', item.id);
		const postponed = test.automations.getAutomation(item.id)!;
		await test.service.execute('source', item.id);
		await test.service.execute('dismiss', item.id);
		assert.deepStrictEqual({
			text: edited.prompt, at: edited.schedule.at, reminder: edited.reminder, unchangedTimeIsValid,
			postponed: { future: Date.parse(postponed.schedule.at!) > Date.now(), reminder: postponed.reminder },
			dismissed: test.automations.getAutomation(item.id)?.reminder, opened: test.opened, errors: test.errors,
		}, {
			text: 'Updated wording', at: item.schedule.at, reminder: { status: 'due', sourceSessionResource, handoffId: undefined }, unchangedTimeIsValid: true,
			postponed: { future: true, reminder: { status: 'scheduled', sourceSessionResource, handoffId: undefined } },
			dismissed: { status: 'dismissed', sourceSessionResource, handoffId: undefined }, opened: [sourceSessionResource], errors: [],
		});
	});

	test('opening a reminder shows full details and buttons instead of an action picker', async () => {
		const test = createService();
		await test.callback!('me in one hour to Read the full reminder', new Progress(() => { }), [], ChatAgentLocation.Chat, URI.parse('draft:/input'), CancellationToken.None,
			{ attachedContext: [toPasteVariableEntry('Notes', 'Explicit context')] });
		await test.service.execute('open', 'reminder');
		const prompt = test.prompt.firstCall.args[0];
		assert.deepStrictEqual({
			text: prompt.detail,
			attachments: typeof prompt.custom === 'object' && prompt.custom.markdownDetails?.some(detail => detail.markdown.value.includes('Explicit context')),
			buttons: prompt.buttons?.map(button => button.label), inputs: test.inputs.length, errors: test.errors,
		}, { text: 'Read the full reminder', attachments: true, buttons: ['Postpone...', 'Edit...', 'Dismiss'], inputs: 0, errors: [] });
	});

	test('opt-out blocks stale commands but still reconciles an already submitted reminder draft', async () => {
		const resource = URI.parse('session:/sent');
		const item: IAutomationDescriptor = {
			id: 'one', name: 'Review', prompt: 'Review', enabled: true,
			target: { kind: 'reminder', providerId: 'local-agent-host' },
			schedule: { interval: 'once', at: '2020-01-01T00:00:00Z', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			reminder: { status: 'due', handoffId: 'draft' },
			createdAt: '2020-01-01T00:00:00Z', updatedAt: '2020-01-01T00:00:00Z',
		};
		const test = createService([item]);
		await test.configuration.setUserConfiguration(AUTOMATION_REMINDERS_ENABLED_SETTING, false);
		await test.service.execute('dismiss', item.id);
		const blocked = test.patches.length === 0 && test.errors.length === 1;
		test.sent.fire(upcastPartial<ISendRequestSentEvent>({ options: { query: 'Review', handoffId: 'draft' }, session: upcastPartial<ISession>({ resource }) }));
		await test.updated.p;
		assert.deepStrictEqual({ blocked, reminder: test.automations.getAutomation(item.id)?.reminder }, {
			blocked: true, reminder: { status: 'sent', handoffId: undefined, sessionResource: resource },
		});
	});
});
