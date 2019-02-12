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
import { ICodeInsetSymbol } from 'vs/editor/common/modes';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { URI } from 'vs/base/common/uri';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WebviewElement } from 'vs/workbench/parts/webview/electron-browser/webviewElement';
import { IPartService, Parts } from 'vs/workbench/services/part/common/partService';


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
	private _webview: WebviewElement | undefined;

	constructor(
		data: ICodeInsetData[], // all the insets on the same line (often just one)
		editor: editorBrowser.ICodeEditor,
		private readonly _instantiationService: IInstantiationService,
		private readonly _partService: IPartService,
		helper: CodeInsetHelper,
		commandService: ICommandService,
		notificationService: INotificationService,
		private textModelResolverService: ITextModelService,
		updateCallabck: Function
	) {
		this._editor = editor;
		this._data = data;
		this._decorationIds = new Array<string>(this._data.length);

		let range: Range;
		this._data.forEach((codeInsetData, i) => {

			helper.addDecoration({
				range: codeInsetData.symbol.range,
				options: ModelDecorationOptions.EMPTY
			}, id => this._decorationIds[i] = id);

			// the range contains all insets on this line
			if (!range) {
				range = Range.lift(codeInsetData.symbol.range);
			} else {
				range = Range.plusRange(range, codeInsetData.symbol.range);
			}
		});
		this.createEmbeddedWebView(range.endLineNumber);
	}

	dispose(helper: CodeInsetHelper, viewZoneChangeAccessor: editorBrowser.IViewZoneChangeAccessor): void {
		while (this._decorationIds.length) {
			helper.removeDecoration(this._decorationIds.pop());
		}
		if (viewZoneChangeAccessor) {
			viewZoneChangeAccessor.removeZone(this._viewZoneId);
		}
	}

	private createWebview(parent: HTMLElement): WebviewElement {
		if (!this._webview) {
			this._webview = this._instantiationService.createInstance(WebviewElement,
				this._partService.getContainer(Parts.EDITOR_PART),
				{
					allowScripts: true,
					allowSvgs: true,
					useSameOriginForRoot: true,
					disableFindView: true,
					enableWrappedPostMessage: true
				});
			this._webview.mountTo(parent);
		}
		return this._webview;
	}

	isValid(): boolean {
		return this._decorationIds.some((id, i) => {
			const range = this._editor.getModel().getDecorationRange(id);
			const symbol = this._data[i].symbol;
			return range && Range.isEmpty(symbol.range) === range.isEmpty();
		});
	}

	updateCodeInsetSymbols(data: ICodeInsetData[], helper: CodeInsetHelper): void {
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

	computeIfNecessary(model: ITextModel): ICodeInsetData[] {
		// Read editor current state
		for (let i = 0; i < this._decorationIds.length; i++) {
			this._data[i].symbol.range = model.getDecorationRange(this._decorationIds[i]);
		}
		return this._data;
	}

	getLineNumber(): number {
		const range = this._editor.getModel().getDecorationRange(this._decorationIds[0]);
		if (range) {
			return range.startLineNumber;
		}
		return -1;
	}

	updateInsets(insets: ICodeInsetSymbol[]) {
		if (this.isValid()) {
			insets.forEach(inset => {
				this.createViewZones(inset);
			});
		}
	}

	private createViewZones(inset: ICodeInsetSymbol) {
		let uri = inset.uri;
		if (!URI.isUri(uri)) {
			uri = URI.revive(uri);
		}
		this.textModelResolverService.createModelReference(uri).then(ref => {
			const model = ref.object.textEditorModel;
			const html = model.getLinesContent().join('\n');
			this._webview.contents = html;
		}).catch(err => {
			this._webview.contents = `<html><body><p><b>Unable to load ${uri}</b></p><p>${err}</p></body></html>`;
		});
	}

	private createEmbeddedWebView(lineNumber: number) {
		this._editor.changeViewZones(accessor => {
			if (this._viewZoneId) {
				this._webview.dispose();
				accessor.removeZone(this._viewZoneId);
			}
			const div = document.createElement('div');
			this._webview = this.createWebview(div);
			this._webview.contents = '<html><head></head><body><div>...</div></body></html>';
			this._webview.onMessage((e: { type: string, payload: any }) => {
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
	}

	reposition(viewZoneChangeAccessor: editorBrowser.IViewZoneChangeAccessor): void {
		if (this.isValid()) {
			const range = this._editor.getModel().getDecorationRange(this._decorationIds[0]);
			this._viewZone.afterLineNumber = range.endLineNumber;
			viewZoneChangeAccessor.layoutZone(this._viewZoneId);
		}
	}
}
