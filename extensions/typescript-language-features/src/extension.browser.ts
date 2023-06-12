/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import VsCodeTelemetryReporter from '@vscode/extension-telemetry';
import * as vscode from 'vscode';
import { Api, getExtensionApi } from './api';
import { CommandManager } from './commands/commandManager';
import { registerBaseCommands } from './commands/index';
import { ExperimentationTelemetryReporter, IExperimentationTelemetryReporter } from './experimentTelemetryReporter';
import { createLazyClientHost, lazilyActivateClient } from './lazyClientHost';
import RemoteRepositories from './remoteRepositories.browser';
import { API } from './tsServer/api';
import { noopRequestCancellerFactory } from './tsServer/cancellation';
import { noopLogDirectoryProvider } from './tsServer/logDirectoryProvider';
import { WorkerServerProcessFactory } from './tsServer/serverProcess.browser';
import { ITypeScriptVersionProvider, TypeScriptVersion, TypeScriptVersionSource } from './tsServer/versionProvider';
import { ActiveJsTsEditorTracker } from './ui/activeJsTsEditorTracker';
import { TypeScriptServiceConfiguration } from './configuration/configuration';
import { BrowserServiceConfigurationProvider } from './configuration/configuration.browser';
import { Logger } from './logging/logger';
import { getPackageInfo } from './utils/packageInfo';
import { isWebAndHasSharedArrayBuffers } from './utils/platform';
import { PluginManager } from './tsServer/plugins';

class StaticVersionProvider implements ITypeScriptVersionProvider {

	constructor(
		private readonly _version: TypeScriptVersion
	) { }

	updateConfiguration(_configuration: TypeScriptServiceConfiguration): void {
		// noop
	}

	get defaultVersion() { return this._version; }
	get bundledVersion() { return this._version; }

	readonly globalVersion = undefined;
	readonly localVersion = undefined;
	readonly localVersions = [];
}

export async function activate(context: vscode.ExtensionContext): Promise<Api> {
	const pluginManager = new PluginManager();
	context.subscriptions.push(pluginManager);

	const commandManager = new CommandManager();
	context.subscriptions.push(commandManager);

	const onCompletionAccepted = new vscode.EventEmitter<vscode.CompletionItem>();
	context.subscriptions.push(onCompletionAccepted);

	const activeJsTsEditorTracker = new ActiveJsTsEditorTracker();
	context.subscriptions.push(activeJsTsEditorTracker);

	const versionProvider = new StaticVersionProvider(
		new TypeScriptVersion(
			TypeScriptVersionSource.Bundled,
			vscode.Uri.joinPath(context.extensionUri, 'dist/browser/typescript/tsserver.web.js').toString(),
			API.fromSimpleString('5.1.3')));

	let experimentTelemetryReporter: IExperimentationTelemetryReporter | undefined;
	const packageInfo = getPackageInfo(context);
	if (packageInfo) {
		const { aiKey } = packageInfo;
		const vscTelemetryReporter = new VsCodeTelemetryReporter(aiKey);
		experimentTelemetryReporter = new ExperimentationTelemetryReporter(vscTelemetryReporter);
		context.subscriptions.push(experimentTelemetryReporter);
	}

	const logger = new Logger();

	const lazyClientHost = createLazyClientHost(context, false, {
		pluginManager,
		commandManager,
		logDirectoryProvider: noopLogDirectoryProvider,
		cancellerFactory: noopRequestCancellerFactory,
		versionProvider,
		processFactory: new WorkerServerProcessFactory(context.extensionUri),
		activeJsTsEditorTracker,
		serviceConfigurationProvider: new BrowserServiceConfigurationProvider(),
		experimentTelemetryReporter,
		logger,
	}, item => {
		onCompletionAccepted.fire(item);
	});

	registerBaseCommands(commandManager, lazyClientHost, pluginManager, activeJsTsEditorTracker);

	// context.subscriptions.push(task.register(lazyClientHost.map(x => x.serviceClient)));

	import('./languageFeatures/tsconfig').then(module => {
		context.subscriptions.push(module.register());
	});

	context.subscriptions.push(lazilyActivateClient(lazyClientHost, pluginManager, activeJsTsEditorTracker, async () => {
		await preload(logger);
	}));

	return getExtensionApi(onCompletionAccepted.event, pluginManager);
}

async function preload(logger: Logger): Promise<void> {
	if (!isWebAndHasSharedArrayBuffers()) {
		return;
	}

	const workspaceUri = vscode.workspace.workspaceFolders?.[0].uri;
	if (!workspaceUri || workspaceUri.scheme !== 'vscode-vfs' || workspaceUri.authority !== 'github') {
		return undefined;
	}

	try {
		const remoteHubApi = await RemoteRepositories.getApi();
		if (remoteHubApi.loadWorkspaceContents !== undefined) {
			if (await remoteHubApi.loadWorkspaceContents(workspaceUri)) {
				logger.info(`Successfully loaded workspace content for repository ${workspaceUri.toString()}`);
			} else {
				logger.info(`Failed to load workspace content for repository ${workspaceUri.toString()}`);
			}

		}
	} catch (error) {
		logger.info(`Loading workspace content for repository ${workspaceUri.toString()} failed: ${error instanceof Error ? error.toString() : 'Unknown reason'}`);
		console.error(error);
	}
}
