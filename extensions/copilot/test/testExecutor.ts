/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'path';
import { IPromptWorkspaceLabels, PromptWorkspaceLabels } from '../src/extension/context/node/resolvers/promptWorkspaceLabels';
import { INewWorkspacePreviewContentManager, NewWorkspacePreviewContentManagerImpl } from '../src/extension/intents/node/newIntent';
import { IntentError } from '../src/extension/prompt/node/intents';
import { ISimulationModelConfig } from '../src/extension/test/node/services';
import { IToolsService } from '../src/extension/tools/common/toolsService';
import { TestToolsService } from '../src/extension/tools/node/test/testToolsService';
import { IEndpointProvider } from '../src/platform/endpoint/common/endpointProvider';
import { TestEndpointProvider } from '../src/platform/endpoint/test/node/testEndpointProvider';
import { ConsoleLog, ILogService, LogServiceImpl } from '../src/platform/log/common/logService';
import { APIUsage } from '../src/platform/networking/common/openai';
import { ISimulationTestContext } from '../src/platform/simulationTestContext/common/simulationTestContext';
import { ITasksService } from '../src/platform/tasks/common/tasksService';
import { TestTasksService } from '../src/platform/tasks/common/testTasksService';
import { TestingServiceCollection } from '../src/platform/test/node/services';
import { ITokenizerProvider } from '../src/platform/tokenizer/node/tokenizer';
import { count } from '../src/util/common/arrays';
import { WellKnownLanguageId } from '../src/util/common/languages';
import { groupBy } from '../src/util/vs/base/common/collections';
import { BugIndicatingError } from '../src/util/vs/base/common/errors';
import { Lazy } from '../src/util/vs/base/common/lazy';
import { safeStringify } from '../src/util/vs/base/common/objects';
import { SyncDescriptor } from '../src/util/vs/platform/instantiation/common/descriptors';
import { SimulationExtHostToolsService } from './base/extHostContext/simulationExtHostToolsService';
import { SimulationBaseline, TestBaselineComparison } from './base/simulationBaseline';
import { CacheMode, createSimulationAccessor, CurrentTestRunInfo, SimulationServicesOptions } from './base/simulationContext';
import { ISimulationEndpointHealth } from './base/simulationEndpointHealth';
import { SimulationOptions } from './base/simulationOptions';
import { ISimulationOutcome } from './base/simulationOutcome';
import { FetchRequestCollector } from './base/spyingChatMLFetcher';
import { ISimulationTestRuntime, SimulationTest, SimulationTestRuntime, toDirname } from './base/stest';
import { IJSONOutputPrinter } from './jsonOutputPrinter';
import { green, red, violet, yellow } from './outputColorer';
import { ExternalSimulationTestRuntime } from './simulation/externalScenarios';
import * as shared from './simulation/shared/sharedTypes';
import { ITestSnapshots, TestSnapshotsImpl } from './simulation/testSnapshot';
import { TaskRunner } from './taskRunner';
import { TestExecutionInExtension } from './testExecutionInExtension';
import { createScoreRenderer, printTime } from './util';

/**
 * Represents outcome of N runs of a scenario.
 */
export interface ITestResult {
	test: string;
	outcomeDirectory: string;
	conversationPath?: string;
	score: number;
	usage: APIUsage;
	// FIXME@ulugbekna: specify when the outcome is undefined
	outcomes: (shared.SimulationTestOutcome | undefined)[];
	duration: number;
	cacheInfo: TestRunCacheInfo[];
	originalResults: ITestRunResult[];
}

interface ITestRunResultCommon {
	contentFilterCount: number;
	usage: APIUsage;
	cacheInfo: TestRunCacheInfo;
	hasCacheMiss: boolean;
}

interface ITestRunResultPass extends ITestRunResultCommon {
	kind: 'pass';
	explicitScore: number | undefined;
	duration: number;
	outcome: shared.SimulationTestOutcome | undefined;
}

interface ITestRunResultFail extends ITestRunResultCommon {
	kind: 'fail';
	message: string;
	duration: number;
	outcome: shared.SimulationTestOutcome;
}

