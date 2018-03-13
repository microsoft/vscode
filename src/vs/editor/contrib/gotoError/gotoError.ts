/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import { Emitter } from 'vs/base/common/event';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import URI from 'vs/base/common/uri';
import { RawContextKey, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IMarker, IMarkerService } from 'vs/platform/markers/common/markers';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { registerEditorAction, registerEditorContribution, ServicesAccessor, IActionOptions, EditorAction, EditorCommand, registerEditorCommand } from 'vs/editor/browser/editorExtensions';
import { ICodeEditor, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { MarkerNavigationWidget } from './gotoErrorWidget';
import { compare } from 'vs/base/common/strings';
import { binarySearch } from 'vs/base/common/arrays';
import { IEditorService } from 'vs/platform/editor/common/editor';
import { TPromise } from 'vs/base/common/winjs.base';

class MarkerModel {

	private _editor: ICodeEditor;
	private _markers: IMarker[];
	private _nextIdx: number;
	private _toUnbind: IDisposable[];
	private _ignoreSelectionChange: boolean;
	private _onCurrentMarkerChanged: Emitter<IMarker>;
	private _onMarkerSetChanged: Emitter<MarkerModel>;

	constructor(editor: ICodeEditor, markers: IMarker[]) {
		this._editor = editor;
		this._markers = null;
		this._nextIdx = -1;
		this._toUnbind = [];
		this._ignoreSelectionChange = false;
		this._onCurrentMarkerChanged = new Emitter<IMarker>();
		this._onMarkerSetChanged = new Emitter<MarkerModel>();
		this.setMarkers(markers);

		// listen on editor
		this._toUnbind.push(this._editor.onDidDispose(() => this.dispose()));
		this._toUnbind.push(this._editor.onDidChangeCursorPosition(() => {
			if (this._ignoreSelectionChange) {
				return;
			}
			if (this.currentMarker && Range.containsPosition(this.currentMarker, this._editor.getPosition())) {
				return;
			}
			this._nextIdx = -1;
		}));
	}

	public get onCurrentMarkerChanged() {
		return this._onCurrentMarkerChanged.event;
	}

	public get onMarkerSetChanged() {
		return this._onMarkerSetChanged.event;
	}

	public setMarkers(markers: IMarker[]): void {

		let oldMarker = this._nextIdx >= 0 ? this._markers[this._nextIdx] : undefined;
		this._markers = markers || [];
		this._markers.sort(MarkerNavigationAction.compareMarker);
		if (!oldMarker) {
			this._nextIdx = -1;
		} else {
			this._nextIdx = Math.max(-1, binarySearch(this._markers, oldMarker, MarkerNavigationAction.compareMarker));
		}
		this._onMarkerSetChanged.fire(this);
	}

	public withoutWatchingEditorPosition(callback: () => void): void {
		this._ignoreSelectionChange = true;
		try {
			callback();
		} finally {
			this._ignoreSelectionChange = false;
		}
	}

	private _initIdx(fwd: boolean): void {
		let found = false;
		const position = this._editor.getPosition();
		for (let i = 0; i < this._markers.length; i++) {
			let range = Range.lift(this._markers[i]);

			if (range.isEmpty()) {
				const word = this._editor.getModel().getWordAtPosition(range.getStartPosition());
				if (word) {
					range = new Range(range.startLineNumber, word.startColumn, range.startLineNumber, word.endColumn);
				}
			}

			if (range.containsPosition(position) || position.isBeforeOrEqual(range.getStartPosition())) {
				this._nextIdx = i;
				found = true;
				break;
			}
		}
		if (!found) {
			// after the last change
			this._nextIdx = fwd ? 0 : this._markers.length - 1;
		}
		if (this._nextIdx < 0) {
			this._nextIdx = this._markers.length - 1;
		}
	}

	get currentMarker(): IMarker {
		return this.canNavigate() ? this._markers[this._nextIdx] : undefined;
	}

	public move(fwd: boolean, inCircles: boolean): boolean {
		if (!this.canNavigate()) {
			this._onCurrentMarkerChanged.fire(undefined);
			return !inCircles;
		}

		let oldIdx = this._nextIdx;
		let atEdge = false;

		if (this._nextIdx === -1) {
			this._initIdx(fwd);

		} else if (fwd) {
			if (inCircles || this._nextIdx + 1 < this._markers.length) {
				this._nextIdx = (this._nextIdx + 1) % this._markers.length;
			} else {
				atEdge = true;
			}

		} else if (!fwd) {
			if (inCircles || this._nextIdx > 0) {
				this._nextIdx = (this._nextIdx - 1 + this._markers.length) % this._markers.length;
			} else {
				atEdge = true;
			}
		}

		if (oldIdx !== this._nextIdx) {
			const marker = this._markers[this._nextIdx];
			this._onCurrentMarkerChanged.fire(marker);
		}

		return atEdge;
	}

	public canNavigate(): boolean {
		return this._markers.length > 0;
	}

	public findMarkerAtPosition(pos: Position): IMarker {
		for (const marker of this._markers) {
			if (Range.containsPosition(marker, pos)) {
				return marker;
			}
		}
		return undefined;
	}

	public get total() {
		return this._markers.length;
	}

	public indexOf(marker: IMarker): number {
		return 1 + this._markers.indexOf(marker);
	}

	public dispose(): void {
		this._toUnbind = dispose(this._toUnbind);
	}
}

class MarkerController implements editorCommon.IEditorContribution {

	private static readonly ID = 'editor.contrib.markerController';

	public static get(editor: ICodeEditor): MarkerController {
		return editor.getContribution<MarkerController>(MarkerController.ID);
	}

	private _editor: ICodeEditor;
	private _model: MarkerModel;
	private _widget: MarkerNavigationWidget;
	private _widgetVisible: IContextKey<boolean>;
	private _disposeOnClose: IDisposable[] = [];

	constructor(
		editor: ICodeEditor,
		@IMarkerService private readonly _markerService: IMarkerService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IThemeService private readonly _themeService: IThemeService
	) {
		this._editor = editor;
		this._widgetVisible = CONTEXT_MARKERS_NAVIGATION_VISIBLE.bindTo(this._contextKeyService);
	}

	public getId(): string {
		return MarkerController.ID;
	}

	public dispose(): void {
		this._cleanUp();
	}

	private _cleanUp(): void {
		this._widgetVisible.reset();
		this._disposeOnClose = dispose(this._disposeOnClose);
		this._widget = null;
		this._model = null;
	}

	public getOrCreateModel(): MarkerModel {

		if (this._model) {
			return this._model;
		}

		const markers = this._getMarkers();
		this._model = new MarkerModel(this._editor, markers);
		this._markerService.onMarkerChanged(this._onMarkerChanged, this, this._disposeOnClose);

		this._widget = new MarkerNavigationWidget(this._editor, this._themeService);
		this._widgetVisible.set(true);

		this._disposeOnClose.push(this._model);
		this._disposeOnClose.push(this._widget);
		this._disposeOnClose.push(this._editor.onDidChangeModel(() => this._cleanUp()));

		this._disposeOnClose.push(this._model.onCurrentMarkerChanged(marker => {
			if (!marker) {
				this._cleanUp();
			} else {
				this._model.withoutWatchingEditorPosition(() => {
					this._widget.showAtMarker(marker, this._model.indexOf(marker), this._model.total);
				});
			}
		}));
		this._disposeOnClose.push(this._model.onMarkerSetChanged(() => {
			const marker = this._model.findMarkerAtPosition(this._widget.position);
			if (marker) {
				this._widget.updateMarker(marker);
			} else {
				this._widget.showStale();
			}
		}));

		return this._model;
	}

	public closeMarkersNavigation(): void {
		this._cleanUp();
		this._editor.focus();
	}

	private _onMarkerChanged(changedResources: URI[]): void {
		if (!changedResources.some(r => this._editor.getModel().uri.toString() === r.toString())) {
			return;
		}
		this._model.setMarkers(this._getMarkers());
	}

	private _getMarkers(): IMarker[] {
		return this._markerService.read({ resource: this._editor.getModel().uri });
	}
}

class MarkerNavigationAction extends EditorAction {

	private _isNext: boolean;

	constructor(next: boolean, opts: IActionOptions) {
		super(opts);
		this._isNext = next;
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): TPromise<void> {

		const markerService = accessor.get(IMarkerService);
		const editorService = accessor.get(IEditorService);
		const controller = MarkerController.get(editor);
		if (!controller) {
			return undefined;
		}

		const model = controller.getOrCreateModel();
		const atEdge = model.move(this._isNext, false);
		if (!atEdge) {
			return undefined;
		}

		// try with the next/prev file
		let oldMarker = model.currentMarker || { resource: editor.getModel().uri, severity: Severity.Error, startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 };
		let markers = markerService.read().sort(MarkerNavigationAction.compareMarker);
		let idx = binarySearch(markers, oldMarker, MarkerNavigationAction.compareMarker);
		if (idx < 0) {
			// find best match...
			idx = ~idx;
			idx %= markers.length;
		} else if (this._isNext) {
			idx = (idx + 1) % markers.length;
		} else {
			idx = (idx + markers.length - 1) % markers.length;
		}

		let newMarker = markers[idx];
		if (newMarker.resource.toString() === editor.getModel().uri.toString()) {
			// the next `resource` is this resource which
			// means we cycle within this file
			model.move(this._isNext, true);
			return undefined;
		}

		// close the widget for this editor-instance, open the resource
		// for the next marker and re-start marker navigation in there
		controller.closeMarkersNavigation();

		return editorService.openEditor({
			resource: newMarker.resource,
			options: { pinned: false, revealIfOpened: true, revealInCenterIfOutsideViewport: true, selection: newMarker }
		}).then(editor => {
			if (!editor || !isCodeEditor(editor.getControl())) {
				return undefined;
			}
			return (<ICodeEditor>editor.getControl()).getAction(this.id).run();
		});
	}

	static compareMarker(a: IMarker, b: IMarker): number {
		let res = compare(a.resource.toString(), b.resource.toString());
		if (res === 0) {
			res = Severity.compare(a.severity, b.severity);
		}
		if (res === 0) {
			res = Range.compareRangesUsingStarts(a, b);
		}
		return res;
	}
}

class NextMarkerAction extends MarkerNavigationAction {
	constructor() {
		super(true, {
			id: 'editor.action.marker.next',
			label: nls.localize('markerAction.next.label', "Go to Next Problem (Error, Warning, Info)"),
			alias: 'Go to Next Error or Warning',
			precondition: EditorContextKeys.writable,
			kbOpts: {
				kbExpr: EditorContextKeys.focus,
				primary: KeyCode.F8
			}
		});
	}
}

class PrevMarkerAction extends MarkerNavigationAction {
	constructor() {
		super(false, {
			id: 'editor.action.marker.prev',
			label: nls.localize('markerAction.previous.label', "Go to Previous Problem (Error, Warning, Info)"),
			alias: 'Go to Previous Error or Warning',
			precondition: EditorContextKeys.writable,
			kbOpts: {
				kbExpr: EditorContextKeys.focus,
				primary: KeyMod.Shift | KeyCode.F8
			}
		});
	}
}

registerEditorContribution(MarkerController);
registerEditorAction(NextMarkerAction);
registerEditorAction(PrevMarkerAction);

const CONTEXT_MARKERS_NAVIGATION_VISIBLE = new RawContextKey<boolean>('markersNavigationVisible', false);

const MarkerCommand = EditorCommand.bindToContribution<MarkerController>(MarkerController.get);

registerEditorCommand(new MarkerCommand({
	id: 'closeMarkersNavigation',
	precondition: CONTEXT_MARKERS_NAVIGATION_VISIBLE,
	handler: x => x.closeMarkersNavigation(),
	kbOpts: {
		weight: KeybindingsRegistry.WEIGHT.editorContrib(50),
		kbExpr: EditorContextKeys.focus,
		primary: KeyCode.Escape,
		secondary: [KeyMod.Shift | KeyCode.Escape]
	}
}));
