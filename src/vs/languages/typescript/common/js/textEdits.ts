/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import arrays = require('vs/base/common/arrays');
import strings = require('vs/base/common/strings');

export interface ITextSpan {
	offset:number;
	length:number;
}

export namespace ITextSpan {

	export function contains(span: ITextSpan, position: number): boolean {
		return span.offset <= position && position <= span.offset + span.length;
	}

	export function overlaps(a: ITextSpan, b: ITextSpan): boolean {
		return contains(a, b.offset) || contains(a, b.offset + b.length);
	}
}

export class TextSpan {

	public static from(span: ITextSpan): TextSpan {
		return new TextSpan(span.offset, span.length);
	}

	constructor(public offset: number, public length: number) {
		// empty
	}

	public get end(): number {
		return this.offset + this.length;
	}

	public equals(other: ITextSpan): boolean {
		return this.offset === other.offset && this.length === other.length;
	}

	public contains(other: ITextSpan): boolean {
		return other.offset >= this.offset && other.offset < this.end && other.offset + other.length <= this.end;
	}

	public overlaps(other: ITextSpan): boolean {
		return ITextSpan.overlaps(this, other);
	}
}

export class Edit extends TextSpan {

	origin: TextSpan;

	constructor(offset:number, length:number, public text:string) {
		super(offset, length);
	}

	public get deltaLength():number {
		return this.text.length - this.length;
	}

	public get deltaEnd():number {
		return this.end + this.deltaLength;
	}

	public get deltaSpan(): TextSpan {
		return new TextSpan(this.offset, this.deltaLength);
	}

	public isInsert():boolean {
		return this.length === 0 && this.text.length > 0;
	}

	public equals(other:Edit):boolean {
		return this.text === other.text && super.equals(other);
	}

	public toString():string {
		return strings.format('{0}-{1}/{2}', this.offset, this.length, this.text);
	}
}

export function compareAscending(a:TextSpan, b:TextSpan):number {
	return -compareDecending(a, b);
}

export function compareDecending(a:TextSpan, b:TextSpan):number {
	if(a.offset === b.offset) {
		return b.length - a.length;
	}
	return b.offset - a.offset;
}

export interface ITextOperationResult {
	value: string;
	doEdits: Edit[];
	undoEdits: Edit[];
	derived: TextSpan[];
}


// /**
//  * Inserts at the same offset will be merged into one
//  * edit.
//  */
// function mergeInserts(edits:Edit[]):void {
// 	var insertsAtOffset:collections.INumberDictionary<Edit> = {};
// 	arrays.forEach(edits, function(edit, remove) {
// 		if(edit.length !== 0) {
// 			return;
// 		}
// 		var otherEdit = collections.lookupOrInsert(insertsAtOffset, edit.offset, edit);
// 		if(otherEdit !== edit) {
// 			otherEdit.text += edit.text;
// 			remove();
// 		}
// 	});
// }

export function apply(edits:Edit[], value:string):ITextOperationResult {

	var derived: TextSpan[] = [];

	var inserts: { [offset: number]: Edit } = Object.create(null);
	arrays.forEach(edits, (edit, rm) => {
		if (edit.isInsert()) {
			var other = inserts[edit.offset];
			if (!other) {
				inserts[edit.offset] = edit;
				if (edit.origin) {
					derived.push(edit.deltaSpan);
					derived.push(edit.origin);
				}
			} else {
				if (edit.origin) {
					derived.push(new TextSpan(edit.offset + other.text.length, edit.deltaLength));
					derived.push(edit.origin);
				}
				//TODO@Joh append || prepend text based on prio
				other.text += edit.text;
				rm();
			}
		}
	});

	var segements:string[] = [],
		end = value.length,
		deltas:number[] = [],
		inverse:Edit[] = [],
		edit:Edit;

	// merge inserts at the same offset and sort
	// so that we start with the highest offset
	edits.sort(compareDecending);

	for(var i = 0, len = edits.length; i < len; i++) {
		edit = edits[i];
		segements.push(value.substring(edit.end, end));
		segements.push(edit.text);
		end = edit.offset;
		deltas.push(edit.deltaLength);
		inverse.push(new Edit(edit.offset, edit.text.length, value.substr(edit.offset, edit.length)));
	}
	segements.push(value.substring(0, end));

	// adjust the offset of the inverse operations
	// by the accumlated delta length until them.
	// go backwards because we started with the
	// highest offset
	var delta = 0;
	for(var i = inverse.length - 1; i >= 0; i--) {
		inverse[i].offset += delta;
		delta += deltas[i];
	}

	return {
		value: segements.reverse().join(strings.empty),
		doEdits: edits,
		undoEdits: inverse,
		derived
	};
}

export enum TranslationBehaviour {
	None = 0,
	StickLeft = 1,
	StickRight = 2
}

/**
 * Translates the provided position based on the edits.
 */
export function translate(edits:Edit[], pos:number, behaviour?:TranslationBehaviour):number {

	if(typeof behaviour === 'undefined') {
		behaviour = TranslationBehaviour.None;
	}

	edits.sort(compareAscending);

	var delta = 0,
		edit:Edit;

	for(var i = 0, len = edits.length; i < len; i++) {
		edit = edits[i];

		if(edit.end < pos) {
			// before: push out by delta length
			delta += edit.deltaLength;
		} else if(edit.offset > pos) {
			// after: ignore and stop
			break;
		} else if(edit.offset <= pos && edit.end >= pos) {
			// intersect: remap removed
			if(behaviour === TranslationBehaviour.None) {
				delta += Math.min(0, edit.offset + (edit.length + edit.deltaLength) - pos);
			} else if(behaviour === TranslationBehaviour.StickLeft) {
				// left: go to the start of the edit
				delta += edit.offset - pos;
			} else if(behaviour === TranslationBehaviour.StickRight) {
				// right: go to the end of the edit
				delta += edit.end + edit.deltaLength - pos;
			}
		}
	}

	return pos + delta;
}