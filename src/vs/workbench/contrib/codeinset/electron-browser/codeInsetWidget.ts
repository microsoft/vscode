/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./codeInsetWidget';
import { Range } from 'vs/editor/common/core/range';
import * as editorBrowser from 'vs/editor/browser/editorBrowser';
import { ICodeInsetData } from '../common/codeInset';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { IModelDeltaDecoration, IModelDecorationsChangeAccessor, ITextModel } from 'vs/editor/common/model';
import { WebviewElement } from 'vs/workbench/contrib/webview/electron-browser/webviewElement';


export interface IDecorationIdCallback {
	(decorationId: string): void;
}

export class CodeInsetHelper {

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

export class CodeInsetWidget {

	private readonly _editor: editorBrowser.ICodeEditor;
	private _webview: WebviewElement;
	private _viewZone: editorBrowser.IViewZone;
	private _viewZoneId?: number = undefined;
	private _decorationIds: string[];
	private _data: ICodeInsetData[];
	private _range: Range;

	constructor(
		data: ICodeInsetData[], // all the insets on the same line (often just one)
		editor: editorBrowser.ICodeEditor,
		helper: CodeInsetHelper
	) {
		this._editor = editor;
		this._data = data;
		this._decorationIds = new Array<string>(this._data.length);

		this._data.forEach((codeInsetData, i) => {

			helper.addDecoration({
				range: codeInsetData.symbol.range,
				options: ModelDecorationOptions.EMPTY
			}, id => this._decorationIds[i] = id);

			// the range contains all insets on this line
			if (!this._range) {
				this._range = Range.lift(codeInsetData.symbol.range);
			} else {
				this._range = Range.plusRange(this._range, codeInsetData.symbol.range);
			}
		});
	}

	public dispose(helper: CodeInsetHelper, viewZoneChangeAccessor: editorBrowser.IViewZoneChangeAccessor): void {
		while (this._decorationIds.length) {
			helper.removeDecoration(this._decorationIds.pop());
		}
		if (viewZoneChangeAccessor) {
			viewZoneChangeAccessor.removeZone(this._viewZoneId);
			this._viewZone = undefined;
		}
		if (this._webview) {
			this._webview.dispose();
		}
	}

	public isValid(): boolean {
		return this._decorationIds.some((id, i) => {
			const range = this._editor.getModel().getDecorationRange(id);
			const symbol = this._data[i].symbol;
			return !!range && Range.isEmpty(symbol.range) === range.isEmpty();
		});
	}

	public updateCodeInsetSymbols(data: ICodeInsetData[], helper: CodeInsetHelper): void {
		while (this._decorationIds.length) {
			helper.removeDecoration(this._decorationIds.pop());
		}
		this._data = data;
		this._decorationIds = new Array<string>(this._data.length);
		this._data.forEach((codeInsetData, i) => {
			helper.addDecoration({
				range: codeInsetData.symbol.range,
				options: ModelDecorationOptions.EMPTY
			}, id => this._decorationIds[i] = id);
		});
	}

	public computeIfNecessary(model: ITextModel): ICodeInsetData[] {
		// Read editor current state
		for (let i = 0; i < this._decorationIds.length; i++) {
			const range = model.getDecorationRange(this._decorationIds[i]);
			if (range) {
				this._data[i].symbol.range = range;
			}
		}
		return this._data;
	}

	public getLineNumber(): number {
		const range = this._editor.getModel().getDecorationRange(this._decorationIds[0]);
		if (range) {
			return range.startLineNumber;
		}
		return -1;
	}

	public adoptWebview(webview: WebviewElement): void {

		const lineNumber = this._range.endLineNumber;
		this._editor.changeViewZones(accessor => {

			if (this._viewZoneId) {
				accessor.removeZone(this._viewZoneId);
				this._webview.dispose();
			}

			const div = document.createElement('div');
			webview.mountTo(div);
			webview.onMessage((e: { type: string, payload: any }) => {
				// The webview contents can use a "size-info" message to report its size.
				if (e && e.type === 'size-info') {
					const margin = e.payload.height > 0 ? 5 : 0;
					this._viewZone.heightInPx = e.payload.height + margin;
					this._editor.changeViewZones(accessor => {
						accessor.layoutZone(this._viewZoneId);
					});
				}
			});
			this._viewZone = {
				afterLineNumber: lineNumber,
				heightInPx: 50,
				domNode: div
			};
			this._viewZoneId = accessor.addZone(this._viewZone);
			this._webview = webview;
		});
	}

	public reposition(viewZoneChangeAccessor: editorBrowser.IViewZoneChangeAccessor): void {
		if (this.isValid() && this._editor.hasModel()) {
			const range = this._editor.getModel().getDecorationRange(this._decorationIds[0]);
			this._viewZone.afterLineNumber = range.endLineNumber;
			viewZoneChangeAccessor.layoutZone(this._viewZoneId);
		}
	}
}
