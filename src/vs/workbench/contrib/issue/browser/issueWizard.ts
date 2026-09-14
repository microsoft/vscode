/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IAgentHostEnablementService } from '../../../../platform/agentHost/common/agentHostEnablementService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor, createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IWorkbenchContribution, Extensions, IWorkbenchContributionsRegistry } from '../../../common/contributions.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IChatWidgetService } from '../../chat/browser/chat.js';
import { ACTION_ID_OPEN_CHAT } from '../../chat/browser/actions/chatActions.js';
import { ICustomizationHarnessService } from '../../chat/common/customizationHarnessService.js';
import { PromptFileVariableKind, toPromptFileVariableEntry } from '../../chat/common/attachments/chatVariableEntries.js';
import { IIssueWizardIntakeResult, IIssueWizardIntakeService, IIssueWizardLaunchOptions, IssueWizardIntakeService } from './issueWizardIntakeService.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';

export const ISSUE_WIZARD_COMMAND_ID = 'workbench.action.help.troubleshootWithIssueWizard';
const ISSUE_WIZARD_SLASH_COMMAND = 'issue-wizard';

export const IIssueWizardLauncherService = createDecorator<IIssueWizardLauncherService>('issueWizardLauncherService');

export interface IIssueWizardLauncherService {
	readonly _serviceBrand: undefined;
	launch(options?: IIssueWizardLaunchOptions): Promise<void>;
}

class IssueWizardLauncherService implements IIssueWizardLauncherService {
	readonly _serviceBrand: undefined;

	constructor(
		@IAgentHostEnablementService private readonly agentHostEnablementService: IAgentHostEnablementService,
		@INotificationService private readonly notificationService: INotificationService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IEditorService private readonly editorService: IEditorService,
		@ICommandService private readonly commandService: ICommandService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@ICustomizationHarnessService private readonly customizationHarnessService: ICustomizationHarnessService,
		@IIssueWizardIntakeService private readonly issueWizardIntakeService: IIssueWizardIntakeService,
	) { }

	async launch(options?: IIssueWizardLaunchOptions): Promise<void> {
		if (!this.agentHostEnablementService.enabled.get()) {
			this.notificationService.warn(localize('issueWizardUnavailable.disabled', "Issue Wizard is unavailable because Agent Host is disabled in this window."));
			return;
		}

		const folderUri = this.getInvokingWorkspaceFolder();
		if (!folderUri) {
			this.notificationService.warn(localize('issueWizardUnavailable.noFolder', "Issue Wizard needs an open workspace folder."));
			return;
		}

		const intake = await this.issueWizardIntakeService.collect(options);
		await this.createSessionAndSendBootstrap(intake);
	}

	private getInvokingWorkspaceFolder(): URI | undefined {
		const folders = this.workspaceContextService.getWorkspace().folders;
		if (folders.length <= 1) {
			return folders[0]?.uri;
		}

		const activeResource = EditorResourceAccessor.getOriginalUri(this.editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
		return activeResource ? this.workspaceContextService.getWorkspaceFolder(activeResource)?.uri : folders[0]?.uri;
	}

	private async createSessionAndSendBootstrap(intake: IIssueWizardIntakeResult): Promise<void> {
		try {
			await this.commandService.executeCommand(ACTION_ID_OPEN_CHAT);

			const chatWidget = this.chatWidgetService.lastFocusedWidget;
			const sessionResource = chatWidget?.viewModel?.model.sessionResource;
			if (!chatWidget || !sessionResource) {
				throw new Error(localize('issueWizard.error.chatUnavailable', "Chat session was not created."));
			}

			const attachedContext = [...(intake.attachedContext ?? [])];
			const slashCommand = await this.customizationHarnessService.resolvePromptSlashCommand(ISSUE_WIZARD_SLASH_COMMAND, sessionResource, CancellationToken.None);
			const parsedPrompt = slashCommand?.parsedPromptFile;
			if (parsedPrompt) {
				attachedContext.unshift(toPromptFileVariableEntry(parsedPrompt.uri, PromptFileVariableKind.PromptFile, undefined, true));
			}

			for (const attachment of attachedContext) {
				chatWidget.attachmentModel.addContext(attachment);
			}

			await chatWidget.acceptInput(this.createBootstrapMessage(intake.symptom));
		} catch (error) {
			this.notificationService.error(localize('issueWizardStartFailed', "Issue Wizard failed to start: {0}", toErrorMessage(error)));
		}
	}

	private createBootstrapMessage(symptom: string | undefined): string {
		const lines = [
			`/${ISSUE_WIZARD_SLASH_COMMAND}`,
			localize('issueWizardBootstrap.message', "Help me troubleshoot a VS Code issue."),
		];

		if (symptom) {
			lines.push(localize('issueWizardBootstrap.symptom', "Symptom: {0}", symptom));
		}

		return lines.join('\n');
	}
}

registerSingleton(IIssueWizardIntakeService, IssueWizardIntakeService, InstantiationType.Delayed);
registerSingleton(IIssueWizardLauncherService, IssueWizardLauncherService, InstantiationType.Delayed);

registerAction2(class LaunchIssueWizardAction extends Action2 {
	constructor() {
		super({
			id: ISSUE_WIZARD_COMMAND_ID,
			title: localize2('troubleshootWithIssueWizard', "Troubleshoot with Issue Wizard..."),
			category: Categories.Help,
			f1: true,
		});
	}

	override async run(accessor: ServicesAccessor, options?: IIssueWizardLaunchOptions): Promise<void> {
		const launcher = accessor.get(IIssueWizardLauncherService);
		await launcher.launch(options);
	}
});

MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
	group: '3_feedback',
	order: 2,
	command: {
		id: ISSUE_WIZARD_COMMAND_ID,
		title: localize({ key: 'miTroubleshootWithIssueWizard', comment: ['&& denotes a mnemonic'] }, "Troubleshoot with &&Issue Wizard..."),
	},
});

class IssueWizardStatusbarContribution implements IWorkbenchContribution {
	constructor(
		@IStatusbarService statusbarService: IStatusbarService,
	) {
		statusbarService.addEntry({
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
}

Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench).registerWorkbenchContribution(IssueWizardStatusbarContribution, LifecyclePhase.Restored);
