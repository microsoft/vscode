/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { binarySearch, coalesceInPlace, equals } from '../../../../base/common/arrays.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { onUnexpectedExternalError } from '../../../../base/common/errors.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { LRUCache } from '../../../../base/common/map.js';
import { commonPrefixLength } from '../../../../base/common/strings.js';
import { URI } from '../../../../base/common/uri.js';
import { IPosition, Position } from '../../../common/core/position.js';
import { IRange, Range } from '../../../common/core/range.js';
import { ITextModel } from '../../../common/model.js';
import { DocumentSymbol, DocumentSymbolProvider } from '../../../common/languages.js';
import { MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { IFeatureDebounceInformation, ILanguageFeatureDebounceService } from '../../../common/services/languageFeatureDebounce.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IModelService } from '../../../common/services/model.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { LanguageFeatureRegistry } from '../../../common/languageFeatureRegistry.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';

export abstract class TreeElement {

	abstract id: string;
	abstract children: Map<string, TreeElement>;
	abstract parent: TreeElement | undefined;

	remove(): void {
		this.parent?.children.delete(this.id);
	}

	static findId(candidate: DocumentSymbol | string, container: TreeElement): string {
		// complex id-computation which contains the origin/extension,
		// the parent path, and some dedupe logic when names collide
		let candidateId: string;
		if (typeof candidate === 'string') {
			candidateId = `${container.id}/${candidate}`;
		} else {
			candidateId = `${container.id}/${candidate.name}`;
			if (container.children.get(candidateId) !== undefined) {
				candidateId = `${container.id}/${candidate.name}_${candidate.range.startLineNumber}_${candidate.range.startColumn}`;
			}
		}

		let id = candidateId;
		for (let i = 0; container.children.get(id) !== undefined; i++) {
			id = `${candidateId}_${i}`;
		}

		return id;
	}

	static getElementById(id: string, element: TreeElement): TreeElement | undefined {
		if (!id) {
			return undefined;
		}
		const len = commonPrefixLength(id, element.id);
		if (len === id.length) {
			return element;
		}
		if (len < element.id.length) {
			return undefined;
		}
		for (const [, child] of element.children) {
			// eslint-disable-next-line no-restricted-syntax
			const candidate = TreeElement.getElementById(id, child);
			if (candidate) {
				return candidate;
			}
		}
		return undefined;
	}

	static size(element: TreeElement): number {
		let res = 1;
		for (const [, child] of element.children) {
			res += TreeElement.size(child);
		}
		return res;
	}

	static empty(element: TreeElement): boolean {
		return element.children.size === 0;
	}
}

export interface IOutlineMarker {
	startLineNumber: number;
	startColumn: number;
	endLineNumber: number;
	endColumn: number;
	severity: MarkerSeverity;
}

export class OutlineElement extends TreeElement {

	children = new Map<string, OutlineElement>();
	marker: { count: number; topSev: MarkerSeverity } | undefined;

	constructor(
		readonly id: string,
		public parent: TreeElement | undefined,
		readonly symbol: DocumentSymbol
	) {
		super();
	}
}

export class OutlineGroup extends TreeElement {

	children = new Map<string, OutlineElement>();

	constructor(
		readonly id: string,
		public parent: TreeElement | undefined,
		readonly label: string,
		readonly order: number,
	) {
		super();
	}

	getItemEnclosingPosition(position: IPosition): OutlineElement | undefined {
		return position ? this._getItemEnclosingPosition(position, this.children) : undefined;
	}

	private _getItemEnclosingPosition(position: IPosition, children: Map<string, OutlineElement>): OutlineElement | undefined {
		for (const [, item] of children) {
			if (!item.symbol.range || !Range.containsPosition(item.symbol.range, position)) {
				continue;
			}
			return this._getItemEnclosingPosition(position, item.children) || item;
		}
		return undefined;
	}

	updateMarker(marker: IOutlineMarker[]): void {
		for (const [, child] of this.children) {
			this._updateMarker(marker, child);
		}
	}

	private _updateMarker(markers: IOutlineMarker[], item: OutlineElement): void {
		item.marker = undefined;

		// find the proper start index to check for item/marker overlap.
		const idx = binarySearch<IRange>(markers, item.symbol.range, Range.compareRangesUsingStarts);
		let start: number;
		if (idx < 0) {
			start = ~idx;
			if (start > 0 && Range.areIntersecting(markers[start - 1], item.symbol.range)) {
				start -= 1;
			}
		} else {
			start = idx;
		}

		const myMarkers: IOutlineMarker[] = [];
		let myTopSev: MarkerSeverity | undefined;

		for (; start < markers.length && Range.areIntersecting(item.symbol.range, markers[start]); start++) {
			// remove markers intersecting with this outline element
			// and store them in a 'private' array.
			const marker = markers[start];
			myMarkers.push(marker);
			(markers as Array<IOutlineMarker | undefined>)[start] = undefined;
			if (!myTopSev || marker.severity > myTopSev) {
				myTopSev = marker.severity;
			}
		}

		// Recurse into children and let them match markers that have matched
		// this outline element. This might remove markers from this element and
		// therefore we remember that we have had markers. That allows us to render
		// the dot, saying 'this element has children with markers'
		for (const [, child] of item.children) {
			this._updateMarker(myMarkers, child);
		}

		if (myTopSev) {
			item.marker = {
				count: myMarkers.length,
				topSev: myTopSev
			};
		}

		coalesceInPlace(markers);
	}
}

export class OutlineModel extends TreeElement {

	static create(registry: LanguageFeatureRegistry<DocumentSymbolProvider>, textModel: ITextModel, token: CancellationToken): Promise<OutlineModel> {

		const cts = new CancellationTokenSource(token);
		const result = new OutlineModel(textModel.uri);
		const provider = registry.ordered(textModel);
		const promises = provider.map((provider, index) => {

			const id = TreeElement.findId(`provider_${index}`, result);
			const group = new OutlineGroup(id, result, provider.displayName ?? 'Unknown Outline Provider', index);


			return Promise.resolve(provider.provideDocumentSymbols(textModel, cts.token)).then(result => {
				for (const info of result || []) {
					OutlineModel._makeOutlineElement(info, group);
				}
				return group;
			}, err => {
				onUnexpectedExternalError(err);
				return group;
			}).then(group => {
				if (!TreeElement.empty(group)) {
					result._groups.set(id, group);
				} else {
					group.remove();
				}
			});
		});

		const listener = registry.onDidChange(() => {
			const newProvider = registry.ordered(textModel);
			if (!equals(newProvider, provider)) {
				cts.cancel();
			}
		});

		return Promise.all(promises).then(() => {
			if (cts.token.isCancellationRequested && !token.isCancellationRequested) {
				return OutlineModel.create(registry, textModel, token);
			} else {
				return result._compact();
			}
		}).finally(() => {
			cts.dispose();
			listener.dispose();
			cts.dispose();
		});
	}

	private static _makeOutlineElement(info: DocumentSymbol, container: OutlineGroup | OutlineElement): void {
		const id = TreeElement.findId(info, container);
		const res = new OutlineElement(id, container, info);
		if (info.children) {
			for (const childInfo of info.children) {
				OutlineModel._makeOutlineElement(childInfo, res);
			}
		}
		container.children.set(res.id, res);
	}

	static get(element: TreeElement | undefined): OutlineModel | undefined {
		while (element) {
			if (element instanceof OutlineModel) {
				return element;
			}
			element = element.parent;
		}
		return undefined;
	}

	readonly id = 'root';
	readonly parent = undefined;

	protected _groups = new Map<string, OutlineGroup>();
	children = new Map<string, OutlineGroup | OutlineElement>();

	protected constructor(readonly uri: URI) {
		super();

		this.id = 'root';
		this.parent = undefined;
	}

	private _compact(): this {
		let count = 0;
		for (const [key, group] of this._groups) {
			if (group.children.size === 0) { // empty
				this._groups.delete(key);
			} else {
				count += 1;
			}
		}
		if (count !== 1) {
			//
			this.children = this._groups;
		} else {
			// adopt all elements of the first group
			const group = Iterable.first(this._groups.values())!;
			for (const [, child] of group.children) {
				child.parent = this;
				this.children.set(child.id, child);
			}
		}
		return this;
	}

	merge(other: OutlineModel): boolean {
		if (this.uri.toString() !== other.uri.toString()) {
			return false;
		}
		if (this._groups.size !== other._groups.size) {
			return false;
		}
		this._groups = other._groups;
		this.children = other.children;
		return true;
	}

	getItemEnclosingPosition(position: IPosition, context?: OutlineElement): OutlineElement | undefined {

		let preferredGroup: OutlineGroup | undefined;
		if (context) {
			let candidate = context.parent;
			while (candidate && !preferredGroup) {
				if (candidate instanceof OutlineGroup) {
					preferredGroup = candidate;
				}
				candidate = candidate.parent;
			}
		}

		let result: OutlineElement | undefined = undefined;
		for (const [, group] of this._groups) {
			result = group.getItemEnclosingPosition(position);
			if (result && (!preferredGroup || preferredGroup === group)) {
				break;
			}
		}
		return result;
	}

	getItemById(id: string): TreeElement | undefined {
		// eslint-disable-next-line no-restricted-syntax
		return TreeElement.getElementById(id, this);
	}

	updateMarker(marker: IOutlineMarker[]): void {
		// sort markers by start range so that we can use
		// outline element starts for quicker look up
		marker.sort(Range.compareRangesUsingStarts);

		for (const [, group] of this._groups) {
			group.updateMarker(marker.slice(0));
		}
	}

	getTopLevelSymbols(): DocumentSymbol[] {
		const roots: DocumentSymbol[] = [];
		for (const child of this.children.values()) {
			if (child instanceof OutlineElement) {
				roots.push(child.symbol);
			} else {
				roots.push(...Iterable.map(child.children.values(), child => child.symbol));
			}
		}
		return roots.sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range));
	}

	asListOfDocumentSymbols(): DocumentSymbol[] {
		const roots = this.getTopLevelSymbols();
		const bucket: DocumentSymbol[] = [];
		OutlineModel._flattenDocumentSymbols(bucket, roots, '');
		return bucket.sort((a, b) =>
			Position.compare(Range.getStartPosition(a.range), Range.getStartPosition(b.range)) || Position.compare(Range.getEndPosition(b.range), Range.getEndPosition(a.range))
		);
	}

	private static _flattenDocumentSymbols(bucket: DocumentSymbol[], entries: DocumentSymbol[], overrideContainerLabel: string): void {
		for (const entry of entries) {
			bucket.push({
				kind: entry.kind,
				tags: entry.tags,
				name: entry.name,
				detail: entry.detail,
				containerName: entry.containerName || overrideContainerLabel,
				range: entry.range,
				selectionRange: entry.selectionRange,
				children: undefined, // we flatten it...
			});

			// Recurse over children
			if (entry.children) {
				OutlineModel._flattenDocumentSymbols(bucket, entry.children, entry.name);
			}
		}
	}
}


