/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export type UnifiedConfigurationScope = vscode.TextDocument | null | undefined;

export const unifiedConfigSection = 'js/ts';

export type ReadUnifiedConfigOptions = {
	readonly scope?: UnifiedConfigurationScope;
	readonly fallbackSection: string;
	readonly fallbackSubSectionNameOverride?: string;
};

/**
 * Gets a configuration value, checking the unified `js/ts` setting first,
 * then falling back to the language-specific setting.
 */
export function readUnifiedConfig<T>(
	subSectionName: string,
	defaultValue: T,
	options: ReadUnifiedConfigOptions
): T {
	// Check unified setting first
	const unifiedConfig = vscode.workspace.getConfiguration(unifiedConfigSection, options.scope);
	const unifiedInspect = unifiedConfig.inspect<T>(subSectionName);
	if (hasModifiedValue(unifiedInspect)) {
		return unifiedConfig.get<T>(subSectionName, defaultValue);
	}

	// Fall back to language-specific setting
	const languageConfig = vscode.workspace.getConfiguration(options.fallbackSection, options.scope);
	return languageConfig.get<T>(options.fallbackSubSectionNameOverride ?? subSectionName, defaultValue);
}

/**
 * Checks if an inspected configuration value has any user-defined values set.
 */
function hasModifiedValue(inspect: ReturnType<vscode.WorkspaceConfiguration['inspect']>): boolean {
	if (!inspect) {
		return false;
	}

	return (
		typeof inspect.globalValue !== 'undefined'
		|| typeof inspect.workspaceValue !== 'undefined'
		|| typeof inspect.workspaceFolderValue !== 'undefined'
		|| typeof inspect.globalLanguageValue !== 'undefined'
		|| typeof inspect.workspaceLanguageValue !== 'undefined'
		|| typeof inspect.workspaceFolderLanguageValue !== 'undefined'
		|| ((inspect.languageIds?.length ?? 0) > 0)
	);
}

/**
 * Checks if a unified configuration value has been modified from its default value.
 */
export function hasModifiedUnifiedConfig(
	subSectionName: string,
	options: {
		readonly scope?: UnifiedConfigurationScope;
		readonly fallbackSection: string;
	}
): boolean {
	// Check unified setting
	const unifiedConfig = vscode.workspace.getConfiguration(unifiedConfigSection, options.scope);
	if (hasModifiedValue(unifiedConfig.inspect(subSectionName))) {
		return true;
	}

	// Check language-specific setting
	const languageConfig = vscode.workspace.getConfiguration(options.fallbackSection, options.scope);
	return hasModifiedValue(languageConfig.inspect(subSectionName));
}
