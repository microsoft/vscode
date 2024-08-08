/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
import { _debugComposition, HiddenAreaState, IHiddenAreaWrapper, ITypeData } from 'vs/editor/browser/controller/editContext/editContextState';
import { Position } from 'vs/editor/common/core/position';
import { Selection } from 'vs/editor/common/core/selection';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { ILogService } from 'vs/platform/log/common/log';

export namespace HiddenAreaSyntethicEvents {
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

export interface IHiddenAreaInputHost {
	getDataToCopy(): ClipboardDataToCopy;
	getScreenReaderContent(): HiddenAreaState;
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

export interface ICompleteHiddenAreaWrapper extends IHiddenAreaWrapper, IDisposable {
	readonly onKeyDown: Event<KeyboardEvent>;
	readonly onKeyPress: Event<KeyboardEvent>;
	readonly onKeyUp: Event<KeyboardEvent>;
	readonly onCompositionStart: Event<{ data: string }>;
	readonly onCompositionUpdate: Event<CompositionEvent>;
	readonly onCompositionEnd: Event<CompositionEvent>;
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

/**
 * Writes screen reader content to the textarea and is able to analyze its input events to generate:
 *  - onCut
 *  - onPaste
 *  - onType
 *
 * Composition events are generated for presentation purposes (composition input is reflected in onType).
 */
export class HiddenAreaInput extends Disposable {

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

	// should be assigned in the _initializeHiddenAreaState method
	protected _hiddenAreaState: HiddenAreaState;

	public get hiddenAreaState(): HiddenAreaState {
		return this._hiddenAreaState;
	}

	private _selectionChangeListener: IDisposable | null;

	private _hasFocus: boolean;
	private _currentComposition: CompositionContext | null;

