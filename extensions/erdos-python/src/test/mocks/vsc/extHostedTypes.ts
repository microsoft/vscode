/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-classes-per-file */
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { relative } from 'path';
import * as vscode from 'vscode';
import * as vscMockHtmlContent from './htmlContent';
import * as vscMockStrings from './strings';
import * as vscUri from './uri';
import { generateUuid } from './uuid';

export enum NotebookCellKind {
    Markup = 1,
    Code = 2,
}

export enum CellOutputKind {
    Text = 1,
    Error = 2,
    Rich = 3,
}
export enum NotebookCellRunState {
    Running = 1,
    Idle = 2,
    Success = 3,
    Error = 4,
}

export interface IRelativePattern {
    base: string;
    pattern: string;
    pathToRelative(from: string, to: string): string;
}

const illegalArgument = (msg = 'Illegal Argument') => new Error(msg);

export class Disposable {
    static from(...disposables: { dispose(): () => void }[]): Disposable {
        return new Disposable(() => {
            if (disposables) {
                for (const disposable of disposables) {
                    if (disposable && typeof disposable.dispose === 'function') {
                        disposable.dispose();
                    }
                }

                disposables = [];
            }
        });
    }

    private _callOnDispose: (() => void) | undefined;

    constructor(callOnDispose: () => void) {
        this._callOnDispose = callOnDispose;
    }

    dispose(): void {
        if (typeof this._callOnDispose === 'function') {
            this._callOnDispose();
            this._callOnDispose = undefined;
        }
    }
}

export class Position {
    static Min(...positions: Position[]): Position {
        let result = positions.pop();
        for (const p of positions) {
            if (result && p.isBefore(result)) {
                result = p;
            }
        }
        return result || new Position(0, 0);
    }

    static Max(...positions: Position[]): Position {
        let result = positions.pop();
        for (const p of positions) {
            if (result && p.isAfter(result)) {
                result = p;
            }
        }
        return result || new Position(0, 0);
    }

    static isPosition(other: unknown): other is Position {
        if (!other) {
            return false;
        }
        if (other instanceof Position) {
            return true;
        }
        const { line, character } = <Position>other;
        if (typeof line === 'number' && typeof character === 'number') {
            return true;
        }
        return false;
    }

    private _line: number;

    private _character: number;

    get line(): number {
        return this._line;
    }

    get character(): number {
        return this._character;
    }

    constructor(line: number, character: number) {
        if (line < 0) {
            throw illegalArgument('line must be non-negative');
        }
        if (character < 0) {
            throw illegalArgument('character must be non-negative');
        }
        this._line = line;
        this._character = character;
    }

    isBefore(other: Position): boolean {
        if (this._line < other._line) {
            return true;
        }
        if (other._line < this._line) {
            return false;
        }
        return this._character < other._character;
    }

    isBeforeOrEqual(other: Position): boolean {
        if (this._line < other._line) {
            return true;
        }
        if (other._line < this._line) {
            return false;
        }
        return this._character <= other._character;
    }

    isAfter(other: Position): boolean {
        return !this.isBeforeOrEqual(other);
    }

    isAfterOrEqual(other: Position): boolean {
        return !this.isBefore(other);
    }

    isEqual(other: Position): boolean {
        return this._line === other._line && this._character === other._character;
    }

    compareTo(other: Position): number {
        if (this._line < other._line) {
            return -1;
        }
        if (this._line > other.line) {
            return 1;
        }
        // equal line
        if (this._character < other._character) {
            return -1;
        }
        if (this._character > other._character) {
            return 1;
        }
        // equal line and character
        return 0;
    }

    translate(change: { lineDelta?: number; characterDelta?: number }): Position;

    translate(lineDelta?: number, characterDelta?: number): Position;

    translate(
        lineDeltaOrChange: number | { lineDelta?: number; characterDelta?: number } | undefined,
        characterDelta = 0,
    ): Position {
        if (lineDeltaOrChange === null || characterDelta === null) {
            throw illegalArgument();
        }

        let lineDelta: number;
        if (typeof lineDeltaOrChange === 'undefined') {
            lineDelta = 0;
        } else if (typeof lineDeltaOrChange === 'number') {
            lineDelta = lineDeltaOrChange;
        } else {
            lineDelta = typeof lineDeltaOrChange.lineDelta === 'number' ? lineDeltaOrChange.lineDelta : 0;
            characterDelta =
                typeof lineDeltaOrChange.characterDelta === 'number' ? lineDeltaOrChange.characterDelta : 0;
        }

        if (lineDelta === 0 && characterDelta === 0) {
            return this;
        }
        return new Position(this.line + lineDelta, this.character + characterDelta);
    }

    with(change: { line?: number; character?: number }): Position;

    with(line?: number, character?: number): Position;

    with(
        lineOrChange: number | { line?: number; character?: number } | undefined,
        character: number = this.character,
    ): Position {
        if (lineOrChange === null || character === null) {
            throw illegalArgument();
        }

        let line: number;
        if (typeof lineOrChange === 'undefined') {
            line = this.line;
        } else if (typeof lineOrChange === 'number') {
            line = lineOrChange;
        } else {
            line = typeof lineOrChange.line === 'number' ? lineOrChange.line : this.line;
            character = typeof lineOrChange.character === 'number' ? lineOrChange.character : this.character;
        }

        if (line === this.line && character === this.character) {
            return this;
        }
        return new Position(line, character);
    }

    toJSON(): { line: number; character: number } {
        return { line: this.line, character: this.character };
    }
}

export class Range {
    static isRange(thing: unknown): thing is vscode.Range {
        if (thing instanceof Range) {
            return true;
        }
        if (!thing) {
            return false;
        }
        return Position.isPosition((thing as Range).start) && Position.isPosition((thing as Range).end);
    }

    protected _start: Position;

    protected _end: Position;

    get start(): Position {
        return this._start;
    }

    get end(): Position {
        return this._end;
    }

    constructor(start: Position, end: Position);

    constructor(startLine: number, startColumn: number, endLine: number, endColumn: number);

    constructor(
        startLineOrStart: number | Position,
        startColumnOrEnd: number | Position,
        endLine?: number,
        endColumn?: number,
    ) {
        let start: Position | undefined;
        let end: Position | undefined;

        if (
            typeof startLineOrStart === 'number' &&
            typeof startColumnOrEnd === 'number' &&
            typeof endLine === 'number' &&
            typeof endColumn === 'number'
        ) {
            start = new Position(startLineOrStart, startColumnOrEnd);
            end = new Position(endLine, endColumn);
        } else if (startLineOrStart instanceof Position && startColumnOrEnd instanceof Position) {
            start = startLineOrStart;
            end = startColumnOrEnd;
        }

        if (!start || !end) {
            throw new Error('Invalid arguments');
        }

        if (start.isBefore(end)) {
            this._start = start;
            this._end = end;
        } else {
            this._start = end;
            this._end = start;
        }
    }

