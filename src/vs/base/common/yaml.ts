/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../nls.js';

/**
 * Parses a simplified YAML-like input from a single string.
 * Supports objects, arrays, primitive types (string, number, boolean, null).
 * Tracks positions for error reporting and node locations.
 *
 * Limitations:
 * - No anchors or references
 * - No complex types (dates, binary)
 * - No single pair implicit entries
 *
 * @param input A string containing the YAML-like input
 * @param errors Array to collect parsing errors
 * @returns The parsed representation (YamlMapNode, YamlSequenceNode, or YamlScalarNode)
 */
export function parse(input: string, errors: YamlParseError[] = [], options: ParseOptions = {}): YamlNode | undefined {
	const scanner = new YamlScanner(input);
	const tokens = scanner.scan();
	const parser = new YamlParser(tokens, input, errors, options);
	return parser.parse();
}

// -- AST Node Types ----------------------------------------------------------

export interface YamlScalarNode {
	readonly type: 'scalar';
	readonly value: string;
	readonly rawValue: string;
	readonly startOffset: number;
	readonly endOffset: number;
	readonly format: 'single' | 'double' | 'none' | 'literal' | 'folded';
}

export interface YamlMapNode {
	readonly type: 'map';
	readonly properties: { key: YamlScalarNode; value: YamlNode }[];
	readonly style: 'block' | 'flow';
	readonly startOffset: number;
	readonly endOffset: number;
}

export interface YamlSequenceNode {
	readonly type: 'sequence';
	readonly items: YamlNode[];
	readonly style: 'block' | 'flow';
	readonly startOffset: number;
	readonly endOffset: number;
}

export type YamlNode = YamlSequenceNode | YamlMapNode | YamlScalarNode;

export interface YamlParseError {
	readonly message: string;
	readonly startOffset: number;
	readonly endOffset: number;
	readonly code: string;
}

export interface ParseOptions {
	readonly allowDuplicateKeys?: boolean;
}

// -- Token Types -------------------------------------------------------------

const enum TokenType {
	// Scalar values (unquoted, single-quoted, double-quoted)
	Scalar,
	// Structural tokens
	Colon,           // ':'
	Dash,            // '- '
	Comma,           // ','
	FlowMapStart,    // '{'
	FlowMapEnd,      // '}'
	FlowSeqStart,    // '['
	FlowSeqEnd,      // ']'
	// Whitespace / structure
	Newline,
	Indent,          // leading whitespace at start of line (carries the indent level)
	Comment,
	DocumentStart,  // '---'
	DocumentEnd,    // '...'
	EOF,
}

interface Token {
	readonly type: TokenType;
	readonly startOffset: number;
	readonly endOffset: number;
	/** For Scalar tokens: the raw text (including quotes). */
	readonly rawValue: string;
	/** For Scalar tokens: the interpreted string value. */
	readonly value: string;
	/** For Scalar tokens: quote style. */
	readonly format: 'single' | 'double' | 'none' | 'literal' | 'folded';
	/** For Indent tokens: the column (number of spaces). */
	readonly indent: number;
}

function makeToken(
	type: TokenType,
	startOffset: number,
	endOffset: number,
	extra?: Partial<Pick<Token, 'rawValue' | 'value' | 'format' | 'indent'>>
): Token {
	return {
		type,
		startOffset,
		endOffset,
		rawValue: extra?.rawValue ?? '',
		value: extra?.value ?? '',
		format: extra?.format ?? 'none' as Token['format'],
		indent: extra?.indent ?? 0,
	};
}

// -- Scanner -----------------------------------------------------------------

class YamlScanner {
	private pos = 0;
	private readonly tokens: Token[] = [];
	// Track flow nesting depth so commas and flow indicators are only special inside flow collections
	private flowDepth = 0;
	// Track whether we've already seen a block colon on the current line.
	// After the first key: value colon, subsequent ': ' on the same line is part of the scalar value.
	private seenBlockColon = false;

	constructor(private readonly input: string) { }

	scan(): Token[] {
		while (this.pos < this.input.length) {
			this.scanLine();
		}
		this.tokens.push(makeToken(TokenType.EOF, this.pos, this.pos));
		return this.tokens;
	}

	// Scan a single logical line (up to and including the newline character)
	private scanLine(): void {
		this.seenBlockColon = false;
		// Handle blank lines / lines that are only whitespace
		if (this.peekChar() === '\n') {
			this.tokens.push(makeToken(TokenType.Newline, this.pos, this.pos + 1));
			this.pos++;
			return;
		}
		if (this.peekChar() === '\r') {
			const end = this.pos + (this.input[this.pos + 1] === '\n' ? 2 : 1);
			this.tokens.push(makeToken(TokenType.Newline, this.pos, end));
			this.pos = end;
			return;
		}

		// Measure leading whitespace → Indent token
		const indentStart = this.pos;
		let indent = 0;
		while (this.pos < this.input.length && (this.input[this.pos] === ' ' || this.input[this.pos] === '\t')) {
			indent++;
			this.pos++;
		}
		if (indent > 0) {
			this.tokens.push(makeToken(TokenType.Indent, indentStart, this.pos, { indent }));
		}

		// If line is now empty (only whitespace before newline/EOF), emit newline
		if (this.pos >= this.input.length || this.peekChar() === '\n' || this.peekChar() === '\r') {
			if (this.pos < this.input.length) {
				const nlStart = this.pos;
				const end = this.peekChar() === '\r' && this.input[this.pos + 1] === '\n' ? this.pos + 2 : this.pos + 1;
				this.tokens.push(makeToken(TokenType.Newline, nlStart, end));
				this.pos = end;
			}
			return;
		}

		// Check for document markers (--- / ...) at column 0
		if (indent === 0 && this.input.length - this.pos >= 3) {
			const c0 = this.input[this.pos];
			const c1 = this.input[this.pos + 1];
			const c2 = this.input[this.pos + 2];
			const c3 = this.input[this.pos + 3];
			const isTerminator = c3 === undefined || c3 === ' ' || c3 === '\t' || c3 === '\n' || c3 === '\r';
			if (c0 === '-' && c1 === '-' && c2 === '-' && isTerminator) {
				this.tokens.push(makeToken(TokenType.DocumentStart, this.pos, this.pos + 3));
				this.pos += 3;
				this.scanLineContent();
				this.scanNewline();
				return;
			}
			if (c0 === '.' && c1 === '.' && c2 === '.' && isTerminator) {
				this.tokens.push(makeToken(TokenType.DocumentEnd, this.pos, this.pos + 3));
				this.pos += 3;
				this.scanLineContent();
				this.scanNewline();
				return;
			}
		}

		// Check for comment-only line
		if (this.peekChar() === '#') {
			this.scanComment();
			this.scanNewline();
			return;
		}

		// Skip directive lines (e.g., %YAML 1.2, %TAG) - consume rest of line
		if (this.peekChar() === '%') {
			while (this.pos < this.input.length && this.input[this.pos] !== '\n' && this.input[this.pos] !== '\r') {
				this.pos++;
			}
			this.scanNewline();
			return;
		}

		// Scan the rest of the line for tokens
		this.scanLineContent();
		this.scanNewline();
	}

