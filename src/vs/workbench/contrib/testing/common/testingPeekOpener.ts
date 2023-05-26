/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { TestResultItem } from 'vs/workbench/contrib/testing/common/testTypes';
import { ITestResult } from 'vs/workbench/contrib/testing/common/testResult';
import { IEditor } from 'vs/editor/common/editorCommon';
import { MutableObservableValue } from 'vs/workbench/contrib/testing/common/observableValue';

export interface IShowResultOptions {
	/** Reveal the peek, if configured, in the given editor */
	inEditor?: IEditor;
	/** Editor options, if a new editor is opened */
	options?: Partial<ITextEditorOptions>;
}

export interface ITestingPeekOpener {
	_serviceBrand: undefined;

	/** Whether test history should be shown in the results output. */
	historyVisible: MutableObservableValue<boolean>;

	/**
	 * Tries to peek the first test error, if the item is in a failed state.
	 * @returns a boolean indicating whether a peek was opened
	 */
	tryPeekFirstError(result: ITestResult, test: TestResultItem, options?: Partial<ITextEditorOptions>): boolean;

	/**
	 * Peeks at the given test message uri.
	 * @returns a boolean indicating whether a peek was opened
	 */
	peekUri(uri: URI, options?: IShowResultOptions): boolean;

	/**
	 * Opens the currently selected message in an editor.
	 */
	openCurrentInEditor(): void;

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

