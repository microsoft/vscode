/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { raceCancellationError, raceTimeout } from '../../../../base/common/async.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IButton } from '../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { ISelectOptionItem, SelectBox } from '../../../../base/browser/ui/selectBox/selectBox.js';
import { Checkbox } from '../../../../base/browser/ui/toggle/toggle.js';
import { IAction } from '../../../../base/common/actions.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, disposableObservableValue, IObservable, ISettableObservable, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { SuggestController } from '../../../../editor/contrib/suggest/browser/suggestController.js';
import { Context as SuggestContext } from '../../../../editor/contrib/suggest/browser/suggest.js';
import { State as SuggestState } from '../../../../editor/contrib/suggest/browser/suggestModel.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ActionListItemKind, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { Link } from '../../../../platform/opener/browser/link.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { defaultCheckboxStyles, defaultInputBoxStyles, defaultSelectBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { hasNativeContextMenu } from '../../../../platform/window/common/window.js';
import { IWorkspacePickerItem, WorkspacePicker } from '../../chat/browser/sessionWorkspacePicker.js';
import { BranchPicker, IBranchPickerBranch } from '../../chat/browser/branchPicker.js';
import { MobileSessionTypePicker } from '../../chat/browser/mobile/mobileSessionTypePicker.js';
import { isMobilePickerSheetTarget } from '../../../browser/parts/mobile/mobilePickerSheet.js';
import { ISession, ISessionWorkspaceBrowseAction, SESSION_WORKSPACE_GROUP_LOCAL } from '../../../services/sessions/common/session.js';
import { IGitRepository, IGitService } from '../../../../workbench/contrib/git/common/gitService.js';
import { AutomationInterval, AutomationTarget } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { DAYS_OF_WEEK } from '../../../../workbench/contrib/chat/common/automations/schedule.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ChatAgentLocation } from '../../../../workbench/contrib/chat/common/constants.js';
import { AgentSessionTarget } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { IChatWidget, ISessionTypePickerDelegate } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ChatInputPart, IChatInputPartOptions, IChatInputStyles } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputPart.js';
import { ChatInputPickerResponsiveLayout, IChatInputPickerResponsiveLayoutItem } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputPickerResponsiveLayout.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { AutomationIsolationModel, normalizeAutomationBranchNames } from '../common/isolationGroupModel.js';
import { IProviderSessionType, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IAutomationSessionConfiguration } from '../../../services/sessions/common/sessionsProvider.js';
import { showMobileWorkspacePickerSheet, shouldUseMobileWorkspacePickerSheet } from '../../chat/browser/mobile/mobileWorkspacePickerSheet.js';
import { AutomationInputCompletions } from './automationInputCompletions.js';
import { NewChatModelPickerService, INewChatModelPickerService } from '../../chat/browser/newChatModelPicker.js';
import { createNewSessionConfigToolbar, createNewSessionControlToolbar } from '../../chat/browser/newSessionConfigToolbars.js';
import { ISessionModelSelection, SessionModelSelection } from '../../chat/browser/sessionModelSelection.js';
import { ISessionContext, SessionContext } from '../../../services/sessions/browser/sessionContext.js';
import { VisibleSession } from '../../../services/sessions/browser/visibleSessions.js';
import { setActiveSessionContextKeys } from '../../../services/sessions/common/sessionContextKeys.js';
import { SessionUsesCombinedConfigPickerContext } from '../../../common/contextkeys.js';
import { Menus } from '../../../browser/menus.js';

const $ = DOM.$;

const INTERVALS: { readonly value: AutomationInterval; readonly label: string }[] = [
	{ value: 'manual', label: localize('automation.interval.manual', "Manual") },
	{ value: 'hourly', label: localize('automation.interval.hourly', "Hourly") },
	{ value: 'daily', label: localize('automation.interval.daily', "Daily") },
	{ value: 'weekly', label: localize('automation.interval.weekly', "Weekly") },
];

// Picker popups mount outside the dialog, so allow their focus targets through its focus trap.
export function isAutomationDialogPopupTarget(relatedTarget: HTMLElement): boolean {
	return isMobilePickerSheetTarget(relatedTarget) || !!relatedTarget.closest(
		'.context-view, .quick-input-widget, .monaco-menu-container, .monaco-hover, .monaco-hover-content, .suggest-widget'
	);
}

export function shouldPassThroughAutomationDialogCommand(commandId: string, target: HTMLElement): boolean {
	return commandId === 'acceptSelectedSuggestion'
		|| ((commandId === 'undo' || commandId === 'redo') && DOM.isEditableElement(target));
}

export async function canSelectAutomationWorkspace(
	folderUri: URI,
	preferredProviderId: string | undefined,
	sessionsManagementService: ISessionsManagementService,
	workspaceTrustRequestService: IWorkspaceTrustRequestService,
): Promise<boolean> {
	const resolved = sessionsManagementService.resolveWorkspace(folderUri, preferredProviderId);
	if (!resolved) {
		return false;
	}
	if (!resolved.workspace.requiresWorkspaceTrust) {
		return true;
	}
	return !!await workspaceTrustRequestService.requestResourcesTrust({
		uri: folderUri,
		message: localize('automation.form.trustFolderMessage', "An agent session will be able to read files, run commands, and make changes in this folder."),
	});
}

interface IAutomationDialogKeyboardNavigation extends IDisposable {
	focusFirst(): void;
}

/** Keeps keyboard focus within the Automations form while allowing owned popups to handle Escape first. */
export function registerAutomationDialogKeyboardNavigation(
	targetWindow: Window & typeof globalThis,
	getFocusableElements: () => readonly HTMLElement[],
	isPopupTarget: (target: HTMLElement) => boolean,
	acceptPromptSuggestion: () => boolean = () => false,
): IAutomationDialogKeyboardNavigation {
	const store = new DisposableStore();
	let suppressPopupEscapeKeyUp = false;

	const visibleFocusableElements = (): readonly HTMLElement[] => getFocusableElements().filter(element => {
		if (!element.isConnected || element.tabIndex < 0 || element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true') {
			return false;
		}
		for (let current: HTMLElement | null = element; current; current = current.parentElement) {
			if (current.hidden || current.hasAttribute('inert') || current.getAttribute('aria-hidden') === 'true') {
				return false;
			}
			const style = targetWindow.getComputedStyle(current);
			if (style.display === 'none' || style.visibility === 'hidden') {
				return false;
			}
		}
		return true;
	});

	store.add(DOM.addDisposableListener(targetWindow, DOM.EventType.KEY_DOWN, (event: KeyboardEvent) => {
		const target = event.target;
		if (target instanceof targetWindow.HTMLElement && isPopupTarget(target)) {
			suppressPopupEscapeKeyUp = event.key === 'Escape';
			return;
		}
		suppressPopupEscapeKeyUp = false;
		if (event.key !== 'Tab') {
			return;
		}
		if (!event.shiftKey && acceptPromptSuggestion()) {
			event.preventDefault();
			event.stopImmediatePropagation();
			return;
		}

		const focusableElements = visibleFocusableElements();
		if (focusableElements.length === 0) {
			return;
		}
		const activeElement = targetWindow.document.activeElement;
		let focusedIndex = focusableElements.findIndex(element => element === activeElement);
		if (focusedIndex < 0) {
			focusedIndex = focusableElements.findIndex(element => !!activeElement && element.contains(activeElement));
		}
		if (focusedIndex < 0) {
			focusedIndex = event.shiftKey ? 0 : -1;
		}
		const nextIndex = event.shiftKey
			? (focusedIndex - 1 + focusableElements.length) % focusableElements.length
			: (focusedIndex + 1) % focusableElements.length;
		event.preventDefault();
		event.stopImmediatePropagation();
		focusableElements[nextIndex].focus();
	}, true));

	store.add(DOM.addDisposableListener(targetWindow, DOM.EventType.KEY_UP, (event: KeyboardEvent) => {
		if (event.key === 'Escape' && suppressPopupEscapeKeyUp) {
			suppressPopupEscapeKeyUp = false;
			event.stopImmediatePropagation();
			return;
		}
		suppressPopupEscapeKeyUp = false;
	}, true));

	return {
		focusFirst: () => visibleFocusableElements()[0]?.focus(),
		dispose: () => store.dispose(),
	};
}

export interface IFormState {
	name: string;
	interval: AutomationInterval;
	hour: number;
	minute: number;
	day: number;
	isQuickChat: boolean;
	folderUri: URI | undefined;
	providerId: string | undefined;
	sessionTypeId: string | undefined;
	isolationMode: string | undefined;
	branch: string | undefined;
	enabled: boolean;
}

export interface IValidationState {
	nameError: string | undefined;
	promptError: string | undefined;
	folderError: string | undefined;
	sessionTypeError: string | undefined;
	branchError: string | undefined;
}

interface IRenderFormHandle {
	readonly getPrompt: () => string;
	readonly getSessionConfiguration: (token: CancellationToken) => Promise<AutomationSessionConfigurationCapture>;
	readonly getBranch: () => string | undefined;
	readonly waitForAutomationSessionSync: (token: CancellationToken) => Promise<void>;
	readonly setSaving: (saving: boolean) => void;
	readonly showSessionConfigurationError: (message: string | undefined) => void;
	readonly focusSessionConfigurationError: () => void;
	readonly getFocusableElements: () => readonly HTMLElement[];
	readonly acceptPromptSuggestion: () => boolean;
}

