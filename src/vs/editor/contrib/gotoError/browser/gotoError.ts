/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./gotoError';
import nls = require('vs/nls');
import lifecycle = require('vs/base/common/lifecycle');
import strings = require('vs/base/common/strings');
import Errors = require('vs/base/common/errors');
import URI from 'vs/base/common/uri';
import severity from 'vs/base/common/severity';
import DOM = require('vs/base/browser/dom');
import {TPromise} from 'vs/base/common/winjs.base';
import ZoneWidget = require('vs/editor/contrib/zoneWidget/browser/zoneWidget');
import Builder = require('vs/base/browser/builder');
import {EditorBrowserRegistry} from 'vs/editor/browser/editorBrowserExtensions';
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {EditorAction, Behaviour} from 'vs/editor/common/editorAction';
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import HtmlContentRenderer = require('vs/base/browser/htmlContentRenderer');
import {Emitter} from 'vs/base/common/event';
import {Position} from 'vs/editor/common/core/position';
import {IMarkerService, IMarker} from 'vs/platform/markers/common/markers';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IKeybindingService, IKeybindingContextKey} from 'vs/platform/keybinding/common/keybindingService';
import {IEventService} from 'vs/platform/event/common/event';
import {IEditorService} from 'vs/platform/editor/common/editor';
import {bulkEdit} from 'vs/editor/common/services/bulkEdit';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';

var $ = Builder.$;

class MarkerModel {

	private _editor: EditorBrowser.ICodeEditor;
	private _markers: IMarker[];
	private _nextIdx: number;
	private _toUnbind: Function[];
	private _ignoreSelectionChange: boolean;
	private _onCurrentMarkerChanged: Emitter<IMarker>;
	private _onMarkerSetChanged: Emitter<MarkerModel>;

