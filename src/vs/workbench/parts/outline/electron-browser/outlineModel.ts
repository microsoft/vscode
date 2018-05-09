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

export function getOutline(model: ITextModel): TPromise<OutlineItemGroup[]> {
	let outlines = new Array<OutlineItemGroup>();
	let promises = DocumentSymbolProviderRegistry.ordered(model).map((provider, i) => {
		return asWinJsPromise(token => provider.provideDocumentSymbols(model, token)).then(result => {
			let items = new Array<OutlineItem>();
			let source = `provider${i}`;
			for (const item of result) {
				OutlineItem.convert(items, item, undefined);
			}
			outlines.push(new OutlineItemGroup(source, items));
		}, err => {
			//
		});
	});
	return TPromise.join(promises).then(() => outlines);
}

export class OutlineItem {

	static convert(bucket: OutlineItem[], info: SymbolInformation, parent: OutlineItem): void {
		let res = new OutlineItem(
			`${parent ? parent.id : ''}/${info.name}`,
			info,
			parent,
			[]
		);
		if (info.children) {
			for (const child of info.children) {
				OutlineItem.convert(res.children, child, res);
			}
		}
		bucket.push(res);
	}

	matches: [number, number[]] = [0, []];

	constructor(
		readonly id: string,
		readonly symbol: SymbolInformation,
		readonly parent: OutlineItem,
		readonly children: OutlineItem[],
	) {
		//
	}

	updateFilter(pattern: string): void {
		this.matches = fuzzyScore(pattern, this.symbol.name);
		for (const child of this.children) {
			child.updateFilter(pattern);
			if (!this.matches && child.matches) {
				this.matches = [0, []];
			}
		}
	}
}

export class OutlineItemGroup {

	constructor(
		readonly source: string,
		readonly children: OutlineItem[]
	) {
		//
	}

	updateFilter(pattern: string): void {
		for (const outline of this.children) {
			outline.updateFilter(pattern);
		}
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

	_getItemEnclosingPosition(position: IPosition, item: OutlineItem): OutlineItem {
		if (!Range.containsPosition(item.symbol.definingRange, position)) {
			return undefined;
		}
		for (const child of item.children) {
			let candidate = this._getItemEnclosingPosition(position, child);
			if (candidate) {
				return candidate;
			}
		}
		return item;
	}
}
