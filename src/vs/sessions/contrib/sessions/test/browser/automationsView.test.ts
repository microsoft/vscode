/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { GestureEvent, EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../base/common/event.js';
import { constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IConfirmation, IConfirmationResult, IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IAutomation, IAutomationRun, IAutomationSchedule, AutomationRunTrigger, AutomationTarget } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationDialogResult, IAutomationDialogService, IShowAutomationDialogOptions } from '../../../../../workbench/contrib/chat/common/automations/automationDialogService.js';
import { IAutomationRunDispatch, IAutomationRunner, IAutomationRunOperation } from '../../../../../workbench/contrib/chat/common/automations/automationRunner.js';
import { AutomationMutationGuard, IAutomationRunClaim, IAutomationService, ICreateAutomationOptions, IGuardedAutomationUpdateResult, IUpdateAutomationOptions, IUpdateAutomationRunOptions } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { ICustomViewService } from '../../../../services/customView/browser/customViewService.js';
import { AutomationsHasItemsContext } from '../../../../common/contextkeys.js';
import { buildAutomationsAccessibleContent } from '../../browser/views/automationsAccessibility.js';
import { AutomationsCardsWidget, AutomationsCustomViewContribution } from '../../browser/views/automationsView.js';


const AUTOMATION_ID = 'automation-1';
const RUN_ID = 'run-1';
const SESSION_RESOURCE = URI.parse('vscode-chat-session://test/session-1');
const SECOND_SESSION_RESOURCE = URI.parse('vscode-chat-session://test/session-2');
const FOLDER = URI.parse('file:///workspace');

function hourly(): IAutomationSchedule {
	return { interval: 'hourly', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 };
}

function workspaceTarget(): AutomationTarget {
	return { kind: 'workspace', folderUri: FOLDER, isolation: { kind: 'default' } };
}

function automation(overrides: Partial<IAutomation> = {}): IAutomation {
	return {
		id: AUTOMATION_ID,
		name: 'Daily review',
		prompt: 'Review the workspace',
		schedule: hourly(),
		target: workspaceTarget(),
		enabled: true,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		...overrides,
	};
}

function run(overrides: Partial<IAutomationRun> = {}): IAutomationRun {
	return {
		id: RUN_ID,
		automationId: AUTOMATION_ID,
		status: 'completed',
		trigger: 'manual',
		startedAt: new Date().toISOString(),
		leaderWindowId: 0,
		sessionResource: SESSION_RESOURCE.toString(),
		...overrides,
	};
}

function dispatchKeydown(element: HTMLElement, init: KeyboardEventInit & { keyCode: number }): void {
	const event = new KeyboardEvent('keydown', { ...init, bubbles: true });
	Object.defineProperty(event, 'keyCode', { get: () => init.keyCode });
	element.dispatchEvent(event);
}

class FakeAutomationService extends mock<IAutomationService>() {
	private readonly automationValue = observableValue<readonly IAutomation[]>(this, []);
	private readonly runValue = observableValue<readonly IAutomationRun[]>(this, []);
	override readonly automations: IObservable<readonly IAutomation[]> = this.automationValue;
	override readonly runs: IObservable<readonly IAutomationRun[]> = this.runValue;
	updateResult: IGuardedAutomationUpdateResult | undefined;
	updateCalls = 0;
	deleteRunCalls = 0;

	setAutomations(value: readonly IAutomation[]): void {
		this.automationValue.set(value, undefined);
	}

	setRuns(value: readonly IAutomationRun[]): void {
		this.runValue.set(value, undefined);
	}

	override getAutomation(id: string): IAutomation | undefined {
		return this.automationValue.get().find(item => item.id === id);
	}

	override runsFor(automationId: string): IObservable<readonly IAutomationRun[]> {
		return constObservable(this.runValue.get().filter(item => item.automationId === automationId));
	}

