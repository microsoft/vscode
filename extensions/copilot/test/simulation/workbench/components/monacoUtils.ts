/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Range } from 'monaco-editor';
import { IRange } from '../../shared/sharedTypes';
import { monacoModule } from '../utils/utils';

/**
 * Convert 0-based range to monaco-editor 1-based range
 */
export function rangeToMonacoRange(range: IRange): Range {
	return new monacoModule.value.Range(range.start.line + 1, range.start.character + 1, range.end.line + 1, range.end.character + 1);
}
