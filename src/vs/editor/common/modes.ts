/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {MarkedString} from 'vs/base/common/htmlContent';
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
 * A mode. Will soon be obsolete.
 */
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
	setTokenizationSupport?<T>(callback:(mode:IMode)=>T): IDisposable;

	/**
	 * Optional adapter to support tokenization.
	 * @internal
	 */
	tokenizationSupport?: ITokenizationSupport;
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

	getInitialState():IState;

	// add offsetDelta to each of the returned indices
	// stop tokenizing at absolute value stopAtOffset (i.e. stream.pos() + offsetDelta > stopAtOffset)
	tokenize(line:string, state:IState, offsetDelta?:number, stopAtOffset?:number):ILineTokens;
}

/**
 * A token. Only supports a single scope, but will soon support a scope array.
 */
export interface IToken2 {
	startIndex: number;
	scopes: string|string[];
}
/**
 * The result of a line tokenization.
 */
export interface ILineTokens2 {
	/**
	 * The list of tokens on the line.
	 */
	tokens: IToken2[];
	/**
	 * The tokenization end state.
	 * A pointer will be held to this and the object should not be modified by the tokenizer after the pointer is returned.
	 */
	endState: IState2;
	/**
	 * An optional promise to force the model to retokenize this line (e.g. missing information at the point of tokenization)
	 */
	retokenize?: TPromise<void>;
}
/**
 * The state of the tokenizer between two lines.
 * It is useful to store flags such as in multiline comment, etc.
 * The model will clone the previous line's state and pass it in to tokenize the next line.
 */
export interface IState2 {
	clone():IState2;
	equals(other:IState2):boolean;
}
/**
 * A "manual" provider of tokens.
 */
export interface TokensProvider {
	/**
	 * The initial state of a language. Will be the state passed in to tokenize the first line.
	 */
	getInitialState(): IState2;
	/**
	 * Tokenize a line given the state at the beginning of the line.
	 */
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
	contents: MarkedString[];

	/**
	 * The range to which this hover applies. When missing, the
	 * editor will use the range at the current position or the
	 * current position itself.
	 */
	range: editorCommon.IRange;
}

/**
 * The hover provider interface defines the contract between extensions and
 * the [hover](https://code.visualstudio.com/docs/editor/editingevolved#_hover)-feature.
 */
export interface HoverProvider {
	/**
	 * Provide a hover for the given position and document. Multiple hovers at the same
	 * position will be merged by the editor. A hover can have a range which defaults
	 * to the word range at the position when omitted.
	 */
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
	insertText: string;
	type: SuggestionType;
	detail?: string;
	documentation?: string;
	filterText?: string;
	sortText?: string;
	noAutoAccept?: boolean;
	overwriteBefore?: number;
	overwriteAfter?: number;
	additionalTextEdits?: editorCommon.ISingleEditOperation[];
	command?: Command;
	isTMSnippet?: boolean;
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

	filter?: IFilter;

	provideCompletionItems(model:editorCommon.IReadOnlyModel, position:Position, token:CancellationToken): ISuggestResult | Thenable<ISuggestResult>;

	resolveCompletionItem?(model:editorCommon.IReadOnlyModel, position:Position, item: ISuggestion, token: CancellationToken): ISuggestion | Thenable<ISuggestion>;
}

/**
 * Interface used to quick fix typing errors while accesing member fields.
 */
export interface CodeAction {
	command: Command;
	score: number;
}
/**
 * The code action interface defines the contract between extensions and
 * the [light bulb](https://code.visualstudio.com/docs/editor/editingevolved#_code-action) feature.
 * @internal
 */
export interface CodeActionProvider {
	/**
	 * Provide commands for the given document and range.
	 */
	provideCodeActions(model:editorCommon.IReadOnlyModel, range:Range, token: CancellationToken): CodeAction[] | Thenable<CodeAction[]>;
}

/**
 * Represents a parameter of a callable-signature. A parameter can
 * have a label and a doc-comment.
 */
export interface ParameterInformation {
	/**
	 * The label of this signature. Will be shown in
	 * the UI.
	 */
	label: string;
	/**
	 * The human-readable doc-comment of this signature. Will be shown
	 * in the UI but can be omitted.
	 */
	documentation: string;
}
/**
 * Represents the signature of something callable. A signature
 * can have a label, like a function-name, a doc-comment, and
 * a set of parameters.
 */
