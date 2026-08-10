/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { VisualizationTestRun } from '../src/extension/inlineChat/node/rendererVisualization';
import '../src/extension/intents/node/allIntents';
import { ISimulationTestContext, NulSimulationTestContext } from '../src/platform/simulationTestContext/common/simulationTestContext';
import { NullTestProvider } from '../src/platform/testing/common/nullTestProvider';
import { ITestProvider } from '../src/platform/testing/common/testProvider';
import { IDebugValueEditorGlobals } from '../src/util/common/debugValueEditorGlobals';
import { ChatMLSQLiteCache } from './base/chatMLCache';
import { TestingCacheSalts } from './base/salts';
import { CacheMode, createSimulationAccessor, createSimulationChatModelThrottlingTaskLaunchers, CurrentTestRunInfo, SimulationServicesOptions } from './base/simulationContext';
import { FetchRequestCollector } from './base/spyingChatMLFetcher';
import { ISimulationTestRuntime, SimulationTestRuntime, SimulationTestsRegistry } from './base/stest';
import { IJSONOutputPrinter } from './jsonOutputPrinter';

const g = globalThis as any as IDebugValueEditorGlobals;

export async function run(fullPath: string, testFullName: string) {
	SimulationTestsRegistry.allowTestReregistration();
	VisualizationTestRun.startRun();

	require(fullPath);

	const tests = SimulationTestsRegistry.getAllTests();
	const test = tests.find(t => t.fullName === testFullName)!;

	if (!test) {
		console.error('Test not found', testFullName);
		return;
	}

	const currentTestRunInfo: CurrentTestRunInfo = {
		test,
		testRunNumber: 0,
		fetchRequestCollector: new FetchRequestCollector(),
		isInRealExtensionHost: false,
	};
	const simulationServicesOptions: SimulationServicesOptions = {
		chatModelThrottlingTaskLaunchers: createSimulationChatModelThrottlingTaskLaunchers(false),
		createChatMLCache: (info: CurrentTestRunInfo) => new ChatMLSQLiteCache(TestingCacheSalts.requestCacheSalt, info),
		isNoFetchModeEnabled: false,
		languageModelCacheMode: CacheMode.Default,
		resourcesCacheMode: CacheMode.Default,
		disabledTools: new Set(),
		swebenchPrompt: false,
		summarizeHistory: true,
		useExperimentalCodeSearchService: false,
		configs: undefined,
	};
	const testingServiceCollection = await createSimulationAccessor(
		{ chatModel: test.model, embeddingType: test.embeddingType },
		simulationServicesOptions,
		currentTestRunInfo
	);
	testingServiceCollection.define(IJSONOutputPrinter, {
		print(obj: any) {
			console.log(obj);
		},
		_serviceBrand: undefined,
	});
	testingServiceCollection.define(ITestProvider, new NullTestProvider());
	testingServiceCollection.define(ISimulationTestRuntime, new SimulationTestRuntime('./', './.simulation/visualization-out', 1));
	testingServiceCollection.define(ISimulationTestContext, new NulSimulationTestContext());

	try {
		const startTime = Date.now();
		g.$$debugValueEditor_properties = [];
		await test?.run(testingServiceCollection);
		const endTime = Date.now();
		const duration = endTime - startTime;
		console.log('> Test finished (' + duration + 'ms).');
	} catch (e) {
		console.error('Test failed:', e);
	} finally {
		testingServiceCollection.dispose();
	}
}

console.log('> Playground runner ready.');
