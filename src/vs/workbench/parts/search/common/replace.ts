/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { Match, FileMatch, FileMatchOrMatch } from 'vs/workbench/parts/search/common/searchModel';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IProgressRunner } from 'vs/platform/progress/common/progress';
import { EditorInput } from 'vs/workbench/common/editor';

export const IReplaceService = createDecorator<IReplaceService>('replaceService');

export interface IReplaceService {

	_serviceBrand: any;

	/**
	 * Replaces the given match in the file that match belongs to
	 */
	replace(match: Match): TPromise<any>;

	/**
	 *	Replace all the matches from the given file matches in the files
	 *  You can also pass the progress runner to update the progress of replacing.
	 */
	replace(files: FileMatch[], progress?: IProgressRunner): TPromise<any>;

	/**
	 * Gets the input for the file match
	 */
	getInput(element: FileMatch): TPromise<EditorInput>;

	/**
	 * Refresh the input for the file match. If reload, content of repalced editor is reloaded completely
	 * Otherwise undo the last changes and refreshes with new text.
	 */
	refreshInput(element: FileMatch, reload?: boolean): void;

	/**
	 * Opens the replace preview editor for given element
	 */
	openReplacePreviewEditor(element: FileMatchOrMatch, preserveFocus?: boolean, sideBySide?: boolean, pinned?: boolean): TPromise<any>;

	/**
	 * Return true if preview is already opened otherwise false
	 */
	isReplacePreviewEditorOpened(element: FileMatchOrMatch): boolean;

	/**
	 * Disposes all Inputs
	 */
	disposeAllInputs(): void;
}