    contains(positionOrRange: Position | Range): boolean {
        if (positionOrRange instanceof Range) {
            return this.contains(positionOrRange._start) && this.contains(positionOrRange._end);
        }
        if (positionOrRange instanceof Position) {
            if (positionOrRange.isBefore(this._start)) {
                return false;
            }
            if (this._end.isBefore(positionOrRange)) {
                return false;
            }
            return true;
        }
        return false;
    }

    isEqual(other: Range): boolean {
        return this._start.isEqual(other._start) && this._end.isEqual(other._end);
    }

    intersection(other: Range): Range | undefined {
        const start = Position.Max(other.start, this._start);
        const end = Position.Min(other.end, this._end);
        if (start.isAfter(end)) {
            // this happens when there is no overlap:
            // |-----|
            //          |----|
            return undefined;
        }
        return new Range(start, end);
    }

    union(other: Range): Range {
        if (this.contains(other)) {
            return this;
        }
        if (other.contains(this)) {
            return other;
        }
        const start = Position.Min(other.start, this._start);
        const end = Position.Max(other.end, this.end);
        return new Range(start, end);
    }

    get isEmpty(): boolean {
        return this._start.isEqual(this._end);
    }

    get isSingleLine(): boolean {
        return this._start.line === this._end.line;
    }

    with(change: { start?: Position; end?: Position }): Range;

    with(start?: Position, end?: Position): Range;

    with(startOrChange: Position | { start?: Position; end?: Position } | undefined, end: Position = this.end): Range {
        if (startOrChange === null || end === null) {
            throw illegalArgument();
        }

        let start: Position;
        if (!startOrChange) {
            start = this.start;
        } else if (Position.isPosition(startOrChange)) {
            start = startOrChange;
        } else {
            start = startOrChange.start || this.start;
            end = startOrChange.end || this.end;
        }

        if (start.isEqual(this._start) && end.isEqual(this.end)) {
            return this;
        }
        return new Range(start, end);
    }

    toJSON(): [Position, Position] {
        return [this.start, this.end];
    }
}

export class Selection extends Range {
    static isSelection(thing: unknown): thing is Selection {
        if (thing instanceof Selection) {
            return true;
        }
        if (!thing) {
            return false;
        }
        return (
            Range.isRange(thing) &&
            Position.isPosition((<Selection>thing).anchor) &&
            Position.isPosition((<Selection>thing).active) &&
            typeof (<Selection>thing).isReversed === 'boolean'
        );
    }

    private _anchor: Position;

    public get anchor(): Position {
        return this._anchor;
    }

    private _active: Position;

    public get active(): Position {
        return this._active;
    }

    constructor(anchor: Position, active: Position);

    constructor(anchorLine: number, anchorColumn: number, activeLine: number, activeColumn: number);

    constructor(
        anchorLineOrAnchor: number | Position,
        anchorColumnOrActive: number | Position,
        activeLine?: number,
        activeColumn?: number,
    ) {
        let anchor: Position | undefined;
        let active: Position | undefined;

        if (
            typeof anchorLineOrAnchor === 'number' &&
            typeof anchorColumnOrActive === 'number' &&
            typeof activeLine === 'number' &&
            typeof activeColumn === 'number'
        ) {
            anchor = new Position(anchorLineOrAnchor, anchorColumnOrActive);
            active = new Position(activeLine, activeColumn);
        } else if (anchorLineOrAnchor instanceof Position && anchorColumnOrActive instanceof Position) {
            anchor = anchorLineOrAnchor;
            active = anchorColumnOrActive;
        }

        if (!anchor || !active) {
            throw new Error('Invalid arguments');
        }

        super(anchor, active);

        this._anchor = anchor;
        this._active = active;
    }

    get isReversed(): boolean {
        return this._anchor === this._end;
    }

    toJSON(): [Position, Position] {
        return ({
            start: this.start,
            end: this.end,
            active: this.active,
            anchor: this.anchor,
        } as unknown) as [Position, Position];
    }
}

export enum EndOfLine {
    LF = 1,
    CRLF = 2,
}

export class TextEdit {
    static isTextEdit(thing: unknown): thing is TextEdit {
        if (thing instanceof TextEdit) {
            return true;
        }
        if (!thing) {
            return false;
        }
        return Range.isRange(<TextEdit>thing) && typeof (<TextEdit>thing).newText === 'string';
    }

    static replace(range: Range, newText: string): TextEdit {
        return new TextEdit(range, newText);
    }

    static insert(position: Position, newText: string): TextEdit {
        return TextEdit.replace(new Range(position, position), newText);
    }

    static delete(range: Range): TextEdit {
        return TextEdit.replace(range, '');
    }

    static setEndOfLine(eol: EndOfLine): TextEdit {
        const ret = new TextEdit(new Range(new Position(0, 0), new Position(0, 0)), '');
        ret.newEol = eol;
        return ret;
    }

    _range: Range = new Range(new Position(0, 0), new Position(0, 0));

    newText = '';

    _newEol: EndOfLine = EndOfLine.LF;

    get range(): Range {
        return this._range;
    }

    set range(value: Range) {
        if (value && !Range.isRange(value)) {
            throw illegalArgument('range');
        }
        this._range = value;
    }

    get newEol(): EndOfLine {
        return this._newEol;
    }

    set newEol(value: EndOfLine) {
        if (value && typeof value !== 'number') {
            throw illegalArgument('newEol');
        }
        this._newEol = value;
    }

    constructor(range: Range, newText: string) {
        this.range = range;
        this.newText = newText;
    }
}

export class WorkspaceEdit implements vscode.WorkspaceEdit {
    // eslint-disable-next-line class-methods-use-this
    appendNotebookCellOutput(
        _uri: vscode.Uri,
        _index: number,
        _outputs: vscode.NotebookCellOutput[],
        _metadata?: vscode.WorkspaceEditEntryMetadata,
    ): void {
        // Noop.
    }

    // eslint-disable-next-line class-methods-use-this
    replaceNotebookCellOutputItems(
        _uri: vscode.Uri,
        _index: number,
        _outputId: string,
        _items: vscode.NotebookCellOutputItem[],
        _metadata?: vscode.WorkspaceEditEntryMetadata,
    ): void {
        // Noop.
    }

    // eslint-disable-next-line class-methods-use-this
    appendNotebookCellOutputItems(
        _uri: vscode.Uri,
        _index: number,
        _outputId: string,
        _items: vscode.NotebookCellOutputItem[],
        _metadata?: vscode.WorkspaceEditEntryMetadata,
    ): void {
        // Noop.
    }

    // eslint-disable-next-line class-methods-use-this
    replaceNotebookCells(
        _uri: vscode.Uri,
        _start: number,
        _end: number,
        _cells: vscode.NotebookCellData[],
        _metadata?: vscode.WorkspaceEditEntryMetadata,
    ): void {
        // Noop.
    }

    // eslint-disable-next-line class-methods-use-this
    replaceNotebookCellOutput(
        _uri: vscode.Uri,
        _index: number,
        _outputs: vscode.NotebookCellOutput[],
        _metadata?: vscode.WorkspaceEditEntryMetadata,
    ): void {
        // Noop.
    }

    private _seqPool = 0;

    private _resourceEdits: { seq: number; from: vscUri.URI; to: vscUri.URI }[] = [];

