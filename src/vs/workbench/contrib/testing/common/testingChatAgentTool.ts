/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, raceCancellationError, RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { CancellationError, getErrorMessage, isCancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { basename, isAbsolute } from '../../../../base/common/path.js';
import { Mutable } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import {
	CountTokensCallback,
	ILanguageModelToolsService,
	IPreparedToolInvocation,
	IToolData,
	IToolImpl,
	IToolInvocation,
	IToolInvocationPreparationContext,
	IToolResult,
	ToolDataSource,
	ToolProgress,
} from '../../chat/common/tools/languageModelToolsService.js';
import { TestId } from './testId.js';
import { FileCoverage, TestCoverage, getTotalCoveragePercent } from './testCoverage.js';
import { collectTestStateCounts, getTestProgressText } from './testingProgressMessages.js';
import { isFailedState } from './testingStates.js';
import { ITestResult, LiveTestResult } from './testResult.js';
import { ITestResultService } from './testResultService.js';
import { ITestService, testsInFile, waitForTestToBeIdle } from './testService.js';
import { DetailType, IncrementalTestCollectionItem, TestItemExpandState, TestMessageType, TestResultState, TestRunProfileBitset } from './testTypes.js';
import { Position } from '../../../../editor/common/core/position.js';
import { ITestProfileService } from './testProfileService.js';

export class TestingChatAgentToolContribution extends Disposable implements IWorkbenchContribution {
	public static readonly ID = 'workbench.contrib.testing.chatAgentTool';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
	) {
		super();
		const runTestsTool = instantiationService.createInstance(RunTestTool);
		this._register(toolsService.registerTool(RunTestTool.DEFINITION, runTestsTool));
		this._register(toolsService.executeToolSet.addTool(RunTestTool.DEFINITION));

		const testFailureTool = instantiationService.createInstance(TestFailureTool);
		this._register(toolsService.registerTool(TestFailureTool.DEFINITION, testFailureTool));
		this._register(toolsService.executeToolSet.addTool(TestFailureTool.DEFINITION));
	}
}

export const enum TestRunMode {
	Run = 'run',
	Coverage = 'coverage',
}

const enum TestFileExistence {
	Exists,
	Missing,
	CheckError,
}

const enum TestDiscoveryState {
	Pending,
	Failed,
	Completed,
	Unknown,
}

interface IRunTestToolParams {
	files?: string[];
	testNames?: string[];
	/** File paths to return coverage info for (only used when mode === 'coverage') */
	coverageFiles?: string[];
	mode?: TestRunMode;
}

interface IDiscoveredTestFile {
	path: string;
	uri: URI | undefined;
	existence: TestFileExistence;
	checkError?: string;
	tests: IncrementalTestCollectionItem[];
	filtered: IncrementalTestCollectionItem[];
	discovery: TestDiscoveryState;
	errors: string[];
	discoveryRoots: Set<string>;
}

export class RunTestTool implements IToolImpl {
	public static readonly ID = 'runTests';
	public static readonly DEFINITION: IToolData = {
		id: this.ID,
		toolReferenceName: 'runTests',
		legacyToolReferenceFullNames: ['runTests'],
		displayName: 'Run tests',
		modelDescription: 'Run tests discovered by VS Code to execute tests or validate changes. Prefer focused file paths to avoid long runs. Set mode="coverage" to collect coverage, optionally focused with coverageFiles. If VS Code tests are unavailable or discovery is pending, use the repository\'s configured test command instead; do not repeatedly check the same paths.',
		icon: Codicon.beaker,
		inputSchema: {
			type: 'object',
			properties: {
				files: {
					type: 'array',
					items: { type: 'string' },
					description: 'Absolute paths to the test files to run. If not provided, all test files will be run.',
				},
				testNames: {
					type: 'array',
					items: { type: 'string' },
					description: 'An array of test names to run. Depending on the context, test names defined in code may be strings or the names of functions or classes containing the test cases. If not provided, all tests in the files will be run.',
				},
				mode: {
					type: 'string',
					enum: [TestRunMode.Run, TestRunMode.Coverage],
					description: 'Execution mode: "run" (default) runs tests normally, "coverage" collects coverage.',
				},
				coverageFiles: {
					type: 'array',
					items: { type: 'string' },
					description: 'When mode="coverage": absolute file paths to include detailed coverage info for. If not provided, a file-level summary of all files with incomplete coverage is shown.'
				}
			},
		},
		userDescription: localize('runTestTool.userDescription', 'Run unit tests (optionally with coverage)'),
		source: ToolDataSource.Internal,
		tags: [
			'vscode_editing_with_tests',
			'enable_other_tool_copilot_readFile',
			'enable_other_tool_copilot_listDirectory',
			'enable_other_tool_copilot_findFiles',
			'enable_other_tool_copilot_runTests',
			'enable_other_tool_copilot_runTestsWithCoverage',
			'enable_other_tool_testFailure',
		],
	};

