/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

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

	constructor(private _parent: ReferencesModel, private _resource: URI) {
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

	public resolve(editorService: IEditorService): TPromise<FileReferences> {

		if (this._resolved) {
			return TPromise.as(this);
		}

		return editorService.resolveEditorModel({ resource: this._resource }).then(model => {
			this._preview = new FilePreview((<IModel>model.textEditorModel).getValue());
			this._resolved = true;
			return this;
		});
	}
}

export class ReferencesModel {

	private _groups: FileReferences[] = [];
	private _references: OneReference[] = [];
	private _eventBus = new EventEmitter();

	onDidChangeReferenceRange: Event<OneReference> = fromEventEmitter<OneReference>(this._eventBus, 'ref/changed');

	constructor(references: IReference[]) {

		// grouping and sorting
		references.sort(ReferencesModel._compareReferences);

		let current: FileReferences;
		for (let ref of references) {
			if (!current || current.resource.toString() !== ref.resource.toString()) {
				// new group
				current = new FileReferences(this, ref.resource);
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

	public get references(): OneReference[]{
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
		let candidate: OneReference;
		let candiateDist: number;
		for (let ref of this._references) {
			if (ref.resource.toString() !== resource.toString()) {
				continue;
			}

			if (Range.containsPosition(ref.range, position)) {
				// best match (!)
				return ref;
			}

			let dist =
				(Math.abs(ref.range.startLineNumber - position.lineNumber) * 100)
				+ Math.abs(ref.range.startColumn - position.column);

			if (!candidate || dist <= candiateDist) {
				candidate = ref;
				candiateDist = dist;
			}
		}
		return candidate || this._references[0];
	}

	private static _compareReferences(a: IReference, b: IReference): number {
		if (a.resource.toString() < b.resource.toString()) {
			return -1;
		} else if (a.resource.toString() > b.resource.toString()) {
			return 1;
		} else {
			return Range.compareRangesUsingStarts(a.range, b.range);
		}
	}
}
