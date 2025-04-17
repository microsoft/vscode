/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from './commandManager';

/**
 * Command that enables TypeScript Go by modifying the configuration setting
 * and prompting the user to reload VS Code.
 */
export class EnableTsgoCommand implements Command {
	public readonly id = 'typescript.enableTsgo';

	public async execute(): Promise<void> {
		await updateTsgoSetting(true);
	}
}

/**
 * Command that disables TypeScript Go by modifying the configuration setting
 * and prompting the user to reload VS Code.
 */
export class DisableTsgoCommand implements Command {
	public readonly id = 'typescript.disableTsgo';

	public async execute(): Promise<void> {
		await updateTsgoSetting(false);
	}
}

/**
 * Updates the TypeScript Go setting and prompts for reload.
 *
 * @param enable Whether to enable or disable TypeScript Go
 */
async function updateTsgoSetting(enable: boolean): Promise<void> {
	const tsgoExtension = vscode.extensions.getExtension('typescript.typescript-lsp');
	// Error if the TypeScript Go extension is not installed with a button to open the GitHub repo
	if (!tsgoExtension) {
		return vscode.window.showErrorMessage(
			'The TypeScript Go extension is not installed.',
			{
				title: 'Open on GitHub',
				isCloseAffordance: true,
			}
		).then(async (selection) => {
			if (selection) {
				await vscode.env.openExternal(vscode.Uri.parse('https://github.com/microsoft/typescript-go'));
			}
		});
	}

	const tsConfig = vscode.workspace.getConfiguration('typescript');
	const currentValue = tsConfig.get<boolean>('useTsgo', false);
	if (currentValue === enable) {
		return;
	}

	// Determine the target scope for the configuration update
	let target = vscode.ConfigurationTarget.Global;
	const inspect = tsConfig.inspect<boolean>('useTsgo');
	if (inspect?.workspaceValue !== undefined) {
		target = vscode.ConfigurationTarget.Workspace;
	} else if (inspect?.workspaceFolderValue !== undefined) {
		target = vscode.ConfigurationTarget.WorkspaceFolder;
	} else {
		// If setting is not defined yet, use the same scope as typescript-go.executablePath
		const tsgoConfig = vscode.workspace.getConfiguration('typescript-go');
		const tsgoInspect = tsgoConfig.inspect<string>('executablePath');

		if (tsgoInspect?.workspaceValue !== undefined) {
			target = vscode.ConfigurationTarget.Workspace;
		} else if (tsgoInspect?.workspaceFolderValue !== undefined) {
			target = vscode.ConfigurationTarget.WorkspaceFolder;
		}
	}

	// Update the setting, restart the extension host, and enable the TypeScript Go extension
	await tsConfig.update('useTsgo', enable, target);
	await vscode.commands.executeCommand('workbench.action.restartExtensionHost');
}
