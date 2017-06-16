/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./codelensWidget';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import { format, escape } from 'vs/base/common/strings';
import * as dom from 'vs/base/browser/dom';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IMessageService } from 'vs/platform/message/common/message';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ICodeLensSymbol, Command } from 'vs/editor/common/modes';
import * as editorBrowser from 'vs/editor/browser/editorBrowser';
import { ICodeLensData } from './codelens';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModelWithDecorations';
import { editorCodeLensForeground } from 'vs/editor/common/view/editorColorRegistry';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { editorActiveLinkForeground } from 'vs/platform/theme/common/colorRegistry';

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
	private readonly _disposables: IDisposable[] = [];
	private readonly _editor: editorBrowser.ICodeEditor;

	private _symbolRange: Range;
	private _widgetPosition: editorBrowser.IContentWidgetPosition;
	private _commands: { [id: string]: Command } = Object.create(null);

	constructor(
		editor: editorBrowser.ICodeEditor,
		symbolRange: Range,
		commandService: ICommandService,
		messageService: IMessageService
	) {

		this._id = 'codeLensWidget' + (++CodeLensContentWidget._idPool);
		this._editor = editor;

		this.setSymbolRange(symbolRange);

		this._domNode = document.createElement('span');
		this._domNode.innerHTML = '&nbsp;';
		dom.addClass(this._domNode, 'codelens-decoration');
		dom.addClass(this._domNode, 'invisible-cl');
		this._updateHeight();

		this._disposables.push(this._editor.onDidChangeConfiguration(e => e.fontInfo && this._updateHeight()));

		this._disposables.push(dom.addDisposableListener(this._domNode, 'click', e => {
			let element = <HTMLElement>e.target;
			if (element.tagName === 'A' && element.id) {
				let command = this._commands[element.id];
				if (command) {
					editor.focus();
					commandService.executeCommand(command.id, ...command.arguments).done(undefined, err => {
						messageService.show(Severity.Error, err);
					});
				}
			}
		}));

		this.updateVisibility();
	}

	dispose(): void {
		dispose(this._disposables);
		this._symbolRange = null;
	}

	private _updateHeight(): void {
		const { fontInfo, lineHeight } = this._editor.getConfiguration();
		this._domNode.style.height = `${Math.round(lineHeight * 1.1)}px`;
		this._domNode.style.lineHeight = `${lineHeight}px`;
		this._domNode.style.fontSize = `${Math.round(fontInfo.fontSize * .9)}px`;
		this._domNode.innerHTML = '&nbsp;';
	}

	updateVisibility(): void {
		if (this.isVisible()) {
			dom.removeClass(this._domNode, 'invisible-cl');
			dom.addClass(this._domNode, 'fadein');
		}
	}

	withCommands(symbols: ICodeLensSymbol[]): void {
		this._commands = Object.create(null);
		if (!symbols || !symbols.length) {
			this._domNode.innerHTML = 'no commands';
			return;
		}

		let html: string[] = [];
		for (let i = 0; i < symbols.length; i++) {
			let command = symbols[i].command;
			let title = escape(command.title);
			let part: string;
			if (command.id) {
				part = format('<a id={0}>{1}</a>', i, title);
				this._commands[i] = command;
			} else {
				part = format('<span>{0}</span>', title);
			}
			html.push(part);
		}

		this._domNode.innerHTML = html.join('<span>&nbsp;|&nbsp;</span>');
		this._editor.layoutContentWidget(this);
	}

	getId(): string {
		return this._id;
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	setSymbolRange(range: Range): void {
		this._symbolRange = range;

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
	private _addDecorations: editorCommon.IModelDeltaDecoration[];
	private _addDecorationsCallbacks: IDecorationIdCallback[];

	constructor() {
		this._removeDecorations = [];
		this._addDecorations = [];
		this._addDecorationsCallbacks = [];
	}

	addDecoration(decoration: editorCommon.IModelDeltaDecoration, callback: IDecorationIdCallback): void {
		this._addDecorations.push(decoration);
		this._addDecorationsCallbacks.push(callback);
	}

	removeDecoration(decorationId: string): void {
		this._removeDecorations.push(decorationId);
	}

	commit(changeAccessor: editorCommon.IModelDecorationsChangeAccessor): void {
		var resultingDecorations = changeAccessor.deltaDecorations(this._removeDecorations, this._addDecorations);
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
		commandService: ICommandService, messageService: IMessageService,
		updateCallabck: Function
	) {
		this._editor = editor;
		this._data = data;
		this._decorationIds = new Array<string>(this._data.length);

		let range: Range;
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

		this._contentWidget = new CodeLensContentWidget(editor, range, commandService, messageService);
		this._viewZone = new CodeLensViewZone(range.startLineNumber - 1, updateCallabck);

		this._viewZoneId = viewZoneChangeAccessor.addZone(this._viewZone);
		this._editor.addContentWidget(this._contentWidget);
	}

	dispose(helper: CodeLensHelper, viewZoneChangeAccessor: editorBrowser.IViewZoneChangeAccessor): void {
		while (this._decorationIds.length) {
			helper.removeDecoration(this._decorationIds.pop());
		}
		if (viewZoneChangeAccessor) {
			viewZoneChangeAccessor.removeZone(this._viewZoneId);
		}
		this._editor.removeContentWidget(this._contentWidget);

		this._contentWidget.dispose();
	}

	isValid(): boolean {
		return this._decorationIds.some((id, i) => {
			const range = this._editor.getModel().getDecorationRange(id);
			const symbol = this._data[i].symbol;
			return range && Range.isEmpty(symbol.range) === range.isEmpty();
		});
	}

	updateCodeLensSymbols(data: ICodeLensData[], helper: CodeLensHelper): void {
		while (this._decorationIds.length) {
			helper.removeDecoration(this._decorationIds.pop());
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

	computeIfNecessary(model: editorCommon.IModel): ICodeLensData[] {
		this._contentWidget.updateVisibility(); // trigger the fade in
		if (!this._contentWidget.isVisible()) {
			return null;
		}

		// Read editor current state
		for (let i = 0; i < this._decorationIds.length; i++) {
			this._data[i].symbol.range = model.getDecorationRange(this._decorationIds[i]);
		}
		return this._data;
	}

	updateCommands(symbols: ICodeLensSymbol[]): void {
		this._contentWidget.withCommands(symbols);
	}

	getLineNumber(): number {
		const range = this._editor.getModel().getDecorationRange(this._decorationIds[0]);
		if (range) {
			return range.startLineNumber;
		}
		return -1;
	}

	update(viewZoneChangeAccessor: editorBrowser.IViewZoneChangeAccessor): void {
		if (this.isValid()) {
			const range = this._editor.getModel().getDecorationRange(this._decorationIds[0]);

			this._viewZone.afterLineNumber = range.startLineNumber - 1;
			viewZoneChangeAccessor.layoutZone(this._viewZoneId);

			this._contentWidget.setSymbolRange(range);
			this._editor.layoutContentWidget(this._contentWidget);
		}
	}
}

registerThemingParticipant((theme, collector) => {
	let codeLensForeground = theme.getColor(editorCodeLensForeground);
	if (codeLensForeground) {
		collector.addRule(`.monaco-editor .codelens-decoration { color: ${codeLensForeground}; }`);
	}
	let activeLinkForeground = theme.getColor(editorActiveLinkForeground);
	if (activeLinkForeground) {
		collector.addRule(`.monaco-editor .codelens-decoration > a:hover { color: ${activeLinkForeground} !important; }`);
	}
});
