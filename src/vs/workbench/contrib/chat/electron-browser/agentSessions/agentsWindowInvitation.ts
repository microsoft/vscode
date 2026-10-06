/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableLongTimeout } from '../../../../../base/common/async.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { getAgentHostEditorActivity, hasAgentsWindowInvitationSessionCooldownElapsed, IAgentsWindowInvitation } from '../../../../../platform/chat/common/agentsWindowInvitation.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { logExperimentTrigger, logSettingExperimentTrigger } from '../../../../../platform/telemetry/common/experimentTrigger.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { EditorCloseContext } from '../../../../common/editor.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IChatWidget, IChatWidgetService } from '../../browser/chat.js';
import { ChatInputNotificationActionKind, ChatInputNotificationSeverity, IChatInputNotificationService } from '../../browser/widget/input/chatInputNotificationService.js';
import { ChatEditorInput } from '../../browser/widgetHosts/editor/chatEditorInput.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { agentsWindowInvitationScenarios, agentsWindowInvitationTreatmentFields, getAgentsWindowInvitationTreatment, IAgentsWindowInvitationCopy, IAgentsWindowInvitationScenario } from '../../common/agentsWindowInvitation.js';
import { AgentsWindowUsage } from '../../common/agentsWindowUsage.js';
import { ChatConfiguration, OPEN_AGENTS_WINDOW_PRECONDITION } from '../../common/constants.js';
import { IChatModel } from '../../common/model/chatModel.js';
import { isUntitledChatSession } from '../../common/model/chatUri.js';
import { IAgentHostEditorActivityService } from './agentHostEditorActivity.js';
import { isAgentHostChatWidget, registerAgentsWindowTreatments } from './agentSessionsActions.js';

interface IInvitationPresentation {
	readonly invitation: IAgentsWindowInvitation;
	readonly resource: URI;
	readonly scenario: IAgentsWindowInvitationScenario;
	readonly copy: IAgentsWindowInvitationCopy;
	readonly owner: IChatWidget;
	shown: boolean;
}

type InvitationAction = 'shown' | 'open' | 'dismiss' | 'mute' | 'windowOpened';
type InvitationEvent = { scenario: string; action: InvitationAction };
type InvitationClassification = {
	scenario: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The bounded invitation scenario selected before rendering.' };
	action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the invitation was shown, clicked, dismissed, muted, or the destination window opened.' };
	owner: 'benibenj';
	comment: 'Measures discovery of the Agents Window through contextual invitations.';
};

const notificationId = 'chat.agentsWindowBanner';
const openCommandId = 'workbench.action.chat.agentsWindowBanner.open';
const muteCommandId = 'workbench.action.chat.agentsWindowBanner.mute';
const precondition = ContextKeyExpr.and(OPEN_AGENTS_WINDOW_PRECONDITION, ChatContextKeys.enabled);

