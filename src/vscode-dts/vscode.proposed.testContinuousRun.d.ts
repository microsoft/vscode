/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export interface TestRunProfile {
		/**
		 * Whether this profile supports continuous running of requests. If so,
		 * then {@link TestRunRequest.continuous} may be set to `true`. Defaults
		 * to false.
		 */
		supportsContinuousRun: boolean;

		/**
		 * Handler called to start a test run. When invoked, the function should call
		 * {@link TestController.createTestRun} at least once, and all test runs
		 * associated with the request should be created before the function returns
		 * or the returned promise is resolved.
		 *
		 * If {@link supportsContinuousRun} is set, then {@link TestRunRequest2.continuous}
		 * may be `true`. In this case, the profile should observe changes to
		 * source code and create new test runs by calling {@link TestController.createTestRun},
		 * until the cancellation is requested on the `token`.
		 *
		 * @param request Request information for the test run.
		 * @param cancellationToken Token that signals the used asked to abort the
		 * test run. If cancellation is requested on this token, all {@link TestRun}
		 * instances associated with the request will be
		 * automatically cancelled as well.
		 */
		runHandler: (request: TestRunRequest, token: CancellationToken) => Thenable<void> | void;
	}

	export interface TestController {
		/**
		 * Creates a profile used for running tests. Extensions must create
		 * at least one profile in order for tests to be run.
		 * @param label A human-readable label for this profile.
		 * @param kind Configures what kind of execution this profile manages.
		 * @param runHandler Function called to start a test run.
		 * @param isDefault Whether this is the default action for its kind.
		 * @param tag Profile test tag.
		 * @param supportsContinuousRun Whether the profile supports continuous running.
		 * @returns An instance of a {@link TestRunProfile}, which is automatically
		 * associated with this controller.
		 */
		createRunProfile(label: string, kind: TestRunProfileKind, runHandler: (request: TestRunRequest, token: CancellationToken) => Thenable<void> | void, isDefault?: boolean, tag?: TestTag, supportsContinuousRun?: boolean): TestRunProfile;
	}

	export class TestRunRequest2 extends TestRunRequest {
		/**
		 * Whether the profile should run continuously as source code changes. Only
		 * relevant for profiles that set {@link TestRunProfile.supportsContinuousRun}.
		 */
		readonly continuous?: boolean;

		/**
		 * @param tests Array of specific tests to run, or undefined to run all tests
		 * @param exclude An array of tests to exclude from the run.
		 * @param profile The run profile used for this request.
		 * @param continuous Whether to run tests continuously as source changes.
		 */
		constructor(include?: readonly TestItem[], exclude?: readonly TestItem[], profile?: TestRunProfile, continuous?: boolean);
	}
}
