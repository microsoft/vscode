/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/iframeeditor';
import nls = require('vs/nls');
import {TPromise} from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import DOM = require('vs/base/browser/dom');
import {Dimension, Builder, $} from 'vs/base/browser/builder';
import errors = require('vs/base/common/errors');
import {EditorOptions, EditorInput} from 'vs/workbench/common/editor';
import {BaseEditor} from 'vs/workbench/browser/parts/editor/baseEditor';
import {IFrameEditorInput} from 'vs/workbench/common/editor/iframeEditorInput';
import {IFrameEditorModel} from 'vs/workbench/common/editor/iframeEditorModel';
import {IStorageService} from 'vs/platform/storage/common/storage';
import {Position} from 'vs/platform/editor/common/editor';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';

/**
 * An implementation of editor for showing HTML content in an IFrame by leveraging the IFrameEditorInput.
 */
export class IFrameEditor extends BaseEditor {

	public static ID = 'workbench.editors.iFrameEditor';

	private static RESOURCE_PROPERTY = 'resource';

	private iframeContainer: Builder;
	private iframeBuilder: Builder;
	private focusTracker: DOM.IFocusTracker;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IStorageService private storageService: IStorageService
	) {
		super(IFrameEditor.ID, telemetryService);
	}

	public getTitle(): string {
		return this.getInput() ? this.getInput().getName() : nls.localize('iframeEditor', "IFrame Viewer");
	}

	public createEditor(parent: Builder): void {

		// Container for IFrame
		let iframeContainerElement = document.createElement('div');
		iframeContainerElement.className = 'iframe-container monaco-editor-background'; // Inherit the background color from selected theme
		this.iframeContainer = $(iframeContainerElement);
		this.iframeContainer.tabindex(0); // enable focus support from the editor part (do not remove)

		// IFrame
		this.iframeBuilder = $(this.iframeContainer).element('iframe').addClass('iframe');
		this.iframeBuilder.attr({ 'frameborder': '0' });
		this.iframeBuilder.removeProperty(IFrameEditor.RESOURCE_PROPERTY);

		parent.getHTMLElement().appendChild(iframeContainerElement);
	}

	public setInput(input: EditorInput, options: EditorOptions): TPromise<void> {
		let oldInput = this.getInput();
		super.setInput(input, options);

		// Detect options
		let forceOpen = options && options.forceOpen;

		// Same Input
		if (!forceOpen && input.matches(oldInput)) {
			return TPromise.as<void>(null);
		}

		// Assert Input
		if (!(input instanceof IFrameEditorInput)) {
			return TPromise.wrapError<void>('Invalid editor input. IFrame editor requires an input instance of IFrameEditorInput.');
		}

		// Different Input (Reload)
		return this.doSetInput(input, true /* isNewInput */);
	}

	private doSetInput(input: EditorInput, isNewInput?: boolean): TPromise<void> {
		return this.editorService.resolveEditorModel(input, true /* Reload */).then((resolvedModel) => {

			// Assert Model interface
			if (!(resolvedModel instanceof IFrameEditorModel)) {
				return TPromise.wrapError<void>('Invalid editor input. IFrame editor requires a model instance of IFrameEditorModel.');
			}

			// Assert that the current input is still the one we expect. This prevents a race condition when loading takes long and another input was set meanwhile
			if (!this.getInput() || this.getInput() !== input) {
				return null;
			}

			// Set IFrame contents
			let iframeModel = <IFrameEditorModel>resolvedModel;
			let isUpdate = !isNewInput && !!this.iframeBuilder.getProperty(IFrameEditor.RESOURCE_PROPERTY);
			let contents = iframeModel.getContents();

			// Crazy hack to get keybindings to bubble out of the iframe to us
			contents.body = contents.body + this.enableKeybindings();

			// Set Contents
			try {
				this.setFrameContents(iframeModel.resource, isUpdate ? contents.body : [contents.head, contents.body, contents.tail].join('\n'), isUpdate /* body only */);
			} catch (error) {
				setTimeout(() => this.reload(true /* clear */), 1000); // retry in case of an error which indicates the iframe (only) might be on a different URL
			}

			// When content is fully replaced, we also need to recreate the focus tracker
			if (!isUpdate) {
				this.clearFocusTracker();
			}

			// Track focus on contents and make the editor active when focus is received
			if (!this.focusTracker) {
				this.focusTracker = DOM.trackFocus((<HTMLIFrameElement>this.iframeBuilder.getHTMLElement()).contentWindow);
				this.focusTracker.addFocusListener(() => {
					this.editorService.activateEditor(this.position);
				});
			}
		});
	}

	private setFrameContents(resource: URI, contents: string, isUpdate: boolean): void {
		let iframeWindow = (<HTMLIFrameElement>this.iframeBuilder.getHTMLElement()).contentWindow;

		// Update body only if this is an update of the same resource (preserves scroll position and does not flicker)
		if (isUpdate) {
			iframeWindow.document.body.innerHTML = contents;
		}

		// Write directly to iframe document replacing any previous content
		else {
			iframeWindow.document.open('text/html', 'replace');
			iframeWindow.document.write(contents);
			iframeWindow.document.close();

			// Reset scroll
			iframeWindow.scrollTo(0, 0);

			// Associate resource with iframe
			this.iframeBuilder.setProperty(IFrameEditor.RESOURCE_PROPERTY, resource.toString());
		}
	}

	private enableKeybindings(): string {
		return [
			'<script>',
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
			'});',
			'</script>'
		].join('\n');
	}

	public clearInput(): void {

		// Reset IFrame
		this.clearIFrame();

		super.clearInput();
	}

	private clearIFrame(): void {
		this.iframeBuilder.src('about:blank');
		this.iframeBuilder.removeProperty(IFrameEditor.RESOURCE_PROPERTY);

		// Focus Listener
		this.clearFocusTracker();
	}

	private clearFocusTracker(): void {
		if (this.focusTracker) {
			this.focusTracker.dispose();
			this.focusTracker = null;
		}
	}

	public layout(dimension: Dimension): void {

		// Pass on to IFrame Container and IFrame
		this.iframeContainer.size(dimension.width, dimension.height);
		this.iframeBuilder.size(dimension.width, dimension.height);
	}

	public focus(): void {
		this.iframeContainer.domFocus();
	}

	public changePosition(position: Position): void {
		super.changePosition(position);

		// reparenting an IFRAME into another DOM element yields weird results when the contents are made
		// of a string and not a URL. to be on the safe side we reload the iframe when the position changes
		// and we do it using a timeout of 0 to reload only after the position has been changed in the DOM
		setTimeout(() => this.reload(true));
	}

	public supportsSplitEditor(): boolean {
		return true;
	}

	/**
	 * Reloads the contents of the iframe in this editor by reapplying the input.
	 */
	public reload(clearIFrame?: boolean): void {
		if (this.input) {
			if (clearIFrame) {
				this.clearIFrame();
			}

			this.doSetInput(this.input).done(null, errors.onUnexpectedError);
		}
	}

	public dispose(): void {

		// Destroy Container
		this.iframeContainer.destroy();

		// Focus Listener
		this.clearFocusTracker();

		super.dispose();
	}
}