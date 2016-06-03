/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IHTMLContentElement} from 'vs/base/common/htmlContent';
import {IDisposable} from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {IFilter} from 'vs/base/common/filters';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {ModeTransition} from 'vs/editor/common/core/modeTransition';
import LanguageFeatureRegistry from 'vs/editor/common/modes/languageFeatureRegistry';
import {CancellationToken} from 'vs/base/common/cancellation';
import {Position} from 'vs/editor/common/core/position';
import {Range} from 'vs/editor/common/core/range';

/**
 * @internal
 */
export interface ITokenizationResult {
	type?:string;
	dontMergeWithPrev?:boolean;
	nextState?:IState;
}

/**
 * @internal
 */
export interface IState {
	clone():IState;
	equals(other:IState):boolean;
	getMode():IMode;
	tokenize(stream:IStream):ITokenizationResult;
	getStateData(): IState;
	setStateData(state:IState):void;
}

/**
 * An IStream is a character & token stream abstraction over a line of text. It
 *  is never multi-line. The stream can be navigated character by character, or
 *  token by token, given some token rules.
 * @internal
 */
export interface IStream {

	/**
	 * Returns the current character position of the stream on the line.
	 */
	pos():number;

	/**
	 * Returns true iff the stream is at the end of the line.
	 */
	eos():boolean;

	/**
	 * Returns the next character in the stream.
	 */
	peek():string;

	/**
	 * Returns the next character in the stream, and advances it by one character.
	 */
	next(): string;
	next2(): void;

	/**
	 * Advances the stream by `n` characters.
	 */
	advance(n:number):string;

	/**
	 * Advances the stream until the end of the line.
	 */
	advanceToEOS():string;

	/**
	 * Brings the stream back `n` characters.
	 */
	goBack(n:number):void;

	/**
	 *  Advances the stream if the next characters validate a condition. A condition can be
	 *
	 *      - a regular expression (always starting with ^)
	 * 			EXAMPLES: /^\d+/, /^function|var|interface|class/
	 *
	 *  	- a string
	 * 			EXAMPLES: "1954", "albert"
	 */
	advanceIfCharCode(charCode: number): string;
	advanceIfCharCode2(charCode:number): number;

	advanceIfString(condition: string): string;
	advanceIfString2(condition: string): number;

	advanceIfStringCaseInsensitive(condition: string): string;
	advanceIfStringCaseInsensitive2(condition: string): number;

	advanceIfRegExp(condition: RegExp): string;
	advanceIfRegExp2(condition:RegExp): number;


	/**
	 * Advances the stream while the next characters validate a condition. Check #advanceIf for
	 * details on the possible types for condition.
	 */
	advanceWhile(condition:string):string;
	advanceWhile(condition:RegExp):string;

	/**
	 * Advances the stream until the some characters validate a condition. Check #advanceIf for
	 * details on the possible types for condition. The `including` boolean value indicates
	 * whether the stream will advance the characters that matched the condition as well, or not.
	 */
	advanceUntil(condition: string, including: boolean): string;
	advanceUntil(condition: RegExp, including: boolean): string;

	advanceUntilString(condition: string, including: boolean): string;
	advanceUntilString2(condition: string, including: boolean): number;

	/**
	 * The token rules define how consecutive characters should be put together as a token,
	 * or separated into two different tokens. They are given through a separator characters
	 * string and a whitespace characters string. A separator is always one token. Consecutive
	 * whitespace is always one token. Everything in between these two token types, is also a token.
	 *
	 * 	EXAMPLE: stream.setTokenRules("+-", " ");
	 * 	Setting these token rules defines the tokens for the string "123+456 -    7" as being
	 * 		["123", "+", "456", " ", "-", "    ", "7"]
	 */
	setTokenRules(separators:string, whitespace:string):void;

	/**
	 * Returns the next token, given that the stream was configured with token rules.
	 */
	peekToken():string;

	/**
	 * Returns the next token, given that the stream was configured with token rules, and advances the
	 * stream by the exact length of the found token.
	 */
	nextToken():string;

	/**
	 * Returns the next whitespace, if found. Returns an empty string otherwise.
	 */
	peekWhitespace():string;

	/**
	 * Returns the next whitespace, if found, and advances the stream by the exact length of the found
	 * whitespace. Returns an empty string otherwise.
	 */
	skipWhitespace(): string;
	skipWhitespace2(): number;
}

/**
 * @internal
 */
export interface IModeDescriptor {
	id:string;
}

/**
 * @internal
 */
export interface ILineContext {
	getLineContent(): string;