export type AutomationSessionDraftTarget =
	| { readonly kind: 'workspace'; readonly folderUri: URI; readonly providerId: string | undefined; readonly sessionTypeId: string; readonly sessionConfiguration?: IAutomationSessionConfiguration }
	| { readonly kind: 'quickChat'; readonly providerId: string; readonly sessionTypeId: string; readonly sessionConfiguration?: IAutomationSessionConfiguration };

type AutomationSessionDraftService = Pick<
	ISessionsManagementService,
	'automationSession' | 'createAutomationSession' | 'createAutomationQuickChat' | 'discardAutomationSession' | 'getAutomationSessionConfiguration' | 'supportsAutomationSessionConfiguration' | 'isNewSessionTargetAvailable' | 'isQuickChatTargetAvailable'
>;

export type AutomationSessionConfigurationCapture =
	| { readonly kind: 'captured'; readonly configuration: IAutomationSessionConfiguration }
	| { readonly kind: 'preserved'; readonly configuration: IAutomationSessionConfiguration | undefined }
	| { readonly kind: 'failed'; readonly error: unknown };

const AUTOMATION_CONFIGURATION_CAPTURE_TIMEOUT_MS = 5_000;
const AUTOMATION_CONFIGURATION_RETARGET_CAPTURE_TIMEOUT_MS = 1_000;

export class AutomationSessionDraftSynchronizer extends Disposable {
	readonly availability = observableValue<'idle' | 'pending' | 'available' | 'unavailable'>(this, 'idle');
	private readonly configurationsByTarget = new Map<string, IAutomationSessionConfiguration>();
	private requestedTarget: AutomationSessionDraftTarget | undefined;
	private appliedTarget: AutomationSessionDraftTarget | undefined;
	private appliedConfiguration: IAutomationSessionConfiguration | undefined;
	private session: ISession | undefined;
	private generation = 0;
	private syncScheduled = false;
	private syncInProgress = false;
	private syncPromise = Promise.resolve();
	private disposed = false;
	private synchronizationError: unknown | undefined;

	constructor(
		private readonly sessionsManagementService: AutomationSessionDraftService,
		private readonly canSelectWorkspace: (folderUri: URI, preferredProviderId: string | undefined) => Promise<boolean>,
		private readonly onError: (error: unknown) => void,
		private readonly configurationCaptureTimeoutMs = AUTOMATION_CONFIGURATION_CAPTURE_TIMEOUT_MS,
		private readonly retargetConfigurationCaptureTimeoutMs = AUTOMATION_CONFIGURATION_RETARGET_CAPTURE_TIMEOUT_MS,
	) {
		super();
	}

	update(target: AutomationSessionDraftTarget | undefined): void {
		if (this.targetsEqual(this.requestedTarget, target)
			&& (!target || this.syncScheduled || this.syncInProgress || !!this.session && this.sessionsManagementService.automationSession.get()?.sessionId === this.session.sessionId)) {
			return;
		}
		if (target?.sessionConfiguration) {
			const key = this.targetKey(target);
			if (!this.configurationsByTarget.has(key)) {
				this.configurationsByTarget.set(key, target.sessionConfiguration);
			}
		}
		this.requestedTarget = target;
		this.generation++;
		this.synchronizationError = undefined;
		this.availability.set(target ? 'pending' : 'idle', undefined);
		this.scheduleSync();
	}

	async waitForSync(token: CancellationToken = CancellationToken.None): Promise<void> {
		let pendingSync: Promise<void>;
		do {
			pendingSync = this.syncPromise;
			await raceCancellationError(pendingSync, token);
		} while (pendingSync !== this.syncPromise);
	}

	async getSessionConfiguration(token: CancellationToken = CancellationToken.None): Promise<AutomationSessionConfigurationCapture> {
		const deadline = Date.now() + this.configurationCaptureTimeoutMs;
		while (!this.disposed) {
			const synchronized = await this.waitForResultBeforeDeadline(this.waitForSync(token), deadline, token);
			if (!synchronized) {
				return this.captureFailed(new Error(`Timed out after ${this.configurationCaptureTimeoutMs}ms while synchronizing the Automation session configuration.`));
			}
			const generation = this.generation;
			const session = this.session;
			const target = this.requestedTarget;
			if (!session || !target) {
				if (this.synchronizationError) {
					return { kind: 'failed', error: this.synchronizationError };
				}
				return { kind: 'preserved', configuration: this.configurationForTarget(target) };
			}
			const remaining = deadline - Date.now();
			if (remaining <= 0) {
				return this.captureFailed(new Error(`Timed out after ${this.configurationCaptureTimeoutMs}ms while capturing the Automation session configuration.`));
			}
			const captured = await this.captureSessionConfiguration(session, target, remaining, token);
			if (generation !== this.generation || session !== this.session) {
				continue;
			}
			return captured;
		}
		return { kind: 'preserved', configuration: this.configurationForTarget(this.requestedTarget) };
	}

	private scheduleSync(): void {
		this.syncScheduled = true;
		if (this.syncInProgress) {
			return;
		}
		this.syncInProgress = true;
		this.syncPromise = (async () => {
			try {
				while (this.syncScheduled && !this.disposed) {
					this.syncScheduled = false;
					await this.sync(this.generation);
				}
			} finally {
				this.syncInProgress = false;
			}
		})();
	}

	private async sync(generation: number): Promise<void> {
		const target = this.requestedTarget;
		if (!target) {
			this.discardSession();
			this.availability.set('idle', undefined);
			return;
		}
		if (this.matchesAppliedTarget(target)) {
			this.availability.set('available', undefined);
			return;
		}
		try {
			if (target.kind === 'workspace' && !await this.canSelectWorkspace(target.folderUri, target.providerId)) {
				if (generation === this.generation) {
					this.discardSession();
					this.availability.set('unavailable', undefined);
				}
				return;
			}
			if (this.disposed || generation !== this.generation) {
				return;
			}
			if (this.session && this.appliedTarget) {
				await this.captureSessionConfiguration(this.session, this.appliedTarget, this.retargetConfigurationCaptureTimeoutMs);
				if (this.disposed || generation !== this.generation) {
					return;
				}
			}
			const targetAvailable = target.kind === 'quickChat'
				? this.sessionsManagementService.isQuickChatTargetAvailable({
					providerId: target.providerId,
					sessionTypeId: target.sessionTypeId,
				})
				: this.sessionsManagementService.isNewSessionTargetAvailable(target.folderUri, {
					providerId: target.providerId,
					sessionTypeId: target.sessionTypeId,
				});
			if (!targetAvailable) {
				this.discardSession();
				this.availability.set('unavailable', undefined);
				return;
			}
			const sessionConfiguration = this.configurationForTarget(target);
			this.session = target.kind === 'quickChat'
				? this.sessionsManagementService.createAutomationQuickChat({
					providerId: target.providerId,
					sessionTypeId: target.sessionTypeId,
					sessionTemplate: sessionConfiguration?.sessionTemplate,
					automationConfiguration: sessionConfiguration,
				})
				: this.sessionsManagementService.createAutomationSession(target.folderUri, {
					providerId: target.providerId,
					sessionTypeId: target.sessionTypeId,
					sessionTemplate: sessionConfiguration?.sessionTemplate,
					automationConfiguration: sessionConfiguration,
				});
			this.appliedTarget = target;
			this.appliedConfiguration = sessionConfiguration;
			this.availability.set(this.sessionsManagementService.supportsAutomationSessionConfiguration(this.session) ? 'available' : 'unavailable', undefined);
		} catch (error) {
			if (!this.disposed && generation === this.generation) {
				this.synchronizationError = error;
				this.discardSession();
				this.availability.set('unavailable', undefined);
				this.onError(error);
			}
		}
	}

	private matchesAppliedTarget(target: AutomationSessionDraftTarget): boolean {
		if (!this.session
			|| !this.appliedTarget
			|| this.sessionsManagementService.automationSession.get()?.sessionId !== this.session.sessionId
			|| this.appliedTarget.kind !== target.kind
			|| this.appliedTarget.providerId !== target.providerId
			|| this.appliedTarget.sessionTypeId !== target.sessionTypeId
			|| this.appliedConfiguration !== this.configurationForTarget(target)) {
			return false;
		}
		return target.kind === 'quickChat'
			|| (this.appliedTarget.kind === 'workspace' && isEqual(this.appliedTarget.folderUri, target.folderUri));
	}

	private discardSession(): void {
		if (this.session) {
			this.sessionsManagementService.discardAutomationSession(this.session);
		}
		this.session = undefined;
		this.appliedTarget = undefined;
		this.appliedConfiguration = undefined;
	}

