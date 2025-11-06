/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { basename, isAbsolute } from '../../../../base/common/path.js';
import { isDefined, Mutable } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
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
} from '../../chat/common/languageModelToolsService.js';
import { TestId } from './testId.js';
import { FileCoverage, getTotalCoveragePercent } from './testCoverage.js';
import { TestingContextKeys } from './testingContextKeys.js';
import { collectTestStateCounts, getTestProgressText } from './testingProgressMessages.js';
import { isFailedState } from './testingStates.js';
import { LiveTestResult } from './testResult.js';
import { ITestResultService } from './testResultService.js';
import { ITestService, testsInFile, waitForTestToBeIdle } from './testService.js';
import { IncrementalTestCollectionItem, TestItemExpandState, TestMessageType, TestResultState, TestRunProfileBitset } from './testTypes.js';
import { Position } from '../../../../editor/common/core/position.js';
import { ITestProfileService } from './testProfileService.js';

export class TestingChatAgentToolContribution extends Disposable implements IWorkbenchContribution {
	public static readonly ID = 'workbench.contrib.testing.chatAgentTool';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super();
		const runTestsTool = instantiationService.createInstance(RunTestTool);
		this._register(toolsService.registerTool(RunTestTool.DEFINITION, runTestsTool));

		// todo@connor4312: temporary for 1.103 release during changeover
		contextKeyService.createKey('chat.coreTestFailureToolEnabled', true).set(true);
	}
}

type Mode = 'run' | 'coverage';

interface IRunTestToolParams {
	files?: string[];
	testNames?: string[];
	/** File paths to return coverage info for (only used when mode === 'coverage') */
	coverageFiles?: string[];
	mode?: Mode;
}

