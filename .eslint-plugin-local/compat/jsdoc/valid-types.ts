/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, RuleMeta, Visitor } from '@oxlint/plugins';
import { visitAllJSDocComments, type Spec } from './jsdocUtils.ts';

//#region Syntax of types, namepaths and names

interface Token {
	readonly kind: 'name' | 'number' | 'string' | 'template' | 'punctuation' | 'end';
	readonly value: string;
}

const identifier = /^[\p{ID_Start}$_](?:[\p{ID_Continue}$]|\u200c|\u200d)*/u;
const numberLiteral = /^-?(?:\d+(?:\.\d+)?|(?<=-)\.\d+)(?:e[+-]?\d+)?n?/i;
const punctuations = ['=>', '...', '(', ')', '[', ']', '{', '}', '<', '>', ',', ';', ':', '?', '!', '=', '|', '&', '*', '.', '#', '~', '@', '+', '-', '/'];

class ParseError extends Error { }

/**
 * The error of a type that is missing, which ends a list after its first member.
 */
class MissingTypeError extends ParseError { }

function tokenize(text: string): Token[] {
	const tokens: Token[] = [];
	let rest = text;
	while (true) {
		rest = rest.trimStart();
		if (!rest) {
			tokens.push({ kind: 'end', value: '' });
			return tokens;
		}
		let match: RegExpExecArray | null;
		if ((match = numberLiteral.exec(rest))) {
			tokens.push({ kind: 'number', value: match[0] });
		} else if ((match = identifier.exec(rest))) {
			tokens.push({ kind: 'name', value: match[0] });
		} else if ((match = /^"(?:[^"\\]|\\.)*"|^'(?:[^'\\]|\\.)*'/.exec(rest))) {
			tokens.push({ kind: 'string', value: match[0] });
		} else if (rest[0] === '`') {
			const end = templateEnd(rest);
			tokens.push({ kind: 'template', value: rest.slice(0, end) });
			rest = rest.slice(end);
			continue;
		} else {
			const punctuation = punctuations.find(p => rest.startsWith(p));
			if (!punctuation) {
				throw new ParseError(`Unexpected character ${rest[0]}`);
			}
			tokens.push({ kind: 'punctuation', value: punctuation });
			rest = rest.slice(punctuation.length);
			continue;
		}
		rest = rest.slice(match[0].length);
	}
}

/**
 * Returns the length of the template literal at the start of `text`, with its `${...}` placeholders.
 */
function templateEnd(text: string): number {
	let i = 1;
	while (i < text.length) {
		const ch = text[i];
		if (ch === '\\') {
			i += 2;
		} else if (ch === '`') {
			return i + 1;
		} else if (ch === '$' && text[i + 1] === '{') {
			let depth = 1;
			const start = i + 2;
			i = start;
			while (i < text.length && depth) {
				if (text[i] === '{') {
					depth++;
				} else if (text[i] === '}') {
					depth--;
				}
				i++;
			}
			if (depth || !text.slice(start, i - 1).trim()) {
				throw new ParseError('Invalid template literal');
			}
		} else {
			i++;
		}
	}
	throw new ParseError('Unterminated template literal');
}

/**
 * What a parsed type is, as far as the grammar needs to know. `function` is the name `function` (which is not
 * followed by parameters).
 */
type Kind = 'name' | 'reserved' | 'function' | 'array' | 'tuple' | 'nullable-suffix' | 'variadic' | 'other';

/**
 * Names that are not types when they are the whole type.
 */
const reservedRootNames = new Set([
	'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else', 'export', 'extends', 'finally', 'for',
	'function', 'if', 'import', 'in', 'instanceof', 'new', 'return', 'super', 'switch', 'throw', 'try', 'typeof', 'var', 'while', 'with',
	'enum', 'let', 'static', 'yield', 'implements', 'interface', 'package', 'private', 'protected', 'public', 'arguments', 'eval', 'await',
]);

/**
 * How tightly the operators of types bind, from loosest to tightest.
 */
