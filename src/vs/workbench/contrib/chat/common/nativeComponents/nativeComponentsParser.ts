/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { INativeBar, INativeComponentsDocument, INativeTableColumn, NATIVE_COMPONENTS_LANGUAGE_ID, NATIVE_COMPONENTS_SCHEMA_VERSION, NativeColumnAlignment, NativeComponent, NativeComponentsLimits, NativeComponentTone, NativeTextVariant } from './nativeComponents.js';

export interface INativeComponentsError {
	/** A localized reason that an author can act on. */
	readonly message: string;
	/** The 1-based line of the block's source that the error refers to, when it has one. */
	readonly line: number | undefined;
}

export type NativeComponentsParseResult =
	| { readonly document: INativeComponentsDocument; readonly error?: undefined }
	| { readonly document?: undefined; readonly error: INativeComponentsError };

/**
 * Parses and validates the markup of a native components block.
 *
 * The markup looks like JSX, but nothing in it is evaluated: it consists of the tags of the
 * component catalogue with quoted literal attributes. Anything else is rejected, including
 * unknown components and attributes, expressions, and text where no text is expected, so that a
 * block either renders exactly as specified or not at all.
 *
 * @param source The text between the fences.
 * @param fenceInfo The info string of the opening fence, such as `vscode-ui` or `vscode-ui v1`.
 */
export function parseNativeComponents(source: string, fenceInfo: string = NATIVE_COMPONENTS_LANGUAGE_ID): NativeComponentsParseResult {
	try {
		checkVersion(fenceInfo);
		if (source.length > NativeComponentsLimits.sourceLength) {
			throw new MarkupError(localize('nativeComponents.tooLarge', "The block is longer than {0} characters.", NativeComponentsLimits.sourceLength));
		}
		const children = toComponents(new MarkupReader(source).readDocument(), undefined);
		if (children.length === 0) {
			throw new MarkupError(localize('nativeComponents.empty', "The block has no components."));
		}
		return { document: { version: NATIVE_COMPONENTS_SCHEMA_VERSION, children } };
	} catch (error) {
		if (error instanceof MarkupError) {
			return { error: { message: error.message, line: error.line } };
		}
		throw error;
	}
}

class MarkupError extends Error {
	constructor(message: string, readonly line?: number) {
		super(message);
	}
}

function checkVersion(fenceInfo: string): void {
	const [language, ...options] = fenceInfo.trim().split(/\s+/);
	if (language.toLowerCase() === NATIVE_COMPONENTS_LANGUAGE_ID) {
		if (options.length === 0) {
			return;
		}
		const version = options.length === 1 ? /^v(?<version>\d+)$/.exec(options[0])?.groups?.version : undefined;
		if (version !== undefined) {
			if (Number(version) === NATIVE_COMPONENTS_SCHEMA_VERSION) {
				return;
			}
			throw new MarkupError(localize('nativeComponents.unsupportedVersion', "The block uses schema version {0}, but this version of VS Code supports version {1}.", version, NATIVE_COMPONENTS_SCHEMA_VERSION));
		}
	}
	throw new MarkupError(localize('nativeComponents.fenceInfo', "The fence can only name the language {0}, optionally followed by a schema version such as v{1}.", NATIVE_COMPONENTS_LANGUAGE_ID, NATIVE_COMPONENTS_SCHEMA_VERSION));
}

//#region Markup

interface IMarkupElement {
	readonly name: string;
	readonly line: number;
	readonly attributes: ReadonlyMap<string, string>;
	readonly children: readonly IMarkupElement[];
	/** The text directly inside the element, with entities decoded and whitespace collapsed. */
	readonly text: string;
	/** The line on which {@link text} starts, when there is any. */
	readonly textLine: number | undefined;
}

type MarkupContent = Pick<IMarkupElement, 'children' | 'text' | 'textLine'>;

const namedEntities: { readonly [name: string]: string } = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'' };

