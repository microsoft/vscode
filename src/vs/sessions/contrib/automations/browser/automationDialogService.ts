/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { IButton } from '../../../../base/browser/ui/button/button.js';
import { Dialog } from '../../../../base/browser/ui/dialog/dialog.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { defaultDialogStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { createWorkbenchDialogOptions } from '../../../../workbench/browser/parts/dialogs/dialog.js';
import { AutomationTarget, IAutomationSchedule } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationDialogResult, IAutomationDialogService, IShowAutomationDialogOptions } from '../../../../workbench/contrib/chat/common/automations/automationDialogService.js';
import { ICreateAutomationOptions, IUpdateAutomationOptions } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { IHostService } from '../../../../workbench/services/host/browser/host.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IFormState, IValidationState, isAutomationDialogPopupTarget, registerAutomationDialogKeyboardNavigation, renderForm, updateSaveButtonState } from './automationDialog.js';

const $ = DOM.$;

const automationDialogAllowableCommands = new Set([
	'workbench.action.quit',
	'workbench.action.reloadWindow',
	'copy',
	'cut',
	'paste',
	'editor.action.selectAll',
	'editor.action.clipboardCopyAction',
	'editor.action.clipboardCutAction',
	'editor.action.clipboardPasteAction',
	'hideCodeActionWidget',
	'clearFilterCodeActionWidget',
	'selectPrevCodeAction',
	'selectNextCodeAction',
	'acceptSelectedCodeAction',
	'previewSelectedCodeAction',
	'toggleSectionCodeAction',
	'collapseSectionCodeAction',
	'expandSectionCodeAction',
	'quickInput.next',
	'quickInput.previous',
	'quickInput.accept',
	'quickInput.hide',
]);

/**
 * Owns the Automations create/edit dialog in the sessions layer, where the
 * session-type provider it needs already lives. The workbench list widget
 * depends only on {@link IAutomationDialogService}.
 */
