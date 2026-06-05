/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Load env
import * as dotenv from 'dotenv';
dotenv.config();

// Needed for better stack traces as captureLocation parses the stack trace to find stests
import 'source-map-support/register';

// Load other imports
import * as fs from 'fs';
import minimist from 'minimist';
import { createConnection } from 'net';
import * as path from 'path';
import * as v8 from 'v8';
import type * as vscodeType from 'vscode';
import { SimpleRPC } from '../src/extension/onboardDebug/node/copilotDebugWorker/rpc';
import { ISimulationModelConfig, createExtensionUnitTestingServices } from '../src/extension/test/node/services';
import { CHAT_MODEL } from '../src/platform/configuration/common/configurationService';
import { IEndpointProvider, ModelSupportedEndpoint } from '../src/platform/endpoint/common/endpointProvider';
import { IModelConfig } from '../src/platform/endpoint/test/node/openaiCompatibleEndpoint';
import { fileSystemServiceReadAsJSON } from '../src/platform/filesystem/common/fileSystemService';
import { LogLevel } from '../src/platform/log/common/logService';
import { ParserWithCaching } from '../src/platform/parser/node/parserWithCaching';
import { structureComputer } from '../src/platform/parser/node/structure';
import { NullTelemetryService } from '../src/platform/telemetry/common/nullTelemetryService';
import { TokenizerProvider } from '../src/platform/tokenizer/node/tokenizer';
import { assert } from '../src/util/vs/base/common/assert';
import { Cache } from './base/cache';
import { IChatMLCache } from './base/cachingChatMLFetcher';
import { usedResourceCaches } from './base/cachingResourceFetcher';
import { ChatMLSQLiteCache } from './base/chatMLCache';
import { CompletionsSQLiteCache, ICompletionsCache } from './base/completionsCache';
import { usedEmbeddingsCaches } from './base/embeddingsCache';
import { TestingCacheSalts } from './base/salts';
import { ICompleteBaselineComparison, IModifiedScenario, SimulationBaseline } from './base/simulationBaseline';
import { CacheMode, CurrentTestRunInfo, SimulationServicesOptions, createSimulationChatModelThrottlingTaskLaunchers, loadConfigFile } from './base/simulationContext';
import { ProxiedSimulationEndpointHealth, SimulationEndpointHealthImpl } from './base/simulationEndpointHealth';
import { BASELINE_RUN_COUNT, SimulationOptions } from './base/simulationOptions';
import { ProxiedSimulationOutcome, SimulationOutcomeImpl } from './base/simulationOutcome';
import { drainStdoutAndExit } from './base/stdout';
import { SimulationSuite, SimulationTest, SimulationTestsRegistry, createSimulationTestFilter } from './base/stest';
import { CollectingJSONOutputPrinter, ConsoleJSONOutputPrinter, IJSONOutputPrinter, ProxiedSONOutputPrinter } from './jsonOutputPrinter';
import { green, orange, red, violet, yellow } from './outputColorer';
import { runInputPipeline, runInputPipelineParallel } from './pipeline/pipeline';
import { ITestDiscoveryOptions, discoverTests } from './simulation/externalScenarios';
import { discoverCoffeTests } from './simulation/nesCoffeTests';
import { discoverNesTests } from './simulation/nesExternalTests';
import { OLD_BASELINE_FILENAME, OutputType, PRODUCED_BASELINE_FILENAME, REPORT_FILENAME, RUN_METADATA, SCORECARD_FILENAME, SIMULATION_FOLDER_NAME, generateOutputFolderName } from './simulation/shared/sharedTypes';
import { logger } from './simulationLogger';
import { IInitParams, IInitResult, IRunTestParams, IRunTestResult } from './testExecutionInExtension';
import { GroupedScores, ITestResult, SimulationTestContext, executeTestOnce, executeTests } from './testExecutor';
import { createScoreRenderer, fileExists, printTime } from './util';
const dotSimulationPath = path.join(__dirname, `../${SIMULATION_FOLDER_NAME}`);

async function main() {
	const errors: unknown[] = [];

	process.env['SIMULATION'] = '1';

	process.on('unhandledRejection', (reason, promise) => {
		console.error('\n\nUnhandled Rejection at: Promise', promise, 'reason:', reason);
		errors.push('unhandled rejection: ' + reason);
	});

	try {
		if (process.env.VSCODE_SIMULATION_EXTENSION_ENTRY) {
			await runInExtensionHost();
		} else {
			const opts = SimulationOptions.fromProcessArgs();
			const result = await run(opts);
			if (result) {
				errors.push(...result.errors);
			}
		}
	} catch (err) {
		errors.push(err?.stack || err?.message || String(err));
	}

	if (errors.length > 0) {
		console.error(`\n${red('⚠️⚠️⚠️  Command failed with:')}\n\n`);

		for (let i = 0; i < errors.length; i++) {
			const idx = `Error${errors.length === 1 ? '' : ` ${i + 1})`} `;
			console.error(`\t${idx}${errors[i]}\n\n`);
		}
	}

	await drainStdoutAndExit(errors.length === 0 ? 0 : 1);
}

type RunResult = void | { errors: unknown[] };