	private async captureSessionConfiguration(session: ISession, target: AutomationSessionDraftTarget, timeoutMs: number, token: CancellationToken = CancellationToken.None): Promise<AutomationSessionConfigurationCapture> {
		try {
			const result = await raceTimeout(
				raceCancellationError(this.sessionsManagementService.getAutomationSessionConfiguration(session).then(configuration => ({ configuration })), token),
				timeoutMs,
			);
			if (!result) {
				throw new Error(`Timed out after ${timeoutMs}ms while capturing Automation session configuration.`);
			}
			if (result.configuration === null) {
				return { kind: 'preserved', configuration: this.configurationForTarget(target) };
			}
			if (result.configuration === undefined) {
				throw new Error('The Automation session draft was replaced before its configuration could be captured.');
			}
			this.configurationsByTarget.set(this.targetKey(target), result.configuration);
			return { kind: 'captured', configuration: result.configuration };
		} catch (error) {
			if (token.isCancellationRequested) {
				throw error;
			}
			return this.captureFailed(error);
		}
	}

	private captureFailed(error: unknown): AutomationSessionConfigurationCapture {
		this.onError(error);
		return { kind: 'failed', error };
	}

	private async waitForResultBeforeDeadline(promise: Promise<void>, deadline: number, token: CancellationToken): Promise<boolean> {
		const remaining = deadline - Date.now();
		if (remaining <= 0) {
			return false;
		}
		return await raceTimeout(raceCancellationError(promise.then(() => true), token), remaining) ?? false;
	}

	private configurationForTarget(target: AutomationSessionDraftTarget | undefined): IAutomationSessionConfiguration | undefined {
		return target ? this.configurationsByTarget.get(this.targetKey(target)) ?? target.sessionConfiguration : undefined;
	}

	private targetsEqual(first: AutomationSessionDraftTarget | undefined, second: AutomationSessionDraftTarget | undefined): boolean {
		if (first === second) {
			return true;
		}
		if (!first || !second || first.kind !== second.kind || first.providerId !== second.providerId || first.sessionTypeId !== second.sessionTypeId || first.sessionConfiguration !== second.sessionConfiguration) {
			return false;
		}
		return first.kind === 'quickChat' || (second.kind === 'workspace' && isEqual(first.folderUri, second.folderUri));
	}

	private targetKey(target: AutomationSessionDraftTarget): string {
		return target.kind === 'quickChat'
			? `quickChat:${target.providerId}:${target.sessionTypeId}`
			: `workspace:${target.folderUri.toString()}:${target.providerId ?? ''}:${target.sessionTypeId}`;
	}

	override dispose(): void {
		this.disposed = true;
		this.generation++;
		this.discardSession();
		super.dispose();
	}
}

const AUTOMATIONS_HARNESS_CHIP_ACTION_ID = 'workbench.action.chat.renderAutomationsHarnessChip';
const AUTOMATIONS_WORKSPACE_PICKER_ACTION_ID = 'workbench.action.chat.renderAutomationsWorkspacePicker';
const AUTOMATIONS_ISOLATION_GROUP_ACTION_ID = 'workbench.action.chat.renderAutomationsIsolationGroup';

export function getAutomationTargetHint(target: Pick<IFormState, 'isQuickChat' | 'folderUri' | 'providerId' | 'sessionTypeId'>, sessionTypes: readonly IProviderSessionType[]): string | undefined {
	if (!target.isQuickChat && !target.folderUri) {
		return localize('automation.form.targetHint.choose', "Choose a workspace or No workspace to see which agents can run this automation.");
	}
	if (sessionTypes.length === 0) {
		return localize('automation.form.targetHint.unavailable', "No agents are currently available for this target.");
	}
	if (sessionTypes.length === 1
		&& sessionTypes[0].sessionType.id === target.sessionTypeId
		&& (!target.providerId || sessionTypes[0].providerId === target.providerId)) {
		return target.isQuickChat
			? localize('automation.form.targetHint.singleQuickChat', "Only {0} is available without a workspace. Choose a workspace to use a different agent.", sessionTypes[0].sessionType.label)
			: localize('automation.form.targetHint.singleWorkspace', "Only {0} is available for this workspace. Change the workspace to use a different agent.", sessionTypes[0].sessionType.label);
	}
	return undefined;
}

type BranchLoadState = 'noFolder' | 'loadingRepository' | 'noRepository' | 'loadingBranches' | 'ready' | 'empty' | 'error';

function setAutomationControlVisible(container: HTMLElement, visible: boolean): void {
	container.style.display = visible ? '' : 'none';
	if (visible) {
		container.removeAttribute('aria-hidden');
	} else {
		container.setAttribute('aria-hidden', 'true');
	}
}

function getAutomationSessionToolbarResponsiveItems(toolbar: MenuWorkbenchToolBar, compactModelPicker?: ISettableObservable<boolean>): IChatInputPickerResponsiveLayoutItem[] {
	const items: IChatInputPickerResponsiveLayoutItem[] = [];
	for (let index = 0; index < toolbar.getItemsLength(); index++) {
		const element = toolbar.getItemElement(index);
		const action = toolbar.getItemAction(index);
		if (!element || !action) {
			continue;
		}
		items.push({
			element,
			canShrink: true,
			isCompact: () => element.classList.contains('compact-picker'),
			setCompact: compact => {
				element.classList.toggle('compact-picker', compact);
				if (action.id === 'sessions.modelPicker') {
					compactModelPicker?.set(compact, undefined);
				}
			},
		});
	}
	return items;
}

export class AutomationIsolationGroupActionViewItem extends BaseActionViewItem {
	private readonly renderDisposables = this._register(new DisposableStore());
	private readonly branchRepoDisposable = this._register(new MutableDisposable<IDisposable>());
	private readonly branchRequest = this._register(new MutableDisposable<CancellationTokenSource>());
	private branchRequestId = 0;
	private readonly branchPicker: BranchPicker;
	private branchLoadState: BranchLoadState = 'noFolder';
	private repository: IGitRepository | undefined;
	private branches: readonly string[] = [];
	private detachedCommit: string | undefined;
	private worktreeCapabilityResolved = false;

	constructor(
		action: IAction,
		private readonly state: IFormState,
		private readonly isolationModel: AutomationIsolationModel,
		private readonly workspaceFolder: IObservable<URI | undefined>,
		private readonly onDidChangeTarget: Event<void>,
		private readonly revalidate: () => void,
		options: IBaseActionViewItemOptions | undefined,
		private readonly visible: IObservable<boolean> | undefined,
		@IGitService private readonly gitService: IGitService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ILogService private readonly pickerLogService: ILogService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(undefined, action, options);
		this.branchPicker = this._register(instantiationService.createInstance(BranchPicker, {
			user: 'automationBranchPicker',
			slotClassName: 'automation-form-branch-picker-slot',
			triggerClassName: 'automation-form-branch-slot',
			labelClassName: 'automation-form-branch-name',
			descriptionClassName: 'automation-form-branch-description',
			keepDisabledFocusable: true,
			renderDisabledAsStatic: true,
			ariaLive: 'polite',
			onSelectBranch: branch => {
				this.isolationModel.selectBranch(branch);
				this.renderBranchControl();
			},
			onRetry: () => {
				void this.reloadRepository(this.isolationModel.folderUri);
			},
			isolation: {
				label: localize('automation.form.isolation.worktree', "New Worktree"),
				ariaLabel: localize('automation.form.isolation.checkboxAriaLabel', "Worktree isolation"),
				onToggle: checked => {
					this.isolationModel.selectIsolationMode(checked ? 'worktree' : 'workspace');
					this.renderBranchControl();
				},
			},
		}));
	}

	override render(container: HTMLElement): void {
		this.renderDisposables.clear();
		this.branchRepoDisposable.clear();
		this.cancelBranchRequest();
		DOM.clearNode(container);
		container.style.marginLeft = 'auto';
		const visible = this.visible;
		if (visible) {
			this.renderDisposables.add(autorun(reader => {
				setAutomationControlVisible(container, visible.read(reader));
			}));
		}

		const isolationGroup = DOM.append(container, $('span.automation-form-isolation-group'));
		this.branchPicker.render(isolationGroup);

		this.refreshTargetCapability();
		this.renderBranchControl();
		this.renderDisposables.add(autorun(reader => {
			const folderUri = this.workspaceFolder.read(reader);
			this.refreshTargetAndRender();
			void this.reloadRepository(folderUri);
		}));
		this.renderDisposables.add(this.onDidChangeTarget(() => {
			this.refreshTargetAndRender();
		}));
		this.renderDisposables.add(this.sessionsManagementService.onDidChangeSessionTypes(() => this.refreshTargetAndRender()));
		this.renderDisposables.add({
			dispose: () => {
				this.cancelBranchRequest();
			}
		});
	}

	showPicker(anchor: HTMLElement): void {
		this.branchPicker.showPicker(anchor);
	}

	private refreshTargetCapability(): void {
		const folderUri = this.isolationModel.folderUri;
		const sessionTypeId = this.state.sessionTypeId;
		if (!folderUri || !sessionTypeId) {
			this.worktreeCapabilityResolved = false;
			this.isolationModel.setSupportsWorktreeConfiguration(false);
			return;
		}
		const sessionType = this.sessionsManagementService.getSessionTypesForFolder(folderUri).find(candidate =>
			candidate.sessionType.id === sessionTypeId
			&& (this.state.providerId === undefined || candidate.providerId === this.state.providerId)
		)?.sessionType;
		if (!sessionType) {
			this.worktreeCapabilityResolved = false;
			this.isolationModel.setSupportsWorktreeConfiguration(false);
			return;
		}
		this.worktreeCapabilityResolved = true;
		const supportsWorktreeConfiguration = sessionType.supportsWorktreeConfiguration === true;
		this.isolationModel.setSupportsWorktreeConfiguration(supportsWorktreeConfiguration);
		if (!supportsWorktreeConfiguration && this.isolationModel.isolationMode === 'worktree') {
			this.isolationModel.selectIsolationMode('workspace');
		}
	}

