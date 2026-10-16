/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { raceCancellationError, raceTimeout } from '../../../../base/common/async.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Button, IButton, unthemedButtonStyles } from '../../../../base/browser/ui/button/button.js';
import { Checkbox } from '../../../../base/browser/ui/toggle/toggle.js';
import { Switch } from '../../../../base/browser/ui/toggle/switch.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { AnchorPosition } from '../../../../base/browser/ui/contextview/contextview.js';
import { ISelectBoxOptions, ISelectOptionItem, SelectBox } from '../../../../base/browser/ui/selectBox/selectBox.js';
import { IAction } from '../../../../base/common/actions.js';
import { cancelOnDispose, CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { getErrorMessage, isCancellationError, onUnexpectedError } from '../../../../base/common/errors.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, disposableObservableValue, IObservable, IReader, observableSignalFromEvent, observableValue, transaction, waitForState } from '../../../../base/common/observable.js';
import { getComparisonKey, isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { isStringArray } from '../../../../base/common/types.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { EditorOptions } from '../../../../editor/common/config/editorOptions.js';
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
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IQuickInputService, IQuickTreeItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { defaultButtonStyles, defaultCheckboxStyles, defaultSelectBoxStyles, getInputBoxStyle } from '../../../../platform/theme/browser/defaultStyles.js';
import { asCssVariable } from '../../../../platform/theme/common/colorUtils.js';
import { selectBorder } from '../../../../platform/theme/common/colors/inputColors.js';
import { hasNativeContextMenu } from '../../../../platform/window/common/window.js';
import { IResolvedFolderWorkspace, IWorkspacePickerItem, WorkspacePicker } from '../../chat/browser/sessionWorkspacePicker.js';
import { BranchPicker, IBranchPickerBranch, NEW_WORKTREE_LABEL } from '../../chat/browser/branchPicker.js';
import { MobileSessionTypePicker } from '../../chat/browser/mobile/mobileSessionTypePicker.js';
import { isMobilePickerSheetTarget } from '../../../browser/parts/mobile/mobilePickerSheet.js';
import { GITHUB_REMOTE_FILE_SCHEME, ISession, ISessionWorkspaceBrowseAction, SESSION_WORKSPACE_GROUP_LOCAL } from '../../../services/sessions/common/session.js';
import { IGitRepository, IGitService } from '../../../../workbench/contrib/git/common/gitService.js';
import { AutomationInterval, AutomationTarget, IAutomationDescriptor } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { AutomationToolCatalog, IAutomationCustomizationChoice, IAutomationProviderConfiguration, IAutomationService, IAutomationTool } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { automationScheduleToUTC, DAYS_OF_WEEK } from '../../../../workbench/contrib/chat/common/automations/schedule.js';
import { CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING } from '../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ChatAgentLocation } from '../../../../workbench/contrib/chat/common/constants.js';
import { SessionType } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { AgentSessionTarget } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { IChatWidget, ISessionTypePickerDelegate } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ChatInputPart, IChatInputPartOptions, IChatInputStyles } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputPart.js';
import { ChatInputPickerResponsiveLayout, IChatInputPickerResponsiveLayoutItem } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputPickerResponsiveLayout.js';
import { settingsTextInputBackground, settingsTextInputBorder, settingsTextInputForeground } from '../../../../workbench/contrib/preferences/common/settingsEditorColorRegistry.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { AutomationIsolationModel, normalizeAutomationBranchNames } from '../common/isolationGroupModel.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IAutomationSessionConfiguration } from '../../../services/sessions/common/sessionsProvider.js';
import { showMobileWorkspacePickerSheet, shouldUseMobileWorkspacePickerSheet } from '../../chat/browser/mobile/mobileWorkspacePickerSheet.js';
import { AutomationInputCompletions } from './automationInputCompletions.js';
import { NewChatModelPickerService, INewChatModelPickerService } from '../../chat/browser/newChatModelPicker.js';
import { createNewSessionControlToolbar } from '../../chat/browser/newSessionConfigToolbars.js';
import { ISessionModelSelection, SessionModelSelection } from '../../chat/browser/sessionModelSelection.js';
import { ISessionContext, SessionContext } from '../../../services/sessions/browser/sessionContext.js';
import { VisibleSession } from '../../../services/sessions/browser/visibleSessions.js';
import { setActiveSessionContextKeys } from '../../../services/sessions/common/sessionContextKeys.js';
import { SessionUsesCombinedConfigPickerContext } from '../../../common/contextkeys.js';
import { Menus } from '../../../browser/menus.js';

const $ = DOM.$;

const automationNameInputBoxStyles = getInputBoxStyle({
	inputBackground: settingsTextInputBackground,
	inputForeground: settingsTextInputForeground,
	inputBorder: settingsTextInputBorder,
});

const INTERVALS: { readonly value: AutomationInterval; readonly label: string }[] = [
	{ value: 'manual', label: localize('automation.interval.manual', "Manual") },
	{ value: 'hourly', label: localize('automation.interval.hourly', "Hourly") },
	{ value: 'daily', label: localize('automation.interval.daily', "Daily") },
	{ value: 'weekdays', label: localize('automation.interval.weekdays', "Weekdays") },
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
	cancelPromptSuggestion: () => boolean = () => false,
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
		const isPopup = target instanceof targetWindow.HTMLElement && isPopupTarget(target);
		// Keep ownership of the Escape press when the popup closes and key repeat targets the form.
		if (event.key === 'Escape' && !event.repeat) {
			const promptSuggestionCancelled = !isPopup && !event.altKey && !event.ctrlKey && !event.metaKey && cancelPromptSuggestion();
			suppressPopupEscapeKeyUp = isPopup || promptSuggestionCancelled;
			if (promptSuggestionCancelled) {
				event.preventDefault();
				event.stopImmediatePropagation();
				return;
			}
		}
		if (isPopup) {
			return;
		}
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
		if (event.key === 'Escape') {
			if (suppressPopupEscapeKeyUp) {
				event.stopImmediatePropagation();
			}
			suppressPopupEscapeKeyUp = false;
		}
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
	timeZone?: 'UTC';
	timezoneOffset?: number;
	resolvedFolderUri?: URI;
	targetDisabledReason?: string;
	targetPending?: { readonly message: string };
}

export interface IValidationState {
	scheduleError?: string;
	nameError: string | undefined;
	promptError: string | undefined;
	folderError: string | undefined;
	sessionTypeError: string | undefined;
	branchError: string | undefined;
}

export function getAutomationDialogProviders(automationService: IAutomationService, existing: IAutomationDescriptor | undefined): IObservable<readonly string[]> {
	return derived(reader => {
		if (existing === undefined) {
			return automationService.availableProviders.read(reader).map(provider => provider.id);
		}
		automationService.automations.read(reader);
		automationService.catalogueState.read(reader);
		const providerId = existing.target.providerId;
		if (providerId === undefined || !automationService.canUpdateAutomation(existing.id)) {
			return [];
		}
		return [providerId];
	});
}