export const IOutlineModelService = createDecorator<IOutlineModelService>('IOutlineModelService');

export interface IOutlineModelService {
	_serviceBrand: undefined;
	getOrCreate(model: ITextModel, token: CancellationToken): Promise<OutlineModel>;
	getDebounceValue(textModel: ITextModel): number;
	getCachedModels(): Iterable<OutlineModel>;
}

interface CacheEntry {
	versionId: number;
	provider: DocumentSymbolProvider[];

	promiseCnt: number;
	source: CancellationTokenSource;
	promise: Promise<OutlineModel>;
	model: OutlineModel | undefined;
}

export class OutlineModelService implements IOutlineModelService {

	declare _serviceBrand: undefined;

	private readonly _disposables = new DisposableStore();
	private readonly _debounceInformation: IFeatureDebounceInformation;
	private readonly _cache = new LRUCache<string, CacheEntry>(15, 0.7);

	constructor(
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@ILanguageFeatureDebounceService debounces: ILanguageFeatureDebounceService,
		@IModelService modelService: IModelService
	) {
		this._debounceInformation = debounces.for(_languageFeaturesService.documentSymbolProvider, 'DocumentSymbols', { min: 350 });

		// don't cache outline models longer than their text model
		this._disposables.add(modelService.onModelRemoved(textModel => {
			this._cache.delete(textModel.id);
		}));
	}

