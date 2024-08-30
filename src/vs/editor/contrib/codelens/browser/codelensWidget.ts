/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Constants } from '../../../../base/common/uint.js';
import './codelensWidget.css';
import { ContentWidgetPositionPreference, IActiveCodeEditor, IContentWidget, IContentWidgetPosition, IViewZone, IViewZoneChangeAccessor } from '../../../browser/editorBrowser.js';
import { Range } from '../../../common/core/range.js';
import { IModelDecorationsChangeAccessor, IModelDeltaDecoration, ITextModel } from '../../../common/model.js';
import { ModelDecorationOptions } from '../../../common/model/textModel.js';
import { CodeLens, Command } from '../../../common/languages.js';
import { CodeLensItem } from './codelens.js';

class CodeLensViewZone implements IViewZone {

	readonly suppressMouseDown: boolean;
	readonly domNode: HTMLElement;

	afterLineNumber: number;
	/**
	 * We want that this view zone, which reserves space for a code lens appears
	 * as close as possible to the next line, so we use a very large value here.
	 */
	readonly afterColumn = Constants.MAX_SAFE_SMALL_INTEGER;
	heightInPx: number;

	private _lastHeight?: number;
	private readonly _onHeight: () => void;

	constructor(afterLineNumber: number, heightInPx: number, onHeight: () => void) {
		this.afterLineNumber = afterLineNumber;
		this.heightInPx = heightInPx;

		this._onHeight = onHeight;
		this.suppressMouseDown = true;
		this.domNode = document.createElement('div');
	}

	onComputedHeight(height: number): void {
		if (this._lastHeight === undefined) {
			this._lastHeight = height;
		} else if (this._lastHeight !== height) {
			this._lastHeight = height;
			this._onHeight();
		}
	}

	isVisible(): boolean {
		return this._lastHeight !== 0
			&& this.domNode.hasAttribute('monaco-visible-view-zone');
	}
}

class CodeLensContentWidget implements IContentWidget {

	private static _idPool: number = 0;

	// Editor.IContentWidget.allowEditorOverflow
	readonly allowEditorOverflow: boolean = false;
	readonly suppressMouseDown: boolean = true;

	private readonly _id: string;
	private readonly _domNode: HTMLElement;
	private readonly _editor: IActiveCodeEditor;
	private readonly _commands = new Map<string, Command>();

	private _widgetPosition?: IContentWidgetPosition;
	private _isEmpty: boolean = true;

	constructor(
		editor: IActiveCodeEditor,
		line: number,
	) {
		this._editor = editor;
		this._id = `codelens.widget-${(CodeLensContentWidget._idPool++)}`;

		this.updatePosition(line);

		this._domNode = document.createElement('span');
		this._domNode.className = `codelens-decoration`;
	}

	withCommands(lenses: Array<CodeLens | undefined | null>, animate: boolean): void {
		this._commands.clear();

		const children: HTMLElement[] = [];
		let hasSymbol = false;
		for (let i = 0; i < lenses.length; i++) {
			const lens = lenses[i];
			if (!lens) {
				continue;
			}
			hasSymbol = true;
			if (lens.command) {
				const title = renderLabelWithIcons(lens.command.title.trim());
				if (lens.command.id) {
					const id = `c${(CodeLensContentWidget._idPool++)}`;
					children.push(dom.$('a', { id, title: lens.command.tooltip, role: 'button' }, ...title));
					this._commands.set(id, lens.command);
				} else {
					children.push(dom.$('span', { title: lens.command.tooltip }, ...title));
				}
				if (i + 1 < lenses.length) {
					children.push(dom.$('span', undefined, '\u00a0|\u00a0'));
				}
			}
		}

		if (!hasSymbol) {
			// symbols but no commands
			dom.reset(this._domNode, dom.$('span', undefined, 'no commands'));

		} else {
			// symbols and commands
			dom.reset(this._domNode, ...children);
			if (this._isEmpty && animate) {
				this._domNode.classList.add('fadein');
			}
			this._isEmpty = false;
		}
	}

	getCommand(link: HTMLLinkElement): Command | undefined {
		return link.parentElement === this._domNode
			? this._commands.get(link.id)
			: undefined;
	}

	getId(): string {
		return this._id;
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	updatePosition(line: number): void {
		const column = this._editor.getModel().getLineFirstNonWhitespaceColumn(line);
		this._widgetPosition = {
			position: { lineNumber: line, column: column },
			preference: [ContentWidgetPositionPreference.ABOVE]
		};
	}

	getPosition(): IContentWidgetPosition | null {
		return this._widgetPosition || null;
	}
}

export interface IDecorationIdCallback {
	(decorationId: string): void;
}

export class CodeLensHelper {

	private readonly _removeDecorations: string[];
	private readonly _addDecorations: IModelDeltaDecoration[];
	private readonly _addDecorationsCallbacks: IDecorationIdCallback[];

	constructor() {
		this._removeDecorations = [];
		this._addDecorations = [];
		this._addDecorationsCallbacks = [];
	}

	addDecoration(decoration: IModelDeltaDecoration, callback: IDecorationIdCallback): void {
		this._addDecorations.push(decoration);
		this._addDecorationsCallbacks.push(callback);
	}

	removeDecoration(decorationId: string): void {
		this._removeDecorations.push(decorationId);
	}