	private scanLineContent(): void {
		while (this.pos < this.input.length && this.peekChar() !== '\n' && this.peekChar() !== '\r') {
			this.skipInlineWhitespace();
			if (this.pos >= this.input.length || this.peekChar() === '\n' || this.peekChar() === '\r') {
				break;
			}

			const ch = this.peekChar();

			if (ch === '#') {
				this.scanComment();
				break; // comment consumes rest of line
			} else if (ch === '{') {
				this.flowDepth++;
				this.tokens.push(makeToken(TokenType.FlowMapStart, this.pos, this.pos + 1));
				this.pos++;
			} else if (ch === '}' && this.flowDepth > 0) {
				this.flowDepth--;
				this.tokens.push(makeToken(TokenType.FlowMapEnd, this.pos, this.pos + 1));
				this.pos++;
			} else if (ch === '[') {
				this.flowDepth++;
				this.tokens.push(makeToken(TokenType.FlowSeqStart, this.pos, this.pos + 1));
				this.pos++;
			} else if (ch === ']' && this.flowDepth > 0) {
				this.flowDepth--;
				this.tokens.push(makeToken(TokenType.FlowSeqEnd, this.pos, this.pos + 1));
				this.pos++;
			} else if (ch === ',' && this.flowDepth > 0) {
				this.tokens.push(makeToken(TokenType.Comma, this.pos, this.pos + 1));
				this.pos++;
			} else if (ch === '-' && this.isBlockDash()) {
				// Block sequence indicator: '- ' or '-' at end of line
				this.tokens.push(makeToken(TokenType.Dash, this.pos, this.pos + 1));
				this.pos++;
			} else if (ch === ':' && this.isBlockColon()) {
				this.tokens.push(makeToken(TokenType.Colon, this.pos, this.pos + 1));
				this.pos++;
				if (this.flowDepth === 0) {
					this.seenBlockColon = true;
				}
			} else if (ch === ':' && this.flowDepth > 0 && this.lastTokenIsJsonLike()) {
				// In flow context, ':' immediately following a JSON-like node (quoted scalar,
				// flow mapping, or flow sequence) is a value indicator even without trailing space
				this.tokens.push(makeToken(TokenType.Colon, this.pos, this.pos + 1));
				this.pos++;
			} else if (ch === '\'' || ch === '"') {
				this.scanQuotedScalar(ch);
			} else if ((ch === '|' || ch === '>') && this.flowDepth === 0 && this.isBlockScalarStart()) {
				this.scanBlockScalar(ch as '|' | '>');
				break; // Block scalar consumed multiple lines; return to main scan loop
			} else {
				this.scanUnquotedScalar();
			}
		}
	}

	/** Check if '-' is a block sequence dash (followed by space, newline, or EOF) */
	private isBlockDash(): boolean {
		const next = this.input[this.pos + 1];
		return next === undefined || next === ' ' || next === '\t' || next === '\n' || next === '\r';
	}

	/** Check if ':' acts as a mapping value indicator (followed by space, newline, EOF, or flow indicator) */
	private isBlockColon(): boolean {
		// In block context, after the first key-value colon on a line,
		// subsequent ': ' is part of the scalar value, not a mapping indicator.
		if (this.seenBlockColon && this.flowDepth === 0) { return false; }
		const next = this.input[this.pos + 1];
		if (next === undefined || next === ' ' || next === '\t' || next === '\n' || next === '\r') { return true; }
		// Flow indicators after colon only count inside flow context
		if (this.flowDepth > 0 && (next === ',' || next === '}' || next === ']')) { return true; }
		return false;
	}

	/** Check if the last non-whitespace token is a JSON-like node (quoted scalar or flow end) */
	private lastTokenIsJsonLike(): boolean {
		for (let i = this.tokens.length - 1; i >= 0; i--) {
			const t = this.tokens[i];
			if (t.type === TokenType.Newline || t.type === TokenType.Indent || t.type === TokenType.Comment) {
				continue;
			}
			// Quoted scalar or flow collection end bracket
			if (t.type === TokenType.Scalar && t.format !== 'none') { return true; }
			if (t.type === TokenType.FlowMapEnd || t.type === TokenType.FlowSeqEnd) { return true; }
			return false;
		}
		return false;
	}

