/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export class FileCoverage2 extends FileCoverage {
		/**
		 * A list of {@link TestItem test cases} that generated coverage in this
		 * file. If set, then {@link TestRunProfile.loadDetailedCoverageForTest}
		 * should also be defined in order to retrieve detailed coverage information.
		 */
		includesTests?: TestItem[];

		constructor(
			uri: Uri,
			statementCoverage: TestCoverageCount,
			branchCoverage?: TestCoverageCount,
			declarationCoverage?: TestCoverageCount,
			includesTests?: TestItem[],
		);
	}

	export interface TestRunProfile {
		/**
		 * An extension-provided function that provides detailed statement and
		 * function-level coverage for a single test in a file. This is the per-test
		 * sibling of {@link TestRunProfile.loadDetailedCoverage}, called only if
		 * a test item is provided in {@link FileCoverage.includesTests} and only
		 * for files where such data is reported.
		 *
		 * Often {@link TestRunProfile.loadDetailedCoverage} will be called first
		 * when a user opens a file, and then this method will be called if they
		 * drill down into specific per-test coverage information. This method
		 * should then return coverage data only for constructs the given test item
		 * executed during the test run.
		 *
		 * The {@link FileCoverage} object passed to this function is the same
		 * instance emitted on {@link TestRun.addCoverage} calls associated with this profile.
		 *
		 * @param testRun The test run that generated the coverage data.
		 * @param fileCoverage The file coverage object to load detailed coverage for.
		 * @param fromTestItem The test item to request coverage information for.
		 * @param token A cancellation token that indicates the operation should be cancelled.
		 */
		loadDetailedCoverageForTest?: (testRun: TestRun, fileCoverage: FileCoverage, fromTestItem: TestItem, token: CancellationToken) => Thenable<FileCoverageDetail[]>;
	}
}
