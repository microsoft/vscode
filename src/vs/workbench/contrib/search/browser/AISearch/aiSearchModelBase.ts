/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISearchTreeFileMatch } from '../searchTreeModel/searchTreeCommon.js';
import { Range } from '../../../../../editor/common/core/range.js';

export interface ISearchTreeAIFileMatch extends ISearchTreeFileMatch {
	getFullRange(): Range | undefined;
	readonly rank: number;
}

export function isSearchTreeAIFileMatch(obj: any): obj is ISearchTreeAIFileMatch {
	return obj && obj.getFullRange && obj.getFullRange() instanceof Range;
}