	private refreshTargetAndRender(): void {
		this.refreshTargetCapability();
		this.renderBranchControl();
	}

	private renderBranchControl(): void {
		const presentation = this.getBranchPresentation();
		const canOpen = this.canOpenBranchPicker();
		const selectedBranch = this.isolationModel.selectedBranch ?? this.isolationModel.headBranch;
		const branches: IBranchPickerBranch[] = this.branches.map(branch => ({
			name: branch,
			selected: branch === selectedBranch,
		}));
		if (selectedBranch && !this.branches.includes(selectedBranch)) {
			branches.unshift({
				name: selectedBranch,
				selected: true,
				unavailable: true,
			});
		}
		const worktreeUnavailableReason = this.getWorktreeUnavailableReason();
		const isolationState: 'enabled' | 'disabled' | 'hidden' =
			worktreeUnavailableReason === undefined ? 'enabled' : 'disabled';

		this.branchPicker.update({
			label: presentation.label,
			branches,
			status: this.branchLoadState === 'loadingRepository' || this.branchLoadState === 'loadingBranches'
				? 'loading'
				: this.branchLoadState === 'error'
					? 'error'
					: this.branchLoadState === 'ready'
						? 'ready'
						: 'empty',
			canOpen,
			disabledReason: presentation.reason,
			missing: presentation.missing,
			showChevron: this.isolationModel.branchPickerAvailable || this.branchLoadState === 'error',
			isolation: {
				checked: this.isolationModel.isolationMode === 'worktree',
				state: isolationState,
				disabledReason: worktreeUnavailableReason,
			},
		});
		this.revalidate();
	}

	private getBranchPresentation(): { readonly label: string; readonly reason: string; readonly missing: boolean } {
		const displayBranch = this.isolationModel.displayBranch;
		if (!this.isolationModel.folderUri) {
			return {
				label: localize('automation.form.branch.unknown', "—"),
				reason: localize('automation.form.branch.noFolderReason', "Select a folder to determine its Git branch."),
				missing: true,
			};
		}
		if (!this.worktreeCapabilityResolved) {
			return {
				label: displayBranch ?? localize('automation.form.branch.unknown', "—"),
				reason: localize('automation.form.branch.capabilityLoadingReason', "Session capabilities are loading."),
				missing: !displayBranch,
			};
		}
		if (!this.isolationModel.supportsWorktreeConfiguration) {
			return {
				label: displayBranch ?? localize('automation.form.branch.unknown', "—"),
				reason: localize('automation.form.branch.unsupportedReason', "The selected session type does not support Worktree branch configuration."),
				missing: !displayBranch,
			};
		}
		if (this.branchLoadState === 'error') {
			return {
				label: displayBranch ?? localize('automation.form.branch.loadError', "Unable to load branches"),
				reason: localize('automation.form.branch.loadErrorReason', "Open the branch picker to retry loading local branches."),
				missing: !displayBranch,
			};
		}
		if (this.isolationModel.isolationMode !== 'worktree') {
			return {
				label: displayBranch ?? this.detachedCommit ?? localize('automation.form.branch.unknown', "—"),
				reason: localize('automation.form.branch.folderModeReason', "Select Worktree to choose a branch."),
				missing: !displayBranch && !this.detachedCommit,
			};
		}
		switch (this.branchLoadState) {
			case 'loadingRepository':
			case 'loadingBranches':
				return {
					label: displayBranch ?? localize('automation.form.branch.loading', "Loading branches…"),
					reason: localize('automation.form.branch.loadingReason', "Local branches are loading."),
					missing: !displayBranch,
				};
			case 'noRepository':
				return {
					label: displayBranch ?? localize('automation.form.branch.noRepo', "no git repo"),
					reason: localize('automation.form.branch.noRepoReason', "No Git repository was found for the selected folder."),
					missing: !displayBranch,
				};
			case 'empty':
				return {
					label: displayBranch ?? localize('automation.form.branch.noBranches', "No local branches"),
					reason: localize('automation.form.branch.noBranchesReason', "No local branches were found in this repository."),
					missing: !displayBranch,
				};
			case 'ready':
				return {
					label: displayBranch ?? localize('automation.form.branch.select', "Select branch"),
					reason: localize('automation.form.branch.chooseReason', "Choose the local branch to use as the Worktree base."),
					missing: !displayBranch,
				};
			case 'noFolder':
				return {
					label: localize('automation.form.branch.unknown', "—"),
					reason: localize('automation.form.branch.noFolderReason', "Select a folder to determine its Git branch."),
					missing: true,
				};
		}
	}

	private canOpenBranchPicker(): boolean {
		if (this.branchLoadState === 'error') {
			return !!this.isolationModel.folderUri && this.worktreeCapabilityResolved && this.isolationModel.supportsWorktreeConfiguration;
		}
		return this.isolationModel.branchPickerAvailable
			&& this.branchLoadState !== 'noFolder'
			&& this.branchLoadState !== 'noRepository'
			&& this.branchLoadState !== 'loadingRepository'
			&& this.branchLoadState !== 'loadingBranches';
	}

	private getWorktreeUnavailableReason(): string | undefined {
		if (!this.isolationModel.folderUri) {
			return localize('automation.form.isolation.worktreeNoFolder', "Select a folder to use Worktree isolation.");
		}
		if (!this.worktreeCapabilityResolved) {
			return localize('automation.form.branch.capabilityLoadingReason', "Session capabilities are loading.");
		}
		if (!this.isolationModel.supportsWorktreeConfiguration) {
			return localize('automation.form.isolation.worktreeUnavailable', "Not supported by the selected session type");
		}
		if (this.isolationModel.selectedBranch) {
			return undefined;
		}
		switch (this.branchLoadState) {
			case 'loadingRepository':
			case 'loadingBranches':
				return localize('automation.form.branch.loadingReason', "Local branches are loading.");
			case 'noRepository':
				return localize('automation.form.branch.noRepoReason', "No Git repository was found for the selected folder.");
			case 'error':
				return localize('automation.form.branch.loadErrorReason', "Open the branch picker to retry loading local branches.");
			case 'empty':
				return localize('automation.form.branch.noBranchesReason', "No local branches were found in this repository.");
			case 'ready':
				return this.branches.length > 0
					? undefined
					: localize('automation.form.branch.noBranchesReason', "No local branches were found in this repository.");
			case 'noFolder':
				return localize('automation.form.isolation.worktreeNoFolder', "Select a folder to use Worktree isolation.");
		}
	}

	private cancelBranchRequest(): void {
		this.branchRequest.value?.cancel();
		this.branchRequest.clear();
	}

	private async reloadRepository(folder: URI | undefined): Promise<void> {
		const requestId = ++this.branchRequestId;
		this.cancelBranchRequest();
		this.branchRepoDisposable.clear();
		this.repository = undefined;
		this.branches = [];
		this.detachedCommit = undefined;
		if (!folder) {
			this.branchLoadState = 'noFolder';
			this.isolationModel.setHeadBranch(undefined);
			this.renderBranchControl();
			return;
		}
		this.branchLoadState = 'loadingRepository';
		this.renderBranchControl();
		const cts = new CancellationTokenSource();
		this.branchRequest.value = cts;
		let repo: IGitRepository | undefined;
		try {
			repo = await this.gitService.openRepository(folder);
		} catch (error) {
			if (requestId !== this.branchRequestId || cts.token.isCancellationRequested) {
				return;
			}
			this.pickerLogService.error('[AutomationDialog] Failed to open Git repository for branch selection.', error);
			this.branchLoadState = 'error';
			this.renderBranchControl();
			return;
		}
		if (requestId !== this.branchRequestId || cts.token.isCancellationRequested) {
			return;
		}
		if (!repo) {
			this.branchLoadState = 'noRepository';
			this.renderBranchControl();
			return;
		}
		this.repository = repo;
		const watcher = new DisposableStore();
		watcher.add(autorun(reader => {
			const head = repo.state.read(reader).HEAD;
			if (head?.commit && head.name) {
				this.detachedCommit = undefined;
				this.isolationModel.setHeadBranch(head.name);
			} else if (head?.commit) {
				this.detachedCommit = localize('automation.form.branch.detached', "({0})", head.commit.slice(0, 7));
				this.isolationModel.setHeadBranch(undefined);
			} else {
				this.detachedCommit = undefined;
				this.isolationModel.setHeadBranch(undefined);
			}
			this.renderBranchControl();
		}));
		this.branchRepoDisposable.value = watcher;
		this.branchLoadState = 'loadingBranches';
		this.renderBranchControl();
		try {
			const refs = await repo.getRefs({ pattern: 'refs/heads' }, cts.token);
			if (requestId !== this.branchRequestId || cts.token.isCancellationRequested || this.repository !== repo) {
				return;
			}
			this.branches = normalizeAutomationBranchNames(refs.map(ref => ref.name));
			this.branchLoadState = this.branches.length > 0 ? 'ready' : 'empty';
		} catch (error) {
			if (requestId !== this.branchRequestId || cts.token.isCancellationRequested) {
				return;
			}
			this.pickerLogService.error('[AutomationDialog] Failed to load local branches.', error);
			this.branchLoadState = 'error';
		}
		this.renderBranchControl();
	}
}

