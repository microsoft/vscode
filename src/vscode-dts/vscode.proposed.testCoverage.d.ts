/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/123713

	export interface TestRun {
		/**
		 * Test coverage provider for this result. An extension can defer setting
		 * this until after a run is complete and coverage is available.
		 */
		coverageProvider?: TestCoverageProvider
		// ...
	}

	/**
	 * Provides information about test coverage for a test result.
	 * Methods on the provider will not be called until the test run is complete
	 */
	export interface TestCoverageProvider<T extends FileCoverage = FileCoverage> {
		/**
		 * Returns coverage information for all files involved in the test run.
		 * @param token A cancellation token.
		 * @return Coverage metadata for all files involved in the test.
		 */
		provideFileCoverage(token: CancellationToken): ProviderResult<T[]>;

		/**
		 * Give a FileCoverage to fill in more data, namely {@link FileCoverage.detailedCoverage}.
		 * The editor will only resolve a FileCoverage once, and onyl if detailedCoverage
		 * is undefined.
		 *
		 * @param coverage A coverage object obtained from {@link provideFileCoverage}
		 * @param token A cancellation token.
		 * @return The resolved file coverage, or a thenable that resolves to one. It
		 * is OK to return the given `coverage`. When no result is returned, the
		 * given `coverage` will be used.
		 */
		resolveFileCoverage?(coverage: T, token: CancellationToken): ProviderResult<T>;
	}

	/**
	 * A class that contains information about a covered resource. A count can
	 * be give for lines, branches, and functions in a file.
	 */
	export class CoveredCount {
		/**
		 * Number of items covered in the file.
		 */
		covered: number;
		/**
		 * Total number of covered items in the file.
		 */
		total: number;

		/**
		 * @param covered Value for {@link CovereredCount.covered}
		 * @param total Value for {@link CovereredCount.total}
		 */
		constructor(covered: number, total: number);
	}

	/**
	 * Contains coverage metadata for a file.
	 */
	export class FileCoverage {
		/**
		 * File URI.
		 */
		readonly uri: Uri;

		/**
		 * Statement coverage information. If the reporter does not provide statement
		 * coverage information, this can instead be used to represent line coverage.
		 */
		statementCoverage: CoveredCount;

		/**
		 * Branch coverage information.
		 */
		branchCoverage?: CoveredCount;

		/**
		 * Function coverage information.
		 */
		functionCoverage?: CoveredCount;

		/**
		 * Detailed, per-statement coverage. If this is undefined, the editor will
		 * call {@link TestCoverageProvider.resolveFileCoverage} when necessary.
		 */
		detailedCoverage?: DetailedCoverage[];

		/**
		 * Creates a {@link FileCoverage} instance with counts filled in from
		 * the coverage details.
		 * @param uri Covered file URI
		 * @param detailed Detailed coverage information
		 */
		static fromDetails(uri: Uri, details: readonly DetailedCoverage[]): FileCoverage;

		/**
		 * @param uri Covered file URI
		 * @param statementCoverage Statement coverage information. If the reporter
		 * does not provide statement coverage information, this can instead be
		 * used to represent line coverage.
		 * @param branchCoverage Branch coverage information
		 * @param functionCoverage Function coverage information
		 */
		constructor(
			uri: Uri,
			statementCoverage: CoveredCount,
			branchCoverage?: CoveredCount,
			functionCoverage?: CoveredCount,
		);
	}

	/**
	 * Contains coverage information for a single statement or line.
	 */
	export class StatementCoverage {
		/**
		 * The number of times this statement was executed. If zero, the
		 * statement will be marked as un-covered.
		 */
		executionCount: number;

		/**
		 * Statement location.
		 */
		location: Position | Range;

		/**
		 * Coverage from branches of this line or statement. If it's not a
		 * conditional, this will be empty.
		 */
		branches: BranchCoverage[];

		/**
		 * @param location The statement position.
		 * @param executionCount The number of times this statement was
		 * executed. If zero, the statement will be marked as un-covered.
		 * @param branches Coverage from branches of this line.  If it's not a
		 * conditional, this should be omitted.
		 */
		constructor(executionCount: number, location: Position | Range, branches?: BranchCoverage[]);
	}

	/**
	 * Contains coverage information for a branch of a {@link StatementCoverage}.
	 */
	export class BranchCoverage {
		/**
		 * The number of times this branch was executed. If zero, the
		 * branch will be marked as un-covered.
		 */
		executionCount: number;

		/**
		 * Branch location.
		 */
		location?: Position | Range;

		/**
		 * @param executionCount The number of times this branch was executed.
		 * @param location The branch position.
		 */
		constructor(executionCount: number, location?: Position | Range);
	}

	/**
	 * Contains coverage information for a function or method.
	 */
	export class FunctionCoverage {
		/**
		 * The number of times this function was executed. If zero, the
		 * function will be marked as un-covered.
		 */
		executionCount: number;

		/**
		 * Function location.
		 */
		location: Position | Range;

		/**
		 * @param executionCount The number of times this function was executed.
		 * @param location The function position.
		 */
		constructor(executionCount: number, location: Position | Range);
	}

	export type DetailedCoverage = StatementCoverage | FunctionCoverage;

}
