/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { DocumentSelector, Position } from 'vscode-languageserver-protocol';
import { GhostTextLogContext } from '../../extension/completions-core/common/ghostTextContext';
import { CompletionsTelemetryServiceBridge, ICompletionsTelemetryService } from '../../extension/completions-core/vscode-node/bridge/src/completionsTelemetryServiceBridge';
import { CopilotExtensionStatus, ICompletionsExtensionStatus } from '../../extension/completions-core/vscode-node/extension/src/extensionStatus';
import { CopilotTokenManagerImpl, ICompletionsCopilotTokenManager } from '../../extension/completions-core/vscode-node/lib/src/auth/copilotTokenManager';
import { ICompletionsCitationManager, IPCitationDetail, IPDocumentCitation } from '../../extension/completions-core/vscode-node/lib/src/citationManager';
import { CompletionNotifier, ICompletionsNotifierService } from '../../extension/completions-core/vscode-node/lib/src/completionNotifier';
import { ICompletionsObservableWorkspace } from '../../extension/completions-core/vscode-node/lib/src/completionsObservableWorkspace';
import { BuildInfo, BuildType, ConfigKeyType, DefaultsOnlyConfigProvider, EditorInfo, EditorPluginInfo, ICompletionsConfigProvider, ICompletionsEditorAndPluginInfo, InMemoryConfigProvider } from '../../extension/completions-core/vscode-node/lib/src/config';
import { ICompletionsUserErrorNotifierService, UserErrorNotifier } from '../../extension/completions-core/vscode-node/lib/src/error/userErrorNotifier';
import { Features } from '../../extension/completions-core/vscode-node/lib/src/experiments/features';
import { ICompletionsFeaturesService } from '../../extension/completions-core/vscode-node/lib/src/experiments/featuresService';
import { FileReader, ICompletionsFileReaderService } from '../../extension/completions-core/vscode-node/lib/src/fileReader';
import { ICompletionsFileSystemService } from '../../extension/completions-core/vscode-node/lib/src/fileSystem';
import { AsyncCompletionManager, ICompletionsAsyncManagerService } from '../../extension/completions-core/vscode-node/lib/src/ghostText/asyncCompletions';
import { CompletionsCache, ICompletionsCacheService } from '../../extension/completions-core/vscode-node/lib/src/ghostText/completionsCache';
import { ConfigBlockModeConfig, ICompletionsBlockModeConfig } from '../../extension/completions-core/vscode-node/lib/src/ghostText/configBlockMode';
import { CopilotCompletion } from '../../extension/completions-core/vscode-node/lib/src/ghostText/copilotCompletion';
import { CurrentGhostText, ICompletionsCurrentGhostText } from '../../extension/completions-core/vscode-node/lib/src/ghostText/current';
import { GetGhostTextOptions } from '../../extension/completions-core/vscode-node/lib/src/ghostText/ghostText';
import { ICompletionsLastGhostText, LastGhostText } from '../../extension/completions-core/vscode-node/lib/src/ghostText/last';
import { ITextEditorOptions } from '../../extension/completions-core/vscode-node/lib/src/ghostText/normalizeIndent';
import { ICompletionsSpeculativeRequestCache, SpeculativeRequestCache } from '../../extension/completions-core/vscode-node/lib/src/ghostText/speculativeRequestCache';
import { GhostText } from '../../extension/completions-core/vscode-node/lib/src/inlineCompletion';
import { LocalFileSystem } from '../../extension/completions-core/vscode-node/lib/src/localFileSystem';
import { LogLevel as CompletionsLogLevel, ICompletionsLogTargetService } from '../../extension/completions-core/vscode-node/lib/src/logger';
import { ICompletionsFetcherService } from '../../extension/completions-core/vscode-node/lib/src/networking';
import { ActionItem, ICompletionsNotificationSender } from '../../extension/completions-core/vscode-node/lib/src/notificationSender';
import { ICompletionsOpenAIFetcherService, LiveOpenAIFetcher } from '../../extension/completions-core/vscode-node/lib/src/openai/fetch';
import { AvailableModelsManager, ICompletionsModelManagerService } from '../../extension/completions-core/vscode-node/lib/src/openai/model';
import { ICompletionsStatusReporter, StatusChangedEvent, StatusReporter } from '../../extension/completions-core/vscode-node/lib/src/progress';
import { CompletionsPromptFactory, ICompletionsPromptFactoryService } from '../../extension/completions-core/vscode-node/lib/src/prompt/completionsPromptFactory/completionsPromptFactory';
import { ContextProviderBridge, ICompletionsContextProviderBridgeService } from '../../extension/completions-core/vscode-node/lib/src/prompt/components/contextProviderBridge';
import { CachedContextProviderRegistry, CoreContextProviderRegistry, DefaultContextProvidersContainer, ICompletionsContextProviderRegistryService, ICompletionsDefaultContextProviders } from '../../extension/completions-core/vscode-node/lib/src/prompt/contextProviderRegistry';
import { ContextProviderStatistics, ICompletionsContextProviderService } from '../../extension/completions-core/vscode-node/lib/src/prompt/contextProviderStatistics';
import { FullRecentEditsProvider, ICompletionsRecentEditsProviderService } from '../../extension/completions-core/vscode-node/lib/src/prompt/recentEdits/recentEditsProvider';
import { CompositeRelatedFilesProvider } from '../../extension/completions-core/vscode-node/lib/src/prompt/similarFiles/compositeRelatedFilesProvider';
import { ICompletionsRelatedFilesProviderService } from '../../extension/completions-core/vscode-node/lib/src/prompt/similarFiles/relatedFiles';
import { ICompletionsTelemetryUserConfigService, TelemetryUserConfig } from '../../extension/completions-core/vscode-node/lib/src/telemetry/userConfig';
import { INotebookDocument, ITextDocument, TextDocumentIdentifier } from '../../extension/completions-core/vscode-node/lib/src/textDocument';
import { ICompletionsTextDocumentManagerService, TextDocumentChangeEvent, TextDocumentCloseEvent, TextDocumentFocusedEvent, TextDocumentManager, TextDocumentOpenEvent, WorkspaceFoldersChangeEvent } from '../../extension/completions-core/vscode-node/lib/src/textDocumentManager';
import { Event } from '../../extension/completions-core/vscode-node/lib/src/util/event';
import { ICompletionsPromiseQueueService, PromiseQueue } from '../../extension/completions-core/vscode-node/lib/src/util/promiseQueue';
import { ICompletionsRuntimeModeService, RuntimeMode } from '../../extension/completions-core/vscode-node/lib/src/util/runtimeMode';
import { DocumentContext, WorkspaceFolder } from '../../extension/completions-core/vscode-node/types/src';
import { DebugRecorder } from '../../extension/inlineEdits/node/debugRecorder';
import { INextEditProvider, NESInlineCompletionContext, NextEditProvider } from '../../extension/inlineEdits/node/nextEditProvider';
import { LlmNESTelemetryBuilder, NextEditProviderTelemetryBuilder, TelemetrySender } from '../../extension/inlineEdits/node/nextEditProviderTelemetry';
import { INextEditResult } from '../../extension/inlineEdits/node/nextEditResult';
import { IPowerService, NullPowerService } from '../../extension/power/common/powerService';
import { ChatMLFetcherImpl } from '../../extension/prompt/node/chatMLFetcher';
import { ISimilarFilesContextService } from '../../extension/xtab/common/similarFilesContextService';
import { XtabProvider } from '../../extension/xtab/node/xtabProvider';
import { IAuthenticationService } from '../../platform/authentication/common/authentication';
import { ICopilotTokenManager } from '../../platform/authentication/common/copilotTokenManager';
import { CopilotTokenStore, ICopilotTokenStore } from '../../platform/authentication/common/copilotTokenStore';
import { StaticGitHubAuthenticationService } from '../../platform/authentication/common/staticGitHubAuthenticationService';
import { createStaticGitHubTokenProvider } from '../../platform/authentication/node/copilotTokenManager';
import { IChatMLFetcher } from '../../platform/chat/common/chatMLFetcher';
import { IChatQuotaService } from '../../platform/chat/common/chatQuotaService';
import { ChatQuotaService } from '../../platform/chat/common/chatQuotaServiceImpl';
import { IConversationOptions } from '../../platform/chat/common/conversationOptions';
import { IInteractionService, InteractionService } from '../../platform/chat/common/interactionService';
import { BaseConfig, Config, ConfigKey, CopilotConfigPrefix, ExperimentBasedConfig, ExperimentBasedConfigType, globalConfigRegistry, IConfigurationService } from '../../platform/configuration/common/configurationService';
import { DefaultsOnlyConfigurationService } from '../../platform/configuration/common/defaultsOnlyConfigurationService';
import { IDiffService } from '../../platform/diff/common/diffService';
import { DiffServiceImpl } from '../../platform/diff/node/diffServiceImpl';
import { ICAPIClientService } from '../../platform/endpoint/common/capiClient';
import { IDomainService } from '../../platform/endpoint/common/domainService';
import { IEndpointProvider } from '../../platform/endpoint/common/endpointProvider';
import { CAPIClientImpl } from '../../platform/endpoint/node/capiClientImpl';
import { DomainService } from '../../platform/endpoint/node/domainServiceImpl';
import { IEnvService, NameAndVersion, OperatingSystem } from '../../platform/env/common/envService';
import { NullEnvService } from '../../platform/env/common/nullEnvService';
import { IGitExtensionService } from '../../platform/git/common/gitExtensionService';
import { NullGitExtensionService } from '../../platform/git/common/nullGitExtensionService';
import { IIgnoreService, NullIgnoreService } from '../../platform/ignore/common/ignoreService';
import { DocumentId } from '../../platform/inlineEdits/common/dataTypes/documentId';
import { InlineEditRequestLogContext } from '../../platform/inlineEdits/common/inlineEditLogContext';
import { IInlineEditsModelService, IUndesiredModelsManager, NullUndesiredModelsManager } from '../../platform/inlineEdits/common/inlineEditsModelService';
import { ObservableGit } from '../../platform/inlineEdits/common/observableGit';
import { IObservableDocument, ObservableWorkspace } from '../../platform/inlineEdits/common/observableWorkspace';
import { NesHistoryContextProvider } from '../../platform/inlineEdits/common/workspaceEditTracker/nesHistoryContextProvider';
import { NesXtabHistoryTracker } from '../../platform/inlineEdits/common/workspaceEditTracker/nesXtabHistoryTracker';
import { InlineEditsModelService } from '../../platform/inlineEdits/node/inlineEditsModelService';
import { ILanguageContextProviderService } from '../../platform/languageContextProvider/common/languageContextProviderService';
import { NullLanguageContextProviderService } from '../../platform/languageContextProvider/common/nullLanguageContextProviderService';
import { ILanguageDiagnosticsService } from '../../platform/languages/common/languageDiagnosticsService';
import { TestLanguageDiagnosticsService } from '../../platform/languages/common/testLanguageDiagnosticsService';
import { ConsoleLog, ILogService, LogLevel as InternalLogLevel, LogServiceImpl } from '../../platform/log/common/logService';
import { ICompletionsFetchService } from '../../platform/nesFetch/common/completionsFetchService';
import { CompletionsFetchService } from '../../platform/nesFetch/node/completionsFetchServiceImpl';
import { FetchOptions, HeadersImpl, IAbortController, IFetcherService, PaginationOptions, WebSocketConnection, WebSocketConnectOptions } from '../../platform/networking/common/fetcherService';
import { IFetcher } from '../../platform/networking/common/networking';
import { IChatWebSocketManager, NullChatWebSocketManager } from '../../platform/networking/node/chatWebSocketManager';
import { NoopOTelService } from '../../platform/otel/common/noopOtelService';
import { resolveOTelConfig } from '../../platform/otel/common/otelConfig';
import { IOTelService } from '../../platform/otel/common/otelService';
import { IProxyModelsService } from '../../platform/proxyModels/common/proxyModelsService';
import { ProxyModelsService } from '../../platform/proxyModels/node/proxyModelsService';
import { NullRequestLogger } from '../../platform/requestLogger/node/nullRequestLogger';
import { IRequestLogger } from '../../platform/requestLogger/node/requestLogger';
import { ISimulationTestContext, NulSimulationTestContext } from '../../platform/simulationTestContext/common/simulationTestContext';
import { ISnippyService, NullSnippyService } from '../../platform/snippy/common/snippyService';
import { IExperimentationService, TreatmentsChangeEvent } from '../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService, TelemetryDestination, TelemetryEventMeasurements, TelemetryEventProperties } from '../../platform/telemetry/common/telemetry';
import { eventPropertiesToSimpleObject } from '../../platform/telemetry/common/telemetryData';
import { unwrapEventNameFromPrefix } from '../../platform/telemetry/node/azureInsightsReporter';
import { ITerminalService, NullTerminalService } from '../../platform/terminal/common/terminalService';
import { ITokenizerProvider, TokenizerProvider } from '../../platform/tokenizer/node/tokenizer';
import { IWorkspaceService, NullWorkspaceService } from '../../platform/workspace/common/workspaceService';
import { InstantiationServiceBuilder } from '../../util/common/services';
import { CancellationToken } from '../../util/vs/base/common/cancellation';
import { Emitter, Event as VsEvent } from '../../util/vs/base/common/event';
import { Disposable, IDisposable } from '../../util/vs/base/common/lifecycle';
import { IObservableWithChange } from '../../util/vs/base/common/observableInternal';
import { URI } from '../../util/vs/base/common/uri';
import { generateUuid } from '../../util/vs/base/common/uuid';
import { SyncDescriptor } from '../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../util/vs/platform/instantiation/common/instantiation';
export {
	IAuthenticationService, ICAPIClientService, IEndpointProvider, IExperimentationService, IIgnoreService, ILanguageContextProviderService
};

