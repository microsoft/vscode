/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Parses a simplified YAML-like input from a single string.
 * Supports objects, arrays, primitive types (string, number, boolean, null).
 * Tracks positions for error reporting and node locations.
 *
 * Limitations:
 * - No multi-line strings or block literals
 * - No anchors or references
 * - No complex types (dates, binary)
 * - No special handling for escape sequences in strings
 * - Indentation must be consistent (spaces only, no tabs)
 *
 * Notes:
 * - New line separators can be either "\n" or "\r\n". The input string is split into lines internally.
 *
 * @param input A string containing the YAML-like input
 * @param errors Array to collect parsing errors
 * @param options Parsing options
 * @returns The parsed representation (ObjectNode, ArrayNode, or primitive node)
 */
export function parse(input: string, errors: YamlParseError[] = [], options: ParseOptions = {}): YamlNode | undefined {
	// Normalize both LF and CRLF by splitting on either; CR characters are not retained as part of line text.
	// This keeps the existing line/character based lexer logic intact.
	const lines = input.length === 0 ? [] : input.split(/\r\n|\n/);
	const parser = new YamlParser(lines, errors, options);
	return parser.parse();
}

export interface YamlParseError {
	readonly message: string;
	readonly start: Position;
	readonly end: Position;
	readonly code: string;
}

export interface ParseOptions {
	readonly allowDuplicateKeys?: boolean;
}

export interface Position {
	readonly line: number;
	readonly character: number;
}

export interface YamlStringNode {
	readonly type: 'string';
	readonly value: string;
	readonly start: Position;
	readonly end: Position;
}

export interface YamlNumberNode {
	readonly type: 'number';
	readonly value: number;
	readonly start: Position;
	readonly end: Position;
}

export interface YamlBooleanNode {
	readonly type: 'boolean';
	readonly value: boolean;
	readonly start: Position;
	readonly end: Position;
}

export interface YamlNullNode {
	readonly type: 'null';
	readonly value: null;
	readonly start: Position;
	readonly end: Position;
}

export interface YamlObjectNode {
	readonly type: 'object';
	readonly properties: { key: YamlStringNode; value: YamlNode }[];
	readonly start: Position;
	readonly end: Position;
}

export interface YamlArrayNode {
	readonly type: 'array';
	readonly items: YamlNode[];
	readonly start: Position;
	readonly end: Position;
}

export type YamlNode = YamlStringNode | YamlNumberNode | YamlBooleanNode | YamlNullNode | YamlObjectNode | YamlArrayNode;

// Helper functions for position and node creation
function createPosition(line: number, character: number): Position {
	return { line, character };
}

// Specialized node creation functions using a more concise approach
function createStringNode(value: string, start: Position, end: Position): YamlStringNode {
	return { type: 'string', value, start, end };
}

function createNumberNode(value: number, start: Position, end: Position): YamlNumberNode {
	return { type: 'number', value, start, end };
}

function createBooleanNode(value: boolean, start: Position, end: Position): YamlBooleanNode {
	return { type: 'boolean', value, start, end };
}

function createNullNode(start: Position, end: Position): YamlNullNode {
	return { type: 'null', value: null, start, end };
}

function createObjectNode(properties: { key: YamlStringNode; value: YamlNode }[], start: Position, end: Position): YamlObjectNode {
	return { type: 'object', start, end, properties };
}

function createArrayNode(items: YamlNode[], start: Position, end: Position): YamlArrayNode {
	return { type: 'array', start, end, items };
}

// Utility functions for parsing
function isWhitespace(char: string): boolean {
	return char === ' ' || char === '\t';
}

// Simplified number validation using regex
function isValidNumber(value: string): boolean {
	return /^-?\d*\.?\d+$/.test(value);
}

// Lexer/Tokenizer for YAML content
class YamlLexer {
	private lines: string[];
	private currentLine: number = 0;
	private currentChar: number = 0;

	constructor(lines: string[]) {
		this.lines = lines;
	}

	getCurrentPosition(): Position {
		return createPosition(this.currentLine, this.currentChar);
	}

	getCurrentLineNumber(): number {
		return this.currentLine;
	}

	getCurrentCharNumber(): number {
		return this.currentChar;
	}

	getCurrentLineText(): string {
		return this.currentLine < this.lines.length ? this.lines[this.currentLine] : '';
	}

	savePosition(): { line: number; char: number } {
		return { line: this.currentLine, char: this.currentChar };
	}