	override async createAutomation(options: ICreateAutomationOptions, mutationGuard?: AutomationMutationGuard): Promise<IAutomation> {
		mutationGuard?.();
		const created = automation({
			id: AUTOMATION_ID,
			name: options.name,
			prompt: options.prompt,
			schedule: options.schedule,
			target: options.target,
			modelId: options.modelId ?? undefined,
			mode: options.mode ?? undefined,
			permissionLevel: options.permissionLevel ?? undefined,
			enabled: options.enabled ?? true,
		});
		this.setAutomations([created, ...this.automationValue.get()]);
		return created;
	}

	override async updateAutomation(id: string, patch: IUpdateAutomationOptions): Promise<IAutomation> {
		const current = this.getAutomation(id);
		if (!current) {
			throw new Error('missing automation');
		}
		const updated: IAutomation = {
			...current,
			name: patch.name ?? current.name,
			prompt: patch.prompt ?? current.prompt,
			schedule: patch.schedule ?? current.schedule,
			target: patch.target ?? current.target,
			modelId: patch.modelId === undefined ? current.modelId : patch.modelId ?? undefined,
			mode: patch.mode === undefined ? current.mode : patch.mode ?? undefined,
			permissionLevel: patch.permissionLevel === undefined ? current.permissionLevel : patch.permissionLevel ?? undefined,
			enabled: patch.enabled ?? current.enabled,
			updatedAt: new Date().toISOString(),
		};
		this.setAutomations(this.automationValue.get().map(item => item.id === id ? updated : item));
		return updated;
	}

	override async updateAutomationIfUnchanged(id: string, patch: IUpdateAutomationOptions, _expected: IAutomation, mutationGuard?: AutomationMutationGuard): Promise<IGuardedAutomationUpdateResult> {
		this.updateCalls++;
		mutationGuard?.();
		return this.updateResult ?? { kind: 'updated', automation: await this.updateAutomation(id, patch) };
	}

	override async deleteAutomation(id: string, mutationGuard?: AutomationMutationGuard): Promise<void> {
		mutationGuard?.();
		this.setAutomations(this.automationValue.get().filter(item => item.id !== id));
	}

	override async recordRunStart(): Promise<IAutomationRunClaim> {
		return { claimed: true, run: run() };
	}

	override async updateRun(_runId: string, _patch: IUpdateAutomationRunOptions): Promise<IAutomationRun | undefined> {
		return undefined;
	}

	override async deleteRun(runId: string): Promise<void> {
		this.deleteRunCalls++;
		this.setRuns(this.runValue.get().filter(run => run.id !== runId));
	}
}

class FakeAutomationDialogService extends mock<IAutomationDialogService>() {
	result: IAutomationDialogResult | undefined;
	beforeReturn: (() => void) | undefined;
	showCalls = 0;
	lastOptions: IShowAutomationDialogOptions | undefined;

	override async showAutomationDialog(options: IShowAutomationDialogOptions): Promise<IAutomationDialogResult | undefined> {
		this.showCalls++;
		this.lastOptions = options;
		this.beforeReturn?.();
		return this.result;
	}
}

class FakeDialogService extends mock<IDialogService>() {
	readonly errors: { message: string; detail: string }[] = [];
	readonly infos: string[] = [];
	readonly confirmations: IConfirmation[] = [];
	readonly errorCalled = new DeferredPromise<void>();
	readonly infoCalled = new DeferredPromise<void>();
	confirmResult: IConfirmationResult = { confirmed: false };

	override async confirm(confirmation: IConfirmation): Promise<IConfirmationResult> {
		this.confirmations.push(confirmation);
		return this.confirmResult;
	}

	override async error(message: string, detail?: string): Promise<void> {
		this.errors.push({ message, detail: detail ?? '' });
		this.errorCalled.complete();
	}

	override async info(message: string): Promise<void> {
		this.infos.push(message);
		this.infoCalled.complete();
	}
}

class FakeRunner extends mock<IAutomationRunner>() {
	whenDispatched: Promise<IAutomationRunDispatch> = Promise.resolve({ kind: 'notStarted', reason: 'targetUnavailable' });
	runCalls = 0;

	override runOnce(_automation: IAutomation, _trigger: AutomationRunTrigger, _leaderWindowId: number, _token?: CancellationToken): IAutomationRunOperation {
		this.runCalls++;
		return { whenDispatched: this.whenDispatched, whenCompleted: Promise.resolve() };
	}
}

