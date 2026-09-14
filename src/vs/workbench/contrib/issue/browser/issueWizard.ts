/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { timeout } from '../../../../base/common/async.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { basename, dirname } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IAgentHostEnablementService } from '../../../../platform/agentHost/common/agentHostEnablementService.js';
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
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { IChatSessionsService, isLocalAgentHostTarget } from '../../chat/common/chatSessionsService.js';
import { PromptFileVariableKind, toPromptFileVariableEntry } from '../../chat/common/attachments/chatVariableEntries.js';
import { PromptsType } from '../../chat/common/promptSyntax/promptTypes.js';
import { IPromptsService, PromptsStorage } from '../../chat/common/promptSyntax/service/promptsService.js';
import { IIssueWizardIntakeService, IIssueWizardScreenshotAnnotationService, IssueWizardIntakeService, IssueWizardScreenshotAnnotationService } from './issueWizardIntakeService.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { ScreenshotCaptureBar } from './screenshotCaptureBar.js';

export const ISSUE_WIZARD_COMMAND_ID = 'workbench.action.help.troubleshootWithIssueWizard';
export const ISSUE_WIZARD_ADD_SCREENSHOT_COMMAND_ID = 'workbench.action.issueWizard.addHighlightedScreenshot';
export const IssueWizardCaptureBarActiveContext = new RawContextKey<boolean>('issueWizardCaptureBarActive', false, localize('issueWizardCaptureBarActive', "Whether the Issue Wizard screenshot bar owns capture"));
const ISSUE_WIZARD_SLASH_COMMAND = 'issue-wizard';

/**
 * Optional context supplied by an Issue Wizard entry point.
 */
export interface IIssueWizardLaunchOptions {
	readonly symptom?: string;
}

export const IIssueWizardLauncherService = createDecorator<IIssueWizardLauncherService>('issueWizardLauncherService');

export interface IIssueWizardLauncherService {
	readonly _serviceBrand: undefined;
	readonly captureBarActive: boolean;
	launch(options?: IIssueWizardLaunchOptions): Promise<void>;
	addHighlightedScreenshot(): Promise<void>;
}

export class IssueWizardLauncherService extends Disposable implements IIssueWizardLauncherService {
	readonly _serviceBrand: undefined;
	private readonly captureBarDisposables = this._register(new MutableDisposable<DisposableStore>());
	private readonly captureBarActiveContext: IContextKey<boolean>;
	private captureBar: ScreenshotCaptureBar | undefined;
	private captureTarget: IChatWidget | undefined;
	private captureOperation: Promise<void> | undefined;
	get captureBarActive(): boolean { return this.captureBar?.active ?? false; }

