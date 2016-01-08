/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import EditorCommon = require('vs/editor/common/editorCommon');
import Strings = require('vs/base/common/strings');
import Events = require('vs/base/common/eventEmitter');
import ReplaceAllCommand = require('./replaceAllCommand');
import Lifecycle = require('vs/base/common/lifecycle');
import Schedulers = require('vs/base/common/async');
import {Range} from 'vs/editor/common/core/range';
import {Position} from 'vs/editor/common/core/position';
import {ReplaceCommand} from 'vs/editor/common/commands/replaceCommand';

export class FindDecorations implements Lifecycle.IDisposable {
	private editor:EditorCommon.ICommonCodeEditor;

	private decorations:string[];
	private decorationIndex:number;
	private findScopeDecorationId:string;
	private highlightedDecorationId:string;
	private startPosition:EditorCommon.IEditorPosition;

	constructor(editor:EditorCommon.ICommonCodeEditor) {
		this.editor = editor;
		this.decorations = [];
		this.decorationIndex = 0;
		this.findScopeDecorationId = null;
		this.highlightedDecorationId = null;
		this.startPosition = this.editor.getPosition();
	}

	public dispose(): void {
		this.editor.deltaDecorations(this._allDecorations(), []);

		this.editor = null;
		this.decorations = [];
		this.decorationIndex = 0;
		this.findScopeDecorationId = null;
		this.highlightedDecorationId = null;
		this.startPosition = null;
	}

	public reset(): void {
		this.decorations = [];
		this.decorationIndex = -1;
		this.findScopeDecorationId = null;
		this.highlightedDecorationId = null;
	}

	public getFindScope(): EditorCommon.IEditorRange {
		if (this.findScopeDecorationId) {
			return this.editor.getModel().getDecorationRange(this.findScopeDecorationId);
		}
		return null;
	}

	public setStartPosition(newStartPosition:EditorCommon.IEditorPosition): void {
		this.startPosition = newStartPosition;
		this._setDecorationIndex(-1, false);
	}

	public hasMatches(): boolean {
		return (this.decorations.length > 0);
	}

	public getCurrentIndexRange(): EditorCommon.IEditorRange {
		if (this.decorationIndex >= 0 && this.decorationIndex < this.decorations.length) {
			return this.editor.getModel().getDecorationRange(this.decorations[this.decorationIndex]);
		}
		return null;
	}

	public setIndexToFirstAfterStartPosition(): void {
		this._setDecorationIndex(this.indexAfterPosition(this.startPosition), false);
	}

	public moveToFirstAfterStartPosition(): void {
		this._setDecorationIndex(this.indexAfterPosition(this.startPosition), true);
	}

	public movePrev(): void {
		if (!this.hasMatches()) {
			this._revealFindScope();
			return;
		}
		if (this.decorationIndex === -1) {
			this._setDecorationIndex(this.previousIndex(this.indexAfterPosition(this.startPosition)), true);
		} else {
			this._setDecorationIndex(this.previousIndex(this.decorationIndex), true);
		}
	}

	public moveNext(): void {
		if (!this.hasMatches()) {
			this._revealFindScope();
			return;
		}
		if (this.decorationIndex === -1) {
			this._setDecorationIndex(this.indexAfterPosition(this.startPosition), true);
		} else {
			this._setDecorationIndex(this.nextIndex(this.decorationIndex), true);
		}
	}

	private _revealFindScope(): void {
		let findScope = this.getFindScope();
		if (findScope) {
			// Reveal the selection so user is reminded that 'selection find' is on.
			this.editor.revealRangeInCenterIfOutsideViewport(findScope);
		}
	}

	private _setDecorationIndex(newIndex:number, moveCursor:boolean): void {
		this.decorationIndex = newIndex;
		this.editor.changeDecorations((changeAccessor: EditorCommon.IModelDecorationsChangeAccessor) => {
			if (this.highlightedDecorationId !== null) {
				changeAccessor.changeDecorationOptions(this.highlightedDecorationId, FindDecorations.createFindMatchDecorationOptions(false));
				this.highlightedDecorationId = null;
			}
			if (moveCursor && this.decorationIndex >= 0 && this.decorationIndex < this.decorations.length) {
				this.highlightedDecorationId = this.decorations[this.decorationIndex];
				changeAccessor.changeDecorationOptions(this.highlightedDecorationId, FindDecorations.createFindMatchDecorationOptions(true));
			}
		});
		if (moveCursor && this.decorationIndex >= 0 && this.decorationIndex < this.decorations.length) {
			let range = this.editor.getModel().getDecorationRange(this.decorations[this.decorationIndex]);
			this.editor.setSelection(range);
		}
	}

	public set(matches:EditorCommon.IEditorRange[], findScope:EditorCommon.IEditorRange): void {
		let newDecorations: EditorCommon.IModelDeltaDecoration[] = matches.map((match) => {
			return {
				range: match,
				options: FindDecorations.createFindMatchDecorationOptions(false)
			};
		});
		if (findScope) {
			newDecorations.unshift({
				range: findScope,
				options: FindDecorations.createFindScopeDecorationOptions()
			});
		}
		let tmpDecorations = this.editor.deltaDecorations(this._allDecorations(), newDecorations);

		if (findScope) {
			this.findScopeDecorationId = tmpDecorations.shift();
		} else {
			this.findScopeDecorationId = null;
		}
		this.decorations = tmpDecorations;
		this.decorationIndex = -1;
		this.highlightedDecorationId = null;
	}

	private _allDecorations(): string[] {
		let result:string[] = [];
		result = result.concat(this.decorations);
		if (this.findScopeDecorationId) {
			result.push(this.findScopeDecorationId);
		}
		return result;
	}

	private indexAfterPosition(position:EditorCommon.IEditorPosition): number {
		if (this.decorations.length === 0) {
			return 0;
		}
		for (let i = 0, len = this.decorations.length; i < len; i++) {
			let decorationId = this.decorations[i];
			let r = this.editor.getModel().getDecorationRange(decorationId);
			if (!r || r.startLineNumber < position.lineNumber) {
				continue;
			}
			if (r.startLineNumber > position.lineNumber) {
				return i;
			}
			if (r.startColumn < position.column) {
				continue;
			}
			return i;
		}
		return 0;
	}

	private previousIndex(index:number): number {
		if (this.decorations.length > 0) {
			return (index - 1 + this.decorations.length) % this.decorations.length;
		}
		return 0;
	}

	private nextIndex(index:number): number {
		if (this.decorations.length > 0) {
			return (index + 1) % this.decorations.length;
		}
		return 0;
	}

	private static createFindMatchDecorationOptions(isCurrent:boolean): EditorCommon.IModelDecorationOptions {
		return {
			stickiness: EditorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
			className: isCurrent ? 'currentFindMatch' : 'findMatch',
			overviewRuler: {
				color: 'rgba(246, 185, 77, 0.7)',
				darkColor: 'rgba(246, 185, 77, 0.7)',
				position: EditorCommon.OverviewRulerLane.Center
			}
		};
	}

	private static createFindScopeDecorationOptions(): EditorCommon.IModelDecorationOptions {
		return {
			className: 'findScope',
			isWholeLine: true
		};
	}
}