export interface SignatureInformation {
	/**
	 * The label of this signature. Will be shown in
	 * the UI.
	 */
	label: string;
	/**
	 * The human-readable doc-comment of this signature. Will be shown
	 * in the UI but can be omitted.
	 */
	documentation: string;
	/**
	 * The parameters of this signature.
	 */
	parameters: ParameterInformation[];
}
/**
 * Signature help represents the signature of something
 * callable. There can be multiple signatures but only one
 * active and only one active parameter.
 */
export interface SignatureHelp {
	/**
	 * One or more signatures.
	 */
	signatures: SignatureInformation[];
	/**
	 * The active signature.
	 */
	activeSignature: number;
	/**
	 * The active parameter of the active signature.
	 */
	activeParameter: number;
}
/**
 * The signature help provider interface defines the contract between extensions and
 * the [parameter hints](https://code.visualstudio.com/docs/editor/editingevolved#_parameter-hints)-feature.
 */
export interface SignatureHelpProvider {

	signatureHelpTriggerCharacters: string[];

	/**
	 * Provide help for the signature at the given position and document.
	 */
	provideSignatureHelp(model: editorCommon.IReadOnlyModel, position: Position, token: CancellationToken): SignatureHelp | Thenable<SignatureHelp>;
}

/**
 * A document highlight kind.
 */
export enum DocumentHighlightKind {
	/**
	 * A textual occurrence.
	 */
	Text,
	/**
	 * Read-access of a symbol, like reading a variable.
	 */
	Read,
	/**
	 * Write-access of a symbol, like writing to a variable.
	 */
	Write
}
/**
 * A document highlight is a range inside a text document which deserves
 * special attention. Usually a document highlight is visualized by changing
 * the background color of its range.
 */
export interface DocumentHighlight {
	/**
	 * The range this highlight applies to.
	 */
	range: editorCommon.IRange;
	/**
	 * The highlight kind, default is [text](#DocumentHighlightKind.Text).
	 */
	kind: DocumentHighlightKind;
}
/**
 * The document highlight provider interface defines the contract between extensions and
 * the word-highlight-feature.
 */
export interface DocumentHighlightProvider {
	/**
	 * Provide a set of document highlights, like all occurrences of a variable or
	 * all exit-points of a function.
	 */
	provideDocumentHighlights(model: editorCommon.IReadOnlyModel, position: Position, token: CancellationToken): DocumentHighlight[] | Thenable<DocumentHighlight[]>;
}

/**
 * Value-object that contains additional information when
 * requesting references.
 */
export interface ReferenceContext {
	/**
	 * Include the declaration of the current symbol.
	 */
	includeDeclaration: boolean;
}
/**
 * The reference provider interface defines the contract between extensions and
 * the [find references](https://code.visualstudio.com/docs/editor/editingevolved#_peek)-feature.
 */
export interface ReferenceProvider {
	/**
	 * Provide a set of project-wide references for the given position and document.
	 */
	provideReferences(model:editorCommon.IReadOnlyModel, position:Position, context: ReferenceContext, token: CancellationToken): Location[] | Thenable<Location[]>;
}

/**
 * Represents a location inside a resource, such as a line
 * inside a text file.
 */
export interface Location {
	/**
	 * The resource identifier of this location.
	 */
	uri: URI;
	/**
	 * The document range of this locations.
	 */
	range: editorCommon.IRange;
}
/**
 * The definition of a symbol represented as one or many [locations](#Location).
 * For most programming languages there is only one location at which a symbol is
 * defined.
 */
export type Definition = Location | Location[];
/**
 * The definition provider interface defines the contract between extensions and
 * the [go to definition](https://code.visualstudio.com/docs/editor/editingevolved#_go-to-definition)
 * and peek definition features.
 */
export interface DefinitionProvider {
	/**
	 * Provide the definition of the symbol at the given position and document.
	 */
	provideDefinition(model:editorCommon.IReadOnlyModel, position:Position, token:CancellationToken): Definition | Thenable<Definition>;
}


/**
 * A symbol kind.
 */
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
/**
 * Represents information about programming constructs like variables, classes,
 * interfaces etc.
 */
export interface SymbolInformation {
	/**
	 * The name of this symbol.
	 */
	name: string;
	/**
	 * The name of the symbol containing this symbol.
	 */
	containerName?: string;
	/**
	 * The kind of this symbol.
	 */
	kind: SymbolKind;
	/**
	 * The location of this symbol.
	 */
	location: Location;
}
/**
 * The document symbol provider interface defines the contract between extensions and
 * the [go to symbol](https://code.visualstudio.com/docs/editor/editingevolved#_goto-symbol)-feature.
 */