	constructor(
		@ITestService private readonly _testService: ITestService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@ITestResultService private readonly _testResultService: ITestResultService,
		@ITestProfileService private readonly _testProfileService: ITestProfileService,
		@IFileService private readonly _fileService: IFileService,
	) { }

	async invoke(invocation: IToolInvocation, countTokens: CountTokensCallback, progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		if (token.isCancellationRequested) {
			return this._cancelledResult();
		}
		const params: IRunTestToolParams = invocation.parameters;
		const mode = (params.mode === TestRunMode.Coverage ? TestRunMode.Coverage : TestRunMode.Run);
		let group = (mode === TestRunMode.Coverage ? TestRunProfileBitset.Coverage : TestRunProfileBitset.Run);
		const coverageFiles = (mode === TestRunMode.Coverage ? (params.coverageFiles && params.coverageFiles.length ? params.coverageFiles : undefined) : undefined);

		const discovery = await this._discoverTests(params, progress, token);
		if (token.isCancellationRequested) {
			return this._cancelledResult();
		}

		const testCases = discovery.tests;
		const requestedNames = [...new Set(params.testNames?.map(name => name.toLowerCase().trim()) ?? [])];
		const diagnostics = [
			this._formatDiscovery(discovery.files, discovery.errors),
			this._formatUnmatchedNames(this._getUnmatchedNames(requestedNames, testCases)),
		].filter(Boolean).join('\n');
		if (!testCases.length) {
			const hasWorkspaceTests = [...this._testService.collection.rootItems].some(root => root.children.size > 0);
			const message = !params.files?.length && !hasWorkspaceTests
				? localize('runTestTool.noWorkspaceTests', "No tests are available to run through VS Code's test extensions in this workspace. No tests were run; this is not a passing test result.")
				: params.testNames?.length && (!discovery.files.length || discovery.files.some(file => file.tests.length))
					? localize('runTestTool.noNames', "No discovered VS Code tests matched the requested test names. The request has not been validated.")
					: localize('runTestTool.noTests', "No VS Code tests matched the requested files. The request has not been validated.");
			return {
				content: [{ kind: 'text', value: `${message}\n${diagnostics || localize('runTestTool.controllers', "Registered VS Code test controllers: {0}.", [...this._testService.getTestControllers()].length)}\n${this._getUnvalidatedGuidance()}` }],
				toolResultError: message,
			};
		}

		progress.report({ message: localize('runTestTool.invoke.progress', 'Starting test run...') });

		// If the model asks for coverage but the test provider doesn't support it, use normal 'run' mode
		if (group === TestRunProfileBitset.Coverage) {
			if (!testCases.some(tc => this._testProfileService.capabilitiesForTest(tc.item) & TestRunProfileBitset.Coverage)) {
				group = TestRunProfileBitset.Run;
			}
		}

		let result: LiveTestResult | undefined;
		try {
			result = await this._captureTestResult(testCases, group, token);
		} catch (error) {
			if (token.isCancellationRequested) {
				return this._cancelledResult();
			}
			const message = localize('runTestTool.runnerError', "The test runner failed: {0}. The request has not been validated.", getErrorMessage(error));
			return { content: [{ kind: 'text', value: `${message}\n${diagnostics}\n${this._getUnvalidatedGuidance()}` }], toolResultError: message };
		}
		if (token.isCancellationRequested) {
			if (result) {
				this._testService.cancelTestRun(result.id);
			}
			return this._cancelledResult();
		}
		if (!result) {
			return {
				content: [{ kind: 'text', value: `${localize('runTestTool.noRun', "No test run was started. The request has not been validated.")}\n${diagnostics}\n${this._getUnvalidatedGuidance()}` }],
				toolResultError: localize('runTestTool.noRunStarted', 'No test run was started. This may be an issue with your test runner or extension.'),
			};
		}

		await this._monitorRunProgress(result, progress, token);

		if (token.isCancellationRequested) {
			this._testService.cancelTestRun(result.id);
			return this._cancelledResult();
		}

		for (const file of discovery.files) {
			this._updateDiscoveryEvidence(file);
		}
		const unmatchedNames = this._getUnmatchedNames(requestedNames, testCases, result);
		const finalDiagnostics = [
			this._formatDiscovery(discovery.files, discovery.errors),
			this._formatUnmatchedNames(unmatchedNames),
		].filter(Boolean).join('\n');
		const executed = result.counts[TestResultState.Passed] + result.counts[TestResultState.Failed] + result.counts[TestResultState.Errored];
		if (executed === 0) {
			const message = localize('runTestTool.noTestsExecuted', "The test run executed no tests ({0} skipped). This is not a passing test result. The request has not been validated.", result.counts[TestResultState.Skipped]);
			const providerErrors = [...result.tests].flatMap(test => test.item.error ? [typeof test.item.error === 'string' ? test.item.error : test.item.error.value] : []);
			const output = result.tasks.map(task => task.output.getRange(0, task.output.length).toString()).join('\n');
			return {
				content: [{ kind: 'text', value: [message, finalDiagnostics, ...providerErrors, output, this._getUnvalidatedGuidance()].filter(Boolean).join('\n') }],
				toolResultError: message,
			};
		}

		const summary = await buildTestRunSummary(result, mode, coverageFiles);
		const incomplete = unmatchedNames.length > 0 || discovery.errors.length > 0 || discovery.files.some(file => file.existence !== TestFileExistence.Exists || !file.filtered.length || file.discovery === TestDiscoveryState.Pending || file.discovery === TestDiscoveryState.Failed);
		const partialMessage = incomplete ? localize('runTestTool.partial', "Only the matched tests were run. The full request has not been validated.") : undefined;
		const content = [{ kind: 'text', value: [summary, finalDiagnostics, partialMessage, incomplete ? this._getUnvalidatedGuidance() : undefined].filter(Boolean).join('\n') } as const];

		return {
			content: content as Mutable<IToolResult['content']>,
			toolResultMessage: getTestProgressText(collectTestStateCounts(false, [result])),
			toolResultError: partialMessage,
		};
	}