/**
 * Log levels (taken from vscode.d.ts)
 */
export enum LogLevel {

	/**
	 * No messages are logged with this level.
	 */
	Off = 0,

	/**
	 * All messages are logged with this level.
	 */
	Trace = 1,

	/**
	 * Messages with debug and higher log level are logged with this level.
	 */
	Debug = 2,

	/**
	 * Messages with info and higher log level are logged with this level.
	 */
	Info = 3,

	/**
	 * Messages with warning and higher log level are logged with this level.
	 */
	Warning = 4,

	/**
	 * Only error messages are logged with this level.
	 */
	Error = 5
}

export interface ILogTarget {
	logIt(level: LogLevel, metadataStr: string, ...extra: any[]): void;
	show?(preserveFocus?: boolean): void;
}

export interface ITelemetrySender {
	sendTelemetryEvent(eventName: string, properties?: Record<string, string | undefined>, measurements?: Record<string, number | undefined>): void;
	sendEnhancedTelemetryEvent?(eventName: string, properties?: Record<string, string | undefined>, measurements?: Record<string, number | undefined>): void;
}

export interface INESProviderOptions {
	readonly workspace: ObservableWorkspace;
	readonly fetcher: IFetcher;
	readonly copilotTokenManager: ICopilotTokenManager;
	readonly terminalService: ITerminalService;
	readonly telemetrySender: ITelemetrySender;
	readonly logTarget?: ILogTarget;
	/**
	 * If true, the provider will wait for treatment variables to be set.
	 * INESProvider.updateTreatmentVariables() must be called to unblock.
	 */
	readonly waitForTreatmentVariables?: boolean;
	readonly undesiredModelsManager?: IUndesiredModelsManager;
	readonly configOverrides?: Map<ConfigKeyType, unknown>;
}