	private scanQuotedScalar(quote: '\'' | '"'): void {
		const start = this.pos;
		this.pos++; // skip opening quote
		let value = '';
		// Track trailing literal whitespace count so flow folding only trims
		// source-level whitespace, not whitespace produced by escape sequences
		let trailingLiteralWs = 0;

		while (this.pos < this.input.length) {
			const ch = this.input[this.pos];
			if (ch === quote) {
				// In single-quoted strings, '' is an escaped single quote
				if (quote === '\'' && this.input[this.pos + 1] === '\'') {
					value += '\'';
					this.pos += 2;
					trailingLiteralWs = 0;
					continue;
				}
				this.pos++; // skip closing quote
				const rawValue = this.input.substring(start, this.pos);
				this.tokens.push(makeToken(TokenType.Scalar, start, this.pos, {
					rawValue,
					value,
					format: quote === '\'' ? 'single' : 'double',
				}));
				return;
			}

			// Handle escape sequences in double-quoted strings
			if (quote === '"' && ch === '\\') {
				const next = this.input[this.pos + 1];
				// Escaped line break: \ + newline → join lines without inserting a space
				if (next === '\n' || next === '\r') {
					this.pos++; // skip '\'
					this.consumeNewline();
					// Strip leading whitespace on continuation line
					this.skipInlineWhitespace();
					trailingLiteralWs = 0;
					continue;
				}
				switch (next) {
					case 'n': value += '\n'; break;
					case 't': value += '\t'; break;
					case '\\': value += '\\'; break;
					case '"': value += '"'; break;
					case '/': value += '/'; break;
					case 'r': value += '\r'; break;
					case '0': value += '\0'; break;
					case 'a': value += '\x07'; break;
					case 'b': value += '\b'; break;
					case 'e': value += '\x1b'; break;
					case 'v': value += '\v'; break;
					case 'f': value += '\f'; break;
					case ' ': value += ' '; break;
					case '_': value += '\xa0'; break;
					case 'x': {
						// \xNN - 2-digit hex escape
						const hex = this.input.substring(this.pos + 2, this.pos + 4);
						const code = parseInt(hex, 16);
						if (hex.length === 2 && !isNaN(code)) {
							value += String.fromCharCode(code);
							this.pos += 4;
						} else {
							value += '\\x';
							this.pos += 2;
						}
						trailingLiteralWs = 0;
						continue;
					}
					case 'u': {
						// \uNNNN - 4-digit unicode escape
						const hex = this.input.substring(this.pos + 2, this.pos + 6);
						const code = parseInt(hex, 16);
						if (hex.length === 4 && !isNaN(code)) {
							value += String.fromCodePoint(code);
							this.pos += 6;
						} else {
							value += '\\u';
							this.pos += 2;
						}
						trailingLiteralWs = 0;
						continue;
					}
					case 'U': {
						// \UNNNNNNNN - 8-digit unicode escape
						const hex = this.input.substring(this.pos + 2, this.pos + 10);
						const code = parseInt(hex, 16);
						if (hex.length === 8 && !isNaN(code)) {
							value += String.fromCodePoint(code);
							this.pos += 10;
						} else {
							value += '\\U';
							this.pos += 2;
						}
						trailingLiteralWs = 0;
						continue;
					}
					default: value += '\\' + (next ?? ''); break;
				}
				this.pos += 2;
				trailingLiteralWs = 0;
				continue;
			}

			// Flow folding: handle newlines inside quoted scalars (both single and double)
			if (ch === '\n' || ch === '\r') {
				// Trim trailing literal whitespace (not escape-produced whitespace)
				if (trailingLiteralWs > 0) {
					value = value.substring(0, value.length - trailingLiteralWs);
				}
				trailingLiteralWs = 0;

				// Skip the newline
				this.consumeNewline();

				// Count empty lines (lines with only whitespace)
				let emptyLineCount = 0;
				while (this.pos < this.input.length) {
					// Skip whitespace at start of line
					this.skipInlineWhitespace();
					// Check if this line is empty (another newline follows)
					const c = this.input[this.pos];
					if (c === '\n' || c === '\r') {
						emptyLineCount++;
						this.consumeNewline();
					} else {
						break;
					}
				}

				// Apply folding: empty lines → \n each, otherwise single newline → space
				if (emptyLineCount > 0) {
					value += '\n'.repeat(emptyLineCount);
				} else {
					value += ' ';
				}
				continue;
			}

			// Track literal whitespace for folding purposes
			if (ch === ' ' || ch === '\t') {
				trailingLiteralWs++;
			} else {
				trailingLiteralWs = 0;
			}
			value += ch;
			this.pos++;
		}

		// Unterminated string - emit what we have
		const rawValue = this.input.substring(start, this.pos);
		this.tokens.push(makeToken(TokenType.Scalar, start, this.pos, {
			rawValue,
			value,
			format: quote === '\'' ? 'single' : 'double',
		}));
	}

	private scanUnquotedScalar(): void {
		const start = this.pos;
		let end = this.pos;

		while (this.pos < this.input.length) {
			const ch = this.input[this.pos];
			// Stop at newline
			if (ch === '\n' || ch === '\r') { break; }
			// Stop at flow indicators (only inside flow collections)
			if (this.flowDepth > 0 && (ch === ',' || ch === '}' || ch === ']')) { break; }
			if (this.flowDepth > 0 && (ch === '{' || ch === '[')) { break; }
			// Stop at ': ' or ':' at end-of-line (mapping value indicator)
			if (ch === ':' && this.isBlockColon()) { break; }
			// Stop at ' #' (comment)
			if (ch === '#' && this.pos > start && (this.input[this.pos - 1] === ' ' || this.input[this.pos - 1] === '\t')) { break; }

			this.pos++;
			// Track the last non-whitespace position to trim trailing whitespace
			if (ch !== ' ' && ch !== '\t') {
				end = this.pos;
			}
		}

		const rawValue = this.input.substring(start, end);
		this.tokens.push(makeToken(TokenType.Scalar, start, end, {
			rawValue,
			value: rawValue,
			format: 'none',
		}));
	}

	/**
	 * Check if '|' or '>' at the current position is a block scalar indicator.
	 * Must be followed by optional indentation/chomping indicators, optional comment, then newline.
	 */
	private isBlockScalarStart(): boolean {
		let p = this.pos + 1;
		// Skip optional indentation indicator (digit 1-9) and chomping indicator (+/-)
		while (p < this.input.length) {
			const c = this.input[p];
			if (c >= '1' && c <= '9') { p++; continue; }
			if (c === '+' || c === '-') { p++; continue; }
			break;
		}
		// Skip optional whitespace
		while (p < this.input.length && (this.input[p] === ' ' || this.input[p] === '\t')) { p++; }
		// Must be at newline, EOF, or comment
		if (p >= this.input.length) { return true; }
		const c = this.input[p];
		return c === '\n' || c === '\r' || c === '#';
	}

