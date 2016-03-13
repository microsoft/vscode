/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {illegalArgument} from 'vs/base/common/errors';

export class Disposable {

	static from(...disposables: { dispose(): any }[]): Disposable {
		return new Disposable(function () {
			if (disposables) {
				for (let disposable of disposables) {
					if (disposable && typeof disposable.dispose === 'function') {
						disposable.dispose();
					}
				}
				disposables = undefined;
			}
		});
	}

	private _callOnDispose: Function;

	constructor(callOnDispose: Function) {
		this._callOnDispose = callOnDispose;
	}

	dispose(): any {
		if (typeof this._callOnDispose === 'function') {
			this._callOnDispose();
			this._callOnDispose = undefined;
		}
	}
}

export interface EditorOptions {
	tabSize: number | string;
	insertSpaces: boolean | string;
}

export class Position {

	static Min(...positions: Position[]): Position {
		let result = positions.pop();
		for (let p of positions) {
			if (p.isBefore(result)) {
				result = p;
			}
		}
		return result;
	}

	static Max(...positions: Position[]): Position {
		let result = positions.pop();
		for (let p of positions) {
			if (p.isAfter(result)) {
				result = p;
			}
		}
		return result;
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
			throw illegalArgument('line must be positive');
		}
		if (character < 0) {
			throw illegalArgument('character must be positive');
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
		} else if (this._line > other.line) {
			return 1;
		} else {
			// equal line
			if (this._character < other._character) {
				return -1;
			} else if (this._character > other._character) {
				return 1;
			} else {
				// equal line and character
				return 0;
			}
		}
	}

	translate(lineDelta: number = 0, characterDelta: number = 0): Position {
		if (lineDelta === 0 && characterDelta === 0) {
			return this;
		}
		return new Position(this.line + lineDelta, this.character + characterDelta);
	}

	with(line: number = this.line, character: number = this.character): Position {
		if (line === this.line && character === this.character) {
			return this;
		}
		return new Position(line, character);
	}

	toJSON(): any {
		return { line: this.line, character: this.character };
	}
}