	restorePosition(pos: { line: number; char: number }): void {
		this.currentLine = pos.line;
		this.currentChar = pos.char;
	}

	isAtEnd(): boolean {
		return this.currentLine >= this.lines.length;
	}

	getCurrentChar(): string {
		if (this.isAtEnd() || this.currentChar >= this.lines[this.currentLine].length) {
			return '';
		}
		return this.lines[this.currentLine][this.currentChar];
	}

	peek(offset: number = 1): string {
		const newChar = this.currentChar + offset;
		if (this.currentLine >= this.lines.length || newChar >= this.lines[this.currentLine].length) {
			return '';
		}
		return this.lines[this.currentLine][newChar];
	}

	advance(): string {
		const char = this.getCurrentChar();
		if (this.currentChar >= this.lines[this.currentLine].length && this.currentLine < this.lines.length - 1) {
			this.currentLine++;
			this.currentChar = 0;
		} else {
			this.currentChar++;
		}
		return char;
	}

	advanceLine(): void {
		this.currentLine++;
		this.currentChar = 0;
	}

	skipWhitespace(): void {
		while (!this.isAtEnd() && this.currentChar < this.lines[this.currentLine].length && isWhitespace(this.getCurrentChar())) {
			this.advance();
		}
	}

	skipToEndOfLine(): void {
		this.currentChar = this.lines[this.currentLine].length;
	}

	getIndentation(): number {
		if (this.isAtEnd()) {
			return 0;
		}
		let indent = 0;
		for (let i = 0; i < this.lines[this.currentLine].length; i++) {
			if (this.lines[this.currentLine][i] === ' ') {
				indent++;
			} else if (this.lines[this.currentLine][i] === '\t') {
				indent += 4; // Treat tab as 4 spaces
			} else {
				break;
			}
		}
		return indent;
	}

	moveToNextNonEmptyLine(): void {
		while (this.currentLine < this.lines.length) {
			// First check current line from current position
			if (this.currentChar < this.lines[this.currentLine].length) {
				const remainingLine = this.lines[this.currentLine].substring(this.currentChar).trim();
				if (remainingLine.length > 0 && !remainingLine.startsWith('#')) {
					this.skipWhitespace();
					return;
				}
			}

			// Move to next line and check from beginning
			this.currentLine++;
			this.currentChar = 0;

			if (this.currentLine < this.lines.length) {
				const line = this.lines[this.currentLine].trim();
				if (line.length > 0 && !line.startsWith('#')) {
					this.skipWhitespace();
					return;
				}
			}
		}
	}
}

// Parser class for handling YAML parsing
class YamlParser {
	private lexer: YamlLexer;
	private errors: YamlParseError[];
	private options: ParseOptions;
	// Track nesting level of flow (inline) collections '[' ']' '{' '}'
	private flowLevel: number = 0;

	constructor(lines: string[], errors: YamlParseError[], options: ParseOptions) {
		this.lexer = new YamlLexer(lines);
		this.errors = errors;
		this.options = options;
	}

	addError(message: string, code: string, start: Position, end: Position): void {
		this.errors.push({ message, code, start, end });
	}

	parseValue(expectedIndent?: number): YamlNode {
		this.lexer.skipWhitespace();

		if (this.lexer.isAtEnd()) {
			const pos = this.lexer.getCurrentPosition();
			return createStringNode('', pos, pos);
		}

		const char = this.lexer.getCurrentChar();

		// Handle quoted strings
		if (char === '"' || char === `'`) {
			return this.parseQuotedString(char);
		}

		// Handle inline arrays
		if (char === '[') {
			return this.parseInlineArray();
		}

		// Handle inline objects
		if (char === '{') {
			return this.parseInlineObject();
		}

		// Handle unquoted values
		return this.parseUnquotedValue();
	}

	parseQuotedString(quote: string): YamlNode {
		const start = this.lexer.getCurrentPosition();
		this.lexer.advance(); // Skip opening quote

		let value = '';
		while (!this.lexer.isAtEnd() && this.lexer.getCurrentChar() !== '' && this.lexer.getCurrentChar() !== quote) {
			value += this.lexer.advance();
		}

		if (this.lexer.getCurrentChar() === quote) {
			this.lexer.advance(); // Skip closing quote
		}

		const end = this.lexer.getCurrentPosition();
		return createStringNode(value, start, end);
	}