async function run(opts: SimulationOptions): Promise<RunResult> {
	const jsonOutputPrinter: IJSONOutputPrinter = opts.jsonOutput ? new ConsoleJSONOutputPrinter() : new CollectingJSONOutputPrinter();

	if (opts.externalCacheLayersPath) {
		process.env['EXTERNAL_CACHE_LAYERS_PATH'] = opts.externalCacheLayersPath;
	}

	switch (true) {
		case opts.help && opts.subcommand === 'nes-datagen':
			return opts.printTrainHelp();
		case opts.help:
			return opts.printHelp();
		case opts.listModels:
			await listChatModels(opts.modelCacheMode === CacheMode.Disable);
			return;
		case !!opts.nesDatagen:
			if (opts.parallelism > 1 && !opts.nesDatagen.workerMode) {
				await runInputPipelineParallel(opts);
			} else {
				await runInputPipeline(opts);
			}
			return;
		case opts.listSuites: // intentional fallthrough
		case opts.listTests: {
			// stest runner extension runs with both `list-tests` and `list-suites` flags, so they should not be mutually exclusive
			const { allSuites } = await loadTests(opts);

			if (opts.listSuites) {
				listSuites(allSuites, opts, jsonOutputPrinter);
			}

			if (opts.listTests) {
				listTests(allSuites, opts, jsonOutputPrinter);
			}

			return;
		}
		default:
			return runTests(opts, jsonOutputPrinter);
	}
}

async function runInExtensionHost() {
	const nodeOptions = process.env.NODE_OPTIONS;

	// Hook for the js-debug bootloader, which is not automatically executed in the extension host
	if (nodeOptions) {
		// NODE_OPTIONS is a CLI argument fragment that we need to parse here
		const regex = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\S+/g;
		const parsed = minimist(Array.from(nodeOptions.matchAll(regex), match => {
			let arg = match[0];
			// Remove surrounding quotes and unescape internal quotes if necessary
			if (arg[0] === arg.at(-1) && (arg[0] === '"' || arg[0] === '\'')) {
				arg = arg.slice(1, -1).replaceAll(`\\${arg[0]}`, arg[0]);
			}
			return arg;
		}));

		if (parsed.require) {
			const reqPaths = Array.isArray(parsed.require) ? parsed.require : [parsed.require];
			logger.info(`Loading NODE_OPTIONS require: ${reqPaths.join(', ')}`);
			reqPaths.forEach(r => require(r));
		}
	}

	const port = Number(process.env.VSCODE_SIMULATION_CONTROL_PORT);
	const rpc = await new Promise<SimpleRPC>((resolve, reject) => {
		const socket = createConnection({ host: '127.0.0.1', port });
		socket.on('connect', () => resolve(new SimpleRPC(socket)));
		socket.on('error', reject);
	});

	const vscode: typeof vscodeType = require('vscode');
	const folder = vscode.workspace.workspaceFolders![0];

	Cache.Instance.on('deviceCodeCallback', (url: string) => {
		rpc.callMethod('deviceCodeCallback', { url });
	});

	rpc.registerMethod('runTest', async (params: IRunTestParams): Promise<IRunTestResult> => {
		const { simulationTestContext, tests } = await allTests;

		simulationTestContext.baseline.clear();
		simulationTestContext.simulationEndpointHealth.failures.splice(0, simulationTestContext.simulationEndpointHealth.failures.length);

		const test = tests.get(params.testName);
		if (!test) {
			throw new Error(`Test ${params.testName} not found`);
		}

		const result = await executeTestOnce(
			simulationTestContext,
			1,
			params.outcomeDirectory,
			test,
			params.runNumber,
			true,
		);

		return { result };
	});

	const allTests = rpc.callMethod('init', { folder: folder.uri.fsPath } satisfies IInitParams).then(async (res: IInitResult) => {
		const opts = SimulationOptions.fromArray(res.argv);
		const { testsToRun } = await loadTests(opts);
		const { simulationTestContext } = await prepareTestEnvironment(opts, new ProxiedSONOutputPrinter(rpc), rpc);
		return { opts, tests: new Map(testsToRun.map(t => [t.fullName, t])), simulationTestContext };
	});

	return new Promise<void>(resolve => {
		rpc.registerMethod('close', async () => {
			resolve();
		});
	});
}

