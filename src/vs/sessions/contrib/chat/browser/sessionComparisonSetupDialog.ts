/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionComparisonSetupDialog.css';
import * as dom from '../../../../base/browser/dom.js';
import { Dialog } from '../../../../base/browser/ui/dialog/dialog.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { SelectBox } from '../../../../base/browser/ui/selectBox/selectBox.js';
import { Button, IButton } from '../../../../base/browser/ui/button/button.js';
import { TriStateCheckbox } from '../../../../base/browser/ui/toggle/toggle.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../base/common/observable.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { localize } from '../../../../nls.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { defaultButtonStyles, defaultCheckboxStyles, defaultDialogStyles, defaultInputBoxStyles, defaultSelectBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IModelPickerDelegate, ModelPickerActionItem } from '../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelPickerActionItem.js';
import { createModelConfigurationActions, ILanguageModelChatMetadataAndIdentifier, IModelConfigurationAccess } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { getSessionComparisonHarnessDisplayLabel, ISessionComparisonAttemptConfiguration, ISessionComparisonHarness } from '../../../services/sessions/common/sessionComparison.js';
import { type ISessionPermissionOption } from '../../../services/sessions/common/sessionsProvider.js';
import { isReasoningEffortLevel, ReasoningEffortConfigKey } from '../../../../platform/agentHost/common/reasoningEffort.js';
import { NEW_SESSION_PROMPT_PLACEHOLDER } from './newChatInput.js';

export interface ISessionComparisonSetupContext {
	readonly workspace: URI;
	readonly workspaceLabel: string;
	readonly branch?: string;
	readonly attachedContextCount: number;
	readonly prompt: string;
	readonly setPrompt: (prompt: string) => void;
}

export interface ISessionComparisonSetupResult {
	readonly confirmed: boolean;
	readonly attempts: readonly ISessionComparisonAttemptConfiguration[];
	readonly judgeHarness: ISessionComparisonHarness;
}

function harnessKey(providerId: string, sessionTypeId: string): string {
	return `${providerId}\0${sessionTypeId}`;
}

const SESSION_COMPARISON_DIALOG_WIDTH_STORAGE_KEY = 'sessions.comparisonSetupDialog.width';
const SESSION_COMPARISON_DIALOG_HEIGHT_STORAGE_KEY = 'sessions.comparisonSetupDialog.height';
const SESSION_COMPARISON_DIALOG_MIN_WIDTH = 480;
const SESSION_COMPARISON_DIALOG_MIN_HEIGHT = 240;
const SESSION_COMPARISON_DIALOG_VIEWPORT_RATIO = 0.9;
const SESSION_COMPARISON_DIALOG_KEYBOARD_RESIZE_STEP = 20;

