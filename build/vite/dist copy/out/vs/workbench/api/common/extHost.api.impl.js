/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
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
import { ExtensionError, ExtensionIdentifierSet } from '../../../platform/extensions/common/extensions.js';
import * as files from '../../../platform/files/common/files.js';
import { ILogService, ILoggerService, LogLevel } from '../../../platform/log/common/log.js';
import { getRemoteName } from '../../../platform/remote/common/remoteHosts.js';
import { TelemetryTrustedValue } from '../../../platform/telemetry/common/telemetryUtils.js';
import { EditSessionIdentityMatch } from '../../../platform/workspace/common/editSessions.js';
import { DebugConfigurationProviderTriggerKind } from '../../contrib/debug/common/debug.js';
import { PromptsType } from '../../contrib/chat/common/promptSyntax/promptTypes.js';
import { UIKind } from '../../services/extensions/common/extensionHostProtocol.js';
import { checkProposedApiEnabled, isProposedApiEnabled } from '../../services/extensions/common/extensions.js';
import { AISearchKeyword, ExcludeSettingOptions, TextSearchCompleteMessageType, TextSearchContext2, TextSearchMatch2 } from '../../services/search/common/searchExtTypes.js';
import { CandidatePortSource, ExtHostContext, MainContext } from './extHost.protocol.js';
import { ExtHostRelatedInformation } from './extHostAiRelatedInformation.js';
import { ExtHostAiSettingsSearch } from './extHostAiSettingsSearch.js';
import { ExtHostApiCommands } from './extHostApiCommands.js';
import { IExtHostApiDeprecationService } from './extHostApiDeprecationService.js';
import { IExtHostAuthentication } from './extHostAuthentication.js';
import { ExtHostBulkEdits } from './extHostBulkEdits.js';
import { ExtHostChatAgents2 } from './extHostChatAgents2.js';
import { ExtHostChatOutputRenderer } from './extHostChatOutputRenderer.js';
import { ExtHostChatSessions } from './extHostChatSessions.js';
import { ExtHostChatStatus } from './extHostChatStatus.js';
import { ExtHostClipboard } from './extHostClipboard.js';
import { ExtHostEditorInsets } from './extHostCodeInsets.js';
import { ExtHostCodeMapper } from './extHostCodeMapper.js';
import { IExtHostCommands } from './extHostCommands.js';
import { createExtHostComments } from './extHostComments.js';
import { IExtHostConfiguration } from './extHostConfiguration.js';
import { ExtHostCustomEditors } from './extHostCustomEditors.js';
import { IExtHostDataChannels } from './extHostDataChannels.js';
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
import { ExtHostFileSystemEventService } from './extHostFileSystemEventService.js';
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
import { ExtHostBrowsers } from './extHostBrowsers.js';
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
import { IExtHostPower } from './extHostPower.js';
import { IExtHostWorkspace } from './extHostWorkspace.js';
import { ExtHostChatContext } from './extHostChatContext.js';
import { ExtHostChatDebug } from './extHostChatDebug.js';
import { IExtHostMeteredConnection } from './extHostMeteredConnection.js';
import { IExtHostGitExtensionService } from './extHostGitExtensionService.js';
/**
 * This method instantiates and returns the extension API surface
 */
