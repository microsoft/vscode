/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import path from 'path';
import { ApiEmbeddingsIndex, IApiEmbeddingsIndex } from '../../src/extension/context/node/resolvers/extensionApi';
import { ConversationStore, IConversationStore } from '../../src/extension/conversationStore/node/conversationStore';
import { IIntentService, IntentService } from '../../src/extension/intents/node/intentService';
import { ITestGenInfoStorage, TestGenInfoStorage } from '../../src/extension/intents/node/testIntent/testInfoStorage';
import { ILinkifyService, LinkifyService } from '../../src/extension/linkify/common/linkifyService';
import { ChatMLFetcherImpl } from '../../src/extension/prompt/node/chatMLFetcher';
import { createExtensionUnitTestingServices, ISimulationModelConfig } from '../../src/extension/test/node/services';
import { AIEvaluationService, IAIEvaluationService } from '../../src/extension/testing/node/aiEvaluationService';
import { IChatMLFetcher } from '../../src/platform/chat/common/chatMLFetcher';
import { ChatFetchResponseType, ChatResponses } from '../../src/platform/chat/common/commonTypes';
import { IChunkingEndpointClient } from '../../src/platform/chunking/common/chunkingEndpointClient';
import { ChunkingEndpointClientImpl } from '../../src/platform/chunking/common/chunkingEndpointClientImpl';
import { INaiveChunkingService, NaiveChunkingService } from '../../src/platform/chunking/node/naiveChunkerService';
import { CHAT_MODEL, Config, ConfigKey, ExperimentBasedConfig, ExperimentBasedConfigType, globalConfigRegistry, IConfigurationService } from '../../src/platform/configuration/common/configurationService';
import { DefaultsOnlyConfigurationService } from '../../src/platform/configuration/common/defaultsOnlyConfigurationService';
import { InMemoryConfigurationService } from '../../src/platform/configuration/test/common/inMemoryConfigurationService';
import { IEmbeddingsComputer } from '../../src/platform/embeddings/common/embeddingsComputer';
import { RemoteEmbeddingsComputer } from '../../src/platform/embeddings/common/remoteEmbeddingsComputer';
import { ICombinedEmbeddingIndex, VSCodeCombinedIndexImpl } from '../../src/platform/embeddings/common/vscodeIndex';
import { IVSCodeExtensionContext } from '../../src/platform/extContext/common/extensionContext';
import { IGitExtensionService } from '../../src/platform/git/common/gitExtensionService';
import { NullGitExtensionService } from '../../src/platform/git/common/nullGitExtensionService';
import { ICompletionsFetchService } from '../../src/platform/nesFetch/common/completionsFetchService';
import { CompletionsFetchService } from '../../src/platform/nesFetch/node/completionsFetchServiceImpl';
import { IProjectTemplatesIndex, ProjectTemplatesIndex } from '../../src/platform/projectTemplatesIndex/common/projectTemplatesIndex';
import { IReleaseNotesService } from '../../src/platform/releaseNotes/common/releaseNotesService';
import { ReleaseNotesService } from '../../src/platform/releaseNotes/vscode/releaseNotesServiceImpl';
import { IDocsSearchClient } from '../../src/platform/remoteSearch/common/codeOrDocsSearchClient';
import { DocsSearchClient } from '../../src/platform/remoteSearch/node/codeOrDocsSearchClientImpl';
import { IReviewService } from '../../src/platform/review/common/reviewService';
import { constructGlobalStateMemento, MockExtensionContext } from '../../src/platform/test/node/extensionContext';
import { TestingServiceCollection } from '../../src/platform/test/node/services';
import { SimulationReviewService } from '../../src/platform/test/node/simulationWorkspaceServices';
import { NullTestProvider } from '../../src/platform/testing/common/nullTestProvider';
import { ITestProvider } from '../../src/platform/testing/common/testProvider';
import { ITokenizerProvider, TokenizerProvider } from '../../src/platform/tokenizer/node/tokenizer';
import { IGithubAvailableEmbeddingTypesService, MockGithubAvailableEmbeddingTypesService } from '../../src/platform/workspaceChunkSearch/common/githubAvailableEmbeddingTypes';
import { IWorkspaceChunkSearchService, WorkspaceChunkSearchService } from '../../src/platform/workspaceChunkSearch/node/workspaceChunkSearchService';
import { IWorkspaceFileIndex, WorkspaceFileIndex } from '../../src/platform/workspaceChunkSearch/node/workspaceFileIndex';
import { createServiceIdentifier } from '../../src/util/common/services';
import { SyncDescriptor } from '../../src/util/vs/platform/instantiation/common/descriptors';
import { IJSONOutputPrinter, NoopJSONOutputPrinter } from '../jsonOutputPrinter';
import { SIMULATION_FOLDER_NAME } from '../simulation/shared/sharedTypes';
import { ITestInformation, TestInformation } from '../simulation/testInformation';
import { CachedTestInfo, CachingChatMLFetcher, IChatMLCache } from './cachingChatMLFetcher';
import { CachingChunkingEndpointClient, ChunkingEndpointClientSQLiteCache } from './cachingChunksEndpointClient';
import { CachingCodeOrDocSearchClient, CodeOrDocSearchSQLiteCache } from './cachingCodeSearchClient';
import { CachingCompletionsFetchService } from './cachingCompletionsFetchService';
import { CachingEmbeddingsComputer } from './cachingEmbeddingsFetcher';
import { CachingResourceFetcher } from './cachingResourceFetcher';
import { ICompletionsCache } from './completionsCache';
import { EmbeddingsSQLiteCache } from './embeddingsCache';
import { TestingCacheSalts } from './salts';
import { ISimulationEndpointHealth, SimulationEndpointHealthImpl } from './simulationEndpointHealth';
import { SimulationCodeSearchChunkSearchService } from './simuliationWorkspaceChunkSearch';
import { FetchRequestCollector, SpyingChatMLFetcher } from './spyingChatMLFetcher';
import { SimulationTest } from './stest';
import { ChatModelThrottlingTaskLaunchers, ThrottlingLimits as SimulationThrottlingLimits, ThrottlingChatMLFetcher } from './throttlingChatMLFetcher';
import { ThrottlingCodeOrDocsSearchClient } from './throttlingCodeOrDocsSearchClient';

