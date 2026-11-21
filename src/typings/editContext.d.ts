/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


/* =========================================================
   =============== 1. BASIC TYPE DEFINITIONS ===============
   ========================================================= */

type DOMString = string;

type EventHandler<TEvent extends Event = Event> =
	(event: TEvent) => void;

type UnderlineStyle =
	| 'none'
	| 'solid'
	| 'dotted'
	| 'dashed'
	| 'wavy';

type UnderlineThickness =
	| 'none'
	| 'thin'
	| 'thick';



/* =========================================================
   ================= 2. CORE EDIT CONTEXT ==================
   ========================================================= */

interface EditContext extends EventTarget {

	/* ---------- Editing Methods ---------- */

	updateText(rangeStart: number, rangeEnd: number, text: DOMString): void;
	updateSelection(start: number, end: number): void;
	updateControlBounds(controlBounds: DOMRect): void;
	updateSelectionBounds(selectionBounds: DOMRect): void;
	updateCharacterBounds(rangeStart: number, characterBounds: DOMRect[]): void;

	attachedElements(): HTMLElement[];

	/* ---------- State Accessors ---------- */

	readonly text: DOMString;
	readonly selectionStart: number;
	readonly selectionEnd: number;
	readonly characterBoundsRangeStart: number;

	characterBounds(): DOMRect[];

	/* ---------- Event Properties ---------- */

	ontextupdate: EventHandler<TextUpdateEvent> | null;
	ontextformatupdate: EventHandler | null;
	oncharacterboundsupdate: EventHandler | null;
	oncompositionstart: EventHandler | null;
	oncompositionend: EventHandler | null;

	/* ---------- Event Listener API ---------- */

	addEventListener<K extends keyof EditContextEventHandlersEventMap>(
		type: K,
		listener: (
			this: GlobalEventHandlers,
			ev: EditContextEventHandlersEventMap[K]
		) => any,
		options?: boolean | AddEventListenerOptions
	): void;

	addEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | AddEventListenerOptions
	): void;

	removeEventListener<K extends keyof EditContextEventHandlersEventMap>(
		type: K,
		listener: (
			this: GlobalEventHandlers,
			ev: EditContextEventHandlersEventMap[K]
		) => any,
		options?: boolean | EventListenerOptions
	): void;

	removeEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | EventListenerOptions
	): void;
}



/* =========================================================
   ================== 3. INITIALIZATION ====================
   ========================================================= */

interface EditContextInit {
	text: DOMString;
	selectionStart: number;
	selectionEnd: number;
}



/* =========================================================
   ================== 4. EVENT MAP TYPES ===================
   ========================================================= */

interface EditContextEventHandlersEventMap {
	textupdate: TextUpdateEvent;
	textformatupdate: TextFormatUpdateEvent;
	characterboundsupdate: CharacterBoundsUpdateEvent;
	compositionstart: Event;
	compositionend: Event;
}



/* =========================================================
   ================== 5. TEXT UPDATE EVENT =================
   ========================================================= */

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



/* =========================================================
   ================== 6. TEXT FORMAT TYPES =================
   ========================================================= */

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



/* =========================================================
   =============== 7. TEXT FORMAT UPDATE EVENT =============
   ========================================================= */

interface TextFormatUpdateEvent extends Event {
	new(type: DOMString, options?: TextFormatUpdateEventInit): TextFormatUpdateEvent;
	getTextFormats(): TextFormat[];
}

interface TextFormatUpdateEventInit extends EventInit {
	textFormats: TextFormat[];
}



/* =========================================================
   ============ 8. CHARACTER BOUNDS UPDATE EVENT ==========
   ========================================================= */

interface CharacterBoundsUpdateEvent extends Event {
	new(type: DOMString, options?: CharacterBoundsUpdateEventInit): CharacterBoundsUpdateEvent;

	readonly rangeStart: number;
	readonly rangeEnd: number;
}

interface CharacterBoundsUpdateEventInit extends EventInit {
	rangeStart: number;
	rangeEnd: number;
}



/* =========================================================
   ================== 9. HTML EXTENSION ====================
   ========================================================= */

interface HTMLElement {
	editContext?: EditContext;
}
