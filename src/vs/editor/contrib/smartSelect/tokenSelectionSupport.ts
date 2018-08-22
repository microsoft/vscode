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
			const children = this._joinAdjacentBlocks(node.children);
			for (let i = 0, len = children.length, found = false; i < len && !found; i++) {
				found = this._collectRangesIter(children[i], position, ranges, lastRange);
			}
		} else if (node instanceof Block && node.elements) {
			this._collectRangesIter(node.elements, position, ranges, lastRange);
		}

		return true;
	}

	private _joinAdjacentBlocks(nodes: Node[]): Node[] {
		const result = [];
		let buffer = [];
		for (const node of nodes) {
			const isLineWhichEndsWithBlock = node instanceof NodeList
				&& node.children[node.children.length - 1] instanceof Block;
			if (buffer.length === 0) {
				if (isLineWhichEndsWithBlock) {
					buffer.push(node);
				} else {
					result.push(node);
				}
			} else {
				const isOnTheSameLine = node.start.lineNumber === buffer[buffer.length - 1].end.lineNumber;
				if (isOnTheSameLine) {
					buffer.push(node);
				} else {
					if (buffer.length > 1) {
						result.push(new NodeList(buffer));
					} else {
						result.push(buffer[0]);
					}
					buffer = [];
					if (isLineWhichEndsWithBlock) {
						buffer.push(node);
					} else {
						result.push(node);
					}
				}
			}
		}

		// already joined
		if (buffer.length === nodes.length) {
			return nodes;
		}

		if (buffer.length > 0) {
			if (buffer.length > 1) {
				result.push(new NodeList(buffer));
			} else {
				result.push(buffer[0]);
			}
		}
		return result;
	}
}
