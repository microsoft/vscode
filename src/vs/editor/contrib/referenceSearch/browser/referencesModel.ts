/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { EventEmitter } from 'vs/base/common/eventEmitter';
import Event, { fromEventEmitter } from 'vs/base/common/event';
import { basename, dirname } from 'vs/base/common/paths';
import { IDisposable, dispose, IReference } from 'vs/base/common/lifecycle';
import * as strings from 'vs/base/common/strings';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { Range } from 'vs/editor/common/core/range';
import { IPosition, IRange } from 'vs/editor/common/editorCommon';
import { Location } from 'vs/editor/common/modes';
import { ITextModelResolverService, ITextEditorModel } from 'vs/editor/common/services/resolverService';

export class OneReference {

	private _id: string;

	constructor(
		private _parent: FileReferences,
		private _range: IRange,
		private _eventBus: EventEmitter
	) {
		this._id = this._generateStableId();
	}

	private _generateStableId(): string {
		return this.uri.toString() + ":" + this._toString(this.range);
	}

	private _toString(range: IRange): string {
		return [range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn].join(":");
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

		const { startLineNumber, startColumn, endColumn } = range;
		const word = model.getWordUntilPosition({ lineNumber: startLineNumber, column: startColumn - n });
		const beforeRange = new Range(startLineNumber, word.startColumn, startLineNumber, startColumn);
		const afterRange = new Range(startLineNumber, endColumn, startLineNumber, Number.MAX_VALUE);

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

	public resolve(textModelResolverService: ITextModelResolverService): TPromise<FileReferences> {

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

	public nearestReference(resource: URI, position: IPosition): OneReference {

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