const Precedence = {
	All: 0, ParameterList: 1, Object: 2, KeyValue: 3, IndexBrackets: 4, Union: 5, Intersection: 6, Prefix: 7, Infix: 8, Symbol: 10, Optional: 11,
	Nullable: 12, KeyOf: 13, Array: 16, Generic: 17, NamePath: 18,
} as const;
type Precedence = typeof Precedence[keyof typeof Precedence];

const terminators = new Set([')', ']', '>', '}', ',', ';', '|']);

/**
 * The tokens after which `?` is the unknown type rather than the prefix of a nullable type.
 */
const unknownTypeFollowers = new Set(['}', '|', ',', ')', '>']);

/**
 * The punctuation with which a type can start.
 */
const typeStarts = new Set(['(', '[', '{', '<', '?', '!', '*', '...', '=']);

/**
 * A parser of the `{types}` of JSDoc tags, which accepts TypeScript types and the JSDoc additions to them (`*`, `?`,
 * `?T`, `T?`, `!T`, `T!`, `=T`, `T=`, `...T`, `function(T): U`, `Foo.<T>` and `module:path`), with the quirks of the
 * TypeScript mode of `eslint-plugin-jsdoc`.
 */
class TypeParser {

	private readonly tokens: Token[];
	private index = 0;

	/**
	 * The number of object fields, named tuple members and named parameters whose type has a `?` suffix.
	 */
	nullableValues = 0;

	constructor(text: string) {
		this.tokens = tokenize(text);
	}

	private get token(): Token {
		return this.tokens[this.index];
	}

	private peek(offset = 1): Token {
		return this.tokens[Math.min(this.index + offset, this.tokens.length - 1)];
	}

	private is(value: string, token = this.token): boolean {
		return token.kind === 'punctuation' && token.value === value;
	}

	private isName(value?: string, token = this.token): boolean {
		return token.kind === 'name' && (value === undefined || token.value === value);
	}

	private next(): Token {
		return this.tokens[this.index++];
	}

	private expect(value: string): void {
		if (!this.is(value)) {
			throw new ParseError(`Expected ${value}`);
		}
		this.index++;
	}

	private skip(value: string): void {
		if (this.is(value)) {
			this.index++;
		}
	}

	private isTerminator(token = this.token): boolean {
		return token.kind === 'end' || (token.kind === 'punctuation' && terminators.has(token.value));
	}

	/**
	 * Throws the error of a property that is missing after `.`, or of a type that is not a property.
	 */
	private throwExpectedProperty(): never {
		if (this.token.kind === 'end' || (this.token.kind === 'punctuation' && !typeStarts.has(this.token.value))) {
			throw new MissingTypeError('Expected a property');
		}
		throw new ParseError('Expected a property');
	}

	/**
	 * Parses the return type of a function type, which a `:` cannot follow.
	 */
	private parseReturnType(): void {
		this.parseType(Precedence.Object);
		if (this.is(':')) {
			throw new ParseError('Unexpected :');
		}
	}

	parseRoot(): void {
		const kind = this.parseType(Precedence.All);
		if (this.token.kind !== 'end') {
			throw new ParseError('Unexpected token');
		}
		if (kind === 'reserved' || kind === 'function') {
			throw new ParseError('Unexpected reserved word');
		}
	}

