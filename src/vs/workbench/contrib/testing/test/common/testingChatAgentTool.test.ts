/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Schemas } from '../../../../../base/common/network.js';
import { Mutable } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { ExtUri, IExtUri } from '../../../../../base/common/resources.js';
import { createFileSystemProviderError, FileOperationError, FileOperationResult, FileSystemProviderErrorCode, IFileService, IFileStatWithPartialMetadata } from '../../../../../platform/files/common/files.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { IToolInvocation, IToolInvocationPreparationContext, IToolProgressStep, IToolResult } from '../../../chat/common/tools/languageModelToolsService.js';
import { FileCoverage, ICoverageAccessor, TestCoverage } from '../../common/testCoverage.js';
import { LiveTestResult } from '../../common/testResult.js';
import { ITestResultService, ResultChangeEvent } from '../../common/testResultService.js';
import { AmbiguousRunTestsRequest, IMainThreadTestController, ITestService } from '../../common/testService.js';
import { CoverageDetails, DetailType, IBranchCoverage, IDeclarationCoverage, IFileCoverage, IStatementCoverage, ResolvedTestRunRequest, TestDiffOpType, TestItemExpandState, TestMessageType, TestResultState, TestRunProfileBitset, TestsDiff } from '../../common/testTypes.js';
import { ITestProfileService } from '../../common/testProfileService.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { TestId } from '../../common/testId.js';
import { RunTestTool, TestRunMode, buildTestRunSummary, getCoverageSummary, getOverallCoverageSummary, getFileCoverageDetails, mergeLineRanges, getFailureDetails } from '../../common/testingChatAgentTool.js';
import { MainThreadTestCollection } from '../../common/mainThreadTestCollection.js';
import { TestTestCollection, TestTestItem } from './testStubs.js';