/**
 * Renders a dialog-owned picker into a chat input secondary-toolbar slot. The
 * picker instance is owned by the dialog (registered on its disposables); this
 * view item only injects the picker's DOM into the toolbar container via the
 * supplied {@link renderPicker} callback.
 */
class AutomationPickerActionViewItem extends BaseActionViewItem {
	private readonly visibilityWatch = this._register(new MutableDisposable<IDisposable>());

	constructor(
		action: IAction,
		private readonly renderPicker: (container: HTMLElement) => void,
		private readonly visible: IObservable<boolean> | undefined,
		options?: IBaseActionViewItemOptions,
	) {
		super(undefined, action, options);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		DOM.clearNode(container);
		this.renderPicker(container);
		const visible = this.visible;
		this.visibilityWatch.value = visible ? autorun(reader => {
			setAutomationControlVisible(container, visible.read(reader));
		}) : undefined;
	}
}

registerAction2(class OpenAutomationsHarnessChipAction extends Action2 {
	constructor() {
		super({
			id: AUTOMATIONS_HARNESS_CHIP_ACTION_ID,
			title: localize2('automation.form.harnessChip.action', "Automations Harness Chip"),
			f1: false,
			precondition: ChatContextKeys.enabled,
			menu: [{
				id: MenuId.ChatInputSecondary,
				group: 'navigation',
				order: -1,
				when: ChatContextKeys.inAutomationsDialog,
			}],
		});
	}

	override async run(): Promise<void> { /* handled by action view item */ }
});

registerAction2(class OpenAutomationsWorkspacePickerAction extends Action2 {
	constructor() {
		super({
			id: AUTOMATIONS_WORKSPACE_PICKER_ACTION_ID,
			title: localize2('automation.form.workspacePicker.action', "Automations Workspace Picker"),
			f1: false,
			precondition: ChatContextKeys.enabled,
			menu: [{
				id: MenuId.ChatInputSecondary,
				group: 'navigation',
				order: -2,
				when: ChatContextKeys.inAutomationsDialog,
			}],
		});
	}

	override async run(): Promise<void> { /* handled by action view item */ }
});

registerAction2(class OpenAutomationsIsolationGroupAction extends Action2 {
	constructor() {
		super({
			id: AUTOMATIONS_ISOLATION_GROUP_ACTION_ID,
			title: localize2('automation.form.isolationGroup.action', "Automations Isolation Group"),
			f1: false,
			precondition: ChatContextKeys.enabled,
			menu: [{
				id: MenuId.ChatInputSecondary,
				group: 'navigation',
				order: 2,
				when: ChatContextKeys.inAutomationsDialog,
			}],
		});
	}

	override async run(): Promise<void> { /* handled by action view item */ }
});