	dispose(): void {
		this._disposables.dispose();
	}

	async getOrCreate(textModel: ITextModel, token: CancellationToken): Promise<OutlineModel> {

		const registry = this._languageFeaturesService.documentSymbolProvider;
		const provider = registry.ordered(textModel);

		let data = this._cache.get(textModel.id);
		if (!data || data.versionId !== textModel.getVersionId() || !equals(data.provider, provider)) {
			const source = new CancellationTokenSource();
			data = {
				versionId: textModel.getVersionId(),
				provider,
				promiseCnt: 0,
				source,
				promise: OutlineModel.create(registry, textModel, source.token),
				model: undefined,
			};
			this._cache.set(textModel.id, data);

			const now = Date.now();
			data.promise.then(outlineModel => {
				data!.model = outlineModel;
				this._debounceInformation.update(textModel, Date.now() - now);
			}).catch(_err => {
				this._cache.delete(textModel.id);
			});
		}

		if (data.model) {
			// resolved -> return data
			return data.model;
		}

		// increase usage counter
		data.promiseCnt += 1;

		const listener = token.onCancellationRequested(() => {
			// last -> cancel provider request, remove cached promise
			if (--data.promiseCnt === 0) {
				data.source.cancel();
				this._cache.delete(textModel.id);
			}
		});

		try {
			return await data.promise;
		} finally {
			listener.dispose();
		}
	}

	getDebounceValue(textModel: ITextModel): number {
		return this._debounceInformation.get(textModel);
	}

	getCachedModels(): Iterable<OutlineModel> {
		return Iterable.filter<OutlineModel | undefined, OutlineModel>(Iterable.map(this._cache.values(), entry => entry.model), model => model !== undefined);
	}
}

registerSingleton(IOutlineModelService, OutlineModelService, InstantiationType.Delayed);
