/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, expect, suite, test } from 'vitest';
import type * as vscode from 'vscode';
import { IGitExtensionService } from '../../../../platform/git/common/gitExtensionService';
import type { API, Change, Repository, RepositoryState } from '../../../../platform/git/vscode/git';
import { ITabsAndEditorsService } from '../../../../platform/tabs/common/tabsAndEditorsService';
import { ITestingServicesAccessor } from '../../../../platform/test/node/services';
import { TestingTabsAndEditorsService } from '../../../../platform/test/node/simulationWorkspaceServices';
import { TestWorkspaceService } from '../../../../platform/test/node/testWorkspaceService';
import { ITestFailure, ITestProvider } from '../../../../platform/testing/common/testProvider';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { Event } from '../../../../util/vs/base/common/event';
import { URI } from '../../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { Position } from '../../../../util/vs/workbench/api/common/extHostTypes/position';
import { Range } from '../../../../util/vs/workbench/api/common/extHostTypes/range';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { TestFailureTool } from '../testFailureTool';
import { toolResultToString } from './toolTestUtils';

const upcastPartial = <T extends {}>(value: Partial<T>): T => value as T;

suite('TestFailureTool', () => {
	let accessor: ITestingServicesAccessor;
	let instantiationService: IInstantiationService;
	let resolver: TestFailureTool;
	let failures: ITestFailure[];
	let activeTextEditor: vscode.TextEditor | undefined;
	let visibleTextEditors: vscode.TextEditor[];
	let workingChanges: Change[];

	const mockTestFailure: ITestFailure = {
		snapshot: upcastPartial<vscode.TestResultSnapshot>({
			uri: URI.file('/test/file.test.ts'),
			label: 'Test Suite',
		}),
		task: upcastPartial<vscode.TestSnapshotTaskState>({
			messages: [{
				message: 'Expected true to be false',
				location: { uri: URI.file('/test/file.test.ts'), range: new Range(1, 1, 1, 1) }
			}]
		})
	};

	const noopGitService: IGitExtensionService = {
		_serviceBrand: undefined,
		onDidChange: Event.None,
		extensionAvailable: false,
		getExtensionApi: () => upcastPartial<API>({
			getRepository: () => upcastPartial<Repository>({
				state: upcastPartial<RepositoryState>({
					indexChanges: [],
					workingTreeChanges: workingChanges,
					mergeChanges: [],
					untrackedChanges: [],
				}),
			})
		})
	};

	beforeEach(async () => {
		failures = [mockTestFailure];
		activeTextEditor = undefined;
		visibleTextEditors = [];
		workingChanges = [];

		const testingServiceCollection = createExtensionUnitTestingServices();

		const mockTestProvider: ITestProvider = {
			getAllFailures: () => failures,
		} as any;

		testingServiceCollection.define(ITestProvider, mockTestProvider);
		testingServiceCollection.define(IWorkspaceService, new TestWorkspaceService([URI.file('/workspace')]));
		testingServiceCollection.define(ITabsAndEditorsService, new TestingTabsAndEditorsService({
			getActiveTextEditor: () => activeTextEditor,
			getVisibleTextEditors: () => visibleTextEditors,
			getActiveNotebookEditor: () => undefined,
		}));
		testingServiceCollection.define(IGitExtensionService, noopGitService);

		accessor = testingServiceCollection.createTestingAccessor();
		instantiationService = accessor.get(IInstantiationService);
		resolver = instantiationService.createInstance(TestFailureTool);
	});

	test('returns a message when no failures exist', async () => {
		failures = [];
		const result = await resolver.invoke({ input: {}, toolInvocationToken: '' as any });
		expect(await toolResultToString(accessor, result)).toMatchInlineSnapshot(`"No test failures were found yet, call the tool runTests to run tests and find failures."`);
	});

	test('formats stack frames', async () => {
		failures = [
			{
				snapshot: upcastPartial<vscode.TestResultSnapshot>({ uri: URI.file('/test/notOpen.ts'), label: 'Is an active editor in stack', parent: undefined }),
				task: upcastPartial<vscode.TestSnapshotTaskState>({
					messages: [{
						message: upcastPartial<vscode.MarkdownString>({
							value: 'G',
						}),
						stackTrace: [
							{ label: 'file1 no contents' },
							{ label: 'just uri', uri: URI.file('/test/coolFile.ts') },
							{ label: 'with position', uri: URI.file('/test/coolFile.ts'), position: new Position(5, 10) },
						]
					}]
				}),
			}
		];
		const result = await resolver.invoke({ input: {}, toolInvocationToken: '' as any });
		expect(await toolResultToString(accessor, result)).toMatchInlineSnapshot(`
			"<testFailure testCase="Is an active editor in stack" path="/test/notOpen.ts">
			<message>
			G
			</message>
			<stackFrame>
			file1 no contents
			</stackFrame>
			<stackFrame path="/test/coolFile.ts">
			just uri
			</stackFrame>
			<stackFrame path="/test/coolFile.ts" line=5 col=10 />
			</testFailure>
			## Rules:
			- Always try to find an error in the implementation code first. Don't suggest any changes in my test cases unless I tell you to.
			- If you need more information about anything in the codebase, use a tool like read_file, list_dir, or file_search to find and read it. Never ask the user to provide it themselves.
			- If you make changes to fix the test, call runTests to run the tests and verify the fix.
			- Don't try to make the same changes you made before to fix the test. If you're stuck, ask the user for pointers.
			"
		`);
	});

	test('includes expected and actual output when available', async () => {
		failures = [{
			snapshot: upcastPartial<vscode.TestResultSnapshot>({
				uri: URI.file('/test/file.test.ts'),
				label: 'Test Suite',
				parent: undefined
			}),
			task: upcastPartial<vscode.TestSnapshotTaskState>({
				messages: [{
					message: 'Values do not match',
					expectedOutput: 'true',
					actualOutput: 'false'
				}]
			})
		}];

		const result = await resolver.invoke({ input: {}, toolInvocationToken: '' as any });
		expect(await toolResultToString(accessor, result)).toMatchInlineSnapshot(`
			"<testFailure testCase="Test Suite" path="/test/file.test.ts">
			<expectedOutput>
			true
			</expectedOutput>
			<actualOutput>
			false
			</actualOutput>

			</testFailure>
			## Rules:
			- Always try to find an error in the implementation code first. Don't suggest any changes in my test cases unless I tell you to.
			- If you need more information about anything in the codebase, use a tool like read_file, list_dir, or file_search to find and read it. Never ask the user to provide it themselves.
			- If you make changes to fix the test, call runTests to run the tests and verify the fix.
			- Don't try to make the same changes you made before to fix the test. If you're stuck, ask the user for pointers.
			"
		`);
	});

	test('ranks correctly', async () => {
		activeTextEditor = upcastPartial<vscode.TextEditor>({ document: upcastPartial<vscode.TextDocument>({ uri: URI.file('/test/isActive.ts') }) });
		visibleTextEditors = [upcastPartial<vscode.TextEditor>({ document: upcastPartial<vscode.TextDocument>({ uri: URI.file('/test/isVisible.ts') }) })];
		workingChanges = [{ originalUri: URI.file('/test/workingChange.ts'), uri: URI.file('/test/workingChange.ts'), status: 0, renameUri: undefined, }];

		failures = [
			{
				snapshot: upcastPartial<vscode.TestResultSnapshot>({ uri: URI.file('/test/notOpen.ts'), label: 'Not open file, no stack', parent: undefined }),
				task: upcastPartial<vscode.TestSnapshotTaskState>({ messages: [{ message: 'A', }] })
			},
			{
				snapshot: upcastPartial<vscode.TestResultSnapshot>({ uri: URI.file('/test/workingChange.ts'), label: 'Has git working change', parent: undefined }),
				task: upcastPartial<vscode.TestSnapshotTaskState>({ messages: [{ message: 'B', }] })
			},
			{
				snapshot: upcastPartial<vscode.TestResultSnapshot>({ uri: URI.file('/test/isVisible.ts'), label: 'Is a visible editor', parent: undefined }),
				task: upcastPartial<vscode.TestSnapshotTaskState>({ messages: [{ message: 'C', }] })
			},
			{
				snapshot: upcastPartial<vscode.TestResultSnapshot>({ uri: URI.file('/test/isActive.ts'), label: 'Is an active editor', parent: undefined }),
				task: upcastPartial<vscode.TestSnapshotTaskState>({ messages: [{ message: 'D', }] })
			},

			{
				snapshot: upcastPartial<vscode.TestResultSnapshot>({ uri: URI.file('/test/notOpen.ts'), label: 'Has git working change in stack', parent: undefined }),
				task: upcastPartial<vscode.TestSnapshotTaskState>({ messages: [{ message: 'E', stackTrace: [{ label: 'workingChange.ts', uri: URI.file('/test/workingChange.ts') }] }] })
			},
			{
				snapshot: upcastPartial<vscode.TestResultSnapshot>({ uri: URI.file('/test/notOpen.ts'), label: 'Is a visible editor in stack', parent: undefined }),
				task: upcastPartial<vscode.TestSnapshotTaskState>({ messages: [{ message: 'F', stackTrace: [{ label: 'isVisible.ts', uri: URI.file('/test/isVisible.ts') }] }] })
			},
			{
				snapshot: upcastPartial<vscode.TestResultSnapshot>({ uri: URI.file('/test/notOpen.ts'), label: 'Is an active editor in stack', parent: undefined }),
				task: upcastPartial<vscode.TestSnapshotTaskState>({ messages: [{ message: 'G', stackTrace: [{ label: 'isActive.ts', uri: URI.file('/test/isActive.ts') }] }] }),
			},
		];

		const result = await resolver.invoke({ input: {}, toolInvocationToken: '' as any });
		expect(await toolResultToString(accessor, result)).toMatchInlineSnapshot(`
			"<testFailure testCase="Is an active editor" path="/test/isActive.ts">
			<message>
			D
			</message>

			</testFailure>
			<testFailure testCase="Is a visible editor" path="/test/isVisible.ts">
			<message>
			C
			</message>

			</testFailure>
			<testFailure testCase="Has git working change" path="/test/workingChange.ts">
			<message>
			B
			</message>

			</testFailure>
			<testFailure testCase="Is an active editor in stack" path="/test/notOpen.ts">
			<message>
			G
			</message>
			<stackFrame path="/test/isActive.ts">
			isActive.ts
			</stackFrame>

			</testFailure>
			<testFailure testCase="Is a visible editor in stack" path="/test/notOpen.ts">
			<message>
			F
			</message>
			<stackFrame path="/test/isVisible.ts">
			isVisible.ts
			</stackFrame>

			</testFailure>
			<testFailure testCase="Has git working change in stack" path="/test/notOpen.ts">
			<message>
			E
			</message>
			<stackFrame path="/test/workingChange.ts">
			workingChange.ts
			</stackFrame>

			</testFailure>
			<testFailure testCase="Not open file, no stack" path="/test/notOpen.ts">
			<message>
			A
			</message>

			</testFailure>
			## Rules:
			- Always try to find an error in the implementation code first. Don't suggest any changes in my test cases unless I tell you to.
			- If you need more information about anything in the codebase, use a tool like read_file, list_dir, or file_search to find and read it. Never ask the user to provide it themselves.
			- If you make changes to fix the test, call runTests to run the tests and verify the fix.
			- Don't try to make the same changes you made before to fix the test. If you're stuck, ask the user for pointers.
			"
		`);
	});
});