    private _textEdits = new Map<string, { seq: number; uri: vscUri.URI; edits: TextEdit[] }>();

    // createResource(uri: vscode.Uri): void {
    // 	this.renameResource(undefined, uri);
    // }

    // deleteResource(uri: vscode.Uri): void {
    // 	this.renameResource(uri, undefined);
    // }

    // renameResource(from: vscode.Uri, to: vscode.Uri): void {
    // 	this._resourceEdits.push({ seq: this._seqPool+= 1, from, to });
    // }

    // resourceEdits(): [vscode.Uri, vscode.Uri][] {
    // 	return this._resourceEdits.map(({ from, to }) => (<[vscode.Uri, vscode.Uri]>[from, to]));
    // }

    // eslint-disable-next-line class-methods-use-this
    createFile(_uri: vscode.Uri, _options?: { overwrite?: boolean; ignoreIfExists?: boolean }): void {
        throw new Error('Method not implemented.');
    }

    // eslint-disable-next-line class-methods-use-this
    deleteFile(_uri: vscode.Uri, _options?: { recursive?: boolean; ignoreIfNotExists?: boolean }): void {
        throw new Error('Method not implemented.');
    }

    // eslint-disable-next-line class-methods-use-this
    renameFile(
        _oldUri: vscode.Uri,
        _newUri: vscode.Uri,
        _options?: { overwrite?: boolean; ignoreIfExists?: boolean },
    ): void {
        throw new Error('Method not implemented.');
    }

    replace(uri: vscUri.URI, range: Range, newText: string): void {
        const edit = new TextEdit(range, newText);
        let array = this.get(uri);
        if (array) {
            array.push(edit);
        } else {
            array = [edit];
        }
        this.set(uri, array);
    }

    insert(resource: vscUri.URI, position: Position, newText: string): void {
        this.replace(resource, new Range(position, position), newText);
    }

    delete(resource: vscUri.URI, range: Range): void {
        this.replace(resource, range, '');
    }

    has(uri: vscUri.URI): boolean {
        return this._textEdits.has(uri.toString());
    }

    set(uri: vscUri.URI, edits: readonly unknown[]): void {
        let data = this._textEdits.get(uri.toString());
        if (!data) {
            data = { seq: this._seqPool += 1, uri, edits: [] };
            this._textEdits.set(uri.toString(), data);
        }
        if (!edits) {
            data.edits = [];
        } else {
            data.edits = edits.slice(0) as TextEdit[];
        }
    }

    get(uri: vscUri.URI): TextEdit[] {
        if (!this._textEdits.has(uri.toString())) {
            return [];
        }
        const { edits } = this._textEdits.get(uri.toString()) || {};
        return edits ? edits.slice() : [];
    }

    entries(): [vscUri.URI, TextEdit[]][] {
        const res: [vscUri.URI, TextEdit[]][] = [];
        this._textEdits.forEach((value) => res.push([value.uri, value.edits]));
        return res.slice();
    }

    allEntries(): ([vscUri.URI, TextEdit[]] | [vscUri.URI, vscUri.URI])[] {
        return this.entries();
        // 	// use the 'seq' the we have assigned when inserting
        // 	// the operation and use that order in the resulting
        // 	// array
        // 	const res: ([vscUri.URI, TextEdit[]] | [vscUri.URI,vscUri.URI])[] = [];
        // 	this._textEdits.forEach(value => {
        // 		const { seq, uri, edits } = value;
        // 		res[seq] = [uri, edits];
        // 	});
        // 	this._resourceEdits.forEach(value => {
        // 		const { seq, from, to } = value;
        // 		res[seq] = [from, to];
        // 	});
        // 	return res;
    }

    get size(): number {
        return this._textEdits.size + this._resourceEdits.length;
    }

    toJSON(): [vscUri.URI, TextEdit[]][] {
        return this.entries();
    }
}

export class SnippetString {
    static isSnippetString(thing: unknown): thing is SnippetString {
        if (thing instanceof SnippetString) {
            return true;
        }
        if (!thing) {
            return false;
        }
        return typeof (<SnippetString>thing).value === 'string';
    }

    private static _escape(value: string): string {
        return value.replace(/\$|}|\\/g, '\\$&');
    }

    private _tabstop = 1;

    value: string;

    constructor(value?: string) {
        this.value = value || '';
    }

    appendText(string: string): SnippetString {
        this.value += SnippetString._escape(string);
        return this;
    }

    appendTabstop(number: number = (this._tabstop += 1)): SnippetString {
        this.value += '$';
        this.value += number;
        return this;
    }

    appendPlaceholder(
        value: string | ((snippet: SnippetString) => void),
        number: number = (this._tabstop += 1),
    ): SnippetString {
        if (typeof value === 'function') {
            const nested = new SnippetString();
            nested._tabstop = this._tabstop;
            value(nested);
            this._tabstop = nested._tabstop;
            value = nested.value;
        } else {
            value = SnippetString._escape(value);
        }

        this.value += '${';
        this.value += number;
        this.value += ':';
        this.value += value;
        this.value += '}';

        return this;
    }

    appendChoice(values: string[], number: number = (this._tabstop += 1)): SnippetString {
        const value = SnippetString._escape(values.toString());

        this.value += '${';
        this.value += number;
        this.value += '|';
        this.value += value;
        this.value += '|}';

        return this;
    }

    appendVariable(name: string, defaultValue?: string | ((snippet: SnippetString) => void)): SnippetString {
        if (typeof defaultValue === 'function') {
            const nested = new SnippetString();
            nested._tabstop = this._tabstop;
            defaultValue(nested);
            this._tabstop = nested._tabstop;
            defaultValue = nested.value;
        } else if (typeof defaultValue === 'string') {
            defaultValue = defaultValue.replace(/\$|}/g, '\\$&'); // CodeQL [SM02383] don't escape backslashes here (by design)
        }

        this.value += '${';
        this.value += name;
        if (defaultValue) {
            this.value += ':';
            this.value += defaultValue;
        }
        this.value += '}';

        return this;
    }
}

export enum DiagnosticTag {
    Unnecessary = 1,
}

export enum DiagnosticSeverity {
    Hint = 3,
    Information = 2,
    Warning = 1,
    Error = 0,
}

export class Location {
    static isLocation(thing: unknown): thing is Location {
        if (thing instanceof Location) {
            return true;
        }
        if (!thing) {
            return false;
        }
        return Range.isRange((<Location>thing).range) && vscUri.URI.isUri((<Location>thing).uri);
    }

    uri: vscUri.URI;

    range: Range = new Range(new Position(0, 0), new Position(0, 0));

    constructor(uri: vscUri.URI, rangeOrPosition: Range | Position) {
        this.uri = uri;

        if (!rangeOrPosition) {
            // that's OK
        } else if (rangeOrPosition instanceof Range) {
            this.range = rangeOrPosition;
        } else if (rangeOrPosition instanceof Position) {
            this.range = new Range(rangeOrPosition, rangeOrPosition);
        } else {
            throw new Error('Illegal argument');
        }
    }

