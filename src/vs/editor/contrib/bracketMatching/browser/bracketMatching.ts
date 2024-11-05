/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import './bracketMatching.css';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorAction, EditorContributionInstantiation, registerEditorAction, registerEditorContribution, ServicesAccessor } from '../../../browser/editorExtensions.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { Selection } from '../../../common/core/selection.js';
import { IEditorContribution, IEditorDecorationsCollection } from '../../../common/editorCommon.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { IModelDeltaDecoration, OverviewRulerLane, TrackedRangeStickiness } from '../../../common/model.js';
import { ModelDecorationOptions } from '../../../common/model/textModel.js';
import * as nls from '../../../../nls.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { registerColor } from '../../../../platform/theme/common/colorRegistry.js';
import { themeColorFromId } from '../../../../platform/theme/common/themeService.js';

const overviewRulerBracketMatchForeground = registerColor('editorOverviewRuler.bracketMatchForeground', '#A0A0A0', nls.localize('overviewRulerBracketMatchForeground', 'Overview ruler marker color for matching brackets.'));

class JumpToBracketAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.jumpToBracket',
			label: nls.localize('smartSelect.jumpBracket', "Go to Bracket"),
			alias: 'Go to Bracket',
			precondition: undefined,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Backslash,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		BracketMatchingController.get(editor)?.jumpToBracket();
	}
}

class SelectToBracketAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.selectToBracket',
			label: nls.localize('smartSelect.selectToBracket', "Select to Bracket"),
			alias: 'Select to Bracket',
			precondition: undefined,
			metadata: {
				description: nls.localize2('smartSelect.selectToBracketDescription', "Select the text inside and including the brackets or curly braces"),
				args: [{
					name: 'args',
					schema: {
						type: 'object',
						properties: {
							'selectBrackets': {
								type: 'boolean',
								default: true
							}
						},
					}
				}]
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor, args: any): void {
		let selectBrackets = true;
		if (args && args.selectBrackets === false) {
			selectBrackets = false;
		}
		BracketMatchingController.get(editor)?.selectToBracket(selectBrackets);
	}
}
class RemoveBracketsAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.removeBrackets',
			label: nls.localize('smartSelect.removeBrackets', "Remove Brackets"),
			alias: 'Remove Brackets',
			precondition: undefined,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Backspace,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		BracketMatchingController.get(editor)?.removeBrackets(this.id);
	}
}

type Brackets = [Range, Range];

class BracketsData {
	public readonly position: Position;
	public readonly brackets: Brackets | null;
	public readonly options: ModelDecorationOptions;

	constructor(position: Position, brackets: Brackets | null, options: ModelDecorationOptions) {
		this.position = position;
		this.brackets = brackets;
		this.options = options;
	}
}

export class BracketMatchingController extends Disposable implements IEditorContribution {
	public static readonly ID = 'editor.contrib.bracketMatchingController';

	public static get(editor: ICodeEditor): BracketMatchingController | null {
		return editor.getContribution<BracketMatchingController>(BracketMatchingController.ID);
	}

	private readonly _editor: ICodeEditor;

	private _lastBracketsData: BracketsData[];
	private _lastVersionId: number;
	private readonly _decorations: IEditorDecorationsCollection;
	private readonly _updateBracketsSoon: RunOnceScheduler;
	private _matchBrackets: 'never' | 'near' | 'always';

	constructor(
		editor: ICodeEditor
	) {
		super();
		this._editor = editor;
		this._lastBracketsData = [];
		this._lastVersionId = 0;
		this._decorations = this._editor.createDecorationsCollection();
		this._updateBracketsSoon = this._register(new RunOnceScheduler(() => this._updateBrackets(), 50));
		this._matchBrackets = this._editor.getOption(EditorOption.matchBrackets);

		this._updateBracketsSoon.schedule();
		this._register(editor.onDidChangeCursorPosition((e) => {

			if (this._matchBrackets === 'never') {
				// Early exit if nothing needs to be done!
				// Leave some form of early exit check here if you wish to continue being a cursor position change listener ;)
				return;
			}

			this._updateBracketsSoon.schedule();
		}));
		this._register(editor.onDidChangeModelContent((e) => {
			this._updateBracketsSoon.schedule();
		}));
		this._register(editor.onDidChangeModel((e) => {
			this._lastBracketsData = [];
			this._updateBracketsSoon.schedule();
		}));
		this._register(editor.onDidChangeModelLanguageConfiguration((e) => {
			this._lastBracketsData = [];
			this._updateBracketsSoon.schedule();
		}));
		this._register(editor.onDidChangeConfiguration((e) => {
			if (e.hasChanged(EditorOption.matchBrackets)) {
				this._matchBrackets = this._editor.getOption(EditorOption.matchBrackets);
				this._decorations.clear();
				this._lastBracketsData = [];
				this._lastVersionId = 0;
				this._updateBracketsSoon.schedule();
			}
		}));

		this._register(editor.onDidBlurEditorWidget(() => {
			this._updateBracketsSoon.schedule();
		}));

		this._register(editor.onDidFocusEditorWidget(() => {
			this._updateBracketsSoon.schedule();
		}));
	}

