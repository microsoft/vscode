/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export interface TestController {
		/**
		 * A provider used for associating code location with tests.
		 */
		relatedCodeProvider?: TestRelatedCodeProvider;
	}

	export interface TestRelatedCodeProvider {
		/**
		 * Returns the tests related to the given code location. This may be called
		 * by the user either explicitly via a "go to test" action, or implicitly
		 * when running tests at a cursor position.
		 *
		 * @param document The document in which the code location is located.
		 * @param position The position in the document.
		 * @param token A cancellation token.
		 * @returns A list of tests related to the position in the code.
		 */
		provideRelatedTests?(document: TextDocument, position: Position, token: CancellationToken): ProviderResult<TestItem[]>;

		/**
		 * Returns the code related to the given test case.
		 *
		 * @param test The test for which to provide related code.
		 * @param token A cancellation token.
		 * @returns A list of locations related to the test.
		 */
		provideRelatedCode?(test: TestItem, token: CancellationToken): ProviderResult<Location[]>;
	}
}
