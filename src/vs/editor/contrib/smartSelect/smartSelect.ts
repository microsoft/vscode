/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as arrays from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, IActionOptions, registerEditorAction, registerEditorContribution, ServicesAccessor, registerDefaultLanguageCommand } from 'vs/editor/browser/editorExtensions';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { ITextModel } from 'vs/editor/common/model';
import * as modes from 'vs/editor/common/modes';
import * as nls from 'vs/nls';
import { MenuId } from 'vs/platform/actions/common/actions';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { WordSelectionRangeProvider } from 'vs/editor/contrib/smartSelect/wordSelections';
import { BracketSelectionRangeProvider } from 'vs/editor/contrib/smartSelect/bracketSelections';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';

class SelectionRanges {

	constructor(
		readonly index: number,
		readonly ranges: Range[]
	) { }

	mov(fwd: boolean): SelectionRanges {
		let index = this.index + (fwd ? 1 : -1);
		if (index < 0 || index >= this.ranges.length) {
			return this;
		}
		const res = new SelectionRanges(index, this.ranges);
		if (res.ranges[index].equalsRange(this.ranges[this.index])) {
			// next range equals this range, retry with next-next
			return res.mov(fwd);
		}
		return res;
	}
}

class SmartSelectController implements IEditorContribution {

	private static readonly _id = 'editor.contrib.smartSelectController';

	static get(editor: ICodeEditor): SmartSelectController {
		return editor.getContribution<SmartSelectController>(SmartSelectController._id);
	}

	private readonly _editor: ICodeEditor;

	private _state?: SelectionRanges[];
	private _selectionListener?: IDisposable;
	private _ignoreSelection: boolean = false;

	constructor(editor: ICodeEditor) {
		this._editor = editor;
	}

	dispose(): void {
		dispose(this._selectionListener);
	}

	getId(): string {
		return SmartSelectController._id;
	}

	run(forward: boolean): Promise<void> | void {
		if (!this._editor.hasModel()) {
			return;
		}

		const selections = this._editor.getSelections();
		const model = this._editor.getModel();

		if (!modes.SelectionRangeRegistry.has(model)) {
			return;
		}


		let promise: Promise<void> = Promise.resolve(undefined);

		if (!this._state) {
			promise = provideSelectionRangesN(model, selections.map(s => s.getPosition()), CancellationToken.None).then(ranges => {
				if (!arrays.isNonEmptyArray(ranges) || ranges.length !== selections.length) {
					// invalid result
					return;
				}
				if (!this._editor.hasModel() || !arrays.equals(this._editor.getSelections(), selections, (a, b) => a.equalsSelection(b))) {
					// invalid editor state
					return;
				}

				for (let i = 0; i < ranges.length; i++) {
					ranges[i] = ranges[i].filter(range => {
						// filter ranges inside the selection
						return range.containsPosition(selections[i].getStartPosition()) && range.containsPosition(selections[i].getEndPosition());
					});
					// prepend current selection
					ranges[i].unshift(selections[i]);
				}


				this._state = ranges.map(ranges => new SelectionRanges(0, ranges));

				// listen to caret move and forget about state
				dispose(this._selectionListener);
				this._selectionListener = this._editor.onDidChangeCursorPosition(() => {
					if (!this._ignoreSelection) {
						dispose(this._selectionListener);
						this._state = undefined;
					}
				});
			});
		}

		return promise.then(() => {
			if (!this._state) {
				// no state
				return;
			}
			this._state = this._state.map(state => state.mov(forward));
			const selections = this._state.map(state => Selection.fromPositions(state.ranges[state.index].getStartPosition(), state.ranges[state.index].getEndPosition()));
			this._ignoreSelection = true;
			try {
				this._editor.setSelections(selections);
			} finally {
				this._ignoreSelection = false;
			}

		});
	}
}

abstract class AbstractSmartSelect extends EditorAction {

	private readonly _forward: boolean;

	constructor(forward: boolean, opts: IActionOptions) {
		super(opts);
		this._forward = forward;
	}

	async run(_accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		let controller = SmartSelectController.get(editor);
		if (controller) {
			await controller.run(this._forward);
		}
	}
}

class GrowSelectionAction extends AbstractSmartSelect {
	constructor() {
		super(true, {
			id: 'editor.action.smartSelect.expand',
			label: nls.localize('smartSelect.expand', "Expand Selection"),
			alias: 'Expand Selection',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.RightArrow,
				mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyMod.Shift | KeyCode.RightArrow },
				weight: KeybindingWeight.EditorContrib
			},
			menubarOpts: {
				menuId: MenuId.MenubarSelectionMenu,
				group: '1_basic',
				title: nls.localize({ key: 'miSmartSelectGrow', comment: ['&& denotes a mnemonic'] }, "&&Expand Selection"),
				order: 2
			}
		});
	}
}

