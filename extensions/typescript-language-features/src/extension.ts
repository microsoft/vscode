/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as vscode from 'vscode';
import VsCodeTelemetryReporter from '@vscode/extension-telemetry';
import { Api, getExtensionApi } from './api';
import { CommandManager } from './commands/commandManager';
import { registerBaseCommands } from './commands/index';
import { ExperimentationService } from './experimentationService';
import { ExperimentTelemetryReporter } from './experimentTelemetryReporter';
import { createLazyClientHost, lazilyActivateClient } from './lazyClientHost';
import { nodeRequestCancellerFactory } from './tsServer/cancellation.electron';
import { NodeLogDirectoryProvider } from './tsServer/logDirectoryProvider.electron';
import { ElectronServiceProcessFactory } from './tsServer/serverProcess.electron';
import { DiskTypeScriptVersionProvider } from './tsServer/versionProvider.electron';
import { JsWalkthroughState, registerJsNodeWalkthrough } from './ui/jsNodeWalkthrough.electron';
import { ActiveJsTsEditorTracker } from './utils/activeJsTsEditorTracker';
import { ElectronServiceConfigurationProvider } from './utils/configuration.electron';
import { onCaseInsensitiveFileSystem } from './utils/fileSystem.electron';
import { PluginManager } from './utils/plugins';
import * as temp from './utils/temp.electron';

export function activate(
	context: vscode.ExtensionContext
): Api {
	const pluginManager = new PluginManager();
	context.subscriptions.push(pluginManager);

	const commandManager = new CommandManager();
	context.subscriptions.push(commandManager);

	const onCompletionAccepted = new vscode.EventEmitter<vscode.CompletionItem>();
	context.subscriptions.push(onCompletionAccepted);

	const logDirectoryProvider = new NodeLogDirectoryProvider(context);
	const versionProvider = new DiskTypeScriptVersionProvider();

	const activeJsTsEditorTracker = new ActiveJsTsEditorTracker();
	context.subscriptions.push(activeJsTsEditorTracker);

	const jsWalkthroughState = new JsWalkthroughState();
	context.subscriptions.push(jsWalkthroughState);

	const extension = context.extension;
	const id = extension.id;
	const { version = '', aiKey = '' } = extension.packageJSON as PackageInfo;
	const vscTelemetryReporter = new VsCodeTelemetryReporter(id, version, aiKey);
	const experimentTelemetryReporter = new ExperimentTelemetryReporter(vscTelemetryReporter);
	context.subscriptions.push(experimentTelemetryReporter);
	// Currently no variables in use.
	const globalState = context.globalState;
	context.subscriptions.push(new ExperimentationService(experimentTelemetryReporter, id, version, globalState));

	const lazyClientHost = createLazyClientHost(context, onCaseInsensitiveFileSystem(), {
		pluginManager,
		commandManager,
		logDirectoryProvider,
		cancellerFactory: nodeRequestCancellerFactory,
		versionProvider,
		processFactory: new ElectronServiceProcessFactory(),
		activeJsTsEditorTracker,
		serviceConfigurationProvider: new ElectronServiceConfigurationProvider(),
		experimentTelemetryReporter,
	}, item => {
		onCompletionAccepted.fire(item);
	});

	registerBaseCommands(commandManager, lazyClientHost, pluginManager, activeJsTsEditorTracker);
	registerJsNodeWalkthrough(commandManager, jsWalkthroughState);

	import('./task/taskProvider').then(module => {
		context.subscriptions.push(module.register(lazyClientHost.map(x => x.serviceClient)));
	});

	import('./languageFeatures/tsconfig').then(module => {
		context.subscriptions.push(module.register());
	});

	context.subscriptions.push(lazilyActivateClient(lazyClientHost, pluginManager, activeJsTsEditorTracker));

	return getExtensionApi(onCompletionAccepted.event, pluginManager);
}

export function deactivate() {
	fs.rmSync(temp.getInstanceTempDir(), { recursive: true, force: true });
}

interface PackageInfo {
	readonly name: string;
	readonly version: string;
	readonly aiKey: string;
}
