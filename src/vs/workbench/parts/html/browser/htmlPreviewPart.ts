/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

// import 'vs/css!./media/iframeeditor';
import {localize} from 'vs/nls';
import {TPromise} from 'vs/base/common/winjs.base';
import {IModel, EventType} from 'vs/editor/common/editorCommon';
import {Dimension, Builder} from 'vs/base/browser/builder';
import {cAll} from 'vs/base/common/lifecycle';
import {EditorOptions, EditorInput} from 'vs/workbench/common/editor';
import {BaseEditor} from 'vs/workbench/browser/parts/editor/baseEditor';
import {Position} from 'vs/platform/editor/common/editor';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IStorageService, StorageEventType, StorageScope} from 'vs/platform/storage/common/storage';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {BaseTextEditorModel} from 'vs/workbench/common/editor/textEditorModel';
import {Preferences} from 'vs/workbench/common/constants';
import {HtmlInput} from 'vs/workbench/parts/html/common/htmlInput';
import {isLightTheme} from 'vs/platform/theme/common/themes';
import {DEFAULT_THEME_ID} from 'vs/workbench/services/themes/common/themeService';
/**
 * An implementation of editor for showing HTML content in an IFrame by leveraging the IFrameEditorInput.
 */
export class HtmlPreviewPart extends BaseEditor {

	static ID: string = 'workbench.editor.htmlPreviewPart';

	private _editorService: IWorkbenchEditorService;
	private _storageService: IStorageService;
	private _iFrameElement: HTMLIFrameElement;

