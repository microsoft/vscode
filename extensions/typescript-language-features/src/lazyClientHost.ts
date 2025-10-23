/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CommandManager } from './commands/commandManager';
import { IExperimentationTelemetryReporter } from './experimentTelemetryReporter';
import { OngoingRequestCancellerFactory } from './tsServer/cancellation';
import { ILogDirectoryProvider } from './tsServer/logDirectoryProvider';
import { TsServerProcessFactory } from './tsServer/server';
import { ITypeScriptVersionProvider } from './tsServer/versionProvider';
import TypeScriptServiceClientHost from './typeScriptServiceClientHost';
import { ActiveJsTsEditorTracker } from './ui/activeJsTsEditorTracker';
import ManagedFileContextManager from './ui/managedFileContext';
import { ServiceConfigurationProvider } from './configuration/configuration';
import * as fileSchemes from './configuration/fileSchemes';
import { standardLanguageDescriptions, isJsConfigOrTsConfigFileName } from './configuration/languageDescription';
import { Lazy } from './utils/lazy';
import { Logger } from './logging/logger';
import { PluginManager } from './tsServer/plugins';

export function createLazyClientHost(
	context: vscode.ExtensionContext,
	onCaseInsensitiveFileSystem: boolean,
	services: {
		pluginManager: PluginManager;
		commandManager: CommandManager;
		logDirectoryProvider: ILogDirectoryProvider;
		cancellerFactory: OngoingRequestCancellerFactory;
		versionProvider: ITypeScriptVersionProvider;
		processFactory: TsServerProcessFactory;
		activeJsTsEditorTracker: ActiveJsTsEditorTracker;
		serviceConfigurationProvider: ServiceConfigurationProvider;
		experimentTelemetryReporter: IExperimentationTelemetryReporter | undefined;
		logger: Logger;
	},
	onCompletionAccepted: (item: vscode.CompletionItem) => void,
): Lazy<TypeScriptServiceClientHost> {
	return new Lazy(() => {
		return new TypeScriptServiceClientHost(
			standardLanguageDescriptions,
			context,
			onCaseInsensitiveFileSystem,
			services,
			onCompletionAccepted);
	});
}

export function lazilyActivateClient(
	lazyClientHost: Lazy<TypeScriptServiceClientHost>,
	pluginManager: PluginManager,
	activeJsTsEditorTracker: ActiveJsTsEditorTracker,
	onActivate: () => Promise<void> = () => Promise.resolve(),
): vscode.Disposable {
	const disposables: vscode.Disposable[] = [];

	const supportedLanguage = [
		...standardLanguageDescriptions.map(x => x.languageIds),
		...pluginManager.plugins.map(x => x.languages)
	].flat();

	let hasActivated = false;
	const maybeActivate = (textDocument: vscode.TextDocument): boolean => {
		if (!hasActivated && isSupportedDocument(supportedLanguage, textDocument)) {
			hasActivated = true;

			onActivate().then(() => {
				// Force activation
				void lazyClientHost.value;

				disposables.push(new ManagedFileContextManager(activeJsTsEditorTracker));
			});

			return true;
		}
		return false;
	};

	const didActivate = vscode.workspace.textDocuments.some(maybeActivate);
	if (!didActivate) {
		const openListener = vscode.workspace.onDidOpenTextDocument(doc => {
			if (maybeActivate(doc)) {
				openListener.dispose();
			}
		}, undefined, disposables);
	}

	return vscode.Disposable.from(...disposables);
}

function isSupportedDocument(
	supportedLanguage: readonly string[],
	document: vscode.TextDocument
): boolean {
	return (supportedLanguage.indexOf(document.languageId) >= 0 || isJsConfigOrTsConfigFileName(document.fileName))
		&& !fileSchemes.disabledSchemes.has(document.uri.scheme);
}