	constructor(
		@IAgentHostEnablementService private readonly agentHostEnablementService: IAgentHostEnablementService,
		@INotificationService private readonly notificationService: INotificationService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IEditorService private readonly editorService: IEditorService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IPromptsService private readonly promptsService: IPromptsService,
		@IIssueWizardIntakeService private readonly issueWizardIntakeService: IIssueWizardIntakeService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
	) {
		super();
		this.captureBarActiveContext = IssueWizardCaptureBarActiveContext.bindTo(this.contextKeyService);
		this._register(toDisposable(() => this.captureBarActiveContext.reset()));
		this._register(this.chatWidgetService.onDidRemoveWidget(widget => {
			if (widget === this.captureTarget) {
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
		if (this.chatEntitlementService.sentiment.hidden) {
			this.notificationService.warn(localize('issueWizardUnavailable.aiDisabled', "Issue Wizard is unavailable because AI features are disabled in this window."));
			return;
		}
		if (!this.agentHostEnablementService.enabled.get()) {
			this.notificationService.warn(localize('issueWizardUnavailable.disabled', "Issue Wizard is unavailable because Agent Host is disabled in this window."));
			return;
		}

		const folderUri = this.getInvokingWorkspaceFolder();
		if (!folderUri) {
			this.notificationService.warn(localize('issueWizardUnavailable.noFolder', "Issue Wizard needs an open workspace folder."));
			return;
		}

		await this.createSessionAndSendBootstrap(folderUri, options?.symptom);
	}

	async addHighlightedScreenshot(): Promise<void> {
		const captureBar = this.captureBar;
		if (!captureBar || !this.captureTarget) {
			this.notificationService.warn(localize('issueWizardScreenshot.noActiveSession', "Open an Issue Wizard session before adding a highlighted screenshot."));
			return;
		}
		if (!await captureBar.triggerCapture()) {
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

	private async createSessionAndSendBootstrap(folderUri: URI, symptom: string | undefined): Promise<void> {
		try {
			const agentHostSessionType = this.chatSessionsService.getAllChatSessionContributions()
				.find(contribution => contribution.agentHostProviderId && isLocalAgentHostTarget(contribution.type))?.type;
			if (!agentHostSessionType) {
				throw new Error(localize('issueWizard.error.agentHostUnavailable', "No Agent Host session provider is available."));
			}

			const session = await this.chatWidgetService.openNewAgentHostEditorSession({
				sessionType: agentHostSessionType,
				displayName: localize('issueWizard.sessionName', "Issue Wizard"),
				workspaceFolder: folderUri,
			});
			if (!session) {
				throw new Error(localize('issueWizard.error.chatUnavailable', "Chat session was not created."));
			}
			const { widget: chatWidget } = session;

			const builtinSkills = await this.promptsService.listPromptFilesForStorage(PromptsType.skill, PromptsStorage.builtIn, CancellationToken.None);
			const issueWizardSkill = builtinSkills.find(skill => basename(dirname(skill.uri)) === ISSUE_WIZARD_SLASH_COMMAND);
			if (!issueWizardSkill) {
				throw new Error(localize('issueWizard.error.skillUnavailable', "The bundled Issue Wizard skill could not be loaded."));
			}
			const parsedPrompt = await this.promptsService.parseNew(issueWizardSkill.uri, CancellationToken.None);

			chatWidget.attachmentModel.addContext(toPromptFileVariableEntry(parsedPrompt.uri, PromptFileVariableKind.PromptFile, undefined, true));

			chatWidget.focusInput();
			await chatWidget.acceptInput(this.createBootstrapMessage(symptom?.trim()));
			this.showCaptureBar(chatWidget);
		} catch (error) {
			this.notificationService.error(localize('issueWizardStartFailed', "Issue Wizard failed to start: {0}", toErrorMessage(error)));
		}
	}

	private showCaptureBar(chatWidget: IChatWidget): void {
		this.clearCaptureBar();
		const captureBarDisposables = new DisposableStore();
		this.captureBarDisposables.value = captureBarDisposables;
		const captureBar = captureBarDisposables.add(new ScreenshotCaptureBar(this.layoutService.activeContainer, this.contextMenuService));
		this.captureBar = captureBar;
		this.captureTarget = chatWidget;
		captureBarDisposables.add(chatWidget.onDidFocus(() => captureBar.activate()));
		captureBarDisposables.add(captureBar.onDidChangeActive(active => {
			if (captureBar === this.captureBar) {
				this.captureBarActiveContext.set(active);
			}
		}));
		captureBarDisposables.add(captureBar.onDidRequestScreenshot(() => {
			const operation = this.captureAndAttachScreenshot(chatWidget, captureBar);
			this.captureOperation = operation;
			void operation.finally(() => {
				if (this.captureOperation === operation) {
					this.captureOperation = undefined;
				}
			});
		}));

		this.captureBarActiveContext.set(captureBar.active);
	}

	private async captureAndAttachScreenshot(chatWidget: IChatWidget, captureBar: ScreenshotCaptureBar): Promise<void> {
		captureBar.setCaptureEnabled(false, localize('issueWizardScreenshot.capturing', "Capturing screenshot..."));
		try {
			if (captureBar.shouldHideForCapture) {
				captureBar.hide();
				await timeout(100);
			}

			const attachments = await this.issueWizardIntakeService.collectScreenshot();
			if (!attachments || captureBar !== this.captureBar || chatWidget !== this.captureTarget) {
				return;
			}
			for (const attachment of attachments) {
				chatWidget.attachmentModel.addContext(attachment);
			}
			await this.chatWidgetService.reveal(chatWidget);
			chatWidget.focusInput();
		} catch (error) {
			this.notificationService.error(localize('issueWizardScreenshot.failed', "Issue Wizard could not add the screenshot: {0}", toErrorMessage(error)));
		} finally {
			if (captureBar === this.captureBar) {
				captureBar.show();
				captureBar.setCaptureEnabled(true);
			}
		}
	}

	private clearCaptureBar(): void {
		this.captureBar = undefined;
		this.captureTarget = undefined;
		this.captureOperation = undefined;
		this.captureBarActiveContext.set(false);
		this.captureBarDisposables.clear();
	}

	private createBootstrapMessage(symptom: string | undefined): string {
		const lines = [
			localize('issueWizardBootstrap.skill', "Use the bundled Issue Wizard skill."),
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