	parseUnquotedValue(): YamlNode {
		const start = this.lexer.getCurrentPosition();
		let value = '';
		let endPos = start;

		// Helper function to check for value terminators
		const isTerminator = (char: string): boolean => {
			if (char === '#') { return true; }
			// Comma, ']' and '}' only terminate inside flow collections
			if (this.flowLevel > 0 && (char === ',' || char === ']' || char === '}')) { return true; }
			return false;
		};

		// Handle opening quote that might not be closed
		const firstChar = this.lexer.getCurrentChar();
		if (firstChar === '"' || firstChar === `'`) {
			value += this.lexer.advance();
			endPos = this.lexer.getCurrentPosition();
			while (!this.lexer.isAtEnd() && this.lexer.getCurrentChar() !== '') {
				const char = this.lexer.getCurrentChar();
				if (char === firstChar || isTerminator(char)) {
					break;
				}
				value += this.lexer.advance();
				endPos = this.lexer.getCurrentPosition();
			}
		} else {
			while (!this.lexer.isAtEnd() && this.lexer.getCurrentChar() !== '') {
				const char = this.lexer.getCurrentChar();
				if (isTerminator(char)) {
					break;
				}
				value += this.lexer.advance();
				endPos = this.lexer.getCurrentPosition();
			}
		}
		const trimmed = value.trimEnd();
		const diff = value.length - trimmed.length;
		if (diff) {
			endPos = createPosition(start.line, endPos.character - diff);
		}
		const finalValue = (firstChar === '"' || firstChar === `'`) ? trimmed.substring(1) : trimmed;
		return this.createValueNode(finalValue, start, endPos);
	}

	private createValueNode(value: string, start: Position, end: Position): YamlNode {
		if (value === '') {
			return createStringNode('', start, start);
		}

		// Boolean values
		if (value === 'true') {
			return createBooleanNode(true, start, end);
		}
		if (value === 'false') {
			return createBooleanNode(false, start, end);
		}

		// Null values
		if (value === 'null' || value === '~') {
			return createNullNode(start, end);
		}

		// Number values
		const numberValue = Number(value);
		if (!isNaN(numberValue) && isFinite(numberValue) && isValidNumber(value)) {
			return createNumberNode(numberValue, start, end);
		}

		// Default to string
		return createStringNode(value, start, end);
	}

	parseInlineArray(): YamlArrayNode {
		const start = this.lexer.getCurrentPosition();
		this.lexer.advance(); // Skip '['
		this.flowLevel++;

		const items: YamlNode[] = [];

		while (!this.lexer.isAtEnd()) {
			this.lexer.skipWhitespace();

			// Handle end of array
			if (this.lexer.getCurrentChar() === ']') {
				this.lexer.advance();
				break;
			}

			// Handle end of line - continue to next line for multi-line arrays
			if (this.lexer.getCurrentChar() === '') {
				this.lexer.advanceLine();
				continue;
			}

			// Handle comments - comments should terminate the array parsing
			if (this.lexer.getCurrentChar() === '#') {
				// Skip the rest of the line (comment)
				this.lexer.skipToEndOfLine();
				this.lexer.advanceLine();
				continue;
			}

			// Save position before parsing to detect if we're making progress
			const positionBefore = this.lexer.savePosition();

			// Parse array item
			const item = this.parseValue();
			// Skip implicit empty items that arise from a leading comma at the beginning of a new line
			// (e.g. a line starting with ",foo" after a comment). A legitimate empty string element
			// would have quotes and thus a non-zero span. We only filter zero-length spans.
			if (!(item.type === 'string' && item.value === '' && item.start.line === item.end.line && item.start.character === item.end.character)) {
				items.push(item);
			}

			// Check if we made progress - if not, we're likely stuck
			const positionAfter = this.lexer.savePosition();
			if (positionBefore.line === positionAfter.line && positionBefore.char === positionAfter.char) {
				// No progress made, advance at least one character to prevent infinite loop
				if (!this.lexer.isAtEnd() && this.lexer.getCurrentChar() !== '') {
					this.lexer.advance();
				} else {
					break;
				}
			}

			this.lexer.skipWhitespace();

			// Handle comma separator
			if (this.lexer.getCurrentChar() === ',') {
				this.lexer.advance();
			}
		}

		const end = this.lexer.getCurrentPosition();
		this.flowLevel--;
		return createArrayNode(items, start, end);
	}

