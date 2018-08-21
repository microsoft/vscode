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
import { Node, NodeList, Block, build } from './tokenTree';
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
		const model = this._modelService.getModel(resource);
		let entries: ILogicalSelectionEntry[] = [];

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
		let tree = build(model);
		return tree ? this._collectRanges(tree, position) : [];
	}

	private _collectRanges(node: Node, position: Position): Range[] {
		let ranges: Range[] = [];
		this._collectRangesIter(node, position, ranges, null);
		return ranges;
	}

	private _collectRangesIter(node: Node, position: Position, ranges: Range[], lastRange: Range): boolean {
		if (!Range.containsPosition(node.range, position)) {
			return false;
		}

		if (!lastRange || !Range.equalsRange(lastRange, node.range)) {
			lastRange = node.range;
			ranges.push(lastRange);
		}

		if (node instanceof NodeList) {
			for (let i = 0, len = node.children.length, found = false; i < len && !found; i++) {
				found = this._collectRangesIter(node.children[i], position, ranges, lastRange);
			}
		} else if (node instanceof Block && node.elements) {
			this._collectRangesIter(node.elements, position, ranges, lastRange);
		}

		return true;
	}
}