	/**
	 * Parses a type with the infix and postfix operators that bind tighter than `precedence`.
	 */
	private parseType(precedence: Precedence): Kind {
		let kind = this.parsePrefix();
		while (true) {
			if (precedence < Precedence.Infix && this.isName('extends')) {
				this.next();
				// As in `eslint-plugin-jsdoc`, the `?` and `:` of a conditional type are optional.
				this.parseType(Precedence.KeyOf);
				this.skip('?');
				this.parseType(Precedence.Infix);
				this.skip(':');
				this.parseType(Precedence.Infix);
				kind = 'other';
			} else if (precedence < Precedence.Infix && this.isName('is') && kind === 'name') {
				this.next();
				this.parseType(Precedence.Infix);
				kind = 'other';
			} else if (precedence < Precedence.Union && this.is('|')) {
				this.next();
				if (kind === 'function' || this.parseType(Precedence.Union) === 'function') {
					throw new ParseError('Unexpected function');
				}
				kind = 'other';
			} else if (precedence < Precedence.Intersection && this.is('&')) {
				this.next();
				if (kind === 'function' || this.parseType(Precedence.Intersection) === 'function') {
					throw new ParseError('Unexpected function');
				}
				kind = 'other';
			} else if (precedence < Precedence.Array && this.is('[') && this.is(']', this.peek())) {
				this.index += 2;
				kind = 'array';
			} else if (precedence < Precedence.NamePath && this.is('[')) {
				this.next();
				this.parseType(Precedence.NamePath);
				this.expect(']');
				kind = 'other';
			} else if (precedence < Precedence.Generic && (this.is('<') || (this.is('.') && this.is('<', this.peek())))) {
				this.index += this.is('.') ? 1 : 0;
				this.parseGenericArguments();
				kind = 'other';
			} else if (precedence < Precedence.NamePath && this.is('.')) {
				this.next();
				if (this.token.kind === 'name' || this.token.kind === 'string' || (this.token.kind === 'number' && !this.token.value.startsWith('-'))) {
					this.next();
				} else {
					this.throwExpectedProperty();
				}
				kind = 'other';
			} else if (precedence < Precedence.Nullable && this.is('?')) {
				this.next();
				kind = 'nullable-suffix';
			} else if ((precedence < Precedence.Nullable && this.is('!')) || (precedence < Precedence.Optional && this.is('='))) {
				this.next();
				kind = 'other';
			} else {
				return kind;
			}
		}
	}

	private parseGenericArguments(): void {
		this.expect('<');
		do {
			if (this.isName('infer') && this.isName(undefined, this.peek())) {
				this.index += 2;
			} else if (this.isName('in') && (this.is(',', this.peek()) || this.is('>', this.peek()))) {
				this.next();
			} else {
				this.parseType(Precedence.ParameterList);
			}
		} while (this.is(',') && this.next());
		this.expect('>');
	}

	private parsePrefix(): Kind {
		const token = this.token;
		switch (token.kind) {
			case 'end':
				throw new MissingTypeError('Unexpected end');
			case 'number':
			case 'string':
			case 'template':
				this.next();
				return 'other';
			case 'name':
				return this.parseNamePrefix();
		}
		switch (token.value) {
			case '*':
				this.next();
				return 'other';
			case '?':
				this.next();
				if (this.token.kind !== 'end' && !unknownTypeFollowers.has(this.token.value)) {
					this.parseType(Precedence.Nullable);
				}
				return 'other';
			case '...':
				// As in `eslint-plugin-jsdoc`, a missing type after `...` ends the variadic type where it is missing.
				this.next();
				try {
					this.parseType(Precedence.Prefix);
				} catch (error) {
					if (!(error instanceof MissingTypeError)) {
						throw error;
					}
				}
				return 'variadic';
			case '!':
				this.next();
				this.parseType(Precedence.Nullable);
				return 'other';
			case '=':
				this.next();
				this.parseType(Precedence.Optional);
				return 'other';
			case '(':
				return this.parseParenthesisOrArrow();
			case '[':
				this.parseTuple();
				return 'tuple';
			case '{':
				this.parseObject();
				return 'other';
			case '<':
				// As in `eslint-plugin-jsdoc`, the type parameters of a generic function type need no closing `>`.
				this.parseTypeParameters(false);
				if (!this.is('(')) {
					throw new MissingTypeError('Expected parameters');
				}
				this.parseParameters(true);
				this.expect('=>');
				this.parseReturnType();
				return 'other';
		}
		throw new MissingTypeError('Unexpected token');
	}

