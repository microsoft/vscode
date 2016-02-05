/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./outlineMarker';
import {TPromise} from 'vs/base/common/winjs.base';
import lifecycle = require('vs/base/common/lifecycle');
import schedulers = require('vs/base/common/async');
import errors = require('vs/base/common/errors');
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import {EditorBrowserRegistry} from 'vs/editor/browser/editorBrowserExtensions';
import {Range} from 'vs/editor/common/core/range';
import {INullService} from 'vs/platform/instantiation/common/instantiation';

class OutlineViewZone implements EditorBrowser.IViewZone {

	public afterLineNumber:number;
	public heightInPx:number;
	public suppressMouseDown:boolean;

	public domNode:HTMLElement;

	constructor(range:EditorCommon.IRange, outlineType:string)
	{
		this.afterLineNumber = range.startLineNumber-1;
		this.heightInPx = 4;
		this.suppressMouseDown = true;

		this.domNode = document.createElement('div');
		var hr = document.createElement('hr');
		hr.className = 'outlineRule ' + outlineType;
		this.domNode.appendChild(hr);
	}
}

interface IDecorationIdCallback {
	(decorationId:string):void;
}

class OutlineMarkerHelper {
	private _removeDecorations:string[];
	private _addDecorations:EditorCommon.IModelDeltaDecoration[];
	private _addDecorationsCallbacks:IDecorationIdCallback[];

	constructor() {
		this._removeDecorations = [];
		this._addDecorations = [];
		this._addDecorationsCallbacks = [];
	}

	public addDecoration(decoration:EditorCommon.IModelDeltaDecoration, callback:IDecorationIdCallback): void {
		this._addDecorations.push(decoration);
		this._addDecorationsCallbacks.push(callback);
	}

	public removeDecoration(decorationId:string): void {
		this._removeDecorations.push(decorationId);
	}

	public commit(changeAccessor:EditorCommon.IModelDecorationsChangeAccessor): void {
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

	private _editor:EditorBrowser.ICodeEditor;


	public constructor(range:EditorCommon.IRange, outlineType:string, _editor:EditorBrowser.ICodeEditor, helper:OutlineMarkerHelper, viewZoneChangeAccessor:EditorBrowser.IViewZoneChangeAccessor)
	{
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

	public dispose(helper:OutlineMarkerHelper, viewZoneChangeAccessor:EditorBrowser.IViewZoneChangeAccessor): void {
		helper.removeDecoration(this._decorationId);
		viewZoneChangeAccessor.removeZone(this._viewZoneId);
	}

	public getLine(): number {
		return this._viewZone.afterLineNumber;
	}

	public update(viewZoneChangeAccessor:EditorBrowser.IViewZoneChangeAccessor): void {
		var range = this._editor.getModel().getDecorationRange(this._decorationId);

		this._viewZone.afterLineNumber = range.startLineNumber - 1;
		viewZoneChangeAccessor.layoutZone(this._viewZoneId);
	}
}

export class OutlineMarkerContribution implements EditorCommon.IEditorContribution {

	public static ID = 'editor.outlineMarker';

	private _editor:EditorBrowser.ICodeEditor;

	private _globalToDispose:lifecycle.IDisposable[];

	private _localToDispose:lifecycle.IDisposable[];
	private _currentOutlinePromise:TPromise<Modes.IOutlineEntry[]>;

	private _markers:OutlineMarker[];

	constructor(editor:EditorBrowser.ICodeEditor, @INullService ns) {
		this._editor = editor;

		this._globalToDispose = [];
		this._localToDispose = [];
		this._markers = [];
		this._currentOutlinePromise = null;

		this._globalToDispose.push(this._editor.addListener2(EditorCommon.EventType.ModelChanged, () => this.onChange(true)));
		this._globalToDispose.push(this._editor.addListener2(EditorCommon.EventType.ModelModeChanged, () => this.onChange(false)));
		this._globalToDispose.push(this._editor.addListener2(EditorCommon.EventType.ModelModeSupportChanged, (e: EditorCommon.IModeSupportChangedEvent) => {
			if (e.outlineSupport) {
				this.onChange(false);
			}
		}));
		this._globalToDispose.push(this._editor.addListener2(EditorCommon.EventType.ConfigurationChanged,(e: EditorCommon.IConfigurationChangedEvent) => {
			if (e.outlineMarkers) {
				this.onChange(false);
			}
		}));

		this.onChange(false);
	}

	public dispose(): void {
		this.localDispose();
		this._globalToDispose = lifecycle.disposeAll(this._globalToDispose);
	}

	private localDispose(): void {
		if (this._currentOutlinePromise) {
			this._currentOutlinePromise.cancel();
		}
		this._localToDispose = lifecycle.disposeAll(this._localToDispose);
	}

	public getId():string {
		return OutlineMarkerContribution.ID;
	}

	private onChange( markersAlreadyDisposed : boolean): void {

		if (markersAlreadyDisposed) {
			this._markers = [];
		}

		this.localDispose();

		if (!this._editor.getConfiguration().outlineMarkers) {
			return;
		}

		var model = this._editor.getModel();
		if (!model) {
			return;
		}

		var mode = model.getMode();
		if (!mode.outlineSupport) {
			return;
		}

		var scheduler = new schedulers.RunOnceScheduler(() => {
			if (this._currentOutlinePromise) {
				this._currentOutlinePromise.cancel();
			}

			this._currentOutlinePromise = mode.outlineSupport.getOutline(model.getAssociatedResource());

			this._currentOutlinePromise.then((result) => {
				this.renderOutlines(result);
			}, (error) => {
				errors.onUnexpectedError(error);
			});
		}, 250);
		this._localToDispose.push(scheduler);
		this._localToDispose.push(this._editor.addListener2('change',() => {

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

	private renderOutlines(entries: Modes.IOutlineEntry[]): void {
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

	private renderOutlinesRecursive(entries: Modes.IOutlineEntry[], helper:OutlineMarkerHelper, viewZoneChangeAccessor:EditorBrowser.IViewZoneChangeAccessor): void {
		if (entries) {
			entries.forEach((outline) => {
				if (outline.type === 'class' || outline.type === 'method' || outline.type === 'function') {
					var range = Range.lift(outline.range);
					if (!this.alreadyHasMarkerAtRange(range)) {
						var marker = new OutlineMarker(range, outline.type, this._editor, helper, viewZoneChangeAccessor);
						this._markers.push(marker);
					}
				}

				this.renderOutlinesRecursive(outline.children, helper, viewZoneChangeAccessor);
			});
		}
	}

	private alreadyHasMarkerAtRange(range: EditorCommon.IRange): boolean {
		for (var i = 0; i < this._markers.length; ++i) {
			if (this._markers[i].getLine() === range.startLineNumber-1) {
				return true;
			}
		}
		return false;
	}

}


EditorBrowserRegistry.registerEditorContribution(OutlineMarkerContribution);