	private _cancelledResult(): IToolResult {
		const message = localize('runTestTool.invoke.cancelled', "Test run was cancelled. The request has not been validated.");
		return { content: [{ kind: 'text', value: message }], toolResultMessage: message };
	}

	private _getUnvalidatedGuidance(): string {
		return [...this._testService.getTestControllers()].length === 0
			? localize('runTestTool.discoveryUnavailable', "VS Code test discovery is unavailable without a registered test controller. Use the repository's configured test command instead of repeatedly checking the same paths.")
			: localize('runTestTool.configuredCommand', "This does not establish that the workspace contains no tests. Use the repository's configured test command if one is defined; otherwise report that no tests could be run. Do not retry this tool unless discovery or configuration changes.");
	}

	/** Updates the UI progress as the test runs, resolving when the run is finished. */
	private async _monitorRunProgress(result: LiveTestResult, progress: ToolProgress, token: CancellationToken): Promise<void> {
		if (result.completedAt !== undefined || token.isCancellationRequested) {
			return;
		}
		const store = new DisposableStore();

		const update = () => {
			const counts = collectTestStateCounts(result.completedAt === undefined, [result]);
			const text = !counts.isRunning && counts.runSoFar === 0
				? localize('runTestTool.invoke.noTestsRun', "No tests were run.")
				: getTestProgressText(counts);
			progress.report({ message: text, progress: counts.totalWillBeRun ? counts.runSoFar / counts.totalWillBeRun : undefined });
		};

		const throttler = store.add(new RunOnceScheduler(update, 500));

		return new Promise<void>(resolve => {
			store.add(result.onChange(() => {
				if (!throttler.isScheduled()) {
					throttler.schedule();
				}
			}));

			store.add(token.onCancellationRequested(() => {
				resolve();
			}));

			store.add(Event.once(result.onComplete)(() => {
				update();
				resolve();
			}));
		}).finally(() => store.dispose());
	}