export function renderForm(
	form: HTMLElement,
	state: IFormState,
	disposables: DisposableStore,
	validation: IValidationState,
	revalidate: () => void,
	instantiationService: IInstantiationService,
	contextKeyService: IContextKeyService,
	contextViewService: IContextViewService,
	configurationService: IConfigurationService,
	layoutService: IWorkbenchLayoutService,
	logService: ILogService,
	sessionsManagementService: ISessionsManagementService,
	workspaceTrustRequestService: IWorkspaceTrustRequestService,
	initialPrompt: string,
	initialTarget: AutomationTarget | undefined,
	initialSessionConfiguration: IAutomationSessionConfiguration | undefined,
): IRenderFormHandle {
	const formContent = DOM.append(form, $('.automation-form-content'));
	const nameRow = DOM.append(formContent, $('.automation-form-row'));
	DOM.append(nameRow, $('span.automation-form-label', undefined, localize('automation.form.name', "Name")));
	const nameInputContainer = DOM.append(nameRow, $('.automation-form-input-host'));
	const nameInput = disposables.add(new InputBox(nameInputContainer, contextViewService, {
		inputBoxStyles: defaultInputBoxStyles,
		placeholder: localize('automation.form.namePlaceholder', "e.g. Morning standup notes"),
		ariaLabel: localize('automation.form.name', "Name"),
	}));
	nameInput.value = state.name;
	disposables.add(nameInput.onDidChange(value => {
		state.name = value;
		revalidate();
	}));

	const scheduleRow = DOM.append(formContent, $('.automation-form-row.automation-form-schedule-row'));
	const useCustomDrawn = !hasNativeContextMenu(configurationService);

	const intervalGroup = DOM.append(scheduleRow, $('.automation-form-schedule-group'));
	DOM.append(intervalGroup, $('span.automation-form-label', undefined, localize('automation.form.interval', "Schedule")));
	const intervalOptions: ISelectOptionItem[] = INTERVALS.map(item => ({ text: item.label }));
	const intervalIndex = Math.max(0, INTERVALS.findIndex(item => item.value === state.interval));
	const intervalSelect = disposables.add(new SelectBox(
		intervalOptions,
		intervalIndex,
		contextViewService,
		defaultSelectBoxStyles,
		{ ariaLabel: localize('automation.form.interval', "Schedule"), useCustomDrawn },
	));
	const intervalSelectContainer = DOM.append(intervalGroup, $('.automation-form-schedule-select-container'));
	intervalSelect.render(intervalSelectContainer);

	const timeGroup = DOM.append(scheduleRow, $('.automation-form-schedule-group.automation-form-time-group'));
	DOM.append(timeGroup, $('span.automation-form-label', undefined, localize('automation.form.time', "Time")));
	const timeOptions = buildTimeOptions();
	const initialTimeIndex = nearestTimeOptionIndex(state.hour, state.minute);
	state.hour = timeOptions[initialTimeIndex].hour;
	state.minute = timeOptions[initialTimeIndex].minute;
	const timeSelect = disposables.add(new SelectBox(
		timeOptions.map(opt => ({ text: opt.label } satisfies ISelectOptionItem)),
		initialTimeIndex,
		contextViewService,
		defaultSelectBoxStyles,
		{ ariaLabel: localize('automation.form.time', "Time"), useCustomDrawn },
	));
	const timeSelectContainer = DOM.append(timeGroup, $('.automation-form-schedule-select-container.automation-form-time-select-container'));
	timeSelect.render(timeSelectContainer);
	disposables.add(timeSelect.onDidSelect(e => {
		const opt = timeOptions[e.index];
		state.hour = opt.hour;
		state.minute = opt.minute;
	}));

	const dayGroup = DOM.append(scheduleRow, $('.automation-form-schedule-group.automation-form-day-group'));
	DOM.append(dayGroup, $('span.automation-form-label', undefined, localize('automation.form.day', "Day of week")));
	const dayOptions: ISelectOptionItem[] = DAYS_OF_WEEK.map(d => ({ text: d }));
	const daySelect = disposables.add(new SelectBox(
		dayOptions,
		Math.min(Math.max(state.day, 0), DAYS_OF_WEEK.length - 1),
		contextViewService,
		defaultSelectBoxStyles,
		{ ariaLabel: localize('automation.form.day', "Day of week"), useCustomDrawn },
	));
	const daySelectContainer = DOM.append(dayGroup, $('.automation-form-schedule-select-container'));
	daySelect.render(daySelectContainer);
	disposables.add(daySelect.onDidSelect(e => {
		state.day = e.index;
	}));

	const applyIntervalVisibility = () => {
		const showTime = state.interval === 'daily' || state.interval === 'weekly';
		const showDay = state.interval === 'weekly';
		timeGroup.style.display = showTime ? '' : 'none';
		dayGroup.style.display = showDay ? '' : 'none';
	};
	applyIntervalVisibility();
	disposables.add(intervalSelect.onDidSelect(e => {
		state.interval = INTERVALS[e.index].value;
		applyIntervalVisibility();
	}));

	// The picker is authoritative for the session type
	const isolationModel = new AutomationIsolationModel(state);
	const workspaceControlsVisible = derived(reader => !isolationModel.isQuickChatObs.read(reader) && isolationModel.folderUriObs.read(reader) !== undefined);
	const sessionTypePicker = disposables.add(instantiationService.createInstance(MobileSessionTypePicker, constObservable<ISession | undefined>(undefined), { persistSelection: false, telemetrySource: 'AutomationSessionTypePicker' }));
	sessionTypePicker.setQuickChatSource(isolationModel.isQuickChatObs);
	sessionTypePicker.setFolderSource(isolationModel.folderUriObs, {
		initialPick: state.sessionTypeId
			? { providerId: state.providerId, sessionTypeId: state.sessionTypeId }
			: undefined,
		preserveUnavailableInitialPick: true,
	});
	// The dialog has no session, so the input part reads the active session type from the picker via this delegate.
	const onDidChangeSessionType = disposables.add(new Emitter<AgentSessionTarget>());
	const onDidChangeSessionTarget = disposables.add(new Emitter<void>());
	const sessionTypeDelegate: ISessionTypePickerDelegate = {
		getActiveSessionProvider: () => sessionTypePicker.modelTargetChatSessionType.get(),
		onDidChangeActiveSessionProvider: onDidChangeSessionType.event,
	};
	const syncStateFromPicker = () => {
		const pick = sessionTypePicker.selectedPick;
		state.providerId = pick?.providerId;
		state.sessionTypeId = pick?.sessionTypeId;
		onDidChangeSessionTarget.fire();
	};
	disposables.add(autorun(reader => {
		const modelTarget = sessionTypePicker.modelTargetChatSessionType.read(reader);
		if (modelTarget) {
			onDidChangeSessionType.fire(modelTarget);
		}
	}));
	// Seed state from the picker's initial default (edit: saved type; create: folder default).
	syncStateFromPicker();
	// Covers both explicit user picks and recomputes (e.g. an agent host
	// advertising its session types after the dialog opened), so the saved
	// automation always matches the chip the picker displays.

	const workspacePicker = disposables.add(instantiationService.createInstance(MobileAutomationsWorkspacePicker, {
		restoreFromSessions: false,
		canRestoreWorkspace: () => false,
		canSelectWorkspace: (folderUri, preferredProviderId) =>
			canSelectAutomationWorkspace(folderUri, preferredProviderId, sessionsManagementService, workspaceTrustRequestService),
	}));
	workspacePicker.setTargetModel(isolationModel);
	workspacePicker.setLayoutService(layoutService);

	const automationSessionDraftSynchronizer = disposables.add(new AutomationSessionDraftSynchronizer(
		sessionsManagementService,
		(folderUri, preferredProviderId) => canSelectAutomationWorkspace(folderUri, preferredProviderId, sessionsManagementService, workspaceTrustRequestService),
		error => logService.error('[AutomationDialog] Failed to synchronize the automation session draft.', error),
	));
	let resolvedInitialProviderId = initialTarget?.providerId;
	let resolvedInitialSessionTypeId = initialTarget?.sessionTypeId;
	const getInitialSessionConfiguration = (folderUri: URI | undefined, providerId: string | undefined, sessionTypeId: string, isQuickChat: boolean) => {
		if (!initialTarget || !initialSessionConfiguration || initialTarget.kind !== (isQuickChat ? 'quickChat' : 'workspace')) {
			return undefined;
		}
		if (initialTarget.kind === 'workspace' && (!folderUri || !isEqual(initialTarget.folderUri, folderUri))) {
			return undefined;
		}
		resolvedInitialProviderId ??= providerId;
		resolvedInitialSessionTypeId ??= sessionTypeId;
		if (resolvedInitialProviderId !== providerId || resolvedInitialSessionTypeId !== sessionTypeId) {
			return undefined;
		}
		return initialSessionConfiguration;
	};
	const updateAutomationSessionTarget = () => {
		const folderUri = isolationModel.folderUriObs.get();
		const pick = sessionTypePicker.selectedPick;
		const isQuickChat = isolationModel.isQuickChatObs.get();
		if (!pick || (isQuickChat && !pick.providerId) || (!isQuickChat && !folderUri)) {
			automationSessionDraftSynchronizer.update(undefined);
			return;
		}
		if (isQuickChat) {
			const providerId = pick.providerId;
			if (providerId) {
				automationSessionDraftSynchronizer.update({
					kind: 'quickChat',
					providerId,
					sessionTypeId: pick.sessionTypeId,
					sessionConfiguration: getInitialSessionConfiguration(undefined, providerId, pick.sessionTypeId, true),
				});
			}
		} else if (folderUri) {
			automationSessionDraftSynchronizer.update({
				kind: 'workspace',
				folderUri,
				providerId: pick.providerId,
				sessionTypeId: pick.sessionTypeId,
				sessionConfiguration: getInitialSessionConfiguration(folderUri, pick.providerId, pick.sessionTypeId, false),
			});
		}
	};
	disposables.add(sessionTypePicker.onDidChangeSelectedPick(() => {
		syncStateFromPicker();
		updateAutomationSessionTarget();
		revalidate();
	}));
	disposables.add(sessionsManagementService.onDidChangeSessionTypes(() => updateAutomationSessionTarget()));

	if (state.folderUri) {
		workspacePicker.setSelectedWorkspace(state.folderUri, { fireEvent: false, persist: false });
	}

	disposables.add(workspacePicker.onDidSelectWorkspace(uri => {
		if (isolationModel.setWorkspace(uri)) {
			updateAutomationSessionTarget();
			revalidate();
		}
	}));

	disposables.add(autorun(reader => {
		isolationModel.isQuickChatObs.read(reader);
		updateAutomationSessionTarget();
		revalidate();
	}));

	const promptSection = DOM.append(formContent, $('.automation-prompt-section'));
	const promptRow = DOM.append(promptSection, $('.automation-form-row'));
	DOM.append(promptRow, $('span.automation-form-label', undefined, localize('automation.form.prompt', "Prompt")));
	const promptHost = DOM.append(promptRow, $('.automation-form-prompt-host.interactive-session'));
	const editorOverflowWidgetsDomNode = layoutService.getContainer(DOM.getWindow(promptHost)).appendChild($('.chat-editor-overflow.automation-dialog-editor-overflow.monaco-editor'));
	disposables.add(toDisposable(() => editorOverflowWidgetsDomNode.remove()));
	const activeAutomationSession = disposables.add(disposableObservableValue<VisibleSession | undefined>(form, undefined));
	disposables.add(autorun(reader => {
		const session = sessionsManagementService.automationSession.read(reader);
		activeAutomationSession.set(session ? new VisibleSession(session, session.mainChat.read(reader)) : undefined, undefined);
	}));
	const scopedContextKeyService = disposables.add(contextKeyService.createScoped(promptSection));
	ChatContextKeys.location.bindTo(scopedContextKeyService).set(ChatAgentLocation.Chat);
	ChatContextKeys.inChatSession.bindTo(scopedContextKeyService).set(true);
	ChatContextKeys.inAutomationsDialog.bindTo(scopedContextKeyService).set(true);
	const newChatModelPickerService = new NewChatModelPickerService();
	const sessionModelSelection = disposables.add(instantiationService.createInstance(SessionModelSelection, activeAutomationSession, { modelConfiguration: true }));
	const scopedInstantiationService = disposables.add(instantiationService.createChild(new ServiceCollection(
		[IContextKeyService, scopedContextKeyService],
		[ISessionContext, new SessionContext(activeAutomationSession)],
		[INewChatModelPickerService, newChatModelPickerService],
		[ISessionModelSelection, sessionModelSelection],
	)));
	const usesCombinedConfigPicker = SessionUsesCombinedConfigPickerContext.bindTo(scopedContextKeyService);
	const sessionTypesChanged = observableSignalFromEvent(form, sessionsManagementService.onDidChangeSessionTypes);
	disposables.add(autorun(reader => {
		sessionTypesChanged.read(reader);
		const session = activeAutomationSession.read(reader);
		setActiveSessionContextKeys(session, scopedContextKeyService, reader);
		usesCombinedConfigPicker.set(!!session && sessionsManagementService.usesCombinedNewSessionConfigPicker(session));
	}));

	const chatInputStyles: IChatInputStyles = {
		overlayBackground: 'var(--vscode-input-background)',
		listForeground: 'var(--vscode-foreground)',
		listBackground: 'var(--vscode-input-background)',
	};
	let automationIsolationAction: IAction | undefined;
	const overflowIsolationItem = disposables.add(new MutableDisposable<AutomationIsolationGroupActionViewItem>());

	const chatInputOptions: IChatInputPartOptions = {
		renderFollowups: false,
		renderInputToolbarBelowInput: false,
		renderWorkingSet: false,
		enableImplicitContext: false,
		supportsChangingModes: false,
		suppressModePreferredModel: true,
		suppressModelPersistence: true,
		menus: {
			executeToolbar: MenuId.AutomationsDialogInput,
			inputToolbar: Menus.AutomationsDialogInputToolbar,
			telemetrySource: 'automations.dialog',
		},
		widgetViewKindTag: 'automations-dialog',
		// A scheduling form, not a chat about to be sent: keep promos out.
		isTransientChat: true,
		inputEditorMinLines: 3,
		// The dialog renders the composer flush with its form column (the
		// `.interactive-input-part` margin is zeroed in CSS), so there is no
		// outer horizontal gutter. Without this, ChatInputPart would still
		// reserve the default 24px margin and lay the editor out too narrow,
		// leaving its scrollbar floating ~24px in from the right wall.
		inputPartHorizontalPadding: 0,
		editorOverflowWidgetsDomNode,
		sessionTypePickerDelegate: sessionTypeDelegate,
		secondaryToolbarOverflowActionHandler: (actionId, anchor) => {
			if (actionId === AUTOMATIONS_HARNESS_CHIP_ACTION_ID) {
				sessionTypePicker.showPicker(anchor);
				return true;
			}
			if (actionId === AUTOMATIONS_WORKSPACE_PICKER_ACTION_ID) {
				workspacePicker.showPicker(false, anchor);
				return true;
			}
			if (actionId === AUTOMATIONS_ISOLATION_GROUP_ACTION_ID && automationIsolationAction) {
				const item = instantiationService.createInstance(
					AutomationIsolationGroupActionViewItem,
					automationIsolationAction,
					state,
					isolationModel,
					isolationModel.folderUriObs,
					onDidChangeSessionTarget.event,
					revalidate,
					undefined,
					workspaceControlsVisible,
				);
				overflowIsolationItem.value = item;
				item.render(DOM.$('.automation-overflow-isolation-picker'));
				item.showPicker(anchor);
				return true;
			}
			return false;
		},
		secondaryToolbarActionViewItemProvider: (action, itemOptions) => {
			if (action.id === AUTOMATIONS_HARNESS_CHIP_ACTION_ID) {
				return new AutomationPickerActionViewItem(action, container => sessionTypePicker.render(container), undefined, itemOptions);
			}
			if (action.id === AUTOMATIONS_WORKSPACE_PICKER_ACTION_ID) {
				return new AutomationPickerActionViewItem(action, container => {
					container.classList.add('chat-input-picker-item');
					workspacePicker.render(container);
				}, undefined, itemOptions);
			}
			if (action.id === AUTOMATIONS_ISOLATION_GROUP_ACTION_ID) {
				automationIsolationAction = action;
				const item = instantiationService.createInstance(
					AutomationIsolationGroupActionViewItem,
					action,
					state,
					isolationModel,
					isolationModel.folderUriObs,
					onDidChangeSessionTarget.event,
					revalidate,
					itemOptions,
					workspaceControlsVisible,
				);
				return item;
			}
			return undefined;
		},
	};

	// Minimal subset of IChatWidget needed by ChatInputPart in dialog context
	type IMinimalChatWidget = Pick<IChatWidget, 'onDidChangeViewModel' | 'viewModel' | 'contribs' | 'location' | 'viewContext' | 'lockToCodingAgent' | 'unlockFromCodingAgent'>;

	const stubWidget: IMinimalChatWidget = {
		onDidChangeViewModel: Event.None,
		viewModel: undefined,
		contribs: [],
		location: ChatAgentLocation.Chat,
		viewContext: {},
		lockToCodingAgent: () => { },
		unlockFromCodingAgent: () => { },
	};

	const chatInput = disposables.add(
		scopedInstantiationService.createInstance(ChatInputPart, ChatAgentLocation.Chat, chatInputOptions, chatInputStyles, false),
	);
	chatInput.render(promptHost, initialPrompt, stubWidget as IChatWidget);
	chatInput.inputEditor.updateOptions({ placeholder: localize('automation.form.prompt.placeholder', "Describe what you want to automate") });
	disposables.add(scopedInstantiationService.createInstance(AutomationInputCompletions, chatInput.inputEditor));
	const targetHint = DOM.append(promptSection, $('.automation-target-hint'));
	const targetHintMessage = DOM.append(targetHint, $('span.automation-target-hint-message', {
		role: 'status',
		'aria-atomic': 'true',
	}));
	const chooseWorkspaceContainer = DOM.append(targetHint, $('span.automation-target-hint-action'));
	disposables.add(instantiationService.createInstance(Link, chooseWorkspaceContainer, {
		label: localize('automation.form.chooseWorkspace', "Choose Workspace"),
		href: '#',
	}, {
		opener: () => workspacePicker.showPicker(),
	}));
	const selectedSessionTypeChanged = observableSignalFromEvent(targetHint, sessionTypePicker.onDidChangeSelectedPick);
	disposables.add(autorun(reader => {
		sessionTypesChanged.read(reader);
		selectedSessionTypeChanged.read(reader);
		const isQuickChat = isolationModel.isQuickChatObs.read(reader);
		const folderUri = isolationModel.folderUriObs.read(reader);
		const sessionTypes = isQuickChat
			? sessionsManagementService.getQuickChatSessionTypes()
			: folderUri ? sessionsManagementService.getSessionTypesForFolder(folderUri) : [];
		const message = getAutomationTargetHint(state, sessionTypes);
		setAutomationControlVisible(targetHint, message !== undefined);
		if (targetHintMessage.textContent !== (message ?? '')) {
			targetHintMessage.textContent = message ?? '';
		}
	}));
	const sessionConfigurationRow = DOM.append(promptSection, $('.automation-form-row'));
	const sessionConfigurationLabel = DOM.append(sessionConfigurationRow, $('span.automation-form-label', {
		id: 'automation-session-configuration-label',
	}, localize('automation.form.sessionConfiguration', "Session configuration")));
	const sessionConfiguration = DOM.append(sessionConfigurationRow, $('.automation-session-configuration', {
		role: 'group',
		'aria-labelledby': sessionConfigurationLabel.id,
	}));
	const sessionConfigContainer = DOM.append(sessionConfiguration, $('.automation-session-config.sessions-chat-config-toolbar'));
	const compactModelPicker = observableValue(sessionConfigContainer, false);
	const sessionConfigToolbar = disposables.add(createNewSessionConfigToolbar(
		sessionConfigContainer,
		scopedInstantiationService,
		compactModelPicker,
		localize('automation.form.sessionConfigurationOptions', "Session configuration options"),
	));
	const sessionControlsContainer = DOM.append(sessionConfiguration, $('.automation-session-controls'));
	const sessionControlsToolbar = disposables.add(createNewSessionControlToolbar(
		sessionControlsContainer,
		scopedInstantiationService,
		localize('automation.form.sessionControls', "Session controls"),
	));
	const sessionConfigLayout = disposables.add(new ChatInputPickerResponsiveLayout('AutomationDialog.sessionConfig', sessionConfigContainer, {
		getItems: () => getAutomationSessionToolbarResponsiveItems(sessionConfigToolbar, compactModelPicker),
		hasOverflow: () => sessionConfigToolbar.hasOverflow(),
		relayout: () => sessionConfigToolbar.relayout(),
	}));
	sessionConfigLayout.layout();
	const sessionControlsLayout = disposables.add(new ChatInputPickerResponsiveLayout('AutomationDialog.sessionControls', sessionControlsContainer, {
		getItems: () => getAutomationSessionToolbarResponsiveItems(sessionControlsToolbar),
		hasOverflow: () => sessionControlsToolbar.hasOverflow(),
		relayout: () => sessionControlsToolbar.relayout(),
	}));
	sessionControlsLayout.layout();
	const sessionConfigurationUnavailable = DOM.append(sessionConfiguration, $('span.automation-session-configuration-unavailable', {
		role: 'status',
		'aria-atomic': 'true',
	}));
	const sessionConfigurationError = DOM.append(sessionConfiguration, $('span.automation-session-configuration-error', {
		role: 'alert',
		tabindex: '-1',
	}));
	DOM.hide(sessionConfigurationError);
	disposables.add(autorun(reader => {
		const hasTarget = isolationModel.isQuickChatObs.read(reader) || isolationModel.folderUriObs.read(reader) !== undefined;
		setAutomationControlVisible(sessionConfigurationRow, hasTarget);
		const availability = automationSessionDraftSynchronizer.availability.read(reader);
		const pending = availability === 'pending';
		const controlsUnavailable = availability !== 'available';
		sessionConfiguration.classList.toggle('controls-unavailable', controlsUnavailable);
		for (const container of [sessionConfigContainer, sessionControlsContainer]) {
			container.toggleAttribute('inert', controlsUnavailable);
			container.setAttribute('aria-hidden', String(controlsUnavailable));
			container.setAttribute('aria-busy', String(pending));
		}
		sessionConfigurationUnavailable.textContent = pending
			? localize('automation.form.sessionConfigurationLoading', "Loading session configuration…")
			: availability === 'unavailable'
				? localize('automation.form.sessionConfigurationUnavailable', "Session configuration unavailable")
				: '';
	}));

	disposables.add(chatInput.inputEditor.onDidChangeModelContent(() => {
		revalidate();
	}));

	const layoutChatInput = () => {
		const width = promptHost.getBoundingClientRect().width;
		if (width > 0) {
			chatInput.layout(width);
		}
	};
	layoutChatInput();
	queueMicrotask(() => {
		if (!disposables.isDisposed) {
			layoutChatInput();
		}
	});

	const resizeObserver = disposables.add(new DOM.DisposableResizeObserver('automationDialog.promptHost', entries => {
		for (const entry of entries) {
			const width = entry.contentRect.width;
			if (width > 0) {
				chatInput.layout(width);
			}
		}
	}, DOM.getWindow(promptHost)));
	disposables.add(resizeObserver.observe(promptHost));

	const enabledRow = DOM.append(formContent, $('.automation-form-row.automation-form-checkbox-row'));
	const enabledLabelText = localize('automation.form.enabled', "Enabled (the scheduler runs this automation when due)");
	const enabledCheckbox = disposables.add(new Checkbox(enabledLabelText, state.enabled, defaultCheckboxStyles));
	DOM.append(enabledRow, enabledCheckbox.domNode);
	const enabledLabel = DOM.append(enabledRow, $('span.automation-form-checkbox-label', undefined, enabledLabelText));
	const setEnabled = (value: boolean) => {
		if (enabledCheckbox.checked !== value) {
			enabledCheckbox.checked = value;
		}
		state.enabled = value;
	};
	disposables.add(enabledCheckbox.onChange(() => {
		state.enabled = enabledCheckbox.checked;
	}));
	disposables.add(DOM.addStandardDisposableListener(enabledLabel, 'click', () => {
		setEnabled(!enabledCheckbox.checked);
	}));
	const saveStatus = DOM.append(form, $('span.automation-form-save-status', {
		role: 'status',
		'aria-atomic': 'true',
	}));
	DOM.hide(saveStatus);

	return {
		getPrompt: () => chatInput.inputEditor.getValue(),
		getSessionConfiguration: token => automationSessionDraftSynchronizer.getSessionConfiguration(token),
		getBranch: () => isolationModel.persistedBranch,
		waitForAutomationSessionSync: token => {
			updateAutomationSessionTarget();
			return automationSessionDraftSynchronizer.waitForSync(token);
		},
		setSaving: saving => {
			formContent.toggleAttribute('inert', saving);
			formContent.setAttribute('aria-busy', String(saving));
			form.classList.toggle('saving', saving);
			if (saving) {
				DOM.show(saveStatus);
				saveStatus.textContent = localize('automation.form.saving', "Saving automation…");
			} else {
				DOM.hide(saveStatus);
				saveStatus.textContent = '';
			}
		},
		showSessionConfigurationError: message => {
			if (message) {
				DOM.show(sessionConfigurationError);
				sessionConfigurationError.textContent = message;
			} else {
				DOM.hide(sessionConfigurationError);
				sessionConfigurationError.textContent = '';
			}
		},
		focusSessionConfigurationError: () => sessionConfigurationError.focus(),
		getFocusableElements: () => {
			// eslint-disable-next-line no-restricted-syntax -- the dialog owns this form subtree and supplies its dynamic focus order.
			return Array.from(form.querySelectorAll<HTMLElement>('input, select, textarea, button, a[href], [tabindex]'));
		},
		acceptPromptSuggestion: () => {
			const suggestController = SuggestController.get(chatInput.inputEditor);
			if (!suggestController || suggestController.model.state === SuggestState.Idle || !suggestController.widget.value.getFocusedItem()) {
				return false;
			}
			suggestController.acceptSelectedSuggestion(true, false);
			return true;
		},
	};
}

