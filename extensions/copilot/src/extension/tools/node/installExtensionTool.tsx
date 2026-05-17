/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';
import { IRunCommandExecutionService } from '../../../platform/commands/common/runCommandExecutionService';
import { IEnvService } from '../../../platform/env/common/envService';
import { IExtensionsService } from '../../../platform/extensions/common/extensionsService';
import { timeout } from '../../../util/vs/base/common/async';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { StopWatch } from '../../../util/vs/base/common/stopwatch';
import { LanguageModelTextPart, LanguageModelToolResult, MarkdownString } from '../../../vscodeTypes';
import { ToolName } from '../common/toolNames';
import { ToolRegistry } from '../common/toolsRegistry';
import { IToolsService } from '../common/toolsService';

export interface IInstallExtensionToolInput {
	id: string;
	name: string;
}

class InstallExtensionTool implements vscode.LanguageModelTool<IInstallExtensionToolInput> {

	public static readonly toolName = ToolName.InstallExtension;

	constructor(
		@IRunCommandExecutionService private readonly _commandService: IRunCommandExecutionService,
		@IExtensionsService private readonly _extensionsService: IExtensionsService,
		@IEnvService private readonly envService: IEnvService,
		@IToolsService private readonly toolsService: IToolsService,
	) { }

	async invoke(options: vscode.LanguageModelToolInvocationOptions<IInstallExtensionToolInput>, token: CancellationToken): Promise<vscode.LanguageModelToolResult> {
		const extensionId = options.input.id;
		const existingExtension = this._extensionsService.getExtension(extensionId);
		if (existingExtension) {
			return new LanguageModelToolResult([new LanguageModelTextPart(`${options.input.name} extension is already installed`)]);
		}

		const insiders = this.envService.getEditorInfo().version.includes('insider');
		const args = [extensionId, { enable: true, installPreReleaseVersion: insiders ? true : false }];
		const exe = this._commandService.executeCommand('workbench.extensions.installExtension', ...args);
		try {
			await this.waitForExtensionInstall(exe, extensionId);
			return new LanguageModelToolResult([new LanguageModelTextPart(`Installed ${options.input.name} extension successfully`)]);
		} catch (error) {
			return new LanguageModelToolResult([new LanguageModelTextPart(`Failed to install ${options.input.name} extension.`)]);
		}
	}

	private async waitForExtensionInstall(prom: Promise<void>, extensionId: string) {
		await prom;
		let extension: vscode.Extension<any> | undefined;
		const maxTime = 2_000;
		const stopWatch = new StopWatch();

		do {
			extension = this._extensionsService.getExtension(extensionId);
			if (extension) {
				// If extension contributes any tools, then wait for the tools to be registered.
				const languageModelTools = extension.packageJSON.contributes?.languageModelTools;
				if (languageModelTools && Array.isArray(languageModelTools) && languageModelTools.length) {
					if (languageModelTools.every((tool) => this.toolsService.getTool(tool.name))) {
						return;
					}
				} else {
					return;
				}
			}
			await timeout(100);
		} while (stopWatch.elapsed() < maxTime);

		if (!extension) {
			throw new Error(`Failed to install extension ${extensionId}.`);
		}
	}

	async prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<IInstallExtensionToolInput>, token: vscode.CancellationToken): Promise<vscode.PreparedToolInvocation> {
		const extensionId = options.input.id;
		if (!extensionId) {
			throw new Error('No extension ID provided');
		}

		const existingExtension = this._extensionsService.getExtension(extensionId);
		if (existingExtension) {
			return {
				invocationMessage: l10n.t`${options.input.name} extension is already installed`
			};
		}

		const query = encodeURIComponent(JSON.stringify([[extensionId]]));
		const markdownString = new MarkdownString(l10n.t(`Copilot will install the extension [{0}](command:workbench.extensions.action.showExtensionsWithIds?{1}) and its dependencies.`, options.input.name, query));
		markdownString.isTrusted = { enabledCommands: ['workbench.extensions.action.showExtensionsWithIds'] };
		return {
			invocationMessage: l10n.t`Installing extension ${options.input.name}`,
			confirmationMessages: {
				title: l10n.t`Install Extension ${options.input.name}?`,
				message: markdownString,
			},
		};
	}
}

ToolRegistry.registerTool(InstallExtensionTool);