	/**
	 * Captures the test result. This is a little tricky because some extensions
	 * trigger an 'out of bound' test run, so we actually wait for the first
	 * test run to come in that contains one or more tasks and treat that as the
	 * one we're looking for.
	 */
	private async _captureTestResult(testCases: IncrementalTestCollectionItem[], group: TestRunProfileBitset, token: CancellationToken): Promise<LiveTestResult | undefined> {
		if (token.isCancellationRequested) {
			return undefined;
		}
		const store = new DisposableStore();

		return new Promise<LiveTestResult | undefined>((resolve, reject) => {
			let startedResult: LiveTestResult | undefined;
			let fallbackResult: LiveTestResult | undefined;
			const observed = new Set<LiveTestResult>();
			const finish = (result: LiveTestResult | undefined) => {
				store.dispose();
				resolve(result);
			};
			const observe = (result: LiveTestResult) => {
				if (result.tasks.length) {
					finish(result);
				} else if (!observed.has(result)) {
					observed.add(result);
					store.add(Event.once(result.onNewTask)(() => finish(result)));
					if (result.completedAt !== undefined) {
						fallbackResult ??= result;
					} else {
						store.add(Event.once(result.onComplete)(() => { fallbackResult ??= result; }));
					}
				}
			};
			store.add(token.onCancellationRequested(() => {
				if (startedResult) {
					this._testService.cancelTestRun(startedResult.id);
				}
				finish(undefined);
			}));
			store.add(this._testResultService.onResultsChanged(ev => {
				if ('started' in ev) {
					startedResult = ev.started;
					observe(ev.started);
				}
			}));

			this._testService.runTests({
				group,
				tests: testCases,
				preserveFocus: true,
			}, token).then(result => {
				if (!store.isDisposed) {
					if (result instanceof LiveTestResult) {
						observe(result);
					}
					if (!store.isDisposed) {
						store.add(disposableTimeout(() => finish(fallbackResult), 5_000));
					}
				}
			}, reject);
		}).finally(() => store.dispose());
	}

	private _getUnmatchedNames(names: readonly string[], tests: readonly IncrementalTestCollectionItem[], result?: LiveTestResult): string[] {
		if (!names.length) {
			return [];
		}
		const selectedIds = new Set(tests.map(test => test.item.extId));
		const matched = new Set<string>();
		const items = [...this._testService.collection.all, ...(result?.tests ?? [])];
		for (const test of items) {
			if (![...TestId.fromString(test.item.extId).idsToRoot()].some(id => selectedIds.has(id.toString()))) {
				continue;
			}
			const label = test.item.label.toLowerCase().trim();
			for (const name of names) {
				if (label.includes(name)) {
					matched.add(name);
				}
			}
		}
		return names.filter(name => !matched.has(name));
	}

	private _formatUnmatchedNames(names: readonly string[]): string {
		return names.length ? localize('runTestTool.unmatchedNames', "Requested test names with no discovered or executed match: {0}.", names.join(', ')) : '';
	}

	/** Filters the test files to individual test cases based on the provided parameters. */
	private async _getTestCasesToRun(params: IRunTestToolParams, tests: IncrementalTestCollectionItem[], progress: ToolProgress, token: CancellationToken): Promise<IncrementalTestCollectionItem[]> {
		if (!params.testNames?.length) {
			return tests;
		}

		progress.report({ message: localize('runTestTool.invoke.filterProgress', 'Filtering tests...') });

		const testNames = params.testNames.map(t => t.toLowerCase().trim());
		const filtered: IncrementalTestCollectionItem[] = [];
		const doFilter = async (test: IncrementalTestCollectionItem) => {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			await this._waitForDiscovery(test, token);
			const name = test.item.label.toLowerCase().trim();
			if (testNames.some(tn => name.includes(tn))) {
				filtered.push(test);
				return;
			}

			if (test.expand === TestItemExpandState.Expandable) {
				await raceCancellationError(this._testService.collection.expand(test.item.extId, 1), token);
			}
			await this._waitForDiscovery(test, token);
			await Promise.all([...test.children].map(async id => {
				const item = this._testService.collection.getNodeById(id);
				if (item) {
					await doFilter(item);
				}
			}));
		};

		await Promise.all(tests.map(doFilter));
		return filtered;
	}