class FakeSessionsService extends mock<ISessionsService>() {
	readonly openGate = new DeferredPromise<void>();
	openCalls = 0;
	error: Error | undefined;

	constructor(private readonly onOpen: () => Promise<void>) {
		super();
	}

	override async openSession(): Promise<void> {
		this.openCalls++;
		await this.openGate.p;
		if (this.error) {
			throw this.error;
		}
		await this.onOpen();
	}
}

class FakeSessionsManagementService extends mock<ISessionsManagementService>() implements IDisposable {
	private readonly sessionDeletedEmitter = new Emitter<ISession>();
	private readonly deletedSessionResources = new Set<string>();
	override readonly onDidDeleteSession = this.sessionDeletedEmitter.event;
	sessionExists = true;
	readonly isRead = observableValue<boolean>(this, false);
	readonly secondIsRead = observableValue<boolean>(this, false);
	readonly capabilities = observableValue(this, { supportsMultipleChats: false, supportsDelete: true });
	readonly session = upcastPartial<ISession>({
		resource: SESSION_RESOURCE,
		sessionId: 'test/session-1',
		isRead: this.isRead,
		capabilities: this.capabilities,
	});
	readonly secondSession = upcastPartial<ISession>({
		resource: SECOND_SESSION_RESOURCE,
		sessionId: 'test/session-2',
		isRead: this.secondIsRead,
		capabilities: this.capabilities,
	});
	markAllReadCalls = 0;
	markAllReadSessionCount = 0;
	getSessionCalls = 0;
	deleteSessionCalls = 0;
	deleteError: Error | undefined;
	readonly markAllReadCompleted = new DeferredPromise<void>();

	override getSession(resource: URI): ISession | undefined {
		this.getSessionCalls++;
		if (!this.sessionExists) {
			return undefined;
		}
		if (this.deletedSessionResources.has(resource.toString())) {
			return undefined;
		}
		if (resource.toString() === SESSION_RESOURCE.toString()) {
			return this.session;
		}
		if (resource.toString() === SECOND_SESSION_RESOURCE.toString()) {
			return this.secondSession;
		}
		return undefined;
	}

	override async markRead(session: ISession): Promise<void> {
		if (session === this.session) {
			this.isRead.set(true, undefined);
		} else if (session === this.secondSession) {
			this.secondIsRead.set(true, undefined);
		}
	}

	override async deleteSession(session: ISession): Promise<void> {
		this.deleteSessionCalls++;
		if (this.deleteError) {
			throw this.deleteError;
		}
		this.deletedSessionResources.add(session.resource.toString());
		this.sessionDeletedEmitter.fire(session);
	}

	override async markAllRead(sessions: readonly ISession[]): Promise<void> {
		this.markAllReadCalls++;
		this.markAllReadSessionCount = sessions.length;
		for (const session of sessions) {
			await this.markRead(session);
		}
		this.markAllReadCompleted.complete();
	}

	setRead(isRead: boolean): void {
		this.isRead.set(isRead, undefined);
	}

	setSupportsDelete(supportsDelete: boolean): void {
		this.capabilities.set({ supportsMultipleChats: false, supportsDelete }, undefined);
	}

	dispose(): void {
		this.sessionDeletedEmitter.dispose();
	}
}

