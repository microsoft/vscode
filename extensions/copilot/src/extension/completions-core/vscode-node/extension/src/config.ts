/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { WorkspaceConfiguration } from 'vscode';
import * as vscode from 'vscode';
import { DisposableStore, IDisposable } from '../../../../../util/vs/base/common/lifecycle';
import { IInstantiationService, ServicesAccessor } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import {
	ConfigKey,
	ConfigKeyType,
	ConfigProvider, getConfigDefaultForKey,
	getConfigKeyRecursively,
	getOptionalConfigDefaultForKey,
	ICompletionsConfigProvider,
	ICompletionsEditorAndPluginInfo,
	packageJson
} from '../../lib/src/config';
import { CopilotConfigPrefix } from '../../lib/src/constants';
import { Logger } from '../../lib/src/logger';
import { transformEvent } from '../../lib/src/util/event';

const logger = new Logger('extensionConfig');

export class VSCodeConfigProvider extends ConfigProvider implements IDisposable {
	private config: WorkspaceConfiguration;
	private readonly _disposables = new DisposableStore();

	constructor() {
		super();
		this.config = vscode.workspace.getConfiguration(CopilotConfigPrefix);

		// Reload cached config if a workspace config change effects Copilot namespace
		this._disposables.add(vscode.workspace.onDidChangeConfiguration(changeEvent => {
			if (changeEvent.affectsConfiguration(CopilotConfigPrefix)) {
				this.config = vscode.workspace.getConfiguration(CopilotConfigPrefix);
			}
		}));
	}

	dispose(): void {
		this._disposables.dispose();
	}

	override getConfig<T>(key: ConfigKeyType): T {
		return getConfigKeyRecursively<T>(this.config, key) ?? getConfigDefaultForKey(key);
	}

	override getOptionalConfig<T>(key: ConfigKeyType): T | undefined {
		return getConfigKeyRecursively<T>(this.config, key) ?? getOptionalConfigDefaultForKey(key);
	}

	// Dumps config settings defined in the extension json
	override dumpForTelemetry(): { [key: string]: string } {
		return {};
	}

	override onDidChangeCopilotSettings: ConfigProvider['onDidChangeCopilotSettings'] = transformEvent(
		vscode.workspace.onDidChangeConfiguration,
		event => {
			if (event.affectsConfiguration('github.copilot')) {
				return this;
			}
			if (event.affectsConfiguration('github.copilot-chat')) {
				return this;
			}
		}
	);
}

// From vscode's src/vs/platform/telemetry/common/telemetryUtils.ts
const telemetryAllowedAuthorities = new Set([
	'ssh-remote',
	'dev-container',
	'attached-container',
	'wsl',
	'tunnel',
	'codespaces',
	'amlext',
]);

export class VSCodeEditorInfo implements ICompletionsEditorAndPluginInfo {
	declare _serviceBrand: undefined;
	getEditorInfo() {
		let devName = vscode.env.uriScheme;
		if (vscode.version.endsWith('-insider')) {
			devName = devName.replace(/-insiders$/, '');
		}
		const remoteName = vscode.env.remoteName;
		if (remoteName) {
			devName += `@${telemetryAllowedAuthorities.has(remoteName) ? remoteName : 'other'}`;
		}
		return {
			name: 'vscode',
			readableName: vscode.env.appName.replace(/ - Insiders$/, ''),
			devName: devName,
			version: vscode.version,
			root: vscode.env.appRoot,
		};
	}
	getEditorPluginInfo() {
		return { name: 'copilot-chat', readableName: 'GitHub Copilot for Visual Studio Code', version: packageJson.version };
	}
	getRelatedPluginInfo() {
		// Any additions to this list should also be added as a known filter in
		// lib/src/experiments/filters.ts
		return [
			'ms-vscode.cpptools',
			'ms-vscode.cmake-tools',
			'ms-vscode.makefile-tools',
			'ms-dotnettools.csdevkit',
			'ms-python.python',
			'ms-python.vscode-pylance',
			'vscjava.vscode-java-pack',
			'vscjava.vscode-java-dependency',
			'vscode.typescript-language-features',
			'ms-vscode.vscode-typescript-next',
			'ms-dotnettools.csharp',
			'github.copilot-chat',
		]
			.map(name => {
				const extpj = vscode.extensions.getExtension(name)?.packageJSON as unknown;
				if (extpj && typeof extpj === 'object' && 'version' in extpj && typeof extpj.version === 'string') {
					return { name, version: extpj.version };
				}
			})
			.filter(plugin => plugin !== undefined);
	}
}

type EnabledConfigKeyType = { [key: string]: boolean };

function getEnabledConfigObject(accessor: ServicesAccessor): EnabledConfigKeyType {
	const configProvider = accessor.get(ICompletionsConfigProvider);
	return { '*': true, ...(configProvider.getConfig<EnabledConfigKeyType>(ConfigKey.Enable) ?? {}) };
}

function getEnabledConfig(accessor: ServicesAccessor, languageId: string): boolean {
	const obj = getEnabledConfigObject(accessor);
	return obj[languageId] ?? obj['*'] ?? true;
}

/**
 * Checks if automatic completions are enabled for the current document by all Copilot completion settings.
 * Excludes the `editor.inlineSuggest.enabled` setting.
 * Return undefined if there is no current document.
 */