	/** Bounds path checks, lazy root discovery, and name filtering to one discovery deadline. */
	private async _discoverTests(params: IRunTestToolParams, progress: ToolProgress, token: CancellationToken) {
		const store = new DisposableStore();
		const discoveryToken = store.add(new CancellationTokenSource(token));
		store.add(disposableTimeout(() => discoveryToken.cancel(), 5_000));
		progress.report({ message: localize('runTestTool.invoke.filesProgress', 'Discovering tests...') });
		const firstWorkspaceFolder = this._workspaceContextService.getWorkspace().folders.at(0)?.uri;
		const files: IDiscoveredTestFile[] = (params.files ?? []).map(path => {
			const uri = isAbsolute(path)
				? firstWorkspaceFolder?.scheme === Schemas.vscodeRemote
					? URI.from({ scheme: firstWorkspaceFolder.scheme, authority: firstWorkspaceFolder.authority, path: URI.file(path).path })
					: URI.file(path)
				: firstWorkspaceFolder ? URI.joinPath(firstWorkspaceFolder, path) : undefined;
			return {
				path, uri: uri ? this._uriIdentityService.asCanonicalUri(uri) : undefined,
				existence: TestFileExistence.CheckError, tests: [], filtered: [], discovery: TestDiscoveryState.Unknown, errors: [], discoveryRoots: new Set(),
			};
		});
		const errors: string[] = [];
		const rootExpansions = new Map<string, Promise<void>>();
		const rootErrors = new Map<string, string>();
		let tests: IncrementalTestCollectionItem[] = [];
		try {
			const checks = files.map(async file => {
				if (!file.uri) {
					file.checkError = localize('runTestTool.unresolvedPath', "A relative path cannot be resolved without a workspace folder.");
					return;
				}
				try {
					if (discoveryToken.token.isCancellationRequested) {
						throw new CancellationError();
					}
					await raceCancellationError(this._fileService.stat(file.uri), discoveryToken.token);
					file.existence = TestFileExistence.Exists;
				} catch (error) {
					file.existence = error instanceof Error && toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND ? TestFileExistence.Missing : TestFileExistence.CheckError;
					file.checkError = isCancellationError(error)
						? localize('runTestTool.pathCheckPending', "The path check did not finish before discovery stopped.")
						: getErrorMessage(error);
					if (isCancellationError(error)) {
						file.discovery = TestDiscoveryState.Pending;
					}
				}
			});

			// Path checks and file selection must not block independently discovered matches.
			await Promise.all([...checks, ...files.map(async file => {
				if (!file.uri) {
					return;
				}
				try {
					if (discoveryToken.token.isCancellationRequested) {
						throw new CancellationError();
					}
					if (![...this._testService.collection.getNodeByUrl(file.uri)].length) {
						for (const root of this._testService.collection.rootItems) {
							if (root.item.uri && !this._uriIdentityService.extUri.isEqualOrParent(file.uri, root.item.uri)) {
								continue;
							}
							file.discoveryRoots.add(root.item.extId);
							if (root.expand === TestItemExpandState.Expandable || root.expand === TestItemExpandState.BusyExpanding) {
								let expansion = rootExpansions.get(root.item.extId);
								if (!expansion) {
									expansion = this._expandRoot(root, discoveryToken.token, rootErrors);
									rootExpansions.set(root.item.extId, expansion);
								}
								await expansion;
							}
							await this._waitForDiscovery(root, discoveryToken.token);
						}
					}
					for await (const batch of testsInFile(this._testService, this._uriIdentityService, file.uri, true, false, discoveryToken.token)) {
						file.tests.push(...batch);
					}
					for (const test of file.tests) {
						await this._waitForDiscovery(test, discoveryToken.token);
					}
					file.filtered = await this._getTestCasesToRun(params, file.tests, progress, discoveryToken.token);
				} catch (error) {
					if (isCancellationError(error)) {
						file.discovery = TestDiscoveryState.Pending;
					} else {
						file.errors.push(getErrorMessage(error));
					}
				}
				for (const rootId of file.discoveryRoots) {
					const error = rootErrors.get(rootId);
					if (!file.tests.length && error) {
						file.errors.push(error);
					}
				}
				this._updateDiscoveryEvidence(file);
			})]);

			if (files.length) {
				tests = files.flatMap(file => file.filtered);
			} else {
				await Promise.all([...this._testService.collection.rootItems].map(async root => {
					try {
						if (root.expand === TestItemExpandState.Expandable || root.expand === TestItemExpandState.BusyExpanding) {
							await this._expandRoot(root, discoveryToken.token, rootErrors);
						}
						await this._waitForDiscovery(root, discoveryToken.token);
						const error = rootErrors.get(root.item.extId) ?? root.item.error;
						if (error) {
							errors.push(typeof error === 'string' ? error : error.value);
						}
						if (root.children.size > 0) {
							tests.push(...await this._getTestCasesToRun(params, [root], progress, discoveryToken.token));
						}
					} catch (error) {
						errors.push(isCancellationError(error)
							? localize('runTestTool.controllerDiscoveryPending', "VS Code test discovery is pending for controller {0}. The request has not been validated.", root.controllerId)
							: getErrorMessage(error));
					}
				}));
			}
		} finally {
			discoveryToken.cancel();
			store.dispose();
		}
		return { files, tests: [...new Map(tests.map(test => [test.item.extId, test])).values()], errors };
	}

	private async _waitForDiscovery(test: IncrementalTestCollectionItem, token: CancellationToken): Promise<void> {
		await waitForTestToBeIdle(this._testService, test, token, true);
	}