const dotSimulationPath = path.join(__dirname, `../${SIMULATION_FOLDER_NAME}`);

export enum CacheScope {
	Embeddings = 'embeddings',
	TSC = 'tsc',
	Roslyn = 'roslyn',
	ESLint = 'eslint',
	Pylint = 'pylint',
	Ruff = 'ruff',
	Pyright = 'pyright',
	Python = 'python',
	Notebook = 'notebook',
	DocSearch = 'docs-search',
	CodeSearch = 'code-search',
	CPP = 'cpp',
	Chunks = 'chunks-endpoint',
}

export const ICachingResourceFetcher = createServiceIdentifier<ICachingResourceFetcher>('ICachingResourceFetcher');

export interface ICachingResourceFetcher {
	invokeWithCache<I, R>(cacheScope: CacheScope, input: I, cacheSalt: string, inputCacheKey: string, fn: (input: I) => Promise<R>): Promise<R>;
}

export enum CacheMode {
	Disable = 'disable', // never use the cache, don't update the cache
	Require = 'require', // always use the cache, and fail if it's not available
	Default = 'default', // use cache of available, but don't require it
}

export class NoFetchChatMLFetcher extends ChatMLFetcherImpl {
	public override fetchMany(...args: any[]): Promise<ChatResponses> {
		return Promise.resolve({
			type: ChatFetchResponseType.Success,
			usage: { completion_tokens: 0, prompt_tokens: 0, total_tokens: 0, prompt_tokens_details: { cached_tokens: 0 } },
			value: ['--no-fetch option is provided to simulations -- using a fixed ChatML response'],
			requestId: 'no-fetch-request-id',
			serverRequestId: undefined,
			resolvedModel: ''
		});
	}
}

