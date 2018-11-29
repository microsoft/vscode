/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SelectionRangeProvider } from 'vs/editor/common/modes';
import { Range } from 'vs/editor/common/core/range';
import { Position } from 'vs/editor/common/core/position';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ITextModel } from 'vs/editor/common/model';
import { build, find } from 'vs/editor/contrib/smartSelect/tokenTree';

export class DefaultSelectionRangeProvider implements SelectionRangeProvider {

	provideSelectionRanges(model: ITextModel, position: Position, token: CancellationToken): Range[] {
		let tree = build(model);
		let node = find(tree, position);
		let ranges: Range[] = [];
		let lastRange: Range | undefined;
		while (node) {
			if (!lastRange || !Range.equalsRange(lastRange, node.range)) {
				ranges.push(node.range);
			}
			lastRange = node.range;
			node = node.parent;
		}
		return ranges;
	}
}
