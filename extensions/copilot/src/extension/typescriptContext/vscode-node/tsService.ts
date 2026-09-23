/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';

export namespace TypeScript {

	const unifiedSection = 'js/ts';
	const legacySection = 'typescript';
	const useTsgoKey = 'experimental.useTsgo';
	const version7ExtensionIds = ['typescriptteam.vscode-typescript', 'typescriptteam.native-preview'] as const;

	export const versionKey = `${unifiedSection}.${useTsgoKey}`;
	export const legacyVersionKey = `${legacySection}.${useTsgoKey}`;

	export function runsVersion7(): boolean {
		// Mirrors `readUnifiedConfig` in the TypeScript extension: the unified setting wins whenever the user set it,
		// otherwise the deprecated `typescript.experimental.useTsgo` still applies.
		const unified = vscode.workspace.getConfiguration(unifiedSection);
		if (hasUserValue(unified.inspect<boolean>(useTsgoKey))) {
			return unified.get<boolean>(useTsgoKey, false) === true;
		}
		return vscode.workspace.getConfiguration(legacySection).get<boolean>(useTsgoKey, false) === true;
	}

	export function affectsVersion(e: vscode.ConfigurationChangeEvent): boolean {
		return e.affectsConfiguration(versionKey) || e.affectsConfiguration(legacyVersionKey);
	}

	export function isVersion7SupportEnabled(configurationService: IConfigurationService): boolean {
		return configurationService.getConfig(ConfigKey.TypeScript7LanguageContext) ?? false;
	}

	export function getVersion7Extension<T>(getExtension: (extensionId: string) => vscode.Extension<T> | undefined = extensionId => vscode.extensions.getExtension<T>(extensionId)): vscode.Extension<T> | undefined {
		for (const extensionId of version7ExtensionIds) {
			const extension = getExtension(extensionId);
			if (extension !== undefined) {
				return extension;
			}
		}
		return undefined;
	}

	function hasUserValue(inspect: ReturnType<vscode.WorkspaceConfiguration['inspect']>): boolean {
		return inspect !== undefined && (
			inspect.globalValue !== undefined ||
			inspect.workspaceValue !== undefined ||
			inspect.workspaceFolderValue !== undefined ||
			inspect.globalLanguageValue !== undefined ||
			inspect.workspaceLanguageValue !== undefined ||
			inspect.workspaceFolderLanguageValue !== undefined
		);
	}
}
