/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionComparisonSetupDialog.css';
import * as dom from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { Dialog } from '../../../../base/browser/ui/dialog/dialog.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { SelectBox } from '../../../../base/browser/ui/selectBox/selectBox.js';
import { Button, IButton } from '../../../../base/browser/ui/button/button.js';
import { TriStateCheckbox } from '../../../../base/browser/ui/toggle/toggle.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../base/common/observable.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { localize } from '../../../../nls.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { defaultButtonStyles, defaultCheckboxStyles, defaultDialogStyles, defaultInputBoxStyles, defaultSelectBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IModelPickerDelegate, ModelPickerActionItem } from '../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelPickerActionItem.js';
import { createModelConfigurationActions, ILanguageModelChatMetadataAndIdentifier, IModelConfigurationAccess } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionComparisonAttemptConfiguration, ISessionComparisonHarness } from '../../../services/sessions/common/sessionComparison.js';
import { type ISessionPermissionOption } from '../../../services/sessions/common/sessionsProvider.js';
import { isReasoningEffortLevel, ReasoningEffortConfigKey } from '../../../../platform/agentHost/common/reasoningEffort.js';
import { NEW_SESSION_PROMPT_PLACEHOLDER } from './newChatInput.js';
import { BranchPicker } from './branchPicker.js';

export interface ISessionComparisonSetupContext {
	readonly workspace: URI;
	readonly branch: string;
	readonly branches: readonly string[];
	readonly hasGitRemote?: boolean;
	readonly renderWorkspacePicker: (container: HTMLElement) => IDisposable;
	readonly onDidChangeWorkspace: Event<ISessionComparisonWorkspaceChange>;
	readonly attachedContextCount: number;
	readonly prompt: string;
	readonly setPrompt: (prompt: string) => void;
}

export interface ISessionComparisonWorkspaceChange {
	readonly workspace: URI;
	readonly branch: string | undefined;
	readonly branches: readonly string[];
	readonly hasGitRemote?: boolean;
	readonly defaultHarness: ISessionComparisonHarness | undefined;
}

export interface ISessionComparisonSetupResult {
	readonly confirmed: boolean;
	readonly attempts: readonly ISessionComparisonAttemptConfiguration[];
	readonly judgeHarness: ISessionComparisonHarness;
	readonly synthesisHarness: ISessionComparisonHarness;
	readonly branch: string | undefined;
}

function harnessKey(providerId: string, sessionTypeId: string): string {
	return `${providerId}\0${sessionTypeId}`;
}

export function getSessionComparisonWorkspaceError(branch: string | undefined, hasGitRemote: boolean | undefined): string | undefined {
	if (!branch) {
		return localize('sessionComparisonSetup.gitRepositoryRequired', "Run and Compare Agents requires a Git repository with at least one commit.");
	}
	if (hasGitRemote === false) {
		return localize('sessionComparisonSetup.gitRemoteRequired', "Comparisons require a Git remote.");
	}
	return undefined;
}

/** Selects the provider permission that corresponds to the current bulk-checkbox state. */
export function selectSessionComparisonPermission(permissionOptions: readonly ISessionPermissionOption[], currentPermissionId: string | undefined, bulkState: boolean | 'mixed'): ISessionPermissionOption | undefined {
	const selected = bulkState === true
		? permissionOptions.find(option => option.isAllowAll && !option.locked)
		: bulkState === false
			? permissionOptions.find(option => option.isDefault && !option.locked)
			: permissionOptions.find(option => option.id === currentPermissionId && !option.locked);
	return selected
		?? permissionOptions.find(option => option.isDefault && !option.locked)
		?? permissionOptions.find(option => !option.locked);
}

const SESSION_COMPARISON_DIALOG_WIDTH_STORAGE_KEY = 'sessions.comparisonSetupDialog.width';
const SESSION_COMPARISON_DIALOG_HEIGHT_STORAGE_KEY = 'sessions.comparisonSetupDialog.height';
const SESSION_COMPARISON_DIALOG_MIN_WIDTH = 480;
const SESSION_COMPARISON_DIALOG_MIN_HEIGHT = 240;
const SESSION_COMPARISON_DIALOG_VIEWPORT_RATIO = 0.9;
const SESSION_COMPARISON_DIALOG_KEYBOARD_RESIZE_STEP = 20;

type SessionComparisonDialogResizeAxis = 'width' | 'height' | 'both';
type SessionComparisonSetupStep = 'attempts' | 'evaluation';

export class SessionComparisonDialogResizeController extends Disposable {

	private readonly widthHandle: HTMLElement;
	private readonly heightHandle: HTMLElement;
	private readonly cornerHandle: HTMLElement;

	constructor(
		private readonly dialogElement: HTMLElement,
		private readonly handleContainer: HTMLElement,
		private readonly storageService: IStorageService,
	) {
		super();

		this.widthHandle = this._createHandle(
			'session-comparison-setup-resize-width',
			localize('sessionComparisonSetup.resizeWidth', "Resize dialog width"),
			'width',
		);
		this.heightHandle = this._createHandle(
			'session-comparison-setup-resize-height',
			localize('sessionComparisonSetup.resizeHeight', "Resize dialog height"),
			'height',
		);
		this.cornerHandle = dom.append(this.handleContainer, dom.$('.session-comparison-setup-resize-handle.session-comparison-setup-resize-both'));
		this.cornerHandle.setAttribute('aria-hidden', 'true');

		this._registerPointerResize(this.widthHandle, 'width');
		this._registerPointerResize(this.heightHandle, 'height');
		this._registerPointerResize(this.cornerHandle, 'both');
		this._restoreSize();

		this._register({
			dispose: () => {
				this.widthHandle.remove();
				this.heightHandle.remove();
				this.cornerHandle.remove();
			},
		});
	}

	private _createHandle(className: string, ariaLabel: string, axis: Exclude<SessionComparisonDialogResizeAxis, 'both'>): HTMLElement {
		const handle = dom.append(this.handleContainer, dom.$(`.session-comparison-setup-resize-handle.${className}`));
		handle.tabIndex = 0;
		handle.setAttribute('role', 'slider');
		handle.setAttribute('aria-label', ariaLabel);
		handle.setAttribute('aria-orientation', axis === 'width' ? 'horizontal' : 'vertical');
		this._register(dom.addDisposableListener(handle, 'keydown', event => this._onHandleKeyDown(event, axis)));
		this._register(dom.addDisposableListener(handle, 'focus', () => this._updateHandleValues()));
		return handle;
	}