export function createSimulationChatModelThrottlingTaskLaunchers(boost: boolean): ChatModelThrottlingTaskLaunchers {

	const throttlingLimits: SimulationThrottlingLimits = {
		[CHAT_MODEL.GPT41]: { limit: 3, type: 'RPS' },
		[CHAT_MODEL.GPT4OPROXY]: { limit: 1, type: 'RPS' },
		[CHAT_MODEL.EXPERIMENTAL]: { limit: 3, type: 'RPS' },
		[CHAT_MODEL.GPT4OMINI]: { limit: 18, type: 'RPS' },
		[CHAT_MODEL.CUSTOM_NES]: { limit: 5, type: 'RPS' },
		[CHAT_MODEL.O3MINI]: { limit: 1, type: 'RPS' },
		[CHAT_MODEL.CLAUDE_SONNET]: { limit: 3, type: 'RPS' },
		[CHAT_MODEL.CLAUDE_37_SONNET]: { limit: 4, type: 'RPS' },
		[CHAT_MODEL.O1]: { limit: 4, type: 'RPS' },
		[CHAT_MODEL.O1MINI]: { limit: 5, type: 'RPM' },
		[CHAT_MODEL.GEMINI_FLASH]: { limit: 20, type: 'RPM' },
		[CHAT_MODEL.DEEPSEEK_CHAT]: { limit: 1, type: 'RPS' },
		[CHAT_MODEL.XTAB_4O_MINI_FINETUNED]: { limit: 5, type: 'RPS' }
	};

	if (boost) {
		throttlingLimits[CHAT_MODEL.CLAUDE_SONNET] = { limit: 20, type: 'RPS' };
		throttlingLimits[CHAT_MODEL.CLAUDE_37_SONNET] = { limit: 20, type: 'RPS' };
	}

	return new ChatModelThrottlingTaskLaunchers(throttlingLimits);
}

export interface SimulationServicesOptions {
	chatModelThrottlingTaskLaunchers: ChatModelThrottlingTaskLaunchers;
	isNoFetchModeEnabled: boolean;
	languageModelCacheMode: CacheMode;
	createChatMLCache?: (info: CurrentTestRunInfo) => IChatMLCache;
	createNesFetchCache?: (info: CurrentTestRunInfo) => ICompletionsCache;
	resourcesCacheMode: CacheMode;
	disabledTools: Set<string>;
	swebenchPrompt: boolean;
	summarizeHistory: boolean;
	useExperimentalCodeSearchService: boolean;
	configs: Record<string, unknown> | undefined;
}

export interface CurrentTestRunInfo {
	/**
	 * Current test being run.
	 */
	test: SimulationTest;

	/**
	 * Each test is run `n` times. This specifies which run this is [0..n-1]
	 */
	testRunNumber: number;

	/**
	 * For each test run, we capture fetch requests made.
	 */
	fetchRequestCollector: FetchRequestCollector;

	/**
	 * Whether we're working in a real workspace and extension host.
	 */
	isInRealExtensionHost: boolean;
}

/**
 * Creates an accessor suitable for running tests.
 * The `IChatMLFetcher` will use caching and the chat endpoint is configurable via the `chatModel` parameter.
 * The `IEmbeddingsComputer` will use caching and the embeddings endpoint is configurable via the `embeddingsModel` parameter.
 */
