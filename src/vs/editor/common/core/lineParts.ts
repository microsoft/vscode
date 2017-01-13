/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ViewLineToken } from 'vs/editor/common/core/viewLineToken';

export class LineParts {
	_linePartsBrand: void;

	public readonly parts: ViewLineToken[];
	public readonly maxLineColumn: number;

	constructor(parts: ViewLineToken[], maxLineColumn: number) {
		this.parts = parts;
		this.maxLineColumn = maxLineColumn;
	}

	public equals(other: LineParts): boolean {
		return (
			this.maxLineColumn === other.maxLineColumn
			&& ViewLineToken.equalsArray(this.parts, other.parts)
		);
	}
}