interface ITimeOption {
	readonly hour: number;
	readonly minute: number;
	readonly label: string;
}

function buildTimeOptions(): readonly ITimeOption[] {
	const options: ITimeOption[] = [];
	for (let hour = 0; hour < 24; hour++) {
		for (let minute = 0; minute < 60; minute += 15) {
			const period = hour < 12 ? 'AM' : 'PM';
			const hour12 = hour === 0 ? 12 : (hour > 12 ? hour - 12 : hour);
			const minuteText = minute.toString().padStart(2, '0');
			options.push({
				hour,
				minute,
				label: `${hour12}:${minuteText} ${period}`,
			});
		}
	}
	return options;
}

function nearestTimeOptionIndex(hour: number, minute: number): number {
	const safeHour = Math.max(0, Math.min(23, hour | 0));
	const safeMinute = Math.max(0, Math.min(59, minute | 0));
	const slot = Math.round(safeMinute / 15) % 4;
	const carriedHour = safeMinute >= 53 && slot === 0 ? (safeHour + 1) % 24 : safeHour;
	return carriedHour * 4 + slot;
}

export function updateSaveButtonState(
	saveButton: IButton | undefined,
	state: IFormState,
	validation: IValidationState,
	form: HTMLElement,
	getPrompt: () => string,
	getBranch: () => string | undefined,
): void {
	validation.nameError = state.name.trim() === ''
		? localize('automation.form.nameRequired', "Name is required.")
		: undefined;
	validation.promptError = getPrompt().trim() === ''
		? localize('automation.form.promptRequired', "Prompt is required.")
		: undefined;
	validation.folderError = !state.folderUri
		&& !state.isQuickChat
		? localize('automation.form.folderRequired', "Workspace folder is required.")
		: undefined;
	validation.sessionTypeError = !state.sessionTypeId || (state.isQuickChat && !state.providerId)
		? localize('automation.form.sessionTypeRequired', "Session type is required.")
		: undefined;
	validation.branchError = !state.isQuickChat && state.isolationMode === 'worktree' && !getBranch()
		? localize('automation.form.branchRequired', "A branch is required for Worktree isolation.")
		: undefined;

	const valid = !validation.nameError && !validation.promptError && !validation.folderError && !validation.sessionTypeError && !validation.branchError;
	if (saveButton) {
		saveButton.enabled = valid;
	}
	form.classList.toggle('automation-form-invalid', !valid);
}