	public jumpToBracket(): void {
		if (!this._editor.hasModel()) {
			return;
		}

		const model = this._editor.getModel();
		const newSelections = this._editor.getSelections().map(selection => {
			const position = selection.getStartPosition();

			// find matching brackets if position is on a bracket
			const brackets = model.bracketPairs.matchBracket(position);
			let newCursorPosition: Position | null = null;
			if (brackets) {
				if (brackets[0].containsPosition(position) && !brackets[1].containsPosition(position)) {
					newCursorPosition = brackets[1].getStartPosition();
				} else if (brackets[1].containsPosition(position)) {
					newCursorPosition = brackets[0].getStartPosition();
				}
			} else {
				// find the enclosing brackets if the position isn't on a matching bracket
				const enclosingBrackets = model.bracketPairs.findEnclosingBrackets(position);
				if (enclosingBrackets) {
					newCursorPosition = enclosingBrackets[1].getStartPosition();
				} else {
					// no enclosing brackets, try the very first next bracket
					const nextBracket = model.bracketPairs.findNextBracket(position);
					if (nextBracket && nextBracket.range) {
						newCursorPosition = nextBracket.range.getStartPosition();
					}
				}
			}

			if (newCursorPosition) {
				return new Selection(newCursorPosition.lineNumber, newCursorPosition.column, newCursorPosition.lineNumber, newCursorPosition.column);
			}
			return new Selection(position.lineNumber, position.column, position.lineNumber, position.column);
		});

		this._editor.setSelections(newSelections);
		this._editor.revealRange(newSelections[0]);
	}

	public selectToBracket(selectBrackets: boolean): void {
		if (!this._editor.hasModel()) {
			return;
		}

		const model = this._editor.getModel();
		const newSelections: Selection[] = [];

		this._editor.getSelections().forEach(selection => {
			const position = selection.getStartPosition();
			let brackets = model.bracketPairs.matchBracket(position);

			if (!brackets) {
				brackets = model.bracketPairs.findEnclosingBrackets(position);
				if (!brackets) {
					const nextBracket = model.bracketPairs.findNextBracket(position);
					if (nextBracket && nextBracket.range) {
						brackets = model.bracketPairs.matchBracket(nextBracket.range.getStartPosition());
					}
				}
			}

			let selectFrom: Position | null = null;
			let selectTo: Position | null = null;

			if (brackets) {
				brackets.sort(Range.compareRangesUsingStarts);
				const [open, close] = brackets;
				selectFrom = selectBrackets ? open.getStartPosition() : open.getEndPosition();
				selectTo = selectBrackets ? close.getEndPosition() : close.getStartPosition();

				if (close.containsPosition(position)) {
					// select backwards if the cursor was on the closing bracket
					const tmp = selectFrom;
					selectFrom = selectTo;
					selectTo = tmp;
				}
			}

			if (selectFrom && selectTo) {
				newSelections.push(new Selection(selectFrom.lineNumber, selectFrom.column, selectTo.lineNumber, selectTo.column));
			}
		});

		if (newSelections.length > 0) {
			this._editor.setSelections(newSelections);
			this._editor.revealRange(newSelections[0]);
		}
	}
	public removeBrackets(editSource?: string): void {
		if (!this._editor.hasModel()) {
			return;
		}

		const model = this._editor.getModel();
		this._editor.getSelections().forEach((selection) => {
			const position = selection.getPosition();

			let brackets = model.bracketPairs.matchBracket(position);
			if (!brackets) {
				brackets = model.bracketPairs.findEnclosingBrackets(position);
			}
			if (brackets) {
				this._editor.pushUndoStop();
				this._editor.executeEdits(
					editSource,
					[
						{ range: brackets[0], text: '' },
						{ range: brackets[1], text: '' }
					]
				);
				this._editor.pushUndoStop();
			}
		});
	}

