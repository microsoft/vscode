/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import type { CancellationToken, OpenDialogOptions, QuickPickItem, QuickPickOptions, Selection, TextEditor, Uri } from 'vscode';
import { IInstantiationServiceBuilder, ServiceIdentifier } from '../../../util/common/services';
import { DisposableStore, IDisposable } from '../../../util/vs/base/common/lifecycle';
import { SyncDescriptor } from '../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { InstantiationService } from '../../../util/vs/platform/instantiation/common/instantiationService';
import { ServiceCollection } from '../../../util/vs/platform/instantiation/common/serviceCollection';
import { IAuthenticationService } from '../../authentication/common/authentication';
import { IAuthenticationChatUpgradeService } from '../../authentication/common/authenticationUpgrade';
import { AuthenticationChatUpgradeService } from '../../authentication/common/authenticationUpgradeService';
import { ICopilotTokenManager } from '../../authentication/common/copilotTokenManager';
import { CopilotTokenStore, ICopilotTokenStore } from '../../authentication/common/copilotTokenStore';
import { StaticGitHubAuthenticationService } from '../../authentication/common/staticGitHubAuthenticationService';
import { createStaticGitHubTokenProvider } from '../../authentication/node/copilotTokenManager';
import { SimulationTestCopilotTokenManager } from '../../authentication/test/node/simulationTestCopilotTokenManager';
import { IChatAgentService } from '../../chat/common/chatAgents';
import { IChatQuotaService } from '../../chat/common/chatQuotaService';
import { ChatQuotaService } from '../../chat/common/chatQuotaServiceImpl';
import { IChatSessionService } from '../../chat/common/chatSessionService';
import { IConversationOptions } from '../../chat/common/conversationOptions';
import { IInteractionService, InteractionService } from '../../chat/common/interactionService';
import { TestChatSessionService } from '../../chat/test/common/testChatSessionService';
import { INaiveChunkingService, NaiveChunkingService } from '../../chunking/node/naiveChunkerService';
import { MockRunCommandExecutionService } from '../../commands/common/mockRunCommandExecutionService';
import { IRunCommandExecutionService } from '../../commands/common/runCommandExecutionService';
import { IConfigurationService } from '../../configuration/common/configurationService';
import { DefaultsOnlyConfigurationService } from '../../configuration/common/defaultsOnlyConfigurationService';
import { InMemoryConfigurationService } from '../../configuration/test/common/inMemoryConfigurationService';
import { CustomInstructionsService, ICustomInstructionsService } from '../../customInstructions/common/customInstructionsService';
import { IDialogService } from '../../dialog/common/dialogService';
import { IDiffService } from '../../diff/common/diffService';
import { DiffServiceImpl } from '../../diff/node/diffServiceImpl';
import { IEditSurvivalTrackerService, NullEditSurvivalTrackerService } from '../../editSurvivalTracking/common/editSurvivalTrackerService';
import { ICAPIClientService } from '../../endpoint/common/capiClient';
import { IDomainService } from '../../endpoint/common/domainService';
import { CAPIClientImpl } from '../../endpoint/node/capiClientImpl';
import { DomainService } from '../../endpoint/node/domainServiceImpl';
import { IEnvService, INativeEnvService } from '../../env/common/envService';
import { NullEnvService, NullNativeEnvService } from '../../env/common/nullEnvService';
import { IVSCodeExtensionContext } from '../../extContext/common/extensionContext';
import { IExtensionsService } from '../../extensions/common/extensionsService';
import { IFileSystemService } from '../../filesystem/common/fileSystemService';
import { MockFileSystemService } from '../../filesystem/node/test/mockFileSystemService';
import { IGitService } from '../../git/common/gitService';
import { NullGitExtensionService } from '../../git/common/nullGitExtensionService';
import { GithubApiFetcherService, IGithubApiFetcherService } from '../../github/common/githubApiFetcherService';
import { IGithubRepositoryService, IOctoKitService } from '../../github/common/githubService';
import { OctoKitService } from '../../github/common/octoKitServiceImpl';
import { GithubRepositoryService } from '../../github/node/githubRepositoryService';
import { IIgnoreService, NullIgnoreService } from '../../ignore/common/ignoreService';
import { IImageService, nullImageService } from '../../image/common/imageService';
import { IInteractiveSessionService } from '../../interactive/common/interactiveSessionService';
import { ILanguageContextProviderService } from '../../languageContextProvider/common/languageContextProviderService';
import { NullLanguageContextProviderService } from '../../languageContextProvider/common/nullLanguageContextProviderService';
import { ILanguageDiagnosticsService } from '../../languages/common/languageDiagnosticsService';
import { ILanguageFeaturesService, NoopLanguageFeaturesService } from '../../languages/common/languageFeaturesService';
import { TestLanguageDiagnosticsService } from '../../languages/common/testLanguageDiagnosticsService';
import { ILanguageContextService, NullLanguageContextService } from '../../languageServer/common/languageContextService';
import { ConsoleLog, ILogService, LogServiceImpl } from '../../log/common/logService';
import { IFetcherService } from '../../networking/common/fetcherService';
import { HeaderContributors, IHeaderContributors } from '../../networking/common/networking';
import { NodeFetcherService } from '../../networking/node/test/nodeFetcherService';
import { INotificationService, NullNotificationService } from '../../notification/common/notificationService';
import { IUrlOpener, NullUrlOpener } from '../../open/common/opener';
import { NoopOTelService } from '../../otel/common/noopOtelService';
import { resolveOTelConfig } from '../../otel/common/otelConfig';
import { IOTelService } from '../../otel/common/otelService';
import { IParserService } from '../../parser/node/parserService';
import { ParserServiceImpl } from '../../parser/node/parserServiceImpl';
import { IPromptPathRepresentationService, TestPromptPathRepresentationService } from '../../prompts/common/promptPathRepresentationService';
import { BasicCodeSearchAuthenticationService, ICodeSearchAuthenticationService } from '../../remoteCodeSearch/node/codeSearchRepoAuth';
import { NullRequestLogger } from '../../requestLogger/node/nullRequestLogger';
import { IRequestLogger } from '../../requestLogger/common/requestLogger';
import { IScopeSelector } from '../../scopeSelection/common/scopeSelection';
import { ISearchService } from '../../search/common/searchService';
import { ISimulationTestContext, NulSimulationTestContext } from '../../simulationTestContext/common/simulationTestContext';
import { ISnippyService, NullSnippyService } from '../../snippy/common/snippyService';
import { IChatWebSocketManager, NullChatWebSocketManager } from '../../networking/node/chatWebSocketManager';
import { ISurveyService, NullSurveyService } from '../../survey/common/surveyService';
import { ITabsAndEditorsService } from '../../tabs/common/tabsAndEditorsService';
import { ITasksService } from '../../tasks/common/tasksService';
import { TestTasksService } from '../../tasks/common/testTasksService';
import { IExperimentationService, NullExperimentationService } from '../../telemetry/common/nullExperimentationService';
import { NullTelemetryService } from '../../telemetry/common/nullTelemetryService';
import { ITelemetryService, ITelemetryUserConfig, TelemetryUserConfigImpl } from '../../telemetry/common/telemetry';
import { ITerminalService, NullTerminalService } from '../../terminal/common/terminalService';
import { ITokenizerProvider, TokenizerProvider } from '../../tokenizer/node/tokenizer';
import { IWorkbenchService } from '../../workbench/common/workbenchService';
import { IWorkspaceService } from '../../workspace/common/workspaceService';
import { IWorkspaceChunkSearchService, NullWorkspaceChunkSearchService } from '../../workspaceChunkSearch/node/workspaceChunkSearchService';
import { TestExtensionsService } from '../common/testExtensionsService';
import { MockExtensionContext } from './extensionContext';
import { SnapshotSearchService, TestingTabsAndEditorsService } from './simulationWorkspaceServices';
import { TestChatAgentService } from './testChatAgentService';
import { TestWorkbenchService } from './testWorkbenchService';
import { TestWorkspaceService } from './testWorkspaceService';