    toJSON(): { uri: vscUri.URI; range: Range } {
        return {
            uri: this.uri,
            range: this.range,
        };
    }
}

export class DiagnosticRelatedInformation {
    static is(thing: unknown): thing is DiagnosticRelatedInformation {
        if (!thing) {
            return false;
        }
        return (
            typeof (<DiagnosticRelatedInformation>thing).message === 'string' &&
            (<DiagnosticRelatedInformation>thing).location &&
            Range.isRange((<DiagnosticRelatedInformation>thing).location.range) &&
            vscUri.URI.isUri((<DiagnosticRelatedInformation>thing).location.uri)
        );
    }

    location: Location;

    message: string;

    constructor(location: Location, message: string) {
        this.location = location;
        this.message = message;
    }
}

export class Diagnostic {
    range: Range;

    message: string;

    source = '';

    code: string | number = '';

    severity: DiagnosticSeverity;

    relatedInformation: DiagnosticRelatedInformation[] = [];

    customTags?: DiagnosticTag[];

    constructor(range: Range, message: string, severity: DiagnosticSeverity = DiagnosticSeverity.Error) {
        this.range = range;
        this.message = message;
        this.severity = severity;
    }

    toJSON(): { severity: DiagnosticSeverity; message: string; range: Range; source: string; code: string | number } {
        return {
            severity: (DiagnosticSeverity[this.severity] as unknown) as DiagnosticSeverity,
            message: this.message,
            range: this.range,
            source: this.source,
            code: this.code,
        };
    }
}

export class Hover {
    public contents: vscode.MarkdownString[];

    public range: Range;

    constructor(contents: vscode.MarkdownString | vscode.MarkdownString[], range?: Range) {
        if (!contents) {
            throw new Error('Illegal argument, contents must be defined');
        }
        if (Array.isArray(contents)) {
            this.contents = <vscode.MarkdownString[]>contents;
        } else if (vscMockHtmlContent.isMarkdownString(contents)) {
            this.contents = [contents];
        } else {
            this.contents = [contents];
        }

        this.range = range || new Range(new Position(0, 0), new Position(0, 0));
    }
}

export enum DocumentHighlightKind {
    Text = 0,
    Read = 1,
    Write = 2,
}

export class DocumentHighlight {
    range: Range;

    kind: DocumentHighlightKind;

    constructor(range: Range, kind: DocumentHighlightKind = DocumentHighlightKind.Text) {
        this.range = range;
        this.kind = kind;
    }

    toJSON(): { range: Range; kind: DocumentHighlightKind } {
        return {
            range: this.range,
            kind: (DocumentHighlightKind[this.kind] as unknown) as DocumentHighlightKind,
        };
    }
}

export enum SymbolKind {
    File = 0,
    Module = 1,
    Namespace = 2,
    Package = 3,
    Class = 4,
    Method = 5,
    Property = 6,
    Field = 7,
    Constructor = 8,
    Enum = 9,
    Interface = 10,
    Function = 11,
    Variable = 12,
    Constant = 13,
    String = 14,
    Number = 15,
    Boolean = 16,
    Array = 17,
    Object = 18,
    Key = 19,
    Null = 20,
    EnumMember = 21,
    Struct = 22,
    Event = 23,
    Operator = 24,
    TypeParameter = 25,
}

export class SymbolInformation {
    name: string;

    location: Location = new Location(
        vscUri.URI.parse('testLocation'),
        new Range(new Position(0, 0), new Position(0, 0)),
    );

    kind: SymbolKind;

    containerName: string;

    constructor(name: string, kind: SymbolKind, containerName: string, location: Location);

    constructor(name: string, kind: SymbolKind, range: Range, uri?: vscUri.URI, containerName?: string);

    constructor(
        name: string,
        kind: SymbolKind,
        rangeOrContainer: string | Range,
        locationOrUri?: Location | vscUri.URI,
        containerName?: string,
    ) {
        this.name = name;
        this.kind = kind;
        this.containerName = containerName || '';

        if (typeof rangeOrContainer === 'string') {
            this.containerName = rangeOrContainer;
        }

        if (locationOrUri instanceof Location) {
            this.location = locationOrUri;
        } else if (rangeOrContainer instanceof Range) {
            this.location = new Location(locationOrUri as vscUri.URI, rangeOrContainer);
        }
    }

    toJSON(): { name: string; kind: SymbolKind; location: Location; containerName: string } {
        return {
            name: this.name,
            kind: (SymbolKind[this.kind] as unknown) as SymbolKind,
            location: this.location,
            containerName: this.containerName,
        };
    }
}

export class SymbolInformation2 extends SymbolInformation {
    definingRange: Range;

    children: SymbolInformation2[];

    constructor(name: string, kind: SymbolKind, containerName: string, location: Location) {
        super(name, kind, containerName, location);

        this.children = [];
        this.definingRange = location.range;
    }
}

export enum CodeActionTrigger {
    Automatic = 1,
    Manual = 2,
}

export class CodeAction {
    title: string;

    command?: vscode.Command;

    edit?: WorkspaceEdit;

    dianostics?: Diagnostic[];

    kind?: CodeActionKind;

    constructor(title: string, kind?: CodeActionKind) {
        this.title = title;
        this.kind = kind;
    }
}

export class CodeActionKind {
    private static readonly sep = '.';

    public static readonly Empty = new CodeActionKind('');

    public static readonly QuickFix = CodeActionKind.Empty.append('quickfix');

    public static readonly Refactor = CodeActionKind.Empty.append('refactor');

    public static readonly RefactorExtract = CodeActionKind.Refactor.append('extract');

    public static readonly RefactorInline = CodeActionKind.Refactor.append('inline');

    public static readonly RefactorRewrite = CodeActionKind.Refactor.append('rewrite');

    public static readonly Source = CodeActionKind.Empty.append('source');

    public static readonly SourceOrganizeImports = CodeActionKind.Source.append('organizeImports');

    constructor(public readonly value: string) {}

    public append(parts: string): CodeActionKind {
        return new CodeActionKind(this.value ? this.value + CodeActionKind.sep + parts : parts);
    }

    public contains(other: CodeActionKind): boolean {
        return this.value === other.value || vscMockStrings.startsWith(other.value, this.value + CodeActionKind.sep);
    }
}

export class CodeLens {
    range: Range;

    command: vscode.Command | undefined;

    constructor(range: Range, command?: vscode.Command) {
        this.range = range;
        this.command = command;
    }

    get isResolved(): boolean {
        return !!this.command;
    }
}

export class MarkdownString {
    value: string;

    isTrusted?: boolean;

    constructor(value?: string) {
        this.value = value || '';
    }