// Local-only workspace picker: hides category tabs and non-local browse actions.
export class AutomationsWorkspacePicker extends WorkspacePicker {
	private readonly targetModelWatch = this._register(new MutableDisposable<IDisposable>());
	private targetModel: AutomationIsolationModel | undefined;

	setTargetModel(model: AutomationIsolationModel): void {
		this.targetModel = model;
		this.targetModelWatch.value = autorun(reader => {
			model.isQuickChatObs.read(reader);
			this._updateTriggerLabel();
		});
	}

	protected override _showTabs(): boolean {
		return false;
	}

	protected override _shouldPersistSelection(): boolean {
		return false;
	}

	protected override _buildItems(): IActionListItem<IWorkspacePickerItem>[] {
		const items = super._buildItems();
		const noWorkspace: IActionListItem<IWorkspacePickerItem> = {
			kind: ActionListItemKind.Action,
			label: localize('automation.form.noWorkspace', "No workspace"),
			description: localize('automation.form.noWorkspace.description', "Run without a backing workspace"),
			group: { title: '', icon: Codicon.commentDiscussion },
			item: {
				checked: this.targetModel?.isQuickChat || undefined,
				run: () => this.targetModel?.setQuickChat(true),
			},
		};
		return items.length > 0
			? [noWorkspace, { kind: ActionListItemKind.Separator, label: '' }, ...items]
			: [noWorkspace];
	}

	protected override async _dispatchPickerItem(item: IWorkspacePickerItem): Promise<boolean> {
		const applied = await super._dispatchPickerItem(item);
		const selectedFolder = this.selectedFolderUri;
		if (applied && selectedFolder && (item.folderUri || item.browseActionIndex !== undefined)) {
			this.targetModel?.setQuickChat(false, selectedFolder);
		}
		return applied;
	}

	protected override _isSelectedFolder(folderUri: URI | undefined): boolean {
		return !this.targetModel?.isQuickChat && super._isSelectedFolder(folderUri);
	}

	protected override _renderTriggerLabel(trigger: HTMLElement): void {
		DOM.clearNode(trigger);
		const workspace = this.selectedResolved?.workspace;
		const noWorkspace = this.targetModel?.isQuickChat === true;
		const label = noWorkspace
			? localize('automation.form.noWorkspace', "No workspace")
			: workspace?.label ?? localize('automation.form.selectWorkspace', "Select workspace");
		const icon = noWorkspace ? Codicon.commentDiscussion : workspace?.icon ?? Codicon.project;

		trigger.setAttribute('aria-label', workspace || noWorkspace
			? localize('automation.form.workspacePicker.selectedAriaLabel', "Automation target, {0}", label)
			: localize('automation.form.workspacePicker.pickAriaLabel', "Pick a workspace for this automation"));

		const renderedIcon = DOM.append(trigger, renderIcon(icon));
		renderedIcon.setAttribute('aria-hidden', 'true');
		DOM.append(trigger, $('span.sessions-chat-dropdown-label', undefined, label));
		const chevron = DOM.append(trigger, renderIcon(Codicon.chevronDownCompact));
		chevron.classList.add('sessions-chat-dropdown-chevron');
		chevron.setAttribute('aria-hidden', 'true');
	}

	protected override _getAllBrowseActions(): ISessionWorkspaceBrowseAction[] {
		return super._getAllBrowseActions().filter(a => a.group === SESSION_WORKSPACE_GROUP_LOCAL);
	}
}

export class MobileAutomationsWorkspacePicker extends AutomationsWorkspacePicker {
	private layoutService: IWorkbenchLayoutService | undefined;

	setLayoutService(layoutService: IWorkbenchLayoutService): void {
		this.layoutService = layoutService;
	}

	override showPicker(force = false, anchor?: HTMLElement): void {
		const triggerElement = anchor ?? this._triggerElement;
		if (!triggerElement || !this.layoutService || !shouldUseMobileWorkspacePickerSheet(this.layoutService)) {
			super.showPicker(force, anchor);
			return;
		}
		void showMobileWorkspacePickerSheet(
			this.layoutService,
			triggerElement,
			this._buildItems(),
			item => { void this._dispatchPickerItem(item); },
			this._getAllBrowseActions(),
		);
	}
}

// Make Enter insert a newline in the dialog's editor (overrides ChatSubmitAction).
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.action.chat.automationsDialog.insertNewline',
	weight: KeybindingWeight.EditorContrib + 100,
	when: ContextKeyExpr.and(
		EditorContextKeys.textInputFocus,
		ChatContextKeys.inAutomationsDialog,
		SuggestContext.Visible.toNegated(),
	),
	primary: KeyCode.Enter,
	handler: (accessor) => {
		const editor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
		editor?.trigger('keyboard', 'type', { text: '\n' });
	},
});