async function prepareTestEnvironment(opts: SimulationOptions, jsonOutputPrinter: IJSONOutputPrinter, rpcInExtensionHost?: SimpleRPC) {

	if (opts.verbose) {
		logger.setLogLevel(LogLevel.Trace);
	}

	// Configure caching
	if (opts.parallelism > 1) {
		// To get good cache behavior, we must increase the cache size considerably
		ParserWithCaching.CACHE_SIZE_PER_LANGUAGE = Math.max(5, 2 * opts.parallelism);
		structureComputer.setCacheSize(Math.max(5, 2 * opts.parallelism));
	}
	fileSystemServiceReadAsJSON.enable();

	const { allSuites, testsToRun, externalScenariosPath } = await loadTests(opts);

	let outputPath = opts.output;
	if (outputPath === undefined) {
		outputPath = path.join(dotSimulationPath, generateOutputFolderName());
	} else {
		// If it's not an absolute path, make it relative to the current working directory
		if (!path.isAbsolute(outputPath)) {
			outputPath = path.join(process.cwd(), outputPath);
		}
	}
	if (!rpcInExtensionHost) { // don't clean if we're just one participant in a larger run
		await clearOrCreateDir(outputPath);
	}

	jsonOutputPrinter.print({
		type: OutputType.initialTestSummary,
		runOutputFolderName: path.basename(outputPath),
		testsToRun: testsToRun.map(t => t.fullName),
		nRuns: opts.nRuns
	});

	const allTests = allSuites.flatMap(cur => cur.tests);
	const hasFilteredTests = testsToRun.length !== allTests.length;

	if (!opts.jsonOutput) {
		if (hasFilteredTests) {
			console.log(`Due to grep filters, will execute ${testsToRun.length} out of ${allTests.length} simulations. Each simulation runs ${opts.nRuns} time(s).\n`);
		} else {
			console.log(`Will execute ${testsToRun.length} simulations. Each simulation runs ${opts.nRuns} time(s).\n`);
		}
	}


	writeHeapSnapshot(opts.heapSnapshots, 'before');

	const canUseBaseline = (opts.nRuns === BASELINE_RUN_COUNT); // only use baseline if running N times
	const runningAllTests = (opts.grep === undefined && opts.omitGrep === undefined);

	const baselinePath = opts.externalBaseline
		? (
			assert(opts.externalScenarios !== undefined, 'externalBaseline must be set only with externalScenarios'),
			path.join(opts.externalScenarios, 'baseline.json')
		)
		: SimulationBaseline.DEFAULT_BASELINE_PATH;

	const baseline = await SimulationBaseline.readFromDisk(baselinePath, runningAllTests);

	if (canUseBaseline) { // copy current baseline as the baseline before the run
		await fs.promises.copyFile(baseline.baselinePath, path.join(outputPath, OLD_BASELINE_FILENAME));
	}

	const configs = opts.configFile ? loadConfigFile(opts.configFile) : undefined;

	return {
		...createSimulationTestContext(opts, runningAllTests, baseline, canUseBaseline, jsonOutputPrinter, outputPath, externalScenariosPath, rpcInExtensionHost, configs),
		testsToRun,
		baseline,
		canUseBaseline,
		outputPath,
		runningAllTests,
		hasFilteredTests,
	};

}

async function runTests(opts: SimulationOptions, jsonOutputPrinter: IJSONOutputPrinter): Promise<RunResult> {
	const errors: unknown[] = [];

	Cache.Instance.on('deviceCodeCallback', (url: string) => {
		if (opts.jsonOutput) {
			jsonOutputPrinter.print({ type: OutputType.deviceCodeCallback, url });
		} else {
			console.log(`⚠️ \x1b[31mAuth Required!\x1b[0m Please open the link: ${url}`);
		}
	});

	const { simulationEndpointHealth, simulationOutcome, simulationTestContext, testsToRun, baseline, canUseBaseline, outputPath, runningAllTests, hasFilteredTests } = await prepareTestEnvironment(opts, jsonOutputPrinter);

	if (opts.gc) {
		if (opts.gc && opts.externalCacheLayersPath) {
			throw new Error('--gc is currently not compatible with --external-cache-layers-path');
		}
		Cache.Instance.gcStart();
	}

	const totalStartTime = Date.now();
	const { testResultsPromises, getGroupedScores } = await executeTests(simulationTestContext, testsToRun);

	console.log('Waiting on test results...');

	const testResults = await Promise.all(testResultsPromises);

	writeHeapSnapshot(opts.heapSnapshots, 'after');

	const totalTime = Date.now() - totalStartTime;

	if (opts.gc) {
		Cache.Instance.gcEnd();
	}

	for (const result of testResults) {
		for (const [idx, o] of result.outcomes.entries()) {
			if (o?.kind === 'failed' && o.critical) {
				errors.push(`Test failed: ${result.test}, run ${idx}\n` + o.error);
			}
		}
	}

	// this allows to quickly identify which new cache entries were created in this particular simulation run
	if (opts.stageCacheEntries && !opts.externalScenarios) {
		// TODO@joaomoreno
		console.warn('!!! Determining new cache entries is not yet working in Redis, ask Joao to implement it');
	}

	const groupedScores = await getGroupedScores();
	printOutcome(groupedScores, testsToRun, baseline, opts, canUseBaseline, runningAllTests, testResults, totalTime);

	const tableData = buildScoreTable(groupedScores);
	const suiteScoreCard = path.join(outputPath, SCORECARD_FILENAME);
	await fs.promises.writeFile(suiteScoreCard, toCsv(tableData));

	if (simulationOutcome instanceof SimulationOutcomeImpl) {
		if (!opts.noCachePointer) {
			await simulationOutcome.write();
		}

		if (!opts.externalScenarios && !hasFilteredTests) {
			await simulationOutcome.cleanFolder();
		}
	}

	if (canUseBaseline) {
		await baseline.writeToDisk(path.join(outputPath, PRODUCED_BASELINE_FILENAME));
	}

	if (opts.isUpdateBaseline) {
		if (canUseBaseline) {
			await baseline.writeToDisk();
		} else {
			errors.push(`Cannot update baseline for ${opts.nRuns} run(s). Please use --n=${BASELINE_RUN_COUNT}.`);
		}
	}

	await jsonOutputPrinter.flush?.(outputPath);

	const filePath = path.join(outputPath, REPORT_FILENAME);
	await fs.promises.writeFile(filePath, JSON.stringify(testResults, null, '\t'));

	if (opts.label) {
		const runMetadata = path.join(outputPath, RUN_METADATA);
		await fs.promises.writeFile(runMetadata, JSON.stringify({ label: opts.label }, null, '\t'));
	}

	// Enable if you want to see which cache entries were used in this simulation run
	const writeUsedOtherCaches = false;
	if (writeUsedOtherCaches) {
		await fs.promises.writeFile('other-caches.json', JSON.stringify(
			([] as string[])
				.concat(Array.from(usedEmbeddingsCaches))
				.concat(Array.from(usedResourceCaches))
		));
	}

	if (opts.ci && !opts.isUpdateBaseline) {
		const changeStats = baseline.compare();
		const error = validateChangeStats(changeStats);
		if (error) {
			errors.push(red(`${error.errorMessage}. Please run 'npm run simulate-update-baseline' and check in baseline.json.`));
		}
	} else {
		if (simulationEndpointHealth.failures.length > 0) {
			const rateLimitedCount = simulationEndpointHealth.failures.filter(f => f.request.type === 'rateLimited').length;
			const failedCount = simulationEndpointHealth.failures.filter(f => f.request.type === 'failed').length;

			// If there were simulation endpoint failures and we are doing a
			// CI baseline update, fail the CI so that we block PR merge
			if (opts.ci && opts.isUpdateBaseline) {
				errors.push(
					red(`Encountered server failures while running simulation: ${rateLimitedCount} rate limited responses, ${failedCount} other failed responses. Please rerun the simulation!`),
					...simulationEndpointHealth.failures.map(f => `- ${f.testInfo.testName}: ${f.request.reason}`),
				);
			}
		}
	}

	return { errors };
}

