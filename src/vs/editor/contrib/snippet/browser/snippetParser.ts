/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { CharCode } from 'vs/base/common/charCode';

export enum TokenType {
	Dollar,
	Colon,
	Comma,
	CurlyOpen,
	CurlyClose,
	Backslash,
	Forwardslash,
	Pipe,
	Int,
	VariableName,
	Format,
	EOF
}

export interface Token {
	type: TokenType;
	pos: number;
	len: number;
}


export class Scanner {

	private static _table: { [ch: number]: TokenType } = {
		[CharCode.DollarSign]: TokenType.Dollar,
		[CharCode.Colon]: TokenType.Colon,
		[CharCode.Comma]: TokenType.Comma,
		[CharCode.OpenCurlyBrace]: TokenType.CurlyOpen,
		[CharCode.CloseCurlyBrace]: TokenType.CurlyClose,
		[CharCode.Backslash]: TokenType.Backslash,
		[CharCode.Slash]: TokenType.Forwardslash,
		[CharCode.Pipe]: TokenType.Pipe,
	};

	static isDigitCharacter(ch: number): boolean {
		return ch >= CharCode.Digit0 && ch <= CharCode.Digit9;
	}

	static isVariableCharacter(ch: number): boolean {
		return ch === CharCode.Underline
			|| (ch >= CharCode.a && ch <= CharCode.z)
			|| (ch >= CharCode.A && ch <= CharCode.Z);
	}

	value: string;
	pos: number;

	constructor() {
		this.text('');
	}

	text(value: string) {
		this.value = value;
		this.pos = 0;
	}

	tokenText(token: Token): string {
		return this.value.substr(token.pos, token.len);
	}

	next(): Token {

		if (this.pos >= this.value.length) {
			return { type: TokenType.EOF, pos: this.pos, len: 0 };
		}

		let pos = this.pos;
		let len = 0;
		let ch = this.value.charCodeAt(pos);
		let type: TokenType;

		// static types
		type = Scanner._table[ch];
		if (typeof type === 'number') {
			this.pos += 1;
			return { type, pos, len: 1 };
		}

		// number
		if (Scanner.isDigitCharacter(ch)) {
			type = TokenType.Int;
			do {
				len += 1;
				ch = this.value.charCodeAt(pos + len);
			} while (Scanner.isDigitCharacter(ch));

			this.pos += len;
			return { type, pos, len };
		}

		// variable name
		if (Scanner.isVariableCharacter(ch)) {
			type = TokenType.VariableName;
			do {
				ch = this.value.charCodeAt(pos + (++len));
			} while (Scanner.isVariableCharacter(ch) || Scanner.isDigitCharacter(ch));

			this.pos += len;
			return { type, pos, len };
		}


		// format
		type = TokenType.Format;
		do {
			len += 1;
			ch = this.value.charCodeAt(pos + len);
		} while (
			!isNaN(ch)
			&& typeof Scanner._table[ch] === 'undefined' // not static token
			&& !Scanner.isDigitCharacter(ch) // not number
			&& !Scanner.isVariableCharacter(ch) // not variable
		);

		this.pos += len;
		return { type, pos, len };
	}
}

export abstract class Marker {

	readonly _markerBrand: any;

	public parent: Marker;
	protected _children: Marker[] = [];

	appendChild(child: Marker): this {
		if (child instanceof Text && this._children[this._children.length - 1] instanceof Text) {
			// this and previous child are text -> merge them
			(<Text>this._children[this._children.length - 1]).value += child.value;
		} else {
			// normal adoption of child
			child.parent = this;
			this._children.push(child);
		}
		return this;
	}

	replace(child: Marker, others: Marker[]): void {
		const { parent } = child;
		const idx = parent.children.indexOf(child);
		const newChildren = parent.children.slice(0);
		newChildren.splice(idx, 1, ...others);
		parent._children = newChildren;
		others.forEach(node => node.parent = parent);
	}

	get children(): Marker[] {
		return this._children;
	}

	get snippet(): TextmateSnippet {
		let candidate: Marker = this;
		while (true) {
			if (!candidate) {
				return undefined;
			}
			if (candidate instanceof TextmateSnippet) {
				return candidate;
			}
			candidate = candidate.parent;
		}
	}

	toString() {
		return this.children.reduce((prev, cur) => prev + cur.toString(), '');
	}

