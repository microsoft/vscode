/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IMarkdownString } from 'vs/base/common/htmlContent';
import { IDisposable } from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { TokenizationResult, TokenizationResult2 } from 'vs/editor/common/core/token';
import LanguageFeatureRegistry from 'vs/editor/common/modes/languageFeatureRegistry';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Position } from 'vs/editor/common/core/position';
import { Range, IRange } from 'vs/editor/common/core/range';
import Event from 'vs/base/common/event';
import { TokenizationRegistryImpl } from 'vs/editor/common/modes/tokenizationRegistry';
import { Color } from 'vs/base/common/color';

/**
 * Open ended enum at runtime
 * @internal
 */
export const enum LanguageId {
	Null = 0,
	PlainText = 1
}

/**
 * @internal
 */
export class LanguageIdentifier {

	/**
	 * A string identifier. Unique across languages. e.g. 'javascript'.
	 */
	public readonly language: string;

	/**
	 * A numeric identifier. Unique across languages. e.g. 5
	 * Will vary at runtime based on registration order, etc.
	 */
	public readonly id: LanguageId;

	constructor(language: string, id: LanguageId) {
		this.language = language;
		this.id = id;
	}
}

/**
 * A mode. Will soon be obsolete.
 * @internal
 */
export interface IMode {

	getId(): string;

	getLanguageIdentifier(): LanguageIdentifier;

}

/**
 * A font style. Values are 2^x such that a bit mask can be used.
 * @internal
 */
export const enum FontStyle {
	NotSet = -1,
	None = 0,
	Italic = 1,
	Bold = 2,
	Underline = 4
}

/**
 * Open ended enum at runtime
 * @internal
 */
export const enum ColorId {
	None = 0,
	DefaultForeground = 1,
	DefaultBackground = 2
}

/**
 * A standard token type. Values are 2^x such that a bit mask can be used.
 * @internal
 */
export const enum StandardTokenType {
	Other = 0,
	Comment = 1,
	String = 2,
	RegEx = 4
}

/**
 * Helpers to manage the "collapsed" metadata of an entire StackElement stack.
 * The following assumptions have been made:
 *  - languageId < 256 => needs 8 bits
 *  - unique color count < 512 => needs 9 bits
 *
 * The binary format is:
 * - -------------------------------------------
 *     3322 2222 2222 1111 1111 1100 0000 0000
 *     1098 7654 3210 9876 5432 1098 7654 3210
 * - -------------------------------------------
 *     xxxx xxxx xxxx xxxx xxxx xxxx xxxx xxxx
 *     bbbb bbbb bfff ffff ffFF FTTT LLLL LLLL
 * - -------------------------------------------
 *  - L = LanguageId (8 bits)
 *  - T = StandardTokenType (3 bits)
 *  - F = FontStyle (3 bits)
 *  - f = foreground color (9 bits)
 *  - b = background color (9 bits)
 *
 * @internal
 */
export const enum MetadataConsts {
	LANGUAGEID_MASK = 0b00000000000000000000000011111111,
	TOKEN_TYPE_MASK = 0b00000000000000000000011100000000,
	FONT_STYLE_MASK = 0b00000000000000000011100000000000,
	FOREGROUND_MASK = 0b00000000011111111100000000000000,
	BACKGROUND_MASK = 0b11111111100000000000000000000000,

	LANGUAGEID_OFFSET = 0,
	TOKEN_TYPE_OFFSET = 8,
	FONT_STYLE_OFFSET = 11,
	FOREGROUND_OFFSET = 14,
	BACKGROUND_OFFSET = 23
}

/**
 * @internal
 */
export interface ITokenizationSupport {

	getInitialState(): IState;

	// add offsetDelta to each of the returned indices
	tokenize(line: string, state: IState, offsetDelta: number): TokenizationResult;

	tokenize2(line: string, state: IState, offsetDelta: number): TokenizationResult2;
}

