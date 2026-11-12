/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { cancelOnDispose } from '../../../../base/common/cancellation.js';
import { getErrorMessage, isCancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, observableFromEvent, observableSignalFromEvent, observableValue, transaction } from '../../../../base/common/observable.js';
import { FileAccess } from '../../../../base/common/network.js';
import { isEqual } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IAutomationService } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { CHAT_AUTOMATIONS_ENABLED_SETTING } from '../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { PromptFileVariableKind, toPromptFileVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IPromptsService, PromptsStorage } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { IChatViewFactory } from '../../../../workbench/contrib/sessions/browser/chatViewFactory.js';
import { INewChatInputSendRequest } from '../../../../workbench/contrib/sessions/browser/chat/newChatComposerInput.js';
import { SharedChatInputComposer } from '../../../../workbench/contrib/sessions/browser/chat/sharedChatInputComposer.js';
import { WorkspacePicker } from '../../../../workbench/contrib/sessions/browser/chat/sessionWorkspacePicker.js';
import { IPreferredSessionType } from '../../../../workbench/contrib/sessions/browser/chat/sessionTypePicker.js';
import { Menus } from '../../../../workbench/contrib/sessions/browser/menus.js';
import { AutomationComposerContext } from '../../../../workbench/contrib/sessions/common/contextkeys.js';
import { ISendRequestOptions, ISessionsManagementService, INewSessionDraftSlot } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { isAgentHostProvider } from '../../../../workbench/contrib/sessions/common/agentHostSessionsProvider.js';
import { ISession } from '../../../../workbench/services/sessions/common/session.js';
import { URI } from '../../../../base/common/uri.js';
import { canSelectAutomationWorkspace } from './automationDialog.js';
import { AutomationDialogTelemetry } from './automationTelemetry.js';
import { createNewSessionControlToolbar } from '../../chat/browser/newSessionConfigToolbars.js';

/** Hosts the normal session composer without sharing the manual dialog's Automation draft. */
export class AutomationComposer extends Disposable {
	private static readonly instances = new WeakMap<HTMLElement, AutomationComposer>();

	static getForElement(element: Element | null): AutomationComposer | undefined {
		for (let current = element; current; current = current.parentElement) {
			if (DOM.isHTMLElement(current)) {
				const composer = this.instances.get(current);
				if (composer) {
					return composer;
				}
			}
		}
		return undefined;
	}

	readonly element = DOM.$('.automation-authoring-composer');
	private readonly input: SharedChatInputComposer;
	private readonly workspacePicker: WorkspacePicker;
	private readonly session = observableValue<ISession | undefined>(this, undefined);
	private readonly targetReady = observableValue(this, false);
	private target: { readonly folder: URI | undefined; readonly pick: IPreferredSessionType } | undefined;
	private readonly message = DOM.$('.automation-authoring-message', { role: 'alert', 'aria-atomic': 'true' });
	private readonly sending = observableValue(this, false);
	private submitted = false;
	private telemetry: AutomationDialogTelemetry | undefined;
	/** Holds this composer's draft apart from the New Session draft, which opening Automations must not replace. */
	private readonly slot: INewSessionDraftSlot & IDisposable;
	private readonly token = cancelOnDispose(this._store);

