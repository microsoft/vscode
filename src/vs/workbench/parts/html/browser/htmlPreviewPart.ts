/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {localize} from 'vs/nls';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {IModel, EventType} from 'vs/editor/common/editorCommon';
import {Dimension, Builder} from 'vs/base/browser/builder';
import {empty as EmptyDisposable} from 'vs/base/common/lifecycle';
import {addDisposableListener} from 'vs/base/browser/dom';
import {EditorOptions, EditorInput} from 'vs/workbench/common/editor';
import {BaseEditor} from 'vs/workbench/browser/parts/editor/baseEditor';
import {Position} from 'vs/platform/editor/common/editor';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
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
	private _iFrameMessageSubscription = EmptyDisposable;
	private _iFrameBase: URI;

	private _model: IModel;
	private _lastModelVersion: number;
	private _modelChangeSubscription = EmptyDisposable;
	private _themeChangeSubscription = EmptyDisposable;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IStorageService storageService: IStorageService,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		super(HtmlPreviewPart.ID, telemetryService);

		this._editorService = editorService;
		this._storageService = storageService;
		this._iFrameBase = contextService.toResource('/');
	}

	dispose(): void {
		// remove from dom
		const element = this._iFrameElement.parentElement;
		element.parentElement.removeChild(element);

		// unhook from model
		this._modelChangeSubscription.dispose();
		this._model = undefined;

		this._themeChangeSubscription.dispose();
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

		this._themeChangeSubscription = this._storageService.addListener2(StorageEventType.STORAGE, event => {
			if (event.key === Preferences.THEME && this.isVisible()) {
				this._updateIFrameContent(true);
			}
		});

		this._iFrameMessageSubscription = addDisposableListener(window, 'message', e => {

			if (e.source !== this._iFrameElement.contentWindow) {
				return;
			}

			const fakeEvent = <any>document.createEvent('KeyboardEvent');		// create a keyboard event
			Object.defineProperty(fakeEvent, 'keyCode', {						// we need to set some properties that Chrome wants
				get: function() {
					return e.data.keyCode;
				}
			});
			Object.defineProperty(fakeEvent, 'which', {
				get: function() {
					return e.data.keyCode;
				}
			});
			Object.defineProperty(fakeEvent, 'target', {
				get: function() {
					return window && window.parent.document.body;
				}
			});
			fakeEvent.initKeyboardEvent('keydown', true, true, document.defaultView, null, null,
				e.data.ctrlKey, e.data.altKey, e.data.shiftKey, e.data.metaKey); // the API shape of this method is not clear to me, but it works

			document.dispatchEvent(fakeEvent);
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
				this._modelChangeSubscription = this._model.addListener2(EventType.ModelContentChanged2, () => this._updateIFrameContent());
				this._updateIFrameContent();
			} else {
				this._modelChangeSubscription.dispose();
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
		this._modelChangeSubscription.dispose();
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

			this._modelChangeSubscription = this._model.addListener2(EventType.ModelContentChanged2, () => this._updateIFrameContent());
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

		const parser = new DOMParser();
		const newDocument = parser.parseFromString(html, 'text/html');
		// ensure styles
		const styleElement = Integration.defaultStyle(this._iFrameElement.parentElement, this._storageService.get(Preferences.THEME, StorageScope.GLOBAL, DEFAULT_THEME_ID));
		if (newDocument.head.hasChildNodes()) {
			newDocument.head.insertBefore(styleElement, newDocument.head.firstChild);
		} else {
			newDocument.head.appendChild(styleElement);
		}
		// set baseurl if possible
		if (this._iFrameBase) {
			const baseElement = document.createElement('base');
			baseElement.href = this._iFrameBase.toString();
			newDocument.head.appendChild(baseElement);
		}
		// propagate key events
		newDocument.body.appendChild(Integration.bubbleKeybindings);

		// write new content to iframe
		iFrameDocument.open('text/html', 'replace');
		iFrameDocument.write(newDocument.documentElement.innerHTML);
		iFrameDocument.close();

		this._lastModelVersion = this._model.getVersionId();
	}
}

namespace Integration {

	'use strict';

	// scripts

	export const bubbleKeybindings = document.createElement('script');
	bubbleKeybindings.innerHTML = `
		var ignoredKeys = [9 /* tab */, 32 /* space */, 33 /* page up */, 34 /* page down */, 38 /* up */, 40 /* down */];
		var ignoredCtrlCmdKeys = [65 /* a */, 67 /* c */];
		var ignoredShiftKeys = [9 /* tab */];
		window.document.body.addEventListener("keydown", function(event) {
			try {
				if (!event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey && ignoredKeys.some(function(i) {return i === event.keyCode;})) {
						return;
				}
				if ((event.ctrlKey || event.metaKey) && ignoredCtrlCmdKeys.some(function(i) { return i === event.keyCode; })) {
						return;
				}
				if (event.shiftKey && ignoredShiftKeys.some(function(i) { return i === event.keyCode; })) {
					return;
				}
				event.preventDefault();
				window.parent.postMessage({ which: event.which, keyCode: event.keyCode, charCode: event.charCode, metaKey: event.metaKey, altKey: event.altKey, shiftKey: event.shiftKey, ctrlKey: event.ctrlKey }, "*");
			} catch (error) { }
		});
		function defaultPreventHandler(e) { e.preventDefault(); };
		window.document.addEventListener("dragover", defaultPreventHandler);
		window.document.addEventListener("drop", defaultPreventHandler);
		window.document.body.addEventListener("dragover", defaultPreventHandler);
		window.document.body.addEventListener("drop", defaultPreventHandler);
	`;

	// styles

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