	private async _expandRoot(root: IncrementalTestCollectionItem, token: CancellationToken, errors: Map<string, string>): Promise<void> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		try {
			await raceCancellationError(this._testService.collection.expand(root.item.extId, 0), token);
		} catch (error) {
			if (isCancellationError(error)) {
				throw error;
			}
			errors.set(root.item.extId, getErrorMessage(error));
		}
	}

	private _updateDiscoveryEvidence(file: IDiscoveredTestFile): void {
		if (!file.uri) {
			return;
		}
		const relevantIds = new Set(file.tests.flatMap(test => [...TestId.fromString(test.item.extId).idsToRoot()].map(id => id.toString())));
		const relevant: IncrementalTestCollectionItem[] = [];
		for (const item of this._testService.collection.all) {
			const relatedUri = item.item.uri && this._uriIdentityService.extUri.isEqualOrParent(file.uri, item.item.uri);
			const descendant = file.tests.some(test => TestId.isChild(test.item.extId, item.item.extId));
			const discoveryRoot = !file.tests.length && file.discoveryRoots.has(item.item.extId);
			if (relatedUri || relevantIds.has(item.item.extId) || descendant || discoveryRoot) {
				relevant.push(item);
				if (item.item.error) {
					file.errors.push(typeof item.item.error === 'string' ? item.item.error : item.item.error.value);
				}
			}
		}
		file.errors = [...new Set(file.errors)];
		if (file.errors.length) {
			file.discovery = TestDiscoveryState.Failed;
		} else if (file.discovery === TestDiscoveryState.Pending || relevant.some(item => item.item.busy || item.expand === TestItemExpandState.BusyExpanding) || (!file.tests.length && this._testService.collection.busyProviders > 0)) {
			file.discovery = TestDiscoveryState.Pending;
		} else {
			const controllers = [...this._testService.getTestControllers()];
			const roots = [...this._testService.collection.rootItems];
			const rootsPublished = controllers.length > 0 && controllers.every(controller => roots.some(root => root.controllerId === controller.id));
			const unresolvedContainers = [...this._testService.collection.all].some(item => !item.item.uri && item.expand !== TestItemExpandState.NotExpandable && item.expand !== TestItemExpandState.Expanded);
			file.discovery = file.tests.length || (rootsPublished && !unresolvedContainers) ? TestDiscoveryState.Completed : TestDiscoveryState.Unknown;
		}
	}

	private _formatDiscovery(files: IDiscoveredTestFile[], errors: string[]): string {
		if (!files.length && !errors.length) {
			return '';
		}
		const states = {
			[TestDiscoveryState.Pending]: localize('runTestTool.state.pending', "pending"),
			[TestDiscoveryState.Failed]: localize('runTestTool.state.failed', "failed"),
			[TestDiscoveryState.Completed]: localize('runTestTool.state.completed', "completed"),
			[TestDiscoveryState.Unknown]: localize('runTestTool.state.unknown', "unknown"),
		};
		return [
			localize('runTestTool.controllers', "Registered VS Code test controllers: {0}.", [...this._testService.getTestControllers()].length),
			...files.flatMap(file => [
				file.existence === TestFileExistence.Exists
					? localize('runTestTool.pathExists', "{0}: path exists.", file.path)
					: file.existence === TestFileExistence.Missing
						? localize('runTestTool.pathMissing', "{0}: path is missing.", file.path)
						: localize('runTestTool.pathCheckError', "{0}: path check error: {1}", file.path, file.checkError),
				file.tests.length
					? localize('runTestTool.pathMatches', "Discovered test items matching this file: {0}; matching the requested test names: {1}; discovery: {2}.", file.tests.length, file.filtered.length, states[file.discovery])
					: localize('runTestTool.pathNoMatch', "No discovered test items match this file; discovery: {0}.", states[file.discovery]),
				...file.errors.map(error => localize('runTestTool.providerError', "Provider discovery error: {0}", error)),
			]),
			...errors,
		].join('\n');
	}

	prepareToolInvocation(context: IToolInvocationPreparationContext, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const params: IRunTestToolParams = context.parameters;
		const title = localize('runTestTool.confirm.title', 'Allow test run?');
		const inFiles = params.files?.map((f: string) => '`' + basename(f) + '`');

		return Promise.resolve({
			invocationMessage: localize('runTestTool.confirm.invocation', 'Running tests...'),
			confirmationMessages: {
				title,
				message: inFiles?.length
					? new MarkdownString().appendMarkdown(localize('runTestTool.confirm.message', 'The model wants to run tests in {0}.', inFiles.join(', ')))
					: localize('runTestTool.confirm.all', 'The model wants to run all tests.'),
				allowAutoConfirm: true,
			},
		});
	}
}

