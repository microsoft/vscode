/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as browser from 'vs/base/browser/browser';
import * as dom from 'vs/base/browser/dom';
import { inputLatency } from 'vs/base/browser/performance';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { ICompleteHiddenAreaWrapper } from 'vs/editor/browser/controller/hiddenArea/hiddenAreaInput';
import { ViewContext } from 'vs/editor/common/viewModel/viewContext';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { IModelDeltaDecoration } from 'vs/editor/common/model';
import { createFastDomNode, FastDomNode } from 'vs/base/browser/fastDomNode';

export namespace NativeAreaSyntethicEvents {
	export const Tap = '-monaco-textarea-synthetic-tap';
}

export class DivWrapper extends Disposable implements ICompleteHiddenAreaWrapper {

	public readonly className: string = 'native-edit-context';

	private readonly _onKeyDown = this._register(new Emitter<KeyboardEvent>());
	public readonly onKeyDown = this._onKeyDown.event;

	private readonly _onKeyPress = this._register(new Emitter<KeyboardEvent>());
	public readonly onKeyPress = this._onKeyPress.event;

	private readonly _onKeyUp = this._register(new Emitter<KeyboardEvent>());
	public readonly onKeyUp = this._onKeyUp.event;

	private readonly _onCopy = this._register(new Emitter<ClipboardEvent>());
	public readonly onCopy = this._onCopy.event;

	// paste event for some reason not fired on the dom node, even if content editable set to true
	// On the link https://w3c.github.io/edit-context/#update-the-editcontext, says we should handle copy paste from the before input, but the before input does not fire this event either?
	// Using the beforeinput event on the document.getRootNode() does not work either
	// Temporary solution is to fire on paste on the corresponding keydown event but then we are not firing the correct event, just the text in the clipboard

	private readonly _onCut = this._register(new Emitter<ClipboardEvent>());
	public readonly onCut = this._onCut.event;

	private readonly _onPaste = this._register(new Emitter<ClipboardEvent>());
	public readonly onPaste = this._onPaste.event;

	private readonly _onFocus = this._register(new Emitter<FocusEvent>());
	public readonly onFocus = this._onFocus.event;

	private readonly _onBlur = this._register(new Emitter<FocusEvent>());
	public readonly onBlur = this._onBlur.event;

	// The listeners which will be fired through the edit context

	private readonly _onCompositionStart = this._register(new Emitter<{ data: string }>());
	public readonly onCompositionStart = this._onCompositionStart.event;

	private readonly _onCompositionEnd = this._register(new Emitter<{ data: string }>());
	public readonly onCompositionEnd = this._onCompositionEnd.event;

	private readonly _onCompositionUpdate = this._register(new Emitter<{ data: string }>());
	public readonly onCompositionUpdate = this._onCompositionUpdate.event;

	private readonly _onBeforeInput = this._register(new Emitter<InputEvent>());
	public readonly onBeforeInput = this._onBeforeInput.event;

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

	// private _selectionBoundsElement: HTMLElement | undefined;
	// private _controlBoundsElement: HTMLElement | undefined;

	// ---
	public readonly actual: FastDomNode<HTMLDivElement>;
	private readonly _actual: HTMLDivElement;
	private readonly _editContext: EditContext;
	private _contentLeft: number;
	private _isComposing: boolean = false;

	private _selectionEnd: number = 0;
	private _selectionStart: number = 0;

	constructor(
		private readonly _viewContext: ViewContext
	) {
		super();
		this.actual = createFastDomNode(document.createElement('div'));
		this._actual = this.actual.domNode;
		this._editContext = this._actual.editContext = new EditContext();
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
			// need to update the end selection because the selection is updated here
			const newSelectionPos = e.updateRangeStart + (e.text.length);
			console.log('newSelectionPos : ', newSelectionPos);
			this._selectionStart = newSelectionPos;
			this._selectionEnd = newSelectionPos;
			this.setSelectionRange('update', this._selectionStart, this._selectionEnd);

			const data = e.text.replace(/[^\S\r\n]/gm, ' ');
			if (this._isComposing) {
				this._onCompositionUpdate.fire({ data });
			} else {
				this._onInput.fire({
					timeStamp: e.timeStamp,
					type: 'input',
					data: data,
					inputType: 'insertText',
					isComposing: this._isComposing
				});
			}
		}));
		this._register(editContextAddDisposableListener(this._editContext, 'compositionstart', e => {
			this._isComposing = true;
			console.log('oncompositionstart : ', e);
			if ('data' in e && typeof e.data === 'string') {
				this._onCompositionStart.fire({ data: e.data });
			}
		}));
		this._register(editContextAddDisposableListener(this._editContext, 'compositionend', e => {
			this._isComposing = false;
			console.log('oncompositionend : ', e);
			if ('data' in e && typeof e.data === 'string') {
				this._onCompositionEnd.fire({ data: e.data });
			}
		}));
		this._register(dom.addDisposableListener(this._actual, 'beforeinput', (e) => {
			console.log('beforeinput : ', e);
			if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') {
				this._editContext.updateText(this._selectionStart, this._selectionEnd, '\n');
				this._actual.textContent = this._editContext.text;
				this._onInput.fire({
					timeStamp: e.timeStamp,
					type: e.type,
					data: '\n',
					inputType: e.inputType,
					isComposing: this._isComposing
				});
			} else {
				this._onBeforeInput.fire(e);
			}
		}));

		this._register(dom.addDisposableListener(this._actual, 'keydown', (e) => {
			this._onKeyDown.fire(e);
		}));

		this._register(dom.addDisposableListener(this._actual, 'keypress', (e) => {
			this._onKeyPress.fire(e);
		}));

		this._register(dom.addDisposableListener(this._actual, 'keyup', (e) => {
			this._onKeyUp.fire(e);
		}));

		this._register(dom.addDisposableListener(this._actual, 'copy', (e) => {
			this._onCopy.fire(e);
		}));

		// paste event for some reason not fired on the dom node, even if content editable set to true
		// On the link https://w3c.github.io/edit-context/#update-the-editcontext, says we should handle copy paste from the before input, but the before input does not fire this event either?
		// Using the beforeinput event on the document.getRootNode() does not work either
		// Temporary solution is to fire on paste on the corresponding keydown event but then we are not firing the correct event, just the text in the clipboard

		this._register(dom.addDisposableListener(this._actual, 'cut', (e) => {
			this._onCut.fire(e);
		}));

		this._register(dom.addDisposableListener(this._actual, 'paste', (e) => {
			this._onPaste.fire(e);
		}));

		this._register(dom.addDisposableListener(this._actual, 'focus', (e) => {
			this._onFocus.fire(e);
		}));

		this._register(dom.addDisposableListener(this._actual, 'blur', (e) => {
			this._onBlur.fire(e);
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

		console.log('getSelectionStart: ', this._selectionStart);
		console.log('getSelectionEnd in the meantime : ', this._selectionEnd);
		// need to check direction maybe?
		return this._selectionStart;
	}

	public getSelectionEnd(): number {

		console.log('getSelectionEnd : ', this._selectionEnd);
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
		console.log('selectionStart : ', selectionStart);
		console.log('selectionEnd : ', selectionEnd);

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

	/*
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
	*/
}

function editContextAddDisposableListener<K extends keyof EditContextEventHandlersEventMap>(target: EventTarget, type: K, listener: (this: GlobalEventHandlers, ev: EditContextEventHandlersEventMap[K]) => any, options?: boolean | AddEventListenerOptions): IDisposable {
	target.addEventListener(type, listener as any, options);
	return {
		dispose() {
			target.removeEventListener(type, listener as any);
		}
	};
}