	modeTransitions: ModeTransition[];

	getTokenCount(): number;
	getTokenStartIndex(tokenIndex:number): number;
	getTokenType(tokenIndex:number): string;
	getTokenText(tokenIndex:number): string;
	getTokenEndIndex(tokenIndex:number): number;
	findIndexOfOffset(offset:number): number;
}

/**
 * @internal
 */
export enum MutableSupport {
	RichEditSupport = 1,
	TokenizationSupport = 2
}

/**
 * @internal
 */
export function mutableSupportToString(registerableSupport:MutableSupport) {
	if (registerableSupport === MutableSupport.RichEditSupport) {
		return 'richEditSupport';
	}
	if (registerableSupport === MutableSupport.TokenizationSupport) {
		return 'tokenizationSupport';
	}
	throw new Error('Illegal argument!');
}


export interface IMode {

	getId(): string;

	/**
	 * Return a mode "similar" to this one that strips any "smart" supports.
	 * @internal
	 */
	toSimplifiedMode(): IMode;

	/**
	 * @internal
	 */
	addSupportChangedListener?(callback: (e: editorCommon.IModeSupportChangedEvent) => void): IDisposable;

	/**
	 * Register a support by name. Only optional.
	 * @internal
	 */
	registerSupport?<T>(support:MutableSupport, callback:(mode:IMode)=>T): IDisposable;

	/**
	 * Optional adapter to support tokenization.
	 * @internal
	 */
	tokenizationSupport?: ITokenizationSupport;

	/**
	 * Optional adapter to support inplace-replace.
	 * @internal
	 */
	inplaceReplaceSupport?:IInplaceReplaceSupport;

	/**
	 * Optional adapter to support output for a model (e.g. markdown -> html)
	 * @internal
	 */
	emitOutputSupport?:IEmitOutputSupport;

	/**
	 * Optional adapter to support configuring this mode.
	 * @internal
	 */
	configSupport?:IConfigurationSupport;

	/**
	 * Optional adapter to support rich editing.
	 * @internal
	 */
	richEditSupport?: IRichEditSupport;
}

/**
 * Interface used for tokenization
 * @internal
 */
export interface IToken {
	startIndex:number;
	type:string;
}

/**
 * @internal
 */
export interface IModeTransition {
	startIndex: number;
	mode: IMode;
}

/**
 * @internal
 */
export interface ILineTokens {
	tokens: IToken[];
	actualStopOffset: number;
	endState: IState;
	modeTransitions: IModeTransition[];
	retokenize?:TPromise<void>;
}

/**
 * @internal
 */
export interface ITokenizationSupport {

	shouldGenerateEmbeddedModels: boolean;

	getInitialState():IState;

	// add offsetDelta to each of the returned indices
	// stop tokenizing at absolute value stopAtOffset (i.e. stream.pos() + offsetDelta > stopAtOffset)
	tokenize(line:string, state:IState, offsetDelta?:number, stopAtOffset?:number):ILineTokens;
}

export interface IToken2 {
	startIndex: number;
	scopes: string|string[];
}
export interface ILineTokens2 {
	tokens: IToken2[];
	endState: IState2;
	retokenize?: TPromise<void>;
}
export interface IState2 {
	clone():IState2;
	equals(other:IState2):boolean;
}
export interface TokensProvider {
	getInitialState(): IState2;
	tokenize(line:string, state:IState2): ILineTokens2;
}

/**
 * A hover represents additional information for a symbol or word. Hovers are
 * rendered in a tooltip-like widget.
 */
export interface Hover {
	/**
	 * The contents of this hover.
	 */
	htmlContent: IHTMLContentElement[];

	/**
	 * The range to which this hover applies. When missing, the
	 * editor will use the range at the current position or the
	 * current position itself.
	 */
	range: editorCommon.IRange;
}

export interface HoverProvider {
	provideHover(model:editorCommon.IReadOnlyModel, position:Position, token:CancellationToken): Hover | Thenable<Hover>;
}

/**
 * @internal
 */
export type SuggestionType = 'method'
	| 'function'
	| 'constructor'
	| 'field'
	| 'variable'
	| 'class'
	| 'interface'
	| 'module'
	| 'property'
	| 'unit'
	| 'value'
	| 'enum'
	| 'keyword'
	| 'snippet'
	| 'text'
	| 'color'
	| 'file'
	| 'reference'
	| 'customcolor';

/**
 * @internal
 */
