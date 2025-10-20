/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command } from './commandManager';

export const tsNativeExtensionId = 'typescriptteam.native-preview';

export class EnableTsgoCommand implements Command {
	public readonly id = 'typescript.experimental.enableTsgo';

	public async execute(): Promise<void> {
		await updateTsgoSetting(true);
	}
}

export class DisableTsgoCommand implements Command {
	public readonly id = 'typescript.experimental.disableTsgo';

	public async execute(): Promise<void> {
		await updateTsgoSetting(false);
	}
}

/**
 * Updates the TypeScript Go setting and reloads extension host.
 * @param enable Whether to enable or disable TypeScript Go
 */
async function updateTsgoSetting(enable: boolean): Promise<void> {
	const tsgoExtension = vscode.extensions.getExtension(tsNativeExtensionId);
	// Error if the TypeScript Go extension is not installed with a button to open the GitHub repo
	if (!tsgoExtension) {
		const selection = await vscode.window.showErrorMessage(
			vscode.l10n.t('The TypeScript Go extension is not installed.'),
			{
				title: vscode.l10n.t('Open on GitHub'),
				isCloseAffordance: true,
			}
		);

		if (selection) {
			await vscode.env.openExternal(vscode.Uri.parse('https://github.com/microsoft/typescript-go'));
		}
	}

	const tsConfig = vscode.workspace.getConfiguration('typescript');
	const currentValue = tsConfig.get<boolean>('experimental.useTsgo', false);
	if (currentValue === enable) {
		return;
	}

	// Determine the target scope for the configuration update
	let target = vscode.ConfigurationTarget.Global;
	const inspect = tsConfig.inspect<boolean>('experimental.useTsgo');
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

	await tsConfig.update('experimental.useTsgo', enable, target);
}