/**
 * Collects descriptors for services to use in testing.
 */
export class TestingServiceCollection implements IDisposable, IInstantiationServiceBuilder {

	private readonly _services = new Map<ServiceIdentifier<any>, any>();
	private _accessor: InstantiationService | null = null;

	clone(): TestingServiceCollection {
		const cloned = new TestingServiceCollection();
		for (const [id, descOrInstance] of this._services) {
			cloned.define(id, descOrInstance);
		}
		return cloned;
	}

	set<T, TImpl extends T>(id: ServiceIdentifier<T>, instance: TImpl): TImpl {
		this.define(id, instance);
		return instance;
	}

	define<T>(id: ServiceIdentifier<T>, desc: SyncDescriptor<T>): void;
	define<T>(id: ServiceIdentifier<T>, desc: T): void;
	define<T>(id: ServiceIdentifier<T>, descOrInstance: SyncDescriptor<T> | T): void {
		if (this._accessor) {
			throw new Error(`Accessor already created`);
		}
		this._services.set(id, descOrInstance);
	}

	createTestingAccessor(): ITestingServicesAccessor {
		if (this._accessor) {
			throw new Error(`Accessor already created`);
		}
		return new TestingServicesAccessor(this.seal());
	}

	seal(): IInstantiationService {
		return this._accessor ??= new InstantiationService(
			new ServiceCollection(...this._services),
			true
		);
	}

	dispose(): void {
		this._accessor?.dispose();
	}
}