export interface INESResult {
	readonly result?: {
		readonly newText: string;
		readonly range: {
			readonly start: number;
			readonly endExclusive: number;
		};
	};
}

export interface INESProvider<T extends INESResult = INESResult> {
	getId(): string;
	getNextEdit(documentUri: vscode.Uri, cancellationToken: CancellationToken): Promise<T>;
	handleShown(suggestion: T): void;
	handleAcceptance(suggestion: T): void;
	handleRejection(suggestion: T): void;
	handleIgnored(suggestion: T, supersededByRequestUuid: T | undefined): void;
	updateTreatmentVariables(variables: Record<string, boolean | number | string>): void;
	setConfigs(overrides: Map<string, unknown>): Promise<void>;
	dispose(): void;
}

export function createNESProvider(options: INESProviderOptions): INESProvider<INESResult> {
	const instantiationService = setupServices(options);
	return instantiationService.createInstance(NESProvider, options);
}

interface NESResult extends INESResult {
	docId: DocumentId;
	requestUuid: string;
	internalResult: INextEditResult;
	telemetryBuilder: NextEditProviderTelemetryBuilder;
}

class NESProvider extends Disposable implements INESProvider<NESResult> {
	private readonly _nextEditProvider: INextEditProvider<INextEditResult, LlmNESTelemetryBuilder>;
	private readonly _telemetrySender: TelemetrySender;
	private readonly _debugRecorder: DebugRecorder;

	constructor(
		private _options: INESProviderOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IExperimentationService private readonly _expService: IExperimentationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IWorkspaceService private readonly _workspaceService: IWorkspaceService,
	) {
		super();
		const statelessNextEditProvider = instantiationService.createInstance(XtabProvider);
		const git = instantiationService.createInstance(ObservableGit);
		const historyContextProvider = new NesHistoryContextProvider(this._options.workspace, git);
		const xtabDiffNEntries = this._configurationService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabDiffNEntries, this._expService);
		const xtabHistoryTracker = new NesXtabHistoryTracker(this._options.workspace, xtabDiffNEntries, _configurationService, _expService);
		this._debugRecorder = this._register(new DebugRecorder(this._options.workspace));

