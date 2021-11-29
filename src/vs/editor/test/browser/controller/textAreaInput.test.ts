/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { OperatingSystem } from 'vs/base/common/platform';
import { ClipboardDataToCopy, ICompleteTextAreaWrapper, ITextAreaInputHost, TextAreaInput } from 'vs/editor/browser/controller/textAreaInput';
import { TextAreaState } from 'vs/editor/browser/controller/textAreaState';
import { Position } from 'vs/editor/common/core/position';
import { IRecorded, IRecordedEvent, IRecordedTextareaState } from 'vs/editor/test/browser/controller/imeRecordedTypes';

suite('TextAreaInput', () => {

	interface OutgoingType {
		type: 'type';
		text: string;
		replacePrevCharCnt: number;
		replaceNextCharCnt: number;
		positionDelta: number;
	}
	interface OutgoingCompositionStart {
		type: 'compositionStart';
		revealDeltaColumns: number;
	}
	interface OutgoingCompositionUpdate {
		type: 'compositionUpdate';
		data: string;
	}
	interface OutgoingCompositionEnd {
		type: 'compositionEnd';
	}
	type OutoingEvent = OutgoingType | OutgoingCompositionStart | OutgoingCompositionUpdate | OutgoingCompositionEnd;

	function yieldNow(): Promise<void> {
		return new Promise((resolve, reject) => {
			queueMicrotask(resolve);
		});
	}

	async function simulateInteraction(recorded: IRecorded): Promise<OutoingEvent[]> {
		let disposables = new DisposableStore();
		const host: ITextAreaInputHost = {
			getDataToCopy: function (html: boolean): ClipboardDataToCopy {
				throw new Error('Function not implemented.');
			},
			getScreenReaderContent: function (currentState: TextAreaState): TextAreaState {
				return new TextAreaState(
					recorded.initial.value,
					recorded.initial.selectionStart,
					recorded.initial.selectionEnd,
					null,
					null
				);
				// return TextAreaState.selectedText('<SCREEN READER CONTENT>');
			},
			deduceModelPosition: function (viewAnchorPosition: Position, deltaOffset: number, lineFeedCnt: number): Position {
				throw new Error('Function not implemented.');
			}
		};
		const wrapper = disposables.add(new class extends Disposable implements ICompleteTextAreaWrapper {
			private _onKeyDown = this._register(new Emitter<KeyboardEvent>());
			readonly onKeyDown = this._onKeyDown.event;

			private _onKeyPress = this._register(new Emitter<KeyboardEvent>());
			readonly onKeyPress = this._onKeyPress.event;

			private _onKeyUp = this._register(new Emitter<KeyboardEvent>());
			readonly onKeyUp = this._onKeyUp.event;

			private _onCompositionStart = this._register(new Emitter<CompositionEvent>());
			readonly onCompositionStart = this._onCompositionStart.event;

			private _onCompositionUpdate = this._register(new Emitter<CompositionEvent>());
			readonly onCompositionUpdate = this._onCompositionUpdate.event;

			private _onCompositionEnd = this._register(new Emitter<CompositionEvent>());
			readonly onCompositionEnd = this._onCompositionEnd.event;

			private _onBeforeInput = this._register(new Emitter<InputEvent>());
			readonly onBeforeInput = this._onBeforeInput.event;

			private _onInput = this._register(new Emitter<InputEvent>());
			readonly onInput = this._onInput.event;

			readonly onCut = Event.None;
			readonly onCopy = Event.None;
			readonly onPaste = Event.None;

			readonly _onFocus = this._register(new Emitter<FocusEvent>());
			readonly onFocus = this._onFocus.event;

			readonly onBlur = Event.None;
			readonly onSyntheticTap = Event.None;

			private _state: IRecordedTextareaState;

			constructor() {
				super();
				this._state = {
					selectionDirection: 'none',
					selectionEnd: 0,
					selectionStart: 0,
					value: ''
				};
			}

			public dispatchRecordedEvent(event: IRecordedEvent): void {
				this._state.value = event.state.value;
				this._state.selectionStart = event.state.selectionStart;
				this._state.selectionEnd = event.state.selectionEnd;
				this._state.selectionDirection = event.state.selectionDirection;

				if (event.type === 'keydown' || event.type === 'keypress' || event.type === 'keyup') {
					const mockEvent = <KeyboardEvent>{
						timeStamp: event.timeStamp,
						type: event.type,
						altKey: event.altKey,
						charCode: event.charCode,
						code: event.code,
						ctrlKey: event.ctrlKey,
						isComposing: event.isComposing,
						key: event.key,
						keyCode: event.keyCode,
						location: event.location,
						metaKey: event.metaKey,
						repeat: event.repeat,
						shiftKey: event.shiftKey,
					};
					if (event.type === 'keydown') {
						this._onKeyDown.fire(mockEvent);
					} else if (event.type === 'keypress') {
						this._onKeyPress.fire(mockEvent);
					} else {
						this._onKeyUp.fire(mockEvent);
					}
				} else if (event.type === 'compositionstart' || event.type === 'compositionupdate' || event.type === 'compositionend') {
					const mockEvent = <CompositionEvent>{
						timeStamp: event.timeStamp,
						type: event.type,
						data: event.data
					};
					if (event.type === 'compositionstart') {
						this._onCompositionStart.fire(mockEvent);
					} else if (event.type === 'compositionupdate') {
						this._onCompositionUpdate.fire(mockEvent);
					} else {
						this._onCompositionEnd.fire(mockEvent);
					}
				} else if (event.type === 'beforeinput' || event.type === 'input') {
					const mockEvent = <InputEvent>{
						timeStamp: event.timeStamp,
						type: event.type,
						data: event.data,
						inputType: event.inputType,
						isComposing: event.isComposing,
					};
					if (event.type === 'beforeinput') {
						this._onBeforeInput.fire(mockEvent);
					} else {
						this._onInput.fire(mockEvent);
					}
				} else {
					throw new Error(`Not Implemented`);
				}
			}

			getValue(): string {
				return this._state.value;
			}
			setValue(reason: string, value: string): void {
				this._state.value = value;
			}
			getSelectionStart(): number {
				return this._state.selectionDirection === 'backward' ? this._state.selectionEnd : this._state.selectionStart;
			}
			getSelectionEnd(): number {
				return this._state.selectionDirection === 'backward' ? this._state.selectionStart : this._state.selectionEnd;
			}
			setSelectionRange(reason: string, selectionStart: number, selectionEnd: number): void {
				this._state.selectionStart = selectionStart;
				this._state.selectionEnd = selectionEnd;
				this._state.selectionDirection = (selectionStart !== selectionEnd ? 'forward' : 'none');
			}

			public setIgnoreSelectionChangeTime(reason: string): void { }
			public getIgnoreSelectionChangeTime(): number { return Date.now(); }
			public resetSelectionChangeTime(): void { }

			public hasFocus(): boolean { return true; }
		});
		const input = disposables.add(new TextAreaInput(host, wrapper, recorded.env.OS, recorded.env.browser));

		wrapper._onFocus.fire(null as any);

		let outgoingEvents: OutoingEvent[] = [];

		disposables.add(input.onType((e) => outgoingEvents.push({
			type: 'type',
			text: e.text,
			replacePrevCharCnt: e.replacePrevCharCnt,
			replaceNextCharCnt: e.replaceNextCharCnt,
			positionDelta: e.positionDelta,
		})));
		disposables.add(input.onCompositionStart((e) => outgoingEvents.push({
			type: 'compositionStart',
			revealDeltaColumns: e.revealDeltaColumns,
		})));
		disposables.add(input.onCompositionUpdate((e) => outgoingEvents.push({
			type: 'compositionUpdate',
			data: e.data,
		})));
		disposables.add(input.onCompositionEnd((e) => outgoingEvents.push({
			type: 'compositionEnd'
		})));

		for (const event of recorded.events) {
			wrapper.dispatchRecordedEvent(event);
			await yieldNow();
		}

		return outgoingEvents;
	}

	function interpretTypeEvents(initialState: IRecordedTextareaState, events: OutoingEvent[]): IRecordedTextareaState {
		let text = initialState.value;
		let selectionStart = initialState.selectionStart;
		let selectionEnd = initialState.selectionEnd;
		for (const event of events) {
			if (event.type === 'type') {
				text = (
					text.substring(0, selectionStart - event.replacePrevCharCnt)
					+ event.text
					+ text.substring(selectionEnd + event.replaceNextCharCnt)
				);
				selectionStart = selectionStart - event.replacePrevCharCnt + event.text.length;
				selectionEnd = selectionStart;

				if (event.positionDelta) {
					selectionStart += event.positionDelta;
					selectionEnd += event.positionDelta;
				}
			}
		}
		return {
			value: text,
			selectionStart: selectionStart,
			selectionEnd: selectionEnd,
			selectionDirection: 'none'
		};
	}

	test('macOS - chrome - Korean test', async () => {
		// macOS, 2-Set Korean, type 'dkrk' and click
		const recorded: IRecorded = {
			env: {
				OS: OperatingSystem.Macintosh,
				browser: {
					isAndroid: false,
					isFirefox: false,
					isChrome: true,
					isSafari: false
				}
			},
			initial: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' },
			events: [
				{ timeStamp: 0.00, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyD', ctrlKey: false, isComposing: false, key: 'ㅇ', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 6.20, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'compositionstart', data: '' },
				{ timeStamp: 6.40, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'beforeinput', data: 'ㅇ', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 6.50, state: { value: 'aaaa', selectionStart: 2, selectionEnd: 2, selectionDirection: 'none' }, type: 'compositionupdate', data: 'ㅇ' },
				{ timeStamp: 6.90, state: { value: 'aaㅇaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'input', data: 'ㅇ', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 136.10, state: { value: 'aaㅇaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyD', ctrlKey: false, isComposing: true, key: 'ㅇ', keyCode: 68, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 288.10, state: { value: 'aaㅇaa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyK', ctrlKey: false, isComposing: true, key: 'ㅏ', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 296.00, state: { value: 'aaㅇaa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'beforeinput', data: '아', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 296.00, state: { value: 'aaㅇaa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'compositionupdate', data: '아' },
				{ timeStamp: 296.40, state: { value: 'aa아aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'input', data: '아', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 368.00, state: { value: 'aa아aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyK', ctrlKey: false, isComposing: true, key: 'ㅏ', keyCode: 75, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 536.10, state: { value: 'aa아aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyR', ctrlKey: false, isComposing: true, key: 'ㄱ', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 543.20, state: { value: 'aa아aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'beforeinput', data: '악', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 543.30, state: { value: 'aa아aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'compositionupdate', data: '악' },
				{ timeStamp: 543.60, state: { value: 'aa악aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'input', data: '악', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 632.00, state: { value: 'aa악aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyR', ctrlKey: false, isComposing: true, key: 'ㄱ', keyCode: 82, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 783.90, state: { value: 'aa악aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'keydown', altKey: false, charCode: 0, code: 'KeyK', ctrlKey: false, isComposing: true, key: 'ㅏ', keyCode: 229, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 790.70, state: { value: 'aa악aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'beforeinput', data: '아', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 790.80, state: { value: 'aa악aa', selectionStart: 2, selectionEnd: 3, selectionDirection: 'none' }, type: 'compositionupdate', data: '아' },
				{ timeStamp: 791.20, state: { value: 'aa아aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'input', data: '아', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 791.20, state: { value: 'aa아aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'compositionend', data: '아' },
				{ timeStamp: 791.30, state: { value: 'aa아aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'compositionstart', data: '' },
				{ timeStamp: 791.30, state: { value: 'aa아aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'beforeinput', data: '가', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 791.30, state: { value: 'aa아aa', selectionStart: 3, selectionEnd: 3, selectionDirection: 'none' }, type: 'compositionupdate', data: '가' },
				{ timeStamp: 791.50, state: { value: 'aa아가aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'none' }, type: 'input', data: '가', inputType: 'insertCompositionText', isComposing: true },
				{ timeStamp: 880.10, state: { value: 'aa아가aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'none' }, type: 'keyup', altKey: false, charCode: 0, code: 'KeyK', ctrlKey: false, isComposing: true, key: 'ㅏ', keyCode: 75, location: 0, metaKey: false, repeat: false, shiftKey: false },
				{ timeStamp: 2209.00, state: { value: 'aa아가aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'none' }, type: 'compositionend', data: '가' }
			],
			final: { value: 'aa아가aa', selectionStart: 4, selectionEnd: 4, selectionDirection: 'none' },
		};

		const actualOutgoingEvents = await simulateInteraction(recorded);

		assert.deepStrictEqual(actualOutgoingEvents, ([
			{ type: 'compositionStart', revealDeltaColumns: 0 },
			{ type: 'type', text: 'ㅇ', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: 'ㅇ' },
			{ type: 'type', text: '아', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '아' },
			{ type: 'type', text: '악', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '악' },
			{ type: 'type', text: '아', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '아' },
			{ type: 'type', text: '아', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionEnd' },
			{ type: 'compositionStart', revealDeltaColumns: 0 },
			{ type: 'type', text: '가', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionUpdate', data: '가' },
			{ type: 'type', text: '가', replacePrevCharCnt: 1, replaceNextCharCnt: 0, positionDelta: 0 },
			{ type: 'compositionEnd' }
		]));

		const actualResultingState = interpretTypeEvents(recorded.initial, actualOutgoingEvents);
		assert.deepStrictEqual(actualResultingState, recorded.final);
	});

});
