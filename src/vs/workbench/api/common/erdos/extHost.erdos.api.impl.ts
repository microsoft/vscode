/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtHostLanguageRuntime } from './extHostLanguageRuntime.js';
import type * as erdos from 'erdos';
import type * as vscode from 'vscode';
import { IExtHostRpcService } from '../extHostRpcService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IExtensionRegistries } from '../extHost.api.impl.js';
import { IExtensionDescription } from '../../../../platform/extensions/common/extensions.js';
import { ExtHostConfigProvider } from '../extHostConfiguration.js';
import { ExtHostErdosContext } from './extHost.erdos.protocol.js';
import * as extHostTypes from './extHostTypes.erdos.js';
import { IExtHostInitDataService } from '../extHostInitDataService.js';

import { ExtHostModalDialogs } from './extHostModalDialogs.js';
import { ExtHostContextKeyService } from './extHostContextKeyService.js';
import { ExtHostDocuments } from '../extHostDocuments.js';
import { ExtHostContext } from '../extHost.protocol.js';
import { IExtHostWorkspace } from '../extHostWorkspace.js';
import { IExtHostCommands } from '../extHostCommands.js';
import { ExtHostLanguageFeatures } from '../extHostLanguageFeatures.js';
import { createExtHostQuickOpen } from '../extHostQuickOpen.js';
import { ExtHostOutputService } from '../extHostOutput.js';
import { ExtHostConsoleService } from './extHostConsoleService.js';
import { ExtHostMethods } from './extHostMethods.js';
import { ExtHostEditors } from '../extHostTextEditors.js';
import { UiFrontendRequest } from '../../../services/languageRuntime/common/erdosUiComm.js';
import { ExtHostEnvironment } from './extHostEnvironment.js';
import { ExtHostPlotsService } from './extHostPlotsService.js';

export interface IExtensionErdosApiFactory {
	(extension: IExtensionDescription, extensionInfo: IExtensionRegistries, configProvider: ExtHostConfigProvider): typeof erdos;
}

