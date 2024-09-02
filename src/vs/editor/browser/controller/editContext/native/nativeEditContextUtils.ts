/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';

export class EditContextWrapper {

	private _textStartPositionWithinEditor: Position = new Position(1, 1);
	private _compositionRange: Range | undefined;

	constructor(private readonly _editContext: EditContext) { }

	equals(other: EditContextWrapper): boolean {
		return (
			this.text === other.text
			&& this.selectionStart === other.selectionStart
			&& this.selectionEnd === other.selectionEnd
			&& this.textStartPositionWithinEditor.equals(other.textStartPositionWithinEditor)
		);
	}

	onTextUpdate(listener: (this: GlobalEventHandlers, ev: TextUpdateEvent) => void) {
		return editContextAddDisposableListener(this._editContext, 'textupdate', listener);
	}

	onCompositionStart(listener: (this: GlobalEventHandlers, ev: Event) => void) {
		return editContextAddDisposableListener(this._editContext, 'compositionstart', listener);
	}

	onCompositionEnd(listener: (this: GlobalEventHandlers, ev: Event) => void) {
		return editContextAddDisposableListener(this._editContext, 'compositionend', listener);
	}

	onCharacterBoundsUpdate(listener: (this: GlobalEventHandlers, ev: CharacterBoundsUpdateEvent) => void) {
		return editContextAddDisposableListener(this._editContext, 'characterboundsupdate', listener);
	}

	onTextFormatUpdate(listener: (this: GlobalEventHandlers, ev: TextFormatUpdateEvent) => void) {
		return editContextAddDisposableListener(this._editContext, 'textformatupdate', listener);
	}

	updateText(rangeStart: number, rangeEnd: number, text: string): void {
		this._editContext.updateText(rangeStart, rangeEnd, text);
	}

	updateSelection(selectionStart: number, selectionEnd: number): void {
		this._editContext.updateSelection(selectionStart, selectionEnd);
	}

	updateTextStartPositionWithinEditor(textStartPositionWithinEditor: Position): void {
		this._textStartPositionWithinEditor = textStartPositionWithinEditor;
	}

	updateControlBounds(controlBounds: DOMRect): void {
		this._editContext.updateControlBounds(controlBounds);
	}

	updateSelectionBounds(selectionBounds: DOMRect): void {
		this._editContext.updateSelectionBounds(selectionBounds);
	}

	updateCharacterBounds(rangeStart: number, characterBounds: DOMRect[]): void {
		this._editContext.updateCharacterBounds(rangeStart, characterBounds);
	}

	updateCompositionRange(compositionRange: Range | undefined): void {
		this._compositionRange = compositionRange;
	}

	public get text(): string {
		return this._editContext.text;
	}

	public get selectionStart(): number {
		return this._editContext.selectionStart;
	}

	public get selectionEnd(): number {
		return this._editContext.selectionEnd;
	}

	public get characterBounds(): DOMRect[] {
		return this._editContext.characterBounds();
	}

	public get textStartPositionWithinEditor(): Position {
		return this._textStartPositionWithinEditor;
	}

	public get compositionRange(): Range | undefined {
		return this._compositionRange;
	}
}

export function editContextAddDisposableListener<K extends keyof EditContextEventHandlersEventMap>(target: EventTarget, type: K, listener: (this: GlobalEventHandlers, ev: EditContextEventHandlersEventMap[K]) => any, options?: boolean | AddEventListenerOptions): IDisposable {
	target.addEventListener(type, listener as any, options);
	return {
		dispose() {
			target.removeEventListener(type, listener as any);
		}
	};
}