// renamed command id
CommandsRegistry.registerCommandAlias('editor.action.smartSelect.grow', 'editor.action.smartSelect.expand');

class ShrinkSelectionAction extends AbstractSmartSelect {
	constructor() {
		super(false, {
			id: 'editor.action.smartSelect.shrink',
			label: nls.localize('smartSelect.shrink', "Shrink Selection"),
			alias: 'Shrink Selection',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.LeftArrow,
				mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyMod.Shift | KeyCode.LeftArrow },
				weight: KeybindingWeight.EditorContrib
			},
			menubarOpts: {
				menuId: MenuId.MenubarSelectionMenu,
				group: '1_basic',
				title: nls.localize({ key: 'miSmartSelectShrink', comment: ['&& denotes a mnemonic'] }, "&&Shrink Selection"),
				order: 3
			}
		});
	}
}

registerEditorContribution(SmartSelectController);
registerEditorAction(GrowSelectionAction);
registerEditorAction(ShrinkSelectionAction);

// word selection
modes.SelectionRangeRegistry.register('*', new WordSelectionRangeProvider());

export function provideSelectionRanges(model: ITextModel, position: Position, token: CancellationToken): Promise<Range[] | undefined | null> {

	const provider = modes.SelectionRangeRegistry.orderedGroups(model);

	if (provider.length === 1) {
		// add word selection and bracket selection when no provider exists
		provider.unshift([new BracketSelectionRangeProvider()]);
	}

	interface RankedRange {
		rank: number;
		range: Range;
	}

	let work: Promise<any>[] = [];
	let ranges: RankedRange[] = [];
	let rank = 0;

	for (const group of provider) {
		rank += 1;
		for (const prov of group) {
			work.push(Promise.resolve(prov.provideSelectionRanges(model, position, token)).then(selectionRanges => {
				if (arrays.isNonEmptyArray(selectionRanges)) {
					for (const sel of selectionRanges) {
						if (Range.isIRange(sel.range) && Range.containsPosition(sel.range, position)) {
							ranges.push({ range: Range.lift(sel.range), rank });
						}
					}
				}
			}));
		}
	}

	return Promise.all(work).then(() => {

		if (ranges.length === 0) {
			return [];
		}

		ranges.sort((a, b) => {
			if (Position.isBefore(a.range.getStartPosition(), b.range.getStartPosition())) {
				return 1;
			} else if (Position.isBefore(b.range.getStartPosition(), a.range.getStartPosition())) {
				return -1;
			} else if (Position.isBefore(a.range.getEndPosition(), b.range.getEndPosition())) {
				return -1;
			} else if (Position.isBefore(b.range.getEndPosition(), a.range.getEndPosition())) {
				return 1;
			} else {
				return b.rank - a.rank;
			}
		});

		let result: Range[] = [];
		let last: Range | undefined;
		for (const { range } of ranges) {
			if (!last || (Range.containsRange(range, last) && !Range.equalsRange(range, last))) {
				result.push(range);
				last = range;
			}
		}

		let result2: Range[] = [result[0]];
		for (let i = 1; i < result.length; i++) {
			const prev = result[i - 1];
			const cur = result[i];
			if (cur.startLineNumber !== prev.startLineNumber || cur.endLineNumber !== prev.endLineNumber) {
				// add line/block range without leading/failing whitespace
				const rangeNoWhitespace = new Range(prev.startLineNumber, model.getLineFirstNonWhitespaceColumn(prev.startLineNumber), prev.endLineNumber, model.getLineLastNonWhitespaceColumn(prev.endLineNumber));
				if (rangeNoWhitespace.containsRange(prev) && !rangeNoWhitespace.equalsRange(prev)) {
					result2.push(rangeNoWhitespace);
				}
				// add line/block range
				const rangeFull = new Range(prev.startLineNumber, 1, prev.endLineNumber, model.getLineMaxColumn(prev.endLineNumber));
				if (rangeFull.containsRange(prev) && !rangeFull.equalsRange(rangeNoWhitespace)) {
					result2.push(rangeFull);
				}
			}
			result2.push(cur);
		}

		return result2;
	});
}

export function provideSelectionRangesN(model: ITextModel, position: Position[], token: CancellationToken): Promise<Range[][]> {
	return Promise.all(position.map(pos => {
		return provideSelectionRanges(model, pos, token);
	}));
}

registerDefaultLanguageCommand('_executeSelectionRangeProvider', function (model, position) {
	return provideSelectionRanges(model, position, CancellationToken.None);
});