		this._nextEditProvider = instantiationService.createInstance(NextEditProvider, this._options.workspace, statelessNextEditProvider, historyContextProvider, xtabHistoryTracker, this._debugRecorder);
		this._telemetrySender = this._register(instantiationService.createInstance(TelemetrySender, this._options.workspace));
	}

	getId(): string {
		return this._nextEditProvider.ID;
	}

	handleShown(result: NESResult): void {
		result.telemetryBuilder.setAsShown();
		this._nextEditProvider.handleShown(result.internalResult);
	}

	handleAcceptance(result: NESResult): void {
		result.telemetryBuilder.setAcceptance('accepted');
		result.telemetryBuilder.setStatus('accepted');
		this._nextEditProvider.handleAcceptance(result.docId, result.internalResult);
		this.handleEndOfLifetime(result);
	}

	handleRejection(result: NESResult): void {
		result.telemetryBuilder.setAcceptance('rejected');
		result.telemetryBuilder.setStatus('rejected');
		this._nextEditProvider.handleRejection(result.docId, result.internalResult);
		this.handleEndOfLifetime(result);
	}

	handleIgnored(result: NESResult, supersededByRequestUuid: NESResult | undefined): void {
		if (supersededByRequestUuid) {
			result.telemetryBuilder.setSupersededBy(supersededByRequestUuid.requestUuid);
		}
		this._nextEditProvider.handleIgnored(result.docId, result.internalResult, supersededByRequestUuid?.internalResult);
		this.handleEndOfLifetime(result);
	}

	private handleEndOfLifetime(result: NESResult): void {
		try {
			this._telemetrySender.sendTelemetryForBuilder(result.telemetryBuilder);
		} finally {
			result.telemetryBuilder.dispose();
		}
	}

	async getNextEdit(documentUri: vscode.Uri, cancellationToken: CancellationToken): Promise<NESResult> {
		const docId = DocumentId.create(documentUri.toString());

		// Create minimal required context objects
		const context: NESInlineCompletionContext = {
			triggerKind: 1, // Invoke
			selectedCompletionInfo: undefined,
			requestUuid: generateUuid(),
			requestIssuedDateTime: Date.now(),
			earliestShownDateTime: Date.now() + 200,
			enforceCacheDelay: true,
		};

		// Create log context
		const logContext = new InlineEditRequestLogContext(documentUri.toString(), 1, context);

		const document = this._options.workspace.getDocument(docId);
		if (!document) {
			throw new Error('DocumentNotFound');
		}

		// Create telemetry builder - we'll need to pass null/undefined for services we don't have
		const telemetryBuilder = new NextEditProviderTelemetryBuilder(
			new NullGitExtensionService(),
			undefined, // INotebookService
			this._workspaceService,
			this._nextEditProvider.ID,
			document,
			this._debugRecorder,
			logContext.recordingBookmark
		);
		telemetryBuilder.setOpportunityId(context.requestUuid);

		try {
			const internalResult = await this._nextEditProvider.getNextEdit(docId, context, logContext, cancellationToken, telemetryBuilder.nesBuilder);
			const result: NESResult = {
				result: internalResult.result?.edit ? {
					newText: internalResult.result.edit.newText,
					range: internalResult.result.edit.replaceRange,
				} : undefined,
				docId,
				requestUuid: context.requestUuid,
				internalResult,
				telemetryBuilder,
			};
			return result;
		} catch (e) {
			try {
				this._telemetrySender.sendTelemetryForBuilder(telemetryBuilder);
			} finally {
				telemetryBuilder.dispose();
			}
			throw e;
		}
	}

	updateTreatmentVariables(variables: Record<string, boolean | number | string>) {
		if (this._expService instanceof SimpleExperimentationService) {
			this._expService.updateTreatmentVariables(variables);
		}
	}

	async setConfigs(overrides: Map<string, unknown>) {
		for (const [key, value] of overrides) {
			const config = globalConfigRegistry.configs.get(`${CopilotConfigPrefix}.${key}`);
			if (config) {
				await this._configurationService.setConfig(config, value);
			}
		}
	}

}

function setupServices(options: INESProviderOptions) {
	const { fetcher, copilotTokenManager, telemetrySender, logTarget } = options;
	const builder = new InstantiationServiceBuilder();
	builder.define(IConfigurationService, new SyncDescriptor(OverridableConfigurationService, [options.configOverrides ?? new Map()]));
	builder.define(IExperimentationService, new SyncDescriptor(SimpleExperimentationService, [options.waitForTreatmentVariables]));
	builder.define(ISimulationTestContext, new SyncDescriptor(NulSimulationTestContext));
	builder.define(IWorkspaceService, new SyncDescriptor(NullWorkspaceService));
	builder.define(IDiffService, new SyncDescriptor(DiffServiceImpl, [false]));
	builder.define(ILogService, new SyncDescriptor(LogServiceImpl, [[logTarget || new ConsoleLog(undefined, InternalLogLevel.Trace)]]));
	builder.define(IGitExtensionService, new SyncDescriptor(NullGitExtensionService));
	builder.define(ILanguageContextProviderService, new SyncDescriptor(NullLanguageContextProviderService));
	builder.define(ILanguageDiagnosticsService, new SyncDescriptor(TestLanguageDiagnosticsService));
	builder.define(IIgnoreService, new SyncDescriptor(NullIgnoreService));
	builder.define(ISnippyService, new SyncDescriptor(NullSnippyService));
	builder.define(IDomainService, new SyncDescriptor(DomainService));
	builder.define(ICAPIClientService, new SyncDescriptor(CAPIClientImpl));
	builder.define(ICopilotTokenStore, new SyncDescriptor(CopilotTokenStore));
	builder.define(IEnvService, new SyncDescriptor(NullEnvService));
	builder.define(IFetcherService, new SyncDescriptor(SingleFetcherService, [fetcher]));
	builder.define(ITelemetryService, new SyncDescriptor(SimpleTelemetryService, [telemetrySender]));
	builder.define(IAuthenticationService, new SyncDescriptor(StaticGitHubAuthenticationService, [createStaticGitHubTokenProvider()]));
	builder.define(ICopilotTokenManager, copilotTokenManager);
	builder.define(IPowerService, new SyncDescriptor(NullPowerService));
	builder.define(IChatMLFetcher, new SyncDescriptor(ChatMLFetcherImpl));
	builder.define(IChatWebSocketManager, new SyncDescriptor(NullChatWebSocketManager));
	builder.define(IOTelService, new NoopOTelService(resolveOTelConfig({ env: {}, extensionVersion: '0.0.0', sessionId: 'chatlib' })));
	builder.define(IChatQuotaService, new SyncDescriptor(ChatQuotaService));
	builder.define(IInteractionService, new SyncDescriptor(InteractionService));
	builder.define(IRequestLogger, new SyncDescriptor(NullRequestLogger));
	builder.define(ITokenizerProvider, new SyncDescriptor(TokenizerProvider, [false]));
	builder.define(IConversationOptions, {
		_serviceBrand: undefined,
		maxResponseTokens: undefined,
		temperature: 0.1,
		topP: 1,
		rejectionMessage: 'Sorry, but I can only assist with programming related questions.',
	});
	builder.define(IProxyModelsService, new SyncDescriptor(ProxyModelsService));
	builder.define(IInlineEditsModelService, new SyncDescriptor(InlineEditsModelService));
	builder.define(IUndesiredModelsManager, options.undesiredModelsManager || new SyncDescriptor(NullUndesiredModelsManager));
	builder.define(ITerminalService, options.terminalService || new SyncDescriptor(NullTerminalService));
	builder.define(ISimilarFilesContextService, new SyncDescriptor(NullSimilarFilesContextService));
	builder.define(IEndpointProvider, new NullEndpointProvider());
	const configProvider = new InMemoryConfigProvider(new DefaultsOnlyConfigProvider());
	if (options.configOverrides) {
		configProvider.setOverrides(options.configOverrides);
	}
	builder.define(ICompletionsConfigProvider, configProvider);
	return builder.seal();
}

class OverridableConfigurationService extends DefaultsOnlyConfigurationService {
	private _overrides: Map<string, unknown>;

	constructor(overrides: Map<string, unknown>) {
		super();
		this._overrides = overrides;
	}