suite('AutomationsCardsWidget', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function setup() {
		const automationService = new FakeAutomationService();
		const automationDialogService = new FakeAutomationDialogService();
		const dialogService = new FakeDialogService();
		const runner = new FakeRunner();
		const sessionsManagementService = disposables.add(new FakeSessionsManagementService());
		const sessionsService = new FakeSessionsService(() => sessionsManagementService.markRead(sessionsManagementService.session));
		const configurationService = new TestConfigurationService({ chat: { automations: { enabled: true } } });
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IAutomationService, automationService);
		instantiationService.stub(IAutomationDialogService, automationDialogService);
		instantiationService.stub(IDialogService, dialogService);
		instantiationService.stub(IAutomationRunner, runner);
		instantiationService.stub(ISessionsService, sessionsService);
		instantiationService.stub(ISessionsManagementService, sessionsManagementService);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IHoverService, NullHoverService);
		instantiationService.stub(ILogService, new NullLogService());
		const widget = disposables.add(instantiationService.createInstance(AutomationsCardsWidget));
		document.body.append(widget.element);
		disposables.add(toDisposable(() => widget.element.remove()));
		return { automationService, automationDialogService, configurationService, dialogService, runner, sessionsManagementService, sessionsService, widget };
	}

	test('renders localized schedules and accessible run state', () => {
		const { automationService, widget } = setup();
		const item = automation({ schedule: { interval: 'daily', scheduleHour: 13, scheduleMinute: 5, scheduleDay: 0 } });
		const completedRun = run();
		automationService.setAutomations([item]);
		automationService.setRuns([completedRun]);
		const scheduleTime = new Date(Date.UTC(2000, 0, 1, 13, 5));
		const runTime = new Date(completedRun.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

		assert.deepStrictEqual({
			schedule: widget.element.querySelector('.automations-card-meta-item')?.textContent,
			runLabel: widget.element.querySelector('.automations-run-card-main')?.getAttribute('aria-label'),
		}, {
			schedule: `Daily at ${scheduleTime.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })}`,
			runLabel: `Daily review, workspace, Completed, ${runTime}, Unread`,
		});
	});

	test('run changes preserve automation card identity and focus', () => {
		const { automationService, widget } = setup();
		automationService.setAutomations([automation()]);
		const card = widget.element.querySelector('.automations-card');
		const editButton = widget.element.querySelector<HTMLButtonElement>('.automations-card-main');
		editButton?.focus();

		automationService.setRuns([run({ status: 'running' })]);

		assert.deepStrictEqual({
			sameCard: widget.element.querySelector('.automations-card') === card,
			focusPreserved: document.activeElement === editButton,
		}, {
			sameCard: true,
			focusPreserved: true,
		});
	});

	test('focus targets the view without selecting an automation card', () => {
		const { automationService, widget } = setup();
		automationService.setAutomations([automation()]);

		widget.focus();

		assert.deepStrictEqual({
			activeElement: document.activeElement,
			cardFocused: widget.element.querySelector('.automations-card-main') === document.activeElement,
		}, {
			activeElement: widget.element,
			cardFocused: false,
		});
	});

	test('clicking the card opens edit without intercepting action clicks', async () => {
		const { automationDialogService, automationService, runner, widget } = setup();
		const item = automation();
		automationService.setAutomations([item]);

		widget.element.querySelector<HTMLElement>('.automations-card')?.click();
		await Promise.resolve();
		const actionButton = widget.element.querySelector<HTMLButtonElement>('.automations-card-action-button');
		assert.ok(actionButton);
		actionButton.click();
		await Promise.resolve();

		assert.deepStrictEqual({
			showCalls: automationDialogService.showCalls,
			existing: automationDialogService.lastOptions?.existing,
			runCalls: runner.runCalls,
		}, {
			showCalls: 1,
			existing: item,
			runCalls: 1,
		});
	});

	test('automation action buttons support arrow navigation and keyboard activation', async () => {
		const { automationService, runner, widget } = setup();
		automationService.setAutomations([automation()]);
		const buttons = widget.element.querySelectorAll<HTMLElement>('.automations-card-action-button');
		const runButton = buttons.item(0);
		const deleteButton = buttons.item(1);

		runButton.focus();
		dispatchKeydown(runButton, { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 });
		const movedRight = document.activeElement === deleteButton;
		dispatchKeydown(deleteButton, { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 });
		const movedLeft = document.activeElement === runButton;
		dispatchKeydown(runButton, { key: 'Enter', code: 'Enter', keyCode: 13 });
		dispatchKeydown(runButton, { key: ' ', code: 'Space', keyCode: 32 });
		await Promise.resolve();

		assert.deepStrictEqual({
			movedRight,
			movedLeft,
			runCalls: runner.runCalls,
		}, {
			movedRight: true,
			movedLeft: true,
			runCalls: 2,
		});
	});

	test('tapping the card opens edit without intercepting action taps', async () => {
		const { automationDialogService, automationService, runner, widget } = setup();
		const item = automation();
		automationService.setAutomations([item]);
		const card = widget.element.querySelector<HTMLElement>('.automations-card');
		const actionButton = widget.element.querySelector<HTMLButtonElement>('.automations-card-action-button');
		assert.ok(card);
		assert.ok(actionButton);

		const tapEvent = new MouseEvent(TouchEventType.Tap, { cancelable: true }) as GestureEvent;
		tapEvent.initialTarget = actionButton;
		actionButton.dispatchEvent(tapEvent);
		card.dispatchEvent(tapEvent);
		await Promise.resolve();

		const cardTapEvent = new MouseEvent(TouchEventType.Tap, { cancelable: true }) as GestureEvent;
		cardTapEvent.initialTarget = card;
		card.dispatchEvent(cardTapEvent);
		await Promise.resolve();

		assert.deepStrictEqual({
			showCalls: automationDialogService.showCalls,
			existing: automationDialogService.lastOptions?.existing,
			runCalls: runner.runCalls,
		}, {
			showCalls: 1,
			existing: item,
			runCalls: 1,
		});
	});

	test('run card opens with Space and becomes read only after open succeeds', async () => {
		const { automationService, sessionsManagementService, sessionsService, widget } = setup();
		automationService.setAutomations([automation()]);
		automationService.setRuns([run()]);
		const card = widget.element.querySelector<HTMLElement>('.automations-run-card-main');

		assert.ok(card);
		dispatchKeydown(card, { key: ' ', code: 'Space', keyCode: 32 });
		assert.deepStrictEqual({
			openCalls: sessionsService.openCalls,
			readBeforeOpen: sessionsManagementService.isRead.get(),
		}, {
			openCalls: 1,
			readBeforeOpen: false,
		});

		sessionsService.openGate.complete();
		await sessionsService.openGate.p;
		await Promise.resolve();

		assert.deepStrictEqual({
			isRead: sessionsManagementService.isRead.get(),
			label: widget.element.querySelector('.automations-run-card-main')?.getAttribute('aria-label'),
		}, {
			isRead: true,
			label: card?.getAttribute('aria-label')?.replace(', Unread', ''),
		});
	});

	test('run remains unread when opening its session fails', async () => {
		const { automationService, dialogService, sessionsManagementService, sessionsService, widget } = setup();
		automationService.setAutomations([automation()]);
		automationService.setRuns([run()]);
		sessionsService.error = new Error('open failed');
		const unreadLabel = widget.element.querySelector('.automations-run-card-main')?.getAttribute('aria-label');

		widget.element.querySelector<HTMLElement>('.automations-run-card-main')?.click();
		sessionsService.openGate.complete();
		await dialogService.errorCalled.p;

		assert.deepStrictEqual({
			isRead: sessionsManagementService.isRead.get(),
			label: widget.element.querySelector('.automations-run-card-main')?.getAttribute('aria-label'),
			error: dialogService.errors,
		}, {
			isRead: false,
			label: unreadLabel,
			error: [{ message: 'Failed to open automation run.', detail: 'open failed' }],
		});
	});

	test('session read state reactively updates run history', () => {
		const { automationService, sessionsManagementService, widget } = setup();
		automationService.setAutomations([automation()]);
		automationService.setRuns([run()]);

		const unreadLabel = widget.element.querySelector('.automations-run-card-main')?.getAttribute('aria-label');
		sessionsManagementService.setRead(true);
		const readLabel = widget.element.querySelector('.automations-run-card-main')?.getAttribute('aria-label');

		assert.deepStrictEqual({
			unreadLabel,
			readLabel,
			markAllVisible: !!widget.element.querySelector('.automations-mark-all-read'),
		}, {
			unreadLabel: readLabel ? `${readLabel}, Unread` : undefined,
			readLabel,
			markAllVisible: false,
		});
	});

	test('mark all as read delegates to session management', async () => {
		const { automationService, sessionsManagementService, widget } = setup();
		automationService.setAutomations([automation()]);
		automationService.setRuns([run(), run({ id: 'run-2' })]);

		widget.element.querySelector<HTMLButtonElement>('.automations-mark-all-read')?.click();
		await sessionsManagementService.markAllReadCompleted.p;
		await Promise.resolve();

		assert.deepStrictEqual({
			isRead: sessionsManagementService.isRead.get(),
			markAllReadCalls: sessionsManagementService.markAllReadCalls,
			markAllReadSessionCount: sessionsManagementService.markAllReadSessionCount,
			markAllVisible: !!widget.element.querySelector('.automations-mark-all-read'),
		}, {
			isRead: true,
			markAllReadCalls: 1,
			markAllReadSessionCount: 1,
			markAllVisible: false,
		});
	});

	test('mark all as read coalesces history rendering', async () => {
		const { automationService, sessionsManagementService, widget } = setup();
		automationService.setAutomations([automation()]);
		automationService.setRuns([
			run(),
			run({ id: 'run-2', sessionResource: SECOND_SESSION_RESOURCE.toString() }),
		]);

		widget.element.querySelector<HTMLButtonElement>('.automations-mark-all-read')?.click();
		await sessionsManagementService.markAllReadCompleted.p;
		await Promise.resolve();

		assert.deepStrictEqual({
			getSessionCalls: sessionsManagementService.getSessionCalls,
			firstIsRead: sessionsManagementService.isRead.get(),
			secondIsRead: sessionsManagementService.secondIsRead.get(),
		}, {
			getSessionCalls: 6,
			firstIsRead: true,
			secondIsRead: true,
		});
	});

	test('stale run sessions cannot be opened but can be removed from history', () => {
		const { automationService, sessionsManagementService, widget } = setup();
		sessionsManagementService.sessionExists = false;
		const staleRun = run();
		automationService.setAutomations([automation()]);
		automationService.setRuns([staleRun]);
		const card = widget.element.querySelector<HTMLElement>('.automations-run-card');
		const runTime = new Date(staleRun.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

		assert.deepStrictEqual({
			role: card?.getAttribute('role'),
			openButton: !!card?.querySelector('.automations-run-card-main[role="button"]'),
			deleteButton: !!card?.querySelector('.automations-run-card-delete-button'),
			deleteLabel: card?.querySelector('.automations-run-card-delete-button')?.getAttribute('aria-label'),
			label: card?.getAttribute('aria-label'),
		}, {
			role: 'group',
			openButton: false,
			deleteButton: true,
			deleteLabel: 'Delete run for Daily review from history',
			label: `Daily review, workspace, Completed, ${runTime}`,
		});
	});

	test('deletes a failed run without a session from history', async () => {
		const { automationService, dialogService, sessionsManagementService, widget } = setup();
		automationService.setAutomations([automation()]);
		automationService.setRuns([run({ status: 'failed', sessionResource: undefined, errorMessage: 'startup failed' })]);
		dialogService.confirmResult = { confirmed: true };

		const deleteButton = widget.element.querySelector<HTMLElement>('.automations-run-card-delete-button');
		assert.ok(deleteButton);
		deleteButton.click();
		await Promise.resolve();
		await Promise.resolve();

		assert.deepStrictEqual({
			confirmation: dialogService.confirmations[0],
			deleteSessionCalls: sessionsManagementService.deleteSessionCalls,
			deleteRunCalls: automationService.deleteRunCalls,
			historyItemStillVisible: !!widget.element.querySelector('.automations-run-card'),
		}, {
			confirmation: {
				message: 'Delete this run from history?',
				detail: 'This will permanently remove the run for "Daily review" from history. This action cannot be undone.',
				primaryButton: 'Delete',
			},
			deleteSessionCalls: 0,
			deleteRunCalls: 1,
			historyItemStillVisible: false,
		});
	});

	test('does not expose history deletion for an active run without a session', () => {
		const { automationService, widget } = setup();
		automationService.setAutomations([automation()]);
		automationService.setRuns([run({ status: 'running', sessionResource: undefined })]);

		assert.strictEqual(widget.element.querySelector('.automations-run-card-delete-button'), null);
	});

	test('does not expose session deletion for an active run', () => {
		const { automationService, widget } = setup();
		automationService.setAutomations([automation()]);
		automationService.setRuns([run({ status: 'running' })]);

		assert.strictEqual(widget.element.querySelector('.automations-run-card-delete-button'), null);
	});

	test('deleting a run session confirms the permanent deletion without opening it', async () => {
		const { automationService, dialogService, sessionsManagementService, sessionsService, widget } = setup();
		automationService.setAutomations([automation()]);
		automationService.setRuns([run()]);
		dialogService.confirmResult = { confirmed: true };

		const deleteButton = widget.element.querySelector<HTMLElement>('.automations-run-card-delete-button');
		assert.ok(deleteButton);
		deleteButton.click();
		await Promise.resolve();
		await Promise.resolve();

		assert.deepStrictEqual({
			confirmation: dialogService.confirmations[0],
			deleteSessionCalls: sessionsManagementService.deleteSessionCalls,
			deleteRunCalls: automationService.deleteRunCalls,
			openCalls: sessionsService.openCalls,
			historyItemStillVisible: !!widget.element.querySelector('.automations-run-card'),
		}, {
			confirmation: {
				message: 'Delete the session for "Daily review"?',
				detail: 'This will permanently delete the session and remove this item from run history. This action cannot be undone.',
				primaryButton: 'Delete',
			},
			deleteSessionCalls: 1,
			deleteRunCalls: 1,
			openCalls: 0,
			historyItemStillVisible: false,
		});
	});

	test('deleting the focused run moves focus to the next run', async () => {
		const { automationService, dialogService, widget } = setup();
		automationService.setAutomations([automation()]);
		automationService.setRuns([
			run(),
			run({ id: 'run-2', sessionResource: SECOND_SESSION_RESOURCE.toString() }),
		]);
		dialogService.confirmResult = { confirmed: true };

		const deleteButton = widget.element.querySelector<HTMLElement>('.automations-run-card-delete-button');
		assert.ok(deleteButton);
		deleteButton.focus();
		deleteButton.click();
		await Promise.resolve();
		await Promise.resolve();
		const remainingOpenButton = widget.element.querySelector<HTMLElement>('.automations-run-card-main[role="button"]');

		assert.deepStrictEqual({
			historyItemCount: widget.element.querySelectorAll('.automations-run-card').length,
			focusedNextRun: document.activeElement === remainingOpenButton,
		}, {
			historyItemCount: 1,
			focusedNextRun: true,
		});
	});

	test('canceling run session deletion keeps the session', async () => {
		const { automationService, dialogService, sessionsManagementService, widget } = setup();
		automationService.setAutomations([automation()]);
		automationService.setRuns([run()]);

		widget.element.querySelector<HTMLElement>('.automations-run-card-delete-button')?.click();
		await Promise.resolve();

		assert.deepStrictEqual({
			confirmations: dialogService.confirmations.length,
			deleteSessionCalls: sessionsManagementService.deleteSessionCalls,
			deleteButtonStillVisible: !!widget.element.querySelector('.automations-run-card-delete-button'),
		}, {
			confirmations: 1,
			deleteSessionCalls: 0,
			deleteButtonStillVisible: true,
		});
	});

	test('keeps run history when session deletion fails', async () => {
		const { automationService, dialogService, sessionsManagementService, widget } = setup();
		automationService.setAutomations([automation()]);
		automationService.setRuns([run()]);
		dialogService.confirmResult = { confirmed: true };
		sessionsManagementService.deleteError = new Error('delete failed');

		widget.element.querySelector<HTMLElement>('.automations-run-card-delete-button')?.click();
		await dialogService.errorCalled.p;

		assert.deepStrictEqual({
			deleteRunCalls: automationService.deleteRunCalls,
			historyItemStillVisible: !!widget.element.querySelector('.automations-run-card'),
			error: dialogService.errors,
		}, {
			deleteRunCalls: 0,
			historyItemStillVisible: true,
			error: [{ message: 'Failed to delete the automation run session.', detail: 'delete failed' }],
		});
	});

	test('does not expose session deletion when the provider does not support it', () => {
		const { automationService, sessionsManagementService, widget } = setup();
		sessionsManagementService.setSupportsDelete(false);
		automationService.setAutomations([automation()]);
		automationService.setRuns([run()]);

		assert.strictEqual(widget.element.querySelector('.automations-run-card-delete-button'), null);
	});

	test('edit conflict is reported to the user', async () => {
		const { automationDialogService, automationService, dialogService, widget } = setup();
		const item = automation();
		automationService.setAutomations([item]);
		automationService.updateResult = { kind: 'conflict', current: automation({ name: 'Changed elsewhere' }) };
		automationDialogService.result = { kind: 'update', id: item.id, value: { name: 'Edited' } };

		widget.element.querySelector<HTMLButtonElement>('.automations-card-main')?.click();
		await dialogService.errorCalled.p;

		assert.deepStrictEqual(dialogService.errors, [{
			message: 'Failed to update automation.',
			detail: 'This automation changed while the dialog was open. Reopen it to review the latest values.',
		}]);
	});

	test('run failures are reported to the user', async () => {
		const { automationService, dialogService, runner, widget } = setup();
		automationService.setAutomations([automation()]);
		runner.whenDispatched = Promise.reject(new Error('runner failed'));

		widget.element.querySelector<HTMLButtonElement>('.automations-card-action-button')?.click();
		await dialogService.errorCalled.p;

		assert.deepStrictEqual(dialogService.errors, [{
			message: 'Failed to run automation.',
			detail: 'runner failed',
		}]);
	});

	test('disabling automations while the dialog is open prevents the update', async () => {
		const { automationDialogService, automationService, configurationService, dialogService, widget } = setup();
		const item = automation();
		automationService.setAutomations([item]);
		automationDialogService.result = { kind: 'update', id: item.id, value: { name: 'Edited' } };
		automationDialogService.beforeReturn = () => configurationService.setUserConfiguration('chat.automations.enabled', false);

		widget.element.querySelector<HTMLButtonElement>('.automations-card-main')?.click();
		await dialogService.infoCalled.p;

		assert.deepStrictEqual({
			info: dialogService.infos,
			updateCalls: automationService.updateCalls,
		}, {
			info: ['Automations are disabled.'],
			updateCalls: 0,
		});
	});

	test('accessible view includes automation and run content', () => {
		assert.strictEqual(
			buildAutomationsAccessibleContent([automation()], [run({ status: 'failed', errorMessage: 'boom' })]).includes('Daily review, Failed'),
			true,
		);
	});
});