export class TestFailureTool implements IToolImpl {
	public static readonly ID = 'testFailure';
	public static readonly DEFINITION: IToolData = {
		id: this.ID,
		toolReferenceName: 'testFailure',
		legacyToolReferenceFullNames: ['copilot_testFailure'],
		displayName: localize('testFailureTool.displayName', 'Test failures'),
		modelDescription: 'Includes test failure information in the prompt. Use this tool to get the details of test failures from the most recent test run. If there are no failures yet, suggest running tests first.',
		icon: Codicon.beaker,
		inputSchema: {
			type: 'object',
			properties: {},
		},
		userDescription: localize('testFailureTool.userDescription', 'Include test failure information'),
		source: ToolDataSource.Internal,
		tags: [
			'vscode_editing_with_tests',
			'enable_other_tool_copilot_readFile',
			'enable_other_tool_copilot_listDirectory',
			'enable_other_tool_copilot_findFiles',
			'enable_other_tool_copilot_runTests',
		],
	};

	constructor(
		@ITestResultService private readonly _testResultService: ITestResultService,
	) { }

	async invoke(invocation: IToolInvocation, countTokens: CountTokensCallback, progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const result = this._testResultService.results.find(r => r.tasks.length > 0);
		if (!result) {
			return {
				content: [{ kind: 'text', value: 'No test failures were found yet, call the runTests tool to run tests and find failures.' }],
			};
		}

		const details = await getFailureDetails(result);
		return {
			content: [{ kind: 'text', value: details }],
		};
	}

	prepareToolInvocation(context: IToolInvocationPreparationContext, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		return Promise.resolve({
			invocationMessage: localize('testFailureTool.invocation', 'Finding test failures'),
			pastTenseMessage: localize('testFailureTool.pastTense', 'Found test failures'),
		});
	}
}

/** Builds the full summary string for a completed test run. */
export async function buildTestRunSummary(result: LiveTestResult, mode: TestRunMode, coverageFiles: string[] | undefined): Promise<string> {
	const failures = result.counts[TestResultState.Errored] + result.counts[TestResultState.Failed];
	let str = `<summary passed=${result.counts[TestResultState.Passed]} failed=${failures} />\n`;
	if (failures !== 0) {
		str += await getFailureDetails(result);
	}
	if (mode === TestRunMode.Coverage) {
		str += await getCoverageSummary(result, coverageFiles);
	}
	return str;
}

/** Gets a coverage summary from a test result, either overall or per-file. */
export async function getCoverageSummary(result: LiveTestResult, coverageFiles: string[] | undefined): Promise<string> {
	let str = '';
	for (const task of result.tasks) {
		const coverage = task.coverage.get();
		if (!coverage) {
			continue;
		}

		if (!coverageFiles || !coverageFiles.length) {
			str += getOverallCoverageSummary(coverage);
			continue;
		}

		const normalized = coverageFiles.map(file => URI.file(file).fsPath);
		const coveredFilesMap = new Map<string, FileCoverage>();
		for (const file of coverage.getAllFiles().values()) {
			coveredFilesMap.set(file.uri.fsPath, file);
		}

		for (const path of normalized) {
			const file = coveredFilesMap.get(path);
			if (!file) {
				continue;
			}
			str += await getFileCoverageDetails(file, path);
		}
	}
	return str;
}

/** Gets a file-level coverage overview sorted by lowest coverage first. */
export function getOverallCoverageSummary(coverage: TestCoverage): string {
	const files = [...coverage.getAllFiles().values()]
		.map(f => ({ path: f.uri.fsPath, pct: getTotalCoveragePercent(f.statement, f.branch, f.declaration) * 100 }))
		.filter(f => f.pct < 100)
		.sort((a, b) => a.pct - b.pct);

	if (!files.length) {
		return '<coverageSummary>All files have 100% coverage.</coverageSummary>\n';
	}

	let str = '<coverageSummary>\n';
	for (const f of files) {
		str += `<file path="${f.path}" percent=${f.pct.toFixed(1)} />\n`;
	}
	str += '</coverageSummary>\n';
	return str;
}

