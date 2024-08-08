/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as browser from 'vs/base/browser/browser';
import * as dom from 'vs/base/browser/dom';
import { DomEmitter } from 'vs/base/browser/event';
import { inputLatency } from 'vs/base/browser/performance';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { ICompleteHiddenAreaWrapper } from 'vs/editor/browser/controller/editContext/editContextInput';
import { ViewContext } from 'vs/editor/common/viewModel/viewContext';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { IModelDeltaDecoration } from 'vs/editor/common/model';

export namespace NativeAreaSyntethicEvents {
	export const Tap = '-monaco-textarea-synthetic-tap';
}

export class NativeAreaWrapper extends Disposable implements ICompleteHiddenAreaWrapper {

	public readonly onKeyDown = this._register(new DomEmitter(this._actual, 'keydown')).event;
	public readonly onKeyPress = this._register(new DomEmitter(this._actual, 'keypress')).event;
	public readonly onKeyUp = this._register(new DomEmitter(this._actual, 'keyup')).event;
	public readonly onBeforeInput = this._register(new DomEmitter(this._actual, 'beforeinput')).event;
	public readonly onCut = this._register(new DomEmitter(this._actual, 'cut')).event;
	public readonly onCopy = this._register(new DomEmitter(this._actual, 'copy')).event;
	public readonly onPaste = this._register(new DomEmitter(this._actual, 'paste')).event;
	public readonly onFocus = this._register(new DomEmitter(this._actual, 'focus')).event;
	public readonly onBlur = this._register(new DomEmitter(this._actual, 'blur')).event;

	// The listeners which will be fired through the edit context

	private readonly _onCompositionStart = this._register(new Emitter<{ data: string }>());
	public readonly onCompositionStart = this._onCompositionStart.event;

	private readonly _onCompositionEnd = this._register(new Emitter<CompositionEvent>());
	public readonly onCompositionEnd = this._onCompositionEnd.event;

	private readonly _onCompositionUpdate = this._register(new Emitter<CompositionEvent>());
	public readonly onCompositionUpdate = this._onCompositionUpdate.event;

	private readonly _onInput = this._register(new Emitter<{
		timeStamp: number;
		type: string;
		data: string;
		inputType: string;
		isComposing: boolean;
	}>());
	public readonly onInput = this._onInput.event;

	public get ownerDocument(): Document {
		return this._actual.ownerDocument;
	}

	private _onSyntheticTap = this._register(new Emitter<void>());
	public readonly onSyntheticTap: Event<void> = this._onSyntheticTap.event;

	private _ignoreSelectionChangeTime: number;

	private _selectionBoundsElement: HTMLElement | undefined;
	private _controlBoundsElement: HTMLElement | undefined;

	// ---
	private readonly _editContext: EditContext = this._actual.editContext = new EditContext();
	private _contentLeft: number;
	private _isComposing: boolean = false;

	private _selectionEnd: number = 0;
	private _selectionStart: number = 0;