	override async setConfig<T>(key: BaseConfig<T>, value: T): Promise<void> {
		const existing = this._overrides.get(key.id);
		if (existing === value) {
			return;
		}
		if (value === undefined) {
			this._overrides.delete(key.id);
		} else {
			this._overrides.set(key.id, value);
		}
		const fullyQualifiedKey = key.fullyQualifiedId;
		this._onDidChangeConfiguration.fire({
			affectsConfiguration: (section) => {
				return fullyQualifiedKey === section || fullyQualifiedKey.startsWith(section + '.') || section.startsWith(fullyQualifiedKey + '.');
			}
		});
		return;
	}

	override getConfig<T>(key: Config<T>): T {
		if (this._overrides.has(key.id)) {
			const overriddenValue = this._overrides.get(key.id);
			if (key.validator) {
				const result = key.validator.validate(overriddenValue);
				if (result.error) {
					return super.getConfig(key);
				}
				return result.content;
			}
			return overriddenValue as T;
		}
		return super.getConfig(key);
	}

	override getExperimentBasedConfig<T extends ExperimentBasedConfigType>(key: ExperimentBasedConfig<T>, experimentationService: IExperimentationService): T {
		if (this._overrides.has(key.id)) {
			const overriddenValue = this._overrides.get(key.id);
			if (key.validator) {
				const result = key.validator.validate(overriddenValue);
				if (result.error) {
					return super.getExperimentBasedConfig(key, experimentationService);
				}
				return result.content;
			}
			return overriddenValue as T;
		}
		return super.getExperimentBasedConfig(key, experimentationService);
	}

	override inspectConfig<T>(key: BaseConfig<T>) {
		if (this._overrides.has(key.id)) {
			const overriddenValue = this._overrides.get(key.id);
			if (key.validator) {
				const result = key.validator.validate(overriddenValue);
				if (result.error) {
					return super.inspectConfig(key);
				}
				return { defaultValue: result.content };
			}
			return { defaultValue: overriddenValue as T };
		}
		return super.inspectConfig(key);
	}
}

class NullSimilarFilesContextService implements ISimilarFilesContextService {
	declare readonly _serviceBrand: undefined;

	async compute(): Promise<undefined> {
		return undefined;
	}
}

class NullEndpointProvider implements IEndpointProvider {
	declare readonly _serviceBrand: undefined;
	readonly onDidModelsRefresh = VsEvent.None;
	async getAllCompletionModels(): Promise<[]> { return []; }
	async getAllChatEndpoints(): Promise<[]> { return []; }
	async getChatEndpoint(): Promise<never> { throw new Error('not implemented'); }
	async getEmbeddingsEndpoint(): Promise<never> { throw new Error('not implemented'); }
}

export class SimpleExperimentationService extends Disposable implements IExperimentationService {

	declare readonly _serviceBrand: undefined;

	private readonly variables: Record<string, boolean | number | string> = {};
	private readonly _onDidTreatmentsChange = this._register(new Emitter<TreatmentsChangeEvent>());
	readonly onDidTreatmentsChange = this._onDidTreatmentsChange.event;

	private readonly waitFor: Promise<void>;
	private readonly resolveWaitFor: () => void;

	constructor(
		waitForTreatmentVariables: boolean | undefined,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
		if (waitForTreatmentVariables) {
			let resolveWaitFor: () => void;
			this.waitFor = new Promise<void>(resolve => {
				resolveWaitFor = resolve;
			});
			this.resolveWaitFor = resolveWaitFor!;
		} else {
			this.waitFor = Promise.resolve();
			this.resolveWaitFor = () => { };
		}
	}

	async hasTreatments(): Promise<void> {
		return this.waitFor;
	}

	getTreatmentVariable<T extends boolean | number | string>(name: string): T | undefined {
		return this.variables[name] as T | undefined;
	}

	async setCompletionsFilters(_filters: Map<string, string>): Promise<void> { }

	updateTreatmentVariables(variables: Record<string, boolean | number | string>): void {
		const changedVariables: string[] = [];
		for (const [key, value] of Object.entries(variables)) {
			const existing = this.variables[key];
			if (existing !== value) {
				this.variables[key] = value;
				changedVariables.push(key);
			}
		}
		for (const key of Object.keys(this.variables)) {
			if (!Object.hasOwn(variables, key)) {
				delete this.variables[key];
				changedVariables.push(key);
			}
		}
		if (changedVariables.length > 0) {
			this._onDidTreatmentsChange.fire({ affectedTreatmentVariables: changedVariables });
			this._configurationService.updateExperimentBasedConfiguration(changedVariables);
		}
		this.resolveWaitFor();
	}
}

class SingleFetcherService implements IFetcherService {

	declare readonly _serviceBrand: undefined;
	readonly onDidFetch = VsEvent.None;
	readonly onDidCompleteFetch = VsEvent.None;

	constructor(
		private readonly _fetcher: IFetcher,
	) { }

	fetchWithPagination<T>(baseUrl: string, options: PaginationOptions<T>): Promise<T[]> {
		return this._fetcher.fetchWithPagination(baseUrl, options);
	}

	getUserAgentLibrary(): string {
		return this._fetcher.getUserAgentLibrary();
	}

	fetch(url: string, options: FetchOptions) {
		return this._fetcher.fetch(url, options);
	}
	createWebSocket(url: string, options?: WebSocketConnectOptions): WebSocketConnection {
		return { webSocket: new WebSocket(url, options), responseHeaders: new HeadersImpl({}), responseStatusCode: undefined, responseStatusText: undefined, networkError: undefined };
	}
	disconnectAll(): Promise<unknown> {
		return this._fetcher.disconnectAll();
	}
	makeAbortController(): IAbortController {
		return this._fetcher.makeAbortController();
	}
	isAbortError(e: any): boolean {
		return this._fetcher.isAbortError(e);
	}
	isInternetDisconnectedError(e: any): boolean {
		return this._fetcher.isInternetDisconnectedError(e);
	}
	isFetcherError(e: any): boolean {
		return this._fetcher.isFetcherError(e);
	}
	isNetworkProcessCrashedError(e: any): boolean {
		return this._fetcher.isNetworkProcessCrashedError(e);
	}
	getUserMessageForFetcherError(err: any): string {
		return this._fetcher.getUserMessageForFetcherError(err);
	}
}

class SimpleTelemetryService implements ITelemetryService {
	declare readonly _serviceBrand: undefined;

	constructor(private readonly _telemetrySender: ITelemetrySender) { }

	dispose(): void {
		return;
	}