export class AutomationDialogService implements IAutomationDialogService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@ILogService private readonly logService: ILogService,
		@IProductService private readonly productService: IProductService,
		@IHostService private readonly hostService: IHostService,
	) { }

	async showAutomationDialog(options: IShowAutomationDialogOptions): Promise<IAutomationDialogResult | undefined> {
		const disposables = new DisposableStore();

		const initial = options.existing;
		const isEdit = !!initial;
		const initialTarget = initial?.target;
		const initialWorkspaceTarget = initialTarget?.kind === 'workspace' ? initialTarget : undefined;

		const state: IFormState = {
			name: initial?.name ?? '',
			interval: initial?.schedule.interval ?? 'daily',
			hour: initial?.schedule.scheduleHour ?? 9,
			minute: initial?.schedule.scheduleMinute ?? 0,
			day: initial?.schedule.scheduleDay ?? 1,
			isQuickChat: initialTarget?.kind === 'quickChat',
			folderUri: initialWorkspaceTarget?.folderUri,
			providerId: initialTarget?.providerId,
			sessionTypeId: initialTarget?.sessionTypeId,
			isolationMode: initialWorkspaceTarget?.isolation.kind === 'default'
				? undefined
				: initialWorkspaceTarget?.isolation.kind === 'worktree' ? 'worktree' : 'workspace',
			branch: initialWorkspaceTarget?.isolation.kind === 'worktree' ? initialWorkspaceTarget.isolation.branch : undefined,
			enabled: initial?.enabled ?? true,
		};

		const validation: IValidationState = { nameError: undefined, promptError: undefined, folderError: undefined, sessionTypeError: undefined, branchError: undefined };

		let saveButton: IButton | undefined;
		let cancelButton: IButton | undefined;
		let revalidate: () => void = () => { };
		let getPrompt: () => string = () => initial?.prompt ?? '';
		let getMode: () => string | undefined = () => initial?.mode;
		let getPermissionLevel: () => string | undefined = () => initial?.permissionLevel;
		let getModelId: () => string | undefined = () => initial?.modelId;
		let getBranch: () => string | undefined = () => initialWorkspaceTarget?.isolation.kind === 'worktree' ? initialWorkspaceTarget.isolation.branch : undefined;
		let getFocusableElements: () => readonly HTMLElement[] = () => [];
		let focusFirst: () => void = () => { };

		const title = isEdit
			? localize('automation.dialog.editTitle', "Edit automation")
			: localize('automation.dialog.createTitle', "New automation");

		const buttonLabels = [
			isEdit ? localize('automation.dialog.save', "Save") : localize('automation.dialog.create', "Create"),
			localize('automation.dialog.cancel', "Cancel"),
		];

		const activeContainer = this.layoutService.activeContainer;
		const dialog = disposables.add(new Dialog(
			activeContainer,
			title,
			buttonLabels,
			createWorkbenchDialogOptions({
				type: 'none',
				extraClasses: ['automation-dialog'],
				cancelId: 1,
				isExternalFocusAllowed: isAutomationDialogPopupTarget,
				// textLinkForeground stamps inline styles onto chat input picker chips.
				dialogStyles: { ...defaultDialogStyles, textLinkForeground: undefined },
				buttonOptions: [
					{
						styleButton: button => {
							saveButton = button;
							revalidate();
						},
					},
					{
						styleButton: button => {
							cancelButton = button;
						},
					},
				],
				renderBody: container => {
					container.classList.add('automation-dialog-body');

					const titlebar = DOM.append(container, $('.automation-titlebar'));
					titlebar.setAttribute('aria-hidden', 'true');
					titlebar.textContent = title;

					const description = DOM.append(container, $('.automation-description'));
					description.textContent = isEdit
						? localize('automation.dialog.editDescription', "Update the schedule, prompt, or run target for this automation.")
						: localize('automation.dialog.createDescription', "Define a prompt that Copilot will run on a schedule against the selected target.");

					const formPane = DOM.append(container, $('.automation-form-pane'));
					const form = DOM.append(formPane, $('.automation-form'));
					const handle = renderForm(form, state, options, disposables, validation, () => revalidate(), this.instantiationService, this.contextKeyService, this.contextViewService, this.configurationService, this.languageModelsService, this.layoutService, this.logService, this.productService, initial?.prompt ?? '', initial?.mode, initial?.permissionLevel, initial?.modelId);
					getPrompt = handle.getPrompt;
					getMode = handle.getMode;
					getPermissionLevel = handle.getPermissionLevel;
					getModelId = handle.getModelId;
					getBranch = handle.getBranch;
					getFocusableElements = handle.getFocusableElements;
					const keyboardNavigation = disposables.add(registerAutomationDialogKeyboardNavigation(
						DOM.getWindow(container),
						() => [
							...getFocusableElements(),
							...(saveButton ? [saveButton.element] : []),
							...(cancelButton ? [cancelButton.element] : []),
						],
						isAutomationDialogPopupTarget,
					));
					focusFirst = keyboardNavigation.focusFirst;
					revalidate = () => updateSaveButtonState(saveButton, state, validation, form, getPrompt, getBranch);
					revalidate();
				},
			}, this.keybindingService, this.layoutService, this.hostService, automationDialogAllowableCommands),
		));

		activeContainer.classList.add('automation-dialog-open');
		disposables.add(toDisposable(() => activeContainer.classList.remove('automation-dialog-open')));

		try {
			const resultPromise = dialog.show();
			focusFirst();
			const result = await resultPromise;
			if (result.button !== 0) {
				return undefined;
			}
			// Guard against submit-with-Enter bypassing live validation.
			revalidate();
			if (validation.nameError || validation.promptError || validation.folderError || validation.sessionTypeError || validation.branchError) {
				return undefined;
			}
			if ((!state.isQuickChat && !state.folderUri) || !state.sessionTypeId || (state.isQuickChat && !state.providerId)) {
				return undefined;
			}

			const schedule: IAutomationSchedule = {
				interval: state.interval,
				scheduleHour: state.hour,
				scheduleMinute: state.minute,
				scheduleDay: state.day,
			};

			const prompt = getPrompt();
			const mode = getMode();
			const permissionLevel = getPermissionLevel();
			const modelId = getModelId();
			const branch = getBranch();
			const target = createAutomationTarget(state, branch);
			if (!target) {
				return undefined;
			}

			if (isEdit && initial) {
				const patch: IUpdateAutomationOptions = {
					name: state.name,
					prompt,
					schedule,
					target,
					modelId: modelId ?? null,
					mode: mode ?? null,
					permissionLevel: permissionLevel ?? null,
					enabled: state.enabled,
				};
				return { kind: 'update', id: initial.id, value: patch };
			}

			const create: ICreateAutomationOptions = {
				name: state.name,
				prompt,
				schedule,
				target,
				modelId,
				mode,
				permissionLevel,
				enabled: state.enabled,
			};
			return { kind: 'create', value: create };
		} finally {
			disposables.dispose();
		}
	}
}

function createAutomationTarget(state: IFormState, branch: string | undefined): AutomationTarget | undefined {
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
		? {
			kind: 'workspace',
			folderUri: state.folderUri,
			providerId: state.providerId,
			sessionTypeId: state.sessionTypeId,
			isolation,
		}
		: undefined;
}