/** Decodes the entities that let a literal contain markup characters. Any other `&` is kept as written. */
function decodeEntities(text: string): string {
	return text.replace(/&(?:#x(?<hex>[0-9a-fA-F]{1,6})|#(?<decimal>[0-9]{1,7})|(?<name>amp|lt|gt|quot|apos));/g, (match, hex: string | undefined, decimal: string | undefined, name: string | undefined) => {
		if (name) {
			return namedEntities[name];
		}
		const codePoint = hex ? parseInt(hex, 16) : parseInt(decimal!, 10);
		const isScalarValue = codePoint <= 0x10FFFF && (codePoint < 0xD800 || codePoint > 0xDFFF);
		return isScalarValue ? String.fromCodePoint(codePoint) : match;
	});
}

/**
 * Collapses whitespace as HTML does: only the ASCII kinds, so that a non-breaking space keeps
 * holding its words together. Text that is nothing but spaces of any kind is empty.
 */
function collapseWhitespace(text: string): string {
	return /\S/.test(text) ? text.replace(/[ \t\n\r\f]+/g, ' ').replace(/^ | $/g, '') : '';
}

/** Reads the tag structure of a block without interpreting component names or attributes. */
class MarkupReader {

	private offset = 0;
	private line = 1;
	private components = 0;

	constructor(private readonly source: string) { }

	readDocument(): readonly IMarkupElement[] {
		const content = this.readContent(undefined, 0);
		if (content.text) {
			throw new MarkupError(localize('nativeComponents.topLevelText', "Text must be inside a component, such as \"Text\"."), content.textLine);
		}
		return content.children;
	}

	private readContent(parent: string | undefined, depth: number): MarkupContent {
		const children: IMarkupElement[] = [];
		let text = '';
		let textLine: number | undefined;
		while (true) {
			const tagStart = this.source.indexOf('<', this.offset);
			const textEnd = tagStart === -1 ? this.source.length : tagStart;
			const run = this.source.substring(this.offset, textEnd);
			const brace = /[{}]/.exec(run);
			if (brace) {
				this.advance(this.offset + brace.index);
				throw this.expressionError();
			}
			const textStart = textLine === undefined ? /\S/.exec(run) : null;
			if (textStart) {
				this.advance(this.offset + textStart.index);
				textLine = this.line;
			}
			text += run;
			this.advance(textEnd);

			if (tagStart === -1) {
				if (parent !== undefined) {
					throw new MarkupError(localize('nativeComponents.unclosed', "\"{0}\" is not closed. Expected {1}.", parent, `</${parent}>`), this.line);
				}
				break;
			}
			if (this.source.startsWith('</', this.offset)) {
				this.readClosingTag(parent);
				break;
			}
			children.push(this.readElement(depth + 1));
		}
		return { children, text: collapseWhitespace(decodeEntities(text)), textLine };
	}

	private readClosingTag(parent: string | undefined): void {
		const line = this.line;
		this.advance(this.offset + 2);
		const name = this.readName();
		this.skipWhitespace();
		if (parent === undefined || name !== parent || this.source[this.offset] !== '>') {
			throw new MarkupError(parent === undefined
				? localize('nativeComponents.unexpectedClosingTag', "Unexpected closing tag {0}.", `</${name}>`)
				: localize('nativeComponents.mismatchedClosingTag', "Expected {0} to close \"{1}\".", `</${parent}>`, parent), line);
		}
		this.advance(this.offset + 1);
	}