    appendText(value: string): MarkdownString {
        // escape markdown syntax tokens: http://daringfireball.net/projects/markdown/syntax#backslash
        this.value += value.replace(/[\\`*_{}[\]()#+\-.!]/g, '\\$&');
        return this;
    }

    appendMarkdown(value: string): MarkdownString {
        this.value += value;
        return this;
    }

    appendCodeblock(code: string, language = ''): MarkdownString {
        this.value += '\n```';
        this.value += language;
        this.value += '\n';
        this.value += code;
        this.value += '\n```\n';
        return this;
    }
}

export class ParameterInformation {
    label: string;

    documentation?: string | MarkdownString;

    constructor(label: string, documentation?: string | MarkdownString) {
        this.label = label;
        this.documentation = documentation;
    }
}

export class SignatureInformation {
    label: string;

    documentation?: string | MarkdownString;

    parameters: ParameterInformation[];

    constructor(label: string, documentation?: string | MarkdownString) {
        this.label = label;
        this.documentation = documentation;
        this.parameters = [];
    }
}

export class SignatureHelp {
    signatures: SignatureInformation[];

    activeSignature: number;

    activeParameter: number;

    constructor() {
        this.signatures = [];
        this.activeSignature = -1;
        this.activeParameter = -1;
    }
}

export enum CompletionTriggerKind {
    Invoke = 0,
    TriggerCharacter = 1,
    TriggerForIncompleteCompletions = 2,
}

export interface CompletionContext {
    triggerKind: CompletionTriggerKind;
    triggerCharacter: string;
}

export enum CompletionItemKind {
    Text = 0,
    Method = 1,
    Function = 2,
    Constructor = 3,
    Field = 4,
    Variable = 5,
    Class = 6,
    Interface = 7,
    Module = 8,
    Property = 9,
    Unit = 10,
    Value = 11,
    Enum = 12,
    Keyword = 13,
    Snippet = 14,
    Color = 15,
    File = 16,
    Reference = 17,
    Folder = 18,
    EnumMember = 19,
    Constant = 20,
    Struct = 21,
    Event = 22,
    Operator = 23,
    TypeParameter = 24,
    User = 25,
    Issue = 26,
}

export enum CompletionItemTag {
    Deprecated = 1,
}

export interface CompletionItemLabel {
    name: string;
    signature?: string;
    qualifier?: string;
    type?: string;
}

export class CompletionItem {
    label: string;

    label2?: CompletionItemLabel;

    kind?: CompletionItemKind;

    tags?: CompletionItemTag[];

    detail?: string;

    documentation?: string | MarkdownString;

    sortText?: string;

    filterText?: string;

    preselect?: boolean;

    insertText?: string | SnippetString;

    keepWhitespace?: boolean;

    range?: Range;

    commitCharacters?: string[];

    textEdit?: TextEdit;

    additionalTextEdits?: TextEdit[];

    command?: vscode.Command;

    constructor(label: string, kind?: CompletionItemKind) {
        this.label = label;
        this.kind = kind;
    }

    toJSON(): {
        label: string;
        label2?: CompletionItemLabel;
        kind?: CompletionItemKind;
        detail?: string;
        documentation?: string | MarkdownString;
        sortText?: string;
        filterText?: string;
        preselect?: boolean;
        insertText?: string | SnippetString;
        textEdit?: TextEdit;
    } {
        return {
            label: this.label,
            label2: this.label2,
            kind: this.kind && ((CompletionItemKind[this.kind] as unknown) as CompletionItemKind),
            detail: this.detail,
            documentation: this.documentation,
            sortText: this.sortText,
            filterText: this.filterText,
            preselect: this.preselect,
            insertText: this.insertText,
            textEdit: this.textEdit,
        };
    }
}

export class CompletionList {
    isIncomplete?: boolean;

    items: vscode.CompletionItem[];

    constructor(items: vscode.CompletionItem[] = [], isIncomplete = false) {
        this.items = items;
        this.isIncomplete = isIncomplete;
    }
}

export class CallHierarchyItem {
    name: string;

    kind: SymbolKind;

    tags?: ReadonlyArray<vscode.SymbolTag>;

    detail?: string;

    uri: vscode.Uri;

    range: vscode.Range;

    selectionRange: vscode.Range;

    constructor(
        kind: vscode.SymbolKind,
        name: string,
        detail: string,
        uri: vscode.Uri,
        range: vscode.Range,
        selectionRange: vscode.Range,
    ) {
        this.kind = kind;
        this.name = name;
        this.detail = detail;
        this.uri = uri;
        this.range = range;
        this.selectionRange = selectionRange;
    }
}

export enum ViewColumn {
    Active = -1,
    Beside = -2,
    One = 1,
    Two = 2,
    Three = 3,
    Four = 4,
    Five = 5,
    Six = 6,
    Seven = 7,
    Eight = 8,
    Nine = 9,
}

export enum StatusBarAlignment {
    Left = 1,
    Right = 2,
}

export enum TextEditorLineNumbersStyle {
    Off = 0,
    On = 1,
    Relative = 2,
}

export enum TextDocumentSaveReason {
    Manual = 1,
    AfterDelay = 2,
    FocusOut = 3,
}

export enum TextEditorRevealType {
    Default = 0,
    InCenter = 1,
    InCenterIfOutsideViewport = 2,
    AtTop = 3,
}

// eslint-disable-next-line import/export
export enum TextEditorSelectionChangeKind {
    Keyboard = 1,
    Mouse = 2,
    Command = 3,
}

/**
 * These values match very carefully the values of `TrackedRangeStickiness`
 */
export enum DecorationRangeBehavior {
    /**
     * TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges
     */
    OpenOpen = 0,
    /**
     * TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
     */
    ClosedClosed = 1,
    /**
     * TrackedRangeStickiness.GrowsOnlyWhenTypingBefore
     */
    OpenClosed = 2,
    /**
     * TrackedRangeStickiness.GrowsOnlyWhenTypingAfter
     */
    ClosedOpen = 3,
}

// eslint-disable-next-line import/export, @typescript-eslint/no-namespace
export namespace TextEditorSelectionChangeKind {
    export function fromValue(s: string): TextEditorSelectionChangeKind | undefined {
        switch (s) {
            case 'keyboard':
                return TextEditorSelectionChangeKind.Keyboard;
            case 'mouse':
                return TextEditorSelectionChangeKind.Mouse;
            case 'api':
                return TextEditorSelectionChangeKind.Command;
            default:
                return undefined;
        }
    }
}

export class DocumentLink {
    range: Range;

    target: vscUri.URI;

    constructor(range: Range, target: vscUri.URI) {
        if (target && !(target instanceof vscUri.URI)) {
            throw illegalArgument('target');
        }
        if (!Range.isRange(range) || range.isEmpty) {
            throw illegalArgument('range');
        }
        this.range = range;
        this.target = target;
    }
}

export class Color {
    readonly red: number;

    readonly green: number;

    readonly blue: number;

    readonly alpha: number;

    constructor(red: number, green: number, blue: number, alpha: number) {
        this.red = red;
        this.green = green;
        this.blue = blue;
        this.alpha = alpha;
    }
}

export type IColorFormat = string | { opaque: string; transparent: string };

export class ColorInformation {
    range: Range;

    color: Color;

    constructor(range: Range, color: Color) {
        if (color && !(color instanceof Color)) {
            throw illegalArgument('color');
        }
        if (!Range.isRange(range) || range.isEmpty) {
            throw illegalArgument('range');
        }
        this.range = range;
        this.color = color;
    }
}

export class ColorPresentation {
    label: string;

    textEdit?: TextEdit;

    additionalTextEdits?: TextEdit[];

    constructor(label: string) {
        if (!label || typeof label !== 'string') {
            throw illegalArgument('label');
        }
        this.label = label;
    }
}

export enum ColorFormat {
    RGB = 0,
    HEX = 1,
    HSL = 2,
}

export enum SourceControlInputBoxValidationType {
    Error = 0,
    Warning = 1,
    Information = 2,
}

export enum TaskRevealKind {
    Always = 1,

    Silent = 2,

    Never = 3,
}

export enum TaskPanelKind {
    Shared = 1,

    Dedicated = 2,

    New = 3,
}

export class TaskGroup implements vscode.TaskGroup {
    private _id: string;

    public isDefault = undefined;

    public static Clean: TaskGroup = new TaskGroup('clean', 'Clean');

    public static Build: TaskGroup = new TaskGroup('build', 'Build');

    public static Rebuild: TaskGroup = new TaskGroup('rebuild', 'Rebuild');

    public static Test: TaskGroup = new TaskGroup('test', 'Test');

    public static from(value: string): TaskGroup | undefined {
        switch (value) {
            case 'clean':
                return TaskGroup.Clean;
            case 'build':
                return TaskGroup.Build;
            case 'rebuild':
                return TaskGroup.Rebuild;
            case 'test':
                return TaskGroup.Test;
            default:
                return undefined;
        }
    }

    constructor(id: string, _label: string) {
        if (typeof id !== 'string') {
            throw illegalArgument('name');
        }
        if (typeof _label !== 'string') {
            throw illegalArgument('name');
        }
        this._id = id;
    }

    get id(): string {
        return this._id;
    }
}

export class ProcessExecution implements vscode.ProcessExecution {
    private _process: string;

    private _args: string[] | undefined;

    private _options: vscode.ProcessExecutionOptions | undefined;

    constructor(process: string, options?: vscode.ProcessExecutionOptions);

    constructor(process: string, args: string[], options?: vscode.ProcessExecutionOptions);

    constructor(
        process: string,
        varg1?: string[] | vscode.ProcessExecutionOptions,
        varg2?: vscode.ProcessExecutionOptions,
    ) {
        if (typeof process !== 'string') {
            throw illegalArgument('process');
        }
        this._process = process;
        if (varg1) {
            if (Array.isArray(varg1)) {
                this._args = varg1;
                this._options = varg2;
            } else {
                this._options = varg1;
            }
        }

        if (this._args === undefined) {
            this._args = [];
        }
    }

    get process(): string {
        return this._process;
    }

    set process(value: string) {
        if (typeof value !== 'string') {
            throw illegalArgument('process');
        }
        this._process = value;
    }

    get args(): string[] {
        return this._args || [];
    }

    set args(value: string[]) {
        if (!Array.isArray(value)) {
            value = [];
        }
        this._args = value;
    }

    get options(): vscode.ProcessExecutionOptions {
        return this._options || {};
    }

    set options(value: vscode.ProcessExecutionOptions) {
        this._options = value;
    }

    // eslint-disable-next-line class-methods-use-this
    public computeId(): string {
        // const hash = crypto.createHash('md5');
        // hash.update('process');
        // if (this._process !== void 0) {
        //     hash.update(this._process);
        // }
        // if (this._args && this._args.length > 0) {
        //     for (let arg of this._args) {
        //         hash.update(arg);
        //     }
        // }
        // return hash.digest('hex');
        throw new Error('Not supported');
    }
}

export class ShellExecution implements vscode.ShellExecution {
    private _commandLine = '';

    private _command: string | vscode.ShellQuotedString = '';

    private _args: (string | vscode.ShellQuotedString)[] = [];

    private _options: vscode.ShellExecutionOptions | undefined;

    constructor(commandLine: string, options?: vscode.ShellExecutionOptions);

    constructor(
        command: string | vscode.ShellQuotedString,
        args: (string | vscode.ShellQuotedString)[],
        options?: vscode.ShellExecutionOptions,
    );

    constructor(
        arg0: string | vscode.ShellQuotedString,
        arg1?: vscode.ShellExecutionOptions | (string | vscode.ShellQuotedString)[],
        arg2?: vscode.ShellExecutionOptions,
    ) {
        if (Array.isArray(arg1)) {
            if (!arg0) {
                throw illegalArgument("command can't be undefined or null");
            }
            if (typeof arg0 !== 'string' && typeof arg0.value !== 'string') {
                throw illegalArgument('command');
            }
            this._command = arg0;
            this._args = arg1 as (string | vscode.ShellQuotedString)[];
            this._options = arg2;
        } else {
            if (typeof arg0 !== 'string') {
                throw illegalArgument('commandLine');
            }
            this._commandLine = arg0;
            this._options = arg1;
        }
    }

    get commandLine(): string {
        return this._commandLine;
    }

    set commandLine(value: string) {
        if (typeof value !== 'string') {
            throw illegalArgument('commandLine');
        }
        this._commandLine = value;
    }

    get command(): string | vscode.ShellQuotedString {
        return this._command;
    }

    set command(value: string | vscode.ShellQuotedString) {
        if (typeof value !== 'string' && typeof value.value !== 'string') {
            throw illegalArgument('command');
        }
        this._command = value;
    }

    get args(): (string | vscode.ShellQuotedString)[] {
        return this._args;
    }

    set args(value: (string | vscode.ShellQuotedString)[]) {
        this._args = value || [];
    }

    get options(): vscode.ShellExecutionOptions {
        return this._options || {};
    }

    set options(value: vscode.ShellExecutionOptions) {
        this._options = value;
    }

    // eslint-disable-next-line class-methods-use-this
    public computeId(): string {
        // const hash = crypto.createHash('md5');
        // hash.update('shell');
        // if (this._commandLine !== void 0) {
        //     hash.update(this._commandLine);
        // }
        // if (this._command !== void 0) {
        //     hash.update(typeof this._command === 'string' ? this._command : this._command.value);
        // }
        // if (this._args && this._args.length > 0) {
        //     for (let arg of this._args) {
        //         hash.update(typeof arg === 'string' ? arg : arg.value);
        //     }
        // }
        // return hash.digest('hex');
        throw new Error('Not spported');
    }
}

export enum ShellQuoting {
    Escape = 1,
    Strong = 2,
    Weak = 3,
}

export enum TaskScope {
    Global = 1,
    Workspace = 2,
}

export class Task implements vscode.Task {
    private static ProcessType = 'process';

    private static ShellType = 'shell';

    private static EmptyType = '$empty';

    private __id: string | undefined;

    private _definition!: vscode.TaskDefinition;

    private _scope: vscode.TaskScope.Global | vscode.TaskScope.Workspace | vscode.WorkspaceFolder | undefined;

    private _name!: string;

    private _execution: ProcessExecution | ShellExecution | undefined;

    private _problemMatchers: string[];

    private _hasDefinedMatchers: boolean;

    private _isBackground: boolean;

    private _source!: string;

    private _group: TaskGroup | undefined;

    private _presentationOptions: vscode.TaskPresentationOptions;

    private _runOptions: vscode.RunOptions;

    constructor(
        definition: vscode.TaskDefinition,
        name: string,
        source: string,
        execution?: ProcessExecution | ShellExecution,
        problemMatchers?: string | string[],
    );

    constructor(
        definition: vscode.TaskDefinition,
        scope: vscode.TaskScope.Global | vscode.TaskScope.Workspace | vscode.WorkspaceFolder,
        name: string,
        source: string,
        execution?: ProcessExecution | ShellExecution,
        problemMatchers?: string | string[],
    );

    constructor(
        definition: vscode.TaskDefinition,
        arg2: string | (vscode.TaskScope.Global | vscode.TaskScope.Workspace) | vscode.WorkspaceFolder,
        arg3: string,
        arg4?: string | ProcessExecution | ShellExecution,
        arg5?: ProcessExecution | ShellExecution | string | string[],
        arg6?: string | string[],
    ) {
        this.definition = definition;
        let problemMatchers: string | string[];
        if (typeof arg2 === 'string') {
            this.name = arg2;
            this.source = arg3;
            this.execution = arg4 as ProcessExecution | ShellExecution;
            problemMatchers = arg5 as string | string[];
        } else {
            this.target = arg2;
            this.name = arg3;
            this.source = arg4 as string;
            this.execution = arg5 as ProcessExecution | ShellExecution;
            problemMatchers = arg6 as string | string[];
        }
        if (typeof problemMatchers === 'string') {
            this._problemMatchers = [problemMatchers];
            this._hasDefinedMatchers = true;
        } else if (Array.isArray(problemMatchers)) {
            this._problemMatchers = problemMatchers;
            this._hasDefinedMatchers = true;
        } else {
            this._problemMatchers = [];
            this._hasDefinedMatchers = false;
        }
        this._isBackground = false;
        this._presentationOptions = Object.create(null);
        this._runOptions = Object.create(null);
    }

    get _id(): string | undefined {
        return this.__id;
    }

    set _id(value: string | undefined) {
        this.__id = value;
    }

    private clear(): void {
        if (this.__id === undefined) {
            return;
        }
        this.__id = undefined;
        this._scope = undefined;
        this.computeDefinitionBasedOnExecution();
    }

    private computeDefinitionBasedOnExecution(): void {
        if (this._execution instanceof ProcessExecution) {
            this._definition = {
                type: Task.ProcessType,
                id: this._execution.computeId(),
            };
        } else if (this._execution instanceof ShellExecution) {
            this._definition = {
                type: Task.ShellType,
                id: this._execution.computeId(),
            };
        } else {
            this._definition = {
                type: Task.EmptyType,
                id: generateUuid(),
            };
        }
    }

    get definition(): vscode.TaskDefinition {
        return this._definition;
    }

    set definition(value: vscode.TaskDefinition) {
        if (value === undefined || value === null) {
            throw illegalArgument("Kind can't be undefined or null");
        }
        this.clear();
        this._definition = value;
    }

    get scope(): vscode.TaskScope.Global | vscode.TaskScope.Workspace | vscode.WorkspaceFolder | undefined {
        return this._scope;
    }

    set target(value: vscode.TaskScope.Global | vscode.TaskScope.Workspace | vscode.WorkspaceFolder) {
        this.clear();
        this._scope = value;
    }

    get name(): string {
        return this._name;
    }

    set name(value: string) {
        if (typeof value !== 'string') {
            throw illegalArgument('name');
        }
        this.clear();
        this._name = value;
    }

    get execution(): ProcessExecution | ShellExecution | undefined {
        return this._execution;
    }

    set execution(value: ProcessExecution | ShellExecution | undefined) {
        if (value === null) {
            value = undefined;
        }
        this.clear();
        this._execution = value;
        const { type } = this._definition;
        if (Task.EmptyType === type || Task.ProcessType === type || Task.ShellType === type) {
            this.computeDefinitionBasedOnExecution();
        }
    }

    get problemMatchers(): string[] {
        return this._problemMatchers;
    }

    set problemMatchers(value: string[]) {
        if (!Array.isArray(value)) {
            this.clear();
            this._problemMatchers = [];
            this._hasDefinedMatchers = false;
        } else {
            this.clear();
            this._problemMatchers = value;
            this._hasDefinedMatchers = true;
        }
    }

    get hasDefinedMatchers(): boolean {
        return this._hasDefinedMatchers;
    }

    get isBackground(): boolean {
        return this._isBackground;
    }

    set isBackground(value: boolean) {
        if (value !== true && value !== false) {
            value = false;
        }
        this.clear();
        this._isBackground = value;
    }

    get source(): string {
        return this._source;
    }

    set source(value: string) {
        if (typeof value !== 'string' || value.length === 0) {
            throw illegalArgument('source must be a string of length > 0');
        }
        this.clear();
        this._source = value;
    }

    get group(): TaskGroup | undefined {
        return this._group;
    }

    set group(value: TaskGroup | undefined) {
        if (value === null) {
            value = undefined;
        }
        this.clear();
        this._group = value;
    }

    get presentationOptions(): vscode.TaskPresentationOptions {
        return this._presentationOptions;
    }

    set presentationOptions(value: vscode.TaskPresentationOptions) {
        if (value === null || value === undefined) {
            value = Object.create(null);
        }
        this.clear();
        this._presentationOptions = value;
    }

    get runOptions(): vscode.RunOptions {
        return this._runOptions;
    }

    set runOptions(value: vscode.RunOptions) {
        if (value === null || value === undefined) {
            value = Object.create(null);
        }
        this.clear();
        this._runOptions = value;
    }
}

export enum ProgressLocation {
    SourceControl = 1,
    Window = 10,
    Notification = 15,
}

export enum TreeItemCollapsibleState {
    None = 0,
    Collapsed = 1,
    Expanded = 2,
}

/**
 * Represents an icon in the UI. This is either an uri, separate uris for the light- and dark-themes,
 * or a {@link ThemeIcon theme icon}.
 */
export type IconPath =
    | vscUri.URI
    | {
          /**
           * The icon path for the light theme.
           */
          light: vscUri.URI;
          /**
           * The icon path for the dark theme.
           */
          dark: vscUri.URI;
      }
    | ThemeIcon;

export class TreeItem {
    label?: string | vscode.TreeItemLabel;
    id?: string;

    resourceUri?: vscUri.URI;

    iconPath?: string | IconPath;

    command?: vscode.Command;

    contextValue?: string;

    tooltip?: string;

    constructor(label: string, collapsibleState?: vscode.TreeItemCollapsibleState);

    constructor(resourceUri: vscUri.URI, collapsibleState?: vscode.TreeItemCollapsibleState);

    constructor(
        arg1: string | vscUri.URI,
        public collapsibleState: vscode.TreeItemCollapsibleState = TreeItemCollapsibleState.None,
    ) {
        if (arg1 instanceof vscUri.URI) {
            this.resourceUri = arg1;
        } else {
            this.label = arg1;
        }
    }
}

export class ThemeIcon {
    static readonly File = new ThemeIcon('file');

    static readonly Folder = new ThemeIcon('folder');

    readonly id: string;

    private constructor(id: string) {
        this.id = id;
    }
}

export class ThemeColor {
    id: string;

    constructor(id: string) {
        this.id = id;
    }
}

export enum ConfigurationTarget {
    Global = 1,

    Workspace = 2,

    WorkspaceFolder = 3,
}

export class RelativePattern implements IRelativePattern {
    baseUri: vscode.Uri;

    base: string;

    pattern: string;

    constructor(base: vscode.WorkspaceFolder | string, pattern: string) {
        if (typeof base !== 'string') {
            if (!base || !vscUri.URI.isUri(base.uri)) {
                throw illegalArgument('base');
            }
        }

        if (typeof pattern !== 'string') {
            throw illegalArgument('pattern');
        }

        this.baseUri = typeof base === 'string' ? vscUri.URI.parse(base) : base.uri;
        this.base = typeof base === 'string' ? base : base.uri.fsPath;
        this.pattern = pattern;
    }

    // eslint-disable-next-line class-methods-use-this
    public pathToRelative(from: string, to: string): string {
        return relative(from, to);
    }
}

export class Breakpoint {
    readonly enabled: boolean;

    readonly condition?: string;

    readonly hitCondition?: string;

    readonly logMessage?: string;

    protected constructor(enabled?: boolean, condition?: string, hitCondition?: string, logMessage?: string) {
        this.enabled = typeof enabled === 'boolean' ? enabled : true;
        if (typeof condition === 'string') {
            this.condition = condition;
        }
        if (typeof hitCondition === 'string') {
            this.hitCondition = hitCondition;
        }
        if (typeof logMessage === 'string') {
            this.logMessage = logMessage;
        }
    }
}

export class SourceBreakpoint extends Breakpoint {
    readonly location: Location;

    constructor(location: Location, enabled?: boolean, condition?: string, hitCondition?: string, logMessage?: string) {
        super(enabled, condition, hitCondition, logMessage);
        if (location === null) {
            throw illegalArgument('location');
        }
        this.location = location;
    }
}

export class FunctionBreakpoint extends Breakpoint {
    readonly functionName: string;

    constructor(
        functionName: string,
        enabled?: boolean,
        condition?: string,
        hitCondition?: string,
        logMessage?: string,
    ) {
        super(enabled, condition, hitCondition, logMessage);
        if (!functionName) {
            throw illegalArgument('functionName');
        }
        this.functionName = functionName;
    }
}

export class DebugAdapterExecutable {
    readonly command: string;

    readonly args: string[];

    constructor(command: string, args?: string[]) {
        this.command = command;
        this.args = args || [];
    }
}

export class DebugAdapterServer {
    readonly port: number;

    readonly host?: string;

    constructor(port: number, host?: string) {
        this.port = port;
        this.host = host;
    }
}

export enum LogLevel {
    Trace = 1,
    Debug = 2,
    Info = 3,
    Warning = 4,
    Error = 5,
    Critical = 6,
    Off = 7,
}

// #region file api

export enum FileChangeType {
    Changed = 1,
    Created = 2,
    Deleted = 3,
}

export class FileSystemError extends Error {
    static FileExists(messageOrUri?: string | vscUri.URI): FileSystemError {
        return new FileSystemError(messageOrUri, 'EntryExists', FileSystemError.FileExists);
    }

    static FileNotFound(messageOrUri?: string | vscUri.URI): FileSystemError {
        return new FileSystemError(messageOrUri, 'EntryNotFound', FileSystemError.FileNotFound);
    }

    static FileNotADirectory(messageOrUri?: string | vscUri.URI): FileSystemError {
        return new FileSystemError(messageOrUri, 'EntryNotADirectory', FileSystemError.FileNotADirectory);
    }

    static FileIsADirectory(messageOrUri?: string | vscUri.URI): FileSystemError {
        return new FileSystemError(messageOrUri, 'EntryIsADirectory', FileSystemError.FileIsADirectory);
    }

    static NoPermissions(messageOrUri?: string | vscUri.URI): FileSystemError {
        return new FileSystemError(messageOrUri, 'NoPermissions', FileSystemError.NoPermissions);
    }

    static Unavailable(messageOrUri?: string | vscUri.URI): FileSystemError {
        return new FileSystemError(messageOrUri, 'Unavailable', FileSystemError.Unavailable);
    }

    constructor(uriOrMessage?: string | vscUri.URI, code?: string, terminator?: () => void) {
        super(vscUri.URI.isUri(uriOrMessage) ? uriOrMessage.toString(true) : uriOrMessage);
        this.name = code ? `${code} (FileSystemError)` : `FileSystemError`;

        Object.setPrototypeOf(this, FileSystemError.prototype);

        if (typeof Error.captureStackTrace === 'function' && typeof terminator === 'function') {
            // nice stack traces
            Error.captureStackTrace(this, terminator);
        }
    }

    // eslint-disable-next-line class-methods-use-this
    public get code(): string {
        return '';
    }
}

// #endregion

// #region folding api

export class FoldingRange {
    start: number;

    end: number;

    kind?: FoldingRangeKind;

    constructor(start: number, end: number, kind?: FoldingRangeKind) {
        this.start = start;
        this.end = end;
        this.kind = kind;
    }
}

export enum FoldingRangeKind {
    Comment = 1,
    Imports = 2,
    Region = 3,
}

// #endregion

export enum CommentThreadCollapsibleState {
    /**
     * Determines an item is collapsed
     */
    Collapsed = 0,
    /**
     * Determines an item is expanded
     */
    Expanded = 1,
}

export class QuickInputButtons {
    static readonly Back: vscode.QuickInputButton = { iconPath: vscUri.URI.file('back') };
}

export enum SymbolTag {
    Deprecated = 1,
}

export class TypeHierarchyItem {
    name: string;

    kind: SymbolKind;

    tags?: ReadonlyArray<SymbolTag>;

    detail?: string;

    uri: vscode.Uri;

    range: Range;

    selectionRange: Range;

    constructor(kind: SymbolKind, name: string, detail: string, uri: vscode.Uri, range: Range, selectionRange: Range) {
        this.name = name;
        this.kind = kind;
        this.detail = detail;
        this.uri = uri;
        this.range = range;
        this.selectionRange = selectionRange;
    }
}

export declare type LSPObject = {
    [key: string]: LSPAny;
};

export declare type LSPArray = LSPAny[];

export declare type integer = number;
export declare type uinteger = number;
export declare type decimal = number;

export declare type LSPAny = LSPObject | LSPArray | string | integer | uinteger | decimal | boolean | null;

export class ProtocolTypeHierarchyItem extends TypeHierarchyItem {
    data?;

    constructor(
        kind: SymbolKind,
        name: string,
        detail: string,
        uri: vscode.Uri,
        range: Range,
        selectionRange: Range,
        data?: LSPAny,
    ) {
        super(kind, name, detail, uri, range, selectionRange);
        this.data = data;
    }
}

export class CancellationError extends Error {}

export class LSPCancellationError extends CancellationError {
    data;

    constructor(data: any) {
        super();
        this.data = data;
    }
}