	parseInlineObject(): YamlObjectNode {
		const start = this.lexer.getCurrentPosition();
		this.lexer.advance(); // Skip '{'
		this.flowLevel++;

		const properties: { key: YamlStringNode; value: YamlNode }[] = [];

		while (!this.lexer.isAtEnd()) {
			this.lexer.skipWhitespace();

			// Handle end of object
			if (this.lexer.getCurrentChar() === '}') {
				this.lexer.advance();
				break;
			}

			// Handle comments - comments should terminate the object parsing
			if (this.lexer.getCurrentChar() === '#') {
				// Skip the rest of the line (comment)
				this.lexer.skipToEndOfLine();
				this.lexer.advanceLine();
				continue;
			}

			// Save position before parsing to detect if we're making progress
			const positionBefore = this.lexer.savePosition();

			// Parse key - read until colon
			const keyStart = this.lexer.getCurrentPosition();
			let keyValue = '';

			// Handle quoted keys
			if (this.lexer.getCurrentChar() === '"' || this.lexer.getCurrentChar() === `'`) {
				const quote = this.lexer.getCurrentChar();
				this.lexer.advance(); // Skip opening quote

				while (!this.lexer.isAtEnd() && this.lexer.getCurrentChar() !== '' && this.lexer.getCurrentChar() !== quote) {
					keyValue += this.lexer.advance();
				}

				if (this.lexer.getCurrentChar() === quote) {
					this.lexer.advance(); // Skip closing quote
				}
			} else {
				// Handle unquoted keys - read until colon
				while (!this.lexer.isAtEnd() && this.lexer.getCurrentChar() !== '' && this.lexer.getCurrentChar() !== ':') {
					keyValue += this.lexer.advance();
				}
			}

			keyValue = keyValue.trim();
			const keyEnd = this.lexer.getCurrentPosition();
			const key = createStringNode(keyValue, keyStart, keyEnd);

			this.lexer.skipWhitespace();

			// Expect colon
			if (this.lexer.getCurrentChar() === ':') {
				this.lexer.advance();
			}

			this.lexer.skipWhitespace();

			// Parse value
			const value = this.parseValue();

			properties.push({ key, value });

			// Check if we made progress - if not, we're likely stuck
			const positionAfter = this.lexer.savePosition();
			if (positionBefore.line === positionAfter.line && positionBefore.char === positionAfter.char) {
				// No progress made, advance at least one character to prevent infinite loop
				if (!this.lexer.isAtEnd() && this.lexer.getCurrentChar() !== '') {
					this.lexer.advance();
				} else {
					break;
				}
			}

			this.lexer.skipWhitespace();

			// Handle comma separator
			if (this.lexer.getCurrentChar() === ',') {
				this.lexer.advance();
			}
		}

		const end = this.lexer.getCurrentPosition();
		this.flowLevel--;
		return createObjectNode(properties, start, end);
	}

	parseBlockArray(baseIndent: number): YamlArrayNode {
		const start = this.lexer.getCurrentPosition();
		const items: YamlNode[] = [];

		while (!this.lexer.isAtEnd()) {
			this.lexer.moveToNextNonEmptyLine();

			if (this.lexer.isAtEnd()) {
				break;
			}

			const currentIndent = this.lexer.getIndentation();

			// If indentation is less than expected, we're done with this array
			if (currentIndent < baseIndent) {
				break;
			}

			this.lexer.skipWhitespace();

			// Check for array item marker
			if (this.lexer.getCurrentChar() === '-') {
				this.lexer.advance(); // Skip '-'
				this.lexer.skipWhitespace();

				const itemStart = this.lexer.getCurrentPosition();

				// Check if this is a nested structure
				if (this.lexer.getCurrentChar() === '' || this.lexer.getCurrentChar() === '#') {
					// Empty item - check if next lines form a nested structure
					this.lexer.advanceLine();

					if (!this.lexer.isAtEnd()) {
						const nextIndent = this.lexer.getIndentation();

						if (nextIndent > currentIndent) {
							// Check if the next line starts with a dash (nested array) or has properties (nested object)
							this.lexer.skipWhitespace();
							if (this.lexer.getCurrentChar() === '-') {
								// It's a nested array
								const nestedArray = this.parseBlockArray(nextIndent);
								items.push(nestedArray);
							} else {
								// Check if it looks like an object property (has a colon)
								const currentLine = this.lexer.getCurrentLineText();
								const currentPos = this.lexer.getCurrentCharNumber();
								const remainingLine = currentLine.substring(currentPos);

								if (remainingLine.includes(':') && !remainingLine.trim().startsWith('#')) {
									// It's a nested object
									const nestedObject = this.parseBlockObject(nextIndent, this.lexer.getCurrentCharNumber());
									items.push(nestedObject);
								} else {
									// Not a nested structure, create empty string
									items.push(createStringNode('', itemStart, itemStart));
								}
							}
						} else {
							// No nested content, empty item
							items.push(createStringNode('', itemStart, itemStart));
						}
					} else {
						// End of input, empty item
						items.push(createStringNode('', itemStart, itemStart));
					}
				} else {
					// Parse the item value
					// Check if this is a multi-line object by looking for a colon and checking next lines
					const currentLine = this.lexer.getCurrentLineText();
					const currentPos = this.lexer.getCurrentCharNumber();
					const remainingLine = currentLine.substring(currentPos);

					// Check if there's a colon on this line (indicating object properties)
					const hasColon = remainingLine.includes(':');

					if (hasColon) {
						// Any line with a colon should be treated as an object
						// Parse as an object with the current item's indentation as the base
						const item = this.parseBlockObject(itemStart.character, itemStart.character);
						items.push(item);
					} else {
						// No colon, parse as regular value
						const item = this.parseValue();
						items.push(item);

						// Skip to end of line
						while (!this.lexer.isAtEnd() && this.lexer.getCurrentChar() !== '' && this.lexer.getCurrentChar() !== '#') {
							this.lexer.advance();
						}
						this.lexer.advanceLine();
					}
				}
			} else {
				// No dash found at expected indent level, break
				break;
			}
		}

		// Calculate end position based on the last item
		let end = start;
		if (items.length > 0) {
			const lastItem = items[items.length - 1];
			end = lastItem.end;
		} else {
			// If no items, end is right after the start
			end = createPosition(start.line, start.character + 1);
		}

		return createArrayNode(items, start, end);
	}

