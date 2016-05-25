/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./outlineMarker';
import {RunOnceScheduler} from 'vs/base/common/async';
import {onUnexpectedError} from 'vs/base/common/errors';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {TPromise} from 'vs/base/common/winjs.base';
import {Range} from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {SymbolInformation, SymbolKind, DocumentSymbolProviderRegistry} from 'vs/editor/common/modes';
import {ICodeEditor, IViewZone, IViewZoneChangeAccessor} from 'vs/editor/browser/editorBrowser';
import {EditorBrowserRegistry} from 'vs/editor/browser/editorBrowserExtensions';
import {getDocumentSymbols, IOutline} from 'vs/editor/contrib/quickOpen/common/quickOpen';

class OutlineViewZone implements IViewZone {

	public afterLineNumber:number;
	public heightInPx:number;
	public suppressMouseDown:boolean;

	public domNode:HTMLElement;

	constructor(range:editorCommon.IRange, outlineType:SymbolKind) {
		this.afterLineNumber = range.startLineNumber-1;
		this.heightInPx = 4;
		this.suppressMouseDown = true;

		this.domNode = document.createElement('div');
		var hr = document.createElement('hr');
		hr.className = 'outlineRule ' + SymbolKind.from(outlineType);
		this.domNode.appendChild(hr);
	}
}

interface IDecorationIdCallback {
	(decorationId:string):void;
}

class OutlineMarkerHelper {
	private _removeDecorations:string[];
	private _addDecorations:editorCommon.IModelDeltaDecoration[];
	private _addDecorationsCallbacks:IDecorationIdCallback[];

	constructor() {
		this._removeDecorations = [];
		this._addDecorations = [];
		this._addDecorationsCallbacks = [];
	}

	public addDecoration(decoration:editorCommon.IModelDeltaDecoration, callback:IDecorationIdCallback): void {
		this._addDecorations.push(decoration);
		this._addDecorationsCallbacks.push(callback);
	}

	public removeDecoration(decorationId:string): void {
		this._removeDecorations.push(decorationId);
	}

	public commit(changeAccessor:editorCommon.IModelDecorationsChangeAccessor): void {
		var resultingDecorations = changeAccessor.deltaDecorations(this._removeDecorations, this._addDecorations);
		for (let i = 0, len = resultingDecorations.length; i < len; i++) {
			this._addDecorationsCallbacks[i](resultingDecorations[i]);
		}
	}
}

class OutlineMarker {
	private _viewZone:OutlineViewZone;
	private _viewZoneId:number;
	private _decorationId:string;

	private _editor:ICodeEditor;


	public constructor(range:editorCommon.IRange, outlineType:SymbolKind, _editor:ICodeEditor, helper:OutlineMarkerHelper, viewZoneChangeAccessor:IViewZoneChangeAccessor) {
		this._editor = _editor;
		this._viewZone = new OutlineViewZone(range, outlineType);
		this._viewZoneId = viewZoneChangeAccessor.addZone(this._viewZone);
		helper.addDecoration({
			range: range,
			options: {}
		}, (decorationId) => {
			this._decorationId = decorationId;
		});
	}

	public dispose(helper:OutlineMarkerHelper, viewZoneChangeAccessor:IViewZoneChangeAccessor): void {
		helper.removeDecoration(this._decorationId);
		viewZoneChangeAccessor.removeZone(this._viewZoneId);
	}

	public getLine(): number {
		return this._viewZone.afterLineNumber;
	}

	public update(viewZoneChangeAccessor:IViewZoneChangeAccessor): void {
		var range = this._editor.getModel().getDecorationRange(this._decorationId);

		this._viewZone.afterLineNumber = range.startLineNumber - 1;
		viewZoneChangeAccessor.layoutZone(this._viewZoneId);
	}
}

export class OutlineMarkerContribution implements editorCommon.IEditorContribution {

	public static ID = 'editor.outlineMarker';

	private _editor:ICodeEditor;
	private _isEnabled: boolean;

	private _globalToDispose:IDisposable[];

	private _localToDispose:IDisposable[];
	private _currentOutlinePromise:TPromise<IOutline>;

	private _markers:OutlineMarker[];

