/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { Match, FileMatch } from 'vs/workbench/parts/search/common/searchModel';
import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { IProgressRunner } from 'vs/platform/progress/common/progress';

export var IReplaceService = createDecorator<IReplaceService>('replaceService');

export interface IReplaceService {

	serviceId : ServiceIdentifier<any>;

	/**
	 * Replace the match with the given text.
	 */
	replace(match: Match, text: string): TPromise<any>;

	/**
	 *	Replace all the matches in the given file matches with provided text.
	 *  You can also pass the progress runner to update the progress of replacing.
	 */
	replace(files: FileMatch[], text: string, progress?: IProgressRunner): TPromise<any>;
}