/**
 * Represents outcome of a single run of a scenario.
 */
export type ITestRunResult = ITestRunResultPass | ITestRunResultFail;

export type CacheInfo = { type: 'request'; key: string }; // TODO: add other caches here

export type TestRunCacheInfo = CacheInfo[];

export interface SimulationTestContext {
	opts: SimulationOptions;
	baseline: SimulationBaseline;
	canUseBaseline: boolean;
	jsonOutputPrinter: IJSONOutputPrinter;
	outputPath: string;
	externalScenariosPath?: string;
	modelConfig: ISimulationModelConfig;
	simulationEndpointHealth: ISimulationEndpointHealth;
	simulationServicesOptions: SimulationServicesOptions;
	simulationOutcome: ISimulationOutcome;
	tokenizerProvider: ITokenizerProvider;
}

export type GroupedScores = Map<string, Map<WellKnownLanguageId | undefined, Map<string | undefined, number[]>>>;

function mergeGroupedScopes(into: GroupedScores, from: GroupedScores) {
	for (const [key, value] of from) {
		const intoValue = into.get(key);
		if (!intoValue) {
			into.set(key, value);
			continue;
		}

		for (const [language, scores] of value) {
			const intoScores = intoValue.get(language);
			if (intoScores) {
				for (const [model, score] of scores) {
					if (intoScores.has(model)) {
						intoScores.set(model, [...intoScores.get(model)!, ...score]);
					} else {
						intoScores.set(model, score);
					}
				}
			} else {
				intoValue.set(language, scores);
			}
		}
	}
}

export type ExecuteTestResult = {
	testResultsPromises: Promise<ITestResult>[];
	getGroupedScores(): Promise<GroupedScores>;
};

export async function executeTests(ctx: SimulationTestContext, testsToRun: readonly SimulationTest[]): Promise<ExecuteTestResult> {
	const location = groupBy(testsToRun as SimulationTest[], test => (test.suite.extHost ?? ctx.opts.inExtensionHost) ? 'extHost' : 'local');

	const extensionRunner = new Lazy(() => TestExecutionInExtension.create(ctx));
	const [extHost, local] = await Promise.all([
		executeTestsUsing(ctx, location['extHost'] ?? [], (...args) => extensionRunner.value.then(e => e.executeTest(...args))),
		executeTestsUsing(ctx, location['local'] ?? [], executeTestOnce),
	]);

	return {
		testResultsPromises: [...extHost.testResultsPromises, ...local.testResultsPromises],
		getGroupedScores: async () => {
			const [fromExtHost, fromLocal] = await Promise.all([extHost.getGroupedScores(), local.getGroupedScores()]);
			await extensionRunner.rawValue?.then(r => r.dispose());
			mergeGroupedScopes(fromLocal, fromExtHost);
			return fromLocal;
		},
	};
}

async function executeTestsUsing(ctx: SimulationTestContext, testsToRun: readonly SimulationTest[], executeTestFn: ExecuteTestOnceFn): Promise<ExecuteTestResult> {
	const { opts, jsonOutputPrinter } = ctx;
	const groupedScores: Map<string, Map<WellKnownLanguageId | undefined, Map<string | undefined, number[]>>> = new Map();

	const taskRunner = new TaskRunner(opts.parallelism);

	const testResultsPromises: Promise<ITestResult>[] = [];
	for (const test of testsToRun) {

		if (test.options.optional && (test.options.skip(ctx.opts) || opts.ci)) { // CI never runs optional stests
			// Avoid spamming the console, we now have very many skipped stests
			// console.log(`  Skipping ${test.fullName}`);
			ctx.baseline.setSkippedTest(test.fullName);
			jsonOutputPrinter.print({ type: shared.OutputType.skippedTest, name: test.fullName });
			continue;
		}

		const testRun = executeTestNTimes(ctx, taskRunner, test, groupedScores, executeTestFn);

		testResultsPromises.push(testRun);

		if (opts.parallelism === 1) {
			await testRun;
		}
	}

	return {
		testResultsPromises,
		getGroupedScores: async () => {
			await Promise.all(testResultsPromises);
			return groupedScores;
		},
	};
}