/**
 * The state of the tokenizer between two lines.
 * It is useful to store flags such as in multiline comment, etc.
 * The model will clone the previous line's state and pass it in to tokenize the next line.
 */
export interface IState {
	clone(): IState;
	equals(other: IState): boolean;
}

/**
 * A hover represents additional information for a symbol or word. Hovers are
 * rendered in a tooltip-like widget.
 */
export interface Hover {
	/**
	 * The contents of this hover.
	 */
	contents: IMarkdownString[];

	/**
	 * The range to which this hover applies. When missing, the
	 * editor will use the range at the current position or the
	 * current position itself.
	 */
	range: IRange;
}

/**
 * The hover provider interface defines the contract between extensions and
 * the [hover](https://code.visualstudio.com/docs/editor/intellisense)-feature.
 */
export interface HoverProvider {
	/**
	 * Provide a hover for the given position and document. Multiple hovers at the same
	 * position will be merged by the editor. A hover can have a range which defaults
	 * to the word range at the position when omitted.
	 */
	provideHover(model: editorCommon.IReadOnlyModel, position: Position, token: CancellationToken): Hover | Thenable<Hover>;
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
	| 'struct'
	| 'interface'
	| 'module'
	| 'property'
	| 'event'
	| 'operator'
	| 'unit'
	| 'value'
	| 'constant'
	| 'enum'
	| 'enum-member'
	| 'keyword'
	| 'snippet'
	| 'text'
	| 'color'
	| 'file'
	| 'reference'
	| 'customcolor'
	| 'folder'
	| 'type-parameter';

/**
 * @internal
 */
export type SnippetType = 'internal' | 'textmate';

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
	commitCharacters?: string[];
	overwriteBefore?: number;
	overwriteAfter?: number;
	additionalTextEdits?: editorCommon.ISingleEditOperation[];
	command?: Command;
	snippetType?: SnippetType;
}

/**
 * @internal
 */
export interface ISuggestResult {
	suggestions: ISuggestion[];
	incomplete?: boolean;
}

/**
 * @internal
 */
export interface ISuggestSupport {

	triggerCharacters?: string[];

	provideCompletionItems(model: editorCommon.IModel, position: Position, token: CancellationToken): ISuggestResult | Thenable<ISuggestResult>;

