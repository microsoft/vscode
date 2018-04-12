/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/modelService';
import { Node, build, find } from './tokenTree';
import { Position } from 'vs/editor/common/core/position';

/**
 * Interface used to compute a hierachry of logical ranges.
 */
export interface ILogicalSelectionEntry {
	type: string;
	range: Range;
}

export class TokenSelectionSupport {

	private _modelService: IModelService;

	constructor(@IModelService modelService: IModelService) {
		this._modelService = modelService;
	}

	public getRangesToPosition(resource: URI, position: Position): TPromise<ILogicalSelectionEntry[]> {
		return TPromise.as(this.getRangesToPositionSync(resource, position));
	}

	public getRangesToPositionSync(resource: URI, position: Position): ILogicalSelectionEntry[] {
		var model = this._modelService.getModel(resource),
			entries: ILogicalSelectionEntry[] = [];

		if (model) {
			this._doGetRangesToPosition(model, position).forEach(range => {
				entries.push({
					type: void 0,
					range
				});
			});
		}

		return entries;
	}

	private _doGetRangesToPosition(model: ITextModel, position: Position): Range[] {

		var tree = build(model),
			node: Node,
			lastRange: Range;

		node = find(tree, position);
		var ranges: Range[] = [];
		while (node) {
			if (!lastRange || !Range.equalsRange(lastRange, node.range)) {
				ranges.push(node.range);
			}
			lastRange = node.range;
			node = node.parent;
		}
		ranges = ranges.reverse();
		return ranges;
	}

}