	private parseNamePrefix(): Kind {
		const name = this.next().value;
		switch (name) {
			case 'keyof':
				this.parseType(Precedence.KeyOf);
				return 'other';
			case 'typeof':
				this.parseType(Precedence.KeyOf);
				return 'other';
			case 'import':
				this.parseImport();
				return 'other';
			case 'new':
				if (!this.is('(')) {
					return 'reserved';
				}
				this.parseParameters(true);
				this.expect('=>');
				this.parseReturnType();
				return 'other';
			case 'function':
				if (!this.is('(')) {
					return 'function';
				}
				this.parseFunction();
				return 'other';
			case 'unique':
				if (this.isName('symbol')) {
					this.next();
					return 'other';
				}
				return 'name';
			case 'readonly': {
				const kind = this.parseType(Precedence.All);
				if (kind !== 'array' && kind !== 'tuple') {
					throw new ParseError('Expected an array or tuple');
				}
				return 'other';
			}
			case 'asserts':
				if (!this.isName()) {
					throw new ParseError('Expected a name');
				}
				this.next();
				if (this.isName('is')) {
					this.next();
					this.parseType(Precedence.Infix);
				}
				return 'other';
			case 'in':
			case 'infer':
			case 'is':
				throw new MissingTypeError('Unexpected keyword');
			case 'module':
				if (this.is(':')) {
					this.next();
					this.parseModulePath();
					return 'other';
				}
				return 'name';
		}
		return reservedRootNames.has(name) ? 'reserved' : 'name';
	}

	private parseModulePath(): void {
		if (this.token.kind !== 'string' && !this.isName()) {
			throw new ParseError('Expected a module path');
		}
		this.next();
		while (this.is('/') && this.isName(undefined, this.peek())) {
			this.index += 2;
		}
		while ((this.is('.') || this.is('#') || this.is('~')) && (this.isName(undefined, this.peek()) || this.peek().kind === 'string')) {
			this.index += 2;
		}
	}

	private parseImport(): void {
		this.expect('(');
		if (this.token.kind !== 'string') {
			throw new ParseError('Expected a string');
		}
		this.next();
		this.expect(')');
	}

	/**
	 * Parses the parameters of a Closure function type, of which only `this`, `new` and `args` have names.
	 */
	private parseFunction(): void {
		this.parseList('(', ')', () => {
			const offset = this.is('...') ? 1 : 0;
			if (this.is(':', this.peek(offset + 1)) && (this.isName('this', this.peek(offset)) || this.isName('new', this.peek(offset)) || this.isName('args', this.peek(offset)))) {
				this.index += offset + 2;
				this.parseValue();
			} else {
				this.parseType(Precedence.ParameterList);
			}
		});
		if (this.is(':')) {
			this.next();
			this.parseType(Precedence.Prefix);
		}
	}

	private parseTypeParameters(closed = true): void {
		this.expect('<');
		do {
			if (!this.isName()) {
				throw new ParseError('Expected a type parameter');
			}
			this.next();
			if (this.isName('extends')) {
				this.next();
				this.parseType(Precedence.Symbol);
			}
			if (this.is('=')) {
				this.next();
				this.parseType(Precedence.Symbol);
			}
		} while (this.is(',') && this.next());
		if (closed || this.is('>')) {
			this.expect('>');
		}
	}

	/**
	 * Parses `name: type`, `name?: type`, `?name: type` or `...name: type`, or returns false.
	 */
	private parseNamedValue(): boolean {
		const offset = this.is('...') || this.is('?') ? 1 : 0;
		const name = this.peek(offset);
		if (!this.isName(undefined, name) || (offset === 0 && name.value === 'module')) {
			return false;
		}
		const optional = this.is('?', this.peek(offset + 1)) && !offset ? 1 : 0;
		if (!this.is(':', this.peek(offset + 1 + optional))) {
			return false;
		}
		this.index += offset + 2 + optional;
		this.parseValue();
		return true;
	}

	private parseValue(precedence: Precedence = Precedence.KeyValue): void {
		if (this.parseType(precedence) === 'nullable-suffix') {
			this.nullableValues++;
		}
	}

	/**
	 * Parses the parameters of a function type, which have names, or (with `allowUnnamed`) are names.
	 */
	private parseParameters(allowUnnamed: boolean): void {
		this.parseList('(', ')', () => {
			if (this.parseNamedValue()) {
				return;
			}
			const start = this.index;
			const kind = this.parseType(Precedence.ParameterList);
			if (!allowUnnamed || this.index !== start + 1 || (kind !== 'name' && kind !== 'reserved' && kind !== 'function')) {
				throw new ParseError('Expected a parameter');
			}
		});
	}

