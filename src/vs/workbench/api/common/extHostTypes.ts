/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable local/code-no-native-private */

import { asArray, coalesceInPlace, equals } from '../../../base/common/arrays.js';
import { illegalArgument } from '../../../base/common/errors.js';
import { IRelativePattern } from '../../../base/common/glob.js';
import { MarkdownString as BaseMarkdownString, MarkdownStringTrustedOptions } from '../../../base/common/htmlContent.js';
import { ResourceMap } from '../../../base/common/map.js';
import { Mimes, normalizeMimeType } from '../../../base/common/mime.js';
import { nextCharLength } from '../../../base/common/strings.js';
import { isNumber, isObject, isString, isStringArray } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { FileSystemProviderErrorCode, markAsFileSystemProviderError } from '../../../platform/files/common/files.js';
import { RemoteAuthorityResolverErrorCode } from '../../../platform/remote/common/remoteAuthorityResolver.js';
import { IRelativePatternDto } from './extHost.protocol.js';
import { CellEditType, ICellMetadataEdit, IDocumentMetadataEdit, isTextStreamMime } from '../../contrib/notebook/common/notebookCommon.js';
import type * as vscode from 'vscode';

/**
 * @deprecated
 *
 * This utility ensures that old JS code that uses functions for classes still works. Existing usages cannot be removed
 * but new ones must not be added
 * */
function es5ClassCompat(target: Function): any {
	const interceptFunctions = {
		apply: function (...args: any[]): any {
			if (args.length === 0) {
				return Reflect.construct(target, []);
			} else {
				const argsList = args.length === 1 ? [] : args[1];
				return Reflect.construct(target, argsList, args[0].constructor);
			}
		},
		call: function (...args: any[]): any {
			if (args.length === 0) {
				return Reflect.construct(target, []);
			} else {
				const [thisArg, ...restArgs] = args;
				return Reflect.construct(target, restArgs, thisArg.constructor);
			}
		}
	};
	return Object.assign(target, interceptFunctions);
}

export enum TerminalOutputAnchor {
	Top = 0,
	Bottom = 1
}

export enum TerminalQuickFixType {
	TerminalCommand = 0,
	Opener = 1,
	Command = 3
}

@es5ClassCompat
export class Disposable {

	static from(...inDisposables: { dispose(): any }[]): Disposable {
		let disposables: ReadonlyArray<{ dispose(): any }> | undefined = inDisposables;
		return new Disposable(function () {
			if (disposables) {
				for (const disposable of disposables) {
					if (disposable && typeof disposable.dispose === 'function') {
						disposable.dispose();
					}
				}
				disposables = undefined;
			}
		});
	}

	#callOnDispose?: () => any;

	constructor(callOnDispose: () => any) {
		this.#callOnDispose = callOnDispose;
	}

	dispose(): any {
		if (typeof this.#callOnDispose === 'function') {
			this.#callOnDispose();
			this.#callOnDispose = undefined;
		}
	}
}

@es5ClassCompat
export class Position {

	static Min(...positions: Position[]): Position {
		if (positions.length === 0) {
			throw new TypeError();
		}
		let result = positions[0];
		for (let i = 1; i < positions.length; i++) {
			const p = positions[i];
			if (p.isBefore(result)) {
				result = p;
			}
		}
		return result;
	}