async function loadTests(opts: SimulationOptions) {
	let allSuites: readonly SimulationSuite[] = [];
	let testsToRun: readonly SimulationTest[] = [];

	let externalScenariosPath = opts.externalScenarios;
	if (externalScenariosPath) {
		let usageError = false;
		if (!opts.inline && !opts.sidebar && !opts.nes) {
			usageError = true;
			console.error(`Missing --inline or --sidebar or --nes flag`);
		}
		if ([opts.inline, opts.sidebar, opts.nes].filter(Boolean).length > 1) {
			usageError = true;
			console.error(`Can only have one of --inline or --sidebar or --nes flags set`);
		}

		if (typeof opts.output !== 'string') {
			usageError = true;
			console.error(`Missing --output flag`);
		}

		if (usageError) { // process.exit() if there's a usage error
			console.error(`Usage: npm run simulate -- --external-scenarios=<path> --inline --output=<path>`);
			console.error(`Usage: npm run simulate -- --external-scenarios=<path> --sidebar --output=<path>`);
			await drainStdoutAndExit(1);
		}

		// Update paths to be absolute
		// If it's not an absolute path, make it relative to the current working directory
		if (!path.isAbsolute(externalScenariosPath)) {
			externalScenariosPath = path.join(process.cwd(), externalScenariosPath);
		}

		if (opts.scenarioTest) {
			SimulationTestsRegistry.setInputPath(externalScenariosPath);
		} else {
			const filter = createSimulationTestFilter(opts.grep, opts.omitGrep);
			if (opts.nes) {
				if (opts.nes === 'external') {
					// run external stests
					allSuites = [await discoverNesTests(externalScenariosPath, opts)];
				} else {
					// run coffe stests
					allSuites = [await discoverCoffeTests(externalScenariosPath, opts)];
				}
			} else {
				const testDiscoveryOptions: ITestDiscoveryOptions = {
					chatKind: (opts.inline && !opts.sidebar) ? 'inline' : 'panel',
					applyChatCodeBlocks: opts.applyChatCodeBlocks,
				};
				allSuites = await discoverTests(externalScenariosPath, testDiscoveryOptions);
			}
			testsToRun = allSuites
				.flatMap(suite => suite.tests)
				.filter(filter)
				.sort((t0, t1) => t0.fullName.localeCompare(t1.fullName));
		}
	}

	if (testsToRun.length === 0) {
		SimulationTestsRegistry.setFilters(opts.scenarioTest, opts.grep, opts.omitGrep);
		await import('./simulationTests');
		allSuites = SimulationTestsRegistry.getAllSuites();
		testsToRun = SimulationTestsRegistry.getAllTests();
	}
	return { allSuites, testsToRun, externalScenariosPath };
}

function listSuites(allSuites: readonly SimulationSuite[], opts: SimulationOptions, jsonOutputPrinter: IJSONOutputPrinter) {
	for (const suite of allSuites) {
		jsonOutputPrinter.print({ type: OutputType.detectedSuite, name: suite.fullName, location: suite.options.location });
	}
}

function listTests(allSuites: readonly SimulationSuite[], opts: SimulationOptions, jsonOutputPrinter: IJSONOutputPrinter) {
	// we should just list all tests
	const allTests = allSuites.flatMap(suite => suite.tests);
	for (const test of allTests) {
		jsonOutputPrinter.print({ type: OutputType.detectedTest, suiteName: test.suite.fullName, name: test.fullName, location: test.options.location });
		if (!opts.jsonOutput) {
			console.log(` - ${test.fullName}`);
		}
	}
}