	constructor(
		private readonly _host: IHiddenAreaInputHost,
		private readonly _hiddenArea: ICompleteHiddenAreaWrapper,
		private readonly _OS: OperatingSystem,
		private readonly _browser: IBrowser,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@ILogService private readonly _logService: ILogService
	) {
		super();
		this._asyncTriggerCut = this._register(new RunOnceScheduler(() => this._onCut.fire(), 0));
		this._hiddenAreaState = HiddenAreaState.EMPTY;
		this._selectionChangeListener = null;
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

		let lastKeyDown: IKeyboardEvent | null = null;

		this._register(this._hiddenArea.onKeyDown((_e) => {
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

			lastKeyDown = e;
			this._onKeyDown.fire(e);
		}));

		this._register(this._hiddenArea.onKeyUp((_e) => {
			const e = new StandardKeyboardEvent(_e);
			this._onKeyUp.fire(e);
		}));

		this._register(this._hiddenArea.onCompositionStart((e) => {
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

			if (
				this._OS === OperatingSystem.Macintosh
				&& lastKeyDown
				&& lastKeyDown.equals(KeyCode.KEY_IN_COMPOSITION)
				&& this._hiddenAreaState.selectionStart === this._hiddenAreaState.selectionEnd
				&& this._hiddenAreaState.selectionStart > 0
				&& this._hiddenAreaState.value.substring(this._hiddenAreaState.selectionStart - 1, 1) === e.data
				&& (lastKeyDown.code === 'ArrowRight' || lastKeyDown.code === 'ArrowLeft')
			) {
				// Handling long press case on Chromium/Safari macOS + arrow key => pretend the character was selected
				if (_debugComposition) {
					console.log(`[compositionstart] Handling long press case on macOS + arrow key`, e);
				}
				// Pretend the previous character was composed (in order to get it removed by subsequent compositionupdate events)
				currentComposition.handleCompositionUpdate('x');
				this._onCompositionStart.fire({ data: e.data });
				return;
			}

			if (this._browser.isAndroid) {
				// when tapping on the editor, Android enters composition mode to edit the current word
				// so we cannot clear the textarea on Android and we must pretend the current word was selected
				this._onCompositionStart.fire({ data: e.data });
				return;
			}

			this._onCompositionStart.fire({ data: e.data });
		}));

		this._register(this._hiddenArea.onCompositionUpdate((e) => {
			if (_debugComposition) {
				console.log(`[compositionupdate]`, e);
			}
			console.log('onCompositionUpdate');
			const currentComposition = this._currentComposition;
			if (!currentComposition) {
				// should not be possible to receive a 'compositionupdate' without a 'compositionstart'
				return;
			}
			if (this._browser.isAndroid) {
				// On Android, the data sent with the composition update event is unusable.
				// For example, if the cursor is in the middle of a word like Mic|osoft
				// and Microsoft is chosen from the keyboard's suggestions, the e.data will contain "Microsoft".
				// This is not really usable because it doesn't tell us where the edit began and where it ended.
				const newState = HiddenAreaState.readFromTextArea(this._hiddenArea, this._hiddenAreaState);
				const typeInput = HiddenAreaState.deduceAndroidCompositionInput(this._hiddenAreaState, newState);
				this._hiddenAreaState = newState;
				this._onType.fire(typeInput);
				this._onCompositionUpdate.fire(e);
				return;
			}
			const typeInput = currentComposition.handleCompositionUpdate(e.data);
			this._hiddenAreaState = HiddenAreaState.readFromTextArea(this._hiddenArea, this._hiddenAreaState);
			this._onType.fire(typeInput);
			this._onCompositionUpdate.fire(e);
		}));

		this._register(this._hiddenArea.onCompositionEnd((e) => {
			if (_debugComposition) {
				console.log(`[compositionend]`, e);
			}
			console.log('onCompositionEnd');
			const currentComposition = this._currentComposition;
			if (!currentComposition) {
				// https://github.com/microsoft/monaco-editor/issues/1663
				// On iOS 13.2, Chinese system IME randomly trigger an additional compositionend event with empty data
				return;
			}
			this._currentComposition = null;

			if (this._browser.isAndroid) {
				// On Android, the data sent with the composition update event is unusable.
				// For example, if the cursor is in the middle of a word like Mic|osoft
				// and Microsoft is chosen from the keyboard's suggestions, the e.data will contain "Microsoft".
				// This is not really usable because it doesn't tell us where the edit began and where it ended.
				const newState = HiddenAreaState.readFromTextArea(this._hiddenArea, this._hiddenAreaState);
				const typeInput = HiddenAreaState.deduceAndroidCompositionInput(this._hiddenAreaState, newState);
				this._hiddenAreaState = newState;
				this._onType.fire(typeInput);
				this._onCompositionEnd.fire();
				return;
			}

			const typeInput = currentComposition.handleCompositionUpdate(e.data);
			this._hiddenAreaState = HiddenAreaState.readFromTextArea(this._hiddenArea, this._hiddenAreaState);
			this._onType.fire(typeInput);
			this._onCompositionEnd.fire();
		}));

		this._register(this._hiddenArea.onInput((e) => {
			console.log('onInput of hidden area input : ', e);
			if (_debugComposition) {
				console.log(`[input]`, e);
			}

			// Pretend here we touched the text area, as the `input` event will most likely
			// result in a `selectionchange` event which we want to ignore
			this._hiddenArea.setIgnoreSelectionChangeTime('received input event');

			if (this._currentComposition) {
				return;
			}

			const newState = HiddenAreaState.readFromTextArea(this._hiddenArea, this._hiddenAreaState);
			const typeInput = HiddenAreaState.deduceInput(this._hiddenAreaState, newState, /*couldBeEmojiInput*/this._OS === OperatingSystem.Macintosh);
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

			this._hiddenAreaState = newState;
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

		this._register(this._hiddenArea.onCut((e) => {
			console.log('onCut of hidden area input : ', e);
			// Pretend here we touched the text area, as the `cut` event will most likely
			// result in a `selectionchange` event which we want to ignore
			this._hiddenArea.setIgnoreSelectionChangeTime('received cut event');

			this._ensureClipboardGetsEditorSelection(e);
			this._asyncTriggerCut.schedule();
		}));

		this._register(this._hiddenArea.onCopy((e) => {
			console.log('onCopy of hidden area input : ', e);
			this._ensureClipboardGetsEditorSelection(e);
		}));

		this._register(this._hiddenArea.onPaste((e) => {
			console.log('onPaste of hidden area input : ', e);
			// Pretend here we touched the text area, as the `paste` event will most likely
			// result in a `selectionchange` event which we want to ignore
			this._hiddenArea.setIgnoreSelectionChangeTime('received paste event');

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

		this._register(this._hiddenArea.onFocus(() => {
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
		this._register(this._hiddenArea.onBlur(() => {
			if (this._currentComposition) {
				// See https://github.com/microsoft/vscode/issues/112621
				// where compositionend is not triggered when the editor
				// is taken off-dom during a composition

				// Clear the flag to be able to write to the textarea
				this._currentComposition = null;

				// Clear the textarea to avoid an unwanted cursor type
				this.writeNativeTextAreaContent('blurWithoutCompositionEnd');

				// Fire artificial composition end
				this._onCompositionEnd.fire();
			}
			this._setHasFocus(false);
		}));
		this._register(this._hiddenArea.onSyntheticTap(() => {
			if (this._browser.isAndroid && this._currentComposition) {
				// on Android, tapping does not cancel the current composition, so the
				// textarea is stuck showing the old composition

				// Clear the flag to be able to write to the textarea
				this._currentComposition = null;

				// Clear the textarea to avoid an unwanted cursor type
				this.writeNativeTextAreaContent('tapWithoutCompositionEnd');

				// Fire artificial composition end
				this._onCompositionEnd.fire();
			}
		}));
	}

	_initializeFromTest(): void {
		console.log('_initializeFromTest');
		this._hasFocus = true;
		this._hiddenAreaState = HiddenAreaState.readFromTextArea(this._hiddenArea, null);
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
		return dom.addDisposableListener(this._hiddenArea.ownerDocument, 'selectionchange', (e) => {//todo
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

			const delta2 = now - this._hiddenArea.getIgnoreSelectionChangeTime();
			this._hiddenArea.resetSelectionChangeTime();
			if (delta2 < 100) {
				// received a `selectionchange` event within 100ms since we touched the textarea
				// => ignore it, since we caused it
				return;
			}

			if (!this._hiddenAreaState.selection) {
				// Cannot correlate a position in the textarea with a position in the editor...
				return;
			}

			const newValue = this._hiddenArea.getValue();
			if (this._hiddenAreaState.value !== newValue) {
				// Cannot correlate a position in the textarea with a position in the editor...
				return;
			}

			const newSelectionStart = this._hiddenArea.getSelectionStart();
			const newSelectionEnd = this._hiddenArea.getSelectionEnd();
			if (this._hiddenAreaState.selectionStart === newSelectionStart && this._hiddenAreaState.selectionEnd === newSelectionEnd) {
				// Nothing to do...
				return;
			}

			const _newSelectionStartPosition = this._hiddenAreaState.deduceEditorPosition(newSelectionStart);
			const newSelectionStartPosition = this._host.deduceModelPosition(_newSelectionStartPosition[0]!, _newSelectionStartPosition[1], _newSelectionStartPosition[2]);

			const _newSelectionEndPosition = this._hiddenAreaState.deduceEditorPosition(newSelectionEnd);
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
		this._setHasFocus(this._hiddenArea.hasFocus());
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

	private _setAndWriteTextAreaState(reason: string, hiddenAreaState: HiddenAreaState): void {
		console.log('_setAndWriteTextAreaState');
		if (!this._hasFocus) {
			hiddenAreaState = hiddenAreaState.collapseSelection();
		}

		hiddenAreaState.writeToTextArea(reason, this._hiddenArea, this._hasFocus);
		this._hiddenAreaState = hiddenAreaState;
	}

	public writeNativeTextAreaContent(reason: string): void {
		console.log('writeNativeTextAreaContent');
		if ((!this._accessibilityService.isScreenReaderOptimized() && reason === 'render') || this._currentComposition) {
			// Do not write to the text on render unless a screen reader is being used #192278
			// Do not write to the text area when doing composition
			return;
		}
		this._logService.trace(`writeTextAreaState(reason: ${reason})`);
		this._setAndWriteTextAreaState(reason, this._host.getScreenReaderContent());
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

		console.log('_ensureClipboardGetsEditorSelection');
		console.log('dataToCopy : ', dataToCopy);

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
