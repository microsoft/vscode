/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/automationDialog.css';
import * as DOM from '../../../../base/browser/dom.js';
import { ButtonBar, IButton } from '../../../../base/browser/ui/button/button.js';
import { Dialog } from '../../../../base/browser/ui/dialog/dialog.js';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { isWindows } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { defaultButtonStyles, defaultDialogStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { createWorkbenchDialogOptions } from '../../../../workbench/browser/parts/dialogs/dialog.js';
import { AutomationTarget, IAutomationSchedule } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationDialogResult, IAutomationDialogService, IShowAutomationDialogOptions } from '../../../../workbench/contrib/chat/common/automations/automationDialogService.js';
import { ICreateAutomationOptions, IUpdateAutomationOptions } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { IHostService } from '../../../../workbench/services/host/browser/host.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IAutomationSessionConfiguration } from '../../../services/sessions/common/sessionsProvider.js';
import { AutomationSessionConfigurationCapture, IFormState, IValidationState, isAutomationDialogPopupTarget, registerAutomationDialogKeyboardNavigation, renderForm, shouldPassThroughAutomationDialogCommand, updateSaveButtonState } from './automationDialog.js';

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
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@ILogService private readonly logService: ILogService,
		@IHostService private readonly hostService: IHostService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IWorkspaceTrustRequestService private readonly workspaceTrustRequestService: IWorkspaceTrustRequestService,
	) { }

	async showAutomationDialog(options: IShowAutomationDialogOptions): Promise<IAutomationDialogResult | undefined> {
		const disposables = new DisposableStore();

		const existing = options.existing;
		const initial = existing ?? options.initialValues;
		const isEdit = !!existing;
		const initialTarget = initial?.target;
		const initialWorkspaceTarget = initialTarget?.kind === 'workspace' ? initialTarget : undefined;
		const initialSessionConfiguration: IAutomationSessionConfiguration | undefined = initial ? {
			sessionTemplate: initial.sessionTemplate,
			modelId: initial.modelId,
			mode: initial.mode,
			permissionLevel: initial.permissionLevel,
		} : undefined;

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
		let getSessionConfiguration: (token: CancellationToken) => Promise<AutomationSessionConfigurationCapture> = async () => ({ kind: 'preserved', configuration: initialSessionConfiguration });
		let getBranch: () => string | undefined = () => initialWorkspaceTarget?.isolation.kind === 'worktree' ? initialWorkspaceTarget.isolation.branch : undefined;
		let waitForAutomationSessionSync: (token: CancellationToken) => Promise<void> = async () => { };
		let setSaving: (saving: boolean) => void = () => { };
		let showSessionConfigurationError: (message: string | undefined) => void = () => { };
		let focusSessionConfigurationError: () => void = () => { };
		let getFocusableElements: () => readonly HTMLElement[] = () => [];
		let focusFirst: () => void = () => { };
		let saveInProgress = false;
		const saveCancellation = disposables.add(new MutableDisposable<CancellationTokenSource>());
		const completion = new DeferredPromise<IAutomationDialogResult | undefined>();

		const title = isEdit
			? localize('automation.dialog.editTitle', "Edit automation")
			: localize('automation.dialog.createTitle', "New automation");

		const saveButtonLabel = isEdit ? localize('automation.dialog.save', "Save") : localize('automation.dialog.create', "Create");
		const cancelButtonLabel = localize('automation.dialog.cancel', "Cancel");
		const savingButtonLabel = localize('automation.dialog.saving', "Saving…");
		const captureErrorMessage = localize('automation.dialog.captureError', "The automation wasn't saved because its session configuration couldn't be captured. Check the provider connection and try again.");

		const buildResult = (sessionConfigurationCapture: Exclude<AutomationSessionConfigurationCapture, { readonly kind: 'failed' }>): IAutomationDialogResult | undefined => {
			const schedule: IAutomationSchedule = {
				interval: state.interval,
				scheduleHour: state.hour,
				scheduleMinute: state.minute,
				scheduleDay: state.day,
			};
			const prompt = getPrompt();
			const sessionConfiguration = sessionConfigurationCapture.configuration;
			const sessionTemplate = sessionConfiguration?.sessionTemplate;
			const target = createAutomationTarget(state, getBranch());
			if (!target) {
				return undefined;
			}
			if (existing) {
				const patch: IUpdateAutomationOptions = {
					name: state.name,
					prompt,
					schedule,
					target,
					...(sessionConfigurationCapture.kind === 'captured' ? {
						sessionTemplate: sessionTemplate ?? null,
					} : {}),
					enabled: state.enabled,
				};
				return { kind: 'update', id: existing.id, value: patch };
			}
			const create: ICreateAutomationOptions = {
				name: state.name,
				prompt,
				schedule,
				target,
				...(sessionTemplate
					? { sessionTemplate }
					: sessionConfiguration ? {
						...(sessionConfiguration.modelId !== undefined ? { modelId: sessionConfiguration.modelId } : {}),
						...(sessionConfiguration.mode !== undefined ? { mode: sessionConfiguration.mode } : {}),
						...(sessionConfiguration.permissionLevel !== undefined ? { permissionLevel: sessionConfiguration.permissionLevel } : {}),
					} : {}),
				enabled: state.enabled,
			};
			return { kind: 'create', value: create };
		};

		const closeDialog = (result: IAutomationDialogResult | undefined) => {
			if (completion.isSettled) {
				return;
			}
			saveCancellation.value?.cancel();
			void completion.complete(result);
			dialog.dispose();
		};

		const save = async () => {
			if (saveInProgress) {
				return;
			}
			revalidate();
			if (validation.nameError || validation.promptError || validation.folderError || validation.sessionTypeError || validation.branchError) {
				return;
			}
			if ((!state.isQuickChat && !state.folderUri) || !state.sessionTypeId || (state.isQuickChat && !state.providerId)) {
				return;
			}

			saveInProgress = true;
			showSessionConfigurationError(undefined);
			setSaving(true);
			if (saveButton) {
				saveButton.enabled = false;
				saveButton.label = savingButtonLabel;
			}
			cancelButton?.focus();
			const cancellation = new CancellationTokenSource();
			saveCancellation.value = cancellation;
			let shouldClose = false;
			let shouldFocusError = false;
			try {
				await waitForAutomationSessionSync(cancellation.token);
				const sessionConfigurationCapture = await getSessionConfiguration(cancellation.token);
				if (sessionConfigurationCapture.kind === 'failed') {
					showSessionConfigurationError(captureErrorMessage);
					shouldFocusError = true;
					return;
				}
				const result = buildResult(sessionConfigurationCapture);
				if (result) {
					shouldClose = true;
					closeDialog(result);
				}
			} catch (error) {
				if (!isCancellationError(error) && !cancellation.token.isCancellationRequested) {
					this.logService.error('[AutomationDialog] Failed to save the automation session configuration.', error);
					showSessionConfigurationError(captureErrorMessage);
					shouldFocusError = true;
				}
			} finally {
				if (saveCancellation.value === cancellation) {
					saveCancellation.clear();
				}
				saveInProgress = false;
				if (!shouldClose && !completion.isSettled) {
					setSaving(false);
					if (saveButton) {
						saveButton.label = saveButtonLabel;
					}
					revalidate();
					if (shouldFocusError) {
						focusSessionConfigurationError();
					}
				}
			}
		};

		const activeContainer = this.layoutService.activeContainer;
		const dialog = disposables.add(new Dialog(
			activeContainer,
			title,
			[],
			createWorkbenchDialogOptions({
				type: 'none',
				extraClasses: ['automation-dialog'],
				disableDefaultAction: true,
				isExternalFocusAllowed: isAutomationDialogPopupTarget,
				// textLinkForeground stamps inline styles onto chat input picker chips.
				dialogStyles: { ...defaultDialogStyles, textLinkForeground: undefined },
				renderFooter: container => {
					container.classList.add('dialog-buttons', 'automation-dialog-footer-actions');
					container.parentElement?.classList.add('dialog-buttons-row', 'automation-dialog-footer-row');
					const buttonBar = disposables.add(new ButtonBar(container));
					const createSaveButton = () => {
						saveButton = buttonBar.addButton(defaultButtonStyles);
						saveButton.label = saveButtonLabel;
						disposables.add(saveButton.onDidClick(() => void save()));
					};
					const createCancelButton = () => {
						cancelButton = buttonBar.addButton({ ...defaultButtonStyles, secondary: true });
						cancelButton.label = cancelButtonLabel;
						disposables.add(cancelButton.onDidClick(() => closeDialog(undefined)));
					};
					if (isWindows) {
						createSaveButton();
						createCancelButton();
					} else {
						createCancelButton();
						createSaveButton();
					}
				},
				renderBody: container => {
					container.classList.add('automation-dialog-body');

					const titlebar = DOM.append(container, $('.automation-titlebar'));
					titlebar.setAttribute('aria-hidden', 'true');
					titlebar.textContent = title;

					const description = DOM.append(container, $('.automation-description'));
					description.textContent = isEdit
						? localize('automation.dialog.editDescription', "Update the schedule, prompt, or run target for this automation.")
						: localize('automation.dialog.createDescription', "Define a prompt that will run on a schedule against the selected target.");

					const formPane = DOM.append(container, $('.automation-form-pane'));
					const form = DOM.append(formPane, $('.automation-form'));
					const handle = renderForm(form, state, disposables, validation, () => revalidate(), this.instantiationService, this.contextKeyService, this.contextViewService, this.configurationService, this.layoutService, this.logService, this.sessionsManagementService, this.workspaceTrustRequestService, initial?.prompt ?? '', initialTarget, initialSessionConfiguration);
					getPrompt = handle.getPrompt;
					getSessionConfiguration = handle.getSessionConfiguration;
					getBranch = handle.getBranch;
					waitForAutomationSessionSync = handle.waitForAutomationSessionSync;
					setSaving = handle.setSaving;
					showSessionConfigurationError = handle.showSessionConfigurationError;
					focusSessionConfigurationError = handle.focusSessionConfigurationError;
					getFocusableElements = handle.getFocusableElements;
					const keyboardNavigation = disposables.add(registerAutomationDialogKeyboardNavigation(
						DOM.getWindow(container),
						() => [
							...getFocusableElements(),
							...(saveButton ? [saveButton.element] : []),
							...(cancelButton ? [cancelButton.element] : []),
						],
						isAutomationDialogPopupTarget,
						handle.acceptPromptSuggestion,
					));
					focusFirst = keyboardNavigation.focusFirst;
					revalidate = () => {
						updateSaveButtonState(saveButton, state, validation, form, getPrompt, getBranch);
						if (saveInProgress && saveButton) {
							saveButton.enabled = false;
						}
					};
					revalidate();
				},
			}, this.keybindingService, this.layoutService, this.hostService, automationDialogAllowableCommands,
				(commandId, event) => shouldPassThroughAutomationDialogCommand(commandId, event.target)),
		));

		activeContainer.classList.add('automation-dialog-open');
		disposables.add(toDisposable(() => activeContainer.classList.remove('automation-dialog-open')));

		try {
			void dialog.show().then(() => closeDialog(undefined));
			focusFirst();
			return await completion.p;
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
