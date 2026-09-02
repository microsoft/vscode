/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IContextMenuDelegate } from '../../../../../base/browser/contextmenu.js';
import { ModifierKeyEmitter } from '../../../../../base/browser/dom.js';
import { GestureEvent, EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuMenuDelegate, IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IConfirmation, IConfirmationResult, IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IAutomationDescriptor, IAutomationRun, IAutomationSchedule, AutomationRunTrigger, AutomationTarget } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationDialogResult, IAutomationDialogService, IShowAutomationDialogOptions } from '../../../../../workbench/contrib/chat/common/automations/automationDialogService.js';
import { ChatAutomationsEnabledContext } from '../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { IAutomationRunDispatch, IAutomationRunner, IAutomationRunOperation } from '../../../../../workbench/contrib/chat/common/automations/automationRunner.js';
import { AutomationMutationGuard, IAutomationRunClaim, IAutomationService, ICreateAutomationOptions, IGuardedAutomationUpdateResult, IUpdateAutomationOptions, IUpdateAutomationRunOptions } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { ICustomViewDescriptor } from '../../../../services/customView/browser/customView.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { ICustomViewService } from '../../../../services/customView/browser/customViewService.js';
import { AutomationsHasItemsContext } from '../../../../common/contextkeys.js';
import { buildAutomationsAccessibleContent } from '../../browser/views/automationsAccessibility.js';
import { AutomationsCardsWidget, AutomationsCustomViewContribution } from '../../browser/views/automationsView.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { ISessionsListModelService } from '../../../../services/sessions/browser/sessionsListModelService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { IVoicePlaybackService } from '../../../../../workbench/contrib/chat/common/voicePlaybackService.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IMenuService, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { Menus } from '../../../../browser/menus.js';
import { ArchiveSessionAction } from '../../browser/views/sessionsViewActions.js';
import { MARK_SESSION_READ_COMMAND_ID, MARK_SESSION_UNREAD_COMMAND_ID, UNARCHIVE_SESSION_COMMAND_ID } from '../../../../common/sessionCommands.js';
import { TestCommandService } from './sessionsListTestUtils.js';


const AUTOMATION_ID = 'automation-1';
const RUN_ID = 'run-1';
const SESSION_RESOURCE = URI.parse('vscode-chat-session://test/session-1');
const SECOND_SESSION_RESOURCE = URI.parse('vscode-chat-session://test/session-2');
const FOLDER = URI.parse('file:///workspace');
const ITestAgentSessionsService = createDecorator<object>('agentSessions');

function hourly(): IAutomationSchedule {
	return { interval: 'hourly', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 };
}

function workspaceTarget(): AutomationTarget {
	return { kind: 'workspace', folderUri: FOLDER, isolation: { kind: 'default' } };
}

function automation(overrides: Partial<IAutomationDescriptor> = {}): IAutomationDescriptor {
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
		sessionResource: SESSION_RESOURCE,
		...overrides,
	};
}

function dispatchKeydown(element: HTMLElement, init: KeyboardEventInit & { keyCode: number }): void {
	const event = new KeyboardEvent('keydown', { ...init, bubbles: true });
	Object.defineProperty(event, 'keyCode', { get: () => init.keyCode });
	element.dispatchEvent(event);
}

async function waitForSessionActions(): Promise<void> {
	await timeout(100);
}

class FakeAutomationService extends mock<IAutomationService>() {
	private readonly automationValue = observableValue<readonly IAutomationDescriptor[]>(this, []);
	private readonly runValue = observableValue<readonly IAutomationRun[]>(this, []);
	override readonly automations: IObservable<readonly IAutomationDescriptor[]> = this.automationValue;
	override readonly runs: IObservable<readonly IAutomationRun[]> = this.runValue;
	updateResult: IGuardedAutomationUpdateResult | undefined;
	updateCalls = 0;
	deleteRunCalls = 0;
	createError: Error | undefined;
	deleteError: Error | undefined;
	canDelete = true;
	canUpdate = true;
	readonly createCalls: ICreateAutomationOptions[] = [];
	readonly deleteCalls: string[] = [];
	readonly guardedUpdateCalls: { id: string; patch: IUpdateAutomationOptions; expected: IAutomationDescriptor }[] = [];
	readonly deleteRunCompleted = new DeferredPromise<void>();

	setAutomations(value: readonly IAutomationDescriptor[]): void {
		this.automationValue.set(value, undefined);
	}

	setRuns(value: readonly IAutomationRun[]): void {
		this.runValue.set(value, undefined);
	}

	override getAutomation(id: string): IAutomationDescriptor | undefined {
		return this.automationValue.get().find(item => item.id === id);
	}

	override runsFor(automationId: string): IObservable<readonly IAutomationRun[]> {
		return constObservable(this.runValue.get().filter(item => item.automationId === automationId));
	}