export function isCompletionEnabled(accessor: ServicesAccessor): boolean | undefined {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return undefined;
	}
	return isCompletionEnabledForDocument(accessor, editor.document);
}

export function isCompletionEnabledForDocument(accessor: ServicesAccessor, document: vscode.TextDocument): boolean {
	return getEnabledConfig(accessor, document.languageId);
}

export function isInlineSuggestEnabled(): boolean | undefined {
	return vscode.workspace.getConfiguration('editor.inlineSuggest').get<boolean>('enabled');
}

type ConfigurationInspect = Exclude<ReturnType<vscode.WorkspaceConfiguration['inspect']>, undefined>;
const inspectKinds: [keyof ConfigurationInspect, vscode.ConfigurationTarget, boolean][] = [
	['workspaceFolderLanguageValue', vscode.ConfigurationTarget.WorkspaceFolder, true],
	['workspaceFolderValue', vscode.ConfigurationTarget.WorkspaceFolder, false],
	['workspaceLanguageValue', vscode.ConfigurationTarget.Workspace, true],
	['workspaceValue', vscode.ConfigurationTarget.Workspace, false],
	['globalLanguageValue', vscode.ConfigurationTarget.Global, true],
	['globalValue', vscode.ConfigurationTarget.Global, false],
];

function getConfigurationTargetForEnabledConfig(): vscode.ConfigurationTarget {
	const inspect = vscode.workspace.getConfiguration(CopilotConfigPrefix).inspect(ConfigKey.Enable);
	if (inspect?.workspaceFolderValue !== undefined) {
		return vscode.ConfigurationTarget.WorkspaceFolder;
	} else if (inspect?.workspaceValue !== undefined) {
		return vscode.ConfigurationTarget.Workspace;
	} else {
		return vscode.ConfigurationTarget.Global;
	}
}

/**
 * Enable completions by every means possible.
 */
export async function enableCompletions(accessor: ServicesAccessor) {
	const instantiationService = accessor.get(IInstantiationService);
	const scope = vscode.window.activeTextEditor?.document;
	// Make sure both of these settings are enabled, because that's a precondition for the user seeing inline completions.
	for (const [section, option] of [['', 'editor.inlineSuggest.enabled']]) {
		const config = vscode.workspace.getConfiguration(section, scope);
		const inspect = config.inspect(option);
		// Start from the most specific setting and work our way up to the global default.
		for (const [key, target, overrideInLanguage] of inspectKinds) {
			// Exit condition: if VS Code thinks the setting is enabled, we're done.
			// This might be true from the start, or a call to .update() might flip it.
			if (vscode.workspace.getConfiguration(section, scope).get(option)) {
				break;
			}
			if (inspect?.[key] === false) {
				await config.update(option, true, target, overrideInLanguage);
			}
		}
	}

	// The rest of this function is the inverse of disableCompletions(), updating the github.copilot.enable setting.
	const languageId = vscode.window.activeTextEditor?.document.languageId;
	if (!languageId) { return; }
	const config = vscode.workspace.getConfiguration(CopilotConfigPrefix);
	const enabledConfig = { ...instantiationService.invokeFunction(getEnabledConfigObject) };
	if (!(languageId in enabledConfig)) {
		enabledConfig['*'] = true;
	} else {
		enabledConfig[languageId] = true;
	}
	await config.update(ConfigKey.Enable, enabledConfig, getConfigurationTargetForEnabledConfig());
	if (!instantiationService.invokeFunction(isCompletionEnabled)) {
		const inspect = vscode.workspace.getConfiguration(CopilotConfigPrefix).inspect(ConfigKey.Enable);
		const error = new Error(`Failed to enable completions for ${languageId}: ${JSON.stringify(inspect)}`);
		instantiationService.invokeFunction(acc => logger.exception(acc, error, '.enable'));
	}
}

/**
 * Disable completions using the github.copilot.enable setting.
 */
export async function disableCompletions(accessor: ServicesAccessor) {
	const instantiationService = accessor.get(IInstantiationService);
	const languageId = vscode.window.activeTextEditor?.document.languageId;
	if (!languageId) { return; }
	const config = vscode.workspace.getConfiguration(CopilotConfigPrefix);
	const enabledConfig = { ...instantiationService.invokeFunction(getEnabledConfigObject) };
	if (!(languageId in enabledConfig)) {
		enabledConfig['*'] = false;
	} else if (enabledConfig[languageId]) {
		enabledConfig[languageId] = false;
	}
	await config.update(ConfigKey.Enable, enabledConfig, getConfigurationTargetForEnabledConfig());
	if (instantiationService.invokeFunction(isCompletionEnabled)) {
		const inspect = vscode.workspace.getConfiguration(CopilotConfigPrefix).inspect(ConfigKey.Enable);
		const error = new Error(`Failed to disable completions for ${languageId}: ${JSON.stringify(inspect)}`);
		instantiationService.invokeFunction(acc => logger.exception(acc, error, '.disable'));
	}
}

export async function toggleCompletions(accessor: ServicesAccessor) {
	if (isCompletionEnabled(accessor) && isInlineSuggestEnabled()) {
		await disableCompletions(accessor);
	} else {
		await enableCompletions(accessor);
	}
}