	resolveCompletionItem?(model: editorCommon.IModel, position: Position, item: ISuggestion, token: CancellationToken): ISuggestion | Thenable<ISuggestion>;
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
	provideCodeActions(model: editorCommon.IReadOnlyModel, range: Range, token: CancellationToken): Command[] | Thenable<Command[]>;
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
	documentation?: string;
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
	documentation?: string;
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
 * the [parameter hints](https://code.visualstudio.com/docs/editor/intellisense)-feature.
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
	range: IRange;
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
	provideReferences(model: editorCommon.IReadOnlyModel, position: Position, context: ReferenceContext, token: CancellationToken): Location[] | Thenable<Location[]>;
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
	range: IRange;
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
	provideDefinition(model: editorCommon.IReadOnlyModel, position: Position, token: CancellationToken): Definition | Thenable<Definition>;
}

/**
 * The implementation provider interface defines the contract between extensions and
 * the go to implementation feature.
 */
export interface ImplementationProvider {
	/**
	 * Provide the implementation of the symbol at the given position and document.
	 */
	provideImplementation(model: editorCommon.IReadOnlyModel, position: Position, token: CancellationToken): Definition | Thenable<Definition>;
}

/**
 * The type definition provider interface defines the contract between extensions and
 * the go to type definition feature.
 */
export interface TypeDefinitionProvider {
	/**
	 * Provide the type definition of the symbol at the given position and document.
	 */
	provideTypeDefinition(model: editorCommon.IReadOnlyModel, position: Position, token: CancellationToken): Definition | Thenable<Definition>;
}

/**
 * A symbol kind.
 */
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


/**
 * @internal
 */
export const symbolKindToCssClass = (function () {

	const _fromMapping: { [n: number]: string } = Object.create(null);
	_fromMapping[SymbolKind.File] = 'file';
	_fromMapping[SymbolKind.Module] = 'module';
	_fromMapping[SymbolKind.Namespace] = 'namespace';
	_fromMapping[SymbolKind.Package] = 'package';
	_fromMapping[SymbolKind.Class] = 'class';
	_fromMapping[SymbolKind.Method] = 'method';
	_fromMapping[SymbolKind.Property] = 'property';
	_fromMapping[SymbolKind.Field] = 'field';
	_fromMapping[SymbolKind.Constructor] = 'constructor';
	_fromMapping[SymbolKind.Enum] = 'enum';
	_fromMapping[SymbolKind.Interface] = 'interface';
	_fromMapping[SymbolKind.Function] = 'function';
	_fromMapping[SymbolKind.Variable] = 'variable';
	_fromMapping[SymbolKind.Constant] = 'constant';
	_fromMapping[SymbolKind.String] = 'string';
	_fromMapping[SymbolKind.Number] = 'number';
	_fromMapping[SymbolKind.Boolean] = 'boolean';
	_fromMapping[SymbolKind.Array] = 'array';
	_fromMapping[SymbolKind.Object] = 'object';
	_fromMapping[SymbolKind.Key] = 'key';
	_fromMapping[SymbolKind.Null] = 'null';
	_fromMapping[SymbolKind.EnumMember] = 'enum-member';
	_fromMapping[SymbolKind.Struct] = 'struct';
	_fromMapping[SymbolKind.Event] = 'event';
	_fromMapping[SymbolKind.Operator] = 'operator';
	_fromMapping[SymbolKind.TypeParameter] = 'type-parameter';

	return function toCssClassName(kind: SymbolKind): string {
		return _fromMapping[kind] || 'property';
	};
})();

/**
 * @internal
 */
export interface IOutline {
	entries: SymbolInformation[];
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
	provideDocumentSymbols(model: editorCommon.IReadOnlyModel, token: CancellationToken): SymbolInformation[] | Thenable<SymbolInformation[]>;
}

export interface TextEdit {
	range: IRange;
	text: string;
	eol?: editorCommon.EndOfLineSequence;
}

/**
 * Interface used to format a model
 */
export interface FormattingOptions {
	/**
	 * Size of a tab in spaces.
	 */
	tabSize: number;
	/**
	 * Prefer spaces over tabs.
	 */
	insertSpaces: boolean;
}
/**
 * The document formatting provider interface defines the contract between extensions and
 * the formatting-feature.
 */
export interface DocumentFormattingEditProvider {
	/**
	 * Provide formatting edits for a whole document.
	 */
	provideDocumentFormattingEdits(model: editorCommon.IReadOnlyModel, options: FormattingOptions, token: CancellationToken): TextEdit[] | Thenable<TextEdit[]>;
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
	provideDocumentRangeFormattingEdits(model: editorCommon.IReadOnlyModel, range: Range, options: FormattingOptions, token: CancellationToken): TextEdit[] | Thenable<TextEdit[]>;
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
	provideOnTypeFormattingEdits(model: editorCommon.IReadOnlyModel, position: Position, ch: string, options: FormattingOptions, token: CancellationToken): TextEdit[] | Thenable<TextEdit[]>;
}

/**
 * @internal
 */
export interface IInplaceReplaceSupportResult {
	value: string;
	range: IRange;
}

/**
 * A link inside the editor.
 */
export interface ILink {
	range: IRange;
	url: string;
}
/**
 * A provider of links.
 */
export interface LinkProvider {
	provideLinks(model: editorCommon.IReadOnlyModel, token: CancellationToken): ILink[] | Thenable<ILink[]>;
	resolveLink?: (link: ILink, token: CancellationToken) => ILink | Thenable<ILink>;
}

/**
 * A color in RGBA format.
 */
export interface IColor {