export interface ISuggestion {
	label: string;
	codeSnippet: string;
	type: SuggestionType;
	typeLabel?: string;
	documentationLabel?: string;
	filterText?: string;
	sortText?: string;
	noAutoAccept?: boolean;
	overwriteBefore?: number;
	overwriteAfter?: number;
}

/**
 * @internal
 */
export interface ISuggestResult {
	currentWord: string;
	suggestions:ISuggestion[];
	incomplete?: boolean;
}

/**
 * @internal
 */
export interface ISuggestSupport {

	triggerCharacters: string[];

	shouldAutotriggerSuggest: boolean;

	filter?: IFilter;

	provideCompletionItems(model:editorCommon.IReadOnlyModel, position:Position, token:CancellationToken): ISuggestResult[] | Thenable<ISuggestResult[]>;

	resolveCompletionItem?(model:editorCommon.IReadOnlyModel, position:Position, item: ISuggestion, token: CancellationToken): ISuggestion | Thenable<ISuggestion>;
}

/**
 * Interface used to quick fix typing errors while accesing member fields.
 */
export interface IQuickFix {
	command: ICommand;
	score: number;
}
export interface CodeActionProvider {
	provideCodeActions(model:editorCommon.IReadOnlyModel, range:Range, token: CancellationToken): IQuickFix[] | Thenable<IQuickFix[]>;
}


export interface ParameterInformation {
	label: string;
	documentation: string;
}
export interface SignatureInformation {
	label: string;
	documentation: string;
	parameters: ParameterInformation[];
}
export interface SignatureHelp {
	signatures: SignatureInformation[];
	activeSignature: number;
	activeParameter: number;
}
export interface SignatureHelpProvider {

	signatureHelpTriggerCharacters: string[];

	provideSignatureHelp(model: editorCommon.IReadOnlyModel, position: Position, token: CancellationToken): SignatureHelp | Thenable<SignatureHelp>;
}


export enum DocumentHighlightKind {
	Text,
	Read,
	Write
}
export interface DocumentHighlight {
	range: editorCommon.IRange;
	kind: DocumentHighlightKind;
}
export interface DocumentHighlightProvider {
	provideDocumentHighlights(model: editorCommon.IReadOnlyModel, position: Position, token: CancellationToken): DocumentHighlight[] | Thenable<DocumentHighlight[]>;
}


export interface ReferenceContext {
	includeDeclaration: boolean;
}
export interface ReferenceProvider {
	provideReferences(model:editorCommon.IReadOnlyModel, position:Position, context: ReferenceContext, token: CancellationToken): Location[] | Thenable<Location[]>;
}


export interface Location {
	uri: URI;
	range: editorCommon.IRange;
}
export type Definition = Location | Location[];
export interface DefinitionProvider {
	provideDefinition(model:editorCommon.IReadOnlyModel, position:Position, token:CancellationToken): Definition | Thenable<Definition>;
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
/**
 * @internal
 */
export namespace SymbolKind {

	/**
	 * @internal
	 */
	export function from(kind: number | SymbolKind): string {
		switch (kind) {
			case SymbolKind.Method:
				return 'method';
			case SymbolKind.Function:
				return 'function';
			case SymbolKind.Constructor:
				return 'constructor';
			case SymbolKind.Variable:
				return 'variable';
			case SymbolKind.Class:
				return 'class';
			case SymbolKind.Interface:
				return 'interface';
			case SymbolKind.Namespace:
				return 'namespace';
			case SymbolKind.Package:
				return 'package';
			case SymbolKind.Module:
				return 'module';
			case SymbolKind.Property:
				return 'property';
			case SymbolKind.Enum:
				return 'enum';
			case SymbolKind.String:
				return 'string';
			case SymbolKind.File:
				return 'file';
			case SymbolKind.Array:
				return 'array';
			case SymbolKind.Number:
				return 'number';
			case SymbolKind.Boolean:
				return 'boolean';
			case SymbolKind.Object:
				return 'object';
			case SymbolKind.Key:
				return 'key';
			case SymbolKind.Null:
				return 'null';
		}
		return 'property';
	}

