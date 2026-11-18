/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IProgress, IProgressStep } from '../../../../platform/progress/common/progress.js';
import { ISearchTreeFileMatch, ISearchTreeMatch, FileMatchOrMatch } from './searchTreeModel/searchTreeCommon.js';

export const IReplaceService = createDecorator<IReplaceService>('replaceService');

export interface IReplaceService {

	readonly _serviceBrand: undefined;

	/**
	 * Replaces the given match in the file that match belongs to
	 */
	replace(match: ISearchTreeMatch): Promise<any>;

	/**
	 *	Replace all the matches from the given file matches in the files
	 *  You can also pass the progress runner to update the progress of replacing.
	 */
	replace(files: ISearchTreeFileMatch[], progress?: IProgress<IProgressStep>): Promise<any>;

	/**
	 * Opens the replace preview for given file match or match
	 */
	openReplacePreview(element: FileMatchOrMatch, preserveFocus?: boolean, sideBySide?: boolean, pinned?: boolean): Promise<any>;

	/**
	 * Update the replace preview for the given file.
	 * If `override` is `true`, then replace preview is constructed from source model
	 */
	updateReplacePreview(file: ISearchTreeFileMatch, override?: boolean): Promise<void>;
}
