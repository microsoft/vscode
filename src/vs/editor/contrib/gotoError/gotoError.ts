/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./gotoError';
import * as nls from 'vs/nls';
import { Emitter } from 'vs/base/common/event';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import URI from 'vs/base/common/uri';
import * as dom from 'vs/base/browser/dom';
import { RawContextKey, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IMarker, IMarkerService } from 'vs/platform/markers/common/markers';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { registerEditorAction, registerEditorContribution, ServicesAccessor, IActionOptions, EditorAction, EditorCommand, registerEditorCommand } from 'vs/editor/browser/editorExtensions';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ZoneWidget } from 'vs/editor/contrib/zoneWidget/zoneWidget';
import { registerColor, oneOf } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService, ITheme } from 'vs/platform/theme/common/themeService';
import { Color } from 'vs/base/common/color';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { AccessibilitySupport } from 'vs/base/common/platform';
import { editorErrorForeground, editorErrorBorder, editorWarningForeground, editorWarningBorder, editorInfoForeground, editorInfoBorder } from 'vs/editor/common/view/editorColorRegistry';
import { ScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';

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
		this._markers.sort((left, right) => Severity.compare(left.severity, right.severity) || Range.compareRangesUsingStarts(left, right));

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
				this._nextIdx = i + (fwd ? 0 : -1);
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

	private move(fwd: boolean): void {
		if (!this.canNavigate()) {
			this._onCurrentMarkerChanged.fire(undefined);
			return;
		}

		if (this._nextIdx === -1) {
			this._initIdx(fwd);

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
		const marker = this._markers[this._nextIdx];
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

	public reveal(): void {

		if (this._nextIdx === -1) {
			return;
		}

		this.withoutWatchingEditorPosition(() => {
			const pos = new Position(this._markers[this._nextIdx].startLineNumber, this._markers[this._nextIdx].startColumn);
			this._editor.setPosition(pos);
			this._editor.revealPositionInCenter(pos, editorCommon.ScrollType.Smooth);
		});
	}

	public dispose(): void {
		this._toUnbind = dispose(this._toUnbind);
	}
}

class MessageWidget {

	lines: number = 0;
	longestLineLength: number = 0;

	private readonly _editor: ICodeEditor;
	private readonly _domNode: HTMLElement;
	private readonly _scrollable: ScrollableElement;
	private readonly _disposables: IDisposable[] = [];

	constructor(parent: HTMLElement, editor: ICodeEditor) {
		this._editor = editor;

		this._domNode = document.createElement('span');
		this._domNode.className = 'descriptioncontainer';
		this._domNode.setAttribute('aria-live', 'assertive');
		this._domNode.setAttribute('role', 'alert');

		this._scrollable = new ScrollableElement(this._domNode, {
			horizontal: ScrollbarVisibility.Auto,
			vertical: ScrollbarVisibility.Hidden,
			useShadows: false,
			horizontalScrollbarSize: 3
		});
		dom.addClass(this._scrollable.getDomNode(), 'block');
		parent.appendChild(this._scrollable.getDomNode());
		this._disposables.push(this._scrollable.onScroll(e => this._domNode.style.left = `-${e.scrollLeft}px`));
		this._disposables.push(this._scrollable);
	}

	dispose(): void {
		dispose(this._disposables);
	}

	update({ source, message }: IMarker): void {

		if (source) {
			this.lines = 0;
			this.longestLineLength = 0;
			const indent = new Array(source.length + 3 + 1).join(' ');
			const lines = message.split(/\r\n|\r|\n/g);
			for (let i = 0; i < lines.length; i++) {
				let line = lines[i];
				this.lines += 1;
				this.longestLineLength = Math.max(line.length, this.longestLineLength);
				if (i === 0) {
					message = `[${source}] ${line}`;
				} else {
					message += `\n${indent}${line}`;
				}
			}
		} else {
			this.lines = 1;
			this.longestLineLength = message.length;
		}

		this._domNode.innerText = message;
		this._editor.applyFontInfo(this._domNode);
		const width = Math.floor(this._editor.getConfiguration().fontInfo.typicalFullwidthCharacterWidth * this.longestLineLength);
		this._scrollable.setScrollDimensions({ scrollWidth: width });
	}

	layout(height: number, width: number): void {
		this._scrollable.setScrollDimensions({ width });
	}
}

class MarkerNavigationWidget extends ZoneWidget {

	private _parentContainer: HTMLElement;
	private _container: HTMLElement;
	private _title: HTMLElement;
	private _message: MessageWidget;
	private _callOnDispose: IDisposable[] = [];
	private _severity: Severity;
	private _backgroundColor: Color;

	constructor(
		editor: ICodeEditor,
		private _model: MarkerModel,
		private _themeService: IThemeService
	) {
		super(editor, { showArrow: true, showFrame: true, isAccessible: true });
		this._severity = Severity.Warning;
		this._backgroundColor = Color.white;

		this._applyTheme(_themeService.getTheme());
		this._callOnDispose.push(_themeService.onThemeChange(this._applyTheme.bind(this)));

		this.create();
		this._wireModelAndView();
	}

	private _applyTheme(theme: ITheme) {
		this._backgroundColor = theme.getColor(editorMarkerNavigationBackground);
		let colorId = editorMarkerNavigationError;
		if (this._severity === Severity.Warning) {
			colorId = editorMarkerNavigationWarning;
		} else if (this._severity === Severity.Info) {
			colorId = editorMarkerNavigationInfo;
		}
		let frameColor = theme.getColor(colorId);
		this.style({
			arrowColor: frameColor,
			frameColor: frameColor
		}); // style() will trigger _applyStyles
	}

	protected _applyStyles(): void {
		if (this._parentContainer) {
			this._parentContainer.style.backgroundColor = this._backgroundColor.toString();
		}
		super._applyStyles();
	}

	dispose(): void {
		this._callOnDispose = dispose(this._callOnDispose);
		super.dispose();
	}

	focus(): void {
		this._parentContainer.focus();
	}

	protected _fillContainer(container: HTMLElement): void {
		this._parentContainer = container;
		dom.addClass(container, 'marker-widget');
		this._parentContainer.tabIndex = 0;
		this._parentContainer.setAttribute('role', 'tooltip');

		this._container = document.createElement('div');
		container.appendChild(this._container);

		this._title = document.createElement('div');
		this._title.className = 'block title';
		this._container.appendChild(this._title);

		this._message = new MessageWidget(this._container, this.editor);
		this._disposables.push(this._message);
	}

	show(where: Position, heightInLines: number): void {
		super.show(where, heightInLines);
		if (this.editor.getConfiguration().accessibilitySupport !== AccessibilitySupport.Disabled) {
			this.focus();
		}
	}

	private _wireModelAndView(): void {
		// listen to events
		this._model.onCurrentMarkerChanged(this.showAtMarker, this, this._callOnDispose);
		this._model.onMarkerSetChanged(this._onMarkersChanged, this, this._callOnDispose);
	}

	public showAtMarker(marker: IMarker): void {

		if (!marker) {
			return;
		}

		// update:
		// * title
		// * message
		this._container.classList.remove('stale');
		this._title.innerHTML = nls.localize('title.wo_source', "({0}/{1})", this._model.indexOf(marker), this._model.total);
		this._message.update(marker);

		this._model.withoutWatchingEditorPosition(() => {
			// update frame color (only applied on 'show')
			this._severity = marker.severity;
			this._applyTheme(this._themeService.getTheme());

			this.show(new Position(marker.startLineNumber, marker.startColumn), this.computeRequiredHeight());
		});
	}

	private _onMarkersChanged(): void {
		const marker = this._model.findMarkerAtPosition(this.position);
		if (marker) {
			this._container.classList.remove('stale');
			this._message.update(marker);
		} else {
			this._container.classList.add('stale');
		}
		this._relayout();
	}

	protected _doLayout(heightInPixel: number, widthInPixel: number): void {
		this._message.layout(heightInPixel, widthInPixel);
	}

	protected _relayout(): void {
		super._relayout(this.computeRequiredHeight());
	}

	private computeRequiredHeight() {
		return 1 + this._message.lines;
	}
}

class MarkerNavigationAction extends EditorAction {

	private _isNext: boolean;

	constructor(next: boolean, opts: IActionOptions) {
		super(opts);
		this._isNext = next;
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const controller = MarkerController.get(editor);
		if (!controller) {
			return;
		}

		let model = controller.getOrCreateModel();
		if (model) {
			if (this._isNext) {
				model.next();
			} else {
				model.previous();
			}
			model.reveal();
		}
	}
}

class MarkerController implements editorCommon.IEditorContribution {

	private static readonly ID = 'editor.contrib.markerController';

	public static get(editor: ICodeEditor): MarkerController {
		return editor.getContribution<MarkerController>(MarkerController.ID);
	}

	private _editor: ICodeEditor;
	private _model: MarkerModel;
	private _zone: MarkerNavigationWidget;
	private _callOnClose: IDisposable[] = [];
	private _markersNavigationVisible: IContextKey<boolean>;

	constructor(
		editor: ICodeEditor,
		@IMarkerService private readonly _markerService: IMarkerService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IThemeService private readonly _themeService: IThemeService
	) {
		this._editor = editor;
		this._markersNavigationVisible = CONTEXT_MARKERS_NAVIGATION_VISIBLE.bindTo(this._contextKeyService);
	}

	public getId(): string {
		return MarkerController.ID;
	}

	public dispose(): void {
		this._cleanUp();
	}

	private _cleanUp(): void {
		this._markersNavigationVisible.reset();
		this._callOnClose = dispose(this._callOnClose);
		this._zone = null;
		this._model = null;
	}

	public getOrCreateModel(): MarkerModel {

		if (this._model) {
			return this._model;
		}

		const markers = this._getMarkers();
		this._model = new MarkerModel(this._editor, markers);
		this._zone = new MarkerNavigationWidget(this._editor, this._model, this._themeService);
		this._markersNavigationVisible.set(true);

		this._callOnClose.push(this._model);
		this._callOnClose.push(this._zone);

		this._callOnClose.push(this._editor.onDidChangeModel(() => this._cleanUp()));
		this._model.onCurrentMarkerChanged(marker => !marker && this._cleanUp(), undefined, this._callOnClose);
		this._markerService.onMarkerChanged(this._onMarkerChanged, this, this._callOnClose);
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

// theming

let errorDefault = oneOf(editorErrorForeground, editorErrorBorder);
let warningDefault = oneOf(editorWarningForeground, editorWarningBorder);
let infoDefault = oneOf(editorInfoForeground, editorInfoBorder);

export const editorMarkerNavigationError = registerColor('editorMarkerNavigationError.background', { dark: errorDefault, light: errorDefault, hc: errorDefault }, nls.localize('editorMarkerNavigationError', 'Editor marker navigation widget error color.'));
export const editorMarkerNavigationWarning = registerColor('editorMarkerNavigationWarning.background', { dark: warningDefault, light: warningDefault, hc: warningDefault }, nls.localize('editorMarkerNavigationWarning', 'Editor marker navigation widget warning color.'));
export const editorMarkerNavigationInfo = registerColor('editorMarkerNavigationInfo.background', { dark: infoDefault, light: infoDefault, hc: infoDefault }, nls.localize('editorMarkerNavigationInfo', 'Editor marker navigation widget info color.'));
export const editorMarkerNavigationBackground = registerColor('editorMarkerNavigation.background', { dark: '#2D2D30', light: Color.white, hc: '#0C141F' }, nls.localize('editorMarkerNavigationBackground', 'Editor marker navigation widget background.'));