	abstract toTextmateString(): string;

	len(): number {
		return 0;
	}

	abstract clone(): Marker;
}

export class Text extends Marker {
	constructor(public value: string) {
		super();
	}
	toString() {
		return this.value;
	}
	toTextmateString(): string {
		return this.value.replace(/\$|}|\\/g, '\\$&');
	}
	len(): number {
		return this.value.length;
	}
	clone(): Text {
		return new Text(this.value);
	}
}

export class Placeholder extends Marker {

	static compareByIndex(a: Placeholder, b: Placeholder): number {
		if (a.index === b.index) {
			return 0;
		} else if (a.isFinalTabstop) {
			return 1;
		} else if (b.isFinalTabstop) {
			return -1;
		} else if (a.index < b.index) {
			return -1;
		} else if (a.index > b.index) {
			return 1;
		} else {
			return 0;
		}
	}

	constructor(public index: number) {
		super();
	}

	get isFinalTabstop() {
		return this.index === 0;
	}

	get choice(): Choice {
		return this._children.length === 1 && this._children[0] instanceof Choice
			? this._children[0] as Choice
			: undefined;
	}

	toTextmateString(): string {
		if (this.children.length === 0) {
			return `\$${this.index}`;
		} else if (this.choice) {
			return `\${${this.index}|${this.choice.toTextmateString()}|}`;
		} else {
			return `\${${this.index}:${this.children.map(child => child.toTextmateString()).join('')}}`;
		}
	}

	clone(): Placeholder {
		let ret = new Placeholder(this.index);
		ret._children = this.children.map(child => child.clone());
		return ret;
	}
}

export class Choice extends Marker {

	readonly options: Text[] = [];

	appendChild(marker: Marker): this {
		if (marker instanceof Text) {
			marker.parent = this;
			this.options.push(marker);
		}
		return this;
	}

	toString() {
		return this.options[0].value;
	}

	toTextmateString(): string {
		return this.options
			.map(option => option.value.replace(/\||,/g, '\\$&'))
			.join(',');
	}

	len(): number {
		return this.options[0].len();
	}

	clone(): Choice {
		let ret = new Choice();
		this.options.forEach(ret.appendChild, ret);
		return ret;
	}
}

export class Variable extends Marker {

	constructor(public name: string) {
		super();
	}

	resolve(resolver: VariableResolver): boolean {
		const value = resolver.resolve(this);
		if (value !== undefined) {
			this._children = [new Text(value)];
			return true;
		}
		return false;
	}

	toTextmateString(): string {
		if (this.children.length === 0) {
			return `\${${this.name}}`;
		} else {
			return `\${${this.name}:${this.children.map(child => child.toTextmateString()).join('')}}`;
		}
	}

	clone(): Variable {
		const ret = new Variable(this.name);
		ret._children = this.children.map(child => child.clone());
		return ret;
	}
}

export interface VariableResolver {
	resolve(variable: Variable): string | undefined;
}

function walk(marker: Marker[], visitor: (marker: Marker) => boolean): void {
	const stack = [...marker];
	while (stack.length > 0) {
		const marker = stack.shift();
		const recurse = visitor(marker);
		if (!recurse) {
			break;
		}
		stack.unshift(...marker.children);
	}
}

export class TextmateSnippet extends Marker {

	private _placeholders: { all: Placeholder[], last: Placeholder };

	get placeholderInfo() {
		if (!this._placeholders) {
			// fill in placeholders
			let all: Placeholder[] = [];
			let last: Placeholder;
			this.walk(function (candidate) {
				if (candidate instanceof Placeholder) {
					all.push(candidate);
					last = !last || last.index < candidate.index ? candidate : last;
				}
				return true;
			});
			this._placeholders = { all, last };
		}
		return this._placeholders;
	}

	get placeholders(): Placeholder[] {
		const { all } = this.placeholderInfo;
		return all;
	}

	offset(marker: Marker): number {
		let pos = 0;
		let found = false;
		this.walk(candidate => {
			if (candidate === marker) {
				found = true;
				return false;
			}
			pos += candidate.len();
			return true;
		});

		if (!found) {
			return -1;
		}
		return pos;
	}

	fullLen(marker: Marker): number {
		let ret = 0;
		walk([marker], marker => {
			ret += marker.len();
			return true;
		});
		return ret;
	}

