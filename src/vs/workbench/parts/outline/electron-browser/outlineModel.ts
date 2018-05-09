/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { DocumentSymbolProviderRegistry, SymbolInformation } from 'vs/editor/common/modes';
import { ITextModel } from '../../../../editor/common/model';
import { asWinJsPromise } from '../../../../base/common/async';
import { TPromise } from 'vs/base/common/winjs.base';
import { fuzzyScore } from '../../../../base/common/filters';
import { IPosition } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { values } from 'vs/base/common/map';

export function getOutline(model: ITextModel): TPromise<OutlineItemGroup[]> {
	let outlines = new Array<OutlineItemGroup>();
	let promises = DocumentSymbolProviderRegistry.ordered(model).map((provider, i) => {
		return asWinJsPromise(token => provider.provideDocumentSymbols(model, token)).then(result => {
			let source = `provider${i}`;
			let items = result.map(info => asOutlineItem(info, undefined));
			outlines.push(new OutlineItemGroup(source, items));
		}, err => {
			//
		});
	});
	return TPromise.join(promises).then(() => outlines);
}

function asOutlineItem(info: SymbolInformation, parent: OutlineItem): OutlineItem {
	let id = info.name;
	if (parent) {
		id = parent.id + info.name;
		for (let i = 1; parent.children.has(id); i++) {
			id = parent.id + info.name + i;
		}
	}
	let res = new OutlineItem(id, info, parent);
	if (info.children) {
		for (const child of info.children) {
			let item = asOutlineItem(child, res);
			res.children.set(item.id, item);
		}
	}
	return res;
}

export class OutlineItem {

	children: Map<string, OutlineItem> = new Map();
	matches: [number, number[]] = [0, []];

	constructor(
		readonly id: string,
		readonly symbol: SymbolInformation,
		readonly parent: OutlineItem
	) {
		//
	}
}

export class OutlineItemGroup {

	constructor(
		readonly source: string,
		readonly children: OutlineItem[]
	) {
		//
	}

	updateMatches(pattern: string): OutlineItem {
		let topMatch: OutlineItem;
		for (const child of this.children) {
			let candidate = this._updateMatches(pattern, child);
			if (candidate && (!topMatch || topMatch.matches[0] < candidate.matches[0])) {
				topMatch = candidate;
			}
		}
		return topMatch;
	}

	private _updateMatches(pattern: string, item: OutlineItem): OutlineItem {
		let topMatch: OutlineItem;
		item.matches = fuzzyScore(pattern, item.symbol.name);
		if (item.matches) {
			topMatch = item;
		}
		item.children.forEach(child => {
			let candidate = this._updateMatches(pattern, child);
			if (!item.matches && child.matches) {
				// don't filter parents with unfiltered children
				item.matches = [0, []];
			}
			if (!topMatch || (candidate && candidate.matches && topMatch.matches[0] < candidate.matches[0])) {
				topMatch = candidate;
			}
		});
		return topMatch;
	}

	getItemEnclosingPosition(position: IPosition): OutlineItem {
		for (const child of this.children) {
			let candidate = this._getItemEnclosingPosition(position, child);
			if (candidate) {
				return candidate;
			}
		}
		return undefined;
	}

	private _getItemEnclosingPosition(position: IPosition, item: OutlineItem): OutlineItem {
		if (!Range.containsPosition(item.symbol.definingRange, position)) {
			return undefined;
		}
		for (const child of values(item.children)) {
			let candidate = this._getItemEnclosingPosition(position, child);
			if (candidate) {
				return candidate;
			}
		}
		return item;
	}

	getItemById(id: string): OutlineItem {
		return this._getItemById(id, this.children);
	}

	private _getItemById(id: string, items: OutlineItem[]): OutlineItem {
		for (const item of items) {
			if (item.id === id) {
				return item;
			}
			let candidate = this._getItemById(id, values(item.children));
			if (candidate) {
				return candidate;
			}
		}
		return undefined;
	}
}
