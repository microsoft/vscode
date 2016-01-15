/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

// import 'vs/css!./media/iframeeditor';
import {localize} from 'vs/nls';
import {TPromise} from 'vs/base/common/winjs.base';
import {IModel} from 'vs/editor/common/editorCommon';
import URI from 'vs/base/common/uri';
import {Dimension, Builder} from 'vs/base/browser/builder';
import * as DOM from 'vs/base/browser/dom';
import * as errors from 'vs/base/common/errors';
import {EditorOptions, EditorInput} from 'vs/workbench/common/editor';
import {EditorInputAction, BaseEditor} from 'vs/workbench/browser/parts/editor/baseEditor';
import {IFrameEditorInput} from 'vs/workbench/common/editor/iframeEditorInput';
import {IFrameEditorModel} from 'vs/workbench/common/editor/iframeEditorModel';
import {Position} from 'vs/platform/editor/common/editor';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {ResourceEditorModel} from 'vs/workbench/common/editor/resourceEditorModel';
import {HtmlInput} from 'vs/workbench/parts/html/common/htmlInput';

/**
 * An implementation of editor for showing HTML content in an IFrame by leveraging the IFrameEditorInput.
 */
export class HtmlPreviewPart extends BaseEditor {

	static ID: string = 'workbench.editor.htmlPreviewPart';

	private _iFrameElement: HTMLIFrameElement;
	private _editorService: IWorkbenchEditorService;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService
	) {
		super(HtmlPreviewPart.ID, telemetryService);

		this._editorService = editorService;
	}

	dispose(): void {
		// remove from dome
		const element = this._iFrameElement.parentElement;
		element.parentElement.removeChild(element);
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
		iFrameContainerElement.tabIndex = 0;
		iFrameContainerElement.appendChild(this._iFrameElement);

		parent.getHTMLElement().appendChild(iFrameContainerElement);
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

	public setInput(input: EditorInput, options: EditorOptions): TPromise<void> {

		if (!(input instanceof HtmlInput)) {
			return TPromise.wrapError<void>('Invalid input');
		}

		return this._editorService.resolveEditorModel(input).then(model => {
			let textModel: IModel;
			if (model instanceof ResourceEditorModel) {
				textModel = model.textEditorModel
			}

			if (!textModel) {
				return TPromise.wrapError<void>(localize('html.voidInput', "Invalid editor input."));
			}

			let parser = new DOMParser();
			let newDocument = parser.parseFromString(textModel.getValue(), 'text/html');
			// newDocument.body.appendChild(KeybindingEnabler.script());

			let iFrameDocument = this._iFrameElement.contentWindow.document;
			if ((<HTMLElement>iFrameDocument.firstChild).innerHTML === '<head></head><body></body>') {
				iFrameDocument.open('text/html', 'replace');
				iFrameDocument.write(KeybindingEnabler.defaultHtml());
				iFrameDocument.close();
			}

			if (newDocument.head.innerHTML !== iFrameDocument.head.innerHTML) {
				iFrameDocument.head.innerHTML = newDocument.head.innerHTML;
			}
			if (newDocument.body.innerHTML !== iFrameDocument.body.innerHTML) {
				iFrameDocument.body.innerHTML = newDocument.body.innerHTML;
			}

			return super.setInput(input, options);
		});
	}
}

namespace KeybindingEnabler {

	'use strict';

	const scriptSource = [
		'var ignoredKeys = [32 /* space */, 33 /* page up */, 34 /* page down */, 38 /* up */, 40 /* down */];',
		'var ignoredCtrlCmdKeys = [67 /* c */];',
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
		'});',
	];

	export function defaultHtml() {
		let all = [
			'<html><head></head><body><script>',
			...scriptSource,
			'</script></body></html>',
		];
		return all.join('\n');
	}

	export function script() {
		let result = document.createElement('script');
		result.innerHTML = scriptSource.join('\n');
		return result;
	}
}
