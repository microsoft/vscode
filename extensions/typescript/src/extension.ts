/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CommandManager } from './utils/commandManager';
import { TypeScriptServiceClientHost } from './typescriptMain';
import * as commands from './commands';

import TypeScriptTaskProviderManager from './features/taskProvider';
import { getContributedTypeScriptServerPlugins, TypeScriptServerPlugin } from './utils/plugins';
import * as ProjectStatus from './utils/projectStatus';
import * as languageModeIds from './utils/languageModeIds';
import * as languageConfigurations from './utils/languageConfigurations';
import { standardLanguageDescriptions } from './utils/languageDescription';
import ManagedFileContextManager from './utils/managedFileContext';

export function activate(
	context: vscode.ExtensionContext
): void {
	const plugins = getContributedTypeScriptServerPlugins();

	const commandManager = new CommandManager();
	context.subscriptions.push(commandManager);

	const lazyClientHost = createLazyClientHost(context, plugins, commandManager);

	context.subscriptions.push(new ManagedFileContextManager(resource => lazyClientHost().serviceClient.normalizePath(resource)));
	registerCommands(commandManager, lazyClientHost);
	context.subscriptions.push(new TypeScriptTaskProviderManager(() => lazyClientHost().serviceClient));
	context.subscriptions.push(vscode.languages.setLanguageConfiguration(languageModeIds.jsxTags, languageConfigurations.jsxTags));


	const supportedLanguage = [].concat.apply([], standardLanguageDescriptions.map(x => x.modeIds).concat(plugins.map(x => x.languages)));
	function didOpenTextDocument(textDocument: vscode.TextDocument): boolean {
		if (supportedLanguage.indexOf(textDocument.languageId) >= 0) {
			openListener.dispose();
			// Force activation
			void lazyClientHost();
			return true;
		}
		return false;
	}
	const openListener = vscode.workspace.onDidOpenTextDocument(didOpenTextDocument, undefined, context.subscriptions);
	for (const textDocument of vscode.workspace.textDocuments) {
		if (didOpenTextDocument(textDocument)) {
			break;
		}
	}
}

function createLazyClientHost(
	context: vscode.ExtensionContext,
	plugins: TypeScriptServerPlugin[],
	commandManager: CommandManager
) {
	let clientHost: TypeScriptServiceClientHost | undefined = undefined;
	return () => {
		if (!clientHost) {
			clientHost = new TypeScriptServiceClientHost(standardLanguageDescriptions, context.workspaceState, plugins, commandManager);
			context.subscriptions.push(clientHost);
			const host = clientHost;
			clientHost.serviceClient.onReady().then(() => {
				context.subscriptions.push(ProjectStatus.create(host.serviceClient, host.serviceClient.telemetryReporter, path => new Promise<boolean>(resolve => setTimeout(() => resolve(host.handles(path)), 750)), context.workspaceState));
			}, () => {
				// Nothing to do here. The client did show a message;
			});
		}
		return clientHost;
	};
}

function registerCommands(
	commandManager: CommandManager,
	lazyClientHost: () => TypeScriptServiceClientHost
) {
	commandManager.register(new commands.ReloadTypeScriptProjectsCommand(lazyClientHost));
	commandManager.register(new commands.ReloadJavaScriptProjectsCommand(lazyClientHost));
	commandManager.register(new commands.SelectTypeScriptVersionCommand(lazyClientHost));
	commandManager.register(new commands.OpenTsServerLogCommand(lazyClientHost));
	commandManager.register(new commands.RestartTsServerCommand(lazyClientHost));
	commandManager.register(new commands.TypeScriptGoToProjectConfigCommand(lazyClientHost));
	commandManager.register(new commands.JavaScriptGoToProjectConfigCommand(lazyClientHost));
}