/**
 * OK to be used in tests to get services
 */
export interface ITestingServicesAccessor {
	get<T>(id: ServiceIdentifier<T>): T;
	getIfExists<T>(id: ServiceIdentifier<T>): T | undefined;
	dispose(): void;
}


export class TestingServicesAccessor implements ITestingServicesAccessor {

	constructor(
		private readonly _instaService: IInstantiationService
	) { }

	dispose(): void {
		this._instaService.dispose();
	}

	get<T>(id: ServiceIdentifier<T>): T {
		return this._instaService.invokeFunction(accessor => accessor.get(id));
	}

	getIfExists<T>(id: ServiceIdentifier<T>): T | undefined {
		try {
			return this._instaService.invokeFunction(accessor => accessor.get(id));
		} catch {
			return undefined;
		}
	}
}

/**
 * Baseline for an accessor. Tests should prefer the specific variants outlined below.
 *
 * @see createPlatformServices
 * @see createExtensionTestingServices
 */
export function _createBaselineServices(): TestingServiceCollection {
	const testingServiceCollection = new TestingServiceCollection();
	testingServiceCollection.define(IChatQuotaService, new SyncDescriptor(ChatQuotaService));
	testingServiceCollection.define(ICopilotTokenStore, new SyncDescriptor(CopilotTokenStore));
	testingServiceCollection.define(IExperimentationService, new SyncDescriptor(NullExperimentationService));
	testingServiceCollection.define(IDiffService, new SyncDescriptor(DiffServiceImpl));
	testingServiceCollection.define(ISimulationTestContext, new SyncDescriptor(NulSimulationTestContext));
	testingServiceCollection.define(ILogService, new SyncDescriptor(LogServiceImpl, [[new ConsoleLog()]]));
	testingServiceCollection.define(IParserService, new SyncDescriptor(ParserServiceImpl, [/*useWorker*/ false]));
	testingServiceCollection.define(IFetcherService, new SyncDescriptor(NodeFetcherService));
	testingServiceCollection.define(ITelemetryUserConfig, new SyncDescriptor(TelemetryUserConfigImpl, ['tid=test', true]));
	// Notifications from the monolith when fetching a token can trigger behaviour that require these objects.
	testingServiceCollection.define(IUrlOpener, new SyncDescriptor(NullUrlOpener));
	testingServiceCollection.define(ICopilotTokenManager, new SyncDescriptor(SimulationTestCopilotTokenManager));
	testingServiceCollection.define(IAuthenticationService, new SyncDescriptor(StaticGitHubAuthenticationService, [createStaticGitHubTokenProvider()]));
	testingServiceCollection.define(IHeaderContributors, new SyncDescriptor(HeaderContributors));

	testingServiceCollection.define(IConversationOptions, new SyncDescriptor(class implements IConversationOptions {
		_serviceBrand: undefined;
		maxResponseTokens: undefined;
		temperature = 0.1;
		topP = 1;
		rejectionMessage = 'Sorry, but I can only assist with programming related questions.';
	}));
	testingServiceCollection.define(IChatAgentService, new SyncDescriptor(TestChatAgentService));
	testingServiceCollection.define(IFileSystemService, new SyncDescriptor(MockFileSystemService));
	testingServiceCollection.define(IGithubRepositoryService, new SyncDescriptor(GithubRepositoryService));
	testingServiceCollection.define(IGitService, new SyncDescriptor(NullGitExtensionService));
	testingServiceCollection.define(IAuthenticationChatUpgradeService, new SyncDescriptor(AuthenticationChatUpgradeService));
	testingServiceCollection.define(IOctoKitService, new SyncDescriptor(OctoKitService));
	testingServiceCollection.define(IInteractionService, new SyncDescriptor(InteractionService));
	testingServiceCollection.define(IWorkbenchService, new SyncDescriptor(TestWorkbenchService));
	testingServiceCollection.define(ICustomInstructionsService, new SyncDescriptor(CustomInstructionsService));
	testingServiceCollection.define(ISurveyService, new SyncDescriptor(NullSurveyService));
	testingServiceCollection.define(IEditSurvivalTrackerService, new SyncDescriptor(NullEditSurvivalTrackerService));
	testingServiceCollection.define(IWorkspaceChunkSearchService, new SyncDescriptor(NullWorkspaceChunkSearchService));
	testingServiceCollection.define(ICodeSearchAuthenticationService, new SyncDescriptor(BasicCodeSearchAuthenticationService));
	testingServiceCollection.define(IOTelService, new SyncDescriptor(NoopOTelService, [resolveOTelConfig({ env: {}, extensionVersion: '0.0.0', sessionId: 'test' })]));
	return testingServiceCollection;
}

/**
 * @returns an accessor suitable for simulation and unit tests.
 */
