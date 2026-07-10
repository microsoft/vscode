/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { IButton } from '../../../../base/browser/ui/button/button.js';
import { Dialog } from '../../../../base/browser/ui/dialog/dialog.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { defaultDialogStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { createWorkbenchDialogOptions } from '../../../../workbench/browser/parts/dialogs/dialog.js';
import { IAutomationSchedule } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationDialogResult, IAutomationDialogService, IShowAutomationDialogOptions } from '../../../../workbench/contrib/chat/common/automations/automationDialogService.js';
import { ICreateAutomationOptions, IUpdateAutomationOptions } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { IHostService } from '../../../../workbench/services/host/browser/host.js';
import { IFormState, IValidationState, isAutomationDialogPopupTarget, renderForm, updateSaveButtonState } from './automationDialog.js';

const $ = DOM.$;

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
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@ILayoutService private readonly layoutService: ILayoutService,
		@ILogService private readonly logService: ILogService,
		@IProductService private readonly productService: IProductService,
		@IHostService private readonly hostService: IHostService,
	) { }

	async showAutomationDialog(options: IShowAutomationDialogOptions): Promise<IAutomationDialogResult | undefined> {
		const disposables = new DisposableStore();

		const initial = options.existing;
		const isEdit = !!initial;

		const state: IFormState = {
			name: initial?.name ?? '',
			interval: initial?.schedule.interval ?? 'daily',
			hour: initial?.schedule.scheduleHour ?? 9,
			minute: initial?.schedule.scheduleMinute ?? 0,
			day: initial?.schedule.scheduleDay ?? 1,
			folderUri: initial?.folderUri,
			providerId: initial?.providerId,
			sessionTypeId: initial?.sessionTypeId,
			isolationMode: initial?.isolationMode ?? 'workspace',
			branch: initial?.branch,
			enabled: initial?.enabled ?? true,
		};

		const validation: IValidationState = { nameError: undefined, promptError: undefined, folderError: undefined };

		let saveButton: IButton | undefined;
		let revalidate: () => void = () => { };
		let getPrompt: () => string = () => initial?.prompt ?? '';
		let getMode: () => string | undefined = () => initial?.mode;
		let getPermissionLevel: () => string | undefined = () => initial?.permissionLevel;
		let getModelId: () => string | undefined = () => initial?.modelId;

		const title = isEdit
			? localize('automation.dialog.editTitle', "Edit automation")
			: localize('automation.dialog.createTitle', "New automation");

		const buttonLabels = [
			isEdit ? localize('automation.dialog.save', "Save") : localize('automation.dialog.create', "Create"),
			localize('automation.dialog.cancel', "Cancel"),
		];

		const dialog = disposables.add(new Dialog(
			this.layoutService.activeContainer,
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
				],
				renderBody: container => {
					container.classList.add('automation-dialog-body');

					const titlebar = DOM.append(container, $('.automation-titlebar'));
					titlebar.setAttribute('aria-hidden', 'true');
					titlebar.textContent = title;

					const description = DOM.append(container, $('.automation-description'));
					description.textContent = isEdit
						? localize('automation.dialog.editDescription', "Update the schedule, prompt, or run target for this automation.")
						: localize('automation.dialog.createDescription', "Define a prompt that Copilot will run on a schedule against the selected folder.");

					const formPane = DOM.append(container, $('.automation-form-pane'));
					const form = DOM.append(formPane, $('.automation-form'));
					const handle = renderForm(form, state, options, disposables, validation, () => revalidate(), this.instantiationService, this.contextKeyService, this.contextViewService, this.configurationService, this.layoutService, this.logService, this.productService, initial?.prompt ?? '', initial?.mode, initial?.permissionLevel, initial?.modelId);
					getPrompt = handle.getPrompt;
					getMode = handle.getMode;
					getPermissionLevel = handle.getPermissionLevel;
					getModelId = handle.getModelId;
					revalidate = () => updateSaveButtonState(saveButton, state, validation, form, getPrompt);
					revalidate();
				},
			}, this.keybindingService, this.layoutService, this.hostService),
		));

		try {
			const result = await dialog.show();
			if (result.button !== 0) {
				return undefined;
			}
			// Guard against submit-with-Enter bypassing live validation.
			revalidate();
			if (validation.nameError || validation.promptError || validation.folderError) {
				return undefined;
			}
			if (!state.folderUri) {
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

			if (isEdit && initial) {
				const patch: IUpdateAutomationOptions = {
					name: state.name,
					prompt,
					schedule,
					folderUri: state.folderUri,
					providerId: state.providerId ?? null,
					sessionTypeId: state.sessionTypeId ?? null,
					modelId: modelId ?? null,
					mode: mode ?? null,
					permissionLevel: permissionLevel ?? null,
					isolationMode: state.isolationMode ?? null,
					branch: state.branch ?? null,
					enabled: state.enabled,
				};
				return { kind: 'update', id: initial.id, value: patch };
			}

			const create: ICreateAutomationOptions = {
				name: state.name,
				prompt,
				schedule,
				folderUri: state.folderUri,
				providerId: state.providerId,
				sessionTypeId: state.sessionTypeId,
				modelId,
				mode,
				permissionLevel,
				isolationMode: state.isolationMode,
				branch: state.branch,
				enabled: state.enabled,
			};
			return { kind: 'create', value: create };
		} finally {
			disposables.dispose();
		}
	}
}
