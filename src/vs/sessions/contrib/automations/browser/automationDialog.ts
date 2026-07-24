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
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
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
import { IProductService } from '../../../../platform/product/common/productService.js';
import { defaultCheckboxStyles, defaultInputBoxStyles, defaultSelectBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { hasNativeContextMenu } from '../../../../platform/window/common/window.js';
import { IWorkspacePickerItem, WorkspacePicker } from '../../chat/browser/sessionWorkspacePicker.js';
import { BranchPicker, IBranchPickerBranch } from '../../chat/browser/branchPicker.js';
import { MobileSessionTypePicker } from '../../chat/browser/mobile/mobileSessionTypePicker.js';
import { isMobilePickerSheetTarget } from '../../../browser/parts/mobile/mobilePickerSheet.js';
import { ISession, ISessionWorkspaceBrowseAction, SESSION_WORKSPACE_GROUP_LOCAL } from '../../../services/sessions/common/session.js';
import { IGitRepository, IGitService } from '../../../../workbench/contrib/git/common/gitService.js';
import { AutomationInterval } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { IShowAutomationDialogOptions } from '../../../../workbench/contrib/chat/common/automations/automationDialogService.js';
import { DAYS_OF_WEEK } from '../../../../workbench/contrib/chat/common/automations/schedule.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { ChatAgentLocation, isChatPermissionLevel } from '../../../../workbench/contrib/chat/common/constants.js';
import { AgentSessionTarget } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { IChatWidget, ISessionTypePickerDelegate } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ChatInputPart, IChatInputPartOptions, IChatInputStyles } from '../../../../workbench/contrib/chat/browser/widget/input/chatInputPart.js';
import { isModeConsideredBuiltIn } from '../../../../workbench/contrib/chat/browser/widget/input/modePickerActionItem.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { AutomationIsolationModel, normalizeAutomationBranchNames } from '../common/isolationGroupModel.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
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
	readonly getBranch: () => string | undefined;
	readonly getFocusableElements: () => readonly HTMLElement[];
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
				order: 0,
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
	options: IShowAutomationDialogOptions,
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

	// The picker is authoritative for the session type
	const isolationModel = new AutomationIsolationModel(state);
	const workspaceControlsVisible = derived(reader => !isolationModel.isQuickChatObs.read(reader));
	const sessionTypePicker = disposables.add(instantiationService.createInstance(MobileSessionTypePicker, constObservable<ISession | undefined>(undefined), { persistSelection: false, telemetrySource: 'AutomationSessionTypePicker' }));
	sessionTypePicker.setFolderSource(isolationModel.folderUriObs, {
		initialPick: state.sessionTypeId
			? { providerId: state.providerId, sessionTypeId: state.sessionTypeId }
			: undefined,
		preserveUnavailableInitialPick: true,
	});
	sessionTypePicker.setQuickChatSource(isolationModel.isQuickChatObs);
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
	disposables.add(sessionTypePicker.onDidChangeSelectedPick(() => {
		syncStateFromPicker();
		revalidate();
	}));

	const workspacePicker = disposables.add(instantiationService.createInstance(MobileAutomationsWorkspacePicker));
	workspacePicker.setTargetModel(isolationModel);
	workspacePicker.setLayoutService(layoutService);

	if (state.folderUri) {
		workspacePicker.setSelectedWorkspace(state.folderUri, { fireEvent: false });
	}

	disposables.add(workspacePicker.onDidSelectWorkspace(uri => {
		if (isolationModel.setWorkspace(uri)) {
			revalidate();
		}
	}));

	if (!state.isQuickChat && !state.folderUri && workspacePicker.selectedFolderUri) {
		isolationModel.setWorkspace(workspacePicker.selectedFolderUri);
	}

	disposables.add(autorun(reader => {
		isolationModel.isQuickChatObs.read(reader);
		revalidate();
	}));

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
		suppressModelPersistence: true,
		menus: {
			executeToolbar: MenuId.AutomationsDialogInput,
			telemetrySource: 'automations.dialog',
		},
		widgetViewKindTag: 'automations-dialog',
		inputEditorMinLines: 3,
		// The dialog renders the composer flush with its form column (the
		// `.interactive-input-part` margin is zeroed in CSS), so there is no
		// outer horizontal gutter. Without this, ChatInputPart would still
		// reserve the default 24px margin and lay the editor out too narrow,
		// leaving its scrollbar floating ~24px in from the right wall.
		inputPartHorizontalPadding: 0,
		sessionTypePickerDelegate: sessionTypeDelegate,
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
	chatInput.resetLanguageModelToDefault();

	const resolveInitialModelId = () => initialModelId ? resolveAutomationModelIdentifier(
		languageModelsService,
		initialModelId,
		state.sessionTypeId,
		sessionTypePicker.modelTargetChatSessionType.get(),
	) : undefined;
	const resolvedInitialModelId = resolveInitialModelId();
	if (resolvedInitialModelId && !chatInput.switchModelByIdentifier(resolvedInitialModelId, /* storeSelection */ false)) {
		const baseline = chatInput.selectedLanguageModel.get()?.identifier;
		const retry = disposables.add(new MutableDisposable<IDisposable>());
		retry.value = Event.any(
			languageModelsService.onDidChangeLanguageModels,
			Event.fromObservableLight(sessionTypePicker.modelTargetChatSessionType),
		)(() => {
			if (chatInput.selectedLanguageModel.get()?.identifier !== baseline) {
				retry.clear();
				return;
			}
			const modelIdentifier = resolveInitialModelId();
			if (modelIdentifier && chatInput.switchModelByIdentifier(modelIdentifier, /* storeSelection */ false)) {
				retry.clear();
			}
		});
	}

	disposables.add(chatInput.inputEditor.onDidChangeModelContent(() => {
		revalidate();
	}));

	chatInput.layout(580);
	queueMicrotask(() => {
		if (!disposables.isDisposed) {
			chatInput.layout(580);
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
		getBranch: () => isolationModel.persistedBranch,
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

	protected override async _executeBrowseAction(actionIndex: number): Promise<URI | undefined> {
		return super._executeBrowseAction(actionIndex);
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