	constructor(editor:ICodeEditor) {
		this._editor = editor;
		this._isEnabled = this._editor.getConfiguration().contribInfo.outlineMarkers;

		this._globalToDispose = [];
		this._localToDispose = [];
		this._markers = [];
		this._currentOutlinePromise = null;

		this._globalToDispose.push(this._editor.onDidChangeModel(() => this.onChange(true)));
		this._globalToDispose.push(this._editor.onDidChangeModelMode(() => this.onChange(false)));
		this._globalToDispose.push(this._editor.onDidChangeConfiguration((e: editorCommon.IConfigurationChangedEvent) => {
			let oldIsEnabled = this._isEnabled;
			this._isEnabled = this._editor.getConfiguration().contribInfo.outlineMarkers;
			if (oldIsEnabled !== this._isEnabled) {
				this.onChange(false);
			}
		}));

		this.onChange(false);
	}

	public dispose(): void {
		this.localDispose();
		this._globalToDispose = dispose(this._globalToDispose);
	}

	private localDispose(): void {
		if (this._currentOutlinePromise) {
			this._currentOutlinePromise.cancel();
		}
		this._localToDispose = dispose(this._localToDispose);
	}

	public getId():string {
		return OutlineMarkerContribution.ID;
	}

	private onChange( markersAlreadyDisposed : boolean): void {

		if (markersAlreadyDisposed) {
			this._markers = [];
		}

		this.localDispose();

		if (!this._isEnabled) {
			return;
		}

		var model = this._editor.getModel();
		if (!model) {
			return;
		}

		if (!DocumentSymbolProviderRegistry.has(model)) {
			return;
		}

		var scheduler = new RunOnceScheduler(() => {
			if (this._currentOutlinePromise) {
				this._currentOutlinePromise.cancel();
			}

			this._currentOutlinePromise = getDocumentSymbols(model);

			this._currentOutlinePromise.then((result) => {
				this.renderOutlines(result.entries);
			}, (error) => {
				onUnexpectedError(error);
			});
		}, 250);
		this._localToDispose.push(scheduler);
		this._localToDispose.push(this._editor.onDidChangeModelContent(() => {

			// Synchronously move markers
			this._editor.changeViewZones((viewAccessor) => {
				this._markers.forEach((marker) => {
					marker.update(viewAccessor);
				});
			});

			scheduler.schedule();
		}));
		this._localToDispose.push({
			dispose: () => {
				if (this._markers.length > 0) {
					var helper = new OutlineMarkerHelper();
					this._editor.changeViewZones((accessor) => {
						this._markers.forEach((marker) => marker.dispose(helper, accessor));
						this._markers = [];
					});
					this._editor.changeDecorations((accessor) => {
						helper.commit(accessor);
					});
				}
			}
		});

		scheduler.schedule();
	}

	private renderOutlines(entries: SymbolInformation[]): void {
		var centeredRange = this._editor.getCenteredRangeInViewport();
		var oldMarkersCount = this._markers.length;
		this._editor.changeDecorations((decorationsAccessor) => {
			var helper = new OutlineMarkerHelper();
			this._editor.changeViewZones((viewzonesAccessor) => {
				this._markers.forEach((marker) => marker.dispose(helper, viewzonesAccessor));
				this._markers = [];

				this.renderOutlinesRecursive(entries, helper, viewzonesAccessor);
			});
			helper.commit(decorationsAccessor);
		});
		var newMarkersCount = this._markers.length;
		if (Math.abs(oldMarkersCount - newMarkersCount) > 1) {
			// Reveal only if the delta is more than 1 marker
			this._editor.revealRangeInCenter(centeredRange);
		}
	}

	private renderOutlinesRecursive(entries: SymbolInformation[], helper:OutlineMarkerHelper, viewZoneChangeAccessor:IViewZoneChangeAccessor): void {
		if (entries) {
			entries.forEach((outline) => {
				if (outline.kind === SymbolKind.Class || outline.kind === SymbolKind.Method || outline.kind === SymbolKind.Function) {
					var range = Range.lift(outline.location.range);
					if (!this.alreadyHasMarkerAtRange(range)) {
						var marker = new OutlineMarker(range, outline.kind, this._editor, helper, viewZoneChangeAccessor);
						this._markers.push(marker);
					}
				}
			});
		}
	}

	private alreadyHasMarkerAtRange(range: editorCommon.IRange): boolean {
		for (var i = 0; i < this._markers.length; ++i) {
			if (this._markers[i].getLine() === range.startLineNumber-1) {
				return true;
			}
		}
		return false;
	}

}


EditorBrowserRegistry.registerEditorContribution(OutlineMarkerContribution);