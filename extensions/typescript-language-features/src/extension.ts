/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import { CommandManager } from './utils/commandManager';
import TypeScriptServiceClientHost from './typeScriptServiceClientHost';
import * as commands from './commands';

import TypeScriptTaskProviderManager from './features/taskProvider';
import { getContributedTypeScriptServerPlugins, TypeScriptServerPlugin } from './utils/plugins';
import * as ProjectStatus from './utils/projectStatus';
import * as languageModeIds from './utils/languageModeIds';
import * as languageConfigurations from './utils/languageConfigurations';
import { standardLanguageDescriptions } from './utils/languageDescription';
import ManagedFileContextManager from './utils/managedFileContext';
import { lazy, Lazy } from './utils/lazy';
import * as fileSchemes from './utils/fileSchemes';
import LogDirectoryProvider from './utils/logDirectoryProvider';
import { OrganizeImportsCommand, OrganizeImportsContextManager } from './features/organizeImports';

export function activate(
	context: vscode.ExtensionContext
): void {
	const plugins = getContributedTypeScriptServerPlugins();

	const commandManager = new CommandManager();
	context.subscriptions.push(commandManager);

	const lazyClientHost = createLazyClientHost(context, plugins, commandManager);

	registerCommands(commandManager, lazyClientHost);
	context.subscriptions.push(new TypeScriptTaskProviderManager(lazyClientHost.map(x => x.serviceClient)));
	context.subscriptions.push(vscode.languages.setLanguageConfiguration(languageModeIds.jsxTags, languageConfigurations.jsxTags));

	const supportedLanguage = [].concat.apply([], standardLanguageDescriptions.map(x => x.modeIds).concat(plugins.map(x => x.languages)));
	function didOpenTextDocument(textDocument: vscode.TextDocument): boolean {
		if (isSupportedDocument(supportedLanguage, textDocument)) {
			openListener.dispose();
			// Force activation
			// tslint:disable-next-line:no-unused-expression
			void lazyClientHost.value;

			context.subscriptions.push(new ManagedFileContextManager(resource => {
				return lazyClientHost.value.serviceClient.normalizePath(resource);
			}));
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
): Lazy<TypeScriptServiceClientHost> {
	return lazy(() => {
		const logDirectoryProvider = new LogDirectoryProvider(context);
		const clientHost = new TypeScriptServiceClientHost(
			standardLanguageDescriptions,
			context.workspaceState,
			plugins,
			commandManager,
			logDirectoryProvider);

		context.subscriptions.push(clientHost);

		const organizeImportsContext = new OrganizeImportsContextManager();
		clientHost.serviceClient.onTsServerStarted(api => {
			organizeImportsContext.onDidChangeApiVersion(api);
		}, null, context.subscriptions);

		clientHost.serviceClient.onReady(() => {
			context.subscriptions.push(
				ProjectStatus.create(
					clientHost.serviceClient,
					clientHost.serviceClient.telemetryReporter,
					path => new Promise<boolean>(resolve => setTimeout(() => resolve(clientHost.handles(path)), 750)),
					context.workspaceState));
		});

		return clientHost;
	});
}

function registerCommands(
	commandManager: CommandManager,
	lazyClientHost: Lazy<TypeScriptServiceClientHost>
) {
	commandManager.register(new commands.ReloadTypeScriptProjectsCommand(lazyClientHost));
	commandManager.register(new commands.ReloadJavaScriptProjectsCommand(lazyClientHost));
	commandManager.register(new commands.SelectTypeScriptVersionCommand(lazyClientHost));
	commandManager.register(new commands.OpenTsServerLogCommand(lazyClientHost));
	commandManager.register(new commands.RestartTsServerCommand(lazyClientHost));
	commandManager.register(new commands.TypeScriptGoToProjectConfigCommand(lazyClientHost));
	commandManager.register(new commands.JavaScriptGoToProjectConfigCommand(lazyClientHost));
	commandManager.register(new OrganizeImportsCommand(lazyClientHost));
}

function isSupportedDocument(
	supportedLanguage: string[],
	document: vscode.TextDocument
): boolean {
	if (supportedLanguage.indexOf(document.languageId) < 0) {
		return false;
	}
	return fileSchemes.isSupportedScheme(document.uri.scheme);
}