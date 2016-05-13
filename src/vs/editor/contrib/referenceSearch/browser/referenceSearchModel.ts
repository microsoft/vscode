/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as collections from 'vs/base/common/collections';
import {EventEmitter} from 'vs/base/common/eventEmitter';
import Event, {fromEventEmitter} from 'vs/base/common/event';
import {basename, dirname} from 'vs/base/common/paths';
import * as strings from 'vs/base/common/strings';
import URI from 'vs/base/common/uri';
import {generateUuid} from 'vs/base/common/uuid';
import {TPromise} from 'vs/base/common/winjs.base';
import {IEditorService} from 'vs/platform/editor/common/editor';
import {Range} from 'vs/editor/common/core/range';
import {IModel, IPosition, IRange} from 'vs/editor/common/editorCommon';
import {IReference} from 'vs/editor/common/modes';

export class OneReference {

	private _id: string;

	constructor(
		private _parent: FileReferences,
		private _range: IRange,
		private _eventBus: EventEmitter
	) {
		this._id = generateUuid();
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

	public get resource(): URI {
		return this._parent.resource;
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

export class FilePreview {

	private _value: string;
	private _lineStarts: number[];

	constructor(value: string) {
		this._value = value;
		this._lineStarts = strings.computeLineStarts(value);
	}

	public preview(range: IRange, n: number = 8): { before: string; inside: string; after: string } {

		var lineStart = this._lineStarts[range.startLineNumber - 1],
			rangeStart = lineStart + range.startColumn - 1,
			rangeEnd = this._lineStarts[range.endLineNumber - 1] + range.endColumn - 1,
			lineEnd = range.endLineNumber >= this._lineStarts.length ? this._value.length : this._lineStarts[range.endLineNumber];

		var ret = {
			before: this._value.substring(lineStart, rangeStart).replace(/^\s+/, strings.empty),
			inside: this._value.substring(rangeStart, rangeEnd),
			after: this._value.substring(rangeEnd, lineEnd).replace(/\s+$/, strings.empty)
		};
		// long before parts will be cut at the best position
		ret.before = strings.lcut(ret.before, n);
		return ret;
	}
}

export class FileReferences {

	private _children: OneReference[];
	private _preview: FilePreview;
	private _resolved: boolean;

	constructor(private _parent: ReferencesModel, private _resource: URI, private _editorService: IEditorService) {
		this._children = [];
	}

	public get id(): string {
		return this._resource.toString();
	}

	public get parent(): ReferencesModel {
		return this._parent;
	}

	public get children(): OneReference[] {
		return this._children;
	}

	public get resource(): URI {
		return this._resource;
	}

	public get name(): string {
		return basename(this.resource.fsPath);
	}

	public get directory(): string {
		return dirname(this.resource.fsPath);
	}

	public get preview(): FilePreview {
		return this._preview;
	}

	public resolve(): TPromise<FileReferences> {

		if (this._resolved) {
			return TPromise.as(this);
		}

		return this._editorService.resolveEditorModel({ resource: this._resource }).then(model => {
			this._preview = new FilePreview((<IModel>model.textEditorModel).getValue());
			this._resolved = true;
			return this;
		});
	}
}

export class ReferencesModel  {

	private _references: FileReferences[];
	private _eventBus = new EventEmitter();

	onDidChangeReferenceRange: Event<OneReference> = fromEventEmitter<OneReference>(this._eventBus, 'ref/changed');

	constructor(references: IReference[], editorService: IEditorService) {

		let referencesByFile: { [n: string]: FileReferences } = Object.create(null);
		let seen: { [n: string]: boolean } = Object.create(null);

		references.forEach(reference => {

			let hash = ReferencesModel._hash(reference);
			if (!seen[hash]) {
				seen[hash] = true;

				let resource = reference.resource;
				let fileReferences = new FileReferences(this, resource, editorService);

				fileReferences = collections.lookupOrInsert(referencesByFile, fileReferences.id, fileReferences);
				fileReferences.children.push(new OneReference(fileReferences, reference.range, this._eventBus));
			}
		});

		this._references = collections.values(referencesByFile);
		this._references.sort(ReferencesModel._compare);
	}

	public get children(): FileReferences[] {
		return this._references;
	}

	public nextReference(reference: OneReference): OneReference {

		var idx = reference.parent.children.indexOf(reference),
			len = reference.parent.children.length,
			totalLength = reference.parent.parent.children.length;

		if (idx + 1 < len || totalLength === 1) {
			return reference.parent.children[(idx + 1) % len];
		}

		idx = reference.parent.parent.children.indexOf(reference.parent);
		idx = (idx + 1) % totalLength;

		return reference.parent.parent.children[idx].children[0];
	}

	public findReference(resource: URI, position: IPosition): OneReference {
		for (var i = 0, len = this._references.length; i < len; i++) {
			var reference = this._references[i];
			if (reference.resource.toString() !== resource.toString()) {
				continue;
			}

			var result: OneReference;
			reference.children.some((element) => {
				if (Range.containsPosition(element.range, position)) {
					result = element;
					return true;
				}
				return false;
			});

			if (result) {
				return result;
			}
		}
		if (this._references.length > 0) {
			return this._references[0].children[0];
		}
		return null;
	}

	private static _hash(reference: IReference): string {
		let {startLineNumber, startColumn, endLineNumber, endColumn} = reference.range;
		return [reference.resource.toString(),
			startLineNumber, startColumn, endLineNumber, endColumn].join(',');
	}

	private static _compare(a: FileReferences, b: FileReferences): number {
		return strings.localeCompare(a.directory, b.directory) || strings.localeCompare(a.name, b.name);
	}
}
