/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as l10n from '@vscode/l10n';
import { BasePromptElementProps, PromptElement, PromptElementProps, PromptSizing, TextChunk } from '@vscode/prompt-tsx';
import type { CancellationToken, LanguageModelToolInvocationOptions, LanguageModelToolInvocationPrepareOptions, PreparedToolInvocation, Uri } from 'vscode';
import { IRunCommandExecutionService } from '../../../../platform/commands/common/runCommandExecutionService';
import { IDialogService } from '../../../../platform/dialog/common/dialogService';
import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import { IFileSystemService } from '../../../../platform/filesystem/common/fileSystemService';
import { IInteractiveSessionService } from '../../../../platform/interactive/common/interactiveSessionService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { CancellationError } from '../../../../util/vs/base/common/errors';
import { extUri } from '../../../../util/vs/base/common/resources';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelPromptTsxPart, LanguageModelTextPart, LanguageModelToolResult } from '../../../../vscodeTypes';
import { saveNewWorkspaceContext } from '../../../getting-started/common/newWorkspaceContext';
import { renderPromptElementJSON } from '../../../prompts/node/base/promptRenderer';
import { UnsafeCodeBlock } from '../../../prompts/node/panel/unsafeElements';
import { ToolName } from '../../common/toolNames';
import { ICopilotTool, ToolRegistry } from '../../common/toolsRegistry';

export interface INewWorkspaceToolParams {
	query: string;
}

export class GetNewWorkspaceTool implements ICopilotTool<INewWorkspaceToolParams> {
	public static readonly toolName = ToolName.CreateNewWorkspace;

	private _shouldPromptWorkspaceOpen: boolean = false;
	constructor(
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IFileSystemService private readonly fileSystemService: IFileSystemService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IDialogService private readonly dialogService: IDialogService,
		@IVSCodeExtensionContext private readonly _extensionContext: IVSCodeExtensionContext,
		@IInteractiveSessionService private readonly interactiveSession: IInteractiveSessionService,
		@IRunCommandExecutionService private readonly commandService: IRunCommandExecutionService,
	) { }

	async prepareInvocation?(options: LanguageModelToolInvocationPrepareOptions<INewWorkspaceToolParams>, token: CancellationToken): Promise<PreparedToolInvocation> {

		this._shouldPromptWorkspaceOpen = false;
		const workspace = this.workspaceService.getWorkspaceFolders();
		if (!workspace || workspace.length === 0) {
			this._shouldPromptWorkspaceOpen = true;
		}
		else if (workspace && workspace.length > 0) {
			this._shouldPromptWorkspaceOpen = (await this.fileSystemService.readDirectory(workspace[0])).length > 0;
		}
		if (this._shouldPromptWorkspaceOpen) {
			const confirmationMessages = {
				title: l10n.t`Open an empty folder to continue`,
				message: l10n.t`Copilot requires an empty folder as a workspace to continue workspace creation.`
			};

			return {
				confirmationMessages,
			};
		}

		return {
			invocationMessage: l10n.t`Generating plan to create a new workspace`,
		};
	}

	async invoke(options: LanguageModelToolInvocationOptions<INewWorkspaceToolParams>, token: CancellationToken): Promise<LanguageModelToolResult> {

		if (token.isCancellationRequested) {
			throw new CancellationError();
		}

		const workspace = this.workspaceService.getWorkspaceFolders();
		let workspaceUri: Uri | undefined = workspace.length > 0 ? workspace[0] : undefined;

		if (this._shouldPromptWorkspaceOpen) {
			const newWorkspaceUri = (await this.dialogService.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: 'Select an Empty Workspace Folder' }))?.[0];
			if (newWorkspaceUri && !extUri.isEqual(newWorkspaceUri, workspaceUri)) {

				if ((await this.fileSystemService.readDirectory(newWorkspaceUri)).length > 0) {
					return new LanguageModelToolResult([
						new LanguageModelTextPart('The user has not opened a valid workspace folder in VS Code. Ask them to open an empty folder before continuing.')
					]);
				}

				saveNewWorkspaceContext({
					workspaceURI: newWorkspaceUri.toString(),
					userPrompt: options.input.query,
					initialized: false, /*not already opened */
				}, this._extensionContext);

				workspaceUri = newWorkspaceUri;
				this.commandService.executeCommand('setContext', 'chatSkipRequestInProgressMessage', true);
				await this.interactiveSession.transferActiveChat(newWorkspaceUri);
				this.commandService.executeCommand('vscode.openFolder', newWorkspaceUri, { forceReuseWindow: true });

				return new LanguageModelToolResult([
					new LanguageModelTextPart(`The user is opening the folder ${newWorkspaceUri.toString()}. Do not proceed with project generation till the user has confirmed opening the folder.`)
				]);
			}

			return new LanguageModelToolResult([
				new LanguageModelTextPart('The user has not opened a valid workspace folder in VS Code. Ask them to open an empty folder before continuing.')
			]);
		}

		if (!workspaceUri) {
			return new LanguageModelToolResult([
				new LanguageModelTextPart('The user has not opened a valid workspace folder in VS Code. Ask them to open an empty folder before continuing.')
			]);
		}

		const json = await renderPromptElementJSON(this.instantiationService, NewWorkspaceCreationResult, { query: options.input.query },);
		return new LanguageModelToolResult([
			new LanguageModelPromptTsxPart(json),
		]);
	}
}

export class NewWorkspaceCreationResult extends PromptElement<NewWorkspaceElementProps> {
	constructor(
		props: PromptElementProps<NewWorkspaceElementProps>,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IRunCommandExecutionService private readonly commandService: IRunCommandExecutionService,
	) {
		super(props);
	}