	constructor(
		root: HTMLElement,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAutomationService private readonly automationService: IAutomationService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IWorkspaceTrustRequestService workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@IChatViewFactory chatViewFactory: IChatViewFactory,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IPromptsService private readonly promptsService: IPromptsService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
	) {
		super();
		this.slot = sessionsManagementService.createNewSessionSlot();
		AutomationComposer.instances.set(root, this);
		this._register(toDisposable(() => AutomationComposer.instances.delete(root)));
		const enabledChanged = observableSignalFromEvent(this, configurationService.onDidChangeConfiguration);
		const enabled = derived(this, reader => {
			enabledChanged.read(reader);
			return configurationService.getValue<boolean>(CHAT_AUTOMATIONS_ENABLED_SETTING) === true
				&& !configurationService.getValue<boolean>('chat.disableAIFeatures');
		});
		const providers = derived(this, reader => automationService.availableProviders.read(reader)
			.filter(provider => !automationService.getProviderConfiguration?.(provider.id)).map(provider => provider.id));
		this.workspacePicker = this._register(instantiationService.createInstance(WorkspacePicker, {
			getNoWorkspaceOption: () => ({
				description: localize('automation.composer.noWorkspace', "Ask the agent to help choose a workspace."),
				isSelected: this.workspacePicker.selectedFolderUri === undefined,
				select: () => this.workspacePicker.selectNoWorkspace(),
			}),
			canSelectWorkspace: (folder, providerId) => canSelectAutomationWorkspace(folder, providerId, sessionsManagementService, workspaceTrustRequestService),
			whenSelectionAccepted: async () => !this.sending.get(),
		}));
		const workspaceChanged = observableSignalFromEvent(this, this.workspacePicker.onDidChangeSelection);
		const folder = derived(this, reader => {
			workspaceChanged.read(reader);
			return this.workspacePicker.selectedFolderUri;
		});
		const composerContext = this._register(contextKeyService.createScoped(this.element));
		AutomationComposerContext.bindTo(composerContext).set(true);
		const composerInstantiation = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, composerContext])));
		this.input = this._register(composerInstantiation.createInstance(SharedChatInputComposer, {
			session: this.session,
			inputEditorOptions: chatViewFactory.inputEditorOptions,
			inputToolbar: Menus.AutomationsDialogInputToolbar,
			renderRepositoryControls: (container, hoverDelegate, scopedInstantiation) => {
				const store = new DisposableStore();
				const toolbar = store.add(createNewSessionControlToolbar(container, scopedInstantiation,
					localize('automation.composer.sessionControls', "Session controls"), hoverDelegate));
				return {
					visible: observableFromEvent(this, toolbar.onDidChangeMenuItems, () => toolbar.getItemsLength() > 0),
					dispose: () => store.dispose(),
				};
			},
			persistDraft: false,
			placeholder: localize('automation.composer.placeholder', "Describe what you want to automate"),
			onboardingTargetId: 'sessions.automations.create',
			renderChatPet: false,
			getWorkspaceSelection: () => this.workspacePicker.selectionSnapshot,
			onDidChangeWorkspaceSelection: this.workspacePicker.onDidChangeSelection,
			sendRequest: request => this.send(request),
			canSendRequest: derived(this, reader => {
				const session = this.session.read(reader);
				if (!session || !enabled.read(reader) || !providers.read(reader).includes(session.providerId) || !this.targetReady.read(reader)) {
					return false;
				}
				const pick = this.input.sessionTypePicker.selectedPick;
				const selectedFolder = folder.read(reader);
				return pick?.providerId === session.providerId && pick.sessionTypeId === session.sessionType
					&& (selectedFolder
						? sessionsManagementService.isNewSessionTargetAvailable(selectedFolder, pick)
						: sessionsManagementService.isQuickChatTargetAvailable(pick));
			}),
			loading: derived(this, reader => enabled.read(reader) && !this.session.read(reader) && providers.read(reader).length > 0),
			sessionTypePickerOptions: {
				persistSelection: false,
				preserveUnavailableSelection: true,
				allowedProviders: providers,
				telemetrySource: 'AutomationSessionTypePicker',
				prepareSessionTypeSelection: async () => !this.sending.get(),
			},
		}));
		this.input.sessionTypePicker.setQuickChatSource(derived(this, reader => !folder.read(reader)));
		this.input.sessionTypePicker.setFolderSource(folder, { preserveUnavailableInitialPick: true });

		const workspaceRow = DOM.append(this.element, DOM.$('.automation-authoring-workspace'));
		this.workspacePicker.render(workspaceRow, this.input.pickerHoverDelegate);
		DOM.append(workspaceRow, DOM.$('span.automation-authoring-workspace-description', undefined,
			localize('automation.composer.workspaceDefault', "The automation will use the selected workspace by default.")));
		const inputHost = DOM.append(this.element, DOM.$('.automation-authoring-input.new-chat-widget-container.revealed'));
		this.input.render(inputHost, root);
		DOM.append(this.element, this.message);
		this.message.hidden = true;
		const pickChanged = observableSignalFromEvent(this, this.input.sessionTypePicker.onDidChangeSelectedPick);
		const typesChanged = observableSignalFromEvent(this, sessionsManagementService.onDidChangeSessionTypes);
		// This composer has no environment picker, so a Dev Container choice from the workspace picker is applied to its draft directly.
		let devContainerFolder: URI | undefined;
		this._register(this.workspacePicker.onDidSelectWorkspaceMode(({ folderUri, preferDevContainer }) => {
			devContainerFolder = preferDevContainer ? folderUri : undefined;
		}));
		let creatingDraft = false;
		this._register(autorun(reader => {
			pickChanged.read(reader);
			typesChanged.read(reader);
			const allowed = providers.read(reader);
			const selectedFolder = folder.read(reader);
			const pick = this.input.sessionTypePicker.selectedPick;
			this.element.hidden = !enabled.read(reader);
			if (!enabled.read(reader) || !pick?.providerId || !allowed.includes(pick.providerId) || this.sending.read(reader) || this.submitted) {
				return;
			}
			const currentDraft = this.slot.newSession.read(reader);
			if (creatingDraft) {
				return;
			}
			if (this.target?.pick.providerId === pick.providerId && this.target.pick.sessionTypeId === pick.sessionTypeId
				&& isEqual(this.target.folder, selectedFolder) && currentDraft && this.session.read(undefined) === currentDraft) {
				return;
			}
			this.targetReady.set(false, undefined);
			creatingDraft = true;
			try {
				transaction(tx => {
					const session = selectedFolder
						? this.slot.createNewSession(selectedFolder, pick)
						: this.slot.createQuickChat(pick);
					if (selectedFolder && isEqual(devContainerFolder, selectedFolder)) {
						const provider = sessionsProvidersService.getProvider(session.providerId, session.sessionId);
						if (provider && isAgentHostProvider(provider)) {
							provider.preferDevContainer?.(session.sessionId);
						}
					}
					this.target = { folder: selectedFolder, pick };
					this.session.set(session, tx);
					this.targetReady.set(true, tx);
				});
			} catch (error) {
				this.showError(error);
			} finally {
				creatingDraft = false;
			}
		}));
		// Last, so the draft autorun is gone before the slot discards its draft.
		this._register(this.slot);
	}

	focus(): void {
		this.input.focus();
	}

	getAccessibleContent(): string {
		return [
			localize('automation.composer.accessibleHeading', "Create an automation"),
			localize('automation.composer.accessibleWorkspace', "Default workspace: {0}", this.workspacePicker.selectedResolved?.workspace.label ?? localize('automation.composer.noWorkspaceLabel', "No workspace")),
			this.input.getInputValue(),
			this.message.hidden ? undefined : this.message.textContent,
		].filter(Boolean).join('\n');
	}

	private async send(request: INewChatInputSendRequest): Promise<boolean> {
		const session = this.session.get();
		if (!session || this.sending.get() || !request.query.trim() || !this.isEnabled() || !this.isTargetAvailable(session)) {
			return false;
		}
		this.sending.set(true, undefined);
		this.message.hidden = true;
		// One authoring flow, whose retries share its initiation and outcomes.
		const telemetry = this.telemetry ??= new AutomationDialogTelemetry(this.telemetryService, 'create');
		try {
			// Resolved on send, not on import, so environments without module URIs, such as component fixtures, can load the view.
			const skillUri = FileAccess.asFileUri('vs/sessions/skills/automate/SKILL.md');
			const skills = await this.promptsService.findAgentSkills(this.token);
			const skill = skills && (await this.promptsService.listPromptFilesForStorage(PromptsType.skill, PromptsStorage.builtIn, this.token)).find(skill =>
				skill.name === 'automate' && skill.storage === PromptsStorage.builtIn && isEqual(skill.uri, skillUri));
			if (!skill || this.promptsService.getDisabledPromptFiles(PromptsType.skill).has(skill.uri)) {
				throw new Error(localize('automation.composer.skillUnavailable', "The built-in /automate skill is unavailable or disabled. Enable it before starting the walkthrough."));
			}
			if (!await this.workspacePicker.validateSelectedWorkspace() || session !== this.session.get() || !this.isEnabled() || this.token.isCancellationRequested || !this.isTargetAvailable(session)) {
				return false;
			}
			const goal = request.query.replace(/^\s*\/automate(?=\s|$)\s*/, '');
			const instruction = localize('automation.composer.authoringInstruction', "Follow only the attached automate SKILL.md to help me create an automation. Use this session's workspace as the default automation workspace unless I choose another.");
			const query = `${instruction}\n\n${goal}`;
			// Inline references are ranged in the typed input: move them into the sent query, and drop the ranges in the removed /automate.
			const removed = request.query.length - goal.length;
			const shift = query.length - goal.length - removed;
			const attachments = (request.attachments ?? []).map(entry => !entry.range ? entry : entry.range.start < removed
				? { ...entry, range: undefined }
				: { ...entry, range: { start: entry.range.start + shift, endExclusive: entry.range.endExclusive + shift } });
			request.userInteraction?.handoff(session, session.mainChat.get());
			const options: ISendRequestOptions = {
				query,
				attachedContext: [...attachments, toPromptFileVariableEntry(skillUri, PromptFileVariableKind.PromptFile)],
				...(request.userInteraction ? { onDidCreateResponse: request.userInteraction.onDidCreateResponse } : {}),
			};
			let startedSession: ISession | undefined;
			const sent = Event.once(Event.filter(this.sessionsManagementService.onDidSendRequest, event => event.options === options))(event => {
				startedSession = event.session;
			});
			try {
				await this.sessionsManagementService.sendNewChatRequest(session, options);
			} finally {
				sent.dispose();
			}
			if (!startedSession) {
				throw new Error(localize('automation.composer.sessionUnconfirmed', "The provider did not confirm the new session. Check your sessions before retrying."));
			}
			telemetry.sessionStarted();
			this.submitted = true;
			this.targetReady.set(false, undefined);
			if (!this._store.isDisposed && this.isEnabled()) {
				try {
					await this.sessionsService.openSession(startedSession.resource);
				} catch (error) {
					this.logService.error('[AutomationComposer] Failed to open the started session.', error);
					this.notificationService.error(localize('automation.composer.openFailed', "The session started, but could not be opened. Open it from Chats instead of sending again."));
				}
			}
			return true;
		} catch (error) {
			if (!isCancellationError(error)) {
				telemetry.sessionStartFailed();
				this.showError(error);
			}
			return false;
		} finally {
			this.sending.set(false, undefined);
		}
	}

	private isEnabled(): boolean {
		return this.configurationService.getValue<boolean>(CHAT_AUTOMATIONS_ENABLED_SETTING) === true
			&& !this.configurationService.getValue<boolean>('chat.disableAIFeatures');
	}

	private isTargetAvailable(session: ISession): boolean {
		const pick = this.input.sessionTypePicker.selectedPick;
		const folder = this.workspacePicker.selectedFolderUri;
		return this.targetReady.get() && !!pick?.providerId
			&& pick.providerId === session.providerId && pick.sessionTypeId === session.sessionType
			&& isEqual(this.target?.folder, folder)
			&& this.automationService.availableProviders.get().some(provider => provider.id === pick.providerId)
			&& (folder
				? this.sessionsManagementService.isNewSessionTargetAvailable(folder, pick)
				: this.sessionsManagementService.isQuickChatTargetAvailable(pick));
	}

	private showError(error: unknown): void {
		this.logService.error('[AutomationComposer] Failed to prepare the automation session.', error);
		if (this._store.isDisposed) {
			this.notificationService.error(getErrorMessage(error));
		} else {
			this.message.textContent = getErrorMessage(error);
			this.message.hidden = false;
		}
	}
}