	/**
	 * Parses a list separated by commas, which may end with a comma. As in `eslint-plugin-jsdoc`, a missing type in
	 * a member after the first ends the list.
	 */
	private parseList(open: string, close: string, parseMember: () => void): void {
		this.expect(open);
		let first = true;
		while (!this.is(close)) {
			try {
				parseMember();
			} catch (error) {
				if (first || !(error instanceof MissingTypeError)) {
					throw error;
				}
				break;
			}
			first = false;
			if (!this.is(',')) {
				break;
			}
			this.next();
		}
		this.expect(close);
	}

	private parseParenthesisOrArrow(): Kind {
		const start = this.index;
		const nullableValues = this.nullableValues;
		if (succeeds(() => this.parseParameters(true)) && this.is('=>')) {
			this.next();
			this.parseReturnType();
			return 'other';
		}
		this.index = start + 1;
		this.nullableValues = nullableValues;
		const kind = this.parseType(Precedence.All);
		this.expect(')');
		return kind === 'reserved' || kind === 'name' ? kind : 'other';
	}

	/**
	 * Parses a tuple, whose members all have names or all have none, and only the last of which is a rest member.
	 */
	private parseTuple(): void {
		let named: boolean | undefined;
		let rest = false;
		this.parseList('[', ']', () => {
			const isNamedRest = this.is('...');
			const isNamed = this.parseNamedValue();
			const isRest = isNamed ? isNamedRest : this.parseType(Precedence.ParameterList) === 'variadic';
			if (rest) {
				throw new ParseError('Expected the rest member last');
			}
			rest = isRest;
			if (named !== undefined && named !== isNamed) {
				throw new ParseError('Expected names on all members or none');
			}
			named = isNamed;
		});
	}

	private parseObject(): void {
		this.expect('{');
		while (!this.is('}')) {
			this.parseField();
			if (!this.is(',') && !this.is(';')) {
				break;
			}
			this.next();
		}
		this.expect('}');
	}

	private parseSignature(): void {
		if (this.is('<')) {
			this.parseTypeParameters();
		}
		this.parseParameters(false);
		this.expect(':');
		this.parseType(Precedence.Object);
	}

	private parseField(): void {
		const following = this.peek();
		if (this.isName('readonly') && !this.isTerminator(following) && !this.is(':', following) && !this.is('?', following) && !this.is('(', following)) {
			this.next();
		}
		if (this.isName('new') && this.is('(', this.peek())) {
			this.next();
			this.parseSignature();
			return;
		}
		if (this.is('(') || this.is('<')) {
			this.parseSignature();
			return;
		}
		if (this.is('[')) {
			this.next();
			const isIndexSignature = this.isName() && this.is(':', this.peek());
			if (isIndexSignature || (this.isName() && this.isName('in', this.peek()))) {
				this.index += 2;
			}
			this.parseType(Precedence.Object);
			this.expect(']');
			if (this.is('?') && !isIndexSignature) {
				this.next();
			}
			if (this.is('(')) {
				this.parseSignature();
				return;
			}
			this.expect(':');
			this.parseValue(Precedence.IndexBrackets);
			return;
		}
		if (this.is('?') && this.isName(undefined, this.peek())) {
			this.next();
		}
		if (this.token.kind !== 'name' && this.token.kind !== 'string' && this.token.kind !== 'number') {
			throw new ParseError('Expected a property');
		}
		this.next();
		if (this.is('(') || this.is('<')) {
			this.parseSignature();
			return;
		}
		if (this.is('?')) {
			this.next();
			this.expect(':');
		} else if (this.is(':')) {
			this.next();
		} else {
			return;
		}
		this.parseValue();
	}
}

/**
 * A parser of namepaths such as `module:foo/bar`, `Foo#bar`, `Foo~bar`, `Foo#event:bar` or `Foo.<T>`, and, with
 * `namesOnly`, of names such as `T`, `T[]` or `Foo<T>`.
 */
class NamePathParser {

	private readonly tokens: Token[];
	private readonly namesOnly: boolean;
	private index = 0;

	constructor(text: string, namesOnly: boolean) {
		this.tokens = tokenize(text);
		this.namesOnly = namesOnly;
	}

