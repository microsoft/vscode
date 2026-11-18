/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/107467

	export namespace tests {
		/**
		 * Requests that tests be run by their controller.
		 * @param run Run options to use.
		 * @param token Cancellation token for the test run
		 */
		export function runTests(run: TestRunRequest, token?: CancellationToken): Thenable<void>;

		/**
		 * Registers a provider that can provide follow-up actions for a test failure.
		 */
		export function registerTestFollowupProvider(provider: TestFollowupProvider): Disposable;

		/**
		 * Returns an observer that watches and can request tests.
		 */
		export function createTestObserver(): TestObserver;
		/**
		 * List of test results stored by the editor, sorted in descending
		 * order by their `completedAt` time.
		 */
		export const testResults: ReadonlyArray<TestRunResult>;

		/**
		 * Event that fires when the {@link testResults} array is updated.
		 */
		export const onDidChangeTestResults: Event<void>;
	}

	export interface TestFollowupProvider {
		provideFollowup(result: TestRunResult, test: TestResultSnapshot, taskIndex: number, messageIndex: number, token: CancellationToken): ProviderResult<Command[]>;
	}

	export interface TestObserver {
		/**
		 * List of tests returned by test provider for files in the workspace.
		 */
		readonly tests: ReadonlyArray<TestItem>;

		/**
		 * An event that fires when an existing test in the collection changes, or
		 * null if a top-level test was added or removed. When fired, the consumer
		 * should check the test item and all its children for changes.
		 */
		readonly onDidChangeTest: Event<TestsChangeEvent>;

		/**
		 * Dispose of the observer, allowing the editor to eventually tell test
		 * providers that they no longer need to update tests.
		 */
		dispose(): void;
	}

	export interface TestsChangeEvent {
		/**
		 * List of all tests that are newly added.
		 */
		readonly added: ReadonlyArray<TestItem>;

		/**
		 * List of existing tests that have updated.
		 */
		readonly updated: ReadonlyArray<TestItem>;

		/**
		 * List of existing tests that have been removed.
		 */
		readonly removed: ReadonlyArray<TestItem>;
	}

	/**
	 * TestResults can be provided to the editor in {@link tests.publishTestResult},
	 * or read from it in {@link tests.testResults}.
	 *
	 * The results contain a 'snapshot' of the tests at the point when the test
	 * run is complete. Therefore, information such as its {@link Range} may be
	 * out of date. If the test still exists in the workspace, consumers can use
	 * its `id` to correlate the result instance with the living test.
	 */
	export interface TestRunResult {
		/**
		 * Unix milliseconds timestamp at which the test run was completed.
		 */
		readonly completedAt: number;

		/**
		 * Optional raw output from the test run.
		 */
		readonly output?: string;

		/**
		 * List of test results. The items in this array are the items that
		 * were passed in the {@link tests.runTests} method.
		 */
		readonly results: ReadonlyArray<Readonly<TestResultSnapshot>>;

		/**
		 * Gets coverage information for a URI. This function is available only
		 * when a test run reported coverage.
		 */
		getDetailedCoverage?(uri: Uri, token?: CancellationToken): Thenable<FileCoverageDetail[]>;
	}

	/**
	 * A {@link TestItem}-like interface with an associated result, which appear
	 * or can be provided in {@link TestResult} interfaces.
	 */
	export interface TestResultSnapshot {
		/**
		 * Unique identifier that matches that of the associated TestItem.
		 * This is used to correlate test results and tests in the document with
		 * those in the workspace (test explorer).
		 */
		readonly id: string;

		/**
		 * Parent of this item.
		 */
		readonly parent?: TestResultSnapshot;

		/**
		 * URI this TestItem is associated with. May be a file or file.
		 */
		readonly uri?: Uri;

		/**
		 * Display name describing the test case.
		 */
		readonly label: string;

		/**
		 * Optional description that appears next to the label.
		 */
		readonly description?: string;

		/**
		 * Location of the test item in its `uri`. This is only meaningful if the
		 * `uri` points to a file.
		 */
		readonly range?: Range;

		/**
		 * State of the test in each task. In the common case, a test will only
		 * be executed in a single task and the length of this array will be 1.
		 */
		readonly taskStates: ReadonlyArray<TestSnapshotTaskState>;

		/**
		 * Optional list of nested tests for this item.
		 */
		readonly children: Readonly<TestResultSnapshot>[];
	}

	export interface TestSnapshotTaskState {
		/**
		 * Current result of the test.
		 */
		readonly state: TestResultState;

		/**
		 * The number of milliseconds the test took to run. This is set once the
		 * `state` is `Passed`, `Failed`, or `Errored`.
		 */
		readonly duration?: number;

		/**
		 * Associated test run message. Can, for example, contain assertion
		 * failure information if the test fails.
		 */
		readonly messages: ReadonlyArray<TestMessage>;
	}

	/**
	 * Possible states of tests in a test run.
	 */
	export enum TestResultState {
		// Test will be run, but is not currently running.
		Queued = 1,
		// Test is currently running
		Running = 2,
		// Test run has passed
		Passed = 3,
		// Test run has failed (on an assertion)
		Failed = 4,
		// Test run has been skipped
		Skipped = 5,
		// Test run failed for some other reason (compilation error, timeout, etc)
		Errored = 6
	}
}
