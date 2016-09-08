/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {ModelLine} from 'vs/editor/common/model/modelLine';
import {TextModelWithTokens} from 'vs/editor/common/model/textModelWithTokens';
import {IMode} from 'vs/editor/common/modes';
import {ICompatMirrorModel} from 'vs/editor/common/services/resourceService';

export interface ICompatMirrorModelEvents {
	contentChanged: editorCommon.IModelContentChangedEvent[];
}

const NO_TAB_SIZE = 0;

export class CompatMirrorModel extends TextModelWithTokens implements ICompatMirrorModel {

	protected _associatedResource:URI;

	constructor(versionId:number, value:editorCommon.IRawText, mode:IMode|TPromise<IMode>, associatedResource?:URI) {
		super(['changed', editorCommon.EventType.ModelDispose], value, mode);

		this._setVersionId(versionId);
		this._associatedResource = associatedResource;
	}

	public dispose(): void {
		this.emit(editorCommon.EventType.ModelDispose);
		super.dispose();
	}

	public get uri(): URI {
		return this._associatedResource;
	}

	protected _constructLines(rawText:editorCommon.IRawText):void {
		super._constructLines(rawText);
		// Force EOL to be \n
		this._EOL = '\n';
	}

	public onEvents(events:ICompatMirrorModelEvents) : void {
		let changed = false;
		for (let i = 0, len = events.contentChanged.length; i < len; i++) {
			let contentChangedEvent = events.contentChanged[i];

			this._setVersionId(contentChangedEvent.versionId);
			switch (contentChangedEvent.changeType) {
				case editorCommon.EventType.ModelRawContentChangedFlush:
					this._onLinesFlushed(<editorCommon.IModelContentChangedFlushEvent>contentChangedEvent);
					changed = true;
					break;

				case editorCommon.EventType.ModelRawContentChangedLinesDeleted:
					this._onLinesDeleted(<editorCommon.IModelContentChangedLinesDeletedEvent>contentChangedEvent);
					changed = true;
					break;

				case editorCommon.EventType.ModelRawContentChangedLinesInserted:
					this._onLinesInserted(<editorCommon.IModelContentChangedLinesInsertedEvent>contentChangedEvent);
					changed = true;
					break;

				case editorCommon.EventType.ModelRawContentChangedLineChanged:
					this._onLineChanged(<editorCommon.IModelContentChangedLineChangedEvent>contentChangedEvent);
					changed = true;
					break;
			}
		}

		if (changed) {
			this.emit('changed', {});
		}
	}

	private _onLinesFlushed(e:editorCommon.IModelContentChangedFlushEvent): void {
		// Flush my lines
		this._constructLines(e.detail);
		this._resetTokenizationState();
	}

	private _onLineChanged(e:editorCommon.IModelContentChangedLineChangedEvent) : void {
		this._lines[e.lineNumber - 1].applyEdits({}, [{
			startColumn: 1,
			endColumn: Number.MAX_VALUE,
			text: e.detail,
			forceMoveMarkers: false
		}], NO_TAB_SIZE);
		if (this._lineStarts) {
			// update prefix sum
			this._lineStarts.changeValue(e.lineNumber - 1, this._lines[e.lineNumber - 1].text.length + this._EOL.length);
		}

		this._invalidateLine(e.lineNumber - 1);
	}

	private _onLinesDeleted(e:editorCommon.IModelContentChangedLinesDeletedEvent) : void {
		var fromLineIndex = e.fromLineNumber - 1,
			toLineIndex = e.toLineNumber - 1;

		// Save first line's state
		var firstLineState = this._lines[fromLineIndex].getState();

		this._lines.splice(fromLineIndex, toLineIndex - fromLineIndex + 1);
		if (this._lineStarts) {
			// update prefix sum
			this._lineStarts.removeValues(fromLineIndex, toLineIndex - fromLineIndex + 1);
		}

		if (fromLineIndex < this._lines.length) {
			// This check is always true in real world, but the tests forced this

			// Restore first line's state
			this._lines[fromLineIndex].setState(firstLineState);

			// Invalidate line
			this._invalidateLine(fromLineIndex);
		}
	}

	private _onLinesInserted(e:editorCommon.IModelContentChangedLinesInsertedEvent) : void {
		var lineIndex:number,
			i:number,
			splitLines = e.detail.split('\n');

		let newLengths:number[] = [];
		for (lineIndex = e.fromLineNumber - 1, i = 0; lineIndex < e.toLineNumber; lineIndex++, i++) {
			this._lines.splice(lineIndex, 0, new ModelLine(0, splitLines[i], NO_TAB_SIZE));
			newLengths.push(splitLines[i].length + this._EOL.length);
		}
		if (this._lineStarts) {
			// update prefix sum
			this._lineStarts.insertValues(e.fromLineNumber - 1, newLengths);
		}

		if (e.fromLineNumber >= 2) {
			// This check is always true in real world, but the tests forced this
			this._invalidateLine(e.fromLineNumber - 2);
		}
	}
}
