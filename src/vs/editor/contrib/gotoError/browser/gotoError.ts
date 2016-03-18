/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./gotoError';
import * as nls from 'vs/nls';
import {onUnexpectedError} from 'vs/base/common/errors';
import {Emitter} from 'vs/base/common/event';
import {CommonKeybindings, KeyCode, KeyMod} from 'vs/base/common/keyCodes';
import {IDisposable, cAll, disposeAll} from 'vs/base/common/lifecycle';
import severity from 'vs/base/common/severity';
import * as strings from 'vs/base/common/strings';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import * as dom from 'vs/base/browser/dom';
import {renderHtml} from 'vs/base/browser/htmlContentRenderer';
import {IEditorService} from 'vs/platform/editor/common/editor';
import {IEventService} from 'vs/platform/event/common/event';
import {IKeybindingContextKey, IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {IMarker, IMarkerService} from 'vs/platform/markers/common/markers';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {Position} from 'vs/editor/common/core/position';
import {EditorAction} from 'vs/editor/common/editorAction';
import {Behaviour} from 'vs/editor/common/editorActionEnablement';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {IQuickFix} from 'vs/editor/common/modes';
import {bulkEdit} from 'vs/editor/common/services/bulkEdit';
import {ICodeEditor} from 'vs/editor/browser/editorBrowser';
import {EditorBrowserRegistry} from 'vs/editor/browser/editorBrowserExtensions';
import {IOptions, ZoneWidget} from 'vs/editor/contrib/zoneWidget/browser/zoneWidget';

class MarkerModel {

	private _editor: ICodeEditor;
	private _markers: IMarker[];
	private _nextIdx: number;
	private _toUnbind: Function[];
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
		this._toUnbind.push(this._editor.addListener(editorCommon.EventType.Disposed, () => this.dispose()));
		this._toUnbind.push(this._editor.addListener(editorCommon.EventType.CursorPositionChanged, () => {
			if (!this._ignoreSelectionChange) {
				this._nextIdx = -1;
			}
		}));
	}

	public get onCurrentMarkerChanged() {
		return this._onCurrentMarkerChanged.event;
	}

	public get onMarkerSetChanged() {
		return this._onMarkerSetChanged.event;
	}

	public setMarkers(markers: IMarker[]): void {
		// assign
		this._markers = markers || [];

		// sort markers
		this._markers.sort((left, right) => {
			if (left.startLineNumber === right.startLineNumber) {
				return left.startColumn - right.startColumn;
			} else {
				return left.startLineNumber - right.startLineNumber;
			}
		});

		this._nextIdx = -1;
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

	private initIdx(fwd: boolean): void {
		var found = false;
		var position = this._editor.getPosition();
		for (var i = 0, len = this._markers.length; i < len && !found; i++) {
			var pos = { lineNumber: this._markers[i].startLineNumber, column: this._markers[i].startColumn };
			if (position.isBeforeOrEqual(pos)) {
				this._nextIdx = i + (fwd ? 0 : -1);
				found = true;
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

	private move(fwd: boolean): void {
		if (!this.canNavigate()) {
			this._onCurrentMarkerChanged.fire(undefined);
			return;
		}

		if (this._nextIdx === -1) {
			this.initIdx(fwd);

		} else if (fwd) {
			this._nextIdx += 1;
			if (this._nextIdx >= this._markers.length) {
				this._nextIdx = 0;
			}
		} else {
			this._nextIdx -= 1;
			if (this._nextIdx < 0) {
				this._nextIdx = this._markers.length - 1;
			}
		}
		var marker = this._markers[this._nextIdx];
		this._onCurrentMarkerChanged.fire(marker);
	}

	public canNavigate(): boolean {
		return this._markers.length > 0;
	}

	public next(): void {
		this.move(true);
	}

	public previous(): void {
		this.move(false);
	}

	public goTo(pos: editorCommon.IPosition): void {
		for (var i = 0; i < this._markers.length; i++) {
			var marker = this._markers[i];
			if (marker.startLineNumber <= pos.lineNumber && marker.endLineNumber >= pos.lineNumber
					&& marker.startColumn <= pos.column && marker.endColumn >= pos.column) {
				this._onCurrentMarkerChanged.fire(marker);
				return;
			}
		}
		return null;
	}

	public indexOf(marker: IMarker): number {
		return this._markers.indexOf(marker);
	}

	public length(): number {
		return this._markers.length;
	}

	public reveal(): void {

		if (this._nextIdx === -1) {
			return;
		}

		this.withoutWatchingEditorPosition(() => {
			var pos = new Position(this._markers[this._nextIdx].startLineNumber, this._markers[this._nextIdx].startColumn);
			this._editor.setPosition(pos);
			this._editor.revealPositionInCenter(pos);
		});
	}

	public dispose(): void {
		this._toUnbind = cAll(this._toUnbind);
	}
}

var zoneOptions: IOptions = {
	showFrame: true,
	showArrow: true,
	isAccessible: true
};

class MarkerNavigationWidget extends ZoneWidget {

	private _eventService: IEventService;
	private _editorService: IEditorService;
	private _container: HTMLElement;
	private _element: HTMLElement;
	private _quickFixSection: HTMLElement;
	private _callOnDispose: IDisposable[] = [];
	private _localCleanup: IDisposable[] = [];
	private _quickFixEntries: HTMLElement[];

	constructor(eventService:IEventService, editorService:IEditorService, editor: ICodeEditor, private _model: MarkerModel) {
		super(editor, zoneOptions);
		this._eventService = eventService;
		this._editorService = editorService;
		this.create();
		this._wireModelAndView();
	}

	public fillContainer(container: HTMLElement): void {
		this._container = container;

		dom.addClass(this._container, 'marker-widget');
		this._container.tabIndex = 0;
		this._container.setAttribute('role', 'tooltip');

		this._element = document.createElement('div');
		this._element.className = 'descriptioncontainer';
		this._element.setAttribute('aria-live', 'assertive');
		this._element.setAttribute('role', 'alert');
		this._container.appendChild(this._element);

		this._quickFixSection = document.createElement('div');
		this._container.appendChild(this._quickFixSection);

		this._callOnDispose.push(dom.addStandardDisposableListener(this._container, 'keydown', (e) => {
			switch(e.asKeybinding()) {
				case CommonKeybindings.LEFT_ARROW:
					this._goLeft();
					e.preventDefault();
					e.stopPropagation();
					break;
				case CommonKeybindings.RIGHT_ARROW:
					this._goRight();
					e.preventDefault();
					e.stopPropagation();
					break;

			}
		}));
	}

	private _goLeft(): void {
		if (!this._quickFixEntries) {
			return;
		}
		let idx = this._quickFixEntries.indexOf(<HTMLElement>document.activeElement);
		if (idx === -1) {
			idx = 1;
		}
		idx = (idx + this._quickFixEntries.length - 1) % this._quickFixEntries.length;
		this._quickFixEntries[idx].focus();
	}

	private _goRight(): void {
		if (!this._quickFixEntries) {
			return;
		}
		let idx = this._quickFixEntries.indexOf(<HTMLElement>document.activeElement);
		idx = (idx + 1) % this._quickFixEntries.length;
		this._quickFixEntries[idx].focus();
	}

	public show(where:editorCommon.IRange, heightInLines:number):void;
	public show(where:editorCommon.IPosition, heightInLines:number):void;
	public show(where:any, heightInLines:number):void {
		super.show(where, heightInLines);
		this._container.focus();
	}

	private _wireModelAndView(): void {
		this._model.onCurrentMarkerChanged(this.showAtMarker, this, this._callOnDispose);
	}

	public showAtMarker(marker: IMarker): void {

		if (!marker) {
			return;
		}

		// set color
		switch (marker.severity) {
			case severity.Error:
				this.options.frameColor = '#ff5a5a';
				break;
			case severity.Warning:
			case severity.Info:
				this.options.frameColor = '#5aac5a';
				break;
		}

		this._localCleanup = disposeAll(this._localCleanup);

		// update label and show
		let text = strings.format('({0}/{1}) ', this._model.indexOf(marker) + 1, this._model.length());
		if (marker.source) {
			text = `${text}[${marker.source}] `;
		}
		dom.clearNode(this._element);
		this._element.appendChild(document.createTextNode(text));
		this._element.appendChild(renderHtml(marker.message));

		var mode = this.editor.getModel().getMode();
		this._quickFixSection.style.display = 'none';

		if (mode.quickFixSupport) {
			var promise = mode.quickFixSupport.getQuickFixes(this.editor.getModel().getAssociatedResource(), marker);
			promise.then((result: IQuickFix[]) => {
				dom.clearNode(this._quickFixSection);
				if (result.length > 0) {

					this._localCleanup.push({
						dispose:() => {
							this._quickFixEntries = [];
						}
					});

					let quickfixhead = document.createElement('span');
					quickfixhead.className = 'quickfixhead';
					quickfixhead.appendChild(document.createTextNode(result.length > 1 ? nls.localize('quickfix.multiple.label', 'Suggested fixes: ') : nls.localize('quickfix.single.label', 'Suggested fix: ')));
					this._quickFixSection.appendChild(quickfixhead);

					this._quickFixEntries = [];
					let quickfixcontainer = document.createElement('span');
					quickfixcontainer.className = 'quickfixcontainer';
					result.forEach((fix, idx, arr) => {
						var container = quickfixcontainer;
						if (idx > 0) {
							let separator = document.createElement('span');
							separator.appendChild(document.createTextNode(', '));
							container.appendChild(separator);
						}

						let entry = document.createElement('a');
						entry.tabIndex = 0;
						entry.className = 'quickfixentry';
						entry.appendChild(document.createTextNode(fix.command.title));
						this._localCleanup.push(dom.addDisposableListener(entry, dom.EventType.CLICK, () => {
							mode.quickFixSupport.runQuickFixAction(this.editor.getModel().getAssociatedResource(), marker, fix).then(result => {
								return bulkEdit(this._eventService, this._editorService, this.editor, result.edits);
							});
							return true;
						}));
						this._localCleanup.push(dom.addStandardDisposableListener(entry, 'keydown', (e) => {
							switch (e.asKeybinding()) {
								case CommonKeybindings.ENTER:
								case CommonKeybindings.SPACE:
									mode.quickFixSupport.runQuickFixAction(this.editor.getModel().getAssociatedResource(), marker, fix).then(result => {
										return bulkEdit(this._eventService, this._editorService, this.editor, result.edits);
									});
									e.preventDefault();
									e.stopPropagation();
							}
						}));
						container.appendChild(entry);

						this._quickFixEntries.push(entry);
					});
					this._quickFixSection.appendChild(quickfixcontainer);

					this._quickFixSection.style.display = '';
					this.show(new Position(marker.startLineNumber, marker.startColumn), 4);
				}
			},(error) => {
				onUnexpectedError(error);
			});
		}

		this._model.withoutWatchingEditorPosition(() => {
			this.show(new Position(marker.startLineNumber, marker.startColumn), 3);
		});
	}

	public dispose(): void {
		this._callOnDispose = disposeAll(this._callOnDispose);
		super.dispose();
	}
}

class MarkerNavigationAction extends EditorAction {

	private _isNext: boolean;

	private telemetryService:ITelemetryService;

	constructor(descriptor:editorCommon.IEditorActionDescriptorData, editor:editorCommon.ICommonCodeEditor, next: boolean, @ITelemetryService telemetryService: ITelemetryService) {
		super(descriptor, editor, Behaviour.WidgetFocus | Behaviour.Writeable | Behaviour.UpdateOnModelChange);
		this.telemetryService = telemetryService;
		this._isNext = next;
	}

	public run(): TPromise<boolean> {
		var model = MarkerController.getMarkerController(this.editor).getOrCreateModel();
		this.telemetryService.publicLog('zoneWidgetShown', { mode: 'go to error' });
		if (model) {
			if (this._isNext) {
				model.next();
			} else {
				model.previous();
			}
			model.reveal();
		}
		return TPromise.as(true);
	}
}

class MarkerController implements editorCommon.IEditorContribution {

	static ID = 'editor.contrib.markerController';

	static getMarkerController(editor:editorCommon.ICommonCodeEditor): MarkerController {
		return <MarkerController>editor.getContribution(MarkerController.ID);
	}

	private eventService:IEventService;
	private editorService:IEditorService;
	private markerService: IMarkerService;
	private editor:ICodeEditor;
	private _model: MarkerModel;
	private _zone: MarkerNavigationWidget;
	private _callOnClose: IDisposable[] = [];
	private _markersNavigationVisible: IKeybindingContextKey<boolean>;

	constructor(
		editor: ICodeEditor, @IMarkerService markerService: IMarkerService, @IKeybindingService keybindingService: IKeybindingService,
		@IEventService eventService: IEventService, @IEditorService editorService: IEditorService) {
		this.markerService = markerService;
		this.eventService = eventService;
		this.editorService = editorService;
		this.editor = editor;
		this._markersNavigationVisible = keybindingService.createKey(CONTEXT_MARKERS_NAVIGATION_VISIBLE, false);
	}

	public getId(): string {
		return MarkerController.ID;
	}

	public dispose(): void {
		this._cleanUp();
	}

	private _cleanUp(): void {
		this._markersNavigationVisible.reset();
		this._callOnClose = disposeAll(this._callOnClose);
		this._zone = null;
		this._model = null;
	}

	public getOrCreateModel(): MarkerModel {

		if (this._model) {
			return this._model;
		}

		var markers = this._getMarkers();
		this._model = new MarkerModel(this.editor, markers);
		this._zone = new MarkerNavigationWidget(this.eventService, this.editorService, this.editor, this._model);
		this._markersNavigationVisible.set(true);

		this._callOnClose.push(this._model);
		this._callOnClose.push(this._zone);

		this._callOnClose.push(this.editor.addListener2(editorCommon.EventType.ModelChanged, () => {
			this._cleanUp();
		}));

		this._model.onCurrentMarkerChanged(marker => !marker && this._cleanUp(), undefined, this._callOnClose);
		this.markerService.onMarkerChanged(this._onMarkerChanged, this, this._callOnClose);
		return this._model;	}

	public closeMarkersNavigation(): void {
		this._cleanUp();
		this.editor.focus();
	}

	private _onMarkerChanged(changedResources: URI[]): void {
		if(!changedResources.some(r => this.editor.getModel().getAssociatedResource().toString() === r.toString())) {
			return;
		}
		this._model.setMarkers(this._getMarkers());
	}

	private _getMarkers(): IMarker[] {
		var resource = this.editor.getModel().getAssociatedResource(),
			markers = this.markerService.read({ resource: resource });

		return markers;
	}
}

class NextMarkerAction extends MarkerNavigationAction {
	public static ID = 'editor.action.marker.next';

	constructor(descriptor:editorCommon.IEditorActionDescriptorData, editor:editorCommon.ICommonCodeEditor, @ITelemetryService telemetryService: ITelemetryService) {
		super(descriptor, editor, true, telemetryService);
	}
}

class PrevMarkerAction extends MarkerNavigationAction {
	public static ID = 'editor.action.marker.prev';

	constructor(descriptor:editorCommon.IEditorActionDescriptorData, editor:editorCommon.ICommonCodeEditor, @ITelemetryService telemetryService: ITelemetryService) {
		super(descriptor, editor, false, telemetryService);
	}
}

var CONTEXT_MARKERS_NAVIGATION_VISIBLE = 'markersNavigationVisible';

// register actions
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(NextMarkerAction, NextMarkerAction.ID, nls.localize('markerAction.next.label', "Go to Next Error or Warning"), {
	context: ContextKey.EditorFocus,
	primary: KeyCode.F8
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(PrevMarkerAction, PrevMarkerAction.ID, nls.localize('markerAction.previous.label', "Go to Previous Error or Warning"), {
	context: ContextKey.EditorFocus,
	primary: KeyMod.Shift | KeyCode.F8
}));
CommonEditorRegistry.registerEditorCommand('closeMarkersNavigation', CommonEditorRegistry.commandWeight(50), { primary: KeyCode.Escape, secondary: [KeyMod.Shift | KeyCode.Escape] }, false, CONTEXT_MARKERS_NAVIGATION_VISIBLE, (ctx, editor, args) => {
	var controller = MarkerController.getMarkerController(editor);
	controller.closeMarkersNavigation();
});

EditorBrowserRegistry.registerEditorContribution(MarkerController);