	private readElement(depth: number): IMarkupElement {
		const line = this.line;
		this.advance(this.offset + 1);
		const name = this.readName();
		if (!name) {
			throw new MarkupError(localize('nativeComponents.unexpectedTagStart', "Expected a component name after \"<\". Write a literal \"<\" in text as {0}.", '&lt;'), line);
		}
		if (++this.components > NativeComponentsLimits.components) {
			throw new MarkupError(localize('nativeComponents.tooManyComponents', "The block has more than {0} components.", NativeComponentsLimits.components), line);
		}
		if (depth > NativeComponentsLimits.depth) {
			throw new MarkupError(localize('nativeComponents.tooDeep', "Components are nested more than {0} levels deep.", NativeComponentsLimits.depth), line);
		}

		const attributes = new Map<string, string>();
		while (true) {
			this.skipWhitespace();
			if (this.source.startsWith('/>', this.offset)) {
				this.advance(this.offset + 2);
				return { name, line, attributes, children: [], text: '', textLine: undefined };
			}
			const character = this.source[this.offset];
			if (character === '>') {
				this.advance(this.offset + 1);
				return { name, line, attributes, ...this.readContent(name, depth) };
			}
			if (character === undefined) {
				throw new MarkupError(localize('nativeComponents.unclosedTag', "The \"{0}\" tag is not closed.", name), line);
			}
			if (character === '{') {
				throw this.expressionError();
			}
			this.readAttribute(name, attributes);
		}
	}

	private readAttribute(element: string, attributes: Map<string, string>): void {
		const line = this.line;
		const name = this.readName();
		if (!name) {
			throw new MarkupError(localize('nativeComponents.unexpectedCharacter', "Unexpected \"{0}\" in the \"{1}\" tag.", this.source[this.offset], element), line);
		}
		this.skipWhitespace();
		let quote: string | undefined;
		if (this.source[this.offset] === '=') {
			this.advance(this.offset + 1);
			this.skipWhitespace();
			quote = this.source[this.offset];
		}
		if (quote === '{') {
			throw this.expressionError();
		}
		const valueEnd = quote === '"' || quote === '\'' ? this.source.indexOf(quote, this.offset + 1) : -1;
		if (valueEnd === -1) {
			throw new MarkupError(localize('nativeComponents.unquotedAttribute', "The \"{0}\" attribute of \"{1}\" needs a value in quotes.", name, element), line);
		}
		if (attributes.has(name)) {
			throw new MarkupError(localize('nativeComponents.duplicateAttribute', "The \"{0}\" attribute of \"{1}\" is set more than once.", name, element), line);
		}
		attributes.set(name, collapseWhitespace(decodeEntities(this.source.substring(this.offset + 1, valueEnd))));
		this.advance(valueEnd + 1);
	}

	private expressionError(): MarkupError {
		return new MarkupError(localize('nativeComponents.expression', "Expressions in braces are not supported. Use quoted literal values, and write a literal brace in text as {0} or {1}.", '&#123;', '&#125;'), this.line);
	}

	private readName(): string {
		const pattern = /[A-Za-z_][\w.:-]*/y;
		pattern.lastIndex = this.offset;
		const name = pattern.exec(this.source)?.[0] ?? '';
		this.offset += name.length;
		return name;
	}

	private skipWhitespace(): void {
		let end = this.offset;
		while (end < this.source.length && /\s/.test(this.source[end])) {
			end++;
		}
		this.advance(end);
	}

	/** Moves to `offset`, counting the lines that are passed. */
	private advance(offset: number): void {
		for (let index = this.offset; index < offset; index++) {
			if (this.source.charCodeAt(index) === 10 /* \n */) {
				this.line++;
			}
		}
		this.offset = offset;
	}
}

//#endregion

//#region Catalogue

const tones: readonly NativeComponentTone[] = ['neutral', 'positive', 'negative', 'warning'];
const textVariants: readonly NativeTextVariant[] = ['body', 'heading', 'caption'];
const columnAlignments: readonly NativeColumnAlignment[] = ['start', 'end'];

