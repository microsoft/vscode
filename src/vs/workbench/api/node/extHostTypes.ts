/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { illegalArgument } from 'vs/base/common/errors';
import * as vscode from 'vscode';

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

	static isPosition(other: any): other is Position {
		if (!other) {
			return false;
		}
		if (other instanceof Position) {
			return true;
		}
		let {line, character} = <Position>other;
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

	translate(change: { lineDelta?: number; characterDelta?: number; }): Position;
	translate(lineDelta?: number, characterDelta?: number): Position;
	translate(lineDeltaOrChange: number | { lineDelta?: number; characterDelta?: number; }, characterDelta: number = 0): Position {

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
			characterDelta = typeof lineDeltaOrChange.characterDelta === 'number' ? lineDeltaOrChange.characterDelta : 0;
		}

		if (lineDelta === 0 && characterDelta === 0) {
			return this;
		}
		return new Position(this.line + lineDelta, this.character + characterDelta);
	}

	with(change: { line?: number; character?: number; }): Position;
	with(line?: number, character?: number): Position;
	with(lineOrChange: number | { line?: number; character?: number; }, character: number = this.character): Position {

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

	toJSON(): any {
		return { line: this.line, character: this.character };
	}
}

export class Range {

	static isRange(thing: any): thing is Range {
		if (thing instanceof Range) {
			return true;
		}
		if (!thing) {
			return false;
		}
		return Position.isPosition((<Range>thing).start)
			&& Position.isPosition((<Range>thing.end));
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
	constructor(startLineOrStart: number | Position, startColumnOrEnd: number | Position, endLine?: number, endColumn?: number) {
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
			return undefined;
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

	with(change: { start?: Position, end?: Position }): Range;
	with(start?: Position, end?: Position): Range;
	with(startOrChange: Position | { start?: Position, end?: Position }, end: Position = this.end): Range {

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

	toJSON(): any {
		return [this.start, this.end];
	}
}

export class Selection extends Range {

	static isSelection(thing: any): thing is Selection {
		if (thing instanceof Selection) {
			return true;
		}
		if (!thing) {
			return false;
		}
		return Range.isRange(thing)
			&& Position.isPosition((<Selection>thing).anchor)
			&& Position.isPosition((<Selection>thing).active)
			&& typeof (<Selection>thing).isReversed === 'boolean';
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
	constructor(anchorLineOrAnchor: number | Position, anchorColumnOrActive: number | Position, activeLine?: number, activeColumn?: number) {
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

	static isTextEdit(thing: any): thing is TextEdit {
		if (thing instanceof TextEdit) {
			return true;
		}
		if (!thing) {
			return false;
		}
		return Range.isRange((<TextEdit>thing))
			&& typeof (<TextEdit>thing).newText === 'string';
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
	private _index = new Map<string, number>();

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
		return this._index.has(uri.toString());
	}

	set(uri: Uri, edits: TextEdit[]): void {
		const idx = this._index.get(uri.toString());
		if (typeof idx === 'undefined') {
			let newLen = this._values.push([uri, edits]);
			this._index.set(uri.toString(), newLen - 1);
		} else {
			this._values[idx][1] = edits;
		}
	}

	get(uri: Uri): TextEdit[] {
		let idx = this._index.get(uri.toString());
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

export class SnippetString {

	static isSnippetString(thing: any): thing is SnippetString {
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

	private _tabstop: number = 1;

	value: string;

	constructor(value?: string) {
		this.value = value || '';
	}

	appendText(string: string): SnippetString {
		this.value += SnippetString._escape(string);
		return this;
	}

	appendTabstop(number: number = this._tabstop++): SnippetString {
		this.value += '$';
		this.value += number;
		return this;
	}

	appendPlaceholder(value: string | ((snippet: SnippetString) => any), number: number = this._tabstop++): SnippetString {

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

	appendVariable(name: string, defaultValue?: string | ((snippet: SnippetString) => any)): SnippetString {

		if (typeof defaultValue === 'function') {
			const nested = new SnippetString();
			nested._tabstop = this._tabstop;
			defaultValue(nested);
			this._tabstop = nested._tabstop;
			defaultValue = nested.value;

		} else if (typeof defaultValue === 'string') {
			defaultValue = defaultValue.replace(/\$|}/g, '\\$&');
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

export enum DiagnosticSeverity {
	Hint = 3,
	Information = 2,
	Warning = 1,
	Error = 0
}

export class Location {

	static isLocation(thing: any): thing is Location {
		if (thing instanceof Location) {
			return true;
		}
		if (!thing) {
			return false;
		}
		return Range.isRange((<Location>thing).range)
			&& URI.isUri((<Location>thing).uri);
	}

	uri: URI;
	range: Range;

	constructor(uri: URI, rangeOrPosition: Range | Position) {
		this.uri = uri;

		if (!rangeOrPosition) {
			//that's OK
		} else if (rangeOrPosition instanceof Range) {
			this.range = rangeOrPosition;
		} else if (rangeOrPosition instanceof Position) {
			this.range = new Range(rangeOrPosition, rangeOrPosition);
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
			throw new Error('Illegal argument, contents must be defined');
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
	Text = 0,
	Read = 1,
	Write = 2
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

	constructor(name: string, kind: SymbolKind, containerName: string, location: Location);
	constructor(name: string, kind: SymbolKind, range: Range, uri?: URI, containerName?: string);
	constructor(name: string, kind: SymbolKind, rangeOrContainer: string | Range, locationOrUri?: Location | URI, containerName?: string) {
		this.name = name;
		this.kind = kind;
		this.containerName = containerName;

		if (typeof rangeOrContainer === 'string') {
			this.containerName = rangeOrContainer;
		}

		if (locationOrUri instanceof Location) {
			this.location = locationOrUri;
		} else if (rangeOrContainer instanceof Range) {
			this.location = new Location(<URI>locationOrUri, rangeOrContainer);
		}
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
	documentation?: string;

	constructor(label: string, documentation?: string) {
		this.label = label;
		this.documentation = documentation;
	}
}

export class SignatureInformation {

	label: string;
	documentation?: string;
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
	Folder = 18
}

export class CompletionItem {

	label: string;
	kind: CompletionItemKind;
	detail: string;
	documentation: string;
	sortText: string;
	filterText: string;
	insertText: string | SnippetString;
	range: Range;
	textEdit: TextEdit;
	additionalTextEdits: TextEdit[];
	command: vscode.Command;

	constructor(label: string, kind?: CompletionItemKind) {
		this.label = label;
		this.kind = kind;
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

	isIncomplete?: boolean;

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

export enum TextEditorLineNumbersStyle {
	Off = 0,
	On = 1,
	Relative = 2
}

export enum TextDocumentSaveReason {
	Manual = 1,
	AfterDelay = 2,
	FocusOut = 3
}

export enum TextEditorRevealType {
	Default = 0,
	InCenter = 1,
	InCenterIfOutsideViewport = 2,
	AtTop = 3
}

export enum TextEditorSelectionChangeKind {
	Keyboard = 1,
	Mouse = 2,
	Command = 3
}

export namespace TextEditorSelectionChangeKind {
	export function fromValue(s: string) {
		switch (s) {
			case 'keyboard': return TextEditorSelectionChangeKind.Keyboard;
			case 'mouse': return TextEditorSelectionChangeKind.Mouse;
			case 'api': return TextEditorSelectionChangeKind.Command;
		}
		return undefined;
	}
}

export class DocumentLink {

	range: Range;

	target: URI;

	constructor(range: Range, target: URI) {
		if (target && !(target instanceof URI)) {
			throw illegalArgument('target');
		}
		if (!Range.isRange(range) || range.isEmpty) {
			throw illegalArgument('range');
		}
		this.range = range;
		this.target = target;
	}
}