	private _model: IModel;
	private _modelChangeUnbind: Function;
	private _lastModelVersion: number;
	private _themeChangeUnbind: Function;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IStorageService storageService: IStorageService
	) {
		super(HtmlPreviewPart.ID, telemetryService);

		this._editorService = editorService;
		this._storageService = storageService;
	}

	dispose(): void {
		// remove from dome
		const element = this._iFrameElement.parentElement;
		element.parentElement.removeChild(element);

		// unhook from model
		this._modelChangeUnbind = cAll(this._modelChangeUnbind);
		this._model = undefined;

		this._themeChangeUnbind = cAll(this._themeChangeUnbind);
	}

	public createEditor(parent: Builder): void {

		// IFrame
		// this.iframeBuilder.removeProperty(IFrameEditor.RESOURCE_PROPERTY);
		this._iFrameElement = document.createElement('iframe');
		this._iFrameElement.setAttribute('frameborder', '0');
		this._iFrameElement.className = 'iframe';

		// Container for IFrame
		const iFrameContainerElement = document.createElement('div');
		iFrameContainerElement.className = 'iframe-container monaco-editor-background'; // Inherit the background color from selected theme
		iFrameContainerElement.tabIndex = 0; // enable focus support from the editor part (do not remove)
		iFrameContainerElement.appendChild(this._iFrameElement);

		parent.getHTMLElement().appendChild(iFrameContainerElement);

		this._themeChangeUnbind = this._storageService.addListener(StorageEventType.STORAGE, event => {
			if (event.key === Preferences.THEME && this.isVisible()) {
				this._updateIFrameContent(true);
			}
		});
	}

	public layout(dimension: Dimension): void {
		let {width, height} = dimension;
		this._iFrameElement.parentElement.style.width = `${width}px`;
		this._iFrameElement.parentElement.style.height = `${height}px`;
		this._iFrameElement.style.width = `${width}px`;
		this._iFrameElement.style.height = `${height}px`;
	}

	public focus(): void {
		// this.iframeContainer.domFocus();
		this._iFrameElement.focus();
	}

	// --- input

	public getTitle(): string {
		if (!this.input) {
			return localize('iframeEditor', 'Preview Html');
		}
		return this.input.getName();
	}

	public setVisible(visible: boolean, position?: Position): TPromise<void> {
		return super.setVisible(visible, position).then(() => {
			if (visible && this._model) {
				this._modelChangeUnbind = this._model.addListener(EventType.ModelContentChanged2, () => this._updateIFrameContent());
				this._updateIFrameContent();
			} else {
				this._modelChangeUnbind = cAll(this._modelChangeUnbind);
			}
		});
	}

	public changePosition(position: Position): void {
		super.changePosition(position);

		// reparenting an IFRAME into another DOM element yields weird results when the contents are made
		// of a string and not a URL. to be on the safe side we reload the iframe when the position changes
		// and we do it using a timeout of 0 to reload only after the position has been changed in the DOM
		setTimeout(() => {
			this._updateIFrameContent(true);
		}, 0);
	}

	public setInput(input: EditorInput, options: EditorOptions): TPromise<void> {

		this._model = undefined;
		this._modelChangeUnbind = cAll(this._modelChangeUnbind);
		this._lastModelVersion = -1;

		if (!(input instanceof HtmlInput)) {
			return TPromise.wrapError<void>('Invalid input');
		}

		return this._editorService.resolveEditorModel({ resource: (<HtmlInput>input).getResource() }).then(model => {
			if (model instanceof BaseTextEditorModel) {
				this._model = model.textEditorModel;
			}

			if (!this._model) {
				return TPromise.wrapError<void>(localize('html.voidInput', "Invalid editor input."));
			}

			this._modelChangeUnbind = this._model.addListener(EventType.ModelContentChanged2, () => this._updateIFrameContent());
			this._updateIFrameContent();

			return super.setInput(input, options);
		});
	}

	private _updateIFrameContent(refresh: boolean = false): void {

		if (!this._model || (!refresh && this._lastModelVersion === this._model.getVersionId())) {
			// nothing to do
			return;
		}

		const html = this._model.getValue();
		const iFrameDocument = this._iFrameElement.contentDocument;

		if (!iFrameDocument) {
			// not visible anymore
			return;
		}

		// the very first time we load just our script
		// to integrate with the outside world
		if ((<HTMLElement>iFrameDocument.firstChild).innerHTML === '<head></head><body></body>') {
			iFrameDocument.open('text/html', 'replace');
			iFrameDocument.write(Integration.defaultHtml());
			iFrameDocument.close();
		}

		// diff a little against the current input and the new state
		const parser = new DOMParser();
		const newDocument = parser.parseFromString(html, 'text/html');
		const styleElement = Integration.defaultStyle(this._iFrameElement.parentElement, this._storageService.get(Preferences.THEME, StorageScope.GLOBAL, DEFAULT_THEME_ID));
		if (newDocument.head.hasChildNodes()) {
			newDocument.head.insertBefore(styleElement, newDocument.head.firstChild);
		} else {
			newDocument.head.appendChild(styleElement);
		}

		if (newDocument.head.innerHTML !== iFrameDocument.head.innerHTML) {
			iFrameDocument.head.innerHTML = newDocument.head.innerHTML;
		}
		if (newDocument.body.innerHTML !== iFrameDocument.body.innerHTML) {
			iFrameDocument.body.innerHTML = newDocument.body.innerHTML;
		}

		this._lastModelVersion = this._model.getVersionId();
	}
}

namespace Integration {

	'use strict';