	/**
	 * Scan a block scalar (literal '|' or folded '>').
	 * Parses the header line for indentation indicator and chomping mode,
	 * then collects all content lines that are indented beyond the detected indentation.
	 */
	private scanBlockScalar(style: '|' | '>'): void {
		const start = this.pos;
		this.pos++; // skip '|' or '>'

		// Parse header: optional indentation indicator (1-9) and chomping indicator (+/-)
		let explicitIndent = 0;
		let chomping: 'clip' | 'strip' | 'keep' = 'clip';

		// The order of indent indicator and chomping indicator can vary (D83L test)
		for (let i = 0; i < 2; i++) {
			if (this.pos < this.input.length) {
				const c = this.input[this.pos];
				if (c >= '1' && c <= '9' && explicitIndent === 0) {
					explicitIndent = parseInt(c, 10);
					this.pos++;
				} else if (c === '-' && chomping === 'clip') {
					chomping = 'strip';
					this.pos++;
				} else if (c === '+' && chomping === 'clip') {
					chomping = 'keep';
					this.pos++;
				}
			}
		}

		// Skip any trailing whitespace on the header line
		while (this.pos < this.input.length && (this.input[this.pos] === ' ' || this.input[this.pos] === '\t')) {
			this.pos++;
		}

		// Skip optional comment on header line
		if (this.pos < this.input.length && this.input[this.pos] === '#') {
			while (this.pos < this.input.length && this.input[this.pos] !== '\n' && this.input[this.pos] !== '\r') {
				this.pos++;
			}
		}

		// Skip the header line's newline
		this.consumeNewline();

		// Determine the parent block's indentation level.
		// Per YAML spec 8.1.1.1, content indentation = parent_block_indent + N
		// where N is the explicit indent indicator (or auto-detected).
		// Also used to establish a minimum content indent for auto-detection.
		const parentBlockIndent = this.getParentBlockIndent(start);

		// Compute the content indentation level
		let contentIndent = explicitIndent > 0 ? parentBlockIndent + explicitIndent : 0;
		const lines: string[] = [];
		let trailingNewlines = 0;

		while (this.pos < this.input.length) {
			const lineStart = this.pos;

			// Count leading spaces on this line (tabs are not valid YAML indentation)
			let lineIndent = 0;
			while (this.pos < this.input.length && this.input[this.pos] === ' ') {
				lineIndent++;
				this.pos++;
			}

			// Check if this is an empty or whitespace-only line
			if (this.pos >= this.input.length || this.input[this.pos] === '\n' || this.input[this.pos] === '\r') {
				if (contentIndent > 0 && lineIndent >= contentIndent) {
					// Whitespace-only line with enough indent - preserve excess whitespace
					const preserved = this.input.substring(lineStart + contentIndent, this.pos);
					lines.push(preserved);
					if (preserved === '') {
						// Effectively an empty line - counts as trailing
						trailingNewlines++;
					} else {
						trailingNewlines = 0;
					}
				} else {
					// Truly empty line - part of scalar content
					lines.push('');
					trailingNewlines++;
				}
				// Skip newline
				this.consumeNewline();
				continue;
			}

			// Check for document markers at column 0 - they terminate the block scalar
			if (lineIndent === 0 && this.input.length - this.pos >= 3) {
				const c0 = this.input[this.pos];
				const c1 = this.input[this.pos + 1];
				const c2 = this.input[this.pos + 2];
				const c3 = this.input[this.pos + 3];
				const isTerm = c3 === undefined || c3 === ' ' || c3 === '\t' || c3 === '\n' || c3 === '\r';
				if ((c0 === '-' && c1 === '-' && c2 === '-' && isTerm) ||
					(c0 === '.' && c1 === '.' && c2 === '.' && isTerm)) {
					this.pos = lineStart;
					break;
				}
			}

			// Auto-detect content indent from first non-empty line.
			// Content must be more indented than the parent block.
			if (contentIndent === 0) {
				if (lineIndent <= parentBlockIndent) {
					// Not enough indentation - terminates the block scalar
					this.pos = lineStart;
					break;
				}
				contentIndent = lineIndent;
			}

			// If this line's indentation is less than the content indent, the block scalar is done
			if (lineIndent < contentIndent) {
				this.pos = lineStart;
				break;
			}

			// Read the rest of the line (the content)
			const contentStart = lineStart + contentIndent;
			while (this.pos < this.input.length && this.input[this.pos] !== '\n' && this.input[this.pos] !== '\r') {
				this.pos++;
			}
			// The line content includes any extra indentation beyond contentIndent
			const lineContent = this.input.substring(contentStart, this.pos);
			lines.push(lineContent);
			trailingNewlines = 0;

			// Skip newline
			this.consumeNewline();
		}

		// Process the collected lines according to the block scalar style
		let value: string;
		if (style === '|') {
			// Literal: join lines with newlines (preserving all line breaks as-is)
			value = lines.join('\n');
		} else {
			// Folded: per YAML spec, line breaks between adjacent non-more-indented
			// content lines are folded into spaces. More-indented lines preserve breaks.
			// Empty lines produce \n each. The break from content into an empty run
			// is "trimmed" (absorbed) for non-more-indented lines, but preserved
			// for more-indented lines.
			value = '';
			let lastNonEmptyIsMoreIndented = false;
			let inEmptyRun = false;
			let seenNonEmpty = false;

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				const isMoreIndented = line.length > 0 && (line[0] === ' ' || line[0] === '\t');

				if (line === '') {
					// Empty line → contributes one \n
					value += '\n';
					inEmptyRun = true;
				} else if (i === 0) {
					value = line;
					lastNonEmptyIsMoreIndented = isMoreIndented;
					seenNonEmpty = true;
				} else if (inEmptyRun) {
					// Transitioning from empty lines back to content.
					// If the previous content or current line is more-indented
					// AND we've seen content before, the break is preserved.
					// Otherwise the empties already provided all needed line breaks.
					if ((lastNonEmptyIsMoreIndented || isMoreIndented) && seenNonEmpty) {
						value += '\n' + line;
					} else {
						value += line;
					}
					lastNonEmptyIsMoreIndented = isMoreIndented;
					inEmptyRun = false;
					seenNonEmpty = true;
				} else if (isMoreIndented || lastNonEmptyIsMoreIndented) {
					// More-indented line → preserve newline
					value += '\n' + line;
					lastNonEmptyIsMoreIndented = isMoreIndented;
					seenNonEmpty = true;
				} else {
					// Normal adjacent non-more-indented lines → fold to space
					value += ' ' + line;
					lastNonEmptyIsMoreIndented = false;
					seenNonEmpty = true;
				}
			}
		}

		// Apply chomping to trailing newlines
		if (trailingNewlines > 0) {
			// Strip all trailing newlines from the value
			let end = value.length;
			while (end > 0 && value[end - 1] === '\n') {
				end--;
			}
			value = value.substring(0, end);
		}

		// Determine if there was any actual (non-empty) content
		const hasContent = lines.some(l => l !== '');

		switch (chomping) {
			case 'clip':
				if (hasContent) {
					// Add exactly one trailing newline
					value += '\n';
				}
				break;
			case 'keep':
				if (hasContent) {
					// Content + trailing: final line break + trailing empty line breaks
					value += '\n'.repeat(trailingNewlines + 1);
				} else {
					// No content, only trailing empties
					value = '\n'.repeat(trailingNewlines);
				}
				break;
			case 'strip':
				// No trailing newline
				break;
		}