export function createErdosApiFactoryAndRegisterActors(accessor: ServicesAccessor): IExtensionErdosApiFactory {
	const rpcProtocol = accessor.get(IExtHostRpcService);
	const initData = accessor.get(IExtHostInitDataService);
	const extHostWorkspace = accessor.get(IExtHostWorkspace);
	const extHostCommands = accessor.get(IExtHostCommands);
	const extHostLogService = accessor.get(ILogService);

	const extHostOutputService: ExtHostOutputService = rpcProtocol.getRaw(ExtHostContext.ExtHostOutputService);
	const extHostLanguageFeatures: ExtHostLanguageFeatures =
		rpcProtocol.getRaw(ExtHostContext.ExtHostLanguageFeatures);
	const extHostEditors: ExtHostEditors = rpcProtocol.getRaw(ExtHostContext.ExtHostEditors);
	const extHostDocuments: ExtHostDocuments = rpcProtocol.getRaw(ExtHostContext.ExtHostDocuments);
	const extHostQuickOpen = rpcProtocol.set(ExtHostErdosContext.ExtHostQuickOpen, createExtHostQuickOpen(rpcProtocol, extHostWorkspace, extHostCommands));
	const extHostLanguageRuntime = rpcProtocol.set(ExtHostErdosContext.ExtHostLanguageRuntime, new ExtHostLanguageRuntime(rpcProtocol, extHostLogService));


	const extHostModalDialogs = rpcProtocol.set(ExtHostErdosContext.ExtHostModalDialogs, new ExtHostModalDialogs(rpcProtocol));
	const extHostContextKeyService = rpcProtocol.set(ExtHostErdosContext.ExtHostContextKeyService, new ExtHostContextKeyService(rpcProtocol));
	const extHostConsoleService = rpcProtocol.set(ExtHostErdosContext.ExtHostConsoleService, new ExtHostConsoleService(rpcProtocol, extHostLogService));
	const extHostPlotsService = rpcProtocol.set(ExtHostErdosContext.ExtHostPlotsService, new ExtHostPlotsService(rpcProtocol));
	const extHostMethods = rpcProtocol.set(ExtHostErdosContext.ExtHostMethods,
		new ExtHostMethods(rpcProtocol, extHostEditors, extHostDocuments, extHostModalDialogs,
			extHostLanguageRuntime, extHostWorkspace, extHostQuickOpen, extHostCommands, extHostContextKeyService));
	const extHostEnvironment = rpcProtocol.set(ExtHostErdosContext.ExtHostEnvironment, new ExtHostEnvironment(rpcProtocol));

	return function (extension: IExtensionDescription, extensionInfo: IExtensionRegistries, configProvider: ExtHostConfigProvider): typeof erdos {

		const runtime: typeof erdos.runtime = {
			executeCode(languageId, code, focus, allowIncomplete, mode, errorBehavior, observer): Thenable<Record<string, any>> {
				const extensionId = extension.identifier.value;
				return extHostLanguageRuntime.executeCode(languageId, code, extensionId, focus, allowIncomplete, mode, errorBehavior, observer);
			},
			registerLanguageRuntimeManager(
				languageId: string,
				manager: erdos.LanguageRuntimeManager): vscode.Disposable {
				return extHostLanguageRuntime.registerLanguageRuntimeManager(extension, languageId, manager);
			},
			getRegisteredRuntimes(): Thenable<erdos.LanguageRuntimeMetadata[]> {
				return extHostLanguageRuntime.getRegisteredRuntimes();
			},
			getPreferredRuntime(languageId: string): Thenable<erdos.LanguageRuntimeMetadata | undefined> {
				return extHostLanguageRuntime.getPreferredRuntime(languageId);
			},
			getActiveSessions(): Thenable<erdos.LanguageRuntimeSession[]> {
				return extHostLanguageRuntime.getActiveSessions();
			},
			getForegroundSession(): Thenable<erdos.LanguageRuntimeSession | undefined> {
				return extHostLanguageRuntime.getForegroundSession();
			},
			getNotebookSession(notebookUri: vscode.Uri): Thenable<erdos.LanguageRuntimeSession | undefined> {
				return extHostLanguageRuntime.getNotebookSession(notebookUri);
			},
			selectLanguageRuntime(runtimeId: string): Thenable<void> {
				return extHostLanguageRuntime.selectLanguageRuntime(runtimeId);
			},
			startLanguageRuntime(runtimeId: string,
				sessionName: string,
				notebookUri?: vscode.Uri): Thenable<erdos.LanguageRuntimeSession> {

				const sessionMode = notebookUri ?
					extHostTypes.LanguageRuntimeSessionMode.Notebook :
					extHostTypes.LanguageRuntimeSessionMode.Console;

				return extHostLanguageRuntime.startLanguageRuntime(runtimeId,
					sessionName,
					sessionMode,
					notebookUri);
			},
			restartSession(sessionId: string): Thenable<void> {
				return extHostLanguageRuntime.restartSession(sessionId);
			},
			focusSession(sessionId: string): void {
				return extHostLanguageRuntime.focusSession(sessionId);
			},

			querySessionTables(_sessionId: string, _accessKeys: Array<Array<string>>, _queryTypes: Array<string>):
				Thenable<Array<erdos.QueryTableSummaryResult>> {
				return Promise.resolve([]);
			},
			registerClientHandler(handler: erdos.RuntimeClientHandler): vscode.Disposable {
				return extHostLanguageRuntime.registerClientHandler(handler);
			},
			registerClientInstance(clientInstanceId: string): vscode.Disposable {
				return extHostLanguageRuntime.registerClientInstance(clientInstanceId);
			},
			get onDidRegisterRuntime() {
				return extHostLanguageRuntime.onDidRegisterRuntime;
			},
			get onDidChangeForegroundSession() {
				return extHostLanguageRuntime.onDidChangeForegroundSession;
			},
			get onDidExecuteCode() {
				return extHostLanguageRuntime.onDidExecuteCode;
			}
		};

		const window: typeof erdos.window = {
			createRawLogOutputChannel(name: string): vscode.OutputChannel {
				return extHostOutputService.createRawLogOutputChannel(name, extension);
			},
			showSimpleModalDialogPrompt(title: string, message: string, okButtonTitle?: string, cancelButtonTitle?: string): Thenable<boolean> {
				return extHostModalDialogs.showSimpleModalDialogPrompt(title, message, okButtonTitle, cancelButtonTitle);
			},
			showSimpleModalDialogMessage(title: string, message: string, okButtonTitle?: string): Thenable<null> {
				return extHostModalDialogs.showSimpleModalDialogMessage(title, message, okButtonTitle);
			},
			getConsoleForLanguage(languageId: string) {
				return extHostConsoleService.getConsoleForLanguage(languageId);
			},
			get onDidChangeConsoleWidth() {
				return extHostConsoleService.onDidChangeConsoleWidth;
			},
			getConsoleWidth(): Thenable<number> {
				return extHostConsoleService.getConsoleWidth();
			},
			get onDidChangePlotsRenderSettings() {
				return extHostPlotsService.onDidChangePlotsRenderSettings;
			},
			getPlotsRenderSettings(): Thenable<erdos.PlotRenderSettings> {
				return extHostPlotsService.getPlotsRenderSettings();
			},
			previewHtml(path: string): void {
			}
		};

		const languages: typeof erdos.languages = {
			registerStatementRangeProvider(
				selector: vscode.DocumentSelector,
				provider: erdos.StatementRangeProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerStatementRangeProvider(extension, selector, provider);
			},
			registerHelpTopicProvider(
				selector: vscode.DocumentSelector,
				provider: erdos.HelpTopicProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerHelpTopicProvider(extension, selector, provider);
			}
		};

		const methods: typeof erdos.methods = {
			call(method: string, params: Record<string, any>): Thenable<any> {
				return extHostMethods.call(extension.identifier.value, method as UiFrontendRequest, params);
			},
			lastActiveEditorContext(): Thenable<erdos.EditorContext | null> {
				return extHostMethods.lastActiveEditorContext();
			},
			showDialog(title: string, message: string): Thenable<null> {
				return extHostMethods.showDialog(title, message);
			},
			showQuestion(title: string, message: string, okButtonTitle: string, cancelButtonTitle: string): Thenable<boolean> {
				return extHostMethods.showQuestion(title, message, okButtonTitle, cancelButtonTitle);
			},
		};

		const connections: typeof erdos.connections = {
			registerConnectionDriver(_driver: erdos.ConnectionsDriver): vscode.Disposable {
				return { dispose: () => {} };
			}
		};

		const environment: typeof erdos.environment = {
			getEnvironmentContributions(): Thenable<Record<string, erdos.EnvironmentVariableAction[]>> {
				return extHostEnvironment.getEnvironmentContributions();
			}
		};
        
		return {
			version: initData.erdosVersion,
			runtime,
			window,
			languages,
			methods,
			environment,
			connections,
			CodeAttributionSource: extHostTypes.CodeAttributionSource,
			ErdosOutputLocation: extHostTypes.ErdosOutputLocation,
			RuntimeClientType: extHostTypes.RuntimeClientType,
			RuntimeClientState: extHostTypes.RuntimeClientState,
			RuntimeExitReason: extHostTypes.RuntimeExitReason,
			RuntimeMethodErrorCode: extHostTypes.RuntimeMethodErrorCode,
			LanguageRuntimeMessageType: extHostTypes.LanguageRuntimeMessageType,
			LanguageRuntimeStreamName: extHostTypes.LanguageRuntimeStreamName,
			LanguageRuntimeSessionChannel: extHostTypes.LanguageRuntimeSessionChannel,
			LanguageRuntimeSessionMode: extHostTypes.LanguageRuntimeSessionMode,
			RuntimeCodeExecutionMode: extHostTypes.RuntimeCodeExecutionMode,
			RuntimeErrorBehavior: extHostTypes.RuntimeErrorBehavior,
			LanguageRuntimeStartupBehavior: extHostTypes.LanguageRuntimeStartupBehavior,
			LanguageRuntimeSessionLocation: extHostTypes.LanguageRuntimeSessionLocation,
			RuntimeOnlineState: extHostTypes.RuntimeOnlineState,
			RuntimeState: extHostTypes.RuntimeState,
			RuntimeCodeFragmentStatus: extHostTypes.RuntimeCodeFragmentStatus,
			PlotRenderFormat: extHostTypes.PlotRenderFormat,
			UiRuntimeNotifications: extHostTypes.UiRuntimeNotifications,
		};
	};
}
