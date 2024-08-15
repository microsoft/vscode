/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as browser from 'vs/base/browser/browser';
import * as dom from 'vs/base/browser/dom';
import { IKeyboardEvent, StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { inputLatency } from 'vs/base/browser/performance';
import { RunOnceScheduler } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable, IDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { Mimes } from 'vs/base/common/mime';
import { OperatingSystem } from 'vs/base/common/platform';
import * as strings from 'vs/base/common/strings';
import { ITextAreaWrapper, ITypeData, _debugComposition } from 'vs/editor/browser/controller/editContext/textArea/textAreaState';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { Selection } from 'vs/editor/common/core/selection';
import { ViewContext } from 'vs/editor/common/viewModel/viewContext';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { ILogService } from 'vs/platform/log/common/log';
import { Range } from 'vs/editor/common/core/range';
import { OffsetRange } from 'vs/editor/common/core/offsetRange';
import { IModelDeltaDecoration } from 'vs/editor/common/model';
import { PositionOffsetTransformer } from 'vs/editor/common/core/positionToOffset';
import { ViewEventHandler } from 'vs/editor/common/viewEventHandler';
import { ViewCursorStateChangedEvent, ViewScrollChangedEvent } from 'vs/editor/common/viewEvents';
import { RenderingContext } from 'vs/editor/browser/view/renderingContext';
import { TextAreaState } from 'vs/editor/browser/controller/editContext/native/nativeEditContextState';

export namespace NativeAreaSyntethicEvents {
	export const Tap = '-monaco-textarea-synthetic-tap';
}

export interface ICompositionData {
	data: string;
}

export const CopyOptions = {
	forceCopyWithSyntaxHighlighting: false
};

export interface IPasteData {
	text: string;
	metadata: ClipboardStoredMetadata | null;
}

export interface ClipboardDataToCopy {
	isFromEmptySelection: boolean;
	multicursorText: string[] | null | undefined;
	text: string;
	html: string | null | undefined;
	mode: string | null;
}

export interface ClipboardStoredMetadata {
	version: 1;
	isFromEmptySelection: boolean | undefined;
	multicursorText: string[] | null | undefined;
	mode: string | null;
}

export interface ITextAreaInputHost {
	getDataToCopy(): ClipboardDataToCopy;
	getScreenReaderContent(): TextAreaState;
	getIMEContentData(): {
		content: string;
		selectionStartWithin: number;
		selectionEndWithin: number;
		selectionOfContent: Range;
	};
	deduceModelPosition(viewAnchorPosition: Position, deltaOffset: number, lineFeedCnt: number): Position;
}

interface InMemoryClipboardMetadata {
	lastCopiedValue: string;
	data: ClipboardStoredMetadata;
}

/**
 * Every time we write to the clipboard, we record a bit of extra metadata here.
 * Every time we read from the cipboard, if the text matches our last written text,
 * we can fetch the previous metadata.
 */
export class InMemoryClipboardMetadataManager {
	public static readonly INSTANCE = new InMemoryClipboardMetadataManager();

	private _lastState: InMemoryClipboardMetadata | null;

	constructor() {
		this._lastState = null;
	}

	public set(lastCopiedValue: string, data: ClipboardStoredMetadata): void {
		this._lastState = { lastCopiedValue, data };
	}

	public get(pastedText: string): ClipboardStoredMetadata | null {
		if (this._lastState && this._lastState.lastCopiedValue === pastedText) {
			// match!
			return this._lastState.data;
		}
		this._lastState = null;
		return null;
	}
}

export interface ICompositionStartEvent {
	data: string;
}

export interface ICompleteTextAreaWrapper extends ITextAreaWrapper {
	readonly onKeyDown: Event<KeyboardEvent>;
	readonly onKeyPress: Event<KeyboardEvent>;
	readonly onKeyUp: Event<KeyboardEvent>;
	readonly onCompositionStart: Event<{ data: string }>;
	readonly onCompositionUpdate: Event<{ data: string }>;
	readonly onCompositionEnd: Event<{ data: string }>;
	readonly onBeforeInput: Event<InputEvent>;
	readonly onInput: Event<{
		timeStamp: number;
		type: string;
		data: string;
		inputType: string;
		isComposing: boolean;
	}>;
	readonly onCut: Event<ClipboardEvent>;
	readonly onCopy: Event<ClipboardEvent>;
	readonly onPaste: Event<ClipboardEvent>;
	readonly onFocus: Event<FocusEvent>;
	readonly onBlur: Event<FocusEvent>;
	readonly onSyntheticTap: Event<void>;

	readonly ownerDocument: Document;

	setIgnoreSelectionChangeTime(reason: string): void;
	getIgnoreSelectionChangeTime(): number;
	resetSelectionChangeTime(): void;

	hasFocus(): boolean;
}

export interface IBrowser {
	isAndroid: boolean;
	isFirefox: boolean;
	isChrome: boolean;
	isSafari: boolean;
}

class CompositionContext {

	private _lastTypeTextLength: number;

	constructor() {
		this._lastTypeTextLength = 0;
	}

	public handleCompositionUpdate(text: string | null | undefined): ITypeData {
		text = text || '';
		const typeInput: ITypeData = {
			text: text,
			replacePrevCharCnt: this._lastTypeTextLength,
			replaceNextCharCnt: 0,
			positionDelta: 0
		};
		this._lastTypeTextLength = text.length;
		return typeInput;
	}
}

export class NativeEditContextInput extends Disposable {

	private _onFocus = this._register(new Emitter<void>());
	public readonly onFocus: Event<void> = this._onFocus.event;

	private _onBlur = this._register(new Emitter<void>());
	public readonly onBlur: Event<void> = this._onBlur.event;

	private _onKeyDown = this._register(new Emitter<IKeyboardEvent>());
	public readonly onKeyDown: Event<IKeyboardEvent> = this._onKeyDown.event;

	private _onKeyUp = this._register(new Emitter<IKeyboardEvent>());
	public readonly onKeyUp: Event<IKeyboardEvent> = this._onKeyUp.event;

	private _onCut = this._register(new Emitter<void>());
	public readonly onCut: Event<void> = this._onCut.event;

	private _onPaste = this._register(new Emitter<IPasteData>());
	public readonly onPaste: Event<IPasteData> = this._onPaste.event;

	private _onType = this._register(new Emitter<ITypeData>());
	public readonly onType: Event<ITypeData> = this._onType.event;

	private _onCompositionStart = this._register(new Emitter<ICompositionStartEvent>());
	public readonly onCompositionStart: Event<ICompositionStartEvent> = this._onCompositionStart.event;

	private _onCompositionUpdate = this._register(new Emitter<ICompositionData>());
	public readonly onCompositionUpdate: Event<ICompositionData> = this._onCompositionUpdate.event;

	private _onCompositionEnd = this._register(new Emitter<void>());
	public readonly onCompositionEnd: Event<void> = this._onCompositionEnd.event;

	private _onSelectionChangeRequest = this._register(new Emitter<Selection>());
	public readonly onSelectionChangeRequest: Event<Selection> = this._onSelectionChangeRequest.event;

	// ---

	private readonly _asyncTriggerCut: RunOnceScheduler;

	private readonly _asyncFocusGainWriteScreenReaderContent: MutableDisposable<RunOnceScheduler> = this._register(new MutableDisposable());

	private _textAreaState: TextAreaState;

	public get textAreaState(): TextAreaState {
		return this._textAreaState;
	}

	private _selectionChangeListener: IDisposable | null;

	private _hasFocus: boolean;
	private _currentComposition: CompositionContext | null;

	constructor(
		private readonly _host: ITextAreaInputHost,
		private readonly _editContextWrapper: NativeEditContextWrapper,
		private readonly _textArea: ICompleteTextAreaWrapper,
		private readonly _OS: OperatingSystem,
		private readonly _browser: IBrowser,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@ILogService private readonly _logService: ILogService
	) {
		super();
		this._asyncTriggerCut = this._register(new RunOnceScheduler(() => this._onCut.fire(), 0));
		this._textAreaState = TextAreaState.EMPTY;
		this._selectionChangeListener = null;
		this.writeEditContextContent('ctor');
		if (this._accessibilityService.isScreenReaderOptimized()) {
			this.writeNativeTextAreaContent('ctor');
		}
		this._register(Event.runAndSubscribe(this._accessibilityService.onDidChangeScreenReaderOptimized, () => {
			if (this._accessibilityService.isScreenReaderOptimized() && !this._asyncFocusGainWriteScreenReaderContent.value) {
				this._asyncFocusGainWriteScreenReaderContent.value = this._register(new RunOnceScheduler(() => this.writeNativeTextAreaContent('asyncFocusGain'), 0));
			} else {
				this._asyncFocusGainWriteScreenReaderContent.clear();
			}
		}));
		this._hasFocus = false;
		this._currentComposition = null;

		this._register(this._textArea.onKeyDown((_e) => {
			const e = new StandardKeyboardEvent(_e);
			if (e.keyCode === KeyCode.KEY_IN_COMPOSITION
				|| (this._currentComposition && e.keyCode === KeyCode.Backspace)) {
				// Stop propagation for keyDown events if the IME is processing key input
				e.stopPropagation();
			}

			if (e.equals(KeyCode.Escape)) {
				// Prevent default always for `Esc`, otherwise it will generate a keypress
				// See https://msdn.microsoft.com/en-us/library/ie/ms536939(v=vs.85).aspx
				e.preventDefault();
			}

			this._onKeyDown.fire(e);
		}));

		this._register(this._textArea.onKeyUp((_e) => {
			const e = new StandardKeyboardEvent(_e);
			this._onKeyUp.fire(e);
		}));

		this._register(this._textArea.onCompositionStart((e) => {
			if (_debugComposition) {
				console.log(`[compositionstart]`, e);
			}

			const currentComposition = new CompositionContext();
			if (this._currentComposition) {
				// simply reset the composition context
				this._currentComposition = currentComposition;
				return;
			}
			this._currentComposition = currentComposition;

			this._onCompositionStart.fire({ data: e.data });
		}));

		this._register(this._textArea.onCompositionUpdate((e) => {
			if (_debugComposition) {
				console.log(`[compositionupdate]`, e);
			}
			const currentComposition = this._currentComposition;
			if (!currentComposition) {
				// should not be possible to receive a 'compositionupdate' without a 'compositionstart'
				return;
			}
			const typeInput = currentComposition.handleCompositionUpdate(e.data);
			this._textAreaState = TextAreaState.readFromEditContext(this._editContextWrapper, this._textAreaState);
			this._onType.fire(typeInput);
			this._onCompositionUpdate.fire(e);
		}));

		this._register(this._textArea.onCompositionEnd((e) => {
			if (_debugComposition) {
				console.log(`[compositionend]`, e);
			}
			const currentComposition = this._currentComposition;
			if (!currentComposition) {
				// https://github.com/microsoft/monaco-editor/issues/1663
				// On iOS 13.2, Chinese system IME randomly trigger an additional compositionend event with empty data
				return;
			}
			this._currentComposition = null;

			const typeInput = currentComposition.handleCompositionUpdate(e.data);
			this._textAreaState = TextAreaState.readFromEditContext(this._editContextWrapper, this._textAreaState);
			this._onType.fire(typeInput);
			this._onCompositionEnd.fire();
		}));

		this._register(this._textArea.onInput((e) => {
			if (_debugComposition) {
				console.log(`[input]`, e);
			}

			// Pretend here we touched the text area, as the `input` event will most likely
			// result in a `selectionchange` event which we want to ignore
			this._textArea.setIgnoreSelectionChangeTime('received input event');

			if (this._currentComposition) {
				return;
			}

			// Normally we update the text area first and from there update the editor, but now we need to do the opposite?
			// We need to update the editor and make it so that this updates the screen reader content later


			const newState = TextAreaState.readFromEditContext(this._editContextWrapper, this._textAreaState);
			const typeInput = TextAreaState.deduceInput(this._textAreaState, newState, /*couldBeEmojiInput*/this._OS === OperatingSystem.Macintosh);

			console.log('onInput');
			console.log('newState : ', newState);
			console.log('typeInput : ', typeInput);

			if (typeInput.replacePrevCharCnt === 0 && typeInput.text.length === 1) {
				// one character was typed
				if (
					strings.isHighSurrogate(typeInput.text.charCodeAt(0))
					|| typeInput.text.charCodeAt(0) === 0x7f /* Delete */
				) {
					// Ignore invalid input but keep it around for next time
					return;
				}
			}

			this._textAreaState = newState;
			if (
				typeInput.text !== ''
				|| typeInput.replacePrevCharCnt !== 0
				|| typeInput.replaceNextCharCnt !== 0
				|| typeInput.positionDelta !== 0
			) {
				this._onType.fire(typeInput);
			}
		}));

		// --- Clipboard operations

		this._register(this._textArea.onCut((e) => {
			// Pretend here we touched the text area, as the `cut` event will most likely
			// result in a `selectionchange` event which we want to ignore
			this._textArea.setIgnoreSelectionChangeTime('received cut event');

			this._ensureClipboardGetsEditorSelection(e);
			this._asyncTriggerCut.schedule();
		}));

		this._register(this._textArea.onCopy((e) => {
			this._ensureClipboardGetsEditorSelection(e);
		}));

		this._register(this._textArea.onPaste((e) => {
			// Pretend here we touched the text area, as the `paste` event will most likely
			// result in a `selectionchange` event which we want to ignore
			this._textArea.setIgnoreSelectionChangeTime('received paste event');

			e.preventDefault();

			if (!e.clipboardData) {
				return;
			}

			let [text, metadata] = ClipboardEventUtils.getTextData(e.clipboardData);
			if (!text) {
				return;
			}

			// try the in-memory store
			metadata = metadata || InMemoryClipboardMetadataManager.INSTANCE.get(text);

			this._onPaste.fire({
				text: text,
				metadata: metadata
			});
		}));

		this._register(this._textArea.onFocus(() => {
			const hadFocus = this._hasFocus;

			this._setHasFocus(true);

			if (this._accessibilityService.isScreenReaderOptimized() && this._browser.isSafari && !hadFocus && this._hasFocus) {
				// When "tabbing into" the textarea, immediately after dispatching the 'focus' event,
				// Safari will always move the selection at offset 0 in the textarea
				if (!this._asyncFocusGainWriteScreenReaderContent.value) {
					this._asyncFocusGainWriteScreenReaderContent.value = new RunOnceScheduler(() => this.writeNativeTextAreaContent('asyncFocusGain'), 0);
				}
				this._asyncFocusGainWriteScreenReaderContent.value.schedule();
			}
		}));
		this._register(this._textArea.onBlur(() => {
			this._setHasFocus(false);
		}));
	}

	_initializeFromTest(): void {
		this._hasFocus = true;
		this._textAreaState = TextAreaState.readFromEditContext(this._editContextWrapper, null);
	}

	private _installSelectionChangeListener(): IDisposable {
		// See https://github.com/microsoft/vscode/issues/27216 and https://github.com/microsoft/vscode/issues/98256
		// When using a Braille display, it is possible for users to reposition the
		// system caret. This is reflected in Chrome as a `selectionchange` event.
		//
		// The `selectionchange` event appears to be emitted under numerous other circumstances,
		// so it is quite a challenge to distinguish a `selectionchange` coming in from a user
		// using a Braille display from all the other cases.
		//
		// The problems with the `selectionchange` event are:
		//  * the event is emitted when the textarea is focused programmatically -- textarea.focus()
		//  * the event is emitted when the selection is changed in the textarea programmatically -- textarea.setSelectionRange(...)
		//  * the event is emitted when the value of the textarea is changed programmatically -- textarea.value = '...'
		//  * the event is emitted when tabbing into the textarea
		//  * the event is emitted asynchronously (sometimes with a delay as high as a few tens of ms)
		//  * the event sometimes comes in bursts for a single logical textarea operation

		// `selectionchange` events often come multiple times for a single logical change
		// so throttle multiple `selectionchange` events that burst in a short period of time.
		let previousSelectionChangeEventTime = 0;
		return dom.addDisposableListener(this._textArea.ownerDocument, 'selectionchange', (e) => {//todo
			inputLatency.onSelectionChange();

			if (!this._hasFocus) {
				return;
			}
			if (this._currentComposition) {
				return;
			}
			if (!this._browser.isChrome) {
				// Support only for Chrome until testing happens on other browsers
				return;
			}

			const now = Date.now();

			const delta1 = now - previousSelectionChangeEventTime;
			previousSelectionChangeEventTime = now;
			if (delta1 < 5) {
				// received another `selectionchange` event within 5ms of the previous `selectionchange` event
				// => ignore it
				return;
			}

			const delta2 = now - this._textArea.getIgnoreSelectionChangeTime();
			this._textArea.resetSelectionChangeTime();
			if (delta2 < 100) {
				// received a `selectionchange` event within 100ms since we touched the textarea
				// => ignore it, since we caused it
				return;
			}

			if (!this._textAreaState.selection) {
				// Cannot correlate a position in the textarea with a position in the editor...
				return;
			}

			const newValue = this._textArea.getValue();
			if (this._textAreaState.value !== newValue) {
				// Cannot correlate a position in the textarea with a position in the editor...
				return;
			}

			const newSelectionStart = this._textArea.getSelectionStart();
			const newSelectionEnd = this._textArea.getSelectionEnd();
			if (this._textAreaState.selectionStart === newSelectionStart && this._textAreaState.selectionEnd === newSelectionEnd) {
				// Nothing to do...
				return;
			}

			const _newSelectionStartPosition = this._textAreaState.deduceEditorPosition(newSelectionStart);
			const newSelectionStartPosition = this._host.deduceModelPosition(_newSelectionStartPosition[0]!, _newSelectionStartPosition[1], _newSelectionStartPosition[2]);

			const _newSelectionEndPosition = this._textAreaState.deduceEditorPosition(newSelectionEnd);
			const newSelectionEndPosition = this._host.deduceModelPosition(_newSelectionEndPosition[0]!, _newSelectionEndPosition[1], _newSelectionEndPosition[2]);

			const newSelection = new Selection(
				newSelectionStartPosition.lineNumber, newSelectionStartPosition.column,
				newSelectionEndPosition.lineNumber, newSelectionEndPosition.column
			);

			this._onSelectionChangeRequest.fire(newSelection);
		});
	}

	public override dispose(): void {
		super.dispose();
		if (this._selectionChangeListener) {
			this._selectionChangeListener.dispose();
			this._selectionChangeListener = null;
		}
	}

	public focusTextArea(): void {
		// Setting this._hasFocus and writing the screen reader content
		// will result in a focus() and setSelectionRange() in the textarea
		this._setHasFocus(true);

		// If the editor is off DOM, focus cannot be really set, so let's double check that we have managed to set the focus
		this.refreshFocusState();
	}

	public isFocused(): boolean {
		return this._hasFocus;
	}

	public refreshFocusState(): void {
		this._setHasFocus(this._textArea.hasFocus());
	}

	private _setHasFocus(newHasFocus: boolean): void {
		if (this._hasFocus === newHasFocus) {
			// no change
			return;
		}
		this._hasFocus = newHasFocus;

		if (this._selectionChangeListener) {
			this._selectionChangeListener.dispose();
			this._selectionChangeListener = null;
		}
		if (this._hasFocus) {
			this._selectionChangeListener = this._installSelectionChangeListener();
		}

		if (this._hasFocus) {
			this.writeNativeTextAreaContent('focusgain');
		}

		if (this._hasFocus) {
			this._onFocus.fire();
		} else {
			this._onBlur.fire();
		}
	}

	private _setAndWriteTextAreaState(reason: string, textAreaState: TextAreaState): void {
		if (!this._hasFocus) {
			textAreaState = textAreaState.collapseSelection();
		}

		textAreaState.writeToTextArea(reason, this._textArea, this._hasFocus);
		this._textAreaState = textAreaState;
	}

	public writeNativeTextAreaContent(reason: string): void {
		if ((!this._accessibilityService.isScreenReaderOptimized() && reason === 'render') || this._currentComposition) {
			// Do not write to the text on render unless a screen reader is being used #192278
			// Do not write to the text area when doing composition
			return;
		}
		this._logService.trace(`writeTextAreaState(reason: ${reason})`);
		this._setAndWriteTextAreaState(reason, this._host.getScreenReaderContent());
	}

	// Do we only need to write this when we are doing a composition with IME?
	public writeEditContextContent(reason: string): void {
		console.log('writeEditContextContent : ', reason);
		this._logService.trace(`writeTextAreaState(reason: ${reason})`);
		this._editContextWrapper.updateText(this._host.getIMEContentData());
	}

	private _ensureClipboardGetsEditorSelection(e: ClipboardEvent): void {
		const dataToCopy = this._host.getDataToCopy();
		const storedMetadata: ClipboardStoredMetadata = {
			version: 1,
			isFromEmptySelection: dataToCopy.isFromEmptySelection,
			multicursorText: dataToCopy.multicursorText,
			mode: dataToCopy.mode
		};
		InMemoryClipboardMetadataManager.INSTANCE.set(
			// When writing "LINE\r\n" to the clipboard and then pasting,
			// Firefox pastes "LINE\n", so let's work around this quirk
			(this._browser.isFirefox ? dataToCopy.text.replace(/\r\n/g, '\n') : dataToCopy.text),
			storedMetadata
		);

		e.preventDefault();
		if (e.clipboardData) {
			ClipboardEventUtils.setTextData(e.clipboardData, dataToCopy.text, dataToCopy.html, storedMetadata);
		}
	}
}

export const ClipboardEventUtils = {

	getTextData(clipboardData: DataTransfer): [string, ClipboardStoredMetadata | null] {
		const text = clipboardData.getData(Mimes.text);
		let metadata: ClipboardStoredMetadata | null = null;
		const rawmetadata = clipboardData.getData('vscode-editor-data');
		if (typeof rawmetadata === 'string') {
			try {
				metadata = <ClipboardStoredMetadata>JSON.parse(rawmetadata);
				if (metadata.version !== 1) {
					metadata = null;
				}
			} catch (err) {
				// no problem!
			}
		}

		if (text.length === 0 && metadata === null && clipboardData.files.length > 0) {
			// no textual data pasted, generate text from file names
			const files: File[] = Array.prototype.slice.call(clipboardData.files, 0);
			return [files.map(file => file.name).join('\n'), null];
		}

		return [text, metadata];
	},

	setTextData(clipboardData: DataTransfer, text: string, html: string | null | undefined, metadata: ClipboardStoredMetadata): void {
		clipboardData.setData(Mimes.text, text);
		if (typeof html === 'string') {
			clipboardData.setData('text/html', html);
		}
		clipboardData.setData('vscode-editor-data', JSON.stringify(metadata));
	}
};

export class NativeEditContextWrapper extends Disposable {

	private readonly _onCompositionStart = this._register(new Emitter<{ data: string }>());
	public readonly onCompositionStart = this._onCompositionStart.event;

	private readonly _onCompositionUpdate = this._register(new Emitter<{ data: string }>());
	public readonly onCompositionUpdate = this._onCompositionUpdate.event;

	private readonly _onCompositionEnd = this._register(new Emitter<{ data: string }>());
	public readonly onCompositionEnd = this._onCompositionEnd.event;

	private readonly _onInput = this._register(new Emitter<{
		timeStamp: number;
		type: string;
		data: string;
		inputType: string;
		isComposing: boolean;
	}>());
	public readonly onInput = this._onInput.event;

	private readonly _onBeforeInput = this._register(new Emitter<InputEvent>());
	public readonly onBeforeInput = this._onBeforeInput.event;

	private readonly _editContext: EditContext;

	private _isComposing: boolean = false;
	private _compositionStartPosition: Position | undefined;
	private _compositionEndPosition: Position | undefined;

	private _selectionStartWithin: number = 0;
	private _selectionEndWithin: number = 0;
	private _selectionOfContent: Range | undefined;

	private _parent: HTMLElement | undefined;
	private _renderingContext: RenderingContext | undefined;
	private _contentLeft: number = 0;
	private _scrollTop: number = 0;

	private _selectionBounds: IDisposable = Disposable.None;
	private _controlBounds: IDisposable = Disposable.None;
	private _characterBounds: IDisposable = Disposable.None;

	constructor(
		public readonly domNode: HTMLDivElement,
		private readonly _viewContext: ViewContext
	) {
		super();
		this._editContext = domNode.editContext = new EditContext();

		this._register(editContextAddDisposableListener(this._editContext, 'textformatupdate', e => {
			this._handleTextFormatUpdate(e);
		}));
		this._register(editContextAddDisposableListener(this._editContext, 'characterboundsupdate', e => {
			console.log('characterboundsupdate : ', e);
			this._updateCharacterBounds(e.rangeStart);
		}));
		this._register(editContextAddDisposableListener(this._editContext, 'textupdate', e => {

			const data = e.text.replaceAll(/[^\S\r\n]/gmu, ' ');

			console.log('textupdate : ', e);
			console.log('e.updateRangeStart : ', e.updateRangeStart);
			console.log('e.updateRangeEnd : ', e.updateRangeEnd);
			console.log('e.text : ', e.text);
			console.log('this._editContext.text : ', this._editContext.text);
			console.log('data : ', data);

			if (this._isComposing) {
				this._compositionEndPosition = this._viewContext.viewModel.getCursorStates()[0].viewState.position;
				this._onCompositionUpdate.fire({ data });
			} else {
				// TODO: Maybe need to place the below under the isComposing check too, because it has boolean isComposing
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

			console.log('oncompositionstart : ', e);

			this._isComposing = true;
			this._compositionStartPosition = this._viewContext.viewModel.getCursorStates()[0].viewState.position;

			const currentTarget = e.currentTarget as EditContext;
			this._onCompositionStart.fire({ data: currentTarget.text });
		}));
		this._register(editContextAddDisposableListener(this._editContext, 'compositionend', e => {

			console.log('oncompositionend : ', e);

			this._isComposing = false;
			this._compositionEndPosition = this._viewContext.viewModel.getCursorStates()[0].viewState.position;

			if ('data' in e && typeof e.data === 'string') {
				this._onCompositionEnd.fire({ data: e.data });
			}
		}));
		this._register(dom.addDisposableListener(domNode, 'beforeinput', (e) => {

			console.log('beforeinput : ', e);

			if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') {
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

		const that = this;
		this._viewContext.addEventHandler(new class extends ViewEventHandler {
			public override onScrollChanged(e: ViewScrollChangedEvent): boolean {
				that._scrollTop = e.scrollTop;
				that._updateSelectionAndControlBounds();
				return false;
			}
			public override onCursorStateChanged(e: ViewCursorStateChangedEvent): boolean {
				that._updateSelectionAndControlBounds();
				return false;
			}
		});
		const options = this._viewContext.configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);
		this._contentLeft = layoutInfo.contentLeft;
		this._scrollTop = 0;
	}

	private _updateSelectionAndControlBounds() {

		console.log('_updateBounds');

		if (!this._parent) {
			return;
		}
		const primaryViewState = this._viewContext.viewModel.getCursorStates()[0].viewState;
		const primarySelection = primaryViewState.selection;
		const parentBounds = this._parent.getBoundingClientRect();
		const verticalOffsetStart = this._viewContext.viewLayout.getVerticalOffsetForLineNumber(primarySelection.startLineNumber);
		const options = this._viewContext.configuration.options;
		const lineHeight = options.get(EditorOption.lineHeight);

		let selectionBounds: DOMRect;
		let controlBounds: DOMRect;
		if (primarySelection.isEmpty()) {
			const typicalHalfwidthCharacterWidth = options.get(EditorOption.fontInfo).typicalHalfwidthCharacterWidth;
			let left: number = parentBounds.left + this._contentLeft;
			if (this._renderingContext) {
				const linesVisibleRanges = this._renderingContext.linesVisibleRangesForRange(primaryViewState.selection, true) ?? [];
				if (linesVisibleRanges.length === 0) { return; }
				const minLeft = Math.min(...linesVisibleRanges.map(r => Math.min(...r.ranges.map(r => r.left))));
				left += minLeft;
			}
			selectionBounds = new DOMRect(
				left,
				parentBounds.top + verticalOffsetStart - this._scrollTop,
				typicalHalfwidthCharacterWidth / 2,
				lineHeight,
			);
			controlBounds = selectionBounds;
		} else {
			const numberOfLines = primarySelection.endLineNumber - primarySelection.startLineNumber;
			selectionBounds = new DOMRect(
				parentBounds.left + this._contentLeft,
				parentBounds.top + verticalOffsetStart - this._scrollTop,
				parentBounds.width - this._contentLeft,
				(numberOfLines + 1) * lineHeight,
			);
			controlBounds = selectionBounds;
		}

		console.log('selectionBounds : ', selectionBounds);
		console.log('controlBounds : ', controlBounds);

		this._editContext.updateControlBounds(controlBounds);
		this._editContext.updateSelectionBounds(selectionBounds);

		// visualizing the selection bounds
		this._selectionBounds.dispose();
		this._controlBounds.dispose();
		this._selectionBounds = createRect(selectionBounds, 'red');
		this._controlBounds = createRect(controlBounds, 'blue');
	}

	private _updateCharacterBounds(rangeStart: number) {
		console.log('_updateCharacterBounds');
		console.log('this._parent : ', this._parent);
		console.log('this._compositionStartPosition : ', this._compositionStartPosition);
		console.log('this._compositionEndPosition : ', this._compositionEndPosition);

		if (!this._parent || !this._compositionStartPosition || !this._compositionEndPosition) {
			console.log('early return of _updateCharacterBounds');
			return;
		}

		const options = this._viewContext.configuration.options;
		const lineHeight = options.get(EditorOption.lineHeight);
		const typicalHalfwidthCharacterWidth = options.get(EditorOption.fontInfo).typicalHalfwidthCharacterWidth;
		const parentBounds = this._parent.getBoundingClientRect();
		const verticalOffsetStart = this._viewContext.viewLayout.getVerticalOffsetForLineNumber(this._compositionStartPosition.lineNumber);
		let left: number = parentBounds.left + this._contentLeft;
		let width: number = typicalHalfwidthCharacterWidth / 2;

		console.log('before using this rendering context');

		if (this._renderingContext) {
			const range = Range.fromPositions(this._compositionStartPosition, this._compositionEndPosition);
			const linesVisibleRanges = this._renderingContext.linesVisibleRangesForRange(range, true) ?? [];

			console.log('range : ', range);
			console.log('linesVisibleRanges : ', linesVisibleRanges);

			if (linesVisibleRanges.length === 0) { return; }
			const minLeft = Math.min(...linesVisibleRanges.map(r => Math.min(...r.ranges.map(r => r.left))));
			const maxLeft = Math.max(...linesVisibleRanges.map(r => Math.max(...r.ranges.map(r => r.left + r.width))));
			left += minLeft;
			width = maxLeft - minLeft;
		}

		console.log('before setting characterBounds');

		const characterBounds = [new DOMRect(
			left,
			parentBounds.top + verticalOffsetStart - this._scrollTop,
			width,
			lineHeight,
		)];

		console.log('characterBounds : ', characterBounds);
		this._editContext.updateCharacterBounds(rangeStart, characterBounds);

		// -- dev
		this._characterBounds.dispose();
		this._characterBounds = createRect(characterBounds[0], 'green');
	}

	private _decorations: string[] = [];

	// do we need this? looks like in the current implementation we wouldnt use these format
	private _handleTextFormatUpdate(e: TextFormatUpdateEvent): void {

		const formats = e.getTextFormats();

		console.log('_handleTextFormatUpdate');
		console.log('e : ', e);
		console.log('formats : ', formats);

		const decorations: IModelDeltaDecoration[] = [];
		formats.forEach(f => {
			const offsetRange = new OffsetRange(f.rangeStart, f.rangeEnd);
			const textPositionTransformer = new PositionOffsetTransformer(this._editContext.text);
			const range = textPositionTransformer.getRange(offsetRange);

			console.log('range : ', range);
			console.log('this._selectionOfValue : ', this._selectionOfContent);

			if (!this._selectionOfContent) {
				return;
			}
			const startLineNumber = this._selectionOfContent.startLineNumber + range.startLineNumber - 1;
			const endLineNumber = this._selectionOfContent.startLineNumber + range.endLineNumber - 1;
			let startColumn: number;
			if (startLineNumber === this._selectionOfContent.startLineNumber) {
				startColumn = this._selectionOfContent.startColumn + range.startColumn - 1;
			} else {
				startColumn = range.startColumn;
			}
			let endColumn: number;
			if (endLineNumber === this._selectionOfContent.startLineNumber) {
				endColumn = this._selectionOfContent.startColumn + range.endColumn - 1;
			} else {
				endColumn = range.endColumn;
			}
			const decorationRange = new Range(startLineNumber, startColumn, endLineNumber, endColumn);

			console.log('decorationRange : ', decorationRange);

			const classNames = [
				'underline',
				`style-${f.underlineStyle.toLowerCase()}`,
				`thickness-${f.underlineThickness.toLowerCase()}`,
			];
			decorations.push({
				range: decorationRange,
				options: {
					description: 'textFormatDecoration',
					inlineClassName: classNames.join(' '),
				}
			});
		});

		console.log('decorations : ', decorations);

		this._decorations = this._viewContext.viewModel.model.deltaDecorations(this._decorations, decorations);
	}

	public updateText(data: {
		content: string;
		selectionStartWithin: number;
		selectionEndWithin: number;
		selectionOfContent: Range;
	}) {

		console.log('_updateEditContext');

		this._editContext.updateText(0, Number.MAX_SAFE_INTEGER, data.content);
		this._editContext.updateSelection(data.selectionStartWithin, data.selectionEndWithin);
		this._selectionOfContent = data.selectionOfContent;
		this._selectionStartWithin = data.selectionStartWithin;
		this._selectionEndWithin = data.selectionEndWithin;
	}

	public getValue(): string {
		return this._editContext.text;
	}

	public getSelectionStart(): number {
		return this._selectionStartWithin;
	}

	public getSelectionEnd(): number {
		return this._selectionEndWithin;
	}

	// --- do we need this?
	public updateSelection(start: number, end: number) {

		console.log('_updateSelection');

		this._editContext.updateSelection(start, end);
	}

	// --- do we need this?
	public updateOriginalSelection(selection: Selection) {

		console.log('_updateOriginalSelection');

		this._selectionOfContent = selection;
	}

	public setParent(parent: HTMLElement): void {
		this._parent = parent;
	}

	public setRenderingContext(renderingContext: RenderingContext): void {
		this._renderingContext = renderingContext;
	}
}

export class ScreenReaderContent extends Disposable implements ICompleteTextAreaWrapper {

	private readonly _onCompositionStart = this._register(new Emitter<{ data: string }>());
	public readonly onCompositionStart = this._onCompositionStart.event;

	private readonly _onCompositionUpdate = this._register(new Emitter<{ data: string }>());
	public readonly onCompositionUpdate = this._onCompositionUpdate.event;

	private readonly _onCompositionEnd = this._register(new Emitter<{ data: string }>());
	public readonly onCompositionEnd = this._onCompositionEnd.event;

	private readonly _onInput = this._register(new Emitter<{
		timeStamp: number;
		type: string;
		data: string;
		inputType: string;
		isComposing: boolean;
	}>());
	public readonly onInput = this._onInput.event;

	private readonly _onBeforeInput = this._register(new Emitter<InputEvent>());
	public readonly onBeforeInput = this._onBeforeInput.event;

	private readonly _onKeyDown = this._register(new Emitter<KeyboardEvent>());
	public readonly onKeyDown = this._onKeyDown.event;

	private readonly _onKeyPress = this._register(new Emitter<KeyboardEvent>());
	public readonly onKeyPress = this._onKeyPress.event;

	private readonly _onKeyUp = this._register(new Emitter<KeyboardEvent>());
	public readonly onKeyUp = this._onKeyUp.event;

	private readonly _onCut = this._register(new Emitter<ClipboardEvent>());
	public readonly onCut = this._onCut.event;

	private readonly _onCopy = this._register(new Emitter<ClipboardEvent>());
	public readonly onCopy = this._onCopy.event;

	private readonly _onPaste = this._register(new Emitter<ClipboardEvent>());
	public readonly onPaste = this._onPaste.event;

	private readonly _onFocus = this._register(new Emitter<FocusEvent>());
	public readonly onFocus = this._onFocus.event;

	private readonly _onBlur = this._register(new Emitter<FocusEvent>());
	public readonly onBlur = this._onBlur.event;

	public get ownerDocument(): Document {
		return this._domNode.ownerDocument;
	}

	private _onSyntheticTap = this._register(new Emitter<void>());
	public readonly onSyntheticTap: Event<void> = this._onSyntheticTap.event;

	private _ignoreSelectionChangeTime: number;

	private readonly _domNode: HTMLDivElement;

	private _selectionStart: number = 0;
	private _selectionEnd: number = 0;

	constructor(nativeWrapper: NativeEditContextWrapper) {
		super();
		this._domNode = nativeWrapper.domNode;
		this._ignoreSelectionChangeTime = 0;

		this._register(this.onKeyDown(() => inputLatency.onKeyDown()));
		this._register(this.onBeforeInput(() => inputLatency.onBeforeInput()));
		this._register(this.onInput(() => inputLatency.onInput()));
		this._register(this.onKeyUp(() => inputLatency.onKeyUp()));

		this._register(dom.addDisposableListener(this._domNode, NativeAreaSyntethicEvents.Tap, () => this._onSyntheticTap.fire()));

		this._register(dom.addDisposableListener(this._domNode, 'keydown', (e) => {
			this._onKeyDown.fire(e);
		}));

		this._register(dom.addDisposableListener(this._domNode, 'keypress', (e) => {
			this._onKeyPress.fire(e);
		}));

		this._register(dom.addDisposableListener(this._domNode, 'keyup', (e) => {
			this._onKeyUp.fire(e);
		}));

		this._register(dom.addDisposableListener(this._domNode, 'copy', (e) => {
			this._onCopy.fire(e);
		}));

		this._register(dom.addDisposableListener(this._domNode, 'cut', (e) => {
			this._onCut.fire(e);
		}));

		this._register(dom.addDisposableListener(this._domNode, 'paste', (e) => {
			this._onPaste.fire(e);
		}));

		this._register(dom.addDisposableListener(this._domNode, 'focus', (e) => {
			this._onFocus.fire(e);
		}));

		this._register(dom.addDisposableListener(this._domNode, 'blur', (e) => {
			this._onBlur.fire(e);
		}));

		// Listeners fired from the edit context
		this._register(nativeWrapper.onCompositionStart(e => this._onCompositionStart.fire(e)));
		this._register(nativeWrapper.onCompositionUpdate(e => this._onCompositionUpdate.fire(e)));
		this._register(nativeWrapper.onCompositionEnd(e => this._onCompositionEnd.fire(e)));
		this._register(nativeWrapper.onInput(e => this._onInput.fire(e)));
		this._register(nativeWrapper.onBeforeInput(e => this._onBeforeInput.fire));
	}

	public hasFocus(): boolean {
		const shadowRoot = dom.getShadowRoot(this._domNode);
		if (shadowRoot) {
			return shadowRoot.activeElement === this._domNode;
		} else if (this._domNode.isConnected) {
			return dom.getActiveElement() === this._domNode;
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
		// console.log('current value: ' + this._textArea.value);
		return this._domNode.textContent ?? '';
	}

	public setValue(reason: string, value: string): void {

		console.log('setValue : ', value);
		console.log('value : ', value);

		const textArea = this._domNode;
		if (textArea.textContent === value) {
			// No change
			return;
		}
		// console.log('reason: ' + reason + ', current value: ' + textArea.value + ' => new value: ' + value);
		this.setIgnoreSelectionChangeTime('setValue');
		textArea.textContent = value;
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

		const textArea = this._domNode;

		let activeElement: Element | null = null;
		const shadowRoot = dom.getShadowRoot(textArea);
		if (shadowRoot) {
			activeElement = shadowRoot.activeElement;
		} else {
			activeElement = dom.getActiveElement();
		}
		const activeWindow = dom.getWindow(activeElement);

		const currentIsFocused = (activeElement === textArea);

		if (currentIsFocused && this._selectionStart === selectionStart && this._selectionEnd === selectionEnd) {
			// No change
			// Firefox iframe bug https://github.com/microsoft/monaco-editor/issues/643#issuecomment-367871377
			if (browser.isFirefox && activeWindow.parent !== activeWindow) {
				textArea.focus();
			}
			return;
		}

		// console.log('reason: ' + reason + ', setSelectionRange: ' + selectionStart + ' -> ' + selectionEnd);

		if (currentIsFocused) {
			// No need to focus, only need to change the selection range
			this.setIgnoreSelectionChangeTime('setSelectionRange');
			this._updateDocumentSelection(selectionStart, selectionEnd);
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
			this._updateDocumentSelection(selectionStart, selectionEnd);
			dom.restoreParentsScrollTop(textArea, scrollState);
		} catch (e) {
			// Sometimes IE throws when setting selection (e.g. textarea is off-DOM)
		}
	}

	private _updateDocumentSelection(selectionStart: number, selectionEnd: number) {

		console.log('_updateDocumentSelection');
		console.log('selectionStart : ', selectionStart);
		console.log('selectionEnd : ', selectionEnd);

		this._selectionStart = selectionStart;
		this._selectionEnd = selectionEnd;

		const activeDocument = dom.getActiveWindow().document;
		const activeDocumentSelection = activeDocument.getSelection();
		if (activeDocumentSelection) {
			const range = new globalThis.Range();
			const firstChild = this._domNode.firstChild;
			if (firstChild) {
				range.setStart(firstChild, selectionStart);
				range.setEnd(firstChild, selectionEnd);
				activeDocumentSelection.removeAllRanges();
				activeDocumentSelection.addRange(range);
			}
		}
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

function createRect(rect: DOMRect, color: 'red' | 'blue' | 'green'): IDisposable {
	const ret = document.createElement('div');
	ret.style.position = 'absolute';
	ret.style.zIndex = '999999999';
	ret.style.outline = `2px solid ${color}`;
	ret.className = 'debug-rect-marker';
	ret.style.pointerEvents = 'none';

	ret.style.top = rect.top + 'px';
	ret.style.left = rect.left + 'px';
	ret.style.width = rect.width + 'px';
	ret.style.height = rect.height + 'px';

	// eslint-disable-next-line no-restricted-syntax
	document.body.appendChild(ret);

	return {
		dispose: () => {
			ret.remove();
		}
	};
}