		const rawValue = this.input.substring(start, this.pos);
		this.tokens.push(makeToken(TokenType.Scalar, start, this.pos, {
			rawValue,
			value,
			format: style === '|' ? 'literal' : 'folded',
		}));
	}

	/**
	 * Determine the parent block's indentation level for a block scalar.
	 * Looks at preceding tokens to find the context:
	 * - After Colon: the indentation of the line containing the mapping key
	 * - After Dash: the column of the dash
	 * - At document level: -1 (allows content at indent 0)
	 */
	private getParentBlockIndent(blockScalarPos: number): number {
		for (let i = this.tokens.length - 1; i >= 0; i--) {
			const t = this.tokens[i];
			if (t.type === TokenType.Newline || t.type === TokenType.Comment || t.type === TokenType.Indent) { continue; }
			if (t.type === TokenType.Colon) {
				// Block scalar is a mapping value. The parent indentation
				// is the column of the mapping key (the scalar before the colon).
				for (let j = i - 1; j >= 0; j--) {
					const kt = this.tokens[j];
					if (kt.type === TokenType.Newline || kt.type === TokenType.Comment || kt.type === TokenType.Indent) { continue; }
					// Found the key token - return its column
					return this.getColumnAt(kt.startOffset);
				}
				return 0;
			}
			if (t.type === TokenType.Dash) {
				// Block scalar is a sequence item. Parent indent = column of the dash.
				return this.getColumnAt(t.startOffset);
			}
			// Document root - content at indent 0 is valid
			if (t.type === TokenType.DocumentStart) { return -1; }
			// For any other token, use 0
			break;
		}
		return 0;
	}

	/**
	 * Get the column (0-based offset from start of line) for a position in the input.
	 */
	private getColumnAt(offset: number): number {
		let col = 0;
		let p = offset - 1;
		while (p >= 0 && this.input[p] !== '\n' && this.input[p] !== '\r') {
			col++;
			p--;
		}
		return col;
	}

	private scanComment(): void {
		const start = this.pos;
		while (this.pos < this.input.length && this.input[this.pos] !== '\n' && this.input[this.pos] !== '\r') {
			this.pos++;
		}
		this.tokens.push(makeToken(TokenType.Comment, start, this.pos, {
			rawValue: this.input.substring(start, this.pos),
			value: this.input.substring(start, this.pos),
		}));
	}

	private scanNewline(): void {
		const start = this.pos;
		if (this.consumeNewline()) {
			this.tokens.push(makeToken(TokenType.Newline, start, this.pos));
		}
	}

	private skipInlineWhitespace(): void {
		while (this.pos < this.input.length) {
			const ch = this.input[this.pos];
			if (ch === ' ' || ch === '\t') {
				this.pos++;
			} else {
				break;
			}
		}
	}

	/** Advance past a newline sequence (\r\n, \n, or \r). Returns true if a newline was consumed. */
	private consumeNewline(): boolean {
		if (this.pos >= this.input.length) { return false; }
		if (this.input[this.pos] === '\r' && this.input[this.pos + 1] === '\n') {
			this.pos += 2;
			return true;
		}
		if (this.input[this.pos] === '\n' || this.input[this.pos] === '\r') {
			this.pos++;
			return true;
		}
		return false;
	}

	private peekChar(): string {
		return this.input[this.pos];
	}
}

// -- Parser ------------------------------------------------------------------

class YamlParser {
	private pos = 0;

	constructor(
		private readonly tokens: Token[],
		private readonly input: string,
		private readonly errors: YamlParseError[],
		private readonly options: ParseOptions,
	) { }

	parse(): YamlNode | undefined {
		this.skipNewlinesAndComments();
		// Skip document start marker (---) if present
		if (this.currentToken().type === TokenType.DocumentStart) {
			this.advance();
			this.skipNewlinesAndComments();
		}
		if (this.currentToken().type === TokenType.EOF || this.currentToken().type === TokenType.DocumentEnd) {
			return undefined;
		}
		const result = this.parseValue(-1);
		return result;
	}

	// -- helpers ----------------------------------------------------------

	private currentToken(): Token {
		return this.tokens[this.pos];
	}

	private peek(offset = 0): Token {
		return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
	}

	private advance(): Token {
		const t = this.tokens[this.pos];
		if (t.type !== TokenType.EOF) {
			this.pos++;
		}
		return t;
	}

	private expect(type: TokenType): Token {
		const t = this.currentToken();
		if (t.type === type) {
			return this.advance();
		}
		return t;
	}

	private emitError(message: string, startOffset: number, endOffset: number, code: string): void {
		this.errors.push({ message, startOffset, endOffset, code });
	}

	private skipNewlinesAndComments(): void {
		while (
			this.currentToken().type === TokenType.Newline ||
			this.currentToken().type === TokenType.Comment ||
			(this.currentToken().type === TokenType.Indent && this.isFollowedByNewlineOrComment())
		) {
			this.advance();
		}
	}

	/** Returns true if the current Indent token is followed immediately by Newline/Comment/EOF */
	private isFollowedByNewlineOrComment(): boolean {
		const next = this.peek(1);
		return next.type === TokenType.Newline || next.type === TokenType.Comment || next.type === TokenType.EOF;
	}

	/**
	 * Determines the current indentation level.
	 * If the current token is an Indent, returns its indent value.
	 * Otherwise returns 0 (token is at column 0).
	 */
	private currentIndent(): number {
		if (this.currentToken().type === TokenType.Indent) {
			return this.currentToken().indent;
		}
		return 0;
	}

	// -- Main parse entry for a value at a given indentation --------------

	private parseValue(parentIndent: number): YamlNode | undefined {
		this.skipNewlinesAndComments();
		const token = this.currentToken();

		// Flow collections (also check past indent)
		const flowToken = token.type === TokenType.Indent ? this.peek(1) : token;
		if (flowToken.type === TokenType.FlowMapStart || flowToken.type === TokenType.FlowSeqStart) {
			if (token.type === TokenType.Indent) { this.advance(); }
			if (flowToken.type === TokenType.FlowMapStart) { return this.parseFlowMap(); }
			return this.parseFlowSeq();
		}

		// Block-level: detect if this is a sequence or mapping
		const indent = this.currentIndent();

		// Determine what the first meaningful token is at this indent
		const firstContentToken = this.peekPastIndent();

		if (firstContentToken.type === TokenType.Dash) {
			return this.parseBlockSequence(indent);
		}

		// Check if this looks like a mapping (scalar followed by colon)
		if (this.looksLikeMapping()) {
			return this.parseBlockMapping(indent);
		}

		// Otherwise it's a scalar
		if (token.type === TokenType.Scalar || token.type === TokenType.Indent) {
			return this.parseScalar(parentIndent);
		}

		return undefined;
	}

	/** Peek past an optional Indent token to see the first content token */
	private peekPastIndent(): Token {
		if (this.currentToken().type === TokenType.Indent) {
			return this.peek(1);
		}
		return this.currentToken();
	}

	/** Check if tokens at current position look like a mapping entry (key: value) */
	private looksLikeMapping(): boolean {
		let offset = 0;
		if (this.peek(offset).type === TokenType.Indent) { offset++; }
		if (this.peek(offset).type === TokenType.Scalar) {
			offset++;
			if (this.peek(offset).type === TokenType.Colon) { return true; }
		}
		return false;
	}

	// -- Scalar ----------------------------------------------------------

