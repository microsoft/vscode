/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from 'vs/editor/common/core/range';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { OutlineElement, OutlineModel, TreeElement } from 'vs/editor/contrib/documentSymbols/outlineModel';
import { localize } from 'vs/nls';
import { IEditorContribution, ScrollType } from 'vs/editor/common/editorCommon';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { EditorStateCancellationTokenSource, CodeEditorStateFlag } from 'vs/editor/browser/core/editorState';
import { EditorAction, registerEditorAction, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { forEach } from 'vs/base/common/collections';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { OutlineFilter } from 'vs/editor/contrib/documentSymbols/outlineTree';
import { binarySearch } from 'vs/base/common/arrays';

class FlatOutline {

	readonly elements: OutlineElement[] = [];
	readonly _elementPositions: IPosition[];

	constructor(model: OutlineModel, filter: OutlineFilter) {

		const walk = (element: TreeElement) => {
			if (element instanceof OutlineElement && !filter.filter(element)) {
				return;
			}
			if (element instanceof OutlineElement) {
				this.elements.push(element);
			}
			forEach(element.children, entry => walk(entry.value));
		};

		walk(model);
		this.elements.sort(FlatOutline._compare);
		this._elementPositions = this.elements.map(element => ({
			lineNumber: element.symbol.range.startLineNumber,
			column: element.symbol.range.startColumn
		}));
	}

	private static _compare(a: TreeElement, b: TreeElement): number {
		return (a instanceof OutlineElement && b instanceof OutlineElement)
			? Range.compareRangesUsingStarts(a.symbol.range, b.symbol.range)
			: 0;
	}

	find(position: IPosition, preferAfter: boolean): number {
		const idx = binarySearch(this._elementPositions, position, Position.compare);
		if (idx >= 0) {
			return idx;
		} else if (preferAfter) {
			return ~idx;
		} else {
			return ~idx - 1;
		}
	}
}

export class OutlineNavigation implements IEditorContribution {

	public static readonly ID = 'editor.contrib.OutlineNavigation';

	public static get(editor: ICodeEditor): OutlineNavigation {
		return editor.getContribution<OutlineNavigation>(OutlineNavigation.ID);
	}

	private readonly _editor: ICodeEditor;

	private _cts?: CancellationTokenSource;

	constructor(
		editor: ICodeEditor,
		@IConfigurationService private readonly _configService: IConfigurationService,
	) {
		this._editor = editor;
	}

	dispose(): void {
		if (this._cts) {
			this._cts.dispose(true);
		}
	}

	async goto(up: boolean) {

		if (this._cts) {
			this._cts.dispose(true);
		}

		if (!this._editor.hasModel()) {
			return;
		}

		const textModel = this._editor.getModel();
		const position = this._editor.getPosition();

		this._cts = new EditorStateCancellationTokenSource(this._editor, CodeEditorStateFlag.Position | CodeEditorStateFlag.Value | CodeEditorStateFlag.Scroll);

		const filter = new OutlineFilter('outline', this._configService);
		const outlineModel = await OutlineModel.create(textModel, this._cts.token);

		if (this._cts.token.isCancellationRequested) {
			return;
		}

		const symbols = new FlatOutline(outlineModel, filter);
		const idx = symbols.find(position, !up);
		const element = symbols.elements[idx];

		if (element) {
			if (Range.containsPosition(element.symbol.selectionRange, position)) {
				// at the "name" of a symbol -> move
				const nextElement = symbols.elements[idx + (up ? -1 : +1)];
				this._revealElement(nextElement);

			} else {
				// enclosing, lastBefore, or firstAfter element
				this._revealElement(element);
			}
		}
	}

	private _revealElement(element: OutlineElement | undefined): void {
		if (!element) {
			return;
		}
		const pos = Range.lift(element.symbol.selectionRange).getStartPosition();
		this._editor.setPosition(pos);
		this._editor.revealPosition(pos, ScrollType.Smooth);

		const modelNow = this._editor.getModel();
		const ids = this._editor.deltaDecorations([], [{
			range: element.symbol.selectionRange,
			options: {
				className: 'symbolHighlight',
			}
		}]);
		setTimeout(() => {
			if (modelNow === this._editor.getModel()) {
				this._editor.deltaDecorations(ids, []);
			}
		}, 350);
	}
}

registerEditorContribution(OutlineNavigation.ID, OutlineNavigation);

registerEditorAction(class extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.gotoNextSymbol',
			label: localize('label.next', "Go to Next Symbol"),
			alias: 'Go to Next Symbol',
			precondition: EditorContextKeys.hasDocumentSymbolProvider,
			kbOpts: {
				weight: KeybindingWeight.EditorContrib,
				kbExpr: EditorContextKeys.focus,
				primary: undefined,
				mac: {
					primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.DownArrow,
				},
			}
		});
	}

	run(_accessor: ServicesAccessor, editor: ICodeEditor): void | Promise<void> {
		OutlineNavigation.get(editor).goto(false);
	}
});

registerEditorAction(class extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.gotoPrevSymbol',
			label: localize('label.prev', "Go to Previous Symbol"),
			alias: 'Go to Previous Symbol',
			precondition: EditorContextKeys.hasDocumentSymbolProvider,
			kbOpts: {
				weight: KeybindingWeight.EditorContrib,
				kbExpr: EditorContextKeys.focus,
				primary: undefined,
				mac: {
					primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.UpArrow,
				},
			}
		});
	}

	run(_accessor: ServicesAccessor, editor: ICodeEditor): void | Promise<void> {
		OutlineNavigation.get(editor).goto(true);
	}
});
