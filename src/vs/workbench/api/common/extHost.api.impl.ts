/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import * as errors from '../../../base/common/errors.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { combinedDisposable } from '../../../base/common/lifecycle.js';
import { Schemas, matchesScheme } from '../../../base/common/network.js';
import Severity from '../../../base/common/severity.js';
import { URI } from '../../../base/common/uri.js';
import { TextEditorCursorStyle } from '../../../editor/common/config/editorOptions.js';
import { score, targetsNotebooks } from '../../../editor/common/languageSelector.js';
import * as languageConfiguration from '../../../editor/common/languages/languageConfiguration.js';
import { OverviewRulerLane } from '../../../editor/common/model.js';
import { ExtensionError, ExtensionIdentifierSet, IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import * as files from '../../../platform/files/common/files.js';
import { ServicesAccessor } from '../../../platform/instantiation/common/instantiation.js';
import { ILogService, ILoggerService, LogLevel } from '../../../platform/log/common/log.js';
import { getRemoteName } from '../../../platform/remote/common/remoteHosts.js';
import { TelemetryTrustedValue } from '../../../platform/telemetry/common/telemetryUtils.js';
import { EditSessionIdentityMatch } from '../../../platform/workspace/common/editSessions.js';
import { DebugConfigurationProviderTriggerKind } from '../../contrib/debug/common/debug.js';
import { ExtensionDescriptionRegistry } from '../../services/extensions/common/extensionDescriptionRegistry.js';
import { UIKind } from '../../services/extensions/common/extensionHostProtocol.js';
import { checkProposedApiEnabled, isProposedApiEnabled } from '../../services/extensions/common/extensions.js';
import { ProxyIdentifier } from '../../services/extensions/common/proxyIdentifier.js';
import { ExcludeSettingOptions, TextSearchCompleteMessageType, TextSearchContext2, TextSearchMatch2, AISearchKeyword } from '../../services/search/common/searchExtTypes.js';
import { CandidatePortSource, ExtHostContext, ExtHostLogLevelServiceShape, MainContext } from './extHost.protocol.js';
import { ExtHostRelatedInformation } from './extHostAiRelatedInformation.js';
import { ExtHostApiCommands } from './extHostApiCommands.js';
import { IExtHostApiDeprecationService } from './extHostApiDeprecationService.js';
import { IExtHostAuthentication } from './extHostAuthentication.js';
import { ExtHostBulkEdits } from './extHostBulkEdits.js';
import { ExtHostChatAgents2 } from './extHostChatAgents2.js';
import { ExtHostChatStatus } from './extHostChatStatus.js';
import { ExtHostClipboard } from './extHostClipboard.js';
import { ExtHostEditorInsets } from './extHostCodeInsets.js';
import { ExtHostCodeMapper } from './extHostCodeMapper.js';
import { IExtHostCommands } from './extHostCommands.js';
import { createExtHostComments } from './extHostComments.js';
import { ExtHostConfigProvider, IExtHostConfiguration } from './extHostConfiguration.js';
import { ExtHostCustomEditors } from './extHostCustomEditors.js';
import { IExtHostDebugService } from './extHostDebugService.js';
import { IExtHostDecorations } from './extHostDecorations.js';
import { ExtHostDiagnostics } from './extHostDiagnostics.js';
import { ExtHostDialogs } from './extHostDialogs.js';
import { ExtHostDocumentContentProvider } from './extHostDocumentContentProviders.js';
import { ExtHostDocumentSaveParticipant } from './extHostDocumentSaveParticipant.js';
import { ExtHostDocuments } from './extHostDocuments.js';
import { IExtHostDocumentsAndEditors } from './extHostDocumentsAndEditors.js';
import { IExtHostEditorTabs } from './extHostEditorTabs.js';
import { ExtHostEmbeddings } from './extHostEmbedding.js';
import { ExtHostAiEmbeddingVector } from './extHostEmbeddingVector.js';
import { Extension, IExtHostExtensionService } from './extHostExtensionService.js';
import { ExtHostFileSystem } from './extHostFileSystem.js';
import { IExtHostConsumerFileSystem } from './extHostFileSystemConsumer.js';
import { ExtHostFileSystemEventService, FileSystemWatcherCreateOptions } from './extHostFileSystemEventService.js';
import { IExtHostFileSystemInfo } from './extHostFileSystemInfo.js';
import { IExtHostInitDataService } from './extHostInitDataService.js';
import { ExtHostInteractive } from './extHostInteractive.js';
import { ExtHostLabelService } from './extHostLabelService.js';
import { ExtHostLanguageFeatures } from './extHostLanguageFeatures.js';
import { ExtHostLanguageModelTools } from './extHostLanguageModelTools.js';
import { IExtHostLanguageModels } from './extHostLanguageModels.js';
import { ExtHostLanguages } from './extHostLanguages.js';
import { IExtHostLocalizationService } from './extHostLocalizationService.js';
import { IExtHostManagedSockets } from './extHostManagedSockets.js';
import { IExtHostMpcService } from './extHostMcp.js';
import { ExtHostMessageService } from './extHostMessageService.js';
import { ExtHostNotebookController } from './extHostNotebook.js';
import { ExtHostNotebookDocumentSaveParticipant } from './extHostNotebookDocumentSaveParticipant.js';
import { ExtHostNotebookDocuments } from './extHostNotebookDocuments.js';
import { ExtHostNotebookEditors } from './extHostNotebookEditors.js';
import { ExtHostNotebookKernels } from './extHostNotebookKernels.js';
import { ExtHostNotebookRenderers } from './extHostNotebookRenderers.js';
import { IExtHostOutputService } from './extHostOutput.js';
import { ExtHostProfileContentHandlers } from './extHostProfileContentHandler.js';
import { IExtHostProgress } from './extHostProgress.js';
import { ExtHostQuickDiff } from './extHostQuickDiff.js';
import { createExtHostQuickOpen } from './extHostQuickOpen.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { ExtHostSCM } from './extHostSCM.js';
import { IExtHostSearch } from './extHostSearch.js';
import { IExtHostSecretState } from './extHostSecretState.js';
import { ExtHostShare } from './extHostShare.js';
import { ExtHostSpeech } from './extHostSpeech.js';
import { ExtHostStatusBar } from './extHostStatusBar.js';
import { IExtHostStorage } from './extHostStorage.js';
import { IExtensionStoragePaths } from './extHostStoragePaths.js';
import { IExtHostTask } from './extHostTask.js';
import { ExtHostTelemetryLogger, IExtHostTelemetry, isNewAppInstall } from './extHostTelemetry.js';
import { IExtHostTerminalService } from './extHostTerminalService.js';
import { IExtHostTerminalShellIntegration } from './extHostTerminalShellIntegration.js';
import { IExtHostTesting } from './extHostTesting.js';
import { ExtHostEditors } from './extHostTextEditors.js';
import { ExtHostTheming } from './extHostTheming.js';
import { ExtHostTimeline } from './extHostTimeline.js';
import { ExtHostTreeViews } from './extHostTreeViews.js';
import { IExtHostTunnelService } from './extHostTunnelService.js';
import * as typeConverters from './extHostTypeConverters.js';
import * as extHostTypes from './extHostTypes.js';
import { ExtHostUriOpeners } from './extHostUriOpener.js';
import { IURITransformerService } from './extHostUriTransformerService.js';
import { IExtHostUrlsService } from './extHostUrls.js';
import { ExtHostWebviews } from './extHostWebview.js';
import { ExtHostWebviewPanels } from './extHostWebviewPanels.js';
import { ExtHostWebviewViews } from './extHostWebviewView.js';
import { IExtHostWindow } from './extHostWindow.js';
import { IExtHostWorkspace } from './extHostWorkspace.js';
import { ExtHostAiSettingsSearch } from './extHostAiSettingsSearch.js';

export interface IExtensionRegistries {
	mine: ExtensionDescriptionRegistry;
	all: ExtensionDescriptionRegistry;
}

export interface IExtensionApiFactory {
	(extension: IExtensionDescription, extensionInfo: IExtensionRegistries, configProvider: ExtHostConfigProvider): typeof vscode;
}

/**
 * This method instantiates and returns the extension API surface
 */
export function createApiFactoryAndRegisterActors(accessor: ServicesAccessor): IExtensionApiFactory {

	// services
	const initData = accessor.get(IExtHostInitDataService);
	const extHostFileSystemInfo = accessor.get(IExtHostFileSystemInfo);
	const extHostConsumerFileSystem = accessor.get(IExtHostConsumerFileSystem);
	const extensionService = accessor.get(IExtHostExtensionService);
	const extHostWorkspace = accessor.get(IExtHostWorkspace);
	const extHostTelemetry = accessor.get(IExtHostTelemetry);
	const extHostConfiguration = accessor.get(IExtHostConfiguration);
	const uriTransformer = accessor.get(IURITransformerService);
	const rpcProtocol = accessor.get(IExtHostRpcService);
	const extHostStorage = accessor.get(IExtHostStorage);
	const extensionStoragePaths = accessor.get(IExtensionStoragePaths);
	const extHostLoggerService = accessor.get(ILoggerService);
	const extHostLogService = accessor.get(ILogService);
	const extHostTunnelService = accessor.get(IExtHostTunnelService);
	const extHostApiDeprecation = accessor.get(IExtHostApiDeprecationService);
	const extHostWindow = accessor.get(IExtHostWindow);
	const extHostUrls = accessor.get(IExtHostUrlsService);
	const extHostSecretState = accessor.get(IExtHostSecretState);
	const extHostEditorTabs = accessor.get(IExtHostEditorTabs);
	const extHostManagedSockets = accessor.get(IExtHostManagedSockets);
	const extHostProgress = accessor.get(IExtHostProgress);
	const extHostAuthentication = accessor.get(IExtHostAuthentication);
	const extHostLanguageModels = accessor.get(IExtHostLanguageModels);
	const extHostMcp = accessor.get(IExtHostMpcService);

	// register addressable instances
	rpcProtocol.set(ExtHostContext.ExtHostFileSystemInfo, extHostFileSystemInfo);
	rpcProtocol.set(ExtHostContext.ExtHostLogLevelServiceShape, <ExtHostLogLevelServiceShape><any>extHostLoggerService);
	rpcProtocol.set(ExtHostContext.ExtHostWorkspace, extHostWorkspace);
	rpcProtocol.set(ExtHostContext.ExtHostConfiguration, extHostConfiguration);
	rpcProtocol.set(ExtHostContext.ExtHostExtensionService, extensionService);
	rpcProtocol.set(ExtHostContext.ExtHostStorage, extHostStorage);
	rpcProtocol.set(ExtHostContext.ExtHostTunnelService, extHostTunnelService);
	rpcProtocol.set(ExtHostContext.ExtHostWindow, extHostWindow);
	rpcProtocol.set(ExtHostContext.ExtHostUrls, extHostUrls);
	rpcProtocol.set(ExtHostContext.ExtHostSecretState, extHostSecretState);
	rpcProtocol.set(ExtHostContext.ExtHostTelemetry, extHostTelemetry);
	rpcProtocol.set(ExtHostContext.ExtHostEditorTabs, extHostEditorTabs);
	rpcProtocol.set(ExtHostContext.ExtHostManagedSockets, extHostManagedSockets);
	rpcProtocol.set(ExtHostContext.ExtHostProgress, extHostProgress);
	rpcProtocol.set(ExtHostContext.ExtHostAuthentication, extHostAuthentication);
	rpcProtocol.set(ExtHostContext.ExtHostChatProvider, extHostLanguageModels);

	// automatically create and register addressable instances
	const extHostDecorations = rpcProtocol.set(ExtHostContext.ExtHostDecorations, accessor.get(IExtHostDecorations));
	const extHostDocumentsAndEditors = rpcProtocol.set(ExtHostContext.ExtHostDocumentsAndEditors, accessor.get(IExtHostDocumentsAndEditors));
	const extHostCommands = rpcProtocol.set(ExtHostContext.ExtHostCommands, accessor.get(IExtHostCommands));
	const extHostTerminalService = rpcProtocol.set(ExtHostContext.ExtHostTerminalService, accessor.get(IExtHostTerminalService));
	const extHostTerminalShellIntegration = rpcProtocol.set(ExtHostContext.ExtHostTerminalShellIntegration, accessor.get(IExtHostTerminalShellIntegration));
	const extHostDebugService = rpcProtocol.set(ExtHostContext.ExtHostDebugService, accessor.get(IExtHostDebugService));
	const extHostSearch = rpcProtocol.set(ExtHostContext.ExtHostSearch, accessor.get(IExtHostSearch));
	const extHostTask = rpcProtocol.set(ExtHostContext.ExtHostTask, accessor.get(IExtHostTask));
	const extHostOutputService = rpcProtocol.set(ExtHostContext.ExtHostOutputService, accessor.get(IExtHostOutputService));
	const extHostLocalization = rpcProtocol.set(ExtHostContext.ExtHostLocalization, accessor.get(IExtHostLocalizationService));

	// manually create and register addressable instances
	const extHostDocuments = rpcProtocol.set(ExtHostContext.ExtHostDocuments, new ExtHostDocuments(rpcProtocol, extHostDocumentsAndEditors));
	const extHostDocumentContentProviders = rpcProtocol.set(ExtHostContext.ExtHostDocumentContentProviders, new ExtHostDocumentContentProvider(rpcProtocol, extHostDocumentsAndEditors, extHostLogService));
	const extHostDocumentSaveParticipant = rpcProtocol.set(ExtHostContext.ExtHostDocumentSaveParticipant, new ExtHostDocumentSaveParticipant(extHostLogService, extHostDocuments, rpcProtocol.getProxy(MainContext.MainThreadBulkEdits)));
	const extHostNotebook = rpcProtocol.set(ExtHostContext.ExtHostNotebook, new ExtHostNotebookController(rpcProtocol, extHostCommands, extHostDocumentsAndEditors, extHostDocuments, extHostConsumerFileSystem, extHostSearch, extHostLogService));
	const extHostNotebookDocuments = rpcProtocol.set(ExtHostContext.ExtHostNotebookDocuments, new ExtHostNotebookDocuments(extHostNotebook));
	const extHostNotebookEditors = rpcProtocol.set(ExtHostContext.ExtHostNotebookEditors, new ExtHostNotebookEditors(extHostLogService, extHostNotebook));
	const extHostNotebookKernels = rpcProtocol.set(ExtHostContext.ExtHostNotebookKernels, new ExtHostNotebookKernels(rpcProtocol, initData, extHostNotebook, extHostCommands, extHostLogService));
	const extHostNotebookRenderers = rpcProtocol.set(ExtHostContext.ExtHostNotebookRenderers, new ExtHostNotebookRenderers(rpcProtocol, extHostNotebook));
	const extHostNotebookDocumentSaveParticipant = rpcProtocol.set(ExtHostContext.ExtHostNotebookDocumentSaveParticipant, new ExtHostNotebookDocumentSaveParticipant(extHostLogService, extHostNotebook, rpcProtocol.getProxy(MainContext.MainThreadBulkEdits)));
	const extHostEditors = rpcProtocol.set(ExtHostContext.ExtHostEditors, new ExtHostEditors(rpcProtocol, extHostDocumentsAndEditors));
	const extHostTreeViews = rpcProtocol.set(ExtHostContext.ExtHostTreeViews, new ExtHostTreeViews(rpcProtocol.getProxy(MainContext.MainThreadTreeViews), extHostCommands, extHostLogService));
	const extHostEditorInsets = rpcProtocol.set(ExtHostContext.ExtHostEditorInsets, new ExtHostEditorInsets(rpcProtocol.getProxy(MainContext.MainThreadEditorInsets), extHostEditors, initData.remote));
	const extHostDiagnostics = rpcProtocol.set(ExtHostContext.ExtHostDiagnostics, new ExtHostDiagnostics(rpcProtocol, extHostLogService, extHostFileSystemInfo, extHostDocumentsAndEditors));
	const extHostLanguages = rpcProtocol.set(ExtHostContext.ExtHostLanguages, new ExtHostLanguages(rpcProtocol, extHostDocuments, extHostCommands.converter, uriTransformer));
	const extHostLanguageFeatures = rpcProtocol.set(ExtHostContext.ExtHostLanguageFeatures, new ExtHostLanguageFeatures(rpcProtocol, uriTransformer, extHostDocuments, extHostCommands, extHostDiagnostics, extHostLogService, extHostApiDeprecation, extHostTelemetry));
	const extHostCodeMapper = rpcProtocol.set(ExtHostContext.ExtHostCodeMapper, new ExtHostCodeMapper(rpcProtocol));
	const extHostFileSystem = rpcProtocol.set(ExtHostContext.ExtHostFileSystem, new ExtHostFileSystem(rpcProtocol, extHostLanguageFeatures));
	const extHostFileSystemEvent = rpcProtocol.set(ExtHostContext.ExtHostFileSystemEventService, new ExtHostFileSystemEventService(rpcProtocol, extHostLogService, extHostDocumentsAndEditors));
	const extHostQuickOpen = rpcProtocol.set(ExtHostContext.ExtHostQuickOpen, createExtHostQuickOpen(rpcProtocol, extHostWorkspace, extHostCommands));
	const extHostSCM = rpcProtocol.set(ExtHostContext.ExtHostSCM, new ExtHostSCM(rpcProtocol, extHostCommands, extHostDocuments, extHostLogService));
	const extHostQuickDiff = rpcProtocol.set(ExtHostContext.ExtHostQuickDiff, new ExtHostQuickDiff(rpcProtocol, uriTransformer));
	const extHostShare = rpcProtocol.set(ExtHostContext.ExtHostShare, new ExtHostShare(rpcProtocol, uriTransformer));
	const extHostComment = rpcProtocol.set(ExtHostContext.ExtHostComments, createExtHostComments(rpcProtocol, extHostCommands, extHostDocuments));
	const extHostLabelService = rpcProtocol.set(ExtHostContext.ExtHostLabelService, new ExtHostLabelService(rpcProtocol));
	const extHostTheming = rpcProtocol.set(ExtHostContext.ExtHostTheming, new ExtHostTheming(rpcProtocol));
	const extHostTimeline = rpcProtocol.set(ExtHostContext.ExtHostTimeline, new ExtHostTimeline(rpcProtocol, extHostCommands));
	const extHostWebviews = rpcProtocol.set(ExtHostContext.ExtHostWebviews, new ExtHostWebviews(rpcProtocol, initData.remote, extHostWorkspace, extHostLogService, extHostApiDeprecation));
	const extHostWebviewPanels = rpcProtocol.set(ExtHostContext.ExtHostWebviewPanels, new ExtHostWebviewPanels(rpcProtocol, extHostWebviews, extHostWorkspace));
	const extHostCustomEditors = rpcProtocol.set(ExtHostContext.ExtHostCustomEditors, new ExtHostCustomEditors(rpcProtocol, extHostDocuments, extensionStoragePaths, extHostWebviews, extHostWebviewPanels));
	const extHostWebviewViews = rpcProtocol.set(ExtHostContext.ExtHostWebviewViews, new ExtHostWebviewViews(rpcProtocol, extHostWebviews));
	const extHostTesting = rpcProtocol.set(ExtHostContext.ExtHostTesting, accessor.get(IExtHostTesting));
	const extHostUriOpeners = rpcProtocol.set(ExtHostContext.ExtHostUriOpeners, new ExtHostUriOpeners(rpcProtocol));
	const extHostProfileContentHandlers = rpcProtocol.set(ExtHostContext.ExtHostProfileContentHandlers, new ExtHostProfileContentHandlers(rpcProtocol));
	rpcProtocol.set(ExtHostContext.ExtHostInteractive, new ExtHostInteractive(rpcProtocol, extHostNotebook, extHostDocumentsAndEditors, extHostCommands, extHostLogService));
	const extHostLanguageModelTools = rpcProtocol.set(ExtHostContext.ExtHostLanguageModelTools, new ExtHostLanguageModelTools(rpcProtocol, extHostLanguageModels));
	const extHostChatAgents2 = rpcProtocol.set(ExtHostContext.ExtHostChatAgents2, new ExtHostChatAgents2(rpcProtocol, extHostLogService, extHostCommands, extHostDocuments, extHostLanguageModels, extHostDiagnostics, extHostLanguageModelTools));
	const extHostAiRelatedInformation = rpcProtocol.set(ExtHostContext.ExtHostAiRelatedInformation, new ExtHostRelatedInformation(rpcProtocol));
	const extHostAiEmbeddingVector = rpcProtocol.set(ExtHostContext.ExtHostAiEmbeddingVector, new ExtHostAiEmbeddingVector(rpcProtocol));
	const extHostAiSettingsSearch = rpcProtocol.set(ExtHostContext.ExtHostAiSettingsSearch, new ExtHostAiSettingsSearch(rpcProtocol));
	const extHostStatusBar = rpcProtocol.set(ExtHostContext.ExtHostStatusBar, new ExtHostStatusBar(rpcProtocol, extHostCommands.converter));
	const extHostSpeech = rpcProtocol.set(ExtHostContext.ExtHostSpeech, new ExtHostSpeech(rpcProtocol));
	const extHostEmbeddings = rpcProtocol.set(ExtHostContext.ExtHostEmbeddings, new ExtHostEmbeddings(rpcProtocol));
	rpcProtocol.set(ExtHostContext.ExtHostMcp, accessor.get(IExtHostMpcService));

	// Check that no named customers are missing
	const expected = Object.values<ProxyIdentifier<any>>(ExtHostContext);
	rpcProtocol.assertRegistered(expected);

	// Other instances
	const extHostBulkEdits = new ExtHostBulkEdits(rpcProtocol, extHostDocumentsAndEditors);
	const extHostClipboard = new ExtHostClipboard(rpcProtocol);
	const extHostMessageService = new ExtHostMessageService(rpcProtocol, extHostLogService);
	const extHostDialogs = new ExtHostDialogs(rpcProtocol);
	const extHostChatStatus = new ExtHostChatStatus(rpcProtocol);

	// Register API-ish commands
	ExtHostApiCommands.register(extHostCommands);

	return function (extension: IExtensionDescription, extensionInfo: IExtensionRegistries, configProvider: ExtHostConfigProvider): typeof vscode {

		// Wraps an event with error handling and telemetry so that we know what extension fails
		// handling events. This will prevent us from reporting this as "our" error-telemetry and
		// allows for better blaming
		function _asExtensionEvent<T>(actual: vscode.Event<T>): vscode.Event<T> {
			return (listener, thisArgs, disposables) => {
				const handle = actual(e => {
					try {
						listener.call(thisArgs, e);
					} catch (err) {
						errors.onUnexpectedExternalError(new ExtensionError(extension.identifier, err, 'FAILED to handle event'));
					}
				});
				disposables?.push(handle);
				return handle;
			};
		}


		// Check document selectors for being overly generic. Technically this isn't a problem but
		// in practice many extensions say they support `fooLang` but need fs-access to do so. Those
		// extension should specify then the `file`-scheme, e.g. `{ scheme: 'fooLang', language: 'fooLang' }`
		// We only inform once, it is not a warning because we just want to raise awareness and because
		// we cannot say if the extension is doing it right or wrong...
		const checkSelector = (function () {
			let done = !extension.isUnderDevelopment;
			function informOnce() {
				if (!done) {
					extHostLogService.info(`Extension '${extension.identifier.value}' uses a document selector without scheme. Learn more about this: https://go.microsoft.com/fwlink/?linkid=872305`);
					done = true;
				}
			}
			return function perform(selector: vscode.DocumentSelector): vscode.DocumentSelector {
				if (Array.isArray(selector)) {
					selector.forEach(perform);
				} else if (typeof selector === 'string') {
					informOnce();
				} else {
					const filter = selector as vscode.DocumentFilter; // TODO: microsoft/TypeScript#42768
					if (typeof filter.scheme === 'undefined') {
						informOnce();
					}
					if (typeof filter.exclusive === 'boolean') {
						checkProposedApiEnabled(extension, 'documentFiltersExclusive');
					}
				}
				return selector;
			};
		})();

		const authentication: typeof vscode.authentication = {
			getSession(providerId: string, scopes: readonly string[], options?: vscode.AuthenticationGetSessionOptions) {
				if (
					(typeof options?.forceNewSession === 'object' && options.forceNewSession.learnMore) ||
					(typeof options?.createIfNone === 'object' && options.createIfNone.learnMore)
				) {
					checkProposedApiEnabled(extension, 'authLearnMore');
				}
				if (options?.issuer) {
					checkProposedApiEnabled(extension, 'authIssuers');
				}
				return extHostAuthentication.getSession(extension, providerId, scopes, options as any);
			},
			getAccounts(providerId: string) {
				return extHostAuthentication.getAccounts(providerId);
			},
			// TODO: remove this after GHPR and Codespaces move off of it
			async hasSession(providerId: string, scopes: readonly string[]) {
				checkProposedApiEnabled(extension, 'authSession');
				return !!(await extHostAuthentication.getSession(extension, providerId, scopes, { silent: true } as any));
			},
			get onDidChangeSessions(): vscode.Event<vscode.AuthenticationSessionsChangeEvent> {
				return _asExtensionEvent(extHostAuthentication.getExtensionScopedSessionsEvent(extension.identifier.value));
			},
			registerAuthenticationProvider(id: string, label: string, provider: vscode.AuthenticationProvider, options?: vscode.AuthenticationProviderOptions): vscode.Disposable {
				if (options?.supportedIssuers) {
					checkProposedApiEnabled(extension, 'authIssuers');
				}
				return extHostAuthentication.registerAuthenticationProvider(id, label, provider, options);
			}
		};

		// namespace: commands
		const commands: typeof vscode.commands = {
			registerCommand(id: string, command: <T>(...args: any[]) => T | Thenable<T>, thisArgs?: any): vscode.Disposable {
				return extHostCommands.registerCommand(true, id, command, thisArgs, undefined, extension);
			},
			registerTextEditorCommand(id: string, callback: (textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit, ...args: any[]) => void, thisArg?: any): vscode.Disposable {
				return extHostCommands.registerCommand(true, id, (...args: any[]): any => {
					const activeTextEditor = extHostEditors.getActiveTextEditor();
					if (!activeTextEditor) {
						extHostLogService.warn('Cannot execute ' + id + ' because there is no active text editor.');
						return undefined;
					}

					return activeTextEditor.edit((edit: vscode.TextEditorEdit) => {
						callback.apply(thisArg, [activeTextEditor, edit, ...args]);

					}).then((result) => {
						if (!result) {
							extHostLogService.warn('Edits from command ' + id + ' were not applied.');
						}
					}, (err) => {
						extHostLogService.warn('An error occurred while running command ' + id, err);
					});
				}, undefined, undefined, extension);
			},
			registerDiffInformationCommand: (id: string, callback: (diff: vscode.LineChange[], ...args: any[]) => any, thisArg?: any): vscode.Disposable => {
				checkProposedApiEnabled(extension, 'diffCommand');
				return extHostCommands.registerCommand(true, id, async (...args: any[]): Promise<any> => {
					const activeTextEditor = extHostDocumentsAndEditors.activeEditor(true);
					if (!activeTextEditor) {
						extHostLogService.warn('Cannot execute ' + id + ' because there is no active text editor.');
						return undefined;
					}

					const diff = await extHostEditors.getDiffInformation(activeTextEditor.id);
					callback.apply(thisArg, [diff, ...args]);
				}, undefined, undefined, extension);
			},
			executeCommand<T>(id: string, ...args: any[]): Thenable<T> {
				return extHostCommands.executeCommand<T>(id, ...args);
			},
			getCommands(filterInternal: boolean = false): Thenable<string[]> {
				return extHostCommands.getCommands(filterInternal);
			}
		};

		// namespace: env
		const env: typeof vscode.env = {
			get machineId() { return initData.telemetryInfo.machineId; },
			get sessionId() { return initData.telemetryInfo.sessionId; },
			get language() { return initData.environment.appLanguage; },
			get appName() { return initData.environment.appName; },
			get appRoot() { return initData.environment.appRoot?.fsPath ?? ''; },
			get appHost() { return initData.environment.appHost; },
			get uriScheme() { return initData.environment.appUriScheme; },
			get clipboard(): vscode.Clipboard { return extHostClipboard.value; },
			get shell() {
				return extHostTerminalService.getDefaultShell(false);
			},
			get onDidChangeShell() {
				return _asExtensionEvent(extHostTerminalService.onDidChangeShell);
			},
			get isTelemetryEnabled() {
				return extHostTelemetry.getTelemetryConfiguration();
			},
			get onDidChangeTelemetryEnabled(): vscode.Event<boolean> {
				return _asExtensionEvent(extHostTelemetry.onDidChangeTelemetryEnabled);
			},
			get telemetryConfiguration(): vscode.TelemetryConfiguration {
				checkProposedApiEnabled(extension, 'telemetry');
				return extHostTelemetry.getTelemetryDetails();
			},
			get onDidChangeTelemetryConfiguration(): vscode.Event<vscode.TelemetryConfiguration> {
				checkProposedApiEnabled(extension, 'telemetry');
				return _asExtensionEvent(extHostTelemetry.onDidChangeTelemetryConfiguration);
			},
			get isNewAppInstall() {
				return isNewAppInstall(initData.telemetryInfo.firstSessionDate);
			},
			createTelemetryLogger(sender: vscode.TelemetrySender, options?: vscode.TelemetryLoggerOptions): vscode.TelemetryLogger {
				ExtHostTelemetryLogger.validateSender(sender);
				return extHostTelemetry.instantiateLogger(extension, sender, options);
			},
			openExternal(uri: URI, options?: { allowContributedOpeners?: boolean | string }) {
				return extHostWindow.openUri(uri, {
					allowTunneling: !!initData.remote.authority,
					allowContributedOpeners: options?.allowContributedOpeners,
				});
			},
			async asExternalUri(uri: URI) {
				if (uri.scheme === initData.environment.appUriScheme) {
					return extHostUrls.createAppUri(uri);
				}

				try {
					return await extHostWindow.asExternalUri(uri, { allowTunneling: !!initData.remote.authority });
				} catch (err) {
					if (matchesScheme(uri, Schemas.http) || matchesScheme(uri, Schemas.https)) {
						return uri;
					}

					throw err;
				}
			},
			get remoteName() {
				return getRemoteName(initData.remote.authority);
			},
			get remoteAuthority() {
				checkProposedApiEnabled(extension, 'resolvers');
				return initData.remote.authority;
			},
			get uiKind() {
				return initData.uiKind;
			},
			get logLevel() {
				return extHostLogService.getLevel();
			},
			get onDidChangeLogLevel() {
				return _asExtensionEvent(extHostLogService.onDidChangeLogLevel);
			},
			get appQuality(): string | undefined {
				checkProposedApiEnabled(extension, 'resolvers');
				return initData.quality;
			},
			get appCommit(): string | undefined {
				checkProposedApiEnabled(extension, 'resolvers');
				return initData.commit;
			}
		};
		if (!initData.environment.extensionTestsLocationURI) {
			// allow to patch env-function when running tests
			Object.freeze(env);
		}

		// namespace: tests
		const tests: typeof vscode.tests = {
			createTestController(provider, label, refreshHandler?: (token: vscode.CancellationToken) => Thenable<void> | void) {
				return extHostTesting.createTestController(extension, provider, label, refreshHandler);
			},
			createTestObserver() {
				checkProposedApiEnabled(extension, 'testObserver');
				return extHostTesting.createTestObserver();
			},
			runTests(provider) {
				checkProposedApiEnabled(extension, 'testObserver');
				return extHostTesting.runTests(provider);
			},
			registerTestFollowupProvider(provider) {
				checkProposedApiEnabled(extension, 'testObserver');
				return extHostTesting.registerTestFollowupProvider(provider);
			},
			get onDidChangeTestResults() {
				checkProposedApiEnabled(extension, 'testObserver');
				return _asExtensionEvent(extHostTesting.onResultsChanged);
			},
			get testResults() {
				checkProposedApiEnabled(extension, 'testObserver');
				return extHostTesting.results;
			},
		};

		// namespace: extensions
		const extensionKind = initData.remote.isRemote
			? extHostTypes.ExtensionKind.Workspace
			: extHostTypes.ExtensionKind.UI;

		const extensions: typeof vscode.extensions = {
			getExtension(extensionId: string, includeFromDifferentExtensionHosts?: boolean): vscode.Extension<any> | undefined {
				if (!isProposedApiEnabled(extension, 'extensionsAny')) {
					includeFromDifferentExtensionHosts = false;
				}
				const mine = extensionInfo.mine.getExtensionDescription(extensionId);
				if (mine) {
					return new Extension(extensionService, extension.identifier, mine, extensionKind, false);
				}
				if (includeFromDifferentExtensionHosts) {
					const foreign = extensionInfo.all.getExtensionDescription(extensionId);
					if (foreign) {
						return new Extension(extensionService, extension.identifier, foreign, extensionKind /* TODO@alexdima THIS IS WRONG */, true);
					}
				}
				return undefined;
			},
			get all(): vscode.Extension<any>[] {
				const result: vscode.Extension<any>[] = [];
				for (const desc of extensionInfo.mine.getAllExtensionDescriptions()) {
					result.push(new Extension(extensionService, extension.identifier, desc, extensionKind, false));
				}
				return result;
			},
			get allAcrossExtensionHosts(): vscode.Extension<any>[] {
				checkProposedApiEnabled(extension, 'extensionsAny');
				const local = new ExtensionIdentifierSet(extensionInfo.mine.getAllExtensionDescriptions().map(desc => desc.identifier));
				const result: vscode.Extension<any>[] = [];
				for (const desc of extensionInfo.all.getAllExtensionDescriptions()) {
					const isFromDifferentExtensionHost = !local.has(desc.identifier);
					result.push(new Extension(extensionService, extension.identifier, desc, extensionKind /* TODO@alexdima THIS IS WRONG */, isFromDifferentExtensionHost));
				}
				return result;
			},
			get onDidChange() {
				if (isProposedApiEnabled(extension, 'extensionsAny')) {
					return _asExtensionEvent(Event.any(extensionInfo.mine.onDidChange, extensionInfo.all.onDidChange));
				}
				return _asExtensionEvent(extensionInfo.mine.onDidChange);
			}
		};

		// namespace: languages
		const languages: typeof vscode.languages = {
			createDiagnosticCollection(name?: string): vscode.DiagnosticCollection {
				return extHostDiagnostics.createDiagnosticCollection(extension.identifier, name);
			},
			get onDidChangeDiagnostics() {
				return _asExtensionEvent(extHostDiagnostics.onDidChangeDiagnostics);
			},
			getDiagnostics: (resource?: vscode.Uri) => {
				return <any>extHostDiagnostics.getDiagnostics(resource);
			},
			getLanguages(): Thenable<string[]> {
				return extHostLanguages.getLanguages();
			},
			setTextDocumentLanguage(document: vscode.TextDocument, languageId: string): Thenable<vscode.TextDocument> {
				return extHostLanguages.changeLanguage(document.uri, languageId);
			},
			match(selector: vscode.DocumentSelector, document: vscode.TextDocument): number {
				const interalSelector = typeConverters.LanguageSelector.from(selector);
				let notebook: vscode.NotebookDocument | undefined;
				if (targetsNotebooks(interalSelector)) {
					notebook = extHostNotebook.notebookDocuments.find(value => value.apiNotebook.getCells().find(c => c.document === document))?.apiNotebook;
				}
				return score(interalSelector, document.uri, document.languageId, true, notebook?.uri, notebook?.notebookType);
			},
			registerCodeActionsProvider(selector: vscode.DocumentSelector, provider: vscode.CodeActionProvider, metadata?: vscode.CodeActionProviderMetadata): vscode.Disposable {
				return extHostLanguageFeatures.registerCodeActionProvider(extension, checkSelector(selector), provider, metadata);
			},
			registerDocumentPasteEditProvider(selector: vscode.DocumentSelector, provider: vscode.DocumentPasteEditProvider, metadata: vscode.DocumentPasteProviderMetadata): vscode.Disposable {
				return extHostLanguageFeatures.registerDocumentPasteEditProvider(extension, checkSelector(selector), provider, metadata);
			},
			registerCodeLensProvider(selector: vscode.DocumentSelector, provider: vscode.CodeLensProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerCodeLensProvider(extension, checkSelector(selector), provider);
			},
			registerDefinitionProvider(selector: vscode.DocumentSelector, provider: vscode.DefinitionProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerDefinitionProvider(extension, checkSelector(selector), provider);
			},
			registerDeclarationProvider(selector: vscode.DocumentSelector, provider: vscode.DeclarationProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerDeclarationProvider(extension, checkSelector(selector), provider);
			},
			registerImplementationProvider(selector: vscode.DocumentSelector, provider: vscode.ImplementationProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerImplementationProvider(extension, checkSelector(selector), provider);
			},
			registerTypeDefinitionProvider(selector: vscode.DocumentSelector, provider: vscode.TypeDefinitionProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerTypeDefinitionProvider(extension, checkSelector(selector), provider);
			},
			registerHoverProvider(selector: vscode.DocumentSelector, provider: vscode.HoverProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerHoverProvider(extension, checkSelector(selector), provider, extension.identifier);
			},
			registerEvaluatableExpressionProvider(selector: vscode.DocumentSelector, provider: vscode.EvaluatableExpressionProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerEvaluatableExpressionProvider(extension, checkSelector(selector), provider, extension.identifier);
			},
			registerInlineValuesProvider(selector: vscode.DocumentSelector, provider: vscode.InlineValuesProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerInlineValuesProvider(extension, checkSelector(selector), provider, extension.identifier);
			},
			registerDocumentHighlightProvider(selector: vscode.DocumentSelector, provider: vscode.DocumentHighlightProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerDocumentHighlightProvider(extension, checkSelector(selector), provider);
			},
			registerMultiDocumentHighlightProvider(selector: vscode.DocumentSelector, provider: vscode.MultiDocumentHighlightProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerMultiDocumentHighlightProvider(extension, checkSelector(selector), provider);
			},
			registerLinkedEditingRangeProvider(selector: vscode.DocumentSelector, provider: vscode.LinkedEditingRangeProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerLinkedEditingRangeProvider(extension, checkSelector(selector), provider);
			},
			registerReferenceProvider(selector: vscode.DocumentSelector, provider: vscode.ReferenceProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerReferenceProvider(extension, checkSelector(selector), provider);
			},
			registerRenameProvider(selector: vscode.DocumentSelector, provider: vscode.RenameProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerRenameProvider(extension, checkSelector(selector), provider);
			},
			registerNewSymbolNamesProvider(selector: vscode.DocumentSelector, provider: vscode.NewSymbolNamesProvider): vscode.Disposable {
				checkProposedApiEnabled(extension, 'newSymbolNamesProvider');
				return extHostLanguageFeatures.registerNewSymbolNamesProvider(extension, checkSelector(selector), provider);
			},
			registerDocumentSymbolProvider(selector: vscode.DocumentSelector, provider: vscode.DocumentSymbolProvider, metadata?: vscode.DocumentSymbolProviderMetadata): vscode.Disposable {
				return extHostLanguageFeatures.registerDocumentSymbolProvider(extension, checkSelector(selector), provider, metadata);
			},
			registerWorkspaceSymbolProvider(provider: vscode.WorkspaceSymbolProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerWorkspaceSymbolProvider(extension, provider);
			},
			registerDocumentFormattingEditProvider(selector: vscode.DocumentSelector, provider: vscode.DocumentFormattingEditProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerDocumentFormattingEditProvider(extension, checkSelector(selector), provider);
			},
			registerDocumentRangeFormattingEditProvider(selector: vscode.DocumentSelector, provider: vscode.DocumentRangeFormattingEditProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerDocumentRangeFormattingEditProvider(extension, checkSelector(selector), provider);
			},
			registerOnTypeFormattingEditProvider(selector: vscode.DocumentSelector, provider: vscode.OnTypeFormattingEditProvider, firstTriggerCharacter: string, ...moreTriggerCharacters: string[]): vscode.Disposable {
				return extHostLanguageFeatures.registerOnTypeFormattingEditProvider(extension, checkSelector(selector), provider, [firstTriggerCharacter].concat(moreTriggerCharacters));
			},
			registerDocumentSemanticTokensProvider(selector: vscode.DocumentSelector, provider: vscode.DocumentSemanticTokensProvider, legend: vscode.SemanticTokensLegend): vscode.Disposable {
				return extHostLanguageFeatures.registerDocumentSemanticTokensProvider(extension, checkSelector(selector), provider, legend);
			},
			registerDocumentRangeSemanticTokensProvider(selector: vscode.DocumentSelector, provider: vscode.DocumentRangeSemanticTokensProvider, legend: vscode.SemanticTokensLegend): vscode.Disposable {
				return extHostLanguageFeatures.registerDocumentRangeSemanticTokensProvider(extension, checkSelector(selector), provider, legend);
			},
			registerSignatureHelpProvider(selector: vscode.DocumentSelector, provider: vscode.SignatureHelpProvider, firstItem?: string | vscode.SignatureHelpProviderMetadata, ...remaining: string[]): vscode.Disposable {
				if (typeof firstItem === 'object') {
					return extHostLanguageFeatures.registerSignatureHelpProvider(extension, checkSelector(selector), provider, firstItem);
				}
				return extHostLanguageFeatures.registerSignatureHelpProvider(extension, checkSelector(selector), provider, typeof firstItem === 'undefined' ? [] : [firstItem, ...remaining]);
			},
			registerCompletionItemProvider(selector: vscode.DocumentSelector, provider: vscode.CompletionItemProvider, ...triggerCharacters: string[]): vscode.Disposable {
				return extHostLanguageFeatures.registerCompletionItemProvider(extension, checkSelector(selector), provider, triggerCharacters);
			},
			registerInlineCompletionItemProvider(selector: vscode.DocumentSelector, provider: vscode.InlineCompletionItemProvider, metadata?: vscode.InlineCompletionItemProviderMetadata): vscode.Disposable {
				if (provider.handleDidShowCompletionItem) {
					checkProposedApiEnabled(extension, 'inlineCompletionsAdditions');
				}
				if (provider.handleDidPartiallyAcceptCompletionItem) {
					checkProposedApiEnabled(extension, 'inlineCompletionsAdditions');
				}
				if (metadata) {
					checkProposedApiEnabled(extension, 'inlineCompletionsAdditions');
				}
				return extHostLanguageFeatures.registerInlineCompletionsProvider(extension, checkSelector(selector), provider, metadata);
			},
			registerInlineEditProvider(selector: vscode.DocumentSelector, provider: vscode.InlineEditProvider): vscode.Disposable {
				checkProposedApiEnabled(extension, 'inlineEdit');
				return extHostLanguageFeatures.registerInlineEditProvider(extension, checkSelector(selector), provider);
			},
			registerDocumentLinkProvider(selector: vscode.DocumentSelector, provider: vscode.DocumentLinkProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerDocumentLinkProvider(extension, checkSelector(selector), provider);
			},
			registerColorProvider(selector: vscode.DocumentSelector, provider: vscode.DocumentColorProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerColorProvider(extension, checkSelector(selector), provider);
			},
			registerFoldingRangeProvider(selector: vscode.DocumentSelector, provider: vscode.FoldingRangeProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerFoldingRangeProvider(extension, checkSelector(selector), provider);
			},
			registerSelectionRangeProvider(selector: vscode.DocumentSelector, provider: vscode.SelectionRangeProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerSelectionRangeProvider(extension, selector, provider);
			},
			registerCallHierarchyProvider(selector: vscode.DocumentSelector, provider: vscode.CallHierarchyProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerCallHierarchyProvider(extension, selector, provider);
			},
			registerTypeHierarchyProvider(selector: vscode.DocumentSelector, provider: vscode.TypeHierarchyProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerTypeHierarchyProvider(extension, selector, provider);
			},
			setLanguageConfiguration: (language: string, configuration: vscode.LanguageConfiguration): vscode.Disposable => {
				return extHostLanguageFeatures.setLanguageConfiguration(extension, language, configuration);
			},
			getTokenInformationAtPosition(doc: vscode.TextDocument, pos: vscode.Position) {
				checkProposedApiEnabled(extension, 'tokenInformation');
				return extHostLanguages.tokenAtPosition(doc, pos);
			},
			registerInlayHintsProvider(selector: vscode.DocumentSelector, provider: vscode.InlayHintsProvider): vscode.Disposable {
				return extHostLanguageFeatures.registerInlayHintsProvider(extension, selector, provider);
			},
			createLanguageStatusItem(id: string, selector: vscode.DocumentSelector): vscode.LanguageStatusItem {
				return extHostLanguages.createLanguageStatusItem(extension, id, selector);
			},
			registerDocumentDropEditProvider(selector: vscode.DocumentSelector, provider: vscode.DocumentDropEditProvider, metadata?: vscode.DocumentDropEditProviderMetadata): vscode.Disposable {
				return extHostLanguageFeatures.registerDocumentOnDropEditProvider(extension, selector, provider, metadata);
			}
		};

		// namespace: window
		const window: typeof vscode.window = {
			get activeTextEditor() {
				return extHostEditors.getActiveTextEditor();
			},
			get visibleTextEditors() {
				return extHostEditors.getVisibleTextEditors();
			},
			get activeTerminal() {
				return extHostTerminalService.activeTerminal;
			},
			get terminals() {
				return extHostTerminalService.terminals;
			},
			async showTextDocument(documentOrUri: vscode.TextDocument | vscode.Uri, columnOrOptions?: vscode.ViewColumn | vscode.TextDocumentShowOptions, preserveFocus?: boolean): Promise<vscode.TextEditor> {
				if (URI.isUri(documentOrUri) && documentOrUri.scheme === Schemas.vscodeRemote && !documentOrUri.authority) {
					extHostApiDeprecation.report('workspace.showTextDocument', extension, `A URI of 'vscode-remote' scheme requires an authority.`);
				}
				const document = await (URI.isUri(documentOrUri)
					? Promise.resolve(workspace.openTextDocument(documentOrUri))
					: Promise.resolve(<vscode.TextDocument>documentOrUri));

				return extHostEditors.showTextDocument(document, columnOrOptions, preserveFocus);
			},
			createTextEditorDecorationType(options: vscode.DecorationRenderOptions): vscode.TextEditorDecorationType {
				return extHostEditors.createTextEditorDecorationType(extension, options);
			},
			onDidChangeActiveTextEditor(listener, thisArg?, disposables?) {
				return _asExtensionEvent(extHostEditors.onDidChangeActiveTextEditor)(listener, thisArg, disposables);
			},
			onDidChangeVisibleTextEditors(listener, thisArg, disposables) {
				return _asExtensionEvent(extHostEditors.onDidChangeVisibleTextEditors)(listener, thisArg, disposables);
			},
			onDidChangeTextEditorSelection(listener: (e: vscode.TextEditorSelectionChangeEvent) => any, thisArgs?: any, disposables?: extHostTypes.Disposable[]) {
				return _asExtensionEvent(extHostEditors.onDidChangeTextEditorSelection)(listener, thisArgs, disposables);
			},
			onDidChangeTextEditorOptions(listener: (e: vscode.TextEditorOptionsChangeEvent) => any, thisArgs?: any, disposables?: extHostTypes.Disposable[]) {
				return _asExtensionEvent(extHostEditors.onDidChangeTextEditorOptions)(listener, thisArgs, disposables);
			},
			onDidChangeTextEditorVisibleRanges(listener: (e: vscode.TextEditorVisibleRangesChangeEvent) => any, thisArgs?: any, disposables?: extHostTypes.Disposable[]) {
				return _asExtensionEvent(extHostEditors.onDidChangeTextEditorVisibleRanges)(listener, thisArgs, disposables);
			},
			onDidChangeTextEditorViewColumn(listener, thisArg?, disposables?) {
				return _asExtensionEvent(extHostEditors.onDidChangeTextEditorViewColumn)(listener, thisArg, disposables);
			},
			onDidChangeTextEditorDiffInformation(listener, thisArg?, disposables?) {
				checkProposedApiEnabled(extension, 'textEditorDiffInformation');
				return _asExtensionEvent(extHostEditors.onDidChangeTextEditorDiffInformation)(listener, thisArg, disposables);
			},
			onDidCloseTerminal(listener, thisArg?, disposables?) {
				return _asExtensionEvent(extHostTerminalService.onDidCloseTerminal)(listener, thisArg, disposables);
			},
			onDidOpenTerminal(listener, thisArg?, disposables?) {
				return _asExtensionEvent(extHostTerminalService.onDidOpenTerminal)(listener, thisArg, disposables);
			},
			onDidChangeActiveTerminal(listener, thisArg?, disposables?) {
				return _asExtensionEvent(extHostTerminalService.onDidChangeActiveTerminal)(listener, thisArg, disposables);
			},
			onDidChangeTerminalDimensions(listener, thisArg?, disposables?) {
				checkProposedApiEnabled(extension, 'terminalDimensions');
				return _asExtensionEvent(extHostTerminalService.onDidChangeTerminalDimensions)(listener, thisArg, disposables);
			},
			onDidChangeTerminalState(listener, thisArg?, disposables?) {
				return _asExtensionEvent(extHostTerminalService.onDidChangeTerminalState)(listener, thisArg, disposables);
			},
			onDidWriteTerminalData(listener, thisArg?, disposables?) {
				checkProposedApiEnabled(extension, 'terminalDataWriteEvent');
				return _asExtensionEvent(extHostTerminalService.onDidWriteTerminalData)(listener, thisArg, disposables);
			},
			onDidExecuteTerminalCommand(listener, thisArg?, disposables?) {
				checkProposedApiEnabled(extension, 'terminalExecuteCommandEvent');
				return _asExtensionEvent(extHostTerminalService.onDidExecuteTerminalCommand)(listener, thisArg, disposables);
			},
			onDidChangeTerminalShellIntegration(listener, thisArg?, disposables?) {
				return _asExtensionEvent(extHostTerminalShellIntegration.onDidChangeTerminalShellIntegration)(listener, thisArg, disposables);
			},
			onDidStartTerminalShellExecution(listener, thisArg?, disposables?) {
				return _asExtensionEvent(extHostTerminalShellIntegration.onDidStartTerminalShellExecution)(listener, thisArg, disposables);
			},
			onDidEndTerminalShellExecution(listener, thisArg?, disposables?) {
				return _asExtensionEvent(extHostTerminalShellIntegration.onDidEndTerminalShellExecution)(listener, thisArg, disposables);
			},
			get state() {
				return extHostWindow.getState();
			},
			onDidChangeWindowState(listener, thisArg?, disposables?) {
				return _asExtensionEvent(extHostWindow.onDidChangeWindowState)(listener, thisArg, disposables);
			},
			showInformationMessage(message: string, ...rest: Array<vscode.MessageOptions | string | vscode.MessageItem>) {
				return <Thenable<any>>extHostMessageService.showMessage(extension, Severity.Info, message, rest[0], <Array<string | vscode.MessageItem>>rest.slice(1));
			},
			showWarningMessage(message: string, ...rest: Array<vscode.MessageOptions | string | vscode.MessageItem>) {
				return <Thenable<any>>extHostMessageService.showMessage(extension, Severity.Warning, message, rest[0], <Array<string | vscode.MessageItem>>rest.slice(1));
			},
			showErrorMessage(message: string, ...rest: Array<vscode.MessageOptions | string | vscode.MessageItem>) {
				return <Thenable<any>>extHostMessageService.showMessage(extension, Severity.Error, message, rest[0], <Array<string | vscode.MessageItem>>rest.slice(1));
			},
			showQuickPick(items: any, options?: vscode.QuickPickOptions, token?: vscode.CancellationToken): any {
				return extHostQuickOpen.showQuickPick(extension, items, options, token);
			},
			showWorkspaceFolderPick(options?: vscode.WorkspaceFolderPickOptions) {
				return extHostQuickOpen.showWorkspaceFolderPick(options);
			},
			showInputBox(options?: vscode.InputBoxOptions, token?: vscode.CancellationToken) {
				return extHostQuickOpen.showInput(options, token);
			},
			showOpenDialog(options) {
				return extHostDialogs.showOpenDialog(options);
			},
			showSaveDialog(options) {
				return extHostDialogs.showSaveDialog(options);
			},
			createStatusBarItem(alignmentOrId?: vscode.StatusBarAlignment | string, priorityOrAlignment?: number | vscode.StatusBarAlignment, priorityArg?: number): vscode.StatusBarItem {
				let id: string | undefined;
				let alignment: number | undefined;
				let priority: number | undefined;

				if (typeof alignmentOrId === 'string') {
					id = alignmentOrId;
					alignment = priorityOrAlignment;
					priority = priorityArg;
				} else {
					alignment = alignmentOrId;
					priority = priorityOrAlignment;
				}

				return extHostStatusBar.createStatusBarEntry(extension, id, alignment, priority);
			},
			setStatusBarMessage(text: string, timeoutOrThenable?: number | Thenable<any>): vscode.Disposable {
				return extHostStatusBar.setStatusBarMessage(text, timeoutOrThenable);
			},
			withScmProgress<R>(task: (progress: vscode.Progress<number>) => Thenable<R>) {
				extHostApiDeprecation.report('window.withScmProgress', extension,
					`Use 'withProgress' instead.`);

				return extHostProgress.withProgress(extension, { location: extHostTypes.ProgressLocation.SourceControl }, (progress, token) => task({ report(n: number) { /*noop*/ } }));
			},
			withProgress<R>(options: vscode.ProgressOptions, task: (progress: vscode.Progress<{ message?: string; worked?: number }>, token: vscode.CancellationToken) => Thenable<R>) {
				return extHostProgress.withProgress(extension, options, task);
			},
			createOutputChannel(name: string, options: string | { log: true } | undefined): any {
				return extHostOutputService.createOutputChannel(name, options, extension);
			},
			createWebviewPanel(viewType: string, title: string, showOptions: vscode.ViewColumn | { viewColumn: vscode.ViewColumn; preserveFocus?: boolean }, options?: vscode.WebviewPanelOptions & vscode.WebviewOptions): vscode.WebviewPanel {
				return extHostWebviewPanels.createWebviewPanel(extension, viewType, title, showOptions, options);
			},
			createWebviewTextEditorInset(editor: vscode.TextEditor, line: number, height: number, options?: vscode.WebviewOptions): vscode.WebviewEditorInset {
				checkProposedApiEnabled(extension, 'editorInsets');
				return extHostEditorInsets.createWebviewEditorInset(editor, line, height, options, extension);
			},
			createTerminal(nameOrOptions?: vscode.TerminalOptions | vscode.ExtensionTerminalOptions | string, shellPath?: string, shellArgs?: readonly string[] | string): vscode.Terminal {
				if (typeof nameOrOptions === 'object') {
					if ('pty' in nameOrOptions) {
						return extHostTerminalService.createExtensionTerminal(nameOrOptions);
					}
					return extHostTerminalService.createTerminalFromOptions(nameOrOptions);
				}
				return extHostTerminalService.createTerminal(nameOrOptions, shellPath, shellArgs);
			},
			registerTerminalLinkProvider(provider: vscode.TerminalLinkProvider): vscode.Disposable {
				return extHostTerminalService.registerLinkProvider(provider);
			},
			registerTerminalProfileProvider(id: string, provider: vscode.TerminalProfileProvider): vscode.Disposable {
				return extHostTerminalService.registerProfileProvider(extension, id, provider);
			},
			registerTerminalCompletionProvider(provider: vscode.TerminalCompletionProvider<vscode.TerminalCompletionItem>, ...triggerCharacters: string[]): vscode.Disposable {
				checkProposedApiEnabled(extension, 'terminalCompletionProvider');
				return extHostTerminalService.registerTerminalCompletionProvider(extension, provider, ...triggerCharacters);
			},
			registerTerminalQuickFixProvider(id: string, provider: vscode.TerminalQuickFixProvider): vscode.Disposable {
				checkProposedApiEnabled(extension, 'terminalQuickFixProvider');
				return extHostTerminalService.registerTerminalQuickFixProvider(id, extension.identifier.value, provider);
			},
			registerTreeDataProvider(viewId: string, treeDataProvider: vscode.TreeDataProvider<any>): vscode.Disposable {
				return extHostTreeViews.registerTreeDataProvider(viewId, treeDataProvider, extension);
			},
			createTreeView(viewId: string, options: { treeDataProvider: vscode.TreeDataProvider<any> }): vscode.TreeView<any> {
				return extHostTreeViews.createTreeView(viewId, options, extension);
			},
			registerWebviewPanelSerializer: (viewType: string, serializer: vscode.WebviewPanelSerializer) => {
				return extHostWebviewPanels.registerWebviewPanelSerializer(extension, viewType, serializer);
			},
			registerCustomEditorProvider: (viewType: string, provider: vscode.CustomTextEditorProvider | vscode.CustomReadonlyEditorProvider, options: { webviewOptions?: vscode.WebviewPanelOptions; supportsMultipleEditorsPerDocument?: boolean } = {}) => {
				return extHostCustomEditors.registerCustomEditorProvider(extension, viewType, provider, options);
			},
			registerFileDecorationProvider(provider: vscode.FileDecorationProvider) {
				return extHostDecorations.registerFileDecorationProvider(provider, extension);
			},
			registerUriHandler(handler: vscode.UriHandler) {
				return extHostUrls.registerUriHandler(extension, handler);
			},
			createQuickPick<T extends vscode.QuickPickItem>(): vscode.QuickPick<T> {
				return extHostQuickOpen.createQuickPick(extension);
			},
			createInputBox(): vscode.InputBox {
				return extHostQuickOpen.createInputBox(extension);
			},
			get activeColorTheme(): vscode.ColorTheme {
				return extHostTheming.activeColorTheme;
			},
			onDidChangeActiveColorTheme(listener, thisArg?, disposables?) {
				return _asExtensionEvent(extHostTheming.onDidChangeActiveColorTheme)(listener, thisArg, disposables);
			},
			registerWebviewViewProvider(viewId: string, provider: vscode.WebviewViewProvider, options?: {
				webviewOptions?: {
					retainContextWhenHidden?: boolean;
				};
			}) {
				return extHostWebviewViews.registerWebviewViewProvider(extension, viewId, provider, options?.webviewOptions);
			},
			get activeNotebookEditor(): vscode.NotebookEditor | undefined {
				return extHostNotebook.activeNotebookEditor;
			},
			onDidChangeActiveNotebookEditor(listener, thisArgs?, disposables?) {
				return _asExtensionEvent(extHostNotebook.onDidChangeActiveNotebookEditor)(listener, thisArgs, disposables);
			},
			get visibleNotebookEditors() {
				return extHostNotebook.visibleNotebookEditors;
			},
			get onDidChangeVisibleNotebookEditors() {
				return _asExtensionEvent(extHostNotebook.onDidChangeVisibleNotebookEditors);
			},
			onDidChangeNotebookEditorSelection(listener, thisArgs?, disposables?) {
				return _asExtensionEvent(extHostNotebookEditors.onDidChangeNotebookEditorSelection)(listener, thisArgs, disposables);
			},
			onDidChangeNotebookEditorVisibleRanges(listener, thisArgs?, disposables?) {
				return _asExtensionEvent(extHostNotebookEditors.onDidChangeNotebookEditorVisibleRanges)(listener, thisArgs, disposables);
			},
			showNotebookDocument(document, options?) {
				return extHostNotebook.showNotebookDocument(document, options);
			},
			registerExternalUriOpener(id: string, opener: vscode.ExternalUriOpener, metadata: vscode.ExternalUriOpenerMetadata) {
				checkProposedApiEnabled(extension, 'externalUriOpener');
				return extHostUriOpeners.registerExternalUriOpener(extension.identifier, id, opener, metadata);
			},
			registerProfileContentHandler(id: string, handler: vscode.ProfileContentHandler) {
				checkProposedApiEnabled(extension, 'profileContentHandlers');
				return extHostProfileContentHandlers.registerProfileContentHandler(extension, id, handler);
			},
			registerQuickDiffProvider(selector: vscode.DocumentSelector, quickDiffProvider: vscode.QuickDiffProvider, id: string, label: string, rootUri?: vscode.Uri): vscode.Disposable {
				checkProposedApiEnabled(extension, 'quickDiffProvider');
				return extHostQuickDiff.registerQuickDiffProvider(extension, checkSelector(selector), quickDiffProvider, id, label, rootUri);
			},
			get tabGroups(): vscode.TabGroups {
				return extHostEditorTabs.tabGroups;
			},
			registerShareProvider(selector: vscode.DocumentSelector, provider: vscode.ShareProvider): vscode.Disposable {
				checkProposedApiEnabled(extension, 'shareProvider');
				return extHostShare.registerShareProvider(checkSelector(selector), provider);
			},
			get nativeHandle(): Uint8Array | undefined {
				checkProposedApiEnabled(extension, 'nativeWindowHandle');
				return extHostWindow.nativeHandle;
			},
			createChatStatusItem: (id: string) => {
				checkProposedApiEnabled(extension, 'chatStatusItem');
				return extHostChatStatus.createChatStatusItem(extension, id);
			},
		};

		// namespace: workspace

		const workspace: typeof vscode.workspace = {
			get rootPath() {
				extHostApiDeprecation.report('workspace.rootPath', extension,
					`Please use 'workspace.workspaceFolders' instead. More details: https://aka.ms/vscode-eliminating-rootpath`);

				return extHostWorkspace.getPath();
			},
			set rootPath(value) {
				throw new errors.ReadonlyError('rootPath');
			},
			getWorkspaceFolder(resource) {
				return extHostWorkspace.getWorkspaceFolder(resource);
			},
			get workspaceFolders() {
				return extHostWorkspace.getWorkspaceFolders();
			},
			get name() {
				return extHostWorkspace.name;
			},
			set name(value) {
				throw new errors.ReadonlyError('name');
			},
			get workspaceFile() {
				return extHostWorkspace.workspaceFile;
			},
			set workspaceFile(value) {
				throw new errors.ReadonlyError('workspaceFile');
			},
			updateWorkspaceFolders: (index, deleteCount, ...workspaceFoldersToAdd) => {
				return extHostWorkspace.updateWorkspaceFolders(extension, index, deleteCount || 0, ...workspaceFoldersToAdd);
			},
			onDidChangeWorkspaceFolders: function (listener, thisArgs?, disposables?) {
				return _asExtensionEvent(extHostWorkspace.onDidChangeWorkspace)(listener, thisArgs, disposables);
			},
			asRelativePath: (pathOrUri, includeWorkspace?) => {
				return extHostWorkspace.getRelativePath(pathOrUri, includeWorkspace);
			},
			findFiles: (include, exclude, maxResults?, token?) => {
				// Note, undefined/null have different meanings on "exclude"
				return extHostWorkspace.findFiles(include, exclude, maxResults, extension.identifier, token);
			},
			findFiles2: (filePattern: vscode.GlobPattern[], options?: vscode.FindFiles2Options, token?: vscode.CancellationToken): Thenable<vscode.Uri[]> => {
				checkProposedApiEnabled(extension, 'findFiles2');
				return extHostWorkspace.findFiles2(filePattern, options, extension.identifier, token);
			},
			findTextInFiles: (query: vscode.TextSearchQuery, optionsOrCallback: vscode.FindTextInFilesOptions | ((result: vscode.TextSearchResult) => void), callbackOrToken?: vscode.CancellationToken | ((result: vscode.TextSearchResult) => void), token?: vscode.CancellationToken) => {
				checkProposedApiEnabled(extension, 'findTextInFiles');
				let options: vscode.FindTextInFilesOptions;
				let callback: (result: vscode.TextSearchResult) => void;

				if (typeof optionsOrCallback === 'object') {
					options = optionsOrCallback;
					callback = callbackOrToken as (result: vscode.TextSearchResult) => void;
				} else {
					options = {};
					callback = optionsOrCallback;
					token = callbackOrToken as vscode.CancellationToken;
				}

				return extHostWorkspace.findTextInFiles(query, options || {}, callback, extension.identifier, token);
			},
			findTextInFiles2: (query: vscode.TextSearchQuery2, options?: vscode.FindTextInFilesOptions2, token?: vscode.CancellationToken): vscode.FindTextInFilesResponse => {
				checkProposedApiEnabled(extension, 'findTextInFiles2');
				checkProposedApiEnabled(extension, 'textSearchProvider2');
				return extHostWorkspace.findTextInFiles2(query, options, extension.identifier, token);
			},
			save: (uri) => {
				return extHostWorkspace.save(uri);
			},
			saveAs: (uri) => {
				return extHostWorkspace.saveAs(uri);
			},
			saveAll: (includeUntitled?) => {
				return extHostWorkspace.saveAll(includeUntitled);
			},
			applyEdit(edit: vscode.WorkspaceEdit, metadata?: vscode.WorkspaceEditMetadata): Thenable<boolean> {
				return extHostBulkEdits.applyWorkspaceEdit(edit, extension, metadata);
			},
			createFileSystemWatcher: (pattern, optionsOrIgnoreCreate, ignoreChange?, ignoreDelete?): vscode.FileSystemWatcher => {
				const options: FileSystemWatcherCreateOptions = {
					ignoreCreateEvents: Boolean(optionsOrIgnoreCreate),
					ignoreChangeEvents: Boolean(ignoreChange),
					ignoreDeleteEvents: Boolean(ignoreDelete),
				};

				return extHostFileSystemEvent.createFileSystemWatcher(extHostWorkspace, configProvider, extension, pattern, options);
			},
			get textDocuments() {
				return extHostDocuments.getAllDocumentData().map(data => data.document);
			},
			set textDocuments(value) {
				throw new errors.ReadonlyError('textDocuments');
			},
			openTextDocument(uriOrFileNameOrOptions?: vscode.Uri | string | { language?: string; content?: string; encoding?: string }, options?: { encoding?: string }) {
				let uriPromise: Thenable<URI>;

				options = (options ?? uriOrFileNameOrOptions) as ({ language?: string; content?: string; encoding?: string } | undefined);

				if (typeof uriOrFileNameOrOptions === 'string') {
					uriPromise = Promise.resolve(URI.file(uriOrFileNameOrOptions));
				} else if (URI.isUri(uriOrFileNameOrOptions)) {
					uriPromise = Promise.resolve(uriOrFileNameOrOptions);
				} else if (!options || typeof options === 'object') {
					uriPromise = extHostDocuments.createDocumentData(options);
				} else {
					throw new Error('illegal argument - uriOrFileNameOrOptions');
				}

				return uriPromise.then(uri => {
					extHostLogService.trace(`openTextDocument from ${extension.identifier}`);
					if (uri.scheme === Schemas.vscodeRemote && !uri.authority) {
						extHostApiDeprecation.report('workspace.openTextDocument', extension, `A URI of 'vscode-remote' scheme requires an authority.`);
					}
					return extHostDocuments.ensureDocumentData(uri, options).then(documentData => {
						return documentData.document;
					});
				});
			},
			onDidOpenTextDocument: (listener, thisArgs?, disposables?) => {
				return _asExtensionEvent(extHostDocuments.onDidAddDocument)(listener, thisArgs, disposables);
			},
			onDidCloseTextDocument: (listener, thisArgs?, disposables?) => {
				return _asExtensionEvent(extHostDocuments.onDidRemoveDocument)(listener, thisArgs, disposables);
			},
			onDidChangeTextDocument: (listener, thisArgs?, disposables?) => {
				return _asExtensionEvent(extHostDocuments.onDidChangeDocument)(listener, thisArgs, disposables);
			},
			onDidSaveTextDocument: (listener, thisArgs?, disposables?) => {
				return _asExtensionEvent(extHostDocuments.onDidSaveDocument)(listener, thisArgs, disposables);
			},
			onWillSaveTextDocument: (listener, thisArgs?, disposables?) => {
				return _asExtensionEvent(extHostDocumentSaveParticipant.getOnWillSaveTextDocumentEvent(extension))(listener, thisArgs, disposables);
			},
			get notebookDocuments(): vscode.NotebookDocument[] {
				return extHostNotebook.notebookDocuments.map(d => d.apiNotebook);
			},
			async openNotebookDocument(uriOrType?: URI | string, content?: vscode.NotebookData) {
				let uri: URI;
				if (URI.isUri(uriOrType)) {
					uri = uriOrType;
					await extHostNotebook.openNotebookDocument(uriOrType);
				} else if (typeof uriOrType === 'string') {
					uri = URI.revive(await extHostNotebook.createNotebookDocument({ viewType: uriOrType, content }));
				} else {
					throw new Error('Invalid arguments');
				}
				return extHostNotebook.getNotebookDocument(uri).apiNotebook;
			},
			onDidSaveNotebookDocument(listener, thisArg, disposables) {
				return _asExtensionEvent(extHostNotebookDocuments.onDidSaveNotebookDocument)(listener, thisArg, disposables);
			},
			onDidChangeNotebookDocument(listener, thisArg, disposables) {
				return _asExtensionEvent(extHostNotebookDocuments.onDidChangeNotebookDocument)(listener, thisArg, disposables);
			},
			onWillSaveNotebookDocument(listener, thisArg, disposables) {
				return _asExtensionEvent(extHostNotebookDocumentSaveParticipant.getOnWillSaveNotebookDocumentEvent(extension))(listener, thisArg, disposables);
			},
			get onDidOpenNotebookDocument() {
				return _asExtensionEvent(extHostNotebook.onDidOpenNotebookDocument);
			},
			get onDidCloseNotebookDocument() {
				return _asExtensionEvent(extHostNotebook.onDidCloseNotebookDocument);
			},
			registerNotebookSerializer(viewType: string, serializer: vscode.NotebookSerializer, options?: vscode.NotebookDocumentContentOptions, registration?: vscode.NotebookRegistrationData) {
				return extHostNotebook.registerNotebookSerializer(extension, viewType, serializer, options, isProposedApiEnabled(extension, 'notebookLiveShare') ? registration : undefined);
			},
			onDidChangeConfiguration: (listener: (_: any) => any, thisArgs?: any, disposables?: extHostTypes.Disposable[]) => {
				return _asExtensionEvent(configProvider.onDidChangeConfiguration)(listener, thisArgs, disposables);
			},
			getConfiguration(section?: string, scope?: vscode.ConfigurationScope | null): vscode.WorkspaceConfiguration {
				scope = arguments.length === 1 ? undefined : scope;
				return configProvider.getConfiguration(section, scope, extension);
			},
			registerTextDocumentContentProvider(scheme: string, provider: vscode.TextDocumentContentProvider) {
				return extHostDocumentContentProviders.registerTextDocumentContentProvider(scheme, provider);
			},
			registerTaskProvider: (type: string, provider: vscode.TaskProvider) => {
				extHostApiDeprecation.report('window.registerTaskProvider', extension,
					`Use the corresponding function on the 'tasks' namespace instead`);

				return extHostTask.registerTaskProvider(extension, type, provider);
			},
			registerFileSystemProvider(scheme, provider, options) {
				return combinedDisposable(
					extHostFileSystem.registerFileSystemProvider(extension, scheme, provider, options),
					extHostConsumerFileSystem.addFileSystemProvider(scheme, provider, options)
				);
			},
			get fs() {
				return extHostConsumerFileSystem.value;
			},
			registerFileSearchProvider: (scheme: string, provider: vscode.FileSearchProvider) => {
				checkProposedApiEnabled(extension, 'fileSearchProvider');
				return extHostSearch.registerFileSearchProviderOld(scheme, provider);
			},
			registerTextSearchProvider: (scheme: string, provider: vscode.TextSearchProvider) => {
				checkProposedApiEnabled(extension, 'textSearchProvider');
				return extHostSearch.registerTextSearchProviderOld(scheme, provider);
			},
			registerAITextSearchProvider: (scheme: string, provider: vscode.AITextSearchProvider) => {
				// there are some dependencies on textSearchProvider, so we need to check for both
				checkProposedApiEnabled(extension, 'aiTextSearchProvider');
				checkProposedApiEnabled(extension, 'textSearchProvider2');
				return extHostSearch.registerAITextSearchProvider(scheme, provider);
			},
			registerFileSearchProvider2: (scheme: string, provider: vscode.FileSearchProvider2) => {
				checkProposedApiEnabled(extension, 'fileSearchProvider2');
				return extHostSearch.registerFileSearchProvider(scheme, provider);
			},
			registerTextSearchProvider2: (scheme: string, provider: vscode.TextSearchProvider2) => {
				checkProposedApiEnabled(extension, 'textSearchProvider2');
				return extHostSearch.registerTextSearchProvider(scheme, provider);
			},
			registerRemoteAuthorityResolver: (authorityPrefix: string, resolver: vscode.RemoteAuthorityResolver) => {
				checkProposedApiEnabled(extension, 'resolvers');
				return extensionService.registerRemoteAuthorityResolver(authorityPrefix, resolver);
			},
			registerResourceLabelFormatter: (formatter: vscode.ResourceLabelFormatter) => {
				checkProposedApiEnabled(extension, 'resolvers');
				return extHostLabelService.$registerResourceLabelFormatter(formatter);
			},
			getRemoteExecServer: (authority: string) => {
				checkProposedApiEnabled(extension, 'resolvers');
				return extensionService.getRemoteExecServer(authority);
			},
			onDidCreateFiles: (listener, thisArg, disposables) => {
				return _asExtensionEvent(extHostFileSystemEvent.onDidCreateFile)(listener, thisArg, disposables);
			},
			onDidDeleteFiles: (listener, thisArg, disposables) => {
				return _asExtensionEvent(extHostFileSystemEvent.onDidDeleteFile)(listener, thisArg, disposables);
			},
			onDidRenameFiles: (listener, thisArg, disposables) => {
				return _asExtensionEvent(extHostFileSystemEvent.onDidRenameFile)(listener, thisArg, disposables);
			},
			onWillCreateFiles: (listener: (e: vscode.FileWillCreateEvent) => any, thisArg?: any, disposables?: vscode.Disposable[]) => {
				return _asExtensionEvent(extHostFileSystemEvent.getOnWillCreateFileEvent(extension))(listener, thisArg, disposables);
			},
			onWillDeleteFiles: (listener: (e: vscode.FileWillDeleteEvent) => any, thisArg?: any, disposables?: vscode.Disposable[]) => {
				return _asExtensionEvent(extHostFileSystemEvent.getOnWillDeleteFileEvent(extension))(listener, thisArg, disposables);
			},
			onWillRenameFiles: (listener: (e: vscode.FileWillRenameEvent) => any, thisArg?: any, disposables?: vscode.Disposable[]) => {
				return _asExtensionEvent(extHostFileSystemEvent.getOnWillRenameFileEvent(extension))(listener, thisArg, disposables);
			},
			openTunnel: (forward: vscode.TunnelOptions) => {
				checkProposedApiEnabled(extension, 'tunnels');
				return extHostTunnelService.openTunnel(extension, forward).then(value => {
					if (!value) {
						throw new Error('cannot open tunnel');
					}
					return value;
				});
			},
			get tunnels() {
				checkProposedApiEnabled(extension, 'tunnels');
				return extHostTunnelService.getTunnels();
			},
			onDidChangeTunnels: (listener, thisArg?, disposables?) => {
				checkProposedApiEnabled(extension, 'tunnels');
				return _asExtensionEvent(extHostTunnelService.onDidChangeTunnels)(listener, thisArg, disposables);
			},
			registerPortAttributesProvider: (portSelector: vscode.PortAttributesSelector, provider: vscode.PortAttributesProvider) => {
				checkProposedApiEnabled(extension, 'portsAttributes');
				return extHostTunnelService.registerPortsAttributesProvider(portSelector, provider);
			},
			registerTunnelProvider: (tunnelProvider: vscode.TunnelProvider, information: vscode.TunnelInformation) => {
				checkProposedApiEnabled(extension, 'tunnelFactory');
				return extHostTunnelService.registerTunnelProvider(tunnelProvider, information);
			},
			registerTimelineProvider: (scheme: string | string[], provider: vscode.TimelineProvider) => {
				checkProposedApiEnabled(extension, 'timeline');
				return extHostTimeline.registerTimelineProvider(scheme, provider, extension.identifier, extHostCommands.converter);
			},
			get isTrusted() {
				return extHostWorkspace.trusted;
			},
			requestWorkspaceTrust: (options?: vscode.WorkspaceTrustRequestOptions) => {
				checkProposedApiEnabled(extension, 'workspaceTrust');
				return extHostWorkspace.requestWorkspaceTrust(options);
			},
			onDidGrantWorkspaceTrust: (listener, thisArgs?, disposables?) => {
				return _asExtensionEvent(extHostWorkspace.onDidGrantWorkspaceTrust)(listener, thisArgs, disposables);
			},
			registerEditSessionIdentityProvider: (scheme: string, provider: vscode.EditSessionIdentityProvider) => {
				checkProposedApiEnabled(extension, 'editSessionIdentityProvider');
				return extHostWorkspace.registerEditSessionIdentityProvider(scheme, provider);
			},
			onWillCreateEditSessionIdentity: (listener, thisArgs?, disposables?) => {
				checkProposedApiEnabled(extension, 'editSessionIdentityProvider');
				return _asExtensionEvent(extHostWorkspace.getOnWillCreateEditSessionIdentityEvent(extension))(listener, thisArgs, disposables);
			},
			registerCanonicalUriProvider: (scheme: string, provider: vscode.CanonicalUriProvider) => {
				checkProposedApiEnabled(extension, 'canonicalUriProvider');
				return extHostWorkspace.registerCanonicalUriProvider(scheme, provider);
			},
			getCanonicalUri: (uri: vscode.Uri, options: vscode.CanonicalUriRequestOptions, token: vscode.CancellationToken) => {
				checkProposedApiEnabled(extension, 'canonicalUriProvider');
				return extHostWorkspace.provideCanonicalUri(uri, options, token);
			},
			decode(content: Uint8Array, options?: { uri?: vscode.Uri; encoding?: string }) {
				return extHostWorkspace.decode(content, options);
			},
			encode(content: string, options?: { uri?: vscode.Uri; encoding?: string }) {
				return extHostWorkspace.encode(content, options);
			}
		};

		// namespace: scm
		const scm: typeof vscode.scm = {
			get inputBox() {
				extHostApiDeprecation.report('scm.inputBox', extension,
					`Use 'SourceControl.inputBox' instead`);

				return extHostSCM.getLastInputBox(extension)!; // Strict null override - Deprecated api
			},
			createSourceControl(id: string, label: string, rootUri?: vscode.Uri) {
				return extHostSCM.createSourceControl(extension, id, label, rootUri);
			}
		};

		// namespace: comments
		const comments: typeof vscode.comments = {
			createCommentController(id: string, label: string) {
				return extHostComment.createCommentController(extension, id, label);
			}
		};

		// namespace: debug
		const debug: typeof vscode.debug = {
			get activeDebugSession() {
				return extHostDebugService.activeDebugSession;
			},
			get activeDebugConsole() {
				return extHostDebugService.activeDebugConsole;
			},
			get breakpoints() {
				return extHostDebugService.breakpoints;
			},
			get activeStackItem() {
				return extHostDebugService.activeStackItem;
			},
			registerDebugVisualizationProvider(id, provider) {
				checkProposedApiEnabled(extension, 'debugVisualization');
				return extHostDebugService.registerDebugVisualizationProvider(extension, id, provider);
			},
			registerDebugVisualizationTreeProvider(id, provider) {
				checkProposedApiEnabled(extension, 'debugVisualization');
				return extHostDebugService.registerDebugVisualizationTree(extension, id, provider);
			},
			onDidStartDebugSession(listener, thisArg?, disposables?) {
				return _asExtensionEvent(extHostDebugService.onDidStartDebugSession)(listener, thisArg, disposables);
			},
			onDidTerminateDebugSession(listener, thisArg?, disposables?) {
				return _asExtensionEvent(extHostDebugService.onDidTerminateDebugSession)(listener, thisArg, disposables);
			},
			onDidChangeActiveDebugSession(listener, thisArg?, disposables?) {
				return _asExtensionEvent(extHostDebugService.onDidChangeActiveDebugSession)(listener, thisArg, disposables);
			},
			onDidReceiveDebugSessionCustomEvent(listener, thisArg?, disposables?) {
				return _asExtensionEvent(extHostDebugService.onDidReceiveDebugSessionCustomEvent)(listener, thisArg, disposables);
			},
			onDidChangeBreakpoints(listener, thisArgs?, disposables?) {
				return _asExtensionEvent(extHostDebugService.onDidChangeBreakpoints)(listener, thisArgs, disposables);
			},
			onDidChangeActiveStackItem(listener, thisArg?, disposables?) {
				return _asExtensionEvent(extHostDebugService.onDidChangeActiveStackItem)(listener, thisArg, disposables);
			},
			registerDebugConfigurationProvider(debugType: string, provider: vscode.DebugConfigurationProvider, triggerKind?: vscode.DebugConfigurationProviderTriggerKind) {
				return extHostDebugService.registerDebugConfigurationProvider(debugType, provider, triggerKind || DebugConfigurationProviderTriggerKind.Initial);
			},
			registerDebugAdapterDescriptorFactory(debugType: string, factory: vscode.DebugAdapterDescriptorFactory) {
				return extHostDebugService.registerDebugAdapterDescriptorFactory(extension, debugType, factory);
			},
			registerDebugAdapterTrackerFactory(debugType: string, factory: vscode.DebugAdapterTrackerFactory) {
				return extHostDebugService.registerDebugAdapterTrackerFactory(debugType, factory);
			},
			startDebugging(folder: vscode.WorkspaceFolder | undefined, nameOrConfig: string | vscode.DebugConfiguration, parentSessionOrOptions?: vscode.DebugSession | vscode.DebugSessionOptions) {
				if (!parentSessionOrOptions || (typeof parentSessionOrOptions === 'object' && 'configuration' in parentSessionOrOptions)) {
					return extHostDebugService.startDebugging(folder, nameOrConfig, { parentSession: parentSessionOrOptions });
				}
				return extHostDebugService.startDebugging(folder, nameOrConfig, parentSessionOrOptions || {});
			},
			stopDebugging(session?: vscode.DebugSession) {
				return extHostDebugService.stopDebugging(session);
			},
			addBreakpoints(breakpoints: readonly vscode.Breakpoint[]) {
				return extHostDebugService.addBreakpoints(breakpoints);
			},
			removeBreakpoints(breakpoints: readonly vscode.Breakpoint[]) {
				return extHostDebugService.removeBreakpoints(breakpoints);
			},
			asDebugSourceUri(source: vscode.DebugProtocolSource, session?: vscode.DebugSession): vscode.Uri {
				return extHostDebugService.asDebugSourceUri(source, session);
			}
		};

		const tasks: typeof vscode.tasks = {
			registerTaskProvider: (type: string, provider: vscode.TaskProvider) => {
				return extHostTask.registerTaskProvider(extension, type, provider);
			},
			fetchTasks: (filter?: vscode.TaskFilter): Thenable<vscode.Task[]> => {
				return extHostTask.fetchTasks(filter);
			},
			executeTask: (task: vscode.Task): Thenable<vscode.TaskExecution> => {
				return extHostTask.executeTask(extension, task);
			},
			get taskExecutions(): vscode.TaskExecution[] {
				return extHostTask.taskExecutions;
			},
			onDidStartTask: (listeners, thisArgs?, disposables?) => {
				return _asExtensionEvent(extHostTask.onDidStartTask)(listeners, thisArgs, disposables);
			},
			onDidEndTask: (listeners, thisArgs?, disposables?) => {
				return _asExtensionEvent(extHostTask.onDidEndTask)(listeners, thisArgs, disposables);
			},
			onDidStartTaskProcess: (listeners, thisArgs?, disposables?) => {
				return _asExtensionEvent(extHostTask.onDidStartTaskProcess)(listeners, thisArgs, disposables);
			},
			onDidEndTaskProcess: (listeners, thisArgs?, disposables?) => {
				return _asExtensionEvent(extHostTask.onDidEndTaskProcess)(listeners, thisArgs, disposables);
			},
			onDidStartTaskProblemMatchers: (listeners, thisArgs?, disposables?) => {
				checkProposedApiEnabled(extension, 'taskProblemMatcherStatus');
				return _asExtensionEvent(extHostTask.onDidStartTaskProblemMatchers)(listeners, thisArgs, disposables);
			},
			onDidEndTaskProblemMatchers: (listeners, thisArgs?, disposables?) => {
				checkProposedApiEnabled(extension, 'taskProblemMatcherStatus');
				return _asExtensionEvent(extHostTask.onDidEndTaskProblemMatchers)(listeners, thisArgs, disposables);
			}
		};

		// namespace: notebook
		const notebooks: typeof vscode.notebooks = {
			createNotebookController(id: string, notebookType: string, label: string, handler?, rendererScripts?: vscode.NotebookRendererScript[]) {
				return extHostNotebookKernels.createNotebookController(extension, id, notebookType, label, handler, isProposedApiEnabled(extension, 'notebookMessaging') ? rendererScripts : undefined);
			},
			registerNotebookCellStatusBarItemProvider: (notebookType: string, provider: vscode.NotebookCellStatusBarItemProvider) => {
				return extHostNotebook.registerNotebookCellStatusBarItemProvider(extension, notebookType, provider);
			},
			createRendererMessaging(rendererId) {
				return extHostNotebookRenderers.createRendererMessaging(extension, rendererId);
			},
			createNotebookControllerDetectionTask(notebookType: string) {
				checkProposedApiEnabled(extension, 'notebookKernelSource');
				return extHostNotebookKernels.createNotebookControllerDetectionTask(extension, notebookType);
			},
			registerKernelSourceActionProvider(notebookType: string, provider: vscode.NotebookKernelSourceActionProvider) {
				checkProposedApiEnabled(extension, 'notebookKernelSource');
				return extHostNotebookKernels.registerKernelSourceActionProvider(extension, notebookType, provider);
			},
		};

		// namespace: l10n
		const l10n: typeof vscode.l10n = {
			t(...params: [message: string, ...args: Array<string | number | boolean>] | [message: string, args: Record<string, any>] | [{ message: string; args?: Array<string | number | boolean> | Record<string, any>; comment: string | string[] }]): string {
				if (typeof params[0] === 'string') {
					const key = params.shift() as string;

					// We have either rest args which are Array<string | number | boolean> or an array with a single Record<string, any>.
					// This ensures we get a Record<string | number, any> which will be formatted correctly.
					const argsFormatted = !params || typeof params[0] !== 'object' ? params : params[0];
					return extHostLocalization.getMessage(extension.identifier.value, { message: key, args: argsFormatted as Record<string | number, any> | undefined });
				}

				return extHostLocalization.getMessage(extension.identifier.value, params[0]);
			},
			get bundle() {
				return extHostLocalization.getBundle(extension.identifier.value);
			},
			get uri() {
				return extHostLocalization.getBundleUri(extension.identifier.value);
			}
		};

		// namespace: interactive
		const interactive: typeof vscode.interactive = {
			transferActiveChat(toWorkspace: vscode.Uri) {
				checkProposedApiEnabled(extension, 'interactive');
				return extHostChatAgents2.transferActiveChat(toWorkspace);
			}
		};

		// namespace: ai
		const ai: typeof vscode.ai = {
			getRelatedInformation(query: string, types: vscode.RelatedInformationType[]): Thenable<vscode.RelatedInformationResult[]> {
				checkProposedApiEnabled(extension, 'aiRelatedInformation');
				return extHostAiRelatedInformation.getRelatedInformation(extension, query, types);
			},
			registerRelatedInformationProvider(type: vscode.RelatedInformationType, provider: vscode.RelatedInformationProvider) {
				checkProposedApiEnabled(extension, 'aiRelatedInformation');
				return extHostAiRelatedInformation.registerRelatedInformationProvider(extension, type, provider);
			},
			registerEmbeddingVectorProvider(model: string, provider: vscode.EmbeddingVectorProvider) {
				checkProposedApiEnabled(extension, 'aiRelatedInformation');
				return extHostAiEmbeddingVector.registerEmbeddingVectorProvider(extension, model, provider);
			},
			registerSettingsSearchProvider(provider: vscode.SettingsSearchProvider) {
				checkProposedApiEnabled(extension, 'aiSettingsSearch');
				return extHostAiSettingsSearch.registerSettingsSearchProvider(extension, provider);
			}
		};

		// namespace: chatregisterMcpServerDefinitionProvider
		const chat: typeof vscode.chat = {
			registerMappedEditsProvider(_selector: vscode.DocumentSelector, _provider: vscode.MappedEditsProvider) {
				checkProposedApiEnabled(extension, 'mappedEditsProvider');
				// no longer supported
				return { dispose() { } };
			},
			registerMappedEditsProvider2(provider: vscode.MappedEditsProvider2) {
				checkProposedApiEnabled(extension, 'mappedEditsProvider');
				return extHostCodeMapper.registerMappedEditsProvider(extension, provider);
			},
			createChatParticipant(id: string, handler: vscode.ChatExtendedRequestHandler) {
				return extHostChatAgents2.createChatAgent(extension, id, handler);
			},
			createDynamicChatParticipant(id: string, dynamicProps: vscode.DynamicChatParticipantProps, handler: vscode.ChatExtendedRequestHandler): vscode.ChatParticipant {
				checkProposedApiEnabled(extension, 'chatParticipantPrivate');
				return extHostChatAgents2.createDynamicChatAgent(extension, id, dynamicProps, handler);
			},
			registerChatParticipantDetectionProvider(provider: vscode.ChatParticipantDetectionProvider) {
				checkProposedApiEnabled(extension, 'chatParticipantPrivate');
				return extHostChatAgents2.registerChatParticipantDetectionProvider(extension, provider);
			},
			registerRelatedFilesProvider(provider: vscode.ChatRelatedFilesProvider, metadata: vscode.ChatRelatedFilesProviderMetadata) {
				checkProposedApiEnabled(extension, 'chatEditing');
				return extHostChatAgents2.registerRelatedFilesProvider(extension, provider, metadata);
			},
			onDidDisposeChatSession: (listeners, thisArgs?, disposables?) => {
				checkProposedApiEnabled(extension, 'chatParticipantPrivate');
				return _asExtensionEvent(extHostChatAgents2.onDidDisposeChatSession)(listeners, thisArgs, disposables);
			}
		};

		// namespace: lm
		const lm: typeof vscode.lm = {
			selectChatModels: (selector) => {
				return extHostLanguageModels.selectLanguageModels(extension, selector ?? {});
			},
			onDidChangeChatModels: (listener, thisArgs?, disposables?) => {
				return extHostLanguageModels.onDidChangeProviders(listener, thisArgs, disposables);
			},
			registerChatModelProvider: (id, provider, metadata) => {
				checkProposedApiEnabled(extension, 'chatProvider');
				return extHostLanguageModels.registerLanguageModel(extension, id, provider, metadata);
			},
			// --- embeddings
			get embeddingModels() {
				checkProposedApiEnabled(extension, 'embeddings');
				return extHostEmbeddings.embeddingsModels;
			},
			onDidChangeEmbeddingModels: (listener, thisArgs?, disposables?) => {
				checkProposedApiEnabled(extension, 'embeddings');
				return extHostEmbeddings.onDidChange(listener, thisArgs, disposables);
			},
			registerEmbeddingsProvider(embeddingsModel, provider) {
				checkProposedApiEnabled(extension, 'embeddings');
				return extHostEmbeddings.registerEmbeddingsProvider(extension, embeddingsModel, provider);
			},
			async computeEmbeddings(embeddingsModel, input, token?): Promise<any> {
				checkProposedApiEnabled(extension, 'embeddings');
				if (typeof input === 'string') {
					return extHostEmbeddings.computeEmbeddings(embeddingsModel, input, token);
				} else {
					return extHostEmbeddings.computeEmbeddings(embeddingsModel, input, token);
				}
			},
			registerTool<T>(name: string, tool: vscode.LanguageModelTool<T>) {
				return extHostLanguageModelTools.registerTool(extension, name, tool);
			},
			invokeTool<T>(name: string, parameters: vscode.LanguageModelToolInvocationOptions<T>, token?: vscode.CancellationToken) {
				return extHostLanguageModelTools.invokeTool(extension, name, parameters, token);
			},
			get tools() {
				return extHostLanguageModelTools.getTools(extension);
			},
			fileIsIgnored(uri: vscode.Uri, token?: vscode.CancellationToken) {
				return extHostLanguageModels.fileIsIgnored(extension, uri, token);
			},
			registerIgnoredFileProvider(provider: vscode.LanguageModelIgnoredFileProvider) {
				return extHostLanguageModels.registerIgnoredFileProvider(extension, provider);
			},
			registerMcpServerDefinitionProvider(id, provider) {
				return extHostMcp.registerMcpConfigurationProvider(extension, id, provider);
			}
		};

		// namespace: speech
		const speech: typeof vscode.speech = {
			registerSpeechProvider(id: string, provider: vscode.SpeechProvider) {
				checkProposedApiEnabled(extension, 'speech');
				return extHostSpeech.registerProvider(extension.identifier, id, provider);
			}
		};

		// eslint-disable-next-line local/code-no-dangerous-type-assertions
		return <typeof vscode>{
			version: initData.version,
			// namespaces
			ai,
			authentication,
			commands,
			comments,
			chat,
			debug,
			env,
			extensions,
			interactive,
			l10n,
			languages,
			lm,
			notebooks,
			scm,
			speech,
			tasks,
			tests,
			window,
			workspace,
			// types
			Breakpoint: extHostTypes.Breakpoint,
			TerminalOutputAnchor: extHostTypes.TerminalOutputAnchor,
			ChatResultFeedbackKind: extHostTypes.ChatResultFeedbackKind,
			ChatVariableLevel: extHostTypes.ChatVariableLevel,
			ChatCompletionItem: extHostTypes.ChatCompletionItem,
			ChatReferenceDiagnostic: extHostTypes.ChatReferenceDiagnostic,
			CallHierarchyIncomingCall: extHostTypes.CallHierarchyIncomingCall,
			CallHierarchyItem: extHostTypes.CallHierarchyItem,
			CallHierarchyOutgoingCall: extHostTypes.CallHierarchyOutgoingCall,
			CancellationError: errors.CancellationError,
			CancellationTokenSource: CancellationTokenSource,
			CandidatePortSource: CandidatePortSource,
			CodeAction: extHostTypes.CodeAction,
			CodeActionKind: extHostTypes.CodeActionKind,
			CodeActionTriggerKind: extHostTypes.CodeActionTriggerKind,
			CodeLens: extHostTypes.CodeLens,
			Color: extHostTypes.Color,
			ColorInformation: extHostTypes.ColorInformation,
			ColorPresentation: extHostTypes.ColorPresentation,
			ColorThemeKind: extHostTypes.ColorThemeKind,
			CommentMode: extHostTypes.CommentMode,
			CommentState: extHostTypes.CommentState,
			CommentThreadCollapsibleState: extHostTypes.CommentThreadCollapsibleState,
			CommentThreadState: extHostTypes.CommentThreadState,
			CommentThreadApplicability: extHostTypes.CommentThreadApplicability,
			CommentThreadFocus: extHostTypes.CommentThreadFocus,
			CompletionItem: extHostTypes.CompletionItem,
			CompletionItemKind: extHostTypes.CompletionItemKind,
			CompletionItemTag: extHostTypes.CompletionItemTag,
			CompletionList: extHostTypes.CompletionList,
			CompletionTriggerKind: extHostTypes.CompletionTriggerKind,
			ConfigurationTarget: extHostTypes.ConfigurationTarget,
			CustomExecution: extHostTypes.CustomExecution,
			DebugAdapterExecutable: extHostTypes.DebugAdapterExecutable,
			DebugAdapterInlineImplementation: extHostTypes.DebugAdapterInlineImplementation,
			DebugAdapterNamedPipeServer: extHostTypes.DebugAdapterNamedPipeServer,
			DebugAdapterServer: extHostTypes.DebugAdapterServer,
			DebugConfigurationProviderTriggerKind: DebugConfigurationProviderTriggerKind,
			DebugConsoleMode: extHostTypes.DebugConsoleMode,
			DebugVisualization: extHostTypes.DebugVisualization,
			DecorationRangeBehavior: extHostTypes.DecorationRangeBehavior,
			Diagnostic: extHostTypes.Diagnostic,
			DiagnosticRelatedInformation: extHostTypes.DiagnosticRelatedInformation,
			DiagnosticSeverity: extHostTypes.DiagnosticSeverity,
			DiagnosticTag: extHostTypes.DiagnosticTag,
			Disposable: extHostTypes.Disposable,
			DocumentHighlight: extHostTypes.DocumentHighlight,
			DocumentHighlightKind: extHostTypes.DocumentHighlightKind,
			MultiDocumentHighlight: extHostTypes.MultiDocumentHighlight,
			DocumentLink: extHostTypes.DocumentLink,
			DocumentSymbol: extHostTypes.DocumentSymbol,
			EndOfLine: extHostTypes.EndOfLine,
			EnvironmentVariableMutatorType: extHostTypes.EnvironmentVariableMutatorType,
			EvaluatableExpression: extHostTypes.EvaluatableExpression,
			InlineValueText: extHostTypes.InlineValueText,
			InlineValueVariableLookup: extHostTypes.InlineValueVariableLookup,
			InlineValueEvaluatableExpression: extHostTypes.InlineValueEvaluatableExpression,
			InlineCompletionTriggerKind: extHostTypes.InlineCompletionTriggerKind,
			EventEmitter: Emitter,
			ExtensionKind: extHostTypes.ExtensionKind,
			ExtensionMode: extHostTypes.ExtensionMode,
			ExternalUriOpenerPriority: extHostTypes.ExternalUriOpenerPriority,
			FileChangeType: extHostTypes.FileChangeType,
			FileDecoration: extHostTypes.FileDecoration,
			FileDecoration2: extHostTypes.FileDecoration,
			FileSystemError: extHostTypes.FileSystemError,
			FileType: files.FileType,
			FilePermission: files.FilePermission,
			FoldingRange: extHostTypes.FoldingRange,
			FoldingRangeKind: extHostTypes.FoldingRangeKind,
			FunctionBreakpoint: extHostTypes.FunctionBreakpoint,
			InlineCompletionItem: extHostTypes.InlineSuggestion,
			InlineCompletionList: extHostTypes.InlineSuggestionList,
			Hover: extHostTypes.Hover,
			VerboseHover: extHostTypes.VerboseHover,
			HoverVerbosityAction: extHostTypes.HoverVerbosityAction,
			IndentAction: languageConfiguration.IndentAction,
			Location: extHostTypes.Location,
			MarkdownString: extHostTypes.MarkdownString,
			OverviewRulerLane: OverviewRulerLane,
			ParameterInformation: extHostTypes.ParameterInformation,
			PortAutoForwardAction: extHostTypes.PortAutoForwardAction,
			Position: extHostTypes.Position,
			ProcessExecution: extHostTypes.ProcessExecution,
			ProgressLocation: extHostTypes.ProgressLocation,
			QuickInputButtonLocation: extHostTypes.QuickInputButtonLocation,
			QuickInputButtons: extHostTypes.QuickInputButtons,
			Range: extHostTypes.Range,
			RelativePattern: extHostTypes.RelativePattern,
			Selection: extHostTypes.Selection,
			SelectionRange: extHostTypes.SelectionRange,
			SemanticTokens: extHostTypes.SemanticTokens,
			SemanticTokensBuilder: extHostTypes.SemanticTokensBuilder,
			SemanticTokensEdit: extHostTypes.SemanticTokensEdit,
			SemanticTokensEdits: extHostTypes.SemanticTokensEdits,
			SemanticTokensLegend: extHostTypes.SemanticTokensLegend,
			ShellExecution: extHostTypes.ShellExecution,
			ShellQuoting: extHostTypes.ShellQuoting,
			SignatureHelp: extHostTypes.SignatureHelp,
			SignatureHelpTriggerKind: extHostTypes.SignatureHelpTriggerKind,
			SignatureInformation: extHostTypes.SignatureInformation,
			SnippetString: extHostTypes.SnippetString,
			SourceBreakpoint: extHostTypes.SourceBreakpoint,
			StandardTokenType: extHostTypes.StandardTokenType,
			StatusBarAlignment: extHostTypes.StatusBarAlignment,
			SymbolInformation: extHostTypes.SymbolInformation,
			SymbolKind: extHostTypes.SymbolKind,
			SymbolTag: extHostTypes.SymbolTag,
			Task: extHostTypes.Task,
			TaskEventKind: extHostTypes.TaskEventKind,
			TaskGroup: extHostTypes.TaskGroup,
			TaskPanelKind: extHostTypes.TaskPanelKind,
			TaskRevealKind: extHostTypes.TaskRevealKind,
			TaskScope: extHostTypes.TaskScope,
			TerminalLink: extHostTypes.TerminalLink,
			TerminalQuickFixTerminalCommand: extHostTypes.TerminalQuickFixCommand,
			TerminalQuickFixOpener: extHostTypes.TerminalQuickFixOpener,
			TerminalLocation: extHostTypes.TerminalLocation,
			TerminalProfile: extHostTypes.TerminalProfile,
			TerminalExitReason: extHostTypes.TerminalExitReason,
			TerminalShellExecutionCommandLineConfidence: extHostTypes.TerminalShellExecutionCommandLineConfidence,
			TerminalCompletionItem: extHostTypes.TerminalCompletionItem,
			TerminalCompletionItemKind: extHostTypes.TerminalCompletionItemKind,
			TerminalCompletionList: extHostTypes.TerminalCompletionList,
			TerminalShellType: extHostTypes.TerminalShellType,
			TextDocumentSaveReason: extHostTypes.TextDocumentSaveReason,
			TextEdit: extHostTypes.TextEdit,
			SnippetTextEdit: extHostTypes.SnippetTextEdit,
			TextEditorCursorStyle: TextEditorCursorStyle,
			TextEditorChangeKind: extHostTypes.TextEditorChangeKind,
			TextEditorLineNumbersStyle: extHostTypes.TextEditorLineNumbersStyle,
			TextEditorRevealType: extHostTypes.TextEditorRevealType,
			TextEditorSelectionChangeKind: extHostTypes.TextEditorSelectionChangeKind,
			SyntaxTokenType: extHostTypes.SyntaxTokenType,
			TextDocumentChangeReason: extHostTypes.TextDocumentChangeReason,
			ThemeColor: extHostTypes.ThemeColor,
			ThemeIcon: extHostTypes.ThemeIcon,
			TreeItem: extHostTypes.TreeItem,
			TreeItemCheckboxState: extHostTypes.TreeItemCheckboxState,
			TreeItemCollapsibleState: extHostTypes.TreeItemCollapsibleState,
			TypeHierarchyItem: extHostTypes.TypeHierarchyItem,
			UIKind: UIKind,
			Uri: URI,
			ViewColumn: extHostTypes.ViewColumn,
			WorkspaceEdit: extHostTypes.WorkspaceEdit,
			// proposed api types
			DocumentPasteTriggerKind: extHostTypes.DocumentPasteTriggerKind,
			DocumentDropEdit: extHostTypes.DocumentDropEdit,
			DocumentDropOrPasteEditKind: extHostTypes.DocumentDropOrPasteEditKind,
			DocumentPasteEdit: extHostTypes.DocumentPasteEdit,
			InlayHint: extHostTypes.InlayHint,
			InlayHintLabelPart: extHostTypes.InlayHintLabelPart,
			InlayHintKind: extHostTypes.InlayHintKind,
			RemoteAuthorityResolverError: extHostTypes.RemoteAuthorityResolverError,
			ResolvedAuthority: extHostTypes.ResolvedAuthority,
			ManagedResolvedAuthority: extHostTypes.ManagedResolvedAuthority,
			SourceControlInputBoxValidationType: extHostTypes.SourceControlInputBoxValidationType,
			ExtensionRuntime: extHostTypes.ExtensionRuntime,
			TimelineItem: extHostTypes.TimelineItem,
			NotebookRange: extHostTypes.NotebookRange,
			NotebookCellKind: extHostTypes.NotebookCellKind,
			NotebookCellExecutionState: extHostTypes.NotebookCellExecutionState,
			NotebookCellData: extHostTypes.NotebookCellData,
			NotebookData: extHostTypes.NotebookData,
			NotebookRendererScript: extHostTypes.NotebookRendererScript,
			NotebookCellStatusBarAlignment: extHostTypes.NotebookCellStatusBarAlignment,
			NotebookEditorRevealType: extHostTypes.NotebookEditorRevealType,
			NotebookCellOutput: extHostTypes.NotebookCellOutput,
			NotebookCellOutputItem: extHostTypes.NotebookCellOutputItem,
			CellErrorStackFrame: extHostTypes.CellErrorStackFrame,
			NotebookCellStatusBarItem: extHostTypes.NotebookCellStatusBarItem,
			NotebookControllerAffinity: extHostTypes.NotebookControllerAffinity,
			NotebookControllerAffinity2: extHostTypes.NotebookControllerAffinity2,
			NotebookEdit: extHostTypes.NotebookEdit,
			NotebookKernelSourceAction: extHostTypes.NotebookKernelSourceAction,
			NotebookVariablesRequestKind: extHostTypes.NotebookVariablesRequestKind,
			PortAttributes: extHostTypes.PortAttributes,
			LinkedEditingRanges: extHostTypes.LinkedEditingRanges,
			TestResultState: extHostTypes.TestResultState,
			TestRunRequest: extHostTypes.TestRunRequest,
			TestMessage: extHostTypes.TestMessage,
			TestMessageStackFrame: extHostTypes.TestMessageStackFrame,
			TestTag: extHostTypes.TestTag,
			TestRunProfileKind: extHostTypes.TestRunProfileKind,
			TextSearchCompleteMessageType: TextSearchCompleteMessageType,
			DataTransfer: extHostTypes.DataTransfer,
			DataTransferItem: extHostTypes.DataTransferItem,
			TestCoverageCount: extHostTypes.TestCoverageCount,
			FileCoverage: extHostTypes.FileCoverage,
			StatementCoverage: extHostTypes.StatementCoverage,
			BranchCoverage: extHostTypes.BranchCoverage,
			DeclarationCoverage: extHostTypes.DeclarationCoverage,
			WorkspaceTrustState: extHostTypes.WorkspaceTrustState,
			LanguageStatusSeverity: extHostTypes.LanguageStatusSeverity,
			QuickPickItemKind: extHostTypes.QuickPickItemKind,
			InputBoxValidationSeverity: extHostTypes.InputBoxValidationSeverity,
			TabInputText: extHostTypes.TextTabInput,
			TabInputTextDiff: extHostTypes.TextDiffTabInput,
			TabInputTextMerge: extHostTypes.TextMergeTabInput,
			TabInputCustom: extHostTypes.CustomEditorTabInput,
			TabInputNotebook: extHostTypes.NotebookEditorTabInput,
			TabInputNotebookDiff: extHostTypes.NotebookDiffEditorTabInput,
			TabInputWebview: extHostTypes.WebviewEditorTabInput,
			TabInputTerminal: extHostTypes.TerminalEditorTabInput,
			TabInputInteractiveWindow: extHostTypes.InteractiveWindowInput,
			TabInputChat: extHostTypes.ChatEditorTabInput,
			TabInputTextMultiDiff: extHostTypes.TextMultiDiffTabInput,
			TelemetryTrustedValue: TelemetryTrustedValue,
			LogLevel: LogLevel,
			EditSessionIdentityMatch: EditSessionIdentityMatch,
			InteractiveSessionVoteDirection: extHostTypes.InteractiveSessionVoteDirection,
			ChatCopyKind: extHostTypes.ChatCopyKind,
			ChatEditingSessionActionOutcome: extHostTypes.ChatEditingSessionActionOutcome,
			InteractiveEditorResponseFeedbackKind: extHostTypes.InteractiveEditorResponseFeedbackKind,
			DebugStackFrame: extHostTypes.DebugStackFrame,
			DebugThread: extHostTypes.DebugThread,
			RelatedInformationType: extHostTypes.RelatedInformationType,
			SpeechToTextStatus: extHostTypes.SpeechToTextStatus,
			TextToSpeechStatus: extHostTypes.TextToSpeechStatus,
			PartialAcceptTriggerKind: extHostTypes.PartialAcceptTriggerKind,
			InlineCompletionEndOfLifeReasonKind: extHostTypes.InlineCompletionEndOfLifeReasonKind,
			KeywordRecognitionStatus: extHostTypes.KeywordRecognitionStatus,
			ChatImageMimeType: extHostTypes.ChatImageMimeType,
			ChatResponseMarkdownPart: extHostTypes.ChatResponseMarkdownPart,
			ChatResponseFileTreePart: extHostTypes.ChatResponseFileTreePart,
			ChatResponseAnchorPart: extHostTypes.ChatResponseAnchorPart,
			ChatResponseProgressPart: extHostTypes.ChatResponseProgressPart,
			ChatResponseProgressPart2: extHostTypes.ChatResponseProgressPart2,
			ChatResponseReferencePart: extHostTypes.ChatResponseReferencePart,
			ChatResponseReferencePart2: extHostTypes.ChatResponseReferencePart,
			ChatResponseCodeCitationPart: extHostTypes.ChatResponseCodeCitationPart,
			ChatResponseCodeblockUriPart: extHostTypes.ChatResponseCodeblockUriPart,
			ChatResponseWarningPart: extHostTypes.ChatResponseWarningPart,
			ChatResponseTextEditPart: extHostTypes.ChatResponseTextEditPart,
			ChatResponseNotebookEditPart: extHostTypes.ChatResponseNotebookEditPart,
			ChatResponseMarkdownWithVulnerabilitiesPart: extHostTypes.ChatResponseMarkdownWithVulnerabilitiesPart,
			ChatResponseCommandButtonPart: extHostTypes.ChatResponseCommandButtonPart,
			ChatResponseConfirmationPart: extHostTypes.ChatResponseConfirmationPart,
			ChatResponseMovePart: extHostTypes.ChatResponseMovePart,
			ChatResponseExtensionsPart: extHostTypes.ChatResponseExtensionsPart,
			ChatPrepareToolInvocationPart: extHostTypes.ChatPrepareToolInvocationPart,
			ChatResponseReferencePartStatusKind: extHostTypes.ChatResponseReferencePartStatusKind,
			ChatRequestTurn: extHostTypes.ChatRequestTurn,
			ChatRequestTurn2: extHostTypes.ChatRequestTurn,
			ChatResponseTurn: extHostTypes.ChatResponseTurn,
			ChatLocation: extHostTypes.ChatLocation,
			ChatRequestEditorData: extHostTypes.ChatRequestEditorData,
			ChatRequestNotebookData: extHostTypes.ChatRequestNotebookData,
			ChatReferenceBinaryData: extHostTypes.ChatReferenceBinaryData,
			ChatRequestEditedFileEventKind: extHostTypes.ChatRequestEditedFileEventKind,
			LanguageModelChatMessageRole: extHostTypes.LanguageModelChatMessageRole,
			LanguageModelChatMessage: extHostTypes.LanguageModelChatMessage,
			LanguageModelChatMessage2: extHostTypes.LanguageModelChatMessage2,
			LanguageModelToolResultPart: extHostTypes.LanguageModelToolResultPart,
			LanguageModelToolResultPart2: extHostTypes.LanguageModelToolResultPart2,
			LanguageModelTextPart: extHostTypes.LanguageModelTextPart,
			LanguageModelToolCallPart: extHostTypes.LanguageModelToolCallPart,
			LanguageModelError: extHostTypes.LanguageModelError,
			LanguageModelToolResult: extHostTypes.LanguageModelToolResult,
			LanguageModelToolResult2: extHostTypes.LanguageModelToolResult2,
			LanguageModelDataPart: extHostTypes.LanguageModelDataPart,
			ExtendedLanguageModelToolResult: extHostTypes.ExtendedLanguageModelToolResult,
			PreparedTerminalToolInvocation: extHostTypes.PreparedTerminalToolInvocation,
			LanguageModelChatToolMode: extHostTypes.LanguageModelChatToolMode,
			LanguageModelPromptTsxPart: extHostTypes.LanguageModelPromptTsxPart,
			NewSymbolName: extHostTypes.NewSymbolName,
			NewSymbolNameTag: extHostTypes.NewSymbolNameTag,
			NewSymbolNameTriggerKind: extHostTypes.NewSymbolNameTriggerKind,
			InlineEdit: extHostTypes.InlineEdit,
			InlineEditTriggerKind: extHostTypes.InlineEditTriggerKind,
			ExcludeSettingOptions: ExcludeSettingOptions,
			TextSearchContext2: TextSearchContext2,
			TextSearchMatch2: TextSearchMatch2,
			AISearchKeyword: AISearchKeyword,
			TextSearchCompleteMessageTypeNew: TextSearchCompleteMessageType,
			ChatErrorLevel: extHostTypes.ChatErrorLevel,
			McpHttpServerDefinition: extHostTypes.McpHttpServerDefinition,
			McpStdioServerDefinition: extHostTypes.McpStdioServerDefinition,
			SettingsSearchResultKind: extHostTypes.SettingsSearchResultKind
		};
	};
}