	private _registerPointerResize(handle: HTMLElement, axis: SessionComparisonDialogResizeAxis): void {
		type ResizeStart = {
			readonly pointerId: number;
			readonly clientX: number;
			readonly clientY: number;
			readonly width: number;
			readonly height: number;
		};

		let start: ResizeStart | undefined;
		this._register(dom.addDisposableListener(handle, 'pointerdown', event => {
			if (event.button !== 0) {
				return;
			}

			const bounds = this.dialogElement.getBoundingClientRect();
			start = {
				pointerId: event.pointerId,
				clientX: event.clientX,
				clientY: event.clientY,
				width: bounds.width,
				height: bounds.height,
			};
			if (handle.tabIndex >= 0) {
				handle.focus();
			}
			handle.setPointerCapture(event.pointerId);
			event.preventDefault();
		}));
		this._register(dom.addDisposableListener(handle, 'pointermove', event => {
			if (!start || event.pointerId !== start.pointerId) {
				return;
			}

			const width = axis === 'height' ? start.width : start.width + ((event.clientX - start.clientX) * 2);
			const height = axis === 'width' ? start.height : start.height + ((event.clientY - start.clientY) * 2);
			this._setSize(width, height);
			event.preventDefault();
		}));
		const finishResize = (event: PointerEvent): void => {
			if (!start || event.pointerId !== start.pointerId) {
				return;
			}

			start = undefined;
			if (handle.hasPointerCapture(event.pointerId)) {
				handle.releasePointerCapture(event.pointerId);
			}
			this._persistSize();
		};
		this._register(dom.addDisposableListener(handle, 'pointerup', finishResize));
		this._register(dom.addDisposableListener(handle, 'pointercancel', finishResize));
	}

	private _onHandleKeyDown(event: KeyboardEvent, axis: Exclude<SessionComparisonDialogResizeAxis, 'both'>): void {
		const bounds = this.dialogElement.getBoundingClientRect();
		const step = event.shiftKey ? SESSION_COMPARISON_DIALOG_KEYBOARD_RESIZE_STEP * 2 : SESSION_COMPARISON_DIALOG_KEYBOARD_RESIZE_STEP;
		let width = bounds.width;
		let height = bounds.height;

		if (axis === 'width' && event.key === 'ArrowLeft') {
			width -= step;
		} else if (axis === 'width' && event.key === 'ArrowRight') {
			width += step;
		} else if (axis === 'height' && event.key === 'ArrowUp') {
			height -= step;
		} else if (axis === 'height' && event.key === 'ArrowDown') {
			height += step;
		} else {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		this._setSize(width, height);
		this._persistSize();
	}

	private _restoreSize(): void {
		const width = this.storageService.getNumber(SESSION_COMPARISON_DIALOG_WIDTH_STORAGE_KEY, StorageScope.PROFILE);
		const height = this.storageService.getNumber(SESSION_COMPARISON_DIALOG_HEIGHT_STORAGE_KEY, StorageScope.PROFILE);
		if (width === undefined && height === undefined) {
			this._updateHandleValues();
			return;
		}

		this._setSize(width, height);
	}

	private _setSize(width: number | undefined, height: number | undefined): void {
		const targetWindow = dom.getWindow(this.dialogElement);
		const maxWidth = Math.floor(targetWindow.innerWidth * SESSION_COMPARISON_DIALOG_VIEWPORT_RATIO);
		const maxHeight = Math.floor(targetWindow.innerHeight * SESSION_COMPARISON_DIALOG_VIEWPORT_RATIO);
		if (width !== undefined) {
			const clampedWidth = Math.max(Math.min(SESSION_COMPARISON_DIALOG_MIN_WIDTH, maxWidth), Math.min(maxWidth, width));
			if (Number.isFinite(clampedWidth) && clampedWidth > 0) {
				this.dialogElement.style.width = `${Math.round(clampedWidth)}px`;
			}
		}
		if (height !== undefined) {
			const clampedHeight = Math.max(Math.min(SESSION_COMPARISON_DIALOG_MIN_HEIGHT, maxHeight), Math.min(maxHeight, height));
			if (Number.isFinite(clampedHeight) && clampedHeight > 0) {
				this.dialogElement.style.height = `${Math.round(clampedHeight)}px`;
			}
		}
		this.dialogElement.classList.add('session-comparison-setup-dialog-resized');
		this._updateHandleValues();
	}

	private _updateHandleValues(): void {
		const bounds = this.dialogElement.getBoundingClientRect();
		const targetWindow = dom.getWindow(this.dialogElement);
		this.widthHandle.setAttribute('aria-valuemin', `${Math.min(SESSION_COMPARISON_DIALOG_MIN_WIDTH, Math.floor(targetWindow.innerWidth * SESSION_COMPARISON_DIALOG_VIEWPORT_RATIO))}`);
		this.widthHandle.setAttribute('aria-valuemax', `${Math.floor(targetWindow.innerWidth * SESSION_COMPARISON_DIALOG_VIEWPORT_RATIO)}`);
		this.widthHandle.setAttribute('aria-valuenow', `${Math.round(bounds.width)}`);
		this.heightHandle.setAttribute('aria-valuemin', `${Math.min(SESSION_COMPARISON_DIALOG_MIN_HEIGHT, Math.floor(targetWindow.innerHeight * SESSION_COMPARISON_DIALOG_VIEWPORT_RATIO))}`);
		this.heightHandle.setAttribute('aria-valuemax', `${Math.floor(targetWindow.innerHeight * SESSION_COMPARISON_DIALOG_VIEWPORT_RATIO)}`);
		this.heightHandle.setAttribute('aria-valuenow', `${Math.round(bounds.height)}`);
	}

	private _persistSize(): void {
		const bounds = this.dialogElement.getBoundingClientRect();
		this.storageService.store(SESSION_COMPARISON_DIALOG_WIDTH_STORAGE_KEY, Math.round(bounds.width), StorageScope.PROFILE, StorageTarget.MACHINE);
		this.storageService.store(SESSION_COMPARISON_DIALOG_HEIGHT_STORAGE_KEY, Math.round(bounds.height), StorageScope.PROFILE, StorageTarget.MACHINE);
	}
}

export class SessionComparisonSetupDialog extends Disposable {

	private readonly activeDialog = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IHoverService private readonly hoverService: IHoverService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();
	}

