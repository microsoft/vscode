/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export class FileCoverage2 extends FileCoverage {
		/**
		 * Test {@link TestItem} this file coverage is generated from. If undefined,
		 * the editor will assume the coverage is the overall summary coverage for
		 * the entire file.
		 *
		 * If per-test coverage is available, an extension should append multiple
		 * `FileCoverage` instances with this property set for each test item. It
		 * must also append a `FileCoverage` instance without this property set to
		 * represent the overall coverage of the file.
		 */
		testItem?: TestItem;

		constructor(
			uri: Uri,
			statementCoverage: TestCoverageCount,
			branchCoverage?: TestCoverageCount,
			declarationCoverage?: TestCoverageCount,
			testItem?: TestItem,
		);
	}
}