export async function createSimulationAccessor(
	modelConfig: ISimulationModelConfig,
	opts: SimulationServicesOptions,
	currentTestRunInfo: CurrentTestRunInfo
): Promise<TestingServiceCollection> {
	const testingServiceCollection = createExtensionUnitTestingServices(undefined, currentTestRunInfo, modelConfig);
	if (currentTestRunInfo.isInRealExtensionHost) {
		const { addExtensionHostSimulationServices } = await import('./extHostContext/simulationExtHostContext');
		await addExtensionHostSimulationServices(testingServiceCollection);
	}

	testingServiceCollection.define(ITestInformation, new SyncDescriptor(TestInformation, [currentTestRunInfo.test]));
	try {
		const newLocal = new Map<string, any>(currentTestRunInfo.test.nonExtensionConfigurations);

		const configs = Object.entries(opts.configs ?? {}).map(([key, value]) => [lookupConfigKey(key), value] as const);

		testingServiceCollection.define(IConfigurationService, new SyncDescriptor(
			InMemoryConfigurationService,
			[
				new DefaultsOnlyConfigurationService(),
				new Map<ExperimentBasedConfig<ExperimentBasedConfigType> | Config<any>, unknown>([
					[ConfigKey.UseProjectTemplates, false],
					[ConfigKey.SummarizeAgentConversationHistory, opts.summarizeHistory],
					...currentTestRunInfo.test.configurations?.map<[ExperimentBasedConfig<ExperimentBasedConfigType> | Config<any>, unknown]>(c => [c.key, c.value]) ?? [],
					...configs,
				]),
				newLocal,
			])
		);
	} catch (err) {
		console.log(currentTestRunInfo.test.nonExtensionConfigurations);
		console.error('Error in createSimulationAccessor', err);
		console.error(currentTestRunInfo.test.fullName);
		throw err;
	}

	const globalStoragePath = path.join(dotSimulationPath, 'cache', 'global-storage');
	const globalStatePath = path.join(dotSimulationPath, 'cache', 'global-state');

	testingServiceCollection.define(ISimulationEndpointHealth, new SyncDescriptor(SimulationEndpointHealthImpl));
	testingServiceCollection.define(IJSONOutputPrinter, new SyncDescriptor(NoopJSONOutputPrinter));
	testingServiceCollection.define(ICachingResourceFetcher, new SyncDescriptor(CachingResourceFetcher, [currentTestRunInfo, opts.resourcesCacheMode]));
	testingServiceCollection.define(IVSCodeExtensionContext, new SyncDescriptor(MockExtensionContext, [globalStoragePath, constructGlobalStateMemento(globalStatePath)]));
	testingServiceCollection.define(IIntentService, new SyncDescriptor(IntentService));

	testingServiceCollection.define(IAIEvaluationService, new SyncDescriptor(AIEvaluationService));

	const docsSearchClient = new SyncDescriptor(ThrottlingCodeOrDocsSearchClient, [new SyncDescriptor(DocsSearchClient)]);
	testingServiceCollection.define(ITokenizerProvider, new SyncDescriptor(TokenizerProvider, [false]));

	const cacheTestInfo = new CachedTestInfo(currentTestRunInfo.test, currentTestRunInfo.testRunNumber);

	let chatMLFetcher: SyncDescriptor<IChatMLFetcher> =
		opts.isNoFetchModeEnabled
			? new SyncDescriptor(NoFetchChatMLFetcher)
			: new SyncDescriptor(ThrottlingChatMLFetcher, [
				new SyncDescriptor(ChatMLFetcherImpl),
				opts.chatModelThrottlingTaskLaunchers
			]);
	if (opts.createChatMLCache) {
		chatMLFetcher = new SyncDescriptor(CachingChatMLFetcher, [
			chatMLFetcher,
			opts.createChatMLCache(currentTestRunInfo),
			cacheTestInfo,
			{ endpointVersion: 'CAPI' },
			opts.languageModelCacheMode ?? CacheMode.Default
		]);
	}
	if (currentTestRunInfo.fetchRequestCollector) {
		chatMLFetcher = new SyncDescriptor(SpyingChatMLFetcher, [currentTestRunInfo.fetchRequestCollector, chatMLFetcher]);
	}

	testingServiceCollection.define(IChatMLFetcher, chatMLFetcher);

	if (opts.createNesFetchCache === undefined || cacheTestInfo === undefined) {
		testingServiceCollection.define(ICompletionsFetchService, new SyncDescriptor(CompletionsFetchService));
	} else {
		testingServiceCollection.define(ICompletionsFetchService, new SyncDescriptor(
			CachingCompletionsFetchService,
			[
				opts.createNesFetchCache(currentTestRunInfo),
				cacheTestInfo,
				opts.languageModelCacheMode ?? CacheMode.Default,
				currentTestRunInfo.fetchRequestCollector,
				opts.isNoFetchModeEnabled,
			])
		);
	}

	if (opts.languageModelCacheMode === CacheMode.Disable) {
		testingServiceCollection.define(IEmbeddingsComputer, new SyncDescriptor(RemoteEmbeddingsComputer));
		testingServiceCollection.define(IDocsSearchClient, docsSearchClient);
		testingServiceCollection.define(IChunkingEndpointClient, new SyncDescriptor(ChunkingEndpointClientImpl));
		testingServiceCollection.define(ICombinedEmbeddingIndex, new SyncDescriptor(VSCodeCombinedIndexImpl, [/*useRemoteCache*/ true]));
		testingServiceCollection.define(IApiEmbeddingsIndex, new SyncDescriptor(ApiEmbeddingsIndex, [/*useRemoteCache*/ true]));
		testingServiceCollection.define(IProjectTemplatesIndex, new SyncDescriptor(ProjectTemplatesIndex, [/*useRemoteCache*/ true]));
	} else {
		const embeddingCache = new EmbeddingsSQLiteCache(TestingCacheSalts.embeddingsCacheSalt, currentTestRunInfo);
		testingServiceCollection.define(IEmbeddingsComputer, new SyncDescriptor(CachingEmbeddingsComputer, [embeddingCache]));

		const codeOrDocSearchCache = new CodeOrDocSearchSQLiteCache(TestingCacheSalts.codeSearchCacheSalt, currentTestRunInfo);
		const chunksEndpointCache = new ChunkingEndpointClientSQLiteCache(TestingCacheSalts.chunksEndpointCacheSalt, currentTestRunInfo);
		testingServiceCollection.define(IDocsSearchClient, new SyncDescriptor(CachingCodeOrDocSearchClient, [docsSearchClient, codeOrDocSearchCache]));
		testingServiceCollection.define(ICombinedEmbeddingIndex, new SyncDescriptor(VSCodeCombinedIndexImpl, [/*useRemoteCache*/ false]));
		testingServiceCollection.define(IApiEmbeddingsIndex, new SyncDescriptor(ApiEmbeddingsIndex, [/*useRemoteCache*/ false]));
		testingServiceCollection.define(IProjectTemplatesIndex, new SyncDescriptor(ProjectTemplatesIndex, [/*useRemoteCache*/ false]));
		testingServiceCollection.define(IChunkingEndpointClient, new SyncDescriptor(CachingChunkingEndpointClient, [chunksEndpointCache]));
	}

	testingServiceCollection.define(INaiveChunkingService, new SyncDescriptor(NaiveChunkingService));
	testingServiceCollection.define(ILinkifyService, new SyncDescriptor(LinkifyService));
	testingServiceCollection.define(ITestProvider, new SyncDescriptor(NullTestProvider));
	testingServiceCollection.define(ITestGenInfoStorage, new SyncDescriptor(TestGenInfoStorage));
	testingServiceCollection.define(IConversationStore, new SyncDescriptor(ConversationStore));
	testingServiceCollection.define(IReviewService, new SyncDescriptor(SimulationReviewService));
	testingServiceCollection.define(IGitExtensionService, new SyncDescriptor(NullGitExtensionService));
	testingServiceCollection.define(IReleaseNotesService, new SyncDescriptor(ReleaseNotesService));
	testingServiceCollection.define(IWorkspaceFileIndex, new SyncDescriptor(WorkspaceFileIndex));
	testingServiceCollection.define(IGithubAvailableEmbeddingTypesService, new SyncDescriptor(MockGithubAvailableEmbeddingTypesService));

	if (opts.useExperimentalCodeSearchService) {
		testingServiceCollection.define(IWorkspaceChunkSearchService, new SyncDescriptor(SimulationCodeSearchChunkSearchService, []));
	} else {
		testingServiceCollection.define(IWorkspaceChunkSearchService, new SyncDescriptor(WorkspaceChunkSearchService));
	}

	return testingServiceCollection;
}

function lookupConfigKey(key: string): ExperimentBasedConfig<ExperimentBasedConfigType> | Config<any> {
	const config = globalConfigRegistry.configs.get(key);
	if (!config) {
		throw new Error(`Configuration '${key}' provided does not exist in product. Double check if the configuration key exists by using it in vscode settings.json.`);
	}
	return config;
}

export function loadConfigFile(configFilePath: string): Record<string, unknown> {
	const resolvedPath = path.isAbsolute(configFilePath) ? configFilePath : path.join(process.cwd(), configFilePath);
	const contents = fs.readFileSync(resolvedPath, 'utf-8');
	const configs = JSON.parse(contents) as Record<string, unknown>;
	if (!configs || typeof configs !== 'object') {
		throw new Error('Invalid configuration file: ' + configFilePath);
	}
	return configs;
}

export async function applyConfigFile(configService: IConfigurationService, configs: Record<string, unknown>): Promise<void> {
	for (const [key, value] of Object.entries(configs)) {
		const configKey = lookupConfigKey(key);
		await configService.setConfig(configKey, value);
	}
}