class RunTestTool implements IToolImpl {
	public static readonly ID = 'runTests';
	public static readonly DEFINITION: IToolData = {
		id: this.ID,
		toolReferenceName: 'runTests',
		canBeReferencedInPrompt: true,
		when: TestingContextKeys.hasRunnableTests,
		displayName: 'Run tests',
		modelDescription: 'Runs unit tests in files. Use this tool if the user asks to run tests or when you want to validate changes using unit tests, and prefer using this tool instead of the terminal tool. When possible, always try to provide `files` paths containing the relevant unit tests in order to avoid unnecessarily long test runs. This tool outputs detailed information about the results of the test run. Set mode="coverage" to also collect coverage and optionally provide coverageFiles for focused reporting.',
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
					enum: ['run', 'coverage'],
					description: 'Execution mode: "run" (default) runs tests normally, "coverage" collects coverage.',
				},
				coverageFiles: {
					type: 'array',
					items: { type: 'string' },
					description: 'When mode="coverage": absolute file paths to include detailed coverage info for. Only the first matching file will be summarized.'
				}
			},
		},
		userDescription: localize('runTestTool.userDescription', 'Runs unit tests (optionally with coverage)'),
		source: ToolDataSource.Internal,
		tags: [
			'vscode_editing_with_tests',
			'enable_other_tool_copilot_readFile',
			'enable_other_tool_copilot_listDirectory',
			'enable_other_tool_copilot_findFiles',
			'enable_other_tool_copilot_runTests',
			'enable_other_tool_copilot_runTestsWithCoverage',
			'enable_other_tool_copilot_testFailure',
		],
	};

	constructor(
		@ITestService private readonly _testService: ITestService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@ITestResultService private readonly _testResultService: ITestResultService,
		@ITestProfileService private readonly _testProfileService: ITestProfileService,
	) { }

	async invoke(invocation: IToolInvocation, countTokens: CountTokensCallback, progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const params: IRunTestToolParams = invocation.parameters;
		const mode: Mode = (params.mode === 'coverage' ? 'coverage' : 'run');
		let group = (mode === 'coverage' ? TestRunProfileBitset.Coverage : TestRunProfileBitset.Run);
		const coverageFiles = (mode === 'coverage' ? (params.coverageFiles && params.coverageFiles.length ? params.coverageFiles : undefined) : undefined);

		const testFiles = await this._getFileTestsToRun(params, progress);
		const testCases = await this._getTestCasesToRun(params, testFiles, progress);
		if (!testCases.length) {
			return {
				content: [{ kind: 'text', value: 'No tests found in the files. Ensure the correct absolute paths are passed to the tool.' }],
				toolResultError: localize('runTestTool.noTests', 'No tests found in the files'),
			};
		}

		progress.report({ message: localize('runTestTool.invoke.progress', 'Starting test run...') });

		// If the model asks for coverage but the test provider doesn't support it, use normal 'run' mode
		if (group === TestRunProfileBitset.Coverage) {
			if (!testCases.some(tc => this._testProfileService.capabilitiesForTest(tc.item) & TestRunProfileBitset.Coverage)) {
				group = TestRunProfileBitset.Run;
			}
		}

		const result = await this._captureTestResult(testCases, group, token);
		if (!result) {
			return {
				content: [{ kind: 'text', value: 'No test run was started. Instruct the user to ensure their test runner is correctly configured' }],
				toolResultError: localize('runTestTool.noRunStarted', 'No test run was started. This may be an issue with your test runner or extension.'),
			};
		}

		await this._monitorRunProgress(result, progress, token);

		if (token.isCancellationRequested) {
			this._testService.cancelTestRun(result.id);
			return {
				content: [{ kind: 'text', value: localize('runTestTool.invoke.cancelled', 'Test run was cancelled.') }],
				toolResultMessage: localize('runTestTool.invoke.cancelled', 'Test run was cancelled.'),
			};
		}

		const summary = await this._buildSummary(result, mode, coverageFiles);
		const content = [{ kind: 'text', value: summary } as const];

		return {
			content: content as Mutable<IToolResult['content']>,
			toolResultMessage: getTestProgressText(collectTestStateCounts(false, [result])),
		};
	}

	private async _buildSummary(result: LiveTestResult, mode: Mode, coverageFiles: string[] | undefined): Promise<string> {
		const failures = result.counts[TestResultState.Errored] + result.counts[TestResultState.Failed];
		let str = `<summary passed=${result.counts[TestResultState.Passed]} failed=${failures} />\n`;
		if (failures !== 0) {
			str += await this._getFailureDetails(result);
		}
		if (mode === 'coverage') {
			str += await this._getCoverageSummary(result, coverageFiles);
		}
		return str;
	}

	private async _getCoverageSummary(result: LiveTestResult, coverageFiles: string[] | undefined): Promise<string> {
		if (!coverageFiles || !coverageFiles.length) {
			return '';
		}
		for (const task of result.tasks) {
			const coverage = task.coverage.get();
			if (!coverage) {
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
				let summary = `<coverage task=${JSON.stringify(task.name || '')}>\n`;
				const pct = getTotalCoveragePercent(file.statement, file.branch, file.declaration) * 100;
				summary += `<firstUncoveredFile path=${JSON.stringify(path)} statementsCovered=${file.statement.covered} statementsTotal=${file.statement.total}`;
				if (file.branch) {
					summary += ` branchesCovered=${file.branch.covered} branchesTotal=${file.branch.total}`;
				}
				if (file.declaration) {
					summary += ` declarationsCovered=${file.declaration.covered} declarationsTotal=${file.declaration.total}`;
				}
				summary += ` percent=${pct.toFixed(2)}`;
				try {
					const details = await file.details();
					for (const detail of details) {
						if (detail.count || !detail.location) {
							continue;
						}
						let startLine: number;
						let endLine: number;
						if (Position.isIPosition(detail.location)) {
							startLine = endLine = detail.location.lineNumber;
						} else {
							startLine = detail.location.startLineNumber;
							endLine = detail.location.endLineNumber;
						}
						summary += ` firstUncoveredStart=${startLine} firstUncoveredEnd=${endLine}`;
						break;
					}
				} catch { /* ignore */ }
				summary += ` />\n`;
				summary += `</coverage>\n`;
				return summary;
			}
		}
		return '';
	}

	private async _getFailureDetails(result: LiveTestResult): Promise<string> {
		let str = '';
		let hadMessages = false;
		for (const failure of result.tests) {
			if (!isFailedState(failure.ownComputedState)) {
				continue;
			}

			const [, ...testPath] = TestId.split(failure.item.extId);
			const testName = testPath.pop();
			str += `<testFailure name=${JSON.stringify(testName)} path=${JSON.stringify(testPath.join(' > '))}>\n`;
			// Extract detailed failure information from error messages
			for (const task of failure.tasks) {
				for (const message of task.messages.filter(m => m.type === TestMessageType.Error)) {
					hadMessages = true;

					// Add expected/actual outputs if available
					if (message.expected !== undefined && message.actual !== undefined) {
						str += `<expectedOutput>\n${message.expected}\n</expectedOutput>\n`;
						str += `<actualOutput>\n${message.actual}\n</actualOutput>\n`;
					} else {
						// Fallback to the message content
						const messageText = typeof message.message === 'string' ? message.message : message.message.value;
						str += `<message>\n${messageText}\n</message>\n`;
					}

					// Add stack trace information if available (limit to first 10 frames)
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

					// Add location information if available
					if (message.location) {
						str += `<location path="${message.location.uri.fsPath}" line="${message.location.range.startLineNumber}" col="${message.location.range.startColumn}" />\n`;
					}
				}
			}

			str += `</testFailure>\n`;
		}

		if (!hadMessages) { // some adapters don't have any per-test messages and just output
			const output = result.tasks.map(t => t.output.getRange(0, t.output.length).toString().trim()).join('\n');
			if (output) {
				str += `<output>\n${output}\n</output>\n`;
			}
		}

		return str;
	}

	/** Updates the UI progress as the test runs, resolving when the run is finished. */
	private async _monitorRunProgress(result: LiveTestResult, progress: ToolProgress, token: CancellationToken): Promise<void> {
		const store = new DisposableStore();

		const update = () => {
			const counts = collectTestStateCounts(!result.completedAt, [result]);
			const text = getTestProgressText(counts);
			progress.report({ message: text, progress: counts.runSoFar / counts.totalWillBeRun });
		};

		const throttler = store.add(new RunOnceScheduler(update, 500));

		return new Promise<void>(resolve => {
			store.add(result.onChange(() => {
				if (!throttler.isScheduled) {
					throttler.schedule();
				}
			}));

			store.add(token.onCancellationRequested(() => {
				this._testService.cancelTestRun(result.id);
				resolve();
			}));

			store.add(result.onComplete(() => {
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
		const store = new DisposableStore();
		const onDidTimeout = store.add(new Emitter<void>());

		return new Promise<LiveTestResult | undefined>(resolve => {
			store.add(onDidTimeout.event(() => {
				resolve(undefined);
			}));

			store.add(this._testResultService.onResultsChanged(ev => {
				if ('started' in ev) {
					store.add(ev.started.onNewTask(() => {
						store.dispose();
						resolve(ev.started);
					}));
				}
			}));

			this._testService.runTests({
				group,
				tests: testCases,
				preserveFocus: true,
			}, token).then(() => {
				if (!store.isDisposed) {
					store.add(disposableTimeout(() => onDidTimeout.fire(), 5_000));
				}
			});
		}).finally(() => store.dispose());
	}

	/** Filters the test files to individual test cases based on the provided parameters. */
	private async _getTestCasesToRun(params: IRunTestToolParams, tests: IncrementalTestCollectionItem[], progress: ToolProgress): Promise<IncrementalTestCollectionItem[]> {
		if (!params.testNames?.length) {
			return tests;
		}

		progress.report({ message: localize('runTestTool.invoke.filterProgress', 'Filtering tests...') });

		const testNames = params.testNames.map(t => t.toLowerCase().trim());
		const filtered: IncrementalTestCollectionItem[] = [];
		const doFilter = async (test: IncrementalTestCollectionItem) => {
			const name = test.item.label.toLowerCase().trim();
			if (testNames.some(tn => name.includes(tn))) {
				filtered.push(test);
				return;
			}

			if (test.expand === TestItemExpandState.Expandable) {
				await this._testService.collection.expand(test.item.extId, 1);
			}
			await waitForTestToBeIdle(this._testService, test);
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

	/** Gets the file tests to run based on the provided parameters. */
	private async _getFileTestsToRun(params: IRunTestToolParams, progress: ToolProgress): Promise<IncrementalTestCollectionItem[]> {
		if (!params.files?.length) {
			return [...this._testService.collection.rootItems];
		}

		progress.report({ message: localize('runTestTool.invoke.filesProgress', 'Discovering tests...') });

		const firstWorkspaceFolder = this._workspaceContextService.getWorkspace().folders.at(0)?.uri;
		const uris = params.files.map(f => {
			if (isAbsolute(f)) {
				return URI.file(f);
			} else if (firstWorkspaceFolder) {
				return URI.joinPath(firstWorkspaceFolder, f);
			} else {
				return undefined;
			}
		}).filter(isDefined);

		const tests: IncrementalTestCollectionItem[] = [];
		for (const uri of uris) {
			for await (const files of testsInFile(this._testService, this._uriIdentityService, uri, undefined, false)) {
				for (const file of files) {
					tests.push(file);
				}
			}
		}

		return tests;
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