	sendInternalMSFTTelemetryEvent(eventName: string, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		return;
	}
	sendMSFTTelemetryEvent(eventName: string, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		return;
	}
	sendMSFTTelemetryErrorEvent(eventName: string, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		return;
	}
	sendGHTelemetryEvent(eventName: string, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		this._telemetrySender.sendTelemetryEvent(eventName, eventPropertiesToSimpleObject(properties), measurements);
	}
	sendGHTelemetryErrorEvent(eventName: string, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		return;
	}
	sendGHTelemetryException(maybeError: unknown, origin: string): void {
		return;
	}
	sendTelemetryEvent(eventName: string, destination: TelemetryDestination, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		return;
	}
	sendTelemetryErrorEvent(eventName: string, destination: TelemetryDestination, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		return;
	}
	setSharedProperty(name: string, value: string): void {
		return;
	}
	setAdditionalExpAssignments(expAssignments: string[]): void {
		return;
	}
	postEvent(eventName: string, props: Map<string, string>): void {
		return;
	}

	sendEnhancedGHTelemetryEvent(eventName: string, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		if (this._telemetrySender.sendEnhancedTelemetryEvent) {
			this._telemetrySender.sendEnhancedTelemetryEvent(eventName, eventPropertiesToSimpleObject(properties), measurements);
		}
	}
	sendEnhancedGHTelemetryErrorEvent(eventName: string, properties?: TelemetryEventProperties | undefined, measurements?: TelemetryEventMeasurements | undefined): void {
		return;
	}
}

export type IDocumentContext = DocumentContext;

export type CompletionsContextProviderMatchFunction = (documentSelector: DocumentSelector, documentContext: IDocumentContext) => Promise<number>;

export type ICompletionsStatusChangedEvent = StatusChangedEvent;

export interface ICompletionsStatusHandler {
	didChange(event: ICompletionsStatusChangedEvent): void;
}

export type ICompletionsTextDocumentChangeEvent = Event<TextDocumentChangeEvent>;
export type ICompletionsTextDocumentOpenEvent = Event<TextDocumentOpenEvent>;
export type ICompletionsTextDocumentCloseEvent = Event<TextDocumentCloseEvent>;
export type ICompletionsTextDocumentFocusedEvent = Event<TextDocumentFocusedEvent>;
export type ICompletionsWorkspaceFoldersChangeEvent = Event<WorkspaceFoldersChangeEvent>;
export type ICompletionsTextDocumentIdentifier = TextDocumentIdentifier;
export type ICompletionsNotebookDocument = INotebookDocument;
export type ICompletionsWorkspaceFolder = WorkspaceFolder;

export interface ICompletionsTextDocumentManager {
	onDidChangeTextDocument: ICompletionsTextDocumentChangeEvent;
	onDidOpenTextDocument: ICompletionsTextDocumentOpenEvent;
	onDidCloseTextDocument: ICompletionsTextDocumentCloseEvent;

	onDidFocusTextDocument: ICompletionsTextDocumentFocusedEvent;
	onDidChangeWorkspaceFolders: ICompletionsWorkspaceFoldersChangeEvent;

	/**
	 * Get all open text documents, skipping content exclusions and other validations.
	 */
	getTextDocumentsUnsafe(): ITextDocument[];

	/**
	 * If `TextDocument` represents notebook returns `INotebookDocument` instance, otherwise returns `undefined`
	 */
	findNotebook(doc: TextDocumentIdentifier): ICompletionsNotebookDocument | undefined;

	getWorkspaceFolders(): WorkspaceFolder[];
}

export interface IURLOpener {
	open(url: string): Promise<void>;
}

export type IEditorInfo = EditorInfo;
export type IEditorPluginInfo = EditorPluginInfo;

export interface IEditorSession {
	readonly sessionId: string;
	readonly machineId: string;
	readonly remoteName?: string;
	readonly uiKind?: string;
}

export type IActionItem = ActionItem
export interface INotificationSender {
	showWarningMessage(message: string, ...actions: IActionItem[]): Promise<IActionItem | undefined>;
}

export type IIPCitationDetail = IPCitationDetail;
export type IIPDocumentCitation = IPDocumentCitation;
export interface IInlineCompletionsCitationHandler {
	handleIPCodeCitation(citation: IIPDocumentCitation): Promise<void>;
}


export interface IInlineCompletionsProviderOptions {
	readonly fetcher: IFetcher;
	readonly authService: IAuthenticationService;
	readonly telemetrySender: ITelemetrySender;
	readonly logTarget?: ILogTarget;
	readonly isRunningInTest?: boolean;
	readonly contextProviderMatch: CompletionsContextProviderMatchFunction;
	readonly languageContextProvider?: ILanguageContextProviderService;
	readonly statusHandler: ICompletionsStatusHandler;
	readonly documentManager: ICompletionsTextDocumentManager;
	readonly workspace: ObservableWorkspace;
	readonly urlOpener: IURLOpener;
	readonly editorInfo: IEditorInfo;
	readonly editorPluginInfo: IEditorPluginInfo;
	readonly relatedPluginInfo: IEditorPluginInfo[];
	readonly editorSession: IEditorSession;
	readonly notificationSender: INotificationSender;
	readonly ignoreService?: IIgnoreService;
	readonly waitForTreatmentVariables?: boolean;
	readonly endpointProvider: IEndpointProvider;
	readonly capiClientService?: ICAPIClientService;
	readonly citationHandler?: IInlineCompletionsCitationHandler;
	readonly configOverrides?: Map<ConfigKeyType, unknown>;
}

export type IGetInlineCompletionsOptions = Exclude<Partial<GetGhostTextOptions>, 'promptOnly'> & {
	formattingOptions?: ITextEditorOptions;
};

export interface IInlineCompletionsProvider {
	updateTreatmentVariables(variables: Record<string, boolean | number | string>): void;
	setConfigs(overrides: Map<string, unknown>): Promise<void>;
	getInlineCompletions(textDocument: ITextDocument, position: Position, token?: CancellationToken, options?: IGetInlineCompletionsOptions): Promise<CopilotCompletion[] | undefined>;
	inlineCompletionShown(completionId: string): Promise<void>;
	dispose(): void;
}

export function createInlineCompletionsProvider(options: IInlineCompletionsProviderOptions): IInlineCompletionsProvider {
	const svc = setupCompletionServices(options);
	return svc.createInstance(InlineCompletionsProvider);
}

class InlineCompletionsProvider extends Disposable implements IInlineCompletionsProvider {

	private readonly ghostText: GhostText;

	constructor(
		@IInstantiationService private _insta: IInstantiationService,
		@IExperimentationService private readonly _expService: IExperimentationService,
		@ICompletionsSpeculativeRequestCache private readonly _speculativeRequestCache: ICompletionsSpeculativeRequestCache,
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ICompletionsConfigProvider private readonly _completionsConfigProvider: ICompletionsConfigProvider,
	) {
		super();
		this._register(_insta);
		this.ghostText = this._insta.createInstance(GhostText);
	}