suite('Workbench - RunTestTool', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	let insertCounter = 0;
	let tool: RunTestTool;
	let testService: Mutable<ITestService>;
	let fileService: IFileService;
	let workspaceContext: IWorkspaceContextService;
	let resultService: Mutable<ITestResultService>;
	let profileService: ITestProfileService;
	let uriIdentity: IUriIdentityService;

	const noopProgress = {
		report: (_update: IToolProgressStep) => { },
	};
	const noopCountTokens = () => Promise.resolve(0);

	function resultText(result: IToolResult): string {
		return result.content.flatMap(content => content.kind === 'text' ? [content.value] : []).join('\n');
	}

	function invoke(parameters: IToolInvocation['parameters'], token = CancellationToken.None) {
		return tool.invoke(upcastPartial<IToolInvocation>({ parameters }), noopCountTokens, noopProgress, token);
	}

	function useCollection(extension: TestTestCollection, additional: readonly TestTestCollection[] = []) {
		const extensions = [extension, ...additional];
		const diffs = ds.add(new Emitter<TestsDiff>());
		const apply = (diff: TestsDiff) => {
			collection.apply(diff);
			diffs.fire(diff);
		};
		const collection = new MainThreadTestCollection(uriIdentity, async (id, levels) => {
			const provider = extensions.find(extension => extension.root.id === TestId.fromString(id).controllerId)!;
			const expansion = provider.expand(id, levels);
			apply(provider.collectDiff());
			await expansion;
			apply(provider.collectDiff());
		});
		for (const extension of extensions) {
			ds.add(extension.onDidGenerateDiff(apply));
			apply(extension.collectDiff());
		}
		testService.collection = collection;
		testService.onDidProcessDiff = diffs.event;
		testService.getTestControllers = () => extensions.map(extension => upcastPartial<IMainThreadTestController>({ id: extension.root.id }));
		fileService.stat = async uri => upcastPartial<IFileStatWithPartialMetadata>({ resource: uri });
		return { collection, diffs, flush: () => apply(extension.collectDiff()) };
	}

	function useFile(path = '/workspace/a.ts', label = 'test a') {
		const extension = ds.add(new TestTestCollection());
		const item = new TestTestItem(new TestId(['ctrlId', 'a']), label, URI.file(path));
		extension.root.children.add(item);
		return { extension, item, ...useCollection(extension) };
	}

	function useCompletedRun(state = TestResultState.Passed) {
		const requests: AmbiguousRunTestsRequest[] = [];
		testService.runTests = async request => {
			requests.push(request);
			const result = createResultWithTests(request.tests.map(test => ({ extId: test.item.extId, label: test.item.label, state })));
			result.markComplete();
			return result;
		};
		return requests;
	}

	function createLiveTestResult(request?: ResolvedTestRunRequest): LiveTestResult {
		const req = request ?? {
			group: TestRunProfileBitset.Run,
			targets: [{ profileId: 0, controllerId: 'ctrlId', testIds: ['id-a'] }],
		};
		return ds.add(new LiveTestResult(
			`result-${insertCounter++}`,
			false,
			req,
			insertCounter,
			NullTelemetryService,
		));
	}

	function createTestCoverage(files: { uri: URI; statement: { covered: number; total: number }; branch?: { covered: number; total: number }; declaration?: { covered: number; total: number }; details?: CoverageDetails[] }[]): TestCoverage {
		const result = createLiveTestResult();
		const accessor: ICoverageAccessor = {
			getCoverageDetails: (id, _testId, _token) => {
				const entry = files.find(f => f.uri.toString() === id);
				return Promise.resolve(entry?.details ?? []);
			},
		};
		const uriIdentity = upcastPartial<IUriIdentityService>({
			asCanonicalUri: (uri: URI) => uri,
			extUri: upcastPartial<IExtUri>({
				isEqual: (a: URI, b: URI) => a.toString() === b.toString(),
				ignorePathCasing: () => false,
			}),
		});
		const coverage = new TestCoverage(result, 'task-1', uriIdentity, accessor);
		for (const f of files) {
			const fileCoverage: IFileCoverage = {
				id: f.uri.toString(),
				uri: f.uri,
				statement: f.statement,
				branch: f.branch,
				declaration: f.declaration,
			};
			coverage.append(fileCoverage, undefined);
		}
		return coverage;
	}

	function makeStatement(line: number, count: number, endLine?: number, branches?: IBranchCoverage[]): IStatementCoverage {
		return {
			type: DetailType.Statement,
			count,
			location: new Range(line, 1, endLine ?? line, 1),
			branches,
		};
	}

	function makeDeclaration(name: string, line: number, count: number): IDeclarationCoverage {
		return {
			type: DetailType.Declaration,
			name,
			count,
			location: new Range(line, 1, line, 1),
		};
	}

	function makeBranch(line: number, count: number, label?: string): IBranchCoverage {
		return {
			count,
			label,
			location: new Range(line, 1, line, 1),
		};
	}

	function createResultWithCoverage(coverageData: TestCoverage): LiveTestResult {
		const result = createLiveTestResult();
		result.addTask({ id: 'task-1', name: 'Test Task', running: true, ctrlId: 'ctrlId' });
		const taskCov = result.tasks[0].coverage as ReturnType<typeof observableValue<TestCoverage | undefined>>;
		taskCov.set(coverageData, undefined);
		return result;
	}

	function createResultWithTests(tests: { extId: string; label: string; state: TestResultState; messages?: { type: TestMessageType; message: string; expected?: string; actual?: string; location?: { uri: URI; range: Range }; stackTrace?: { uri?: URI; position?: { lineNumber: number; column: number }; label: string }[] }[] }[]): LiveTestResult {
		const result = createLiveTestResult();
		result.addTask({ id: 't', name: 'Test Task', running: true, ctrlId: 'ctrlId' });

		for (const t of tests) {
			const chain = TestId.split(t.extId);
			const items = chain.map((segment, i) => ({
				extId: new TestId(chain.slice(0, i + 1)).toString(),
				label: i === chain.length - 1 ? t.label : segment,
				busy: false,
				description: null,
				error: null,
				range: null,
				sortText: null,
				tags: [],
				uri: undefined,
			}));
			result.addTestChainToRun('ctrlId', items);
		}

		for (const t of tests) {
			result.updateState(t.extId, 't', t.state);
			if (t.messages) {
				for (const msg of t.messages) {
					result.appendMessage(t.extId, 't', {
						type: msg.type as TestMessageType.Error,
						message: msg.message,
						expected: msg.expected,
						actual: msg.actual,
						contextValue: undefined,
						location: msg.location ? { uri: msg.location.uri, range: msg.location.range } : undefined,
						stackTrace: msg.stackTrace?.map(f => ({
							uri: f.uri,
							position: f.position ? new Position(f.position.lineNumber, f.position.column) : undefined,
							label: f.label,
						})),
					});
				}
			}
		}

		return result;
	}

	function createFileCov(uri: URI, statement: { covered: number; total: number }, details: CoverageDetails[], opts?: { branch?: { covered: number; total: number }; declaration?: { covered: number; total: number } }): FileCoverage {
		const result = createLiveTestResult();
		const accessor: ICoverageAccessor = {
			getCoverageDetails: () => Promise.resolve(details),
		};
		return new FileCoverage({ id: 'file-1', uri, statement, branch: opts?.branch, declaration: opts?.declaration }, result, accessor);
	}

	setup(() => {
		insertCounter = 0;

		const extUri = new ExtUri(() => false);
		uriIdentity = upcastPartial<IUriIdentityService>({
			asCanonicalUri: (uri: URI) => uri,
			extUri,
		});
		testService = upcastPartial<ITestService>({
			collection: new MainThreadTestCollection(uriIdentity, async () => { }),
			onDidProcessDiff: Event.None,
			getTestControllers: () => [],
			runTests: () => Promise.resolve(upcastPartial({})),
			cancelTestRun: () => { },
		});

		resultService = upcastPartial<ITestResultService>({
			onResultsChanged: Event.None,
		});

		profileService = upcastPartial<ITestProfileService>({
			capabilitiesForTest: () => TestRunProfileBitset.Run | TestRunProfileBitset.Coverage,
		});

		workspaceContext = upcastPartial<IWorkspaceContextService>({
			getWorkspace: () => upcastPartial<IWorkspace>({ id: 'test', folders: [upcastPartial<IWorkspaceFolder>({ uri: URI.file('/workspace') })] }),
		});

		fileService = upcastPartial<IFileService>({
			stat: async () => { throw new FileOperationError('File not found', FileOperationResult.FILE_NOT_FOUND); },
		});
		tool = new RunTestTool(
			testService,
			uriIdentity,
			workspaceContext,
			resultService,
			profileService,
			fileService,
		);
	});

	suite('invoke', () => {
		test('reports unavailable workspace discovery instead of an empty passing run', async () => {
			const requests = useCompletedRun();
			const result = await invoke({});
			assert.deepStrictEqual({
				error: !!result.toolResultError,
				noTests: resultText(result).includes('No tests are available to run through VS Code\'s test extensions'),
				unavailable: resultText(result).includes('discovery is unavailable'),
				noRun: resultText(result).includes('No tests were run'),
				passing: resultText(result).includes('<summary'),
				runCount: requests.length,
			}, { error: true, noTests: true, unavailable: true, noRun: true, passing: false, runCount: 0 });
		});

		for (const lazy of [false, true]) {
			test(`does not run an empty workspace controller (${lazy ? 'lazy' : 'already discovered'})`, async () => {
				const extension = ds.add(new TestTestCollection());
				if (lazy) {
					extension.resolveHandler = () => { };
				}
				useCollection(extension);
				const requests = useCompletedRun();
				const result = await invoke({});
				assert.deepStrictEqual({
					error: !!result.toolResultError,
					noTests: resultText(result).includes('No tests are available to run through VS Code\'s test extensions'),
					noRun: resultText(result).includes('No tests were run'),
					limitedDiscovery: resultText(result).includes('This does not establish that the workspace contains no tests'),
					conditionalFallback: resultText(result).includes('configured test command if one is defined'),
					passing: resultText(result).includes('<summary'),
					runCount: requests.length,
				}, { error: true, noTests: true, noRun: true, limitedDiscovery: true, conditionalFallback: true, passing: false, runCount: 0 });
			});
		}

		test('discovers and runs workspace tests from a lazy controller', async () => {
			const extension = ds.add(new TestTestCollection());
			extension.resolveHandler = () => {
				extension.root.children.add(new TestTestItem(new TestId(['ctrlId', 'a']), 'test a', URI.file('/workspace/a.ts')));
			};
			useCollection(extension);
			const requests = useCompletedRun();
			const result = await invoke({});
			assert.deepStrictEqual({
				error: !!result.toolResultError,
				passed: resultText(result).includes('<summary passed=1 failed=0 />'),
				requests: requests.map(request => request.tests.map(test => test.item.extId)),
			}, { error: false, passed: true, requests: [['ctrlId']] });
		});

		test('reports pending workspace discovery rather than an empty passing run', () => runWithFakedTimers({}, async () => {
			const extension = ds.add(new TestTestCollection());
			extension.resolveHandler = () => new Promise<void>(() => { });
			const { diffs } = useCollection(extension);
			const requests = useCompletedRun();
			const start = Date.now();
			const result = await invoke({});
			assert.deepStrictEqual({
				error: !!result.toolResultError,
				elapsed: Date.now() - start,
				pending: resultText(result).includes('discovery is pending'),
				passing: resultText(result).includes('<summary'),
				listeners: diffs.hasListeners(),
				runCount: requests.length,
			}, { error: true, elapsed: 5_000, pending: true, passing: false, listeners: false, runCount: 0 });
		}));

		for (const stalledFirst of [false, true]) {
			test(`preserves ready workspace controller selection (${stalledFirst ? 'stalled' : 'healthy'} controller first)`, () => runWithFakedTimers({}, async () => {
				const healthy = ds.add(new TestTestCollection('healthy'));
				healthy.resolveHandler = () => {
					healthy.root.children.add(new TestTestItem(new TestId(['healthy', 'a']), 'test a', URI.file('/workspace/a.ts')));
				};
				const stalled = ds.add(new TestTestCollection('stalled'));
				stalled.resolveHandler = () => new Promise<void>(() => { });
				const { diffs } = useCollection(stalledFirst ? stalled : healthy, [stalledFirst ? healthy : stalled]);
				const requests = useCompletedRun();
				const start = Date.now();
				const result = await invoke({});
				assert.deepStrictEqual({
					elapsed: Date.now() - start,
					requests: requests.map(request => request.tests.map(test => test.item.extId)),
					passed: resultText(result).includes('<summary passed=1 failed=0 />'),
					pending: resultText(result).includes('discovery is pending for controller stalled'),
					partial: !!result.toolResultError,
					listeners: diffs.hasListeners(),
				}, { elapsed: 5_000, requests: [['healthy']], passed: true, pending: true, partial: true, listeners: false });
			}));
		}

		test('includes workspace discovery failure evidence without starting a run', async () => {
			const extension = ds.add(new TestTestCollection());
			extension.resolveHandler = () => {
				extension.root.set('error', 'Could not load the workspace test manifest');
			};
			useCollection(extension);
			const requests = useCompletedRun();
			const result = await invoke({});
			assert.deepStrictEqual({
				error: !!result.toolResultError,
				evidence: resultText(result).includes('Could not load the workspace test manifest'),
				passing: resultText(result).includes('<summary'),
				runCount: requests.length,
			}, { error: true, evidence: true, passing: false, runCount: 0 });
		});

		for (const exists of [false, true]) {
			test(`reports ${exists ? 'existing' : 'missing'} file independently of controller registration`, async () => {
				if (exists) {
					fileService.stat = async uri => upcastPartial<IFileStatWithPartialMetadata>({ resource: uri });
				}
				const result = await invoke({ files: ['/workspace/a.ts'] });
				assert.deepStrictEqual({ error: !!result.toolResultError, text: resultText(result) }, {
					error: true,
					text: [
						'No VS Code tests matched the requested files. The request has not been validated.',
						'Registered VS Code test controllers: 0.',
						`/workspace/a.ts: path ${exists ? 'exists' : 'is missing'}.`,
						'No discovered test items match this file; discovery: unknown.',
						'VS Code test discovery is unavailable without a registered test controller. Use the repository\'s configured test command instead of repeatedly checking the same paths.',
					].join('\n'),
				});
			});
		}

		test('counts registered controllers without published roots as unknown discovery', async () => {
			testService.getTestControllers = () => [upcastPartial<IMainThreadTestController>({ id: 'ctrlId' })];
			const result = await invoke({ files: ['/workspace/a.ts'] });
			assert.deepStrictEqual({
				registered: resultText(result).includes('controllers: 1'),
				unknown: resultText(result).includes('discovery: unknown'),
				error: !!result.toolResultError,
			}, { registered: true, unknown: true, error: true });
		});

		test('distinguishes provider permission errors from missing paths', async () => {
			const error = createFileSystemProviderError(new Error('Permission denied by remote provider'), FileSystemProviderErrorCode.NoPermissions);
			fileService.stat = async () => { throw error; };
			const result = await invoke({ files: ['/workspace/a.ts'] });
			assert.deepStrictEqual({
				checkError: resultText(result).includes(`path check error: ${error.message}`),
				missing: resultText(result).includes('path is missing'),
				error: !!result.toolResultError,
			}, { checkError: true, missing: false, error: true });
		});

		test('bounds a stalled path check without claiming the file is missing', () => runWithFakedTimers({}, async () => {
			fileService.stat = () => new Promise<IFileStatWithPartialMetadata>(() => { });
			const start = Date.now();
			const result = await invoke({ files: ['/workspace/a.ts'] });
			assert.deepStrictEqual({
				elapsed: Date.now() - start,
				checkError: resultText(result).includes('path check error'),
				missing: resultText(result).includes('path is missing'),
				pending: resultText(result).includes('discovery: pending'),
			}, { elapsed: 5_000, checkError: true, missing: false, pending: true });
		}));

		for (const stalledFirst of [false, true]) {
			test(`runs a known healthy file despite a stalled stat (${stalledFirst ? 'stalled' : 'healthy'} path first)`, () => runWithFakedTimers({}, async () => {
				const { diffs } = useFile();
				fileService.stat = uri => uri.path.endsWith('/stalled.ts')
					? new Promise<IFileStatWithPartialMetadata>(() => { })
					: Promise.resolve(upcastPartial<IFileStatWithPartialMetadata>({ resource: uri }));
				const requests = useCompletedRun();
				const files = ['/workspace/a.ts', '/workspace/stalled.ts'];
				const start = Date.now();
				const result = await invoke({ files: stalledFirst ? files.reverse() : files });
				assert.deepStrictEqual({
					elapsed: Date.now() - start,
					requests: requests.map(request => request.tests.map(test => test.item.label)),
					passed: resultText(result).includes('<summary passed=1 failed=0 />'),
					checkError: resultText(result).includes('/workspace/stalled.ts: path check error:'),
					missing: resultText(result).includes('/workspace/stalled.ts: path is missing'),
					partial: !!result.toolResultError,
					listeners: diffs.hasListeners(),
				}, { elapsed: 5_000, requests: [['test a']], passed: true, checkError: true, missing: false, partial: true, listeners: false });
			}));
		}

		test('initiates lazy URI-less root discovery without expanding unrelated files', async () => {
			const extension = ds.add(new TestTestCollection());
			const resolved: (string | undefined)[] = [];
			extension.resolveHandler = item => {
				resolved.push(item?.id);
				if (!item) {
					extension.root.children.add(new TestTestItem(new TestId(['ctrlId', 'a']), 'test a', URI.file('/workspace/a.ts')));
					const unrelated = new TestTestItem(new TestId(['ctrlId', 'b']), 'test b', URI.file('/workspace/b.ts'));
					unrelated.canResolveChildren = true;
					extension.root.children.add(unrelated);
				}
			};
			useCollection(extension);
			const requests = useCompletedRun();
			const result = await invoke({ files: ['/workspace/a.ts'] });
			assert.deepStrictEqual({
				resolved,
				requests: requests.map(request => request.tests.map(test => test.item.extId)),
				passed: resultText(result).includes('<summary passed=1 failed=0 />'),
				completed: resultText(result).includes('discovery: completed'),
				error: !!result.toolResultError,
			}, { resolved: [undefined], requests: [[new TestId(['ctrlId', 'a']).toString()]], passed: true, completed: true, error: false });
		});

		test('reports completed empty discovery after resolving a lazy controller', async () => {
			const extension = ds.add(new TestTestCollection());
			extension.resolveHandler = () => { };
			useCollection(extension);
			const result = await invoke({ files: ['/workspace/a.ts'] });
			assert.deepStrictEqual({
				completed: resultText(result).includes('No discovered test items match this file; discovery: completed.'),
				error: !!result.toolResultError,
			}, { completed: true, error: true });
		});

		test('reports controller discovery exceptions rather than completed empty discovery', async () => {
			const extension = ds.add(new TestTestCollection());
			extension.resolveHandler = () => { };
			const { collection } = useCollection(extension);
			collection.expand = async () => { throw new Error('Discovery connection failed'); };
			const result = await invoke({ files: ['/workspace/a.ts'] });
			assert.deepStrictEqual({
				failed: resultText(result).includes('discovery: failed'),
				evidence: resultText(result).includes('Discovery connection failed'),
				configuredCommand: resultText(result).includes('repository\'s configured test command'),
				error: !!result.toolResultError,
			}, { failed: true, evidence: true, configuredCommand: true, error: true });
		});

		for (const failure of ['throw', 'reject']) {
			test(`consumes a real resolveHandler ${failure} through collection diffs`, async () => {
				const consoleError = sinon.stub(console, 'error');
				try {
					const message = 'Resolve handler could not import generated tests';
					const extension = ds.add(new TestTestCollection());
					extension.resolveHandler = () => {
						if (failure === 'throw') {
							throw new Error(message);
						}
						return Promise.reject(new Error(message));
					};
					const { collection } = useCollection(extension);
					const requests = useCompletedRun();
					const result = await invoke({ files: ['/workspace/a.ts'] });
					assert.deepStrictEqual({
						metadata: collection.getNodeById('ctrlId')?.item.error,
						failed: resultText(result).includes('discovery: failed'),
						evidence: resultText(result).includes(message),
						configuredCommand: resultText(result).includes('repository\'s configured test command'),
						error: !!result.toolResultError,
						runCount: requests.length,
					}, { metadata: message, failed: true, evidence: true, configuredCommand: true, error: true, runCount: 0 });
				} finally {
					consoleError.restore();
				}
			});
		}

		test('consumes provider root discovery errors from existing item metadata', async () => {
			const extension = ds.add(new TestTestCollection());
			extension.resolveHandler = () => {
				extension.root.set('error', new MarkdownString('Provider could not load the test manifest'));
			};
			useCollection(extension);
			const result = await invoke({ files: ['/workspace/a.ts'] });
			assert.deepStrictEqual({
				failed: resultText(result).includes('discovery: failed'),
				evidence: resultText(result).includes('Provider could not load the test manifest'),
				error: !!result.toolResultError,
			}, { failed: true, evidence: true, error: true });
		});

		test('bounds pending root discovery to five seconds', () => runWithFakedTimers({}, async () => {
			const extension = ds.add(new TestTestCollection());
			extension.resolveHandler = () => new Promise<void>(() => { });
			const { diffs } = useCollection(extension);
			const requests = useCompletedRun();
			const start = Date.now();
			const result = await invoke({ files: ['/workspace/a.ts'] });
			assert.deepStrictEqual({
				elapsed: Date.now() - start,
				pending: resultText(result).includes('discovery: pending'),
				configuredCommand: resultText(result).includes('repository\'s configured test command'),
				completed: resultText(result).includes('discovery: completed'),
				runCount: requests.length,
				listeners: diffs.hasListeners(),
			}, { elapsed: 5_000, pending: true, configuredCommand: true, completed: false, runCount: 0, listeners: false });
		}));

		async function useExternallyExpandingFile() {
			const file = useFile();
			const extId = file.item.toTestItem().extId;
			await file.collection.expand(extId, 0);
			file.collection.apply([{ op: TestDiffOpType.Update, item: { extId, expand: TestItemExpandState.BusyExpanding } }]);
			return { ...file, extId };
		}

		test('bounds externally pending expansion despite an already-completed cached promise', () => runWithFakedTimers({}, async () => {
			const { diffs } = await useExternallyExpandingFile();
			const requests = useCompletedRun();
			const start = Date.now();
			const result = await invoke({ files: ['/workspace/a.ts'] });
			assert.deepStrictEqual({
				elapsed: Date.now() - start,
				pending: resultText(result).includes('discovery: pending'),
				configuredCommand: resultText(result).includes('repository\'s configured test command'),
				runCount: requests.length,
				listeners: diffs.hasListeners(),
			}, { elapsed: 5_000, pending: true, configuredCommand: true, runCount: 0, listeners: false });
		}));

		test('cancels externally pending expansion and releases its state listener', async () => {
			const { diffs } = await useExternallyExpandingFile();
			const subscribed = new DeferredPromise<void>();
			testService.onDidProcessDiff = listener => {
				const subscription = diffs.event(listener);
				void subscribed.complete();
				return subscription;
			};
			const token = ds.add(new CancellationTokenSource());
			const requests = useCompletedRun();
			const pending = invoke({ files: ['/workspace/a.ts'] }, token.token);
			await subscribed.p;
			token.cancel();
			const result = await pending;
			assert.deepStrictEqual({
				cancelled: resultText(result).includes('cancelled'),
				runCount: requests.length,
				listeners: diffs.hasListeners(),
			}, { cancelled: true, runCount: 0, listeners: false });
		});

		test('runs only after the actual externally pending expansion state becomes idle', async () => {
			const { collection, diffs, extId } = await useExternallyExpandingFile();
			const subscribed = new DeferredPromise<void>();
			testService.onDidProcessDiff = listener => {
				const subscription = diffs.event(listener);
				void subscribed.complete();
				return subscription;
			};
			const requests = useCompletedRun();
			const pending = invoke({ files: ['/workspace/a.ts'] });
			await subscribed.p;
			const beforeCompletion = requests.length;
			const diff: TestsDiff = [{ op: TestDiffOpType.Update, item: { extId, expand: TestItemExpandState.Expanded } }];
			collection.apply(diff);
			diffs.fire(diff);
			const result = await pending;
			assert.deepStrictEqual({
				beforeCompletion,
				runCount: requests.length,
				passed: resultText(result).includes('<summary passed=1 failed=0 />'),
				listeners: diffs.hasListeners(),
				error: !!result.toolResultError,
			}, { beforeCompletion: 0, runCount: 1, passed: true, listeners: false, error: false });
		});

		test('bounds name-filter discovery to the same five-second deadline', () => runWithFakedTimers({}, async () => {
			const { extension, item, collection } = useFile();
			item.canResolveChildren = true;
			extension.resolveHandler = () => new Promise<void>(() => { });
			collection.apply(extension.collectDiff());
			const requests = useCompletedRun();
			const result = await invoke({ files: ['/workspace/a.ts'], testNames: ['nested test'] });
			assert.deepStrictEqual({
				fileMatched: resultText(result).includes('matching this file: 1'),
				nameMatched: resultText(result).includes('matching the requested test names: 0'),
				pending: resultText(result).includes('discovery: pending'),
				runCount: requests.length,
			}, { fileMatched: true, nameMatched: true, pending: true, runCount: 0 });
		}));

		test('cancels busy discovery and removes its diff listener', async () => {
			const { item, diffs, flush } = useFile();
			item.set('busy', true);
			flush();
			const subscribed = new DeferredPromise<void>();
			testService.onDidProcessDiff = listener => {
				const subscription = diffs.event(listener);
				void subscribed.complete();
				return subscription;
			};
			const token = ds.add(new CancellationTokenSource());
			const requests = useCompletedRun();
			const pending = invoke({ files: ['/workspace/a.ts'] }, token.token);
			await subscribed.p;
			token.cancel();
			const result = await pending;
			assert.deepStrictEqual({
				cancelled: resultText(result).includes('cancelled'),
				invalidPath: resultText(result).includes('missing'),
				passing: resultText(result).includes('<summary'),
				listeners: diffs.hasListeners(),
				runCount: requests.length,
			}, { cancelled: true, invalidPath: false, passing: false, listeners: false, runCount: 0 });
		});

		test('pre-cancelled requests do not check paths or start discovery', async () => {
			let checked = false;
			fileService.stat = async () => { checked = true; throw new Error('should not be called'); };
			const result = await invoke({ files: ['/workspace/a.ts'] }, CancellationToken.Cancelled);
			assert.deepStrictEqual({ checked, cancelled: resultText(result).includes('cancelled'), passing: resultText(result).includes('<summary') }, {
				checked: false, cancelled: true, passing: false,
			});
		});

		test('keeps file matching distinct from name-filter matching', async () => {
			useFile();
			const requests = useCompletedRun();
			const result = await invoke({ files: ['/workspace/a.ts'], testNames: ['does not match'] });
			assert.deepStrictEqual({
				fileMatched: resultText(result).includes('matching this file: 1'),
				nameMismatch: resultText(result).includes('matching the requested test names: 0'),
				fileMismatch: resultText(result).includes('No discovered test items match this file'),
				error: !!result.toolResultError,
				runCount: requests.length,
			}, { fileMatched: true, nameMismatch: true, fileMismatch: false, error: true, runCount: 0 });
		});

		for (const files of [undefined, ['/workspace/a.ts']]) {
			test(`reports each unmatched name while running known matches (${files ? 'file' : 'workspace'})`, async () => {
				useFile();
				const requests = useCompletedRun();
				const result = await invoke({ files, testNames: [' TEST A ', ' Missing Test ', 'test a'] });
				assert.deepStrictEqual({
					requests: requests.map(request => request.tests.map(test => test.item.label)),
					passed: resultText(result).includes('<summary passed=1 failed=0 />'),
					missingName: resultText(result).includes('Requested test names with no discovered or executed match: missing test.'),
					partial: !!result.toolResultError,
				}, { requests: [['test a']], passed: true, missingName: true, partial: true });
			});

			test(`selected suites cover their discovered descendants (${files ? 'file' : 'workspace'})`, async () => {
				const { item, flush } = useFile('/workspace/a.ts', 'suite a');
				item.children.add(new TestTestItem(new TestId(['ctrlId', 'a', 'nested']), 'descendant test', URI.file('/workspace/a.ts')));
				flush();
				const requests = useCompletedRun();
				const result = await invoke({ files, testNames: ['suite a', 'descendant'] });
				assert.deepStrictEqual({
					requests: requests.map(request => request.tests.map(test => test.item.label)),
					passed: resultText(result).includes('<summary passed=1 failed=0 />'),
					missingNames: resultText(result).includes('Requested test names with no discovered or executed match:'),
					partial: !!result.toolResultError,
				}, { requests: [['suite a']], passed: true, missingNames: false, partial: false });
			});
		}

		test('uses completed descendant evidence for a selected suite without expanding it unnecessarily', async () => {
			useFile('/workspace/a.ts', 'suite a');
			const requested: string[][] = [];
			testService.runTests = async request => {
				requested.push(request.tests.map(test => test.item.label));
				const completed = createResultWithTests([{ extId: new TestId(['ctrlId', 'a', 'nested']).toString(), label: 'descendant test', state: TestResultState.Passed }]);
				completed.markComplete();
				return completed;
			};
			const result = await invoke({ files: ['/workspace/a.ts'], testNames: ['suite a', 'descendant'] });
			assert.deepStrictEqual({
				requested,
				passed: resultText(result).includes('<summary passed=1 failed=0 />'),
				missingNames: resultText(result).includes('Requested test names with no discovered or executed match:'),
				partial: !!result.toolResultError,
			}, { requested: [['suite a']], passed: true, missingNames: false, partial: false });
		});

		test('runs matched files and reports missing and undiscovered files in mixed requests', async () => {
			useFile();
			fileService.stat = async uri => {
				if (uri.path.endsWith('missing.ts')) {
					throw new FileOperationError('File not found', FileOperationResult.FILE_NOT_FOUND);
				}
				return upcastPartial<IFileStatWithPartialMetadata>({ resource: uri });
			};
			const requests = useCompletedRun();
			const result = await invoke({ files: ['/workspace/a.ts', '/workspace/missing.ts', '/workspace/undiscovered.ts'] });
			assert.deepStrictEqual({
				requests: requests.map(request => request.tests.map(test => test.item.label)),
				passed: resultText(result).includes('<summary passed=1 failed=0 />'),
				missing: resultText(result).includes('/workspace/missing.ts: path is missing.'),
				undiscovered: resultText(result).includes('/workspace/undiscovered.ts: path exists.'),
				partial: result.toolResultError,
			}, { requests: [['test a']], passed: true, missing: true, undiscovered: true, partial: 'Only the matched tests were run. The full request has not been validated.' });
		});

		test('runs matching nested test names and reports the other file as unvalidated', async () => {
			const { extension, item, flush } = useFile('/workspace/a.ts', 'file a');
			item.children.add(new TestTestItem(new TestId(['ctrlId', 'a', 'nested']), 'wanted nested test', URI.file('/workspace/a.ts')));
			extension.root.children.add(new TestTestItem(new TestId(['ctrlId', 'b']), 'other test', URI.file('/workspace/b.ts')));
			flush();
			const requests = useCompletedRun();
			const result = await invoke({ files: ['/workspace/a.ts', '/workspace/b.ts'], testNames: ['wanted'] });
			assert.deepStrictEqual({
				requests: requests.map(request => request.tests.map(test => test.item.label)),
				passed: resultText(result).includes('<summary passed=1 failed=0 />'),
				mismatch: resultText(result).includes('matching the requested test names: 0'),
				partial: !!result.toolResultError,
			}, { requests: [['wanted nested test']], passed: true, mismatch: true, partial: true });
		});

		test('reports provider errors relevant to the requested file, not another file', async () => {
			const { extension, item, flush } = useFile();
			item.set('error', 'Import failed: generated output is unavailable');
			const other = new TestTestItem(new TestId(['ctrlId', 'b']), 'other test', URI.file('/workspace/b.ts'));
			other.set('error', 'Unrelated provider error');
			extension.root.children.add(other);
			flush();
			const requests = useCompletedRun(TestResultState.Skipped);
			const result = await invoke({ files: ['/workspace/a.ts'] });
			assert.deepStrictEqual({
				evidence: resultText(result).includes('Import failed: generated output is unavailable'),
				unrelated: resultText(result).includes('Unrelated provider error'),
				failedDiscovery: resultText(result).includes('discovery: failed'),
				runCount: requests.length,
				error: !!result.toolResultError,
			}, { evidence: true, unrelated: false, failedDiscovery: true, runCount: 1, error: true });
		});

		test('matches absolute and relative paths using the real remote workspace scheme', async () => {
			const remoteFolder = URI.from({ scheme: Schemas.vscodeRemote, authority: 'ssh-remote+host', path: '/workspace' });
			const remoteFile = URI.joinPath(remoteFolder, 'a.ts');
			workspaceContext.getWorkspace = () => upcastPartial<IWorkspace>({ folders: [upcastPartial<IWorkspaceFolder>({ uri: remoteFolder })] });
			const extension = ds.add(new TestTestCollection());
			extension.root.children.add(new TestTestItem(new TestId(['ctrlId', 'a']), 'remote test', remoteFile));
			useCollection(extension);
			const checked: string[] = [];
			fileService.stat = async uri => {
				checked.push(uri.toString());
				return upcastPartial<IFileStatWithPartialMetadata>({ resource: uri });
			};
			const requests = useCompletedRun();
			const result = await invoke({ files: ['/workspace/a.ts', 'a.ts'] });
			assert.deepStrictEqual({
				checked, requested: requests.map(request => request.tests.map(test => test.item.uri?.toString())),
				passed: resultText(result).includes('<summary passed=1 failed=0 />'), error: !!result.toolResultError,
			}, { checked: [remoteFile.toString(), remoteFile.toString()], requested: [[remoteFile.toString()]], passed: true, error: false });
		});

		for (const files of [undefined, [], ['/workspace/a.ts']]) {
			for (const state of [undefined, TestResultState.Unset, TestResultState.Queued, TestResultState.Skipped]) {
				test(`does not validate ${files?.length ? 'explicit files' : files ? 'an empty file list' : 'the workspace'} when no tests execute (state ${state})`, async () => {
					useFile();
					const result = state === undefined ? createLiveTestResult() : createResultWithTests([{ extId: new TestId(['ctrlId', 'a']).toString(), label: 'a', state }]);
					if (state === undefined) {
						result.addTask({ id: 't', name: 'test task', ctrlId: 'ctrlId', running: true });
					}
					const output = 'Cannot import /workspace/generated/a.js\n';
					result.appendOutput(VSBuffer.fromString(output), 't');
					result.markComplete();
					testService.runTests = async () => result;
					const response = await invoke({ files });
					assert.deepStrictEqual({
						error: !!response.toolResultError,
						noTests: resultText(response).includes('executed no tests'),
						output: resultText(response).includes(output),
						configuredCommand: resultText(response).includes('repository\'s configured test command'),
						passingSummary: resultText(response).includes('<summary passed=0 failed=0 />'),
					}, { error: true, noTests: true, output: true, configuredCommand: true, passingSummary: false });
				});
			}
		}

		test('reports no execution in progress instead of zero passing tests', () => runWithFakedTimers({}, async () => {
			useFile();
			const empty = createLiveTestResult();
			empty.addTask({ id: 't', name: 'test task', ctrlId: 'ctrlId', running: true });
			testService.runTests = async () => {
				void timeout(10).then(() => empty.markComplete());
				return empty;
			};
			const updates: IToolProgressStep[] = [];
			const result = await tool.invoke(upcastPartial<IToolInvocation>({ parameters: {} }), noopCountTokens, {
				report: update => updates.push(update),
			}, CancellationToken.None);
			assert.deepStrictEqual({
				error: !!result.toolResultError,
				lastProgress: updates.at(-1),
				passing: resultText(result).includes('<summary'),
			}, { error: true, lastProgress: { message: 'No tests were run.', progress: undefined }, passing: false });
		}));

		test('handles a completed empty result with no tasks after the capture grace window', () => runWithFakedTimers({}, async () => {
			useFile();
			const completed = createLiveTestResult();
			completed.markComplete();
			testService.runTests = async () => completed;
			const result = await invoke({ files: ['/workspace/a.ts'] });
			assert.deepStrictEqual({ error: !!result.toolResultError, noTests: resultText(result).includes('executed no tests') }, { error: true, noTests: true });
		}));

		test('handles out-of-band completion without a task as an unvalidated empty run', () => runWithFakedTimers({}, async () => {
			useFile();
			const results = ds.add(new Emitter<ResultChangeEvent>());
			resultService.onResultsChanged = results.event;
			const empty = createLiveTestResult();
			testService.runTests = async () => {
				results.fire({ started: empty });
				empty.markComplete();
				return empty;
			};
			const result = await invoke({ files: ['/workspace/a.ts'] });
			assert.deepStrictEqual({
				error: !!result.toolResultError,
				noTests: resultText(result).includes('executed no tests'),
				configuredCommand: resultText(result).includes('repository\'s configured test command'),
				listeners: results.hasListeners(),
			}, { error: true, noTests: true, configuredCommand: true, listeners: false });
		}));

		for (const taskAfterStarted of [false, true]) {
			test(`prefers delayed detached tasks over the completed initial empty result (task ${taskAfterStarted ? 'after' : 'before'} started event)`, () => runWithFakedTimers({}, async () => {
				const { extension, item } = useFile();
				const results = ds.add(new Emitter<ResultChangeEvent>());
				resultService.onResultsChanged = results.event;
				const initial = createLiveTestResult();
				initial.markComplete();
				const detached = createLiveTestResult();
				const addTask = () => {
					detached.addTask({ id: 't', name: 'detached task', ctrlId: 'ctrlId', running: true });
					detached.addTestChainToRun('ctrlId', [extension.root.toTestItem(), item.toTestItem()]);
					detached.updateState(item.toTestItem().extId, 't', TestResultState.Passed);
				};
				testService.runTests = async () => {
					results.fire({ started: initial });
					void (async () => {
						await timeout(10);
						if (!taskAfterStarted) {
							addTask();
						}
						results.fire({ started: detached });
						if (taskAfterStarted) {
							await timeout(10);
							addTask();
						}
						detached.markComplete();
					})();
					return initial;
				};
				const start = Date.now();
				const result = await invoke({ files: ['/workspace/a.ts'] });
				assert.deepStrictEqual({
					elapsed: Date.now() - start,
					passed: resultText(result).includes('<summary passed=1 failed=0 />'),
					noTests: resultText(result).includes('executed no tests'),
					error: !!result.toolResultError,
					listeners: results.hasListeners(),
				}, { elapsed: taskAfterStarted ? 20 : 10, passed: true, noTests: false, error: false, listeners: false });
			}));
		}

		test('recommends the configured command when no live test run starts', () => runWithFakedTimers({}, async () => {
			useFile();
			testService.runTests = () => Promise.resolve(upcastPartial({}));
			const result = await invoke({ files: ['/workspace/a.ts'] });
			assert.deepStrictEqual({
				error: !!result.toolResultError,
				noRun: resultText(result).includes('No test run was started'),
				configuredCommand: resultText(result).includes('repository\'s configured test command'),
			}, { error: true, noRun: true, configuredCommand: true });
		}));

		test('includes provider errors published during an empty run', () => runWithFakedTimers({}, async () => {
			const { item, flush } = useFile();
			const completed = createLiveTestResult();
			completed.markComplete();
			testService.runTests = async () => {
				item.set('error', 'Cannot import generated output for this test');
				flush();
				return completed;
			};
			const result = await invoke({ files: ['/workspace/a.ts'] });
			assert.deepStrictEqual({
				error: !!result.toolResultError,
				evidence: resultText(result).includes('Cannot import generated output for this test'),
				failedDiscovery: resultText(result).includes('discovery: failed'),
			}, { error: true, evidence: true, failedDiscovery: true });
		}));

		test('preserves failed-test details for a normal completed run', async () => {
			useFile();
			const completed = createResultWithTests([{ extId: new TestId(['ctrlId', 'a']).toString(), label: 'a', state: TestResultState.Failed, messages: [{ type: TestMessageType.Error, message: 'Assertion failed' }] }]);
			completed.markComplete();
			testService.runTests = async () => completed;
			const result = await invoke({ files: ['/workspace/a.ts'] });
			assert.deepStrictEqual({
				failed: resultText(result).includes('<summary passed=0 failed=1 />'), details: resultText(result).includes('Assertion failed'), error: !!result.toolResultError,
			}, { failed: true, details: true, error: false });
		});

		test('preserves coverage and profile selection for completed runs', async () => {
			useFile();
			const completed = createResultWithTests([{ extId: new TestId(['ctrlId', 'a']).toString(), label: 'a', state: TestResultState.Passed }]);
			const coverage = createTestCoverage([{ uri: URI.file('/src/a.ts'), statement: { covered: 8, total: 10 } }]);
			(completed.tasks[0].coverage as ReturnType<typeof observableValue<TestCoverage | undefined>>).set(coverage, undefined);
			completed.markComplete();
			let group: TestRunProfileBitset | undefined;
			testService.runTests = async request => { group = request.group; return completed; };
			const result = await invoke({ files: ['/workspace/a.ts'], mode: 'coverage' });
			assert.deepStrictEqual({
				group, passed: resultText(result).includes('<summary passed=1 failed=0 />'), coverage: resultText(result).includes('<coverageSummary>'), error: !!result.toolResultError,
			}, { group: TestRunProfileBitset.Coverage, passed: true, coverage: true, error: false });
		});

		test('falls back to the run profile when coverage is unsupported', async () => {
			useFile();
			profileService.capabilitiesForTest = () => TestRunProfileBitset.Run;
			const requests = useCompletedRun();
			await invoke({ files: ['/workspace/a.ts'], mode: 'coverage' });
			assert.deepStrictEqual(requests.map(request => request.group), [TestRunProfileBitset.Run]);
		});

		test('handles out-of-band runs which complete before progress monitoring attaches', async () => {
			useFile();
			const results = ds.add(new Emitter<ResultChangeEvent>());
			resultService.onResultsChanged = results.event;
			const completed = createResultWithTests([{ extId: new TestId(['ctrlId', 'a']).toString(), label: 'a', state: TestResultState.Passed }]);
			testService.runTests = async () => {
				results.fire({ started: completed });
				completed.markComplete();
				return completed;
			};
			const result = await invoke({ files: ['/workspace/a.ts'] });
			assert.deepStrictEqual({
				passed: resultText(result).includes('<summary passed=1 failed=0 />'), listeners: results.hasListeners(), error: !!result.toolResultError,
			}, { passed: true, listeners: false, error: false });
		});

		test('cancels result capture without retaining listeners or a capture timeout', () => runWithFakedTimers({}, async () => {
			useFile();
			const results = ds.add(new Emitter<{ started: LiveTestResult }>());
			resultService.onResultsChanged = results.event;
			const token = ds.add(new CancellationTokenSource());
			const started = createLiveTestResult();
			const cancelled: string[] = [];
			testService.cancelTestRun = id => { if (id) { cancelled.push(id); } };
			testService.runTests = async () => {
				results.fire({ started });
				await timeout(10);
				token.cancel();
				return started;
			};
			const result = await invoke({ files: ['/workspace/a.ts'] }, token.token);
			assert.deepStrictEqual({
				cancelled, listeners: results.hasListeners(), message: resultText(result).includes('cancelled'), passing: resultText(result).includes('<summary'),
			}, { cancelled: [started.id], listeners: false, message: true, passing: false });
		}));

		test('cancels a captured running result without a passing summary', () => runWithFakedTimers({}, async () => {
			useFile();
			const running = createLiveTestResult();
			running.addTask({ id: 't', name: 'test task', ctrlId: 'ctrlId', running: true });
			const token = ds.add(new CancellationTokenSource());
			const cancelled: string[] = [];
			testService.cancelTestRun = id => { if (id) { cancelled.push(id); } };
			testService.runTests = async () => {
				void timeout(10).then(() => token.cancel());
				return running;
			};
			const result = await invoke({ files: ['/workspace/a.ts'] }, token.token);
			assert.deepStrictEqual({
				cancelled, message: resultText(result).includes('cancelled'), passing: resultText(result).includes('<summary'),
			}, { cancelled: [running.id], message: true, passing: false });
		}));

		test('reports runner rejection and releases its result listener', async () => {
			useFile();
			const results = ds.add(new Emitter<ResultChangeEvent>());
			resultService.onResultsChanged = results.event;
			testService.runTests = async () => { throw new Error('Runner could not load /workspace/generated/a.js'); };
			const result = await invoke({ files: ['/workspace/a.ts'] });
			assert.deepStrictEqual({
				error: !!result.toolResultError, evidence: resultText(result).includes('Runner could not load /workspace/generated/a.js'), listeners: results.hasListeners(),
			}, { error: true, evidence: true, listeners: false });
		});

		test('describes discovered tests, configured commands, and avoiding repeated path checks', () => {
			assert.deepStrictEqual({
				imperative: RunTestTool.DEFINITION.modelDescription.startsWith('Run tests discovered by VS Code'),
				fallback: RunTestTool.DEFINITION.modelDescription.includes('configured test command'),
				retry: RunTestTool.DEFINITION.modelDescription.includes('do not repeatedly check the same paths'),
			}, { imperative: true, fallback: true, retry: true });
		});
	});

	suite('_buildSummary', () => {
		test('includes pass/fail counts', async () => {
			const result = createResultWithTests([
				{ extId: new TestId(['ctrlId', 'a']).toString(), label: 'a', state: TestResultState.Passed },
				{ extId: new TestId(['ctrlId', 'b']).toString(), label: 'b', state: TestResultState.Failed, messages: [{ type: TestMessageType.Error, message: 'boom' }] },
			]);
			result.markComplete();

			const summary = await buildTestRunSummary(result, TestRunMode.Run, undefined);
			assert.ok(summary.includes('<summary passed=1 failed=1 />'));
		});

		test('combines errored and failed in failure count', async () => {
			const result = createResultWithTests([
				{ extId: new TestId(['ctrlId', 'a']).toString(), label: 'a', state: TestResultState.Failed, messages: [{ type: TestMessageType.Error, message: 'fail' }] },
				{ extId: new TestId(['ctrlId', 'b']).toString(), label: 'b', state: TestResultState.Errored, messages: [{ type: TestMessageType.Error, message: 'error' }] },
				{ extId: new TestId(['ctrlId', 'c']).toString(), label: 'c', state: TestResultState.Passed },
			]);
			result.markComplete();

			const summary = await buildTestRunSummary(result, TestRunMode.Run, undefined);
			assert.ok(summary.includes('failed=2'));
		});

		test('includes coverage when mode is coverage', async () => {
			const coverageData = createTestCoverage([
				{ uri: URI.file('/src/a.ts'), statement: { covered: 8, total: 10 } },
			]);
			const result = createResultWithCoverage(coverageData);
			result.markComplete();

			const summary = await buildTestRunSummary(result, TestRunMode.Coverage, undefined);
			assert.ok(summary.includes('<coverageSummary>'));
		});

		test('omits coverage when mode is run', async () => {
			const result = createLiveTestResult();
			result.addTask({ id: 't', name: 'n', running: true, ctrlId: 'ctrl' });
			result.markComplete();

			const summary = await buildTestRunSummary(result, TestRunMode.Run, undefined);
			assert.ok(!summary.includes('<coverage'));
		});
	});

	suite('getCoverageSummary', () => {
		test('returns overall summary when no coverageFiles specified', async () => {
			const fileA = URI.file('/src/a.ts');
			const fileB = URI.file('/src/b.ts');
			const coverageData = createTestCoverage([
				{ uri: fileA, statement: { covered: 5, total: 10 } },
				{ uri: fileB, statement: { covered: 10, total: 10 } },
			]);
			const result = createResultWithCoverage(coverageData);

			const summary = await getCoverageSummary(result, undefined);
			assert.ok(summary.includes('<coverageSummary>'));
			assert.ok(summary.includes(fileA.fsPath));
			assert.ok(!summary.includes(fileB.fsPath)); // 100% covered, excluded
		});

		test('returns detailed summary for specified coverageFiles', async () => {
			const fileA = URI.file('/src/a.ts');
			const details: CoverageDetails[] = [
				makeDeclaration('uncoveredFn', 10, 0),
				makeStatement(20, 0, 25),
			];
			const coverageData = createTestCoverage([
				{ uri: fileA, statement: { covered: 8, total: 10 }, declaration: { covered: 0, total: 1 }, details },
			]);
			const result = createResultWithCoverage(coverageData);

			const summary = await getCoverageSummary(result, [fileA.fsPath]);
			assert.ok(summary.includes(`<coverage path="${fileA.fsPath}"`));
			assert.ok(summary.includes('uncovered functions:'));
			assert.ok(summary.includes('uncoveredFn(L10)'));
			assert.ok(summary.includes('uncovered lines:'));
		});

		test('returns empty string when no coverage data exists', async () => {
			const fileA = URI.file('/src/a.ts');
			const result = createLiveTestResult();
			result.addTask({ id: 't', name: 'n', running: true, ctrlId: 'ctrl' });

			const summary = await getCoverageSummary(result, [fileA.fsPath]);
			assert.strictEqual(summary, '');
		});

		test('handles multiple coverageFiles', async () => {
			const fileA = URI.file('/src/a.ts');
			const fileB = URI.file('/src/b.ts');
			const coverageData = createTestCoverage([
				{ uri: fileA, statement: { covered: 8, total: 10 }, details: [makeStatement(5, 0)] },
				{ uri: fileB, statement: { covered: 3, total: 10 }, details: [makeDeclaration('fn', 1, 0)] },
			]);
			const result = createResultWithCoverage(coverageData);

			const summary = await getCoverageSummary(result, [fileA.fsPath, fileB.fsPath]);
			assert.ok(summary.includes(fileA.fsPath));
			assert.ok(summary.includes(fileB.fsPath));
		});

		test('skips non-matching coverageFiles gracefully', async () => {
			const fileA = URI.file('/src/a.ts');
			const nonExistent = URI.file('/src/nonexistent.ts');
			const coverageData = createTestCoverage([
				{ uri: fileA, statement: { covered: 8, total: 10 } },
			]);
			const result = createResultWithCoverage(coverageData);

			const summary = await getCoverageSummary(result, [nonExistent.fsPath]);
			assert.strictEqual(summary, '');
		});
	});

	suite('getOverallCoverageSummary', () => {
		test('returns all-covered message when everything is 100%', () => {
			const coverage = createTestCoverage([
				{ uri: URI.file('/src/a.ts'), statement: { covered: 10, total: 10 } },
				{ uri: URI.file('/src/b.ts'), statement: { covered: 5, total: 5 } },
			]);
			assert.strictEqual(
				getOverallCoverageSummary(coverage),
				'<coverageSummary>All files have 100% coverage.</coverageSummary>\n',
			);
		});

		test('sorts files by coverage ascending', () => {
			const high = URI.file('/src/high.ts');
			const low = URI.file('/src/low.ts');
			const mid = URI.file('/src/mid.ts');
			const coverage = createTestCoverage([
				{ uri: high, statement: { covered: 9, total: 10 } },
				{ uri: low, statement: { covered: 3, total: 10 } },
				{ uri: mid, statement: { covered: 7, total: 10 } },
			]);
			const summary = getOverallCoverageSummary(coverage);
			const lowIdx = summary.indexOf(low.fsPath);
			const midIdx = summary.indexOf(mid.fsPath);
			const highIdx = summary.indexOf(high.fsPath);
			assert.ok(lowIdx < midIdx && midIdx < highIdx);
		});

		test('excludes 100% files from listing', () => {
			const partial = URI.file('/src/partial.ts');
			const full = URI.file('/src/full.ts');
			const coverage = createTestCoverage([
				{ uri: partial, statement: { covered: 5, total: 10 } },
				{ uri: full, statement: { covered: 10, total: 10 } },
			]);
			const summary = getOverallCoverageSummary(coverage);
			assert.ok(summary.includes(partial.fsPath));
			assert.ok(!summary.includes(full.fsPath));
		});

		test('includes percentage in output', () => {
			const coverage = createTestCoverage([
				{ uri: URI.file('/src/a.ts'), statement: { covered: 7, total: 10 } },
			]);
			const summary = getOverallCoverageSummary(coverage);
			assert.ok(summary.includes('percent=70.0'));
		});
	});

	suite('getFileCoverageDetails', () => {
		test('shows header with statement counts', async () => {
			const uri = URI.file('/src/foo.ts');
			const file = createFileCov(uri, { covered: 8, total: 10 }, []);
			const output = await getFileCoverageDetails(file, uri.fsPath);
			assert.ok(output.includes('statements=8/10'));
			assert.ok(output.includes('percent=80.0'));
			assert.ok(output.startsWith(`<coverage path="${uri.fsPath}"`));
			assert.ok(output.endsWith('</coverage>\n'));
		});

		test('includes branch counts when available', async () => {
			const uri = URI.file('/src/foo.ts');
			const file = createFileCov(uri, { covered: 8, total: 10 }, [], { branch: { covered: 3, total: 5 } });
			const output = await getFileCoverageDetails(file, uri.fsPath);
			assert.ok(output.includes('branches=3/5'));
		});

		test('includes declaration counts when available', async () => {
			const uri = URI.file('/src/foo.ts');
			const file = createFileCov(uri, { covered: 8, total: 10 }, [], { declaration: { covered: 2, total: 4 } });
			const output = await getFileCoverageDetails(file, uri.fsPath);
			assert.ok(output.includes('declarations=2/4'));
		});

		test('omits branch/declaration when not available', async () => {
			const uri = URI.file('/src/foo.ts');
			const file = createFileCov(uri, { covered: 8, total: 10 }, []);
			const output = await getFileCoverageDetails(file, uri.fsPath);
			assert.ok(!output.includes('branches='));
			assert.ok(!output.includes('declarations='));
		});

		test('lists uncovered declarations', async () => {
			const uri = URI.file('/src/foo.ts');
			const details: CoverageDetails[] = [
				makeDeclaration('handleError', 89, 0),
				makeDeclaration('processQueue', 120, 0),
				makeDeclaration('coveredFn', 50, 3),
			];
			const file = createFileCov(uri, { covered: 8, total: 10 }, details, { declaration: { covered: 1, total: 3 } });
			const output = await getFileCoverageDetails(file, uri.fsPath);
			assert.ok(output.includes('uncovered functions: handleError(L89), processQueue(L120)'));
			assert.ok(!output.includes('coveredFn'));
		});

		test('lists uncovered branches with labels', async () => {
			const uri = URI.file('/src/foo.ts');
			const details: CoverageDetails[] = [
				makeStatement(34, 5, undefined, [
					makeBranch(34, 5, 'then'),
					makeBranch(36, 0, 'else'),
				]),
				makeStatement(56, 2, undefined, [
					makeBranch(56, 0, 'case "foo"'),
					makeBranch(58, 2, 'case "bar"'),
				]),
			];
			const file = createFileCov(uri, { covered: 8, total: 10 }, details, { branch: { covered: 2, total: 4 } });
			const output = await getFileCoverageDetails(file, uri.fsPath);
			assert.ok(output.includes('uncovered branches: L36(else), L56(case "foo")'));
		});

		test('lists uncovered branches without labels', async () => {
			const uri = URI.file('/src/foo.ts');
			const details: CoverageDetails[] = [
				makeStatement(10, 1, undefined, [makeBranch(10, 0)]),
			];
			const file = createFileCov(uri, { covered: 8, total: 10 }, details);
			const output = await getFileCoverageDetails(file, uri.fsPath);
			assert.ok(output.includes('uncovered branches: L10\n'));
		});

		test('uses parent statement location when branch has no location', async () => {
			const uri = URI.file('/src/foo.ts');
			const details: CoverageDetails[] = [
				makeStatement(42, 1, undefined, [{ count: 0, label: 'else' }]),
			];
			const file = createFileCov(uri, { covered: 8, total: 10 }, details);
			const output = await getFileCoverageDetails(file, uri.fsPath);
			assert.ok(output.includes('L42(else)'));
		});

		test('lists merged uncovered line ranges', async () => {
			const uri = URI.file('/src/foo.ts');
			const details: CoverageDetails[] = [
				makeStatement(23, 0, 27),
				makeStatement(28, 0, 30),
				makeStatement(45, 0),
				makeStatement(67, 0, 72),
				makeStatement(100, 0, 105),
				makeStatement(50, 5), // covered
			];
			const file = createFileCov(uri, { covered: 5, total: 11 }, details);
			const output = await getFileCoverageDetails(file, uri.fsPath);
			assert.ok(output.includes('uncovered lines: 23-30, 45, 67-72, 100-105'));
		});

		test('omits uncovered sections when all covered', async () => {
			const uri = URI.file('/src/foo.ts');
			const details: CoverageDetails[] = [
				makeDeclaration('fn', 10, 3),
				makeStatement(20, 5),
				makeStatement(30, 1, undefined, [makeBranch(30, 1, 'then'), makeBranch(32, 2, 'else')]),
			];
			const file = createFileCov(uri, { covered: 10, total: 10 }, details);
			const output = await getFileCoverageDetails(file, uri.fsPath);
			assert.ok(!output.includes('uncovered'));
		});

		test('handles details() throwing gracefully', async () => {
			const uri = URI.file('/src/err.ts');
			const result = createLiveTestResult();
			const accessor: ICoverageAccessor = {
				getCoverageDetails: () => Promise.reject(new Error('not available')),
			};
			const file = new FileCoverage({ id: 'err', uri, statement: { covered: 5, total: 10 } }, result, accessor);
			const output = await getFileCoverageDetails(file, uri.fsPath);
			assert.ok(output.includes(`<coverage path="${uri.fsPath}"`));
			assert.ok(output.includes('</coverage>'));
			assert.ok(!output.includes('uncovered'));
		});

		test('full output snapshot', async () => {
			const uri = URI.file('/src/foo.ts');
			const details: CoverageDetails[] = [
				makeDeclaration('uncoveredFn', 10, 0),
				makeDeclaration('coveredFn', 20, 3),
				makeStatement(30, 0, 32),
				makeStatement(40, 5, undefined, [
					makeBranch(40, 5, 'then'),
					makeBranch(42, 0, 'else'),
				]),
				makeStatement(50, 3),
			];
			const file = createFileCov(
				uri,
				{ covered: 8, total: 10 },
				details,
				{ branch: { covered: 1, total: 2 }, declaration: { covered: 1, total: 2 } },
			);
			assert.deepStrictEqual(
				await getFileCoverageDetails(file, uri.fsPath),
				`<coverage path="${uri.fsPath}" percent=71.4 statements=8/10 branches=1/2 declarations=1/2>\n` +
				'uncovered functions: uncoveredFn(L10)\n' +
				'uncovered branches: L42(else)\n' +
				'uncovered lines: 30-32\n' +
				'</coverage>\n',
			);
		});
	});

	suite('mergeLineRanges', () => {
		test('returns empty for empty input', () => {
			assert.strictEqual(mergeLineRanges([]), '');
		});

		test('single range', () => {
			assert.strictEqual(mergeLineRanges([[5, 10]]), '5-10');
		});

		test('single line', () => {
			assert.strictEqual(mergeLineRanges([[5, 5]]), '5');
		});

		test('merges contiguous ranges', () => {
			assert.strictEqual(mergeLineRanges([[1, 3], [4, 6]]), '1-6');
		});

		test('keeps non-contiguous ranges separate', () => {
			assert.strictEqual(mergeLineRanges([[1, 3], [10, 12]]), '1-3, 10-12');
		});

		test('merges overlapping ranges', () => {
			assert.strictEqual(mergeLineRanges([[1, 5], [3, 8]]), '1-8');
		});

		test('merges adjacent single-line ranges', () => {
			assert.strictEqual(mergeLineRanges([[5, 5], [6, 6], [10, 10]]), '5-6, 10');
		});

		test('handles unsorted input', () => {
			assert.strictEqual(mergeLineRanges([[10, 12], [1, 3], [4, 6]]), '1-6, 10-12');
		});

		test('handles complex mixed ranges', () => {
			assert.strictEqual(mergeLineRanges([[1, 1], [3, 5], [2, 2], [7, 9], [10, 10]]), '1-5, 7-10');
		});
	});

	suite('getFailureDetails', () => {
		test('formats expected/actual outputs', async () => {
			const result = createResultWithTests([{
				extId: new TestId(['ctrlId', 'suite', 'myTest']).toString(),
				label: 'myTest',
				state: TestResultState.Failed,
				messages: [{
					type: TestMessageType.Error,
					message: 'Assertion failed',
					expected: 'hello',
					actual: 'world',
				}],
			}]);
			result.markComplete();

			const output = await getFailureDetails(result);
			assert.ok(output.includes('<expectedOutput>\nhello\n</expectedOutput>'));
			assert.ok(output.includes('<actualOutput>\nworld\n</actualOutput>'));
		});

		test('formats plain message when no expected/actual', async () => {
			const result = createResultWithTests([{
				extId: new TestId(['ctrlId', 'myTest']).toString(),
				label: 'myTest',
				state: TestResultState.Failed,
				messages: [{
					type: TestMessageType.Error,
					message: 'Something went wrong',
				}],
			}]);
			result.markComplete();

			const output = await getFailureDetails(result);
			assert.ok(output.includes('<message>\nSomething went wrong\n</message>'));
		});

		test('includes test name and path', async () => {
			const result = createResultWithTests([{
				extId: new TestId(['ctrlId', 'suite1', 'suite2', 'myTest']).toString(),
				label: 'myTest',
				state: TestResultState.Failed,
				messages: [{ type: TestMessageType.Error, message: 'fail' }],
			}]);
			result.markComplete();

			const output = await getFailureDetails(result);
			assert.ok(output.includes('name="myTest"'));
			assert.ok(output.includes('path="suite1 > suite2"'));
		});

		test('includes stack trace frames', async () => {
			const testUri = URI.file('/src/test.ts');
			const helperUri = URI.file('/src/helper.ts');
			const result = createResultWithTests([{
				extId: new TestId(['ctrlId', 'myTest']).toString(),
				label: 'myTest',
				state: TestResultState.Failed,
				messages: [{
					type: TestMessageType.Error,
					message: 'fail',
					stackTrace: [
						{ uri: testUri, position: { lineNumber: 10, column: 5 }, label: 'testFn' },
						{ uri: helperUri, position: undefined, label: 'helperFn' },
						{ uri: undefined, position: undefined, label: 'anonymous' },
					],
				}],
			}]);
			result.markComplete();

			const output = await getFailureDetails(result);
			assert.ok(output.includes(`path="${testUri.fsPath}" line="10" col="5"`));
			assert.ok(output.includes(`path="${helperUri.fsPath}">helperFn</stackFrame>`));
			assert.ok(output.includes('>anonymous</stackFrame>'));
		});

		test('includes location information', async () => {
			const testUri = URI.file('/src/test.ts');
			const result = createResultWithTests([{
				extId: new TestId(['ctrlId', 'myTest']).toString(),
				label: 'myTest',
				state: TestResultState.Failed,
				messages: [{
					type: TestMessageType.Error,
					message: 'fail',
					location: { uri: testUri, range: new Range(42, 8, 42, 20) },
				}],
			}]);
			result.markComplete();

			const output = await getFailureDetails(result);
			assert.ok(output.includes(`path="${testUri.fsPath}" line="42" col="8"`));
		});

		test('skips passing tests', async () => {
			const result = createResultWithTests([
				{ extId: new TestId(['ctrlId', 'pass']).toString(), label: 'pass', state: TestResultState.Passed },
				{ extId: new TestId(['ctrlId', 'fail']).toString(), label: 'fail', state: TestResultState.Failed, messages: [{ type: TestMessageType.Error, message: 'boom' }] },
			]);
			result.markComplete();

			const output = await getFailureDetails(result);
			assert.ok(!output.includes('name="pass"'));
			assert.ok(output.includes('name="fail"'));
		});

		test('shows task output when no per-test messages', async () => {
			const result = createResultWithTests([{
				extId: new TestId(['ctrlId', 'myTest']).toString(),
				label: 'myTest',
				state: TestResultState.Failed,
			}]);
			result.appendOutput(VSBuffer.fromString('raw test output'), 't');
			result.markComplete();

			const output = await getFailureDetails(result);
			assert.ok(output.includes('<output>\nraw test output\n</output>'));
		});
	});

	suite('prepareToolInvocation', () => {
		test('shows file names in confirmation', async () => {
			const prepared = await tool.prepareToolInvocation(
				upcastPartial<IToolInvocationPreparationContext>({ parameters: { files: ['/path/to/test1.ts', '/path/to/test2.ts'] }, toolCallId: 'call-1', chatSessionResource: undefined }),
				CancellationToken.None,
			);
			assert.ok(prepared);
			const msg = prepared.confirmationMessages?.message;
			assert.ok(msg);
			const msgStr = typeof msg === 'string' ? msg : msg.value;
			assert.ok(msgStr.includes('test1.ts'));
			assert.ok(msgStr.includes('test2.ts'));
		});

		test('shows all-tests message when no files', async () => {
			const prepared = await tool.prepareToolInvocation(
				upcastPartial<IToolInvocationPreparationContext>({ parameters: {}, toolCallId: 'call-2', chatSessionResource: undefined }),
				CancellationToken.None,
			);
			assert.ok(prepared);
			const msg = prepared.confirmationMessages?.message;
			assert.ok(msg);
			const msgStr = typeof msg === 'string' ? msg : msg.value;
			assert.ok(msgStr.toLowerCase().includes('all tests'));
		});
	});
});