	async show(
		context: ISessionComparisonSetupContext,
		initialAttempts: readonly ISessionComparisonAttemptConfiguration[],
		initialJudgeHarness: ISessionComparisonHarness,
		initialSynthesisHarness: ISessionComparisonHarness = initialJudgeHarness,
	): Promise<ISessionComparisonSetupResult> {
		const disposables = new DisposableStore();
		this.activeDialog.value = disposables;
		const rowsDisposables = disposables.add(new DisposableStore());
		let attempts = [...initialAttempts];
		let content: HTMLElement | undefined;
		let contentScrollable: DomScrollableElement | undefined;
		let navigationContainer: HTMLElement | undefined;
		let confirmButton: IButton | undefined;
		let cancelButton: IButton | undefined;
		let nextButton: IButton | undefined;
		let runButton: IButton | undefined;
		let validationElement: HTMLElement | undefined;
		let prompt = context.prompt;
		let workspace = context.workspace;
		let branch: string | undefined = context.branch;
		let branches = context.branches;
		let hasGitRemote = context.hasGitRemote;
		let judgeHarness = initialJudgeHarness;
		let synthesisHarness = initialSynthesisHarness;
		let currentStep: SessionComparisonSetupStep = 'attempts';

		const getHarnesses = (): readonly ISessionComparisonHarness[] => this.sessionsManagementService.getSessionTypesForFolder(workspace)
			.filter(({ sessionType }) => sessionType.supportsWorktreeConfiguration)
			.map(({ providerId, sessionType }) => ({
				providerId,
				sessionTypeId: sessionType.id,
				label: sessionType.label,
			}));
		const getHarnessIcon = (harness: ISessionComparisonHarness) => this.sessionsManagementService.getSessionTypesForFolder(workspace)
			.find(({ providerId, sessionType }) =>
				providerId === harness.providerId && sessionType.id === harness.sessionTypeId)?.sessionType.icon ?? Codicon.terminal;

		const updateValidation = (): void => {
			const count = attempts.length;
			const hasPrompt = prompt.trim().length > 0;
			const workspaceError = getSessionComparisonWorkspaceError(branch, hasGitRemote);
			const hasHarnesses = getHarnesses().length > 0;
			const isValid = count >= 2 && hasPrompt && !workspaceError && hasHarnesses;
			if (confirmButton) {
				confirmButton.element.hidden = true;
				confirmButton.enabled = isValid;
				confirmButton.label = localize('sessionComparisonSetup.runAttemptCount', "Run {0} attempts", count);
			}
			if (nextButton) {
				nextButton.enabled = currentStep !== 'attempts' || isValid;
			}
			if (runButton) {
				runButton.enabled = isValid;
				runButton.label = localize('sessionComparisonSetup.runAttemptCount', "Run {0} attempts", count);
			}
			if (validationElement) {
				validationElement.hidden = isValid;
				validationElement.classList.toggle('error', workspaceError !== undefined);
				validationElement.textContent = workspaceError
					?? (!hasHarnesses
						? localize('sessionComparisonSetup.noAvailableAgents', "No agents that support worktree isolation are available.")
						: count < 2
							? localize('sessionComparisonSetup.minimumSelection', "Add at least two attempts.")
							: hasPrompt ? '' : localize('sessionComparisonSetup.promptRequired', "Enter a prompt to run the attempts."));
			}
		};

		const renderRows = (focusAttemptId?: string, focusStep = false): void => {
			if (!content || !navigationContainer) {
				return;
			}
			rowsDisposables.clear();
			dom.clearNode(content);
			dom.clearNode(navigationContainer);
			nextButton = undefined;
			runButton = undefined;
			validationElement = undefined;

			const stepNavigation = dom.append(content, dom.$('nav.session-comparison-setup-steps'));
			stepNavigation.setAttribute('aria-label', localize('sessionComparisonSetup.stepsAriaLabel', "Comparison setup steps"));
			const stepList = dom.append(stepNavigation, dom.$('ol.session-comparison-setup-step-list'));
			const steps: readonly { readonly id: SessionComparisonSetupStep; readonly label: string }[] = [
				{ id: 'attempts', label: localize('sessionComparisonSetup.stepAttempts', "Attempts") },
				{ id: 'evaluation', label: localize('sessionComparisonSetup.stepEvaluation', "Evaluation") },
			];
			for (const [index, step] of steps.entries()) {
				const stepItem = dom.append(stepList, dom.$('li.session-comparison-setup-step'));
				stepItem.classList.toggle('completed', index < steps.findIndex(candidate => candidate.id === currentStep));
				const stepLabel = dom.append(stepItem, dom.$('button.session-comparison-setup-step-label')) as HTMLButtonElement;
				stepLabel.type = 'button';
				stepLabel.textContent = localize('sessionComparisonSetup.stepLabel', "{0}. {1}", index + 1, step.label);
				if (step.id === currentStep) {
					stepItem.classList.add('current');
					stepLabel.setAttribute('aria-current', 'step');
				}
				rowsDisposables.add(dom.addDisposableListener(stepLabel, dom.EventType.CLICK, () => {
					if (step.id !== currentStep) {
						currentStep = step.id;
						renderRows(undefined, true);
					}
				}));
			}

			const attemptsStep = dom.append(content, dom.$('.session-comparison-setup-step-content'));
			const promptSection = dom.append(attemptsStep, dom.$('.session-comparison-setup-prompt'));
			const promptHeading = dom.append(promptSection, dom.$('h3.session-comparison-setup-section-title'));
			promptHeading.id = `session-comparison-prompt-${generateUuid()}`;
			promptHeading.textContent = localize('sessionComparisonSetup.prompt', "Prompt");
			promptSection.setAttribute('role', 'group');
			promptSection.setAttribute('aria-labelledby', promptHeading.id);
			const promptInput = rowsDisposables.add(new InputBox(promptSection, this.contextViewService, {
				ariaLabel: localize('sessionComparisonSetup.promptAriaLabel', "Prompt shared by every comparison attempt"),
				placeholder: NEW_SESSION_PROMPT_PLACEHOLDER,
				flexibleHeight: true,
				flexibleMaxHeight: 100,
				inputBoxStyles: defaultInputBoxStyles,
			}));
			promptInput.value = prompt;
			rowsDisposables.add(promptInput.onDidChange(value => {
				prompt = value;
				context.setPrompt(value);
				updateValidation();
			}));
			rowsDisposables.add(promptInput.onDidHeightChange(() => contentScrollable?.scanDomNode()));
			const contextSummary = dom.append(attemptsStep, dom.$('.session-comparison-setup-context-summary'));
			dom.append(contextSummary, dom.$('span')).textContent = localize('sessionComparisonSetup.startingFrom', "Starting from");
			rowsDisposables.add(context.renderWorkspacePicker(contextSummary));
			const separator = dom.append(contextSummary, dom.$('span.session-comparison-setup-context-separator'));
			separator.setAttribute('aria-hidden', 'true');
			separator.textContent = '·';
			const branchPicker = rowsDisposables.add(this.instantiationService.createInstance(BranchPicker, {
				user: 'sessionComparisonBranchPicker',
				slotClassName: 'session-comparison-setup-branch-picker-slot',
				triggerClassName: 'session-comparison-setup-branch-picker-trigger',
				labelClassName: 'session-comparison-setup-branch-picker-label',
				contextViewLayer: 1,
				onSelectBranch: selectedBranch => {
					branch = selectedBranch;
					updateBranchPicker();
					updateValidation();
				},
			}));
			const updateBranchPicker = (): void => {
				const availableBranches = branch && !branches.includes(branch) ? [branch, ...branches] : branches;
				branchPicker.update({
					label: branch ?? localize('sessionComparisonSetup.branchUnavailable', "No branch"),
					branches: availableBranches.map(candidate => ({ name: candidate, selected: candidate === branch })),
					status: availableBranches.length > 0 ? 'ready' : 'empty',
					canOpen: availableBranches.length > 1,
					showChevron: availableBranches.length > 1,
				});
			};
			branchPicker.render(contextSummary);
			updateBranchPicker();
			if (context.attachedContextCount > 0) {
				const attachedContextSeparator = dom.append(contextSummary, dom.$('span.session-comparison-setup-context-separator'));
				attachedContextSeparator.setAttribute('aria-hidden', 'true');
				attachedContextSeparator.textContent = '·';
				dom.append(contextSummary, dom.$('span')).textContent =
					localize('sessionComparisonSetup.attachedContextCount', "{0} context items", context.attachedContextCount);
			}

			const getPermissionOptions = (harness: ISessionComparisonHarness): readonly ISessionPermissionOption[] =>
				this.sessionsProvidersService.getProvider(harness.providerId)?.getPermissionOptionsForCreation?.(harness.sessionTypeId) ?? [];
			const getSelectedPermission = (harness: ISessionComparisonHarness): ISessionPermissionOption | undefined => {
				const options = getPermissionOptions(harness);
				return options.find(option => option.id === harness.permissionId && !option.locked)
					?? options.find(option => option.isDefault && !option.locked);
			};
			const applyPermission = (harness: ISessionComparisonHarness, permission: ISessionPermissionOption): ISessionComparisonHarness => ({
				...harness,
				permissionId: permission.id,
				permissionLabel: permission.label,
			});
			const participantHarnesses = () => [...attempts.map(attempt => attempt.harness), judgeHarness, synthesisHarness];
			const getBulkPermissionState = () => {
				const harnesses = participantHarnesses();
				const allowAllPermissions = harnesses.map(harness =>
					getPermissionOptions(harness).find(option => option.isAllowAll && !option.locked));
				const allAllowAll = harnesses.length > 0 && harnesses.every(harness => getSelectedPermission(harness)?.isAllowAll === true);
				const allDefault = harnesses.length > 0 && harnesses.every(harness => getSelectedPermission(harness)?.isDefault === true);
				return {
					available: allowAllPermissions.every((permission): permission is ISessionPermissionOption => !!permission),
					checked: allAllowAll ? true : allDefault ? false : 'mixed' as const,
				};
			};
			const bulkPermissionState = getBulkPermissionState();
			const bulkPermissions = dom.append(attemptsStep, dom.$('.session-comparison-setup-bulk-permissions'));
			const bulkPermissionLabel = localize('sessionComparisonSetup.permissions.allowAllParticipants', "Allow all permissions for every participant");
			const bulkPermissionCheckbox = rowsDisposables.add(new TriStateCheckbox(bulkPermissionLabel, bulkPermissionState.checked, defaultCheckboxStyles));
			bulkPermissionCheckbox.domNode.setAttribute('aria-checked', String(bulkPermissionState.checked));
			if (!bulkPermissionState.available) {
				bulkPermissionCheckbox.disable();
			}
			dom.append(bulkPermissions, bulkPermissionCheckbox.domNode);
			dom.append(bulkPermissions, dom.$('span.session-comparison-setup-bulk-permissions-label', { 'aria-hidden': 'true' }, bulkPermissionLabel));
			const bulkPermissionDescription = bulkPermissionState.available
				? localize('sessionComparisonSetup.permissions.allowAllParticipantsDescription', "Uses each selected agent's Allow all, Bypass Permissions, or Full Access option. Uncheck to restore every participant's default.")
				: localize('sessionComparisonSetup.permissions.allowAllParticipantsUnavailable', "Unavailable for one or more selected agents or disabled by your organization.");
			const bulkPermissionInfo = dom.append(bulkPermissions, dom.$('button.session-comparison-setup-bulk-permissions-info')) as HTMLButtonElement;
			bulkPermissionInfo.type = 'button';
			bulkPermissionInfo.setAttribute('aria-label', localize('sessionComparisonSetup.permissions.allowAllParticipantsInfo', "About allowing all permissions for every participant"));
			const bulkPermissionInfoIcon = dom.append(bulkPermissionInfo, renderIcon(Codicon.info));
			bulkPermissionInfoIcon.setAttribute('aria-hidden', 'true');
			rowsDisposables.add(this.hoverService.setupDelayedHover(bulkPermissionInfo, { content: bulkPermissionDescription }));
			rowsDisposables.add(dom.addDisposableListener(bulkPermissionInfo, dom.EventType.CLICK, event => {
				event.stopPropagation();
				this.hoverService.showInstantHover({
					target: bulkPermissionInfo,
					content: bulkPermissionDescription,
				}, true);
			}));
			const updateBulkPermissionCheckbox = () => {
				const checked = getBulkPermissionState().checked;
				bulkPermissionCheckbox.checked = checked;
				bulkPermissionCheckbox.domNode.setAttribute('aria-checked', String(checked));
			};
			rowsDisposables.add(bulkPermissionCheckbox.onChange(() => {
				const selection = this._applyBulkPermissionSelection(attempts, judgeHarness, synthesisHarness, bulkPermissionCheckbox.checked === true);
				attempts = [...selection.attempts];
				judgeHarness = selection.judgeHarness;
				synthesisHarness = selection.synthesisHarness;
				renderRows();
			}));

			const attemptsSection = dom.append(attemptsStep, dom.$('.session-comparison-setup-attempts'));
			const attemptsHeading = dom.append(attemptsSection, dom.$('h3.session-comparison-setup-section-title'));
			attemptsHeading.id = `session-comparison-attempts-${generateUuid()}`;
			attemptsHeading.textContent =
				localize('sessionComparisonSetup.attempts', "Attempts");
			attemptsSection.setAttribute('role', 'group');
			attemptsSection.setAttribute('aria-labelledby', attemptsHeading.id);
			const table = dom.append(attemptsSection, dom.$('.session-comparison-setup-table'));
			table.setAttribute('role', 'table');
			table.setAttribute('aria-labelledby', attemptsHeading.id);
			const tableHeader = dom.append(table, dom.$('.session-comparison-setup-table-header'));
			tableHeader.setAttribute('role', 'row');
			const agentHeader = dom.append(tableHeader, dom.$('span'));
			agentHeader.setAttribute('role', 'columnheader');
			agentHeader.textContent = localize('sessionComparisonSetup.agent', "Agent");
			const modelHeader = dom.append(tableHeader, dom.$('span'));
			modelHeader.setAttribute('role', 'columnheader');
			modelHeader.textContent = localize('sessionComparisonSetup.model', "Model");
			const permissionsHeader = dom.append(tableHeader, dom.$('span'));
			permissionsHeader.setAttribute('role', 'columnheader');
			permissionsHeader.textContent = localize('sessionComparisonSetup.permissions', "Permissions");
			const actionsHeader = dom.append(tableHeader, dom.$('span'));
			actionsHeader.setAttribute('role', 'columnheader');
			actionsHeader.setAttribute('aria-label', localize('sessionComparisonSetup.actions', "Actions"));
			const rows = dom.$('.session-comparison-setup-rows');
			rows.setAttribute('role', 'rowgroup');
			dom.append(table, rows);
			const harnesses = getHarnesses();
			if (harnesses.length === 0) {
				const empty = dom.append(rows, dom.$('.session-comparison-setup-empty'));
				empty.textContent = localize('sessionComparisonSetup.noHarnesses', "No agents that support worktree isolation are available.");
			}
			const showProviderLabels = new Set(harnesses.map(harness => harness.providerId)).size > 1;

			const renderHarnessControls = (
				container: HTMLElement,
				selectedHarness: ISessionComparisonHarness,
				agentAriaLabel: string,
				modelAriaLabel: string,
				permissionAriaLabel: string,
				unavailableAgentMessage: string,
				unavailableModelMessage: string,
				unavailableModelConfigurationMessage: string,
				unavailablePermissionMessage: string,
				onChange: (harness: ISessionComparisonHarness) => void,
				showLabels = true,
			): SelectBox | undefined => {
				const harnessIndex = harnesses.findIndex(harness =>
					harnessKey(harness.providerId, harness.sessionTypeId) === harnessKey(selectedHarness.providerId, selectedHarness.sessionTypeId));
				const selectedHarnessIndex = Math.max(0, harnessIndex);
				let harness = harnesses[selectedHarnessIndex];
				if (!harness) {
					return undefined;
				}
				if (harnessIndex < 0) {
					status(unavailableAgentMessage);
					onChange(harness);
				} else {
					harness = selectedHarness;
				}
				const provider = this.sessionsProvidersService.getProvider(harness.providerId);
				const permissionOptions = provider?.getPermissionOptionsForCreation?.(harness.sessionTypeId) ?? [];
				const selectedPermission = permissionOptions.find(option => option.id === harness.permissionId && !option.locked)
					?? permissionOptions.find(option => option.isDefault && !option.locked)
					?? permissionOptions.find(option => !option.locked);
				if (selectedPermission && (harness.permissionId !== selectedPermission.id || harness.permissionLabel !== selectedPermission.label)) {
					const hadUnavailablePermission = harness.permissionId !== undefined;
					harness = applyPermission(harness, selectedPermission);
					onChange(harness);
					if (hadUnavailablePermission) {
						status(unavailablePermissionMessage);
					}
				}
				const models = provider?.getModelsSnapshotForCreation?.(workspace, harness.sessionTypeId).models ?? [];
				if (harness.modelId && !models.some(model => model.identifier === harness.modelId)) {
					harness = { ...harness, modelId: undefined, modelLabel: undefined, modelConfiguration: undefined };
					onChange(harness);
					status(unavailableModelMessage);
				}
				const selectedModel = harness.modelId ? models.find(model => model.identifier === harness.modelId) : undefined;
				const reasoningEffortSchema = provider?.supportsModelConfigurationForCreation
					? selectedModel?.metadata.configurationSchema?.properties?.[ReasoningEffortConfigKey]
					: undefined;
				const selectedReasoningEffort = harness.modelConfiguration?.[ReasoningEffortConfigKey];
				const hasValidSelectedReasoningEffort = typeof selectedReasoningEffort === 'string'
					&& isReasoningEffortLevel(selectedReasoningEffort)
					&& reasoningEffortSchema?.enum?.includes(selectedReasoningEffort) === true;
				if (selectedReasoningEffort !== undefined && !hasValidSelectedReasoningEffort) {
					const modelConfiguration = { ...harness.modelConfiguration };
					delete modelConfiguration[ReasoningEffortConfigKey];
					harness = {
						...harness,
						modelConfiguration: Object.keys(modelConfiguration).length > 0 ? modelConfiguration : undefined,
					};
					onChange(harness);
					status(unavailableModelConfigurationMessage);
				}

				const agentField = dom.append(container, dom.$('.session-comparison-setup-field'));
				if (showLabels) {
					dom.append(agentField, dom.$('span.session-comparison-setup-field-label')).textContent =
						localize('sessionComparisonSetup.agent', "Agent");
				} else {
					agentField.setAttribute('role', 'cell');
					agentField.setAttribute('aria-label', agentAriaLabel);
				}
				const agentSelect = rowsDisposables.add(new SelectBox(
					harnesses.map(candidate => ({
						text: candidate.label,
						detail: showProviderLabels ? (this.sessionsProvidersService.getProvider(candidate.providerId)?.label ?? candidate.providerId) : undefined,
					})),
					selectedHarnessIndex,
					this.contextViewService,
					defaultSelectBoxStyles,
					{
						ariaLabel: agentAriaLabel,
						useCustomDrawn: true,
						contextViewLayer: 1,
					},
				));
				const agentPicker = dom.append(agentField, dom.$('.session-comparison-setup-agent-picker'));
				const agentIcon = dom.append(agentPicker, renderIcon(getHarnessIcon(harness)));
				agentIcon.classList.add('session-comparison-setup-agent-picker-icon');
				agentIcon.setAttribute('aria-hidden', 'true');
				agentSelect.render(dom.append(agentPicker, dom.$('.session-comparison-setup-select')));
				if (showProviderLabels) {
					dom.append(agentField, dom.$('span.session-comparison-setup-provider')).textContent =
						provider?.label ?? harness.providerId;
				}
				rowsDisposables.add(agentSelect.onDidSelect(({ index }) => {
					const selected = harnesses[index];
					if (selected) {
						const nextPermissionOptions = getPermissionOptions(selected);
						const nextPermission = selectSessionComparisonPermission(nextPermissionOptions, harness.permissionId, bulkPermissionCheckbox.checked);
						onChange(nextPermission ? applyPermission(selected, nextPermission) : selected);
						if (harness.permissionId && nextPermission?.id !== harness.permissionId) {
							status(unavailablePermissionMessage);
						}
						renderRows();
					}
				}));

				const modelField = dom.append(container, dom.$('.session-comparison-setup-field'));
				if (showLabels) {
					const modelFieldLabel = dom.append(modelField, dom.$('span.session-comparison-setup-field-label'));
					modelFieldLabel.textContent =
						localize('sessionComparisonSetup.model', "Model");
					modelField.setAttribute('role', 'group');
				} else {
					modelField.setAttribute('role', 'cell');
				}
				modelField.setAttribute('aria-label', modelAriaLabel);
				const pickerModels = provider?.supportsModelConfigurationForCreation
					? models
					: models.map(model => ({
						...model,
						metadata: { ...model.metadata, configurationSchema: undefined },
					}));
				const autoModel = pickerModels.find(model => model.metadata.id === 'auto');
				const currentModel = observableValue<ILanguageModelChatMetadataAndIdentifier | undefined>(
					rowsDisposables,
					harness.modelId ? pickerModels.find(model => model.identifier === harness.modelId) : autoModel,
				);
				const configurationChanged = rowsDisposables.add(new Emitter<string>());
				const modelConfiguration: IModelConfigurationAccess = {
					getModelConfiguration: modelId => harness.modelId === modelId
						? harness.modelConfiguration as IStringDictionary<unknown> | undefined
						: undefined,
					setModelConfiguration: async (modelId, values) => {
						const model = pickerModels.find(candidate => candidate.identifier === modelId);
						if (!model || provider?.supportsModelConfigurationForCreation !== true) {
							throw new Error('The selected provider does not support model configuration during session creation.');
						}
						const nextConfiguration: Record<string, string | number | boolean | null> = { ...harness.modelConfiguration };
						for (const [key, value] of Object.entries(values)) {
							if (typeof value === 'string' || typeof value === 'boolean' || value === null
								|| typeof value === 'number' && Number.isFinite(value)) {
								nextConfiguration[key] = value;
							} else {
								throw new Error('Session model configuration must contain only JSON primitive values.');
							}
						}
						harness = {
							...harness,
							modelId,
							modelLabel: model.metadata.name,
							modelConfiguration: nextConfiguration,
						};
						currentModel.set(model, undefined);
						onChange(harness);
						configurationChanged.fire(modelId);
					},
					getModelConfigurationActions: modelId => {
						const model = pickerModels.find(candidate => candidate.identifier === modelId);
						return createModelConfigurationActions(
							model?.metadata.configurationSchema,
							modelConfiguration.getModelConfiguration(modelId) ?? {},
							(key, value) => void modelConfiguration.setModelConfiguration(modelId, { [key]: value }),
						);
					},
					onDidChange: configurationChanged.event,
				};
				const modelPickerDelegate: IModelPickerDelegate = {
					currentModel,
					modelConfiguration,
					setModel: model => {
						const isAuto = model.metadata.id === 'auto';
						harness = {
							...harness,
							modelId: isAuto ? undefined : model.identifier,
							modelLabel: isAuto ? undefined : model.metadata.name,
							modelConfiguration: undefined,
						};
						currentModel.set(model, undefined);
						onChange(harness);
					},
					getModels: () => [...pickerModels],
					getPresentationOptions: () => ({
						useGroupedModelPicker: true,
						showFeatured: false,
						showUnavailableFeatured: false,
						showManageModelsAction: false,
						showAutoModel: true,
						showModelIcon: false,
					}),
					isCacheWarm: () => false,
				};
				const modelPicker = rowsDisposables.add(this.instantiationService.createInstance(
					ModelPickerActionItem,
					{ id: `sessionComparison.modelPicker.${generateUuid()}`, label: '', enabled: true, class: undefined, tooltip: '', run: async () => { } },
					modelPickerDelegate,
					{ compact: constObservable(false), contextViewLayer: 1 },
				));
				modelPicker.render(dom.append(modelField, dom.$('.session-comparison-setup-model-picker')));

				const permissionField = dom.append(container, dom.$('.session-comparison-setup-field'));
				if (showLabels) {
					dom.append(permissionField, dom.$('span.session-comparison-setup-field-label')).textContent =
						localize('sessionComparisonSetup.permissions', "Permissions");
				} else {
					permissionField.setAttribute('role', 'cell');
					permissionField.setAttribute('aria-label', permissionAriaLabel);
				}
				const permissionSelect = rowsDisposables.add(new SelectBox(
					permissionOptions.length > 0
						? permissionOptions.map(option => ({
							text: option.label,
							detail: option.locked ? option.lockedReason : option.description,
							description: option.description,
							isDisabled: option.locked,
						}))
						: [{
							text: localize('sessionComparisonSetup.permissions.unavailable', "Unavailable"),
							detail: localize('sessionComparisonSetup.permissions.unavailableDetail', "This agent does not expose configurable permissions."),
							isDisabled: true,
						}],
					Math.max(0, permissionOptions.findIndex(option => option.id === harness.permissionId)),
					this.contextViewService,
					defaultSelectBoxStyles,
					{
						ariaLabel: permissionAriaLabel,
						useCustomDrawn: true,
						contextViewLayer: 1,
					},
				));
				permissionSelect.render(dom.append(permissionField, dom.$('.session-comparison-setup-select')));
				permissionSelect.setEnabled(permissionOptions.length > 0);
				rowsDisposables.add(permissionSelect.onDidSelect(({ index }) => {
					const permission = permissionOptions[index];
					if (permission && !permission.locked) {
						harness = applyPermission(harness, permission);
						onChange(harness);
						updateBulkPermissionCheckbox();
					}
				}));
				return agentSelect;
			};

			for (const [index, attempt] of attempts.entries()) {
				const row = dom.append(rows, dom.$('.session-comparison-setup-row'));
				row.dataset.attemptId = attempt.id;
				row.setAttribute('role', 'row');
				row.setAttribute('aria-label', localize('sessionComparisonSetup.attempt', "Attempt {0}", index + 1));
				const agentSelect = renderHarnessControls(
					row,
					attempt.harness,
					localize('sessionComparisonSetup.agentForAttempt', "Agent for attempt {0}", index + 1),
					localize('sessionComparisonSetup.modelForAttempt', "Model for attempt {0}", index + 1),
					localize('sessionComparisonSetup.permissionsForAttempt', "Permissions for attempt {0}", index + 1),
					localize('sessionComparisonSetup.agentReset', "The agent for attempt {0} is no longer available. The first available agent will be used.", index + 1),
					localize('sessionComparisonSetup.modelReset', "The selected model for attempt {0} is no longer available. The agent default will be used.", index + 1),
					localize('sessionComparisonSetup.modelConfigurationReset', "The selected model configuration for attempt {0} is no longer supported. The model defaults will be used.", index + 1),
					localize('sessionComparisonSetup.permissionReset', "The selected permission for attempt {0} is no longer available. The agent default will be used.", index + 1),
					harness => attempts[index] = { id: attempt.id, harness },
					false,
				);

				const actions = dom.append(row, dom.$('.session-comparison-setup-row-actions'));
				actions.setAttribute('role', 'cell');
				if (attempts.length > 2) {
					const removeButton = rowsDisposables.add(new Button(actions, {
						...defaultButtonStyles,
						secondary: true,
						supportIcons: true,
						ariaLabel: localize('sessionComparisonSetup.removeAttemptAriaLabel', "Remove attempt {0}", index + 1),
					}));
					removeButton.element.classList.add('session-comparison-setup-remove');
					removeButton.label = '$(trash)';
					rowsDisposables.add(removeButton.onDidClick(() => {
						attempts = attempts.filter(candidate => candidate.id !== attempt.id);
						renderRows(attempts[Math.min(index, attempts.length - 1)]?.id);
					}));
				}

				if (focusAttemptId === attempt.id) {
					agentSelect?.focus();
				}
			}

			const addButton = rowsDisposables.add(new Button(attemptsSection, {
				...defaultButtonStyles,
				secondary: true,
				ariaLabel: localize('sessionComparisonSetup.addAttemptAriaLabel', "Add another comparison attempt"),
			}));
			addButton.element.classList.add('session-comparison-setup-add');
			addButton.label = localize('sessionComparisonSetup.addAttempt', "Add attempt");
			addButton.enabled = harnesses.length > 0;
			rowsDisposables.add(addButton.onDidClick(() => {
				const baseHarness = attempts.at(-1)?.harness ?? harnesses[0];
				if (!baseHarness) {
					return;
				}
				const permission = selectSessionComparisonPermission(
					getPermissionOptions(baseHarness),
					baseHarness.permissionId,
					bulkPermissionCheckbox.checked,
				);
				const harness = permission ? applyPermission(baseHarness, permission) : baseHarness;
				const attempt = { id: generateUuid(), harness };
				attempts = [...attempts, attempt];
				renderRows(attempt.id);
			}));

			const evaluator = dom.append(content, dom.$('.session-comparison-setup-evaluator'));
			const judgeRow = dom.append(evaluator, dom.$('.session-comparison-setup-evaluator-step'));
			judgeRow.setAttribute('role', 'group');
			judgeRow.setAttribute('aria-label', localize('sessionComparisonSetup.judgeConfiguration', "Judge configuration"));
			dom.append(judgeRow, dom.$('h4.session-comparison-setup-evaluator-step-title')).textContent =
				localize('sessionComparisonSetup.judge', "Judge");
			dom.append(judgeRow, dom.$('.session-comparison-setup-evaluator-step-description')).textContent =
				localize('sessionComparisonSetup.judgeDescription', "Reviews the finished attempts and recommends a result.");
			const judgeControls = dom.append(judgeRow, dom.$('.session-comparison-setup-row-controls'));
			renderHarnessControls(
				judgeControls,
				judgeHarness,
				localize('sessionComparisonSetup.agentForJudge', "Agent for the Judge"),
				localize('sessionComparisonSetup.modelForJudge', "Model for the Judge"),
				localize('sessionComparisonSetup.permissionsForJudge', "Permissions for the Judge"),
				localize('sessionComparisonSetup.judgeAgentReset', "The Judge agent is no longer available. The first available agent will be used."),
				localize('sessionComparisonSetup.judgeModelReset', "The selected Judge model is no longer available. The agent default will be used."),
				localize('sessionComparisonSetup.judgeModelConfigurationReset', "The selected Judge model configuration is no longer supported. The model defaults will be used."),
				localize('sessionComparisonSetup.judgePermissionReset', "The selected Judge permission is no longer available. The agent default will be used."),
				harness => {
					judgeHarness = harness;
				},
			);
			const synthesisRow = dom.append(evaluator, dom.$('.session-comparison-setup-evaluator-step'));
			synthesisRow.setAttribute('role', 'group');
			synthesisRow.setAttribute('aria-label', localize('sessionComparisonSetup.synthesisConfiguration', "Synthesizer configuration"));
			dom.append(synthesisRow, dom.$('h4.session-comparison-setup-evaluator-step-title')).textContent =
				localize('sessionComparisonSetup.synthesizer', "Synthesizer");
			dom.append(synthesisRow, dom.$('.session-comparison-setup-evaluator-step-description')).textContent =
				localize('sessionComparisonSetup.synthesizerDescription', "Optional. Combines the strongest parts of the attempts after the Judge recommends a result.");
			const synthesisControls = dom.append(synthesisRow, dom.$('.session-comparison-setup-row-controls'));
			renderHarnessControls(
				synthesisControls,
				synthesisHarness,
				localize('sessionComparisonSetup.agentForSynthesizer', "Agent for the Synthesizer"),
				localize('sessionComparisonSetup.modelForSynthesizer', "Model for the Synthesizer"),
				localize('sessionComparisonSetup.permissionsForSynthesizer', "Permissions for the Synthesizer"),
				localize('sessionComparisonSetup.synthesizerAgentReset', "The Synthesizer agent is no longer available. The first available agent will be used."),
				localize('sessionComparisonSetup.synthesizerModelReset', "The selected Synthesizer model is no longer available. The agent default will be used."),
				localize('sessionComparisonSetup.synthesizerModelConfigurationReset', "The selected Synthesizer model configuration is no longer supported. The model defaults will be used."),
				localize('sessionComparisonSetup.synthesizerPermissionReset', "The selected Synthesizer permission is no longer available. The agent default will be used."),
				harness => {
					synthesisHarness = harness;
				},
			);
			validationElement = dom.append(attemptsStep, dom.$('.session-comparison-setup-validation'));
			validationElement.setAttribute('role', 'status');
			validationElement.setAttribute('aria-live', 'polite');
			if (currentStep === 'attempts') {
				evaluator.remove();
			} else {
				attemptsStep.remove();
				validationElement = undefined;
			}

			const navigation = navigationContainer;
			if (currentStep !== 'attempts') {
				const backButton = rowsDisposables.add(new Button(navigation, {
					...defaultButtonStyles,
					secondary: true,
					ariaLabel: localize('sessionComparisonSetup.backAriaLabel', "Go to the previous comparison setup step"),
				}));
				backButton.label = localize('sessionComparisonSetup.back', "Back");
				rowsDisposables.add(backButton.onDidClick(() => {
					currentStep = 'attempts';
					renderRows(undefined, true);
				}));
			}
			const visibleCancelButton = rowsDisposables.add(new Button(navigation, {
				...defaultButtonStyles,
				secondary: true,
				ariaLabel: localize('sessionComparisonSetup.cancelAriaLabel', "Cancel comparison setup"),
			}));
			visibleCancelButton.label = localize('sessionComparisonSetup.cancel', "Cancel");
			rowsDisposables.add(visibleCancelButton.onDidClick(() => cancelButton?.element.click()));
			if (currentStep === 'attempts') {
				nextButton = rowsDisposables.add(new Button(navigation, {
					...defaultButtonStyles,
					ariaLabel: localize('sessionComparisonSetup.nextEvaluationAriaLabel', "Continue to evaluation configuration"),
				}));
				nextButton.label = localize('sessionComparisonSetup.next', "Next");
				rowsDisposables.add(nextButton.onDidClick(() => {
					currentStep = 'evaluation';
					renderRows(undefined, true);
				}));
			} else {
				runButton = rowsDisposables.add(new Button(navigation, {
					...defaultButtonStyles,
					ariaLabel: localize('sessionComparisonSetup.runAriaLabel', "Run the configured comparison attempts"),
				}));
				rowsDisposables.add(runButton.onDidClick(() => confirmButton?.element.click()));
			}
			updateValidation();
			contentScrollable?.scanDomNode();
			if (focusStep) {
				content.querySelector<HTMLElement>('.session-comparison-setup-step.current .session-comparison-setup-step-label')?.focus();
			}
		};

		disposables.add(context.onDidChangeWorkspace(change => {
			workspace = change.workspace;
			branch = change.branch;
			branches = change.branches;
			hasGitRemote = change.hasGitRemote;
			if (change.defaultHarness) {
				attempts = [
					{ id: generateUuid(), harness: change.defaultHarness },
					{ id: generateUuid(), harness: change.defaultHarness },
				];
				judgeHarness = change.defaultHarness;
				synthesisHarness = change.defaultHarness;
			} else {
				attempts = [];
			}
			currentStep = 'attempts';
			renderRows();
		}));

		try {
			const dialog = disposables.add(new Dialog(
				this.layoutService.activeContainer,
				localize('sessionComparisonSetup.title', "Run and Compare Agents"),
				[
					localize('sessionComparisonSetup.confirm', "Run {0} attempts", attempts.length),
					localize('sessionComparisonSetup.cancel', "Cancel"),
				],
				{
					cancelId: 1,
					type: 'none',
					detail: localize('sessionComparisonSetup.usage', "Each attempt runs in an isolated worktree. Nothing is applied automatically."),
					extraClasses: ['session-comparison-setup-dialog'],
					isExternalFocusAllowed: target => !!target.closest('.context-view, .monaco-select-box-dropdown-container'),
					buttonStyles: defaultButtonStyles,
					checkboxStyles: defaultCheckboxStyles,
					inputBoxStyles: defaultInputBoxStyles,
					dialogStyles: { ...defaultDialogStyles, textLinkForeground: undefined },
					buttonOptions: [
						{
							styleButton: button => {
								confirmButton = button;
								updateValidation();
							},
						},
						{
							styleButton: button => {
								cancelButton = button;
								button.element.hidden = true;
							},
						},
					],
					renderBody: container => {
						container.classList.add('session-comparison-setup-body');
						content = dom.$('.session-comparison-setup-content');
						contentScrollable = disposables.add(new DomScrollableElement(content, {
							horizontal: ScrollbarVisibility.Hidden,
							vertical: ScrollbarVisibility.Auto,
							useShadows: true,
							consumeMouseWheelIfScrollbarIsNeeded: true,
						}));
						contentScrollable.getDomNode().classList.add('session-comparison-setup-content-scroll');
						dom.append(container, contentScrollable.getDomNode());
						navigationContainer = dom.append(container, dom.$('.session-comparison-setup-navigation'));
						const resizeObserver = new (dom.getWindow(container).ResizeObserver)(() => contentScrollable?.scanDomNode());
						disposables.add({ dispose: () => resizeObserver.disconnect() });
						resizeObserver.observe(container);
						const dialogElement = container.closest<HTMLElement>('.session-comparison-setup-dialog');
						if (!dialogElement) {
							throw new Error('Session comparison setup dialog element not found.');
						}
						this._registerFocusNavigation(dialogElement, disposables);
						disposables.add(new SessionComparisonDialogResizeController(dialogElement, container, this.storageService));
						renderRows();
						contentScrollable.scanDomNode();
					},
				},
			));

			for (const provider of this.sessionsProvidersService.getProviders()) {
				disposables.add(provider.onDidChangeModels(() => renderRows()));
			}
			disposables.add(this.sessionsManagementService.onDidChangeSessionTypes(() => renderRows()));

			const result = await dialog.show();
			return { confirmed: result.button === 0, attempts, judgeHarness, synthesisHarness, branch };
		} finally {
			if (this.activeDialog.value === disposables) {
				this.activeDialog.clear();
			} else {
				disposables.dispose();
			}
		}
	}

