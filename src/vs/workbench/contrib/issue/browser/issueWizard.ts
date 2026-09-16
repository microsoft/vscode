/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { timeout } from '../../../../base/common/async.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { basename, dirname, isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IAgentHostEnablementService } from '../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IPermissionsValue } from '../../../../platform/agentHost/common/agentHostSchema.js';
import { SessionConfigKey } from '../../../../platform/agentHost/common/sessionConfigKeys.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor, createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IWorkbenchContribution, Extensions, IWorkbenchContributionsRegistry } from '../../../common/contributions.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IChatWidget, IChatWidgetService } from '../../chat/browser/chat.js';
import { IAgentHostActiveClientService } from '../../chat/browser/agentSessions/agentHost/agentHostActiveClientService.js';
import { toAgentHostBackendSessionUri } from '../../chat/browser/agentSessions/agentHost/agentHostSessionUri.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../chat/browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { AgentHostCompletionReferenceKind, IChatRequestVariableEntry, toAgentHostCompletionVariableEntry } from '../../chat/common/attachments/chatVariableEntries.js';
import { IChatInputCompletionItem, IChatSessionsService, isLocalAgentHostTarget } from '../../chat/common/chatSessionsService.js';
import { AUTO_RAW_MODEL_ID, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../chat/common/languageModels.js';
import { PromptsType } from '../../chat/common/promptSyntax/promptTypes.js';
import { IPromptsService, PromptsStorage } from '../../chat/common/promptSyntax/service/promptsService.js';
import { IIssueWizardIntakeService, IIssueWizardScreenshotAnnotationService, IssueWizardIntakeService, IssueWizardScreenshotAnnotationService } from './issueWizardIntakeService.js';
import { EditorCloseContext, EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { ScreenshotCaptureBar } from './screenshotCaptureBar.js';

export const ISSUE_WIZARD_COMMAND_ID = 'workbench.action.help.troubleshootWithIssueWizard';
export const ISSUE_WIZARD_ADD_SCREENSHOT_COMMAND_ID = 'workbench.action.issueWizard.addHighlightedScreenshot';
export const IssueWizardCaptureBarActiveContext = new RawContextKey<boolean>('issueWizardCaptureBarActive', false, localize('issueWizardCaptureBarActive', "Whether the Issue Wizard screenshot bar owns capture"));
const ISSUE_WIZARD_SLASH_COMMAND = 'issue-wizard';
const ISSUE_WIZARD_SKILL_COMPLETION_TIMEOUT = 10_000;
const ISSUE_WIZARD_SKILL_COMPLETION_RETRY_DELAY = 50;
const ISSUE_WIZARD_SKILL_COMPLETION_ATTEMPTS = Math.ceil(ISSUE_WIZARD_SKILL_COMPLETION_TIMEOUT / ISSUE_WIZARD_SKILL_COMPLETION_RETRY_DELAY);
const ISSUE_WIZARD_SCREENSHOT_TARGET_TIMEOUT = 10_000;
const ISSUE_WIZARD_SCREENSHOT_TARGET_ATTEMPTS = Math.ceil(ISSUE_WIZARD_SCREENSHOT_TARGET_TIMEOUT / ISSUE_WIZARD_SKILL_COMPLETION_RETRY_DELAY);
const ISSUE_WIZARD_PREFERRED_MODEL_IDS = ['gpt-6-astra', 'gpt-5.6-sol', 'claude-sonnet-5'] as const;
const ISSUE_WIZARD_DENIED_TOOLS = ['ask_user', 'AskUserQuestion', 'request_user_input'] as const;

/**
 * Optional context supplied by an Issue Wizard entry point.
 */
export interface IIssueWizardLaunchOptions {
	readonly symptom?: string;
}

/** Surface-local session creation for the provider-neutral Issue Wizard launcher. */
export interface IIssueWizardLaunchTarget {
	createSession(options: IIssueWizardCreateSessionOptions): Promise<IIssueWizardLaunchSession | undefined>;
}

/** Provider-neutral options for creating the Issue Wizard's fresh session. */
export interface IIssueWizardCreateSessionOptions {
	readonly sessionType: string;
	readonly displayName: string;
	readonly modelId: string;
	readonly initialSessionConfig: Readonly<Record<string, unknown>>;
}

/** A surface-owned session that can receive the shared Issue Wizard bootstrap. */
export interface IIssueWizardLaunchSession {
	readonly sessionResource: URI;
	send(request: IIssueWizardBootstrapRequest): Promise<void>;
	getScreenshotTarget(): IIssueWizardScreenshotTarget | undefined;
	revealScreenshotTarget(target: IIssueWizardScreenshotTarget): Promise<IChatWidget | undefined>;
}

/** The exact visible chat composer that owns Issue Wizard screenshot attachments. */
export interface IIssueWizardScreenshotTarget {
	readonly widget: IChatWidget;
	readonly sessionResource: URI;
}

/** Shared bootstrap content sent through a surface-local session adapter. */
export interface IIssueWizardBootstrapRequest {
	readonly query: string;
	readonly attachedContext: readonly IChatRequestVariableEntry[];
}

export const IIssueWizardLauncherService = createDecorator<IIssueWizardLauncherService>('issueWizardLauncherService');

export interface IIssueWizardLauncherService {
	readonly _serviceBrand: undefined;
	readonly captureBarActive: boolean;
	launch(options?: IIssueWizardLaunchOptions): Promise<void>;
	launchInTarget(target: IIssueWizardLaunchTarget, options?: IIssueWizardLaunchOptions): Promise<void>;
	addHighlightedScreenshot(): Promise<void>;
}

interface IIssueWizardCaptureState {
	readonly bar: ScreenshotCaptureBar;
	readonly session: IIssueWizardLaunchSession;
	target: IChatWidget;
	readonly sessionResource: URI;
}

export class IssueWizardLauncherService extends Disposable implements IIssueWizardLauncherService {
	readonly _serviceBrand: undefined;
	private readonly captureBarDisposables = this._register(new MutableDisposable<DisposableStore>());
	private readonly captureBarActiveContext: IContextKey<boolean>;
	private captureState: IIssueWizardCaptureState | undefined;
	private captureOperation: Promise<void> | undefined;
	get captureBarActive(): boolean { return this.captureState?.bar.active ?? false; }

	constructor(
		@IAgentHostEnablementService private readonly agentHostEnablementService: IAgentHostEnablementService,
		@INotificationService private readonly notificationService: INotificationService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IEditorService private readonly editorService: IEditorService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IAgentHostActiveClientService private readonly agentHostActiveClientService: IAgentHostActiveClientService,
		@IAgentHostUntitledProvisionalSessionService private readonly agentHostUntitledProvisionalSessionService: IAgentHostUntitledProvisionalSessionService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IPromptsService private readonly promptsService: IPromptsService,
		@IIssueWizardIntakeService private readonly issueWizardIntakeService: IIssueWizardIntakeService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
	) {
		super();
		this.captureBarActiveContext = IssueWizardCaptureBarActiveContext.bindTo(this.contextKeyService);
		this._register(toDisposable(() => this.captureBarActiveContext.reset()));
		this._register(this.chatWidgetService.onDidRemoveWidget(widget => {
			if (widget === this.captureState?.target) {
				this.clearCaptureBar();
			}
		}));
		this._register(this.editorService.onDidCloseEditor(event => {
			if (event.context === EditorCloseContext.MOVE) {
				return;
			}
			const closedResource = EditorResourceAccessor.getOriginalUri(event.editor, { supportSideBySide: SideBySideEditor.PRIMARY });
			if (this.captureState && isEqual(closedResource, this.captureState.sessionResource)) {
				this.clearCaptureBar();
			}
		}));
		this._register(this.chatEntitlementService.onDidChangeSentiment(() => {
			if (this.chatEntitlementService.sentiment.hidden) {
				this.clearCaptureBar();
			}
		}));
	}

	async launch(options?: IIssueWizardLaunchOptions): Promise<void> {
		await this.launchInTarget(this.createEditorLaunchTarget(), options);
	}

	async launchInTarget(target: IIssueWizardLaunchTarget, options?: IIssueWizardLaunchOptions): Promise<void> {
		if (this.chatEntitlementService.sentiment.hidden) {
			this.notificationService.warn(localize('issueWizardUnavailable.aiDisabled', "Issue Wizard is unavailable because AI features are disabled in this window."));
			return;
		}
		if (!this.agentHostEnablementService.enabled.get()) {
			this.notificationService.warn(localize('issueWizardUnavailable.disabled', "Issue Wizard is unavailable because Agent Host is disabled in this window."));
			return;
		}

		await this.createSessionAndSendBootstrap(target, options?.symptom);
	}

	async addHighlightedScreenshot(): Promise<void> {
		const captureState = this.captureState;
		if (!captureState) {
			this.notificationService.warn(localize('issueWizardScreenshot.noActiveSession', "Open an Issue Wizard session before adding a highlighted screenshot."));
			return;
		}
		if (!await captureState.bar.triggerCapture()) {
			return;
		}
		await this.captureOperation;
	}

	private getInvokingWorkspaceFolder(): URI | undefined {
		const folders = this.workspaceContextService.getWorkspace().folders;
		if (folders.length <= 1) {
			return folders[0]?.uri;
		}

		const activeResource = EditorResourceAccessor.getOriginalUri(this.editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
		return (activeResource ? this.workspaceContextService.getWorkspaceFolder(activeResource)?.uri : undefined) ?? folders[0]?.uri;
	}

	private createEditorLaunchTarget(): IIssueWizardLaunchTarget {
		return {
			createSession: async options => {
				const workspaceFolder = this.getInvokingWorkspaceFolder();
				const session = await this.chatWidgetService.openNewAgentHostEditorSession({
					sessionType: options.sessionType,
					displayName: options.displayName,
					workspaceFolder,
				});
				if (!session) {
					return undefined;
				}
				const { widget: chatWidget, sessionResource } = session;
				// Record this as the new conversation's programmatic intent. Merely
				// changing the displayed model can be overwritten when the empty
				// composer finishes restoring its remembered profile selection.
				if (!chatWidget.inputPart.switchModelByIdentifier(options.modelId)) {
					throw new Error(localize('issueWizard.error.modelUnavailableAfterLaunch', "The selected Issue Wizard model is no longer available."));
				}
				const backendSession = toAgentHostBackendSessionUri(sessionResource);
				const configuredSession = backendSession && await this.agentHostUntitledProvisionalSessionService.applyConfigChange(
					sessionResource,
					backendSession.scheme,
					workspaceFolder,
					{ ...options.initialSessionConfig },
				);
				if (!configuredSession) {
					throw new Error(localize('issueWizard.error.sessionConfigUnavailable', "Issue Wizard could not configure its session."));
				}
				return {
					sessionResource,
					send: async request => {
						chatWidget.attachmentModel.addContext(...request.attachedContext);
						chatWidget.focusInput();
						try {
							const accepted = await chatWidget.acceptInput(request.query);
							if (!accepted) {
								throw new Error(localize('issueWizard.error.bootstrapRejected', "Issue Wizard could not send its first request. Retry when ready."));
							}
						} catch (error) {
							chatWidget.setInput(request.query);
							chatWidget.focusInput();
							throw error;
						}
						if (request.attachedContext.length) {
							chatWidget.attachmentModel.delete(...request.attachedContext.map(attachment => attachment.id));
						}
					},
					getScreenshotTarget: () => ({ widget: chatWidget, sessionResource }),
					revealScreenshotTarget: async target => {
						const resource = target.widget.viewModel?.sessionResource ?? target.sessionResource;
						await this.editorService.openEditor({ resource, options: { revealIfOpened: true, pinned: true } });
						return this.chatWidgetService.getWidgetBySessionResource(resource) ?? target.widget;
					},
				};
			},
		};
	}

	private async createSessionAndSendBootstrap(target: IIssueWizardLaunchTarget, symptom: string | undefined): Promise<void> {
		try {
			const agentHostSessionType = this.chatSessionsService.getAllChatSessionContributions()
				.find(contribution => contribution.agentHostProviderId && isLocalAgentHostTarget(contribution.type))?.type;
			if (!agentHostSessionType) {
				throw new Error(localize('issueWizard.error.agentHostUnavailable', "No Agent Host session provider is available."));
			}
			const model = await this.selectLanguageModel(agentHostSessionType);

			const session = await target.createSession({
				sessionType: agentHostSessionType,
				displayName: localize('issueWizard.sessionName', "Issue Wizard"),
				modelId: model.identifier,
				initialSessionConfig: {
					[SessionConfigKey.Permissions]: {
						allow: [],
						deny: [...ISSUE_WIZARD_DENIED_TOOLS],
					} satisfies IPermissionsValue,
				},
			});
			if (!session) {
				throw new Error(localize('issueWizard.error.chatUnavailable', "Chat session was not created."));
			}

			const builtinSkills = await this.promptsService.listPromptFilesForStorage(PromptsType.skill, PromptsStorage.builtIn, CancellationToken.None);
			const issueWizardSkill = builtinSkills.find(skill => basename(dirname(skill.uri)) === ISSUE_WIZARD_SLASH_COMMAND);
			if (!issueWizardSkill) {
				throw new Error(localize('issueWizard.error.skillUnavailable', "The bundled Issue Wizard skill could not be loaded."));
			}
			const slashCommand = `/${ISSUE_WIZARD_SLASH_COMMAND}`;
			let skillCompletion: IChatInputCompletionItem | undefined;
			for (let attempt = 0; attempt < ISSUE_WIZARD_SKILL_COMPLETION_ATTEMPTS; attempt++) {
				const completionResult = await this.chatSessionsService.provideChatInputCompletions(session.sessionResource, {
					text: slashCommand,
					offset: slashCommand.length,
				}, CancellationToken.None);
				skillCompletion = completionResult?.items.find(item =>
					item.attachment.kind === 'skill'
					&& isEqual(
						this.agentHostActiveClientService.getOrigin(item.attachment.syncedUri ?? item.attachment.uri)?.uri ?? item.attachment.uri,
						issueWizardSkill.uri,
					)
					&& item.insertText.trimEnd() === slashCommand
					&& item.attachment.displayName === issueWizardSkill.name
					&& item.attachment.description === issueWizardSkill.description
				);
				if (skillCompletion || attempt === ISSUE_WIZARD_SKILL_COMPLETION_ATTEMPTS - 1) {
					break;
				}
				await timeout(ISSUE_WIZARD_SKILL_COMPLETION_RETRY_DELAY);
			}
			if (!skillCompletion || skillCompletion.attachment.kind !== 'skill') {
				throw new Error(localize('issueWizard.error.skillInvocationUnavailable', "The bundled Issue Wizard skill could not be invoked by Agent Host."));
			}
			const skillReference = {
				...toAgentHostCompletionVariableEntry(
					AgentHostCompletionReferenceKind.Skill,
					skillCompletion.attachment.displayName ?? ISSUE_WIZARD_SLASH_COMMAND,
					skillCompletion.attachment.uri,
					skillCompletion.attachment._meta,
				),
				range: { start: 0, endExclusive: slashCommand.length },
			};
			await session.send({
				query: `${slashCommand} ${this.createBootstrapMessage(symptom?.trim())}`,
				attachedContext: [skillReference],
			});
			const screenshotTarget = await this.waitForScreenshotTarget(session);
			if (!screenshotTarget) {
				throw new Error(localize('issueWizard.error.screenshotTargetUnavailable', "The Issue Wizard screenshot control could not be opened."));
			}
			this.showCaptureBar(session, screenshotTarget);
		} catch (error) {
			this.notificationService.error(localize('issueWizardStartFailed', "Issue Wizard failed to start: {0}", toErrorMessage(error)));
		}
	}

	private async selectLanguageModel(sessionType: string): Promise<ILanguageModelChatMetadataAndIdentifier> {
		const identifiers = await this.languageModelsService.selectLanguageModels({ vendor: sessionType });
		const models = identifiers
			.map(identifier => {
				const metadata = this.languageModelsService.lookupLanguageModel(identifier);
				return metadata ? { identifier, metadata } : undefined;
			})
			.filter((model): model is ILanguageModelChatMetadataAndIdentifier => model !== undefined
				&& model.metadata.id !== AUTO_RAW_MODEL_ID
				&& model.metadata.targetChatSessionType === sessionType
				&& !this.languageModelsService.isModelHidden(model.identifier));
		const preferred = ISSUE_WIZARD_PREFERRED_MODEL_IDS
			.map(id => models.find(model => model.metadata.id === id))
			.find(model => model !== undefined);
		const fallback = models.find(model => model.metadata.capabilities?.vision === true) ?? models[0];
		const selected = preferred ?? fallback;
		if (!selected) {
			throw new Error(localize('issueWizard.error.noConcreteModel', "No concrete language model is available for Issue Wizard."));
		}
		return selected;
	}

	private async waitForScreenshotTarget(session: IIssueWizardLaunchSession): Promise<IIssueWizardScreenshotTarget | undefined> {
		for (let attempt = 0; attempt < ISSUE_WIZARD_SCREENSHOT_TARGET_ATTEMPTS; attempt++) {
			const target = session.getScreenshotTarget();
			if (target) {
				return target;
			}
			if (attempt < ISSUE_WIZARD_SCREENSHOT_TARGET_ATTEMPTS - 1) {
				await timeout(ISSUE_WIZARD_SKILL_COMPLETION_RETRY_DELAY);
			}
		}
		return undefined;
	}

	private showCaptureBar(session: IIssueWizardLaunchSession, { widget: chatWidget, sessionResource }: IIssueWizardScreenshotTarget): void {
		this.clearCaptureBar();
		const captureBarDisposables = new DisposableStore();
		this.captureBarDisposables.value = captureBarDisposables;
		const captureBar = captureBarDisposables.add(new ScreenshotCaptureBar(this.layoutService.activeContainer, this.contextMenuService));
		this.captureState = { bar: captureBar, session, target: chatWidget, sessionResource };
		captureBarDisposables.add(this.chatWidgetService.onDidChangeFocusedSession(() => this.updateCaptureBarTarget()));
		captureBarDisposables.add(captureBar.onDidChangeActive(active => {
			if (captureBar === this.captureState?.bar) {
				this.captureBarActiveContext.set(active);
			}
		}));
		captureBarDisposables.add(captureBar.onDidRequestScreenshot(() => {
			const captureState = this.captureState;
			if (!captureState || captureState.bar !== captureBar) {
				return;
			}
			const operation = this.captureAndAttachScreenshot(captureState);
			this.captureOperation = operation;
			void operation.finally(() => {
				if (this.captureOperation === operation) {
					this.captureOperation = undefined;
				}
			});
		}));

		this.captureBarActiveContext.set(captureBar.active);
	}

	private updateCaptureBarTarget(): IChatWidget | undefined {
		const captureState = this.captureState;
		if (!captureState) {
			return undefined;
		}
		// Widget registration can briefly lag focus and layout changes. Keep the
		// exact target supplied by the launch surface until its removal event tells
		// us that the Issue Wizard session really closed.
		const target = this.chatWidgetService.getWidgetBySessionResource(captureState.sessionResource) ?? captureState.target;
		captureState.target = target;
		captureState.bar.show();
		captureState.bar.activate();
		this.captureBarActiveContext.set(captureState.bar.active);
		return target;
	}

	private async captureAndAttachScreenshot(captureState: IIssueWizardCaptureState): Promise<void> {
		const { bar: captureBar } = captureState;
		if (!this.updateCaptureBarTarget()) {
			return;
		}
		captureBar.setCaptureEnabled(false, localize('issueWizardScreenshot.capturing', "Capturing screenshot..."));
		try {
			if (captureBar.shouldHideForCapture) {
				captureBar.hide();
				await timeout(100);
			}

			const attachments = await this.issueWizardIntakeService.collectScreenshot();
			if (!attachments || captureState !== this.captureState) {
				return;
			}
			const chatWidget = this.updateCaptureBarTarget();
			if (!chatWidget) {
				return;
			}
			for (const attachment of attachments) {
				chatWidget.attachmentModel.addContext(attachment);
			}
			const revealedWidget = await captureState.session.revealScreenshotTarget({
				widget: chatWidget,
				sessionResource: captureState.sessionResource,
			});
			if (revealedWidget && captureState === this.captureState) {
				captureState.target = revealedWidget;
				revealedWidget.focusInput();
			}
		} catch (error) {
			this.notificationService.error(localize('issueWizardScreenshot.failed', "Issue Wizard could not add the screenshot: {0}", toErrorMessage(error)));
		} finally {
			if (captureBar === this.captureState?.bar) {
				captureBar.setCaptureEnabled(true);
				this.updateCaptureBarTarget();
			}
		}
	}

	private clearCaptureBar(): void {
		this.captureState = undefined;
		this.captureOperation = undefined;
		this.captureBarActiveContext.set(false);
		this.captureBarDisposables.clear();
	}

	private createBootstrapMessage(symptom: string | undefined): string {
		const lines = [
			localize('issueWizardBootstrap.message', "Help me troubleshoot a VS Code issue."),
		];

		if (symptom) {
			lines.push(localize('issueWizardBootstrap.symptom', "Symptom: {0}", symptom));
		}

		return lines.join('\n');
	}
}

registerSingleton(IIssueWizardIntakeService, IssueWizardIntakeService, InstantiationType.Delayed);
registerSingleton(IIssueWizardScreenshotAnnotationService, IssueWizardScreenshotAnnotationService, InstantiationType.Delayed);
registerSingleton(IIssueWizardLauncherService, IssueWizardLauncherService, InstantiationType.Delayed);

registerAction2(class LaunchIssueWizardAction extends Action2 {
	constructor() {
		super({
			id: ISSUE_WIZARD_COMMAND_ID,
			title: localize2('troubleshootWithIssueWizard', "Troubleshoot with Issue Wizard..."),
			category: Categories.Help,
			f1: true,
			precondition: ChatContextKeys.enabled,
		});
	}

	override async run(accessor: ServicesAccessor, options?: IIssueWizardLaunchOptions): Promise<void> {
		const launcher = accessor.get(IIssueWizardLauncherService);
		await launcher.launch(options);
	}
});

registerAction2(class AddIssueWizardScreenshotAction extends Action2 {
	constructor() {
		super({
			id: ISSUE_WIZARD_ADD_SCREENSHOT_COMMAND_ID,
			title: localize2('issueWizard.addHighlightedScreenshot', "Add Highlighted Screenshot"),
			category: localize2('issueWizard.category', "Issue Wizard"),
			f1: true,
			precondition: ChatContextKeys.enabled,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IIssueWizardLauncherService).addHighlightedScreenshot();
	}
});

MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
	group: '3_feedback',
	order: 2,
	command: {
		id: ISSUE_WIZARD_COMMAND_ID,
		title: localize({ key: 'miTroubleshootWithIssueWizard', comment: ['&& denotes a mnemonic'] }, "Troubleshoot with &&Issue Wizard..."),
	},
	when: ChatContextKeys.enabled,
});

export class IssueWizardStatusbarContribution extends Disposable implements IWorkbenchContribution {
	private readonly entry = this._register(new MutableDisposable());

	constructor(
		@IStatusbarService statusbarService: IStatusbarService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
	) {
		super();
		const update = () => {
			if (chatEntitlementService.sentiment.hidden) {
				this.entry.clear();
				return;
			}
			if (!this.entry.value) {
				this.entry.value = statusbarService.addEntry({
					name: localize('issueWizardStatusbar.name', "Issue Wizard"),
					text: `$(bug) ${localize('issueWizardStatusbar.text', "Issue Wizard")}`,
					ariaLabel: localize('issueWizardStatusbar.aria', "Issue Wizard: troubleshoot a VS Code problem"),
					tooltip: localize('issueWizardStatusbar.tooltip', "Start Issue Wizard. Describe what is going wrong, or add a highlighted screenshot."),
					command: ISSUE_WIZARD_COMMAND_ID,
				}, 'status.issueWizard', StatusbarAlignment.LEFT, {
					primary: {
						location: { id: 'status.feedback', priority: 100 },
						alignment: StatusbarAlignment.LEFT,
					},
					secondary: 0,
				});
			}
		};
		this._register(chatEntitlementService.onDidChangeSentiment(update));
		update();
	}
}

Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench).registerWorkbenchContribution(IssueWizardStatusbarContribution, LifecyclePhase.Restored);
