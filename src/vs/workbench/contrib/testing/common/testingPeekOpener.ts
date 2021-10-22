/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { TestResultItem } from 'vs/workbench/contrib/testing/common/testCollection';
import { ITestResult } from 'vs/workbench/contrib/testing/common/testResult';

export interface ITestingPeekOpener {
	_serviceBrand: undefined;

	/**
	 * Tries to peek the first test error, if the item is in a failed state.
	 * @returns a boolean indicating whether a peek was opened
	 */
	tryPeekFirstError(result: ITestResult, test: TestResultItem, options?: Partial<ITextEditorOptions>): boolean;

	/**
	 * Peeks at the given test message uri.
	 * @returns a boolean indicating whether a peek was opened
	 */
	peekUri(uri: URI, options?: Partial<ITextEditorOptions>): boolean;

	/**
	 * Opens the peek. Shows any available message.
	 */
	open(): void;

	/**
	 * Closes peeks for all visible editors.
	 */
	closeAllPeeks(): void;
}

export const ITestingPeekOpener = createDecorator<ITestingPeekOpener>('testingPeekOpener');

