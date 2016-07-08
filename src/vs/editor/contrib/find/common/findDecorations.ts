/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IDisposable} from 'vs/base/common/lifecycle';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {Position} from 'vs/editor/common/core/position';
import {Range} from 'vs/editor/common/core/range';

export class FindDecorations implements IDisposable {

	private _editor:editorCommon.ICommonCodeEditor;
	private _decorations:string[];
	private _findScopeDecorationId:string;
	private _lineHighlightDecorationId:string;
	private _highlightedDecorationId:string;
	private _startPosition:Position;

	constructor(editor:editorCommon.ICommonCodeEditor) {
		this._editor = editor;
		this._decorations = [];
		this._findScopeDecorationId = null;
		this._lineHighlightDecorationId = null;
		this._highlightedDecorationId = null;
		this._startPosition = this._editor.getPosition();
	}

	public dispose(): void {
		this._editor.deltaDecorations(this._allDecorations(), []);

		this._editor = null;
		this._decorations = [];
		this._findScopeDecorationId = null;
		this._lineHighlightDecorationId = null;
		this._highlightedDecorationId = null;
		this._startPosition = null;
	}

	public reset(): void {
		this._decorations = [];
		this._findScopeDecorationId = null;
		this._lineHighlightDecorationId = null;
		this._highlightedDecorationId = null;
	}

	public getCount(): number {
		return this._decorations.length;
	}

	public getFindScope(): Range {
		if (this._findScopeDecorationId) {
			return this._editor.getModel().getDecorationRange(this._findScopeDecorationId);
		}
		return null;
	}

	public getStartPosition(): Position {
		return this._startPosition;
	}

	public setStartPosition(newStartPosition:Position): void {
		this._startPosition = newStartPosition;
		this.setCurrentFindMatch(null);
	}

	public getCurrentMatchesPosition(desiredRange:Range): number {
		for (let i = 0, len = this._decorations.length; i < len; i++) {
			let range = this._editor.getModel().getDecorationRange(this._decorations[i]);
			if (desiredRange.equalsRange(range)) {
				return (i + 1);
			}
		}
		return 1;
	}

	public setCurrentFindMatch(nextMatch:Range): number {
		let newCurrentDecorationId: string = null;
		let matchPosition = 0;
		if (nextMatch) {
			for (let i = 0, len = this._decorations.length; i < len; i++) {
				let range = this._editor.getModel().getDecorationRange(this._decorations[i]);
				if (nextMatch.equalsRange(range)) {
					newCurrentDecorationId = this._decorations[i];
					matchPosition = (i + 1);
					break;
				}
			}
		}

		if (this._highlightedDecorationId !== null || newCurrentDecorationId !== null) {
			this._editor.changeDecorations((changeAccessor: editorCommon.IModelDecorationsChangeAccessor) => {
				if (this._highlightedDecorationId !== null) {
					changeAccessor.changeDecorationOptions(this._highlightedDecorationId, FindDecorations.createFindMatchDecorationOptions(false));
					this._highlightedDecorationId = null;
				}
				if (newCurrentDecorationId !== null) {
					this._highlightedDecorationId = newCurrentDecorationId;
					changeAccessor.changeDecorationOptions(this._highlightedDecorationId, FindDecorations.createFindMatchDecorationOptions(true));
				}
				if (this._lineHighlightDecorationId !== null) {
					changeAccessor.removeDecoration(this._lineHighlightDecorationId);
					this._lineHighlightDecorationId = null;
				}
				if (newCurrentDecorationId !== null) {
					let rng = this._editor.getModel().getDecorationRange(newCurrentDecorationId);
					this._lineHighlightDecorationId = changeAccessor.addDecoration(rng, FindDecorations.createLineHighlightDecoration());
				}
			});
		}

		return matchPosition;
	}

	public set(matches:Range[], findScope:Range): void {
		let newDecorations: editorCommon.IModelDeltaDecoration[] = matches.map((match) => {
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
		this._lineHighlightDecorationId = null;
		this._highlightedDecorationId = null;
	}

	private _allDecorations(): string[] {
		let result:string[] = [];
		result = result.concat(this._decorations);
		if (this._findScopeDecorationId) {
			result.push(this._findScopeDecorationId);
		}
		if (this._lineHighlightDecorationId) {
			result.push(this._lineHighlightDecorationId);
		}
		return result;
	}

	private static createFindMatchDecorationOptions(isCurrent:boolean): editorCommon.IModelDecorationOptions {
		return {
			stickiness: editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
			className: isCurrent ? 'currentFindMatch' : 'findMatch',
			overviewRuler: {
				color: 'rgba(246, 185, 77, 0.7)',
				darkColor: 'rgba(246, 185, 77, 0.7)',
				position: editorCommon.OverviewRulerLane.Center
			}
		};
	}

	private static createLineHighlightDecoration(): editorCommon.IModelDecorationOptions {
		return {
			stickiness: editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
			className: 'lineHighlight',
			isWholeLine: true
		};
	}

	private static createFindScopeDecorationOptions(): editorCommon.IModelDecorationOptions {
		return {
			className: 'findScope',
			isWholeLine: true
		};
	}
}