	private static readonly _DECORATION_OPTIONS_WITH_OVERVIEW_RULER = ModelDecorationOptions.register({
		description: 'bracket-match-overview',
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		className: 'bracket-match',
		overviewRuler: {
			color: themeColorFromId(overviewRulerBracketMatchForeground),
			position: OverviewRulerLane.Center
		}
	});

	private static readonly _DECORATION_OPTIONS_WITHOUT_OVERVIEW_RULER = ModelDecorationOptions.register({
		description: 'bracket-match-no-overview',
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		className: 'bracket-match'
	});

	private _updateBrackets(): void {
		if (this._matchBrackets === 'never') {
			return;
		}
		this._recomputeBrackets();

		const newDecorations: IModelDeltaDecoration[] = [];
		let newDecorationsLen = 0;
		for (const bracketData of this._lastBracketsData) {
			const brackets = bracketData.brackets;
			if (brackets) {
				newDecorations[newDecorationsLen++] = { range: brackets[0], options: bracketData.options };
				newDecorations[newDecorationsLen++] = { range: brackets[1], options: bracketData.options };
			}
		}

		this._decorations.set(newDecorations);
	}

	private _recomputeBrackets(): void {
		if (!this._editor.hasModel() || !this._editor.hasWidgetFocus()) {
			// no model or no focus => no brackets!
			this._lastBracketsData = [];
			this._lastVersionId = 0;
			return;
		}

		const selections = this._editor.getSelections();
		if (selections.length > 100) {
			// no bracket matching for high numbers of selections
			this._lastBracketsData = [];
			this._lastVersionId = 0;
			return;
		}

		const model = this._editor.getModel();
		const versionId = model.getVersionId();
		let previousData: BracketsData[] = [];
		if (this._lastVersionId === versionId) {
			// use the previous data only if the model is at the same version id
			previousData = this._lastBracketsData;
		}

		const positions: Position[] = [];
		let positionsLen = 0;
		for (let i = 0, len = selections.length; i < len; i++) {
			const selection = selections[i];

			if (selection.isEmpty()) {
				// will bracket match a cursor only if the selection is collapsed
				positions[positionsLen++] = selection.getStartPosition();
			}
		}

		// sort positions for `previousData` cache hits
		if (positions.length > 1) {
			positions.sort(Position.compare);
		}

		const newData: BracketsData[] = [];
		let newDataLen = 0;
		let previousIndex = 0;
		const previousLen = previousData.length;
		for (let i = 0, len = positions.length; i < len; i++) {
			const position = positions[i];

			while (previousIndex < previousLen && previousData[previousIndex].position.isBefore(position)) {
				previousIndex++;
			}

			if (previousIndex < previousLen && previousData[previousIndex].position.equals(position)) {
				newData[newDataLen++] = previousData[previousIndex];
			} else {
				let brackets = model.bracketPairs.matchBracket(position, 20 /* give at most 20ms to compute */);
				let options = BracketMatchingController._DECORATION_OPTIONS_WITH_OVERVIEW_RULER;
				if (!brackets && this._matchBrackets === 'always') {
					brackets = model.bracketPairs.findEnclosingBrackets(position, 20 /* give at most 20ms to compute */);
					options = BracketMatchingController._DECORATION_OPTIONS_WITHOUT_OVERVIEW_RULER;
				}
				newData[newDataLen++] = new BracketsData(position, brackets, options);
			}
		}

		this._lastBracketsData = newData;
		this._lastVersionId = versionId;
	}
}

registerEditorContribution(BracketMatchingController.ID, BracketMatchingController, EditorContributionInstantiation.AfterFirstRender);
registerEditorAction(SelectToBracketAction);
registerEditorAction(JumpToBracketAction);
registerEditorAction(RemoveBracketsAction);

// Go to menu
MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
	group: '5_infile_nav',
	command: {
		id: 'editor.action.jumpToBracket',
		title: nls.localize({ key: 'miGoToBracket', comment: ['&& denotes a mnemonic'] }, "Go to &&Bracket")
	},
	order: 2
});