/** Runs a single scenario `nRuns` times. */
async function executeTestNTimes(
	ctx: SimulationTestContext,
	taskRunner: TaskRunner,
	test: SimulationTest,
	groupedScores: Map<string, Map<WellKnownLanguageId | undefined, Map<string | undefined, number[]>>>,
	executeTestFn: ExecuteTestOnceFn
): Promise<ITestResult> {

	const { opts } = ctx;

	const outcomeDirectory = path.join(ctx.outputPath, toDirname(test.fullName));

	const testStartTime = Date.now();

	const scheduledTestRuns: Promise<ITestRunResult>[] = [];
	for (let kthRun = 0; kthRun < opts.nRuns; kthRun++) {
		scheduledTestRuns.push(taskRunner.run(() => executeTestFn(ctx, taskRunner.parallelism, outcomeDirectory, test, kthRun)));
	}

	const runResults: ITestRunResult[] = await Promise.all(scheduledTestRuns);

	const testElapsedTime = Date.now() - testStartTime;

	const testSummary = {
		results: runResults,
		hasCacheMisses: runResults.some(x => x.hasCacheMiss),
		contentFilterCount: runResults.filter(x => x.contentFilterCount > 0).length,
	};

	if (!opts.externalScenarios) {
		await ctx.simulationOutcome.set(test, testSummary.results);
	}

	const testResultToScore = (result: ITestRunResult) => result.kind === 'pass' ? (result.explicitScore ?? 1) : 0;

	const scoreTotal = Math.round(testSummary.results.reduce((total, result) => total + testResultToScore(result), 0) * 1000) / 1000;

	const currentScore = scoreTotal / testSummary.results.length;

	const currentPassCount = count(testSummary.results, s => s.kind === 'pass');

	const baselineComparison = ctx.baseline.setCurrentResult({
		name: test.fullName,
		optional: test.options.optional ? true : undefined,
		contentFilterCount: testSummary.contentFilterCount,
		passCount: currentPassCount,
		failCount: testSummary.results.length - currentPassCount,
		score: currentScore,
		attributes: test.attributes
	});

	printTestRunResultsToCli({ testSummary, ctx, test, currentScore, testElapsedTime, baselineComparison, });

	if (opts.verbose !== undefined) {
		printVerbose(opts, testSummary);
	}

	updateGroupedScores({ test, currentScore, groupedScores });

	const duration = testSummary.results.reduce((acc, c) => acc + c.duration, 0);

	const initial: APIUsage = { completion_tokens: 0, prompt_tokens: 0, total_tokens: 0, prompt_tokens_details: { cached_tokens: 0 } };
	const usage: APIUsage = testSummary.results.reduce((acc, c): APIUsage => {
		if (c.usage === undefined) { return acc; }
		const { completion_tokens, prompt_tokens, total_tokens, prompt_tokens_details } = c.usage;
		return {
			completion_tokens: acc.completion_tokens + completion_tokens,
			prompt_tokens: acc.prompt_tokens + prompt_tokens,
			total_tokens: acc.total_tokens + total_tokens,
			prompt_tokens_details: {
				cached_tokens: (acc.prompt_tokens_details?.cached_tokens ?? 0) + (prompt_tokens_details?.cached_tokens ?? 0),
			}
		} satisfies APIUsage;
	}, initial);

	return {
		test: test.fullName,
		outcomeDirectory: path.relative(ctx.outputPath, outcomeDirectory),
		conversationPath: test.options.conversationPath,
		score: currentScore,
		duration,
		usage,
		outcomes: testSummary.results.map(r => r.outcome),
		cacheInfo: testSummary.results.map(r => r.cacheInfo),
		originalResults: testSummary.results,
	};
}

