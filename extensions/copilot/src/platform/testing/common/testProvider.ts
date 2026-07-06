/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';

export const ITestProvider = createServiceIdentifier<ITestProvider>('ITestProvider');

export interface ITestFailure {
	snapshot: vscode.TestResultSnapshot;
	task: vscode.TestSnapshotTaskState;
}

export interface ITestProvider {
	readonly _serviceBrand: undefined;

	/** Millisecond timestamp when the last results, if any, were added. */
	readonly lastResultsFrom?: number;

	/** Fired when test results change. */
	readonly onDidChangeResults: vscode.Event<void>;

	/** Gets all test failures from the last result. */
	getAllFailures(): Iterable<ITestFailure>;

	/** Gets the last failure the given test item had. */
	getLastFailureFor(testItem: vscode.TestItem): ITestFailure | undefined;

	/** Gets a test at a position. */
	getFailureAtPosition(uri: vscode.Uri, position: vscode.Position): ITestFailure | undefined;

	/** Gets tests in the given URI */
	hasTestsInUri(uri: vscode.Uri): Promise<boolean>;

	/** Gets whether there's any test controller that has found tests in the workspace. */
	hasAnyTests(): Promise<boolean>;
}