export function createApiFactoryAndRegisterActors(accessor) {
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
    const extHostPower = accessor.get(IExtHostPower);
    const extHostUrls = accessor.get(IExtHostUrlsService);
    const extHostSecretState = accessor.get(IExtHostSecretState);
    const extHostEditorTabs = accessor.get(IExtHostEditorTabs);
    const extHostManagedSockets = accessor.get(IExtHostManagedSockets);
    const extHostProgress = accessor.get(IExtHostProgress);
    const extHostAuthentication = accessor.get(IExtHostAuthentication);
    const extHostLanguageModels = accessor.get(IExtHostLanguageModels);
    const extHostMcp = accessor.get(IExtHostMpcService);
    const extHostDataChannels = accessor.get(IExtHostDataChannels);
    const extHostMeteredConnection = accessor.get(IExtHostMeteredConnection);
    const extHostGitExtensionService = accessor.get(IExtHostGitExtensionService);
    // register addressable instances
    rpcProtocol.set(ExtHostContext.ExtHostFileSystemInfo, extHostFileSystemInfo);
    // eslint-disable-next-line local/code-no-any-casts
    rpcProtocol.set(ExtHostContext.ExtHostLogLevelServiceShape, extHostLoggerService);
    rpcProtocol.set(ExtHostContext.ExtHostWorkspace, extHostWorkspace);
    rpcProtocol.set(ExtHostContext.ExtHostConfiguration, extHostConfiguration);
    rpcProtocol.set(ExtHostContext.ExtHostExtensionService, extensionService);
    rpcProtocol.set(ExtHostContext.ExtHostStorage, extHostStorage);
    rpcProtocol.set(ExtHostContext.ExtHostTunnelService, extHostTunnelService);
    rpcProtocol.set(ExtHostContext.ExtHostWindow, extHostWindow);
    rpcProtocol.set(ExtHostContext.ExtHostPower, extHostPower);
    rpcProtocol.set(ExtHostContext.ExtHostUrls, extHostUrls);
    rpcProtocol.set(ExtHostContext.ExtHostSecretState, extHostSecretState);
    rpcProtocol.set(ExtHostContext.ExtHostTelemetry, extHostTelemetry);
    rpcProtocol.set(ExtHostContext.ExtHostEditorTabs, extHostEditorTabs);
    rpcProtocol.set(ExtHostContext.ExtHostManagedSockets, extHostManagedSockets);
    rpcProtocol.set(ExtHostContext.ExtHostProgress, extHostProgress);
    rpcProtocol.set(ExtHostContext.ExtHostAuthentication, extHostAuthentication);
    rpcProtocol.set(ExtHostContext.ExtHostChatProvider, extHostLanguageModels);
    rpcProtocol.set(ExtHostContext.ExtHostDataChannels, extHostDataChannels);
    rpcProtocol.set(ExtHostContext.ExtHostMeteredConnection, extHostMeteredConnection);
    rpcProtocol.set(ExtHostContext.ExtHostGitExtension, extHostGitExtensionService);
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
    const extHostChatOutputRenderer = rpcProtocol.set(ExtHostContext.ExtHostChatOutputRenderer, new ExtHostChatOutputRenderer(rpcProtocol, extHostWebviews));
    rpcProtocol.set(ExtHostContext.ExtHostInteractive, new ExtHostInteractive(rpcProtocol, extHostNotebook, extHostDocumentsAndEditors, extHostCommands, extHostLogService));
    const extHostLanguageModelTools = rpcProtocol.set(ExtHostContext.ExtHostLanguageModelTools, new ExtHostLanguageModelTools(rpcProtocol, extHostLanguageModels));
    const extHostChatSessions = rpcProtocol.set(ExtHostContext.ExtHostChatSessions, new ExtHostChatSessions(extHostCommands, extHostLanguageModels, rpcProtocol, extHostLogService));
    const extHostChatAgents2 = rpcProtocol.set(ExtHostContext.ExtHostChatAgents2, new ExtHostChatAgents2(rpcProtocol, extHostLogService, extHostCommands, extHostDocuments, extHostDocumentsAndEditors, extHostLanguageModels, extHostDiagnostics, extHostLanguageModelTools));
    const extHostChatContext = rpcProtocol.set(ExtHostContext.ExtHostChatContext, new ExtHostChatContext(rpcProtocol, extHostCommands));
    const extHostChatDebug = rpcProtocol.set(ExtHostContext.ExtHostChatDebug, new ExtHostChatDebug(rpcProtocol));
    const extHostAiRelatedInformation = rpcProtocol.set(ExtHostContext.ExtHostAiRelatedInformation, new ExtHostRelatedInformation(rpcProtocol));
    const extHostAiEmbeddingVector = rpcProtocol.set(ExtHostContext.ExtHostAiEmbeddingVector, new ExtHostAiEmbeddingVector(rpcProtocol));
    const extHostAiSettingsSearch = rpcProtocol.set(ExtHostContext.ExtHostAiSettingsSearch, new ExtHostAiSettingsSearch(rpcProtocol));
    const extHostStatusBar = rpcProtocol.set(ExtHostContext.ExtHostStatusBar, new ExtHostStatusBar(rpcProtocol, extHostCommands.converter));
    const extHostSpeech = rpcProtocol.set(ExtHostContext.ExtHostSpeech, new ExtHostSpeech(rpcProtocol));
    const extHostEmbeddings = rpcProtocol.set(ExtHostContext.ExtHostEmbeddings, new ExtHostEmbeddings(rpcProtocol));
    const extHostBrowsers = rpcProtocol.set(ExtHostContext.ExtHostBrowsers, new ExtHostBrowsers(rpcProtocol));
    rpcProtocol.set(ExtHostContext.ExtHostMcp, accessor.get(IExtHostMpcService));
    // Check that no named customers are missing
    const expected = Object.values(ExtHostContext);
    rpcProtocol.assertRegistered(expected);
    // Other instances
    const extHostBulkEdits = new ExtHostBulkEdits(rpcProtocol, extHostDocumentsAndEditors);
    const extHostClipboard = new ExtHostClipboard(rpcProtocol);
    const extHostMessageService = new ExtHostMessageService(rpcProtocol, extHostLogService);
    const extHostDialogs = new ExtHostDialogs(rpcProtocol);
    const extHostChatStatus = new ExtHostChatStatus(rpcProtocol);
    // Register API-ish commands
    ExtHostApiCommands.register(extHostCommands);
    return function (extension, extensionInfo, configProvider) {
        // Wraps an event with error handling and telemetry so that we know what extension fails
        // handling events. This will prevent us from reporting this as "our" error-telemetry and
        // allows for better blaming
        function _asExtensionEvent(actual) {
            return (listener, thisArgs, disposables) => {
                const handle = actual(e => {
                    try {
                        listener.call(thisArgs, e);
                    }
                    catch (err) {
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
            return function perform(selector) {
                if (Array.isArray(selector)) {
                    selector.forEach(perform);
                }
                else if (typeof selector === 'string') {
                    informOnce();
                }
                else {
                    const filter = selector; // TODO: microsoft/TypeScript#42768
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
        const authentication = {
            getSession(providerId, scopesOrChallenge, options) {
                if ((typeof options?.forceNewSession === 'object' && options.forceNewSession.learnMore) ||
                    (typeof options?.createIfNone === 'object' && options.createIfNone.learnMore)) {
                    checkProposedApiEnabled(extension, 'authLearnMore');
                }
                if (options?.authorizationServer) {
                    checkProposedApiEnabled(extension, 'authIssuers');
                }
                // eslint-disable-next-line local/code-no-any-casts
                return extHostAuthentication.getSession(extension, providerId, scopesOrChallenge, options);
            },
            getAccounts(providerId) {
                return extHostAuthentication.getAccounts(providerId);
            },
            // TODO: remove this after GHPR and Codespaces move off of it
            async hasSession(providerId, scopes) {
                checkProposedApiEnabled(extension, 'authSession');
                // eslint-disable-next-line local/code-no-any-casts
                return !!(await extHostAuthentication.getSession(extension, providerId, scopes, { silent: true }));
            },
            get onDidChangeSessions() {
                return _asExtensionEvent(extHostAuthentication.getExtensionScopedSessionsEvent(extension.identifier.value));
            },
            registerAuthenticationProvider(id, label, provider, options) {
                if (options?.supportedAuthorizationServers) {
                    checkProposedApiEnabled(extension, 'authIssuers');
                }
                return extHostAuthentication.registerAuthenticationProvider(id, label, provider, options);
            }
        };
        // namespace: commands
        const commands = {
            registerCommand(id, command, thisArgs) {
                return extHostCommands.registerCommand(true, id, command, thisArgs, undefined, extension);
            },
            registerTextEditorCommand(id, callback, thisArg) {
                return extHostCommands.registerCommand(true, id, (...args) => {
                    const activeTextEditor = extHostEditors.getActiveTextEditor();
                    if (!activeTextEditor) {
                        extHostLogService.warn('Cannot execute ' + id + ' because there is no active text editor.');
                        return undefined;
                    }
                    return activeTextEditor.edit((edit) => {
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
            registerDiffInformationCommand: (id, callback, thisArg) => {
                checkProposedApiEnabled(extension, 'diffCommand');
                return extHostCommands.registerCommand(true, id, async (...args) => {
                    const activeTextEditor = extHostDocumentsAndEditors.activeEditor(true);
                    if (!activeTextEditor) {
                        extHostLogService.warn('Cannot execute ' + id + ' because there is no active text editor.');
                        return undefined;
                    }
                    const diff = await extHostEditors.getDiffInformation(activeTextEditor.id);
                    callback.apply(thisArg, [diff, ...args]);
                }, undefined, undefined, extension);
            },
            executeCommand(id, ...args) {
                return extHostCommands.executeCommand(id, ...args);
            },
            getCommands(filterInternal = false) {
                return extHostCommands.getCommands(filterInternal);
            }
        };
        // namespace: env
        const env = {
            get machineId() { return initData.telemetryInfo.machineId; },
            get devDeviceId() {
                checkProposedApiEnabled(extension, 'devDeviceId');
                return initData.telemetryInfo.devDeviceId ?? initData.telemetryInfo.machineId;
            },
            get isAppPortable() { return initData.environment.isPortable ?? false; },
            get sessionId() { return initData.telemetryInfo.sessionId; },
            get language() { return initData.environment.appLanguage; },
            get appName() { return initData.environment.appName; },
            get appRoot() { return initData.environment.appRoot?.fsPath ?? ''; },
            get appHost() { return initData.environment.appHost; },
            get uriScheme() { return initData.environment.appUriScheme; },
            get clipboard() { return extHostClipboard.value; },
            get shell() {
                return extHostTerminalService.getDefaultShell(false);
            },
            get onDidChangeShell() {
                return _asExtensionEvent(extHostTerminalService.onDidChangeShell);
            },
            get isTelemetryEnabled() {
                return extHostTelemetry.getTelemetryConfiguration();
            },
            get onDidChangeTelemetryEnabled() {
                return _asExtensionEvent(extHostTelemetry.onDidChangeTelemetryEnabled);
            },
            get telemetryConfiguration() {
                checkProposedApiEnabled(extension, 'telemetry');
                return extHostTelemetry.getTelemetryDetails();
            },
            get onDidChangeTelemetryConfiguration() {
                checkProposedApiEnabled(extension, 'telemetry');
                return _asExtensionEvent(extHostTelemetry.onDidChangeTelemetryConfiguration);
            },
            get isMeteredConnection() {
                checkProposedApiEnabled(extension, 'envIsConnectionMetered');
                return extHostMeteredConnection.isConnectionMetered;
            },
            get onDidChangeMeteredConnection() {
                checkProposedApiEnabled(extension, 'envIsConnectionMetered');
                return _asExtensionEvent(extHostMeteredConnection.onDidChangeIsConnectionMetered);
            },
            get isNewAppInstall() {
                return isNewAppInstall(initData.telemetryInfo.firstSessionDate);
            },
            createTelemetryLogger(sender, options) {
                ExtHostTelemetryLogger.validateSender(sender);
                return extHostTelemetry.instantiateLogger(extension, sender, options);
            },
            async openExternal(uri, options) {
                return extHostWindow.openUri(uri, {
                    allowTunneling: initData.remote.isRemote ?? (initData.remote.authority ? await extHostTunnelService.hasTunnelProvider() : false),
                    allowContributedOpeners: options?.allowContributedOpeners,
                });
            },
            async asExternalUri(uri) {
                if (uri.scheme === initData.environment.appUriScheme) {
                    return extHostUrls.createAppUri(uri);
                }
                try {
                    return await extHostWindow.asExternalUri(uri, { allowTunneling: !!initData.remote.authority });
                }
                catch (err) {
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
            get appQuality() {
                checkProposedApiEnabled(extension, 'resolvers');
                return initData.quality;
            },
            get appCommit() {
                checkProposedApiEnabled(extension, 'resolvers');
                return initData.commit;
            },
            getDataChannel(channelId) {
                checkProposedApiEnabled(extension, 'dataChannels');
                return extHostDataChannels.createDataChannel(extension, channelId);
            },
            get power() {
                checkProposedApiEnabled(extension, 'environmentPower');
                return {
                    get onDidSuspend() {
                        return _asExtensionEvent(extHostPower.onDidSuspend);
                    },
                    get onDidResume() {
                        return _asExtensionEvent(extHostPower.onDidResume);
                    },
                    get onDidChangeOnBatteryPower() {
                        return _asExtensionEvent(extHostPower.onDidChangeOnBatteryPower);
                    },
                    get onDidChangeThermalState() {
                        return _asExtensionEvent(extHostPower.onDidChangeThermalState);
                    },
                    get onDidChangeSpeedLimit() {
                        return _asExtensionEvent(extHostPower.onDidChangeSpeedLimit);
                    },
                    get onWillShutdown() {
                        return _asExtensionEvent(extHostPower.onWillShutdown);
                    },
                    get onDidLockScreen() {
                        return _asExtensionEvent(extHostPower.onDidLockScreen);
                    },
                    get onDidUnlockScreen() {
                        return _asExtensionEvent(extHostPower.onDidUnlockScreen);
                    },
                    getSystemIdleState(idleThresholdSeconds) {
                        return extHostPower.getSystemIdleState(idleThresholdSeconds);
                    },
                    getSystemIdleTime() {
                        return extHostPower.getSystemIdleTime();
                    },
                    getCurrentThermalState() {
                        return extHostPower.getCurrentThermalState();
                    },
                    isOnBatteryPower() {
                        return extHostPower.isOnBatteryPower();
                    },
                    async startPowerSaveBlocker(type) {
                        const blocker = await extHostPower.startPowerSaveBlocker(type);
                        return {
                            id: blocker.id,
                            get isStarted() {
                                return blocker.isStarted;
                            },
                            dispose() {
                                blocker.dispose();
                            }
                        };
                    }
                };
            }
        };
        if (!initData.environment.extensionTestsLocationURI) {
            // allow to patch env-function when running tests
            Object.freeze(env);
        }
        // namespace: tests
        const tests = {
            createTestController(provider, label, refreshHandler) {
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
        const extensions = {
            getExtension(extensionId, includeFromDifferentExtensionHosts) {
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
            get all() {
                const result = [];
                for (const desc of extensionInfo.mine.getAllExtensionDescriptions()) {
                    result.push(new Extension(extensionService, extension.identifier, desc, extensionKind, false));
                }
                return result;
            },
            get allAcrossExtensionHosts() {
                checkProposedApiEnabled(extension, 'extensionsAny');
                const local = new ExtensionIdentifierSet(extensionInfo.mine.getAllExtensionDescriptions().map(desc => desc.identifier));
                const result = [];
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
        const languages = {
            createDiagnosticCollection(name) {
                return extHostDiagnostics.createDiagnosticCollection(extension.identifier, name);
            },
            get onDidChangeDiagnostics() {
                return _asExtensionEvent(extHostDiagnostics.onDidChangeDiagnostics);
            },
            getDiagnostics: (resource) => {
                // eslint-disable-next-line local/code-no-any-casts
                return extHostDiagnostics.getDiagnostics(resource);
            },
            getLanguages() {
                return extHostLanguages.getLanguages();
            },
            setTextDocumentLanguage(document, languageId) {
                return extHostLanguages.changeLanguage(document.uri, languageId);
            },
            match(selector, document) {
                const interalSelector = typeConverters.LanguageSelector.from(selector);
                let notebook;
                if (targetsNotebooks(interalSelector)) {
                    notebook = extHostNotebook.notebookDocuments.find(value => value.apiNotebook.getCells().find(c => c.document === document))?.apiNotebook;
                }
                return score(interalSelector, document.uri, document.languageId, true, notebook?.uri, notebook?.notebookType);
            },
            registerCodeActionsProvider(selector, provider, metadata) {
                return extHostLanguageFeatures.registerCodeActionProvider(extension, checkSelector(selector), provider, metadata);
            },
            registerDocumentPasteEditProvider(selector, provider, metadata) {
                return extHostLanguageFeatures.registerDocumentPasteEditProvider(extension, checkSelector(selector), provider, metadata);
            },
            registerCodeLensProvider(selector, provider) {
                return extHostLanguageFeatures.registerCodeLensProvider(extension, checkSelector(selector), provider);
            },
            registerDefinitionProvider(selector, provider) {
                return extHostLanguageFeatures.registerDefinitionProvider(extension, checkSelector(selector), provider);
            },
            registerDeclarationProvider(selector, provider) {
                return extHostLanguageFeatures.registerDeclarationProvider(extension, checkSelector(selector), provider);
            },
            registerImplementationProvider(selector, provider) {
                return extHostLanguageFeatures.registerImplementationProvider(extension, checkSelector(selector), provider);
            },
            registerTypeDefinitionProvider(selector, provider) {
                return extHostLanguageFeatures.registerTypeDefinitionProvider(extension, checkSelector(selector), provider);
            },
            registerHoverProvider(selector, provider) {
                return extHostLanguageFeatures.registerHoverProvider(extension, checkSelector(selector), provider, extension.identifier);
            },
            registerEvaluatableExpressionProvider(selector, provider) {
                return extHostLanguageFeatures.registerEvaluatableExpressionProvider(extension, checkSelector(selector), provider, extension.identifier);
            },
            registerInlineValuesProvider(selector, provider) {
                return extHostLanguageFeatures.registerInlineValuesProvider(extension, checkSelector(selector), provider, extension.identifier);
            },
            registerDocumentHighlightProvider(selector, provider) {
                return extHostLanguageFeatures.registerDocumentHighlightProvider(extension, checkSelector(selector), provider);
            },
            registerMultiDocumentHighlightProvider(selector, provider) {
                return extHostLanguageFeatures.registerMultiDocumentHighlightProvider(extension, checkSelector(selector), provider);
            },
            registerLinkedEditingRangeProvider(selector, provider) {
                return extHostLanguageFeatures.registerLinkedEditingRangeProvider(extension, checkSelector(selector), provider);
            },
            registerReferenceProvider(selector, provider) {
                return extHostLanguageFeatures.registerReferenceProvider(extension, checkSelector(selector), provider);
            },
            registerRenameProvider(selector, provider) {
                return extHostLanguageFeatures.registerRenameProvider(extension, checkSelector(selector), provider);
            },
            registerNewSymbolNamesProvider(selector, provider) {
                checkProposedApiEnabled(extension, 'newSymbolNamesProvider');
                return extHostLanguageFeatures.registerNewSymbolNamesProvider(extension, checkSelector(selector), provider);
            },
            registerDocumentSymbolProvider(selector, provider, metadata) {
                return extHostLanguageFeatures.registerDocumentSymbolProvider(extension, checkSelector(selector), provider, metadata);
            },
            registerWorkspaceSymbolProvider(provider) {
                return extHostLanguageFeatures.registerWorkspaceSymbolProvider(extension, provider);
            },
            registerDocumentFormattingEditProvider(selector, provider) {
                return extHostLanguageFeatures.registerDocumentFormattingEditProvider(extension, checkSelector(selector), provider);
            },
            registerDocumentRangeFormattingEditProvider(selector, provider) {
                return extHostLanguageFeatures.registerDocumentRangeFormattingEditProvider(extension, checkSelector(selector), provider);
            },
            registerOnTypeFormattingEditProvider(selector, provider, firstTriggerCharacter, ...moreTriggerCharacters) {
                return extHostLanguageFeatures.registerOnTypeFormattingEditProvider(extension, checkSelector(selector), provider, [firstTriggerCharacter].concat(moreTriggerCharacters));
            },
            registerDocumentSemanticTokensProvider(selector, provider, legend) {
                return extHostLanguageFeatures.registerDocumentSemanticTokensProvider(extension, checkSelector(selector), provider, legend);
            },
            registerDocumentRangeSemanticTokensProvider(selector, provider, legend) {
                return extHostLanguageFeatures.registerDocumentRangeSemanticTokensProvider(extension, checkSelector(selector), provider, legend);
            },
            registerSignatureHelpProvider(selector, provider, firstItem, ...remaining) {
                if (typeof firstItem === 'object') {
                    return extHostLanguageFeatures.registerSignatureHelpProvider(extension, checkSelector(selector), provider, firstItem);
                }
                return extHostLanguageFeatures.registerSignatureHelpProvider(extension, checkSelector(selector), provider, typeof firstItem === 'undefined' ? [] : [firstItem, ...remaining]);
            },
            registerCompletionItemProvider(selector, provider, ...triggerCharacters) {
                return extHostLanguageFeatures.registerCompletionItemProvider(extension, checkSelector(selector), provider, triggerCharacters);
            },
            registerInlineCompletionItemProvider(selector, provider, metadata) {
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
            get inlineCompletionsUnificationState() {
                checkProposedApiEnabled(extension, 'inlineCompletionsAdditions');
                return extHostLanguageFeatures.inlineCompletionsUnificationState;
            },
            onDidChangeCompletionsUnificationState(listener, thisArg, disposables) {
                checkProposedApiEnabled(extension, 'inlineCompletionsAdditions');
                return _asExtensionEvent(extHostLanguageFeatures.onDidChangeInlineCompletionsUnificationState)(listener, thisArg, disposables);
            },
            registerDocumentLinkProvider(selector, provider) {
                return extHostLanguageFeatures.registerDocumentLinkProvider(extension, checkSelector(selector), provider);
            },
            registerColorProvider(selector, provider) {
                return extHostLanguageFeatures.registerColorProvider(extension, checkSelector(selector), provider);
            },
            registerFoldingRangeProvider(selector, provider) {
                return extHostLanguageFeatures.registerFoldingRangeProvider(extension, checkSelector(selector), provider);
            },
            registerSelectionRangeProvider(selector, provider) {
                return extHostLanguageFeatures.registerSelectionRangeProvider(extension, selector, provider);
            },
            registerCallHierarchyProvider(selector, provider) {
                return extHostLanguageFeatures.registerCallHierarchyProvider(extension, selector, provider);
            },
            registerTypeHierarchyProvider(selector, provider) {
                return extHostLanguageFeatures.registerTypeHierarchyProvider(extension, selector, provider);
            },
            setLanguageConfiguration: (language, configuration) => {
                return extHostLanguageFeatures.setLanguageConfiguration(extension, language, configuration);
            },
            getTokenInformationAtPosition(doc, pos) {
                checkProposedApiEnabled(extension, 'tokenInformation');
                return extHostLanguages.tokenAtPosition(doc, pos);
            },
            registerInlayHintsProvider(selector, provider) {
                return extHostLanguageFeatures.registerInlayHintsProvider(extension, selector, provider);
            },
            createLanguageStatusItem(id, selector) {
                return extHostLanguages.createLanguageStatusItem(extension, id, selector);
            },
            registerDocumentDropEditProvider(selector, provider, metadata) {
                return extHostLanguageFeatures.registerDocumentOnDropEditProvider(extension, selector, provider, metadata);
            }
        };
        // namespace: window
        const window = {
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
            async showTextDocument(documentOrUri, columnOrOptions, preserveFocus) {
                if (URI.isUri(documentOrUri) && documentOrUri.scheme === Schemas.vscodeRemote && !documentOrUri.authority) {
                    extHostApiDeprecation.report('workspace.showTextDocument', extension, `A URI of 'vscode-remote' scheme requires an authority.`);
                }
                const document = await (URI.isUri(documentOrUri)
                    ? Promise.resolve(workspace.openTextDocument(documentOrUri))
                    : Promise.resolve(documentOrUri));
                return extHostEditors.showTextDocument(document, columnOrOptions, preserveFocus);
            },
            createTextEditorDecorationType(options) {
                return extHostEditors.createTextEditorDecorationType(extension, options);
            },
            onDidChangeActiveTextEditor(listener, thisArg, disposables) {
                return _asExtensionEvent(extHostEditors.onDidChangeActiveTextEditor)(listener, thisArg, disposables);
            },
            onDidChangeVisibleTextEditors(listener, thisArg, disposables) {
                return _asExtensionEvent(extHostEditors.onDidChangeVisibleTextEditors)(listener, thisArg, disposables);
            },
            onDidChangeTextEditorSelection(listener, thisArgs, disposables) {
                return _asExtensionEvent(extHostEditors.onDidChangeTextEditorSelection)(listener, thisArgs, disposables);
            },
            onDidChangeTextEditorOptions(listener, thisArgs, disposables) {
                return _asExtensionEvent(extHostEditors.onDidChangeTextEditorOptions)(listener, thisArgs, disposables);
            },
            onDidChangeTextEditorVisibleRanges(listener, thisArgs, disposables) {
                return _asExtensionEvent(extHostEditors.onDidChangeTextEditorVisibleRanges)(listener, thisArgs, disposables);
            },
            onDidChangeTextEditorViewColumn(listener, thisArg, disposables) {
                return _asExtensionEvent(extHostEditors.onDidChangeTextEditorViewColumn)(listener, thisArg, disposables);
            },
            onDidChangeTextEditorDiffInformation(listener, thisArg, disposables) {
                checkProposedApiEnabled(extension, 'textEditorDiffInformation');
                return _asExtensionEvent(extHostEditors.onDidChangeTextEditorDiffInformation)(listener, thisArg, disposables);
            },
            onDidCloseTerminal(listener, thisArg, disposables) {
                return _asExtensionEvent(extHostTerminalService.onDidCloseTerminal)(listener, thisArg, disposables);
            },
            onDidOpenTerminal(listener, thisArg, disposables) {
                return _asExtensionEvent(extHostTerminalService.onDidOpenTerminal)(listener, thisArg, disposables);
            },
            onDidChangeActiveTerminal(listener, thisArg, disposables) {
                return _asExtensionEvent(extHostTerminalService.onDidChangeActiveTerminal)(listener, thisArg, disposables);
            },
            onDidChangeTerminalDimensions(listener, thisArg, disposables) {
                checkProposedApiEnabled(extension, 'terminalDimensions');
                return _asExtensionEvent(extHostTerminalService.onDidChangeTerminalDimensions)(listener, thisArg, disposables);
            },
            onDidChangeTerminalState(listener, thisArg, disposables) {
                return _asExtensionEvent(extHostTerminalService.onDidChangeTerminalState)(listener, thisArg, disposables);
            },
            onDidWriteTerminalData(listener, thisArg, disposables) {
                checkProposedApiEnabled(extension, 'terminalDataWriteEvent');
                return _asExtensionEvent(extHostTerminalService.onDidWriteTerminalData)(listener, thisArg, disposables);
            },
            onDidExecuteTerminalCommand(listener, thisArg, disposables) {
                checkProposedApiEnabled(extension, 'terminalExecuteCommandEvent');
                return _asExtensionEvent(extHostTerminalService.onDidExecuteTerminalCommand)(listener, thisArg, disposables);
            },
            onDidChangeTerminalShellIntegration(listener, thisArg, disposables) {
                return _asExtensionEvent(extHostTerminalShellIntegration.onDidChangeTerminalShellIntegration)(listener, thisArg, disposables);
            },
            onDidStartTerminalShellExecution(listener, thisArg, disposables) {
                return _asExtensionEvent(extHostTerminalShellIntegration.onDidStartTerminalShellExecution)(listener, thisArg, disposables);
            },
            onDidEndTerminalShellExecution(listener, thisArg, disposables) {
                return _asExtensionEvent(extHostTerminalShellIntegration.onDidEndTerminalShellExecution)(listener, thisArg, disposables);
            },
            get state() {
                return extHostWindow.getState();
            },
            onDidChangeWindowState(listener, thisArg, disposables) {
                return _asExtensionEvent(extHostWindow.onDidChangeWindowState)(listener, thisArg, disposables);
            },
            showInformationMessage(message, ...rest) {
                return extHostMessageService.showMessage(extension, Severity.Info, message, rest[0], rest.slice(1));
            },
            showWarningMessage(message, ...rest) {
                return extHostMessageService.showMessage(extension, Severity.Warning, message, rest[0], rest.slice(1));
            },
            showErrorMessage(message, ...rest) {
                return extHostMessageService.showMessage(extension, Severity.Error, message, rest[0], rest.slice(1));
            },
            showQuickPick(items, options, token) {
                return extHostQuickOpen.showQuickPick(extension, items, options, token);
            },
            showWorkspaceFolderPick(options) {
                return extHostQuickOpen.showWorkspaceFolderPick(options);
            },
            showInputBox(options, token) {
                return extHostQuickOpen.showInput(options, token);
            },
            showOpenDialog(options) {
                return extHostDialogs.showOpenDialog(options);
            },
            showSaveDialog(options) {
                return extHostDialogs.showSaveDialog(options);
            },
            createStatusBarItem(alignmentOrId, priorityOrAlignment, priorityArg) {
                let id;
                let alignment;
                let priority;
                if (typeof alignmentOrId === 'string') {
                    id = alignmentOrId;
                    alignment = priorityOrAlignment;
                    priority = priorityArg;
                }
                else {
                    alignment = alignmentOrId;
                    priority = priorityOrAlignment;
                }
                return extHostStatusBar.createStatusBarEntry(extension, id, alignment, priority);
            },
            setStatusBarMessage(text, timeoutOrThenable) {
                return extHostStatusBar.setStatusBarMessage(text, timeoutOrThenable);
            },
            withScmProgress(task) {
                extHostApiDeprecation.report('window.withScmProgress', extension, `Use 'withProgress' instead.`);
                return extHostProgress.withProgress(extension, { location: extHostTypes.ProgressLocation.SourceControl }, (progress, token) => task({ report(n) { } }));
            },
            withProgress(options, task) {
                return extHostProgress.withProgress(extension, options, task);
            },
            createOutputChannel(name, options) {
                return extHostOutputService.createOutputChannel(name, options, extension);
            },
            createWebviewPanel(viewType, title, showOptions, options) {
                return extHostWebviewPanels.createWebviewPanel(extension, viewType, title, showOptions, options);
            },
            createWebviewTextEditorInset(editor, line, height, options) {
                checkProposedApiEnabled(extension, 'editorInsets');
                return extHostEditorInsets.createWebviewEditorInset(editor, line, height, options, extension);
            },
            createTerminal(nameOrOptions, shellPath, shellArgs) {
                if (typeof nameOrOptions === 'object') {
                    let options = nameOrOptions;
                    if (!isProposedApiEnabled(extension, 'terminalTitle') && 'titleTemplate' in nameOrOptions && nameOrOptions.titleTemplate !== undefined) {
                        console.error(`[${extension.identifier.value}] \`titleTemplate\` was provided to window.createTerminal but is ignored because the \`terminalTitle\` proposed API is not enabled.`);
                        options = { ...nameOrOptions, titleTemplate: undefined };
                    }
                    if ('pty' in options) {
                        return extHostTerminalService.createExtensionTerminal(options);
                    }
                    return extHostTerminalService.createTerminalFromOptions(options);
                }
                return extHostTerminalService.createTerminal(nameOrOptions, shellPath, shellArgs);
            },
            registerTerminalLinkProvider(provider) {
                return extHostTerminalService.registerLinkProvider(provider);
            },
            registerTerminalProfileProvider(id, provider) {
                return extHostTerminalService.registerProfileProvider(extension, id, provider);
            },
            registerTerminalCompletionProvider(provider, ...triggerCharacters) {
                checkProposedApiEnabled(extension, 'terminalCompletionProvider');
                return extHostTerminalService.registerTerminalCompletionProvider(extension, provider, ...triggerCharacters);
            },
            registerTerminalQuickFixProvider(id, provider) {
                checkProposedApiEnabled(extension, 'terminalQuickFixProvider');
                return extHostTerminalService.registerTerminalQuickFixProvider(id, extension.identifier.value, provider);
            },
            registerTreeDataProvider(viewId, treeDataProvider) {
                return extHostTreeViews.registerTreeDataProvider(viewId, treeDataProvider, extension);
            },
            createTreeView(viewId, options) {
                return extHostTreeViews.createTreeView(viewId, options, extension);
            },
            registerWebviewPanelSerializer: (viewType, serializer) => {
                return extHostWebviewPanels.registerWebviewPanelSerializer(extension, viewType, serializer);
            },
            registerCustomEditorProvider: (viewType, provider, options = {}) => {
                return extHostCustomEditors.registerCustomEditorProvider(extension, viewType, provider, options);
            },
            registerFileDecorationProvider(provider) {
                return extHostDecorations.registerFileDecorationProvider(provider, extension);
            },
            registerUriHandler(handler) {
                return extHostUrls.registerUriHandler(extension, handler);
            },
            createQuickPick() {
                return extHostQuickOpen.createQuickPick(extension);
            },
            createInputBox() {
                return extHostQuickOpen.createInputBox(extension);
            },
            get activeColorTheme() {
                return extHostTheming.activeColorTheme;
            },
            onDidChangeActiveColorTheme(listener, thisArg, disposables) {
                return _asExtensionEvent(extHostTheming.onDidChangeActiveColorTheme)(listener, thisArg, disposables);
            },
            registerWebviewViewProvider(viewId, provider, options) {
                return extHostWebviewViews.registerWebviewViewProvider(extension, viewId, provider, options?.webviewOptions);
            },
            get activeNotebookEditor() {
                return extHostNotebook.activeNotebookEditor;
            },
            onDidChangeActiveNotebookEditor(listener, thisArgs, disposables) {
                return _asExtensionEvent(extHostNotebook.onDidChangeActiveNotebookEditor)(listener, thisArgs, disposables);
            },
            get visibleNotebookEditors() {
                return extHostNotebook.visibleNotebookEditors;
            },
            get onDidChangeVisibleNotebookEditors() {
                return _asExtensionEvent(extHostNotebook.onDidChangeVisibleNotebookEditors);
            },
            onDidChangeNotebookEditorSelection(listener, thisArgs, disposables) {
                return _asExtensionEvent(extHostNotebookEditors.onDidChangeNotebookEditorSelection)(listener, thisArgs, disposables);
            },
            onDidChangeNotebookEditorVisibleRanges(listener, thisArgs, disposables) {
                return _asExtensionEvent(extHostNotebookEditors.onDidChangeNotebookEditorVisibleRanges)(listener, thisArgs, disposables);
            },
            showNotebookDocument(document, options) {
                return extHostNotebook.showNotebookDocument(document, options);
            },
            registerExternalUriOpener(id, opener, metadata) {
                checkProposedApiEnabled(extension, 'externalUriOpener');
                return extHostUriOpeners.registerExternalUriOpener(extension.identifier, id, opener, metadata);
            },
            registerProfileContentHandler(id, handler) {
                checkProposedApiEnabled(extension, 'profileContentHandlers');
                return extHostProfileContentHandlers.registerProfileContentHandler(extension, id, handler);
            },
            registerQuickDiffProvider(selector, quickDiffProvider, id, label, rootUri) {
                checkProposedApiEnabled(extension, 'quickDiffProvider');
                return extHostQuickDiff.registerQuickDiffProvider(extension, checkSelector(selector), quickDiffProvider, id, label, rootUri);
            },
            get tabGroups() {
                return extHostEditorTabs.tabGroups;
            },
            registerShareProvider(selector, provider) {
                checkProposedApiEnabled(extension, 'shareProvider');
                return extHostShare.registerShareProvider(checkSelector(selector), provider);
            },
            get nativeHandle() {
                checkProposedApiEnabled(extension, 'nativeWindowHandle');
                return extHostWindow.nativeHandle;
            },
            createChatStatusItem: (id) => {
                checkProposedApiEnabled(extension, 'chatStatusItem');
                return extHostChatStatus.createChatStatusItem(extension, id);
            },
            get activeChatPanelSessionResource() {
                checkProposedApiEnabled(extension, 'chatParticipantPrivate');
                return extHostChatAgents2.activeChatPanelSessionResource;
            },
            onDidChangeActiveChatPanelSessionResource: (listeners, thisArgs, disposables) => {
                checkProposedApiEnabled(extension, 'chatParticipantPrivate');
                return _asExtensionEvent(extHostChatAgents2.onDidChangeActiveChatPanelSessionResource)(listeners, thisArgs, disposables);
            },
            get browserTabs() {
                checkProposedApiEnabled(extension, 'browser');
                return extHostBrowsers.browserTabs;
            },
            onDidOpenBrowserTab(listener, thisArg, disposables) {
                checkProposedApiEnabled(extension, 'browser');
                return _asExtensionEvent(extHostBrowsers.onDidOpenBrowserTab)(listener, thisArg, disposables);
            },
            onDidCloseBrowserTab(listener, thisArg, disposables) {
                checkProposedApiEnabled(extension, 'browser');
                return _asExtensionEvent(extHostBrowsers.onDidCloseBrowserTab)(listener, thisArg, disposables);
            },
            get activeBrowserTab() {
                checkProposedApiEnabled(extension, 'browser');
                return extHostBrowsers.activeBrowserTab;
            },
            onDidChangeActiveBrowserTab(listener, thisArg, disposables) {
                checkProposedApiEnabled(extension, 'browser');
                return _asExtensionEvent(extHostBrowsers.onDidChangeActiveBrowserTab)(listener, thisArg, disposables);
            },
            onDidChangeBrowserTabState(listener, thisArg, disposables) {
                checkProposedApiEnabled(extension, 'browser');
                return _asExtensionEvent(extHostBrowsers.onDidChangeBrowserTabState)(listener, thisArg, disposables);
            },
            openBrowserTab(url, options) {
                checkProposedApiEnabled(extension, 'browser');
                return extHostBrowsers.openBrowserTab(url, options);
            },
        };
        // namespace: workspace
        const workspace = {
            get rootPath() {
                extHostApiDeprecation.report('workspace.rootPath', extension, `Please use 'workspace.workspaceFolders' instead. More details: https://aka.ms/vscode-eliminating-rootpath`);
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
            get isAgentSessionsWorkspace() {
                checkProposedApiEnabled(extension, 'agentSessionsWorkspace');
                return !!initData.environment.isSessionsWindow;
            },
            updateWorkspaceFolders: (index, deleteCount, ...workspaceFoldersToAdd) => {
                return extHostWorkspace.updateWorkspaceFolders(extension, index, deleteCount || 0, ...workspaceFoldersToAdd);
            },
            onDidChangeWorkspaceFolders: function (listener, thisArgs, disposables) {
                return _asExtensionEvent(extHostWorkspace.onDidChangeWorkspace)(listener, thisArgs, disposables);
            },
            asRelativePath: (pathOrUri, includeWorkspace) => {
                return extHostWorkspace.getRelativePath(pathOrUri, includeWorkspace);
            },
            findFiles: (include, exclude, maxResults, token) => {
                // Note, undefined/null have different meanings on "exclude"
                return extHostWorkspace.findFiles(include, exclude, maxResults, extension.identifier, token);
            },
            findFiles2: (filePattern, options, token) => {
                checkProposedApiEnabled(extension, 'findFiles2');
                return extHostWorkspace.findFiles2(filePattern, options, extension.identifier, token);
            },
            findTextInFiles: (query, optionsOrCallback, callbackOrToken, token) => {
                checkProposedApiEnabled(extension, 'findTextInFiles');
                let options;
                let callback;
                if (typeof optionsOrCallback === 'object') {
                    options = optionsOrCallback;
                    callback = callbackOrToken;
                }
                else {
                    options = {};
                    callback = optionsOrCallback;
                    token = callbackOrToken;
                }
                return extHostWorkspace.findTextInFiles(query, options || {}, callback, extension.identifier, token);
            },
            findTextInFiles2: (query, options, token) => {
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
            saveAll: (includeUntitled) => {
                return extHostWorkspace.saveAll(includeUntitled);
            },
            applyEdit(edit, metadata) {
                return extHostBulkEdits.applyWorkspaceEdit(edit, extension, metadata);
            },
            createFileSystemWatcher: (pattern, optionsOrIgnoreCreate, ignoreChange, ignoreDelete) => {
                const options = {
                    ignoreCreateEvents: Boolean(optionsOrIgnoreCreate),
                    ignoreChangeEvents: Boolean(ignoreChange),
                    ignoreDeleteEvents: Boolean(ignoreDelete),
                };
                return extHostFileSystemEvent.createFileSystemWatcher(extHostWorkspace, configProvider, extHostFileSystemInfo, extension, pattern, options);
            },
            get textDocuments() {
                return extHostDocuments.getAllDocumentData().map(data => data.document);
            },
            set textDocuments(value) {
                throw new errors.ReadonlyError('textDocuments');
            },
            openTextDocument(uriOrFileNameOrOptions, options) {
                let uriPromise;
                options = (options ?? uriOrFileNameOrOptions);
                if (typeof uriOrFileNameOrOptions === 'string') {
                    uriPromise = Promise.resolve(URI.file(uriOrFileNameOrOptions));
                }
                else if (URI.isUri(uriOrFileNameOrOptions)) {
                    uriPromise = Promise.resolve(uriOrFileNameOrOptions);
                }
                else if (!options || typeof options === 'object') {
                    uriPromise = extHostDocuments.createDocumentData(options);
                }
                else {
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
            onDidOpenTextDocument: (listener, thisArgs, disposables) => {
                return _asExtensionEvent(extHostDocuments.onDidAddDocument)(listener, thisArgs, disposables);
            },
            onDidCloseTextDocument: (listener, thisArgs, disposables) => {
                return _asExtensionEvent(extHostDocuments.onDidRemoveDocument)(listener, thisArgs, disposables);
            },
            onDidChangeTextDocument: (listener, thisArgs, disposables) => {
                if (isProposedApiEnabled(extension, 'textDocumentChangeReason')) {
                    return _asExtensionEvent(extHostDocuments.onDidChangeDocumentWithReason)(listener, thisArgs, disposables);
                }
                return _asExtensionEvent(extHostDocuments.onDidChangeDocument)(listener, thisArgs, disposables);
            },
            onDidSaveTextDocument: (listener, thisArgs, disposables) => {
                return _asExtensionEvent(extHostDocuments.onDidSaveDocument)(listener, thisArgs, disposables);
            },
            onWillSaveTextDocument: (listener, thisArgs, disposables) => {
                return _asExtensionEvent(extHostDocumentSaveParticipant.getOnWillSaveTextDocumentEvent(extension))(listener, thisArgs, disposables);
            },
            get notebookDocuments() {
                return extHostNotebook.notebookDocuments.map(d => d.apiNotebook);
            },
            async openNotebookDocument(uriOrType, content) {
                let uri;
                if (URI.isUri(uriOrType)) {
                    uri = uriOrType;
                    await extHostNotebook.openNotebookDocument(uriOrType);
                }
                else if (typeof uriOrType === 'string') {
                    uri = URI.revive(await extHostNotebook.createNotebookDocument({ viewType: uriOrType, content }));
                }
                else {
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
            registerNotebookSerializer(viewType, serializer, options, registration) {
                return extHostNotebook.registerNotebookSerializer(extension, viewType, serializer, options, isProposedApiEnabled(extension, 'notebookLiveShare') ? registration : undefined);
            },
            onDidChangeConfiguration: (listener, thisArgs, disposables) => {
                return _asExtensionEvent(configProvider.onDidChangeConfiguration)(listener, thisArgs, disposables);
            },
            getConfiguration(section, scope) {
                scope = arguments.length === 1 ? undefined : scope;
                return configProvider.getConfiguration(section, scope, extension);
            },
            registerTextDocumentContentProvider(scheme, provider) {
                return extHostDocumentContentProviders.registerTextDocumentContentProvider(scheme, provider);
            },
            registerTaskProvider: (type, provider) => {
                extHostApiDeprecation.report('window.registerTaskProvider', extension, `Use the corresponding function on the 'tasks' namespace instead`);
                return extHostTask.registerTaskProvider(extension, type, provider);
            },
            registerFileSystemProvider(scheme, provider, options) {
                return combinedDisposable(extHostFileSystem.registerFileSystemProvider(extension, scheme, provider, options), extHostConsumerFileSystem.addFileSystemProvider(scheme, provider, options));
            },
            get fs() {
                return extHostConsumerFileSystem.value;
            },
            registerFileSearchProvider: (scheme, provider) => {
                checkProposedApiEnabled(extension, 'fileSearchProvider');
                return extHostSearch.registerFileSearchProviderOld(scheme, provider);
            },
            registerTextSearchProvider: (scheme, provider) => {
                checkProposedApiEnabled(extension, 'textSearchProvider');
                return extHostSearch.registerTextSearchProviderOld(scheme, provider);
            },
            registerAITextSearchProvider: (scheme, provider) => {
                // there are some dependencies on textSearchProvider, so we need to check for both
                checkProposedApiEnabled(extension, 'aiTextSearchProvider');
                checkProposedApiEnabled(extension, 'textSearchProvider2');
                return extHostSearch.registerAITextSearchProvider(scheme, provider);
            },
            registerFileSearchProvider2: (scheme, provider) => {
                checkProposedApiEnabled(extension, 'fileSearchProvider2');
                return extHostSearch.registerFileSearchProvider(scheme, provider);
            },
            registerTextSearchProvider2: (scheme, provider) => {
                checkProposedApiEnabled(extension, 'textSearchProvider2');
                return extHostSearch.registerTextSearchProvider(scheme, provider);
            },
            registerRemoteAuthorityResolver: (authorityPrefix, resolver) => {
                checkProposedApiEnabled(extension, 'resolvers');
                return extensionService.registerRemoteAuthorityResolver(authorityPrefix, resolver);
            },
            registerResourceLabelFormatter: (formatter) => {
                checkProposedApiEnabled(extension, 'resolvers');
                return extHostLabelService.$registerResourceLabelFormatter(formatter);
            },
            getRemoteExecServer: (authority) => {
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
            onWillCreateFiles: (listener, thisArg, disposables) => {
                return _asExtensionEvent(extHostFileSystemEvent.getOnWillCreateFileEvent(extension))(listener, thisArg, disposables);
            },
            onWillDeleteFiles: (listener, thisArg, disposables) => {
                return _asExtensionEvent(extHostFileSystemEvent.getOnWillDeleteFileEvent(extension))(listener, thisArg, disposables);
            },
            onWillRenameFiles: (listener, thisArg, disposables) => {
                return _asExtensionEvent(extHostFileSystemEvent.getOnWillRenameFileEvent(extension))(listener, thisArg, disposables);
            },
            openTunnel: (forward) => {
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
            onDidChangeTunnels: (listener, thisArg, disposables) => {
                checkProposedApiEnabled(extension, 'tunnels');
                return _asExtensionEvent(extHostTunnelService.onDidChangeTunnels)(listener, thisArg, disposables);
            },
            registerPortAttributesProvider: (portSelector, provider) => {
                checkProposedApiEnabled(extension, 'portsAttributes');
                return extHostTunnelService.registerPortsAttributesProvider(portSelector, provider);
            },
            registerTunnelProvider: (tunnelProvider, information) => {
                checkProposedApiEnabled(extension, 'tunnelFactory');
                return extHostTunnelService.registerTunnelProvider(tunnelProvider, information);
            },
            registerTimelineProvider: (scheme, provider) => {
                checkProposedApiEnabled(extension, 'timeline');
                return extHostTimeline.registerTimelineProvider(scheme, provider, extension.identifier, extHostCommands.converter);
            },
            get isTrusted() {
                return extHostWorkspace.trusted;
            },
            requestResourceTrust: (options) => {
                checkProposedApiEnabled(extension, 'workspaceTrust');
                return extHostWorkspace.requestResourceTrust(options);
            },
            requestWorkspaceTrust: (options) => {
                checkProposedApiEnabled(extension, 'workspaceTrust');
                return extHostWorkspace.requestWorkspaceTrust(options);
            },
            isResourceTrusted: (resource) => {
                checkProposedApiEnabled(extension, 'workspaceTrust');
                return extHostWorkspace.isResourceTrusted(resource);
            },
            onDidChangeWorkspaceTrustedFolders: (listener, thisArgs, disposables) => {
                checkProposedApiEnabled(extension, 'workspaceTrust');
                return _asExtensionEvent(extHostWorkspace.onDidChangeWorkspaceTrustedFolders)(listener, thisArgs, disposables);
            },
            onDidGrantWorkspaceTrust: (listener, thisArgs, disposables) => {
                return _asExtensionEvent(extHostWorkspace.onDidGrantWorkspaceTrust)(listener, thisArgs, disposables);
            },
            registerEditSessionIdentityProvider: (scheme, provider) => {
                checkProposedApiEnabled(extension, 'editSessionIdentityProvider');
                return extHostWorkspace.registerEditSessionIdentityProvider(scheme, provider);
            },
            onWillCreateEditSessionIdentity: (listener, thisArgs, disposables) => {
                checkProposedApiEnabled(extension, 'editSessionIdentityProvider');
                return _asExtensionEvent(extHostWorkspace.getOnWillCreateEditSessionIdentityEvent(extension))(listener, thisArgs, disposables);
            },
            registerCanonicalUriProvider: (scheme, provider) => {
                checkProposedApiEnabled(extension, 'canonicalUriProvider');
                return extHostWorkspace.registerCanonicalUriProvider(scheme, provider);
            },
            getCanonicalUri: (uri, options, token) => {
                checkProposedApiEnabled(extension, 'canonicalUriProvider');
                return extHostWorkspace.provideCanonicalUri(uri, options, token);
            },
            decode(content, options) {
                return extHostWorkspace.decode(content, options);
            },
            encode(content, options) {
                return extHostWorkspace.encode(content, options);
            },
        };
        // namespace: scm
        const scm = {
            get inputBox() {
                extHostApiDeprecation.report('scm.inputBox', extension, `Use 'SourceControl.inputBox' instead`);
                return extHostSCM.getLastInputBox(extension); // Strict null override - Deprecated api
            },
            createSourceControl(id, label, rootUri, iconPath, isHidden, parent) {
                if (iconPath || isHidden || parent) {
                    checkProposedApiEnabled(extension, 'scmProviderOptions');
                }
                return extHostSCM.createSourceControl(extension, id, label, rootUri, iconPath, isHidden, parent);
            }
        };
        // namespace: comments
        const comments = {
            createCommentController(id, label) {
                return extHostComment.createCommentController(extension, id, label);
            }
        };
        // namespace: debug
        const debug = {
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
            onDidStartDebugSession(listener, thisArg, disposables) {
                return _asExtensionEvent(extHostDebugService.onDidStartDebugSession)(listener, thisArg, disposables);
            },
            onDidTerminateDebugSession(listener, thisArg, disposables) {
                return _asExtensionEvent(extHostDebugService.onDidTerminateDebugSession)(listener, thisArg, disposables);
            },
            onDidChangeActiveDebugSession(listener, thisArg, disposables) {
                return _asExtensionEvent(extHostDebugService.onDidChangeActiveDebugSession)(listener, thisArg, disposables);
            },
            onDidReceiveDebugSessionCustomEvent(listener, thisArg, disposables) {
                return _asExtensionEvent(extHostDebugService.onDidReceiveDebugSessionCustomEvent)(listener, thisArg, disposables);
            },
            onDidChangeBreakpoints(listener, thisArgs, disposables) {
                return _asExtensionEvent(extHostDebugService.onDidChangeBreakpoints)(listener, thisArgs, disposables);
            },
            onDidChangeActiveStackItem(listener, thisArg, disposables) {
                return _asExtensionEvent(extHostDebugService.onDidChangeActiveStackItem)(listener, thisArg, disposables);
            },
            registerDebugConfigurationProvider(debugType, provider, triggerKind) {
                return extHostDebugService.registerDebugConfigurationProvider(debugType, provider, triggerKind || DebugConfigurationProviderTriggerKind.Initial);
            },
            registerDebugAdapterDescriptorFactory(debugType, factory) {
                return extHostDebugService.registerDebugAdapterDescriptorFactory(extension, debugType, factory);
            },
            registerDebugAdapterTrackerFactory(debugType, factory) {
                return extHostDebugService.registerDebugAdapterTrackerFactory(debugType, factory);
            },
            startDebugging(folder, nameOrConfig, parentSessionOrOptions) {
                if (!parentSessionOrOptions || (typeof parentSessionOrOptions === 'object' && 'configuration' in parentSessionOrOptions)) {
                    return extHostDebugService.startDebugging(folder, nameOrConfig, { parentSession: parentSessionOrOptions });
                }
                return extHostDebugService.startDebugging(folder, nameOrConfig, parentSessionOrOptions || {});
            },
            stopDebugging(session) {
                return extHostDebugService.stopDebugging(session);
            },
            addBreakpoints(breakpoints) {
                return extHostDebugService.addBreakpoints(breakpoints);
            },
            removeBreakpoints(breakpoints) {
                return extHostDebugService.removeBreakpoints(breakpoints);
            },
            asDebugSourceUri(source, session) {
                return extHostDebugService.asDebugSourceUri(source, session);
            }
        };
        const tasks = {
            registerTaskProvider: (type, provider) => {
                return extHostTask.registerTaskProvider(extension, type, provider);
            },
            fetchTasks: (filter) => {
                return extHostTask.fetchTasks(filter);
            },
            executeTask: (task) => {
                return extHostTask.executeTask(extension, task);
            },
            get taskExecutions() {
                return extHostTask.taskExecutions;
            },
            onDidStartTask: (listener, thisArgs, disposables) => {
                const wrappedListener = (event) => {
                    if (!isProposedApiEnabled(extension, 'taskExecutionTerminal')) {
                        if (event?.execution?.terminal !== undefined) {
                            event.execution.terminal = undefined;
                        }
                    }
                    const eventWithExecution = {
                        ...event,
                        execution: event.execution
                    };
                    return listener.call(thisArgs, eventWithExecution);
                };
                return _asExtensionEvent(extHostTask.onDidStartTask)(wrappedListener, thisArgs, disposables);
            },
            onDidEndTask: (listeners, thisArgs, disposables) => {
                return _asExtensionEvent(extHostTask.onDidEndTask)(listeners, thisArgs, disposables);
            },
            onDidStartTaskProcess: (listeners, thisArgs, disposables) => {
                return _asExtensionEvent(extHostTask.onDidStartTaskProcess)(listeners, thisArgs, disposables);
            },
            onDidEndTaskProcess: (listeners, thisArgs, disposables) => {
                return _asExtensionEvent(extHostTask.onDidEndTaskProcess)(listeners, thisArgs, disposables);
            },
            onDidStartTaskProblemMatchers: (listeners, thisArgs, disposables) => {
                checkProposedApiEnabled(extension, 'taskProblemMatcherStatus');
                return _asExtensionEvent(extHostTask.onDidStartTaskProblemMatchers)(listeners, thisArgs, disposables);
            },
            onDidEndTaskProblemMatchers: (listeners, thisArgs, disposables) => {
                checkProposedApiEnabled(extension, 'taskProblemMatcherStatus');
                return _asExtensionEvent(extHostTask.onDidEndTaskProblemMatchers)(listeners, thisArgs, disposables);
            }
        };
        // namespace: notebook
        const notebooks = {
            createNotebookController(id, notebookType, label, handler, rendererScripts) {
                return extHostNotebookKernels.createNotebookController(extension, id, notebookType, label, handler, isProposedApiEnabled(extension, 'notebookMessaging') ? rendererScripts : undefined);
            },
            registerNotebookCellStatusBarItemProvider: (notebookType, provider) => {
                return extHostNotebook.registerNotebookCellStatusBarItemProvider(extension, notebookType, provider);
            },
            createRendererMessaging(rendererId) {
                return extHostNotebookRenderers.createRendererMessaging(extension, rendererId);
            },
            createNotebookControllerDetectionTask(notebookType) {
                checkProposedApiEnabled(extension, 'notebookKernelSource');
                return extHostNotebookKernels.createNotebookControllerDetectionTask(extension, notebookType);
            },
            registerKernelSourceActionProvider(notebookType, provider) {
                checkProposedApiEnabled(extension, 'notebookKernelSource');
                return extHostNotebookKernels.registerKernelSourceActionProvider(extension, notebookType, provider);
            },
        };
        // namespace: l10n
        const l10n = {
            t(...params) {
                if (typeof params[0] === 'string') {
                    const key = params.shift();
                    // We have either rest args which are Array<string | number | boolean> or an array with a single Record<string, any>.
                    // This ensures we get a Record<string | number, any> which will be formatted correctly.
                    const argsFormatted = !params || typeof params[0] !== 'object' ? params : params[0];
                    return extHostLocalization.getMessage(extension.identifier.value, { message: key, args: argsFormatted });
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
        const interactive = {
            transferActiveChat(toWorkspace) {
                checkProposedApiEnabled(extension, 'interactive');
                return extHostChatAgents2.transferActiveChat(toWorkspace);
            }
        };
        // namespace: ai
        const ai = {
            getRelatedInformation(query, types) {
                checkProposedApiEnabled(extension, 'aiRelatedInformation');
                return extHostAiRelatedInformation.getRelatedInformation(extension, query, types);
            },
            registerRelatedInformationProvider(type, provider) {
                checkProposedApiEnabled(extension, 'aiRelatedInformation');
                return extHostAiRelatedInformation.registerRelatedInformationProvider(extension, type, provider);
            },
            registerEmbeddingVectorProvider(model, provider) {
                checkProposedApiEnabled(extension, 'aiRelatedInformation');
                return extHostAiEmbeddingVector.registerEmbeddingVectorProvider(extension, model, provider);
            },
            registerSettingsSearchProvider(provider) {
                checkProposedApiEnabled(extension, 'aiSettingsSearch');
                return extHostAiSettingsSearch.registerSettingsSearchProvider(extension, provider);
            }
        };
        // namespace: chatregisterMcpServerDefinitionProvider
        const chat = {
            registerMappedEditsProvider(_selector, _provider) {
                checkProposedApiEnabled(extension, 'mappedEditsProvider');
                // no longer supported
                return { dispose() { } };
            },
            registerMappedEditsProvider2(provider) {
                checkProposedApiEnabled(extension, 'mappedEditsProvider');
                return extHostCodeMapper.registerMappedEditsProvider(extension, provider);
            },
            createChatParticipant(id, handler) {
                return extHostChatAgents2.createChatAgent(extension, id, handler);
            },
            createDynamicChatParticipant(id, dynamicProps, handler) {
                checkProposedApiEnabled(extension, 'chatParticipantPrivate');
                return extHostChatAgents2.createDynamicChatAgent(extension, id, dynamicProps, handler);
            },
            registerChatParticipantDetectionProvider(provider) {
                checkProposedApiEnabled(extension, 'chatParticipantPrivate');
                return extHostChatAgents2.registerChatParticipantDetectionProvider(extension, provider);
            },
            onDidDisposeChatSession: (listeners, thisArgs, disposables) => {
                checkProposedApiEnabled(extension, 'chatParticipantPrivate');
                return _asExtensionEvent(extHostChatAgents2.onDidDisposeChatSession)(listeners, thisArgs, disposables);
            },
            registerChatSessionItemProvider: (chatSessionType, provider) => {
                checkProposedApiEnabled(extension, 'chatSessionsProvider');
                extHostApiDeprecation.report('chat.registerChatSessionItemProvider', extension, `Please migrate to the new chat session controller API`, {
                    usageId: chatSessionType
                });
                return extHostChatSessions.registerChatSessionItemProvider(extension, chatSessionType, provider);
            },
            createChatSessionItemController: (chatSessionType, refreshHandler) => {
                checkProposedApiEnabled(extension, 'chatSessionsProvider');
                return extHostChatSessions.createChatSessionItemController(extension, chatSessionType, refreshHandler);
            },
            registerChatSessionContentProvider(scheme, provider, chatParticipant, capabilities) {
                checkProposedApiEnabled(extension, 'chatSessionsProvider');
                return extHostChatSessions.registerChatSessionContentProvider(extension, scheme, chatParticipant, provider, capabilities);
            },
            registerChatOutputRenderer: (viewType, renderer) => {
                checkProposedApiEnabled(extension, 'chatOutputRenderer');
                return extHostChatOutputRenderer.registerChatOutputRenderer(extension, viewType, renderer);
            },
            registerChatWorkspaceContextProvider(id, provider) {
                checkProposedApiEnabled(extension, 'chatContextProvider');
                return extHostChatContext.registerChatWorkspaceContextProvider(`${extension.id}-${id}`, provider);
            },
            registerChatExplicitContextProvider(id, provider) {
                checkProposedApiEnabled(extension, 'chatContextProvider');
                return extHostChatContext.registerChatExplicitContextProvider(`${extension.id}-${id}`, provider);
            },
            registerChatResourceContextProvider(selector, id, provider) {
                checkProposedApiEnabled(extension, 'chatContextProvider');
                return extHostChatContext.registerChatResourceContextProvider(checkSelector(selector), `${extension.id}-${id}`, provider);
            },
            /** @deprecated Use registerChatWorkspaceContextProvider, registerChatExplicitContextProvider, or registerChatResourceContextProvider instead. */
            registerChatContextProvider(selector, id, provider) {
                checkProposedApiEnabled(extension, 'chatContextProvider');
                return extHostChatContext.registerChatContextProvider(selector ? checkSelector(selector) : undefined, `${extension.id}-${id}`, provider);
            },
            registerCustomAgentProvider(provider) {
                checkProposedApiEnabled(extension, 'chatPromptFiles');
                return extHostChatAgents2.registerPromptFileProvider(extension, PromptsType.agent, provider);
            },
            registerInstructionsProvider(provider) {
                checkProposedApiEnabled(extension, 'chatPromptFiles');
                return extHostChatAgents2.registerPromptFileProvider(extension, PromptsType.instructions, provider);
            },
            registerPromptFileProvider(provider) {
                checkProposedApiEnabled(extension, 'chatPromptFiles');
                return extHostChatAgents2.registerPromptFileProvider(extension, PromptsType.prompt, provider);
            },
            registerSkillProvider(provider) {
                checkProposedApiEnabled(extension, 'chatPromptFiles');
                return extHostChatAgents2.registerPromptFileProvider(extension, PromptsType.skill, provider);
            },
            registerChatDebugLogProvider(provider) {
                checkProposedApiEnabled(extension, 'chatDebug');
                return extHostChatDebug.registerChatDebugLogProvider(provider);
            },
            onDidReceiveChatDebugEvent: (listener, thisArgs, disposables) => {
                checkProposedApiEnabled(extension, 'chatDebug');
                return extHostChatDebug.onDidAddCoreEvent(listener, thisArgs, disposables);
            },
            get customAgents() {
                checkProposedApiEnabled(extension, 'chatPromptFiles');
                return extHostChatAgents2.customAgents;
            },
            onDidChangeCustomAgents: (listener, thisArgs, disposables) => {
                checkProposedApiEnabled(extension, 'chatPromptFiles');
                return extHostChatAgents2.onDidChangeCustomAgents(listener, thisArgs, disposables);
            },
            get instructions() {
                checkProposedApiEnabled(extension, 'chatPromptFiles');
                return extHostChatAgents2.instructions;
            },
            onDidChangeInstructions: (listener, thisArgs, disposables) => {
                checkProposedApiEnabled(extension, 'chatPromptFiles');
                return extHostChatAgents2.onDidChangeInstructions(listener, thisArgs, disposables);
            },
            get skills() {
                checkProposedApiEnabled(extension, 'chatPromptFiles');
                return extHostChatAgents2.skills;
            },
            onDidChangeSkills: (listener, thisArgs, disposables) => {
                checkProposedApiEnabled(extension, 'chatPromptFiles');
                return extHostChatAgents2.onDidChangeSkills(listener, thisArgs, disposables);
            },
            registerChatSessionCustomizationProvider(chatSessionType, metadata, provider) {
                checkProposedApiEnabled(extension, 'chatSessionCustomizationProvider');
                return extHostChatAgents2.registerChatSessionCustomizationProvider(extension, chatSessionType, metadata, provider);
            },
        };
        // namespace: lm
        const lm = {
            selectChatModels: (selector) => {
                return extHostLanguageModels.selectLanguageModels(extension, selector ?? {});
            },
            onDidChangeChatModels: (listener, thisArgs, disposables) => {
                return extHostLanguageModels.onDidChangeProviders(listener, thisArgs, disposables);
            },
            registerLanguageModelChatProvider: (vendor, provider) => {
                return extHostLanguageModels.registerLanguageModelChatProvider(extension, vendor, provider);
            },
            get isModelProxyAvailable() {
                checkProposedApiEnabled(extension, 'languageModelProxy');
                return extHostLanguageModels.isModelProxyAvailable;
            },
            onDidChangeModelProxyAvailability: (listener, thisArgs, disposables) => {
                checkProposedApiEnabled(extension, 'languageModelProxy');
                return extHostLanguageModels.onDidChangeModelProxyAvailability(listener, thisArgs, disposables);
            },
            getModelProxy: () => {
                checkProposedApiEnabled(extension, 'languageModelProxy');
                return extHostLanguageModels.getModelProxy(extension);
            },
            registerLanguageModelProxyProvider: (provider) => {
                checkProposedApiEnabled(extension, 'chatParticipantPrivate');
                return extHostLanguageModels.registerLanguageModelProxyProvider(extension, provider);
            },
            // --- embeddings
            get embeddingModels() {
                checkProposedApiEnabled(extension, 'embeddings');
                return extHostEmbeddings.embeddingsModels;
            },
            onDidChangeEmbeddingModels: (listener, thisArgs, disposables) => {
                checkProposedApiEnabled(extension, 'embeddings');
                return extHostEmbeddings.onDidChange(listener, thisArgs, disposables);
            },
            registerEmbeddingsProvider(embeddingsModel, provider) {
                checkProposedApiEnabled(extension, 'embeddings');
                return extHostEmbeddings.registerEmbeddingsProvider(extension, embeddingsModel, provider);
            },
            async computeEmbeddings(embeddingsModel, input, token) {
                checkProposedApiEnabled(extension, 'embeddings');
                if (typeof input === 'string') {
                    return extHostEmbeddings.computeEmbeddings(embeddingsModel, input, token);
                }
                else {
                    return extHostEmbeddings.computeEmbeddings(embeddingsModel, input, token);
                }
            },
            registerTool(name, tool) {
                return extHostLanguageModelTools.registerTool(extension, name, tool);
            },
            registerToolDefinition(definition, tool) {
                return extHostLanguageModelTools.registerToolDefinition(extension, definition, tool);
            },
            invokeTool(nameOrInfo, parameters, token) {
                if (typeof nameOrInfo !== 'string') {
                    checkProposedApiEnabled(extension, 'chatParticipantAdditions');
                }
                return extHostLanguageModelTools.invokeTool(extension, nameOrInfo, parameters, token);
            },
            get tools() {
                return extHostLanguageModelTools.getTools(extension);
            },
            fileIsIgnored(uri, token) {
                return extHostLanguageModels.fileIsIgnored(extension, uri, token);
            },
            registerIgnoredFileProvider(provider) {
                return extHostLanguageModels.registerIgnoredFileProvider(extension, provider);
            },
            registerMcpServerDefinitionProvider(id, provider) {
                return extHostMcp.registerMcpConfigurationProvider(extension, id, provider);
            },
            onDidChangeMcpServerDefinitions: (...args) => {
                checkProposedApiEnabled(extension, 'mcpServerDefinitions');
                return _asExtensionEvent(extHostMcp.onDidChangeMcpServerDefinitions)(...args);
            },
            get mcpServerDefinitions() {
                checkProposedApiEnabled(extension, 'mcpServerDefinitions');
                return extHostMcp.mcpServerDefinitions;
            },
            startMcpGateway() {
                checkProposedApiEnabled(extension, 'mcpServerDefinitions');
                return extHostMcp.startMcpGateway();
            },
            onDidChangeChatRequestTools(...args) {
                checkProposedApiEnabled(extension, 'chatParticipantAdditions');
                return _asExtensionEvent(extHostChatAgents2.onDidChangeChatRequestTools)(...args);
            }
        };
        // namespace: speech
        const speech = {
            registerSpeechProvider(id, provider) {
                checkProposedApiEnabled(extension, 'speech');
                return extHostSpeech.registerProvider(extension.identifier, id, provider);
            }
        };
        // eslint-disable-next-line local/code-no-dangerous-type-assertions
        return {
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
            InlineCompletionsDisposeReasonKind: extHostTypes.InlineCompletionsDisposeReasonKind,
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
            TaskRunOn: extHostTypes.TaskRunOn,
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
            ChatSessionChangedFile: extHostTypes.ChatSessionChangedFile,
            ChatSessionChangedFile2: extHostTypes.ChatSessionChangedFile2,
            ChatEditingSessionActionOutcome: extHostTypes.ChatEditingSessionActionOutcome,
            InteractiveEditorResponseFeedbackKind: extHostTypes.InteractiveEditorResponseFeedbackKind,
            DebugStackFrame: extHostTypes.DebugStackFrame,
            DebugThread: extHostTypes.DebugThread,
            RelatedInformationType: extHostTypes.RelatedInformationType,
            SpeechToTextStatus: extHostTypes.SpeechToTextStatus,
            TextToSpeechStatus: extHostTypes.TextToSpeechStatus,
            PartialAcceptTriggerKind: extHostTypes.PartialAcceptTriggerKind,
            InlineCompletionEndOfLifeReasonKind: extHostTypes.InlineCompletionEndOfLifeReasonKind,
            InlineCompletionDisplayLocationKind: extHostTypes.InlineCompletionDisplayLocationKind,
            KeywordRecognitionStatus: extHostTypes.KeywordRecognitionStatus,
            ChatImageMimeType: extHostTypes.ChatImageMimeType,
            ChatResponseMarkdownPart: extHostTypes.ChatResponseMarkdownPart,
            ChatResponseFileTreePart: extHostTypes.ChatResponseFileTreePart,
            ChatResponseAnchorPart: extHostTypes.ChatResponseAnchorPart,
            ChatResponseProgressPart: extHostTypes.ChatResponseProgressPart,
            ChatResponseProgressPart2: extHostTypes.ChatResponseProgressPart2,
            ChatResponseThinkingProgressPart: extHostTypes.ChatResponseThinkingProgressPart,
            ChatResponseHookPart: extHostTypes.ChatResponseHookPart,
            ChatResponseReferencePart: extHostTypes.ChatResponseReferencePart,
            ChatResponseReferencePart2: extHostTypes.ChatResponseReferencePart,
            ChatResponseCodeCitationPart: extHostTypes.ChatResponseCodeCitationPart,
            ChatResponseCodeblockUriPart: extHostTypes.ChatResponseCodeblockUriPart,
            ChatResponseWarningPart: extHostTypes.ChatResponseWarningPart,
            ChatResponseTextEditPart: extHostTypes.ChatResponseTextEditPart,
            ChatResponseNotebookEditPart: extHostTypes.ChatResponseNotebookEditPart,
            ChatResponseWorkspaceEditPart: extHostTypes.ChatResponseWorkspaceEditPart,
            ChatResponseMarkdownWithVulnerabilitiesPart: extHostTypes.ChatResponseMarkdownWithVulnerabilitiesPart,
            ChatResponseCommandButtonPart: extHostTypes.ChatResponseCommandButtonPart,
            ChatResponseConfirmationPart: extHostTypes.ChatResponseConfirmationPart,
            ChatQuestion: extHostTypes.ChatQuestion,
            ChatQuestionType: extHostTypes.ChatQuestionType,
            ChatResponseQuestionCarouselPart: extHostTypes.ChatResponseQuestionCarouselPart,
            ChatResponseMovePart: extHostTypes.ChatResponseMovePart,
            ChatResponseExtensionsPart: extHostTypes.ChatResponseExtensionsPart,
            ChatResponseExternalEditPart: extHostTypes.ChatResponseExternalEditPart,
            ChatResponsePullRequestPart: extHostTypes.ChatResponsePullRequestPart,
            ChatResponseMultiDiffPart: extHostTypes.ChatResponseMultiDiffPart,
            ChatResponseReferencePartStatusKind: extHostTypes.ChatResponseReferencePartStatusKind,
            ChatResponseClearToPreviousToolInvocationReason: extHostTypes.ChatResponseClearToPreviousToolInvocationReason,
            ChatRequestTurn: extHostTypes.ChatRequestTurn,
            ChatRequestTurn2: extHostTypes.ChatRequestTurn,
            ChatResponseTurn: extHostTypes.ChatResponseTurn,
            ChatResponseTurn2: extHostTypes.ChatResponseTurn2,
            ChatSubagentToolInvocationData: extHostTypes.ChatSubagentToolInvocationData,
            ChatToolInvocationPart: extHostTypes.ChatToolInvocationPart,
            ChatLocation: extHostTypes.ChatLocation,
            ChatSessionStatus: extHostTypes.ChatSessionStatus,
            ChatSessionCustomizationType: extHostTypes.ChatSessionCustomizationType,
            ChatDebugLogLevel: extHostTypes.ChatDebugLogLevel,
            ChatDebugToolCallResult: extHostTypes.ChatDebugToolCallResult,
            ChatDebugHookResult: extHostTypes.ChatDebugHookResult,
            ChatDebugToolCallEvent: extHostTypes.ChatDebugToolCallEvent,
            ChatDebugModelTurnEvent: extHostTypes.ChatDebugModelTurnEvent,
            ChatDebugGenericEvent: extHostTypes.ChatDebugGenericEvent,
            ChatDebugSubagentInvocationEvent: extHostTypes.ChatDebugSubagentInvocationEvent,
            ChatDebugUserMessageEvent: extHostTypes.ChatDebugUserMessageEvent,
            ChatDebugAgentResponseEvent: extHostTypes.ChatDebugAgentResponseEvent,
            ChatDebugMessageSection: extHostTypes.ChatDebugMessageSection,
            ChatDebugEventTextContent: extHostTypes.ChatDebugEventTextContent,
            ChatDebugMessageContentType: extHostTypes.ChatDebugMessageContentType,
            ChatDebugEventMessageContent: extHostTypes.ChatDebugEventMessageContent,
            ChatDebugEventToolCallContent: extHostTypes.ChatDebugEventToolCallContent,
            ChatDebugEventModelTurnContent: extHostTypes.ChatDebugEventModelTurnContent,
            ChatDebugEventHookContent: extHostTypes.ChatDebugEventHookContent,
            ChatRequestEditorData: extHostTypes.ChatRequestEditorData,
            ChatRequestNotebookData: extHostTypes.ChatRequestNotebookData,
            ChatReferenceBinaryData: extHostTypes.ChatReferenceBinaryData,
            ChatRequestEditedFileEventKind: extHostTypes.ChatRequestEditedFileEventKind,
            LanguageModelChatMessageRole: extHostTypes.LanguageModelChatMessageRole,
            LanguageModelChatMessage: extHostTypes.LanguageModelChatMessage,
            LanguageModelChatMessage2: extHostTypes.LanguageModelChatMessage2,
            LanguageModelToolResultPart: extHostTypes.LanguageModelToolResultPart,
            LanguageModelToolResultPart2: extHostTypes.LanguageModelToolResultPart,
            LanguageModelTextPart: extHostTypes.LanguageModelTextPart,
            LanguageModelTextPart2: extHostTypes.LanguageModelTextPart,
            LanguageModelPartAudience: extHostTypes.LanguageModelPartAudience,
            ToolResultAudience: extHostTypes.LanguageModelPartAudience, // back compat
            LanguageModelToolCallPart: extHostTypes.LanguageModelToolCallPart,
            LanguageModelThinkingPart: extHostTypes.LanguageModelThinkingPart,
            LanguageModelError: extHostTypes.LanguageModelError,
            LanguageModelToolResult: extHostTypes.LanguageModelToolResult,
            LanguageModelToolResult2: extHostTypes.LanguageModelToolResult2,
            LanguageModelDataPart: extHostTypes.LanguageModelDataPart,
            LanguageModelDataPart2: extHostTypes.LanguageModelDataPart,
            LanguageModelToolExtensionSource: extHostTypes.LanguageModelToolExtensionSource,
            LanguageModelToolMCPSource: extHostTypes.LanguageModelToolMCPSource,
            ExtendedLanguageModelToolResult: extHostTypes.ExtendedLanguageModelToolResult,
            LanguageModelChatToolMode: extHostTypes.LanguageModelChatToolMode,
            LanguageModelPromptTsxPart: extHostTypes.LanguageModelPromptTsxPart,
            NewSymbolName: extHostTypes.NewSymbolName,
            NewSymbolNameTag: extHostTypes.NewSymbolNameTag,
            NewSymbolNameTriggerKind: extHostTypes.NewSymbolNameTriggerKind,
            ExcludeSettingOptions: ExcludeSettingOptions,
            TextSearchContext2: TextSearchContext2,
            TextSearchMatch2: TextSearchMatch2,
            AISearchKeyword: AISearchKeyword,
            TextSearchCompleteMessageTypeNew: TextSearchCompleteMessageType,
            ChatErrorLevel: extHostTypes.ChatErrorLevel,
            McpHttpServerDefinition: extHostTypes.McpHttpServerDefinition,
            McpHttpServerDefinition2: extHostTypes.McpHttpServerDefinition,
            McpStdioServerDefinition: extHostTypes.McpStdioServerDefinition,
            McpStdioServerDefinition2: extHostTypes.McpStdioServerDefinition,
            McpToolAvailability: extHostTypes.McpToolAvailability,
            McpToolInvocationContentData: extHostTypes.McpToolInvocationContentData,
            SettingsSearchResultKind: extHostTypes.SettingsSearchResultKind,
            ChatTodoStatus: extHostTypes.ChatTodoStatus,
            ChatDebugSubagentStatus: extHostTypes.ChatDebugSubagentStatus,
        };
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdC5hcGkuaW1wbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3QuYXBpLmltcGwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDL0UsT0FBTyxLQUFLLE1BQU0sTUFBTSxnQ0FBZ0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDekUsT0FBTyxRQUFRLE1BQU0sa0NBQWtDLENBQUM7QUFDeEQsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ2xELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxLQUFLLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNyRixPQUFPLEtBQUsscUJBQXFCLE1BQU0sMkRBQTJELENBQUM7QUFDbkcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDcEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxzQkFBc0IsRUFBeUIsTUFBTSxtREFBbUQsQ0FBQztBQUNsSSxPQUFPLEtBQUssS0FBSyxNQUFNLHlDQUF5QyxDQUFDO0FBRWpFLE9BQU8sRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzVGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUMvRSxPQUFPLEVB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