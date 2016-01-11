/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as EditorCommon from 'vs/editor/common/editorCommon';
import {IDisposable} from 'vs/base/common/lifecycle';

export class FindDecorations implements IDisposable {

	private _editor:EditorCommon.ICommonCodeEditor;
	private _decorations:string[];
	private _findScopeDecorationId:string;
	private _highlightedDecorationId:string;
	private _startPosition:EditorCommon.IEditorPosition;

	constructor(editor:EditorCommon.ICommonCodeEditor) {
		this._editor = editor;
		this._decorations = [];
		this._findScopeDecorationId = null;
		this._highlightedDecorationId = null;
		this._startPosition = this._editor.getPosition();
	}

	public dispose(): void {
		this._editor.deltaDecorations(this._allDecorations(), []);

		this._editor = null;
		this._decorations = [];
		this._findScopeDecorationId = null;
		this._highlightedDecorationId = null;
		this._startPosition = null;
	}

	public reset(): void {
		this._decorations = [];
		this._findScopeDecorationId = null;
		this._highlightedDecorationId = null;
	}

	public getFindScope(): EditorCommon.IEditorRange {
		if (this._findScopeDecorationId) {
			return this._editor.getModel().getDecorationRange(this._findScopeDecorationId);
		}
		return null;
	}

	public getStartPosition(): EditorCommon.IEditorPosition {
		return this._startPosition;
	}

	public setStartPosition(newStartPosition:EditorCommon.IEditorPosition): void {
		this._startPosition = newStartPosition;
		this.setCurrentFindMatch(null);
	}

	public setCurrentFindMatch(nextMatch:EditorCommon.IEditorRange): void {
		let newCurrentDecorationId: string = null;
		if (nextMatch) {
			for (let i = 0, len = this._decorations.length; i < len; i++) {
				let range = this._editor.getModel().getDecorationRange(this._decorations[i]);
				if (nextMatch.equalsRange(range)) {
					newCurrentDecorationId = this._decorations[i];
					break;
				}
			}
		}

		if (this._highlightedDecorationId !== null || newCurrentDecorationId !== null) {
			this._editor.changeDecorations((changeAccessor: EditorCommon.IModelDecorationsChangeAccessor) => {
				if (this._highlightedDecorationId !== null) {
					changeAccessor.changeDecorationOptions(this._highlightedDecorationId, FindDecorations.createFindMatchDecorationOptions(false));
					this._highlightedDecorationId = null;
				}
				if (newCurrentDecorationId !== null) {
					this._highlightedDecorationId = newCurrentDecorationId;
					changeAccessor.changeDecorationOptions(this._highlightedDecorationId, FindDecorations.createFindMatchDecorationOptions(true));
				}
			});
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
		let tmpDecorations = this._editor.deltaDecorations(this._allDecorations(), newDecorations);

		if (findScope) {
			this._findScopeDecorationId = tmpDecorations.shift();
		} else {
			this._findScopeDecorationId = null;
		}
		this._decorations = tmpDecorations;
		this._highlightedDecorationId = null;
	}

	private _allDecorations(): string[] {
		let result:string[] = [];
		result = result.concat(this._decorations);
		if (this._findScopeDecorationId) {
			result.push(this._findScopeDecorationId);
		}
		return result;
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