	override async render(state: void, sizing: PromptSizing) {
		const workspace = this.workspaceService.getWorkspaceFolders();
		const workspaceUri: Uri | undefined = workspace.length > 0 ? workspace[0] : undefined;

		if (!workspaceUri) {
			return <TextChunk>
				The user has not opened an empty workspace folder in VS Code. Ask them to open an empty folder before continuing.<br />
			</TextChunk>;
		}

		// For https://github.com/microsoft/vscode/issues/258252
		this.commandService.executeCommand('workbench.action.terminal.focus');

		return <>
			<TextChunk>
				Create or update the copilot-instructions.md file in the .github directory with the exact content shown below.<br />
				<br />
			</TextChunk>
			<UnsafeCodeBlock code={`
<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->
- [ ] Verify that the copilot-instructions.md file in the .github directory is created.

- [ ] Clarify Project Requirements
	<!-- Ask for project type, language, and frameworks if not specified. Skip if already provided. -->

- [ ] Scaffold the Project
	<!--
	Ensure that the previous step has been marked as completed.
	Call project setup tool with projectType parameter.
	Run scaffolding command to create project files and folders.
	Use '.' as the working directory.
	If no appropriate projectType is available, search documentation using available tools.
	Otherwise, create the project structure manually using available file creation tools.
	-->

- [ ] Customize the Project
	<!--
	Verify that all previous steps have been completed successfully and you have marked the step as completed.
	Develop a plan to modify codebase according to user requirements.
	Apply modifications using appropriate tools and user-provided references.
	Skip this step for "Hello World" projects.
	-->

- [ ] Install Required Extensions
	<!-- ONLY install extensions provided mentioned in the ${ToolName.GetProjectSetupInfo}. Skip this step otherwise and mark as completed. -->

- [ ] Compile the Project
	<!--
	Verify that all previous steps have been completed.
	Install any missing dependencies.
	Run diagnostics and resolve any issues.
	Check for markdown files in project folder for relevant instructions on how to do this.
	-->

- [ ] Create and Run Task
	<!--
	Verify that all previous steps have been completed.
	Check https://code.visualstudio.com/docs/debugtest/tasks to determine if the project needs a task. If so, use the ${ToolName.CoreCreateAndRunTask} to create and launch a task based on package.json, README.md, and project structure.
	Skip this step otherwise.
	 -->

- [ ] Launch the Project
	<!--
	Verify that all previous steps have been completed.
	Prompt user for debug mode, launch only if confirmed.
	 -->

- [ ] Ensure Documentation is Complete
	<!--
	Verify that all previous steps have been completed.
	Verify that README.md and the copilot-instructions.md file in the .github directory exists and contains current project information.
	Clean up the copilot-instructions.md file in the .github directory by removing all HTML comments.
	 -->

<!--
## Execution Guidelines
PROGRESS TRACKING:
- If any tools are available to manage the above todo list, use it to track progress through this checklist.
- After completing each step, mark it complete and add a summary.
- Read current todo list status before starting each new step.

COMMUNICATION RULES:
- Avoid verbose explanations or printing full command outputs.
- If a step is skipped, state that briefly (e.g. "No extensions needed").
- Do not explain project structure unless asked.
- Keep explanations concise and focused.

DEVELOPMENT RULES:
- Use '.' as the working directory unless user specifies otherwise.
- Avoid adding media or external links unless explicitly requested.
- Use placeholders only with a note that they should be replaced.
- Use VS Code API tool only for VS Code extension projects.
- Once the project is created, it is already opened in Visual Studio Code—do not suggest commands to open this project in Visual Studio again.
- If the project setup information has additional rules, follow them strictly.

FOLDER CREATION RULES:
- Always use the current directory as the project root.
- If you are running any terminal commands, use the '.' argument to ensure that the current working directory is used ALWAYS.
- Do not create a new folder unless the user explicitly requests it besides a .vscode folder for a tasks.json file.
- If any of the scaffolding commands mention that the folder name is not correct, let the user know to create a new folder with the correct name and then reopen it again in vscode.

EXTENSION INSTALLATION RULES:
- Only install extension specified by the ${ToolName.GetProjectSetupInfo} tool. DO NOT INSTALL any other extensions.

PROJECT CONTENT RULES:
- If the user has not specified project details, assume they want a "Hello World" project as a starting point.
- Avoid adding links of any type (URLs, files, folders, etc.) or integrations that are not explicitly required.
- Avoid generating images, videos, or any other media files unless explicitly requested.
- If you need to use any media assets as placeholders, let the user know that these are placeholders and should be replaced with the actual assets later.
- Ensure all generated components serve a clear purpose within the user's requested workflow.
- If a feature is assumed but not confirmed, prompt the user for clarification before including it.
- If you are working on a VS Code extension, use the VS Code API tool with a query to find relevant VS Code API references and samples related to that query.

TASK COMPLETION RULES:
- Your task is complete when:
  - Project is successfully scaffolded and compiled without errors
  - copilot-instructions.md file in the .github directory exists in the project
  - README.md file exists and is up to date
  - User is provided with clear instructions to debug/launch the project

Before starting a new task in the above plan, update progress in the plan.
-->
- Work through each checklist item systematically.
- Keep communication concise and focused.
- Follow development best practices.
`} languageId='markdown'></UnsafeCodeBlock>
			<TextChunk>
				<br />
				Verify that a copilot-instructions.md file in the .github directory exists and systematically work through each item in the task list.<br />
				Update the copilot-instructions.md file in the .github directory directly as you complete each step.<br />
				<br />
				If the user asks to "continue," refer to the previous steps and proceed accordingly.
			</TextChunk>
		</>;
	}
}

ToolRegistry.registerTool(GetNewWorkspaceTool);

interface NewWorkspaceElementProps extends BasePromptElementProps {
	query: string;
}