async function listChatModels(skipCache: boolean = false) {
	const accessor = createExtensionUnitTestingServices(undefined, undefined, { skipModelMetadataCache: skipCache }).createTestingAccessor();
	const endpointProvider = accessor.get(IEndpointProvider);
	const chatEndpoints = await endpointProvider.getAllChatEndpoints();
	console.log('Available Chat Models:\n');

	// Group models by family
	const modelsByFamily = new Map<string, string[]>();

	for (const endpoint of chatEndpoints) {
		const family = endpoint.family || 'Other'; // Default family name if not specified
		if (!modelsByFamily.has(family)) {
			modelsByFamily.set(family, []);
		}
		modelsByFamily.get(family)!.push(endpoint.model);
	}

	// Print each family with its models
	const tableData: { Family: string; Models: string }[] = [];

	// Convert to array and sort by family name for consistent display
	const sortedFamilies = Array.from(modelsByFamily.entries()).sort((a, b) => a[0].localeCompare(b[0]));

	for (const [family, models] of sortedFamilies) {
		// Sort models within each family
		models.sort();
		tableData.push({
			Family: family,
			Models: models.join(', ')
		});
	}

	console.table(tableData);
	return;
}

function createSimulationTestContext(
	opts: SimulationOptions,
	runningAllTests: boolean,
	baseline: SimulationBaseline,
	canUseBaseline: boolean,
	jsonOutputPrinter: IJSONOutputPrinter,
	outputPath: string,
	externalScenariosPath: string | undefined,
	rpcInExtensionHost: SimpleRPC | undefined,
	configs: Record<string, unknown> | undefined,
) {
	const simulationEndpointHealth = rpcInExtensionHost ? new ProxiedSimulationEndpointHealth(rpcInExtensionHost) : new SimulationEndpointHealthImpl();

	let createChatMLCache: ((info: CurrentTestRunInfo) => IChatMLCache) | undefined;
	let createNesFetchCache: ((info: CurrentTestRunInfo) => ICompletionsCache) | undefined;

	if (opts.lmCacheMode === CacheMode.Disable) {
		console.warn('❗ Not using any cache');
		createChatMLCache = undefined;
		createNesFetchCache = undefined;
	} else {
		createChatMLCache = (info: CurrentTestRunInfo) => new ChatMLSQLiteCache(TestingCacheSalts.requestCacheSalt, info);
		createNesFetchCache = (info: CurrentTestRunInfo) => new CompletionsSQLiteCache(TestingCacheSalts.nesFetchCacheSalt, info);
	}

	const simulationServicesOptions: SimulationServicesOptions = {
		createChatMLCache,
		createNesFetchCache,
		chatModelThrottlingTaskLaunchers: createSimulationChatModelThrottlingTaskLaunchers(opts.boost),
		isNoFetchModeEnabled: opts.noFetch,
		languageModelCacheMode: opts.lmCacheMode,
		resourcesCacheMode: opts.resourcesCacheMode,
		disabledTools: opts.disabledTools,
		summarizeHistory: opts.summarizeHistory,
		swebenchPrompt: opts.swebenchPrompt,
		useExperimentalCodeSearchService: opts.useExperimentalCodeSearchService,
		configs
	};

	const customModelConfigMap: Map<string, IModelConfig> = new Map();
	if (opts.modelConfigFile) {
		console.log('Using model configuration file: ' + opts.modelConfigFile);
		const customModelConfigs = parseModelConfigFile(opts.modelConfigFile);
		customModelConfigs.forEach(config => {
			customModelConfigMap.set(config.id, config);
		});
	}

	const modelConfig: ISimulationModelConfig = {
		chatModel: opts.chatModel,
		fastChatModel: opts.fastChatModel,
		smartChatModel: opts.smartChatModel,
		embeddingType: opts.embeddingType,
		fastRewriteModel: opts.fastRewriteModel,
		skipModelMetadataCache: opts.modelCacheMode === CacheMode.Disable,
		customModelConfigs: customModelConfigMap,
	};


	const simulationOutcome = rpcInExtensionHost ? new ProxiedSimulationOutcome(rpcInExtensionHost) : new SimulationOutcomeImpl(runningAllTests);

	const simulationTestContext: SimulationTestContext = {
		opts,
		baseline,
		canUseBaseline,
		jsonOutputPrinter,
		outputPath,
		externalScenariosPath,
		modelConfig,
		simulationServicesOptions,
		simulationOutcome,
		simulationEndpointHealth,
		tokenizerProvider: new TokenizerProvider(false, new NullTelemetryService()) // this is expensive so we share it across all stests
	};
	return { simulationTestContext, simulationEndpointHealth, simulationOutcome };
}

