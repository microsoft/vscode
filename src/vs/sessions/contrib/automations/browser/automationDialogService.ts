/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/automationDialog.css';
import * as DOM from '../../../../base/browser/dom.js';
import { ButtonBar, IButton } from '../../../../base/browser/ui/button/button.js';
import { Dialog } from '../../../../base/browser/ui/dialog/dialog.js';
import { ProgressBar } from '../../../../base/browser/ui/progressbar/progressbar.js';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { getErrorMessage, isCancellationError } from '../../../../base/common/errors.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { isWindows } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { defaultButtonStyles, defaultDialogStyles, defaultProgressBarStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { createWorkbenchDialogOptions } from '../../../../workbench/browser/parts/dialogs/dialog.js';
import { IAutomationSchedule } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { automationScheduleToLocal, automationScheduleToUTC } from '../../../../workbench/contrib/chat/common/automations/schedule.js';
import { IAutomationDialogResult, IAutomationDialogService, IShowAutomationDialogOptions } from '../../../../workbench/contrib/chat/common/automations/automationDialogService.js';
import { IAutomationService, ICreateAutomationOptions, IUpdateAutomationOptions } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { IHostService } from '../../../../workbench/services/host/browser/host.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IAutomationSessionConfiguration } from '../../../services/sessions/common/sessionsProvider.js';
import { AutomationSessionConfigurationCapture, createAutomationTarget, getAutomationDialogProviders, IFormState, IValidationState, isAutomationDialogPopupTarget, registerAutomationDialogKeyboardNavigation, renderForm, shouldPassThroughAutomationDialogCommand, updateSaveButtonState } from './automationDialog.js';
import { AutomationDialogTelemetry } from './automationTelemetry.js';

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
	'workbench.action.closeQuickOpen',
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
		@IAutomationService private readonly automationService: IAutomationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@INotificationService private readonly notificationService: INotificationService,
		@IHoverService private readonly hoverService: IHoverService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
	) { }

	async showAutomationDialog(options: IShowAutomationDialogOptions): Promise<IAutomationDialogResult | undefined> {
		const disposables = new DisposableStore();

		const existing = options.existing;
		const allowedProviders = getAutomationDialogProviders(this.automationService, existing);
		const initial = existing ?? options.initialValues;
		const timezoneOffset = new Date().getTimezoneOffset();
		const initialSchedule = initial && automationScheduleToLocal(initial.schedule, timezoneOffset);
		const isEdit = !!existing;
		const dialogTelemetry = new AutomationDialogTelemetry(this.telemetryService, isEdit ? 'update' : 'create');
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
			interval: initialSchedule?.interval ?? 'daily',
			hour: initialSchedule?.scheduleHour ?? 9,
			minute: initialSchedule?.scheduleMinute ?? 0,
			day: initialSchedule?.scheduleDay ?? 1,
			isQuickChat: initialTarget === undefined || initialTarget.kind === 'quickChat',
			folderUri: initialWorkspaceTarget?.folderUri,
			providerId: initialTarget?.providerId,
			sessionTypeId: initialTarget?.sessionTypeId,
			isolationMode: initialWorkspaceTarget?.isolation.kind === 'default'
				? undefined
				: initialWorkspaceTarget?.isolation.kind === 'worktree' ? 'worktree' : 'workspace',
			branch: initialWorkspaceTarget?.isolation.kind === 'worktree' ? initialWorkspaceTarget.isolation.branch : undefined,
			enabled: initial?.enabled ?? true,
			timeZone: initial?.schedule.timeZone,
			timezoneOffset,
		};

		const validation: IValidationState = { nameError: undefined, promptError: undefined, folderError: undefined, sessionTypeError: undefined, branchError: undefined };

		let saveButton: IButton | undefined;
		let cancelButton: IButton | undefined;
		let revalidate: () => void = () => { };
		let getPrompt: () => string = () => initial?.prompt ?? '';
		let getSessionConfiguration: (token: CancellationToken) => Promise<AutomationSessionConfigurationCapture> = async () => ({ kind: 'preserved', configuration: initialSessionConfiguration });
		let getBranch: () => string | undefined = () => initialWorkspaceTarget?.isolation.kind === 'worktree' ? initialWorkspaceTarget.isolation.branch : undefined;
		let waitForAutomationSessionSync: (token: CancellationToken) => Promise<void> = async () => { };
		let setSaving: (saving: boolean, committing?: boolean) => void = () => { };
		let getCustomizationIds: () => readonly string[] | undefined = () => undefined;
		let waitForCustomizationChoices: (token: CancellationToken) => Promise<void> = async () => { };
		let progressBar: ProgressBar | undefined;
		let dialogElement: HTMLElement | undefined;
		let footerNote: HTMLElement | undefined;
		let closeToolbar: HTMLElement | undefined;
		let commitInProgress = false;
		let showSaveError: (message: string | undefined) => void = () => { };
		let focusSaveError: () => void = () => { };
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
			const localSchedule: IAutomationSchedule = {
				interval: state.interval,
				scheduleHour: state.hour,
				scheduleMinute: state.minute,
				scheduleDay: state.day,
			};
			const schedule = state.timeZone === 'UTC' ? automationScheduleToUTC(localSchedule, timezoneOffset) : localSchedule;
			const prompt = getPrompt();
			const sessionConfiguration = sessionConfigurationCapture.configuration;
			const sessionTemplate = sessionConfiguration?.sessionTemplate;
			const target = createAutomationTarget(state, getBranch());
			const customizationIds = getCustomizationIds();
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
					...(customizationIds !== undefined ? { customizationIds } : {}),
				};
				return { kind: 'update', id: existing.id, value: patch };
			}
			const create: ICreateAutomationOptions = {
				name: state.name.trim() ? state.name : deriveAutomationName(prompt),
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
				...(customizationIds !== undefined ? { customizationIds } : {}),
			};
			return { kind: 'create', value: create };
		};

		const closeDialog = (result: IAutomationDialogResult | undefined) => {
			if (completion.isSettled || (commitInProgress && result === undefined)) {
				return;
			}
			dialogTelemetry.complete(result !== undefined);
			saveCancellation.value?.cancel();
			void completion.complete(result);
			dialog.dispose();
		};

		const save = async () => {
			if (saveInProgress) {
				return;
			}
			revalidate();
			if (state.targetPending) {
				return;
			}
			if (validation.nameError || validation.promptError || validation.folderError || validation.sessionTypeError || validation.branchError || validation.scheduleError) {
				dialogTelemetry.validationFailed();
				return;
			}
			if ((!state.isQuickChat && !state.folderUri) || !state.sessionTypeId || (state.isQuickChat && !state.providerId)) {
				dialogTelemetry.validationFailed();
				return;
			}

			saveInProgress = true;
			showSaveError(undefined);
			setSaving(true);
			progressBar?.infinite().show();
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
				await waitForCustomizationChoices(cancellation.token);
				const sessionConfigurationCapture = await getSessionConfiguration(cancellation.token);
				if (sessionConfigurationCapture.kind === 'failed') {
					dialogTelemetry.captureFailed();
					showSaveError(captureErrorMessage);
					shouldFocusError = true;
					return;
				}
				revalidate();
				if (state.targetPending || validation.sessionTypeError || validation.scheduleError) {
					return;
				}
				const result = buildResult(sessionConfigurationCapture);
				if (result) {
					if (options.commit) {
						commitInProgress = true;
						setSaving(true, true);
						if (cancelButton) {
							cancelButton.enabled = false;
						}
						dialogElement?.classList.add('committing');
						closeToolbar?.setAttribute('inert', '');
						dialogElement?.focus();
						await options.commit(result);
						commitInProgress = false;
					}
					shouldClose = true;
					closeDialog(result);
				}
			} catch (error) {
				if (commitInProgress || (!isCancellationError(error) && !cancellation.token.isCancellationRequested)) {
					this.logService.error('[AutomationDialog] Failed to save automation.', error);
					if (!commitInProgress) {
						dialogTelemetry.captureFailed();
					}
					showSaveError(commitInProgress ? getErrorMessage(error) : captureErrorMessage);
					shouldFocusError = true;
				}
			} finally {
				if (saveCancellation.value === cancellation) {
					saveCancellation.clear();
				}
				saveInProgress = false;
				commitInProgress = false;
				if (!shouldClose && !completion.isSettled) {
					dialogElement?.classList.remove('committing');
					closeToolbar?.removeAttribute('inert');
					if (cancelButton) {
						cancelButton.enabled = true;
					}
					progressBar?.stop().hide();
					setSaving(false);
					if (saveButton) {
						saveButton.label = saveButtonLabel;
					}
					revalidate();
					if (shouldFocusError) {
						focusSaveError();
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
					footerNote = $('p.automation-dialog-footer-note', { id: 'automation-dialog-footer-note' });
					container.before(footerNote);
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
					dialogElement = container.closest<HTMLElement>('.monaco-dialog-box') ?? undefined;
					const progressHost = DOM.append(container, $('.automation-dialog-progress'));
					progressBar = disposables.add(new ProgressBar(progressHost, defaultProgressBarStyles));
					progressBar.hide();

					const titlebar = DOM.append(container, $('.automation-titlebar'));
					titlebar.setAttribute('aria-hidden', 'true');
					titlebar.textContent = title;

					const description = DOM.append(container, $('.automation-description'));
					description.textContent = isEdit
						? localize('automation.dialog.editDescription', "Update the schedule, prompt, or run target for this automation.")
						: localize('automation.dialog.createDescription', "Define a prompt that will run on a schedule against the selected target.");

					const formPane = DOM.append(container, $('.automation-form-pane'));
					const form = DOM.append(formPane, $('.automation-form'));
					const handle = renderForm(form, state, disposables, validation, () => revalidate(), this.instantiationService, this.contextKeyService, this.contextViewService, this.configurationService, this.layoutService, this.logService, this.sessionsManagementService, this.workspaceTrustRequestService, initial?.prompt ?? '', initialTarget, initialSessionConfiguration, allowedProviders, providerId => this.automationService.getProviderConfiguration?.(providerId), isEdit, { service: this.automationService, hoverService: this.hoverService, existingId: existing?.id }, error => this.notificationService.error(error), this.quickInputService);
					disposables.add(autorun(reader => {
						const description = handle.providerDescription.read(reader);
						if (!footerNote) {
							return;
						}
						footerNote.textContent = description ?? '';
						footerNote.style.display = description ? '' : 'none';
						if (description) {
							saveButton?.element.setAttribute('aria-describedby', footerNote.id);
						} else {
							saveButton?.element.removeAttribute('aria-describedby');
						}
					}));
					getPrompt = handle.getPrompt;
					getSessionConfiguration = handle.getSessionConfiguration;
					getBranch = handle.getBranch;
					waitForAutomationSessionSync = handle.waitForAutomationSessionSync;
					setSaving = handle.setSaving;
					getCustomizationIds = handle.getCustomizationIds;
					waitForCustomizationChoices = handle.waitForCustomizationChoices;
					showSaveError = handle.showSaveError;
					focusSaveError = handle.focusSaveError;
					getFocusableElements = handle.getFocusableElements;
					const keyboardNavigation = disposables.add(registerAutomationDialogKeyboardNavigation(
						DOM.getWindow(container),
						() => [
							...getFocusableElements(),
							...(saveButton ? [saveButton.element] : []),
							...(cancelButton ? [cancelButton.element] : []),
						],
						isAutomationDialogPopupTarget,
						() => !saveInProgress && handle.acceptPromptSuggestion(),
						() => !saveInProgress && handle.cancelPromptSuggestion(),
					));
					focusFirst = keyboardNavigation.focusFirst;
					for (const type of [DOM.EventType.KEY_DOWN, DOM.EventType.KEY_UP]) {
						disposables.add(DOM.addDisposableListener(DOM.getWindow(container), type, (event: KeyboardEvent) => {
							if (commitInProgress && event.key === 'Escape') {
								DOM.EventHelper.stop(event, true);
								event.stopImmediatePropagation();
							}
						}, true));
					}
					disposables.add(DOM.addDisposableListener(activeContainer, DOM.EventType.CLICK, (event: MouseEvent) => {
						if (commitInProgress && DOM.isHTMLElement(event.target) && closeToolbar?.contains(event.target)) {
							DOM.EventHelper.stop(event, true);
							event.stopImmediatePropagation();
						}
					}, true));
					revalidate = () => {
						const providerAvailable = state.providerId !== undefined && allowedProviders.get().includes(state.providerId);
						updateSaveButtonState(saveButton, state, validation, form, getPrompt, getBranch, this.sessionsManagementService, providerAvailable, existing?.target.providerId, isEdit);
						handle.showTargetValidationError(validation.sessionTypeError);
						handle.showScheduleValidationError(validation.scheduleError);
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
			// eslint-disable-next-line no-restricted-syntax -- Dialog owns its close toolbar and exposes no enablement API.
			closeToolbar = dialogElement?.querySelector<HTMLElement>('.dialog-toolbar') ?? undefined;
			focusFirst();
			return await completion.p;
		} finally {
			disposables.dispose();
		}
	}
}

function deriveAutomationName(prompt: string): string {
	const text = prompt.trim().replace(/\s+/g, ' ');
	const maxLength = 50;
	const characters = Array.from(text);
	if (characters.length <= maxLength) {
		return text;
	}
	const prefix = characters.slice(0, maxLength).join('');
	const wordBoundary = text.lastIndexOf(' ', prefix.length);
	return wordBoundary > 0 ? text.slice(0, wordBoundary) : prefix;
}
