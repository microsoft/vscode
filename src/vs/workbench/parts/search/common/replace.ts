/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { Match, FileMatch } from 'vs/workbench/parts/search/common/searchModel';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IProgressRunner } from 'vs/platform/progress/common/progress';
import { EditorInput } from 'vs/workbench/common/editor';

export var IReplaceService = createDecorator<IReplaceService>('replaceService');

export interface IReplaceService {

	_serviceBrand: any;

	/**
	 * Replace the match with the given text.
	 */
	replace(match: Match, text: string): TPromise<any>;

	/**
	 *	Replace all the matches in the given file matches with provided text.
	 *  You can also pass the progress runner to update the progress of replacing.
	 */
	replace(files: FileMatch[], text: string, progress?: IProgressRunner): TPromise<any>;

	/**
	 * Gets the input for the file match with given text
	 */
	getInput(element: FileMatch, text: string): TPromise<EditorInput>;

	/**
	 * Refresh the input for the fiel match with given text. If reload, content of repalced editor is reloaded completely
	 * Otherwise undo the last changes and refreshes with new text.
	 */
	refreshInput(element: FileMatch, text: string, reload?: boolean): void;

	/**
	 * Disposes all Inputs
	 */
	disposeAllInputs(): void;
}