type SessionComparisonDialogResizeAxis = 'width' | 'height' | 'both';

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
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();
	}

	async show(context: ISessionComparisonSetupContext, initialAttempts: readonly ISessionComparisonAttemptConfiguration[], initialJudgeHarness: ISessionComparisonHarness): Promise<ISessionComparisonSetupResult> {
		const disposables = new DisposableStore();
		this.activeDialog.value = disposables;
		const rowsDisposables = disposables.add(new DisposableStore());
		let attempts = [...initialAttempts];
		let content: HTMLElement | undefined;
		let confirmButton: IButton | undefined;
		let validationElement: HTMLElement | undefined;
		let prompt = context.prompt;
		let judgeHarness = initialJudgeHarness;
		let evaluationExpanded = false;
		let renderedEvaluation: HTMLDetailsElement | undefined;

		const getHarnesses = (): readonly ISessionComparisonHarness[] => this.sessionsManagementService.getSessionTypesForFolder(context.workspace)
			.filter(({ sessionType }) => sessionType.supportsWorktreeConfiguration)
			.map(({ providerId, sessionType }) => ({
				providerId,
				sessionTypeId: sessionType.id,
				label: sessionType.label,
			}));

		const updateValidation = (): void => {
			const count = attempts.length;
			const hasPrompt = prompt.trim().length > 0;
			const hasWorktreeBase = context.branch !== undefined;
			const hasHarnesses = getHarnesses().length > 0;
			if (confirmButton) {
				confirmButton.enabled = count >= 2 && hasPrompt && hasWorktreeBase && hasHarnesses;
				confirmButton.label = localize('sessionComparisonSetup.runAttemptCount', "Run {0} attempts", count);
			}
			if (validationElement) {
				validationElement.hidden = count >= 2 && hasPrompt && hasWorktreeBase && hasHarnesses;
				validationElement.textContent = !hasWorktreeBase
					? localize('sessionComparisonSetup.gitRepositoryRequired', "Comparisons require a Git repository with at least one commit.")
					: !hasHarnesses
						? localize('sessionComparisonSetup.noAvailableAgents', "No agents that support worktree isolation are available.")
						: count < 2
							? localize('sessionComparisonSetup.minimumSelection', "Add at least two attempts.")
							: hasPrompt ? '' : localize('sessionComparisonSetup.promptRequired', "Enter a prompt to run the attempts.");
			}
		};

		const renderRows = (focusAttemptId?: string): void => {
			if (!content) {
				return;
			}
			evaluationExpanded = renderedEvaluation?.open ?? evaluationExpanded;
			renderedEvaluation = undefined;
			rowsDisposables.clear();
			dom.clearNode(content);
			validationElement = undefined;

			const promptSection = dom.append(content, dom.$('.session-comparison-setup-prompt'));
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
			const contextSummary = dom.append(content, dom.$('.session-comparison-setup-context-summary'));
			dom.append(contextSummary, dom.$('span')).textContent = localize('sessionComparisonSetup.startingFrom', "Starting from");
			dom.append(contextSummary, dom.$('span.session-comparison-setup-context-value')).textContent = context.workspaceLabel;
			if (context.branch !== undefined) {
				const separator = dom.append(contextSummary, dom.$('span.session-comparison-setup-context-separator'));
				separator.setAttribute('aria-hidden', 'true');
				separator.textContent = '·';
				dom.append(contextSummary, dom.$('span.session-comparison-setup-context-value')).textContent = context.branch;
			}
			if (context.attachedContextCount > 0) {
				const separator = dom.append(contextSummary, dom.$('span.session-comparison-setup-context-separator'));
				separator.setAttribute('aria-hidden', 'true');
				separator.textContent = '·';
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
			const participantHarnesses = () => [...attempts.map(attempt => attempt.harness), judgeHarness];
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
			const bulkPermissions = dom.append(content, dom.$('.session-comparison-setup-bulk-permissions'));
			const bulkPermissionLabel = localize('sessionComparisonSetup.permissions.allowAllParticipants', "Allow all permissions for every participant");
			const bulkPermissionCheckbox = rowsDisposables.add(new TriStateCheckbox(bulkPermissionLabel, bulkPermissionState.checked, defaultCheckboxStyles));
			bulkPermissionCheckbox.domNode.setAttribute('aria-checked', String(bulkPermissionState.checked));
			if (!bulkPermissionState.available) {
				bulkPermissionCheckbox.disable();
			}
			dom.append(bulkPermissions, bulkPermissionCheckbox.domNode);
			dom.append(bulkPermissions, dom.$('span.session-comparison-setup-bulk-permissions-label', { 'aria-hidden': 'true' }, bulkPermissionLabel));
			const bulkPermissionDescription = dom.append(bulkPermissions, dom.$('span.session-comparison-setup-bulk-permissions-description'));
			bulkPermissionDescription.textContent = bulkPermissionState.available
				? localize('sessionComparisonSetup.permissions.allowAllParticipantsDescription', "Uses each selected agent's Allow all, Bypass Permissions, or Full Access option. Uncheck to restore every participant's default.")
				: localize('sessionComparisonSetup.permissions.allowAllParticipantsUnavailable', "Unavailable for one or more selected agents or disabled by your organization.");
			const updateBulkPermissionCheckbox = () => {
				const checked = getBulkPermissionState().checked;
				bulkPermissionCheckbox.checked = checked;
				bulkPermissionCheckbox.domNode.setAttribute('aria-checked', String(checked));
			};
			rowsDisposables.add(bulkPermissionCheckbox.onChange(() => {
				const selectPermission = (harness: ISessionComparisonHarness): ISessionComparisonHarness => {
					const options = getPermissionOptions(harness);
					const permission = options.find(option => (bulkPermissionCheckbox.checked === true ? option.isAllowAll : option.isDefault) && !option.locked);
					return permission ? applyPermission(harness, permission) : harness;
				};
				attempts = attempts.map(attempt => ({ ...attempt, harness: selectPermission(attempt.harness) }));
				judgeHarness = selectPermission(judgeHarness);
				renderRows();
			}));

			const usage = dom.append(content, dom.$('.session-comparison-setup-usage'));
			usage.textContent = localize('sessionComparisonSetup.usage', "Each attempt runs in an isolated worktree. Nothing is applied automatically.");

			const attemptsSection = dom.append(content, dom.$('.session-comparison-setup-attempts'));
			const attemptsHeading = dom.append(attemptsSection, dom.$('h3.session-comparison-setup-section-title'));
			attemptsHeading.id = `session-comparison-attempts-${generateUuid()}`;
			attemptsHeading.textContent =
				localize('sessionComparisonSetup.attempts', "Attempts");
			attemptsSection.setAttribute('role', 'group');
			attemptsSection.setAttribute('aria-labelledby', attemptsHeading.id);
			const rows = dom.$('.session-comparison-setup-rows');
			const rowsScrollable = rowsDisposables.add(new DomScrollableElement(rows, {
				horizontal: ScrollbarVisibility.Hidden,
				vertical: ScrollbarVisibility.Auto,
				useShadows: true,
				consumeMouseWheelIfScrollbarIsNeeded: true,
			}));
			rowsScrollable.getDomNode().classList.add('session-comparison-setup-rows-scroll');
			dom.append(attemptsSection, rowsScrollable.getDomNode());
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
				const models = provider?.getModelsSnapshotForCreation?.(context.workspace, harness.sessionTypeId).models ?? [];
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
				dom.append(agentField, dom.$('span.session-comparison-setup-field-label')).textContent =
					localize('sessionComparisonSetup.agent', "Agent");
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
				agentSelect.render(dom.append(agentField, dom.$('.session-comparison-setup-select')));
				if (showProviderLabels) {
					dom.append(agentField, dom.$('span.session-comparison-setup-provider')).textContent =
						provider?.label ?? harness.providerId;
				}
				rowsDisposables.add(agentSelect.onDidSelect(({ index }) => {
					const selected = harnesses[index];
					if (selected) {
						const nextPermissionOptions = getPermissionOptions(selected);
						const nextPermission = nextPermissionOptions.find(option => option.id === harness.permissionId && !option.locked)
							?? nextPermissionOptions.find(option => option.isDefault && !option.locked)
							?? nextPermissionOptions.find(option => !option.locked);
						onChange(nextPermission ? applyPermission(selected, nextPermission) : selected);
						if (harness.permissionId && nextPermission?.id !== harness.permissionId) {
							status(unavailablePermissionMessage);
						}
						renderRows();
					}
				}));

				const modelField = dom.append(container, dom.$('.session-comparison-setup-field'));
				const modelFieldLabel = dom.append(modelField, dom.$('span.session-comparison-setup-field-label'));
				modelFieldLabel.textContent =
					localize('sessionComparisonSetup.model', "Model");
				modelField.setAttribute('role', 'group');
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
						showModelIcon: true,
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
				dom.append(permissionField, dom.$('span.session-comparison-setup-field-label')).textContent =
					localize('sessionComparisonSetup.permissions', "Permissions");
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
				const header = dom.append(row, dom.$('.session-comparison-setup-row-header'));
				const attemptLabel = dom.append(header, dom.$('.session-comparison-setup-label'));
				attemptLabel.id = `session-comparison-attempt-${attempt.id}`;
				attemptLabel.textContent =
					localize('sessionComparisonSetup.attempt', "Attempt {0}", index + 1);
				row.setAttribute('role', 'group');
				row.setAttribute('aria-labelledby', attemptLabel.id);
				if (attempts.length > 2) {
					const removeButton = rowsDisposables.add(new Button(header, {
						...defaultButtonStyles,
						secondary: true,
						ariaLabel: localize('sessionComparisonSetup.removeAttemptAriaLabel', "Remove attempt {0}", index + 1),
					}));
					removeButton.element.classList.add('session-comparison-setup-remove');
					removeButton.label = localize('sessionComparisonSetup.removeAttempt', "Remove");
					rowsDisposables.add(removeButton.onDidClick(() => {
						attempts = attempts.filter(candidate => candidate.id !== attempt.id);
						renderRows(attempts[Math.min(index, attempts.length - 1)]?.id);
					}));
				}

				const controls = dom.append(row, dom.$('.session-comparison-setup-row-controls'));
				const agentSelect = renderHarnessControls(
					controls,
					attempt.harness,
					localize('sessionComparisonSetup.agentForAttempt', "Agent for attempt {0}", index + 1),
					localize('sessionComparisonSetup.modelForAttempt', "Model for attempt {0}", index + 1),
					localize('sessionComparisonSetup.permissionsForAttempt', "Permissions for attempt {0}", index + 1),
					localize('sessionComparisonSetup.agentReset', "The agent for attempt {0} is no longer available. The first available agent will be used.", index + 1),
					localize('sessionComparisonSetup.modelReset', "The selected model for attempt {0} is no longer available. The agent default will be used.", index + 1),
					localize('sessionComparisonSetup.modelConfigurationReset', "The selected model configuration for attempt {0} is no longer supported. The model defaults will be used.", index + 1),
					localize('sessionComparisonSetup.permissionReset', "The selected permission for attempt {0} is no longer available. The agent default will be used.", index + 1),
					harness => attempts[index] = { id: attempt.id, harness },
				);

				if (focusAttemptId === attempt.id) {
					agentSelect?.focus();
				}
			}

			rowsScrollable.scanDomNode();

			const addButton = rowsDisposables.add(new Button(attemptsSection, {
				...defaultButtonStyles,
				secondary: true,
				ariaLabel: localize('sessionComparisonSetup.addAttemptAriaLabel', "Add another comparison attempt"),
			}));
			addButton.element.classList.add('session-comparison-setup-add');
			addButton.label = localize('sessionComparisonSetup.addAttempt', "Add attempt");
			addButton.enabled = harnesses.length > 0;
			rowsDisposables.add(addButton.onDidClick(() => {
				const harness = attempts.at(-1)?.harness ?? harnesses[0];
				if (!harness) {
					return;
				}
				const attempt = { id: generateUuid(), harness };
				attempts = [...attempts, attempt];
				renderRows(attempt.id);
			}));

			const evaluation = dom.append(content, dom.$('details.session-comparison-setup-evaluation')) as HTMLDetailsElement;
			renderedEvaluation = evaluation;
			evaluation.open = evaluationExpanded;
			const evaluationSummary = dom.append(evaluation, dom.$('summary.session-comparison-setup-evaluation-summary'));
			dom.append(evaluationSummary, dom.$('span.session-comparison-setup-label')).textContent =
				localize('sessionComparisonSetup.evaluation', "Evaluation");
			const getJudgeLabel = (): string => judgeHarness.modelId
				? getSessionComparisonHarnessDisplayLabel(judgeHarness)
				: localize('sessionComparisonSetup.judgeHarnessAuto', "{0} · Auto", judgeHarness.label);
			const judgeValue = dom.append(evaluationSummary, dom.$('span.session-comparison-setup-evaluation-value'));
			judgeValue.textContent = getJudgeLabel();
			const judgeRow = dom.append(evaluation, dom.$('.session-comparison-setup-judge'));
			judgeRow.setAttribute('role', 'group');
			judgeRow.setAttribute('aria-label', localize('sessionComparisonSetup.judgeConfiguration', "Judge configuration"));
			dom.append(judgeRow, dom.$('.session-comparison-setup-judge-description')).textContent =
				localize('sessionComparisonSetup.judgeDescription', "Reviews the finished attempts and recommends a result.");
			renderHarnessControls(
				dom.append(judgeRow, dom.$('.session-comparison-setup-row-controls')),
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
					judgeValue.textContent = getJudgeLabel();
				},
			);
			rowsDisposables.add(dom.addDisposableListener(evaluation, 'toggle', () => {
				evaluationExpanded = evaluation.open;
			}));

			validationElement = dom.append(content, dom.$('.session-comparison-setup-validation'));
			validationElement.setAttribute('role', 'status');
			validationElement.setAttribute('aria-live', 'polite');
			updateValidation();
		};

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
					extraClasses: ['session-comparison-setup-dialog'],
					isExternalFocusAllowed: target => !!target.closest('.context-view, .monaco-select-box-dropdown-container'),
					buttonStyles: defaultButtonStyles,
					checkboxStyles: defaultCheckboxStyles,
					inputBoxStyles: defaultInputBoxStyles,
					dialogStyles: { ...defaultDialogStyles, textLinkForeground: undefined },
					buttonOptions: [{
						styleButton: button => {
							confirmButton = button;
							updateValidation();
						},
					}],
					renderBody: container => {
						container.classList.add('session-comparison-setup-body');
						content = dom.append(container, dom.$('.session-comparison-setup-content'));
						const dialogElement = container.closest<HTMLElement>('.session-comparison-setup-dialog');
						if (!dialogElement) {
							throw new Error('Session comparison setup dialog element not found.');
						}
						disposables.add(new SessionComparisonDialogResizeController(dialogElement, container, this.storageService));
						renderRows();
					},
				},
			));

			for (const provider of this.sessionsProvidersService.getProviders()) {
				disposables.add(provider.onDidChangeModels(() => renderRows()));
			}
			disposables.add(this.sessionsManagementService.onDidChangeSessionTypes(() => renderRows()));

			const result = await dialog.show();
			return { confirmed: result.button === 0, attempts, judgeHarness };
		} finally {
			if (this.activeDialog.value === disposables) {
				this.activeDialog.clear();
			} else {
				disposables.dispose();
			}
		}
	}
}