	private is(value: string, offset = 0): boolean {
		const token = this.tokens[Math.min(this.index + offset, this.tokens.length - 1)];
		return token.kind === 'punctuation' && token.value === value;
	}

	private kind(offset = 0): Token['kind'] {
		return this.tokens[Math.min(this.index + offset, this.tokens.length - 1)].kind;
	}

	private value(offset = 0): string {
		return this.tokens[Math.min(this.index + offset, this.tokens.length - 1)].value;
	}

	parseRoot(): void {
		this.parsePath();
		if (this.kind() !== 'end') {
			throw new ParseError('Unexpected token');
		}
	}

	private parsePath(): void {
		if (this.kind() !== 'name') {
			throw new ParseError('Expected a name');
		}
		if (!this.namesOnly && this.value() === 'module' && this.is(':', 1)) {
			this.index += 2;
			if (this.kind() === 'string') {
				this.index++;
			} else if (this.kind() === 'name') {
				this.index++;
				while (this.is('/') && this.kind(1) === 'name') {
					this.index += 2;
				}
			} else {
				throw new ParseError('Expected a module path');
			}
		} else {
			this.index++;
		}
		while (true) {
			if (this.is('<') || (this.is('.') && this.is('<', 1))) {
				this.index += this.is('.') ? 1 : 0;
				this.parseArguments();
			} else if (this.is('[') && this.is(']', 1)) {
				this.index += 2;
			} else if (this.namesOnly) {
				return;
			} else if (this.is('[') && this.kind(1) === 'name' && this.is(']', 2)) {
				this.index += 3;
			} else if (this.is('.') || this.is('#') || this.is('~')) {
				const separator = this.value();
				this.index++;
				if (separator !== '.' && this.value() === 'event' && this.kind() === 'name' && this.is(':', 1) && this.kind(2) === 'name') {
					this.index += 3;
				} else if (this.kind() === 'name' || this.kind() === 'string' || (separator === '.' && this.kind() === 'number' && !this.value().startsWith('-'))) {
					this.index++;
				} else {
					throw new ParseError('Expected a property');
				}
			} else {
				return;
			}
		}
	}

	private parseArguments(): void {
		this.index++;
		do {
			if (this.value() === 'infer' && this.kind() === 'name' && this.kind(1) === 'name') {
				this.index += 2;
			} else {
				this.parsePath();
			}
		} while (this.is(',') && ++this.index);
		if (!this.is('>')) {
			throw new ParseError('Expected >');
		}
		this.index++;
	}
}

function succeeds(parse: () => void): boolean {
	try {
		parse();
		return true;
	} catch (error) {
		if (error instanceof ParseError) {
			return false;
		}
		throw error;
	}
}

function isValidNamePath(text: string): boolean {
	return succeeds(() => new NamePathParser(text, false).parseRoot());
}

function isValidName(text: string): boolean {
	return succeeds(() => new NamePathParser(text, true).parseRoot());
}

//#endregion

//#region Tags

type Answer = boolean | 'otherMode';

/**
 * What a tag may or must have in TypeScript mode. `'otherMode'` means that another mode of JSDoc (`jsdoc`, `closure`
 * or `permissive`) differs, which the messages mention.
 */
interface TagStructure {
	/** Whether the tag may have a name (default true). */
	readonly mightHaveName?: Answer;
	/** Whether the tag may have a `{type}` (default true). */
	readonly mightHaveType?: Answer;
	/** Whether the tag must have a name (default false). */
	readonly mustHaveName?: Answer;
	/** Whether the tag must have a `{type}` (default false). */
	readonly mustHaveType?: Answer;
	/** Whether the tag must have a `{type}` or a name (default false). */
	readonly mustHaveEither?: Answer;
	/** Whether the name of the tag is a namepath or a plain name. */
	readonly name?: 'namepath' | 'name';
}

const namepath: TagStructure = { name: 'namepath' };
const requiredNamepath: TagStructure = { name: 'namepath', mustHaveName: true };
const untypedNamepath: TagStructure = { name: 'namepath', mightHaveType: false };
const untypedRequiredNamepath: TagStructure = { name: 'namepath', mightHaveType: false, mustHaveName: true };
const namepathOrType: TagStructure = { name: 'namepath', mustHaveEither: true };
const untypedInTypeScript: TagStructure = { mightHaveType: 'otherMode' };
const requiredType: TagStructure = { mustHaveType: true };

