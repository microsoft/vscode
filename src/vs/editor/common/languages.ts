/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { Color } from 'vs/base/common/color';
import { IReadonlyVSDataTransfer } from 'vs/base/common/dataTransfer';
import { Event } from 'vs/base/common/event';
import { HierarchicalKind } from 'vs/base/common/hierarchicalKind';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI, UriComponents } from 'vs/base/common/uri';
import { EditOperation, ISingleEditOperation } from 'vs/editor/common/core/editOperation';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { IRange, Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { LanguageId } from 'vs/editor/common/encodedTokenAttributes';
import { LanguageSelector } from 'vs/editor/common/languageSelector';
import * as model from 'vs/editor/common/model';
import { TokenizationRegistry as TokenizationRegistryImpl } from 'vs/editor/common/tokenizationRegistry';
import { ContiguousMultilineTokens } from 'vs/editor/common/tokens/contiguousMultilineTokens';
import { localize } from 'vs/nls';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { IMarkerData } from 'vs/platform/markers/common/markers';

/**
 * @internal
 */
export interface ILanguageIdCodec {
	encodeLanguageId(languageId: string): LanguageId;
	decodeLanguageId(languageId: LanguageId): string;
}

export class Token {
	_tokenBrand: void = undefined;

	constructor(
		public readonly offset: number,
		public readonly type: string,
		public readonly language: string,
	) {
	}

	public toString(): string {
		return '(' + this.offset + ', ' + this.type + ')';
	}
}

/**
 * @internal
 */
export class TokenizationResult {
	_tokenizationResultBrand: void = undefined;

	constructor(
		public readonly tokens: Token[],
		public readonly endState: IState,
	) {
	}
}

/**
 * @internal
 */
export class EncodedTokenizationResult {
	_encodedTokenizationResultBrand: void = undefined;

	constructor(
		/**
		 * The tokens in binary format. Each token occupies two array indices. For token i:
		 *  - at offset 2*i => startIndex
		 *  - at offset 2*i + 1 => metadata
		 *
		 */
		public readonly tokens: Uint32Array,
		public readonly endState: IState,
	) {
	}
}

/**
 * @internal
 */
export interface ITokenizationSupport {
	/**
	 * If true, the background tokenizer will only be used to verify tokens against the default background tokenizer.
	 * Used for debugging.
	 */
	readonly backgroundTokenizerShouldOnlyVerifyTokens?: boolean;

	getInitialState(): IState;

	tokenize(line: string, hasEOL: boolean, state: IState): TokenizationResult;

	tokenizeEncoded(line: string, hasEOL: boolean, state: IState): EncodedTokenizationResult;

	/**
	 * Can be/return undefined if default background tokenization should be used.
	 */
	createBackgroundTokenizer?(textModel: model.ITextModel, store: IBackgroundTokenizationStore): IBackgroundTokenizer | undefined;
}

/**
 * @internal
 */
export interface IBackgroundTokenizer extends IDisposable {
	/**
	 * Instructs the background tokenizer to set the tokens for the given range again.
	 *
	 * This might be necessary if the renderer overwrote those tokens with heuristically computed ones for some viewport,
	 * when the change does not even propagate to that viewport.
	 */
	requestTokens(startLineNumber: number, endLineNumberExclusive: number): void;

	reportMismatchingTokens?(lineNumber: number): void;
}

/**
 * @internal
 */
export interface IBackgroundTokenizationStore {
	setTokens(tokens: ContiguousMultilineTokens[]): void;

	setEndState(lineNumber: number, state: IState): void;

	/**
	 * Should be called to indicate that the background tokenization has finished for now.
	 * (This triggers bracket pair colorization to re-parse the bracket pairs with token information)
	 */
	backgroundTokenizationFinished(): void;
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
 * A provider result represents the values a provider, like the {@link HoverProvider},
 * may return. For once this is the actual result type `T`, like `Hover`, or a thenable that resolves
 * to that type `T`. In addition, `null` and `undefined` can be returned - either directly or from a
 * thenable.
 */
export type ProviderResult<T> = T | undefined | null | Thenable<T | undefined | null>;

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
	range?: IRange;

	/**
	 * Can increase the verbosity of the hover
	 */
	canIncreaseVerbosity?: boolean;

	/**
	 * Can decrease the verbosity of the hover
	 */
	canDecreaseVerbosity?: boolean;
}

/**
 * The hover provider interface defines the contract between extensions and
 * the [hover](https://code.visualstudio.com/docs/editor/intellisense)-feature.
 */
export interface HoverProvider<THover = Hover> {
	/**
	 * Provide a hover for the given position, context and document. Multiple hovers at the same
	 * position will be merged by the editor. A hover can have a range which defaults
	 * to the word range at the position when omitted.
	 */
	provideHover(model: model.ITextModel, position: Position, token: CancellationToken, context?: HoverContext<THover>): ProviderResult<THover>;
}

export interface HoverContext<THover = Hover> {
	/**
	 * Hover verbosity request
	 */
	verbosityRequest?: HoverVerbosityRequest<THover>;
}

export interface HoverVerbosityRequest<THover = Hover> {
	/**
	 * The delta by which to increase/decrease the hover verbosity level
	 */
	verbosityDelta: number;
	/**
	 * The previous hover for the same position
	 */
	previousHover: THover;
}

export enum HoverVerbosityAction {
	/**
	 * Increase the verbosity of the hover
	 */
	Increase,
	/**
	 * Decrease the verbosity of the hover
	 */
	Decrease
}

/**
 * An evaluatable expression represents additional information for an expression in a document. Evaluatable expressions are
 * evaluated by a debugger or runtime and their result is rendered in a tooltip-like widget.
 * @internal
 */
export interface EvaluatableExpression {
	/**
	 * The range to which this expression applies.
	 */
	range: IRange;
	/**
	 * This expression overrides the expression extracted from the range.
	 */
	expression?: string;
}


/**
 * The evaluatable expression provider interface defines the contract between extensions and
 * the debug hover.
 * @internal
 */
export interface EvaluatableExpressionProvider {
	/**
	 * Provide a hover for the given position and document. Multiple hovers at the same
	 * position will be merged by the editor. A hover can have a range which defaults
	 * to the word range at the position when omitted.
	 */
	provideEvaluatableExpression(model: model.ITextModel, position: Position, token: CancellationToken): ProviderResult<EvaluatableExpression>;
}

/**
 * A value-object that contains contextual information when requesting inline values from a InlineValuesProvider.
 * @internal
 */
export interface InlineValueContext {
	frameId: number;
	stoppedLocation: Range;
}

/**
 * Provide inline value as text.
 * @internal
 */
export interface InlineValueText {
	type: 'text';
	range: IRange;
	text: string;
}

/**
 * Provide inline value through a variable lookup.
 * @internal
 */
export interface InlineValueVariableLookup {
	type: 'variable';
	range: IRange;
	variableName?: string;
	caseSensitiveLookup: boolean;
}

/**
 * Provide inline value through an expression evaluation.
 * @internal
 */
export interface InlineValueExpression {
	type: 'expression';
	range: IRange;
	expression?: string;
}

/**
 * Inline value information can be provided by different means:
 * - directly as a text value (class InlineValueText).
 * - as a name to use for a variable lookup (class InlineValueVariableLookup)
 * - as an evaluatable expression (class InlineValueEvaluatableExpression)
 * The InlineValue types combines all inline value types into one type.
 * @internal
 */
export type InlineValue = InlineValueText | InlineValueVariableLookup | InlineValueExpression;

/**
 * The inline values provider interface defines the contract between extensions and
 * the debugger's inline values feature.
 * @internal
 */
export interface InlineValuesProvider {
	/**
	 */
	onDidChangeInlineValues?: Event<void> | undefined;
	/**
	 * Provide the "inline values" for the given range and document. Multiple hovers at the same
	 * position will be merged by the editor. A hover can have a range which defaults
	 * to the word range at the position when omitted.
	 */
	provideInlineValues(model: model.ITextModel, viewPort: Range, context: InlineValueContext, token: CancellationToken): ProviderResult<InlineValue[]>;
}

export const enum CompletionItemKind {
	Method,
	Function,
	Constructor,
	Field,
	Variable,
	Class,
	Struct,
	Interface,
	Module,
	Property,
	Event,
	Operator,
	Unit,
	Value,
	Constant,
	Enum,
	EnumMember,
	Keyword,
	Text,
	Color,
	File,
	Reference,
	Customcolor,
	Folder,
	TypeParameter,
	User,
	Issue,
	Snippet, // <- highest value (used for compare!)
}

/**
 * @internal
 */
export namespace CompletionItemKinds {

	const byKind = new Map<CompletionItemKind, ThemeIcon>();
	byKind.set(CompletionItemKind.Method, Codicon.symbolMethod);
	byKind.set(CompletionItemKind.Function, Codicon.symbolFunction);
	byKind.set(CompletionItemKind.Constructor, Codicon.symbolConstructor);
	byKind.set(CompletionItemKind.Field, Codicon.symbolField);
	byKind.set(CompletionItemKind.Variable, Codicon.symbolVariable);
	byKind.set(CompletionItemKind.Class, Codicon.symbolClass);
	byKind.set(CompletionItemKind.Struct, Codicon.symbolStruct);
	byKind.set(CompletionItemKind.Interface, Codicon.symbolInterface);
	byKind.set(CompletionItemKind.Module, Codicon.symbolModule);
	byKind.set(CompletionItemKind.Property, Codicon.symbolProperty);
	byKind.set(CompletionItemKind.Event, Codicon.symbolEvent);
	byKind.set(CompletionItemKind.Operator, Codicon.symbolOperator);
	byKind.set(CompletionItemKind.Unit, Codicon.symbolUnit);
	byKind.set(CompletionItemKind.Value, Codicon.symbolValue);
	byKind.set(CompletionItemKind.Enum, Codicon.symbolEnum);
	byKind.set(CompletionItemKind.Constant, Codicon.symbolConstant);
	byKind.set(CompletionItemKind.Enum, Codicon.symbolEnum);
	byKind.set(CompletionItemKind.EnumMember, Codicon.symbolEnumMember);
	byKind.set(CompletionItemKind.Keyword, Codicon.symbolKeyword);
	byKind.set(CompletionItemKind.Snippet, Codicon.symbolSnippet);
	byKind.set(CompletionItemKind.Text, Codicon.symbolText);
	byKind.set(CompletionItemKind.Color, Codicon.symbolColor);
	byKind.set(CompletionItemKind.File, Codicon.symbolFile);
	byKind.set(CompletionItemKind.Reference, Codicon.symbolReference);
	byKind.set(CompletionItemKind.Customcolor, Codicon.symbolCustomColor);
	byKind.set(CompletionItemKind.Folder, Codicon.symbolFolder);
	byKind.set(CompletionItemKind.TypeParameter, Codicon.symbolTypeParameter);
	byKind.set(CompletionItemKind.User, Codicon.account);
	byKind.set(CompletionItemKind.Issue, Codicon.issues);

	/**
	 * @internal
	 */
	export function toIcon(kind: CompletionItemKind): ThemeIcon {
		let codicon = byKind.get(kind);
		if (!codicon) {
			console.info('No codicon found for CompletionItemKind ' + kind);
			codicon = Codicon.symbolProperty;
		}
		return codicon;
	}

	const data = new Map<string, CompletionItemKind>();
	data.set('method', CompletionItemKind.Method);
	data.set('function', CompletionItemKind.Function);
	data.set('constructor', <any>CompletionItemKind.Constructor);
	data.set('field', CompletionItemKind.Field);
	data.set('variable', CompletionItemKind.Variable);
	data.set('class', CompletionItemKind.Class);
	data.set('struct', CompletionItemKind.Struct);
	data.set('interface', CompletionItemKind.Interface);
	data.set('module', CompletionItemKind.Module);
	data.set('property', CompletionItemKind.Property);
	data.set('event', CompletionItemKind.Event);
	data.set('operator', CompletionItemKind.Operator);
	data.set('unit', CompletionItemKind.Unit);
	data.set('value', CompletionItemKind.Value);
	data.set('constant', CompletionItemKind.Constant);
	data.set('enum', CompletionItemKind.Enum);
	data.set('enum-member', CompletionItemKind.EnumMember);
	data.set('enumMember', CompletionItemKind.EnumMember);
	data.set('keyword', CompletionItemKind.Keyword);
	data.set('snippet', CompletionItemKind.Snippet);
	data.set('text', CompletionItemKind.Text);
	data.set('color', CompletionItemKind.Color);
	data.set('file', CompletionItemKind.File);
	data.set('reference', CompletionItemKind.Reference);
	data.set('customcolor', CompletionItemKind.Customcolor);
	data.set('folder', CompletionItemKind.Folder);
	data.set('type-parameter', CompletionItemKind.TypeParameter);
	data.set('typeParameter', CompletionItemKind.TypeParameter);
	data.set('account', CompletionItemKind.User);
	data.set('issue', CompletionItemKind.Issue);

	/**
	 * @internal
	 */
	export function fromString(value: string): CompletionItemKind;
	/**
	 * @internal
	 */
	export function fromString(value: string, strict: true): CompletionItemKind | undefined;
	/**
	 * @internal
	 */
	export function fromString(value: string, strict?: boolean): CompletionItemKind | undefined {
		let res = data.get(value);
		if (typeof res === 'undefined' && !strict) {
			res = CompletionItemKind.Property;
		}
		return res;
	}
}

export interface CompletionItemLabel {
	label: string;
	detail?: string;
	description?: string;
}

export const enum CompletionItemTag {
	Deprecated = 1
}

export const enum CompletionItemInsertTextRule {
	None = 0,

	/**
	 * Adjust whitespace/indentation of multiline insert texts to
	 * match the current line indentation.
	 */
	KeepWhitespace = 0b001,

	/**
	 * `insertText` is a snippet.
	 */
	InsertAsSnippet = 0b100,
}

export interface CompletionItemRanges {
	insert: IRange;
	replace: IRange;
}

/**
 * A completion item represents a text snippet that is
 * proposed to complete text that is being typed.
 */
export interface CompletionItem {
	/**
	 * The label of this completion item. By default
	 * this is also the text that is inserted when selecting
	 * this completion.
	 */
	label: string | CompletionItemLabel;
	/**
	 * The kind of this completion item. Based on the kind
	 * an icon is chosen by the editor.
	 */
	kind: CompletionItemKind;
	/**
	 * A modifier to the `kind` which affect how the item
	 * is rendered, e.g. Deprecated is rendered with a strikeout
	 */
	tags?: ReadonlyArray<CompletionItemTag>;
	/**
	 * A human-readable string with additional information
	 * about this item, like type or symbol information.
	 */
	detail?: string;
	/**
	 * A human-readable string that represents a doc-comment.
	 */
	documentation?: string | IMarkdownString;
	/**
	 * A string that should be used when comparing this item
	 * with other items. When `falsy` the {@link CompletionItem.label label}
	 * is used.
	 */
	sortText?: string;
	/**
	 * A string that should be used when filtering a set of
	 * completion items. When `falsy` the {@link CompletionItem.label label}
	 * is used.
	 */
	filterText?: string;
	/**
	 * Select this item when showing. *Note* that only one completion item can be selected and
	 * that the editor decides which item that is. The rule is that the *first* item of those
	 * that match best is selected.
	 */
	preselect?: boolean;
	/**
	 * A string or snippet that should be inserted in a document when selecting
	 * this completion.
	 */
	insertText: string;
	/**
	 * Additional rules (as bitmask) that should be applied when inserting
	 * this completion.
	 */
	insertTextRules?: CompletionItemInsertTextRule;
	/**
	 * A range of text that should be replaced by this completion item.
	 *
	 * Defaults to a range from the start of the {@link TextDocument.getWordRangeAtPosition current word} to the
	 * current position.
	 *
	 * *Note:* The range must be a {@link Range.isSingleLine single line} and it must
	 * {@link Range.contains contain} the position at which completion has been {@link CompletionItemProvider.provideCompletionItems requested}.
	 */
	range: IRange | CompletionItemRanges;
	/**
	 * An optional set of characters that when pressed while this completion is active will accept it first and
	 * then type that character. *Note* that all commit characters should have `length=1` and that superfluous
	 * characters will be ignored.
	 */
	commitCharacters?: string[];
	/**
	 * An optional array of additional text edits that are applied when
	 * selecting this completion. Edits must not overlap with the main edit
	 * nor with themselves.
	 */
	additionalTextEdits?: ISingleEditOperation[];
	/**
	 * A command that should be run upon acceptance of this item.
	 */
	command?: Command;
	/**
	 * @internal
	 */
	extensionId?: ExtensionIdentifier;

	/**
	 * @internal
	 */
	_id?: [number, number];
}

export interface CompletionList {
	suggestions: CompletionItem[];
	incomplete?: boolean;
	dispose?(): void;

	/**
	 * @internal
	 */
	duration?: number;
}

/**
 * Info provided on partial acceptance.
 */
export interface PartialAcceptInfo {
	kind: PartialAcceptTriggerKind;
}

/**
 * How a partial acceptance was triggered.
 */
export const enum PartialAcceptTriggerKind {
	Word = 0,
	Line = 1,
	Suggest = 2,
}

/**
 * How a suggest provider was triggered.
 */
export const enum CompletionTriggerKind {
	Invoke = 0,
	TriggerCharacter = 1,
	TriggerForIncompleteCompletions = 2
}
/**
 * Contains additional information about the context in which
 * {@link CompletionItemProvider.provideCompletionItems completion provider} is triggered.
 */
export interface CompletionContext {
	/**
	 * How the completion was triggered.
	 */
	triggerKind: CompletionTriggerKind;
	/**
	 * Character that triggered the completion item provider.
	 *
	 * `undefined` if provider was not triggered by a character.
	 */
	triggerCharacter?: string;
}
/**
 * The completion item provider interface defines the contract between extensions and
 * the [IntelliSense](https://code.visualstudio.com/docs/editor/intellisense).
 *
 * When computing *complete* completion items is expensive, providers can optionally implement
 * the `resolveCompletionItem`-function. In that case it is enough to return completion
 * items with a {@link CompletionItem.label label} from the
 * {@link CompletionItemProvider.provideCompletionItems provideCompletionItems}-function. Subsequently,
 * when a completion item is shown in the UI and gains focus this provider is asked to resolve
 * the item, like adding {@link CompletionItem.documentation doc-comment} or {@link CompletionItem.detail details}.
 */
export interface CompletionItemProvider {

	/**
	 * Used to identify completions in the (debug) UI and telemetry. This isn't the extension identifier because extensions
	 * often contribute multiple completion item providers.
	 *
	 * @internal
	 */
	_debugDisplayName: string;

	triggerCharacters?: string[];
	/**
	 * Provide completion items for the given position and document.
	 */
	provideCompletionItems(model: model.ITextModel, position: Position, context: CompletionContext, token: CancellationToken): ProviderResult<CompletionList>;

	/**
	 * Given a completion item fill in more data, like {@link CompletionItem.documentation doc-comment}
	 * or {@link CompletionItem.detail details}.
	 *
	 * The editor will only resolve a completion item once.
	 */
	resolveCompletionItem?(item: CompletionItem, token: CancellationToken): ProviderResult<CompletionItem>;
}

/**
 * How an {@link InlineCompletionsProvider inline completion provider} was triggered.
 */
export enum InlineCompletionTriggerKind {
	/**
	 * Completion was triggered automatically while editing.
	 * It is sufficient to return a single completion item in this case.
	 */
	Automatic = 0,

	/**
	 * Completion was triggered explicitly by a user gesture.
	 * Return multiple completion items to enable cycling through them.
	 */
	Explicit = 1,
}

export interface InlineCompletionContext {

	/**
	 * How the completion was triggered.
	 */
	readonly triggerKind: InlineCompletionTriggerKind;
	readonly selectedSuggestionInfo: SelectedSuggestionInfo | undefined;
	/**
	 * @experimental
	 * @internal
	*/
	readonly userPrompt?: string | undefined;
}

export class SelectedSuggestionInfo {
	constructor(
		public readonly range: IRange,
		public readonly text: string,
		public readonly completionKind: CompletionItemKind,
		public readonly isSnippetText: boolean,
	) {
	}

	public equals(other: SelectedSuggestionInfo) {
		return Range.lift(this.range).equalsRange(other.range)
			&& this.text === other.text
			&& this.completionKind === other.completionKind
			&& this.isSnippetText === other.isSnippetText;
	}
}

export interface InlineCompletion {
	/**
	 * The text to insert.
	 * If the text contains a line break, the range must end at the end of a line.
	 * If existing text should be replaced, the existing text must be a prefix of the text to insert.
	 *
	 * The text can also be a snippet. In that case, a preview with default parameters is shown.
	 * When accepting the suggestion, the full snippet is inserted.
	*/
	readonly insertText: string | { snippet: string };

	/**
	 * A text that is used to decide if this inline completion should be shown.
	 * An inline completion is shown if the text to replace is a subword of the filter text.
	 */
	readonly filterText?: string;

	/**
	 * An optional array of additional text edits that are applied when
	 * selecting this completion. Edits must not overlap with the main edit
	 * nor with themselves.
	 */
	readonly additionalTextEdits?: ISingleEditOperation[];

	/**
	 * The range to replace.
	 * Must begin and end on the same line.
	*/
	readonly range?: IRange;

	readonly command?: Command;

	/**
	 * If set to `true`, unopened closing brackets are removed and unclosed opening brackets are closed.
	 * Defaults to `false`.
	*/
	readonly completeBracketPairs?: boolean;
}

export interface InlineCompletions<TItem extends InlineCompletion = InlineCompletion> {
	readonly items: readonly TItem[];
	/**
	 * A list of commands associated with the inline completions of this list.
	 */
	readonly commands?: Command[];

	readonly suppressSuggestions?: boolean | undefined;

	/**
	 * When set and the user types a suggestion without derivating from it, the inline suggestion is not updated.
	 */
	readonly enableForwardStability?: boolean | undefined;
}

export type InlineCompletionProviderGroupId = string;

export interface InlineCompletionsProvider<T extends InlineCompletions = InlineCompletions> {
	provideInlineCompletions(model: model.ITextModel, position: Position, context: InlineCompletionContext, token: CancellationToken): ProviderResult<T>;

	/**
	 * @experimental
	 * @internal
	*/
	provideInlineEdits?(model: model.ITextModel, range: Range, context: InlineCompletionContext, token: CancellationToken): ProviderResult<T>;

	/**
	 * Will be called when an item is shown.
	 * @param updatedInsertText Is useful to understand bracket completion.
	*/
	handleItemDidShow?(completions: T, item: T['items'][number], updatedInsertText: string): void;

	/**
	 * Will be called when an item is partially accepted.
	 */
	handlePartialAccept?(completions: T, item: T['items'][number], acceptedCharacters: number, info: PartialAcceptInfo): void;

	/**
	 * Will be called when a completions list is no longer in use and can be garbage-collected.
	*/
	freeInlineCompletions(completions: T): void;

	/**
	 * Only used for {@link yieldsToGroupIds}.
	 * Multiple providers can have the same group id.
	 */
	groupId?: InlineCompletionProviderGroupId;

	/**
	 * Returns a list of preferred provider {@link groupId}s.
	 * The current provider is only requested for completions if no provider with a preferred group id returned a result.
	 */
	yieldsToGroupIds?: InlineCompletionProviderGroupId[];

	toString?(): string;
}

export interface CodeAction {
	title: string;
	command?: Command;
	edit?: WorkspaceEdit;
	diagnostics?: IMarkerData[];
	kind?: string;
	isPreferred?: boolean;
	isAI?: boolean;
	disabled?: string;
	ranges?: IRange[];
}

export const enum CodeActionTriggerType {
	Invoke = 1,
	Auto = 2,
}

/**
 * @internal
 */
export interface CodeActionContext {
	only?: string;
	trigger: CodeActionTriggerType;
}

export interface CodeActionList extends IDisposable {
	readonly actions: ReadonlyArray<CodeAction>;
}

/**
 * The code action interface defines the contract between extensions and
 * the [light bulb](https://code.visualstudio.com/docs/editor/editingevolved#_code-action) feature.
 * @internal
 */
export interface CodeActionProvider {

	displayName?: string;

	extensionId?: string;

	/**
	 * Provide commands for the given document and range.
	 */
	provideCodeActions(model: model.ITextModel, range: Range | Selection, context: CodeActionContext, token: CancellationToken): ProviderResult<CodeActionList>;

	/**
	 * Given a code action fill in the edit. Will only invoked when missing.
	 */
	resolveCodeAction?(codeAction: CodeAction, token: CancellationToken): ProviderResult<CodeAction>;

	/**
	 * Optional list of CodeActionKinds that this provider returns.
	 */
	readonly providedCodeActionKinds?: ReadonlyArray<string>;

	readonly documentation?: ReadonlyArray<{ readonly kind: string; readonly command: Command }>;

	/**
	 * @internal
	 */
	_getAdditionalMenuItems?(context: CodeActionContext, actions: readonly CodeAction[]): Command[];
}

/**
 * @internal
 */
export interface DocumentPasteEdit {
	readonly title: string;
	readonly kind: HierarchicalKind;
	readonly handledMimeType?: string;
	readonly yieldTo?: readonly DropYieldTo[];
	insertText: string | { readonly snippet: string };
	additionalEdit?: WorkspaceEdit;
}

/**
 * @internal
 */
export enum DocumentPasteTriggerKind {
	Automatic = 0,
	PasteAs = 1,
}

/**
 * @internal
 */
export interface DocumentPasteContext {
	readonly only?: HierarchicalKind;
	readonly triggerKind: DocumentPasteTriggerKind;
}

/**
 * @internal
 */
export interface DocumentPasteEditsSession {
	edits: readonly DocumentPasteEdit[];
	dispose(): void;
}

/**
 * @internal
 */
export interface DocumentPasteEditProvider {
	readonly id?: string;
	readonly copyMimeTypes?: readonly string[];
	readonly pasteMimeTypes?: readonly string[];
	readonly providedPasteEditKinds?: readonly HierarchicalKind[];

	prepareDocumentPaste?(model: model.ITextModel, ranges: readonly IRange[], dataTransfer: IReadonlyVSDataTransfer, token: CancellationToken): Promise<undefined | IReadonlyVSDataTransfer>;

	provideDocumentPasteEdits?(model: model.ITextModel, ranges: readonly IRange[], dataTransfer: IReadonlyVSDataTransfer, context: DocumentPasteContext, token: CancellationToken): Promise<DocumentPasteEditsSession | undefined>;

	resolveDocumentPasteEdit?(edit: DocumentPasteEdit, token: CancellationToken): Promise<DocumentPasteEdit>;
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
	label: string | [number, number];
	/**
	 * The human-readable doc-comment of this signature. Will be shown
	 * in the UI but can be omitted.
	 */
	documentation?: string | IMarkdownString;
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
	documentation?: string | IMarkdownString;
	/**
	 * The parameters of this signature.
	 */
	parameters: ParameterInformation[];
	/**
	 * Index of the active parameter.
	 *
	 * If provided, this is used in place of `SignatureHelp.activeSignature`.
	 */
	activeParameter?: number;
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

export interface SignatureHelpResult extends IDisposable {
	value: SignatureHelp;
}

export enum SignatureHelpTriggerKind {
	Invoke = 1,
	TriggerCharacter = 2,
	ContentChange = 3,
}

export interface SignatureHelpContext {
	readonly triggerKind: SignatureHelpTriggerKind;
	readonly triggerCharacter?: string;
	readonly isRetrigger: boolean;
	readonly activeSignatureHelp?: SignatureHelp;
}

/**
 * The signature help provider interface defines the contract between extensions and
 * the [parameter hints](https://code.visualstudio.com/docs/editor/intellisense)-feature.
 */
export interface SignatureHelpProvider {

	readonly signatureHelpTriggerCharacters?: ReadonlyArray<string>;
	readonly signatureHelpRetriggerCharacters?: ReadonlyArray<string>;

	/**
	 * Provide help for the signature at the given position and document.
	 */
	provideSignatureHelp(model: model.ITextModel, position: Position, token: CancellationToken, context: SignatureHelpContext): ProviderResult<SignatureHelpResult>;
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
	 * The highlight kind, default is {@link DocumentHighlightKind.Text text}.
	 */
	kind?: DocumentHighlightKind;
}

/**
 * Represents a set of document highlights for a specific URI.
 */
export interface MultiDocumentHighlight {
	/**
	 * The URI of the document that the highlights belong to.
	 */
	uri: URI;

	/**
	 * The set of highlights for the document.
	 */
	highlights: DocumentHighlight[];
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
	provideDocumentHighlights(model: model.ITextModel, position: Position, token: CancellationToken): ProviderResult<DocumentHighlight[]>;
}

/**
 * A provider that can provide document highlights across multiple documents.
 */
export interface MultiDocumentHighlightProvider {
	readonly selector: LanguageSelector;

	/**
	 * Provide a Map of URI --> document highlights, like all occurrences of a variable or
	 * all exit-points of a function.
	 *
	 * Used in cases such as split view, notebooks, etc. where there can be multiple documents
	 * with shared symbols.
	 *
	 * @param primaryModel The primary text model.
	 * @param position The position at which to provide document highlights.
	 * @param otherModels The other text models to search for document highlights.
	 * @param token A cancellation token.
	 * @returns A map of URI to document highlights.
	 */
	provideMultiDocumentHighlights(primaryModel: model.ITextModel, position: Position, otherModels: model.ITextModel[], token: CancellationToken): ProviderResult<Map<URI, DocumentHighlight[]>>;
}

/**
 * The linked editing range provider interface defines the contract between extensions and
 * the linked editing feature.
 */
export interface LinkedEditingRangeProvider {

	/**
	 * Provide a list of ranges that can be edited together.
	 */
	provideLinkedEditingRanges(model: model.ITextModel, position: Position, token: CancellationToken): ProviderResult<LinkedEditingRanges>;
}

/**
 * Represents a list of ranges that can be edited together along with a word pattern to describe valid contents.
 */
export interface LinkedEditingRanges {
	/**
	 * A list of ranges that can be edited together. The ranges must have
	 * identical length and text content. The ranges cannot overlap
	 */
	ranges: IRange[];

	/**
	 * An optional word pattern that describes valid contents for the given ranges.
	 * If no pattern is provided, the language configuration's word pattern will be used.
	 */
	wordPattern?: RegExp;
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
	provideReferences(model: model.ITextModel, position: Position, context: ReferenceContext, token: CancellationToken): ProviderResult<Location[]>;
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

export interface LocationLink {
	/**
	 * A range to select where this link originates from.
	 */
	originSelectionRange?: IRange;

	/**
	 * The target uri this link points to.
	 */
	uri: URI;

	/**
	 * The full range this link points to.
	 */
	range: IRange;

	/**
	 * A range to select this link points to. Must be contained
	 * in `LocationLink.range`.
	 */
	targetSelectionRange?: IRange;
}

/**
 * @internal
 */
export function isLocationLink(thing: any): thing is LocationLink {
	return thing
		&& URI.isUri((thing as LocationLink).uri)
		&& Range.isIRange((thing as LocationLink).range)
		&& (Range.isIRange((thing as LocationLink).originSelectionRange) || Range.isIRange((thing as LocationLink).targetSelectionRange));
}

export type Definition = Location | Location[] | LocationLink[];

/**
 * The definition provider interface defines the contract between extensions and
 * the [go to definition](https://code.visualstudio.com/docs/editor/editingevolved#_go-to-definition)
 * and peek definition features.
 */
export interface DefinitionProvider {
	/**
	 * Provide the definition of the symbol at the given position and document.
	 */
	provideDefinition(model: model.ITextModel, position: Position, token: CancellationToken): ProviderResult<Definition | LocationLink[]>;
}

/**
 * The definition provider interface defines the contract between extensions and
 * the [go to definition](https://code.visualstudio.com/docs/editor/editingevolved#_go-to-definition)
 * and peek definition features.
 */
export interface DeclarationProvider {
	/**
	 * Provide the declaration of the symbol at the given position and document.
	 */
	provideDeclaration(model: model.ITextModel, position: Position, token: CancellationToken): ProviderResult<Definition | LocationLink[]>;
}

/**
 * The implementation provider interface defines the contract between extensions and
 * the go to implementation feature.
 */
export interface ImplementationProvider {
	/**
	 * Provide the implementation of the symbol at the given position and document.
	 */
	provideImplementation(model: model.ITextModel, position: Position, token: CancellationToken): ProviderResult<Definition | LocationLink[]>;
}

/**
 * The type definition provider interface defines the contract between extensions and
 * the go to type definition feature.
 */
export interface TypeDefinitionProvider {
	/**
	 * Provide the type definition of the symbol at the given position and document.
	 */
	provideTypeDefinition(model: model.ITextModel, position: Position, token: CancellationToken): ProviderResult<Definition | LocationLink[]>;
}

/**
 * A symbol kind.
 */
export const enum SymbolKind {
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
export const symbolKindNames: { [symbol: number]: string } = {
	[SymbolKind.Array]: localize('Array', "array"),
	[SymbolKind.Boolean]: localize('Boolean', "boolean"),
	[SymbolKind.Class]: localize('Class', "class"),
	[SymbolKind.Constant]: localize('Constant', "constant"),
	[SymbolKind.Constructor]: localize('Constructor', "constructor"),
	[SymbolKind.Enum]: localize('Enum', "enumeration"),
	[SymbolKind.EnumMember]: localize('EnumMember', "enumeration member"),
	[SymbolKind.Event]: localize('Event', "event"),
	[SymbolKind.Field]: localize('Field', "field"),
	[SymbolKind.File]: localize('File', "file"),
	[SymbolKind.Function]: localize('Function', "function"),
	[SymbolKind.Interface]: localize('Interface', "interface"),
	[SymbolKind.Key]: localize('Key', "key"),
	[SymbolKind.Method]: localize('Method', "method"),
	[SymbolKind.Module]: localize('Module', "module"),
	[SymbolKind.Namespace]: localize('Namespace', "namespace"),
	[SymbolKind.Null]: localize('Null', "null"),
	[SymbolKind.Number]: localize('Number', "number"),
	[SymbolKind.Object]: localize('Object', "object"),
	[SymbolKind.Operator]: localize('Operator', "operator"),
	[SymbolKind.Package]: localize('Package', "package"),
	[SymbolKind.Property]: localize('Property', "property"),
	[SymbolKind.String]: localize('String', "string"),
	[SymbolKind.Struct]: localize('Struct', "struct"),
	[SymbolKind.TypeParameter]: localize('TypeParameter', "type parameter"),
	[SymbolKind.Variable]: localize('Variable', "variable"),
};

/**
 * @internal
 */
export function getAriaLabelForSymbol(symbolName: string, kind: SymbolKind): string {
	return localize('symbolAriaLabel', '{0} ({1})', symbolName, symbolKindNames[kind]);
}

export const enum SymbolTag {
	Deprecated = 1,
}

/**
 * @internal
 */
export namespace SymbolKinds {

	const byKind = new Map<SymbolKind, ThemeIcon>();
	byKind.set(SymbolKind.File, Codicon.symbolFile);
	byKind.set(SymbolKind.Module, Codicon.symbolModule);
	byKind.set(SymbolKind.Namespace, Codicon.symbolNamespace);
	byKind.set(SymbolKind.Package, Codicon.symbolPackage);
	byKind.set(SymbolKind.Class, Codicon.symbolClass);
	byKind.set(SymbolKind.Method, Codicon.symbolMethod);
	byKind.set(SymbolKind.Property, Codicon.symbolProperty);
	byKind.set(SymbolKind.Field, Codicon.symbolField);
	byKind.set(SymbolKind.Constructor, Codicon.symbolConstructor);
	byKind.set(SymbolKind.Enum, Codicon.symbolEnum);
	byKind.set(SymbolKind.Interface, Codicon.symbolInterface);
	byKind.set(SymbolKind.Function, Codicon.symbolFunction);
	byKind.set(SymbolKind.Variable, Codicon.symbolVariable);
	byKind.set(SymbolKind.Constant, Codicon.symbolConstant);
	byKind.set(SymbolKind.String, Codicon.symbolString);
	byKind.set(SymbolKind.Number, Codicon.symbolNumber);
	byKind.set(SymbolKind.Boolean, Codicon.symbolBoolean);
	byKind.set(SymbolKind.Array, Codicon.symbolArray);
	byKind.set(SymbolKind.Object, Codicon.symbolObject);
	byKind.set(SymbolKind.Key, Codicon.symbolKey);
	byKind.set(SymbolKind.Null, Codicon.symbolNull);
	byKind.set(SymbolKind.EnumMember, Codicon.symbolEnumMember);
	byKind.set(SymbolKind.Struct, Codicon.symbolStruct);
	byKind.set(SymbolKind.Event, Codicon.symbolEvent);
	byKind.set(SymbolKind.Operator, Codicon.symbolOperator);
	byKind.set(SymbolKind.TypeParameter, Codicon.symbolTypeParameter);
	/**
	 * @internal
	 */
	export function toIcon(kind: SymbolKind): ThemeIcon {
		let icon = byKind.get(kind);
		if (!icon) {
			console.info('No codicon found for SymbolKind ' + kind);
			icon = Codicon.symbolProperty;
		}
		return icon;
	}
}

export interface DocumentSymbol {
	name: string;
	detail: string;
	kind: SymbolKind;
	tags: ReadonlyArray<SymbolTag>;
	containerName?: string;
	range: IRange;
	selectionRange: IRange;
	children?: DocumentSymbol[];
}

/**
 * The document symbol provider interface defines the contract between extensions and
 * the [go to symbol](https://code.visualstudio.com/docs/editor/editingevolved#_go-to-symbol)-feature.
 */
export interface DocumentSymbolProvider {

	displayName?: string;

	/**
	 * Provide symbol information for the given document.
	 */
	provideDocumentSymbols(model: model.ITextModel, token: CancellationToken): ProviderResult<DocumentSymbol[]>;
}

export interface TextEdit {
	range: IRange;
	text: string;
	eol?: model.EndOfLineSequence;
}

/** @internal */
export abstract class TextEdit {
	static asEditOperation(edit: TextEdit): ISingleEditOperation {
		return EditOperation.replace(Range.lift(edit.range), edit.text);
	}
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
	 * @internal
	 */
	readonly extensionId?: ExtensionIdentifier;

	readonly displayName?: string;

	/**
	 * Provide formatting edits for a whole document.
	 */
	provideDocumentFormattingEdits(model: model.ITextModel, options: FormattingOptions, token: CancellationToken): ProviderResult<TextEdit[]>;
}
/**
 * The document formatting provider interface defines the contract between extensions and
 * the formatting-feature.
 */
export interface DocumentRangeFormattingEditProvider {
	/**
	 * @internal
	 */
	readonly extensionId?: ExtensionIdentifier;

	readonly displayName?: string;

	/**
	 * Provide formatting edits for a range in a document.
	 *
	 * The given range is a hint and providers can decide to format a smaller
	 * or larger range. Often this is done by adjusting the start and end
	 * of the range to full syntax nodes.
	 */
	provideDocumentRangeFormattingEdits(model: model.ITextModel, range: Range, options: FormattingOptions, token: CancellationToken): ProviderResult<TextEdit[]>;

	provideDocumentRangesFormattingEdits?(model: model.ITextModel, ranges: Range[], options: FormattingOptions, token: CancellationToken): ProviderResult<TextEdit[]>;
}
/**
 * The document formatting provider interface defines the contract between extensions and
 * the formatting-feature.
 */
export interface OnTypeFormattingEditProvider {


	/**
	 * @internal
	 */
	readonly extensionId?: ExtensionIdentifier;

	autoFormatTriggerCharacters: string[];

	/**
	 * Provide formatting edits after a character has been typed.
	 *
	 * The given position and character should hint to the provider
	 * what range the position to expand to, like find the matching `{`
	 * when `}` has been entered.
	 */
	provideOnTypeFormattingEdits(model: model.ITextModel, position: Position, ch: string, options: FormattingOptions, token: CancellationToken): ProviderResult<TextEdit[]>;
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
	url?: URI | string;
	tooltip?: string;
}

export interface ILinksList {
	links: ILink[];
	dispose?(): void;
}
/**
 * A provider of links.
 */
export interface LinkProvider {
	provideLinks(model: model.ITextModel, token: CancellationToken): ProviderResult<ILinksList>;
	resolveLink?: (link: ILink, token: CancellationToken) => ProviderResult<ILink>;
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
 * String representations for a color
 */
export interface IColorPresentation {
	/**
	 * The label of this color presentation. It will be shown on the color
	 * picker header. By default this is also the text that is inserted when selecting
	 * this color presentation.
	 */
	label: string;
	/**
	 * An {@link TextEdit edit} which is applied to a document when selecting
	 * this presentation for the color.
	 */
	textEdit?: TextEdit;
	/**
	 * An optional array of additional {@link TextEdit text edits} that are applied when
	 * selecting this color presentation.
	 */
	additionalTextEdits?: TextEdit[];
}

/**
 * A color range is a range in a text model which represents a color.
 */
export interface IColorInformation {

	/**
	 * The range within the model.
	 */
	range: IRange;

	/**
	 * The color represented in this range.
	 */
	color: IColor;
}

/**
 * A provider of colors for editor models.
 */
export interface DocumentColorProvider {
	/**
	 * Provides the color ranges for a specific model.
	 */
	provideDocumentColors(model: model.ITextModel, token: CancellationToken): ProviderResult<IColorInformation[]>;
	/**
	 * Provide the string representations for a color.
	 */
	provideColorPresentations(model: model.ITextModel, colorInfo: IColorInformation, token: CancellationToken): ProviderResult<IColorPresentation[]>;
}

export interface SelectionRange {
	range: IRange;
}

export interface SelectionRangeProvider {
	/**
	 * Provide ranges that should be selected from the given position.
	 */
	provideSelectionRanges(model: model.ITextModel, positions: Position[], token: CancellationToken): ProviderResult<SelectionRange[][]>;
}

export interface FoldingContext {
}
/**
 * A provider of folding ranges for editor models.
 */
export interface FoldingRangeProvider {

	/**
	 * @internal
	 */
	readonly id?: string;

	/**
	 * An optional event to signal that the folding ranges from this provider have changed.
	 */
	onDidChange?: Event<this>;

	/**
	 * Provides the folding ranges for a specific model.
	 */
	provideFoldingRanges(model: model.ITextModel, context: FoldingContext, token: CancellationToken): ProviderResult<FoldingRange[]>;
}

export interface FoldingRange {

	/**
	 * The one-based start line of the range to fold. The folded area starts after the line's last character.
	 */
	start: number;

	/**
	 * The one-based end line of the range to fold. The folded area ends with the line's last character.
	 */
	end: number;

	/**
	 * Describes the {@link FoldingRangeKind Kind} of the folding range such as {@link FoldingRangeKind.Comment Comment} or
	 * {@link FoldingRangeKind.Region Region}. The kind is used to categorize folding ranges and used by commands
	 * like 'Fold all comments'. See
	 * {@link FoldingRangeKind} for an enumeration of standardized kinds.
	 */
	kind?: FoldingRangeKind;
}
export class FoldingRangeKind {
	/**
	 * Kind for folding range representing a comment. The value of the kind is 'comment'.
	 */
	static readonly Comment = new FoldingRangeKind('comment');
	/**
	 * Kind for folding range representing a import. The value of the kind is 'imports'.
	 */
	static readonly Imports = new FoldingRangeKind('imports');
	/**
	 * Kind for folding range representing regions (for example marked by `#region`, `#endregion`).
	 * The value of the kind is 'region'.
	 */
	static readonly Region = new FoldingRangeKind('region');

	/**
	 * Returns a {@link FoldingRangeKind} for the given value.
	 *
	 * @param value of the kind.
	 */
	static fromValue(value: string) {
		switch (value) {
			case 'comment': return FoldingRangeKind.Comment;
			case 'imports': return FoldingRangeKind.Imports;
			case 'region': return FoldingRangeKind.Region;
		}
		return new FoldingRangeKind(value);
	}

	/**
	 * Creates a new {@link FoldingRangeKind}.
	 *
	 * @param value of the kind.
	 */
	public constructor(public value: string) {
	}
}


export interface WorkspaceEditMetadata {
	needsConfirmation: boolean;
	label: string;
	description?: string;
	/**
	 * @internal
	 */
	iconPath?: ThemeIcon | URI | { light: URI; dark: URI };
}

export interface WorkspaceFileEditOptions {
	overwrite?: boolean;
	ignoreIfNotExists?: boolean;
	ignoreIfExists?: boolean;
	recursive?: boolean;
	copy?: boolean;
	folder?: boolean;
	skipTrashBin?: boolean;
	maxSize?: number;

	/**
	 * @internal
	 */
	contents?: Promise<VSBuffer>;
}

export interface IWorkspaceFileEdit {
	oldResource?: URI;
	newResource?: URI;
	options?: WorkspaceFileEditOptions;
	metadata?: WorkspaceEditMetadata;
}

export interface IWorkspaceTextEdit {
	resource: URI;
	textEdit: TextEdit & { insertAsSnippet?: boolean };
	versionId: number | undefined;
	metadata?: WorkspaceEditMetadata;
}

export interface WorkspaceEdit {
	edits: Array<IWorkspaceTextEdit | IWorkspaceFileEdit>;
}

export interface Rejection {
	rejectReason?: string;
}
export interface RenameLocation {
	range: IRange;
	text: string;
}

export interface RenameProvider {
	provideRenameEdits(model: model.ITextModel, position: Position, newName: string, token: CancellationToken): ProviderResult<WorkspaceEdit & Rejection>;
	resolveRenameLocation?(model: model.ITextModel, position: Position, token: CancellationToken): ProviderResult<RenameLocation & Rejection>;
}

export enum NewSymbolNameTag {
	AIGenerated = 1
}

export enum NewSymbolNameTriggerKind {
	Invoke = 0,
	Automatic = 1,
}

export interface NewSymbolName {
	readonly newSymbolName: string;
	readonly tags?: readonly NewSymbolNameTag[];
}

export interface NewSymbolNamesProvider {
	supportsAutomaticNewSymbolNamesTriggerKind?: Promise<boolean | undefined>;
	provideNewSymbolNames(model: model.ITextModel, range: IRange, triggerKind: NewSymbolNameTriggerKind, token: CancellationToken): ProviderResult<NewSymbolName[]>;
}

export interface Command {
	id: string;
	title: string;
	tooltip?: string;
	arguments?: any[];
}

/**
 * @internal
 */
export namespace Command {

	/**
	 * @internal
	 */
	export function is(obj: any): obj is Command {
		if (!obj || typeof obj !== 'object') {
			return false;
		}
		return typeof (<Command>obj).id === 'string' &&
			typeof (<Command>obj).title === 'string';
	}
}

/**
 * @internal
 */
export interface CommentThreadTemplate {
	controllerHandle: number;
	label: string;
	acceptInputCommand?: Command;
	additionalCommands?: Command[];
	deleteCommand?: Command;
}

/**
 * @internal
 */
export interface CommentInfo<T = IRange> {
	extensionId?: string;
	threads: CommentThread<T>[];
	pendingCommentThreads?: PendingCommentThread[];
	commentingRanges: CommentingRanges;
}


/**
 * @internal
 */
export interface CommentingRangeResourceHint {
	schemes: readonly string[];
}

/**
 * @internal
 */
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

/**
 * @internal
 */
export enum CommentThreadState {
	Unresolved = 0,
	Resolved = 1
}

/**
 * @internal
 */
export enum CommentThreadApplicability {
	Current = 0,
	Outdated = 1
}

/**
 * @internal
 */
export interface CommentWidget {
	commentThread: CommentThread;
	comment?: Comment;
	input: string;
	onDidChangeInput: Event<string>;
}

/**
 * @internal
 */
export interface CommentInput {
	value: string;
	uri: URI;
}

export interface CommentThreadRevealOptions {
	preserveFocus: boolean;
	focusReply: boolean;
}

/**
 * @internal
 */
export interface CommentThread<T = IRange> {
	isDocumentCommentThread(): this is CommentThread<IRange>;
	commentThreadHandle: number;
	controllerHandle: number;
	extensionId?: string;
	threadId: string;
	resource: string | null;
	range: T | undefined;
	label: string | undefined;
	contextValue: string | undefined;
	comments: Comment[] | undefined;
	onDidChangeComments: Event<readonly Comment[] | undefined>;
	collapsibleState?: CommentThreadCollapsibleState;
	initialCollapsibleState?: CommentThreadCollapsibleState;
	onDidChangeInitialCollapsibleState: Event<CommentThreadCollapsibleState | undefined>;
	state?: CommentThreadState;
	applicability?: CommentThreadApplicability;
	canReply: boolean;
	input?: CommentInput;
	onDidChangeInput: Event<CommentInput | undefined>;
	onDidChangeRange: Event<T | undefined>;
	onDidChangeLabel: Event<string | undefined>;
	onDidChangeCollapsibleState: Event<CommentThreadCollapsibleState | undefined>;
	onDidChangeState: Event<CommentThreadState | undefined>;
	onDidChangeCanReply: Event<boolean>;
	isDisposed: boolean;
	isTemplate: boolean;
}

/**
 * @internal
 */
export interface AddedCommentThread<T = IRange> extends CommentThread<T> {
	editorId?: string;
}

/**
 * @internal
 */

export interface CommentingRanges {
	readonly resource: URI;
	ranges: IRange[];
	fileComments: boolean;
}

export interface CommentAuthorInformation {
	name: string;
	iconPath?: UriComponents;

}

/**
 * @internal
 */
export interface CommentReaction {
	readonly label?: string;
	readonly iconPath?: UriComponents;
	readonly count?: number;
	readonly hasReacted?: boolean;
	readonly canEdit?: boolean;
	readonly reactors?: readonly string[];
}

/**
 * @internal
 */
export interface CommentOptions {
	/**
	 * An optional string to show on the comment input box when it's collapsed.
	 */
	prompt?: string;

	/**
	 * An optional string to show as placeholder in the comment input box when it's focused.
	 */
	placeHolder?: string;
}

/**
 * @internal
 */
export enum CommentMode {
	Editing = 0,
	Preview = 1
}

/**
 * @internal
 */
export enum CommentState {
	Published = 0,
	Draft = 1
}

/**
 * @internal
 */
export interface Comment {
	readonly uniqueIdInThread: number;
	readonly body: string | IMarkdownString;
	readonly userName: string;
	readonly userIconPath?: UriComponents;
	readonly contextValue?: string;
	readonly commentReactions?: CommentReaction[];
	readonly label?: string;
	readonly mode?: CommentMode;
	readonly timestamp?: string;
}

export interface PendingCommentThread {
	body: string;
	range: IRange | undefined;
	uri: URI;
	uniqueOwner: string;
	isReply: boolean;
}

/**
 * @internal
 */
export interface CommentThreadChangedEvent<T> {
	/**
	 * Pending comment threads.
	 */
	readonly pending: PendingCommentThread[];

	/**
	 * Added comment threads.
	 */
	readonly added: AddedCommentThread<T>[];

	/**
	 * Removed comment threads.
	 */
	readonly removed: CommentThread<T>[];

	/**
	 * Changed comment threads.
	 */
	readonly changed: CommentThread<T>[];
}

export interface CodeLens {
	range: IRange;
	id?: string;
	command?: Command;
}

export interface CodeLensList {
	lenses: CodeLens[];
	dispose(): void;
}

export interface CodeLensProvider {
	onDidChange?: Event<this>;
	provideCodeLenses(model: model.ITextModel, token: CancellationToken): ProviderResult<CodeLensList>;
	resolveCodeLens?(model: model.ITextModel, codeLens: CodeLens, token: CancellationToken): ProviderResult<CodeLens>;
}


export enum InlayHintKind {
	Type = 1,
	Parameter = 2,
}

export interface InlayHintLabelPart {
	label: string;
	tooltip?: string | IMarkdownString;
	// collapsible?: boolean;
	command?: Command;
	location?: Location;
}

export interface InlayHint {
	label: string | InlayHintLabelPart[];
	tooltip?: string | IMarkdownString;
	textEdits?: TextEdit[];
	position: IPosition;
	kind?: InlayHintKind;
	paddingLeft?: boolean;
	paddingRight?: boolean;
}

export interface InlayHintList {
	hints: InlayHint[];
	dispose(): void;
}

export interface InlayHintsProvider {
	displayName?: string;
	onDidChangeInlayHints?: Event<void>;
	provideInlayHints(model: model.ITextModel, range: Range, token: CancellationToken): ProviderResult<InlayHintList>;
	resolveInlayHint?(hint: InlayHint, token: CancellationToken): ProviderResult<InlayHint>;
}

export interface SemanticTokensLegend {
	readonly tokenTypes: string[];
	readonly tokenModifiers: string[];
}

export interface SemanticTokens {
	readonly resultId?: string;
	readonly data: Uint32Array;
}

export interface SemanticTokensEdit {
	readonly start: number;
	readonly deleteCount: number;
	readonly data?: Uint32Array;
}

export interface SemanticTokensEdits {
	readonly resultId?: string;
	readonly edits: SemanticTokensEdit[];
}

export interface DocumentSemanticTokensProvider {
	onDidChange?: Event<void>;
	getLegend(): SemanticTokensLegend;
	provideDocumentSemanticTokens(model: model.ITextModel, lastResultId: string | null, token: CancellationToken): ProviderResult<SemanticTokens | SemanticTokensEdits>;
	releaseDocumentSemanticTokens(resultId: string | undefined): void;
}

export interface DocumentRangeSemanticTokensProvider {
	getLegend(): SemanticTokensLegend;
	provideDocumentRangeSemanticTokens(model: model.ITextModel, range: Range, token: CancellationToken): ProviderResult<SemanticTokens>;
}

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
export interface ILazyTokenizationSupport {
	get tokenizationSupport(): Promise<ITokenizationSupport | null>;
}

/**
 * @internal
 */
export class LazyTokenizationSupport implements IDisposable, ILazyTokenizationSupport {
	private _tokenizationSupport: Promise<ITokenizationSupport & IDisposable | null> | null = null;

	constructor(private readonly createSupport: () => Promise<ITokenizationSupport & IDisposable | null>) {
	}

	dispose(): void {
		if (this._tokenizationSupport) {
			this._tokenizationSupport.then((support) => {
				if (support) {
					support.dispose();
				}
			});
		}
	}

	get tokenizationSupport(): Promise<ITokenizationSupport | null> {
		if (!this._tokenizationSupport) {
			this._tokenizationSupport = this.createSupport();
		}
		return this._tokenizationSupport;
	}
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
	handleChange(languageIds: string[]): void;

	/**
	 * Register a tokenization support.
	 */
	register(languageId: string, support: ITokenizationSupport): IDisposable;

	/**
	 * Register a tokenization support factory.
	 */
	registerFactory(languageId: string, factory: ILazyTokenizationSupport): IDisposable;

	/**
	 * Get or create the tokenization support for a language.
	 * Returns `null` if not found.
	 */
	getOrCreate(languageId: string): Promise<ITokenizationSupport | null>;

	/**
	 * Get the tokenization support for a language.
	 * Returns `null` if not found.
	 */
	get(languageId: string): ITokenizationSupport | null;

	/**
	 * Returns false if a factory is still pending.
	 */
	isResolved(languageId: string): boolean;

	/**
	 * Set the new color map that all tokens will use in their ColorId binary encoded bits for foreground and background.
	 */
	setColorMap(colorMap: Color[]): void;

	getColorMap(): Color[] | null;

	getDefaultBackground(): Color | null;
}

/**
 * @internal
 */
export const TokenizationRegistry: ITokenizationRegistry = new TokenizationRegistryImpl();


/**
 * @internal
 */
export enum ExternalUriOpenerPriority {
	None = 0,
	Option = 1,
	Default = 2,
	Preferred = 3,
}

/**
 * @internal
 */
export type DropYieldTo = { readonly kind: HierarchicalKind } | { readonly mimeType: string };

/**
 * @internal
 */
export interface DocumentDropEdit {
	readonly title: string;
	readonly kind: HierarchicalKind | undefined;
	readonly handledMimeType?: string;
	readonly yieldTo?: readonly DropYieldTo[];
	insertText: string | { readonly snippet: string };
	additionalEdit?: WorkspaceEdit;
}

/**
 * @internal
 */
export interface DocumentDropEditsSession {
	edits: readonly DocumentDropEdit[];
	dispose(): void;
}

/**
 * @internal
 */
export interface DocumentDropEditProvider {
	readonly id?: string;
	readonly dropMimeTypes?: readonly string[];

	provideDocumentDropEdits(model: model.ITextModel, position: IPosition, dataTransfer: IReadonlyVSDataTransfer, token: CancellationToken): ProviderResult<DocumentDropEditsSession>;
	resolveDocumentDropEdit?(edit: DocumentDropEdit, token: CancellationToken): Promise<DocumentDropEdit>;
}

export interface DocumentContextItem {
	readonly uri: URI;
	readonly version: number;
	readonly ranges: IRange[];
}

export interface MappedEditsContext {
	/** The outer array is sorted by priority - from highest to lowest. The inner arrays contain elements of the same priority. */
	documents: DocumentContextItem[][];
}

export interface MappedEditsProvider {
	/**
	 * @internal
	 */
	readonly displayName: string; // internal

	/**
	 * Provider maps code blocks from the chat into a workspace edit.
	 *
	 * @param document The document to provide mapped edits for.
	 * @param codeBlocks Code blocks that come from an LLM's reply.
	 * 						"Apply in Editor" in the panel chat only sends one edit that the user clicks on, but inline chat can send multiple blocks and let the lang server decide what to do with them.
	 * @param context The context for providing mapped edits.
	 * @param token A cancellation token.
	 * @returns A provider result of text edits.
	 */
	provideMappedEdits(
		document: model.ITextModel,
		codeBlocks: string[],
		context: MappedEditsContext,
		token: CancellationToken
	): Promise<WorkspaceEdit | null>;
}

export interface IInlineEdit {
	text: string;
	range: IRange;
	accepted?: Command;
	rejected?: Command;
}

export interface IInlineEditContext {
	triggerKind: InlineEditTriggerKind;
}

export enum InlineEditTriggerKind {
	Invoke = 0,
	Automatic = 1,
}

export interface InlineEditProvider<T extends IInlineEdit = IInlineEdit> {
	provideInlineEdit(model: model.ITextModel, context: IInlineEditContext, token: CancellationToken): ProviderResult<T>;
	freeInlineEdit(edit: T): void;
}
