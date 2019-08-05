/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Event, Emitter } from 'vs/base/common/event';
import { basename } from 'vs/base/common/resources';
import { IDisposable, dispose, IReference, DisposableStore } from 'vs/base/common/lifecycle';
import * as strings from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import { defaultGenerator } from 'vs/base/common/idGenerator';
import { Range, IRange } from 'vs/editor/common/core/range';
import { Location, LocationLink } from 'vs/editor/common/modes';
import { ITextModelService, ITextEditorModel } from 'vs/editor/common/services/resolverService';
import { Position } from 'vs/editor/common/core/position';
import { IMatch } from 'vs/base/common/filters';

export class OneReference {
	readonly id: string;

	private readonly _onRefChanged = new Emitter<this>();
	readonly onRefChanged: Event<this> = this._onRefChanged.event;

	constructor(
		readonly parent: FileReferences,
		private _range: IRange,
		readonly isProviderFirst: boolean
	) {
		this.id = defaultGenerator.nextId();
	}

	get uri(): URI {
		return this.parent.uri;
	}

	get range(): IRange {
		return this._range;
	}

	set range(value: IRange) {
		this._range = value;
		this._onRefChanged.fire(this);
	}

	getAriaMessage(): string {
		return localize(
			'aria.oneReference', "symbol in {0} on line {1} at column {2}",
			basename(this.uri), this.range.startLineNumber, this.range.startColumn
		);
	}
}

export class FilePreview implements IDisposable {

	constructor(
		private readonly _modelReference: IReference<ITextEditorModel>
	) {
	}

	dispose(): void {
		dispose(this._modelReference);
	}

	preview(range: IRange, n: number = 8): { value: string; highlight: IMatch } | undefined {
		const model = this._modelReference.object.textEditorModel;

		if (!model) {
			return undefined;
		}

		const { startLineNumber, startColumn, endLineNumber, endColumn } = range;
		const word = model.getWordUntilPosition({ lineNumber: startLineNumber, column: startColumn - n });
		const beforeRange = new Range(startLineNumber, word.startColumn, startLineNumber, startColumn);
		const afterRange = new Range(endLineNumber, endColumn, endLineNumber, Number.MAX_VALUE);

		const before = model.getValueInRange(beforeRange).replace(/^\s+/, strings.empty);
		const inside = model.getValueInRange(range);
		const after = model.getValueInRange(afterRange).replace(/\s+$/, strings.empty);

		return {
			value: before + inside + after,
			highlight: { start: before.length, end: before.length + inside.length }
		};
	}
}

export class FileReferences implements IDisposable {

	private _children: OneReference[];
	private _preview?: FilePreview;
	private _resolved?: boolean;
	private _loadFailure: any;

	constructor(private readonly _parent: ReferencesModel, private readonly _uri: URI) {
		this._children = [];
	}

	get id(): string {
		return this._uri.toString();
	}

	get parent(): ReferencesModel {
		return this._parent;
	}

	get children(): OneReference[] {
		return this._children;
	}

	get uri(): URI {
		return this._uri;
	}

	get preview(): FilePreview | undefined {
		return this._preview;
	}

	get failure(): any {
		return this._loadFailure;
	}

	getAriaMessage(): string {
		const len = this.children.length;
		if (len === 1) {
			return localize('aria.fileReferences.1', "1 symbol in {0}, full path {1}", basename(this.uri), this.uri.fsPath);
		} else {
			return localize('aria.fileReferences.N', "{0} symbols in {1}, full path {2}", len, basename(this.uri), this.uri.fsPath);
		}
	}

	resolve(textModelResolverService: ITextModelService): Promise<FileReferences> {

		if (this._resolved) {
			return Promise.resolve(this);
		}

		return Promise.resolve(textModelResolverService.createModelReference(this._uri).then(modelReference => {
			const model = modelReference.object;

			if (!model) {
				modelReference.dispose();
				throw new Error();
			}

			this._preview = new FilePreview(modelReference);
			this._resolved = true;
			return this;

		}, err => {
			// something wrong here
			this._children = [];
			this._resolved = true;
			this._loadFailure = err;
			return this;
		}));
	}

	dispose(): void {
		if (this._preview) {
			this._preview.dispose();
			this._preview = undefined;
		}
	}
}