export interface DocumentSymbolProvider {
	/**
	 * Provide symbol information for the given document.
	 */
	provideDocumentSymbols(model:editorCommon.IReadOnlyModel, token: CancellationToken): SymbolInformation[] | Thenable<SymbolInformation[]>;
}

/**
 * Interface used to format a model
 */
export interface FormattingOptions {
	/**
	 * Size of a tab in spaces.
	 */
	tabSize:number;
	/**
	 * Prefer spaces over tabs.
	 */
	insertSpaces:boolean;
}
/**
 * The document formatting provider interface defines the contract between extensions and
 * the formatting-feature.
 */
export interface DocumentFormattingEditProvider {
	/**
	 * Provide formatting edits for a whole document.
	 */
	provideDocumentFormattingEdits(model: editorCommon.IReadOnlyModel, options: FormattingOptions, token: CancellationToken): editorCommon.ISingleEditOperation[] | Thenable<editorCommon.ISingleEditOperation[]>;
}
/**
 * The document formatting provider interface defines the contract between extensions and
 * the formatting-feature.
 */
export interface DocumentRangeFormattingEditProvider {
	/**
	 * Provide formatting edits for a range in a document.
	 *
	 * The given range is a hint and providers can decide to format a smaller
	 * or larger range. Often this is done by adjusting the start and end
	 * of the range to full syntax nodes.
	 */
	provideDocumentRangeFormattingEdits(model: editorCommon.IReadOnlyModel, range: Range, options: FormattingOptions, token: CancellationToken): editorCommon.ISingleEditOperation[] | Thenable<editorCommon.ISingleEditOperation[]>;
}
/**
 * The document formatting provider interface defines the contract between extensions and
 * the formatting-feature.
 */
export interface OnTypeFormattingEditProvider {
	autoFormatTriggerCharacters: string[];
	/**
	 * Provide formatting edits after a character has been typed.
	 *
	 * The given position and character should hint to the provider
	 * what range the position to expand to, like find the matching `{`
	 * when `}` has been entered.
	 */
	provideOnTypeFormattingEdits(model: editorCommon.IReadOnlyModel, position: Position, ch: string, options: FormattingOptions, token: CancellationToken): editorCommon.ISingleEditOperation[] | Thenable<editorCommon.ISingleEditOperation[]>;
}

/**
 * @internal
 */
export interface IInplaceReplaceSupportResult {
	value: string;
	range:editorCommon.IRange;
}

/**
 * A link inside the editor.
 */
export interface ILink {
	range: editorCommon.IRange;
	url: string;
}
/**
 * A provider of links.
 */
export interface LinkProvider {
	provideLinks(model: editorCommon.IReadOnlyModel, token: CancellationToken): ILink[] | Thenable<ILink[]>;
	resolveLink?: (link: ILink, token: CancellationToken) => ILink | Thenable<ILink>;
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


export interface Command {
	id: string;
	title: string;
	arguments?: any[];
}
export interface ICodeLensSymbol {
	range: editorCommon.IRange;
	id?: string;
	command?: Command;
}
export interface CodeLensProvider {
	provideCodeLenses(model:editorCommon.IReadOnlyModel, token: CancellationToken): ICodeLensSymbol[] | Thenable<ICodeLensSymbol[]>;
	resolveCodeLens?(model:editorCommon.IReadOnlyModel, codeLens: ICodeLensSymbol, token: CancellationToken): ICodeLensSymbol | Thenable<ICodeLensSymbol>;
}

/**
 * A tuple of two characters, like a pair of
 * opening and closing brackets.
 */
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

/**
 * Describes what to do with the indentation when pressing Enter.
 */
export enum IndentAction {
	/**
	 * Insert new line and copy the previous line's indentation.
	 */
	None,
	/**
	 * Insert new line and indent once (relative to the previous line's indentation).
	 */
	Indent,
	/**
	 * Insert two new lines:
	 *  - the first one indented which will hold the cursor
	 *  - the second one at the same indentation level
	 */
	IndentOutdent,
	/**
	 * Insert new line and outdent once (relative to the previous line's indentation).
	 */
	Outdent
}

/**
 * Describes what to do when pressing Enter.
 */
export interface EnterAction {
	/**
	 * Describe what to do with the indentation.
	 */
	indentAction:IndentAction;
	/**
	 * Describes text to be appended after the new line and after the indentation.
	 */
	appendText?:string;
	/**
	 * Describes the number of characters to remove from the new line's indentation.
	 */
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
	onEnter(model:editorCommon.ITokenizedModel, position: editorCommon.IPosition): EnterAction;
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