	override async createAutomation(options: ICreateAutomationOptions, mutationGuard?: AutomationMutationGuard): Promise<IAutomationDescriptor> {
		mutationGuard?.();
		this.createCalls.push(options);
		if (this.createError) {
			throw this.createError;
		}
		const created = automation({
			id: `created-automation-${this.createCalls.length}`,
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

	override async updateAutomation(id: string, patch: IUpdateAutomationOptions): Promise<IAutomationDescriptor> {
		const current = this.getAutomation(id);
		if (!current) {
			throw new Error('missing automation');
		}
		const updated: IAutomationDescriptor = {
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

	override async updateAutomationIfUnchanged(id: string, patch: IUpdateAutomationOptions, expected: IAutomationDescriptor, mutationGuard?: AutomationMutationGuard): Promise<IGuardedAutomationUpdateResult> {
		this.updateCalls++;
		this.guardedUpdateCalls.push({ id, patch, expected });
		mutationGuard?.();
		return this.updateResult ?? { kind: 'updated', automation: await this.updateAutomation(id, patch) };
	}

	override async deleteAutomation(id: string, mutationGuard?: AutomationMutationGuard): Promise<void> {
		mutationGuard?.();
		this.deleteCalls.push(id);
		if (this.deleteError) {
			throw this.deleteError;
		}
		this.setAutomations(this.automationValue.get().filter(item => item.id !== id));
		this.setRuns(this.runValue.get().filter(run => run.automationId !== id));
	}

	override canDeleteAutomation(): boolean {
		return this.canDelete;
	}

	override canUpdateAutomation(): boolean {
		return this.canUpdate;
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
		this.deleteRunCompleted.complete();
	}
}

class TestContextMenuService extends mock<IContextMenuService>() {
	override readonly onDidShowContextMenu = Event.None;
	override readonly onDidHideContextMenu = Event.None;
	delegate: IContextMenuDelegate | undefined;
	menuDelegate: IContextMenuMenuDelegate | undefined;

	override showContextMenu(delegate: IContextMenuDelegate | IContextMenuMenuDelegate): void {
		if (this.isMenuDelegate(delegate)) {
			this.menuDelegate = delegate;
		} else {
			this.delegate = delegate;
		}
	}

	private isMenuDelegate(delegate: IContextMenuDelegate | IContextMenuMenuDelegate): delegate is IContextMenuMenuDelegate {
		return (<IContextMenuMenuDelegate>delegate).menuId instanceof MenuId;
	}
}

class FakeAutomationDialogService extends mock<IAutomationDialogService>() {
	result: IAutomationDialogResult | undefined;
	error: Error | undefined;
	beforeReturn: (() => void) | undefined;
	showCalls = 0;
	lastOptions: IShowAutomationDialogOptions | undefined;

	override async showAutomationDialog(options: IShowAutomationDialogOptions): Promise<IAutomationDialogResult | undefined> {
		this.showCalls++;
		this.lastOptions = options;
		if (this.error) {
			throw this.error;
		}
		this.beforeReturn?.();
		return this.result;
	}
}

class TestLogService extends NullLogService {
	readonly errors: { message: string | Error; args: readonly unknown[] }[] = [];

	override error(message: string | Error, ...args: unknown[]): void {
		this.errors.push({ message, args });
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

class TestKeybindingService extends MockKeybindingService {
	readonly lookupCalls: { commandId: string; context: IContextKeyService | undefined; enforceContextCheck: boolean | undefined }[] = [];

	override lookupKeybinding(commandId: string, context?: IContextKeyService, enforceContextCheck?: boolean) {
		this.lookupCalls.push({ commandId, context, enforceContextCheck });
		return undefined;
	}
}

class FakeRunner extends mock<IAutomationRunner>() {
	whenDispatched: Promise<IAutomationRunDispatch> = Promise.resolve({ kind: 'notStarted', reason: 'targetUnavailable' });
	runCalls = 0;

	override runOnce(_automation: IAutomationDescriptor, _trigger: AutomationRunTrigger, _leaderWindowId: number, _token?: CancellationToken): IAutomationRunOperation {
		this.runCalls++;
		return { whenDispatched: this.whenDispatched, whenCompleted: Promise.resolve() };
	}
}

class FakeSessionsService extends mock<ISessionsService>() {
	override readonly visibleSessions = constObservable<readonly (IActiveSession | undefined)[]>([]);
	override readonly activeSession = constObservable<IActiveSession | undefined>(undefined);
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
	private readonly sessionsChangedEmitter = new Emitter<ISessionsChangeEvent>();
	private readonly deletedSessionResources = new Set<string>();
	private readonly additionalSessions = new Map<string, ISession>();
	override readonly onDidDeleteSession = this.sessionDeletedEmitter.event;
	override readonly onDidChangeSessions = this.sessionsChangedEmitter.event;
	sessionExists = true;
	private firstSessionCataloged = true;
	readonly isRead = observableValue<boolean>(this, false);
	readonly secondIsRead = observableValue<boolean>(this, false);
	readonly isArchived = observableValue<boolean>(this, false);
	readonly sessionStatus = observableValue<SessionStatus>(this, SessionStatus.Completed);
	readonly capabilities = observableValue(this, { supportsMultipleChats: false, supportsDelete: true, supportsRename: true });
	readonly session = upcastPartial<ISession>({
		resource: SESSION_RESOURCE,
		sessionId: 'test/session-1',
		providerId: 'test',
		sessionType: 'test',
		icon: Codicon.account,
		createdAt: new Date(),
		workspace: constObservable({
			uri: FOLDER,
			label: 'workspace',
			icon: Codicon.folder,
			folders: [],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
		}),
		isQuickChat: constObservable(false),
		title: constObservable('Daily review'),
		updatedAt: constObservable(new Date()),
		isRead: this.isRead,
		capabilities: this.capabilities,
		status: this.sessionStatus,
		changesets: constObservable([]),
		changes: constObservable([]),
		modelId: constObservable(undefined),
		mode: constObservable(undefined),
		loading: constObservable(false),
		isArchived: this.isArchived,
		description: constObservable(undefined),
		lastTurnEnd: constObservable(undefined),
		chats: constObservable<readonly IChat[]>([]),
		mainChat: constObservable(new class extends mock<IChat>() { }),
	});
	readonly secondSession = upcastPartial<ISession>({
		resource: SECOND_SESSION_RESOURCE,
		sessionId: 'test/session-2',
		providerId: 'test',
		sessionType: 'test',
		icon: Codicon.account,
		createdAt: new Date(),
		workspace: constObservable({
			uri: FOLDER,
			label: 'workspace',
			icon: Codicon.folder,
			folders: [],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
		}),
		isQuickChat: constObservable(false),
		title: constObservable('Second daily review'),
		updatedAt: constObservable(new Date()),
		isRead: this.secondIsRead,
		capabilities: this.capabilities,
		status: this.sessionStatus,
		changesets: constObservable([]),
		changes: constObservable([]),
		modelId: constObservable(undefined),
		mode: constObservable(undefined),
		loading: constObservable(false),
		isArchived: constObservable(false),
		description: constObservable(undefined),
		lastTurnEnd: constObservable(undefined),
		chats: constObservable<readonly IChat[]>([]),
		mainChat: constObservable(new class extends mock<IChat>() { }),
	});
	markAllReadCalls = 0;
	markAllReadSessionCount = 0;
	getSessionCalls = 0;
	deleteSessionCalls = 0;
	readonly archived: ISession[] = [];
	cancelCurrentRequestCalls = 0;
	deleteError: Error | undefined;
	cancelError: Error | undefined;
	readonly markAllReadCompleted = new DeferredPromise<void>();

	override getSessions(): ISession[] {
		if (!this.sessionExists) {
			return [];
		}
		return [...(this.firstSessionCataloged ? [this.session] : []), this.secondSession, ...this.additionalSessions.values()]
			.filter(session => !this.deletedSessionResources.has(session.resource.toString()));
	}

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
		return this.additionalSessions.get(resource.toString());
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

	override async archiveSession(session: ISession): Promise<void> {
		this.archived.push(session);
		if (session === this.session) {
			this.isArchived.set(true, undefined);
		}
	}

	override async cancelCurrentRequest(): Promise<void> {
		this.cancelCurrentRequestCalls++;
		if (this.cancelError) {
			throw this.cancelError;
		}
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
		this.capabilities.set({ supportsMultipleChats: false, supportsDelete, supportsRename: true }, undefined);
	}

	setCapabilities(supportsDelete: boolean, supportsRename: boolean): void {
		this.capabilities.set({ supportsMultipleChats: false, supportsDelete, supportsRename }, undefined);
	}

	addSession(resource: URI, title: string): void {
		this.additionalSessions.set(resource.toString(), upcastPartial<ISession>({
			...this.session,
			resource,
			sessionId: resource.path,
			title: constObservable(title),
			isRead: constObservable(true),
		}));
	}

	setFirstSessionCataloged(cataloged: boolean): void {
		this.firstSessionCataloged = cataloged;
		this.sessionsChangedEmitter.fire({
			added: cataloged ? [this.session] : [],
			removed: cataloged ? [] : [this.session],
			changed: [],
		});
	}

	dispose(): void {
		this.sessionDeletedEmitter.dispose();
		this.sessionsChangedEmitter.dispose();
	}
}

suite('AutomationsCardsWidget', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let archiveActionRegistration: IDisposable;

	suiteSetup(() => archiveActionRegistration = registerAction2(ArchiveSessionAction));
	suiteTeardown(() => archiveActionRegistration.dispose());

	function getSessionAction(widget: AutomationsCardsWidget, label: string): HTMLElement | undefined {
		return [...widget.element.querySelectorAll<HTMLElement>('.automations-run-session-list .action-label')]
			.find(element => element.getAttribute('aria-label') === label || element.title === label);
	}

	function isMarkAllReadVisible(widget: AutomationsCardsWidget): boolean {
		const button = widget.element.querySelector<HTMLElement>('.automations-mark-all-read');
		return !!button && button.style.display !== 'none';
	}

	function setup(archiveWording: 'archive' | 'done' = 'archive') {
		const automationService = new FakeAutomationService();
		const automationDialogService = new FakeAutomationDialogService();
		const contextMenuService = new TestContextMenuService();
		const dialogService = new FakeDialogService();
		const runner = new FakeRunner();
		const sessionsManagementService = disposables.add(new FakeSessionsManagementService());
		const sessionsService = new FakeSessionsService(() => sessionsManagementService.markRead(sessionsManagementService.session));
		const configurationService = new TestConfigurationService({ chat: { automations: { enabled: true }, experimental: { sessionArchiveActionWording: archiveWording } } });
		const logService = new TestLogService();
		const commandService = new TestCommandService();
		const keybindingService = new TestKeybindingService();
		const store = disposables.add(new DisposableStore());
		store.add(toDisposable(() => ModifierKeyEmitter.disposeInstance()));
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(ICommandService, commandService);
		instantiationService.stub(IAccessibilityService, new class extends TestAccessibilityService {
			override isMotionReduced(): boolean { return false; }
		}());
		instantiationService.stub(IMenuService, store.add(instantiationService.createInstance(MenuService)));
		instantiationService.stub(IAutomationService, automationService);
		instantiationService.stub(IAutomationDialogService, automationDialogService);
		instantiationService.stub(IContextMenuService, contextMenuService);
		instantiationService.stub(IDialogService, dialogService);
		instantiationService.stub(IAutomationRunner, runner);
		instantiationService.stub(ISessionsService, sessionsService);
		instantiationService.stub(ISessionsManagementService, sessionsManagementService);
		instantiationService.stub(IConfigurationService, configurationService);
		const contextKeyService = store.add(new ContextKeyService(configurationService));
		ChatAutomationsEnabledContext.bindTo(contextKeyService).set(true);
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IKeybindingService, keybindingService);
		instantiationService.stub(IHoverService, NullHoverService);
		instantiationService.stub(ILogService, logService);
		instantiationService.stub(ISessionsListModelService, new class extends mock<ISessionsListModelService>() {
			override readonly onDidChange = Event.None;
			override isSessionPinned(): boolean { return false; }
			override getStatusIcon() { return Codicon.circleSmallFilled; }
		});
		instantiationService.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
			override readonly onDidChangeProviders = Event.None;
			override getProviders() { return []; }
		});
		instantiationService.stub(IVoicePlaybackService, new class extends mock<IVoicePlaybackService>() {
			override readonly pendingResponseVersion = constObservable(0);
			override hasPendingResponse() { return false; }
		});
		instantiationService.stub(ITestAgentSessionsService, {
			model: {
				observeSession: () => constObservable(undefined),
			},
		});
		instantiationService.stub(IChatService, new class extends mock<IChatService>() {
			override readonly chatModels = constObservable([]);
		});
		instantiationService.stub(ICustomViewService, new class extends mock<ICustomViewService>() {
			override readonly activeCustomView = constObservable(undefined);
			override registerCustomView() { return { dispose() { } }; }
			override hideCustomView() { }
		}());
		disposables.add(instantiationService.createInstance(AutomationsCustomViewContribution));
		const widget = disposables.add(instantiationService.createInstance(AutomationsCardsWidget));
		document.body.append(widget.element);
		disposables.add(toDisposable(() => widget.element.remove()));
		return { automationService, automationDialogService, commandService, configurationService, contextKeyService, contextMenuService, dialogService, instantiationService, keybindingService, logService, runner, sessionsManagementService, sessionsService, widget };
	}

	function dispatchContextMenu(target: HTMLElement): void {
		target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
	}

	test('renders localized schedules and shared session rows', () => {
		const { automationService, widget } = setup();
		const item = automation({ schedule: { interval: 'daily', scheduleHour: 13, scheduleMinute: 5, scheduleDay: 0 } });
		automationService.setAutomations([item]);
		automationService.setRuns([run()]);
		const scheduleTime = new Date(Date.UTC(2000, 0, 1, 13, 5));

		assert.deepStrictEqual({
			schedule: widget.element.querySelector('.automations-card-meta-item')?.textContent,
			sessionTitle: widget.element.querySelector('.automations-run-session-list .monaco-highlighted-label')?.textContent,
			fallbackRows: widget.element.querySelectorAll('.automations-run-card').length,
		}, {
			schedule: `Daily at ${scheduleTime.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })}`,
			sessionTitle: 'Daily review',
			fallbackRows: 0,
		});
	});

	test('preserves a temporary Working row until its session resolves', () => {
		const { automationService, widget } = setup();
		automationService.setAutomations([automation()]);
		const pendingRun = run({ status: 'pending', sessionResource: undefined });
		automationService.setRuns([pendingRun]);
		const temporaryRow = widget.element.querySelector('.automations-temporary-run');
		const spinner = widget.element.querySelector('.automations-temporary-run .session-icon .monaco-pixel-spinner');

		automationService.setRuns([{ ...pendingRun, status: 'running' }]);
		const runningRow = widget.element.querySelector('.automations-temporary-run');
		const runningSpinner = widget.element.querySelector('.automations-temporary-run .session-icon .monaco-pixel-spinner');

		automationService.setRuns([{ ...pendingRun, status: 'running', sessionResource: SESSION_RESOURCE }]);

		assert.deepStrictEqual({
			title: temporaryRow?.querySelector('.session-title')?.textContent,
			status: temporaryRow?.querySelector('.session-description')?.textContent,
			rowPreserved: runningRow === temporaryRow,
			spinnerPreserved: runningSpinner === spinner,
			spinnerUsesSharedIconSlot: spinner?.parentElement?.classList.contains('session-icon'),
			temporaryRowsAfterCommit: widget.element.querySelectorAll('.automations-temporary-run').length,
			sessionRowsAfterCommit: widget.element.querySelectorAll('.automations-run-session-list .session-item').length,
		}, {
			title: 'Daily review',
			status: 'Working...',
			rowPreserved: true,
			spinnerPreserved: true,
			spinnerUsesSharedIconSlot: true,
			temporaryRowsAfterCommit: 0,
			sessionRowsAfterCommit: 1,
		});
	});

	test('keeps a temporary row until a terminal run enters the committed session catalog', () => {
		const { automationService, sessionsManagementService, widget } = setup();
		automationService.setAutomations([automation()]);
		sessionsManagementService.setFirstSessionCataloged(false);
		const pendingRun = run({ status: 'pending', sessionResource: undefined });
		automationService.setRuns([pendingRun]);

		automationService.setRuns([{ ...pendingRun, status: 'completed', sessionResource: SESSION_RESOURCE }]);
		const beforeCatalogCommit = {
			temporaryRows: widget.element.querySelectorAll('.automations-temporary-run').length,
			sessionRows: widget.element.querySelectorAll('.automations-run-session-list .session-item').length,
		};
		sessionsManagementService.setFirstSessionCataloged(true);

		assert.deepStrictEqual({
			beforeCatalogCommit,
			temporaryRowsAfterCommit: widget.element.querySelectorAll('.automations-temporary-run').length,
			sessionRowsAfterCommit: widget.element.querySelectorAll('.automations-run-session-list .session-item').length,
		}, {
			beforeCatalogCommit: {
				temporaryRows: 1,
				sessionRows: 0,
			},
			temporaryRowsAfterCommit: 0,
			sessionRowsAfterCommit: 1,
		});
	});

	test('removes a temporary row when the run fails before session creation', () => {
		const { automationService, widget } = setup();
		automationService.setAutomations([automation()]);
		const pendingRun = run({ status: 'pending', sessionResource: undefined });
		automationService.setRuns([pendingRun]);

		automationService.setRuns([{ ...pendingRun, status: 'failed', errorMessage: 'failed before session creation' }]);

		assert.deepStrictEqual({
			temporaryRows: widget.element.querySelectorAll('.automations-temporary-run').length,
			historyVisible: widget.element.querySelector<HTMLElement>('.automations-history')?.style.display !== 'none',
		}, {
			temporaryRows: 0,
			historyVisible: false,
		});
	});

	test('automation updates preserve card identity and focus', () => {
		const { automationService, widget } = setup();
		automationService.setAutomations([automation()]);
		const card = widget.element.querySelector('.automations-card');
		const editButton = widget.element.querySelector<HTMLButtonElement>('.automations-card-main');
		editButton?.focus();

		automationService.setAutomations([automation({ prompt: 'Updated prompt' })]);

		assert.deepStrictEqual({
			sameCard: widget.element.querySelector('.automations-card') === card,
			focusPreserved: document.activeElement === editButton,
			prompt: widget.element.querySelector('.automations-card-prompt')?.textContent,
		}, {
			sameCard: true,
			focusPreserved: true,
			prompt: 'Updated prompt',
		});
	});

	test('persistent history groups survive updates and dispose on removal', () => {
		const { automationService, widget } = setup();
		automationService.setAutomations([automation()]);

		// Create a run in "today" bucket
		const todayRun = run({ id: 'run-today', startedAt: new Date().toISOString() });
		automationService.setRuns([todayRun]);

		const todayGroup = widget.element.querySelector('.automations-history-group');
		const todayList = todayGroup?.querySelector('.automations-run-session-list');
		assert.ok(todayGroup, 'today group should exist');
		assert.ok(todayList, 'today group should have a session list');

		// Add a second run in same bucket — group identity should be preserved
		const todayRun2 = run({ id: 'run-today-2', startedAt: new Date().toISOString(), sessionResource: SECOND_SESSION_RESOURCE });
		automationService.setRuns([todayRun, todayRun2]);

		const todayGroupAfter = widget.element.querySelector('.automations-history-group');
		assert.deepStrictEqual({
			groupReused: todayGroupAfter === todayGroup,
			listReused: todayGroupAfter?.querySelector('.automations-run-session-list') === todayList,
			rowCount: todayGroupAfter?.querySelectorAll('.session-item').length,
		}, {
			groupReused: true,
			listReused: true,
			rowCount: 2,
		});

		// Remove all runs — group should be disposed and removed from DOM
		automationService.setRuns([]);
		const remainingGroups = widget.element.querySelectorAll('.automations-history-group');
		assert.strictEqual(remainingGroups.length, 0, 'groups should be removed when empty');
	});

	test('run button disables temporarily after click', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { automationService, widget } = setup();
			automationService.setAutomations([automation()]);

			const runButton = widget.element.querySelector<HTMLElement>('.automations-card-run-button');
			assert.ok(runButton);
			assert.ok(runButton.querySelector('.codicon-play'));
			runButton.click();

			const runningState = {
				disabled: runButton.getAttribute('aria-disabled'),
				label: runButton.getAttribute('aria-label'),
			};
			await timeout(10_000);

			assert.deepStrictEqual({
				runningState,
				restoredState: {
					disabled: runButton.getAttribute('aria-disabled'),
					label: runButton.getAttribute('aria-label'),
				},
			}, {
				runningState: {
					disabled: 'true',
					label: 'Running',
				},
				restoredState: {
					disabled: 'false',
					label: 'Run now',
				},
			});
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

	test('empty state is rendered once across repeated empty updates', () => {
		const { automationService, widget } = setup();

		automationService.setAutomations([]);
		automationService.setAutomations([]);

		assert.deepStrictEqual({
			titles: widget.element.querySelectorAll('.automations-cards-empty-title').length,
			descriptions: widget.element.querySelectorAll('.automations-cards-empty-description').length,
			buttons: widget.element.querySelectorAll('.automations-cards-create-button').length,
		}, {
			titles: 1,
			descriptions: 1,
			buttons: 1,
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

	test('card context menu opens create mode seeded with all editable fields', async () => {
		const { automationDialogService, automationService, contextKeyService, contextMenuService, instantiationService, widget } = setup();
		const source = automation({
			name: 'Daily review',
			prompt: 'Review all open issues',
			schedule: { interval: 'weekly', scheduleHour: 9, scheduleMinute: 30, scheduleDay: 1 },
			target: { kind: 'quickChat', providerId: 'provider', sessionTypeId: 'agent' },
			modelId: 'model',
			mode: 'agent',
			permissionLevel: 'autopilot',
			enabled: false,
		});
		automationService.setAutomations([source]);
		automationService.setRuns([run()]);
		const sourceCard = widget.element.querySelector<HTMLElement>('.automations-card');
		assert.ok(sourceCard);

		sourceCard.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
		const delegate = contextMenuService.menuDelegate;
		assert.ok(delegate);
		assert.strictEqual(delegate.menuId, Menus.AutomationCardContext);
		assert.strictEqual(delegate.menuActionOptions?.arg, source);
		const menuActions = instantiationService.get(IMenuService).getMenuActions(
			Menus.AutomationCardContext,
			delegate.contextKeyService ?? contextKeyService,
			delegate.menuActionOptions,
		).flatMap(([, actions]) => actions);
		assert.deepStrictEqual(menuActions.map(action => ({ id: action.id, enabled: action.enabled })), [
			{ id: 'sessions.automations.duplicate', enabled: true },
			{ id: 'sessions.automations.disable', enabled: false },
			{ id: 'sessions.automations.delete', enabled: true },
		]);
		const command = CommandsRegistry.getCommand('sessions.automations.duplicate');
		assert.ok(command);
		await instantiationService.invokeFunction(accessor => command.handler(accessor, source));

		assert.deepStrictEqual({
			dialogOptions: automationDialogService.lastOptions,
			createCalls: automationService.createCalls,
			automationNames: automationService.automations.get().map(item => item.name),
			runCount: automationService.runs.get().length,
		}, {
			dialogOptions: {
				initialValues: {
					name: 'Daily review Copy',
					prompt: 'Review all open issues',
					schedule: source.schedule,
					target: source.target,
					modelId: 'model',
					mode: 'agent',
					permissionLevel: 'autopilot',
					enabled: false,
				},
			},
			createCalls: [],
			automationNames: ['Daily review'],
			runCount: 1,
		});
	});

	test('duplicate creates the automation with values submitted from the dialog', async () => {
		const { automationDialogService, automationService, instantiationService } = setup();
		const source = automation({ name: 'Daily review' });
		const existingCopy = automation({ id: 'copy', name: 'Daily review Copy' });
		automationService.setAutomations([source, existingCopy]);
		const submitted: ICreateAutomationOptions = {
			name: 'Customized copy',
			prompt: 'Customized prompt',
			schedule: { interval: 'hourly', scheduleHour: 10, scheduleMinute: 15, scheduleDay: 2 },
			target: { kind: 'quickChat', providerId: 'provider', sessionTypeId: 'agent' },
			modelId: 'custom-model',
			mode: 'ask',
			permissionLevel: 'default',
			enabled: true,
		};
		automationDialogService.result = { kind: 'create', value: submitted };
		const command = CommandsRegistry.getCommand('sessions.automations.duplicate');
		assert.ok(command);

		await instantiationService.invokeFunction(accessor => command.handler(accessor, source));

		assert.deepStrictEqual({
			initialName: automationDialogService.lastOptions?.initialValues?.name,
			createCalls: automationService.createCalls,
			createdNames: automationService.automations.get().map(item => item.name),
		}, {
			initialName: 'Daily review Copy 2',
			createCalls: [submitted],
			createdNames: ['Customized copy', 'Daily review', 'Daily review Copy'],
		});
	});

	test('duplicate dialog failures are logged and reported to the user', async () => {
		const { automationDialogService, automationService, dialogService, instantiationService, logService } = setup();
		const source = automation();
		const error = new Error('dialog failed');
		automationDialogService.error = error;
		automationService.setAutomations([source]);
		const command = CommandsRegistry.getCommand('sessions.automations.duplicate');
		assert.ok(command);

		await instantiationService.invokeFunction(accessor => command.handler(accessor, source));
		await dialogService.errorCalled.p;

		assert.deepStrictEqual({
			createCalls: automationService.createCalls,
			loggedErrors: logService.errors,
			dialogErrors: dialogService.errors,
		}, {
			createCalls: [],
			loggedErrors: [{
				message: '[Automations] Failed to duplicate automation',
				args: [error],
			}],
			dialogErrors: [{
				message: 'Failed to duplicate automation.',
				detail: 'dialog failed',
			}],
		});
	});

	test('duplicate creation failures are logged and reported to the user', async () => {
		const { automationDialogService, automationService, contextKeyService, contextMenuService, dialogService, instantiationService, logService, widget } = setup();
		const source = automation();
		const error = new Error('create failed');
		automationService.createError = error;
		automationDialogService.result = {
			kind: 'create',
			value: {
				name: 'Daily review Copy',
				prompt: source.prompt,
				schedule: source.schedule,
				target: source.target,
				modelId: source.modelId,
				mode: source.mode,
				permissionLevel: source.permissionLevel,
				enabled: source.enabled,
			},
		};
		automationService.setAutomations([source]);
		const sourceCard = widget.element.querySelector<HTMLElement>('.automations-card');
		assert.ok(sourceCard);

		sourceCard.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
		const delegate = contextMenuService.menuDelegate;
		assert.ok(delegate);
		const duplicateActions = instantiationService.get(IMenuService).getMenuActions(
			Menus.AutomationCardContext,
			delegate.contextKeyService ?? contextKeyService,
			delegate.menuActionOptions,
		).flatMap(([, actions]) => actions);
		assert.deepStrictEqual(duplicateActions.map(action => action.id), ['sessions.automations.duplicate', 'sessions.automations.disable', 'sessions.automations.delete']);
		const command = CommandsRegistry.getCommand('sessions.automations.duplicate');
		assert.ok(command);
		await instantiationService.invokeFunction(accessor => command.handler(accessor, source));
		await dialogService.errorCalled.p;

		assert.deepStrictEqual({
			loggedErrors: logService.errors,
			dialogErrors: dialogService.errors,
		}, {
			loggedErrors: [{
				message: '[Automations] Failed to duplicate automation',
				args: [error],
			}],
			dialogErrors: [{
				message: 'Failed to duplicate automation.',
				detail: 'create failed',
			}],
		});
	});

	test('disable context menu action disables the automation and then becomes unavailable', async () => {
		const { automationService, contextKeyService, contextMenuService, instantiationService, widget } = setup();
		const source = automation();
		automationService.setAutomations([source]);
		const sourceCard = widget.element.querySelector<HTMLElement>('.automations-card');
		assert.ok(sourceCard);
		const getDisableAction = () => {
			sourceCard.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
			const delegate = contextMenuService.menuDelegate;
			assert.ok(delegate);
			return instantiationService.get(IMenuService).getMenuActions(
				Menus.AutomationCardContext,
				delegate.contextKeyService ?? contextKeyService,
				delegate.menuActionOptions,
			).flatMap(([, actions]) => actions).find(action => action.id === 'sessions.automations.disable');
		};
		const command = CommandsRegistry.getCommand('sessions.automations.disable');
		assert.ok(command);

		const initiallyEnabled = getDisableAction()?.enabled;
		await instantiationService.invokeFunction(accessor => command.handler(accessor, source));
		const enabledAfterDisable = getDisableAction()?.enabled;

		assert.deepStrictEqual({
			initiallyEnabled,
			enabledAfterDisable,
			updateCalls: automationService.guardedUpdateCalls,
			automationEnabled: automationService.automations.get()[0].enabled,
		}, {
			initiallyEnabled: true,
			enabledAfterDisable: false,
			updateCalls: [{ id: source.id, patch: { enabled: false }, expected: source }],
			automationEnabled: false,
		});
	});

	test('disable context menu action is unavailable when updates are unsupported', async () => {
		const { automationService, contextKeyService, contextMenuService, instantiationService, widget } = setup();
		automationService.canUpdate = false;
		const source = automation();
		automationService.setAutomations([source]);
		const sourceCard = widget.element.querySelector<HTMLElement>('.automations-card');
		assert.ok(sourceCard);
		sourceCard.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
		const delegate = contextMenuService.menuDelegate;
		assert.ok(delegate);
		const disableAction = instantiationService.get(IMenuService).getMenuActions(
			Menus.AutomationCardContext,
			delegate.contextKeyService ?? contextKeyService,
			delegate.menuActionOptions,
		).flatMap(([, actions]) => actions).find(action => action.id === 'sessions.automations.disable');
		const command = CommandsRegistry.getCommand('sessions.automations.disable');
		assert.ok(command);
		await instantiationService.invokeFunction(accessor => command.handler(accessor, source));

		assert.deepStrictEqual({
			actionEnabled: disableAction?.enabled,
			updateCalls: automationService.guardedUpdateCalls,
		}, {
			actionEnabled: false,
			updateCalls: [],
		});
	});

	test('disable conflicts are logged and reported to the user', async () => {
		const { automationService, dialogService, instantiationService, logService } = setup();
		const source = automation();
		automationService.setAutomations([source]);
		automationService.updateResult = { kind: 'conflict', current: automation({ prompt: 'Changed' }) };
		const command = CommandsRegistry.getCommand('sessions.automations.disable');
		assert.ok(command);

		await instantiationService.invokeFunction(accessor => command.handler(accessor, source));
		await dialogService.errorCalled.p;

		assert.deepStrictEqual({
			automationEnabled: automationService.automations.get()[0].enabled,
			loggedErrors: logService.errors.map(entry => entry.message),
			dialogErrors: dialogService.errors,
		}, {
			automationEnabled: true,
			loggedErrors: ['[Automations] Failed to disable automation'],
			dialogErrors: [{
				message: 'Failed to disable automation.',
				detail: 'This automation changed before it could be disabled. Try again.',
			}],
		});
	});

	test('disable reports when the automation was deleted concurrently', async () => {
		const { automationService, dialogService, instantiationService } = setup();
		const source = automation();
		automationService.setAutomations([source]);
		automationService.updateResult = { kind: 'conflict', current: undefined };
		const command = CommandsRegistry.getCommand('sessions.automations.disable');
		assert.ok(command);

		await instantiationService.invokeFunction(accessor => command.handler(accessor, source));
		await dialogService.errorCalled.p;

		assert.deepStrictEqual(dialogService.errors, [{
			message: 'Failed to disable automation.',
			detail: 'This automation was deleted before it could be disabled.',
		}]);
	});

	test('delete context menu action confirms before deleting the automation and its history', async () => {
		const { automationService, contextMenuService, dialogService, instantiationService, widget } = setup();
		const source = automation();
		automationService.setAutomations([source]);
		automationService.setRuns([run({ automationId: source.id })]);
		const sourceCard = widget.element.querySelector<HTMLElement>('.automations-card');
		assert.ok(sourceCard);
		sourceCard.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
		const delegate = contextMenuService.menuDelegate;
		assert.ok(delegate);
		const command = CommandsRegistry.getCommand('sessions.automations.delete');
		assert.ok(command);

		await instantiationService.invokeFunction(accessor => command.handler(accessor, source));
		dialogService.confirmResult = { confirmed: true };
		await instantiationService.invokeFunction(accessor => command.handler(accessor, source));

		assert.deepStrictEqual({
			confirmations: dialogService.confirmations,
			deleteCalls: automationService.deleteCalls,
			automations: automationService.automations.get(),
			runs: automationService.runs.get(),
		}, {
			confirmations: [{
				message: 'Delete automation "Daily review"?',
				detail: 'This will permanently delete the automation and its run history.',
				primaryButton: 'Delete',
			}, {
				message: 'Delete automation "Daily review"?',
				detail: 'This will permanently delete the automation and its run history.',
				primaryButton: 'Delete',
			}],
			deleteCalls: [source.id],
			automations: [],
			runs: [],
		});
	});

	test('delete context menu action is disabled when deletion is unsupported', async () => {
		const { automationService, contextKeyService, contextMenuService, dialogService, instantiationService, widget } = setup();
		automationService.canDelete = false;
		const source = automation();
		automationService.setAutomations([source]);
		const sourceCard = widget.element.querySelector<HTMLElement>('.automations-card');
		assert.ok(sourceCard);
		sourceCard.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
		const delegate = contextMenuService.menuDelegate;
		assert.ok(delegate);
		const menuActions = instantiationService.get(IMenuService).getMenuActions(
			Menus.AutomationCardContext,
			delegate.contextKeyService ?? contextKeyService,
			delegate.menuActionOptions,
		).flatMap(([, actions]) => actions);
		const command = CommandsRegistry.getCommand('sessions.automations.delete');
		assert.ok(command);
		await instantiationService.invokeFunction(accessor => command.handler(accessor, source));

		assert.deepStrictEqual({
			actions: menuActions.map(action => ({ id: action.id, enabled: action.enabled })),
			confirmations: dialogService.confirmations.length,
			deleteCalls: automationService.deleteCalls,
		}, {
			actions: [
				{ id: 'sessions.automations.duplicate', enabled: true },
				{ id: 'sessions.automations.disable', enabled: true },
				{ id: 'sessions.automations.delete', enabled: false },
			],
			confirmations: 0,
			deleteCalls: [],
		});
	});

	test('delete context menu failures are logged and reported to the user', async () => {
		const { automationService, dialogService, instantiationService, logService } = setup();
		const source = automation();
		const error = new Error('delete failed');
		automationService.deleteError = error;
		automationService.setAutomations([source]);
		dialogService.confirmResult = { confirmed: true };
		const command = CommandsRegistry.getCommand('sessions.automations.delete');
		assert.ok(command);

		await instantiationService.invokeFunction(accessor => command.handler(accessor, source));
		await dialogService.errorCalled.p;

		assert.deepStrictEqual({
			deleteCalls: automationService.deleteCalls,
			automations: automationService.automations.get(),
			loggedErrors: logService.errors,
			dialogErrors: dialogService.errors,
		}, {
			deleteCalls: [source.id],
			automations: [source],
			loggedErrors: [{
				message: '[AutomationsCards] Failed to delete automation',
				args: [error],
			}],
			dialogErrors: [{
				message: 'Failed to delete automation.',
				detail: 'delete failed',
			}],
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
			runCalls: 1,
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

	test('session row opens and becomes read only after open succeeds', async () => {
		const { automationService, sessionsManagementService, sessionsService, widget } = setup();
		automationService.setAutomations([automation()]);
		automationService.setRuns([run()]);
		const row = widget.element.querySelector<HTMLElement>('.automations-run-session-list .monaco-list-row');

		assert.ok(row);
		row.click();
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
			unreadClass: widget.element.querySelector('.automations-run-session-list .session-item')?.classList.contains('unread'),
		}, {
			isRead: true,
			unreadClass: false,
		});
	});

	test('run remains unread when opening its session fails', async () => {
		const { automationService, dialogService, sessionsManagementService, sessionsService, widget } = setup();
		automationService.setAutomations([automation()]);
		automationService.setRuns([run()]);
		sessionsService.error = new Error('open failed');
		const row = widget.element.querySelector<HTMLElement>('.automations-run-session-list .monaco-list-row');
		assert.ok(row);

		row.click();
		sessionsService.openGate.complete();
		await dialogService.errorCalled.p;

		assert.deepStrictEqual({
			isRead: sessionsManagementService.isRead.get(),
			unreadClass: widget.element.querySelector('.automations-run-session-list .session-item')?.classList.contains('unread'),
			error: dialogService.errors,
		}, {
			isRead: false,
			unreadClass: true,
			error: [{ message: 'Failed to open automation run.', detail: 'open failed' }],
		});
	});

	test('session read state reactively updates run history', () => {
		const { automationService, sessionsManagementService, widget } = setup();
		automationService.setAutomations([automation()]);
		automationService.setRuns([run()]);

		const unreadClass = widget.element.querySelector('.automations-run-session-list .session-item')?.classList.contains('unread');
		sessionsManagementService.setRead(true);
		const readClass = widget.element.querySelector('.automations-run-session-list .session-item')?.classList.contains('unread');

		assert.deepStrictEqual({
			unreadClass,
			readClass,
			markAllVisible: isMarkAllReadVisible(widget),
		}, {
			unreadClass: true,
			readClass: false,
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
			markAllVisible: isMarkAllReadVisible(widget),
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
			run({ id: 'run-2', sessionResource: SECOND_SESSION_RESOURCE }),
		]);

		const markAllButton = widget.element.querySelector<HTMLButtonElement>('.automations-mark-all-read');
		assert.ok(markAllButton);
		markAllButton.click();
		const disabledWhileMarking = markAllButton.getAttribute('aria-disabled');
		await sessionsManagementService.markAllReadCompleted.p;
		await Promise.resolve();

		assert.deepStrictEqual({
			disabledWhileMarking,
			firstIsRead: sessionsManagementService.isRead.get(),
			secondIsRead: sessionsManagementService.secondIsRead.get(),
		}, {
			disabledWhileMarking: 'true',
			firstIsRead: true,
			secondIsRead: true,
		});
	});

	test('omits runs without a resolvable session from run history', () => {
		const { automationService, widget } = setup();
		automationService.setAutomations([automation()]);
		automationService.setRuns([
			run({ id: 'run-sessionless', sessionResource: undefined }),
			run({ id: 'run-stale', sessionResource: URI.parse('vscode-chat-session://test/stale') }),
		]);
		const hiddenWithoutSessions = widget.element.querySelector<HTMLElement>('.automations-history')?.style.display === 'none';
		const emptyGroups = widget.element.querySelectorAll('.automations-history-group').length;

		automationService.setRuns([
			run(),
			run({ id: 'run-sessionless', sessionResource: undefined }),
			run({ id: 'run-stale', sessionResource: URI.parse('vscode-chat-session://test/stale') }),
			run({ id: 'run-b', sessionResource: SECOND_SESSION_RESOURCE }),
		]);

		const titles = [...widget.element.querySelectorAll('.automations-run-session-list .monaco-highlighted-label')]
			.map(element => element.textContent)
			.sort();

		assert.deepStrictEqual({
			hiddenWithoutSessions,
			emptyGroups,
			lists: widget.element.querySelectorAll('.automations-run-session-list').length,
			rows: widget.element.querySelectorAll('.automations-run-session-list .session-item').length,
			fallbackRows: widget.element.querySelectorAll('.automations-run-card').length,
			titles,
		}, {
			hiddenWithoutSessions: true,
			emptyGroups: 0,
			lists: 1,
			rows: 2,
			fallbackRows: 0,
			titles: ['Daily review', 'Second daily review'],
		});
	});

	test('does not expose session deletion for an active run', async () => {
		const { automationService, sessionsManagementService, widget } = setup();
		sessionsManagementService.sessionStatus.set(SessionStatus.InProgress, undefined);
		automationService.setAutomations([automation()]);
		automationService.setRuns([run({ status: 'running' })]);
		await waitForSessionActions();

		assert.deepStrictEqual({
			deleteVisible: !!getSessionAction(widget, 'Delete'),
			stopVisible: !!getSessionAction(widget, 'Stop'),
		}, {
			deleteVisible: false,
			stopVisible: true,
		});
	});

	test('history context menu shows state-specific actions and forwards the session', async () => {
		const { automationService, commandService, contextMenuService, sessionsManagementService, widget } = setup();
		automationService.setAutomations([automation()]);
		automationService.setRuns([run()]);
		await waitForSessionActions();
		const row = widget.element.querySelector<HTMLElement>('.automations-run-session-list .session-item');
		assert.ok(row);

		dispatchContextMenu(row);
		const unreadDelegate = contextMenuService.delegate;
		const unreadActions = unreadDelegate?.getActions() ?? [];
		const archiveLabel = unreadActions.find(action => action.id === 'sessionsViewPane.archiveSession')?.label;
		const markReadAction = unreadActions.find(action => action.id === MARK_SESSION_READ_COMMAND_ID);
		assert.ok(markReadAction);
		await unreadDelegate?.actionRunner?.run(markReadAction, unreadDelegate.getActionsContext?.());
		unreadDelegate?.onHide?.(false);

		sessionsManagementService.setRead(true);
		dispatchContextMenu(row);
		const readDelegate = contextMenuService.delegate;
		const readActionIds = (readDelegate?.getActions() ?? []).map(action => action.id);
		readDelegate?.onHide?.(false);

		assert.deepStrictEqual({
			unreadActionIds: unreadActions.map(action => action.id),
			archiveLabel,
			readActionIds,
			commandCalls: commandService.calls.map(call => ({
				commandId: call.commandId,
				argCount: call.args.length,
				hasExpectedSessions: Array.isArray(call.args[0]) && call.args[0].length === 1 && call.args[0][0] === sessionsManagementService.session,
			})),
		}, {
			unreadActionIds: [
				MARK_SESSION_READ_COMMAND_ID,
				'vs.actions.separator',
				'sessionsViewPane.renameSession',
				'sessionsViewPane.archiveSession',
			],
			archiveLabel: 'Archive',
			readActionIds: [
				MARK_SESSION_UNREAD_COMMAND_ID,
				'vs.actions.separator',
				'sessionsViewPane.renameSession',
				'sessionsViewPane.archiveSession',
			],
			commandCalls: [{
				commandId: MARK_SESSION_READ_COMMAND_ID,
				argCount: 1,
				hasExpectedSessions: true,
			}],
		});
	});

	test('history context menu only shows keybindings valid for the row context', async () => {
		const { automationService, contextMenuService, keybindingService, widget } = setup();
		automationService.setAutomations([automation()]);
		automationService.setRuns([run()]);
		await waitForSessionActions();
		const row = widget.element.querySelector<HTMLElement>('.automations-run-session-list .session-item');
		assert.ok(row);

		dispatchContextMenu(row);
		const delegate = contextMenuService.delegate;
		const renameAction = delegate?.getActions().find(action => action.id === 'sessionsViewPane.renameSession');
		assert.ok(renameAction);
		keybindingService.lookupCalls.length = 0;
		delegate?.getKeyBinding?.(renameAction);
		delegate?.onHide?.(false);

		assert.deepStrictEqual(keybindingService.lookupCalls.map(call => ({
			commandId: call.commandId,
			hasContext: !!call.context,
			enforceContextCheck: call.enforceContextCheck,
		})), [{
			commandId: 'sessionsViewPane.renameSession',
			hasContext: true,
			enforceContextCheck: true,
		}]);
	});

	test('history context menu gates actions by session state and capabilities', async () => {
		const { automationService, contextMenuService, sessionsManagementService, widget } = setup();
		sessionsManagementService.sessionStatus.set(SessionStatus.InProgress, undefined);
		sessionsManagementService.setCapabilities(false, false);
		sessionsManagementService.isArchived.set(true, undefined);
		automationService.setAutomations([automation()]);
		automationService.setRuns([run({ status: 'running' })]);
		await waitForSessionActions();
		const row = widget.element.querySelector<HTMLElement>('.automations-run-session-list .session-item');
		assert.ok(row);

		dispatchContextMenu(row);
		const delegate = contextMenuService.delegate;
		const actionIds = (delegate?.getActions() ?? []).map(action => action.id);
		delegate?.onHide?.(false);

		assert.deepStrictEqual(actionIds, [UNARCHIVE_SESSION_COMMAND_ID]);
	});

	test('history context menu follows Mark as Done archive wording', async () => {
		const { automationService, contextMenuService, sessionsManagementService, widget } = setup('done');
		automationService.setAutomations([automation()]);
		automationService.setRuns([run()]);
		await waitForSessionActions();
		const row = widget.element.querySelector<HTMLElement>('.automations-run-session-list .session-item');
		assert.ok(row);

		dispatchContextMenu(row);
		const activeActions = contextMenuService.delegate?.getActions() ?? [];
		const markAsDoneLabel = activeActions.find(action => action.id === 'sessionsViewPane.archiveSession')?.label;
		contextMenuService.delegate?.onHide?.(false);

		sessionsManagementService.isArchived.set(true, undefined);
		dispatchContextMenu(row);
		const archivedActions = contextMenuService.delegate?.getActions() ?? [];
		const restoreLabel = archivedActions.find(action => action.id === UNARCHIVE_SESSION_COMMAND_ID)?.label;
		contextMenuService.delegate?.onHide?.(false);

		assert.deepStrictEqual({ markAsDoneLabel, restoreLabel }, {
			markAsDoneLabel: 'Mark as Done',
			restoreLabel: 'Restore',
		});
	});

	test('stops an active run without opening its session', async () => {
		const { automationService, sessionsManagementService, sessionsService, widget } = setup();
		sessionsManagementService.sessionStatus.set(SessionStatus.InProgress, undefined);
		automationService.setAutomations([automation()]);
		automationService.setRuns([run({ status: 'running' })]);
		await waitForSessionActions();

		const stopButton = getSessionAction(widget, 'Stop');
		assert.ok(stopButton);
		stopButton.click();
		await Promise.resolve();

		assert.deepStrictEqual({
			label: stopButton.getAttribute('aria-label') ?? stopButton.title,
			cancelCurrentRequestCalls: sessionsManagementService.cancelCurrentRequestCalls,
			openCalls: sessionsService.openCalls,
			deleteButtonVisible: !!getSessionAction(widget, 'Delete'),
		}, {
			label: 'Stop',
			cancelCurrentRequestCalls: 1,
			openCalls: 0,
			deleteButtonVisible: false,
		});
	});

	test('re-enables Stop when cancellation fails', async () => {
		const { automationService, dialogService, sessionsManagementService, widget } = setup();
		sessionsManagementService.sessionStatus.set(SessionStatus.InProgress, undefined);
		automationService.setAutomations([automation()]);
		automationService.setRuns([run({ status: 'running' })]);
		sessionsManagementService.cancelError = new Error('stop failed');
		await waitForSessionActions();

		const stopButton = getSessionAction(widget, 'Stop');
		assert.ok(stopButton);
		stopButton.click();
		await dialogService.errorCalled.p;

		assert.deepStrictEqual({
			enabled: !stopButton.classList.contains('disabled'),
			error: dialogService.errors,
		}, {
			enabled: true,
			error: [{ message: 'Failed to stop the automation run session.', detail: 'stop failed' }],
		});
	});

	test('archives a run session without opening it and hides the action', async () => {
		const { automationService, sessionsManagementService, sessionsService, widget } = setup();
		automationService.setAutomations([automation()]);
		automationService.setRuns([run()]);
		await waitForSessionActions();

		const archiveButton = getSessionAction(widget, 'Archive');
		assert.ok(archiveButton);
		archiveButton.click();
		await waitForSessionActions();

		assert.deepStrictEqual({
			archived: sessionsManagementService.archived.map(session => session.sessionId),
			openCalls: sessionsService.openCalls,
			archiveButtonVisible: !!getSessionAction(widget, 'Archive'),
		}, {
			archived: ['test/session-1'],
			openCalls: 0,
			archiveButtonVisible: false,
		});
	});

	test('does not expose delete action on run history rows', async () => {
		const { automationService, contextMenuService, widget } = setup();
		automationService.setAutomations([automation()]);
		automationService.setRuns([run()]);
		await waitForSessionActions();

		assert.strictEqual(getSessionAction(widget, 'Delete'), undefined, 'delete absent from toolbar');

		const row = widget.element.querySelector<HTMLElement>('.automations-run-session-list .session-item');
		assert.ok(row);
		dispatchContextMenu(row);
		const actionIds = (contextMenuService.delegate?.getActions() ?? []).map(a => a.id);
		contextMenuService.delegate?.onHide?.(false);
		assert.ok(!actionIds.includes('sessions.automations.deleteRunSession'), 'delete absent from context menu');
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

	test('edit dialog failures are logged and reported to the user', async () => {
		const { automationDialogService, automationService, dialogService, logService, widget } = setup();
		const item = automation();
		automationService.setAutomations([item]);
		const error = new Error('dialog failed');
		automationDialogService.error = error;

		widget.element.querySelector<HTMLButtonElement>('.automations-card-main')?.click();
		await dialogService.errorCalled.p;

		assert.deepStrictEqual({
			loggedErrors: logService.errors,
			dialogErrors: dialogService.errors,
		}, {
			loggedErrors: [{
				message: '[AutomationsCards] Failed to update automation',
				args: [error],
			}],
			dialogErrors: [{
				message: 'Failed to update automation.',
				detail: 'dialog failed',
			}],
		});
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

	test('running run shows needs-input indicator when session status transitions to NeedsInput', async () => {
		const { automationService, sessionsManagementService, widget } = setup();
		sessionsManagementService.sessionStatus.set(SessionStatus.InProgress, undefined);
		automationService.setAutomations([automation()]);
		automationService.setRuns([run({ status: 'running' })]);

		const card = widget.element.querySelector<HTMLElement>('.automations-run-session-list .session-item');
		assert.ok(card);
		assert.strictEqual(card.classList.contains('needs-input'), false);

		sessionsManagementService.sessionStatus.set(SessionStatus.NeedsInput, undefined);
		await waitForSessionActions();

		const updatedCard = widget.element.querySelector<HTMLElement>('.automations-run-session-list .session-item');
		assert.ok(updatedCard);
		assert.strictEqual(updatedCard.classList.contains('needs-input'), true);
		assert.ok(getSessionAction(widget, 'Stop'));
	});

	test('needs-input indicator reverts when session status returns to InProgress', () => {
		const { automationService, sessionsManagementService, widget } = setup();
		sessionsManagementService.sessionStatus.set(SessionStatus.InProgress, undefined);
		automationService.setAutomations([automation()]);
		automationService.setRuns([run({ status: 'running' })]);
		sessionsManagementService.sessionStatus.set(SessionStatus.NeedsInput, undefined);

		assert.strictEqual(widget.element.querySelector('.automations-run-session-list .session-item')?.classList.contains('needs-input'), true);

		sessionsManagementService.sessionStatus.set(SessionStatus.InProgress, undefined);

		const card = widget.element.querySelector<HTMLElement>('.automations-run-session-list .session-item');
		assert.ok(card);
		assert.strictEqual(card.classList.contains('needs-input'), false);
	});
});

suite('AutomationsCustomViewContribution — context key', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(automationsEnabled = true) {
		const automationService = new FakeAutomationService();
		const contextKeyService = new MockContextKeyService();
		ChatAutomationsEnabledContext.bindTo(contextKeyService).set(automationsEnabled);
		let restore: boolean | undefined;
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IAutomationService, automationService);
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(ICustomViewService, new class extends mock<ICustomViewService>() {
			override readonly activeCustomView = constObservable(undefined);
			override registerCustomView(_descriptor: ICustomViewDescriptor, options?: { readonly restore?: boolean }) {
				restore = options?.restore;
				return { dispose() { } };
			}
			override hideCustomView() { }
		}());
		instantiationService.stub(IActionViewItemService, new class extends mock<IActionViewItemService>() {
			override register() { return { dispose() { } }; }
		}());
		const contribution = disposables.add(instantiationService.createInstance(AutomationsCustomViewContribution));
		return { automationService, contextKeyService, contribution, restore };
	}

	test('AutomationsHasItemsContext follows the automations observable (empty → non-empty → empty)', () => {
		const { automationService, contextKeyService } = setup();

		assert.strictEqual(contextKeyService.getContextKeyValue(AutomationsHasItemsContext.key), false, 'initially false');

		automationService.setAutomations([automation()]);
		assert.strictEqual(contextKeyService.getContextKeyValue(AutomationsHasItemsContext.key), true, 'true when non-empty');

		automationService.setAutomations([]);
		assert.strictEqual(contextKeyService.getContextKeyValue(AutomationsHasItemsContext.key), false, 'false when empty again');
	});

	test('restores the Automations view only when the feature is enabled', () => {
		assert.deepStrictEqual({
			enabled: setup(true).restore,
			disabled: setup(false).restore,
		}, {
			enabled: true,
			disabled: false,
		});
	});
});