export class ReferencesModel implements IDisposable {

	private readonly _disposables = new DisposableStore();
	readonly groups: FileReferences[] = [];
	readonly references: OneReference[] = [];

	readonly _onDidChangeReferenceRange = new Emitter<OneReference>();
	readonly onDidChangeReferenceRange: Event<OneReference> = this._onDidChangeReferenceRange.event;

	constructor(references: LocationLink[]) {

		// grouping and sorting
		const [providersFirst] = references;
		references.sort(ReferencesModel._compareReferences);

		let current: FileReferences | undefined;
		for (let ref of references) {
			if (!current || current.uri.toString() !== ref.uri.toString()) {
				// new group
				current = new FileReferences(this, ref.uri);
				this.groups.push(current);
			}

			// append, check for equality first!
			if (current.children.length === 0
				|| !Range.equalsRange(ref.range, current.children[current.children.length - 1].range)) {

				let oneRef = new OneReference(current, ref.targetSelectionRange || ref.range, providersFirst === ref);
				this._disposables.add(oneRef.onRefChanged((e) => this._onDidChangeReferenceRange.fire(e)));
				this.references.push(oneRef);
				current.children.push(oneRef);
			}
		}
	}

	get empty(): boolean {
		return this.groups.length === 0;
	}

	getAriaMessage(): string {
		if (this.empty) {
			return localize('aria.result.0', "No results found");
		} else if (this.references.length === 1) {
			return localize('aria.result.1', "Found 1 symbol in {0}", this.references[0].uri.fsPath);
		} else if (this.groups.length === 1) {
			return localize('aria.result.n1', "Found {0} symbols in {1}", this.references.length, this.groups[0].uri.fsPath);
		} else {
			return localize('aria.result.nm', "Found {0} symbols in {1} files", this.references.length, this.groups.length);
		}
	}

	nextOrPreviousReference(reference: OneReference, next: boolean): OneReference {

		let { parent } = reference;

		let idx = parent.children.indexOf(reference);
		let childCount = parent.children.length;
		let groupCount = parent.parent.groups.length;

		if (groupCount === 1 || next && idx + 1 < childCount || !next && idx > 0) {
			// cycling within one file
			if (next) {
				idx = (idx + 1) % childCount;
			} else {
				idx = (idx + childCount - 1) % childCount;
			}
			return parent.children[idx];
		}

		idx = parent.parent.groups.indexOf(parent);
		if (next) {
			idx = (idx + 1) % groupCount;
			return parent.parent.groups[idx].children[0];
		} else {
			idx = (idx + groupCount - 1) % groupCount;
			return parent.parent.groups[idx].children[parent.parent.groups[idx].children.length - 1];
		}
	}

	nearestReference(resource: URI, position: Position): OneReference | undefined {

		const nearest = this.references.map((ref, idx) => {
			return {
				idx,
				prefixLen: strings.commonPrefixLength(ref.uri.toString(), resource.toString()),
				offsetDist: Math.abs(ref.range.startLineNumber - position.lineNumber) * 100 + Math.abs(ref.range.startColumn - position.column)
			};
		}).sort((a, b) => {
			if (a.prefixLen > b.prefixLen) {
				return -1;
			} else if (a.prefixLen < b.prefixLen) {
				return 1;
			} else if (a.offsetDist < b.offsetDist) {
				return -1;
			} else if (a.offsetDist > b.offsetDist) {
				return 1;
			} else {
				return 0;
			}
		})[0];

		if (nearest) {
			return this.references[nearest.idx];
		}
		return undefined;
	}

	firstReference(): OneReference | undefined {
		for (const ref of this.references) {
			if (ref.isProviderFirst) {
				return ref;
			}
		}
		return this.references[0];
	}

	dispose(): void {
		dispose(this.groups);
		this._disposables.dispose();
		this.groups.length = 0;
	}

	private static _compareReferences(a: Location, b: Location): number {
		const auri = a.uri.toString();
		const buri = b.uri.toString();
		if (auri < buri) {
			return -1;
		} else if (auri > buri) {
			return 1;
		} else {
			return Range.compareRangesUsingStarts(a.range, b.range);
		}
	}
}
