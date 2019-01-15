/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./codelensWidget';
import * as dom from 'vs/base/browser/dom';
import { coalesce, isFalsyOrEmpty } from 'vs/base/common/arrays';
import { escape } from 'vs/base/common/strings';
import * as editorBrowser from 'vs/editor/browser/editorBrowser';
import { Range } from 'vs/editor/common/core/range';
import { IModelDecorationsChangeAccessor, IModelDeltaDecoration, ITextModel } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { Command, ICodeLensSymbol } from 'vs/editor/common/modes';
import { editorCodeLensForeground } from 'vs/editor/common/view/editorColorRegistry';
import { ICodeLensData } from 'vs/editor/contrib/codelens/codelens';
import { editorActiveLinkForeground } from 'vs/platform/theme/common/colorRegistry';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';

class CodeLensViewZone implements editorBrowser.IViewZone {

	readonly heightInLines: number;
	readonly suppressMouseDown: boolean;
	readonly domNode: HTMLElement;

	afterLineNumber: number;

	private _lastHeight: number;
	private _onHeight: Function;

	constructor(afterLineNumber: number, onHeight: Function) {
		this.afterLineNumber = afterLineNumber;
		this._onHeight = onHeight;

		this.heightInLines = 1;
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
}

class CodeLensContentWidget implements editorBrowser.IContentWidget {

	private static _idPool: number = 0;

	// Editor.IContentWidget.allowEditorOverflow
	readonly allowEditorOverflow: boolean = false;
	readonly suppressMouseDown: boolean = true;

	private readonly _id: string;
	private readonly _domNode: HTMLElement;
	private readonly _editor: editorBrowser.ICodeEditor;

	private _widgetPosition: editorBrowser.IContentWidgetPosition;
	private _commands: { [id: string]: Command } = Object.create(null);

	constructor(
		editor: editorBrowser.ICodeEditor,
		symbolRange: Range
	) {
		this._id = 'codeLensWidget' + (++CodeLensContentWidget._idPool);
		this._editor = editor;

		this.setSymbolRange(symbolRange);

		this._domNode = document.createElement('span');
		this._domNode.innerHTML = '&nbsp;';
		dom.addClass(this._domNode, 'codelens-decoration');
		dom.addClass(this._domNode, 'invisible-cl');
		this.updateHeight();
		this.updateVisibility();
	}

	updateHeight(): void {
		const { fontInfo, lineHeight } = this._editor.getConfiguration();
		this._domNode.style.height = `${Math.round(lineHeight * 1.1)}px`;
		this._domNode.style.lineHeight = `${lineHeight}px`;
		this._domNode.style.fontSize = `${Math.round(fontInfo.fontSize * 0.9)}px`;
		this._domNode.style.paddingRight = `${Math.round(fontInfo.fontSize * 0.45)}px`;
		this._domNode.innerHTML = '&nbsp;';
	}

	updateVisibility(): void {
		if (this.isVisible()) {
			dom.removeClass(this._domNode, 'invisible-cl');
			dom.addClass(this._domNode, 'fadein');
		}
	}

	withCommands(inSymbols: Array<ICodeLensSymbol | undefined | null>): void {
		this._commands = Object.create(null);
		const symbols = coalesce(inSymbols);
		if (isFalsyOrEmpty(symbols)) {
			this._domNode.innerHTML = 'no commands';
			return;
		}

		let html: string[] = [];
		for (let i = 0; i < symbols.length; i++) {
			const command = symbols[i].command;
			if (command) {
				const title = escape(command.title);
				let part: string;
				if (command.id) {
					part = `<a id=${i}>${title}</a>`;
					this._commands[i] = command;
				} else {
					part = `<span>${title}</span>`;
				}
				html.push(part);
			}
		}

		this._domNode.innerHTML = html.join('<span>&nbsp;|&nbsp;</span>');
		this._editor.layoutContentWidget(this);
	}

	getCommand(link: HTMLLinkElement): Command | undefined {
		return link.parentElement === this._domNode
			? this._commands[link.id]
			: undefined;
	}

	getId(): string {
		return this._id;
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	setSymbolRange(range: Range): void {
		if (!this._editor.hasModel()) {
			return;
		}
		const lineNumber = range.startLineNumber;
		const column = this._editor.getModel().getLineFirstNonWhitespaceColumn(lineNumber);
		this._widgetPosition = {
			position: { lineNumber: lineNumber, column: column },
			preference: [editorBrowser.ContentWidgetPositionPreference.ABOVE]
		};
	}

	getPosition(): editorBrowser.IContentWidgetPosition {
		return this._widgetPosition;
	}

	isVisible(): boolean {
		return this._domNode.hasAttribute('monaco-visible-content-widget');
	}
}

export interface IDecorationIdCallback {
	(decorationId: string): void;
}

export class CodeLensHelper {

