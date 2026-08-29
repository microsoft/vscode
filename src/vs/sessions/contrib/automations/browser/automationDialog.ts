/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IButton } from '../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { ISelectOptionItem, SelectBox } from '../../../../base/browser/ui/selectBox/selectBox.js';
import { Checkbox } from '../../../../base/browser/ui/toggle/toggle.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable, waitForState } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { localize } from '../../../../nls.js';
import { ActionListItemKind, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { defaultCheckboxStyles, defaultInputBoxStyles, defaultSelectBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { hasNativeContextMenu } from '../../../../platform/window/common/window.js';
import { IWorkspacePickerItem, WorkspacePicker } from '../../chat/browser/sessionWorkspacePicker.js';
import { isMobilePickerSheetTarget } from '../../../browser/parts/mobile/mobilePickerSheet.js';
import { ISession, ISessionWorkspaceBrowseAction, SESSION_WORKSPACE_GROUP_LOCAL } from '../../../services/sessions/common/session.js';
import { AutomationInterval } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { DAYS_OF_WEEK } from '../../../../workbench/contrib/chat/common/automations/schedule.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { ChatAgentLocation } from '../../../../workbench/contrib/chat/common/constants.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { AutomationIsolationModel } from '../common/isolationGroupModel.js';
import { IActiveSession, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { VisibleSession } from '../../../services/sessions/browser/visibleSessions.js';
import { setActiveSessionContextKeys } from '../../../services/sessions/common/sessionContextKeys.js';
import { IsNewChatSessionContext } from '../../../common/contextkeys.js';
import { isAgentHostProvider } from '../../../common/agentHostSessionsProvider.js';
import { SessionConfigKey } from '../../../../platform/agentHost/common/sessionConfigKeys.js';
import { INewChatInputSendRequest, NewChatInputWidget } from '../../chat/browser/newChatInput.js';
import { showMobileWorkspacePickerSheet, shouldUseMobileWorkspacePickerSheet } from '../../chat/browser/mobile/mobileWorkspacePickerSheet.js';

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
		'.context-view, .quick-input-widget, .monaco-menu-container, .monaco-hover, .monaco-hover-content'
	);
}

export function isAutomationDialogEditCommand(commandId: string, target: HTMLElement): boolean {
	return (commandId === 'undo' || commandId === 'redo') && DOM.isEditableElement(target);
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
): IAutomationDialogKeyboardNavigation {
	const store = new DisposableStore();
	let suppressPopupEscapeKeyUp = false;

	const visibleFocusableElements = (): readonly HTMLElement[] => getFocusableElements().filter(element => {
		if (!element.isConnected || element.tabIndex < 0 || element.hasAttribute('disabled')) {
			return false;
		}
		for (let current: HTMLElement | null = element; current; current = current.parentElement) {
			if (current.hidden || current.getAttribute('aria-hidden') === 'true') {
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
	readonly getMode: () => string | undefined;
	readonly getPermissionLevel: () => string | undefined;
	readonly getModelId: () => string | undefined;
	readonly getAgentId: () => string | undefined;
	readonly getConfiguration: () => Record<string, unknown> | undefined;
	readonly getBranch: () => string | undefined;
	/** True while the embedded composer's draft session is still resolving. */
	readonly loading: IObservable<boolean>;
	readonly waitForAutomationSessionSync: () => Promise<void>;
	readonly getFocusableElements: () => readonly HTMLElement[];
}

export type AutomationSessionDraftTarget =
	| { readonly kind: 'workspace'; readonly folderUri: URI; readonly providerId: string | undefined; readonly sessionTypeId: string; readonly modelId?: string; readonly modeId?: string; readonly permissionLevel?: string; readonly agentId?: string; readonly configuration?: Record<string, unknown> }
	| { readonly kind: 'quickChat'; readonly providerId: string; readonly sessionTypeId: string; readonly modelId?: string; readonly modeId?: string; readonly permissionLevel?: string; readonly agentId?: string; readonly configuration?: Record<string, unknown> };

type AutomationSessionDraftService = Pick<
	ISessionsManagementService,
	'automationSession' | 'createAutomationSession' | 'createAutomationQuickChat' | 'discardAutomationSession'
>;

export class AutomationSessionDraftSynchronizer extends Disposable {
	private requestedTarget: AutomationSessionDraftTarget | undefined;
	private appliedTarget: AutomationSessionDraftTarget | undefined;
	private session: ISession | undefined;
	private generation = 0;
	private syncScheduled = false;
	private syncPromise = Promise.resolve();
	private disposed = false;

	constructor(
		private readonly sessionsManagementService: AutomationSessionDraftService,
		private readonly canSelectWorkspace: (folderUri: URI, preferredProviderId: string | undefined) => Promise<boolean>,
		private readonly onError: (error: unknown) => void,
	) {
		super();
	}

	update(target: AutomationSessionDraftTarget | undefined): void {
		this.requestedTarget = target;
		this.generation++;
		this.scheduleSync();
	}

	async waitForSync(): Promise<void> {
		let pendingSync: Promise<void>;
		do {
			pendingSync = this.syncPromise;
			await pendingSync;
		} while (pendingSync !== this.syncPromise);
	}

	private scheduleSync(): void {
		if (this.syncScheduled) {
			return;
		}
		this.syncScheduled = true;
		this.syncPromise = Promise.resolve().then(() => {
			this.syncScheduled = false;
			if (!this.disposed) {
				return this.sync(this.generation);
			}
			return undefined;
		});
	}

	private async sync(generation: number): Promise<void> {
		const target = this.requestedTarget;
		if (!target) {
			this.discardSession();
			return;
		}
		if (this.matchesAppliedTarget(target)) {
			return;
		}
		try {
			if (target.kind === 'workspace' && !await this.canSelectWorkspace(target.folderUri, target.providerId)) {
				if (generation === this.generation) {
					this.discardSession();
				}
				return;
			}
			if (this.disposed || generation !== this.generation) {
				return;
			}
			this.session = target.kind === 'quickChat'
				? this.sessionsManagementService.createAutomationQuickChat({
					providerId: target.providerId,
					sessionTypeId: target.sessionTypeId,
					modelId: target.modelId,
					modeId: target.modeId,
					permissionLevel: target.permissionLevel,
					agentId: target.agentId,
					configuration: target.configuration,
				})
				: this.sessionsManagementService.createAutomationSession(target.folderUri, {
					providerId: target.providerId,
					sessionTypeId: target.sessionTypeId,
					modelId: target.modelId,
					modeId: target.modeId,
					permissionLevel: target.permissionLevel,
					agentId: target.agentId,
					configuration: target.configuration,
				});
			this.appliedTarget = target;
		} catch (error) {
			if (!this.disposed && generation === this.generation) {
				this.discardSession();
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
			|| this.appliedTarget.sessionTypeId !== target.sessionTypeId) {
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
	}

	override dispose(): void {
		this.disposed = true;
		this.generation++;
		this.discardSession();
		super.dispose();
	}
}

export function resolveAutomationModelIdentifier(
	languageModelsService: Pick<ILanguageModelsService, 'getLanguageModelIds' | 'lookupLanguageModel'>,
	identifier: string,
	logicalSessionType: string | undefined,
	modelTarget: string | undefined,
): string {
	if (!logicalSessionType || !modelTarget) {
		return identifier;
	}
	const sourceModel = languageModelsService.lookupLanguageModel(identifier);
	if (sourceModel?.targetChatSessionType !== logicalSessionType) {
		return identifier;
	}
	return languageModelsService.getLanguageModelIds().find(candidateIdentifier => {
		const candidate = languageModelsService.lookupLanguageModel(candidateIdentifier);
		return candidate?.targetChatSessionType === modelTarget && candidate.id === sourceModel.id;
	}) ?? identifier;
}

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
	languageModelsService: ILanguageModelsService,
	layoutService: IWorkbenchLayoutService,
	logService: ILogService,
	productService: IProductService,
	sessionsManagementService: ISessionsManagementService,
	sessionsProvidersService: ISessionsProvidersService,
	workspaceTrustRequestService: IWorkspaceTrustRequestService,
	initialPrompt: string,
	initialMode: string | undefined,
	initialPermissionLevel: string | undefined,
	initialModelId: string | undefined,
	initialAgentId: string | undefined,
	initialConfiguration: Record<string, unknown> | undefined,
): IRenderFormHandle {
	const initialProviderId = state.providerId;
	const initialSessionTypeId = state.sessionTypeId;
	const initialIsQuickChat = state.isQuickChat;
	const initialFolderUri = state.folderUri;
	const matchesInitialTarget = (providerId: string | undefined, sessionTypeId: string | undefined, isQuickChat: boolean, folderUri: URI | undefined) =>
		providerId === initialProviderId
		&& sessionTypeId === initialSessionTypeId
		&& isQuickChat === initialIsQuickChat
		&& (isQuickChat || isEqual(folderUri, initialFolderUri));
	const nameRow = DOM.append(form, $('.automation-form-row'));
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

	const scheduleRow = DOM.append(form, $('.automation-form-row.automation-form-schedule-row'));
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

	const isolationModel = new AutomationIsolationModel(state);
	// The dialog has no session; the session-type picker is authoritative.
	const onDidChangeSessionTarget = disposables.add(new Emitter<void>());

	const workspacePicker = disposables.add(instantiationService.createInstance(MobileAutomationsWorkspacePicker, {
		restoreFromSessions: false,
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

	const promptRow = DOM.append(form, $('.automation-form-row'));
	DOM.append(promptRow, $('span.automation-form-label', undefined, localize('automation.form.prompt', "Prompt")));
	const promptHost = DOM.append(promptRow, $('.automation-form-prompt-host.interactive-session'));

	// Scoped context keys bound to the automation draft so the embedded
	// composer's provider control toolbars (mode/model/permissions/isolation/
	// branch) evaluate their `when` clauses against the draft session.
	const scopedContextKeyService = disposables.add(contextKeyService.createScoped(promptHost));
	ChatContextKeys.location.bindTo(scopedContextKeyService).set(ChatAgentLocation.Chat);
	ChatContextKeys.inChatSession.bindTo(scopedContextKeyService).set(true);
	ChatContextKeys.inAutomationsDialog.bindTo(scopedContextKeyService).set(true);
	IsNewChatSessionContext.bindTo(scopedContextKeyService).set(true);
	const scopedInstantiationService = disposables.add(
		instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService]))
	);

	// Wrap the current automation draft ISession as an IActiveSession for the
	// composer. Recreated (and the previous one disposed) whenever the draft
	// identity changes.
	const automationActiveSession = derived<IActiveSession | undefined>(reader => {
		const draft = sessionsManagementService.automationSession.read(reader);
		return draft ? reader.store.add(new VisibleSession(draft, draft.mainChat.read(reader))) : undefined;
	});
	disposables.add(autorun(reader => {
		setActiveSessionContextKeys(automationActiveSession.read(reader), scopedContextKeyService, reader);
	}));

	let lastResolvedConfigSessionId: string | undefined;
	let lastResolvedConfigValues: Record<string, unknown> | undefined;
	disposables.add(autorun(reader => {
		const draft = sessionsManagementService.automationSession.read(reader);
		lastResolvedConfigSessionId = draft?.sessionId;
		lastResolvedConfigValues = undefined;
		if (!draft) {
			return;
		}
		const provider = sessionsProvidersService.getProvider(draft.providerId);
		if (!provider || !isAgentHostProvider(provider)) {
			return;
		}
		const isResolving = provider.isSessionConfigResolving(draft.sessionId);
		const captureConfig = () => {
			if (isResolving.read(undefined)) {
				return;
			}
			const values = provider.getSessionConfig(draft.sessionId)?.values;
			if (values) {
				lastResolvedConfigValues = { ...values };
			}
		};
		isResolving.read(reader);
		captureConfig();
		reader.store.add(provider.onDidChangeSessionConfig(sessionId => {
			if (sessionId === draft.sessionId) {
				captureConfig();
			}
		}));
	}));
	const readDraftConfigValues = (draft: ISession): Record<string, unknown> | undefined => {
		const provider = sessionsProvidersService.getProvider(draft.providerId);
		if (!provider || !isAgentHostProvider(provider)) {
			return undefined;
		}
		return provider.getSessionConfig(draft.sessionId)?.values
			?? (lastResolvedConfigSessionId === draft.sessionId ? lastResolvedConfigValues : undefined);
	};

	// Reads isolation/branch selected in the provider's repository-config
	// picker back off the draft.
	const readDraftRepositoryConfig = (): { isolationMode: string | undefined; branch: string | undefined } => {
		const draft = sessionsManagementService.automationSession.get();
		if (!draft || draft.isQuickChat?.get()) {
			return { isolationMode: undefined, branch: undefined };
		}
		const values = readDraftConfigValues(draft);
		const isolation = values?.[SessionConfigKey.Isolation];
		const rawBranch = values?.[SessionConfigKey.Branch];
		return {
			isolationMode: isolation === 'worktree' ? 'worktree' : isolation === 'folder' ? 'workspace' : undefined,
			branch: typeof rawBranch === 'string' ? rawBranch : undefined,
		};
	};

	const loading = derived(reader => {
		const session = automationActiveSession.read(reader);
		if (!session) {
			return false;
		}
		const provider = sessionsProvidersService.getProvider(session.providerId);
		return session.loading.read(reader)
			|| (provider && isAgentHostProvider(provider) ? provider.isSessionConfigResolving(session.sessionId).read(reader) : false);
	});

	const chatInput = disposables.add(scopedInstantiationService.createInstance(NewChatInputWidget, {
		session: automationActiveSession,
		getContextFolderUri: () => isolationModel.folderUriObs.get(),
		// The dialog commits via its own button; the composer never sends.
		sendRequest: async (_request: INewChatInputSendRequest) => false,
		canSendRequest: constObservable(false),
		loading,
		historyKey: constObservable(undefined),
		placeholder: localize('automation.form.prompt.placeholder', "Describe what you want to automate"),
		renderSendButton: false,
		hideAttachments: true,
		suppressNotices: true,
		disableDraftPersistence: true,
		sessionTypePickerOptions: { persistSelection: false, telemetrySource: 'AutomationSessionTypePicker', showChevron: false },
		renderExtraControls: (container: HTMLElement) => {
			// Order: session type, then workspace. Provider mode/permission
			// pickers follow (NewSessionControl), then the provider repo/folder
			// picker (NewSessionRepositoryConfig) on the trailing edge.
			chatInput.sessionTypePicker.render(container, { className: 'sessions-chat-session-type-picker' });
			const workspaceSlot = DOM.append(container, $('.chat-input-picker-item'));
			workspacePicker.render(workspaceSlot);
		},
	}));

	// Reuse the composer's own session-type picker rather than building a second
	// one. Drive it from the automation target (folder / quick chat) so it can
	// select the harness before any session exists.
	const sessionTypePicker = chatInput.sessionTypePicker;
	sessionTypePicker.setQuickChatSource(isolationModel.isQuickChatObs);
	sessionTypePicker.setFolderSource(isolationModel.folderUriObs, {
		initialPick: state.sessionTypeId
			? { providerId: state.providerId, sessionTypeId: state.sessionTypeId }
			: undefined,
		preserveUnavailableInitialPick: true,
	});

	const syncStateFromPicker = () => {
		const pick = sessionTypePicker.selectedPick;
		state.providerId = pick?.providerId;
		state.sessionTypeId = pick?.sessionTypeId;
		onDidChangeSessionTarget.fire();
	};
	// Seed state from the picker's initial default (edit: saved type; create: folder default).
	syncStateFromPicker();

	const updateAutomationSessionTarget = () => {
		const folderUri = isolationModel.folderUriObs.get();
		const pick = sessionTypePicker.selectedPick;
		const isQuickChat = isolationModel.isQuickChatObs.get();
		const restoreInitialConfiguration = matchesInitialTarget(pick?.providerId, pick?.sessionTypeId, isQuickChat, folderUri);
		const draftOptions = restoreInitialConfiguration ? {
			modelId: initialModelId,
			modeId: initialMode,
			permissionLevel: initialPermissionLevel,
			agentId: initialAgentId,
			configuration: initialConfiguration,
		} : {};
		if (!pick || (isQuickChat && !pick.providerId) || (!isQuickChat && !folderUri)) {
			automationSessionDraftSynchronizer.update(undefined);
			return;
		}
		if (isQuickChat) {
			const providerId = pick.providerId;
			if (providerId) {
				automationSessionDraftSynchronizer.update({ kind: 'quickChat', providerId, sessionTypeId: pick.sessionTypeId, ...draftOptions });
			}
		} else if (folderUri) {
			automationSessionDraftSynchronizer.update({ kind: 'workspace', folderUri, providerId: pick.providerId, sessionTypeId: pick.sessionTypeId, ...draftOptions });
		}
	};
	// Covers both explicit user picks and recomputes (e.g. an agent host
	// advertising its session types after the dialog opened), so the saved
	// automation always matches the chip the picker displays.
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

	if (!state.isQuickChat && !state.folderUri && workspacePicker.selectedFolderUri) {
		isolationModel.setWorkspace(workspacePicker.selectedFolderUri);
	}

	disposables.add(autorun(reader => {
		isolationModel.isQuickChatObs.read(reader);
		updateAutomationSessionTarget();
		revalidate();
	}));

	chatInput.render(promptHost, promptHost);
	if (initialPrompt) {
		chatInput.inputEditor?.setValue(initialPrompt);
	}

	disposables.add(chatInput.inputEditor?.onDidChangeModelContent(() => {
		revalidate();
	}) ?? { dispose: () => { } });

	chatInput.layout(0, 580);
	queueMicrotask(() => {
		if (!disposables.isDisposed) {
			chatInput.layout(0, 580);
		}
	});

	const resizeObserver = disposables.add(new DOM.DisposableResizeObserver('automationDialog.promptHost', entries => {
		for (const entry of entries) {
			const width = entry.contentRect.width;
			if (width > 0) {
				chatInput.layout(0, width);
			}
		}
	}, DOM.getWindow(promptHost)));
	disposables.add(resizeObserver.observe(promptHost));

	const enabledRow = DOM.append(form, $('.automation-form-row.automation-form-checkbox-row'));
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

	return {
		getPrompt: () => chatInput.inputEditor?.getValue() ?? '',
		getMode: () => {
			const draft = sessionsManagementService.automationSession.get();
			const provider = draft && sessionsProvidersService.getProvider(draft.providerId);
			const mode = provider && isAgentHostProvider(provider)
				? readDraftConfigValues(draft)?.[SessionConfigKey.Mode]
				: automationActiveSession.get()?.mode.get()?.id;
			return typeof mode === 'string' ? mode : matchesInitialTarget(state.providerId, state.sessionTypeId, state.isQuickChat, state.folderUri) ? initialMode : undefined;
		},
		getPermissionLevel: () => {
			const draft = sessionsManagementService.automationSession.get();
			const provider = draft && sessionsProvidersService.getProvider(draft.providerId);
			const permission = provider && isAgentHostProvider(provider)
				? readDraftConfigValues(draft)?.[SessionConfigKey.AutoApprove]
				: undefined;
			return typeof permission === 'string' ? permission : matchesInitialTarget(state.providerId, state.sessionTypeId, state.isQuickChat, state.folderUri) ? initialPermissionLevel : undefined;
		},
		getModelId: () => automationActiveSession.get()?.modelId.get()
			?? (matchesInitialTarget(state.providerId, state.sessionTypeId, state.isQuickChat, state.folderUri) ? initialModelId : undefined),
		getAgentId: () => {
			const draft = sessionsManagementService.automationSession.get();
			const provider = draft && sessionsProvidersService.getProvider(draft.providerId);
			return provider && isAgentHostProvider(provider)
				? automationActiveSession.get()?.mode.get()?.id
				: matchesInitialTarget(state.providerId, state.sessionTypeId, state.isQuickChat, state.folderUri) ? initialAgentId : undefined;
		},
		getConfiguration: () => {
			const draft = sessionsManagementService.automationSession.get();
			const values = draft ? readDraftConfigValues(draft) : undefined;
			return values
				? { ...values }
				: matchesInitialTarget(state.providerId, state.sessionTypeId, state.isQuickChat, state.folderUri) ? initialConfiguration : undefined;
		},
		getBranch: () => readDraftRepositoryConfig().branch,
		loading,
		waitForAutomationSessionSync: async () => {
			updateAutomationSessionTarget();
			await automationSessionDraftSynchronizer.waitForSync();
			const draft = sessionsManagementService.automationSession.get();
			const provider = draft && sessionsProvidersService.getProvider(draft.providerId);
			if (provider && isAgentHostProvider(provider)) {
				await waitForState(provider.isSessionConfigResolving(draft.sessionId), resolving => !resolving);
			}
			// Bridge isolation from the provider draft into the form state so
			// `createAutomationTarget` produces the correct target at Save.
			state.isolationMode = readDraftRepositoryConfig().isolationMode;
		},
		getFocusableElements: () => {
			// eslint-disable-next-line no-restricted-syntax -- the dialog owns this form subtree and supplies its dynamic focus order.
			return Array.from(form.querySelectorAll<HTMLElement>('input, select, textarea, button, a[href], [tabindex]'));
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
	isLoading = false,
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
		// Also gate on the composer's draft still resolving, so a save can't
		// commit before the provider config (model, isolation/branch) is ready.
		saveButton.enabled = valid && !isLoading;
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
			: workspace?.label ?? localize('pickWorkspace', "workspace");
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
	),
	primary: KeyCode.Enter,
	handler: (accessor) => {
		const editor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
		editor?.trigger('keyboard', 'type', { text: '\n' });
	},
});