/** Converts the components that may appear at the top level and inside layout components. */
const componentConverters = new Map<string, (element: IMarkupElement) => NativeComponent>([
	['Stack', element => {
		checkAttributes(element, []);
		return { type: 'stack', children: toChildComponents(element) };
	}],
	['Columns', element => {
		checkAttributes(element, []);
		return { type: 'columns', children: toChildComponents(element) };
	}],
	['Text', element => {
		checkAttributes(element, ['variant']);
		return { type: 'text', variant: oneOf(element, 'variant', textVariants), text: requiredText(element) };
	}],
	['Metric', element => {
		checkAttributes(element, ['label', 'value', 'delta', 'tone']);
		checkEmpty(element);
		return { type: 'metric', label: required(element, 'label'), value: required(element, 'value'), delta: element.attributes.get('delta') || undefined, tone: oneOf(element, 'tone', tones) };
	}],
	['Badge', element => {
		checkAttributes(element, ['tone']);
		return { type: 'badge', text: requiredText(element), tone: oneOf(element, 'tone', tones) };
	}],
	['Table', element => {
		checkAttributes(element, ['caption']);
		const columns: INativeTableColumn[] = [];
		const rows: string[][] = [];
		for (const child of childElements(element, ['Column', 'Row'])) {
			if (child.name === 'Column') {
				if (rows.length > 0) {
					throw new MarkupError(localize('nativeComponents.columnAfterRow', "Every \"Column\" of a \"Table\" must come before its first \"Row\"."), child.line);
				}
				checkAttributes(child, ['align']);
				checkNoChildren(child);
				columns.push({ header: child.text, align: oneOf(child, 'align', columnAlignments) });
			} else {
				checkAttributes(child, []);
				const cells = childElements(child, ['Cell']).map(cell => {
					checkAttributes(cell, []);
					checkNoChildren(cell);
					return cell.text;
				});
				if (cells.length !== columns.length) {
					throw new MarkupError(localize('nativeComponents.cellCount', "The number of cells in this row ({0}) does not match the number of columns ({1}).", cells.length, columns.length), child.line);
				}
				rows.push(cells);
			}
		}
		checkCount(element, 'Column', columns.length, NativeComponentsLimits.tableColumns);
		checkCount(element, 'Row', rows.length, NativeComponentsLimits.tableRows);
		return { type: 'table', caption: element.attributes.get('caption') || undefined, columns, rows };
	}],
	['BarChart', element => {
		checkAttributes(element, ['title', 'unit']);
		const bars = childElements(element, ['Bar']).map((bar): INativeBar => {
			checkAttributes(bar, ['label', 'value']);
			checkEmpty(bar);
			const valueText = required(bar, 'value');
			if (!/^\d+(?:\.\d+)?$/.test(valueText) || !Number.isFinite(Number(valueText))) {
				throw new MarkupError(localize('nativeComponents.barValue', "The \"value\" of a \"Bar\" must be a number that is not negative, such as 12.5, without a unit or separators. Found \"{0}\".", valueText), bar.line);
			}
			return { label: required(bar, 'label'), value: Number(valueText), valueText };
		});
		checkCount(element, 'Bar', bars.length, NativeComponentsLimits.bars);
		return { type: 'barChart', title: required(element, 'title'), unit: element.attributes.get('unit') || undefined, bars };
	}],
	['Disclosure', element => {
		checkAttributes(element, ['summary']);
		return { type: 'disclosure', summary: required(element, 'summary'), children: toChildComponents(element) };
	}],
]);

/** The components that only have a meaning inside another one. */
const nestedComponentParents = new Map([['Column', 'Table'], ['Row', 'Table'], ['Cell', 'Row'], ['Bar', 'BarChart']]);

function toComponents(elements: readonly IMarkupElement[], parent: IMarkupElement | undefined): NativeComponent[] {
	return elements.map(element => {
		const convert = componentConverters.get(element.name);
		if (!convert) {
			throw unexpectedElementError(element, parent?.name, [...componentConverters.keys()]);
		}
		return convert(element);
	});
}

function toChildComponents(element: IMarkupElement): NativeComponent[] {
	checkNoText(element);
	if (element.children.length === 0) {
		throw new MarkupError(localize('nativeComponents.noChildren', "\"{0}\" needs at least one component inside it.", element.name), element.line);
	}
	return toComponents(element.children, element);
}