	/**
	 * @internal
	 */
	export function to(type: string): SymbolKind {
		switch (type) {
			case 'method':
				return SymbolKind.Method;
			case 'function':
				return SymbolKind.Function;
			case 'constructor':
				return SymbolKind.Constructor;
			case 'variable':
				return SymbolKind.Variable;
			case 'class':
				return SymbolKind.Class;
			case 'interface':
				return SymbolKind.Interface;
			case 'namespace':
				return SymbolKind.Namespace;
			case 'package':
				return SymbolKind.Package;
			case 'module':
				return SymbolKind.Module;
			case 'property':
				return SymbolKind.Property;
			case 'enum':
				return SymbolKind.Enum;
			case 'string':
				return SymbolKind.String;
			case 'file':
				return SymbolKind.File;
			case 'array':
				return SymbolKind.Array;
			case 'number':
				return SymbolKind.Number;
			case 'boolean':
				return SymbolKind.Boolean;
			case 'object':
				return SymbolKind.Object;
			case 'key':
				return SymbolKind.Key;
			case 'null':
				return SymbolKind.Null;
		}
		return SymbolKind.Property;
	}
}
export interface SymbolInformation {
	name: string;
	containerName?: string;
	kind: SymbolKind;
	location: Location;
}
export interface DocumentSymbolProvider {
	provideDocumentSymbols(model:editorCommon.IReadOnlyModel, token: CancellationToken): SymbolInformation[] | Thenable<SymbolInformation[]>;
}

/**
 * Interface used to format a model
 */
export interface IFormattingOptions {
	tabSize:number;
	insertSpaces:boolean;
}
export interface DocumentFormattingEditProvider {
	provideDocumentFormattingEdits(model: editorCommon.IReadOnlyModel, options: IFormattingOptions, token: CancellationToken): editorCommon.ISingleEditOperation[] | Thenable<editorCommon.ISingleEditOperation[]>;
}
export interface DocumentRangeFormattingEditProvider {
	provideDocumentRangeFormattingEdits(model: editorCommon.IReadOnlyModel, range: Range, options: IFormattingOptions, token: CancellationToken): editorCommon.ISingleEditOperation[] | Thenable<editorCommon.ISingleEditOperation[]>;
}
export interface OnTypeFormattingEditProvider {
	autoFormatTriggerCharacters: string[];
	provideOnTypeFormattingEdits(model: editorCommon.IReadOnlyModel, position: Position, ch: string, options: IFormattingOptions, token: CancellationToken): editorCommon.ISingleEditOperation[] | Thenable<editorCommon.ISingleEditOperation[]>;
}

/**
 * @internal
 */
export interface IInplaceReplaceSupportResult {
	value: string;
	range:editorCommon.IRange;
}

/**
 * Interface used to navigate with a value-set.
 * @internal
 */
export interface IInplaceReplaceSupport {
	navigateValueSet(resource:URI, range:editorCommon.IRange, up:boolean):TPromise<IInplaceReplaceSupportResult>;
}

/**
 * Interface used to get output for a language that supports transformation (e.g. markdown -> html)
 * @internal
 */
export interface IEmitOutputSupport {
	getEmitOutput(resource:URI):TPromise<IEmitOutput>;
}
/**
 * @internal
 */
export interface IEmitOutput {
	filename?:string;
	content:string;
}


export interface ILink {
	range: editorCommon.IRange;
	url: string;
}
export interface LinkProvider {
	provideLinks(model: editorCommon.IReadOnlyModel, token: CancellationToken): ILink[] | Thenable<ILink[]>;
}


/**
 * Interface used to define a configurable editor mode.
 * @internal
 */
export interface IConfigurationSupport {
	configure(options:any):TPromise<void>;
}


export interface IResourceEdit {
	resource: URI;
	range: editorCommon.IRange;
	newText: string;
}
export interface WorkspaceEdit {
	edits: IResourceEdit[];
	rejectReason?: string;
}
export interface RenameProvider {
	provideRenameEdits(model:editorCommon.IReadOnlyModel, position:Position, newName: string, token: CancellationToken): WorkspaceEdit | Thenable<WorkspaceEdit>;
}


export interface ICommand {
	id: string;
	title: string;
	arguments?: any[];
}
export interface ICodeLensSymbol {
	range: editorCommon.IRange;
	id?: string;
	command?: ICommand;
}
export interface CodeLensProvider {
	provideCodeLenses(model:editorCommon.IReadOnlyModel, token: CancellationToken): ICodeLensSymbol[] | Thenable<ICodeLensSymbol[]>;
	resolveCodeLens?(model:editorCommon.IReadOnlyModel, codeLens: ICodeLensSymbol, token: CancellationToken): ICodeLensSymbol | Thenable<ICodeLensSymbol>;
}

export type CharacterPair = [string, string];

export interface IAutoClosingPairConditional extends IAutoClosingPair {
	notIn?: string[];
}

/**
 * Interface used to support electric characters
 * @internal
 */
export interface IElectricAction {
	// Only one of the following properties should be defined:

	// The line will be indented at the same level of the line
	// which contains the matching given bracket type.
	matchOpenBracket?:string;

	// The text will be appended after the electric character.
	appendText?:string;

	// The number of characters to advance the cursor, useful with appendText
	advanceCount?:number;
}

export enum IndentAction {
	None,
	Indent,
	IndentOutdent,
	Outdent
}

/**
 * An action the editor executes when 'enter' is being pressed
 */
export interface IEnterAction {
	indentAction:IndentAction;
	appendText?:string;
	removeText?:number;
}

/**
 * @internal
 */
export interface IRichEditElectricCharacter {
	getElectricCharacters():string[];
	// Should return opening bracket type to match indentation with
	onElectricCharacter(context:ILineContext, offset:number):IElectricAction;
}

/**
 * @internal
 */
export interface IRichEditOnEnter {
	onEnter(model:editorCommon.ITokenizedModel, position: editorCommon.IPosition): IEnterAction;
}

/**
 * Interface used to support insertion of mode specific comments.
 * @internal
 */
export interface ICommentsConfiguration {
	lineCommentToken?:string;
	blockCommentStartToken?:string;
	blockCommentEndToken?:string;
}

export interface IAutoClosingPair {
	open:string;
	close:string;
}

/**
 * @internal
 */
export interface IRichEditCharacterPair {
	getAutoClosingPairs():IAutoClosingPairConditional[];
	shouldAutoClosePair(character:string, context:ILineContext, offset:number):boolean;
	getSurroundingPairs():IAutoClosingPair[];
}

/**
 * @internal
 */
export interface IRichEditBrackets {
	maxBracketLength: number;
	forwardRegex: RegExp;
	reversedRegex: RegExp;
	brackets: editorCommon.IRichEditBracket[];
	textIsBracket: {[text:string]:editorCommon.IRichEditBracket;};
	textIsOpenBracket: {[text:string]:boolean;};
}

/**
 * @internal
 */
export interface IRichEditSupport {
	/**
	 * Optional adapter for electric characters.
	 */
	electricCharacter?:IRichEditElectricCharacter;

	/**
	 * Optional adapter for comment insertion.
	 */
	comments?:ICommentsConfiguration;

	/**
	 * Optional adapter for insertion of character pair.
	 */
	characterPair?:IRichEditCharacterPair;

	/**
	 * Optional adapter for classification of tokens.
	 */
	wordDefinition?: RegExp;

	/**
	 * Optional adapter for custom Enter handling.
	 */
	onEnter?: IRichEditOnEnter;

	/**
	 * Optional adapter for brackets.
	 */
	brackets?: IRichEditBrackets;
}

// --- feature registries ------

/**
 * @internal
 */
export const ReferenceProviderRegistry = new LanguageFeatureRegistry<ReferenceProvider>();

/**
 * @internal
 */
export const RenameProviderRegistry = new LanguageFeatureRegistry<RenameProvider>();

/**
 * @internal
 */
export const SuggestRegistry = new LanguageFeatureRegistry<ISuggestSupport>();

/**
 * @internal
 */
export const SignatureHelpProviderRegistry = new LanguageFeatureRegistry<SignatureHelpProvider>();

/**
 * @internal
 */
export const HoverProviderRegistry = new LanguageFeatureRegistry<HoverProvider>();

/**
 * @internal
 */
export const DocumentSymbolProviderRegistry = new LanguageFeatureRegistry<DocumentSymbolProvider>();

/**
 * @internal
 */
export const DocumentHighlightProviderRegistry = new LanguageFeatureRegistry<DocumentHighlightProvider>();

/**
 * @internal
 */
export const DefinitionProviderRegistry = new LanguageFeatureRegistry<DefinitionProvider>();

/**
 * @internal
 */
export const CodeLensProviderRegistry = new LanguageFeatureRegistry<CodeLensProvider>();

/**
 * @internal
 */
export const CodeActionProviderRegistry = new LanguageFeatureRegistry<CodeActionProvider>();

/**
 * @internal
 */
export const DocumentFormattingEditProviderRegistry = new LanguageFeatureRegistry<DocumentFormattingEditProvider>();

/**
 * @internal
 */
export const DocumentRangeFormattingEditProviderRegistry = new LanguageFeatureRegistry<DocumentRangeFormattingEditProvider>();

/**
 * @internal
 */
export const OnTypeFormattingEditProviderRegistry = new LanguageFeatureRegistry<OnTypeFormattingEditProvider>();

/**
 * @internal
 */
export const LinkProviderRegistry = new LanguageFeatureRegistry<LinkProvider>();