	private parseScalar(parentIndent: number = -1): YamlScalarNode {
		// Skip indent if present
		if (this.currentToken().type === TokenType.Indent) {
			this.advance();
		}
		const token = this.expect(TokenType.Scalar);
		// Quoted scalars are complete as-is (scanner handles their multiline)
		if (token.format !== 'none') {
			return this.scalarFromToken(token);
		}
		// For unquoted (plain) scalars, check for multiline continuation
		return this.parsePlainMultiline(token, parentIndent);
	}

	/**
	 * Parse a multiline plain scalar. The first line's token is already consumed.
	 * Continuation lines must be indented deeper than `parentIndent`.
	 * Line folding rules:
	 * - Single line break → space
	 * - Each empty line → preserved as \n
	 */
	private parsePlainMultiline(firstToken: Token, parentIndent: number): YamlScalarNode {
		let value = firstToken.value;
		let endOffset = firstToken.endOffset;

		while (true) {
			// Save position to backtrack if continuation is not valid
			const savedPos = this.pos;

			// Count empty lines (newlines with only whitespace between)
			let emptyLineCount = 0;
			let foundContent = false;

			while (this.pos < this.tokens.length) {
				const t = this.currentToken();
				if (t.type === TokenType.Comment) {
					// Comment terminates a plain scalar
					break;
				}
				if (t.type === TokenType.Newline) {
					this.advance();
					// Check if the next thing after this newline is blank or content
					const afterNewline = this.currentToken();
					if (afterNewline.type === TokenType.Newline) {
						// Another newline means an empty line
						emptyLineCount++;
						continue;
					}
					if (afterNewline.type === TokenType.Indent) {
						// Check what follows the indent
						const afterIndent = this.peek(1);
						if (afterIndent.type === TokenType.Newline || afterIndent.type === TokenType.EOF) {
							// Indent followed by newline = empty line
							emptyLineCount++;
							this.advance(); // skip the indent
							continue;
						}
						if (afterIndent.type === TokenType.Comment) {
							// Comment terminates scalar
							break;
						}
						// Content on this line - check indentation
						if (afterNewline.indent > parentIndent) {
							// Valid continuation line
							foundContent = true;
							break;
						} else {
							// Not deep enough - not a continuation
							break;
						}
					}
					if (afterNewline.type === TokenType.EOF) {
						break;
					}
					// Document markers terminate plain scalars
					if (afterNewline.type === TokenType.DocumentStart || afterNewline.type === TokenType.DocumentEnd) {
						break;
					}
					// Content at column 0
					if (parentIndent < 0) {
						// Top-level: column 0 is valid continuation for parentIndent = -1
						foundContent = true;
						break;
					}
					break;
				}
				if (t.type === TokenType.Indent) {
					// We should only get here at the very start of lookahead when
					// the first token after the scalar's end is Indent (no newline before it),
					// which shouldn't happen. Break to be safe.
					break;
				}
				// Any other token (EOF, structural) = end of scalar
				break;
			}

			if (!foundContent) {
				// No continuation found - restore position
				this.pos = savedPos;
				break;
			}

			// We found a continuation line. Skip optional indent.
			if (this.currentToken().type === TokenType.Indent) {
				this.advance();
			}

			// The next token must be a Scalar for continuation
			if (this.currentToken().type !== TokenType.Scalar) {
				// A dash at a deeper indent than the parent is text content, not a sequence indicator
				// (e.g., "- single multiline\n - sequence entry" → one scalar "single multiline - sequence entry")
				if (this.currentToken().type === TokenType.Dash) {
					const dashToken = this.advance();
					let lineText = '-';
					if (this.currentToken().type === TokenType.Scalar) {
						const restToken = this.advance();
						lineText = '- ' + restToken.value;
						endOffset = restToken.endOffset;
					} else {
						endOffset = dashToken.endOffset;
					}
					if (emptyLineCount > 0) {
						value += '\n'.repeat(emptyLineCount);
					} else {
						value += ' ';
					}
					value += lineText;
					continue;
				}
				// Not a scalar continuation (could be Colon, etc.)
				this.pos = savedPos;
				break;
			}

			// Check that this line doesn't look like a mapping key (scalar followed by colon)
			// which would mean the scalar ended and a new mapping entry starts
			if (this.peek(1).type === TokenType.Colon) {
				this.pos = savedPos;
				break;
			}

			const contToken = this.advance();

			// Apply line folding: empty lines become \n, single line break becomes space
			if (emptyLineCount > 0) {
				value += '\n'.repeat(emptyLineCount);
			} else {
				value += ' ';
			}
			value += contToken.value;
			endOffset = contToken.endOffset;
		}

		return {
			type: 'scalar',
			value,
			rawValue: this.input.substring(firstToken.startOffset, endOffset),
			startOffset: firstToken.startOffset,
			endOffset,
			format: 'none',
		};
	}

	// -- Block mapping ---------------------------------------------------

	private parseBlockMapping(baseIndent: number, inlineFirstEntry = false): YamlMapNode {
		const startOffset = this.currentToken().startOffset;
		const properties: { key: YamlScalarNode; value: YamlNode }[] = [];
		const seenKeys = new Set<string>();

		// When called after a sequence dash, the first key is already at the current position
		if (inlineFirstEntry) {
			const firstEntry = this.parseMappingEntry(baseIndent);
			if (firstEntry) {
				seenKeys.add(firstEntry.key.value);
				properties.push(firstEntry);
			}
		}

		while (this.currentToken().type !== TokenType.EOF) {
			this.skipNewlinesAndComments();
			if (this.currentToken().type === TokenType.EOF) { break; }

			const indent = this.currentIndent();
			if (indent < baseIndent) { break; }
			if (indent !== baseIndent) {
				if (indent > baseIndent) {
					this.emitError(
						localize('unexpectedIndentation', 'Unexpected indentation (expected {0}, got {1})', baseIndent, indent),
						this.currentToken().startOffset,
						this.currentToken().endOffset,
						'unexpected-indentation',
					);
				} else {
					break;
				}
			}
			if (!this.looksLikeMapping()) { break; }

			const entry = this.parseMappingEntry(baseIndent);
			if (!entry) { break; }

			if (!this.options.allowDuplicateKeys && seenKeys.has(entry.key.value)) {
				this.emitError(
					localize('duplicateKey', 'Duplicate key: "{0}"', entry.key.value),
					entry.key.startOffset,
					entry.key.endOffset,
					'duplicate-key',
				);
			}
			seenKeys.add(entry.key.value);
			properties.push(entry);
		}

		const endOffset = properties.length > 0 ? properties[properties.length - 1].value.endOffset : startOffset;
		return { type: 'map', properties, style: 'block', startOffset, endOffset };
	}

