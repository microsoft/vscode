/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/123713

	export interface TestRun {
		/**
		 * Adds coverage for a file in the run.
		 */
		addCoverage(fileCoverage: FileCoverage): void;

		/**
		 * An event fired when the editor is no longer interested in data
		 * associated with the test run.
		 */
		onDidDispose: Event<void>;
	}

	export interface TestRunProfile {
		/**
		 * A function that provides detailed statement and function-level coverage for a file.
		 *
		 * The {@link FileCoverage} object passed to this function is the same instance
		 * emitted on {@link TestRun.addCoverage} calls associated with this profile.
		 */
		loadDetailedCoverage?: (testRun: TestRun, fileCoverage: FileCoverage, token: CancellationToken) => Thenable<FileCoverageDetail[]>;
	}

	/**
	 * A class that contains information about a covered resource. A count can
	 * be give for lines, branches, and declarations in a file.
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
		 * Declaration coverage information. Depending on the reporter and
		 * language, this may be types such as functions, methods, or namespaces.
		 */
		declarationCoverage?: CoveredCount;

		/**
		 * Creates a {@link FileCoverage} instance with counts filled in from
		 * the coverage details.
		 * @param uri Covered file URI
		 * @param detailed Detailed coverage information
		 */
		static fromDetails(uri: Uri, details: readonly FileCoverageDetail[]): FileCoverage;

		/**
		 * @param uri Covered file URI
		 * @param statementCoverage Statement coverage information. If the reporter
		 * does not provide statement coverage information, this can instead be
		 * used to represent line coverage.
		 * @param branchCoverage Branch coverage information
		 * @param declarationCoverage Declaration coverage information
		 */
		constructor(
			uri: Uri,
			statementCoverage: CoveredCount,
			branchCoverage?: CoveredCount,
			declarationCoverage?: CoveredCount,
		);
	}

	/**
	 * Contains coverage information for a single statement or line.
	 */
	export class StatementCoverage {
		/**
		 * The number of times this statement was executed, or a boolean indicating
		 * whether it was executed if the exact count is unknown. If zero or false,
		 * the statement will be marked as un-covered.
		 */
		executed: number | boolean;

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
		 * @param executed The number of times this statement was executed, or a
		 * boolean indicating  whether it was executed if the exact count is
		 * unknown. If zero or false, the statement will be marked as un-covered.
		 * @param branches Coverage from branches of this line.  If it's not a
		 * conditional, this should be omitted.
		 */
		constructor(executed: number | boolean, location: Position | Range, branches?: BranchCoverage[]);
	}

	/**
	 * Contains coverage information for a branch of a {@link StatementCoverage}.
	 */
	export class BranchCoverage {
		/**
		 * The number of times this branch was executed, or a boolean indicating
		 * whether it was executed if the exact count is unknown. If zero or false,
		 * the branch will be marked as un-covered.
		 */
		executed: number | boolean;

		/**
		 * Branch location.
		 */
		location?: Position | Range;

		/**
		 * Label for the branch, used in the context of "the ${label} branch was
		 * not taken," for example.
		 */
		label?: string;

		/**
		 * @param executed The number of times this branch was executed, or a
		 * boolean indicating  whether it was executed if the exact count is
		 * unknown. If zero or false, the branch will be marked as un-covered.
		 * @param location The branch position.
		 */
		constructor(executed: number | boolean, location?: Position | Range, label?: string);
	}

	/**
	 * Contains coverage information for a declaration. Depending on the reporter
	 * and language, this may be types such as functions, methods, or namespaces.
	 */
	export class DeclarationCoverage {
		/**
		 * Name of the declaration.
		 */
		name: string;

		/**
		 * The number of times this declaration was executed, or a boolean
		 * indicating whether it was executed if the exact count is unknown. If
		 * zero or false, the declaration will be marked as un-covered.
		 */
		executed: number | boolean;

		/**
		 * Declaration location.
		 */
		location: Position | Range;

		/**
		 * @param executed The number of times this declaration was executed, or a
		 * boolean indicating  whether it was executed if the exact count is
		 * unknown. If zero or false, the declaration will be marked as un-covered.
		 * @param location The declaration position.
		 */
		constructor(name: string, executed: number | boolean, location: Position | Range);
	}

	export type FileCoverageDetail = StatementCoverage | DeclarationCoverage;

}