	const scriptSource = [
		'var ignoredKeys = [9 /* tab */, 32 /* space */, 33 /* page up */, 34 /* page down */, 38 /* up */, 40 /* down */];',
		'var ignoredCtrlCmdKeys = [65 /* a */, 67 /* c */];',
		'var ignoredShiftKeys = [9 /* tab */];',
		'window.document.body.addEventListener("keydown", function(event) {',		// Listen to keydown events in the iframe
		'	try {',
		'		if (ignoredKeys.some(function(i) { return i === event.keyCode; })) {',
		'			if (!event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey) {',
		'				return;',													// we want some single keys to be supported (e.g. Page Down for scrolling)
		'			}',
		'		}',
		'',
		'		if (ignoredCtrlCmdKeys.some(function(i) { return i === event.keyCode; })) {',
		'			if (event.ctrlKey || event.metaKey) {',
		'				return;',													// we want some ctrl/cmd keys to be supported (e.g. Ctrl+C for copy)
		'			}',
		'		}',
		'',
		'		if (ignoredShiftKeys.some(function(i) { return i === event.keyCode; })) {',
		'			if (event.shiftKey) {',
		'				return;',													// we want some shift keys to be supported (e.g. Shift+Tab for copy)
		'			}',
		'		}',
		'',
		'		event.preventDefault();',											// very important to not get duplicate actions when this one bubbles up!
		'',
		'		var fakeEvent = document.createEvent("KeyboardEvent");',			// create a keyboard event
		'		Object.defineProperty(fakeEvent, "keyCode", {',						// we need to set some properties that Chrome wants
		'			get : function() {',
		'				return event.keyCode;',
		'			}',
		'		});',
		'		Object.defineProperty(fakeEvent, "which", {',
		'			get : function() {',
		'				return event.keyCode;',
		'			}',
		'		});',
		'		Object.defineProperty(fakeEvent, "target", {',
		'			get : function() {',
		'				return window && window.parent.document.body;',
		'			}',
		'		});',
		'',
		'		fakeEvent.initKeyboardEvent("keydown", true, true, document.defaultView, null, null, event.ctrlKey, event.altKey, event.shiftKey, event.metaKey);', // the API shape of this method is not clear to me, but it works ;)
		'',
		'		window.parent.document.dispatchEvent(fakeEvent);',					// dispatch the event onto the parent
		'	} catch (error) {}',
		'});',

		// disable dropping into iframe!
		'window.document.addEventListener("dragover", function (e) {',
		'	e.preventDefault();',
		'});',
		'window.document.addEventListener("drop", function (e) {',
		'	e.preventDefault();',
		'});',
		'window.document.body.addEventListener("dragover", function (e) {',
		'	e.preventDefault();',
		'});',
		'window.document.body.addEventListener("drop", function (e) {',
		'	e.preventDefault();',
		'});'
	];

	export function defaultHtml() {
		let all = [
			'<html><head></head><body><script>',
			...scriptSource,
			'</script></body></html>',
		];
		return all.join('\n');
	}

	const defaultLightScrollbarStyle = [
		'::-webkit-scrollbar-thumb {',
		'	background-color: rgba(100, 100, 100, 0.4);',
		'}',
		'::-webkit-scrollbar-thumb:hover {',
		'	background-color: rgba(100, 100, 100, 0.7);',
		'}',
		'::-webkit-scrollbar-thumb:active {',
		'	background-color: rgba(0, 0, 0, 0.6);',
		'}'
	].join('\n');

	const defaultDarkScrollbarStyle = [
		'::-webkit-scrollbar-thumb {',
		'	background-color: rgba(121, 121, 121, 0.4);',
		'}',
		'::-webkit-scrollbar-thumb:hover {',
		'	background-color: rgba(100, 100, 100, 0.7);',
		'}',
		'::-webkit-scrollbar-thumb:active {',
		'	background-color: rgba(85, 85, 85, 0.8);',
		'}'
	].join('\n');

	export function defaultStyle(element: HTMLElement, themeId: string): HTMLStyleElement {
		const styles = window.getComputedStyle(element);
		const styleElement = document.createElement('style');

		styleElement.innerHTML = `* {
			color: ${styles.color};
			background: ${styles.background};
			font-family: ${styles.fontFamily};
			font-size: ${styles.fontSize};
		}
		img {
			max-width: 100%;
			max-height: 100%;
		}
		a:focus,
		input:focus,
		select:focus,
		textarea:focus {
			outline: 1px solid -webkit-focus-ring-color;
			outline-offset: -1px;
		}
		::-webkit-scrollbar {
			width: 14px;
			height: 14px;
		}
		${isLightTheme(themeId)
			? defaultLightScrollbarStyle
			: defaultDarkScrollbarStyle}`;
		return styleElement;
	}
}