/** Gets detailed coverage information for a single file including uncovered items. */
export async function getFileCoverageDetails(file: FileCoverage, path: string): Promise<string> {
	const pct = getTotalCoveragePercent(file.statement, file.branch, file.declaration) * 100;
	let str = `<coverage path="${path}" percent=${pct.toFixed(1)} statements=${file.statement.covered}/${file.statement.total}`;
	if (file.branch) {
		str += ` branches=${file.branch.covered}/${file.branch.total}`;
	}
	if (file.declaration) {
		str += ` declarations=${file.declaration.covered}/${file.declaration.total}`;
	}
	str += '>\n';

	try {
		const details = await file.details();

		const uncoveredDeclarations: { name: string; line: number }[] = [];
		const uncoveredBranches: { line: number; label?: string }[] = [];
		const uncoveredLines: [number, number][] = [];

		for (const detail of details) {
			if (detail.type === DetailType.Declaration) {
				if (!detail.count) {
					const line = Position.isIPosition(detail.location) ? detail.location.lineNumber : detail.location.startLineNumber;
					uncoveredDeclarations.push({ name: detail.name, line });
				}
			} else {
				if (!detail.count) {
					const startLine = Position.isIPosition(detail.location) ? detail.location.lineNumber : detail.location.startLineNumber;
					const endLine = Position.isIPosition(detail.location) ? detail.location.lineNumber : detail.location.endLineNumber;
					uncoveredLines.push([startLine, endLine]);
				}
				if (detail.branches) {
					for (const branch of detail.branches) {
						if (!branch.count) {
							let line: number;
							if (branch.location) {
								line = Position.isIPosition(branch.location) ? branch.location.lineNumber : branch.location.startLineNumber;
							} else {
								line = Position.isIPosition(detail.location) ? detail.location.lineNumber : detail.location.startLineNumber;
							}
							uncoveredBranches.push({ line, label: branch.label });
						}
					}
				}
			}
		}

		if (uncoveredDeclarations.length) {
			str += 'uncovered functions: ' + uncoveredDeclarations.map(d => `${d.name}(L${d.line})`).join(', ') + '\n';
		}
		if (uncoveredBranches.length) {
			str += 'uncovered branches: ' + uncoveredBranches.map(b => b.label ? `L${b.line}(${b.label})` : `L${b.line}`).join(', ') + '\n';
		}
		if (uncoveredLines.length) {
			str += 'uncovered lines: ' + mergeLineRanges(uncoveredLines) + '\n';
		}
	} catch { /* ignore - details not available */ }

	str += '</coverage>\n';
	return str;
}

/** Merges overlapping/contiguous line ranges and formats them compactly. */
export function mergeLineRanges(ranges: [number, number][]): string {
	if (!ranges.length) {
		return '';
	}
	ranges.sort((a, b) => a[0] - b[0]);
	const merged: [number, number][] = [ranges[0]];
	for (let i = 1; i < ranges.length; i++) {
		const last = merged[merged.length - 1];
		const [start, end] = ranges[i];
		if (start <= last[1] + 1) {
			last[1] = Math.max(last[1], end);
		} else {
			merged.push([start, end]);
		}
	}
	return merged.map(([s, e]) => s === e ? `${s}` : `${s}-${e}`).join(', ');
}

/** Formats failure details from a test result into an XML-like string. */
export async function getFailureDetails(result: ITestResult): Promise<string> {
	let str = '';
	let hadMessages = false;
	for (const failure of result.tests) {
		if (!isFailedState(failure.ownComputedState)) {
			continue;
		}

		const [, ...testPath] = TestId.split(failure.item.extId);
		const testName = testPath.pop();
		str += `<testFailure name=${JSON.stringify(testName)} path=${JSON.stringify(testPath.join(' > '))}>\n`;
		for (const task of failure.tasks) {
			for (const message of task.messages.filter(m => m.type === TestMessageType.Error)) {
				hadMessages = true;

				if (message.expected !== undefined && message.actual !== undefined) {
					str += `<expectedOutput>\n${message.expected}\n</expectedOutput>\n`;
					str += `<actualOutput>\n${message.actual}\n</actualOutput>\n`;
				} else {
					const messageText = typeof message.message === 'string' ? message.message : message.message.value;
					str += `<message>\n${messageText}\n</message>\n`;
				}

				if (message.stackTrace && message.stackTrace.length > 0) {
					for (const frame of message.stackTrace.slice(0, 10)) {
						if (frame.uri && frame.position) {
							str += `<stackFrame path="${frame.uri.fsPath}" line="${frame.position.lineNumber}" col="${frame.position.column}" />\n`;
						} else if (frame.uri) {
							str += `<stackFrame path="${frame.uri.fsPath}">${frame.label}</stackFrame>\n`;
						} else {
							str += `<stackFrame>${frame.label}</stackFrame>\n`;
						}
					}
				}

				if (message.location) {
					str += `<location path="${message.location.uri.fsPath}" line="${message.location.range.startLineNumber}" col="${message.location.range.startColumn}" />\n`;
				}
			}
		}

		str += `</testFailure>\n`;
	}

	if (!hadMessages) {
		const output = result.tasks.map(t => t.output.getRange(0, t.output.length).toString().trim()).join('\n');
		if (output) {
			str += `<output>\n${output}\n</output>\n`;
		}
	}

	return str;
}