	enclosingPlaceholders(placeholder: Placeholder): Placeholder[] {
		let ret: Placeholder[] = [];
		let { parent } = placeholder;
		while (parent) {
			if (parent instanceof Placeholder) {
				ret.push(parent);
			}
			parent = parent.parent;
		}
		return ret;
	}

	resolveVariables(resolver: VariableResolver): this {
		this.walk(candidate => {
			if (candidate instanceof Variable) {
				if (candidate.resolve(resolver)) {
					this._placeholders = undefined;
				}
			}
			return true;
		});
		return this;
	}

	appendChild(child: Marker) {
		this._placeholders = undefined;
		return super.appendChild(child);
	}

	replace(child: Marker, others: Marker[]): void {
		this._placeholders = undefined;
		return super.replace(child, others);
	}

	toTextmateString(): string {
		return this.children.reduce((prev, cur) => prev + cur.toTextmateString(), '');
	}

	clone(): TextmateSnippet {
		let ret = new TextmateSnippet();
		this._children = this.children.map(child => child.clone());
		return ret;
	}

	walk(visitor: (marker: Marker) => boolean): void {
		walk(this.children, visitor);
	}
}

export class SnippetParser {

	static escape(value: string): string {
		return value.replace(/\$|}|\\/g, '\\$&');
	}

	private _scanner = new Scanner();
	private _token: Token;

	text(value: string): string {
		return this.parse(value).toString();
	}

	parse(value: string, insertFinalTabstop?: boolean, enforceFinalTabstop?: boolean): TextmateSnippet {

		this._scanner.text(value);
		this._token = this._scanner.next();

		const snippet = new TextmateSnippet();
		while (this._parse(snippet)) {
			// nothing
		}

		// fill in values for placeholders. the first placeholder of an index
		// that has a value defines the value for all placeholders with that index
		const placeholderDefaultValues = new Map<number, Marker[]>();
		const incompletePlaceholders: Placeholder[] = [];
		let placeholderCount = 0;
		snippet.walk(marker => {
			if (marker instanceof Placeholder) {
				placeholderCount += 1;
				if (marker.isFinalTabstop) {
					placeholderDefaultValues.set(0);
				} else if (!placeholderDefaultValues.has(marker.index) && marker.children.length > 0) {
					placeholderDefaultValues.set(marker.index, marker.children);
				} else {
					incompletePlaceholders.push(marker);
				}
			}
			return true;
		});
		for (const placeholder of incompletePlaceholders) {
			if (placeholderDefaultValues.has(placeholder.index)) {
				const clone = new Placeholder(placeholder.index);
				for (const child of placeholderDefaultValues.get(placeholder.index)) {
					clone.appendChild(child.clone());
				}
				snippet.replace(placeholder, [clone]);
			}
		}

		if (!enforceFinalTabstop) {
			enforceFinalTabstop = placeholderCount > 0 && insertFinalTabstop;
		}

		if (!placeholderDefaultValues.has(0) && enforceFinalTabstop) {
			// the snippet uses placeholders but has no
			// final tabstop defined -> insert at the end
			snippet.appendChild(new Placeholder(0));
		}

		return snippet;
	}

	private _accept(type: TokenType): boolean;
	private _accept(type: TokenType, value: true): string;
	private _accept(type: TokenType, value?: boolean): boolean | string {
		if (type === undefined || this._token.type === type) {
			let ret = !value ? true : this._scanner.tokenText(this._token);
			this._token = this._scanner.next();
			return ret;
		}
		return false;
	}

	private _backTo(token: Token): false {
		this._scanner.pos = token.pos + token.len;
		this._token = token;
		return false;
	}

	private _parse(marker: Marker): boolean {
		return this._parseEscaped(marker)
			|| this._parseTabstopOrVariableName(marker)
			|| this._parseComplexPlaceholder(marker)
			|| this._parseComplexVariable(marker)
			|| this._parseAnything(marker);
	}

	// \$, \\, \} -> just text
	private _parseEscaped(marker: Marker): boolean {
		let value: string;
		if (value = this._accept(TokenType.Backslash, true)) {
			// saw a backslash, append escaped token or that backslash
			value = this._accept(TokenType.Dollar, true)
				|| this._accept(TokenType.CurlyClose, true)
				|| this._accept(TokenType.Backslash, true)
				|| value;

			marker.appendChild(new Text(value));
			return true;
		}
		return false;
	}

	// $foo -> variable, $1 -> tabstop
	private _parseTabstopOrVariableName(parent: Marker): boolean {
		let value: string;
		const token = this._token;
		const match = this._accept(TokenType.Dollar)
			&& (value = this._accept(TokenType.VariableName, true) || this._accept(TokenType.Int, true));

		if (!match) {
			return this._backTo(token);
		}

		parent.appendChild(/^\d+$/.test(value)
			? new Placeholder(Number(value))
			: new Variable(value)
		);
		return true;
	}

	// ${1:<children>}, ${1} -> placeholder
	private _parseComplexPlaceholder(parent: Marker): boolean {
		let index: string;
		const token = this._token;
		const match = this._accept(TokenType.Dollar)
			&& this._accept(TokenType.CurlyOpen)
			&& (index = this._accept(TokenType.Int, true));

		if (!match) {
			return this._backTo(token);
		}

		const placeholder = new Placeholder(Number(index));

		if (this._accept(TokenType.Colon)) {
			// ${1:<children>}
			while (true) {

				// ...} -> done
				if (this._accept(TokenType.CurlyClose)) {
					parent.appendChild(placeholder);
					return true;
				}

				if (this._parse(placeholder)) {
					continue;
				}

				// fallback
				parent.appendChild(new Text('${' + index + ':'));
				placeholder.children.forEach(parent.appendChild, parent);
				return true;
			}
		} else if (placeholder.index > 0 && this._accept(TokenType.Pipe)) {
			// ${1|one,two,three|}
			const choice = new Choice();

			while (true) {
				if (this._parseChoiceElement(choice)) {

					if (this._accept(TokenType.Comma)) {
						// opt, -> more
						continue;
					}

					if (this._accept(TokenType.Pipe) && this._accept(TokenType.CurlyClose)) {
						// ..|} -> done
						placeholder.appendChild(choice);
						parent.appendChild(placeholder);
						return true;
					}
				}

				this._backTo(token);
				return false;
			}

		} else if (this._accept(TokenType.CurlyClose)) {
			// ${1}
			parent.appendChild(placeholder);
			return true;

		} else {
			// ${1 <- missing curly or colon
			return this._backTo(token);
		}
	}

	private _parseChoiceElement(parent: Choice): boolean {
		const token = this._token;
		const values: string[] = [];

		while (true) {
			if (this._token.type === TokenType.Comma || this._token.type === TokenType.Pipe) {
				break;
			}
			let value: string;
			if (value = this._accept(TokenType.Backslash, true)) {
				// \, or \|
				value = this._accept(TokenType.Comma, true)
					|| this._accept(TokenType.Pipe, true)
					|| value;
			} else {
				value = this._accept(undefined, true);
			}
			if (!value) {
				// EOF
				this._backTo(token);
				return false;
			}
			values.push(value);
		}

		if (values.length === 0) {
			this._backTo(token);
			return false;
		}

		parent.appendChild(new Text(values.join('')));
		return true;
	}

	// ${foo:<children>}, ${foo} -> variable
	private _parseComplexVariable(parent: Marker): boolean {
		let name: string;
		const token = this._token;
		const match = this._accept(TokenType.Dollar)
			&& this._accept(TokenType.CurlyOpen)
			&& (name = this._accept(TokenType.VariableName, true));

		if (!match) {
			return this._backTo(token);
		}

		const variable = new Variable(name);

		if (this._accept(TokenType.Colon)) {
			// ${foo:<children>}
			while (true) {

				// ...} -> done
				if (this._accept(TokenType.CurlyClose)) {
					parent.appendChild(variable);
					return true;
				}

				if (this._parse(variable)) {
					continue;
				}

				// fallback
				parent.appendChild(new Text('${' + name + ':'));
				variable.children.forEach(parent.appendChild, parent);
				return true;
			}

		} else if (this._accept(TokenType.CurlyClose)) {
			// ${foo}
			parent.appendChild(variable);
			return true;

		} else {
			// ${foo <- missing curly or colon
			return this._backTo(token);
		}
	}

	private _parseAnything(marker: Marker): boolean {
		if (this._token.type !== TokenType.EOF) {
			marker.appendChild(new Text(this._scanner.tokenText(this._token)));
			this._accept(undefined);
			return true;
		}
		return false;
	}
}