function printOutcome(
	groupedScores: GroupedScores,
	testsToRun: readonly SimulationTest[],
	baseline: SimulationBaseline,
	opts: SimulationOptions,
	canUseBaseline: boolean,
	runningAllTests: boolean,
	testResults: ITestResult[],
	totalTime: number
): void {
	const shouldShowSummaries = (testsToRun.length >= 10); // only when running at least 10 tests
	const shouldBeBrief = (testsToRun.length === 1); // when running a single test, be brief

	if (shouldShowSummaries) {
		const modelComparisonTable = [];
		for (const [suiteName, scoresPerSuite] of groupedScores.entries()) {
			const testScores = new Map<string, { count: number; scoreSum: number }>();
			for (const [_language, scoresPerLanguage] of scoresPerSuite.entries()) {
				for (const [model, scoresPerModel] of scoresPerLanguage.entries()) {
					if (!model) {
						continue;
					}
					const data = testScores.get(model) || { count: 0, scoreSum: 0 };
					data.count += scoresPerModel.length;
					data.scoreSum += scoresPerModel.reduce((acc, curr) => acc + curr, 0);
					testScores.set(model, data);
				}
			}
			let modelCount = 0;
			modelCount += (testScores.has(CHAT_MODEL.GPT41) ? 1 : 0);
			modelCount += (testScores.has(CHAT_MODEL.GPT4OMINI) ? 1 : 0);
			if (modelCount > 1) {
				const gpt4o = testScores.get(CHAT_MODEL.GPT41) ?? { count: 0, scoreSum: 0 };
				const gpt4oMini = testScores.get(CHAT_MODEL.GPT4OMINI) ?? { count: 0, scoreSum: 0 };
				const row = {
					Suite: suiteName,
					'# of tests': (gpt4o.count === 0 || gpt4oMini.count === 0) ? gpt4o.count || gpt4oMini.count : `${gpt4o.count} <> ${gpt4oMini.count}`, 'GPT-4o': gpt4o.count ? Number(gpt4o.scoreSum / gpt4o.count * 100).toFixed(2) : '-',
					'GPT-4o-mini': gpt4oMini.count ? Number(gpt4oMini.scoreSum / gpt4oMini.count * 100).toFixed(2) : '-',
				};

				modelComparisonTable.push(row);
			}
		}
		if (modelComparisonTable.length !== 0) {
			console.log(`\n${yellow('Suite Summary by Model:')}`);
			console.table(modelComparisonTable);
		}

		console.log(`\n${yellow('Suite Summary by Language:')}`);
		const tableData = buildScoreTable(groupedScores);
		console.table(tableData);
	}

	const changeStats = baseline.compare();
	const scoreToString = createScoreRenderer(opts, canUseBaseline);
	const printChanged = (changedScenarios: IModifiedScenario[]) => {
		for (const scenario of changedScenarios) {
			const prettyScore = `${scoreToString(scenario.prevScore)} -> ${scoreToString(scenario.currScore)}`;
			const color = scenario.currScore > scenario.prevScore ? green : red;
			console.log(`  - [${color(prettyScore)}] ${scenario.name}`);
		}
	};
	if (canUseBaseline) {
		console.log(`\nSummary:`);
		if (!shouldBeBrief && !runningAllTests) {
			console.log(`  Tests Score: ${baseline.currentScore.toFixed(2)}%`);
		}
		if (!shouldBeBrief) {
			console.log(`Overall Score: ${baseline.overallScore.toFixed(2)}%`);
		}
		if (changeStats.nImproved > 0) {
			console.log(`${green('▲')} - Score improved in ${changeStats.nImproved} scenarios`);
		}
		if (changeStats.nWorsened > 0) {
			console.log(`${red('▼')} - Score decreased in ${changeStats.nWorsened} scenarios`);
		}
	} else {
		if (!shouldBeBrief) {
			console.log(`\n${yellow(`Approximate Summary (due to using --n=${opts.nRuns} instead of --n=${BASELINE_RUN_COUNT}):`)}`);
			const score = testResults.reduce((prev, curr) => prev + curr.score, 0);
			console.log(`Overall Approximate Score: ${(score / testsToRun.length * 100).toFixed(2)} / 100`);
		}
		if (changeStats.nImproved > 0) {
			console.log(`${green('▲')} - Score clearly improved in ${changeStats.nImproved} scenarios`);
		}
		if (changeStats.nWorsened > 0) {
			console.log(`${red('▼')} - Score clearly decreased in ${changeStats.nWorsened} scenarios`);
		}
	}
	if (changeStats.nUnchanged > 0) {
		console.log(`= - Score unchanged in ${changeStats.nUnchanged} scenarios`);
	}
	if (changeStats.addedScenarios > 0) {
		console.log(`${violet('◆')} - New scenarios count - ${changeStats.addedScenarios}`);
	}
	if (changeStats.removedScenarios > 0) {
		console.log(`${orange('●')} - Missing ${changeStats.removedScenarios} scenarios.`);
	}
	if (changeStats.skippedScenarios > 0) {
		console.log(`${yellow('●')} - Skipped ${changeStats.skippedScenarios} scenarios.`);
	}

	if (changeStats.improvedScenarios.length > 0 || changeStats.worsenedScenarios.length > 0) {
		console.log();
	}
	if (changeStats.improvedScenarios.length > 0) {
		console.log(`${green('Improved')}:`);
		printChanged(changeStats.improvedScenarios);
	}
	if (changeStats.worsenedScenarios.length > 0) {
		console.log(`${red('Worsened')}:`);
		printChanged(changeStats.worsenedScenarios);
	}

	console.log(`\n  Simulation finished(${printTime(totalTime)}) \n`);
}

function buildScoreTable(groupedScores: GroupedScores): object[] {
	const tableData: object[] = [];
	for (const [suiteName, scoresPerSuite] of groupedScores.entries()) {
		for (const [language, scoresPerLanguage] of scoresPerSuite.entries()) {
			for (const [model, scoresPerModel] of scoresPerLanguage.entries()) {
				const row = {
					Suite: suiteName,
					Language: language ?? '-',
					Model: model ?? '-',
					'# of tests': scoresPerModel.length,
					'Score(%)': Number((scoresPerModel.reduce((acc, curr) => acc + curr, 0) / scoresPerModel.length * 100).toFixed(2)),
				};
				tableData.push(row);
			}
		}
	}
	return tableData;
}