	updateTreatmentVariables(variables: Record<string, boolean | number | string>) {
		if (this._expService instanceof SimpleExperimentationService) {
			this._expService.updateTreatmentVariables(variables);
		}
	}

	async setConfigs(overrides: Map<string, unknown>) {
		for (const [key, value] of overrides) {
			const config = globalConfigRegistry.configs.get(`${CopilotConfigPrefix}.${key}`);
			if (config) {
				await this._configurationService.setConfig(config, value);
			}
		}
		if (this._completionsConfigProvider instanceof InMemoryConfigProvider) {
			this._completionsConfigProvider.setCopilotSettings(Object.fromEntries(overrides));
		}
	}

	async getInlineCompletions(textDocument: ITextDocument, position: Position, token?: CancellationToken, options?: IGetInlineCompletionsOptions): Promise<CopilotCompletion[] | undefined> {
		const telemetryBuilder = new LlmNESTelemetryBuilder(undefined, undefined, undefined, 'ghostText', undefined);
		return await this.ghostText.getInlineCompletions(textDocument, position, token ?? CancellationToken.None, options, new GhostTextLogContext(textDocument.uri, textDocument.version, undefined), telemetryBuilder, this._logService);
	}

	async inlineCompletionShown(completionId: string): Promise<void> {
		return await this._speculativeRequestCache.request(completionId);
	}
}

class UnwrappingTelemetrySender implements ITelemetrySender {
	constructor(private readonly sender: ITelemetrySender) { }

	sendTelemetryEvent(eventName: string, properties?: Record<string, string | undefined>, measurements?: Record<string, number | undefined>): void {
		this.sender.sendTelemetryEvent(this.normalizeEventName(eventName), properties, measurements);
	}

	sendEnhancedTelemetryEvent(eventName: string, properties?: Record<string, string | undefined>, measurements?: Record<string, number | undefined>): void {
		if (this.sender.sendEnhancedTelemetryEvent) {
			this.sender.sendEnhancedTelemetryEvent(this.normalizeEventName(eventName), properties, measurements);
		}
	}

	private normalizeEventName(eventName: string): string {
		const unwrapped = unwrapEventNameFromPrefix(eventName);
		const withoutPrefix = unwrapped.match(/^[^/]+\/(.*)/);
		return withoutPrefix ? withoutPrefix[1] : unwrapped;
	}
}

