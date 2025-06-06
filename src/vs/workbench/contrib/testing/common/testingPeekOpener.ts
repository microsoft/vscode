/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { ITextEditorOptions } from '../../../../platform/editor/common/editor.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { TestResultItem } from './testTypes.js';
import { ITestResult } from './testResult.js';
import { IEditor } from '../../../../editor/common/editorCommon.js';
import { MutableObservableValue } from './observableValue.js';

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