	constructor(
		private readonly _actual: HTMLDivElement,
		private readonly _viewContext: ViewContext
	) {
		super();
		this._ignoreSelectionChangeTime = 0;

		this._register(this.onKeyDown(() => inputLatency.onKeyDown()));
		this._register(this.onBeforeInput(() => inputLatency.onBeforeInput()));
		this._register(this.onInput(() => inputLatency.onInput()));
		this._register(this.onKeyUp(() => inputLatency.onKeyUp()));

		this._register(dom.addDisposableListener(this._actual, NativeAreaSyntethicEvents.Tap, () => this._onSyntheticTap.fire()));

		this._register(editContextAddDisposableListener(this._editContext, 'textformatupdate', e => {
			this._handleTextFormatUpdate(e);
		}));
		this._register(editContextAddDisposableListener(this._editContext, 'characterboundsupdate', e => { }));

		this._register(editContextAddDisposableListener(this._editContext, 'textupdate', e => {
			console.log('textupdate : ', e);
			// actual div is not updated, but I should update it so that later it is also updated
			console.log('e.updateRangeStart : ', e.updateRangeStart);
			console.log('e.updateRangeEnd : ', e.updateRangeEnd);
			console.log('e.text : ', e.text);
			console.log('this._editContext.text : ', this._editContext.text);

			// Should write to the hidden div in order for the text to be read correctly

			this._actual.textContent = this._editContext.text;

			this._onInput.fire({
				timeStamp: e.timeStamp,
				type: 'input',
				data: e.text,
				inputType: 'insertText',
				isComposing: this._isComposing
			});
		}));
		this._register(editContextAddDisposableListener(this._editContext, 'oncompositionstart', e => {
			this._isComposing = true;
			console.log('oncompositionstart : ', e);
			// this._onCompositionStart.fire(e);
		}));
		this._register(editContextAddDisposableListener(this._editContext, 'oncompositionend', e => {
			this._isComposing = false;
			console.log('oncompositionend : ', e);
			// this._onCompositionEnd.fire(e);
		}));

		const options = this._viewContext.configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);
		this._contentLeft = layoutInfo.contentLeft;
	}

	public hasFocus(): boolean {
		const shadowRoot = dom.getShadowRoot(this._actual);
		if (shadowRoot) {
			return shadowRoot.activeElement === this._actual;
		} else if (this._actual.isConnected) {
			return dom.getActiveElement() === this._actual;
		} else {
			return false;
		}
	}

	public setIgnoreSelectionChangeTime(reason: string): void {
		this._ignoreSelectionChangeTime = Date.now();
	}

	public getIgnoreSelectionChangeTime(): number {
		return this._ignoreSelectionChangeTime;
	}

	public resetSelectionChangeTime(): void {
		this._ignoreSelectionChangeTime = 0;
	}

	public getValue(): string {
		return this._actual.textContent ?? '';
	}

	public setValue(reason: string, value: string): void {

		console.log('setValue : ', value);

		const textArea = this._actual;
		if (textArea.textContent === value) {
			// No change
			return;
		}
		this.setIgnoreSelectionChangeTime('setValue');
		textArea.textContent = value;

		// ---
		this._updateEditContext(value);
	}

	public getSelectionStart(): number {

		console.log('getSelectionStart');

		/*
		const activeDocument = dom.getActiveWindow().document;
		const activeDocumentSelection = activeDocument.getSelection();
		console.log('activeDocumentSelection : ', activeDocumentSelection);
		const activeDocumentRange = activeDocumentSelection?.getRangeAt(0);
		console.log('activeDocumentRange : ', activeDocumentRange);
		if (!activeDocumentRange) {
			return 0;
		}
		return activeDocumentSelection?.direction === 'backward' ? activeDocumentRange.endOffset : activeDocumentRange.startOffset;
		*/

		// need to check direction maybe?
		return this._selectionStart;
	}

	public getSelectionEnd(): number {

		console.log('getSelectionEnd');

		/*
		const activeDocument = dom.getActiveWindow().document;
		const activeDocumentSelection = activeDocument.getSelection();
		console.log('activeDocumentSelection : ', activeDocumentSelection);
		const activeDocumentRange = activeDocumentSelection?.getRangeAt(0);
		console.log('activeDocumentRange : ', activeDocumentRange);
		if (!activeDocumentRange) {
			return 0;
		}
		return activeDocumentSelection?.direction === 'backward' ? activeDocumentRange.startOffset : activeDocumentRange.endOffset;
		*/

		// need to check direction maybe?
		return this._selectionEnd;
	}

	public setSelectionRange(reason: string, selectionStart: number, selectionEnd: number): void {

		console.log('setSelectionRange');
		console.log('selectionStart : ', selectionStart);
		console.log('selectionEnd : ', selectionEnd);

		this._updateBounds();
		this._updateDocumentSelection(selectionStart, selectionEnd);

		this._selectionStart = selectionStart;
		this._selectionEnd = selectionEnd;

		// ---

		const textArea = this._actual;

		let activeElement: Element | null = null;
		const shadowRoot = dom.getShadowRoot(textArea);
		if (shadowRoot) {
			activeElement = shadowRoot.activeElement;
		} else {
			activeElement = dom.getActiveElement();
		}
		const activeWindow = dom.getWindow(activeElement);

		const currentIsFocused = (activeElement === textArea);
		// const currentSelectionStart = textArea.selectionStart;
		// const currentSelectionEnd = textArea.selectionEnd;
		const currentSelectionStart = 0;
		const currentSelectionEnd = 0;

		if (currentIsFocused && currentSelectionStart === selectionStart && currentSelectionEnd === selectionEnd) {
			// No change
			// Firefox iframe bug https://github.com/microsoft/monaco-editor/issues/643#issuecomment-367871377
			if (browser.isFirefox && activeWindow.parent !== activeWindow) {
				textArea.focus();
			}
			return;
		}

		if (currentIsFocused) {
			// No need to focus, only need to change the selection range
			this.setIgnoreSelectionChangeTime('setSelectionRange');
			// textArea.setSelectionRange(selectionStart, selectionEnd);
			if (browser.isFirefox && activeWindow.parent !== activeWindow) {
				textArea.focus();
			}
			return;
		}

		// If the focus is outside the textarea, browsers will try really hard to reveal the textarea.
		// Here, we try to undo the browser's desperate reveal.
		try {
			const scrollState = dom.saveParentsScrollTop(textArea);
			this.setIgnoreSelectionChangeTime('setSelectionRange');
			textArea.focus();
			// textArea.setSelectionRange(selectionStart, selectionEnd);
			dom.restoreParentsScrollTop(textArea, scrollState);
		} catch (e) {
			// Sometimes IE throws when setting selection (e.g. textarea is off-DOM)
		}
	}

	// ---

	private _decorations: string[] = [];

	private _handleTextFormatUpdate(e: TextFormatUpdateEvent): void {

		console.log('_handleTextFormatUpdate');

		/*
		if (!this._editContextState) {
			return;
		}
		const formats = e.getTextFormats();
		const decorations: IModelDeltaDecoration[] = formats.map(f => {
			const r = new OffsetRange(f.rangeStart, f.rangeEnd);
			const range = this._editContextState!.textPositionTransformer.getRange(r);
			const doc = new LineBasedText(lineNumber => this._viewContext.viewModel.getLineContent(lineNumber), this._viewContext.viewModel.getLineCount());
			const viewModelRange = this._editContextState!.viewModelToEditContextText.inverseMapRange(range, doc);
			const modelRange = this._viewContext.viewModel.coordinatesConverter.convertViewRangeToModelRange(viewModelRange);
			const classNames = [
				'underline',
				`style-${f.underlineStyle.toLowerCase()}`,
				`thickness-${f.underlineThickness.toLowerCase()}`,
			];
			return {
				range: modelRange,
				options: {
					description: 'textFormatDecoration',
					inlineClassName: classNames.join(' '),
				}
			};
		});
		*/
		const decorations: IModelDeltaDecoration[] = [];
		this._decorations = this._viewContext.viewModel.model.deltaDecorations(this._decorations, decorations);
	}

	private _updateEditContext(value: string) {
		console.log('_updateEditContext');
		this._editContext.updateText(0, Number.MAX_SAFE_INTEGER, value);
	}

	private _updateBounds() {

		console.log('_updateBounds');

		const controlBoundingClientRect = this._actual.getBoundingClientRect();
		const controlBounds = new DOMRect(
			controlBoundingClientRect.left - this._contentLeft + 19, // +19 to align with the text, need to find variable value
			controlBoundingClientRect.top - 92, // need to find variable value
			controlBoundingClientRect.width,
			controlBoundingClientRect.height,
		);
		const selectionBounds = controlBounds;
		this._editContext.updateControlBounds(controlBounds);
		this._editContext.updateSelectionBounds(selectionBounds);
	}

	private _updateDocumentSelection(selectionStart: number, selectionEnd: number) {

		console.log('_updateDocumentSelection');

		const activeDocument = dom.getActiveWindow().document;
		const activeDocumentSelection = activeDocument.getSelection();
		if (activeDocumentSelection) {
			const range = new globalThis.Range();
			const firstChild = this._actual.firstChild;
			if (firstChild) {
				range.setStart(firstChild, selectionStart);
				range.setEnd(firstChild, selectionEnd);
				activeDocumentSelection.removeAllRanges();
				activeDocumentSelection.addRange(range);
			}
		}
		this._editContext.updateSelection(selectionStart, selectionEnd);
	}

	private _updateDomNodePosition(startLineNumber: number): void {

		console.log('_updateDomNodePosition');

		// TODO: should not be adding 15 but doing it for the purpose of the development
		this._actual.style.top = `${this._viewContext.viewLayout.getVerticalOffsetForLineNumber(startLineNumber + 15) - this._viewContext.viewLayout.getCurrentScrollTop()}px`;
		this._actual.style.left = `${this._contentLeft - this._viewContext.viewLayout.getCurrentScrollLeft()}px`;
	}

	private _renderSelectionBoundsForDevelopment(controlBounds: DOMRect, selectionBounds: DOMRect) {

		console.log('_renderSelectionBoundsForDevelopment');

		const controlBoundsElement = document.createElement('div');
		controlBoundsElement.style.position = 'absolute';
		controlBoundsElement.style.left = `${controlBounds.left}px`;
		controlBoundsElement.style.top = `${controlBounds.top}px`;
		controlBoundsElement.style.width = `${controlBounds.width}px`;
		controlBoundsElement.style.height = `${controlBounds.height}px`;
		controlBoundsElement.style.background = `blue`;
		this._controlBoundsElement?.remove();
		this._controlBoundsElement = controlBoundsElement;

		const selectionBoundsElement = document.createElement('div');
		selectionBoundsElement.style.position = 'absolute';
		selectionBoundsElement.style.left = `${selectionBounds.left}px`;
		selectionBoundsElement.style.top = `${selectionBounds.top}px`;
		selectionBoundsElement.style.width = `${selectionBounds.width}px`;
		selectionBoundsElement.style.height = `${selectionBounds.height}px`;
		selectionBoundsElement.style.background = `green`;
		this._selectionBoundsElement?.remove();
		this._selectionBoundsElement = selectionBoundsElement;

		// this._parent.appendChild(controlBoundsElement);
		// this._parent.appendChild(selectionBoundsElement);

		console.log('controlBounds : ', controlBounds);
		console.log('selectionBounds : ', selectionBounds);
		console.log('controlBoundsElement : ', controlBoundsElement);
		console.log('selectionBoundsElement : ', selectionBoundsElement);
	}
}

function editContextAddDisposableListener<K extends keyof EditContextEventHandlersEventMap>(target: EventTarget, type: K, listener: (this: GlobalEventHandlers, ev: EditContextEventHandlersEventMap[K]) => any, options?: boolean | AddEventListenerOptions): IDisposable {
	target.addEventListener(type, listener as any, options);
	return {
		dispose() {
			target.removeEventListener(type, listener as any);
		}
	};
}
