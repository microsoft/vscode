/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ITasksService } from '../../../platform/tasks/common/tasksService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { URI } from '../../../util/vs/base/common/uri';
import { generateSTest } from '../../conversation/vscode-node/feedbackReporter';
import { IConversationStore } from '../../conversationStore/node/conversationStore';
import { ILaunchConfigService, needsWorkspaceFolderForTaskError } from '../../onboardDebug/common/launchConfigService';
import { IStartDebuggingParsedResponse } from '../../onboardDebug/node/parseLaunchConfigFromResponse';
import { IFeedbackReporter } from '../node/feedbackReporter';

export class DebugCommandsContribution extends Disposable {
	constructor(
		@IConversationStore private readonly _conversationStore: IConversationStore,
		@ILaunchConfigService private readonly launchConfigService: ILaunchConfigService,
		@IFeedbackReporter private readonly feedbackReporter: IFeedbackReporter,
		@ITasksService private readonly tasksService: ITasksService,
	) {
		super();

		this._register(vscode.commands.registerCommand('github.copilot.debug.generateSTest', async () => {
			if (!this.feedbackReporter.canReport) {
				return;
			}
			const lastTurn = this._conversationStore.lastConversation?.getLatestTurn();
			if (lastTurn) {
				const sTestValue = await generateSTest(lastTurn);
				if (sTestValue) {
					vscode.env.clipboard.writeText(sTestValue.join('\n'));
					vscode.window.showInformationMessage('STest copied to clipboard');
				}
			}
		}));
		const ensureTask = async (workspaceFolder: URI | undefined, config: IStartDebuggingParsedResponse) => {
			const wf = workspaceFolder || vscode.workspace.workspaceFolders?.[0].uri;
			if (!wf) {
				vscode.window.showErrorMessage(needsWorkspaceFolderForTaskError());
				return;
			}

			if (config.tasks?.length) {
				await this.tasksService.ensureTask(wf, config.tasks[0]);
			}
		};

		this._register(vscode.commands.registerCommand('github.copilot.createLaunchJsonFileWithContents', async (launchConfig: IStartDebuggingParsedResponse) => {
			// Define the path for the .vscode/launch.json file
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders?.length) {
				vscode.window.showErrorMessage('No workspace folder is open.');
				return;
			}

			await ensureTask(workspaceFolders[0].uri, launchConfig);
			await launchConfigService.add(workspaceFolders[0].uri, launchConfig);
			await launchConfigService.show(workspaceFolders[0].uri, launchConfig.configurations[0].name);
		}));
		this._register((vscode.commands.registerCommand('github.copilot.startDebugging', async (config: IStartDebuggingParsedResponse, progress) => {
			const result = await this.launchConfigService.resolveConfigurationInputs(config);
			if (result?.config) {
				await ensureTask(undefined, config);
				await this.launchConfigService.launch(result?.config);
				progress.progress(vscode.l10n.t('Started debugging {0}', result.config.name));
				return;
			} else {
				progress.markdown(vscode.l10n.t('Could not start debugging. Please try again.'));
				return;
			}
		})));
	}
}