const tagStructures: ReadonlyMap<string, TagStructure> = new Map([
	...['class', 'const', 'constant', 'constructor', 'func', 'member', 'method', 'namespace', 'var'].map(tag => [tag, namepath] as const),
	...['arg', 'argument', 'callback', 'event', 'param', 'prop', 'property'].map(tag => [tag, requiredNamepath] as const),
	...['constructs', 'function', 'interface', 'mixin'].map(tag => [tag, untypedNamepath] as const),
	...['emits', 'external', 'fires', 'host', 'listens', 'requires'].map(tag => [tag, untypedRequiredNamepath] as const),
	...['alias', 'augments', 'borrows', 'lends', 'memberof', 'memberof!', 'mixes'].map(tag => [tag, namepathOrType] as const),
	...['export', 'package', 'private', 'protected', 'public', 'static'].map(tag => [tag, untypedInTypeScript] as const),
	...['implements', 'satisfies', 'type'].map(tag => [tag, requiredType] as const),
	['enum', { name: 'name' }],
	['typedef', { name: 'name' }],
	['exports', { name: 'namepath', mightHaveType: 'otherMode' }],
	['extends', { name: 'namepath', mustHaveEither: 'otherMode' }],
	['name', { name: 'namepath', mustHaveName: true, mustHaveEither: true }],
	['template', { name: 'namepath', mustHaveName: 'otherMode' }],
	['internal', { mightHaveName: false }],
	['this', { mightHaveName: 'otherMode', mustHaveType: 'otherMode' }],
	['tutorial', { mightHaveType: false, mustHaveName: true }],
]);

const inlineTagsWithContent = new Set(['include', 'includeCode', 'inheritDoc', 'inheritdoc', 'label', 'link', 'linkcode', 'linkplain', 'tutorial']);

/**
 * The suffix of a message about a tag that is fine in another mode of JSDoc.
 */
function modeInfo(answer: Answer, plain: boolean): string {
	return answer === plain ? '' : ' in "typescript" mode';
}

/**
 * The text of a tag after its name, as written.
 */
function getTagDescription(tag: Spec): string {
	const descriptions: string[] = [];
	for (const { tokens } of tag.source) {
		const description = ((tokens.tag && tokens.postTag) || (!tokens.tag && !tokens.name && !tokens.type && tokens.postDelimiter) || '').slice(1) + tokens.description + tokens.lineEnd;
		if (tokens.end) {
			if (description) {
				descriptions.push(description);
			}
			break;
		}
		descriptions.push(description);
	}
	return descriptions.join('\n');
}

function splitTopLevelCommas(text: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let current = '';
	for (const ch of text) {
		if (ch === '<' || ch === '{' || ch === '(') {
			depth++;
		} else if (ch === '>' || ch === '}' || ch === ')') {
			depth = Math.max(0, depth - 1);
		}
		if (ch === ',' && depth === 0) {
			parts.push(current);
			current = '';
		} else {
			current += ch;
		}
	}
	parts.push(current);
	return parts;
}

//#endregion

/**
 * `jsdoc/valid-types` with its default options, in TypeScript mode: tags have the names and `{types}` that they
 * take, and these are valid. Types are parsed with a grammar of TypeScript types and the JSDoc additions to them,
 * which may accept or reject unusual types differently from `eslint-plugin-jsdoc`.
 */
