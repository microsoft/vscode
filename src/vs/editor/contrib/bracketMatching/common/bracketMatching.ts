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
import { Selection } from 'vs/editor/common/core/selection';
import { RunOnceScheduler } from 'vs/base/common/async';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { editorAction, commonEditorContribution, ServicesAccessor, EditorAction } from 'vs/editor/common/editorCommonExtensions';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { editorBracketMatchBackground, editorBracketMatchBorder } from 'vs/editor/common/view/editorColorRegistry';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModelWithDecorations';

@editorAction
class SelectBracketAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.jumpToBracket',
			label: nls.localize('smartSelect.jumpBracket', "Go to Bracket"),
			alias: 'Go to Bracket',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
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
	private _matchBrackets: boolean;

	constructor(
		editor: editorCommon.ICommonCodeEditor
	) {
		super();
		this._editor = editor;
		this._lastBracketsData = [];
		this._lastVersionId = 0;
		this._decorations = [];
		this._updateBracketsSoon = this._register(new RunOnceScheduler(() => this._updateBrackets(), 50));
		this._matchBrackets = this._editor.getConfiguration().contribInfo.matchBrackets;

		this._updateBracketsSoon.schedule();
		this._register(editor.onDidChangeCursorPosition((e) => {

			if (!this._matchBrackets) {
				// Early exit if nothing needs to be done!
				// Leave some form of early exit check here if you wish to continue being a cursor position change listener ;)
				return;
			}

			this._updateBracketsSoon.schedule();
		}));
		this._register(editor.onDidChangeModel((e) => { this._decorations = []; this._updateBracketsSoon.schedule(); }));
		this._register(editor.onDidChangeConfiguration((e) => {
			this._matchBrackets = this._editor.getConfiguration().contribInfo.matchBrackets;
			if (!this._matchBrackets && this._decorations.length > 0) {
				// Remove existing decorations if bracket matching is off
				this._decorations = this._editor.deltaDecorations(this._decorations, []);
			}
			this._updateBracketsSoon.schedule();
		}));
	}

	public getId(): string {
		return BracketMatchingController.ID;
	}

	public jumpToBracket(): void {
		const model = this._editor.getModel();
		if (!model) {
			return;
		}

		let newSelections = this._editor.getSelections().map(selection => {
			const position = selection.getStartPosition();

			// find matching brackets if position is on a bracket
			const brackets = model.matchBracket(position);
			let newCursorPosition: Position = null;
			if (brackets) {
				if (brackets[0].containsPosition(position)) {
					newCursorPosition = brackets[1].getStartPosition();
				} else if (brackets[1].containsPosition(position)) {
					newCursorPosition = brackets[0].getStartPosition();
				}
			} else {
				// find the next bracket if the position isn't on a matching bracket
				const nextBracket = model.findNextBracket(position);
				if (nextBracket && nextBracket.range) {
					newCursorPosition = nextBracket.range.getStartPosition();
				}
			}

			if (newCursorPosition) {
				return new Selection(newCursorPosition.lineNumber, newCursorPosition.column, newCursorPosition.lineNumber, newCursorPosition.column);
			}
			return new Selection(position.lineNumber, position.column, position.lineNumber, position.column);
		});

		this._editor.setSelections(newSelections);
	}

	private static _DECORATION_OPTIONS = ModelDecorationOptions.register({
		stickiness: editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		className: 'bracket-match'
	});

	private _updateBrackets(): void {
		if (!this._matchBrackets) {
			return;
		}
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

registerThemingParticipant((theme, collector) => {
	let bracketMatchBackground = theme.getColor(editorBracketMatchBackground);
	if (bracketMatchBackground) {
		collector.addRule(`.monaco-editor .bracket-match { background-color: ${bracketMatchBackground}; }`);
	}
	let bracketMatchBorder = theme.getColor(editorBracketMatchBorder);
	if (bracketMatchBorder) {
		collector.addRule(`.monaco-editor .bracket-match { border: 1px solid ${bracketMatchBorder}; }`);
	}
});
