/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { EventEmitter } from 'vs/base/common/eventEmitter';
import Event, { fromEventEmitter } from 'vs/base/common/event';
import { basename, dirname } from 'vs/base/common/paths';
import { IDisposable, dispose, IReference } from 'vs/base/common/lifecycle';
import * as strings from 'vs/base/common/strings';
import URI from 'vs/base/common/uri';
import { defaultGenerator } from 'vs/base/common/idGenerator';
import { TPromise } from 'vs/base/common/winjs.base';
import { Range, IRange } from 'vs/editor/common/core/range';
import { Location } from 'vs/editor/common/modes';
import { ITextModelService, ITextEditorModel } from 'vs/editor/common/services/resolverService';
import { Position } from 'vs/editor/common/core/position';

export class OneReference {

	private _id: string;

	constructor(
		private _parent: FileReferences,
		private _range: IRange,
		private _eventBus: EventEmitter
	) {
		this._id = defaultGenerator.nextId();
	}

	public get id(): string {
		return this._id;
	}

	public get model(): FileReferences {
		return this._parent;
	}

	public get parent(): FileReferences {
		return this._parent;
	}

	public get uri(): URI {
		return this._parent.uri;
	}

	public get name(): string {
		return this._parent.name;
	}

	public get directory(): string {
		return this._parent.directory;
	}

	public get range(): IRange {
		return this._range;
	}

	public set range(value: IRange) {
		this._range = value;
		this._eventBus.emit('ref/changed', this);
	}

	public getAriaMessage(): string {
		return localize(
			'aria.oneReference', "symbol in {0} on line {1} at column {2}",
			basename(this.uri.fsPath), this.range.startLineNumber, this.range.startColumn
		);
	}
}

export class FilePreview implements IDisposable {

	constructor(private _modelReference: IReference<ITextEditorModel>) {

	}

	private get _model() { return this._modelReference.object.textEditorModel; }

	public preview(range: IRange, n: number = 8): { before: string; inside: string; after: string } {
		const model = this._model;

		if (!model) {
			return undefined;
		}

		const { startLineNumber, startColumn, endLineNumber, endColumn } = range;
		const word = model.getWordUntilPosition({ lineNumber: startLineNumber, column: startColumn - n });
		const beforeRange = new Range(startLineNumber, word.startColumn, startLineNumber, startColumn);
		const afterRange = new Range(endLineNumber, endColumn, endLineNumber, Number.MAX_VALUE);

		const ret = {
			before: model.getValueInRange(beforeRange).replace(/^\s+/, strings.empty),
			inside: model.getValueInRange(range),
			after: model.getValueInRange(afterRange).replace(/\s+$/, strings.empty)
		};

		return ret;
	}

	dispose(): void {
		if (this._modelReference) {
			this._modelReference.dispose();
			this._modelReference = null;
		}
	}
}

export class FileReferences implements IDisposable {

	private _children: OneReference[];
	private _preview: FilePreview;
	private _resolved: boolean;
	private _loadFailure: any;

	constructor(private _parent: ReferencesModel, private _uri: URI) {
		this._children = [];
	}

	public get id(): string {
		return this._uri.toString();
	}

	public get parent(): ReferencesModel {
		return this._parent;
	}

	public get children(): OneReference[] {
		return this._children;
	}

	public get uri(): URI {
		return this._uri;
	}

	public get name(): string {
		return basename(this.uri.fsPath);
	}

	public get directory(): string {
		return dirname(this.uri.fsPath);
	}

	public get preview(): FilePreview {
		return this._preview;
	}

	public get failure(): any {
		return this._loadFailure;
	}

	getAriaMessage(): string {
		const len = this.children.length;
		if (len === 1) {
			return localize('aria.fileReferences.1', "1 symbol in {0}, full path {1}", basename(this.uri.fsPath), this.uri.fsPath);
		} else {
			return localize('aria.fileReferences.N', "{0} symbols in {1}, full path {2}", len, basename(this.uri.fsPath), this.uri.fsPath);
		}
	}

	public resolve(textModelResolverService: ITextModelService): TPromise<FileReferences> {

		if (this._resolved) {
			return TPromise.as(this);
		}

		return textModelResolverService.createModelReference(this._uri).then(modelReference => {
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
		});
	}

	dispose(): void {
		if (this._preview) {
			this._preview.dispose();
			this._preview = null;
		}
	}
}

export class ReferencesModel implements IDisposable {

	private _groups: FileReferences[] = [];
	private _references: OneReference[] = [];
	private _eventBus = new EventEmitter();

	onDidChangeReferenceRange: Event<OneReference> = fromEventEmitter<OneReference>(this._eventBus, 'ref/changed');

	constructor(references: Location[]) {

		// grouping and sorting
		references.sort(ReferencesModel._compareReferences);

		let current: FileReferences;
		for (let ref of references) {
			if (!current || current.uri.toString() !== ref.uri.toString()) {
				// new group
				current = new FileReferences(this, ref.uri);
				this.groups.push(current);
			}

			// append, check for equality first!
			if (current.children.length === 0
				|| !Range.equalsRange(ref.range, current.children[current.children.length - 1].range)) {

				let oneRef = new OneReference(current, ref.range, this._eventBus);
				this._references.push(oneRef);
				current.children.push(oneRef);
			}
		}
	}

	public get empty(): boolean {
		return this._groups.length === 0;
	}

	public get references(): OneReference[] {
		return this._references;
	}

	public get groups(): FileReferences[] {
		return this._groups;
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

	public nextReference(reference: OneReference): OneReference {

		var idx = reference.parent.children.indexOf(reference),
			len = reference.parent.children.length,
			totalLength = reference.parent.parent.groups.length;

		if (idx + 1 < len || totalLength === 1) {
			return reference.parent.children[(idx + 1) % len];
		}

		idx = reference.parent.parent.groups.indexOf(reference.parent);
		idx = (idx + 1) % totalLength;

		return reference.parent.parent.groups[idx].children[0];
	}

	public nearestReference(resource: URI, position: Position): OneReference {

		const nearest = this._references.map((ref, idx) => {
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
			return this._references[nearest.idx];
		}
		return undefined;
	}

	dispose(): void {
		this._groups = dispose(this._groups);
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