	constructor(editor: EditorBrowser.ICodeEditor, markers: IMarker[]) {
		this._editor = editor;
		this._markers = null;
		this._nextIdx = -1;
		this._toUnbind = [];
		this._ignoreSelectionChange = false;
		this._onCurrentMarkerChanged = new Emitter<IMarker>();
		this._onMarkerSetChanged = new Emitter<MarkerModel>();
		this.setMarkers(markers);

		// listen on editor
		this._toUnbind.push(this._editor.addListener(EditorCommon.EventType.Disposed, () => this.dispose()));
		this._toUnbind.push(this._editor.addListener(EditorCommon.EventType.CursorPositionChanged, () => {
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

	public goTo(pos: EditorCommon.IPosition): void {
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
		this._toUnbind = lifecycle.cAll(this._toUnbind);
	}
}

var zoneOptions: ZoneWidget.IOptions = {
	showFrame: true,
	showArrow: true
};

class MarkerNavigationWidget extends ZoneWidget.ZoneWidget {

	private _eventService: IEventService;
	private _editorService: IEditorService;
	private _element: Builder.Builder;
	private _quickFixSection: Builder.Builder;
	private _callOnDispose: lifecycle.IDisposable[] = [];

	constructor(eventService:IEventService, editorService:IEditorService, editor: EditorBrowser.ICodeEditor, private _model: MarkerModel) {
		super(editor, zoneOptions);
		this._eventService = eventService;
		this._editorService = editorService;
		this.create();
		this._wireModelAndView();
	}

	public fillContainer(container: HTMLElement): void {

		var $container = $(container).addClass('marker-widget');

		$container.div({ class: 'descriptioncontainer' }, (div: Builder.Builder) => {
			this._element = div;
		});
		$container.div((div: Builder.Builder) => {
			this._quickFixSection = div;
		});
		$container.on(DOM.EventType.CLICK, () => {
			this.editor.focus();
		});
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

		// update label and show
		let text = strings.format('({0}/{1}) ', this._model.indexOf(marker) + 1, this._model.length());
		if (marker.source) {
			text = `${text}[${marker.source}] `;
		}
		this._element.text(text);
		var htmlElem = this._element.getHTMLElement();
		HtmlContentRenderer.renderHtml2(marker.message).forEach((node) => {
			htmlElem.appendChild(node);
		});

		var mode = this.editor.getModel().getMode();
		this._quickFixSection.hide();

		if (mode.quickFixSupport) {
			var promise = mode.quickFixSupport.getQuickFixes(this.editor.getModel().getAssociatedResource(), marker);
			promise.then((result: Modes.IQuickFix[]) => {
				this._quickFixSection.clearChildren();
				if (result.length > 0) {
					var container = $(this._quickFixSection);
					container.span({
						class: 'quickfixhead',
						text: result.length > 1 ? nls.localize('quickfix.multiple.label', 'Suggested fixes: ') : nls.localize('quickfix.single.label', 'Suggested fix: ')
					}).span({ class: 'quickfixcontainer' },(quickFixContainer: Builder.Builder) => {
						result.forEach((fix, idx, arr) => {
							var container = $(quickFixContainer);
							if (idx > 0) {
								container = container.span({ text: ', ' });
							}
							container.span({
								class: 'quickfixentry',
								text: fix.command.title
							}).on(DOM.EventType.CLICK,() => {
								mode.quickFixSupport.runQuickFixAction(this.editor.getModel().getAssociatedResource(), marker, fix).then(result => {
									return bulkEdit(this._eventService, this._editorService, this.editor, result.edits);
								});
								return true;
							});
						});
					});
					this._quickFixSection.show();
					this.show(new Position(marker.startLineNumber, marker.startColumn), 4);
				}
			},(error) => {
				Errors.onUnexpectedError(error);
			});
		}

		this._model.withoutWatchingEditorPosition(() => {
			this.show(new Position(marker.startLineNumber, marker.startColumn), 3);
		});
	}

	public dispose(): void {
		this._callOnDispose = lifecycle.disposeAll(this._callOnDispose);
		super.dispose();
	}
}

class MarkerNavigationAction extends EditorAction {

	private _isNext: boolean;

	private telemetryService:ITelemetryService;

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, next: boolean, @ITelemetryService telemetryService: ITelemetryService) {
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

class MarkerController implements EditorCommon.IEditorContribution {

	static ID = 'editor.contrib.markerController';

	static getMarkerController(editor:EditorCommon.ICommonCodeEditor): MarkerController {
		return <MarkerController>editor.getContribution(MarkerController.ID);
	}

	private eventService:IEventService;
	private editorService:IEditorService;
	private markerService: IMarkerService;
	private editor:EditorBrowser.ICodeEditor;
	private _model: MarkerModel;
	private _zone: MarkerNavigationWidget;
	private _callOnClose: lifecycle.IDisposable[] = [];
	private _markersNavigationVisible: IKeybindingContextKey<boolean>;

	constructor(
		editor: EditorBrowser.ICodeEditor, @IMarkerService markerService: IMarkerService, @IKeybindingService keybindingService: IKeybindingService,
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
		this._callOnClose = lifecycle.disposeAll(this._callOnClose);
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

		this._callOnClose.push(this.editor.addListener2(EditorCommon.EventType.ModelChanged, () => {
			this._cleanUp();
		}));

		this._model.onCurrentMarkerChanged(marker => !marker && this._cleanUp(), undefined, this._callOnClose);
		this.markerService.onMarkerChanged(this._onMarkerChanged, this, this._callOnClose);
		return this._model;	}

	public closeMarkersNavigation(): void {
		this._cleanUp();
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

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @ITelemetryService telemetryService: ITelemetryService) {
		super(descriptor, editor, true, telemetryService);
	}
}

class PrevMarkerAction extends MarkerNavigationAction {
	public static ID = 'editor.action.marker.prev';

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @ITelemetryService telemetryService: ITelemetryService) {
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
CommonEditorRegistry.registerEditorCommand('closeMarkersNavigation', CommonEditorRegistry.commandWeight(50), { primary: KeyCode.Escape }, false, CONTEXT_MARKERS_NAVIGATION_VISIBLE, (ctx, editor, args) => {
	var controller = MarkerController.getMarkerController(editor);
	controller.closeMarkersNavigation();
});

EditorBrowserRegistry.registerEditorContribution(MarkerController);