/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { DocumentSymbolProviderRegistry, SymbolInformation } from 'vs/editor/common/modes';
import { ITextModel } from '../../../../editor/common/model';
import { asWinJsPromise } from '../../../../base/common/async';
import { TPromise } from 'vs/base/common/winjs.base';

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
			`${info.name}/${parent ? parent.id : ''}`,
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

	constructor(
		readonly id: string,
		readonly symbol: SymbolInformation,
		readonly parent: OutlineItem,
		readonly children: OutlineItem[],
	) {
		//
	}
}

export class OneOutline {

	constructor(
		readonly source: string,
		readonly items: OutlineItem[]
	) {
		//
	}
}
