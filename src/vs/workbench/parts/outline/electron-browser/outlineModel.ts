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

export function getOutline(model: ITextModel): TPromise<OneOutline[]> {
	let outlines = new Array<OneOutline>();
	let promises = DocumentSymbolProviderRegistry.ordered(model).map((provider, i) => {
		return asWinJsPromise(token => provider.provideDocumentSymbols(model, token)).then(result => {
			let items = new Array<OutlineItem>();
			let source = `provider${i}`;
			for (const item of result) {
				OutlineItem.convert(items, item, undefined);
			}
			outlines.push(new OneOutline(source, items));
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

export class OneOutline {

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
}