	private _removeDecorations: string[];
	private _addDecorations: IModelDeltaDecoration[];
	private _addDecorationsCallbacks: IDecorationIdCallback[];

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
		let resultingDecorations = changeAccessor.deltaDecorations(this._removeDecorations, this._addDecorations);
		for (let i = 0, len = resultingDecorations.length; i < len; i++) {
			this._addDecorationsCallbacks[i](resultingDecorations[i]);
		}
	}
}

export class CodeLens {

	private readonly _editor: editorBrowser.ICodeEditor;
	private readonly _viewZone: CodeLensViewZone;
	private readonly _viewZoneId: number;
	private readonly _contentWidget: CodeLensContentWidget;
	private _decorationIds: string[];
	private _data: ICodeLensData[];

	constructor(
		data: ICodeLensData[],
		editor: editorBrowser.ICodeEditor,
		helper: CodeLensHelper,
		viewZoneChangeAccessor: editorBrowser.IViewZoneChangeAccessor,
		updateCallback: Function
	) {
		this._editor = editor;
		this._data = data;
		this._decorationIds = new Array<string>(this._data.length);

		let range: Range | undefined;
		this._data.forEach((codeLensData, i) => {

			helper.addDecoration({
				range: codeLensData.symbol.range,
				options: ModelDecorationOptions.EMPTY
			}, id => this._decorationIds[i] = id);

			// the range contains all lenses on this line
			if (!range) {
				range = Range.lift(codeLensData.symbol.range);
			} else {
				range = Range.plusRange(range, codeLensData.symbol.range);
			}
		});

		if (range) {
			this._contentWidget = new CodeLensContentWidget(editor, range);
			this._viewZone = new CodeLensViewZone(range.startLineNumber - 1, updateCallback);

			this._viewZoneId = viewZoneChangeAccessor.addZone(this._viewZone);
			this._editor.addContentWidget(this._contentWidget);
		}
	}

	dispose(helper: CodeLensHelper, viewZoneChangeAccessor?: editorBrowser.IViewZoneChangeAccessor): void {
		while (this._decorationIds.length) {
			helper.removeDecoration(this._decorationIds.pop()!);
		}
		if (viewZoneChangeAccessor) {
			viewZoneChangeAccessor.removeZone(this._viewZoneId);
		}
		this._editor.removeContentWidget(this._contentWidget);
	}

	isValid(): boolean {
		if (!this._editor.hasModel()) {
			return false;
		}
		const model = this._editor.getModel();
		return this._decorationIds.some((id, i) => {
			const range = model.getDecorationRange(id);
			const symbol = this._data[i].symbol;
			return !!(range && Range.isEmpty(symbol.range) === range.isEmpty());
		});
	}

	updateCodeLensSymbols(data: ICodeLensData[], helper: CodeLensHelper): void {
		while (this._decorationIds.length) {
			helper.removeDecoration(this._decorationIds.pop()!);
		}
		this._data = data;
		this._decorationIds = new Array<string>(this._data.length);
		this._data.forEach((codeLensData, i) => {
			helper.addDecoration({
				range: codeLensData.symbol.range,
				options: ModelDecorationOptions.EMPTY
			}, id => this._decorationIds[i] = id);
		});
	}

	computeIfNecessary(model: ITextModel): ICodeLensData[] | null {
		this._contentWidget.updateVisibility(); // trigger the fade in
		if (!this._contentWidget.isVisible()) {
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

	updateCommands(symbols: Array<ICodeLensSymbol | undefined | null>): void {
		this._contentWidget.withCommands(symbols);
	}

	updateHeight(): void {
		this._contentWidget.updateHeight();
	}

	getCommand(link: HTMLLinkElement): Command | undefined {
		return this._contentWidget.getCommand(link);
	}

	getLineNumber(): number {
		if (this._editor.hasModel()) {
			const range = this._editor.getModel().getDecorationRange(this._decorationIds[0]);
			if (range) {
				return range.startLineNumber;
			}
		}
		return -1;
	}

	update(viewZoneChangeAccessor: editorBrowser.IViewZoneChangeAccessor): void {
		if (this.isValid() && this._editor.hasModel()) {
			const range = this._editor.getModel().getDecorationRange(this._decorationIds[0]);
			if (range) {
				this._viewZone.afterLineNumber = range.startLineNumber - 1;
				viewZoneChangeAccessor.layoutZone(this._viewZoneId);

				this._contentWidget.setSymbolRange(range);
				this._editor.layoutContentWidget(this._contentWidget);
			}
		}
	}
}

registerThemingParticipant((theme, collector) => {
	const codeLensForeground = theme.getColor(editorCodeLensForeground);
	if (codeLensForeground) {
		collector.addRule(`.monaco-editor .codelens-decoration { color: ${codeLensForeground}; }`);
	}
	const activeLinkForeground = theme.getColor(editorActiveLinkForeground);
	if (activeLinkForeground) {
		collector.addRule(`.monaco-editor .codelens-decoration > a:hover { color: ${activeLinkForeground} !important; }`);
	}
});