	private _registerFocusNavigation(dialogElement: HTMLElement, store: DisposableStore): void {
		store.add(dom.addDisposableListener(dialogElement, dom.EventType.KEY_DOWN, event => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			const isArrowNavigation = keyboardEvent.equals(KeyCode.RightArrow) || keyboardEvent.equals(KeyCode.LeftArrow);
			if (isArrowNavigation
				&& dom.isHTMLElement(event.target)
				&& event.target.closest('select, [role="combobox"], [role="listbox"], [role="radio"], [role="slider"], summary')) {
				event.stopImmediatePropagation();
				return;
			}
			if (!keyboardEvent.equals(KeyCode.Tab) && !keyboardEvent.equals(KeyMod.Shift | KeyCode.Tab)) {
				return;
			}

			// eslint-disable-next-line no-restricted-syntax
			const focusableElements = [...dialogElement.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')]
				.filter(element => element.tabIndex >= 0
					&& !element.hasAttribute('disabled')
					&& element.getAttribute('aria-disabled') !== 'true'
					&& element.getClientRects().length > 0);
			const focusedIndex = focusableElements.findIndex(dom.isActiveElement);
			if (focusedIndex < 0 || focusableElements.length < 2) {
				return;
			}

			const nextIndex = keyboardEvent.shiftKey
				? (focusedIndex - 1 + focusableElements.length) % focusableElements.length
				: (focusedIndex + 1) % focusableElements.length;
			keyboardEvent.preventDefault();
			event.stopImmediatePropagation();
			focusableElements[nextIndex].focus();
		}));
	}

	private _applyBulkPermissionSelection(
		attempts: readonly ISessionComparisonAttemptConfiguration[],
		judgeHarness: ISessionComparisonHarness,
		synthesisHarness: ISessionComparisonHarness,
		allowAll: boolean,
	): {
		readonly attempts: readonly ISessionComparisonAttemptConfiguration[];
		readonly judgeHarness: ISessionComparisonHarness;
		readonly synthesisHarness: ISessionComparisonHarness;
	} {
		const selectPermission = (harness: ISessionComparisonHarness): ISessionComparisonHarness => {
			const options = this.sessionsProvidersService.getProvider(harness.providerId)?.getPermissionOptionsForCreation?.(harness.sessionTypeId) ?? [];
			const permission = options.find(option => (allowAll ? option.isAllowAll : option.isDefault) && !option.locked);
			return permission ? {
				...harness,
				permissionId: permission.id,
				permissionLabel: permission.label,
			} : harness;
		};
		return {
			attempts: attempts.map(attempt => ({ ...attempt, harness: selectPermission(attempt.harness) })),
			judgeHarness: selectPermission(judgeHarness),
			synthesisHarness: selectPermission(synthesisHarness),
		};
	}

}