interface IRenderFormHandle {
	readonly getPrompt: () => string;
	readonly getSessionConfiguration: (token: CancellationToken) => Promise<AutomationSessionConfigurationCapture>;
	readonly getBranch: () => string | undefined;
	readonly waitForAutomationSessionSync: (token: CancellationToken) => Promise<void>;
	readonly setSaving: (saving: boolean, committing?: boolean) => void;
	readonly getCustomizationIds: () => readonly string[] | undefined;
	readonly waitForCustomizationChoices: (token: CancellationToken) => Promise<void>;
	readonly showTargetValidationError: (message: string | undefined) => void;
	/** Returns the reason Create is blocked because cloud automations are unavailable, with the id of the element showing it. */
	readonly getSaveBlockedReason: (message: string | undefined) => { readonly message: string; readonly elementId: string } | undefined;
	readonly showScheduleValidationError: (message: string | undefined) => void;
	readonly showSaveError: (message: string | undefined) => void;
	readonly focusSaveError: () => void;
	readonly getFocusableElements: () => readonly HTMLElement[];
	readonly acceptPromptSuggestion: () => boolean;
	readonly cancelPromptSuggestion: () => boolean;
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
const CLOUD_CONNECT_TIMEOUT_MS = 15_000;

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

type BranchLoadState = 'noFolder' | 'loadingRepository' | 'noRepository' | 'loadingBranches' | 'ready' | 'empty' | 'error';

function setAutomationControlVisible(container: HTMLElement, visible: boolean): void {
	container.style.display = visible ? '' : 'none';
	if (visible) {
		container.removeAttribute('aria-hidden');
	} else {
		container.setAttribute('aria-hidden', 'true');
	}
}

function getAutomationToolbarResponsiveItems(toolbar: MenuWorkbenchToolBar, options: { readonly canShrink?: boolean } = {}): IChatInputPickerResponsiveLayoutItem[] {
	const items: IChatInputPickerResponsiveLayoutItem[] = [];
	for (let index = 0; index < toolbar.getItemsLength(); index++) {
		const element = toolbar.getItemElement(index);
		const action = toolbar.getItemAction(index);
		if (!element || !action) {
			continue;
		}
		items.push({
			element,
			canShrink: options.canShrink ?? true,
			isCompact: () => element.classList.contains('compact-picker'),
			setCompact: compact => {
				element.classList.toggle('compact-picker', compact);
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
	private container: HTMLElement | undefined;
	private visibleFromInput = true;

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
				label: NEW_WORKTREE_LABEL,
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
		this.container = container;
		const visible = this.visible;
		if (visible) {
			this.renderDisposables.add(autorun(reader => {
				this.visibleFromInput = visible.read(reader);
				this.updateVisibility();
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

	/** Worktree and branch pickers only apply to Git repositories, so hide them once the folder is known not to be one. */
	private updateVisibility(): void {
		if (this.container) {
			setAutomationControlVisible(this.container, this.visibleFromInput && this.branchLoadState !== 'noRepository');
		}
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
		this.updateVisibility();
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
			if (this.isolationModel.isolationMode === 'worktree') {
				this.isolationModel.selectIsolationMode('workspace');
			}
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

/** Renders a dialog-owned picker into the target toolbar without taking ownership of it. */
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
				id: Menus.AutomationsDialogTargetToolbar,
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
				id: Menus.AutomationsDialogTargetToolbar,
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
				id: Menus.AutomationsDialogTargetToolbar,
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
	allowedProviders: IObservable<readonly string[]>,
	getProviderConfiguration: (providerId: string | undefined) => IAutomationProviderConfiguration | undefined = () => undefined,
	isEdit = false,
	customizations?: { readonly service: IAutomationService; readonly hoverService: IHoverService; readonly existingId?: string },
	notifyError: (error: Error) => void = onUnexpectedError,
	quickInputService?: IQuickInputService,
): IRenderFormHandle {
	let reloadCustomizations: () => void = () => { };
	const validateForm = revalidate;
	revalidate = () => {
		reloadCustomizations();
		validateForm();
	};
	const formContent = DOM.append(form, $('.automation-form-content'));
	const nameRow = DOM.append(formContent, $('.automation-form-row'));
	DOM.append(nameRow, $('span.automation-form-label', undefined, localize('automation.form.name', "Name")));
	const nameInputContainer = DOM.append(nameRow, $('.automation-form-input-host'));
	const nameInput = disposables.add(new InputBox(nameInputContainer, contextViewService, {
		inputBoxStyles: automationNameInputBoxStyles,
		placeholder: localize('automation.form.namePlaceholder', "e.g. Morning standup notes"),
		ariaLabel: localize('automation.form.name', "Name"),
	}));
	nameInput.value = state.name;
	disposables.add(nameInput.onDidChange(value => {
		state.name = value;
		revalidate();
	}));

	const cloudRow = DOM.append(formContent, $('.automation-cloud-row'));
	const cloudCopy = DOM.append(cloudRow, $('.automation-cloud-copy'));
	const cloudLabel = DOM.append(cloudCopy, $('span.automation-cloud-label', { id: 'automation-cloud-label' }, localize('automation.form.runInCloud', "Run in the cloud")));
	// Editing locks the run target, so the switch is only described when it can be changed.
	const cloudDescription = isEdit ? undefined : DOM.append(cloudCopy, $('span.automation-cloud-description', { id: 'automation-cloud-description' }, localize('automation.form.runInCloudDescription', "Run even when your computer is off, triggered by events or on a schedule.")));
	const cloudSwitch = disposables.add(new Switch({ ariaLabel: cloudLabel.textContent! }));
	cloudSwitch.domNode.setAttribute('aria-labelledby', 'automation-cloud-label');
	if (cloudDescription) {
		cloudSwitch.domNode.setAttribute('aria-describedby', cloudDescription.id);
	}
	// The dialog cancels key-up events, which suppresses a native button's Space activation.
	disposables.add(DOM.addDisposableListener(cloudSwitch.domNode, DOM.EventType.KEY_DOWN, e => {
		if (new StandardKeyboardEvent(e).equals(KeyCode.Space)) {
			DOM.EventHelper.stop(e, true);
			cloudSwitch.domNode.click();
		}
	}));
	DOM.append(cloudRow, cloudSwitch.domNode);

	const sessionSection = DOM.append(formContent, $('.automation-session-section'));
	const scheduleRow = DOM.append(formContent, $('.automation-form-row.automation-form-schedule-row'));
	const scheduleSelectOptions: ISelectBoxOptions = {
		useCustomDrawn: !hasNativeContextMenu(configurationService),
		anchorPosition: AnchorPosition.ABOVE,
		maxVisibleOptions: 6,
	};

	const intervalGroup = DOM.append(scheduleRow, $('.automation-form-schedule-group'));
	DOM.append(intervalGroup, $('span.automation-form-label', undefined, localize('automation.form.interval', "Schedule")));
	let intervals = INTERVALS;
	const intervalOptions: ISelectOptionItem[] = intervals.map(item => ({ text: item.label }));
	const intervalIndex = Math.max(0, INTERVALS.findIndex(item => item.value === state.interval));
	const intervalSelect = disposables.add(new SelectBox(
		intervalOptions,
		intervalIndex,
		contextViewService,
		defaultSelectBoxStyles,
		{ ...scheduleSelectOptions, ariaLabel: localize('automation.form.interval', "Schedule") },
	));
	const intervalSelectContainer = DOM.append(intervalGroup, $('.automation-form-schedule-select-container'));
	intervalSelect.render(intervalSelectContainer);

	const timeGroup = DOM.append(scheduleRow, $('.automation-form-schedule-group.automation-form-time-group'));
	const timeLabel = DOM.append(timeGroup, $('span.automation-form-label', undefined, localize('automation.form.time', "Time")));
	const timeOptions = buildTimeOptions(state.hour, state.minute);
	const initialTimeIndex = timeOptions.findIndex(option => option.hour === state.hour && option.minute === state.minute);
	const timeSelect = disposables.add(new SelectBox(
		timeOptions.map(opt => ({ text: opt.label } satisfies ISelectOptionItem)),
		initialTimeIndex,
		contextViewService,
		defaultSelectBoxStyles,
		{ ...scheduleSelectOptions, ariaLabel: localize('automation.form.time', "Time") },
	));
	const timeSelectContainer = DOM.append(timeGroup, $('.automation-form-schedule-select-container.automation-form-time-select-container'));
	timeSelect.render(timeSelectContainer);
	disposables.add(timeSelect.onDidSelect(e => {
		const opt = timeOptions[e.index];
		state.hour = opt.hour;
		state.minute = opt.minute;
		revalidate();
	}));

	const dayGroup = DOM.append(scheduleRow, $('.automation-form-schedule-group.automation-form-day-group'));
	DOM.append(dayGroup, $('span.automation-form-label', undefined, localize('automation.form.day', "Day of week")));
	const dayOptions: ISelectOptionItem[] = DAYS_OF_WEEK.map(d => ({ text: d }));
	const daySelect = disposables.add(new SelectBox(
		dayOptions,
		Math.min(Math.max(state.day, 0), DAYS_OF_WEEK.length - 1),
		contextViewService,
		defaultSelectBoxStyles,
		{ ...scheduleSelectOptions, ariaLabel: localize('automation.form.day', "Day of week") },
	));
	const daySelectContainer = DOM.append(dayGroup, $('.automation-form-schedule-select-container'));
	daySelect.render(daySelectContainer);
	disposables.add(daySelect.onDidSelect(e => {
		state.day = e.index;
		revalidate();
	}));
	const scheduleError = DOM.append(formContent, $('span.automation-target-error', { role: 'status', 'aria-live': 'polite' }));
	DOM.hide(scheduleError);

	const applyIntervalVisibility = () => {
		const showTime = state.interval === 'daily' || state.interval === 'weekdays' || state.interval === 'weekly';
		const showDay = state.interval === 'weekly';
		timeGroup.style.display = showTime ? '' : 'none';
		dayGroup.style.display = showDay ? '' : 'none';
	};
	const updateIntervalOptions = (cloud: boolean) => {
		intervals = INTERVALS.filter(item => !cloud || item.value !== 'weekdays');
		const unsupportedInterval = !intervals.some(item => item.value === state.interval);
		if (unsupportedInterval) {
			intervals = [{ value: state.interval, label: localize('automation.interval.choose', "Choose a schedule") }, ...intervals];
		}
		intervalSelect.setOptions(intervals.map(item => ({
			text: item.label,
			isDisabled: unsupportedInterval && item.value === state.interval,
		})), Math.max(0, intervals.findIndex(item => item.value === state.interval)));
		applyIntervalVisibility();
	};
	applyIntervalVisibility();
	disposables.add(intervalSelect.onDidSelect(e => {
		state.interval = intervals[e.index].value;
		updateIntervalOptions(getProviderConfiguration(state.providerId) !== undefined);
		revalidate();
	}));

	// The execution mode constrains the harness before workspace selection.
	const initialProviderConfiguration = getProviderConfiguration(state.providerId);
	const runInCloud = observableValue(form, initialProviderConfiguration !== undefined);
	// New automations keep an enabled cloud provider reachable before its catalogue is ready, so the switch can
	// offer to connect; saving stays gated on allowedProviders.
	const findCloudProvider = (reader: IReader | undefined) => allowedProviders.read(reader).find(id => getProviderConfiguration(id) !== undefined)
		?? (isEdit ? undefined : sessionsManagementService.getAllProviderSessionTypes()
			.find(type => getProviderConfiguration(type.providerId)?.sessionTypes.includes(type.sessionType.id))?.providerId);
	// Cloud stays selected if it becomes unavailable while the dialog is open; it never falls back to a local provider.
	const openCloudProvider = isEdit ? (initialProviderConfiguration ? state.providerId : undefined) : findCloudProvider(undefined);
	const cloudProvider = derived(reader => findCloudProvider(reader) ?? (runInCloud.read(reader) ? openCloudProvider : undefined));
	const cloudCreatable = () => allowedProviders.get().some(id => getProviderConfiguration(id) !== undefined);
	const cloudUnavailableMessage = () => isEdit
		? localize('automation.form.cloudUnavailableEdit', "Cloud automations are unavailable. Try again in a few moments.")
		: configurationService.getValue<boolean>(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING) !== true
			? localize('automation.form.cloudDisabled', "Cloud automations are disabled. To create this automation, enable the {0} setting or turn off Run in the cloud.", CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING)
			: localize('automation.form.cloudUnavailableRetry', "Cloud automations are unavailable. Try again in a few moments, or turn off Run in the cloud.");
	// Provider configurations are not observable; the allowed providers change whenever the cloud gate does.
	const availableCloudConfiguration = derived(reader => {
		allowedProviders.read(reader);
		return getProviderConfiguration(cloudProvider.read(reader));
	});
	const cloudConfiguration = derived(reader => runInCloud.read(reader) ? availableCloudConfiguration.read(reader) : undefined);
	// Shown whenever cloud automations are enabled, decided once so the switch never appears or disappears
	// while the dialog is open. Turning it on connects to the provider when it cannot create yet.
	const showCloudSwitch = isEdit ? initialProviderConfiguration !== undefined : cloudProvider.get() !== undefined;
	setAutomationControlVisible(cloudRow, showCloudSwitch);
	cloudSwitch.disabled = isEdit;
	disposables.add(autorun(reader => {
		cloudSwitch.checked = runInCloud.read(reader);
	}));
	const sessionConfigurationErrorMessage = observableValue<string | undefined>(form, undefined);
	let switchingTarget = false;
	let connectingCloud = false;
	// A cloud draft (for example a duplicated cloud automation) has no local target to restore.
	let localTarget = initialProviderConfiguration ? { ...state, folderUri: undefined, providerId: undefined, sessionTypeId: undefined } : { ...state };
	const isolationModel = new AutomationIsolationModel(state);
	const workspaceControlsVisible = derived(reader => !runInCloud.read(reader) && !isolationModel.isQuickChatObs.read(reader) && isolationModel.folderUriObs.read(reader)?.scheme !== GITHUB_REMOTE_FILE_SCHEME && isolationModel.folderUriObs.read(reader) !== undefined);
	const sessionTypesChanged = observableSignalFromEvent(form, sessionsManagementService.onDidChangeSessionTypes);
	const sessionTypes = derived(reader => {
		sessionTypesChanged.read(reader);
		if (runInCloud.read(reader)) {
			return sessionsManagementService.getAllProviderSessionTypes().filter(type => type.providerId === cloudProvider.read(reader));
		}
		const folder = isolationModel.folderUriObs.read(reader);
		const quickChat = isolationModel.isQuickChatObs.read(reader);
		return quickChat ? sessionsManagementService.getQuickChatSessionTypes() : folder ? sessionsManagementService.getSessionTypesForFolder(folder) : [];
	});
	const pickerProviders = derived(reader => {
		const allowed = allowedProviders.read(reader);
		const cloud = cloudProvider.read(reader);
		return [...allowed, ...(cloud && !allowed.includes(cloud) ? [cloud] : [])]
			.filter(id => runInCloud.read(reader)
				? id === cloud
				: !getProviderConfiguration(id));
	});
	const sessionTypePicker = disposables.add(instantiationService.createInstance(MobileSessionTypePicker, constObservable<ISession | undefined>(undefined), {
		persistSelection: false,
		preserveUnavailableSelection: true,
		telemetrySource: 'AutomationSessionTypePicker',
		allowedProviders: pickerProviders,
		providerId: derived(reader => runInCloud.read(reader) ? cloudProvider.read(reader) : undefined),
		prepareSessionTypeSelection: () => workspacePicker.onWillSelectWorkspace(),
	}));
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
		if (switchingTarget) {
			return;
		}
		const pick = sessionTypePicker.selectedPick;
		state.providerId = pick?.providerId;
		state.sessionTypeId = pick?.sessionTypeId;
		const configuration = cloudConfiguration.get();
		const target = configuration?.getWorkspaceTarget(state.folderUri).get();
		state.resolvedFolderUri = target?.workspace;
		state.targetPending = target?.pending ? { message: target.disabledReason ?? localize('automation.form.checkingTarget', "Checking target availability...") } : undefined;
		state.targetDisabledReason = target?.pending ? undefined : target?.disabledReason;
		state.timeZone = configuration?.timeZone;
		if (runInCloud.get()) {
			state.isolationMode = undefined;
			state.branch = undefined;
			if (configuration && isEdit && initialTarget?.kind === 'workspace' && target?.workspace && !isEqual(initialTarget.folderUri, target.workspace)) {
				state.targetDisabledReason = configuration.targetChangeDisabledReason;
			}
			if (!cloudCreatable()) {
				state.targetPending = undefined;
				state.targetDisabledReason = cloudUnavailableMessage();
			}
		}
		if (connectingCloud) {
			state.targetDisabledReason = undefined;
			state.targetPending = { message: localize('automation.form.connectingCloud', "Connecting to cloud automations...") };
		}
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
		canSelectWorkspace: (folderUri, preferredProviderId) => folderUri.scheme === GITHUB_REMOTE_FILE_SCHEME
			? Promise.resolve(availableCloudConfiguration.get()?.getWorkspaceTarget(folderUri).get().workspace !== undefined)
			: canSelectAutomationWorkspace(folderUri, preferredProviderId, sessionsManagementService, workspaceTrustRequestService),
	}));
	workspacePicker.setTargetModel(isolationModel);
	workspacePicker.setLayoutService(layoutService);
	workspacePicker.setCloudConfiguration(availableCloudConfiguration);
	workspacePicker.setCloudMode(runInCloud);
	if (isEdit && initialProviderConfiguration) {
		workspacePicker.setDisabledReason(initialProviderConfiguration.targetChangeDisabledReason);
	}
	workspacePicker.onSelectionError = error => {
		logService.error('[AutomationDialog] Workspace selection failed.', error);
		notifyError(error);
	};

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
	let lastDraftTargetDiagnostic: string | undefined;
	const updateAutomationSessionTarget = () => {
		// While connecting, the local draft must survive until the switch captures its configuration.
		if (switchingTarget || connectingCloud) {
			return;
		}
		const folderUri = runInCloud.get() ? state.resolvedFolderUri : isolationModel.folderUriObs.get();
		const pick = sessionTypePicker.selectedPick;
		const isQuickChat = isolationModel.isQuickChatObs.get();
		const diagnostic = JSON.stringify({
			providerId: pick?.providerId,
			sessionType: pick?.sessionTypeId,
			cloud: runInCloud.get(),
			quickChat: isQuickChat,
			hasWorkspace: !!folderUri,
			targetDisabled: !!state.targetDisabledReason,
			targetPending: !!state.targetPending,
			providerAllowed: pick?.providerId !== undefined && allowedProviders.get().includes(pick.providerId),
		});
		if (diagnostic !== lastDraftTargetDiagnostic) {
			lastDraftTargetDiagnostic = diagnostic;
			logService.trace('[AutomationDialog] Session draft target', diagnostic);
		}
		if (!pick || state.targetDisabledReason || state.targetPending || pick.providerId === undefined || !allowedProviders.get().includes(pick.providerId) || (!isQuickChat && !folderUri)) {
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
	disposables.add(sessionsManagementService.onDidChangeSessionTypes(() => {
		updateAutomationSessionTarget();
		revalidate();
	}));
	disposables.add(autorun(reader => {
		allowedProviders.read(reader);
		pickerProviders.read(reader);
		sessionTypes.read(reader);
		cloudConfiguration.read(reader)?.getWorkspaceTarget(isolationModel.folderUriObs.read(reader)).read(reader);
		syncStateFromPicker();
		updateAutomationSessionTarget();
		revalidate();
	}));

	if (state.folderUri) {
		workspacePicker.setSelectedWorkspace(state.folderUri, { fireEvent: false, persist: false });
	}

	const targetSwitchCancellation = cancelOnDispose(disposables);
	workspacePicker.onWillSelectWorkspace = async () => {
		if (switchingTarget) {
			return false;
		}
		if (!runInCloud.get()) {
			localTarget = { ...state, branch: isolationModel.persistedBranch };
		}
		switchingTarget = true;
		// Making the form inert drops focus from whichever control started the capture.
		const focused = DOM.getActiveElement();
		formContent.toggleAttribute('inert', true);
		formContent.setAttribute('aria-busy', 'true');
		state.targetDisabledReason = undefined;
		state.targetPending = { message: localize('automation.form.switchingTarget', "Saving the current session configuration...") };
		revalidate();
		try {
			const capture = await automationSessionDraftSynchronizer.getSessionConfiguration(targetSwitchCancellation);
			if (capture.kind === 'failed') {
				throw capture.error;
			}
			return !disposables.isDisposed;
		} catch (error) {
			if (!isCancellationError(error) && !disposables.isDisposed) {
				logService.error('[AutomationDialog] Failed to capture the outgoing session configuration.', error);
				sessionConfigurationErrorMessage.set(getErrorMessage(error), undefined);
			}
			return false;
		} finally {
			switchingTarget = false;
			if (!disposables.isDisposed) {
				formContent.toggleAttribute('inert', false);
				formContent.setAttribute('aria-busy', 'false');
				if (DOM.isHTMLElement(focused) && formContent.contains(focused) && !DOM.isActiveElement(focused)) {
					focused.focus();
				}
				syncStateFromPicker();
				updateAutomationSessionTarget();
				revalidate();
			}
		}
	};
	const applyWorkspaceTarget = (uri: URI | undefined, restoreLocalTarget = false) => {
		if (switchingTarget) {
			return;
		}
		switchingTarget = true;
		transaction(() => {
			const currentPick = sessionTypePicker.selectedPick;
			isolationModel.setQuickChat(!uri && !runInCloud.get(), uri);
			const types = sessionTypes.get().filter(type => pickerProviders.get().includes(type.providerId));
			const preferred = workspacePicker.isSelectingRepository
				? types.find(type => getProviderConfiguration(type.providerId)?.sessionTypes.includes(type.sessionType.id))
				: types.find(type => type.providerId === currentPick?.providerId && type.sessionType.id === currentPick.sessionTypeId)
				?? types.find(type => type.providerId === localTarget.providerId && type.sessionType.id === localTarget.sessionTypeId);
			const first = preferred
				?? (restoreLocalTarget ? types.find(type => type.sessionType.id === SessionType.CopilotCLI) : undefined)
				?? types[0];
			const pick = first ? { providerId: first.providerId, sessionTypeId: first.sessionType.id } : undefined;
			sessionTypePicker.setFolderSource(isolationModel.folderUriObs, { initialPick: pick });
			state.providerId = pick?.providerId;
			state.sessionTypeId = pick?.sessionTypeId;
			if (restoreLocalTarget && isEqual(uri, localTarget.folderUri)) {
				state.isolationMode = localTarget.isolationMode;
				if (localTarget.branch) {
					isolationModel.selectBranch(localTarget.branch);
				}
			}
		});
		switchingTarget = false;
		syncStateFromPicker();
		updateAutomationSessionTarget();
		revalidate();
	};
	disposables.add(workspacePicker.onDidSelectWorkspace(uri => applyWorkspaceTarget(uri)));
	// As in the workspace picker, a checkout that no provider can run Cloud from is selected through its repository.
	const cloudFolderFor = (folder: URI, repository: URI | undefined) => repository && folder.scheme !== GITHUB_REMOTE_FILE_SCHEME
		&& !sessionsManagementService.getSessionTypesForFolder(folder).some(type => availableCloudConfiguration.get()?.sessionTypes.includes(type.sessionType.id))
		? repository
		: folder;
	const setRunInCloud = (checked: boolean) => {
		// A folder whose repository access is still being checked stays selected; validation blocks Create until it resolves.
		const current = checked ? state.folderUri : undefined;
		const target = current ? availableCloudConfiguration.get()?.getWorkspaceTarget(current).get() : undefined;
		const folder = checked
			? current && (target?.workspace || target?.pending) ? cloudFolderFor(current, target?.workspace) : undefined
			: localTarget.folderUri;
		switchingTarget = true;
		runInCloud.set(checked, undefined);
		if (folder) {
			workspacePicker.setSelectedWorkspace(folder, { fireEvent: false, persist: false });
		} else {
			workspacePicker.clearSelection({ persist: false });
		}
		switchingTarget = false;
		applyWorkspaceTarget(folder, !checked);
	};
	// Repository access that resolves after switching replaces such a checkout too. Editing never changes the saved target.
	disposables.add(autorun(reader => {
		const folder = isolationModel.folderUriObs.read(reader);
		const target = !isEdit && folder ? cloudConfiguration.read(reader)?.getWorkspaceTarget(folder).read(reader) : undefined;
		if (!folder || !target || target.pending || switchingTarget) {
			return;
		}
		const cloudFolder = cloudFolderFor(folder, target.workspace);
		if (!isEqual(cloudFolder, folder)) {
			workspacePicker.setSelectedWorkspace(cloudFolder, { fireEvent: false, persist: false });
			applyWorkspaceTarget(cloudFolder);
		}
	}));
	const connectFailureHover = disposables.add(new MutableDisposable());
	const connectCloud = async (): Promise<boolean> => {
		if (cloudCreatable()) {
			return true;
		}
		// Disabling the switch while connecting drops its focus, so return focus once it is usable again.
		const hadFocus = DOM.isActiveElement(cloudSwitch.domNode);
		cloudSwitch.disabled = true;
		cloudRow.setAttribute('aria-busy', 'true');
		connectingCloud = true;
		syncStateFromPicker();
		revalidate();
		try {
			const refresh = customizations?.service.refresh?.() ?? Promise.resolve();
			await raceTimeout(refresh.catch(error => logService.warn('[AutomationDialog] Cloud automations could not connect', error)), CLOUD_CONNECT_TIMEOUT_MS);
		} finally {
			connectingCloud = false;
			if (!disposables.isDisposed) {
				cloudSwitch.disabled = isEdit;
				cloudRow.removeAttribute('aria-busy');
				if (hadFocus) {
					cloudSwitch.domNode.focus();
				}
				syncStateFromPicker();
				updateAutomationSessionTarget();
				revalidate();
			}
		}
		return !disposables.isDisposed && cloudCreatable();
	};
	const showConnectFailure = () => {
		const message = localize('automation.form.runInCloudUnavailable', "Unable to load cloud automations. Please try again in a few moments.");
		status(message);
		connectFailureHover.value = customizations?.hoverService.showInstantHover({
			content: message,
			target: cloudSwitch.domNode,
			position: { hoverPosition: HoverPosition.BELOW },
			appearance: { showPointer: true },
		});
	};
	disposables.add(cloudSwitch.onChange(async checked => {
		connectFailureHover.clear();
		if (checked && !await connectCloud()) {
			if (!disposables.isDisposed) {
				cloudSwitch.checked = runInCloud.get();
				showConnectFailure();
			}
			return;
		}
		if (!await workspacePicker.onWillSelectWorkspace() || (checked && !availableCloudConfiguration.get())) {
			cloudSwitch.checked = runInCloud.get();
			return;
		}
		setRunInCloud(checked);
	}));
	disposables.add(autorun(reader => {
		if (isolationModel.isQuickChatObs.read(reader)) {
			applyWorkspaceTarget(undefined);
		}
	}));

	const targetRow = DOM.append(sessionSection, $('.automation-form-row.automation-target-row'));
	const targetContainer = DOM.append(targetRow, $('.automation-target-toolbar', {
		role: 'group',
		'aria-label': localize('automation.form.target', "Target"),
	}));
	const targetError = DOM.append(targetRow, $('span.automation-target-error', {
		id: 'automation-target-error',
		role: 'status',
		'aria-live': 'polite',
		'aria-atomic': 'true',
	}));
	DOM.hide(targetError);
	const targetProgress = DOM.append(targetRow, $('span.automation-target-progress', {
		id: 'automation-target-progress',
		role: 'status',
		'aria-live': 'polite',
		'aria-atomic': 'true',
	}));
	DOM.hide(targetProgress);
	if (isEdit && initialProviderConfiguration) {
		DOM.append(targetRow, $('span.automation-form-hint', undefined, initialProviderConfiguration.targetChangeDisabledReason));
	}
	const promptSection = DOM.append(sessionSection, $('.automation-prompt-section'));
	const promptRow = DOM.append(promptSection, $('.automation-form-row'));
	const promptHost = DOM.append(promptRow, $('.automation-form-prompt-host.interactive-session'));
	const editorOverflowWidgetsDomNode = layoutService.getContainer(DOM.getWindow(promptHost)).appendChild($('.chat-editor-overflow.automation-dialog-editor-overflow.monaco-editor'));
	disposables.add(toDisposable(() => editorOverflowWidgetsDomNode.remove()));
	const activeAutomationSession = disposables.add(disposableObservableValue<VisibleSession | undefined>(form, undefined));
	disposables.add(autorun(reader => {
		const session = sessionsManagementService.automationSession.read(reader);
		activeAutomationSession.set(session ? new VisibleSession(session, session.mainChat.read(reader)) : undefined, undefined);
	}));
	const scopedContextKeyService = disposables.add(contextKeyService.createScoped(sessionSection));
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
	disposables.add(autorun(reader => {
		sessionTypesChanged.read(reader);
		const session = activeAutomationSession.read(reader);
		setActiveSessionContextKeys(session, scopedContextKeyService, reader);
		usesCombinedConfigPicker.set(!!session && sessionsManagementService.usesCombinedNewSessionConfigPicker(session));
	}));

	const targetToolbar = disposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, targetContainer, Menus.AutomationsDialogTargetToolbar, {
		ariaLabel: localize('automation.form.targetOptions', "Automation target options"),
		telemetrySource: 'automations.dialog',
		hiddenItemStrategy: HiddenItemStrategy.NoHide,
		responsiveBehavior: {
			enabled: true,
			kind: 'all',
			actionMinWidth: 22,
			allowOverflow: false,
		},
		actionViewItemProvider: (action, itemOptions) => {
			if (action.id === AUTOMATIONS_HARNESS_CHIP_ACTION_ID) {
				return new AutomationPickerActionViewItem(action, container => sessionTypePicker.render(container), undefined, itemOptions);

			}
			if (action.id === AUTOMATIONS_WORKSPACE_PICKER_ACTION_ID) {
				return new AutomationPickerActionViewItem(action, container => workspacePicker.render(container), undefined, itemOptions);
			}
			if (action.id === AUTOMATIONS_ISOLATION_GROUP_ACTION_ID) {
				return instantiationService.createInstance(
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
			}
			return undefined;
		},
	}));
	const targetLayout = disposables.add(new ChatInputPickerResponsiveLayout('AutomationDialog.target', targetContainer, {
		getItems: () => getAutomationToolbarResponsiveItems(targetToolbar, { canShrink: false }),
		hasOverflow: () => targetToolbar.hasOverflow(),
		relayout: () => targetToolbar.relayout(),
	}));
	targetLayout.layout();

	const chatInputStyles: IChatInputStyles = {
		overlayBackground: 'var(--vscode-input-background)',
		listForeground: 'var(--vscode-foreground)',
		listBackground: 'var(--vscode-input-background)',
	};
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
		inputEditorQuickSuggestions: EditorOptions.quickSuggestions.defaultValue,
		// The dialog renders the composer flush with its form column (the
		// `.interactive-input-part` margin is zeroed in CSS), so there is no
		// outer horizontal gutter. Without this, ChatInputPart would still
		// reserve the default 24px margin and lay the editor out too narrow,
		// leaving its scrollbar floating ~24px in from the right wall.
		inputPartHorizontalPadding: 0,
		editorOverflowWidgetsDomNode,
		sessionTypePickerDelegate: sessionTypeDelegate,
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
	const sessionConfigContainer = chatInput.inputToolbarElement;
	sessionConfigContainer.classList.add('automation-session-config', 'sessions-chat-config-toolbar');
	chatInput.setInputToolbarAriaLabel(localize('automation.form.sessionConfigurationOptions', "Session configuration options"));
	const sessionConfiguration = DOM.append(promptSection, $('.automation-session-configuration'));
	const sessionControlsContainer = DOM.append(sessionConfiguration, $('.automation-session-controls'));
	const sessionControlsToolbar = disposables.add(createNewSessionControlToolbar(
		sessionControlsContainer,
		scopedInstantiationService,
		localize('automation.form.sessionControls', "Session controls"),
	));
	const sessionControlsLayout = disposables.add(new ChatInputPickerResponsiveLayout('AutomationDialog.sessionControls', sessionControlsContainer, {
		getItems: () => getAutomationToolbarResponsiveItems(sessionControlsToolbar),
		hasOverflow: () => sessionControlsToolbar.hasOverflow(),
		relayout: () => sessionControlsToolbar.relayout(),
	}));
	sessionControlsLayout.layout();
	const sessionConfigurationUnavailable = DOM.append(sessionConfiguration, $('span.automation-session-configuration-unavailable', {
		role: 'status',
		'aria-atomic': 'true',
	}));
	disposables.add(autorun(reader => {
		const hasTarget = isolationModel.isQuickChatObs.read(reader) || isolationModel.folderUriObs.read(reader) !== undefined;
		const cloud = runInCloud.read(reader);
		setAutomationControlVisible(sessionConfigContainer, hasTarget);
		setAutomationControlVisible(sessionControlsContainer, hasTarget && !cloud);
		const availability = automationSessionDraftSynchronizer.availability.read(reader);
		const pending = availability === 'pending';
		const controlsUnavailable = availability !== 'available';
		setAutomationControlVisible(sessionConfiguration, hasTarget && (!cloud || controlsUnavailable));
		for (const container of [sessionConfigContainer, sessionControlsContainer]) {
			container.classList.toggle('controls-unavailable', controlsUnavailable);
			container.toggleAttribute('inert', controlsUnavailable);
			container.setAttribute('aria-hidden', String(!hasTarget || controlsUnavailable || cloud && container === sessionControlsContainer));
			container.setAttribute('aria-busy', String(pending));
		}
		sessionConfigurationUnavailable.textContent = pending
			? localize('automation.form.sessionConfigurationLoading', "Loading session configuration…")
			: hasTarget && controlsUnavailable
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

	const providerDetails = DOM.append(promptSection, $('.automation-provider-details.automation-form-row', { role: 'group', 'aria-labelledby': 'automation-tools-label' }));
	DOM.append(providerDetails, $('span.automation-form-label', { id: 'automation-tools-label' }, localize('automation.tools', "Tools")));
	const toolsContainer = DOM.append(providerDetails, $('.automation-provider-tools'));
	const toolsButton = disposables.add(new Button(toolsContainer, { ...defaultButtonStyles, secondary: true, buttonSecondaryBorder: asCssVariable(selectBorder) }));
	toolsButton.label = localize('automation.configureAllowedTools', "Configure allowed tools");
	toolsButton.element.setAttribute('aria-haspopup', 'dialog');
	const toolsNotReported = DOM.append(toolsContainer, $('p', undefined, localize('automation.toolsNotReported', "GitHub did not report the saved tool selection. Unchanged permissions will be preserved. Select tools to replace it explicitly.")));
	const toolsStatus = DOM.append(providerDetails, $('.automation-provider-tools-status', { role: 'status', 'aria-live': 'polite' }));
	const toolsStatusText = DOM.append(toolsStatus, $('span'));
	const toolsRetry = disposables.add(new Button(toolsStatus, { ...defaultButtonStyles, secondary: true }));
	toolsRetry.label = localize('automation.retryTools', "Retry");
	const toolsPicker = disposables.add(new MutableDisposable<DisposableStore>());
	let selectedTools: string[] | undefined;
	let selectAllCatalogTools = false;
	let toolsInitialized = false;
	let toolCatalog: AutomationToolCatalog = { kind: 'loading' };
	const catalogToolIds = (catalog: AutomationToolCatalog) => catalog.kind === 'ready'
		? [...new Set(catalog.groups.flatMap(group => group.tools.map(tool => tool.id)))]
		: [];
	const updateToolsControls = () => {
		const ready = toolCatalog.kind === 'ready';
		if (ready && selectAllCatalogTools) {
			selectedTools = catalogToolIds(toolCatalog);
			selectAllCatalogTools = false;
		}
		toolsButton.enabled = ready && !!quickInputService;
		const ids = new Set([...catalogToolIds(toolCatalog), ...selectedTools ?? []]);
		if (ready && selectedTools) {
			toolsButton.label = ids.size === new Set(selectedTools).size
				? localize('automation.allToolsAllowed', "All tools allowed")
				: selectedTools.length === 1
					? localize('automation.oneToolAllowed', "1 tool allowed")
					: localize('automation.toolsAllowedCount', "{0} tools allowed", selectedTools.length);
			toolsButton.element.setAttribute('aria-description', localize('automation.toolsSelectedCount', "{0} of {1} tools selected", selectedTools.length, ids.size));
		} else {
			toolsButton.label = localize('automation.configureAllowedTools', "Configure allowed tools");
			toolsButton.element.removeAttribute('aria-description');
		}
		setAutomationControlVisible(toolsNotReported, selectedTools === undefined && !selectAllCatalogTools);
		toolsStatusText.textContent = toolCatalog.kind === 'loading'
			? localize('automation.toolsLoading', "Loading available tools...")
			: toolCatalog.kind === 'error' ? toolCatalog.message : '';
		setAutomationControlVisible(toolsStatus, !ready);
		setAutomationControlVisible(toolsRetry.element, toolCatalog.kind === 'error');
	};
	disposables.add(toolsRetry.onDidClick(() => cloudConfiguration.get()?.loadTools()));
	disposables.add(toolsButton.onDidClick(() => {
		if (!quickInputService || toolCatalog.kind !== 'ready') {
			return;
		}
		const store = new DisposableStore();
		let disposing = false;
		store.add(toDisposable(() => disposing = true));
		toolsPicker.value = store;
		const shown = new Set<string>();
		const toItem = (tool: IAutomationTool): IQuickTreeItem => {
			shown.add(tool.id);
			return { id: tool.id, label: tool.label, description: tool.description, checked: selectedTools?.includes(tool.id) === true };
		};
		const items: IQuickTreeItem[] = [];
		for (const group of toolCatalog.groups) {
			const children = group.tools.filter(tool => !shown.has(tool.id)).map(toItem);
			if (children.length) {
				items.push({ label: group.label, children, collapsed: true });
			}
		}
		const unknown = (selectedTools ?? []).filter(id => !shown.has(id));
		if (unknown.length) {
			items.push({
				label: localize('automation.savedToolsNotInCatalog', "Other Saved Tools"),
				children: unknown.map(id => toItem({ id, label: id })),
				collapsed: true,
			});
		}
		const picker = store.add(quickInputService.createQuickTree<IQuickTreeItem>());
		picker.title = localize('automation.allowedToolsTitle', "Allowed Tools");
		picker.placeholder = localize('automation.searchTools', "Search tools");
		picker.matchOnDescription = true;
		picker.sortByLabel = false;
		picker.setItemTree(items);
		store.add(picker.onDidChangeCheckedLeafItems(items => {
			selectedTools = items.flatMap(item => item.id ? [item.id] : []);
			updateToolsControls();
		}));
		store.add(picker.onDidAccept(() => picker.hide()));
		store.add(picker.onDidHide(() => {
			if (disposing) {
				return;
			}
			toolsPicker.clear();
			toolsButton.focus();
		}));
		picker.show();
	}));
	disposables.add(autorun(reader => {
		const configuration = cloudConfiguration.read(reader);
		toolsPicker.clear();
		updateIntervalOptions(configuration !== undefined);
		setAutomationControlVisible(providerDetails, configuration !== undefined);
		timeLabel.textContent = configuration?.timeZone === 'UTC' ? localize('automation.form.timeLocal', "Time (Local)") : localize('automation.form.time', "Time");
		timeSelect.setAriaLabel(timeLabel.textContent);
		if (!configuration) {
			return;
		}
		if (!toolsInitialized) {
			const stored = initialProviderConfiguration ? initialSessionConfiguration?.sessionTemplate?.config?.tools : undefined;
			selectedTools = isStringArray(stored) ? [...stored] : undefined;
			selectAllCatalogTools = selectedTools === undefined && !(isEdit && initialProviderConfiguration);
			toolsInitialized = true;
		}
	}));
	disposables.add(autorun(reader => {
		const configuration = cloudConfiguration.read(reader);
		toolCatalog = configuration?.tools.read(reader) ?? { kind: 'loading' };
		if (toolCatalog.kind === 'loading') {
			configuration?.loadTools();
		}
		updateToolsControls();
	}));
	const resolveSelectedTools = async (configuration: IAutomationProviderConfiguration, token: CancellationToken): Promise<string[] | undefined> => {
		if (!selectAllCatalogTools) {
			return selectedTools;
		}
		configuration.loadTools();
		const cts = new CancellationTokenSource(token);
		let catalog: AutomationToolCatalog;
		try {
			catalog = await waitForState(configuration.tools, catalog => catalog.kind !== 'loading', undefined, cts.token);
		} finally {
			cts.dispose(true);
		}
		if (catalog.kind === 'error') {
			throw new Error(catalog.message);
		}
		updateToolsControls();
		return selectedTools;
	};

	const customizationSelection = customizations ? disposables.add(new AutomationCustomizationSelection(
		formContent, customizations.service, customizations.hoverService, logService, customizations.existingId,
	)) : undefined;
	reloadCustomizations = () => customizationSelection?.updateTarget(
		state.providerId && state.sessionTypeId && allowedProviders.get().includes(state.providerId)
			? createAutomationTarget(state, isolationModel.persistedBranch)
			: undefined,
	);
	disposables.add(onDidChangeSessionTarget.event(reloadCustomizations));
	disposables.add(autorun(reader => {
		isolationModel.isQuickChatObs.read(reader);
		isolationModel.folderUriObs.read(reader);
		allowedProviders.read(reader);
		reloadCustomizations();
	}));

	const saveStatus = DOM.append(form, $('span.automation-form-save-status', {
		role: 'status',
		'aria-atomic': 'true',
	}));
	const saveIcon = DOM.append(saveStatus, renderIcon(Codicon.loading));
	saveIcon.classList.add('codicon-modifier-spin');
	saveIcon.setAttribute('aria-hidden', 'true');
	const saveStatusText = DOM.append(saveStatus, $('span'));
	DOM.hide(saveStatus);
	const saveError = DOM.append(form, $('.automation-form-save-error', { role: 'alert', tabindex: '-1' }));
	DOM.append(saveError, renderIcon(Codicon.error)).setAttribute('aria-hidden', 'true');
	const saveErrorText = DOM.append(saveError, $('span'));
	DOM.hide(saveError);
	disposables.add(autorun(reader => {
		const message = sessionConfigurationErrorMessage.read(reader);
		setAutomationControlVisible(saveError, !!message);
		saveErrorText.textContent = message ?? '';
	}));

	return {
		getPrompt: () => chatInput.inputEditor.getValue(),
		getSessionConfiguration: async token => {
			const captured = await automationSessionDraftSynchronizer.getSessionConfiguration(token);
			const configuration = cloudConfiguration.get();
			if (captured.kind === 'failed' || !configuration) {
				return captured;
			}
			let tools: string[] | undefined;
			try {
				tools = await resolveSelectedTools(configuration, token);
			} catch (error) {
				return { kind: 'failed', error };
			}
			if (tools === undefined) {
				return captured;
			}
			return {
				kind: 'captured',
				configuration: {
					...captured.configuration,
					sessionTemplate: {
						...captured.configuration?.sessionTemplate,
						config: { ...captured.configuration?.sessionTemplate?.config, tools },
					},
				},
			};
		},
		getBranch: () => isolationModel.persistedBranch,
		showScheduleValidationError: message => {
			scheduleError.textContent = message ?? '';
			setAutomationControlVisible(scheduleError, message !== undefined);
		},
		getCustomizationIds: () => customizationSelection?.getSelectedIds(),
		waitForCustomizationChoices: async token => customizationSelection?.waitForChoices(token),
		showTargetValidationError: message => {
			if (!isEdit && runInCloud.get() && !state.folderUri && message !== cloudUnavailableMessage()) {
				message = undefined;
			}
			const text = message ?? '';
			const pending = state.targetPending;
			setAutomationControlVisible(targetProgress, !!pending && message === undefined);
			const progressText = pending?.message ?? '';
			if (targetProgress.textContent !== progressText) {
				targetProgress.textContent = progressText;
			}
			targetContainer.setAttribute('aria-busy', String(!!pending));
			if (message !== undefined) {
				DOM.show(targetError);
				targetContainer.setAttribute('aria-describedby', targetError.id);
				targetContainer.setAttribute('aria-invalid', 'true');
			} else {
				DOM.hide(targetError);
				if (pending) {
					targetContainer.setAttribute('aria-describedby', targetProgress.id);
				} else {
					targetContainer.removeAttribute('aria-describedby');
				}
				targetContainer.removeAttribute('aria-invalid');
			}
			if (targetError.textContent !== text) {
				targetError.textContent = text;
			}
		},
		getSaveBlockedReason: message => !isEdit && message === cloudUnavailableMessage()
			? { message, elementId: targetError.id }
			: undefined,
		waitForAutomationSessionSync: token => {
			updateAutomationSessionTarget();
			return automationSessionDraftSynchronizer.waitForSync(token);
		},
		setSaving: (saving, committing) => {
			formContent.toggleAttribute('inert', saving);
			formContent.setAttribute('aria-busy', String(saving));
			form.classList.toggle('saving', saving);
			if (saving) {
				DOM.show(saveStatus);
				saveStatusText.textContent = committing && customizationSelection?.getSelectedIds()?.length
					? localize('automation.form.syncingCustomizations', "Syncing customizations…")
					: localize('automation.form.saving', "Saving automation…");
			} else {
				DOM.hide(saveStatus);
				saveStatusText.textContent = '';
			}
		},
		showSaveError: message => {
			sessionConfigurationErrorMessage.set(message, undefined);
		},
		focusSaveError: () => saveError.focus(),
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
		cancelPromptSuggestion: () => {
			const suggestController = SuggestController.get(chatInput.inputEditor);
			if (!chatInput.inputEditor.hasTextFocus() || !suggestController || suggestController.model.state === SuggestState.Idle) {
				return false;
			}
			suggestController.cancelSuggestWidget();
			return true;
		},
	};
}

export class AutomationCustomizationSelection extends Disposable {
	private readonly section: HTMLElement;
	private readonly disclosure: Button;
	private readonly chevron: HTMLElement;
	private readonly summary: HTMLElement;
	private readonly content: HTMLElement;
	private readonly rows = this._register(new DisposableStore());
	private readonly request = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly toggles = new Map<string, boolean>();
	private choices: readonly IAutomationCustomizationChoice[] | undefined;
	private loading: Promise<void> = Promise.resolve();
	private targetKey: string | undefined;
	private expanded = false;

	constructor(
		container: HTMLElement,
		private readonly service: IAutomationService,
		private readonly hoverService: IHoverService,
		private readonly logService: ILogService,
		private readonly existingId?: string,
	) {
		super();
		this._register(toDisposable(() => this.request.value?.cancel()));
		this.section = DOM.append(container, $('.automation-advanced'));
		this.disclosure = this._register(new Button(this.section, { ...unthemedButtonStyles, secondary: true }));
		this.disclosure.element.classList.add('automation-advanced-disclosure', 'automation-form-label');
		this.chevron = DOM.append(this.disclosure.element, $('span.automation-advanced-chevron', { 'aria-hidden': 'true' }));
		DOM.append(this.chevron, renderIcon(Codicon.chevronRight));
		DOM.append(this.disclosure.element, $('span', undefined, localize('automation.advanced', "Advanced")));
		this.summary = DOM.append(this.disclosure.element, $('span.automation-advanced-summary'));
		this.content = DOM.append(this.section, $('.automation-customizations', { id: 'automation-customizations' }));
		this.disclosure.element.setAttribute('aria-controls', this.content.id);
		this.disclosure.element.setAttribute('aria-expanded', 'false');
		DOM.hide(this.section, this.content);
		this._register(this.disclosure.onDidClick(() => {
			this.expanded = !this.expanded;
			this.disclosure.element.setAttribute('aria-expanded', String(this.expanded));
			DOM.reset(this.chevron, renderIcon(this.expanded ? Codicon.chevronDown : Codicon.chevronRight));
			this.content.hidden = !this.expanded;
			this.content.style.display = this.expanded ? '' : 'none';
			this.summary.hidden = this.expanded;
		}));
	}

	getSelectedIds(): readonly string[] | undefined {
		return this.choices?.filter(choice => this.toggles.get(choice.id) ?? choice.selected).map(choice => choice.id);
	}

	/** Waits for the choices of the current target to load, so a save never omits the selection. */
	async waitForChoices(token: CancellationToken): Promise<void> {
		await raceCancellationError(this.loading, token);
	}

	updateTarget(target: AutomationTarget | undefined): void {
		const key = target ? JSON.stringify({
			kind: target.kind,
			providerId: target.providerId,
			sessionTypeId: target.sessionTypeId,
			folder: target.kind === 'workspace' ? getComparisonKey(target.folderUri) : undefined,
			// Isolation changes count as a new target for the saved selection, as in the provider.
			isolation: target.kind === 'workspace' ? target.isolation : undefined,
		}) : undefined;
		if (key === this.targetKey) {
			return;
		}
		this.targetKey = key;
		this.request.value?.cancel();
		this.request.clear();
		this.choices = undefined;
		this.rows.clear();
		DOM.clearNode(this.content);
		if (!target || !target.providerId || !target.sessionTypeId || !this.service.getCustomizationChoices) {
			DOM.hide(this.section);
			return;
		}
		DOM.show(this.section);
		this.summary.textContent = localize('automation.customizations.loadingSummary', "Loading…");
		const loading = DOM.append(this.content, $('.automation-customizations-message', { role: 'status' }));
		const icon = DOM.append(loading, renderIcon(Codicon.loading));
		icon.classList.add('codicon-modifier-spin');
		icon.setAttribute('aria-hidden', 'true');
		DOM.append(loading, $('span', undefined, localize('automation.customizations.loading', "Loading customizations…")));
		const request = new CancellationTokenSource();
		this.request.value = request;
		this.loading = this.load(target, request);
	}

	private async load(target: AutomationTarget, request: CancellationTokenSource): Promise<void> {
		try {
			const choices = await this.service.getCustomizationChoices?.(target, this.existingId, request.token);
			if (request.token.isCancellationRequested || this._store.isDisposed) {
				return;
			}
			this.choices = choices;
			if (choices === undefined) {
				DOM.hide(this.section);
				return;
			}
			this.renderChoices(choices);
		} catch (error) {
			if (!request.token.isCancellationRequested && !this._store.isDisposed) {
				this.logService.error('[AutomationDialog] Failed to load customization choices.', error);
				DOM.hide(this.section);
			}
		}
	}

	private updateSummary(): void {
		const outdated = this.choices?.filter(choice => choice.outdated).length ?? 0;
		this.summary.textContent = outdated
			? localize('automation.customizations.summaryOutdated', "{0} of {1} customizations · {2} outdated", this.getSelectedIds()?.length ?? 0, this.choices?.length ?? 0, outdated)
			: localize('automation.customizations.summary', "{0} of {1} customizations", this.getSelectedIds()?.length ?? 0, this.choices?.length ?? 0);
	}

	private renderChoices(choices: readonly IAutomationCustomizationChoice[]): void {
		DOM.clearNode(this.content);
		DOM.append(this.content, $('span.automation-form-label', undefined, localize('automation.customizations.heading', "Customizations")));
		DOM.append(this.content, $('p.automation-customizations-description', undefined, localize('automation.customizations.description', "Choose which plugins and customizations runs of this automation can use.")));
		if (!choices.length) {
			DOM.append(this.content, $('p.automation-customizations-description', undefined, localize('automation.customizations.empty', "No customizations are available for this target.")));
		}
		for (const [index, choice] of choices.entries()) {
			const row = DOM.append(this.content, $('.automation-customization-row'));
			const checkbox = this.rows.add(new Checkbox(choice.label, this.toggles.get(choice.id) ?? choice.selected, defaultCheckboxStyles));
			row.appendChild(checkbox.domNode);
			const text = DOM.append(row, $('.automation-customization-text'));
			const label = DOM.append(text, $('span.automation-customization-label', { id: `automation-customization-${index}` }, choice.label));
			checkbox.domNode.setAttribute('aria-labelledby', label.id);
			this.rows.add(this.hoverService.setupDelayedHover(label, { content: choice.label }));
			if (choice.description) {
				const description = DOM.append(text, $('span.automation-customization-description', { id: `automation-customization-description-${index}` }, choice.description));
				checkbox.domNode.setAttribute('aria-describedby', description.id);
				this.rows.add(this.hoverService.setupDelayedHover(description, { content: choice.description }));
			}
			if (choice.outdated) {
				const outdated = DOM.append(row, $('span.automation-customization-outdated', { id: `automation-customization-outdated-${index}` }, localize('automation.customizations.outdated', "Outdated")));
				checkbox.domNode.setAttribute('aria-describedby', choice.description
					? `automation-customization-description-${index} ${outdated.id}`
					: outdated.id);
			}
			this.rows.add(checkbox.onChange(() => {
				this.toggles.set(choice.id, checkbox.checked);
				this.updateSummary();
			}));
			this.rows.add(DOM.addDisposableListener(text, DOM.EventType.CLICK, () => {
				checkbox.checked = !checkbox.checked;
				this.toggles.set(choice.id, checkbox.checked);
				this.updateSummary();
				checkbox.focus();
			}));
		}
		if (choices.some(choice => choice.outdated)) {
			const hint = DOM.append(this.content, $('.automation-customizations-message'));
			DOM.append(hint, renderIcon(Codicon.info)).setAttribute('aria-hidden', 'true');
			DOM.append(hint, $('span', undefined, localize('automation.customizations.outdatedHint', "Outdated customizations will be updated when the automation is saved.")));
		}
		this.updateSummary();
	}
}

export function createAutomationTarget(state: IFormState, branch: string | undefined): AutomationTarget | undefined {
	if (state.isQuickChat) {
		return state.providerId && state.sessionTypeId
			? { kind: 'quickChat', providerId: state.providerId, sessionTypeId: state.sessionTypeId }
			: undefined;
	}
	if (!state.folderUri) {
		return undefined;
	}
	const isolation = state.isolationMode === 'worktree'
		? (branch ? { kind: 'worktree' as const, branch } : undefined)
		: state.isolationMode === 'workspace'
			? { kind: 'folder' as const }
			: { kind: 'default' as const };
	return isolation
		? { kind: 'workspace', folderUri: state.resolvedFolderUri ?? state.folderUri, providerId: state.providerId, sessionTypeId: state.sessionTypeId, isolation }
		: undefined;
}

interface ITimeOption {
	readonly hour: number;
	readonly minute: number;
	readonly label: string;
}

function buildTimeOptions(initialHour: number, initialMinute: number): readonly ITimeOption[] {
	const options: ITimeOption[] = [];
	for (let hour = 0; hour < 24; hour++) {
		for (let minute = 0; minute < 60; minute++) {
			if (minute % 15 !== 0 && (hour !== initialHour || minute !== initialMinute)) {
				continue;
			}
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

export function updateSaveButtonState(
	saveButton: IButton | undefined,
	state: IFormState,
	validation: IValidationState,
	form: HTMLElement,
	getPrompt: () => string,
	getBranch: () => string | undefined,
	sessionsManagementService: ISessionsManagementService,
	providerAvailable = true,
	originalProviderId?: string,
	requireName = true,
): void {
	validation.nameError = requireName && state.name.trim() === ''
		? localize('automation.form.nameRequired', "Name is required.")
		: undefined;
	validation.promptError = getPrompt().trim() === ''
		? localize('automation.form.promptRequired', "Prompt is required.")
		: undefined;
	validation.folderError = !state.folderUri
		&& !state.isQuickChat
		? localize('automation.form.folderRequired', "Workspace folder is required.")
		: undefined;
	if (originalProviderId !== undefined && state.providerId !== originalProviderId) {
		validation.sessionTypeError = localize('automation.form.hostChanged', "To use another Agent Host, duplicate this automation. The original keeps its schedule until you disable it.");
	} else if (state.targetPending) {
		validation.sessionTypeError = undefined;
	} else if (state.targetDisabledReason !== undefined) {
		validation.sessionTypeError = state.targetDisabledReason;
	} else if (!providerAvailable) {
		validation.sessionTypeError = localize('automation.form.hostUnavailable', "Choose an available Agent Host that supports automations.");
	} else if (!state.sessionTypeId || !state.providerId) {
		validation.sessionTypeError = localize('automation.form.sessionTypeRequired', "Session type is required.");
	} else {
		const target = { providerId: state.providerId, sessionTypeId: state.sessionTypeId };
		if (state.isQuickChat && !sessionsManagementService.isQuickChatTargetAvailable(target)) {
			validation.sessionTypeError = localize('automation.form.quickChatUnavailable', "The selected Agent Host and session type cannot run without a workspace. Choose a workspace or another session type.");
		} else if (!state.isQuickChat && state.folderUri !== undefined && !sessionsManagementService.isNewSessionTargetAvailable(state.resolvedFolderUri ?? state.folderUri, target)) {
			validation.sessionTypeError = localize('automation.form.workspaceTargetUnavailable', "The selected Agent Host and session type cannot use this workspace. Choose another workspace or session type.");
		} else {
			validation.sessionTypeError = undefined;
		}
	}
	validation.branchError = !state.isQuickChat && state.isolationMode === 'worktree' && !getBranch()
		? localize('automation.form.branchRequired', "A branch is required for Worktree isolation.")
		: undefined;

	const utcSchedule = state.timeZone === 'UTC' ? automationScheduleToUTC({
		interval: state.interval, scheduleHour: state.hour, scheduleMinute: state.minute, scheduleDay: state.day,
	}, state.timezoneOffset) : undefined;
	validation.scheduleError = !INTERVALS.some(item => item.value === state.interval)
		? localize('automation.form.scheduleRequired', "Choose a supported schedule.")
		: utcSchedule && state.interval === 'weekdays'
			? localize('automation.form.cloudWeekdays', "Weekdays is only available for local automations. Choose a supported schedule for Cloud.")
			: utcSchedule && (state.interval === 'daily' || state.interval === 'weekly') && utcSchedule.scheduleMinute % 15 !== 0
				? localize('automation.form.cloudScheduleMinute', "Choose a time that corresponds to minute 00, 15, 30, or 45 in UTC.")
				: undefined;
	const valid = !validation.nameError && !validation.promptError && !validation.folderError && !validation.sessionTypeError && !validation.branchError && !validation.scheduleError;
	if (saveButton) {
		saveButton.enabled = valid && !state.targetPending;
	}
	form.classList.toggle('automation-form-invalid', !valid);
}

export class AutomationsWorkspacePicker extends WorkspacePicker {
	private readonly targetModelWatch = this._register(new MutableDisposable<IDisposable>());
	private readonly eligibilityWatch = this._register(new MutableDisposable<IDisposable>());
	private cloudConfiguration: IObservable<IAutomationProviderConfiguration | undefined> = constObservable(undefined);
	private cloudMode: IObservable<boolean> | undefined;
	private persistSelection = true;
	private targetModel: AutomationIsolationModel | undefined;
	private readonly repositorySelection = this._register(new MutableDisposable<DisposableStore>());
	private readonly cloudModeWatch = this._register(new MutableDisposable<IDisposable>());
	private selectionGeneration = 0;
	private selectingRepository = false;
	protected disabledReason: string | undefined;
	get isSelectingRepository(): boolean { return this.selectingRepository; }
	onSelectionError: (error: Error) => void = onUnexpectedError;
	onWillSelectWorkspace: () => Promise<boolean> = async () => true;

	setCloudMode(mode: IObservable<boolean>): void {
		this.cloudMode = mode;
		// A repository selection still pending from the previous execution mode must not apply after a switch.
		let previous = mode.get();
		this.cloudModeWatch.value = autorun(reader => {
			const current = mode.read(reader);
			if (current !== previous) {
				previous = current;
				this.selectionGeneration++;
				this.repositorySelection.clear();
			}
		});
		this.setCloudConfiguration(this.cloudConfiguration);
	}

	/** Dialog-only transitions pass `persist: false` so clearing the selection keeps the shared workspace preference. */
	override clearSelection(options?: { readonly persist?: boolean }): void {
		this.persistSelection = options?.persist ?? true;
		try {
			super.clearSelection();
		} finally {
			this.persistSelection = true;
		}
	}

	protected override _shouldPersistSelection(): boolean {
		return this.persistSelection && super._shouldPersistSelection();
	}

	setDisabledReason(reason: string | undefined): void {
		this.disabledReason = reason;
		if (reason !== undefined) {
			this.selectionGeneration++;
			this.repositorySelection.clear();
		}
		this._updateTriggerLabel();
	}

	setCloudConfiguration(configuration: IObservable<IAutomationProviderConfiguration | undefined>): void {
		this.cloudConfiguration = configuration;
		this.eligibilityWatch.value = autorun(reader => {
			const value = configuration.read(reader);
			const cloud = this.cloudMode?.read(reader);
			// Watch every recent folder, not just current candidates, so a repository appears once Git detection finishes.
			for (const { workspace } of cloud ? super._getRecentWorkspaces() : []) {
				const folder = workspace.folders[0]?.root ?? workspace.uri;
				value?.getWorkspaceTarget(folder).read(reader);
				this.isGitWorkspace(folder, reader);
			}
			if (this.actionWidgetService.isVisible && this._triggerElement?.getAttribute('aria-expanded') === 'true') {
				this.actionWidgetService.updateItems(this._buildItems(), undefined, { preserveHover: true, preserveScrollPosition: true });
			}
		});
	}

	override showPicker(force = false, anchor?: HTMLElement): void {
		if (this.disabledReason !== undefined) {
			return;
		}
		this.setCloudConfiguration(this.cloudConfiguration);
		super.showPicker(force, anchor);
	}

	protected async waitForWorkspaceTargets(token: CancellationToken): Promise<boolean> {
		const configuration = this.cloudConfiguration.get();
		if (!configuration || !this.cloudMode?.get()) {
			return true;
		}
		await Promise.all(super._buildItems().flatMap(item => item.item?.folderUri && this.isGitWorkspace(item.item.folderUri)
			? [waitForState(configuration.getWorkspaceTarget(item.item.folderUri), target => !target.pending, undefined, token)]
			: []));
		return !token.isCancellationRequested && configuration === this.cloudConfiguration.get();
	}

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

	private isGitWorkspace(folder: URI, reader?: IReader): boolean {
		if (folder.scheme === GITHUB_REMOTE_FILE_SCHEME) {
			return true;
		}
		return this.sessionsProvidersService.getProviders().some(provider =>
			provider.resolveWorkspace(folder)?.folders.some(folder => {
				const repository = folder.gitRepository;
				repository?.resolveRepository?.();
				return repository !== undefined && repository.isRepository?.read(reader) === true;
			}) === true);
	}

	/** Cloud mode lists Git-backed workspaces and any workspace whose cloud target is already known. */
	private isCloudCandidate(folder: URI): boolean {
		const target = this.cloudConfiguration.get()?.getWorkspaceTarget(folder).get();
		return this.isGitWorkspace(folder) || !!target?.workspace || !!target?.isPublicRepository;
	}

	/** In cloud mode the base picker's recent-workspace limit applies to repository candidates only. */
	protected override _getRecentWorkspaces(): IResolvedFolderWorkspace[] {
		const recents = super._getRecentWorkspaces();
		return this.cloudMode?.get() ? recents.filter(({ workspace }) => this.isCloudCandidate(workspace.folders[0]?.root ?? workspace.uri)) : recents;
	}

	protected override _buildItems(): IActionListItem<IWorkspacePickerItem>[] {
		const configuration = this.cloudConfiguration.get();
		if (this.cloudMode?.get()) {
			const repositories = super._buildItems().flatMap(item => {
				const folder = item.item?.folderUri;
				const target = folder && configuration?.getWorkspaceTarget(folder).get();
				if (!folder || !this.isCloudCandidate(folder)) {
					return [];
				}
				const reason = target?.pending
					? localize('automation.form.checkingRepository', "Checking repository access...")
					: target?.isPublicRepository
						? localize('automation.form.publicRepository', "Cloud automations require a private GitHub repository. This repository is public.")
						: target?.disabledReason
						?? (!target?.workspace ? localize('automation.form.githubRepositoryRequired', "Cloud automations require a private repository on GitHub.com.") : undefined)
						?? (item.disabled ? localize('automation.form.workspaceUnavailable', "The workspace provider is unavailable.") : undefined);
				const location = typeof item.description === 'string' && item.description ? item.description : undefined;
				// The location is not shown inline, but it distinguishes repositories with the same name.
				const details = reason && location
					? localize('automation.form.repositoryReasonDetails', "{0} — {1}", location, reason)
					: reason ?? location;
				const name = location ? localize('automation.form.repositoryAriaLabel', "{0}, {1}", item.label ?? '', location) : item.label ?? '';
				const ariaLabel = reason
					? localize('automation.form.disabledRepositoryAriaLabel', "{0}, unavailable. {1}", name, reason)
					: location ? name : item.item?.ariaLabel;
				return [{
					...item,
					item: { ...item.item, ariaLabel },
					submenuActions: undefined,
					onRemove: undefined,
					toolbarActions: undefined,
					iconClasses: undefined,
					disabled: reason !== undefined,
					description: reason ? new MarkdownString('$(info)', { supportThemeIcons: true }) : undefined,
					ariaDescription: details,
					tooltip: details,
					hover: details ? { content: details } : undefined,
					className: 'automation-cloud-repository',
					group: { title: '', icon: Codicon.repo },
				}];
			});
			const items: IActionListItem<IWorkspacePickerItem>[] = repositories.length ? repositories : [{
				kind: ActionListItemKind.Action,
				label: localize('automation.form.noGitRepositories', "No known Git repositories"),
				disabled: true,
				item: { id: 'automation.noGitRepositories' },
			}];
			items.push({ kind: ActionListItemKind.Separator, label: '' }, {
				kind: ActionListItemKind.Action,
				label: localize('automation.form.addRepository', "Add repository"),
				group: { title: '', icon: Codicon.github },
				item: { id: 'automation.addRepository' },
			});
			return items;
		}
		const items = super._buildItems().filter(item => item.item?.folderUri?.scheme !== GITHUB_REMOTE_FILE_SCHEME);
		const noWorkspace: IActionListItem<IWorkspacePickerItem> = {
			kind: ActionListItemKind.Action,
			label: this._getNoWorkspaceLabel(),
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
		if (this.disabledReason !== undefined) {
			return false;
		}
		const generation = ++this.selectionGeneration;
		this.repositorySelection.clear();
		const resources = new DisposableStore();
		this.repositorySelection.value = resources;
		const token = cancelOnDispose(resources);
		try {
			const configuration = this.cloudConfiguration.get();
			if (this.cloudMode?.get() && item.folderUri) {
				const target = configuration?.getWorkspaceTarget(item.folderUri).get();
				if (!target?.workspace || target.pending || target.disabledReason || target.isPublicRepository) {
					throw new Error(target?.disabledReason ?? localize('automation.form.privateRepositoryRequired', "The repository must be private."));
				}
				// A checkout that no provider can run Cloud from is selected through its repository instead.
				if (item.folderUri.scheme !== GITHUB_REMOTE_FILE_SCHEME && !this.offersCloud(item.folderUri, configuration)) {
					item = { folderUri: target.workspace };
				}
			}
			if (item.id === 'automation.addRepository') {
				if (!configuration) {
					throw new Error(localize('automation.form.cloudUnavailable', "Cloud automations are unavailable."));
				}
				const folderUri = await configuration.pickWorkspace(token);
				if (!folderUri || token.isCancellationRequested || generation !== this.selectionGeneration) {
					return false;
				}
				item = { folderUri };
			}
			if (item.folderUri?.scheme === GITHUB_REMOTE_FILE_SCHEME) {
				if (!configuration) {
					throw new Error(localize('automation.form.cloudUnavailable', "Cloud automations are unavailable."));
				}
				const target = await waitForState(configuration.getWorkspaceTarget(item.folderUri), target => !target.pending, undefined, token);
				if (!target.workspace || target.disabledReason) {
					throw new Error(target.disabledReason ?? localize('automation.form.privateRepositoryRequired', "The repository must be private."));
				}
				if (configuration !== this.cloudConfiguration.get()) {
					return false;
				}
			}
			if (!await this.onWillSelectWorkspace() || token.isCancellationRequested || generation !== this.selectionGeneration) {
				return false;
			}
			this.selectingRepository = item.folderUri?.scheme === GITHUB_REMOTE_FILE_SCHEME;
			if (this.selectingRepository && item.folderUri) {
				const repositoryUri = item.folderUri;
				const workspace = this.sessionsProvidersService.getProviders()
					.map(provider => provider.resolveWorkspace(repositoryUri))
					.find(workspace => workspace !== undefined);
				const related = workspace && this._findRelatedLocalWorkspace(workspace);
				if (related && this.offersCloud(related.workspace.folders[0].root, configuration)) {
					item = { folderUri: related.workspace.folders[0].root, providerId: related.providerId };
				}
			}
			const applied = await super._dispatchPickerItem(item);
			const selectedFolder = this.selectedFolderUri;
			if (applied && selectedFolder && (item.folderUri || item.browseActionIndex !== undefined)) {
				this.targetModel?.setQuickChat(false, selectedFolder);
			}
			return applied;
		} catch (error) {
			if (!isCancellationError(error) && !token.isCancellationRequested) {
				this.onSelectionError(error instanceof Error ? error : new Error(getErrorMessage(error)));
			}
			return false;
		} finally {
			if (this.repositorySelection.value === resources) {
				this.selectingRepository = false;
				this.repositorySelection.clear();
			}
		}
	}

	protected override _isSelectedFolder(folderUri: URI | undefined): boolean {
		return !this.targetModel?.isQuickChat && super._isSelectedFolder(folderUri);
	}

	/**
	 * The mobile sheet shows descriptions as text and has no hover, so repository rows carry their location and reason
	 * instead of the info icon. Add repository comes first because the sheet focuses its first row, which may be disabled.
	 */
	protected _buildMobileItems(): IActionListItem<IWorkspacePickerItem>[] {
		const items = this._buildItems().map(item => item.className === 'automation-cloud-repository' && item.ariaDescription
			? { ...item, description: item.ariaDescription }
			: item);
		const addRepository = items.findIndex(item => item.item?.id === 'automation.addRepository');
		return addRepository < 0 ? items : [items[addRepository], ...items.filter((item, index) => index !== addRepository && item.kind !== ActionListItemKind.Separator)];
	}

	/** A matching checkout is only usable when a provider can still run the cloud session type from it. */
	private offersCloud(folderUri: URI, configuration: IAutomationProviderConfiguration | undefined): boolean {
		return !!configuration && this.sessionsProvidersService.getProviders().some(provider => provider.resolveWorkspace(folderUri)
			&& provider.getSessionTypes(folderUri).some(type => configuration.sessionTypes.includes(type.id)));
	}

	protected override _renderTriggerLabel(trigger: HTMLElement): void {
		DOM.clearNode(trigger);
		const workspace = this.selectedResolved?.workspace;
		const noWorkspace = this.targetModel?.isQuickChat === true;
		const label = noWorkspace
			? this._getNoWorkspaceLabel()
			: workspace?.label ?? (this.cloudMode?.get()
				? localize('automation.form.selectRepository', "Select a repository")
				: localize('automation.form.selectWorkspace', "Select workspace"));
		const icon = noWorkspace ? Codicon.commentDiscussion : workspace?.icon ?? Codicon.project;

		trigger.setAttribute('aria-label', workspace || noWorkspace
			? localize('automation.form.workspacePicker.selectedAriaLabel', "Automation target, {0}", label)
			: this.cloudMode?.get()
				? localize('automation.form.workspacePicker.pickRepositoryAriaLabel', "Pick a repository for this automation")
				: localize('automation.form.workspacePicker.pickAriaLabel', "Pick a workspace for this automation"));
		const disabled = this.disabledReason !== undefined;
		trigger.setAttribute('aria-disabled', String(disabled));
		trigger.tabIndex = disabled ? -1 : 0;
		trigger.parentElement?.classList.toggle('disabled', disabled);
		if (disabled) {
			trigger.removeAttribute('aria-haspopup');
			trigger.setAttribute('aria-expanded', 'false');
			trigger.setAttribute('aria-label', localize('automation.form.workspacePicker.disabledAriaLabel', "Automation target, {0}. {1}", label, this.disabledReason));
		} else {
			trigger.setAttribute('aria-haspopup', 'listbox');
		}

		const renderedIcon = DOM.append(trigger, renderIcon(icon));
		renderedIcon.setAttribute('aria-hidden', 'true');
		DOM.append(trigger, $('span.sessions-chat-dropdown-label', undefined, label));
		if (!disabled) {
			const chevron = DOM.append(trigger, renderIcon(Codicon.chevronDownCompact));
			chevron.classList.add('sessions-chat-dropdown-chevron');
			chevron.setAttribute('aria-hidden', 'true');
		}
	}

	protected override _getAllBrowseActions(): ISessionWorkspaceBrowseAction[] {
		return super._getAllBrowseActions().filter(a => a.group === SESSION_WORKSPACE_GROUP_LOCAL);
	}
}

export class MobileAutomationsWorkspacePicker extends AutomationsWorkspacePicker {
	private layoutService: IWorkbenchLayoutService | undefined;
	private readonly pendingPicker = this._register(new MutableDisposable<DisposableStore>());

	setLayoutService(layoutService: IWorkbenchLayoutService): void {
		this.layoutService = layoutService;
	}

	override showPicker(force = false, anchor?: HTMLElement): void {
		if (this.disabledReason !== undefined) {
			return;
		}
		const triggerElement = anchor ?? this._triggerElement;
		if (!triggerElement || !this.layoutService || !shouldUseMobileWorkspacePickerSheet(this.layoutService)) {
			super.showPicker(force, anchor);
			return;
		}
		this.pendingPicker.clear();
		const pending = new DisposableStore();
		this.pendingPicker.value = pending;
		const cancellation = cancelOnDispose(pending);
		pending.add(toDisposable(() => {
			triggerElement.removeAttribute('aria-busy');
		}));
		triggerElement.setAttribute('aria-busy', 'true');
		void this.showReadyMobilePicker(triggerElement, this.layoutService, cancellation).catch(error => {
			if (!isCancellationError(error)) {
				this.onSelectionError(error instanceof Error ? error : new Error(getErrorMessage(error)));
			}
		}).finally(() => {
			if (this.pendingPicker.value === pending) {
				this.pendingPicker.clear();
			}
		});
	}

	private async showReadyMobilePicker(trigger: HTMLElement, layoutService: IWorkbenchLayoutService, token: CancellationToken): Promise<void> {
		if (!await this.waitForWorkspaceTargets(token) || !trigger.isConnected || this.disabledReason !== undefined) {
			return;
		}
		trigger.removeAttribute('aria-busy');
		await showMobileWorkspacePickerSheet(
			layoutService, trigger, this._buildMobileItems(),
			item => { void this._dispatchPickerItem(item); }, this._getAllBrowseActions(),
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
