/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IButton } from '../../../../base/browser/ui/button/button.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { ISelectOptionItem, SelectBox } from '../../../../base/browser/ui/selectBox/selectBox.js';
import { Checkbox } from '../../../../base/browser/ui/toggle/toggle.js';
import { IAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { defaultCheckboxStyles, defaultInputBoxStyles, defaultSelectBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { hasNativeContextMenu } from '../../../../platform/window/common/window.js';
import { WorkspacePicker } from '../../chat/browser/sessionWorkspacePicker.js';
import { ISessionWorkspaceBrowseAction, SESSION_WORKSPACE_GROUP_LOCAL } from '../../../services/sessions/common/session.js';
import { IGitService } from '../../../../workbench/contrib/git/common/gitService.js';
import { AutomationInterval } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { IShowAutomationDialogOptions } from '../../../../workbench/contrib/chat/common/automations/automationDialogService.js';
import { IAutomationSessionTypeChoice, IAutomationSessionTypeProvider } from '../../../../workbench/contrib/chat/common/automations/automationSessionTypes.js';
import { DAYS_OF_WEEK } from '../../../../workbench/contrib/chat/common/automations/schedule.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { ChatAgentLocation, isChatPermissionLevel } from '../../../../workbench/contrib/chat/common/constants.js';
import { AgentSessionProviders, AgentSessionTarget } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { IChatWidget, ISessionTypePickerDelegate } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ChatInputPart, IChatInputPartOptions, IChatInputStyles } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputPart.js';
import { isModeConsideredBuiltIn } from '../../../../workbench/contrib/chat/browser/widget/input/modePickerActionItem.js';

const $ = DOM.$;

const INTERVALS: { readonly value: AutomationInterval; readonly label: string }[] = [
	{ value: 'manual', label: localize('automation.interval.manual', "Manual") },
	{ value: 'hourly', label: localize('automation.interval.hourly', "Hourly") },
	{ value: 'daily', label: localize('automation.interval.daily', "Daily") },
	{ value: 'weekly', label: localize('automation.interval.weekly', "Weekly") },
];

// Popup containers (context views, quick picks, menus, hovers) must not trip the dialog's focus-trap.
export function isAutomationDialogPopupTarget(relatedTarget: HTMLElement): boolean {
	return !!relatedTarget.closest(
		'.context-view, .quick-input-widget, .monaco-menu-container, .monaco-hover, .monaco-hover-content'
	);
}

export interface IFormState {
	name: string;
	interval: AutomationInterval;
	hour: number;
	minute: number;
	day: number;
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
}

interface IRenderFormHandle {
	readonly getPrompt: () => string;
	readonly getMode: () => string | undefined;
	readonly getPermissionLevel: () => string | undefined;
	readonly getModelId: () => string | undefined;
}

const AUTOMATIONS_HARNESS_CHIP_ACTION_ID = 'workbench.action.chat.renderAutomationsHarnessChip';
const AUTOMATIONS_ISOLATION_GROUP_ACTION_ID = 'workbench.action.chat.renderAutomationsIsolationGroup';

function createAutomationHarnessChip(): HTMLElement {
	const harnessChip = $('span.automation-form-harness-chip');
	DOM.append(harnessChip, renderIcon(Codicon.copilot));
	DOM.append(harnessChip, $('span.automation-form-harness-label', undefined, localize('automation.form.harness', "Copilot CLI")));
	return harnessChip;
}

class AutomationHarnessChipActionViewItem extends BaseActionViewItem {
	constructor(action: IAction, options?: IBaseActionViewItemOptions) {
		super(undefined, action, options);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		DOM.clearNode(container);
		DOM.append(container, createAutomationHarnessChip());
	}
}

class AutomationIsolationGroupActionViewItem extends BaseActionViewItem {
	private readonly renderDisposables = this._register(new DisposableStore());
	private readonly branchRepoDisposable = this._register(new MutableDisposable<IDisposable>());
	private branchRequestId = 0;
	private folderChip: HTMLSpanElement | undefined;
	private branchSlot: HTMLSpanElement | undefined;

	constructor(
		action: IAction,
		private readonly state: IFormState,
		private readonly workspacePicker: AutomationsWorkspacePicker,
		private readonly actionWidgetService: IActionWidgetService,
		private readonly gitService: IGitService,
		options?: IBaseActionViewItemOptions,
	) {
		super(undefined, action, options);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		this.renderDisposables.clear();
		this.branchRepoDisposable.clear();
		DOM.clearNode(container);
		container.style.marginLeft = 'auto';

		const isolationGroup = DOM.append(container, $('span.automation-form-isolation-group'));
		this.folderChip = DOM.append(isolationGroup, $('span.automation-form-isolation-chip')) as HTMLSpanElement;
		this.folderChip.setAttribute('role', 'button');
		this.folderChip.tabIndex = 0;
		this.branchSlot = DOM.append(isolationGroup, $('span.automation-form-branch-slot')) as HTMLSpanElement;
		this.branchSlot.setAttribute('aria-live', 'polite');

		this.renderIsolationChip();
		this.renderBranchLabel(localize('automation.form.branch.unknown', "—"), true);
		this.renderDisposables.add(this.workspacePicker.onDidSelectWorkspace(uri => {
			this.updateBranchForFolder(uri);
		}));
		this.renderDisposables.add(DOM.addDisposableListener(this.folderChip, DOM.EventType.CLICK, (e) => {
			DOM.EventHelper.stop(e, true);
			this.showIsolationPicker();
		}));
		this.renderDisposables.add(DOM.addDisposableListener(this.folderChip, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				DOM.EventHelper.stop(e, true);
				this.showIsolationPicker();
			}
		}));
		this.updateBranchForFolder(this.state.folderUri);
	}

	private renderIsolationChip(): void {
		if (!this.folderChip) {
			return;
		}
		DOM.clearNode(this.folderChip);
		const isWorktree = this.state.isolationMode !== 'workspace';
		const modeIcon = isWorktree ? Codicon.worktree : Codicon.folder;
		const modeLabel = isWorktree
			? localize('automation.form.isolation.worktree', "Worktree")
			: localize('automation.form.isolation.folder', "Folder");
		this.folderChip.setAttribute('aria-label', localize('automation.form.isolation.pickerAriaLabel', "Pick Isolation Mode, {0}", modeLabel));
		this.folderChip.title = modeLabel;
		DOM.append(this.folderChip, renderIcon(modeIcon));
		DOM.append(this.folderChip, $('span.automation-form-isolation-label', undefined, modeLabel));
	}

	private renderBranchLabel(text: string, isMissing: boolean): void {
		if (!this.branchSlot) {
			return;
		}
		DOM.clearNode(this.branchSlot);
		this.branchSlot.classList.toggle('automation-form-branch-missing', isMissing);
		DOM.append(this.branchSlot, renderIcon(Codicon.gitBranch));
		DOM.append(this.branchSlot, $('span.automation-form-branch-name', undefined, text));
	}

	private showIsolationPicker(): void {
		if (!this.folderChip || this.actionWidgetService.isVisible) {
			return;
		}
		const currentMode = this.state.isolationMode ?? 'worktree';
		const items: IActionListItem<{ readonly mode: string; readonly checked?: boolean }>[] = [
			{
				kind: ActionListItemKind.Action,
				label: localize('automation.form.isolation.worktree', "Worktree"),
				group: { title: '', icon: Codicon.worktree },
				item: { mode: 'worktree', checked: currentMode === 'worktree' || undefined },
			},
			{
				kind: ActionListItemKind.Action,
				label: localize('automation.form.isolation.folder', "Folder"),
				group: { title: '', icon: Codicon.folder },
				item: { mode: 'workspace', checked: currentMode === 'workspace' || undefined },
			},
		];
		const delegate: IActionListDelegate<{ readonly mode: string; readonly checked?: boolean }> = {
			onSelect: ({ mode }) => {
				this.actionWidgetService.hide();
				this.state.isolationMode = mode;
				this.renderIsolationChip();
			},
			onHide: () => {
				this.folderChip?.focus();
			},
		};
		this.actionWidgetService.show(
			'automationIsolationPicker',
			false,
			items,
			delegate,
			this.folderChip,
			undefined,
			[],
			{
				getAriaLabel: item => item.label ?? '',
				getWidgetAriaLabel: () => localize('automation.form.isolation.widgetAriaLabel', "Isolation Mode"),
			},
		);
	}

	private async updateBranchForFolder(folder: URI | undefined): Promise<void> {
		const myRequestId = ++this.branchRequestId;
		this.branchRepoDisposable.clear();
		if (!folder) {
			this.state.branch = undefined;
			this.renderBranchLabel(localize('automation.form.branch.noFolder', "—"), true);
			return;
		}
		const repo = await this.gitService.openRepository(folder);
		if (myRequestId !== this.branchRequestId) {
			return;
		}
		if (!repo) {
			this.state.branch = undefined;
			this.renderBranchLabel(localize('automation.form.branch.noRepo', "no git repo"), true);
			return;
		}
		const watcher = new DisposableStore();
		watcher.add(autorun(reader => {
			const head = repo.state.read(reader).HEAD;
			const name = head?.name;
			if (name) {
				this.state.branch = name;
				this.renderBranchLabel(name, false);
			} else if (head?.commit) {
				this.state.branch = undefined;
				this.renderBranchLabel(localize('automation.form.branch.detached', "({0})", head.commit.slice(0, 7)), false);
			} else {
				this.state.branch = undefined;
				this.renderBranchLabel(localize('automation.form.branch.noBranch', "—"), true);
			}
		}));
		this.branchRepoDisposable.value = watcher;
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

/**
 * Two-way binding between the chat input's session-target chip and the form's
 * providerId + sessionTypeId fields.
 */
function createSessionTypeBinder(
	state: IFormState,
	sessionTypeProvider: IAutomationSessionTypeProvider,
	disposables: DisposableStore,
): ISessionTypePickerDelegate & { setFolder(folder: URI | undefined): void } {
	const onDidChange = disposables.add(new Emitter<AgentSessionTarget>());

	const pickDefault = (available: readonly IAutomationSessionTypeChoice[]): IAutomationSessionTypeChoice | undefined => {
		if (available.length === 0) {
			return undefined;
		}
		return available.find(c => c.sessionTypeId === AgentSessionProviders.Background) ?? available[0];
	};

	const validateOrDefault = (folder: URI | undefined): void => {
		if (!folder) {
			state.providerId = undefined;
			state.sessionTypeId = undefined;
			return;
		}
		const available = sessionTypeProvider.getSessionTypesForFolder(folder);
		if (state.providerId && state.sessionTypeId) {
			const match = available.find(c => c.providerId === state.providerId && c.sessionTypeId === state.sessionTypeId);
			if (match) {
				return;
			}
		}
		const def = pickDefault(available);
		state.providerId = def?.providerId;
		state.sessionTypeId = def?.sessionTypeId;
	};

	validateOrDefault(state.folderUri);

	return {
		getActiveSessionProvider: () => state.sessionTypeId as AgentSessionTarget | undefined,
		setActiveSessionProvider: (target: AgentSessionTarget) => {
			// Safe against folder-change races: we read the current folderUri and
			// validate target against it. If the folder changed while the picker was
			// open, the old target won't match the new folder's available types.
			if (!state.folderUri) {
				return;
			}
			const available = sessionTypeProvider.getSessionTypesForFolder(state.folderUri);
			const match = available.find(c => c.sessionTypeId === target);
			if (!match) {
				return;
			}
			state.providerId = match.providerId;
			state.sessionTypeId = match.sessionTypeId;
			onDidChange.fire(match.sessionTypeId as AgentSessionTarget);
		},
		onDidChangeActiveSessionProvider: onDidChange.event,
		setFolder: (folder: URI | undefined) => {
			validateOrDefault(folder);
			if (state.sessionTypeId) {
				onDidChange.fire(state.sessionTypeId as AgentSessionTarget);
			}
		},
		// Only show Local and Background (Copilot CLI). Scoped to what the folder offers.
		isSessionTypeVisible: (type: AgentSessionTarget) => {
			if (type !== AgentSessionProviders.Local && type !== AgentSessionProviders.Background) {
				return false;
			}
			if (!state.folderUri) {
				return true;
			}
			const available = sessionTypeProvider.getSessionTypesForFolder(state.folderUri);
			return available.some(c => c.sessionTypeId === type);
		},
	};
}

export function renderForm(
	form: HTMLElement,
	state: IFormState,
	options: IShowAutomationDialogOptions,
	disposables: DisposableStore,
	validation: IValidationState,
	revalidate: () => void,
	instantiationService: IInstantiationService,
	contextKeyService: IContextKeyService,
	contextViewService: IContextViewService,
	configurationService: IConfigurationService,
	layoutService: ILayoutService,
	logService: ILogService,
	productService: IProductService,
	sessionTypeProvider: IAutomationSessionTypeProvider,
	initialPrompt: string,
	initialMode: string | undefined,
	initialPermissionLevel: string | undefined,
	initialModelId: string | undefined,
): IRenderFormHandle {
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
	DOM.append(intervalGroup, $('label.automation-form-label', undefined, localize('automation.form.interval', "Schedule")));
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
	DOM.append(timeGroup, $('label.automation-form-label', undefined, localize('automation.form.time', "Time")));
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
	DOM.append(dayGroup, $('label.automation-form-label', undefined, localize('automation.form.day', "Day of week")));
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

	const sessionTypeBinder = createSessionTypeBinder(state, sessionTypeProvider, disposables);

	const workspacePicker = disposables.add(instantiationService.createInstance(AutomationsWorkspacePicker));

	if (state.folderUri) {
		workspacePicker.setSelectedWorkspace(state.folderUri, { fireEvent: false });
	}

	disposables.add(workspacePicker.onDidSelectWorkspace(uri => {
		state.folderUri = uri;
		sessionTypeBinder.setFolder(uri);
		revalidate();
	}));

	if (!state.folderUri && workspacePicker.selectedFolderUri) {
		state.folderUri = workspacePicker.selectedFolderUri;
		sessionTypeBinder.setFolder(state.folderUri);
	}

	const promptRow = DOM.append(form, $('.automation-form-row'));
	DOM.append(promptRow, $('label.automation-form-label', undefined, localize('automation.form.prompt', "Prompt")));
	const promptHost = DOM.append(promptRow, $('.automation-form-prompt-host.interactive-session'));

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
		supportsChangingModes: true,
		hideCustomChatModes: true,
		suppressModePreferredModel: true,
		menus: {
			executeToolbar: MenuId.AutomationsDialogInput,
			telemetrySource: 'automations.dialog',
		},
		widgetViewKindTag: 'automations-dialog',
		inputEditorMinLines: 3,
		sessionTypePickerDelegate: sessionTypeBinder,
		workspacePickerInput: workspacePicker,
		secondaryToolbarActionViewItemProvider: (action, itemOptions) => {
			if (action.id === AUTOMATIONS_HARNESS_CHIP_ACTION_ID) {
				return new AutomationHarnessChipActionViewItem(action, itemOptions);
			}
			if (action.id === AUTOMATIONS_ISOLATION_GROUP_ACTION_ID) {
				const actionWidgetService = instantiationService.invokeFunction(accessor => accessor.get(IActionWidgetService));
				const gitService = instantiationService.invokeFunction(accessor => accessor.get(IGitService));
				return new AutomationIsolationGroupActionViewItem(action, state, workspacePicker, actionWidgetService, gitService, itemOptions);
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

	// Bind context keys required by chat input toolbar `when` clauses.
	const scopedContextKeyService = disposables.add(contextKeyService.createScoped(promptHost));
	ChatContextKeys.location.bindTo(scopedContextKeyService).set(ChatAgentLocation.Chat);
	ChatContextKeys.inChatSession.bindTo(scopedContextKeyService).set(true);
	ChatContextKeys.inAutomationsDialog.bindTo(scopedContextKeyService).set(true);
	const scopedInstantiationService = disposables.add(
		instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService]))
	);

	const chatInput = disposables.add(
		scopedInstantiationService.createInstance(ChatInputPart, ChatAgentLocation.Chat, chatInputOptions, chatInputStyles, false),
	);
	chatInput.render(promptHost, initialPrompt, stubWidget as IChatWidget);
	chatInput.inputEditor.updateOptions({ placeholder: localize('automation.form.prompt.placeholder', "Describe what you want to automate") });

	if (initialMode) {
		const getUnfilteredInitialMode = () => {
			const modes = chatInput.currentChatModesObs.get();
			return modes.findModeById(initialMode) ?? modes.findModeByName(initialMode);
		};
		const isHiddenCustomInitialMode = () => {
			const mode = getUnfilteredInitialMode();
			return !!mode && chatInputOptions.hideCustomChatModes && !isModeConsideredBuiltIn(mode, productService);
		};

		if (isHiddenCustomInitialMode()) {
			logService.trace(`[AutomationDialog] Skipping hidden custom initial mode "${initialMode}". Falling back to the default mode.`);
		} else {
			chatInput.setChatMode(initialMode, /* storeSelection */ false);
		}
		// Retry on cold-start when extension-contributed modes arrive late.
		if (chatInput.currentModeObs.get().id !== initialMode && !isHiddenCustomInitialMode()) {
			const retry = disposables.add(new MutableDisposable<IDisposable>());
			const tryApply = () => {
				if (isHiddenCustomInitialMode()) {
					logService.trace(`[AutomationDialog] Skipping hidden custom initial mode "${initialMode}" after modes updated. Falling back to the default mode.`);
					retry.clear();
					return;
				}
				const modes = chatInput.currentChatModesObs.get();
				if (modes.findModeById(initialMode) || modes.findModeByName(initialMode)) {
					chatInput.setChatMode(initialMode, /* storeSelection */ false);
					if (chatInput.currentModeObs.get().id === initialMode) {
						retry.clear();
					}
				}
			};
			retry.value = autorun(reader => {
				const modes = chatInput.currentChatModesObs.read(reader);
				reader.store.add(modes.onDidChange(tryApply));
				tryApply();
			});
		}
	}
	if (initialPermissionLevel && isChatPermissionLevel(initialPermissionLevel)) {
		chatInput.setPermissionLevel(initialPermissionLevel);
	}
	// On edit, apply the saved model with late-arrival retry if needed.
	chatInput.resetLanguageModelToDefault(/* storeSelection */ false);

	if (initialModelId && !chatInput.switchModelByIdentifier(initialModelId, /* storeSelection */ false)) {
		const languageModelsService = instantiationService.invokeFunction(accessor => accessor.get(ILanguageModelsService));
		const baseline = chatInput.selectedLanguageModel.get()?.identifier;
		const retry = disposables.add(new MutableDisposable<IDisposable>());
		retry.value = languageModelsService.onDidChangeLanguageModels(() => {
			if (chatInput.selectedLanguageModel.get()?.identifier !== baseline) {
				retry.clear();
				return;
			}
			if (chatInput.switchModelByIdentifier(initialModelId, /* storeSelection */ false)) {
				retry.clear();
			}
		});
	}

	disposables.add(chatInput.inputEditor.onDidChangeModelContent(() => {
		revalidate();
	}));

	chatInput.layout(580);
	queueMicrotask(() => chatInput.layout(580));

	const resizeObserver = disposables.add(new DOM.DisposableResizeObserver('automationDialog.promptHost', entries => {
		for (const entry of entries) {
			const width = entry.contentRect.width;
			if (width > 0) {
				chatInput.layout(width);
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
		getPrompt: () => chatInput.inputEditor.getValue(),
		getMode: () => chatInput.currentModeObs.get().id,
		getPermissionLevel: () => chatInput.currentPermissionLevelObs.get(),
		getModelId: () => chatInput.selectedLanguageModel.get()?.identifier,
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
): void {
	validation.nameError = state.name.trim() === ''
		? localize('automation.form.nameRequired', "Name is required.")
		: undefined;
	validation.promptError = getPrompt().trim() === ''
		? localize('automation.form.promptRequired', "Prompt is required.")
		: undefined;
	validation.folderError = !state.folderUri
		? localize('automation.form.folderRequired', "Workspace folder is required.")
		: undefined;

	const valid = !validation.nameError && !validation.promptError && !validation.folderError;
	if (saveButton) {
		saveButton.enabled = valid;
	}
	form.classList.toggle('automation-form-invalid', !valid);
}

// Local-only workspace picker: hides category tabs and non-local browse actions.
class AutomationsWorkspacePicker extends WorkspacePicker {
	protected override _showTabs(): boolean {
		return false;
	}

	protected override _getAllBrowseActions(): ISessionWorkspaceBrowseAction[] {
		return super._getAllBrowseActions().filter(a => a.group === SESSION_WORKSPACE_GROUP_LOCAL);
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