	commit(changeAccessor: IModelDecorationsChangeAccessor): void {
		const resultingDecorations = changeAccessor.deltaDecorations(this._removeDecorations, this._addDecorations);
		for (let i = 0, len = resultingDecorations.length; i < len; i++) {
			this._addDecorationsCallbacks[i](resultingDecorations[i]);
		}
	}
}

const codeLensDecorationOptions = ModelDecorationOptions.register({
	collapseOnReplaceEdit: true,
	description: 'codelens'
});

export class CodeLensWidget {

	private readonly _editor: IActiveCodeEditor;
	private readonly _viewZone: CodeLensViewZone;
	private readonly _viewZoneId: string;

	private _contentWidget?: CodeLensContentWidget;
	private _decorationIds: string[];
	private _data: CodeLensItem[];
	private _isDisposed: boolean = false;

	constructor(
		data: CodeLensItem[],
		editor: IActiveCodeEditor,
		helper: CodeLensHelper,
		viewZoneChangeAccessor: IViewZoneChangeAccessor,
		heightInPx: number,
		updateCallback: () => void
	) {
		this._editor = editor;
		this._data = data;

		// create combined range, track all ranges with decorations,
		// check if there is already something to render
		this._decorationIds = [];
		let range: Range | undefined;
		const lenses: CodeLens[] = [];

		this._data.forEach((codeLensData, i) => {

			if (codeLensData.symbol.command) {
				lenses.push(codeLensData.symbol);
			}

			helper.addDecoration({
				range: codeLensData.symbol.range,
				options: codeLensDecorationOptions
			}, id => this._decorationIds[i] = id);

			// the range contains all lenses on this line
			if (!range) {
				range = Range.lift(codeLensData.symbol.range);
			} else {
				range = Range.plusRange(range, codeLensData.symbol.range);
			}
		});

		this._viewZone = new CodeLensViewZone(range!.startLineNumber - 1, heightInPx, updateCallback);
		this._viewZoneId = viewZoneChangeAccessor.addZone(this._viewZone);

		if (lenses.length > 0) {
			this._createContentWidgetIfNecessary();
			this._contentWidget!.withCommands(lenses, false);
		}
	}

	private _createContentWidgetIfNecessary(): void {
		if (!this._contentWidget) {
			this._contentWidget = new CodeLensContentWidget(this._editor, this._viewZone.afterLineNumber + 1);
			this._editor.addContentWidget(this._contentWidget);
		} else {
			this._editor.layoutContentWidget(this._contentWidget);
		}
	}

	dispose(helper: CodeLensHelper, viewZoneChangeAccessor?: IViewZoneChangeAccessor): void {
		this._decorationIds.forEach(helper.removeDecoration, helper);
		this._decorationIds = [];
		viewZoneChangeAccessor?.removeZone(this._viewZoneId);
		if (this._contentWidget) {
			this._editor.removeContentWidget(this._contentWidget);
			this._contentWidget = undefined;
		}
		this._isDisposed = true;
	}

	isDisposed(): boolean {
		return this._isDisposed;
	}

	isValid(): boolean {
		return this._decorationIds.some((id, i) => {
			const range = this._editor.getModel().getDecorationRange(id);
			const symbol = this._data[i].symbol;
			return !!(range && Range.isEmpty(symbol.range) === range.isEmpty());
		});
	}

	updateCodeLensSymbols(data: CodeLensItem[], helper: CodeLensHelper): void {
		this._decorationIds.forEach(helper.removeDecoration, helper);
		this._decorationIds = [];
		this._data = data;
		this._data.forEach((codeLensData, i) => {
			helper.addDecoration({
				range: codeLensData.symbol.range,
				options: codeLensDecorationOptions
			}, id => this._decorationIds[i] = id);
		});
	}

	updateHeight(height: number, viewZoneChangeAccessor: IViewZoneChangeAccessor): void {
		this._viewZone.heightInPx = height;
		viewZoneChangeAccessor.layoutZone(this._viewZoneId);
		if (this._contentWidget) {
			this._editor.layoutContentWidget(this._contentWidget);
		}
	}

	computeIfNecessary(model: ITextModel): CodeLensItem[] | null {
		if (!this._viewZone.isVisible()) {
			return null;
		}

		// Read editor current state
		for (let i = 0; i < this._decorationIds.length; i++) {
			const range = model.getDecorationRange(this._decorationIds[i]);
			if (range) {
				this._data[i].symbol.range = range;
			}
		}
		return this._data;
	}

	updateCommands(symbols: Array<CodeLens | undefined | null>): void {

		this._createContentWidgetIfNecessary();
		this._contentWidget!.withCommands(symbols, true);

		for (let i = 0; i < this._data.length; i++) {
			const resolved = symbols[i];
			if (resolved) {
				const { symbol } = this._data[i];
				symbol.command = resolved.command || symbol.command;
			}
		}
	}

	getCommand(link: HTMLLinkElement): Command | undefined {
		return this._contentWidget?.getCommand(link);
	}

	getLineNumber(): number {
		const range = this._editor.getModel().getDecorationRange(this._decorationIds[0]);
		if (range) {
			return range.startLineNumber;
		}
		return -1;
	}

	update(viewZoneChangeAccessor: IViewZoneChangeAccessor): void {
		if (this.isValid()) {
			const range = this._editor.getModel().getDecorationRange(this._decorationIds[0]);
			if (range) {
				this._viewZone.afterLineNumber = range.startLineNumber - 1;
				viewZoneChangeAccessor.layoutZone(this._viewZoneId);

				if (this._contentWidget) {
					this._contentWidget.updatePosition(range.startLineNumber);
					this._editor.layoutContentWidget(this._contentWidget);
				}
			}
		}
	}

	getItems(): CodeLensItem[] {
		return this._data;
	}
}
