/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../../platform/log/common/log.js';
import { SearchRange } from '../common/search.js';
import * as searchExtTypes from '../common/searchExtTypes.js';

export type Maybe<T> = T | null | undefined;

export function anchorGlob(glob: string): string {
	return glob.startsWith('**') || glob.startsWith('/') ? glob : `/${glob}`;
}

export function rangeToSearchRange(range: searchExtTypes.Range): SearchRange {
	return new SearchRange(range.start.line, range.start.character, range.end.line, range.end.character);
}

export function searchRangeToRange(range: SearchRange): searchExtTypes.Range {
	return new searchExtTypes.Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
}

export interface IOutputChannel {
	appendLine(msg: string): void;
}

export class OutputChannel implements IOutputChannel {
	constructor(private prefix: string, @ILogService private readonly logService: ILogService) { }

	appendLine(msg: string): void {
		this.logService.debug(`${this.prefix}#search`, msg);
	}
}
