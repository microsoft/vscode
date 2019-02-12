/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./codeInsetWidget';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { Range } from 'vs/editor/common/core/range';
import * as editorBrowser from 'vs/editor/browser/editorBrowser';
import { ICodeInsetData } from './codeInset';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { IModelDeltaDecoration, IModelDecorationsChangeAccessor, ITextModel } from 'vs/editor/common/model';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { WebviewEditorInput } from 'vs/workbench/contrib/webview/electron-browser/webviewEditorInput';
import { MainThreadWebviews } from 'vs/workbench/api/electron-browser/mainThreadWebview';
import { UriComponents } from 'vs/base/common/uri';


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
	private _viewZone: editorBrowser.IViewZone;
	private _viewZoneId?: number = undefined;
	private _decorationIds: string[];
	private _data: ICodeInsetData[];
	private _webview: WebviewEditorInput | undefined;
	private _webviewHandle: string | undefined;
	private _range: Range;

	constructor(
		data: ICodeInsetData[], // all the insets on the same line (often just one)
		editor: editorBrowser.ICodeEditor,
		helper: CodeInsetHelper,
		commandService: ICommandService,
		notificationService: INotificationService,
		updateCallabck: Function
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
		console.log('DISPOSE');
		while (this._decorationIds.length) {
			helper.removeDecoration(this._decorationIds.pop());
		}
		if (viewZoneChangeAccessor) {
			viewZoneChangeAccessor.removeZone(this._viewZoneId);
			this._viewZone = undefined;
		}
	}

	public isValid(): boolean {
		return this._decorationIds.some((id, i) => {
			const range = this._editor.getModel().getDecorationRange(id);
			const symbol = this._data[i].symbol;
			return range && Range.isEmpty(symbol.range) === range.isEmpty();
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

	public get webview() { return this._webview; }

	static webviewPool = 1;

	public createWebview(mainThreadWebviews: MainThreadWebviews, extensionLocation: UriComponents) {
		if (this._webviewHandle) { return this._webviewHandle; }

		const lineNumber = this._range.endLineNumber;
		this._editor.changeViewZones(accessor => {
			if (this._viewZoneId) {
				this._webview.dispose();
				accessor.removeZone(this._viewZoneId);
			}
			const div = document.createElement('div');

			this._webviewHandle = CodeInsetWidget.webviewPool++ + '';
			this._webview = mainThreadWebviews.createInsetWebview(this._webviewHandle, div, { enableScripts: true }, extensionLocation);

			const webview = this._webview.webview;
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
		});
		return this._webviewHandle;
	}

	public reposition(viewZoneChangeAccessor: editorBrowser.IViewZoneChangeAccessor): void {
		if (this.isValid() && this._editor.hasModel()) {
			const range = this._editor.getModel().getDecorationRange(this._decorationIds[0]);
			this._viewZone.afterLineNumber = range.endLineNumber;
			viewZoneChangeAccessor.layoutZone(this._viewZoneId);
		}
	}
}
