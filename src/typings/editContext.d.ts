/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

type DOMString = string;

interface EditContext extends EventTarget {

	updateText(rangeStart: number, rangeEnd: number, text: DOMString): void;
	updateSelection(start: number, end: number): void;
	updateControlBounds(controlBounds: DOMRect): void;
	updateSelectionBounds(selectionBounds: DOMRect): void;
	updateCharacterBounds(rangeStart: number, characterBounds: DOMRect[]): void;

	attachedElements(): HTMLElement[];

	get text(): DOMString;
	get selectionStart(): number;
	get selectionEnd(): number;
	get characterBoundsRangeStart(): number;
	characterBounds(): DOMRect[];

	get ontextupdate(): EventHandler<TextUpdateEvent> | null;
	set ontextupdate(value: EventHandler | null);

	get ontextformatupdate(): EventHandler | null;
	set ontextformatupdate(value: EventHandler | null);

	get oncharacterboundsupdate(): EventHandler | null;
	set oncharacterboundsupdate(value: EventHandler | null);

	get oncompositionstart(): EventHandler | null;
	set oncompositionstart(value: EventHandler | null);

	get oncompositionend(): EventHandler | null;
	set oncompositionend(value: EventHandler | null);

	addEventListener<K extends keyof EditContextEventHandlersEventMap>(type: K, listener: (this: GlobalEventHandlers, ev: EditContextEventHandlersEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
	addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
	removeEventListener<K extends keyof EditContextEventHandlersEventMap>(type: K, listener: (this: GlobalEventHandlers, ev: EditContextEventHandlersEventMap[K]) => any, options?: boolean | EventListenerOptions): void;
	removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
}

interface EditContextInit {
	text: DOMString;
	selectionStart: number;
	selectionEnd: number;
}

interface EditContextEventHandlersEventMap {
	textupdate: TextUpdateEvent;
	textformatupdate: TextFormatUpdateEvent;
	characterboundsupdate: CharacterBoundsUpdateEvent;
	compositionstart: Event;
	compositionend: Event;
}

type EventHandler<TEvent extends Event = Event> = (event: TEvent) => void;

declare class TextUpdateEvent extends Event {
	constructor(type: DOMString, options?: TextUpdateEventInit);

	readonly updateRangeStart: number;
	readonly updateRangeEnd: number;
	readonly text: DOMString;
	readonly selectionStart: number;
	readonly selectionEnd: number;
}

interface TextUpdateEventInit extends EventInit {
	updateRangeStart: number;
	updateRangeEnd: number;
	text: DOMString;
	selectionStart: number;
	selectionEnd: number;
	compositionStart: number;
	compositionEnd: number;
}

interface TextFormat {
	new(options?: TextFormatInit): TextFormat;

	readonly rangeStart: number;
	readonly rangeEnd: number;
	readonly underlineStyle: UnderlineStyle;
	readonly underlineThickness: UnderlineThickness;
}

interface TextFormatInit {
	rangeStart: number;
	rangeEnd: number;
	underlineStyle: UnderlineStyle;
	underlineThickness: UnderlineThickness;
}

type UnderlineStyle = 'none' | 'solid' | 'dotted' | 'dashed' | 'wavy';
type UnderlineThickness = 'none' | 'thin' | 'thick';

interface TextFormatUpdateEvent extends Event {
	new(type: DOMString, options?: TextFormatUpdateEventInit): TextFormatUpdateEvent;
	getTextFormats(): TextFormat[];
}

interface TextFormatUpdateEventInit extends EventInit {
	textFormats: TextFormat[];
}

interface CharacterBoundsUpdateEvent extends Event {
	new(type: DOMString, options?: CharacterBoundsUpdateEventInit): CharacterBoundsUpdateEvent;

	readonly rangeStart: number;
	readonly rangeEnd: number;
}

interface CharacterBoundsUpdateEventInit extends EventInit {
	rangeStart: number;
	rangeEnd: number;
}

interface HTMLElement {
	editContext?: EditContext;
}