function printTestRunResultsToCli({ testSummary, ctx, test, currentScore, testElapsedTime, baselineComparison }: {
	testSummary: {
		contentFilterCount: number;
		results: ITestRunResult[];
		hasCacheMisses: boolean;
	};
	ctx: SimulationTestContext;
	test: SimulationTest;
	currentScore: number;
	testElapsedTime: number;
	baselineComparison: TestBaselineComparison;
}) {

	const scoreToString = createScoreRenderer(ctx.opts, ctx.canUseBaseline);
	const didScoreChange = !baselineComparison.isNew && baselineComparison.prevScore !== baselineComparison.currScore;
	const prettyScoreValue = didScoreChange
		? `${scoreToString(baselineComparison.prevScore)} -> ${scoreToString(baselineComparison.currScore)}`
		: `${scoreToString(currentScore)}`;

	let icon = '=';
	let color = (x: string | number) => x;
	if (baselineComparison.isNew) {
		icon = '◆';
		color = violet;
	} else if (baselineComparison.isImproved) {
		icon = '▲';
		color = green;
	} else if (baselineComparison.isWorsened) {
		icon = '▼';
		color = red;
	}

	const prettyTestTime = ctx.opts.parallelism === 1 ? ` (${(testElapsedTime > 10 ? yellow(printTime(testElapsedTime)) : printTime(testElapsedTime))})` : '';

	const prettyContentFilter = (testSummary.contentFilterCount ? yellow(` (⚠️ content filter affected ${testSummary.contentFilterCount} runs)`) : '');

	const hadCacheMisses = testSummary.hasCacheMisses ? yellow(' (️️️💸 cache miss)') : '';

	console.log(`  ${color(icon)} [${color(prettyScoreValue)}] ${color(test.fullName)}${prettyTestTime}${hadCacheMisses}${prettyContentFilter}`);
}

function printVerbose(
	opts: SimulationOptions,
	testSummary: {
		contentFilterCount: number;
		results: ITestRunResult[];
	}
) {
	for (let i = 0; i < testSummary.results.length; i++) {
		const result = testSummary.results[i];

		console.log(`    ${i + 1} - ${result.kind === 'pass' ? green(result.kind) : red(result.kind)}`);
		if (result.kind === 'fail' && result.message && opts.verbose !== 0) {
			// indent the message and print
			console.error(result.message.split(/\r\n|\r|\n/g).map(line => `      ${line}`).join('\n'));
		}
	}
}

function updateGroupedScores({ test, currentScore, groupedScores }: {
	test: SimulationTest;
	currentScore: number;
	groupedScores: Map<string, Map<string | undefined, Map<string | undefined, number[]>>>;
}) {
	const suiteName = test.suite.fullName;
	const model = test.model;
	if (groupedScores.has(suiteName)) {
		const scoresPerSuite = groupedScores.get(suiteName);
		if (scoresPerSuite!.has(test.language)) {
			const scoresPerLanguage = scoresPerSuite!.get(test.language);
			if (scoresPerLanguage!.has(model)) {
				scoresPerLanguage!.set(model, [...scoresPerLanguage!.get(model)!, currentScore]);
			} else {
				scoresPerLanguage?.set(model, [currentScore]);
			}
		} else {
			scoresPerSuite!.set(test.language, new Map([[model, [currentScore]]]));
		}
	} else {
		groupedScores.set(suiteName, new Map());
		groupedScores.get(suiteName)!.set(test.language, new Map([[model, [currentScore]]]));
	}
}

type ExecuteTestOnceFn = (
	ctx: SimulationTestContext,
	parallelism: number,
	outcomeDirectory: string,
	test: SimulationTest,
	runNumber: number,
) => Promise<ITestRunResult>;

