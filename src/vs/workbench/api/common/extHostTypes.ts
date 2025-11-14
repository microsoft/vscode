/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable local/code-no-native-private */

import type * as vscode from 'vscode';
import { asArray } from '../../../base/common/arrays.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { illegalArgument, SerializedError } from '../../../base/common/errors.js';
import { IRelativePattern } from '../../../base/common/glob.js';
import { MarshalledId } from '../../../base/common/marshallingIds.js';
import { Mimes } from '../../../base/common/mime.js';
import { nextCharLength } from '../../../base/common/strings.js';
import { isNumber, isObject, isString, isStringArray } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { TextEditorSelectionSource } from '../../../platform/editor/common/editor.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { FileSystemProviderErrorCode, markAsFileSystemProviderError } from '../../../platform/files/common/files.js';
import { RemoteAuthorityResolverErrorCode } from '../../../platform/remote/common/remoteAuthorityResolver.js';
import { IRelativePatternDto } from './extHost.protocol.js';
import { CodeActionKind } from './extHostTypes/codeActionKind.js';
import { Diagnostic } from './extHostTypes/diagnostic.js';
import { es5ClassCompat } from './extHostTypes/es5ClassCompat.js';
import { Location } from './extHostTypes/location.js';
import { MarkdownString } from './extHostTypes/markdownString.js';
import { Position } from './extHostTypes/position.js';
import { Range } from './extHostTypes/range.js';
import { SnippetString } from './extHostTypes/snippetString.js';
import { SymbolKind, SymbolTag } from './extHostTypes/symbolInformation.js';
import { TextEdit } from './extHostTypes/textEdit.js';
import { WorkspaceEdit } from './extHostTypes/workspaceEdit.js';

export { CodeActionKind } from './extHostTypes/codeActionKind.js';
export {
	Diagnostic, DiagnosticRelatedInformation,
	DiagnosticSeverity, DiagnosticTag
} from './extHostTypes/diagnostic.js';
export { Location } from './extHostTypes/location.js';
export { MarkdownString } from './extHostTypes/markdownString.js';
export { NotebookCellData, NotebookCellKind, NotebookCellOutput, NotebookCellOutputItem, NotebookData, NotebookEdit, NotebookRange } from './extHostTypes/notebooks.js';
export { Position } from './extHostTypes/position.js';
export { Range } from './extHostTypes/range.js';
export { Selection } from './extHostTypes/selection.js';
export { SnippetString } from './extHostTypes/snippetString.js';
export { SnippetTextEdit } from './extHostTypes/snippetTextEdit.js';
export { SymbolInformation, SymbolKind, SymbolTag } from './extHostTypes/symbolInformation.js';
export { EndOfLine, TextEdit } from './extHostTypes/textEdit.js';
export { FileEditType, WorkspaceEdit } from './extHostTypes/workspaceEdit.js';

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
	public readonly _detail: unknown;

	constructor(message?: string, code: RemoteAuthorityResolverErrorCode = RemoteAuthorityResolverErrorCode.Unknown, detail?: unknown) {
		super(message);

		this._message = message;
		this._code = code;
		this._detail = detail;

		// workaround when extending builtin objects and when compiling to ES5, see:
		// https://github.com/microsoft/TypeScript-wiki/blob/master/Breaking-Changes.md#extending-built-ins-like-error-array-and-map-may-no-longer-work
		Object.setPrototypeOf(this, RemoteAuthorityResolverError.prototype);
	}
}

export enum EnvironmentVariableMutatorType {
	Replace = 1,
	Append = 2,
	Prepend = 3
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

	commands: (vscode.Command | { command: vscode.Command; icon: vscode.ThemeIcon })[] | undefined = undefined;

	suppressSuggestions: boolean | undefined = undefined;

	constructor(items: vscode.InlineCompletionItem[]) {
		this.items = items;
	}
}

export interface PartialAcceptInfo {
	kind: PartialAcceptTriggerKind;
	acceptedLength: number;
}

export enum PartialAcceptTriggerKind {
	Unknown = 0,
	Word = 1,
	Line = 2,
	Suggest = 3,
}

export enum InlineCompletionEndOfLifeReasonKind {
	Accepted = 0,
	Rejected = 1,
	Ignored = 2,
}

