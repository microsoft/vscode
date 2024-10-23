/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

type DOMString = string;

class EditContext extends EventTarget {
    private _text: DOMString;
    private _selectionStart: number;
    private _selectionEnd: number;
    private _characterBounds: DOMRect[] = [];

    constructor(init: EditContextInit) {
        super();
        this._text = init.text;
        this._selectionStart = init.selectionStart;
        this._selectionEnd = init.selectionEnd;
    }

    updateText(rangeStart: number, rangeEnd: number, text: DOMString): void {
        this._text = this._text.slice(0, rangeStart) + text + this._text.slice(rangeEnd);
    }

    updateSelection(start: number, end: number): void {
        this._selectionStart = start;
        this._selectionEnd = end;
    }

    updateControlBounds(controlBounds: DOMRect): void {
        // Update control bounds logic
    }

    updateSelectionBounds(selectionBounds: DOMRect): void {
        // Update selection bounds logic
    }

    updateCharacterBounds(rangeStart: number, characterBounds: DOMRect[]): void {
        this._characterBounds = characterBounds;
    }

    attachedElements(): HTMLElement[] {
        return Array.from(document.querySelectorAll(`[editContext]`)) as HTMLElement[];
    }

    get text(): DOMString {
        return this._text;
    }

    get selectionStart(): number {
        return this._selectionStart;
    }

    get selectionEnd(): number {
        return this._selectionEnd;
    }

    get characterBoundsRangeStart(): number {
        return 0; // Placeholder for the actual value
    }

    characterBounds(): DOMRect[] {
        return this._characterBounds;
    }

    ontextupdate?: EventHandler<TextUpdateEvent>;
    ontextformatupdate?: EventHandler<TextFormatUpdateEvent>;
    oncharacterboundsupdate?: EventHandler<CharacterBoundsUpdateEvent>;
    oncompositionstart?: EventHandler<Event>;
    oncompositionend?: EventHandler<Event>;
}

interface EditContextInit {
    text: DOMString;
    selectionStart: number;
    selectionEnd: number;
}

type EventHandler<TEvent extends Event = Event> = (event: TEvent) => void;

class TextUpdateEvent extends Event {
    readonly updateRangeStart: number;
    readonly updateRangeEnd: number;
    readonly text: DOMString;
    readonly selectionStart: number;
    readonly selectionEnd: number;

    constructor(type: DOMString, options: TextUpdateEventInit) {
        super(type);
        this.updateRangeStart = options.updateRangeStart;
        this.updateRangeEnd = options.updateRangeEnd;
        this.text = options.text;
        this.selectionStart = options.selectionStart;
        this.selectionEnd = options.selectionEnd;
    }
}

interface TextUpdateEventInit extends EventInit {
    updateRangeStart: number;
    updateRangeEnd: number;
    text: DOMString;
    selectionStart: number;
    selectionEnd: number;
}

class TextFormat {
    readonly rangeStart: number;
    readonly rangeEnd: number;
    readonly underlineStyle: UnderlineStyle;
    readonly underlineThickness: UnderlineThickness;

    constructor(options: TextFormatInit) {
        this.rangeStart = options.rangeStart;
        this.rangeEnd = options.rangeEnd;
        this.underlineStyle = options.underlineStyle;
        this.underlineThickness = options.underlineThickness;
    }
}

interface TextFormatInit {
    rangeStart: number;
    rangeEnd: number;
    underlineStyle: UnderlineStyle;
    underlineThickness: UnderlineThickness;
}

type UnderlineStyle = 'none' | 'solid' | 'dotted' | 'dashed' | 'wavy';
type UnderlineThickness = 'none' | 'thin' | 'thick';

class TextFormatUpdateEvent extends Event {
    readonly textFormats: TextFormat[];

    constructor(type: DOMString, options: TextFormatUpdateEventInit) {
        super(type);
        this.textFormats = options.textFormats;
    }

    getTextFormats(): TextFormat[] {
        return this.textFormats;
    }
}

interface TextFormatUpdateEventInit extends EventInit {
    textFormats: TextFormat[];
}

class CharacterBoundsUpdateEvent extends Event {
    readonly rangeStart: number;
    readonly rangeEnd: number;

    constructor(type: DOMString, options: CharacterBoundsUpdateEventInit) {
        super(type);
        this.rangeStart = options.rangeStart;
        this.rangeEnd = options.rangeEnd;
    }
}

interface CharacterBoundsUpdateEventInit extends EventInit {
    rangeStart: number;
    rangeEnd: number;
}

interface HTMLElement {
    editContext?: EditContext;
}