function validateChangeStats(changeStats: ICompleteBaselineComparison): { errorMessage: string } | undefined {
	if (changeStats.nWorsened > 0) {
		// if any worsened, fail
		return { errorMessage: 'Some scenarios have worsened' };
	}
	if (changeStats.nImproved > 0) {
		// if any improved, fail
		return { errorMessage: 'Some scenarios have improved' };
	}
	if (changeStats.addedScenarios > 0) {
		// if any added, fail
		return { errorMessage: 'New scenarios detected' };
	}
	if (changeStats.removedScenarios > 0) {
		// if any removed, fail
		return { errorMessage: 'Some scenarios were removed' };
	}
	if (changeStats.mandatory.skippedScenarios > 0) {
		// only fail if mandatory scenarios are skipped
		return { errorMessage: 'Some mandatory scenarios were skipped' };
	}
	return undefined;
}

function writeHeapSnapshot(snapshotFilename: boolean | string | undefined, label: 'before' | 'after') {
	if (snapshotFilename === undefined || snapshotFilename === false) {
		return;
	}

	const fileName = typeof snapshotFilename === 'string' ? `${snapshotFilename}-${label}.heapsnapshot` : undefined;
	console.log(`Writing heap snapshot: ${v8.writeHeapSnapshot(fileName)}`);
}

async function clearOrCreateDir(path: string) {
	if (await fileExists(path)) {
		await fs.promises.rm(path, { recursive: true, force: true });
	}
	await fs.promises.mkdir(path, { recursive: true });
}

function toCsv(rows: object[]): string {
	if (rows.length === 0) { return ''; }

	const header = Object.keys(rows[0]).join(',') + '\n';
	const rowsStr = rows.map(obj => Object.values(obj).join(',') + '\n').join('');

	return header + rowsStr;
}

