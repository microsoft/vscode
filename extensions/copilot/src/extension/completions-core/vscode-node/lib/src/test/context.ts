/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentSelector } from 'vscode-languageserver-protocol/lib/common/protocol';
import { ILanguageContextProviderService } from '../../../../../../platform/languageContextProvider/common/languageContextProviderService';
import { NullLanguageContextProviderService } from '../../../../../../platform/languageContextProvider/common/nullLanguageContextProviderService';
import { ILanguageDiagnosticsService } from '../../../../../../platform/languages/common/languageDiagnosticsService';
import { TestLanguageDiagnosticsService } from '../../../../../../platform/languages/common/testLanguageDiagnosticsService';
import { TestingServiceCollection } from '../../../../../../platform/test/node/services';
import { SyncDescriptor } from '../../../../../../util/vs/platform/instantiation/common/descriptors';
import { createExtensionTestingServices } from '../../../../../test/vscode-node/services';
import { CompletionsTelemetryServiceBridge, ICompletionsTelemetryService } from '../../../bridge/src/completionsTelemetryServiceBridge';
import { DocumentContext } from '../../../types/src';
import { ICompletionsCopilotTokenManager } from '../auth/copilotTokenManager';
import { ICompletionsCitationManager, NoOpCitationManager } from '../citationManager';
import { CompletionNotifier, ICompletionsNotifierService } from '../completionNotifier';
import {
	DefaultsOnlyConfigProvider, ICompletionsConfigProvider,
	ICompletionsEditorAndPluginInfo,
	InMemoryConfigProvider
} from '../config';
import { ICompletionsUserErrorNotifierService, UserErrorNotifier } from '../error/userErrorNotifier';
import { Features } from '../experiments/features';
import { ICompletionsFeaturesService } from '../experiments/featuresService';
import { FileReader, ICompletionsFileReaderService } from '../fileReader';
import { ICompletionsFileSystemService } from '../fileSystem';
import { AsyncCompletionManager, ICompletionsAsyncManagerService } from '../ghostText/asyncCompletions';
import { CompletionsCache, ICompletionsCacheService } from '../ghostText/completionsCache';
import { ConfigBlockModeConfig, ICompletionsBlockModeConfig } from '../ghostText/configBlockMode';
import { CurrentGhostText, ICompletionsCurrentGhostText } from '../ghostText/current';
import { ICompletionsLastGhostText, LastGhostText } from '../ghostText/last';
import { ICompletionsSpeculativeRequestCache, SpeculativeRequestCache } from '../ghostText/speculativeRequestCache';
import { LocalFileSystem } from '../localFileSystem';
import { ICompletionsLogTargetService } from '../logger';
import { ICompletionsFetcherService } from '../networking';
import { ICompletionsNotificationSender } from '../notificationSender';
import { AvailableModelsManager, ICompletionsModelManagerService } from '../openai/model';
import { ICompletionsStatusReporter, NoOpStatusReporter } from '../progress';
import {
	CompletionsPromptFactory, ICompletionsPromptFactoryService
} from '../prompt/completionsPromptFactory/completionsPromptFactory';
import { ContextProviderBridge, ICompletionsContextProviderBridgeService } from '../prompt/components/contextProviderBridge';
import {
	CachedContextProviderRegistry,
	DefaultContextProvidersContainer, ICompletionsContextProviderRegistryService,
	ICompletionsDefaultContextProviders,
	MutableContextProviderRegistry
} from '../prompt/contextProviderRegistry';
import { ContextProviderStatistics, ICompletionsContextProviderService } from '../prompt/contextProviderStatistics';
import { EmptyRecentEditsProvider } from '../prompt/recentEdits/emptyRecentEditsProvider';
import { ICompletionsRecentEditsProviderService } from '../prompt/recentEdits/recentEditsProvider';
import { ICompletionsTelemetryReporters, TelemetryReporters } from '../telemetry';
import { ICompletionsTelemetryUserConfigService, TelemetryUserConfig } from '../telemetry/userConfig';
import { ICompletionsTextDocumentManagerService } from '../textDocumentManager';
import { ICompletionsPromiseQueueService } from '../util/promiseQueue';
import { ICompletionsRuntimeModeService, RuntimeMode } from '../util/runtimeMode';
import { FakeCopilotTokenManager } from './copilotTokenManager';
import { NoFetchFetcher } from './fetcher';
import { TestPromiseQueue } from './telemetry';
import { TestNotificationSender } from './testHelpers';
import { TestTextDocumentManager } from './textDocument';

class NullLog implements ICompletionsLogTargetService {
	declare _serviceBrand: undefined;
	logIt(..._: unknown[]) { }
}

/**
 * Baseline for a context. Tests should prefer the specific variants outlined below.
 *
 * @see createLibTestingContext
 * @see createExtensionTestingContext
 * @see createAgentTestingContext
 */
