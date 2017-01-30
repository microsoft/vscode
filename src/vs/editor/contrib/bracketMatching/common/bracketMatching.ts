/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Disposable } from 'vs/base/common/lifecycle';
import { Range } from 'vs/editor/common/core/range';
import { Position } from 'vs/editor/common/core/position';
import { RunOnceScheduler } from 'vs/base/common/async';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { editorAction, commonEditorContribution, ServicesAccessor, EditorAction } from 'vs/editor/common/editorCommonExtensions';

import EditorContextKeys = editorCommon.EditorContextKeys;

@editorAction
class SelectBracketAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.jumpToBracket',
			label: nls.localize('smartSelect.jumpBracket', "Go to Bracket"),
			alias: 'Go to Bracket',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.TextFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_BACKSLASH
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: editorCommon.ICommonCodeEditor): void {
		let controller = BracketMatchingController.get(editor);
		if (!controller) {
			return;
		}
		controller.jumpToBracket();
	}
}

type Brackets = [Range, Range];

class BracketsData {
	public readonly position: Position;
	public readonly brackets: Brackets;

	constructor(position: Position, brackets: Brackets) {
		this.position = position;
		this.brackets = brackets;
	}
}

@commonEditorContribution
export class BracketMatchingController extends Disposable implements editorCommon.IEditorContribution {
	private static ID = 'editor.contrib.bracketMatchingController';

	public static get(editor: editorCommon.ICommonCodeEditor): BracketMatchingController {
		return editor.getContribution<BracketMatchingController>(BracketMatchingController.ID);
	}

	private readonly _editor: editorCommon.ICommonCodeEditor;

	private _lastBracketsData: BracketsData[];
	private _lastVersionId: number;
	private _decorations: string[];
	private _updateBracketsSoon: RunOnceScheduler;

	constructor(editor: editorCommon.ICommonCodeEditor) {
		super();
		this._editor = editor;
		this._lastBracketsData = [];
		this._lastVersionId = 0;
		this._decorations = [];
		this._updateBracketsSoon = this._register(new RunOnceScheduler(() => this._updateBrackets(), 50));

		this._updateBracketsSoon.schedule();
		this._register(editor.onDidChangeCursorPosition((e) => this._updateBracketsSoon.schedule()));
		this._register(editor.onDidChangeModel((e) => { this._decorations = []; this._updateBracketsSoon.schedule(); }));
	}

	public getId(): string {
		return BracketMatchingController.ID;
	}

	public jumpToBracket(): void {
		const model = this._editor.getModel();
		if (!model) {
			return;
		}

		const selection = this._editor.getSelection();
		if (!selection.isEmpty()) {
			return;
		}

		const position = selection.getStartPosition();
		const brackets = model.matchBracket(position);
		if (!brackets) {
			return;
		}

		let resultingPosition: Position = null;
		if (brackets[0].containsPosition(position)) {
			resultingPosition = brackets[1].getStartPosition();
		} else if (brackets[1].containsPosition(position)) {
			resultingPosition = brackets[0].getStartPosition();
		}

		if (resultingPosition) {
			this._editor.setPosition(resultingPosition);
			this._editor.revealPosition(resultingPosition);
		}
	}

	private static _DECORATION_OPTIONS: editorCommon.IModelDecorationOptions = {
		stickiness: editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		className: 'bracket-match'
	};

	private _updateBrackets(): void {
		this._recomputeBrackets();

		let newDecorations: editorCommon.IModelDeltaDecoration[] = [], newDecorationsLen = 0;
		for (let i = 0, len = this._lastBracketsData.length; i < len; i++) {
			let brackets = this._lastBracketsData[i].brackets;
			if (brackets) {
				newDecorations[newDecorationsLen++] = { range: brackets[0], options: BracketMatchingController._DECORATION_OPTIONS };
				newDecorations[newDecorationsLen++] = { range: brackets[1], options: BracketMatchingController._DECORATION_OPTIONS };
			}
		}

		this._decorations = this._editor.deltaDecorations(this._decorations, newDecorations);
	}

	private _recomputeBrackets(): void {
		const model = this._editor.getModel();
		if (!model) {
			// no model => no brackets!
			this._lastBracketsData = [];
			this._lastVersionId = 0;
			return;
		}

		const versionId = model.getVersionId();
		let previousData: BracketsData[] = [];
		if (this._lastVersionId === versionId) {
			// use the previous data only if the model is at the same version id
			previousData = this._lastBracketsData;
		}

		const selections = this._editor.getSelections();

		let positions: Position[] = [], positionsLen = 0;
		for (let i = 0, len = selections.length; i < len; i++) {
			let selection = selections[i];

			if (selection.isEmpty()) {
				// will bracket match a cursor only if the selection is collapsed
				positions[positionsLen++] = selection.getStartPosition();
			}
		}

		// sort positions for `previousData` cache hits
		if (positions.length > 1) {
			positions.sort(Position.compare);
		}

		let newData: BracketsData[] = [], newDataLen = 0;
		let previousIndex = 0, previousLen = previousData.length;
		for (let i = 0, len = positions.length; i < len; i++) {
			let position = positions[i];

			while (previousIndex < previousLen && previousData[previousIndex].position.isBefore(position)) {
				previousIndex++;
			}

			if (previousIndex < previousLen && previousData[previousIndex].position.equals(position)) {
				newData[newDataLen++] = previousData[previousIndex];
			} else {
				let brackets = model.matchBracket(position);
				newData[newDataLen++] = new BracketsData(position, brackets);
			}
		}

		this._lastBracketsData = newData;
		this._lastVersionId = versionId;
	}
}