	/**
	 * The red component in the range [0-1].
	 */
	readonly red: number;

	/**
	 * The green component in the range [0-1].
	 */
	readonly green: number;

	/**
	 * The blue component in the range [0-1].
	 */
	readonly blue: number;

	/**
	 * The alpha component in the range [0-1].
	 */
	readonly alpha: number;
}

/**
 * A color formatter.
 */
export interface IColorFormatter {
	readonly supportsTransparency: boolean;
	format(color: IColor): string;
}

/**
 * A color range is a range in a text model which represents a color.
 */
export interface IColorRange {

	/**
	 * The range within the model.
	 */
	range: IRange;

	/**
	 * The color represented in this range.
	 */
	color: IColor;

	/**
	 * The available formats for this specific color.
	 */
	formatters: IColorFormatter[];
}

/**
 * A provider of colors for editor models.
 */
export interface DocumentColorProvider {
	/**
	 * Provides the color ranges for a specific model.
	 */
	provideColorRanges(model: editorCommon.IReadOnlyModel, token: CancellationToken): IColorRange[] | Thenable<IColorRange[]>;
}

export interface IResourceEdit {
	resource: URI;
	range: IRange;
	newText: string;
}
export interface WorkspaceEdit {
	edits: IResourceEdit[];
	rejectReason?: string;
}
export interface RenameProvider {
	provideRenameEdits(model: editorCommon.IReadOnlyModel, position: Position, newName: string, token: CancellationToken): WorkspaceEdit | Thenable<WorkspaceEdit>;
}


export interface Command {
	id: string;
	title: string;
	tooltip?: string;
	arguments?: any[];
}
export interface ICodeLensSymbol {
	range: IRange;
	id?: string;
	command?: Command;
}
export interface CodeLensProvider {
	onDidChange?: Event<this>;
	provideCodeLenses(model: editorCommon.IReadOnlyModel, token: CancellationToken): ICodeLensSymbol[] | Thenable<ICodeLensSymbol[]>;
	resolveCodeLens?(model: editorCommon.IReadOnlyModel, codeLens: ICodeLensSymbol, token: CancellationToken): ICodeLensSymbol | Thenable<ICodeLensSymbol>;
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
export const ImplementationProviderRegistry = new LanguageFeatureRegistry<ImplementationProvider>();

/**
 * @internal
 */
export const TypeDefinitionProviderRegistry = new LanguageFeatureRegistry<TypeDefinitionProvider>();

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

/**
 * @internal
 */
export const ColorProviderRegistry = new LanguageFeatureRegistry<DocumentColorProvider>();

/**
 * @internal
 */
export interface ITokenizationSupportChangedEvent {
	changedLanguages: string[];
	changedColorMap: boolean;
}

/**
 * @internal
 */
export interface ITokenizationRegistry {

	/**
	 * An event triggered when:
	 *  - a tokenization support is registered, unregistered or changed.
	 *  - the color map is changed.
	 */
	onDidChange: Event<ITokenizationSupportChangedEvent>;

	/**
	 * Fire a change event for a language.
	 * This is useful for languages that embed other languages.
	 */
	fire(languages: string[]): void;

	/**
	 * Register a tokenization support.
	 */
	register(language: string, support: ITokenizationSupport): IDisposable;

	/**
	 * Get the tokenization support for a language.
	 * Returns null if not found.
	 */
	get(language: string): ITokenizationSupport;

	/**
	 * Set the new color map that all tokens will use in their ColorId binary encoded bits for foreground and background.
	 */
	setColorMap(colorMap: Color[]): void;

	getColorMap(): Color[];
	getDefaultForeground(): Color;
	getDefaultBackground(): Color;
}

/**
 * @internal
 */
export const TokenizationRegistry = new TokenizationRegistryImpl();