export function _createBaselineContext(serviceCollection: TestingServiceCollection, configProvider: InMemoryConfigProvider): TestingServiceCollection {
	serviceCollection.set(ILanguageContextProviderService, new NullLanguageContextProviderService());

	serviceCollection.define(ICompletionsLogTargetService, new NullLog());
	serviceCollection.define(ICompletionsCacheService, new CompletionsCache());
	serviceCollection.define(ICompletionsConfigProvider, configProvider);
	serviceCollection.define(ICompletionsRuntimeModeService, new RuntimeMode({ debug: false, verboseLogging: false, testMode: true, simulation: false }));
	serviceCollection.define(ICompletionsSpeculativeRequestCache, new SpeculativeRequestCache());
	serviceCollection.define(ICompletionsLastGhostText, new LastGhostText());
	serviceCollection.define(ICompletionsCurrentGhostText, new CurrentGhostText());
	serviceCollection.define(ICompletionsStatusReporter, new NoOpStatusReporter());
	serviceCollection.define(ICompletionsCitationManager, new NoOpCitationManager());
	serviceCollection.define(ICompletionsNotificationSender, new TestNotificationSender());
	serviceCollection.define(ICompletionsTelemetryReporters, new TelemetryReporters());
	serviceCollection.define(ICompletionsCopilotTokenManager, new FakeCopilotTokenManager());
	serviceCollection.define(ICompletionsFeaturesService, new SyncDescriptor(Features));
	serviceCollection.define(ICompletionsTelemetryService, new SyncDescriptor(CompletionsTelemetryServiceBridge));
	serviceCollection.define(ICompletionsNotifierService, new SyncDescriptor(CompletionNotifier));
	serviceCollection.define(ICompletionsBlockModeConfig, new SyncDescriptor(ConfigBlockModeConfig));
	serviceCollection.define(ICompletionsRecentEditsProviderService, new EmptyRecentEditsProvider());
	serviceCollection.define(ICompletionsUserErrorNotifierService, new SyncDescriptor(UserErrorNotifier));

	serviceCollection.define(ICompletionsFileReaderService, new SyncDescriptor(FileReader));
	serviceCollection.define(ICompletionsTelemetryUserConfigService, new SyncDescriptor(TelemetryUserConfig));
	serviceCollection.define(ICompletionsModelManagerService, new SyncDescriptor(AvailableModelsManager, [false]));
	serviceCollection.define(ICompletionsAsyncManagerService, new SyncDescriptor(AsyncCompletionManager));
	serviceCollection.define(ICompletionsContextProviderBridgeService, new SyncDescriptor(ContextProviderBridge));
	serviceCollection.define(ICompletionsPromiseQueueService, new TestPromiseQueue());
	serviceCollection.define(ILanguageDiagnosticsService, new TestLanguageDiagnosticsService());

	//ctx.set(FileSearch, new TestingFileSearch());
	serviceCollection.define(ICompletionsPromptFactoryService, new SyncDescriptor(CompletionsPromptFactory));
	serviceCollection.define(ICompletionsContextProviderService, new ContextProviderStatistics());
	serviceCollection.define(ICompletionsContextProviderRegistryService,
		new SyncDescriptor(CachedContextProviderRegistry, [MutableContextProviderRegistry, (_: unknown, documentSelector: DocumentSelector, documentContext: DocumentContext) => {
			if (documentSelector.find(ds => ds === '*')) {
				return 1;
			}
			return documentSelector.find(ds => typeof ds !== 'string' && ds.language === documentContext.languageId)
				? 10
				: 0;
		}])
	);

	return serviceCollection;
}

/**
 * @returns a context suitable for `lib` tests.
 */
export function createLibTestingContext() {
	let serviceCollection = createExtensionTestingServices();
	serviceCollection = _createBaselineContext(serviceCollection, new InMemoryConfigProvider(new DefaultsOnlyConfigProvider()));

	serviceCollection.define(ICompletionsFetcherService, new NoFetchFetcher());
	serviceCollection.define(ICompletionsEditorAndPluginInfo, new LibTestsEditorInfo());
	serviceCollection.define(ICompletionsTextDocumentManagerService, new SyncDescriptor(TestTextDocumentManager));
	serviceCollection.define(ICompletionsFileSystemService, new LocalFileSystem());
	serviceCollection.define(ICompletionsDefaultContextProviders, new DefaultContextProvidersContainer());

	return serviceCollection;
}

export class LibTestsEditorInfo implements ICompletionsEditorAndPluginInfo {
	declare _serviceBrand: undefined;
	constructor(
		readonly editorPluginInfo = { name: 'lib-tests-plugin', version: '2' },
		readonly editorInfo = { name: 'lib-tests-editor', version: '1' },
		readonly relatedPluginInfo = [{ name: 'lib-tests-related-plugin', version: '3' }]
	) { }
	getEditorInfo() {
		return this.editorInfo;
	}
	getEditorPluginInfo() {
		return this.editorPluginInfo;
	}
	getRelatedPluginInfo() {
		return this.relatedPluginInfo;
	}
}