	private parseMappingEntry(baseIndent: number): { key: YamlScalarNode; value: YamlNode } | undefined {
		// Skip indent
		if (this.currentToken().type === TokenType.Indent) {
			this.advance();
		}

		// Parse key
		const keyToken = this.expect(TokenType.Scalar);
		const key = this.scalarFromToken(keyToken);

		// Expect colon
		const colon = this.expect(TokenType.Colon);
		if (colon.type !== TokenType.Colon) {
			this.emitError(localize('expectedColon', 'Expected ":"'), colon.startOffset, colon.endOffset, 'expected-colon');
			return undefined;
		}

		// Parse value: could be on same line or next line (indented)
		const value = this.parseMappingValue(baseIndent, colon);

		return { key, value };
	}

	private parseMappingValue(baseIndent: number, colonToken: Token): YamlNode {
		// Check if there's a value on the same line after the colon
		const next = this.currentToken();

		// Same-line flow collections
		if (next.type === TokenType.FlowMapStart) { return this.parseFlowMap(); }
		if (next.type === TokenType.FlowSeqStart) { return this.parseFlowSeq(); }

		// Same-line scalar (may be multiline with continuation)
		if (next.type === TokenType.Scalar) {
			// Skip indent if present (shouldn't be here, but be safe)
			if (this.currentToken().type === TokenType.Indent) {
				this.advance();
			}
			const token = this.advance();
			if (token.format !== 'none') {
				return this.scalarFromToken(token);
			}
			// Plain scalar - allow multiline continuation deeper than baseIndent
			return this.parsePlainMultiline(token, baseIndent);
		}

		// Value is on the next line (skip newlines/comments and check indentation)
		this.skipNewlinesAndComments();
		const afterNewline = this.currentToken();

		if (afterNewline.type === TokenType.EOF) {
			// Missing value at end of input
			this.emitError(localize('missingValue', 'Missing value'), colonToken.startOffset, colonToken.endOffset, 'missing-value');
			return this.makeEmptyScalar(colonToken.endOffset);
		}

		const nextIndent = this.currentIndent();

		// Special case: a sequence at the same indent as the mapping key is allowed
		// as the mapping value (e.g., "foo:\n- 42")
		if (nextIndent === baseIndent && this.peekPastIndent().type === TokenType.Dash) {
			return this.parseValue(baseIndent) ?? this.makeEmptyScalar(colonToken.endOffset);
		}

		if (nextIndent <= baseIndent) {
			// No deeper indentation → missing value
			this.emitError(localize('missingValue', 'Missing value'), colonToken.startOffset, colonToken.endOffset, 'missing-value');
			return this.makeEmptyScalar(colonToken.endOffset);
		}

		// Parse the nested value
		return this.parseValue(baseIndent) ?? this.makeEmptyScalar(colonToken.endOffset);
	}

	// -- Block sequence --------------------------------------------------

	private parseBlockSequence(baseIndent: number): YamlSequenceNode {
		const items: YamlNode[] = [];
		const startOffset = this.currentToken().startOffset;
		let endOffset = startOffset;
		let isFirstItem = true;

		while (this.currentToken().type !== TokenType.EOF) {
			this.skipNewlinesAndComments();
			if (this.currentToken().type === TokenType.EOF) { break; }

			// For the first item, the dash may be on the same line (no Indent token).
			// Compute the actual column to check against baseIndent.
			let indent: number;
			if (isFirstItem && this.currentToken().type === TokenType.Dash) {
				indent = this.currentToken().startOffset - this.getLineStart(this.currentToken().startOffset);
			} else {
				indent = this.currentIndent();
			}
			isFirstItem = false;

			if (indent < baseIndent) { break; }

			if (indent !== baseIndent) {
				if (indent > baseIndent) {
					this.emitError(
						localize('unexpectedIndentation', 'Unexpected indentation (expected {0}, got {1})', baseIndent, indent),
						this.currentToken().startOffset,
						this.currentToken().endOffset,
						'unexpected-indentation',
					);
				} else {
					break;
				}
			}

			const contentToken = this.peekPastIndent();
			if (contentToken.type !== TokenType.Dash) { break; }

			// Skip indent
			if (this.currentToken().type === TokenType.Indent) {
				this.advance();
			}

			// Consume the dash
			const dashToken = this.advance();

			// Parse the item value
			const itemValue = this.parseSequenceItemValue(baseIndent, dashToken);
			items.push(itemValue);
			endOffset = itemValue.endOffset;
		}

		return { type: 'sequence', items, style: 'block', startOffset, endOffset };
	}

	private parseSequenceItemValue(baseIndent: number, dashToken: Token): YamlNode {
		const next = this.currentToken();

		// Skip comment after dash
		if (next.type === TokenType.Comment) {
			this.advance();
		}

		// Flow collections on same line
		if (next.type === TokenType.FlowMapStart) { return this.parseFlowMap(); }
		if (next.type === TokenType.FlowSeqStart) { return this.parseFlowSeq(); }

		// Nested sequence on same line (e.g., '- - value')
		if (next.type === TokenType.Dash) {
			// The nested sequence's base indent is the column of the dash
			const nestedIndent = next.startOffset - this.getLineStart(next.startOffset);
			return this.parseBlockSequence(nestedIndent);
		}

		// Inline scalar on same line
		if (next.type === TokenType.Scalar) {
			// Check if this is actually a mapping (key: value on same line after dash)
			if (this.peek(1).type === TokenType.Colon) {
				// It's an inline mapping after '- ' like '- name: John'
				// The implicit indent for continuation lines is the column of the key
				const itemIndent = next.startOffset - this.getLineStart(next.startOffset);
				return this.parseBlockMapping(itemIndent, true);
			}
			return this.parseScalar(baseIndent);
		}

		// Value on next line
		this.skipNewlinesAndComments();
		if (this.currentToken().type === TokenType.EOF) {
			this.emitError(localize('missingSeqItemValue', 'Missing sequence item value'), dashToken.startOffset, dashToken.endOffset, 'missing-value');
			return this.makeEmptyScalar(dashToken.endOffset);
		}

		const nextIndent = this.currentIndent();
		if (nextIndent <= baseIndent) {
			// Empty item (just a dash)
			this.emitError(localize('missingSeqItemValue', 'Missing sequence item value'), dashToken.startOffset, dashToken.endOffset, 'missing-value');
			return this.makeEmptyScalar(dashToken.endOffset);
		}

		return this.parseValue(baseIndent) ?? this.makeEmptyScalar(dashToken.endOffset);
	}