export default new class ValidTypes implements CreateRule {

	readonly meta: RuleMeta = {
		type: 'suggestion',
		docs: {
			description: 'Requires all types/namepaths to be valid JSDoc, Closure compiler, or TypeScript types (configurable in settings).',
		},
		schema: [],
	};

	create(context: Context): Visitor {
		const checkInlineTags = (tag: { inlineTags: Spec['inlineTags'] }, report: (message: string) => void) => {
			for (const inlineTag of tag.inlineTags) {
				if (inlineTagsWithContent.has(inlineTag.tag) && !inlineTag.text && !inlineTag.namepathOrURL) {
					report(`Inline tag "${inlineTag.tag}" missing content`);
				}
			}
		};

		const checkTag = (tag: Spec, report: (message: string) => void): void => {
			const validNamePath = (path: string, tagName?: string): boolean => {
				if (isValidNamePath(path)) {
					return true;
				}
				const handled = ((tagName === 'memberof' || tagName === 'memberof!') && ['#', '.', '~'].includes(path.slice(-1)) && isValidNamePath(path.slice(0, -1)))
					|| ((tagName === 'module' || tagName === 'requires') && !path.startsWith('module:') && isValidNamePath(`module:${path}`))
					|| (tagName === 'borrows' && ['#', '.', '~'].includes(path.charAt(0)) && isValidNamePath(path.slice(1)));
				if (!handled) {
					report(`Syntax error in namepath: ${path}`);
				}
				return handled;
			};

			if (tag.problems.length) {
				report(`Invalid name: ${tag.problems.map(problem => problem.message).join('; ')}`);
				return;
			}
			if (tag.tag === 'import') {
				return;
			}
			if (tag.tag === 'borrows') {
				const description = getTagDescription(tag);
				const thisNamePath = description.replace(/as\s+/, '').trim();
				if (!/as\s+/.test(description) || !thisNamePath) {
					report(`@borrows must have an "as" expression. Found "${description}"`);
				} else if (validNamePath(thisNamePath, 'borrows')) {
					validNamePath(tag.name);
				}
				return;
			}

			const structure = tagStructures.get(tag.tag) ?? {};
			const mightHaveName = structure.mightHaveName ?? true;
			if (mightHaveName !== true && tag.name) {
				report(`@${tag.tag} should not have a name${modeInfo(mightHaveName, false)}.`);
				return;
			}
			const type = tag.type.trim().startsWith('@') ? '' : tag.type;
			const mightHaveType = structure.mightHaveType ?? true;
			if (mightHaveType !== true && type) {
				report(`@${tag.tag} should not have a bracketed type${modeInfo(mightHaveType, false)}.`);
				return;
			}
			const mustHaveName = structure.mustHaveName ?? false;
			if (mustHaveName !== false && !tag.name && !['arg', 'argument', 'param', 'prop', 'property'].includes(tag.tag)) {
				report(`Tag @${tag.tag} must have a name/namepath${modeInfo(mustHaveName, true)}.`);
				return;
			}
			const mustHaveType = structure.mustHaveType ?? false;
			if (mustHaveType !== false && !type) {
				report(`Tag @${tag.tag} must have a type${modeInfo(mustHaveType, true)}.`);
				return;
			}
			const mustHaveEither = structure.mustHaveEither ?? false;
			if (mustHaveEither !== false && !type && !tag.name) {
				report(`Tag @${tag.tag} must have either a type or namepath${modeInfo(mustHaveEither, true)}.`);
				return;
			}

			if (type && (type !== 'const' || tag.tag !== 'type')) {
				let parser: TypeParser | undefined;
				if (!succeeds(() => (parser = new TypeParser(type)).parseRoot())) {
					report(`Syntax error in type: ${type}`);
				} else {
					for (let i = 0; i < parser!.nullableValues; i++) {
						report('Syntax error in type: JsdocTypeNullable');
					}
				}
			}
			if ((mustHaveName !== false || structure.name === 'namepath') && tag.name) {
				if (tag.tag !== 'template') {
					validNamePath(tag.name, tag.tag);
				} else if (!isValidNamePath(tag.name.trim())) {
					for (const part of splitTopLevelCommas(tag.name)) {
						validNamePath(part.trim().replace(/^\[?(?<name>.*?)=.*$/, '$<name>'));
					}
				}
			}
			if (structure.name === 'name' && tag.name && !isValidName(tag.name)) {
				report(`Syntax error in name: ${tag.name}`);
			}
			checkInlineTags(tag, report);
		};

		return visitAllJSDocComments(context, jsdoc => {
			for (const tag of jsdoc.block.tags) {
				checkTag(tag, message => jsdoc.report(message, tag.source[0].number));
			}
			checkInlineTags(jsdoc.block, message => jsdoc.report(message));
		});
	}
};
