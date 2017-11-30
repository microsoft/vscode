/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CommandManager } from './utils/commandManager';
import { ReloadTypeScriptProjectsCommand, SelectTypeScriptVersionCommand, ReloadJavaScriptProjectsCommand, RestartTsServerCommand, OpenTsServerLogCommand, TypeScriptGoToProjectConfigCommand, JavaScriptGoToProjectConfigCommand, TypeScriptServiceClientHost } from './typescriptMain';
import TypeScriptTaskProviderManager from './features/taskProvider';
import { getContributedTypeScriptServerPlugins } from './utils/plugins';
import * as ProjectStatus from './utils/projectStatus';
import * as languageModeIds from './utils/languageModeIds';
import * as languageConfigurations from './utils/languageConfigurations';
import { standardLanguageDescriptions } from './utils/languageDescription';

export function activate(context: vscode.ExtensionContext): void {
	const plugins = getContributedTypeScriptServerPlugins();

	const commandManager = new CommandManager();
	context.subscriptions.push(commandManager);

	const lazyClientHost = (() => {
		let clientHost: TypeScriptServiceClientHost | undefined;
		return () => {
			if (!clientHost) {
				clientHost = new TypeScriptServiceClientHost(standardLanguageDescriptions, context.workspaceState, plugins, commandManager);
				context.subscriptions.push(clientHost);

				const host = clientHost;
				clientHost.serviceClient.onReady().then(() => {
					context.subscriptions.push(ProjectStatus.create(host.serviceClient, host.serviceClient.telemetryReporter,
						path => new Promise<boolean>(resolve => setTimeout(() => resolve(host.handles(path)), 750)),
						context.workspaceState));
				}, () => {
					// Nothing to do here. The client did show a message;
				});
			}
			return clientHost;
		};
	})();

	commandManager.register(new ReloadTypeScriptProjectsCommand(lazyClientHost));
	commandManager.register(new ReloadJavaScriptProjectsCommand(lazyClientHost));
	commandManager.register(new SelectTypeScriptVersionCommand(lazyClientHost));
	commandManager.register(new OpenTsServerLogCommand(lazyClientHost));
	commandManager.register(new RestartTsServerCommand(lazyClientHost));
	commandManager.register(new TypeScriptGoToProjectConfigCommand(lazyClientHost));
	commandManager.register(new JavaScriptGoToProjectConfigCommand(lazyClientHost));

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
	const openListener = vscode.workspace.onDidOpenTextDocument(didOpenTextDocument);
	for (let textDocument of vscode.workspace.textDocuments) {
		if (didOpenTextDocument(textDocument)) {
			break;
		}
	}
}