function setupCompletionServices(options: IInlineCompletionsProviderOptions): IInstantiationService {
	const { fetcher, authService, statusHandler, documentManager, workspace, telemetrySender, urlOpener, editorSession } = options;
	const logTarget = options.logTarget || new ConsoleLog(undefined, InternalLogLevel.Trace);

	const builder = new InstantiationServiceBuilder();
	builder.define(ICompletionsLogTargetService, new class implements ICompletionsLogTargetService {
		declare _serviceBrand: undefined;
		logIt(level: CompletionsLogLevel, category: string, ...extra: unknown[]): void {
			logTarget.logIt(this.toExternalLogLevel(level), category, ...extra);
		}
		private toExternalLogLevel(level: CompletionsLogLevel): LogLevel {
			switch (level) {
				case CompletionsLogLevel.DEBUG: return LogLevel.Debug;
				case CompletionsLogLevel.INFO: return LogLevel.Info;
				case CompletionsLogLevel.WARN: return LogLevel.Warning;
				case CompletionsLogLevel.ERROR: return LogLevel.Error;
				default: return LogLevel.Info;
			}
		}
	});
	builder.define(IAuthenticationService, authService);
	builder.define(ILogService, new SyncDescriptor(LogServiceImpl, [[logTarget || new ConsoleLog(undefined, InternalLogLevel.Trace)]]));
	builder.define(IIgnoreService, options.ignoreService || new NullIgnoreService());
	builder.define(ITelemetryService, new SyncDescriptor(SimpleTelemetryService, [new UnwrappingTelemetrySender(telemetrySender)]));
	builder.define(IConfigurationService, new SyncDescriptor(OverridableConfigurationService, [options.configOverrides ?? new Map()]));
	builder.define(IExperimentationService, new SyncDescriptor(SimpleExperimentationService, [options.waitForTreatmentVariables]));
	builder.define(IEndpointProvider, options.endpointProvider);
	builder.define(ICAPIClientService, options.capiClientService || new SyncDescriptor(CAPIClientImpl));
	builder.define(IFetcherService, new SyncDescriptor(SingleFetcherService, [fetcher]));
	builder.define(ICompletionsTelemetryService, new SyncDescriptor(CompletionsTelemetryServiceBridge));
	builder.define(ICompletionsRuntimeModeService, RuntimeMode.fromEnvironment(options.isRunningInTest ?? false));
	builder.define(ICompletionsCacheService, new CompletionsCache());
	const configProvider = new InMemoryConfigProvider(new DefaultsOnlyConfigProvider());
	if (options.configOverrides) {
		configProvider.setOverrides(options.configOverrides);
	}
	builder.define(ICompletionsConfigProvider, configProvider);
	builder.define(ICompletionsLastGhostText, new LastGhostText());
	builder.define(ICompletionsCurrentGhostText, new CurrentGhostText());
	builder.define(ICompletionsSpeculativeRequestCache, new SpeculativeRequestCache());
	builder.define(ICompletionsNotificationSender, new class implements ICompletionsNotificationSender {
		declare _serviceBrand: undefined;
		async showWarningMessage(message: string, ...actions: IActionItem[]): Promise<IActionItem | undefined> {
			return await options.notificationSender.showWarningMessage(message, ...actions);
		}
	});
	builder.define(ICompletionsEditorAndPluginInfo, new class implements ICompletionsEditorAndPluginInfo {
		declare _serviceBrand: undefined;
		getEditorInfo(): EditorInfo {
			return options.editorInfo;
		}
		getEditorPluginInfo(): EditorPluginInfo {
			return options.editorPluginInfo;
		}
		getRelatedPluginInfo(): EditorPluginInfo[] {
			return options.relatedPluginInfo;
		}
	});
	builder.define(ICompletionsExtensionStatus, new CopilotExtensionStatus());
	builder.define(ICompletionsFeaturesService, new SyncDescriptor(Features));
	builder.define(ICompletionsObservableWorkspace, new class implements ICompletionsObservableWorkspace {
		declare _serviceBrand: undefined;
		get openDocuments(): IObservableWithChange<readonly IObservableDocument[], { added: readonly IObservableDocument[]; removed: readonly IObservableDocument[] }> {
			return workspace.openDocuments;
		}
		getWorkspaceRoot(documentId: DocumentId): URI | undefined {
			return workspace.getWorkspaceRoot(documentId);
		}
		getFirstOpenDocument(): IObservableDocument | undefined {
			return workspace.getFirstOpenDocument();
		}
		getDocument(documentId: DocumentId): IObservableDocument | undefined {
			return workspace.getDocument(documentId);
		}
	});
	builder.define(ICompletionsStatusReporter, new class extends StatusReporter {
		didChange(event: StatusChangedEvent): void {
			statusHandler.didChange(event);
		}
	});
	builder.define(ICompletionsCopilotTokenManager, new SyncDescriptor(CopilotTokenManagerImpl, [false]));
	builder.define(ICompletionsTextDocumentManagerService, new SyncDescriptor(class extends TextDocumentManager {
		onDidChangeTextDocument = documentManager.onDidChangeTextDocument;
		onDidOpenTextDocument = documentManager.onDidOpenTextDocument;
		onDidCloseTextDocument = documentManager.onDidCloseTextDocument;
		onDidFocusTextDocument = documentManager.onDidFocusTextDocument;
		onDidChangeWorkspaceFolders = documentManager.onDidChangeWorkspaceFolders;
		getTextDocumentsUnsafe(): ITextDocument[] {
			return documentManager.getTextDocumentsUnsafe();
		}
		findNotebook(doc: TextDocumentIdentifier): INotebookDocument | undefined {
			return documentManager.findNotebook(doc);
		}
		getWorkspaceFolders(): WorkspaceFolder[] {
			return documentManager.getWorkspaceFolders();
		}
	}));
	builder.define(ICompletionsFileReaderService, new SyncDescriptor(FileReader));
	builder.define(ICompletionsBlockModeConfig, new SyncDescriptor(ConfigBlockModeConfig));
	builder.define(ICompletionsTelemetryUserConfigService, new SyncDescriptor(TelemetryUserConfig));
	builder.define(ICompletionsRecentEditsProviderService, new SyncDescriptor(FullRecentEditsProvider, [undefined]));
	builder.define(ICompletionsNotifierService, new SyncDescriptor(CompletionNotifier));
	builder.define(ICompletionsOpenAIFetcherService, new SyncDescriptor(LiveOpenAIFetcher));
	builder.define(ICompletionsFetchService, new SyncDescriptor(CompletionsFetchService));
	builder.define(ICompletionsModelManagerService, new SyncDescriptor(AvailableModelsManager, [true]));
	builder.define(ICompletionsAsyncManagerService, new SyncDescriptor(AsyncCompletionManager));
	builder.define(ICompletionsContextProviderBridgeService, new SyncDescriptor(ContextProviderBridge));
	builder.define(ICompletionsUserErrorNotifierService, new SyncDescriptor(UserErrorNotifier));
	builder.define(ICompletionsRelatedFilesProviderService, new SyncDescriptor(CompositeRelatedFilesProvider));
	builder.define(ICompletionsFileSystemService, new LocalFileSystem());
	builder.define(ICompletionsContextProviderRegistryService, new SyncDescriptor(CachedContextProviderRegistry, [CoreContextProviderRegistry, (_: IInstantiationService, sel: DocumentSelector, docCtx: DocumentContext) => options.contextProviderMatch(sel, docCtx)]));
	builder.define(ICompletionsPromiseQueueService, new PromiseQueue());
	builder.define(ICompletionsCitationManager, new class implements ICompletionsCitationManager {
		declare _serviceBrand: undefined;
		register(): IDisposable { return Disposable.None; }
		async handleIPCodeCitation(citation: IPDocumentCitation): Promise<void> {
			if (options.citationHandler) {
				return await options.citationHandler.handleIPCodeCitation(citation);
			}
		}
	});
	builder.define(ICompletionsContextProviderService, new ContextProviderStatistics());
	builder.define(ICompletionsPromptFactoryService, new SyncDescriptor(CompletionsPromptFactory));
	builder.define(ICompletionsFetcherService, new class implements ICompletionsFetcherService {
		declare _serviceBrand: undefined;
		getImplementation(): ICompletionsFetcherService | Promise<ICompletionsFetcherService> {
			return this;
		}
		fetch(url: string, options: FetchOptions) {
			return fetcher.fetch(url, options);
		}
		disconnectAll(): Promise<unknown> {
			return fetcher.disconnectAll();
		}
	});
	builder.define(ICompletionsDefaultContextProviders, new DefaultContextProvidersContainer());
	builder.define(IEnvService, new class implements IEnvService {
		declare _serviceBrand: undefined;
		readonly language = undefined;
		readonly sessionId = editorSession.sessionId;
		readonly machineId = editorSession.machineId;
		readonly devDeviceId = editorSession.machineId;
		readonly vscodeVersion = options.editorInfo.version;
		readonly isActive = true;
		readonly onDidChangeWindowState: vscode.Event<vscode.WindowState> = VsEvent.None;
		readonly remoteName = editorSession.remoteName;
		readonly uiKind = editorSession.uiKind === 'web' ? 'web' : 'desktop';
		readonly OS = process.platform === 'darwin' ? OperatingSystem.Macintosh : process.platform === 'win32' ? OperatingSystem.Windows : OperatingSystem.Linux;
		readonly uriScheme = '';
		readonly extensionId = options.editorPluginInfo.name;
		readonly appRoot = options.editorInfo.root ?? '';
		readonly shell = '';
		isProduction(): boolean { return BuildInfo.isProduction(); }
		isPreRelease(): boolean { return BuildInfo.isPreRelease(); }
		isSimulation(): boolean { return options.isRunningInTest === true; }
		getBuildType(): 'prod' | 'dev' {
			const t = BuildInfo.getBuildType();
			return t === BuildType.DEV ? 'dev' : 'prod';
		}
		getVersion(): string { return BuildInfo.getVersion(); }
		getBuild(): string { return BuildInfo.getBuild(); }
		getName(): string { return options.editorInfo.name; }
		getEditorInfo(): NameAndVersion { return new NameAndVersion(options.editorInfo.name, options.editorInfo.version); }
		getEditorPluginInfo(): NameAndVersion { return new NameAndVersion(options.editorPluginInfo.name, options.editorPluginInfo.version); }
		async openExternal(target: URI): Promise<boolean> {
			await urlOpener.open(target.toString());
			return true;
		}
	});
	builder.define(ILanguageContextProviderService, options.languageContextProvider ?? new NullLanguageContextProviderService());
	builder.define(ILanguageDiagnosticsService, new SyncDescriptor(TestLanguageDiagnosticsService));
	builder.define(IRequestLogger, new SyncDescriptor(NullRequestLogger));

	return builder.seal();
}
