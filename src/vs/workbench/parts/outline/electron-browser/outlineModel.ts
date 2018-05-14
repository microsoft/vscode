/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { DocumentSymbolProviderRegistry, SymbolInformation, DocumentSymbolProvider } from 'vs/editor/common/modes';
import { ITextModel } from 'vs/editor/common/model';
import { asWinJsPromise } from 'vs/base/common/async';
import { TPromise } from 'vs/base/common/winjs.base';
import { fuzzyScore } from 'vs/base/common/filters';
import { IPosition } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';

export type FuzzyScore = [number, number[]];

export abstract class TreeElement {
	abstract id: string;
	abstract children: { [id: string]: TreeElement };
	abstract parent: TreeElement | any;

	static findId(candidate: string, container: TreeElement): string {
		// complex id-computation which contains the origin/extension,
		// the parent path, and some dedupe logic when names collide
		let id = container.id + candidate;
		for (let i = 1; container.children[id] !== void 0; i++) {
			id = container.id + candidate + i;
		}
		return id;
	}

	static getElementById(id: string, element: TreeElement): TreeElement {
		if (element.id === id) {
			return element;
		}
		for (const key in element.children) {
			let candidate = TreeElement.getElementById(id, element.children[key]);
			if (candidate) {
				return candidate;
			}
		}
		return undefined;
	}
}

export class OutlineElement extends TreeElement {

	children: { [id: string]: OutlineElement; } = Object.create(null);
	score: FuzzyScore = [0, []];

	constructor(
		readonly id: string,
		readonly parent: OutlineGroup | OutlineElement,
		readonly symbol: SymbolInformation
	) {
		super();
	}
}

export class OutlineGroup extends TreeElement {

	children: { [id: string]: OutlineElement; } = Object.create(null);

	constructor(
		readonly id: string,
		readonly parent: OutlineModel,
		readonly provider: DocumentSymbolProvider,
		readonly providerIndex: number,
	) {
		super();
	}

	updateMatches(pattern: string, topMatch: OutlineElement): OutlineElement {
		for (const key in this.children) {
			topMatch = this._updateMatches(pattern, this.children[key], topMatch);
		}
		return topMatch;
	}

	private _updateMatches(pattern: string, item: OutlineElement, topMatch: OutlineElement): OutlineElement {
		item.score = fuzzyScore(pattern, item.symbol.name);
		if (item.score && (!topMatch || item.score[0] > topMatch.score[0])) {
			topMatch = item;
		}
		for (const key in item.children) {
			let child = item.children[key];
			topMatch = this._updateMatches(pattern, child, topMatch);
			if (!item.score && child.score) {
				// don't filter parents with unfiltered children
				item.score = [0, []];
			}
		}
		return topMatch;
	}

	getItemEnclosingPosition(position: IPosition): OutlineElement {
		return this._getItemEnclosingPosition(position, this.children);
	}

	private _getItemEnclosingPosition(position: IPosition, children: { [id: string]: OutlineElement }): OutlineElement {
		for (let key in children) {
			let item = children[key];
			if (!Range.containsPosition(item.symbol.definingRange || item.symbol.location.range, position)) {
				continue;
			}
			return this._getItemEnclosingPosition(position, item.children) || item;
		}
		return undefined;
	}
}

export class OutlineModel extends TreeElement {

	readonly id = 'root';
	readonly parent = undefined;

	children: { [id: string]: OutlineGroup; } = Object.create(null);
	request: TPromise<any>;

	constructor(readonly textModel: ITextModel) {
		super();
		this._makeRequest();
	}

	dispose(): void {
		this.request.cancel();
	}

	refresh(): void {
		this.request.cancel();
		this.children = Object.create(null);
		this._makeRequest();
	}

	private _makeRequest(): void {
		let promises = DocumentSymbolProviderRegistry.ordered(this.textModel).map((provider, index) => {

			let id = TreeElement.findId(`provider_${index}`, this);
			let group = new OutlineGroup(id, this, provider, index);

			return asWinJsPromise(token => provider.provideDocumentSymbols(this.textModel, token)).then(result => {
				for (const info of result) {
					OutlineModel._makeOutlineElement(info, group);
				}
				return group;
			}, err => {
				//todo@joh capture error in group
				return group;
			}).then(group => {
				this.children[id] = group;
			});
		});

		this.request = TPromise.join(promises);
	}

	private static _makeOutlineElement(info: SymbolInformation, container: OutlineGroup | OutlineElement): void {
		let id = TreeElement.findId(info.name, container);
		let res = new OutlineElement(id, container, info);
		if (info.children) {
			for (const childInfo of info.children) {
				OutlineModel._makeOutlineElement(childInfo, res);
			}
		}
		container.children[res.id] = res;
	}

	updateMatches(pattern: string): OutlineElement {
		let topMatch: OutlineElement;
		for (const key in this.children) {
			this.children[key].updateMatches(pattern, topMatch);
		}
		return topMatch;
	}

	getItemEnclosingPosition(position: IPosition): OutlineElement {
		for (const key in this.children) {
			let result = this.children[key].getItemEnclosingPosition(position);
			if (result) {
				return result;
			}
		}
		return undefined;
	}

	getItemById(id: string): TreeElement {
		return TreeElement.getElementById(id, this);
	}
}
