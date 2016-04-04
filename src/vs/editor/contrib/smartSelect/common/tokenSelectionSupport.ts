/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {Range} from 'vs/editor/common/core/range';
import {IModel, IPosition, IRange} from 'vs/editor/common/editorCommon';
import {ILogicalSelectionEntry, ILogicalSelectionSupport} from 'vs/editor/common/modes';
import {IModelService} from 'vs/editor/common/services/modelService';
import {Node, build, find} from './tokenTree';

export class TokenSelectionSupport implements ILogicalSelectionSupport {

	private _modelService: IModelService;

	constructor(@IModelService modelService: IModelService) {
		this._modelService = modelService;
	}

	public getRangesToPosition(resource: URI, position: IPosition): TPromise<ILogicalSelectionEntry[]> {
		return TPromise.as(this.getRangesToPositionSync(resource, position));
	}

	public getRangesToPositionSync(resource: URI, position: IPosition): ILogicalSelectionEntry[] {
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

	private _doGetRangesToPosition(model: IModel, position: IPosition): IRange[] {

		var tree = build(model),
			node: Node,
			lastRange: IRange;

		node = find(tree, position);
		var ranges: IRange[] = [];
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