export function createPlatformServices(disposables: Pick<DisposableStore, 'add'> = new DisposableStore()): TestingServiceCollection {
	const testingServiceCollection = _createBaselineServices();
	testingServiceCollection.define(IConfigurationService, new SyncDescriptor(InMemoryConfigurationService, [disposables.add(new DefaultsOnlyConfigurationService())]));
	testingServiceCollection.define(IEnvService, new SyncDescriptor(NullEnvService));
	testingServiceCollection.define(INativeEnvService, new SyncDescriptor(NullNativeEnvService));
	testingServiceCollection.define(ITelemetryService, new SyncDescriptor(NullTelemetryService));
	testingServiceCollection.define(IEditSurvivalTrackerService, new SyncDescriptor(NullEditSurvivalTrackerService));
	testingServiceCollection.define(IExperimentationService, new SyncDescriptor(NullExperimentationService));
	testingServiceCollection.define(IWorkspaceService, new SyncDescriptor(TestWorkspaceService));
	testingServiceCollection.define(IExtensionsService, new SyncDescriptor(TestExtensionsService));
	testingServiceCollection.define(ISearchService, new SyncDescriptor(SnapshotSearchService));
	testingServiceCollection.define(ITokenizerProvider, new SyncDescriptor(TokenizerProvider, [false]));
	testingServiceCollection.define(IDomainService, new SyncDescriptor(DomainService));
	testingServiceCollection.define(ICAPIClientService, new SyncDescriptor(CAPIClientImpl));
	testingServiceCollection.define(INotificationService, new SyncDescriptor(NullNotificationService));
	testingServiceCollection.define(IGithubApiFetcherService, new SyncDescriptor(GithubApiFetcherService));
	testingServiceCollection.define(IVSCodeExtensionContext, new SyncDescriptor(MockExtensionContext));
	testingServiceCollection.define(IIgnoreService, new SyncDescriptor(NullIgnoreService));
	testingServiceCollection.define(ITerminalService, new SyncDescriptor(NullTerminalService));
	testingServiceCollection.define(IDialogService, new SyncDescriptor(class implements IDialogService {
		_serviceBrand: undefined;
		showQuickPick<T extends QuickPickItem>(items: readonly T[] | Thenable<readonly T[]>, options: QuickPickOptions, token?: CancellationToken): Thenable<T | undefined> {
			throw new Error('Method not implemented.');
		}
		showOpenDialog(options: OpenDialogOptions): Thenable<Uri[] | undefined> {
			throw new Error('Method not implemented.');
		}
	}));
	testingServiceCollection.define(ILanguageFeaturesService, new SyncDescriptor(NoopLanguageFeaturesService));
	testingServiceCollection.define(IRunCommandExecutionService, new SyncDescriptor(MockRunCommandExecutionService));
	testingServiceCollection.define(INaiveChunkingService, new SyncDescriptor(NaiveChunkingService));
	testingServiceCollection.define(IImageService, nullImageService);
	testingServiceCollection.define(ILanguageContextService, NullLanguageContextService);
	testingServiceCollection.define(ILanguageContextProviderService, new SyncDescriptor(NullLanguageContextProviderService));
	testingServiceCollection.define(ILanguageDiagnosticsService, new SyncDescriptor(TestLanguageDiagnosticsService));
	testingServiceCollection.define(IPromptPathRepresentationService, new SyncDescriptor(TestPromptPathRepresentationService));
	testingServiceCollection.define(IRequestLogger, new SyncDescriptor(NullRequestLogger));
	testingServiceCollection.define(IChatSessionService, new SyncDescriptor(TestChatSessionService));

	testingServiceCollection.define(IScopeSelector, new SyncDescriptor(class implements IScopeSelector {
		_serviceBrand: undefined;
		async selectEnclosingScope(editor: TextEditor, options?: { reason?: string; includeBlocks?: boolean }): Promise<Selection | undefined> {
			return undefined;
		}
	}));
	testingServiceCollection.define(ISnippyService, new SyncDescriptor(NullSnippyService));
	testingServiceCollection.define(IChatWebSocketManager, new SyncDescriptor(NullChatWebSocketManager));
	testingServiceCollection.define(IInteractiveSessionService, new SyncDescriptor(class implements IInteractiveSessionService {
		_serviceBrand: undefined;
		async transferActiveChat(workspaceUri: Uri): Promise<void> {
			throw new Error('Method not implemented.');
		}
	}));


	testingServiceCollection.define(ITabsAndEditorsService, new TestingTabsAndEditorsService({
		getActiveTextEditor: () => undefined,
		getVisibleTextEditors: () => [],
		getActiveNotebookEditor: () => undefined
	}));

	testingServiceCollection.define(ITasksService, new SyncDescriptor(TestTasksService));

	return testingServiceCollection;
}