export class Range {

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
	constructor(startLineOrStart: number|Position, startColumnOrEnd: number|Position, endLine?: number, endColumn?: number) {
		let start: Position;
		let end: Position;

		if (typeof startLineOrStart === 'number' && typeof startColumnOrEnd === 'number' && typeof endLine === 'number' && typeof endColumn === 'number') {
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
			return this.contains(positionOrRange._start)
				&& this.contains(positionOrRange._end);

		} else if (positionOrRange instanceof Position) {
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

	intersection(other: Range): Range {
		let start = Position.Max(other.start, this._start);
		let end = Position.Min(other.end, this._end);
		if (start.isAfter(end)) {
			// this happens when there is no overlap:
			// |-----|
			//          |----|
			return;
		}
		return new Range(start, end);
	}

	union(other: Range): Range {
		if (this.contains(other)) {
			return this;
		} else if (other.contains(this)) {
			return other;
		}
		let start = Position.Min(other.start, this._start);
		let end = Position.Max(other.end, this.end);
		return new Range(start, end);
	}

	get isEmpty(): boolean {
		return this._start.isEqual(this._end);
	}

	get isSingleLine(): boolean {
		return this._start.line === this._end.line;
	}

	with(start: Position = this.start, end: Position = this.end): Range {
		if (start.isEqual(this._start) && end.isEqual(this.end)) {
			return this;
		}
		return new Range(start, end);
	}

	toJSON(): any {
		return [this.start, this.end];
	}
}

export class Selection extends Range {

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
	constructor(anchorLineOrAnchor: number|Position, anchorColumnOrActive: number|Position, activeLine?: number, activeColumn?: number) {
		let anchor: Position;
		let active: Position;

		if (typeof anchorLineOrAnchor === 'number' && typeof anchorColumnOrActive === 'number' && typeof activeLine === 'number' && typeof activeColumn === 'number') {
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

	toJSON() {
		return {
			start: this.start,
			end: this.end,
			active: this.active,
			anchor: this.anchor
		};
	}
}

export class TextEdit {

	static replace(range: Range, newText: string): TextEdit {
		return new TextEdit(range, newText);
	}

	static insert(position: Position, newText: string): TextEdit {
		return TextEdit.replace(new Range(position, position), newText);
	}

	static delete(range: Range): TextEdit {
		return TextEdit.replace(range, '');
	}

	protected _range: Range;

	protected _newText: string;

	get range(): Range {
		return this._range;
	}

	set range(value: Range) {
		if (!value) {
			throw illegalArgument('range');
		}
		this._range = value;
	}

	get newText(): string {
		return this._newText || '';
	}

	set newText(value) {
		this._newText = value;
	}

	constructor(range: Range, newText: string) {
		this.range = range;
		this.newText = newText;
	}

	toJSON(): any {
		return {
			range: this.range,
			newText: this.newText
		};
	}
}

export class Uri extends URI { }

export class WorkspaceEdit {

	private _values: [Uri, TextEdit[]][] = [];
	private _index: { [uri: string]: number } = Object.create(null);

	replace(uri: Uri, range: Range, newText: string): void {
		let edit = new TextEdit(range, newText);
		let array = this.get(uri);
		if (array) {
			array.push(edit);
		} else {
			this.set(uri, [edit]);
		}
	}

	insert(resource: Uri, position: Position, newText: string): void {
		this.replace(resource, new Range(position, position), newText);
	}

	delete(resource: Uri, range: Range): void {
		this.replace(resource, range, '');
	}

	has(uri: Uri): boolean {
		return typeof this._index[uri.toString()] !== 'undefined';
	}

	set(uri: Uri, edits: TextEdit[]): void {
		let idx = this._index[uri.toString()];
		if (typeof idx === 'undefined') {
			let newLen = this._values.push([uri, edits]);
			this._index[uri.toString()] = newLen - 1;
		} else {
			this._values[idx][1] = edits;
		}
	}

	get(uri: Uri): TextEdit[] {
		let idx = this._index[uri.toString()];
		return typeof idx !== 'undefined' && this._values[idx][1];
	}

	entries(): [Uri, TextEdit[]][] {
		return this._values;
	}

	get size(): number {
		return this._values.length;
	}

	toJSON(): any {
		return this._values;
	}
}

export enum DiagnosticSeverity {
	Hint = 3,
	Information = 2,
	Warning = 1,
	Error = 0
}

export class Location {

	uri: URI;
	range: Range;

	constructor(uri: URI, range: Range | Position) {
		this.uri = uri;

		if (range instanceof Range) {
			this.range = range;
		} else if (range instanceof Position) {
			this.range = new Range(range, range);
		} else {
			throw new Error('Illegal argument');
		}
	}

	toJSON(): any {
		return {
			uri: this.uri,
			range: this.range
		};
	}
}

export class Diagnostic {

	range: Range;
	message: string;
	source: string;
	code: string | number;
	severity: DiagnosticSeverity;

	constructor(range: Range, message: string, severity: DiagnosticSeverity = DiagnosticSeverity.Error) {
		this.range = range;
		this.message = message;
		this.severity = severity;
	}

	toJSON(): any {
		return {
			severity: DiagnosticSeverity[this.severity],
			message: this.message,
			range: this.range,
			source: this.source,
			code: this.code,
		};
	}
}

export class Hover {

	public contents: vscode.MarkedString[];
	public range: Range;

	constructor(contents: vscode.MarkedString | vscode.MarkedString[], range?: Range) {
		if (!contents) {
			throw new Error('Illegal argument');
		}

		if (Array.isArray(contents)) {
			this.contents = contents;
		} else {
			this.contents = [contents];
		}
		this.range = range;
	}
}

export enum DocumentHighlightKind {
	Text,
	Read,
	Write
}

export class DocumentHighlight {

	range: Range;
	kind: DocumentHighlightKind;

	constructor(range: Range, kind: DocumentHighlightKind = DocumentHighlightKind.Text) {
		this.range = range;
		this.kind = kind;
	}

	toJSON(): any {
		return {
			range: this.range,
			kind: DocumentHighlightKind[this.kind]
		};
	}
}

export enum SymbolKind {
	File,
	Module,
	Namespace,
	Package,
	Class,
	Method,
	Property,
	Field,
	Constructor,
	Enum,
	Interface,
	Function,
	Variable,
	Constant,
	String,
	Number,
	Boolean,
	Array,
	Object,
	Key,
	Null
}

export class SymbolInformation {

	name: string;
	location: Location;
	kind: SymbolKind;
	containerName: string;

	constructor(name: string, kind: SymbolKind, range: Range, uri?: URI, containerName?: string) {
		this.name = name;
		this.kind = kind;
		this.location = new Location(uri, range);
		this.containerName = containerName;
	}

	toJSON(): any {
		return {
			name: this.name,
			kind: SymbolKind[this.kind],
			location: this.location,
			containerName: this.containerName
		};
	}
}

export class CodeLens {

	range: Range;

	command: vscode.Command;

	constructor(range: Range, command?: vscode.Command) {
		this.range = range;
		this.command = command;
	}

	get isResolved(): boolean {
		return !!this.command;
	}
}

export class ParameterInformation {

	label: string;
	documentation: string;

	constructor(label: string, documentation?: string) {
		this.label = label;
		this.documentation = documentation;
	}
}

export class SignatureInformation {

	label: string;
	documentation: string;
	parameters: ParameterInformation[];

	constructor(label: string, documentation?: string) {
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
	}
}

export enum CompletionItemKind {
	Text,
	Method,
	Function,
	Constructor,
	Field,
	Variable,
	Class,
	Interface,
	Module,
	Property,
	Unit,
	Value,
	Enum,
	Keyword,
	Snippet,
	Color,
	File,
	Reference
}

export class CompletionItem {

	label: string;
	kind: CompletionItemKind;
	detail: string;
	documentation: string;
	sortText: string;
	filterText: string;
	insertText: string;
	textEdit: TextEdit;

	constructor(label: string) {
		this.label = label;
	}

	toJSON(): any {
		return {
			label: this.label,
			kind: CompletionItemKind[this.kind],
			detail: this.detail,
			documentation: this.documentation,
			sortText: this.sortText,
			filterText: this.filterText,
			insertText: this.insertText,
			textEdit: this.textEdit
		};
	}
}

export class CompletionList {

	isIncomplete: boolean;

	items: vscode.CompletionItem[];

	constructor(items: vscode.CompletionItem[] = [], isIncomplete: boolean = false) {
		this.items = items;
		this.isIncomplete = isIncomplete;
	}
}

export enum ViewColumn {
	One = 1,
	Two = 2,
	Three = 3
}

export enum StatusBarAlignment {
	Left = 1,
	Right = 2
}

export enum EndOfLine {
	LF = 1,
	CRLF = 2
}