	static Max(...positions: Position[]): Position {
		if (positions.length === 0) {
			throw new TypeError();
		}
		let result = positions[0];
		for (let i = 1; i < positions.length; i++) {
			const p = positions[i];
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
		const { line, character } = <Position>other;
		if (typeof line === 'number' && typeof character === 'number') {
			return true;
		}
		return false;
	}

	static of(obj: vscode.Position): Position {
		if (obj instanceof Position) {
			return obj;
		} else if (this.isPosition(obj)) {
			return new Position(obj.line, obj.character);
		}
		throw new Error('Invalid argument, is NOT a position-like object');
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

	translate(change: { lineDelta?: number; characterDelta?: number }): Position;
	translate(lineDelta?: number, characterDelta?: number): Position;
	translate(lineDeltaOrChange: number | undefined | { lineDelta?: number; characterDelta?: number }, characterDelta: number = 0): Position {

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

	with(change: { line?: number; character?: number }): Position;
	with(line?: number, character?: number): Position;
	with(lineOrChange: number | undefined | { line?: number; character?: number }, character: number = this.character): Position {

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

	[Symbol.for('debug.description')]() {
		return `(${this.line}:${this.character})`;
	}
}

@es5ClassCompat
export class Range {

	static isRange(thing: any): thing is vscode.Range {
		if (thing instanceof Range) {
			return true;
		}
		if (!thing) {
			return false;
		}
		return Position.isPosition((<Range>thing).start)
			&& Position.isPosition((<Range>thing.end));
	}

	static of(obj: vscode.Range): Range {
		if (obj instanceof Range) {
			return obj;
		}
		if (this.isRange(obj)) {
			return new Range(obj.start, obj.end);
		}
		throw new Error('Invalid argument, is NOT a range-like object');
	}

	protected _start: Position;
	protected _end: Position;

	get start(): Position {
		return this._start;
	}

	get end(): Position {
		return this._end;
	}

	constructor(start: vscode.Position, end: vscode.Position);
	constructor(start: Position, end: Position);
	constructor(startLine: number, startColumn: number, endLine: number, endColumn: number);
	constructor(startLineOrStart: number | Position | vscode.Position, startColumnOrEnd: number | Position | vscode.Position, endLine?: number, endColumn?: number) {
		let start: Position | undefined;
		let end: Position | undefined;

		if (typeof startLineOrStart === 'number' && typeof startColumnOrEnd === 'number' && typeof endLine === 'number' && typeof endColumn === 'number') {
			start = new Position(startLineOrStart, startColumnOrEnd);
			end = new Position(endLine, endColumn);
		} else if (Position.isPosition(startLineOrStart) && Position.isPosition(startColumnOrEnd)) {
			start = Position.of(startLineOrStart);
			end = Position.of(startColumnOrEnd);
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
		if (Range.isRange(positionOrRange)) {
			return this.contains(positionOrRange.start)
				&& this.contains(positionOrRange.end);

		} else if (Position.isPosition(positionOrRange)) {
			if (Position.of(positionOrRange).isBefore(this._start)) {
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
		} else if (other.contains(this)) {
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
	with(startOrChange: Position | undefined | { start?: Position; end?: Position }, end: Position = this.end): Range {

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

	[Symbol.for('debug.description')]() {
		return getDebugDescriptionOfRange(this);
	}
}

@es5ClassCompat
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
		let anchor: Position | undefined;
		let active: Position | undefined;

		if (typeof anchorLineOrAnchor === 'number' && typeof anchorColumnOrActive === 'number' && typeof activeLine === 'number' && typeof activeColumn === 'number') {
			anchor = new Position(anchorLineOrAnchor, anchorColumnOrActive);
			active = new Position(activeLine, activeColumn);
		} else if (Position.isPosition(anchorLineOrAnchor) && Position.isPosition(anchorColumnOrActive)) {
			anchor = Position.of(anchorLineOrAnchor);
			active = Position.of(anchorColumnOrActive);
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

	override toJSON() {
		return {
			start: this.start,
			end: this.end,
			active: this.active,
			anchor: this.anchor
		};
	}


	[Symbol.for('debug.description')]() {
		return getDebugDescriptionOfSelection(this);
	}
}

export function getDebugDescriptionOfRange(range: vscode.Range): string {
	return range.isEmpty
		? `[${range.start.line}:${range.start.character})`
		: `[${range.start.line}:${range.start.character} -> ${range.end.line}:${range.end.character})`;
}

export function getDebugDescriptionOfSelection(selection: vscode.Selection): string {
	let rangeStr = getDebugDescriptionOfRange(selection);
	if (!selection.isEmpty) {
		if (selection.active.isEqual(selection.start)) {
			rangeStr = `|${rangeStr}`;
		} else {
			rangeStr = `${rangeStr}|`;
		}
	}
	return rangeStr;
}

const validateConnectionToken = (connectionToken: string) => {
	if (typeof connectionToken !== 'string' || connectionToken.length === 0 || !/^[0-9A-Za-z_\-]+$/.test(connectionToken)) {
		throw illegalArgument('connectionToken');
	}
};


export class ResolvedAuthority {
	public static isResolvedAuthority(resolvedAuthority: any): resolvedAuthority is ResolvedAuthority {
		return resolvedAuthority
			&& typeof resolvedAuthority === 'object'
			&& typeof resolvedAuthority.host === 'string'
			&& typeof resolvedAuthority.port === 'number'
			&& (resolvedAuthority.connectionToken === undefined || typeof resolvedAuthority.connectionToken === 'string');
	}

	readonly host: string;
	readonly port: number;
	readonly connectionToken: string | undefined;

	constructor(host: string, port: number, connectionToken?: string) {
		if (typeof host !== 'string' || host.length === 0) {
			throw illegalArgument('host');
		}
		if (typeof port !== 'number' || port === 0 || Math.round(port) !== port) {
			throw illegalArgument('port');
		}
		if (typeof connectionToken !== 'undefined') {
			validateConnectionToken(connectionToken);
		}
		this.host = host;
		this.port = Math.round(port);
		this.connectionToken = connectionToken;
	}
}


export class ManagedResolvedAuthority {

	public static isManagedResolvedAuthority(resolvedAuthority: any): resolvedAuthority is ManagedResolvedAuthority {
		return resolvedAuthority
			&& typeof resolvedAuthority === 'object'
			&& typeof resolvedAuthority.makeConnection === 'function'
			&& (resolvedAuthority.connectionToken === undefined || typeof resolvedAuthority.connectionToken === 'string');
	}

	constructor(public readonly makeConnection: () => Thenable<vscode.ManagedMessagePassing>, public readonly connectionToken?: string) {
		if (typeof connectionToken !== 'undefined') {
			validateConnectionToken(connectionToken);
		}
	}
}

export class RemoteAuthorityResolverError extends Error {

	static NotAvailable(message?: string, handled?: boolean): RemoteAuthorityResolverError {
		return new RemoteAuthorityResolverError(message, RemoteAuthorityResolverErrorCode.NotAvailable, handled);
	}

	static TemporarilyNotAvailable(message?: string): RemoteAuthorityResolverError {
		return new RemoteAuthorityResolverError(message, RemoteAuthorityResolverErrorCode.TemporarilyNotAvailable);
	}

	public readonly _message: string | undefined;
	public readonly _code: RemoteAuthorityResolverErrorCode;
	public readonly _detail: any;

	constructor(message?: string, code: RemoteAuthorityResolverErrorCode = RemoteAuthorityResolverErrorCode.Unknown, detail?: any) {
		super(message);

		this._message = message;
		this._code = code;
		this._detail = detail;

		// workaround when extending builtin objects and when compiling to ES5, see:
		// https://github.com/microsoft/TypeScript-wiki/blob/master/Breaking-Changes.md#extending-built-ins-like-error-array-and-map-may-no-longer-work
		Object.setPrototypeOf(this, RemoteAuthorityResolverError.prototype);
	}
}

export enum EndOfLine {
	LF = 1,
	CRLF = 2
}

export enum EnvironmentVariableMutatorType {
	Replace = 1,
	Append = 2,
	Prepend = 3
}

@es5ClassCompat
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

	static setEndOfLine(eol: EndOfLine): TextEdit {
		const ret = new TextEdit(new Range(new Position(0, 0), new Position(0, 0)), '');
		ret.newEol = eol;
		return ret;
	}

	protected _range: Range;
	protected _newText: string | null;
	protected _newEol?: EndOfLine;

	get range(): Range {
		return this._range;
	}

	set range(value: Range) {
		if (value && !Range.isRange(value)) {
			throw illegalArgument('range');
		}
		this._range = value;
	}

	get newText(): string {
		return this._newText || '';
	}

	set newText(value: string) {
		if (value && typeof value !== 'string') {
			throw illegalArgument('newText');
		}
		this._newText = value;
	}

	get newEol(): EndOfLine | undefined {
		return this._newEol;
	}

	set newEol(value: EndOfLine | undefined) {
		if (value && typeof value !== 'number') {
			throw illegalArgument('newEol');
		}
		this._newEol = value;
	}

	constructor(range: Range, newText: string | null) {
		this._range = range;
		this._newText = newText;
	}

	toJSON(): any {
		return {
			range: this.range,
			newText: this.newText,
			newEol: this._newEol
		};
	}
}

@es5ClassCompat
export class NotebookEdit implements vscode.NotebookEdit {

	static isNotebookCellEdit(thing: any): thing is NotebookEdit {
		if (thing instanceof NotebookEdit) {
			return true;
		}
		if (!thing) {
			return false;
		}
		return NotebookRange.isNotebookRange((<NotebookEdit>thing))
			&& Array.isArray((<NotebookEdit>thing).newCells);
	}

	static replaceCells(range: NotebookRange, newCells: NotebookCellData[]): NotebookEdit {
		return new NotebookEdit(range, newCells);
	}

	static insertCells(index: number, newCells: vscode.NotebookCellData[]): vscode.NotebookEdit {
		return new NotebookEdit(new NotebookRange(index, index), newCells);
	}

	static deleteCells(range: NotebookRange): NotebookEdit {
		return new NotebookEdit(range, []);
	}

	static updateCellMetadata(index: number, newMetadata: { [key: string]: any }): NotebookEdit {
		const edit = new NotebookEdit(new NotebookRange(index, index), []);
		edit.newCellMetadata = newMetadata;
		return edit;
	}

	static updateNotebookMetadata(newMetadata: { [key: string]: any }): NotebookEdit {
		const edit = new NotebookEdit(new NotebookRange(0, 0), []);
		edit.newNotebookMetadata = newMetadata;
		return edit;
	}

	range: NotebookRange;
	newCells: NotebookCellData[];
	newCellMetadata?: { [key: string]: any };
	newNotebookMetadata?: { [key: string]: any };

	constructor(range: NotebookRange, newCells: NotebookCellData[]) {
		this.range = range;
		this.newCells = newCells;
	}
}

export class SnippetTextEdit implements vscode.SnippetTextEdit {

	static isSnippetTextEdit(thing: any): thing is SnippetTextEdit {
		if (thing instanceof SnippetTextEdit) {
			return true;
		}
		if (!thing) {
			return false;
		}
		return Range.isRange((<SnippetTextEdit>thing).range)
			&& SnippetString.isSnippetString((<SnippetTextEdit>thing).snippet);
	}

	static replace(range: Range, snippet: SnippetString): SnippetTextEdit {
		return new SnippetTextEdit(range, snippet);
	}

	static insert(position: Position, snippet: SnippetString): SnippetTextEdit {
		return SnippetTextEdit.replace(new Range(position, position), snippet);
	}

	range: Range;

	snippet: SnippetString;

	constructor(range: Range, snippet: SnippetString) {
		this.range = range;
		this.snippet = snippet;
	}
}

export interface IFileOperationOptions {
	readonly overwrite?: boolean;
	readonly ignoreIfExists?: boolean;
	readonly ignoreIfNotExists?: boolean;
	readonly recursive?: boolean;
	readonly contents?: Uint8Array | vscode.DataTransferFile;
}

export const enum FileEditType {
	File = 1,
	Text = 2,
	Cell = 3,
	CellReplace = 5,
	Snippet = 6,
}

export interface IFileOperation {
	readonly _type: FileEditType.File;
	readonly from?: URI;
	readonly to?: URI;
	readonly options?: IFileOperationOptions;
	readonly metadata?: vscode.WorkspaceEditEntryMetadata;
}

export interface IFileTextEdit {
	readonly _type: FileEditType.Text;
	readonly uri: URI;
	readonly edit: TextEdit;
	readonly metadata?: vscode.WorkspaceEditEntryMetadata;
}

export interface IFileSnippetTextEdit {
	readonly _type: FileEditType.Snippet;
	readonly uri: URI;
	readonly range: vscode.Range;
	readonly edit: vscode.SnippetString;
	readonly metadata?: vscode.WorkspaceEditEntryMetadata;
}

export interface IFileCellEdit {
	readonly _type: FileEditType.Cell;
	readonly uri: URI;
	readonly edit?: ICellMetadataEdit | IDocumentMetadataEdit;
	readonly notebookMetadata?: Record<string, any>;
	readonly metadata?: vscode.WorkspaceEditEntryMetadata;
}

export interface ICellEdit {
	readonly _type: FileEditType.CellReplace;
	readonly metadata?: vscode.WorkspaceEditEntryMetadata;
	readonly uri: URI;
	readonly index: number;
	readonly count: number;
	readonly cells: vscode.NotebookCellData[];
}


type WorkspaceEditEntry = IFileOperation | IFileTextEdit | IFileSnippetTextEdit | IFileCellEdit | ICellEdit;

@es5ClassCompat
export class WorkspaceEdit implements vscode.WorkspaceEdit {

	private readonly _edits: WorkspaceEditEntry[] = [];


	_allEntries(): ReadonlyArray<WorkspaceEditEntry> {
		return this._edits;
	}

	// --- file

	renameFile(from: vscode.Uri, to: vscode.Uri, options?: { readonly overwrite?: boolean; readonly ignoreIfExists?: boolean }, metadata?: vscode.WorkspaceEditEntryMetadata): void {
		this._edits.push({ _type: FileEditType.File, from, to, options, metadata });
	}

	createFile(uri: vscode.Uri, options?: { readonly overwrite?: boolean; readonly ignoreIfExists?: boolean; readonly contents?: Uint8Array | vscode.DataTransferFile }, metadata?: vscode.WorkspaceEditEntryMetadata): void {
		this._edits.push({ _type: FileEditType.File, from: undefined, to: uri, options, metadata });
	}

	deleteFile(uri: vscode.Uri, options?: { readonly recursive?: boolean; readonly ignoreIfNotExists?: boolean }, metadata?: vscode.WorkspaceEditEntryMetadata): void {
		this._edits.push({ _type: FileEditType.File, from: uri, to: undefined, options, metadata });
	}

	// --- notebook

	private replaceNotebookMetadata(uri: URI, value: Record<string, any>, metadata?: vscode.WorkspaceEditEntryMetadata): void {
		this._edits.push({ _type: FileEditType.Cell, metadata, uri, edit: { editType: CellEditType.DocumentMetadata, metadata: value }, notebookMetadata: value });
	}

	private replaceNotebookCells(uri: URI, startOrRange: vscode.NotebookRange, cellData: vscode.NotebookCellData[], metadata?: vscode.WorkspaceEditEntryMetadata): void {
		const start = startOrRange.start;
		const end = startOrRange.end;

		if (start !== end || cellData.length > 0) {
			this._edits.push({ _type: FileEditType.CellReplace, uri, index: start, count: end - start, cells: cellData, metadata });
		}
	}

	private replaceNotebookCellMetadata(uri: URI, index: number, cellMetadata: Record<string, any>, metadata?: vscode.WorkspaceEditEntryMetadata): void {
		this._edits.push({ _type: FileEditType.Cell, metadata, uri, edit: { editType: CellEditType.Metadata, index, metadata: cellMetadata } });
	}

	// --- text

	replace(uri: URI, range: Range, newText: string, metadata?: vscode.WorkspaceEditEntryMetadata): void {
		this._edits.push({ _type: FileEditType.Text, uri, edit: new TextEdit(range, newText), metadata });
	}

	insert(resource: URI, position: Position, newText: string, metadata?: vscode.WorkspaceEditEntryMetadata): void {
		this.replace(resource, new Range(position, position), newText, metadata);
	}

	delete(resource: URI, range: Range, metadata?: vscode.WorkspaceEditEntryMetadata): void {
		this.replace(resource, range, '', metadata);
	}

	// --- text (Maplike)

	has(uri: URI): boolean {
		return this._edits.some(edit => edit._type === FileEditType.Text && edit.uri.toString() === uri.toString());
	}

	set(uri: URI, edits: ReadonlyArray<TextEdit | SnippetTextEdit>): void;
	set(uri: URI, edits: ReadonlyArray<[TextEdit | SnippetTextEdit, vscode.WorkspaceEditEntryMetadata | undefined]>): void;
	set(uri: URI, edits: readonly NotebookEdit[]): void;
	set(uri: URI, edits: ReadonlyArray<[NotebookEdit, vscode.WorkspaceEditEntryMetadata | undefined]>): void;

	set(uri: URI, edits: null | undefined | ReadonlyArray<TextEdit | SnippetTextEdit | NotebookEdit | [NotebookEdit, vscode.WorkspaceEditEntryMetadata | undefined] | [TextEdit | SnippetTextEdit, vscode.WorkspaceEditEntryMetadata | undefined]>): void {
		if (!edits) {
			// remove all text, snippet, or notebook edits for `uri`
			for (let i = 0; i < this._edits.length; i++) {
				const element = this._edits[i];
				switch (element._type) {
					case FileEditType.Text:
					case FileEditType.Snippet:
					case FileEditType.Cell:
					case FileEditType.CellReplace:
						if (element.uri.toString() === uri.toString()) {
							this._edits[i] = undefined!; // will be coalesced down below
						}
						break;
				}
			}
			coalesceInPlace(this._edits);
		} else {
			// append edit to the end
			for (const editOrTuple of edits) {
				if (!editOrTuple) {
					continue;
				}
				let edit: TextEdit | SnippetTextEdit | NotebookEdit;
				let metadata: vscode.WorkspaceEditEntryMetadata | undefined;
				if (Array.isArray(editOrTuple)) {
					edit = editOrTuple[0];
					metadata = editOrTuple[1];
				} else {
					edit = editOrTuple;
				}
				if (NotebookEdit.isNotebookCellEdit(edit)) {
					if (edit.newCellMetadata) {
						this.replaceNotebookCellMetadata(uri, edit.range.start, edit.newCellMetadata, metadata);
					} else if (edit.newNotebookMetadata) {
						this.replaceNotebookMetadata(uri, edit.newNotebookMetadata, metadata);
					} else {
						this.replaceNotebookCells(uri, edit.range, edit.newCells, metadata);
					}
				} else if (SnippetTextEdit.isSnippetTextEdit(edit)) {
					this._edits.push({ _type: FileEditType.Snippet, uri, range: edit.range, edit: edit.snippet, metadata });

				} else {
					this._edits.push({ _type: FileEditType.Text, uri, edit, metadata });
				}
			}
		}
	}

	get(uri: URI): TextEdit[] {
		const res: TextEdit[] = [];
		for (const candidate of this._edits) {
			if (candidate._type === FileEditType.Text && candidate.uri.toString() === uri.toString()) {
				res.push(candidate.edit);
			}
		}
		return res;
	}

	entries(): [URI, TextEdit[]][] {
		const textEdits = new ResourceMap<[URI, TextEdit[]]>();
		for (const candidate of this._edits) {
			if (candidate._type === FileEditType.Text) {
				let textEdit = textEdits.get(candidate.uri);
				if (!textEdit) {
					textEdit = [candidate.uri, []];
					textEdits.set(candidate.uri, textEdit);
				}
				textEdit[1].push(candidate.edit);
			}
		}
		return [...textEdits.values()];
	}

	get size(): number {
		return this.entries().length;
	}

	toJSON(): any {
		return this.entries();
	}
}

@es5ClassCompat
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

	appendChoice(values: string[], number: number = this._tabstop++): SnippetString {
		const value = values.map(s => s.replaceAll(/[|\\,]/g, '\\$&')).join(',');

		this.value += '${';
		this.value += number;
		this.value += '|';
		this.value += value;
		this.value += '|}';

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
			defaultValue = defaultValue.replace(/\$|}/g, '\\$&'); // CodeQL [SM02383] I do not want to escape backslashes here
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
	Deprecated = 2
}

export enum DiagnosticSeverity {
	Hint = 3,
	Information = 2,
	Warning = 1,
	Error = 0
}

@es5ClassCompat
export class Location {

	static isLocation(thing: any): thing is vscode.Location {
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
	range!: Range;

	constructor(uri: URI, rangeOrPosition: Range | Position) {
		this.uri = uri;

		if (!rangeOrPosition) {
			//that's OK
		} else if (Range.isRange(rangeOrPosition)) {
			this.range = Range.of(rangeOrPosition);
		} else if (Position.isPosition(rangeOrPosition)) {
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

@es5ClassCompat
export class DiagnosticRelatedInformation {

	static is(thing: any): thing is DiagnosticRelatedInformation {
		if (!thing) {
			return false;
		}
		return typeof (<DiagnosticRelatedInformation>thing).message === 'string'
			&& (<DiagnosticRelatedInformation>thing).location
			&& Range.isRange((<DiagnosticRelatedInformation>thing).location.range)
			&& URI.isUri((<DiagnosticRelatedInformation>thing).location.uri);
	}

	location: Location;
	message: string;

	constructor(location: Location, message: string) {
		this.location = location;
		this.message = message;
	}

	static isEqual(a: DiagnosticRelatedInformation, b: DiagnosticRelatedInformation): boolean {
		if (a === b) {
			return true;
		}
		if (!a || !b) {
			return false;
		}
		return a.message === b.message
			&& a.location.range.isEqual(b.location.range)
			&& a.location.uri.toString() === b.location.uri.toString();
	}
}

@es5ClassCompat
export class Diagnostic {

	range: Range;
	message: string;
	severity: DiagnosticSeverity;
	source?: string;
	code?: string | number;
	relatedInformation?: DiagnosticRelatedInformation[];
	tags?: DiagnosticTag[];

	constructor(range: Range, message: string, severity: DiagnosticSeverity = DiagnosticSeverity.Error) {
		if (!Range.isRange(range)) {
			throw new TypeError('range must be set');
		}
		if (!message) {
			throw new TypeError('message must be set');
		}
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

	static isEqual(a: Diagnostic | undefined, b: Diagnostic | undefined): boolean {
		if (a === b) {
			return true;
		}
		if (!a || !b) {
			return false;
		}
		return a.message === b.message
			&& a.severity === b.severity
			&& a.code === b.code
			&& a.severity === b.severity
			&& a.source === b.source
			&& a.range.isEqual(b.range)
			&& equals(a.tags, b.tags)
			&& equals(a.relatedInformation, b.relatedInformation, DiagnosticRelatedInformation.isEqual);
	}
}

@es5ClassCompat
export class Hover {

	public contents: (vscode.MarkdownString | vscode.MarkedString)[];
	public range: Range | undefined;

	constructor(
		contents: vscode.MarkdownString | vscode.MarkedString | (vscode.MarkdownString | vscode.MarkedString)[],
		range?: Range
	) {
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

@es5ClassCompat
export class VerboseHover extends Hover {

	public canIncreaseVerbosity: boolean | undefined;
	public canDecreaseVerbosity: boolean | undefined;

	constructor(
		contents: vscode.MarkdownString | vscode.MarkedString | (vscode.MarkdownString | vscode.MarkedString)[],
		range?: Range,
		canIncreaseVerbosity?: boolean,
		canDecreaseVerbosity?: boolean,
	) {
		super(contents, range);
		this.canIncreaseVerbosity = canIncreaseVerbosity;
		this.canDecreaseVerbosity = canDecreaseVerbosity;
	}
}

export enum HoverVerbosityAction {
	Increase = 0,
	Decrease = 1
}

export enum DocumentHighlightKind {
	Text = 0,
	Read = 1,
	Write = 2
}

@es5ClassCompat
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

@es5ClassCompat
export class MultiDocumentHighlight {

	uri: URI;
	highlights: DocumentHighlight[];

	constructor(uri: URI, highlights: DocumentHighlight[]) {
		this.uri = uri;
		this.highlights = highlights;
	}

	toJSON(): any {
		return {
			uri: this.uri,
			highlights: this.highlights.map(h => h.toJSON())
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
	TypeParameter = 25
}

export enum SymbolTag {
	Deprecated = 1,
}

@es5ClassCompat
export class SymbolInformation {

	static validate(candidate: SymbolInformation): void {
		if (!candidate.name) {
			throw new Error('name must not be falsy');
		}
	}

	name: string;
	location!: Location;
	kind: SymbolKind;
	tags?: SymbolTag[];
	containerName: string | undefined;

	constructor(name: string, kind: SymbolKind, containerName: string | undefined, location: Location);
	constructor(name: string, kind: SymbolKind, range: Range, uri?: URI, containerName?: string);
	constructor(name: string, kind: SymbolKind, rangeOrContainer: string | undefined | Range, locationOrUri?: Location | URI, containerName?: string) {
		this.name = name;
		this.kind = kind;
		this.containerName = containerName;

		if (typeof rangeOrContainer === 'string') {
			this.containerName = rangeOrContainer;
		}

		if (locationOrUri instanceof Location) {
			this.location = locationOrUri;
		} else if (rangeOrContainer instanceof Range) {
			this.location = new Location(locationOrUri!, rangeOrContainer);
		}

		SymbolInformation.validate(this);
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

@es5ClassCompat
export class DocumentSymbol {

	static validate(candidate: DocumentSymbol): void {
		if (!candidate.name) {
			throw new Error('name must not be falsy');
		}
		if (!candidate.range.contains(candidate.selectionRange)) {
			throw new Error('selectionRange must be contained in fullRange');
		}
		candidate.children?.forEach(DocumentSymbol.validate);
	}

	name: string;
	detail: string;
	kind: SymbolKind;
	tags?: SymbolTag[];
	range: Range;
	selectionRange: Range;
	children: DocumentSymbol[];

	constructor(name: string, detail: string, kind: SymbolKind, range: Range, selectionRange: Range) {
		this.name = name;
		this.detail = detail;
		this.kind = kind;
		this.range = range;
		this.selectionRange = selectionRange;
		this.children = [];

		DocumentSymbol.validate(this);
	}
}


export enum CodeActionTriggerKind {
	Invoke = 1,
	Automatic = 2,
}

@es5ClassCompat
export class CodeAction {
	title: string;

	command?: vscode.Command;

	edit?: WorkspaceEdit;

	diagnostics?: Diagnostic[];

	kind?: CodeActionKind;

	isPreferred?: boolean;

	constructor(title: string, kind?: CodeActionKind) {
		this.title = title;
		this.kind = kind;
	}
}

@es5ClassCompat
export class CodeActionKind {
	private static readonly sep = '.';

	public static Empty: CodeActionKind;
	public static QuickFix: CodeActionKind;
	public static Refactor: CodeActionKind;
	public static RefactorExtract: CodeActionKind;
	public static RefactorInline: CodeActionKind;
	public static RefactorMove: CodeActionKind;
	public static RefactorRewrite: CodeActionKind;
	public static Source: CodeActionKind;
	public static SourceOrganizeImports: CodeActionKind;
	public static SourceFixAll: CodeActionKind;
	public static Notebook: CodeActionKind;

	constructor(
		public readonly value: string
	) { }

	public append(parts: string): CodeActionKind {
		return new CodeActionKind(this.value ? this.value + CodeActionKind.sep + parts : parts);
	}

	public intersects(other: CodeActionKind): boolean {
		return this.contains(other) || other.contains(this);
	}

	public contains(other: CodeActionKind): boolean {
		return this.value === other.value || other.value.startsWith(this.value + CodeActionKind.sep);
	}
}

CodeActionKind.Empty = new CodeActionKind('');
CodeActionKind.QuickFix = CodeActionKind.Empty.append('quickfix');
CodeActionKind.Refactor = CodeActionKind.Empty.append('refactor');
CodeActionKind.RefactorExtract = CodeActionKind.Refactor.append('extract');
CodeActionKind.RefactorInline = CodeActionKind.Refactor.append('inline');
CodeActionKind.RefactorMove = CodeActionKind.Refactor.append('move');
CodeActionKind.RefactorRewrite = CodeActionKind.Refactor.append('rewrite');
CodeActionKind.Source = CodeActionKind.Empty.append('source');
CodeActionKind.SourceOrganizeImports = CodeActionKind.Source.append('organizeImports');
CodeActionKind.SourceFixAll = CodeActionKind.Source.append('fixAll');
CodeActionKind.Notebook = CodeActionKind.Empty.append('notebook');

@es5ClassCompat
export class SelectionRange {

	range: Range;
	parent?: SelectionRange;

	constructor(range: Range, parent?: SelectionRange) {
		this.range = range;
		this.parent = parent;

		if (parent && !parent.range.contains(this.range)) {
			throw new Error('Invalid argument: parent must contain this range');
		}
	}
}

export class CallHierarchyItem {

	_sessionId?: string;
	_itemId?: string;

	kind: SymbolKind;
	tags?: SymbolTag[];
	name: string;
	detail?: string;
	uri: URI;
	range: Range;
	selectionRange: Range;

	constructor(kind: SymbolKind, name: string, detail: string, uri: URI, range: Range, selectionRange: Range) {
		this.kind = kind;
		this.name = name;
		this.detail = detail;
		this.uri = uri;
		this.range = range;
		this.selectionRange = selectionRange;
	}
}

export class CallHierarchyIncomingCall {

	from: vscode.CallHierarchyItem;
	fromRanges: vscode.Range[];

	constructor(item: vscode.CallHierarchyItem, fromRanges: vscode.Range[]) {
		this.fromRanges = fromRanges;
		this.from = item;
	}
}
export class CallHierarchyOutgoingCall {

	to: vscode.CallHierarchyItem;
	fromRanges: vscode.Range[];

	constructor(item: vscode.CallHierarchyItem, fromRanges: vscode.Range[]) {
		this.fromRanges = fromRanges;
		this.to = item;
	}
}

export enum LanguageStatusSeverity {
	Information = 0,
	Warning = 1,
	Error = 2
}


@es5ClassCompat
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

@es5ClassCompat
export class MarkdownString implements vscode.MarkdownString {

	readonly #delegate: BaseMarkdownString;

	static isMarkdownString(thing: any): thing is vscode.MarkdownString {
		if (thing instanceof MarkdownString) {
			return true;
		}
		return thing && thing.appendCodeblock && thing.appendMarkdown && thing.appendText && (thing.value !== undefined);
	}

	constructor(value?: string, supportThemeIcons: boolean = false) {
		this.#delegate = new BaseMarkdownString(value, { supportThemeIcons });
	}

	get value(): string {
		return this.#delegate.value;
	}
	set value(value: string) {
		this.#delegate.value = value;
	}

	get isTrusted(): boolean | MarkdownStringTrustedOptions | undefined {
		return this.#delegate.isTrusted;
	}

	set isTrusted(value: boolean | MarkdownStringTrustedOptions | undefined) {
		this.#delegate.isTrusted = value;
	}

	get supportThemeIcons(): boolean | undefined {
		return this.#delegate.supportThemeIcons;
	}

	set supportThemeIcons(value: boolean | undefined) {
		this.#delegate.supportThemeIcons = value;
	}

	get supportHtml(): boolean | undefined {
		return this.#delegate.supportHtml;
	}

	set supportHtml(value: boolean | undefined) {
		this.#delegate.supportHtml = value;
	}

	get baseUri(): vscode.Uri | undefined {
		return this.#delegate.baseUri;
	}

	set baseUri(value: vscode.Uri | undefined) {
		this.#delegate.baseUri = value;
	}

	appendText(value: string): vscode.MarkdownString {
		this.#delegate.appendText(value);
		return this;
	}

	appendMarkdown(value: string): vscode.MarkdownString {
		this.#delegate.appendMarkdown(value);
		return this;
	}

	appendCodeblock(value: string, language?: string): vscode.MarkdownString {
		this.#delegate.appendCodeblock(language ?? '', value);
		return this;
	}
}

@es5ClassCompat
export class ParameterInformation {

	label: string | [number, number];
	documentation?: string | vscode.MarkdownString;

	constructor(label: string | [number, number], documentation?: string | vscode.MarkdownString) {
		this.label = label;
		this.documentation = documentation;
	}
}

@es5ClassCompat
export class SignatureInformation {

	label: string;
	documentation?: string | vscode.MarkdownString;
	parameters: ParameterInformation[];
	activeParameter?: number;

	constructor(label: string, documentation?: string | vscode.MarkdownString) {
		this.label = label;
		this.documentation = documentation;
		this.parameters = [];
	}
}

@es5ClassCompat
export class SignatureHelp {

	signatures: SignatureInformation[];
	activeSignature: number = 0;
	activeParameter: number = 0;

	constructor() {
		this.signatures = [];
	}
}

export enum SignatureHelpTriggerKind {
	Invoke = 1,
	TriggerCharacter = 2,
	ContentChange = 3,
}


export enum InlayHintKind {
	Type = 1,
	Parameter = 2,
}

@es5ClassCompat
export class InlayHintLabelPart {

	value: string;
	tooltip?: string | vscode.MarkdownString;
	location?: Location;
	command?: vscode.Command;

	constructor(value: string) {
		this.value = value;
	}
}

@es5ClassCompat
export class InlayHint implements vscode.InlayHint {

	label: string | InlayHintLabelPart[];
	tooltip?: string | vscode.MarkdownString;
	position: Position;
	textEdits?: TextEdit[];
	kind?: vscode.InlayHintKind;
	paddingLeft?: boolean;
	paddingRight?: boolean;

	constructor(position: Position, label: string | InlayHintLabelPart[], kind?: vscode.InlayHintKind) {
		this.position = position;
		this.label = label;
		this.kind = kind;
	}
}

export enum CompletionTriggerKind {
	Invoke = 0,
	TriggerCharacter = 1,
	TriggerForIncompleteCompletions = 2
}

export interface CompletionContext {
	readonly triggerKind: CompletionTriggerKind;
	readonly triggerCharacter: string | undefined;
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
	Issue = 26
}

export enum CompletionItemTag {
	Deprecated = 1,
}

export interface CompletionItemLabel {
	label: string;
	detail?: string;
	description?: string;
}

@es5ClassCompat
export class CompletionItem implements vscode.CompletionItem {

	label: string | CompletionItemLabel;
	kind?: CompletionItemKind;
	tags?: CompletionItemTag[];
	detail?: string;
	documentation?: string | vscode.MarkdownString;
	sortText?: string;
	filterText?: string;
	preselect?: boolean;
	insertText?: string | SnippetString;
	keepWhitespace?: boolean;
	range?: Range | { inserting: Range; replacing: Range };
	commitCharacters?: string[];
	textEdit?: TextEdit;
	additionalTextEdits?: TextEdit[];
	command?: vscode.Command;

	constructor(label: string | CompletionItemLabel, kind?: CompletionItemKind) {
		this.label = label;
		this.kind = kind;
	}

	toJSON(): any {
		return {
			label: this.label,
			kind: this.kind && CompletionItemKind[this.kind],
			detail: this.detail,
			documentation: this.documentation,
			sortText: this.sortText,
			filterText: this.filterText,
			preselect: this.preselect,
			insertText: this.insertText,
			textEdit: this.textEdit
		};
	}
}

@es5ClassCompat
export class CompletionList {

	isIncomplete?: boolean;
	items: vscode.CompletionItem[];

	constructor(items: vscode.CompletionItem[] = [], isIncomplete: boolean = false) {
		this.items = items;
		this.isIncomplete = isIncomplete;
	}
}

@es5ClassCompat
export class InlineSuggestion implements vscode.InlineCompletionItem {

	filterText?: string;
	insertText: string;
	range?: Range;
	command?: vscode.Command;

	constructor(insertText: string, range?: Range, command?: vscode.Command) {
		this.insertText = insertText;
		this.range = range;
		this.command = command;
	}
}

@es5ClassCompat
export class InlineSuggestionList implements vscode.InlineCompletionList {
	items: vscode.InlineCompletionItem[];

	commands: vscode.Command[] | undefined = undefined;

	suppressSuggestions: boolean | undefined = undefined;

	constructor(items: vscode.InlineCompletionItem[]) {
		this.items = items;
	}
}

export interface PartialAcceptInfo {
	kind: PartialAcceptTriggerKind;
}

export enum PartialAcceptTriggerKind {
	Unknown = 0,
	Word = 1,
	Line = 2,
	Suggest = 3,
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
	Nine = 9
}

export enum StatusBarAlignment {
	Left = 1,
	Right = 2
}

export function asStatusBarItemIdentifier(extension: ExtensionIdentifier, id: string): string {
	return `${ExtensionIdentifier.toKey(extension)}.${id}`;
}

export enum TextEditorLineNumbersStyle {
	Off = 0,
	On = 1,
	Relative = 2,
	Interval = 3
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

export enum TextDocumentChangeReason {
	Undo = 1,
	Redo = 2,
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
	ClosedOpen = 3
}

export namespace TextEditorSelectionChangeKind {
	export function fromValue(s: string | undefined) {
		switch (s) {
			case 'keyboard': return TextEditorSelectionChangeKind.Keyboard;
			case 'mouse': return TextEditorSelectionChangeKind.Mouse;
			case 'api': return TextEditorSelectionChangeKind.Command;
		}
		return undefined;
	}
}

export enum SyntaxTokenType {
	Other = 0,
	Comment = 1,
	String = 2,
	RegEx = 3
}
export namespace SyntaxTokenType {
	export function toString(v: SyntaxTokenType | unknown): 'other' | 'comment' | 'string' | 'regex' {
		switch (v) {
			case SyntaxTokenType.Other: return 'other';
			case SyntaxTokenType.Comment: return 'comment';
			case SyntaxTokenType.String: return 'string';
			case SyntaxTokenType.RegEx: return 'regex';
		}
		return 'other';
	}
}

@es5ClassCompat
export class DocumentLink {

	range: Range;

	target?: URI;

	tooltip?: string;

	constructor(range: Range, target: URI | undefined) {
		if (target && !(URI.isUri(target))) {
			throw illegalArgument('target');
		}
		if (!Range.isRange(range) || range.isEmpty) {
			throw illegalArgument('range');
		}
		this.range = range;
		this.target = target;
	}
}

@es5ClassCompat
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

@es5ClassCompat
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

@es5ClassCompat
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
	HSL = 2
}

export enum SourceControlInputBoxValidationType {
	Error = 0,
	Warning = 1,
	Information = 2
}

export enum TerminalExitReason {
	Unknown = 0,
	Shutdown = 1,
	Process = 2,
	User = 3,
	Extension = 4
}

export enum TerminalShellExecutionCommandLineConfidence {
	Low = 0,
	Medium = 1,
	High = 2
}

export class TerminalLink implements vscode.TerminalLink {
	constructor(
		public startIndex: number,
		public length: number,
		public tooltip?: string
	) {
		if (typeof startIndex !== 'number' || startIndex < 0) {
			throw illegalArgument('startIndex');
		}
		if (typeof length !== 'number' || length < 1) {
			throw illegalArgument('length');
		}
		if (tooltip !== undefined && typeof tooltip !== 'string') {
			throw illegalArgument('tooltip');
		}
	}
}

export class TerminalQuickFixOpener {
	uri: vscode.Uri;
	constructor(uri: vscode.Uri) {
		this.uri = uri;
	}
}

export class TerminalQuickFixCommand {
	terminalCommand: string;
	constructor(terminalCommand: string) {
		this.terminalCommand = terminalCommand;
	}
}

export enum TerminalLocation {
	Panel = 1,
	Editor = 2,
}

export class TerminalProfile implements vscode.TerminalProfile {
	constructor(
		public options: vscode.TerminalOptions | vscode.ExtensionTerminalOptions
	) {
		if (typeof options !== 'object') {
			throw illegalArgument('options');
		}
	}
}

export enum TaskRevealKind {
	Always = 1,

	Silent = 2,

	Never = 3
}

export enum TaskPanelKind {
	Shared = 1,

	Dedicated = 2,

	New = 3
}

@es5ClassCompat
export class TaskGroup implements vscode.TaskGroup {

	isDefault: boolean | undefined;
	private _id: string;

	public static Clean: TaskGroup = new TaskGroup('clean', 'Clean');

	public static Build: TaskGroup = new TaskGroup('build', 'Build');

	public static Rebuild: TaskGroup = new TaskGroup('rebuild', 'Rebuild');

	public static Test: TaskGroup = new TaskGroup('test', 'Test');

	public static from(value: string) {
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

	constructor(id: string, public readonly label: string) {
		if (typeof id !== 'string') {
			throw illegalArgument('name');
		}
		if (typeof label !== 'string') {
			throw illegalArgument('name');
		}
		this._id = id;
	}

	get id(): string {
		return this._id;
	}
}

function computeTaskExecutionId(values: string[]): string {
	let id: string = '';
	for (let i = 0; i < values.length; i++) {
		id += values[i].replace(/,/g, ',,') + ',';
	}
	return id;
}

@es5ClassCompat
export class ProcessExecution implements vscode.ProcessExecution {

	private _process: string;
	private _args: string[];
	private _options: vscode.ProcessExecutionOptions | undefined;

	constructor(process: string, options?: vscode.ProcessExecutionOptions);
	constructor(process: string, args: string[], options?: vscode.ProcessExecutionOptions);
	constructor(process: string, varg1?: string[] | vscode.ProcessExecutionOptions, varg2?: vscode.ProcessExecutionOptions) {
		if (typeof process !== 'string') {
			throw illegalArgument('process');
		}
		this._args = [];
		this._process = process;
		if (varg1 !== undefined) {
			if (Array.isArray(varg1)) {
				this._args = varg1;
				this._options = varg2;
			} else {
				this._options = varg1;
			}
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
		return this._args;
	}

	set args(value: string[]) {
		if (!Array.isArray(value)) {
			value = [];
		}
		this._args = value;
	}

	get options(): vscode.ProcessExecutionOptions | undefined {
		return this._options;
	}

	set options(value: vscode.ProcessExecutionOptions | undefined) {
		this._options = value;
	}

	public computeId(): string {
		const props: string[] = [];
		props.push('process');
		if (this._process !== undefined) {
			props.push(this._process);
		}
		if (this._args && this._args.length > 0) {
			for (const arg of this._args) {
				props.push(arg);
			}
		}
		return computeTaskExecutionId(props);
	}
}

@es5ClassCompat
export class ShellExecution implements vscode.ShellExecution {

	private _commandLine: string | undefined;
	private _command: string | vscode.ShellQuotedString | undefined;
	private _args: (string | vscode.ShellQuotedString)[] = [];
	private _options: vscode.ShellExecutionOptions | undefined;

	constructor(commandLine: string, options?: vscode.ShellExecutionOptions);
	constructor(command: string | vscode.ShellQuotedString, args: (string | vscode.ShellQuotedString)[], options?: vscode.ShellExecutionOptions);
	constructor(arg0: string | vscode.ShellQuotedString, arg1?: vscode.ShellExecutionOptions | (string | vscode.ShellQuotedString)[], arg2?: vscode.ShellExecutionOptions) {
		if (Array.isArray(arg1)) {
			if (!arg0) {
				throw illegalArgument('command can\'t be undefined or null');
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

	get commandLine(): string | undefined {
		return this._commandLine;
	}

	set commandLine(value: string | undefined) {
		if (typeof value !== 'string') {
			throw illegalArgument('commandLine');
		}
		this._commandLine = value;
	}

	get command(): string | vscode.ShellQuotedString {
		return this._command ? this._command : '';
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

	get options(): vscode.ShellExecutionOptions | undefined {
		return this._options;
	}

	set options(value: vscode.ShellExecutionOptions | undefined) {
		this._options = value;
	}

	public computeId(): string {
		const props: string[] = [];
		props.push('shell');
		if (this._commandLine !== undefined) {
			props.push(this._commandLine);
		}
		if (this._command !== undefined) {
			props.push(typeof this._command === 'string' ? this._command : this._command.value);
		}
		if (this._args && this._args.length > 0) {
			for (const arg of this._args) {
				props.push(typeof arg === 'string' ? arg : arg.value);
			}
		}
		return computeTaskExecutionId(props);
	}
}

export enum ShellQuoting {
	Escape = 1,
	Strong = 2,
	Weak = 3
}

export enum TaskScope {
	Global = 1,
	Workspace = 2
}

export class CustomExecution implements vscode.CustomExecution {
	private _callback: (resolvedDefinition: vscode.TaskDefinition) => Thenable<vscode.Pseudoterminal>;
	constructor(callback: (resolvedDefinition: vscode.TaskDefinition) => Thenable<vscode.Pseudoterminal>) {
		this._callback = callback;
	}
	public computeId(): string {
		return 'customExecution' + generateUuid();
	}

	public set callback(value: (resolvedDefinition: vscode.TaskDefinition) => Thenable<vscode.Pseudoterminal>) {
		this._callback = value;
	}

	public get callback(): ((resolvedDefinition: vscode.TaskDefinition) => Thenable<vscode.Pseudoterminal>) {
		return this._callback;
	}
}

@es5ClassCompat
export class Task implements vscode.Task {

	private static ExtensionCallbackType: string = 'customExecution';
	private static ProcessType: string = 'process';
	private static ShellType: string = 'shell';
	private static EmptyType: string = '$empty';

	private __id: string | undefined;
	private __deprecated: boolean = false;

	private _definition: vscode.TaskDefinition;
	private _scope: vscode.TaskScope.Global | vscode.TaskScope.Workspace | vscode.WorkspaceFolder | undefined;
	private _name: string;
	private _execution: ProcessExecution | ShellExecution | CustomExecution | undefined;
	private _problemMatchers: string[];
	private _hasDefinedMatchers: boolean;
	private _isBackground: boolean;
	private _source: string;
	private _group: TaskGroup | undefined;
	private _presentationOptions: vscode.TaskPresentationOptions;
	private _runOptions: vscode.RunOptions;
	private _detail: string | undefined;

	constructor(definition: vscode.TaskDefinition, name: string, source: string, execution?: ProcessExecution | ShellExecution | CustomExecution, problemMatchers?: string | string[]);
	constructor(definition: vscode.TaskDefinition, scope: vscode.TaskScope.Global | vscode.TaskScope.Workspace | vscode.WorkspaceFolder, name: string, source: string, execution?: ProcessExecution | ShellExecution | CustomExecution, problemMatchers?: string | string[]);
	constructor(definition: vscode.TaskDefinition, arg2: string | (vscode.TaskScope.Global | vscode.TaskScope.Workspace) | vscode.WorkspaceFolder, arg3: any, arg4?: any, arg5?: any, arg6?: any) {
		this._definition = this.definition = definition;
		let problemMatchers: string | string[];
		if (typeof arg2 === 'string') {
			this._name = this.name = arg2;
			this._source = this.source = arg3;
			this.execution = arg4;
			problemMatchers = arg5;
			this.__deprecated = true;
		} else if (arg2 === TaskScope.Global || arg2 === TaskScope.Workspace) {
			this.target = arg2;
			this._name = this.name = arg3;
			this._source = this.source = arg4;
			this.execution = arg5;
			problemMatchers = arg6;
		} else {
			this.target = arg2;
			this._name = this.name = arg3;
			this._source = this.source = arg4;
			this.execution = arg5;
			problemMatchers = arg6;
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

	get _deprecated(): boolean {
		return this.__deprecated;
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
				id: this._execution.computeId()
			};
		} else if (this._execution instanceof ShellExecution) {
			this._definition = {
				type: Task.ShellType,
				id: this._execution.computeId()
			};
		} else if (this._execution instanceof CustomExecution) {
			this._definition = {
				type: Task.ExtensionCallbackType,
				id: this._execution.computeId()
			};
		} else {
			this._definition = {
				type: Task.EmptyType,
				id: generateUuid()
			};
		}
	}

	get definition(): vscode.TaskDefinition {
		return this._definition;
	}

	set definition(value: vscode.TaskDefinition) {
		if (value === undefined || value === null) {
			throw illegalArgument('Kind can\'t be undefined or null');
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

	get execution(): ProcessExecution | ShellExecution | CustomExecution | undefined {
		return this._execution;
	}

	set execution(value: ProcessExecution | ShellExecution | CustomExecution | undefined) {
		if (value === null) {
			value = undefined;
		}
		this.clear();
		this._execution = value;
		const type = this._definition.type;
		if (Task.EmptyType === type || Task.ProcessType === type || Task.ShellType === type || Task.ExtensionCallbackType === type) {
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
			return;
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

	get detail(): string | undefined {
		return this._detail;
	}

	set detail(value: string | undefined) {
		if (value === null) {
			value = undefined;
		}
		this._detail = value;
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
	Notification = 15
}

export namespace ViewBadge {
	export function isViewBadge(thing: any): thing is vscode.ViewBadge {
		const viewBadgeThing = thing as vscode.ViewBadge;

		if (!isNumber(viewBadgeThing.value)) {
			console.log('INVALID view badge, invalid value', viewBadgeThing.value);
			return false;
		}
		if (viewBadgeThing.tooltip && !isString(viewBadgeThing.tooltip)) {
			console.log('INVALID view badge, invalid tooltip', viewBadgeThing.tooltip);
			return false;
		}
		return true;
	}
}

@es5ClassCompat
export class TreeItem {

	label?: string | vscode.TreeItemLabel;
	resourceUri?: URI;
	iconPath?: string | URI | { light: string | URI; dark: string | URI } | ThemeIcon;
	command?: vscode.Command;
	contextValue?: string;
	tooltip?: string | vscode.MarkdownString;
	checkboxState?: vscode.TreeItemCheckboxState;

	static isTreeItem(thing: any, extension: IExtensionDescription): thing is TreeItem {
		const treeItemThing = thing as vscode.TreeItem;

		if (treeItemThing.checkboxState !== undefined) {
			const checkbox = isNumber(treeItemThing.checkboxState) ? treeItemThing.checkboxState :
				isObject(treeItemThing.checkboxState) && isNumber(treeItemThing.checkboxState.state) ? treeItemThing.checkboxState.state : undefined;
			const tooltip = !isNumber(treeItemThing.checkboxState) && isObject(treeItemThing.checkboxState) ? treeItemThing.checkboxState.tooltip : undefined;
			if (checkbox === undefined || (checkbox !== TreeItemCheckboxState.Checked && checkbox !== TreeItemCheckboxState.Unchecked) || (tooltip !== undefined && !isString(tooltip))) {
				console.log('INVALID tree item, invalid checkboxState', treeItemThing.checkboxState);
				return false;
			}
		}

		if (thing instanceof TreeItem) {
			return true;
		}

		if (treeItemThing.label !== undefined && !isString(treeItemThing.label) && !(treeItemThing.label?.label)) {
			console.log('INVALID tree item, invalid label', treeItemThing.label);
			return false;
		}
		if ((treeItemThing.id !== undefined) && !isString(treeItemThing.id)) {
			console.log('INVALID tree item, invalid id', treeItemThing.id);
			return false;
		}
		if ((treeItemThing.iconPath !== undefined) && !isString(treeItemThing.iconPath) && !URI.isUri(treeItemThing.iconPath) && (!treeItemThing.iconPath || !isString((treeItemThing.iconPath as vscode.ThemeIcon).id))) {
			const asLightAndDarkThing = treeItemThing.iconPath as { light: string | URI; dark: string | URI } | null;
			if (!asLightAndDarkThing || (!isString(asLightAndDarkThing.light) && !URI.isUri(asLightAndDarkThing.light) && !isString(asLightAndDarkThing.dark) && !URI.isUri(asLightAndDarkThing.dark))) {
				console.log('INVALID tree item, invalid iconPath', treeItemThing.iconPath);
				return false;
			}
		}
		if ((treeItemThing.description !== undefined) && !isString(treeItemThing.description) && (typeof treeItemThing.description !== 'boolean')) {
			console.log('INVALID tree item, invalid description', treeItemThing.description);
			return false;
		}
		if ((treeItemThing.resourceUri !== undefined) && !URI.isUri(treeItemThing.resourceUri)) {
			console.log('INVALID tree item, invalid resourceUri', treeItemThing.resourceUri);
			return false;
		}
		if ((treeItemThing.tooltip !== undefined) && !isString(treeItemThing.tooltip) && !(treeItemThing.tooltip instanceof MarkdownString)) {
			console.log('INVALID tree item, invalid tooltip', treeItemThing.tooltip);
			return false;
		}
		if ((treeItemThing.command !== undefined) && !treeItemThing.command.command) {
			console.log('INVALID tree item, invalid command', treeItemThing.command);
			return false;
		}
		if ((treeItemThing.collapsibleState !== undefined) && (treeItemThing.collapsibleState < TreeItemCollapsibleState.None) && (treeItemThing.collapsibleState > TreeItemCollapsibleState.Expanded)) {
			console.log('INVALID tree item, invalid collapsibleState', treeItemThing.collapsibleState);
			return false;
		}
		if ((treeItemThing.contextValue !== undefined) && !isString(treeItemThing.contextValue)) {
			console.log('INVALID tree item, invalid contextValue', treeItemThing.contextValue);
			return false;
		}
		if ((treeItemThing.accessibilityInformation !== undefined) && !treeItemThing.accessibilityInformation?.label) {
			console.log('INVALID tree item, invalid accessibilityInformation', treeItemThing.accessibilityInformation);
			return false;
		}

		return true;
	}

	constructor(label: string | vscode.TreeItemLabel, collapsibleState?: vscode.TreeItemCollapsibleState);
	constructor(resourceUri: URI, collapsibleState?: vscode.TreeItemCollapsibleState);
	constructor(arg1: string | vscode.TreeItemLabel | URI, public collapsibleState: vscode.TreeItemCollapsibleState = TreeItemCollapsibleState.None) {
		if (URI.isUri(arg1)) {
			this.resourceUri = arg1;
		} else {
			this.label = arg1;
		}
	}

}

export enum TreeItemCollapsibleState {
	None = 0,
	Collapsed = 1,
	Expanded = 2
}

export enum TreeItemCheckboxState {
	Unchecked = 0,
	Checked = 1
}

@es5ClassCompat
export class DataTransferItem implements vscode.DataTransferItem {

	async asString(): Promise<string> {
		return typeof this.value === 'string' ? this.value : JSON.stringify(this.value);
	}

	asFile(): undefined | vscode.DataTransferFile {
		return undefined;
	}

	constructor(
		public readonly value: any,
	) { }
}

/**
 * A data transfer item that has been created by VS Code instead of by a extension.
 *
 * Intentionally not exported to extensions.
 */
export class InternalDataTransferItem extends DataTransferItem { }

/**
 * A data transfer item for a file.
 *
 * Intentionally not exported to extensions as only we can create these.
 */
export class InternalFileDataTransferItem extends InternalDataTransferItem {

	readonly #file: vscode.DataTransferFile;

	constructor(file: vscode.DataTransferFile) {
		super('');
		this.#file = file;
	}

	override asFile() {
		return this.#file;
	}
}

/**
 * Intentionally not exported to extensions
 */
export class DataTransferFile implements vscode.DataTransferFile {

	public readonly name: string;
	public readonly uri: vscode.Uri | undefined;

	public readonly _itemId: string;
	private readonly _getData: () => Promise<Uint8Array>;

	constructor(name: string, uri: vscode.Uri | undefined, itemId: string, getData: () => Promise<Uint8Array>) {
		this.name = name;
		this.uri = uri;
		this._itemId = itemId;
		this._getData = getData;
	}

	data(): Promise<Uint8Array> {
		return this._getData();
	}
}

@es5ClassCompat
export class DataTransfer implements vscode.DataTransfer {
	#items = new Map<string, DataTransferItem[]>();

	constructor(init?: Iterable<readonly [string, DataTransferItem]>) {
		for (const [mime, item] of init ?? []) {
			const existing = this.#items.get(this.#normalizeMime(mime));
			if (existing) {
				existing.push(item);
			} else {
				this.#items.set(this.#normalizeMime(mime), [item]);
			}
		}
	}

	get(mimeType: string): DataTransferItem | undefined {
		return this.#items.get(this.#normalizeMime(mimeType))?.[0];
	}

	set(mimeType: string, value: DataTransferItem): void {
		// This intentionally overwrites all entries for a given mimetype.
		// This is similar to how the DOM DataTransfer type works
		this.#items.set(this.#normalizeMime(mimeType), [value]);
	}

	forEach(callbackfn: (value: DataTransferItem, key: string, dataTransfer: DataTransfer) => void, thisArg?: unknown): void {
		for (const [mime, items] of this.#items) {
			for (const item of items) {
				callbackfn.call(thisArg, item, mime, this);
			}
		}
	}

	*[Symbol.iterator](): IterableIterator<[mimeType: string, item: vscode.DataTransferItem]> {
		for (const [mime, items] of this.#items) {
			for (const item of items) {
				yield [mime, item];
			}
		}
	}

	#normalizeMime(mimeType: string): string {
		return mimeType.toLowerCase();
	}
}

@es5ClassCompat
export class DocumentDropEdit {
	title?: string;

	id: string | undefined;

	insertText: string | SnippetString;

	additionalEdit?: WorkspaceEdit;

	kind?: DocumentDropOrPasteEditKind;

	constructor(insertText: string | SnippetString, title?: string, kind?: DocumentDropOrPasteEditKind) {
		this.insertText = insertText;
		this.title = title;
		this.kind = kind;
	}
}

export enum DocumentPasteTriggerKind {
	Automatic = 0,
	PasteAs = 1,
}

export class DocumentDropOrPasteEditKind {
	static Empty: DocumentDropOrPasteEditKind;

	private static sep = '.';

	constructor(
		public readonly value: string
	) { }

	public append(...parts: string[]): DocumentDropOrPasteEditKind {
		return new DocumentDropOrPasteEditKind((this.value ? [this.value, ...parts] : parts).join(DocumentDropOrPasteEditKind.sep));
	}

	public intersects(other: DocumentDropOrPasteEditKind): boolean {
		return this.contains(other) || other.contains(this);
	}

	public contains(other: DocumentDropOrPasteEditKind): boolean {
		return this.value === other.value || other.value.startsWith(this.value + DocumentDropOrPasteEditKind.sep);
	}
}
DocumentDropOrPasteEditKind.Empty = new DocumentDropOrPasteEditKind('');

export class DocumentPasteEdit {

	title: string;
	insertText: string | SnippetString;
	additionalEdit?: WorkspaceEdit;
	kind: DocumentDropOrPasteEditKind;

	constructor(insertText: string | SnippetString, title: string, kind: DocumentDropOrPasteEditKind) {
		this.title = title;
		this.insertText = insertText;
		this.kind = kind;
	}
}

@es5ClassCompat
export class ThemeIcon {

	static File: ThemeIcon;
	static Folder: ThemeIcon;

	readonly id: string;
	readonly color?: ThemeColor;

	constructor(id: string, color?: ThemeColor) {
		this.id = id;
		this.color = color;
	}

	static isThemeIcon(thing: any) {
		if (typeof thing.id !== 'string') {
			console.log('INVALID ThemeIcon, invalid id', thing.id);
			return false;
		}
		return true;
	}
}
ThemeIcon.File = new ThemeIcon('file');
ThemeIcon.Folder = new ThemeIcon('folder');


@es5ClassCompat
export class ThemeColor {
	id: string;
	constructor(id: string) {
		this.id = id;
	}
}

export enum ConfigurationTarget {
	Global = 1,

	Workspace = 2,

	WorkspaceFolder = 3
}

@es5ClassCompat
export class RelativePattern implements IRelativePattern {

	pattern: string;

	private _base!: string;
	get base(): string {
		return this._base;
	}
	set base(base: string) {
		this._base = base;
		this._baseUri = URI.file(base);
	}

	private _baseUri!: URI;
	get baseUri(): URI {
		return this._baseUri;
	}
	set baseUri(baseUri: URI) {
		this._baseUri = baseUri;
		this._base = baseUri.fsPath;
	}

	constructor(base: vscode.WorkspaceFolder | URI | string, pattern: string) {
		if (typeof base !== 'string') {
			if (!base || !URI.isUri(base) && !URI.isUri(base.uri)) {
				throw illegalArgument('base');
			}
		}

		if (typeof pattern !== 'string') {
			throw illegalArgument('pattern');
		}

		if (typeof base === 'string') {
			this.baseUri = URI.file(base);
		} else if (URI.isUri(base)) {
			this.baseUri = base;
		} else {
			this.baseUri = base.uri;
		}

		this.pattern = pattern;
	}

	toJSON(): IRelativePatternDto {
		return {
			pattern: this.pattern,
			base: this.base,
			baseUri: this.baseUri.toJSON()
		};
	}
}

const breakpointIds = new WeakMap<Breakpoint, string>();

/**
 * We want to be able to construct Breakpoints internally that have a particular id, but we don't want extensions to be
 * able to do this with the exposed Breakpoint classes in extension API.
 * We also want "instanceof" to work with debug.breakpoints and the exposed breakpoint classes.
 * And private members will be renamed in the built js, so casting to any and setting a private member is not safe.
 * So, we store internal breakpoint IDs in a WeakMap. This function must be called after constructing a Breakpoint
 * with a known id.
 */
export function setBreakpointId(bp: Breakpoint, id: string) {
	breakpointIds.set(bp, id);
}

@es5ClassCompat
export class Breakpoint {

	private _id: string | undefined;

	readonly enabled: boolean;
	readonly condition?: string;
	readonly hitCondition?: string;
	readonly logMessage?: string;
	readonly mode?: string;

	protected constructor(enabled?: boolean, condition?: string, hitCondition?: string, logMessage?: string, mode?: string) {
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
		if (typeof mode === 'string') {
			this.mode = mode;
		}
	}

	get id(): string {
		if (!this._id) {
			this._id = breakpointIds.get(this) ?? generateUuid();
		}
		return this._id;
	}
}

@es5ClassCompat
export class SourceBreakpoint extends Breakpoint {
	readonly location: Location;

	constructor(location: Location, enabled?: boolean, condition?: string, hitCondition?: string, logMessage?: string, mode?: string) {
		super(enabled, condition, hitCondition, logMessage, mode);
		if (location === null) {
			throw illegalArgument('location');
		}
		this.location = location;
	}
}

@es5ClassCompat
export class FunctionBreakpoint extends Breakpoint {
	readonly functionName: string;

	constructor(functionName: string, enabled?: boolean, condition?: string, hitCondition?: string, logMessage?: string, mode?: string) {
		super(enabled, condition, hitCondition, logMessage, mode);
		this.functionName = functionName;
	}
}

@es5ClassCompat
export class DataBreakpoint extends Breakpoint {
	readonly label: string;
	readonly dataId: string;
	readonly canPersist: boolean;

	constructor(label: string, dataId: string, canPersist: boolean, enabled?: boolean, condition?: string, hitCondition?: string, logMessage?: string, mode?: string) {
		super(enabled, condition, hitCondition, logMessage, mode);
		if (!dataId) {
			throw illegalArgument('dataId');
		}
		this.label = label;
		this.dataId = dataId;
		this.canPersist = canPersist;
	}
}

@es5ClassCompat
export class DebugAdapterExecutable implements vscode.DebugAdapterExecutable {
	readonly command: string;
	readonly args: string[];
	readonly options?: vscode.DebugAdapterExecutableOptions;

	constructor(command: string, args: string[], options?: vscode.DebugAdapterExecutableOptions) {
		this.command = command;
		this.args = args || [];
		this.options = options;
	}
}

@es5ClassCompat
export class DebugAdapterServer implements vscode.DebugAdapterServer {
	readonly port: number;
	readonly host?: string;

	constructor(port: number, host?: string) {
		this.port = port;
		this.host = host;
	}
}

@es5ClassCompat
export class DebugAdapterNamedPipeServer implements vscode.DebugAdapterNamedPipeServer {
	constructor(public readonly path: string) {
	}
}

@es5ClassCompat
export class DebugAdapterInlineImplementation implements vscode.DebugAdapterInlineImplementation {
	readonly implementation: vscode.DebugAdapter;

	constructor(impl: vscode.DebugAdapter) {
		this.implementation = impl;
	}
}


export class DebugStackFrame implements vscode.DebugStackFrame {
	constructor(
		public readonly session: vscode.DebugSession,
		readonly threadId: number,
		readonly frameId: number) { }
}

export class DebugThread implements vscode.DebugThread {
	constructor(
		public readonly session: vscode.DebugSession,
		readonly threadId: number) { }
}


@es5ClassCompat
export class EvaluatableExpression implements vscode.EvaluatableExpression {
	readonly range: vscode.Range;
	readonly expression?: string;

	constructor(range: vscode.Range, expression?: string) {
		this.range = range;
		this.expression = expression;
	}
}

export enum InlineCompletionTriggerKind {
	Invoke = 0,
	Automatic = 1,
}

@es5ClassCompat
export class InlineValueText implements vscode.InlineValueText {
	readonly range: Range;
	readonly text: string;

	constructor(range: Range, text: string) {
		this.range = range;
		this.text = text;
	}
}

@es5ClassCompat
export class InlineValueVariableLookup implements vscode.InlineValueVariableLookup {
	readonly range: Range;
	readonly variableName?: string;
	readonly caseSensitiveLookup: boolean;

	constructor(range: Range, variableName?: string, caseSensitiveLookup: boolean = true) {
		this.range = range;
		this.variableName = variableName;
		this.caseSensitiveLookup = caseSensitiveLookup;
	}
}

@es5ClassCompat
export class InlineValueEvaluatableExpression implements vscode.InlineValueEvaluatableExpression {
	readonly range: Range;
	readonly expression?: string;

	constructor(range: Range, expression?: string) {
		this.range = range;
		this.expression = expression;
	}
}

@es5ClassCompat
export class InlineValueContext implements vscode.InlineValueContext {

	readonly frameId: number;
	readonly stoppedLocation: vscode.Range;

	constructor(frameId: number, range: vscode.Range) {
		this.frameId = frameId;
		this.stoppedLocation = range;
	}
}

export enum NewSymbolNameTag {
	AIGenerated = 1
}

export enum NewSymbolNameTriggerKind {
	Invoke = 0,
	Automatic = 1,
}

export class NewSymbolName implements vscode.NewSymbolName {
	readonly newSymbolName: string;
	readonly tags?: readonly vscode.NewSymbolNameTag[] | undefined;

	constructor(
		newSymbolName: string,
		tags?: readonly NewSymbolNameTag[]
	) {
		this.newSymbolName = newSymbolName;
		this.tags = tags;
	}
}

//#region file api

export enum FileChangeType {
	Changed = 1,
	Created = 2,
	Deleted = 3,
}

@es5ClassCompat
export class FileSystemError extends Error {

	static FileExists(messageOrUri?: string | URI): FileSystemError {
		return new FileSystemError(messageOrUri, FileSystemProviderErrorCode.FileExists, FileSystemError.FileExists);
	}
	static FileNotFound(messageOrUri?: string | URI): FileSystemError {
		return new FileSystemError(messageOrUri, FileSystemProviderErrorCode.FileNotFound, FileSystemError.FileNotFound);
	}
	static FileNotADirectory(messageOrUri?: string | URI): FileSystemError {
		return new FileSystemError(messageOrUri, FileSystemProviderErrorCode.FileNotADirectory, FileSystemError.FileNotADirectory);
	}
	static FileIsADirectory(messageOrUri?: string | URI): FileSystemError {
		return new FileSystemError(messageOrUri, FileSystemProviderErrorCode.FileIsADirectory, FileSystemError.FileIsADirectory);
	}
	static NoPermissions(messageOrUri?: string | URI): FileSystemError {
		return new FileSystemError(messageOrUri, FileSystemProviderErrorCode.NoPermissions, FileSystemError.NoPermissions);
	}
	static Unavailable(messageOrUri?: string | URI): FileSystemError {
		return new FileSystemError(messageOrUri, FileSystemProviderErrorCode.Unavailable, FileSystemError.Unavailable);
	}

	readonly code: string;

	constructor(uriOrMessage?: string | URI, code: FileSystemProviderErrorCode = FileSystemProviderErrorCode.Unknown, terminator?: Function) {
		super(URI.isUri(uriOrMessage) ? uriOrMessage.toString(true) : uriOrMessage);

		this.code = terminator?.name ?? 'Unknown';

		// mark the error as file system provider error so that
		// we can extract the error code on the receiving side
		markAsFileSystemProviderError(this, code);

		// workaround when extending builtin objects and when compiling to ES5, see:
		// https://github.com/microsoft/TypeScript-wiki/blob/master/Breaking-Changes.md#extending-built-ins-like-error-array-and-map-may-no-longer-work
		Object.setPrototypeOf(this, FileSystemError.prototype);

		if (typeof Error.captureStackTrace === 'function' && typeof terminator === 'function') {
			// nice stack traces
			Error.captureStackTrace(this, terminator);
		}
	}
}

//#endregion

//#region folding api

@es5ClassCompat
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
	Region = 3
}

//#endregion

//#region Comment
export enum CommentThreadCollapsibleState {
	/**
	 * Determines an item is collapsed
	 */
	Collapsed = 0,
	/**
	 * Determines an item is expanded
	 */
	Expanded = 1
}

export enum CommentMode {
	Editing = 0,
	Preview = 1
}

export enum CommentState {
	Published = 0,
	Draft = 1
}

export enum CommentThreadState {
	Unresolved = 0,
	Resolved = 1
}

export enum CommentThreadApplicability {
	Current = 0,
	Outdated = 1
}

export enum CommentThreadFocus {
	Reply = 1,
	Comment = 2
}

//#endregion

//#region Semantic Coloring

export class SemanticTokensLegend {
	public readonly tokenTypes: string[];
	public readonly tokenModifiers: string[];

	constructor(tokenTypes: string[], tokenModifiers: string[] = []) {
		this.tokenTypes = tokenTypes;
		this.tokenModifiers = tokenModifiers;
	}
}

function isStrArrayOrUndefined(arg: any): arg is string[] | undefined {
	return ((typeof arg === 'undefined') || isStringArray(arg));
}

export class SemanticTokensBuilder {

	private _prevLine: number;
	private _prevChar: number;
	private _dataIsSortedAndDeltaEncoded: boolean;
	private _data: number[];
	private _dataLen: number;
	private _tokenTypeStrToInt: Map<string, number>;
	private _tokenModifierStrToInt: Map<string, number>;
	private _hasLegend: boolean;

	constructor(legend?: vscode.SemanticTokensLegend) {
		this._prevLine = 0;
		this._prevChar = 0;
		this._dataIsSortedAndDeltaEncoded = true;
		this._data = [];
		this._dataLen = 0;
		this._tokenTypeStrToInt = new Map<string, number>();
		this._tokenModifierStrToInt = new Map<string, number>();
		this._hasLegend = false;
		if (legend) {
			this._hasLegend = true;
			for (let i = 0, len = legend.tokenTypes.length; i < len; i++) {
				this._tokenTypeStrToInt.set(legend.tokenTypes[i], i);
			}
			for (let i = 0, len = legend.tokenModifiers.length; i < len; i++) {
				this._tokenModifierStrToInt.set(legend.tokenModifiers[i], i);
			}
		}
	}

	public push(line: number, char: number, length: number, tokenType: number, tokenModifiers?: number): void;
	public push(range: Range, tokenType: string, tokenModifiers?: string[]): void;
	public push(arg0: any, arg1: any, arg2: any, arg3?: any, arg4?: any): void {
		if (typeof arg0 === 'number' && typeof arg1 === 'number' && typeof arg2 === 'number' && typeof arg3 === 'number' && (typeof arg4 === 'number' || typeof arg4 === 'undefined')) {
			if (typeof arg4 === 'undefined') {
				arg4 = 0;
			}
			// 1st overload
			return this._pushEncoded(arg0, arg1, arg2, arg3, arg4);
		}
		if (Range.isRange(arg0) && typeof arg1 === 'string' && isStrArrayOrUndefined(arg2)) {
			// 2nd overload
			return this._push(arg0, arg1, arg2);
		}
		throw illegalArgument();
	}

	private _push(range: vscode.Range, tokenType: string, tokenModifiers?: string[]): void {
		if (!this._hasLegend) {
			throw new Error('Legend must be provided in constructor');
		}
		if (range.start.line !== range.end.line) {
			throw new Error('`range` cannot span multiple lines');
		}
		if (!this._tokenTypeStrToInt.has(tokenType)) {
			throw new Error('`tokenType` is not in the provided legend');
		}
		const line = range.start.line;
		const char = range.start.character;
		const length = range.end.character - range.start.character;
		const nTokenType = this._tokenTypeStrToInt.get(tokenType)!;
		let nTokenModifiers = 0;
		if (tokenModifiers) {
			for (const tokenModifier of tokenModifiers) {
				if (!this._tokenModifierStrToInt.has(tokenModifier)) {
					throw new Error('`tokenModifier` is not in the provided legend');
				}
				const nTokenModifier = this._tokenModifierStrToInt.get(tokenModifier)!;
				nTokenModifiers |= (1 << nTokenModifier) >>> 0;
			}
		}
		this._pushEncoded(line, char, length, nTokenType, nTokenModifiers);
	}

	private _pushEncoded(line: number, char: number, length: number, tokenType: number, tokenModifiers: number): void {
		if (this._dataIsSortedAndDeltaEncoded && (line < this._prevLine || (line === this._prevLine && char < this._prevChar))) {
			// push calls were ordered and are no longer ordered
			this._dataIsSortedAndDeltaEncoded = false;

			// Remove delta encoding from data
			const tokenCount = (this._data.length / 5) | 0;
			let prevLine = 0;
			let prevChar = 0;
			for (let i = 0; i < tokenCount; i++) {
				let line = this._data[5 * i];
				let char = this._data[5 * i + 1];

				if (line === 0) {
					// on the same line as previous token
					line = prevLine;
					char += prevChar;
				} else {
					// on a different line than previous token
					line += prevLine;
				}

				this._data[5 * i] = line;
				this._data[5 * i + 1] = char;

				prevLine = line;
				prevChar = char;
			}
		}

		let pushLine = line;
		let pushChar = char;
		if (this._dataIsSortedAndDeltaEncoded && this._dataLen > 0) {
			pushLine -= this._prevLine;
			if (pushLine === 0) {
				pushChar -= this._prevChar;
			}
		}

		this._data[this._dataLen++] = pushLine;
		this._data[this._dataLen++] = pushChar;
		this._data[this._dataLen++] = length;
		this._data[this._dataLen++] = tokenType;
		this._data[this._dataLen++] = tokenModifiers;

		this._prevLine = line;
		this._prevChar = char;
	}

	private static _sortAndDeltaEncode(data: number[]): Uint32Array {
		const pos: number[] = [];
		const tokenCount = (data.length / 5) | 0;
		for (let i = 0; i < tokenCount; i++) {
			pos[i] = i;
		}
		pos.sort((a, b) => {
			const aLine = data[5 * a];
			const bLine = data[5 * b];
			if (aLine === bLine) {
				const aChar = data[5 * a + 1];
				const bChar = data[5 * b + 1];
				return aChar - bChar;
			}
			return aLine - bLine;
		});
		const result = new Uint32Array(data.length);
		let prevLine = 0;
		let prevChar = 0;
		for (let i = 0; i < tokenCount; i++) {
			const srcOffset = 5 * pos[i];
			const line = data[srcOffset + 0];
			const char = data[srcOffset + 1];
			const length = data[srcOffset + 2];
			const tokenType = data[srcOffset + 3];
			const tokenModifiers = data[srcOffset + 4];

			const pushLine = line - prevLine;
			const pushChar = (pushLine === 0 ? char - prevChar : char);

			const dstOffset = 5 * i;
			result[dstOffset + 0] = pushLine;
			result[dstOffset + 1] = pushChar;
			result[dstOffset + 2] = length;
			result[dstOffset + 3] = tokenType;
			result[dstOffset + 4] = tokenModifiers;

			prevLine = line;
			prevChar = char;
		}

		return result;
	}

	public build(resultId?: string): SemanticTokens {
		if (!this._dataIsSortedAndDeltaEncoded) {
			return new SemanticTokens(SemanticTokensBuilder._sortAndDeltaEncode(this._data), resultId);
		}
		return new SemanticTokens(new Uint32Array(this._data), resultId);
	}
}

export class SemanticTokens {
	readonly resultId: string | undefined;
	readonly data: Uint32Array;

	constructor(data: Uint32Array, resultId?: string) {
		this.resultId = resultId;
		this.data = data;
	}
}

export class SemanticTokensEdit {
	readonly start: number;
	readonly deleteCount: number;
	readonly data: Uint32Array | undefined;

	constructor(start: number, deleteCount: number, data?: Uint32Array) {
		this.start = start;
		this.deleteCount = deleteCount;
		this.data = data;
	}
}

export class SemanticTokensEdits {
	readonly resultId: string | undefined;
	readonly edits: SemanticTokensEdit[];

	constructor(edits: SemanticTokensEdit[], resultId?: string) {
		this.resultId = resultId;
		this.edits = edits;
	}
}

//#endregion

//#region debug
export enum DebugConsoleMode {
	/**
	 * Debug session should have a separate debug console.
	 */
	Separate = 0,

	/**
	 * Debug session should share debug console with its parent session.
	 * This value has no effect for sessions which do not have a parent session.
	 */
	MergeWithParent = 1
}

export class DebugVisualization {
	iconPath?: URI | { light: URI; dark: URI } | ThemeIcon;
	visualization?: vscode.Command | vscode.TreeDataProvider<unknown>;

	constructor(public name: string) { }
}

//#endregion

export enum QuickInputButtonLocation {
	Title = 1,
	Inline = 2
}

@es5ClassCompat
export class QuickInputButtons {

	static readonly Back: vscode.QuickInputButton = { iconPath: new ThemeIcon('arrow-left') };

	private constructor() { }
}

export enum QuickPickItemKind {
	Separator = -1,
	Default = 0,
}

export enum InputBoxValidationSeverity {
	Info = 1,
	Warning = 2,
	Error = 3
}

export enum ExtensionKind {
	UI = 1,
	Workspace = 2
}

export class FileDecoration {

	static validate(d: FileDecoration): boolean {
		if (typeof d.badge === 'string') {
			let len = nextCharLength(d.badge, 0);
			if (len < d.badge.length) {
				len += nextCharLength(d.badge, len);
			}
			if (d.badge.length > len) {
				throw new Error(`The 'badge'-property must be undefined or a short character`);
			}
		} else if (d.badge) {
			if (!ThemeIcon.isThemeIcon(d.badge)) {
				throw new Error(`The 'badge'-property is not a valid ThemeIcon`);
			}
		}
		if (!d.color && !d.badge && !d.tooltip) {
			throw new Error(`The decoration is empty`);
		}
		return true;
	}

	badge?: string | vscode.ThemeIcon;
	tooltip?: string;
	color?: vscode.ThemeColor;
	propagate?: boolean;

	constructor(badge?: string | ThemeIcon, tooltip?: string, color?: ThemeColor) {
		this.badge = badge;
		this.tooltip = tooltip;
		this.color = color;
	}
}

//#region Theming

@es5ClassCompat
export class ColorTheme implements vscode.ColorTheme {
	constructor(public readonly kind: ColorThemeKind) {
	}
}

export enum ColorThemeKind {
	Light = 1,
	Dark = 2,
	HighContrast = 3,
	HighContrastLight = 4
}

//#endregion Theming

//#region Notebook

export class NotebookRange {
	static isNotebookRange(thing: any): thing is vscode.NotebookRange {
		if (thing instanceof NotebookRange) {
			return true;
		}
		if (!thing) {
			return false;
		}
		return typeof (<NotebookRange>thing).start === 'number'
			&& typeof (<NotebookRange>thing).end === 'number';
	}

	private _start: number;
	private _end: number;

	get start() {
		return this._start;
	}

	get end() {
		return this._end;
	}

	get isEmpty(): boolean {
		return this._start === this._end;
	}

	constructor(start: number, end: number) {
		if (start < 0) {
			throw illegalArgument('start must be positive');
		}
		if (end < 0) {
			throw illegalArgument('end must be positive');
		}
		if (start <= end) {
			this._start = start;
			this._end = end;
		} else {
			this._start = end;
			this._end = start;
		}
	}

	with(change: { start?: number; end?: number }): NotebookRange {
		let start = this._start;
		let end = this._end;

		if (change.start !== undefined) {
			start = change.start;
		}
		if (change.end !== undefined) {
			end = change.end;
		}
		if (start === this._start && end === this._end) {
			return this;
		}
		return new NotebookRange(start, end);
	}
}

export class NotebookCellData {

	static validate(data: NotebookCellData): void {
		if (typeof data.kind !== 'number') {
			throw new Error('NotebookCellData MUST have \'kind\' property');
		}
		if (typeof data.value !== 'string') {
			throw new Error('NotebookCellData MUST have \'value\' property');
		}
		if (typeof data.languageId !== 'string') {
			throw new Error('NotebookCellData MUST have \'languageId\' property');
		}
	}

	static isNotebookCellDataArray(value: unknown): value is vscode.NotebookCellData[] {
		return Array.isArray(value) && (<unknown[]>value).every(elem => NotebookCellData.isNotebookCellData(elem));
	}

	static isNotebookCellData(value: unknown): value is vscode.NotebookCellData {
		// return value instanceof NotebookCellData;
		return true;
	}

	kind: NotebookCellKind;
	value: string;
	languageId: string;
	mime?: string;
	outputs?: vscode.NotebookCellOutput[];
	metadata?: Record<string, any>;
	executionSummary?: vscode.NotebookCellExecutionSummary;

	constructor(kind: NotebookCellKind, value: string, languageId: string, mime?: string, outputs?: vscode.NotebookCellOutput[], metadata?: Record<string, any>, executionSummary?: vscode.NotebookCellExecutionSummary) {
		this.kind = kind;
		this.value = value;
		this.languageId = languageId;
		this.mime = mime;
		this.outputs = outputs ?? [];
		this.metadata = metadata;
		this.executionSummary = executionSummary;

		NotebookCellData.validate(this);
	}
}

export class NotebookData {

	cells: NotebookCellData[];
	metadata?: { [key: string]: any };

	constructor(cells: NotebookCellData[]) {
		this.cells = cells;
	}
}


export class NotebookCellOutputItem {

	static isNotebookCellOutputItem(obj: unknown): obj is vscode.NotebookCellOutputItem {
		if (obj instanceof NotebookCellOutputItem) {
			return true;
		}
		if (!obj) {
			return false;
		}
		return typeof (<vscode.NotebookCellOutputItem>obj).mime === 'string'
			&& (<vscode.NotebookCellOutputItem>obj).data instanceof Uint8Array;
	}

	static error(err: Error | { name: string; message?: string; stack?: string }): NotebookCellOutputItem {
		const obj = {
			name: err.name,
			message: err.message,
			stack: err.stack
		};
		return NotebookCellOutputItem.json(obj, 'application/vnd.code.notebook.error');
	}

	static stdout(value: string): NotebookCellOutputItem {
		return NotebookCellOutputItem.text(value, 'application/vnd.code.notebook.stdout');
	}

	static stderr(value: string): NotebookCellOutputItem {
		return NotebookCellOutputItem.text(value, 'application/vnd.code.notebook.stderr');
	}

	static bytes(value: Uint8Array, mime: string = 'application/octet-stream'): NotebookCellOutputItem {
		return new NotebookCellOutputItem(value, mime);
	}

	static #encoder = new TextEncoder();

	static text(value: string, mime: string = Mimes.text): NotebookCellOutputItem {
		const bytes = NotebookCellOutputItem.#encoder.encode(String(value));
		return new NotebookCellOutputItem(bytes, mime);
	}

	static json(value: any, mime: string = 'text/x-json'): NotebookCellOutputItem {
		const rawStr = JSON.stringify(value, undefined, '\t');
		return NotebookCellOutputItem.text(rawStr, mime);
	}

	constructor(
		public data: Uint8Array,
		public mime: string,
	) {
		const mimeNormalized = normalizeMimeType(mime, true);
		if (!mimeNormalized) {
			throw new Error(`INVALID mime type: ${mime}. Must be in the format "type/subtype[;optionalparameter]"`);
		}
		this.mime = mimeNormalized;
	}
}

export class NotebookCellOutput {

	static isNotebookCellOutput(candidate: any): candidate is vscode.NotebookCellOutput {
		if (candidate instanceof NotebookCellOutput) {
			return true;
		}
		if (!candidate || typeof candidate !== 'object') {
			return false;
		}
		return typeof (<NotebookCellOutput>candidate).id === 'string' && Array.isArray((<NotebookCellOutput>candidate).items);
	}

	static ensureUniqueMimeTypes(items: NotebookCellOutputItem[], warn: boolean = false): NotebookCellOutputItem[] {
		const seen = new Set<string>();
		const removeIdx = new Set<number>();
		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			const normalMime = normalizeMimeType(item.mime);
			// We can have multiple text stream mime types in the same output.
			if (!seen.has(normalMime) || isTextStreamMime(normalMime)) {
				seen.add(normalMime);
				continue;
			}
			// duplicated mime types... first has won
			removeIdx.add(i);
			if (warn) {
				console.warn(`DUPLICATED mime type '${item.mime}' will be dropped`);
			}
		}
		if (removeIdx.size === 0) {
			return items;
		}
		return items.filter((_item, index) => !removeIdx.has(index));
	}

	id: string;
	items: NotebookCellOutputItem[];
	metadata?: Record<string, any>;

	constructor(
		items: NotebookCellOutputItem[],
		idOrMetadata?: string | Record<string, any>,
		metadata?: Record<string, any>
	) {
		this.items = NotebookCellOutput.ensureUniqueMimeTypes(items, true);
		if (typeof idOrMetadata === 'string') {
			this.id = idOrMetadata;
			this.metadata = metadata;
		} else {
			this.id = generateUuid();
			this.metadata = idOrMetadata ?? metadata;
		}
	}
}

export enum NotebookCellKind {
	Markup = 1,
	Code = 2
}

export enum NotebookCellExecutionState {
	Idle = 1,
	Pending = 2,
	Executing = 3,
}

export enum NotebookCellStatusBarAlignment {
	Left = 1,
	Right = 2
}

export enum NotebookEditorRevealType {
	Default = 0,
	InCenter = 1,
	InCenterIfOutsideViewport = 2,
	AtTop = 3
}

export class NotebookCellStatusBarItem {
	constructor(
		public text: string,
		public alignment: NotebookCellStatusBarAlignment) { }
}


export enum NotebookControllerAffinity {
	Default = 1,
	Preferred = 2
}

export enum NotebookControllerAffinity2 {
	Default = 1,
	Preferred = 2,
	Hidden = -1
}

export class NotebookRendererScript {

	public provides: readonly string[];

	constructor(
		public uri: vscode.Uri,
		provides: string | readonly string[] = []
	) {
		this.provides = asArray(provides);
	}
}

export class NotebookKernelSourceAction {
	description?: string;
	detail?: string;
	command?: vscode.Command;
	constructor(
		public label: string
	) { }
}

export enum NotebookVariablesRequestKind {
	Named = 1,
	Indexed = 2
}

//#endregion

//#region Timeline

@es5ClassCompat
export class TimelineItem implements vscode.TimelineItem {
	constructor(public label: string, public timestamp: number) { }
}

//#endregion Timeline

//#region ExtensionContext

export enum ExtensionMode {
	/**
	 * The extension is installed normally (for example, from the marketplace
	 * or VSIX) in VS Code.
	 */
	Production = 1,

	/**
	 * The extension is running from an `--extensionDevelopmentPath` provided
	 * when launching VS Code.
	 */
	Development = 2,

	/**
	 * The extension is running from an `--extensionDevelopmentPath` and
	 * the extension host is running unit tests.
	 */
	Test = 3,
}

export enum ExtensionRuntime {
	/**
	 * The extension is running in a NodeJS extension host. Runtime access to NodeJS APIs is available.
	 */
	Node = 1,
	/**
	 * The extension is running in a Webworker extension host. Runtime access is limited to Webworker APIs.
	 */
	Webworker = 2
}

//#endregion ExtensionContext

export enum StandardTokenType {
	Other = 0,
	Comment = 1,
	String = 2,
	RegEx = 3
}


export class LinkedEditingRanges {
	constructor(public readonly ranges: Range[], public readonly wordPattern?: RegExp) {
	}
}

//#region ports
export class PortAttributes {
	private _autoForwardAction: PortAutoForwardAction;

	constructor(autoForwardAction: PortAutoForwardAction) {
		this._autoForwardAction = autoForwardAction;
	}

	get autoForwardAction(): PortAutoForwardAction {
		return this._autoForwardAction;
	}
}
//#endregion ports

//#region Testing
export enum TestResultState {
	Queued = 1,
	Running = 2,
	Passed = 3,
	Failed = 4,
	Skipped = 5,
	Errored = 6
}

export enum TestRunProfileKind {
	Run = 1,
	Debug = 2,
	Coverage = 3,
}

@es5ClassCompat
export class TestRunRequest implements vscode.TestRunRequest {
	constructor(
		public readonly include: vscode.TestItem[] | undefined = undefined,
		public readonly exclude: vscode.TestItem[] | undefined = undefined,
		public readonly profile: vscode.TestRunProfile | undefined = undefined,
		public readonly continuous = false,
		public readonly preserveFocus = true,
	) { }
}

@es5ClassCompat
export class TestMessage implements vscode.TestMessage {
	public expectedOutput?: string;
	public actualOutput?: string;
	public location?: vscode.Location;
	public contextValue?: string;

	/** proposed: */
	public stackTrace?: TestMessageStackFrame[];

	public static diff(message: string | vscode.MarkdownString, expected: string, actual: string) {
		const msg = new TestMessage(message);
		msg.expectedOutput = expected;
		msg.actualOutput = actual;
		return msg;
	}

	constructor(public message: string | vscode.MarkdownString) { }
}

@es5ClassCompat
export class TestTag implements vscode.TestTag {
	constructor(public readonly id: string) { }
}

export class TestMessageStackFrame {
	/**
	 * @param label The name of the stack frame
	 * @param file The file URI of the stack frame
	 * @param position The position of the stack frame within the file
	 */
	constructor(
		public label: string,
		public uri?: vscode.Uri,
		public position?: Position,
	) { }
}

//#endregion

//#region Test Coverage
export class TestCoverageCount implements vscode.TestCoverageCount {
	constructor(public covered: number, public total: number) {
		validateTestCoverageCount(this);
	}
}

export function validateTestCoverageCount(cc?: vscode.TestCoverageCount) {
	if (!cc) {
		return;
	}

	if (cc.covered > cc.total) {
		throw new Error(`The total number of covered items (${cc.covered}) cannot be greater than the total (${cc.total})`);
	}

	if (cc.total < 0) {
		throw new Error(`The number of covered items (${cc.total}) cannot be negative`);
	}
}

export class FileCoverage implements vscode.FileCoverage {
	public static fromDetails(uri: vscode.Uri, details: vscode.FileCoverageDetail[]): vscode.FileCoverage {
		const statements = new TestCoverageCount(0, 0);
		const branches = new TestCoverageCount(0, 0);
		const decl = new TestCoverageCount(0, 0);

		for (const detail of details) {
			if ('branches' in detail) {
				statements.total += 1;
				statements.covered += detail.executed ? 1 : 0;

				for (const branch of detail.branches) {
					branches.total += 1;
					branches.covered += branch.executed ? 1 : 0;
				}
			} else {
				decl.total += 1;
				decl.covered += detail.executed ? 1 : 0;
			}
		}

		const coverage = new FileCoverage(
			uri,
			statements,
			branches.total > 0 ? branches : undefined,
			decl.total > 0 ? decl : undefined,
		);

		coverage.detailedCoverage = details;

		return coverage;
	}

	detailedCoverage?: vscode.FileCoverageDetail[];

	constructor(
		public readonly uri: vscode.Uri,
		public statementCoverage: vscode.TestCoverageCount,
		public branchCoverage?: vscode.TestCoverageCount,
		public declarationCoverage?: vscode.TestCoverageCount,
		public fromTests: vscode.TestItem[] = [],
	) {
	}
}

export class StatementCoverage implements vscode.StatementCoverage {
	// back compat until finalization:
	get executionCount() { return +this.executed; }
	set executionCount(n: number) { this.executed = n; }

	constructor(
		public executed: number | boolean,
		public location: Position | Range,
		public branches: vscode.BranchCoverage[] = [],
	) { }
}

export class BranchCoverage implements vscode.BranchCoverage {
	// back compat until finalization:
	get executionCount() { return +this.executed; }
	set executionCount(n: number) { this.executed = n; }

	constructor(
		public executed: number | boolean,
		public location: Position | Range,
		public label?: string,
	) { }
}

export class DeclarationCoverage implements vscode.DeclarationCoverage {
	// back compat until finalization:
	get executionCount() { return +this.executed; }
	set executionCount(n: number) { this.executed = n; }

	constructor(
		public readonly name: string,
		public executed: number | boolean,
		public location: Position | Range,
	) { }
}
//#endregion

export enum ExternalUriOpenerPriority {
	None = 0,
	Option = 1,
	Default = 2,
	Preferred = 3,
}

export enum WorkspaceTrustState {
	Untrusted = 0,
	Trusted = 1,
	Unspecified = 2
}

export enum PortAutoForwardAction {
	Notify = 1,
	OpenBrowser = 2,
	OpenPreview = 3,
	Silent = 4,
	Ignore = 5,
	OpenBrowserOnce = 6
}

export class TypeHierarchyItem {
	_sessionId?: string;
	_itemId?: string;

	kind: SymbolKind;
	tags?: SymbolTag[];
	name: string;
	detail?: string;
	uri: URI;
	range: Range;
	selectionRange: Range;

	constructor(kind: SymbolKind, name: string, detail: string, uri: URI, range: Range, selectionRange: Range) {
		this.kind = kind;
		this.name = name;
		this.detail = detail;
		this.uri = uri;
		this.range = range;
		this.selectionRange = selectionRange;
	}
}

//#region Tab Inputs

export class TextTabInput {
	constructor(readonly uri: URI) { }
}

export class TextDiffTabInput {
	constructor(readonly original: URI, readonly modified: URI) { }
}

export class TextMergeTabInput {
	constructor(readonly base: URI, readonly input1: URI, readonly input2: URI, readonly result: URI) { }
}

export class CustomEditorTabInput {
	constructor(readonly uri: URI, readonly viewType: string) { }
}

export class WebviewEditorTabInput {
	constructor(readonly viewType: string) { }
}

export class NotebookEditorTabInput {
	constructor(readonly uri: URI, readonly notebookType: string) { }
}

export class NotebookDiffEditorTabInput {
	constructor(readonly original: URI, readonly modified: URI, readonly notebookType: string) { }
}

export class TerminalEditorTabInput {
	constructor() { }
}
export class InteractiveWindowInput {
	constructor(readonly uri: URI, readonly inputBoxUri: URI) { }
}

export class ChatEditorTabInput {
	constructor() { }
}

export class TextMultiDiffTabInput {
	constructor(readonly textDiffs: TextDiffTabInput[]) { }
}
//#endregion

//#region Chat

export enum InteractiveSessionVoteDirection {
	Down = 0,
	Up = 1
}

export enum ChatCopyKind {
	Action = 1,
	Toolbar = 2
}

export enum ChatVariableLevel {
	Short = 1,
	Medium = 2,
	Full = 3
}

export class ChatCompletionItem implements vscode.ChatCompletionItem {
	id: string;
	label: string | CompletionItemLabel;
	fullName?: string | undefined;
	icon?: vscode.ThemeIcon;
	insertText?: string;
	values: vscode.ChatVariableValue[];
	detail?: string;
	documentation?: string | MarkdownString;
	command?: vscode.Command;

	constructor(id: string, label: string | CompletionItemLabel, values: vscode.ChatVariableValue[]) {
		this.id = id;
		this.label = label;
		this.values = values;
	}
}

//#endregion

//#region Interactive Editor

export enum InteractiveEditorResponseFeedbackKind {
	Unhelpful = 0,
	Helpful = 1,
	Undone = 2,
	Accepted = 3,
	Bug = 4
}

export enum ChatResultFeedbackKind {
	Unhelpful = 0,
	Helpful = 1,
}

export class ChatResponseMarkdownPart {
	value: vscode.MarkdownString;
	constructor(value: string | vscode.MarkdownString) {
		if (typeof value !== 'string' && value.isTrusted === true) {
			throw new Error('The boolean form of MarkdownString.isTrusted is NOT supported for chat participants.');
		}

		this.value = typeof value === 'string' ? new MarkdownString(value) : value;
	}
}

/**
 * TODO if 'vulnerabilities' is finalized, this should be merged with the base ChatResponseMarkdownPart. I just don't see how to do that while keeping
 * vulnerabilities in a seperate API proposal in a clean way.
 */
export class ChatResponseMarkdownWithVulnerabilitiesPart {
	value: vscode.MarkdownString;
	vulnerabilities: vscode.ChatVulnerability[];
	constructor(value: string | vscode.MarkdownString, vulnerabilities: vscode.ChatVulnerability[]) {
		if (typeof value !== 'string' && value.isTrusted === true) {
			throw new Error('The boolean form of MarkdownString.isTrusted is NOT supported for chat participants.');
		}

		this.value = typeof value === 'string' ? new MarkdownString(value) : value;
		this.vulnerabilities = vulnerabilities;
	}
}

export class ChatResponseDetectedParticipantPart {
	participant: string;
	// TODO@API validate this against statically-declared slash commands?
	command?: vscode.ChatCommand;
	constructor(participant: string, command?: vscode.ChatCommand) {
		this.participant = participant;
		this.command = command;
	}
}

export class ChatResponseConfirmationPart {
	title: string;
	message: string;
	data: any;
	buttons?: string[];

	constructor(title: string, message: string, data: any, buttons?: string[]) {
		this.title = title;
		this.message = message;
		this.data = data;
		this.buttons = buttons;
	}
}

export class ChatResponseFileTreePart {
	value: vscode.ChatResponseFileTree[];
	baseUri: vscode.Uri;
	constructor(value: vscode.ChatResponseFileTree[], baseUri: vscode.Uri) {
		this.value = value;
		this.baseUri = baseUri;
	}
}

export class ChatResponseAnchorPart {
	value: vscode.Uri | vscode.Location;
	value2: vscode.Uri | vscode.Location | vscode.SymbolInformation;
	title?: string;
	constructor(value: vscode.Uri | vscode.Location | vscode.SymbolInformation, title?: string) {
		this.value = value as any;
		this.value2 = value;
		this.title = title;
	}
}

export class ChatResponseProgressPart {
	value: string;
	constructor(value: string) {
		this.value = value;
	}
}

export class ChatResponseProgressPart2 {
	value: string;
	task?: (progress: vscode.Progress<vscode.ChatResponseWarningPart>) => Thenable<string | void>;
	constructor(value: string, task?: (progress: vscode.Progress<vscode.ChatResponseWarningPart>) => Thenable<string | void>) {
		this.value = value;
		this.task = task;
	}
}

export class ChatResponseWarningPart {
	value: vscode.MarkdownString;
	constructor(value: string | vscode.MarkdownString) {
		if (typeof value !== 'string' && value.isTrusted === true) {
			throw new Error('The boolean form of MarkdownString.isTrusted is NOT supported for chat participants.');
		}

		this.value = typeof value === 'string' ? new MarkdownString(value) : value;
	}
}

export class ChatResponseCommandButtonPart {
	value: vscode.Command;
	constructor(value: vscode.Command) {
		this.value = value;
	}
}

export class ChatResponseReferencePart {
	value: vscode.Uri | vscode.Location | { variableName: string; value?: vscode.Uri | vscode.Location } | string;
	iconPath?: vscode.Uri | vscode.ThemeIcon | { light: vscode.Uri; dark: vscode.Uri };
	options?: { status?: { description: string; kind: vscode.ChatResponseReferencePartStatusKind } };
	constructor(value: vscode.Uri | vscode.Location | { variableName: string; value?: vscode.Uri | vscode.Location } | string, iconPath?: vscode.Uri | vscode.ThemeIcon | { light: vscode.Uri; dark: vscode.Uri }, options?: { status?: { description: string; kind: vscode.ChatResponseReferencePartStatusKind } }) {
		this.value = value;
		this.iconPath = iconPath;
		this.options = options;
	}
}

export class ChatResponseCodeblockUriPart {
	value: vscode.Uri;
	constructor(value: vscode.Uri) {
		this.value = value;
	}
}

export class ChatResponseCodeCitationPart {
	value: vscode.Uri;
	license: string;
	snippet: string;
	constructor(value: vscode.Uri, license: string, snippet: string) {
		this.value = value;
		this.license = license;
		this.snippet = snippet;
	}
}

export class ChatResponseMovePart {
	constructor(
		public readonly uri: vscode.Uri,
		public readonly range: vscode.Range,
	) {
	}
}

export class ChatResponseTextEditPart {
	uri: vscode.Uri;
	edits: vscode.TextEdit[];
	constructor(uri: vscode.Uri, edits: vscode.TextEdit | vscode.TextEdit[]) {
		this.uri = uri;
		this.edits = Array.isArray(edits) ? edits : [edits];
	}
}

export class ChatRequestTurn implements vscode.ChatRequestTurn {
	toolReferences?: vscode.ChatLanguageModelToolReference[];

	constructor(
		readonly prompt: string,
		readonly command: string | undefined,
		readonly references: vscode.ChatPromptReference[],
		readonly participant: string,
	) { }
}

export class ChatResponseTurn implements vscode.ChatResponseTurn {

	constructor(
		readonly response: ReadonlyArray<ChatResponseMarkdownPart | ChatResponseFileTreePart | ChatResponseAnchorPart | ChatResponseCommandButtonPart>,
		readonly result: vscode.ChatResult,
		readonly participant: string,
		readonly command?: string
	) { }
}

export enum ChatLocation {
	Panel = 1,
	Terminal = 2,
	Notebook = 3,
	Editor = 4,
}

export enum ChatResponseReferencePartStatusKind {
	Complete = 1,
	Partial = 2,
	Omitted = 3
}

export class ChatRequestEditorData implements vscode.ChatRequestEditorData {
	constructor(
		readonly document: vscode.TextDocument,
		readonly selection: vscode.Selection,
		readonly wholeRange: vscode.Range,
	) { }
}

export class ChatRequestNotebookData implements vscode.ChatRequestNotebookData {
	constructor(
		readonly cell: vscode.TextDocument
	) { }
}

export enum LanguageModelChatMessageRole {
	User = 1,
	Assistant = 2,
	System = 3
}

export class LanguageModelToolResultPart implements vscode.LanguageModelChatMessageToolResultPart {

	toolCallId: string;
	content: string;
	isError: boolean;

	constructor(toolCallId: string, content: string, isError?: boolean) {
		this.toolCallId = toolCallId;
		this.content = content;
		this.isError = isError ?? false;
	}
}

export class LanguageModelChatMessage implements vscode.LanguageModelChatMessage {

	static User(content: string | LanguageModelToolResultPart, name?: string): LanguageModelChatMessage {
		const value = new LanguageModelChatMessage(LanguageModelChatMessageRole.User, typeof content === 'string' ? content : '', name);
		value.content2 = [content];
		return value;
	}

	static Assistant(content: string, name?: string): LanguageModelChatMessage {
		return new LanguageModelChatMessage(LanguageModelChatMessageRole.Assistant, content, name);
	}

	role: vscode.LanguageModelChatMessageRole;
	content: string;
	content2: (string | vscode.LanguageModelChatMessageToolResultPart | vscode.LanguageModelChatResponseToolCallPart)[];
	name: string | undefined;

	constructor(role: vscode.LanguageModelChatMessageRole, content: string, name?: string) {
		this.role = role;
		this.content = content;
		this.content2 = [content];
		this.name = name;
	}
}

export class LanguageModelToolCallPart implements vscode.LanguageModelChatResponseToolCallPart {
	name: string;
	toolCallId: string;
	parameters: any;

	constructor(name: string, toolCallId: string, parameters: any) {
		this.name = name;
		this.toolCallId = toolCallId;
		this.parameters = parameters;
	}
}

export class LanguageModelTextPart implements vscode.LanguageModelChatResponseTextPart {
	value: string;

	constructor(value: string) {
		this.value = value;

	}
}

/**
 * @deprecated
 */
export class LanguageModelChatSystemMessage {
	content: string;
	constructor(content: string) {
		this.content = content;
	}
}


/**
 * @deprecated
 */
export class LanguageModelChatUserMessage {
	content: string;
	name: string | undefined;

	constructor(content: string, name?: string) {
		this.content = content;
		this.name = name;
	}
}

/**
 * @deprecated
 */
export class LanguageModelChatAssistantMessage {
	content: string;
	name?: string;

	constructor(content: string, name?: string) {
		this.content = content;
		this.name = name;
	}
}

export class LanguageModelError extends Error {

	static NotFound(message?: string): LanguageModelError {
		return new LanguageModelError(message, LanguageModelError.NotFound.name);
	}

	static NoPermissions(message?: string): LanguageModelError {
		return new LanguageModelError(message, LanguageModelError.NoPermissions.name);
	}

	static Blocked(message?: string): LanguageModelError {
		return new LanguageModelError(message, LanguageModelError.Blocked.name);
	}

	readonly code: string;

	constructor(message?: string, code?: string, cause?: Error) {
		super(message, { cause });
		this.name = 'LanguageModelError';
		this.code = code ?? '';
	}

}

//#endregion

//#region ai

export enum RelatedInformationType {
	SymbolInformation = 1,
	CommandInformation = 2,
	SearchInformation = 3,
	SettingInformation = 4
}

//#endregion

//#region Speech

export enum SpeechToTextStatus {
	Started = 1,
	Recognizing = 2,
	Recognized = 3,
	Stopped = 4,
	Error = 5
}

export enum TextToSpeechStatus {
	Started = 1,
	Stopped = 2,
	Error = 3
}

export enum KeywordRecognitionStatus {
	Recognized = 1,
	Stopped = 2
}

//#endregion

//#region InlineEdit

export class InlineEdit implements vscode.InlineEdit {
	constructor(
		public readonly text: string,
		public readonly range: Range,
	) { }
}

export enum InlineEditTriggerKind {
	Invoke = 0,
	Automatic = 1,
}

//#endregion