function childElements(element: IMarkupElement, allowed: readonly string[]): readonly IMarkupElement[] {
	checkNoText(element);
	for (const child of element.children) {
		if (!allowed.includes(child.name)) {
			throw unexpectedElementError(child, element.name, allowed);
		}
	}
	return element.children;
}

function unexpectedElementError(element: IMarkupElement, parent: string | undefined, allowed: readonly string[]): MarkupError {
	const expectedParent = nestedComponentParents.get(element.name);
	if (expectedParent) {
		return new MarkupError(localize('nativeComponents.misplaced', "\"{0}\" is only allowed directly inside \"{1}\".", element.name, expectedParent), element.line);
	}
	if (componentConverters.has(element.name) && parent) {
		return new MarkupError(localize('nativeComponents.notAllowedInside', "\"{0}\" is not allowed inside \"{1}\". Allowed: {2}.", element.name, parent, allowed.join(', ')), element.line);
	}
	return new MarkupError(localize('nativeComponents.unknownComponent', "Unknown component \"{0}\". Available here: {1}.", element.name, allowed.join(', ')), element.line);
}

function checkAttributes(element: IMarkupElement, allowed: readonly string[]): void {
	for (const name of element.attributes.keys()) {
		if (!allowed.includes(name)) {
			throw new MarkupError(allowed.length > 0
				? localize('nativeComponents.unknownAttribute', "Unknown attribute \"{0}\" on \"{1}\". Allowed: {2}.", name, element.name, allowed.join(', '))
				: localize('nativeComponents.noAttributes', "Unknown attribute \"{0}\" on \"{1}\", which has no attributes.", name, element.name), element.line);
		}
	}
}

function required(element: IMarkupElement, name: string): string {
	const value = element.attributes.get(name);
	if (!value) {
		throw new MarkupError(localize('nativeComponents.missingAttribute', "\"{0}\" needs a \"{1}\" attribute.", element.name, name), element.line);
	}
	return value;
}

/** Reads an attribute that selects one of `values`, the first of which is the default. */
function oneOf<T extends string>(element: IMarkupElement, name: string, values: readonly T[]): T {
	const value = element.attributes.get(name);
	if (value === undefined) {
		return values[0];
	}
	const match = values.find(candidate => candidate === value);
	if (match === undefined) {
		throw new MarkupError(localize('nativeComponents.invalidValue', "\"{0}\" is not a valid \"{1}\" for \"{2}\". Allowed: {3}.", value, name, element.name, values.join(', ')), element.line);
	}
	return match;
}

function requiredText(element: IMarkupElement): string {
	checkNoChildren(element);
	if (!element.text) {
		throw new MarkupError(localize('nativeComponents.missingText', "\"{0}\" needs text between its tags.", element.name), element.line);
	}
	return element.text;
}

function checkNoChildren(element: IMarkupElement): void {
	if (element.children.length > 0) {
		throw new MarkupError(localize('nativeComponents.textOnly', "\"{0}\" can only contain text, but contains \"{1}\".", element.name, element.children[0].name), element.children[0].line);
	}
}

function checkNoText(element: IMarkupElement): void {
	if (element.text) {
		throw new MarkupError(localize('nativeComponents.unexpectedText', "\"{0}\" cannot contain text. Put text in a \"Text\" component.", element.name), element.textLine);
	}
}

function checkEmpty(element: IMarkupElement): void {
	if (element.text || element.children.length > 0) {
		throw new MarkupError(localize('nativeComponents.notEmpty', "\"{0}\" cannot have content. Set its attributes instead.", element.name), element.textLine ?? element.children[0].line);
	}
}

function checkCount(element: IMarkupElement, child: string, count: number, limit: number): void {
	if (count === 0) {
		throw new MarkupError(localize('nativeComponents.missingChild', "\"{0}\" needs at least one \"{1}\".", element.name, child), element.line);
	}
	if (count > limit) {
		throw new MarkupError(localize('nativeComponents.tooManyChildren', "\"{0}\" has {1} \"{2}\" components, which is more than the limit of {3}.", element.name, count, child, limit), element.line);
	}
}

//#endregion
