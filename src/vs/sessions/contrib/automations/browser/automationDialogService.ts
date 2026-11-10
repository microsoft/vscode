/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/automationDialog.css';
import * as DOM from '../../../../base/browser/dom.js';
import { Button, ButtonBar, IButton } from '../../../../base/browser/ui/button/button.js';
import { Dialog } from '../../../../base/browser/ui/dialog/dialog.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ProgressBar } from '../../../../base/browser/ui/progressbar/progressbar.js';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { getErrorMessage, isCancellationError } from '../../../../base/common/errors.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../base/common/observable.js';
import { isWindows } from '../../../../base/common/platform.js';
import { isEqual, joinPath } from '../../../../base/common/resources.js';
import { equals } from '../../../../base/common/objects.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { defaultButtonStyles, defaultDialogStyles, defaultProgressBarStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { createWorkbenchDialogOptions } from '../../../../workbench/browser/parts/dialogs/dialog.js';
import { IAutomationSchedule } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { automationScheduleToLocal, automationScheduleToUTC } from '../../../../workbench/contrib/chat/common/automations/schedule.js';
import { IAutomationDialogResult, IAutomationDialogService, IShowAutomationDialogOptions } from '../../../../workbench/contrib/chat/common/automations/automationDialogService.js';
import { AutomationRepositoryOwnershipUnavailableError, IAutomationService, ICreateAutomationOptions, IUpdateAutomationOptions } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { PromptFileVariableKind, toPromptFileVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IPromptsService, PromptsStorage } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { IHostService } from '../../../../workbench/services/host/browser/host.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { ISessionsManagementService, ICreateNewSessionOptions } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { IChatViewFactory } from '../../../../workbench/contrib/sessions/browser/chatViewFactory.js';
import { IAutomationSessionConfiguration } from '../../../../workbench/contrib/sessions/common/sessionsProvider.js';
import { ISessionsService } from '../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { ISession } from '../../../../workbench/services/sessions/common/session.js';
import { AutomationDialogMessageSource, AutomationSessionConfigurationCapture, createAutomationTarget, getAutomationDialogProviders, IAutomationDialogMessage, IFormState, IValidationState, isAutomationDialogPopupTarget, registerAutomationDialogKeyboardNavigation, renderForm, shouldPassThroughAutomationDialogCommand, updateSaveButtonState } from './automationDialog.js';
import { AutomationDialogTelemetry } from './automationTelemetry.js';
import { BUILTIN_SKILLS_URI } from '../../chat/browser/promptsService.js';

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
		@IHoverService private readonly hoverService: IHoverService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IChatViewFactory private readonly chatViewFactory: IChatViewFactory,
		@IPromptsService private readonly promptsService: IPromptsService,
		@ISessionsService private readonly sessionsService: ISessionsService,
	) { }

	async showAutomationDialog(options: IShowAutomationDialogOptions): Promise<IAutomationDialogResult | undefined> {
		const disposables = new DisposableStore();

		const existing = options.existing;
		const allowedProviders = getAutomationDialogProviders(this.automationService, existing);
		const initial = existing ?? options.initialValues;
		const timezoneOffset = new Date().getTimezoneOffset();
		const initialSchedule = initial && automationScheduleToLocal(initial.schedule, timezoneOffset);
		const isEdit = !!existing;
		const manualMode = observableValue(this, isEdit || options.initialValues !== undefined);
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
			ownership: initial?.ownership ?? 'user',
			interval: initialSchedule?.interval ?? 'daily',
			cronExpression: initialSchedule?.cronExpression ?? '',
			cronTimeZone: initialSchedule?.cronTimeZone,
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
			cloudTrigger: existing?.schedule.interval === 'custom' ? existing.cloudTrigger : undefined,
			initialActorWritePermission: existing?.cloudTrigger?.requireActorWritePermission,
			triggerExternalResource: existing?.externalResource,
		};

		const validation: IValidationState = { nameError: undefined, promptError: undefined, folderError: undefined, sessionTypeError: undefined, branchError: undefined };

		let saveButton: IButton | undefined;
		let cancelButton: IButton | undefined;
		let createWithAgentButton: IButton | undefined;
		let authoringSession: ISession | undefined;
		let revalidate: () => void = () => { };
		let getPrompt: () => string = () => initial?.prompt ?? '';
		let getSessionConfiguration: (token: CancellationToken) => Promise<AutomationSessionConfigurationCapture> = async () => ({ kind: 'preserved', configuration: initialSessionConfiguration });
		let getBranch: () => string | undefined = () => initialWorkspaceTarget?.isolation.kind === 'worktree' ? initialWorkspaceTarget.isolation.branch : undefined;
		let waitForAutomationSessionSync: (token: CancellationToken) => Promise<void> = async () => { };
		let setSaving: (saving: boolean, committing?: boolean) => void = () => { };
		let setManualMode: (manual: boolean) => void = () => { };
		let setOwnership: (ownership: IFormState['ownership']) => void = () => { };
		let getCustomizationIds: () => readonly string[] | undefined = () => undefined;
		let waitForCustomizationChoices: (token: CancellationToken) => Promise<void> = async () => { };
		let progressBar: ProgressBar | undefined;
		let dialogElement: HTMLElement | undefined;
		let closeToolbar: HTMLElement | undefined;
		let commitInProgress = false;
		let showSaveError: (message: string | undefined) => void = () => { };
		let focusSaveError: () => void = () => { };
		let getFocusableElements: () => readonly HTMLElement[] = () => [];
		let focusFirst: () => void = () => { };
		let setRepositoryWarningVisible: (visible: boolean) => void = () => { };
		const dialogMessages = new Map<AutomationDialogMessageSource, IAutomationDialogMessage>();
		let notificationCenter: HTMLElement | undefined;
		let notificationIcon: HTMLElement | undefined;
		let notificationText: HTMLElement | undefined;
		let notificationAction: Button | undefined;
		let activeNotificationAction: IAutomationDialogMessage['action'];
		let renderedNotification: { readonly source: AutomationDialogMessageSource; readonly severity: IAutomationDialogMessage['severity']; readonly text: string; readonly actionLabel: string | undefined } | undefined;
		const messagePriority: readonly AutomationDialogMessageSource[] = ['operationError', 'saveError', 'targetValidation', 'scheduleValidation', 'toolCatalogError', 'immutableSettings', 'repositoryWarning'];
		const updateNotificationCenter = () => {
			const candidate = messagePriority
				.filter(source => manualMode.get() || source === 'operationError' || source === 'saveError' || source === 'targetValidation')
				.map(source => ({ source, message: dialogMessages.get(source) }))
				.find(candidate => candidate.message !== undefined);
			const message = candidate?.message;
			if (!notificationCenter || !notificationIcon || !notificationText) {
				return;
			}
			activeNotificationAction = message?.action;
			const next = candidate && message ? { source: candidate.source, severity: message.severity, text: message.text, actionLabel: message.action?.label } : undefined;
			if (renderedNotification?.source === next?.source
				&& renderedNotification?.severity === next?.severity
				&& renderedNotification?.text === next?.text
				&& renderedNotification?.actionLabel === next?.actionLabel) {
				return;
			}
			renderedNotification = next;
			if (message) {
				DOM.show(notificationCenter);
				notificationCenter.setAttribute('aria-hidden', 'false');
			} else {
				DOM.hide(notificationCenter);
				notificationCenter.setAttribute('aria-hidden', 'true');
			}
			notificationCenter.classList.toggle('error', message?.severity === 'error');
			notificationCenter.classList.toggle('warning', message?.severity === 'warning');
			notificationCenter.classList.toggle('info', message?.severity === 'info');
			if (notificationAction) {
				notificationAction.label = message?.action?.label ?? '';
				DOM.setVisibility(!!message?.action, notificationAction.element);
			}
			if (!message) {
				return;
			}
			notificationCenter.setAttribute('role', message.severity === 'error' ? 'alert' : 'status');
			DOM.clearNode(notificationIcon);
			DOM.append(notificationIcon, renderIcon(message.severity === 'error' ? Codicon.error : message.severity === 'warning' ? Codicon.warning : Codicon.info)).setAttribute('aria-hidden', 'true');
			notificationText.textContent = message.text;
		};
		const setDialogMessage = (source: AutomationDialogMessageSource, message: IAutomationDialogMessage | undefined) => {
			if (message) {
				dialogMessages.set(source, message);
			} else {
				dialogMessages.delete(source);
			}
			updateNotificationCenter();
		};
		let saveInProgress = false;
		const saveCancellation = disposables.add(new MutableDisposable<CancellationTokenSource>());
		const completion = new DeferredPromise<IAutomationDialogResult | undefined>();

		const title = isEdit
			? localize('automation.dialog.editTitle', "Edit automation")
			: localize('automation.dialog.createTitle', "New automation");

		const saveButtonLabel = isEdit ? localize('automation.dialog.save', "Save") : localize('automation.dialog.create', "Create");
		const startSessionButtonLabel = localize('automation.dialog.startSession', "Start session");
		const cancelButtonLabel = localize('automation.dialog.cancel', "Cancel");
		const savingButtonLabel = localize('automation.dialog.saving', "Saving…");
		const captureErrorMessage = localize('automation.dialog.captureError', "The automation wasn't saved because its session configuration couldn't be captured. Check the provider connection and try again.");
		const buildResult = (sessionConfigurationCapture: Exclude<AutomationSessionConfigurationCapture, { readonly kind: 'failed' }>): IAutomationDialogResult | undefined => {
			const localSchedule: IAutomationSchedule = {
				interval: state.interval,
				scheduleHour: state.hour,
				scheduleMinute: state.minute,
				scheduleDay: state.day,
				...(state.interval === 'cron' ? { cronExpression: state.cronExpression, cronTimeZone: state.cronTimeZone } : {}),
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
					...(!state.cloudTrigger && (existing.schedule.timeZone !== 'UTC' || state.interval !== initialSchedule?.interval || state.hour !== initialSchedule?.scheduleHour
						|| state.minute !== initialSchedule?.scheduleMinute || state.day !== initialSchedule?.scheduleDay) ? { schedule } : {}),
					...(state.cloudTrigger && !state.triggerReadOnly && !equals(state.cloudTrigger, existing.cloudTrigger) ? { cloudTrigger: state.cloudTrigger } : {}),
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
				...(this.automationService.getProviderConfiguration?.(state.providerId) && state.ownership === 'repository' ? { ownership: state.ownership } : {}),
				name: state.name.trim() ? state.name : deriveAutomationName(prompt),
				prompt,
				schedule,
				...(state.timeZone === 'UTC' && state.cloudTrigger ? { cloudTrigger: state.cloudTrigger } : {}),
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
			if (authoringSession) {
				dialogTelemetry.sessionStarted();
			} else {
				dialogTelemetry.complete(result !== undefined);
			}
			saveCancellation.value?.cancel();
			void completion.complete(result);
			dialog.dispose();
		};

		const save = async () => {
			if (saveInProgress) {
				return;
			}
			const manual = manualMode.get();
			if (!manual && (!getPrompt().trim() || this.configurationService.getValue<boolean>('chat.disableAIFeatures'))) {
				return;
			}
			revalidate();
			if (state.targetPending) {
				return;
			}
			if (validation.promptError || validation.folderError || validation.sessionTypeError || validation.branchError || manual && (validation.nameError || validation.scheduleError || validation.cronError
				|| state.interval === 'cron' && !state.cronExpression?.trim())) {
				dialogTelemetry.validationFailed();
				return;
			}
			if ((manual && !state.isQuickChat && !state.folderUri) || !state.sessionTypeId || !state.providerId) {
				dialogTelemetry.validationFailed();
				return;
			}

			saveInProgress = true;
			setDialogMessage('operationError', undefined);
			showSaveError(undefined);
			setSaving(true);
			progressBar?.infinite().show();
			if (saveButton) {
				saveButton.enabled = false;
				saveButton.label = manual ? savingButtonLabel : localize('automation.dialog.startingSession', "Starting session…");
			}
			if (createWithAgentButton) {
				createWithAgentButton.enabled = false;
			}
			cancelButton?.focus();
			const cancellation = new CancellationTokenSource();
			saveCancellation.value = cancellation;
			let shouldClose = false;
			let shouldFocusError = false;
			try {
				await waitForAutomationSessionSync(cancellation.token);
				if (manual) {
					await waitForCustomizationChoices(cancellation.token);
				}
				const sessionConfigurationCapture = await getSessionConfiguration(cancellation.token);
				if (sessionConfigurationCapture.kind === 'failed') {
					dialogTelemetry.captureFailed();
					showSaveError(manual ? captureErrorMessage : localize('automation.dialog.sessionCaptureError', "The session wasn't started because its configuration couldn't be captured. Check the provider connection and try again."));
					shouldFocusError = true;
					return;
				}
				revalidate();
				if (state.targetPending || validation.sessionTypeError || manual && validation.scheduleError) {
					return;
				}
				if (!manual) {
					const skillUri = joinPath(BUILTIN_SKILLS_URI, 'automate', 'SKILL.md');
					const skills = await this.promptsService.findAgentSkills(cancellation.token);
					const skill = skills && (await this.promptsService.listPromptFilesForStorage(PromptsType.skill, PromptsStorage.builtIn, cancellation.token)).find(skill =>
						skill.name === 'automate' && skill.storage === PromptsStorage.builtIn && isEqual(skill.uri, skillUri));
					if (!skill || this.promptsService.getDisabledPromptFiles(PromptsType.skill).has(skill.uri)) {
						throw new Error(localize('automation.dialog.skillUnavailable', "The built-in /automate skill is unavailable or disabled. Enable it before starting the walkthrough."));
					}
					if (cancellation.token.isCancellationRequested || this.configurationService.getValue<boolean>('chat.disableAIFeatures')) {
						return;
					}
					if (!state.providerId || !state.sessionTypeId) {
						throw new Error(localize('automation.dialog.sessionTargetMissing', "Choose an available target before starting the session."));
					}
					const goal = getPrompt().replace(/^\s*\/automate(?=\s|$)\s*/, '');
					const request = {
						query: localize('automation.dialog.authoringPrompt', "Follow only the attached automate SKILL.md to help me create an automation.\n\n{0}", goal),
						attachedContext: [toPromptFileVariableEntry(skillUri, PromptFileVariableKind.PromptFile)],
					};
					const createOptions: ICreateNewSessionOptions = {
						providerId: state.providerId,
						sessionTypeId: state.sessionTypeId,
						...(sessionConfigurationCapture.configuration ? { automationConfiguration: sessionConfigurationCapture.configuration } : {}),
					};
					const session = await this.sessionsManagementService.createAndSendQuickChatRequest(request, createOptions, cancellation.token);
					if (!session) {
						throw new Error(localize('automation.dialog.sessionUnconfirmed', "The provider did not confirm the new session. Check your sessions before retrying."));
					}
					authoringSession = session;
					shouldClose = true;
					closeDialog(undefined);
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
						if (manual) {
							dialogTelemetry.captureFailed();
						} else {
							dialogTelemetry.sessionStartFailed();
						}
					}
					const message = commitInProgress || !manual ? getErrorMessage(error) : captureErrorMessage;
					if (!isEdit && state.ownership === 'repository' && error instanceof AutomationRepositoryOwnershipUnavailableError) {
						setOwnership('user');
					}
					showSaveError(message);
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
						saveButton.label = manual ? saveButtonLabel : startSessionButtonLabel;
					}
					if (createWithAgentButton) {
						createWithAgentButton.enabled = true;
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
					if (!isEdit) {
						createWithAgentButton = disposables.add(new Button(container, { ...defaultButtonStyles, secondary: true }));
						createWithAgentButton.element.classList.add('automation-dialog-mode-switch');
						disposables.add(createWithAgentButton.onDidClick(() => {
							if (saveInProgress || completion.isSettled) {
								return;
							}
							setManualMode(!manualMode.get());
							focusFirst();
						}));
					}
					notificationCenter = DOM.append(container, $('.automation-dialog-notification-center', {
						id: 'automation-dialog-notification-center',
						'aria-live': 'polite',
						'aria-atomic': 'true',
						tabindex: '-1',
					}));
					notificationIcon = DOM.append(notificationCenter, $('span.automation-dialog-notification-icon'));
					notificationText = DOM.append(notificationCenter, $('span.automation-dialog-notification-text'));
					notificationAction = disposables.add(new Button(notificationCenter, { ...defaultButtonStyles, secondary: true }));
					disposables.add(notificationAction.onDidClick(() => activeNotificationAction?.run()));
					disposables.add(DOM.addDisposableListener(notificationCenter, DOM.EventType.MOUSE_DOWN, event => {
						if (!notificationAction?.element.contains(event.target as Node)) {
							event.preventDefault();
						}
					}));
					DOM.hide(notificationAction.element);
					DOM.hide(notificationCenter);
					if (!isEdit || state.ownership === 'repository') {
						const repositoryWarning = isEdit
							? localize('automation.owner.repositoryEditWarning', "This automation is visible to everyone with repository access, and can be edited by anyone with write access.")
							: localize('automation.owner.repositoryCreateWarning', "This automation will be visible to everyone with repository access, and can be edited by anyone with write access.");
						setRepositoryWarningVisible = visible => {
							setDialogMessage('repositoryWarning', visible ? { severity: 'warning', text: repositoryWarning } : undefined);
						};
						setRepositoryWarningVisible(state.ownership === 'repository');
					}
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
					disposables.add(autorun(reader => {
						const manual = manualMode.read(reader);
						if (createWithAgentButton) {
							createWithAgentButton.label = manual
								? localize('automation.dialog.createWithAgent', "Create with agent")
								: localize('automation.dialog.createManually', "Create manually");
							createWithAgentButton.element.classList.toggle('automation-dialog-create-with-agent', manual);
							createWithAgentButton.element.classList.toggle('automation-dialog-create-manually', !manual);
						}
						if (saveButton) {
							saveButton.label = manual ? saveButtonLabel : startSessionButtonLabel;
						}
						updateNotificationCenter();
						revalidate();
					}));
				},
				renderBody: container => {
					container.classList.add('automation-dialog-body');
					dialogElement = container.closest<HTMLElement>('.monaco-dialog-box') ?? undefined;
					const dialogContextKeyService = disposables.add(this.contextKeyService.createScoped(dialogElement ?? container));
					ChatContextKeys.inAutomationsDialog.bindTo(dialogContextKeyService).set(true);
					const progressHost = DOM.append(container, $('.automation-dialog-progress'));
					progressBar = disposables.add(new ProgressBar(progressHost, defaultProgressBarStyles));
					progressBar.hide();

					const titlebar = DOM.append(container, $('.automation-titlebar'));
					titlebar.setAttribute('aria-hidden', 'true');
					titlebar.textContent = title;

					const scrollable = DOM.append(container, $('.automation-dialog-scrollable'));
					const formPane = DOM.append(scrollable, $('.automation-form-pane'));
					const description = DOM.append(formPane, $('p.automation-description.automation-creation-guidance'));
					description.textContent = localize('automation.dialog.creationGuidance', "Describe your idea and let an agent guide the setup, or choose Create manually to fill in the details.");
					disposables.add(autorun(reader => {
						description.hidden = manualMode.read(reader);
					}));
					const form = DOM.append(formPane, $('.automation-form'));
					const handle = renderForm(form, state, disposables, validation, () => revalidate(), this.instantiationService, dialogContextKeyService, this.contextViewService, this.configurationService, this.layoutService, this.logService, this.sessionsManagementService, this.workspaceTrustRequestService, initial?.prompt ?? '', initialTarget, initialSessionConfiguration, allowedProviders, providerId => this.automationService.getProviderConfiguration?.(providerId), isEdit, { service: this.automationService, hoverService: this.hoverService, existingId: existing?.id }, error => setDialogMessage('operationError', { severity: 'error', text: getErrorMessage(error) }), this.quickInputService, setRepositoryWarningVisible, setDialogMessage, () => notificationCenter?.focus(), this.chatViewFactory.inputEditorOptions, manualMode);
					setManualMode = handle.setManualMode;
					getPrompt = handle.getPrompt;
					getSessionConfiguration = handle.getSessionConfiguration;
					getBranch = handle.getBranch;
					waitForAutomationSessionSync = handle.waitForAutomationSessionSync;
					setSaving = handle.setSaving;
					setOwnership = handle.setOwnership;
					getCustomizationIds = handle.getCustomizationIds;
					waitForCustomizationChoices = handle.waitForCustomizationChoices;
					showSaveError = handle.showSaveError;
					focusSaveError = handle.focusSaveError;
					getFocusableElements = handle.getFocusableElements;
					const keyboardNavigation = disposables.add(registerAutomationDialogKeyboardNavigation(
						DOM.getWindow(container),
						() => [
							...getFocusableElements(),
							...(createWithAgentButton ? [createWithAgentButton.element] : []),
							...(notificationAction ? [notificationAction.element] : []),
							...(saveButton ? [saveButton.element] : []),
							...(cancelButton ? [cancelButton.element] : []),
						],
						isAutomationDialogPopupTarget,
						() => !saveInProgress && handle.acceptPromptSuggestion(),
						() => !saveInProgress && handle.cancelInputPopup(),
					));
					focusFirst = () => manualMode.get() ? keyboardNavigation.focusFirst() : handle.focusPrompt();
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
					const saveBlockedHover = disposables.add(new MutableDisposable());
					let saveBlockedMessage: string | undefined;
					revalidate = () => {
						const manual = manualMode.get();
						const providerAvailable = state.providerId !== undefined && allowedProviders.get().includes(state.providerId);
						const targetState = manual ? state : { ...state, isQuickChat: true, folderUri: undefined, isolationMode: undefined, branch: undefined };
						updateSaveButtonState(saveButton, targetState, validation, form, getPrompt, getBranch, this.sessionsManagementService, providerAvailable, existing?.target.providerId, isEdit);
						if (saveButton && !manual) {
							saveButton.enabled = !validation.promptError && !validation.folderError && !validation.sessionTypeError && !validation.branchError && !state.targetPending
								&& !this.configurationService.getValue<boolean>('chat.disableAIFeatures');
						}
						handle.showTargetValidationError(validation.sessionTypeError);
						handle.showScheduleValidationError(manual ? validation.scheduleError : undefined);
						const blocked = manual ? handle.getSaveBlockedReason(validation.sessionTypeError, validation.scheduleError) : undefined;
						if (saveButton && blocked?.message !== saveBlockedMessage) {
							saveBlockedMessage = blocked?.message;
							saveBlockedHover.value = blocked ? this.hoverService.setupDelayedHover(saveButton.element, { content: blocked.message, appearance: { showPointer: true } }) : undefined;
							if (blocked) {
								saveButton.element.setAttribute('aria-describedby', blocked.elementId);
							} else {
								saveButton.element.removeAttribute('aria-describedby');
							}
						}
						if (saveInProgress && saveButton) {
							saveButton.enabled = false;
						}
					};
					disposables.add(this.configurationService.onDidChangeConfiguration(event => {
						if (event.affectsConfiguration('chat.disableAIFeatures')) {
							revalidate();
						}
					}));
					revalidate();
				},
			}, this.keybindingService, this.layoutService, this.hostService, automationDialogAllowableCommands,
				(commandId, event) => shouldPassThroughAutomationDialogCommand(commandId, event.target)),
		));

		activeContainer.classList.add('automation-dialog-open');
		disposables.add(toDisposable(() => activeContainer.classList.remove('automation-dialog-open')));

		let result: IAutomationDialogResult | undefined;
		try {
			void dialog.show().then(() => closeDialog(undefined));
			// eslint-disable-next-line no-restricted-syntax -- Dialog owns its close toolbar and exposes no enablement API.
			closeToolbar = dialogElement?.querySelector<HTMLElement>('.dialog-toolbar') ?? undefined;
			focusFirst();
			result = await completion.p;
		} finally {
			disposables.dispose();
		}
		if (authoringSession) {
			await this.sessionsService.openSession(authoringSession.resource);
		}
		return result;
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
