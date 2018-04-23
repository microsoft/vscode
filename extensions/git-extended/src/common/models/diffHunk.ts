/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DiffLine } from './diffLine';

export class DiffHunk {
	public Lines: DiffLine[] = [];

	constructor(
		public oldLineNumber: number,
		public newLineNumber: number,
		public diffLine: number
	) { }
}