/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { IRecorded, IRecordedCompositionEvent, IRecordedEvent, IRecordedInputEvent, IRecordedKeyboardEvent, IRecordedTextareaState } from './imeRecordedTypes.js';
import * as browser from '../../../../base/browser/browser.js';
import * as platform from '../../../../base/common/platform.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { TextAreaWrapper } from '../../../browser/controller/editContext/textArea/textAreaEditContextInput.js';

(() => {

	// eslint-disable-next-line no-restricted-syntax
	const startButton = <HTMLButtonElement>mainWindow.document.getElementById('startRecording')!;
	// eslint-disable-next-line no-restricted-syntax
	const endButton = <HTMLButtonElement>mainWindow.document.getElementById('endRecording')!;

	let inputarea: HTMLTextAreaElement;
	const disposables = new DisposableStore();
	let originTimeStamp = 0;
	let recorded: IRecorded = {
		env: null!,
		initial: null!,
		events: [],
		final: null!
	};

	const readTextareaState = (): IRecordedTextareaState => {
		return {
			selectionDirection: inputarea.selectionDirection,
			selectionEnd: inputarea.selectionEnd,
			selectionStart: inputarea.selectionStart,
			value: inputarea.value,
		};
	};

	startButton.onclick = () => {
		disposables.clear();
		startTest();
		originTimeStamp = 0;
		recorded = {
			env: {
				OS: platform.OS,
				browser: {
					isAndroid: browser.isAndroid,
					isFirefox: browser.isFirefox,
					isChrome: browser.isChrome,
					isSafari: browser.isSafari
				}
			},
			initial: readTextareaState(),
			events: [],
			final: null!
		};
	};
	endButton.onclick = () => {
		recorded.final = readTextareaState();
		console.log(printRecordedData());
	};

	function printRecordedData() {
		const lines = [];
		lines.push(`const recorded: IRecorded = {`);
		lines.push(`\tenv: ${JSON.stringify(recorded.env)}, `);
		lines.push(`\tinitial: ${printState(recorded.initial)}, `);
		lines.push(`\tevents: [\n\t\t${recorded.events.map(ev => printEvent(ev)).join(',\n\t\t')}\n\t],`);
		lines.push(`\tfinal: ${printState(recorded.final)},`);
		lines.push(`}`);

		return lines.join('\n');

		function printString(str: string) {
			return str.replace(/\\/g, '\\\\').replace(/'/g, '\\\'');
		}
		function printState(state: IRecordedTextareaState) {
			return `{ value: '${printString(state.value)}', selectionStart: ${state.selectionStart}, selectionEnd: ${state.selectionEnd}, selectionDirection: '${state.selectionDirection}' }`;
		}
		function printEvent(ev: IRecordedEvent) {
			if (ev.type === 'keydown' || ev.type === 'keypress' || ev.type === 'keyup') {
				return `{ timeStamp: ${ev.timeStamp.toFixed(2)}, state: ${printState(ev.state)}, type: '${ev.type}', altKey: ${ev.altKey}, charCode: ${ev.charCode}, code: '${ev.code}', ctrlKey: ${ev.ctrlKey}, isComposing: ${ev.isComposing}, key: '${ev.key}', keyCode: ${ev.keyCode}, location: ${ev.location}, metaKey: ${ev.metaKey}, repeat: ${ev.repeat}, shiftKey: ${ev.shiftKey} }`;
			}
			if (ev.type === 'compositionstart' || ev.type === 'compositionupdate' || ev.type === 'compositionend') {
				return `{ timeStamp: ${ev.timeStamp.toFixed(2)}, state: ${printState(ev.state)}, type: '${ev.type}', data: '${printString(ev.data)}' }`;
			}
			if (ev.type === 'beforeinput' || ev.type === 'input') {
				return `{ timeStamp: ${ev.timeStamp.toFixed(2)}, state: ${printState(ev.state)}, type: '${ev.type}', data: ${ev.data === null ? 'null' : `'${printString(ev.data)}'`}, inputType: '${ev.inputType}', isComposing: ${ev.isComposing} }`;
			}
			return JSON.stringify(ev);
		}
	}

	function startTest() {
		inputarea = document.createElement('textarea');
		mainWindow.document.body.appendChild(inputarea);
		inputarea.focus();
		disposables.add(toDisposable(() => {
			inputarea.remove();
		}));
		const wrapper = disposables.add(new TextAreaWrapper(inputarea));

		wrapper.setValue('', `aaaa`);
		wrapper.setSelectionRange('', 2, 2);

		const recordEvent = (e: IRecordedEvent) => {
			recorded.events.push(e);
		};

		const recordKeyboardEvent = (e: KeyboardEvent): void => {
			if (e.type !== 'keydown' && e.type !== 'keypress' && e.type !== 'keyup') {
				throw new Error(`Not supported!`);
			}
			if (originTimeStamp === 0) {
				originTimeStamp = e.timeStamp;
			}
			const ev: IRecordedKeyboardEvent = {
				timeStamp: e.timeStamp - originTimeStamp,
				state: readTextareaState(),
				type: e.type,
				altKey: e.altKey,
				charCode: e.charCode,
				code: e.code,
				ctrlKey: e.ctrlKey,
				isComposing: e.isComposing,
				key: e.key,
				keyCode: e.keyCode,
				location: e.location,
				metaKey: e.metaKey,
				repeat: e.repeat,
				shiftKey: e.shiftKey
			};
			recordEvent(ev);
		};

		const recordCompositionEvent = (e: CompositionEvent): void => {
			if (e.type !== 'compositionstart' && e.type !== 'compositionupdate' && e.type !== 'compositionend') {
				throw new Error(`Not supported!`);
			}
			if (originTimeStamp === 0) {
				originTimeStamp = e.timeStamp;
			}
			const ev: IRecordedCompositionEvent = {
				timeStamp: e.timeStamp - originTimeStamp,
				state: readTextareaState(),
				type: e.type,
				data: e.data,
			};
			recordEvent(ev);
		};

		const recordInputEvent = (e: InputEvent): void => {
			if (e.type !== 'beforeinput' && e.type !== 'input') {
				throw new Error(`Not supported!`);
			}
			if (originTimeStamp === 0) {
				originTimeStamp = e.timeStamp;
			}
			const ev: IRecordedInputEvent = {
				timeStamp: e.timeStamp - originTimeStamp,
				state: readTextareaState(),
				type: e.type,
				data: e.data,
				inputType: e.inputType,
				isComposing: e.isComposing,
			};
			recordEvent(ev);
		};

		wrapper.onKeyDown(recordKeyboardEvent);
		wrapper.onKeyPress(recordKeyboardEvent);
		wrapper.onKeyUp(recordKeyboardEvent);
		wrapper.onCompositionStart(recordCompositionEvent);
		wrapper.onCompositionUpdate(recordCompositionEvent);
		wrapper.onCompositionEnd(recordCompositionEvent);
		wrapper.onBeforeInput(recordInputEvent);
		wrapper.onInput(recordInputEvent);
	}

})();