	parseBlockObject(baseIndent: number, baseCharPosition?: number): YamlObjectNode {
		const start = this.lexer.getCurrentPosition();
		const properties: { key: YamlStringNode; value: YamlNode }[] = [];
		const localKeysSeen = new Set<string>();

		// For parsing from current position (inline object parsing)
		const fromCurrentPosition = baseCharPosition !== undefined;
		let firstIteration = true;

		while (!this.lexer.isAtEnd()) {
			if (!firstIteration || !fromCurrentPosition) {
				this.lexer.moveToNextNonEmptyLine();
			}
			firstIteration = false;

			if (this.lexer.isAtEnd()) {
				break;
			}

			const currentIndent = this.lexer.getIndentation();

			if (fromCurrentPosition) {
				// For current position parsing, check character position alignment
				this.lexer.skipWhitespace();
				const currentCharPosition = this.lexer.getCurrentCharNumber();

				if (currentCharPosition < baseCharPosition) {
					break;
				}
			} else {
				// For normal block parsing, check indentation level
				if (currentIndent < baseIndent) {
					break;
				}

				// Check for incorrect indentation
				if (currentIndent > baseIndent) {
					const lineStart = createPosition(this.lexer.getCurrentLineNumber(), 0);
					const lineEnd = createPosition(this.lexer.getCurrentLineNumber(), this.lexer.getCurrentLineText().length);
					this.addError('Unexpected indentation', 'indentation', lineStart, lineEnd);

					// Try to recover by treating it as a property anyway
					this.lexer.skipWhitespace();
				} else {
					this.lexer.skipWhitespace();
				}
			}

			// Parse key
			const keyStart = this.lexer.getCurrentPosition();
			let keyValue = '';

			while (!this.lexer.isAtEnd() && this.lexer.getCurrentChar() !== '' && this.lexer.getCurrentChar() !== ':') {
				keyValue += this.lexer.advance();
			}

			keyValue = keyValue.trim();
			const keyEnd = this.lexer.getCurrentPosition();
			const key = createStringNode(keyValue, keyStart, keyEnd);

			// Check for duplicate keys
			if (!this.options.allowDuplicateKeys && localKeysSeen.has(keyValue)) {
				this.addError(`Duplicate key '${keyValue}'`, 'duplicateKey', keyStart, keyEnd);
			}
			localKeysSeen.add(keyValue);

			// Expect colon
			if (this.lexer.getCurrentChar() === ':') {
				this.lexer.advance();
			}

			this.lexer.skipWhitespace();

			// Determine if value is on same line or next line(s)
			let value: YamlNode;
			const valueStart = this.lexer.getCurrentPosition();

			if (this.lexer.getCurrentChar() === '' || this.lexer.getCurrentChar() === '#') {
				// Value is on next line(s) or empty
				this.lexer.advanceLine();

				// Check next line for nested content
				if (!this.lexer.isAtEnd()) {
					const nextIndent = this.lexer.getIndentation();

					if (nextIndent > currentIndent) {
						// Nested content - determine if it's an object, array, or just a scalar value
						this.lexer.skipWhitespace();

						if (this.lexer.getCurrentChar() === '-') {
							value = this.parseBlockArray(nextIndent);
						} else {
							// Check if this looks like an object property (has a colon)
							const currentLine = this.lexer.getCurrentLineText();
							const currentPos = this.lexer.getCurrentCharNumber();
							const remainingLine = currentLine.substring(currentPos);

							if (remainingLine.includes(':') && !remainingLine.trim().startsWith('#')) {
								// It's a nested object
								value = this.parseBlockObject(nextIndent);
							} else {
								// It's just a scalar value on the next line
								value = this.parseValue();
							}
						}
					} else if (!fromCurrentPosition && nextIndent === currentIndent) {
						// Same indentation level - check if it's an array item
						this.lexer.skipWhitespace();

						if (this.lexer.getCurrentChar() === '-') {
							value = this.parseBlockArray(currentIndent);
						} else {
							value = createStringNode('', valueStart, valueStart);
						}
					} else {
						value = createStringNode('', valueStart, valueStart);
					}
				} else {
					value = createStringNode('', valueStart, valueStart);
				}
			} else {
				// Value is on the same line
				value = this.parseValue();

				// Skip any remaining content on this line (comments, etc.)
				while (!this.lexer.isAtEnd() && this.lexer.getCurrentChar() !== '' && this.lexer.getCurrentChar() !== '#') {
					if (isWhitespace(this.lexer.getCurrentChar())) {
						this.lexer.advance();
					} else {
						break;
					}
				}

				// Skip to end of line if we hit a comment
				if (this.lexer.getCurrentChar() === '#') {
					this.lexer.skipToEndOfLine();
				}

				// Move to next line for next iteration
				if (!this.lexer.isAtEnd() && this.lexer.getCurrentChar() === '') {
					this.lexer.advanceLine();
				}
			}

			properties.push({ key, value });
		}

		// Calculate the end position based on the last property
		let end = start;
		if (properties.length > 0) {
			const lastProperty = properties[properties.length - 1];
			end = lastProperty.value.end;
		}

		return createObjectNode(properties, start, end);
	}

