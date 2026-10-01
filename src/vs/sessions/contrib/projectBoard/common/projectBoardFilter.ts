/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { matchesFuzzy2 } from '../../../../base/common/filters.js';

export function matchesProjectBoardFilter(query: string, fields: readonly string[]): boolean {
	return query.trim().split(/\s+/).filter(Boolean).every(term => fields.some(field => !!matchesFuzzy2(term, field)));
}