export enum InlineCompletionDisplayLocationKind {
	Code = 1,
	Label = 2
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

export enum TextEditorChangeKind {
	Addition = 1,
	Deletion = 2,
	Modification = 3
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
	export function fromValue(s: TextEditorSelectionSource | string | undefined) {
		switch (s) {
			case 'keyboard': return TextEditorSelectionChangeKind.Keyboard;
			case 'mouse': return TextEditorSelectionChangeKind.Mouse;
			case TextEditorSelectionSource.PROGRAMMATIC:
			case TextEditorSelectionSource.JUMP:
			case TextEditorSelectionSource.NAVIGATION:
				return TextEditorSelectionChangeKind.Command;
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

export enum TerminalShellType {
	Sh = 1,
	Bash = 2,
	Fish = 3,
	Csh = 4,
	Ksh = 5,
	Zsh = 6,
	CommandPrompt = 7,
	GitBash = 8,
	PowerShell = 9,
	Python = 10,
	Julia = 11,
	NuShell = 12,
	Node = 13
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

export enum TerminalCompletionItemKind {
	File = 0,
	Folder = 1,
	Method = 2,
	Alias = 3,
	Argument = 4,
	Option = 5,
	OptionValue = 6,
	Flag = 7,
	SymbolicLinkFile = 8,
	SymbolicLinkFolder = 9,
	ScmCommit = 10,
	ScmBranch = 11,
	ScmTag = 12,
	ScmStash = 13,
	ScmRemote = 14,
	PullRequest = 15,
	PullRequestDone = 16,
}

export class TerminalCompletionItem implements vscode.TerminalCompletionItem {
	label: string | CompletionItemLabel;
	replacementRange: readonly [number, number];
	detail?: string | undefined;
	documentation?: string | vscode.MarkdownString | undefined;
	kind?: TerminalCompletionItemKind | undefined;
	isFile?: boolean | undefined;
	isDirectory?: boolean | undefined;
	isKeyword?: boolean | undefined;

	constructor(label: string | CompletionItemLabel, replacementRange: readonly [number, number], kind?: TerminalCompletionItemKind, detail?: string, documentation?: string | vscode.MarkdownString, isFile?: boolean, isDirectory?: boolean, isKeyword?: boolean) {
		this.label = label;
		this.replacementRange = replacementRange;
		this.kind = kind;
		this.detail = detail;
		this.documentation = documentation;
		this.isFile = isFile;
		this.isDirectory = isDirectory;
		this.isKeyword = isKeyword;
	}
}

/**
 * Represents a collection of {@link CompletionItem completion items} to be presented
 * in the editor.
 */
export class TerminalCompletionList<T extends TerminalCompletionItem = TerminalCompletionItem> {

	/**
	 * Resources should be shown in the completions list
	 */
	resourceOptions?: TerminalCompletionResourceOptions;

	/**
	 * The completion items.
	 */
	items: T[];

	/**
	 * Creates a new completion list.
	 *
	 * @param items The completion items.
	 * @param isIncomplete The list is not complete.
	 */
	constructor(items?: T[], resourceOptions?: TerminalCompletionResourceOptions) {
		this.items = items ?? [];
		this.resourceOptions = resourceOptions;
	}
}

export interface TerminalCompletionResourceOptions {
	showFiles?: boolean;
	showFolders?: boolean;
	fileExtensions?: string[];
	cwd?: vscode.Uri;
}

export enum TaskRevealKind {
	Always = 1,

	Silent = 2,

	Never = 3
}

export enum TaskEventKind {
	/** Indicates a task's properties or configuration have changed */
	Changed = 'changed',

	/** Indicates a task has begun executing */
	ProcessStarted = 'processStarted',

	/** Indicates a task process has completed */
	ProcessEnded = 'processEnded',

	/** Indicates a task was terminated, either by user action or by the system */
	Terminated = 'terminated',

	/** Indicates a task has started running */
	Start = 'start',

	/** Indicates a task has acquired all needed input/variables to execute */
	AcquiredInput = 'acquiredInput',

	/** Indicates a dependent task has started */
	DependsOnStarted = 'dependsOnStarted',

	/** Indicates a task is actively running/processing */
	Active = 'active',

	/** Indicates a task is paused/waiting but not complete */
	Inactive = 'inactive',

	/** Indicates a task has completed fully */
	End = 'end',

	/** Indicates the task's problem matcher has started */
	ProblemMatcherStarted = 'problemMatcherStarted',

	/** Indicates the task's problem matcher has ended without errors */
	ProblemMatcherEnded = 'problemMatcherEnded',

	/** Indicates the task's problem matcher has ended with errors */
	ProblemMatcherFoundErrors = 'problemMatcherFoundErrors'
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
			if (arg1) {
				this._args = arg1;
			}
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

	set args(value: (string | vscode.ShellQuotedString)[] | undefined) {
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
	#items = new Map<string, vscode.DataTransferItem[]>();

	constructor(init?: Iterable<readonly [string, vscode.DataTransferItem]>) {
		for (const [mime, item] of init ?? []) {
			const existing = this.#items.get(this.#normalizeMime(mime));
			if (existing) {
				existing.push(item);
			} else {
				this.#items.set(this.#normalizeMime(mime), [item]);
			}
		}
	}

	get(mimeType: string): vscode.DataTransferItem | undefined {
		return this.#items.get(this.#normalizeMime(mimeType))?.[0];
	}

	set(mimeType: string, value: vscode.DataTransferItem): void {
		// This intentionally overwrites all entries for a given mimetype.
		// This is similar to how the DOM DataTransfer type works
		this.#items.set(this.#normalizeMime(mimeType), [value]);
	}

	forEach(callbackfn: (value: vscode.DataTransferItem, key: string, dataTransfer: DataTransfer) => void, thisArg?: unknown): void {
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
	static Text: DocumentDropOrPasteEditKind;
	static TextUpdateImports: DocumentDropOrPasteEditKind;

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
DocumentDropOrPasteEditKind.Text = new DocumentDropOrPasteEditKind('text');
DocumentDropOrPasteEditKind.TextUpdateImports = DocumentDropOrPasteEditKind.Text.append('updateImports');

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

export enum InlineCompletionsDisposeReasonKind {
	Other = 0,
	Empty = 1,
	TokenCancellation = 2,
	LostRace = 3,
	NotTaken = 4,
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
	Inline = 2,
	Input = 3
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

export class CellErrorStackFrame {
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

export class TestRunProfileBase {
	constructor(
		public readonly controllerId: string,
		public readonly profileId: number,
		public readonly kind: vscode.TestRunProfileKind,
	) { }
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
		public includesTests: vscode.TestItem[] = [],
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

export enum ChatEditingSessionActionOutcome {
	Accepted = 1,
	Rejected = 2,
	Saved = 3
}

export enum ChatRequestEditedFileEventKind {
	Keep = 1,
	Undo = 2,
	UserModification = 3,
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

export class ChatResponseConfirmationPart {
	title: string;
	message: string | vscode.MarkdownString;
	data: any;
	buttons?: string[];

	constructor(title: string, message: string | vscode.MarkdownString, data: any, buttons?: string[]) {
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

export class ChatResponseMultiDiffPart {
	value: vscode.ChatResponseDiffEntry[];
	title: string;
	readOnly?: boolean;
	constructor(value: vscode.ChatResponseDiffEntry[], title: string, readOnly?: boolean) {
		this.value = value;
		this.title = title;
		this.readOnly = readOnly;
	}
}

export class ChatResponseExternalEditPart {
	applied: Thenable<void>;
	didGetApplied!: () => void;

	constructor(
		public uris: vscode.Uri[],
		public callback: () => Thenable<unknown>,
	) {
		this.applied = new Promise<void>((resolve) => {
			this.didGetApplied = resolve;
		});
	}
}

export class ChatResponseAnchorPart implements vscode.ChatResponseAnchorPart {
	value: vscode.Uri | vscode.Location;
	title?: string;

	value2: vscode.Uri | vscode.Location | vscode.SymbolInformation;
	resolve?(token: vscode.CancellationToken): Thenable<void>;

	constructor(value: vscode.Uri | vscode.Location | vscode.SymbolInformation, title?: string) {
		// eslint-disable-next-line local/code-no-any-casts
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

export class ChatResponseThinkingProgressPart {
	value: string | string[];
	id?: string;
	metadata?: { readonly [key: string]: any };
	constructor(value: string | string[], id?: string, metadata?: { readonly [key: string]: any }) {
		this.value = value;
		this.id = id;
		this.metadata = metadata;
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
	options?: { status?: { description: string; kind: vscode.ChatResponseReferencePartStatusKind }; diffMeta?: { added: number; removed: number } };
	constructor(value: vscode.Uri | vscode.Location | { variableName: string; value?: vscode.Uri | vscode.Location } | string, iconPath?: vscode.Uri | vscode.ThemeIcon | { light: vscode.Uri; dark: vscode.Uri }, options?: { status?: { description: string; kind: vscode.ChatResponseReferencePartStatusKind } }) {
		this.value = value;
		this.iconPath = iconPath;
		this.options = options;
	}
}

export class ChatResponseCodeblockUriPart {
	isEdit?: boolean;
	value: vscode.Uri;
	constructor(value: vscode.Uri, isEdit?: boolean) {
		this.value = value;
		this.isEdit = isEdit;
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

export class ChatResponseExtensionsPart {
	constructor(
		public readonly extensions: string[],
	) {
	}
}

export class ChatResponsePullRequestPart {
	constructor(
		public readonly uri: vscode.Uri,
		public readonly title: string,
		public readonly description: string,
		public readonly author: string,
		public readonly linkTag: string
	) {
	}

	toJSON() {
		return {
			$mid: MarshalledId.ChatResponsePullRequestPart,
			uri: this.uri,
			title: this.title,
			description: this.description,
			author: this.author
		};
	}
}

export class ChatResponseTextEditPart implements vscode.ChatResponseTextEditPart {
	uri: vscode.Uri;
	edits: vscode.TextEdit[];
	isDone?: boolean;
	constructor(uri: vscode.Uri, editsOrDone: vscode.TextEdit | vscode.TextEdit[] | true) {
		this.uri = uri;
		if (editsOrDone === true) {
			this.isDone = true;
			this.edits = [];
		} else {
			this.edits = Array.isArray(editsOrDone) ? editsOrDone : [editsOrDone];
		}
	}
}

export class ChatResponseNotebookEditPart implements vscode.ChatResponseNotebookEditPart {
	uri: vscode.Uri;
	edits: vscode.NotebookEdit[];
	isDone?: boolean;
	constructor(uri: vscode.Uri, editsOrDone: vscode.NotebookEdit | vscode.NotebookEdit[] | true) {
		this.uri = uri;
		if (editsOrDone === true) {
			this.isDone = true;
			this.edits = [];
		} else {
			this.edits = Array.isArray(editsOrDone) ? editsOrDone : [editsOrDone];

		}
	}
}

export class ChatPrepareToolInvocationPart {
	toolName: string;
	/**
	 * @param toolName The name of the tool being prepared for invocation.
	 */
	constructor(toolName: string) {
		this.toolName = toolName;
	}
}


export interface ChatTerminalToolInvocationData2 {
	commandLine: {
		original: string;
		userEdited?: string;
		toolEdited?: string;
	};
	language: string;
}

export class ChatToolInvocationPart {
	toolName: string;
	toolCallId: string;
	isError?: boolean;
	invocationMessage?: string | vscode.MarkdownString;
	originMessage?: string | vscode.MarkdownString;
	pastTenseMessage?: string | vscode.MarkdownString;
	isConfirmed?: boolean;
	isComplete?: boolean;
	toolSpecificData?: ChatTerminalToolInvocationData2;
	fromSubAgent?: boolean;

	constructor(toolName: string,
		toolCallId: string,
		isError?: boolean) {
		this.toolName = toolName;
		this.toolCallId = toolCallId;
		this.isError = isError;
	}
}

export class ChatRequestTurn implements vscode.ChatRequestTurn2 {
	constructor(
		readonly prompt: string,
		readonly command: string | undefined,
		readonly references: vscode.ChatPromptReference[],
		readonly participant: string,
		readonly toolReferences: vscode.ChatLanguageModelToolReference[],
		readonly editedFileEvents?: vscode.ChatRequestEditedFileEvent[]
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

export class ChatResponseTurn2 implements vscode.ChatResponseTurn2 {

	constructor(
		readonly response: ReadonlyArray<ChatResponseMarkdownPart | ChatResponseFileTreePart | ChatResponseAnchorPart | ChatResponseCommandButtonPart | ChatResponseExtensionsPart | ChatToolInvocationPart>,
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

export enum ChatSessionStatus {
	Failed = 0,
	Completed = 1,
	InProgress = 2
}

export enum ChatResponseReferencePartStatusKind {
	Complete = 1,
	Partial = 2,
	Omitted = 3
}

export enum ChatResponseClearToPreviousToolInvocationReason {
	NoReason = 0,
	FilteredContentRetry = 1,
	CopyrightContentRetry = 2,
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

export class ChatReferenceBinaryData implements vscode.ChatReferenceBinaryData {
	mimeType: string;
	data: () => Thenable<Uint8Array>;
	reference?: vscode.Uri;
	constructor(mimeType: string, data: () => Thenable<Uint8Array>, reference?: vscode.Uri) {
		this.mimeType = mimeType;
		this.data = data;
		this.reference = reference;
	}
}

export class ChatReferenceDiagnostic implements vscode.ChatReferenceDiagnostic {
	constructor(public readonly diagnostics: [vscode.Uri, vscode.Diagnostic[]][]) { }
}

export enum LanguageModelChatMessageRole {
	User = 1,
	Assistant = 2,
	System = 3
}

export class LanguageModelToolResultPart implements vscode.LanguageModelToolResultPart {

	callId: string;
	content: (LanguageModelTextPart | LanguageModelPromptTsxPart | unknown)[];
	isError: boolean;

	constructor(callId: string, content: (LanguageModelTextPart | LanguageModelPromptTsxPart | unknown)[], isError?: boolean) {
		this.callId = callId;
		this.content = content;
		this.isError = isError ?? false;
	}
}


export enum ChatErrorLevel {
	Info = 0,
	Warning = 1,
	Error = 2
}

export class LanguageModelChatMessage implements vscode.LanguageModelChatMessage {

	static User(content: string | (LanguageModelTextPart | LanguageModelToolResultPart | LanguageModelToolCallPart | LanguageModelDataPart)[], name?: string): LanguageModelChatMessage {
		return new LanguageModelChatMessage(LanguageModelChatMessageRole.User, content, name);
	}

	static Assistant(content: string | (LanguageModelTextPart | LanguageModelToolResultPart | LanguageModelToolCallPart | LanguageModelDataPart)[], name?: string): LanguageModelChatMessage {
		return new LanguageModelChatMessage(LanguageModelChatMessageRole.Assistant, content, name);
	}

	role: vscode.LanguageModelChatMessageRole;

	private _content: (LanguageModelTextPart | LanguageModelToolResultPart | LanguageModelToolCallPart | LanguageModelDataPart)[] = [];

	set content(value: string | (LanguageModelTextPart | LanguageModelToolResultPart | LanguageModelToolCallPart | LanguageModelDataPart)[]) {
		if (typeof value === 'string') {
			// we changed this and still support setting content with a string property. this keep the API runtime stable
			// despite the breaking change in the type definition.
			this._content = [new LanguageModelTextPart(value)];
		} else {
			this._content = value;
		}
	}

	get content(): (LanguageModelTextPart | LanguageModelToolResultPart | LanguageModelToolCallPart | LanguageModelDataPart)[] {
		return this._content;
	}

	name: string | undefined;

	constructor(role: vscode.LanguageModelChatMessageRole, content: string | (LanguageModelTextPart | LanguageModelToolResultPart | LanguageModelToolCallPart | LanguageModelDataPart)[], name?: string) {
		this.role = role;
		this.content = content;
		this.name = name;
	}
}

export class LanguageModelChatMessage2 implements vscode.LanguageModelChatMessage2 {

	static User(content: string | (LanguageModelTextPart | LanguageModelToolResultPart | LanguageModelToolCallPart | LanguageModelDataPart)[], name?: string): LanguageModelChatMessage2 {
		return new LanguageModelChatMessage2(LanguageModelChatMessageRole.User, content, name);
	}

	static Assistant(content: string | (LanguageModelTextPart | LanguageModelToolResultPart | LanguageModelToolCallPart | LanguageModelDataPart)[], name?: string): LanguageModelChatMessage2 {
		return new LanguageModelChatMessage2(LanguageModelChatMessageRole.Assistant, content, name);
	}

	role: vscode.LanguageModelChatMessageRole;

	private _content: (LanguageModelTextPart | LanguageModelToolResultPart | LanguageModelToolCallPart | LanguageModelDataPart | LanguageModelThinkingPart)[] = [];

	set content(value: string | (LanguageModelTextPart | LanguageModelToolResultPart | LanguageModelToolCallPart | LanguageModelDataPart | LanguageModelThinkingPart)[]) {
		if (typeof value === 'string') {
			// we changed this and still support setting content with a string property. this keep the API runtime stable
			// despite the breaking change in the type definition.
			this._content = [new LanguageModelTextPart(value)];
		} else {
			this._content = value;
		}
	}

	get content(): (LanguageModelTextPart | LanguageModelToolResultPart | LanguageModelToolCallPart | LanguageModelDataPart | LanguageModelThinkingPart)[] {
		return this._content;
	}

	// Temp to avoid breaking changes
	set content2(value: (string | LanguageModelToolResultPart | LanguageModelToolCallPart | LanguageModelDataPart)[] | undefined) {
		if (value) {
			this.content = value.map(part => {
				if (typeof part === 'string') {
					return new LanguageModelTextPart(part);
				}
				return part;
			});
		}
	}

	get content2(): (string | LanguageModelToolResultPart | LanguageModelToolCallPart | LanguageModelDataPart | LanguageModelThinkingPart)[] | undefined {
		return this.content.map(part => {
			if (part instanceof LanguageModelTextPart) {
				return part.value;
			}
			return part;
		});
	}

	name: string | undefined;

	constructor(role: vscode.LanguageModelChatMessageRole, content: string | (LanguageModelTextPart | LanguageModelToolResultPart | LanguageModelToolCallPart | LanguageModelDataPart | LanguageModelThinkingPart)[], name?: string) {
		this.role = role;
		this.content = content;
		this.name = name;
	}
}


export class LanguageModelToolCallPart implements vscode.LanguageModelToolCallPart {
	callId: string;
	name: string;
	input: any;

	constructor(callId: string, name: string, input: any) {
		this.callId = callId;
		this.name = name;

		this.input = input;
	}
}

export enum LanguageModelPartAudience {
	Assistant = 0,
	User = 1,
	Extension = 2,
}

export class LanguageModelTextPart implements vscode.LanguageModelTextPart2 {
	value: string;
	audience: vscode.LanguageModelPartAudience[] | undefined;

	constructor(value: string, audience?: vscode.LanguageModelPartAudience[]) {
		this.value = value;
		audience = audience;
	}

	toJSON() {
		return {
			$mid: MarshalledId.LanguageModelTextPart,
			value: this.value,
			audience: this.audience,
		};
	}
}

export class LanguageModelDataPart implements vscode.LanguageModelDataPart2 {
	mimeType: string;
	data: Uint8Array<ArrayBufferLike>;
	audience: vscode.LanguageModelPartAudience[] | undefined;

	constructor(data: Uint8Array<ArrayBufferLike>, mimeType: string, audience?: vscode.LanguageModelPartAudience[]) {
		this.mimeType = mimeType;
		this.data = data;
		this.audience = audience;
	}

	static image(data: Uint8Array<ArrayBufferLike>, mimeType: string): vscode.LanguageModelDataPart {
		return new LanguageModelDataPart(data, mimeType);
	}

	static json(value: object, mime: string = 'text/x-json'): vscode.LanguageModelDataPart {
		const rawStr = JSON.stringify(value, undefined, '\t');
		return new LanguageModelDataPart(VSBuffer.fromString(rawStr).buffer, mime);
	}

	static text(value: string, mime: string = Mimes.text): vscode.LanguageModelDataPart {
		return new LanguageModelDataPart(VSBuffer.fromString(value).buffer, mime);
	}

	toJSON() {
		return {
			$mid: MarshalledId.LanguageModelDataPart,
			mimeType: this.mimeType,
			data: this.data,
			audience: this.audience
		};
	}
}

export enum ChatImageMimeType {
	PNG = 'image/png',
	JPEG = 'image/jpeg',
	GIF = 'image/gif',
	WEBP = 'image/webp',
	BMP = 'image/bmp',
}

export class LanguageModelThinkingPart implements vscode.LanguageModelThinkingPart {
	value: string | string[];
	id?: string;
	metadata?: { readonly [key: string]: any };

	constructor(value: string | string[], id?: string, metadata?: { readonly [key: string]: any }) {
		this.value = value;
		this.id = id;
		this.metadata = metadata;
	}

	toJSON() {
		return {
			$mid: MarshalledId.LanguageModelThinkingPart,
			value: this.value,
			id: this.id,
			metadata: this.metadata,
		};
	}
}



export class LanguageModelPromptTsxPart {
	value: unknown;

	constructor(value: unknown) {
		this.value = value;
	}

	toJSON() {
		return {
			$mid: MarshalledId.LanguageModelPromptTsxPart,
			value: this.value,
		};
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

	static readonly #name = 'LanguageModelError';

	static NotFound(message?: string): LanguageModelError {
		return new LanguageModelError(message, LanguageModelError.NotFound.name);
	}

	static NoPermissions(message?: string): LanguageModelError {
		return new LanguageModelError(message, LanguageModelError.NoPermissions.name);
	}

	static Blocked(message?: string): LanguageModelError {
		return new LanguageModelError(message, LanguageModelError.Blocked.name);
	}

	static tryDeserialize(data: SerializedError): LanguageModelError | undefined {
		if (data.name !== LanguageModelError.#name) {
			return undefined;
		}
		return new LanguageModelError(data.message, data.code, data.cause);
	}

	readonly code: string;

	constructor(message?: string, code?: string, cause?: Error) {
		super(message, { cause });
		this.name = LanguageModelError.#name;
		this.code = code ?? '';
	}

}

export class LanguageModelToolResult {
	constructor(public content: (LanguageModelTextPart | LanguageModelPromptTsxPart | LanguageModelDataPart)[]) { }

	toJSON() {
		return {
			$mid: MarshalledId.LanguageModelToolResult,
			content: this.content,
		};
	}
}

export class LanguageModelToolResult2 {
	constructor(public content: (LanguageModelTextPart | LanguageModelPromptTsxPart | LanguageModelDataPart)[]) { }

	toJSON() {
		return {
			$mid: MarshalledId.LanguageModelToolResult,
			content: this.content,
		};
	}
}

export class ExtendedLanguageModelToolResult extends LanguageModelToolResult {
	toolResultMessage?: string | MarkdownString;
	toolResultDetails?: Array<URI | Location>;
	toolMetadata?: unknown;
}

export enum LanguageModelChatToolMode {
	Auto = 1,
	Required = 2
}

export class LanguageModelToolExtensionSource implements vscode.LanguageModelToolExtensionSource {
	constructor(public readonly id: string, public readonly label: string) { }
}

export class LanguageModelToolMCPSource implements vscode.LanguageModelToolMCPSource {
	constructor(public readonly label: string, public readonly name: string, public readonly instructions: string | undefined) { }
}

//#endregion

//#region ai

export enum RelatedInformationType {
	SymbolInformation = 1,
	CommandInformation = 2,
	SearchInformation = 3,
	SettingInformation = 4
}

export enum SettingsSearchResultKind {
	EMBEDDED = 1,
	LLM_RANKED = 2,
	CANCELED = 3,
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

//#region MCP
export enum McpToolAvailability {
	Initial = 0,
	Dynamic = 1,
}

export class McpStdioServerDefinition implements vscode.McpStdioServerDefinition {
	cwd?: URI;

	constructor(
		public label: string,
		public command: string,
		public args: string[],
		public env: Record<string, string | number | null> = {},
		public version?: string,
		public metadata?: vscode.McpServerMetadata,
	) { }
}

export class McpHttpServerDefinition implements vscode.McpHttpServerDefinition {
	constructor(
		public label: string,
		public uri: URI,
		public headers: Record<string, string> = {},
		public version?: string,
		public metadata?: vscode.McpServerMetadata,
	) { }
}
//#endregion