	parse(): YamlNode | undefined {
		if (this.lexer.isAtEnd()) {
			return undefined;
		}

		this.lexer.moveToNextNonEmptyLine();

		if (this.lexer.isAtEnd()) {
			return undefined;
		}

		// Determine the root structure type
		this.lexer.skipWhitespace();

		if (this.lexer.getCurrentChar() === '-') {
			// Check if this is an array item or a negative number
			// Look at the character after the dash
			const nextChar = this.lexer.peek();
			if (nextChar === ' ' || nextChar === '\t' || nextChar === '' || nextChar === '#') {
				// It's an array item (dash followed by whitespace/end/comment)
				return this.parseBlockArray(0);
			} else {
				// It's likely a negative number or other value, treat as single value
				return this.parseValue();
			}
		} else if (this.lexer.getCurrentChar() === '[') {
			// Root is an inline array
			return this.parseInlineArray();
		} else if (this.lexer.getCurrentChar() === '{') {
			// Root is an inline object
			return this.parseInlineObject();
		} else {
			// Check if this looks like a key-value pair by looking for a colon
			// For single values, there shouldn't be a colon
			const currentLine = this.lexer.getCurrentLineText();
			const currentPos = this.lexer.getCurrentCharNumber();
			const remainingLine = currentLine.substring(currentPos);

			// Check if there's a colon that's not inside quotes
			let hasColon = false;
			let inQuotes = false;
			let quoteChar = '';

			for (let i = 0; i < remainingLine.length; i++) {
				const char = remainingLine[i];

				if (!inQuotes && (char === '"' || char === `'`)) {
					inQuotes = true;
					quoteChar = char;
				} else if (inQuotes && char === quoteChar) {
					inQuotes = false;
					quoteChar = '';
				} else if (!inQuotes && char === ':') {
					hasColon = true;
					break;
				} else if (!inQuotes && char === '#') {
					// Comment starts, stop looking
					break;
				}
			}

			if (hasColon) {
				// Root is an object
				return this.parseBlockObject(0);
			} else {
				// Root is a single value
				return this.parseValue();
			}
		}
	}
}