export const executeTestOnce = async (
	ctx: SimulationTestContext,
	parallelism: number,
	outcomeDirectory: string,
	test: SimulationTest,
	runNumber: number,
	isInRealExtensionHost = false,
) => {
	const { opts, jsonOutputPrinter } = ctx;
	const fetchRequestCollector = new FetchRequestCollector();

	const currentTestRunInfo: CurrentTestRunInfo = {
		test,
		testRunNumber: runNumber,
		fetchRequestCollector: fetchRequestCollector,
		isInRealExtensionHost,
	};

	let testingServiceCollection: TestingServiceCollection;
	try {
		testingServiceCollection = await createSimulationAccessor(
			ctx.modelConfig,
			ctx.simulationServicesOptions,
			currentTestRunInfo
		);
	} catch (e) {
		const msg = e instanceof Error ? (e.stack ?? e.message) : String(e);
		console.error(`Error in createSimulationAccessor`, e);
		jsonOutputPrinter.print({ type: shared.OutputType.testRunStart, name: test.fullName, runNumber } satisfies shared.ITestRunStartOutput);
		jsonOutputPrinter.print({
			type: shared.OutputType.testRunEnd,
			name: test.fullName,
			runNumber,
			duration: 0,
			writtenFiles: [],
			error: msg,
			pass: false,
			explicitScore: undefined,
			annotations: undefined,
			averageRequestDuration: undefined,
			requestCount: 0,
			hasCacheMiss: false,
		} satisfies shared.ITestRunEndOutput);
		return {
			kind: 'fail',
			message: msg,
			contentFilterCount: 0,
			duration: 0,
			usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
			outcome: { kind: 'failed', error: msg, hitContentFilter: false, critical: true },
			cacheInfo: [],
			hasCacheMiss: false,
		} satisfies ITestRunResultFail;
	}

	testingServiceCollection.define(ISimulationOutcome, ctx.simulationOutcome);
	testingServiceCollection.define(ITokenizerProvider, ctx.tokenizerProvider);
	testingServiceCollection.define(ISimulationEndpointHealth, ctx.simulationEndpointHealth);
	testingServiceCollection.define(IJSONOutputPrinter, ctx.jsonOutputPrinter);
	testingServiceCollection.define(ITasksService, new TestTasksService());

	if (test.model || test.embeddingType) {
		// We prefer opts that come from the CLI over test specific args since Opts are global and must apply to the entire simulation
		const smartChatModel = (opts.smartChatModel ?? opts.chatModel) ?? test.model;
		const fastChatModel = (opts.fastChatModel ?? opts.chatModel) ?? test.model;
		const fastRewriteModel = (opts.fastRewriteModel ?? opts.chatModel) ?? test.model;
		testingServiceCollection.define(IEndpointProvider, new SyncDescriptor(TestEndpointProvider, [smartChatModel, fastChatModel, fastRewriteModel, currentTestRunInfo, opts.modelCacheMode === CacheMode.Disable, undefined]));
	}

	const simulationTestRuntime = (ctx.externalScenariosPath !== undefined)
		? new ExternalSimulationTestRuntime(ctx.outputPath, outcomeDirectory, runNumber)
		: new SimulationTestRuntime(ctx.outputPath, outcomeDirectory, runNumber);
	testingServiceCollection.define(ISimulationTestRuntime, simulationTestRuntime);
	testingServiceCollection.define(ISimulationTestContext, simulationTestRuntime);
	testingServiceCollection.define(ILogService, new SyncDescriptor(LogServiceImpl, [[new ConsoleLog(`🪵 ${currentTestRunInfo.test.fullName} (Run #${currentTestRunInfo.testRunNumber + 1}):\n`), simulationTestRuntime]]));

	testingServiceCollection.define(INewWorkspacePreviewContentManager, new SyncDescriptor(NewWorkspacePreviewContentManagerImpl));

	let snapshots: TestSnapshotsImpl | undefined;
	if (test.options.location) {
		snapshots = new TestSnapshotsImpl(test.options.location.path, test.fullName, runNumber);
		testingServiceCollection.define(ITestSnapshots, snapshots);
	}

	testingServiceCollection.define(IPromptWorkspaceLabels, new SyncDescriptor(PromptWorkspaceLabels));
	if (isInRealExtensionHost) {
		testingServiceCollection.define(IToolsService, new SyncDescriptor(SimulationExtHostToolsService, [ctx.simulationServicesOptions.disabledTools]));
	} else {
		testingServiceCollection.define(IToolsService, new SyncDescriptor(TestToolsService, [ctx.simulationServicesOptions.disabledTools]));
	}

	jsonOutputPrinter.print({ type: shared.OutputType.testRunStart, name: test.fullName, runNumber } satisfies shared.ITestRunStartOutput);
	if (process.stdout.isTTY && parallelism === 1) {
		process.stdout.write(`  Running scenario: ${test.fullName} - ${runNumber + 1}/${opts.nRuns}`.substring(0, process.stdout.columns - 1));
	}

	const testStartTime = Date.now();
	let pass = true;
	let err: unknown | undefined;
	try {
		await test.run(testingServiceCollection);
		await snapshots?.dispose();

		await fetchRequestCollector.complete();

		const result: ITestRunResultPass = {
			kind: 'pass',
			explicitScore: simulationTestRuntime.getExplicitScore(),
			usage: fetchRequestCollector.usage,
			contentFilterCount: fetchRequestCollector.contentFilterCount,
			duration: Date.now() - testStartTime,
			outcome: simulationTestRuntime.getOutcome(),
			cacheInfo: fetchRequestCollector.cacheInfo,
			hasCacheMiss: fetchRequestCollector.hasCacheMiss,
		};

		return result;
	} catch (e) {
		pass = false;
		err = e;
		let msg = err instanceof Error ? (err.stack ? err.stack : err.message) : safeStringify(err);
		await fetchRequestCollector.complete();

		let critical = false;
		if (e instanceof BugIndicatingError || e instanceof TypeError) {
			critical = true;
		}
		if (e instanceof CriticalError) {
			critical = true;
			msg = e.message;
		}

		const result: ITestRunResultFail = {
			kind: 'fail',
			message: msg,
			contentFilterCount: fetchRequestCollector.contentFilterCount,
			duration: Date.now() - testStartTime,
			usage: fetchRequestCollector.usage,
			outcome: {
				kind: 'failed',
				error: msg,
				hitContentFilter: fetchRequestCollector.contentFilterCount > 0,
				critical,
			},
			cacheInfo: fetchRequestCollector.cacheInfo,
			hasCacheMiss: fetchRequestCollector.hasCacheMiss,
		};

		return result;
	} finally {
		// (context.safeGet(ILanguageFeaturesService) as { dispose?: () => Promise<void> })?.dispose?.();

		await simulationTestRuntime.writeFile(shared.SIMULATION_REQUESTS_FILENAME, JSON.stringify(fetchRequestCollector.interceptedRequests.map(r => r.toJSON()), undefined, 2), shared.REQUESTS_TAG);

		if (err) {
			simulationTestRuntime.log(`Scenario failed due to an error:`, err);
			if ((<any>err).code !== 'ERR_ASSERTION' && !(err instanceof IntentError)) {
				// Make visible to the console unexpected errors
				console.log(`Scenario ${test.fullName} failed due to an error:`);
				console.log(err);
			}
		}

		await simulationTestRuntime.flushLogs();

		jsonOutputPrinter.print({
			type: shared.OutputType.testRunEnd,
			name: test.fullName,
			runNumber,
			duration: Date.now() - testStartTime,
			writtenFiles: simulationTestRuntime.getWrittenFiles(),
			error: err instanceof Error ? `${err.message}\n${err.stack}` : JSON.stringify(err),
			pass,
			explicitScore: simulationTestRuntime.getExplicitScore(),
			annotations: simulationTestRuntime.getOutcome()?.annotations,
			averageRequestDuration: fetchRequestCollector.averageRequestDuration,
			requestCount: fetchRequestCollector.interceptedRequests.length,
			hasCacheMiss: fetchRequestCollector.hasCacheMiss,
		} satisfies shared.ITestRunEndOutput);
		if (process.stdout.isTTY && parallelism === 1) {
			process.stdout.write('\r\x1b[K');
		}

		testingServiceCollection.dispose();
	}
};

/**
 * When thrown, fails stest CI.
*/
export class CriticalError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CriticalError';
	}
}