function parseModelConfigFile(modelConfigFilePath: string): IModelConfig[] {
	const resolvedModelConfigFilePath = path.isAbsolute(modelConfigFilePath) ? modelConfigFilePath : path.join(process.cwd(), modelConfigFilePath);
	const configFileContents = fs.readFileSync(resolvedModelConfigFilePath, 'utf-8');

	let modelConfig: any;
	try {
		modelConfig = JSON.parse(configFileContents);
	} catch (error) {
		throw new Error(`Invalid JSON configuration file ${resolvedModelConfigFilePath}: ${error.message}`);
	}

	if (!modelConfig || typeof modelConfig !== 'object') {
		throw new Error('Invalid configuration file ' + resolvedModelConfigFilePath);
	}

	/**
	 * the modelConfigFile.json should contain objects of the form:
	```
		"<model id>": {
			"name": "<model name>",
			"version": "<model version>",
			"type": "<model type>", // 'openai' or 'azureOpenai'
			"useDeveloperRole": <boolean>, // optional, defaults to false
			"url": "<endpoint URL>",
			"capabilities"?: {
				"supports"?: {
					"parallel_tool_calls"?: <boolean>,
					"streaming"?: <boolean>,
					"tool_calls"?: <boolean>,
					"vision"?: <boolean>,
					"prediction"?: <boolean>
				},
				"limits"?: {
					"max_prompt_tokens"?: <number>,
					"max_output_tokens"?: <number>,
					"max_context_window_tokens"?: <number>
				}
			},
			"auth?": {
				"useBearerHeader"?: <boolean>, // Use Bearer token for authentication. Defaults to false
				"useApiKeyHeader"?: <boolean>, // Use API key for authentication. Defaults to false
				"apiKeyEnvName": "<environment variable name for API key to be used for the above headers>"
			},
			"overrides"?: {
				"requestHeaders"?: { "<header name>": "<header value>" }, // optional, custom request headers
				"temperature"?: <number> | null, // optional, if null removes from request body
				"top_p"?: <number> | null, // optional, if null removes from request body
				"snippy"?: <boolean> | null, // optional, if null removes from request body
				"max_tokens"?: <number> | null, // optional, if null removes from request body
				"max_completion_tokens"?: <number> | null, // optional, if null removes from request body
				"intent"?: <boolean> | null // optional, if null removes from request body
			}
		},
		...
	```
	*/

	const checkProperty = (obj: any, prop: string, type: 'string' | 'boolean' | 'number' | 'object', optional?: boolean, nullable?: boolean) => {
		if (!(prop in obj)) {
			if (optional) {
				return;
			}
			throw new Error(`Missing property '${prop}' in model configuration file ${resolvedModelConfigFilePath}`);
		}

		if (nullable && obj[prop] === null) {
			return;
		}

		if (typeof obj[prop] !== type) {
			throw new Error(`Property '${prop}' in model configuration file ${resolvedModelConfigFilePath} must be of type '${type}', but got '${typeof obj[prop]}'`);
		}
	};

	const modelConfigs: IModelConfig[] = [];
	for (const modelId in modelConfig) {
		const model = modelConfig[modelId];
		if (typeof model !== 'object') {
			throw new Error(`Model configuration for '${modelId}' must be an object`);
		}
		checkProperty(model, 'name', 'string');
		checkProperty(model, 'version', 'string');
		checkProperty(model, 'type', 'string');
		if (model.type !== 'openai' && model.type !== 'azureOpenai') {
			throw new Error(`Model type '${model.type}' is not supported. Only 'openai' and 'azureOpenai' are allowed.`);
		}
		checkProperty(model, 'useDeveloperRole', 'boolean', true);
		checkProperty(model, 'url', 'string');

		checkProperty(model, 'capabilities', 'object', true);
		checkProperty(model.capabilities, 'supports', 'object', true);
		if (model.capabilities?.supports) {
			checkProperty(model.capabilities.supports, 'parallel_tool_calls', 'boolean', true);
			checkProperty(model.capabilities.supports, 'streaming', 'boolean', true);
			checkProperty(model.capabilities.supports, 'tool_calls', 'boolean', true);
			checkProperty(model.capabilities.supports, 'vision', 'boolean', true);
			checkProperty(model.capabilities.supports, 'prediction', 'boolean', true);
			checkProperty(model.capabilities.supports, 'thinking', 'boolean', true);
		}

		checkProperty(model.capabilities, 'limits', 'object', true);
		if (model.capabilities?.limits) {
			checkProperty(model.capabilities.limits, 'max_prompt_tokens', 'number', true);
			checkProperty(model.capabilities.limits, 'max_output_tokens', 'number', true);
			checkProperty(model.capabilities.limits, 'max_context_window_tokens', 'number', true);
		}

		checkProperty(model, 'auth', 'object', true);
		if (model.auth) {
			checkProperty(model.auth, 'useBearerHeader', 'boolean', true);
			checkProperty(model.auth, 'useApiKeyHeader', 'boolean', true);
			checkProperty(model.auth, 'apiKeyEnvName', 'string');
		}

		checkProperty(model, 'overrides', 'object', true);
		if (model.overrides) {
			const overrides = model.overrides;
			checkProperty(overrides, 'requestHeaders', 'object', true, true);
			checkProperty(overrides, 'temperature', 'number', true, true);
			checkProperty(overrides, 'top_p', 'number', true, true);
			checkProperty(overrides, 'snippy', 'boolean', true, true);
			checkProperty(overrides, 'intent', 'boolean', true, true);
			checkProperty(overrides, 'max_tokens', 'number', true, true);
			checkProperty(overrides, 'max_completion_tokens', 'number', true, true);
		}

		// Validate supported_endpoints
		if (model.supported_endpoints) {
			if (!Array.isArray(model.supported_endpoints)) {
				throw new Error(`Property 'supported_endpoints' in model configuration file ${resolvedModelConfigFilePath} must be an array`);
			}
			for (const endpointSuffix of model.supported_endpoints) {
				if (!Object.values(ModelSupportedEndpoint).includes(endpointSuffix as ModelSupportedEndpoint)) {
					throw new Error(`Invalid endpoint suffix '${endpointSuffix}' in supported_endpoints for model '${modelId}'. Must be one of: ${Object.values(ModelSupportedEndpoint).join(', ')}`);
				}
			}
		}

		modelConfigs.push({
			id: modelId,
			name: model.name,
			version: model.version,
			type: model.type,
			useDeveloperRole: model.useDeveloperRole ?? false,
			url: model.url,
			capabilities: {
				supports: {
					parallel_tool_calls: model.capabilities?.supports?.parallel_tool_calls ?? false,
					streaming: model.capabilities?.supports?.streaming ?? false,
					tool_calls: model.capabilities?.supports?.tool_calls ?? false,
					vision: model.capabilities?.supports?.vision ?? false,
					prediction: model.capabilities?.supports?.prediction ?? false,
					thinking: model.capabilities?.supports?.thinking ?? false
				},
				limits: {
					max_prompt_tokens: model.capabilities?.limits?.max_prompt_tokens ?? 128000,
					max_output_tokens: model.capabilities?.limits?.max_output_tokens ?? Number.MAX_SAFE_INTEGER,
					max_context_window_tokens: model.capabilities?.limits?.max_context_window_tokens
				}
			},
			supported_endpoints: model.supported_endpoints?.length ? model.supported_endpoints as ModelSupportedEndpoint[] : [ModelSupportedEndpoint.ChatCompletions],
			auth: {
				useBearerHeader: model.auth?.useBearerHeader ?? false,
				useApiKeyHeader: model.auth?.useApiKeyHeader ?? false,
				apiKeyEnvName: model.auth?.apiKeyEnvName
			},
			overrides: {
				requestHeaders: model.overrides?.hasOwnProperty('requestHeaders') ? model.overrides.requestHeaders : {},
				temperature: model.overrides?.hasOwnProperty('temperature') ? model.overrides.temperature : undefined,
				top_p: model.overrides?.hasOwnProperty('top_p') ? model.overrides.top_p : undefined,
				snippy: model.overrides?.hasOwnProperty('snippy') ? model.overrides.snippy : undefined,
				intent: model.overrides?.hasOwnProperty('intent') ? model.overrides.intent : undefined,
				max_tokens: model.overrides?.hasOwnProperty('max_tokens') ? model.overrides.max_tokens : undefined,
				max_completion_tokens: model.overrides?.hasOwnProperty('max_completion_tokens') ? model.overrides.max_completion_tokens : undefined,
			}
		});
	}

	return modelConfigs;
}

(async () => main())();
