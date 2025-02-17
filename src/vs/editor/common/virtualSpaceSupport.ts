/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPosition, Position } from './core/position.js';

export function calcLeftoverVisibleColumns(position: IPosition, validPosition: Position): number {
	return (
		position.lineNumber === validPosition.lineNumber && position.column > validPosition.column
			? position.column - validPosition.column
			: 0
	);
}