	/** Calculate the start of the line containing the given offset */
	private getLineStart(offset: number): number {
		let i = offset - 1;
		while (i >= 0 && this.input[i] !== '\n' && this.input[i] !== '\r') {
			i--;
		}
		return i + 1;
	}

	// -- Flow map --------------------------------------------------------

	private parseFlowMap(): YamlMapNode {
		const startToken = this.advance(); // consume '{'
		const properties: { key: YamlScalarNode; value: YamlNode }[] = [];

		this.skipFlowWhitespace();

		while (this.currentToken().type !== TokenType.FlowMapEnd && this.currentToken().type !== TokenType.EOF) {
			// Parse key (must be a scalar)
			let key: YamlScalarNode;
			if (this.currentToken().type === TokenType.Scalar) {
				key = this.parseFlowScalar();
			} else {
				this.emitError(localize('expectedMappingKey', 'Expected mapping key'), this.currentToken().startOffset, this.currentToken().endOffset, 'expected-key');
				break;
			}

			this.skipFlowWhitespace();

			// Check for colon - if missing, the key has an empty value (terminated by comma or })
			let value: YamlNode;
			if (this.currentToken().type === TokenType.Colon) {
				this.advance();
				this.skipFlowWhitespace();

				// Parse value
				value = this.parseFlowValue();
			} else {
				// Key without value (e.g., { key, other: val })
				value = this.makeEmptyScalar(key.endOffset);
			}

			properties.push({ key, value });

			this.skipFlowWhitespace();

			// Consume comma if present
			if (this.currentToken().type === TokenType.Comma) {
				this.advance();
				this.skipFlowWhitespace();
			}
		}

		const endToken = this.currentToken();
		if (endToken.type === TokenType.FlowMapEnd) {
			this.advance();
		} else {
			this.emitError(localize('expectedFlowMapEnd', 'Expected "}"'), endToken.startOffset, endToken.endOffset, 'expected-flow-map-end');
		}

		return {
			type: 'map',
			properties,
			style: 'flow',
			startOffset: startToken.startOffset,
			endOffset: endToken.type === TokenType.FlowMapEnd ? endToken.endOffset : endToken.startOffset,
		};
	}

	// -- Flow sequence ---------------------------------------------------

	private parseFlowSeq(): YamlSequenceNode {
		const startToken = this.advance(); // consume '['
		const items: YamlNode[] = [];

		this.skipFlowWhitespace();

		while (this.currentToken().type !== TokenType.FlowSeqEnd && this.currentToken().type !== TokenType.EOF) {
			let item: YamlNode;
			if (this.currentToken().type === TokenType.FlowMapStart) {
				item = this.parseFlowMap();
			} else if (this.currentToken().type === TokenType.FlowSeqStart) {
				item = this.parseFlowSeq();
			} else if (this.currentToken().type === TokenType.Scalar) {
				item = this.parseFlowScalar();
			} else {
				this.emitError(localize('unexpectedTokenInFlowSeq', 'Unexpected token in flow sequence'), this.currentToken().startOffset, this.currentToken().endOffset, 'unexpected-token');
				this.advance();
				continue;
			}

			items.push(item);
			this.skipFlowWhitespace();

			if (this.currentToken().type === TokenType.Comma) {
				this.advance();
				this.skipFlowWhitespace();
			}
		}

		const endToken = this.currentToken();
		if (endToken.type === TokenType.FlowSeqEnd) {
			this.advance();
		} else {
			this.emitError(localize('expectedFlowSeqEnd', 'Expected "]"'), endToken.startOffset, endToken.endOffset, 'expected-flow-seq-end');
		}

		return {
			type: 'sequence',
			items,
			style: 'flow',
			startOffset: startToken.startOffset,
			endOffset: endToken.type === TokenType.FlowSeqEnd ? endToken.endOffset : endToken.startOffset,
		};
	}

	/**
	 * Parse a scalar inside a flow collection, handling multiline plain scalars.
	 * In flow context, plain (unquoted) scalars can span multiple lines;
	 * line breaks are folded into spaces.
	 */
	private parseFlowScalar(): YamlScalarNode {
		const token = this.advance();
		// Quoted scalars are complete as-is (scanner handles their multiline folding)
		if (token.format !== 'none') {
			return this.scalarFromToken(token);
		}
		// For unquoted (plain) scalars, fold continuation lines across newlines
		let value = token.value;
		let endOffset = token.endOffset;

		while (true) {
			// Look ahead for a newline followed by a plain scalar continuation
			let hasNewline = false;
			let p = this.pos;
			while (p < this.tokens.length) {
				const t = this.tokens[p];
				if (t.type === TokenType.Newline) {
					hasNewline = true;
					p++;
				} else if (t.type === TokenType.Indent || t.type === TokenType.Comment) {
					p++;
				} else {
					break;
				}
			}

			if (!hasNewline || p >= this.tokens.length) { break; }

			const nextToken = this.tokens[p];
			if (nextToken.type === TokenType.Scalar && nextToken.format === 'none') {
				// Fold continuation line into the scalar
				this.pos = p + 1;
				value += ' ' + nextToken.value;
				endOffset = nextToken.endOffset;
			} else {
				break;
			}
		}

		return {
			type: 'scalar',
			value,
			rawValue: this.input.substring(token.startOffset, endOffset),
			startOffset: token.startOffset,
			endOffset,
			format: 'none',
		};
	}

	/** Parse a value in flow context (used after colon in flow mappings/implicit mappings) */
	private parseFlowValue(): YamlNode {
		if (this.currentToken().type === TokenType.FlowMapStart) {
			return this.parseFlowMap();
		} else if (this.currentToken().type === TokenType.FlowSeqStart) {
			return this.parseFlowSeq();
		} else if (this.currentToken().type === TokenType.Scalar) {
			return this.parseFlowScalar();
		} else {
			return this.makeEmptyScalar(this.currentToken().startOffset);
		}
	}

	/** Skip whitespace, newlines, and comments inside flow collections */
	private skipFlowWhitespace(): void {
		while (true) {
			const t = this.currentToken().type;
			if (t === TokenType.Newline || t === TokenType.Indent || t === TokenType.Comment) {
				this.advance();
			} else {
				break;
			}
		}
	}

	private scalarFromToken(token: Token): YamlScalarNode {
		return {
			type: 'scalar',
			value: token.value,
			rawValue: token.rawValue,
			startOffset: token.startOffset,
			endOffset: token.endOffset,
			format: token.format,
		};
	}

	private makeEmptyScalar(offset: number): YamlScalarNode {
		return {
			type: 'scalar',
			value: '',
			rawValue: '',
			startOffset: offset,
			endOffset: offset,
			format: 'none',
		};
	}
}