export class AgentsWindowInvitationContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.agentsWindowInvitation';
	private readonly widgets = this._register(new DisposableMap<IChatWidget, DisposableStore>());
	private readonly timer = this._register(new MutableDisposable());
	private readonly usage: AgentsWindowUsage;
	private readonly treatments = new Map<string, string | number | boolean>();
	private treatmentsReady = false;
	private presentation: IInvitationPresentation | undefined;
	private renderedInput: URI | undefined;
	private claiming = false;
	private updatePending = false;
	private updating = false;

	constructor(
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatInputNotificationService private readonly notificationService: IChatInputNotificationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IStorageService storageService: IStorageService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IWorkbenchAssignmentService assignmentService: IWorkbenchAssignmentService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILogService private readonly logService: ILogService,
		@IHostService private readonly hostService: IHostService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IEditorService editorService: IEditorService,
		@IAgentHostEditorActivityService private readonly activity: IAgentHostEditorActivityService,
	) {
		super();
		this.usage = new AgentsWindowUsage(storageService);
		if (environmentService.isSessionsWindow) {
			return;
		}
		this._register(CommandsRegistry.registerCommand(openCommandId, (_accessor, id: string) => this.act(id, 'open')));
		this._register(CommandsRegistry.registerCommand(muteCommandId, (_accessor, id: string) => this.act(id, 'mute')));

		for (const widget of chatWidgetService.getAllWidgets()) {
			this.trackWidget(widget);
		}
		this._register(chatWidgetService.onDidAddWidget(widget => this.trackWidget(widget)));
		this._register(chatWidgetService.onDidRemoveWidget(widget => {
			this.widgets.deleteAndDispose(widget);
			if (this.presentation?.owner === widget) {
				this.release();
			}
			this.update();
		}));
		this._register(editorService.onDidCloseEditor(event => {
			if (event.context !== EditorCloseContext.MOVE && event.editor instanceof ChatEditorInput && this.presentation && isEqual(event.editor.sessionResource, this.presentation.resource)) {
				this.release();
			}
		}));
		this._register(Event.any(
			chatWidgetService.onDidChangeFocusedSession,
			chatWidgetService.onDidChangeWidgetVisibility,
			contextKeyService.onDidChangeContext,
			configurationService.onDidChangeConfiguration,
			hostService.onDidChangeFocus,
			this.usage.onDidChange(this._store),
		)(() => this.update()));
		this._register(autorun(reader => {
			this.activity?.state.read(reader);
			this.update();
		}));

		const names = agentsWindowInvitationScenarios.flatMap(scenario => agentsWindowInvitationTreatmentFields.map(field => getAgentsWindowInvitationTreatment(scenario, field)));
		this._register(registerAgentsWindowTreatments<string | number | boolean>(
			names, 'AgentsWindowInvitation',
			values => {
				this.treatments.clear();
				values.forEach((value, index) => {
					if (value !== undefined) {
						this.treatments.set(names[index], value);
					}
				});
				this.treatmentsReady = true;
				this.update();
			},
			assignmentService, logService,
			(value, name) => name.endsWith('.enabled') ? typeof value === 'boolean'
				: name.endsWith('.delaySeconds') ? typeof value === 'number' && value >= 0 && Number.isFinite(value * 1000)
					: typeof value === 'string' && value.trim().length > 0,
		));
	}

	private trackWidget(widget: IChatWidget): void {
		const store = new DisposableStore();
		this.widgets.set(widget, store);
		const modelStore = store.add(new DisposableStore());
		const updateModel = () => {
			modelStore.clear();
			const model = widget.viewModel?.model;
			if (model) {
				modelStore.add(autorun(reader => {
					model.requestInProgress.read(reader);
					model.requestNeedsInput.read(reader);
					this.update();
				}));
				modelStore.add(Event.any(model.onDidChange, model.onDidChangePendingRequests)(() => this.update()));
			}
			this.update();
		};
		store.add(widget.onDidChangeViewModel(updateModel));
		updateModel();
	}

	private get developerMode(): boolean {
		return this.configurationService.getValue<boolean>(ChatConfiguration.AgentsWindowBannerDeveloperMode) === true;
	}

	private get enabled(): boolean {
		return this.developerMode || this.configurationService.getValue<boolean>(ChatConfiguration.AgentsWindowBannerEnabled) === true;
	}

	private isAllowed(widget: IChatWidget): boolean {
		return widget.domNode.ownerDocument === mainWindow.document && isAgentHostChatWidget(widget) && widget.scopedContextKeyService.contextMatchesRules(precondition);
	}

	private update(): void {
		if (this._store.isDisposed || this.updating) {
			return;
		}
		if (this.claiming) {
			this.updatePending = true;
		}
		this.updating = true;
		try {
			this.timer.clear();
			if (this.presentation) {
				this.updatePresentation(this.presentation);
			} else if (!this.claiming) {
				const candidate = this.getCandidate();
				const state = this.activity?.state.get();
				if (candidate && state && !state.invitation && this.enabled && (this.developerMode || !this.usage.isActiveUser())) {
					if (!this.developerMode) {
						if (!hasAgentsWindowInvitationSessionCooldownElapsed(state)) {
							return;
						}
						if (state.lastShown) {
							const remaining = state.lastShown.timestamp + 24 * 60 * 60 * 1000 - Date.now();
							if (remaining > 0) {
								this.schedule(remaining);
								return;
							}
						}
					}
					void this.claim(candidate).catch(error => this.logService.error('[AgentsWindowInvitation] Failed to claim invitation', error));
				}
			}
		} finally {
			this.updating = false;
		}
	}

	private getCandidate(): { widget: IChatWidget; resource: URI; scenario: IAgentsWindowInvitationScenario } | undefined {
		const widget = this.chatWidgetService.lastFocusedWidget;
		const model = widget?.viewModel?.model;
		const resource = widget?.viewModel?.sessionResource;
		const state = this.activity?.state.get();
		if (!this.treatmentsReady || !state || !widget?.visible || !this.widgets.has(widget) || !this.hostService.hasFocus || !model || !resource
			|| !this.isAllowed(widget) || isUntitledChatSession(resource) || !model.hasRequests
			|| !model.requestInProgress.get() || model.requestNeedsInput.get()) {
			return undefined;
		}
		const activity = getAgentHostEditorActivity(state, this.nativeHostService.windowId, resource);
		const lastMessage = this.getLastMessageTime(model);
		if (!activity || lastMessage === undefined) {
			return undefined;
		}
		let candidate: IAgentsWindowInvitationScenario | undefined;
		let remaining: number | undefined;
		for (const scenario of agentsWindowInvitationScenarios) {
			if (!scenario.matches(activity)) {
				continue;
			}
			if (!this.developerMode) {
				logExperimentTrigger(this.telemetryService, getAgentsWindowInvitationTreatment(scenario, 'delaySeconds'));
			}
			const treatment = this.treatments.get(getAgentsWindowInvitationTreatment(scenario, 'delaySeconds'));
			const delay = typeof treatment === 'number' ? treatment : scenario.delaySeconds;
			const wait = lastMessage + delay * 1000 - Date.now();
			if (wait > 0) {
				remaining = Math.min(remaining ?? wait, wait);
				continue;
			}
			// Observe the opportunity in every arm, before experiment enablement or impression history.
			if (!this.developerMode) {
				logSettingExperimentTrigger(this.telemetryService, ChatConfiguration.AgentsWindowBannerEnabled);
				logExperimentTrigger(this.telemetryService, getAgentsWindowInvitationTreatment(scenario, 'enabled'));
			}
			if (!candidate && (this.developerMode || this.treatments.get(getAgentsWindowInvitationTreatment(scenario, 'enabled')) !== false)) {
				candidate = scenario;
			}
		}
		if (remaining !== undefined) {
			this.schedule(remaining);
		}
		return candidate ? { widget, resource, scenario: candidate } : undefined;
	}

	private getLastMessageTime(model: IChatModel): number | undefined {
		let timestamp = model.getRequests().findLast(request => !request.isSystemInitiated)?.timestamp;
		for (const { request } of model.getPendingRequests()) {
			if (!request.isSystemInitiated) {
				timestamp = Math.max(timestamp ?? request.timestamp, request.timestamp);
			}
		}
		return timestamp;
	}

	private schedule(delay: number): void {
		this.timer.value = disposableLongTimeout(() => this.update(), delay);
	}

	private async claim(candidate: { widget: IChatWidget; resource: URI; scenario: IAgentsWindowInvitationScenario }): Promise<void> {
		this.claiming = true;
		try {
			const invitation = await this.nativeHostService.claimAgentsWindowInvitation(candidate.resource.toJSON(), this.developerMode);
			if (!invitation) {
				return;
			}
			const current = !this._store.isDisposed ? this.getCandidate() : undefined;
			if (!current || current.widget !== candidate.widget || !isEqual(current.resource, candidate.resource) || !this.enabled) {
				await this.nativeHostService.releaseAgentsWindowInvitation(invitation.id);
				return;
			}
			const scenario = current.scenario;
			const text = (field: keyof IAgentsWindowInvitationCopy) => {
				const value = this.treatments.get(getAgentsWindowInvitationTreatment(scenario, field));
				return typeof value === 'string' ? value : scenario[field];
			};
			this.presentation = {
				invitation, resource: current.resource, scenario, owner: current.widget, shown: false,
				copy: { title: text('title'), description: text('description'), actionLabel: text('actionLabel') },
			};
			this.update();
		} finally {
			this.claiming = false;
			if (this.updatePending) {
				this.updatePending = false;
				this.update();
			}
		}
	}

	private updatePresentation(presentation: IInvitationPresentation): void {
		const state = this.activity?.state.get();
		if (!this.enabled || !this.developerMode && this.usage.isActiveUser() || !presentation.owner.scopedContextKeyService.contextMatchesRules(precondition)
			|| state && state.revision >= presentation.invitation.revision && state.invitation?.id !== presentation.invitation.id) {
			this.release();
			return;
		}
		if (!presentation.shown) {
			const candidate = this.getCandidate();
			if (!candidate || candidate.widget !== presentation.owner || !isEqual(candidate.resource, presentation.resource) || candidate.scenario !== presentation.scenario
				|| presentation.invitation.developerMode !== this.developerMode) {
				this.release();
				return;
			}
		}
		const widget = presentation.owner.visible && this.isAllowed(presentation.owner) && isEqual(presentation.owner.viewModel?.sessionResource, presentation.resource)
			? presentation.owner
			: this.chatWidgetService.getAllWidgets().find(widget => widget.visible && this.isAllowed(widget) && isEqual(widget.viewModel?.sessionResource, presentation.resource));
		const model = widget?.viewModel?.model;
		if (!widget || !model || model.requestNeedsInput.get()) {
			this.hide();
			return;
		}
		const inputUri = widget.inputPart.inputUri;
		if (isEqual(this.renderedInput, inputUri)) {
			return;
		}
		this.renderedInput = inputUri;
		this.notificationService.setNotification({
			id: notificationId,
			inputUri,
			telemetryId: presentation.invitation.developerMode ? 'developerPreview' : presentation.scenario.id,
			severity: ChatInputNotificationSeverity.Info,
			message: presentation.copy.title,
			description: presentation.copy.description,
			sessionResources: [presentation.resource],
			when: context => this.presentation === presentation && !context.isTransientChat,
			dismissible: true,
			autoDismissOnMessage: false,
			onDismiss: () => { void this.act(presentation.invitation.id, 'dismiss').catch(error => this.logService.error('[AgentsWindowInvitation] Failed to dismiss invitation', error)); },
			onDidShow: () => this.shown(presentation),
			actions: [{
				kind: ChatInputNotificationActionKind.Command,
				label: presentation.copy.actionLabel,
				commandId: openCommandId,
				commandArgs: [presentation.invitation.id],
				primary: true,
				keepOpen: true,
			}, {
				kind: ChatInputNotificationActionKind.Command,
				label: localize('agentsWindowInvitation.mute', "Don't Show Again"),
				commandId: muteCommandId,
				commandArgs: [presentation.invitation.id],
				primary: false,
				keepOpen: true,
			}],
		});
	}

	private shown(presentation: IInvitationPresentation): void {
		if (this._store.isDisposed || this.presentation !== presentation || presentation.shown) {
			return;
		}
		presentation.shown = true;
		void this.nativeHostService.markAgentsWindowInvitationShown(presentation.invitation.id)
			.catch(error => this.logService.error('[AgentsWindowInvitation] Failed to record impression', error));
		if (!presentation.invitation.developerMode) {
			for (const field of ['title', 'description', 'actionLabel'] as const) {
				logExperimentTrigger(this.telemetryService, getAgentsWindowInvitationTreatment(presentation.scenario, field));
			}
		}
		this.log(presentation, 'shown');
	}

	private async act(id: string, action: 'open' | 'dismiss' | 'mute'): Promise<void> {
		const presentation = this.presentation;
		if (!presentation || presentation.invitation.id !== id) {
			return;
		}
		if (action === 'open' && (!this.enabled || !presentation.owner.scopedContextKeyService.contextMatchesRules(precondition))) {
			this.release();
			return;
		}
		this.log(presentation, action);
		this.release();
		if (action === 'mute' && !presentation.invitation.developerMode) {
			await this.configurationService.updateValue(ChatConfiguration.AgentsWindowBannerEnabled, false, ConfigurationTarget.USER);
		} else if (action === 'open') {
			if (!presentation.invitation.developerMode) {
				logSettingExperimentTrigger(this.telemetryService, ChatConfiguration.AgentsWindowBannerRevealCurrentSession);
			}
			const revealSession = this.configurationService.getValue<boolean>(ChatConfiguration.AgentsWindowBannerRevealCurrentSession) !== false;
			await this.nativeHostService.openAgentsWindow({
				sessionResource: revealSession ? presentation.resource.toJSON() : undefined,
				onboardingSessionResource: presentation.resource.toJSON(),
				source: presentation.scenario.source,
			});
			this.log(presentation, 'windowOpened');
		}
	}

	private log(presentation: IInvitationPresentation, action: InvitationAction): void {
		if (!presentation.invitation.developerMode) {
			this.telemetryService.publicLog2<InvitationEvent, InvitationClassification>('agentsWindowInvitation', { scenario: presentation.scenario.id, action });
		}
	}

	private hide(): void {
		if (this.renderedInput) {
			this.renderedInput = undefined;
			this.notificationService.deleteNotification(notificationId);
		}
	}

	private release(): void {
		const presentation = this.presentation;
		this.presentation = undefined;
		this.hide();
		if (presentation) {
			void this.nativeHostService.releaseAgentsWindowInvitation(presentation.invitation.id)
				.catch(error => this.logService.error('[AgentsWindowInvitation] Failed to release invitation', error));
		}
	}

	override dispose(): void {
		super.dispose();
		this.release();
	}
}