suite('AutomationsCustomViewContribution — context key', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function setup() {
		const automationService = new FakeAutomationService();
		const contextKeyService = new MockContextKeyService();
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IAutomationService, automationService);
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(ICustomViewService, new class extends mock<ICustomViewService>() {
			override readonly activeCustomView = constObservable(undefined);
			override registerCustomView() { return { dispose() { } }; }
			override hideCustomView() { }
		}());
		instantiationService.stub(IActionViewItemService, new class extends mock<IActionViewItemService>() {
			override register() { return { dispose() { } }; }
		}());
		const contribution = disposables.add(instantiationService.createInstance(AutomationsCustomViewContribution));
		return { automationService, contextKeyService, contribution };
	}

	test('AutomationsHasItemsContext follows the automations observable (empty → non-empty → empty)', () => {
		const { automationService, contextKeyService } = setup();

		assert.strictEqual(contextKeyService.getContextKeyValue(AutomationsHasItemsContext.key), false, 'initially false');

		automationService.setAutomations([automation()]);
		assert.strictEqual(contextKeyService.getContextKeyValue(AutomationsHasItemsContext.key), true, 'true when non-empty');

		automationService.setAutomations([]);
		assert.strictEqual(contextKeyService.getContextKeyValue(AutomationsHasItemsContext.key), false, 'false when empty again');
	});
});
