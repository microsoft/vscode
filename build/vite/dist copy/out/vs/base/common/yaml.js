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
export function parse(input, errors = [], options = {}) {
    const scanner = new YamlScanner(input);
    const tokens = scanner.scan();
    const parser = new YamlParser(tokens, input, errors, options);
    return parser.parse();
}
// -- Token Types -------------------------------------------------------------
var TokenType;
(function (TokenType) {
    // Scalar values (unquoted, single-quoted, double-quoted)
    TokenType[TokenType["Scalar"] = 0] = "Scalar";
    // Structural tokens
    TokenType[TokenType["Colon"] = 1] = "Colon";
    TokenType[TokenType["Dash"] = 2] = "Dash";
    TokenType[TokenType["Comma"] = 3] = "Comma";
    TokenType[TokenType["FlowMapStart"] = 4] = "FlowMapStart";
    TokenType[TokenType["FlowMapEnd"] = 5] = "FlowMapEnd";
    TokenType[TokenType["FlowSeqStart"] = 6] = "FlowSeqStart";
    TokenType[TokenType["FlowSeqEnd"] = 7] = "FlowSeqEnd";
    // Whitespace / structure
    TokenType[TokenType["Newline"] = 8] = "Newline";
    TokenType[TokenType["Indent"] = 9] = "Indent";
    TokenType[TokenType["Comment"] = 10] = "Comment";
    TokenType[TokenType["DocumentStart"] = 11] = "DocumentStart";
    TokenType[TokenType["DocumentEnd"] = 12] = "DocumentEnd";
    TokenType[TokenType["EOF"] = 13] = "EOF";
})(TokenType || (TokenType = {}));
function makeToken(type, startOffset, endOffset, extra) {
    return {
        type,
        startOffset,
        endOffset,
        rawValue: extra?.rawValue ?? '',
        value: extra?.value ?? '',
        format: extra?.format ?? 'none',
        indent: extra?.indent ?? 0,
    };
}
// -- Scanner -----------------------------------------------------------------
class YamlScanner {
    constructor(input) {
        this.input = input;
        this.pos = 0;
        this.tokens = [];
        // Track flow nesting depth so commas and flow indicators are only special inside flow collections
        this.flowDepth = 0;
        // Track whether we've already seen a block colon on the current line.
        // After the first key: value colon, subsequent ': ' on the same line is part of the scalar value.
        this.seenBlockColon = false;
    }
    scan() {
        while (this.pos < this.input.length) {
            this.scanLine();
        }
        this.tokens.push(makeToken(13 /* TokenType.EOF */, this.pos, this.pos));
        return this.tokens;
    }
    // Scan a single logical line (up to and including the newline character)
    scanLine() {
        this.seenBlockColon = false;
        // Handle blank lines / lines that are only whitespace
        if (this.peekChar() === '\n') {
            this.tokens.push(makeToken(8 /* TokenType.Newline */, this.pos, this.pos + 1));
            this.pos++;
            return;
        }
        if (this.peekChar() === '\r') {
            const end = this.pos + (this.input[this.pos + 1] === '\n' ? 2 : 1);
            this.tokens.push(makeToken(8 /* TokenType.Newline */, this.pos, end));
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
            this.tokens.push(makeToken(9 /* TokenType.Indent */, indentStart, this.pos, { indent }));
        }
        // If line is now empty (only whitespace before newline/EOF), emit newline
        if (this.pos >= this.input.length || this.peekChar() === '\n' || this.peekChar() === '\r') {
            if (this.pos < this.input.length) {
                const nlStart = this.pos;
                const end = this.peekChar() === '\r' && this.input[this.pos + 1] === '\n' ? this.pos + 2 : this.pos + 1;
                this.tokens.push(makeToken(8 /* TokenType.Newline */, nlStart, end));
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
                this.tokens.push(makeToken(11 /* TokenType.DocumentStart */, this.pos, this.pos + 3));
                this.pos += 3;
                this.scanLineContent();
                this.scanNewline();
                return;
            }
            if (c0 === '.' && c1 === '.' && c2 === '.' && isTerminator) {
                this.tokens.push(makeToken(12 /* TokenType.DocumentEnd */, this.pos, this.pos + 3));
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
    scanLineContent() {
        while (this.pos < this.input.length && this.peekChar() !== '\n' && this.peekChar() !== '\r') {
            this.skipInlineWhitespace();
            if (this.pos >= this.input.length || this.peekChar() === '\n' || this.peekChar() === '\r') {
                break;
            }
            const ch = this.peekChar();
            if (ch === '#') {
                this.scanComment();
                break; // comment consumes rest of line
            }
            else if (ch === '{') {
                this.flowDepth++;
                this.tokens.push(makeToken(4 /* TokenType.FlowMapStart */, this.pos, this.pos + 1));
                this.pos++;
            }
            else if (ch === '}' && this.flowDepth > 0) {
                this.flowDepth--;
                this.tokens.push(makeToken(5 /* TokenType.FlowMapEnd */, this.pos, this.pos + 1));
                this.pos++;
            }
            else if (ch === '[') {
                this.flowDepth++;
                this.tokens.push(makeToken(6 /* TokenType.FlowSeqStart */, this.pos, this.pos + 1));
                this.pos++;
            }
            else if (ch === ']' && this.flowDepth > 0) {
                this.flowDepth--;
                this.tokens.push(makeToken(7 /* TokenType.FlowSeqEnd */, this.pos, this.pos + 1));
                this.pos++;
            }
            else if (ch === ',' && this.flowDepth > 0) {
                this.tokens.push(makeToken(3 /* TokenType.Comma */, this.pos, this.pos + 1));
                this.pos++;
            }
            else if (ch === '-' && this.isBlockDash()) {
                // Block sequence indicator: '- ' or '-' at end of line
                this.tokens.push(makeToken(2 /* TokenType.Dash */, this.pos, this.pos + 1));
                this.pos++;
            }
            else if (ch === ':' && this.isBlockColon()) {
                this.tokens.push(makeToken(1 /* TokenType.Colon */, this.pos, this.pos + 1));
                this.pos++;
                if (this.flowDepth === 0) {
                    this.seenBlockColon = true;
                }
            }
            else if (ch === ':' && this.flowDepth > 0 && this.lastTokenIsJsonLike()) {
                // In flow context, ':' immediately following a JSON-like node (quoted scalar,
                // flow mapping, or flow sequence) is a value indicator even without trailing space
                this.tokens.push(makeToken(1 /* TokenType.Colon */, this.pos, this.pos + 1));
                this.pos++;
            }
            else if (ch === '\'' || ch === '"') {
                this.scanQuotedScalar(ch);
            }
            else if ((ch === '|' || ch === '>') && this.flowDepth === 0 && this.isBlockScalarStart()) {
                this.scanBlockScalar(ch);
                break; // Block scalar consumed multiple lines; return to main scan loop
            }
            else {
                this.scanUnquotedScalar();
            }
        }
    }
    /** Check if '-' is a block sequence dash (followed by space, newline, or EOF) */
    isBlockDash() {
        const next = this.input[this.pos + 1];
        return next === undefined || next === ' ' || next === '\t' || next === '\n' || next === '\r';
    }
    /** Check if ':' acts as a mapping value indicator (followed by space, newline, EOF, or flow indicator) */
    isBlockColon() {
        // In block context, after the first key-value colon on a line,
        // subsequent ': ' is part of the scalar value, not a mapping indicator.
        if (this.seenBlockColon && this.flowDepth === 0) {
            return false;
        }
        const next = this.input[this.pos + 1];
        if (next === undefined || next === ' ' || next === '\t' || next === '\n' || next === '\r') {
            return true;
        }
        // Flow indicators after colon only count inside flow context
        if (this.flowDepth > 0 && (next === ',' || next === '}' || next === ']')) {
            return true;
        }
        return false;
    }
    /** Check if the last non-whitespace token is a JSON-like node (quoted scalar or flow end) */
    lastTokenIsJsonLike() {
        for (let i = this.tokens.length - 1; i >= 0; i--) {
            const t = this.tokens[i];
            if (t.type === 8 /* TokenType.Newline */ || t.type === 9 /* TokenType.Indent */ || t.type === 10 /* TokenType.Comment */) {
                continue;
            }
            // Quoted scalar or flow collection end bracket
            if (t.type === 0 /* TokenType.Scalar */ && t.format !== 'none') {
                return true;
            }
            if (t.type === 5 /* TokenType.FlowMapEnd */ || t.type === 7 /* TokenType.FlowSeqEnd */) {
                return true;
            }
            return false;
        }
        return false;
    }
    scanQuotedScalar(quote) {
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
                this.tokens.push(makeToken(0 /* TokenType.Scalar */, start, this.pos, {
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
                    case 'n':
                        value += '\n';
                        break;
                    case 't':
                        value += '\t';
                        break;
                    case '\\':
                        value += '\\';
                        break;
                    case '"':
                        value += '"';
                        break;
                    case '/':
                        value += '/';
                        break;
                    case 'r':
                        value += '\r';
                        break;
                    case '0':
                        value += '\0';
                        break;
                    case 'a':
                        value += '\x07';
                        break;
                    case 'b':
                        value += '\b';
                        break;
                    case 'e':
                        value += '\x1b';
                        break;
                    case 'v':
                        value += '\v';
                        break;
                    case 'f':
                        value += '\f';
                        break;
                    case ' ':
                        value += ' ';
                        break;
                    case '_':
                        value += '\xa0';
                        break;
                    case 'x': {
                        // \xNN - 2-digit hex escape
                        const hex = this.input.substring(this.pos + 2, this.pos + 4);
                        const code = parseInt(hex, 16);
                        if (hex.length === 2 && !isNaN(code)) {
                            value += String.fromCharCode(code);
                            this.pos += 4;
                        }
                        else {
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
                        }
                        else {
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
                        }
                        else {
                            value += '\\U';
                            this.pos += 2;
                        }
                        trailingLiteralWs = 0;
                        continue;
                    }
                    default:
                        value += '\\' + (next ?? '');
                        break;
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
                    }
                    else {
                        break;
                    }
                }
                // Apply folding: empty lines → \n each, otherwise single newline → space
                if (emptyLineCount > 0) {
                    value += '\n'.repeat(emptyLineCount);
                }
                else {
                    value += ' ';
                }
                continue;
            }
            // Track literal whitespace for folding purposes
            if (ch === ' ' || ch === '\t') {
                trailingLiteralWs++;
            }
            else {
                trailingLiteralWs = 0;
            }
            value += ch;
            this.pos++;
        }
        // Unterminated string - emit what we have
        const rawValue = this.input.substring(start, this.pos);
        this.tokens.push(makeToken(0 /* TokenType.Scalar */, start, this.pos, {
            rawValue,
            value,
            format: quote === '\'' ? 'single' : 'double',
        }));
    }
    scanUnquotedScalar() {
        const start = this.pos;
        let end = this.pos;
        while (this.pos < this.input.length) {
            const ch = this.input[this.pos];
            // Stop at newline
            if (ch === '\n' || ch === '\r') {
                break;
            }
            // Stop at flow indicators (only inside flow collections)
            if (this.flowDepth > 0 && (ch === ',' || ch === '}' || ch === ']')) {
                break;
            }
            if (this.flowDepth > 0 && (ch === '{' || ch === '[')) {
                break;
            }
            // Stop at ': ' or ':' at end-of-line (mapping value indicator)
            if (ch === ':' && this.isBlockColon()) {
                break;
            }
            // Stop at ' #' (comment)
            if (ch === '#' && this.pos > start && (this.input[this.pos - 1] === ' ' || this.input[this.pos - 1] === '\t')) {
                break;
            }
            this.pos++;
            // Track the last non-whitespace position to trim trailing whitespace
            if (ch !== ' ' && ch !== '\t') {
                end = this.pos;
            }
        }
        const rawValue = this.input.substring(start, end);
        this.tokens.push(makeToken(0 /* TokenType.Scalar */, start, end, {
            rawValue,
            value: rawValue,
            format: 'none',
        }));
    }
    /**
     * Check if '|' or '>' at the current position is a block scalar indicator.
     * Must be followed by optional indentation/chomping indicators, optional comment, then newline.
     */
    isBlockScalarStart() {
        let p = this.pos + 1;
        // Skip optional indentation indicator (digit 1-9) and chomping indicator (+/-)
        while (p < this.input.length) {
            const c = this.input[p];
            if (c >= '1' && c <= '9') {
                p++;
                continue;
            }
            if (c === '+' || c === '-') {
                p++;
                continue;
            }
            break;
        }
        // Skip optional whitespace
        while (p < this.input.length && (this.input[p] === ' ' || this.input[p] === '\t')) {
            p++;
        }
        // Must be at newline, EOF, or comment
        if (p >= this.input.length) {
            return true;
        }
        const c = this.input[p];
        return c === '\n' || c === '\r' || c === '#';
    }
    /**
     * Scan a block scalar (literal '|' or folded '>').
     * Parses the header line for indentation indicator and chomping mode,
     * then collects all content lines that are indented beyond the detected indentation.
     */
    scanBlockScalar(style) {
        const start = this.pos;
        this.pos++; // skip '|' or '>'
        // Parse header: optional indentation indicator (1-9) and chomping indicator (+/-)
        let explicitIndent = 0;
        let chomping = 'clip';
        // The order of indent indicator and chomping indicator can vary (D83L test)
        for (let i = 0; i < 2; i++) {
            if (this.pos < this.input.length) {
                const c = this.input[this.pos];
                if (c >= '1' && c <= '9' && explicitIndent === 0) {
                    explicitIndent = parseInt(c, 10);
                    this.pos++;
                }
                else if (c === '-' && chomping === 'clip') {
                    chomping = 'strip';
                    this.pos++;
                }
                else if (c === '+' && chomping === 'clip') {
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
        const lines = [];
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
                    }
                    else {
                        trailingNewlines = 0;
                    }
                }
                else {
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
        let value;
        if (style === '|') {
            // Literal: join lines with newlines (preserving all line breaks as-is)
            value = lines.join('\n');
        }
        else {
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
                }
                else if (i === 0) {
                    value = line;
                    lastNonEmptyIsMoreIndented = isMoreIndented;
                    seenNonEmpty = true;
                }
                else if (inEmptyRun) {
                    // Transitioning from empty lines back to content.
                    // If the previous content or current line is more-indented
                    // AND we've seen content before, the break is preserved.
                    // Otherwise the empties already provided all needed line breaks.
                    if ((lastNonEmptyIsMoreIndented || isMoreIndented) && seenNonEmpty) {
                        value += '\n' + line;
                    }
                    else {
                        value += line;
                    }
                    lastNonEmptyIsMoreIndented = isMoreIndented;
                    inEmptyRun = false;
                    seenNonEmpty = true;
                }
                else if (isMoreIndented || lastNonEmptyIsMoreIndented) {
                    // More-indented line → preserve newline
                    value += '\n' + line;
                    lastNonEmptyIsMoreIndented = isMoreIndented;
                    seenNonEmpty = true;
                }
                else {
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
                }
                else {
                    // No content, only trailing empties
                    value = '\n'.repeat(trailingNewlines);
                }
                break;
            case 'strip':
                // No trailing newline
                break;
        }
        const rawValue = this.input.substring(start, this.pos);
        this.tokens.push(makeToken(0 /* TokenType.Scalar */, start, this.pos, {
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
    getParentBlockIndent(blockScalarPos) {
        for (let i = this.tokens.length - 1; i >= 0; i--) {
            const t = this.tokens[i];
            if (t.type === 8 /* TokenType.Newline */ || t.type === 10 /* TokenType.Comment */ || t.type === 9 /* TokenType.Indent */) {
                continue;
            }
            if (t.type === 1 /* TokenType.Colon */) {
                // Block scalar is a mapping value. The parent indentation
                // is the column of the mapping key (the scalar before the colon).
                for (let j = i - 1; j >= 0; j--) {
                    const kt = this.tokens[j];
                    if (kt.type === 8 /* TokenType.Newline */ || kt.type === 10 /* TokenType.Comment */ || kt.type === 9 /* TokenType.Indent */) {
                        continue;
                    }
                    // Found the key token - return its column
                    return this.getColumnAt(kt.startOffset);
                }
                return 0;
            }
            if (t.type === 2 /* TokenType.Dash */) {
                // Block scalar is a sequence item. Parent indent = column of the dash.
                return this.getColumnAt(t.startOffset);
            }
            // Document root - content at indent 0 is valid
            if (t.type === 11 /* TokenType.DocumentStart */) {
                return -1;
            }
            // For any other token, use 0
            break;
        }
        return 0;
    }
    /**
     * Get the column (0-based offset from start of line) for a position in the input.
     */
    getColumnAt(offset) {
        let col = 0;
        let p = offset - 1;
        while (p >= 0 && this.input[p] !== '\n' && this.input[p] !== '\r') {
            col++;
            p--;
        }
        return col;
    }
    scanComment() {
        const start = this.pos;
        while (this.pos < this.input.length && this.input[this.pos] !== '\n' && this.input[this.pos] !== '\r') {
            this.pos++;
        }
        this.tokens.push(makeToken(10 /* TokenType.Comment */, start, this.pos, {
            rawValue: this.input.substring(start, this.pos),
            value: this.input.substring(start, this.pos),
        }));
    }
    scanNewline() {
        const start = this.pos;
        if (this.consumeNewline()) {
            this.tokens.push(makeToken(8 /* TokenType.Newline */, start, this.pos));
        }
    }
    skipInlineWhitespace() {
        while (this.pos < this.input.length) {
            const ch = this.input[this.pos];
            if (ch === ' ' || ch === '\t') {
                this.pos++;
            }
            else {
                break;
            }
        }
    }
    /** Advance past a newline sequence (\r\n, \n, or \r). Returns true if a newline was consumed. */
    consumeNewline() {
        if (this.pos >= this.input.length) {
            return false;
        }
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
    peekChar() {
        return this.input[this.pos];
    }
}
// -- Parser ------------------------------------------------------------------
class YamlParser {
    constructor(tokens, input, errors, options) {
        this.tokens = tokens;
        this.input = input;
        this.errors = errors;
        this.options = options;
        this.pos = 0;
    }
    parse() {
        this.skipNewlinesAndComments();
        // Skip document start marker (---) if present
        if (this.currentToken().type === 11 /* TokenType.DocumentStart */) {
            this.advance();
            this.skipNewlinesAndComments();
        }
        if (this.currentToken().type === 13 /* TokenType.EOF */ || this.currentToken().type === 12 /* TokenType.DocumentEnd */) {
            return undefined;
        }
        const result = this.parseValue(-1);
        return result;
    }
    // -- helpers ----------------------------------------------------------
    currentToken() {
        return this.tokens[this.pos];
    }
    peek(offset = 0) {
        return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
    }
    advance() {
        const t = this.tokens[this.pos];
        if (t.type !== 13 /* TokenType.EOF */) {
            this.pos++;
        }
        return t;
    }
    expect(type) {
        const t = this.currentToken();
        if (t.type === type) {
            return this.advance();
        }
        return t;
    }
    emitError(message, startOffset, endOffset, code) {
        this.errors.push({ message, startOffset, endOffset, code });
    }
    skipNewlinesAndComments() {
        while (this.currentToken().type === 8 /* TokenType.Newline */ ||
            this.currentToken().type === 10 /* TokenType.Comment */ ||
            (this.currentToken().type === 9 /* TokenType.Indent */ && this.isFollowedByNewlineOrComment())) {
            this.advance();
        }
    }
    /** Returns true if the current Indent token is followed immediately by Newline/Comment/EOF */
    isFollowedByNewlineOrComment() {
        const next = this.peek(1);
        return next.type === 8 /* TokenType.Newline */ || next.type === 10 /* TokenType.Comment */ || next.type === 13 /* TokenType.EOF */;
    }
    /**
     * Determines the current indentation level.
     * If the current token is an Indent, returns its indent value.
     * Otherwise returns 0 (token is at column 0).
     */
    currentIndent() {
        if (this.currentToken().type === 9 /* TokenType.Indent */) {
            return this.currentToken().indent;
        }
        return 0;
    }
    // -- Main parse entry for a value at a given indentation --------------
    parseValue(parentIndent) {
        this.skipNewlinesAndComments();
        const token = this.currentToken();
        // Flow collections (also check past indent)
        const flowToken = token.type === 9 /* TokenType.Indent */ ? this.peek(1) : token;
        if (flowToken.type === 4 /* TokenType.FlowMapStart */ || flowToken.type === 6 /* TokenType.FlowSeqStart */) {
            if (token.type === 9 /* TokenType.Indent */) {
                this.advance();
            }
            if (flowToken.type === 4 /* TokenType.FlowMapStart */) {
                return this.parseFlowMap();
            }
            return this.parseFlowSeq();
        }
        // Block-level: detect if this is a sequence or mapping
        const indent = this.currentIndent();
        // Determine what the first meaningful token is at this indent
        const firstContentToken = this.peekPastIndent();
        if (firstContentToken.type === 2 /* TokenType.Dash */) {
            return this.parseBlockSequence(indent);
        }
        // Check if this looks like a mapping (scalar followed by colon)
        if (this.looksLikeMapping()) {
            return this.parseBlockMapping(indent);
        }
        // Otherwise it's a scalar
        if (token.type === 0 /* TokenType.Scalar */ || token.type === 9 /* TokenType.Indent */) {
            return this.parseScalar(parentIndent);
        }
        return undefined;
    }
    /** Peek past an optional Indent token to see the first content token */
    peekPastIndent() {
        if (this.currentToken().type === 9 /* TokenType.Indent */) {
            return this.peek(1);
        }
        return this.currentToken();
    }
    /** Check if tokens at current position look like a mapping entry (key: value) */
    looksLikeMapping() {
        let offset = 0;
        if (this.peek(offset).type === 9 /* TokenType.Indent */) {
            offset++;
        }
        if (this.peek(offset).type === 0 /* TokenType.Scalar */) {
            offset++;
            if (this.peek(offset).type === 1 /* TokenType.Colon */) {
                return true;
            }
        }
        return false;
    }
    // -- Scalar ----------------------------------------------------------
    parseScalar(parentIndent = -1) {
        // Skip indent if present
        if (this.currentToken().type === 9 /* TokenType.Indent */) {
            this.advance();
        }
        const token = this.expect(0 /* TokenType.Scalar */);
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
    parsePlainMultiline(firstToken, parentIndent) {
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
                if (t.type === 10 /* TokenType.Comment */) {
                    // Comment terminates a plain scalar
                    break;
                }
                if (t.type === 8 /* TokenType.Newline */) {
                    this.advance();
                    // Check if the next thing after this newline is blank or content
                    const afterNewline = this.currentToken();
                    if (afterNewline.type === 8 /* TokenType.Newline */) {
                        // Another newline means an empty line
                        emptyLineCount++;
                        continue;
                    }
                    if (afterNewline.type === 9 /* TokenType.Indent */) {
                        // Check what follows the indent
                        const afterIndent = this.peek(1);
                        if (afterIndent.type === 8 /* TokenType.Newline */ || afterIndent.type === 13 /* TokenType.EOF */) {
                            // Indent followed by newline = empty line
                            emptyLineCount++;
                            this.advance(); // skip the indent
                            continue;
                        }
                        if (afterIndent.type === 10 /* TokenType.Comment */) {
                            // Comment terminates scalar
                            break;
                        }
                        // Content on this line - check indentation
                        if (afterNewline.indent > parentIndent) {
                            // Valid continuation line
                            foundContent = true;
                            break;
                        }
                        else {
                            // Not deep enough - not a continuation
                            break;
                        }
                    }
                    if (afterNewline.type === 13 /* TokenType.EOF */) {
                        break;
                    }
                    // Document markers terminate plain scalars
                    if (afterNewline.type === 11 /* TokenType.DocumentStart */ || afterNewline.type === 12 /* TokenType.DocumentEnd */) {
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
                if (t.type === 9 /* TokenType.Indent */) {
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
            if (this.currentToken().type === 9 /* TokenType.Indent */) {
                this.advance();
            }
            // The next token must be a Scalar for continuation
            if (this.currentToken().type !== 0 /* TokenType.Scalar */) {
                // A dash at a deeper indent than the parent is text content, not a sequence indicator
                // (e.g., "- single multiline\n - sequence entry" → one scalar "single multiline - sequence entry")
                if (this.currentToken().type === 2 /* TokenType.Dash */) {
                    const dashToken = this.advance();
                    let lineText = '-';
                    if (this.currentToken().type === 0 /* TokenType.Scalar */) {
                        const restToken = this.advance();
                        lineText = '- ' + restToken.value;
                        endOffset = restToken.endOffset;
                    }
                    else {
                        endOffset = dashToken.endOffset;
                    }
                    if (emptyLineCount > 0) {
                        value += '\n'.repeat(emptyLineCount);
                    }
                    else {
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
            if (this.peek(1).type === 1 /* TokenType.Colon */) {
                this.pos = savedPos;
                break;
            }
            const contToken = this.advance();
            // Apply line folding: empty lines become \n, single line break becomes space
            if (emptyLineCount > 0) {
                value += '\n'.repeat(emptyLineCount);
            }
            else {
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
    parseBlockMapping(baseIndent, inlineFirstEntry = false) {
        const startOffset = this.currentToken().startOffset;
        const properties = [];
        const seenKeys = new Set();
        // When called after a sequence dash, the first key is already at the current position
        if (inlineFirstEntry) {
            const firstEntry = this.parseMappingEntry(baseIndent);
            if (firstEntry) {
                seenKeys.add(firstEntry.key.value);
                properties.push(firstEntry);
            }
        }
        while (this.currentToken().type !== 13 /* TokenType.EOF */) {
            this.skipNewlinesAndComments();
            if (this.currentToken().type === 13 /* TokenType.EOF */) {
                break;
            }
            const indent = this.currentIndent();
            if (indent < baseIndent) {
                break;
            }
            if (indent !== baseIndent) {
                if (indent > baseIndent) {
                    this.emitError(localize('unexpectedIndentation', 'Unexpected indentation (expected {0}, got {1})', baseIndent, indent), this.currentToken().startOffset, this.currentToken().endOffset, 'unexpected-indentation');
                }
                else {
                    break;
                }
            }
            if (!this.looksLikeMapping()) {
                break;
            }
            const entry = this.parseMappingEntry(baseIndent);
            if (!entry) {
                break;
            }
            if (!this.options.allowDuplicateKeys && seenKeys.has(entry.key.value)) {
                this.emitError(localize('duplicateKey', 'Duplicate key: "{0}"', entry.key.value), entry.key.startOffset, entry.key.endOffset, 'duplicate-key');
            }
            seenKeys.add(entry.key.value);
            properties.push(entry);
        }
        const endOffset = properties.length > 0 ? properties[properties.length - 1].value.endOffset : startOffset;
        return { type: 'map', properties, style: 'block', startOffset, endOffset };
    }
    parseMappingEntry(baseIndent) {
        // Skip indent
        if (this.currentToken().type === 9 /* TokenType.Indent */) {
            this.advance();
        }
        // Parse key
        const keyToken = this.expect(0 /* TokenType.Scalar */);
        const key = this.scalarFromToken(keyToken);
        // Expect colon
        const colon = this.expect(1 /* TokenType.Colon */);
        if (colon.type !== 1 /* TokenType.Colon */) {
            this.emitError(localize('expectedColon', 'Expected ":"'), colon.startOffset, colon.endOffset, 'expected-colon');
            return undefined;
        }
        // Parse value: could be on same line or next line (indented)
        const value = this.parseMappingValue(baseIndent, colon);
        return { key, value };
    }
    parseMappingValue(baseIndent, colonToken) {
        // Check if there's a value on the same line after the colon
        const next = this.currentToken();
        // Same-line flow collections
        if (next.type === 4 /* TokenType.FlowMapStart */) {
            return this.parseFlowMap();
        }
        if (next.type === 6 /* TokenType.FlowSeqStart */) {
            return this.parseFlowSeq();
        }
        // Same-line scalar (may be multiline with continuation)
        if (next.type === 0 /* TokenType.Scalar */) {
            // Skip indent if present (shouldn't be here, but be safe)
            if (this.currentToken().type === 9 /* TokenType.Indent */) {
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
        if (afterNewline.type === 13 /* TokenType.EOF */) {
            // Missing value at end of input
            this.emitError(localize('missingValue', 'Missing value'), colonToken.startOffset, colonToken.endOffset, 'missing-value');
            return this.makeEmptyScalar(colonToken.endOffset);
        }
        const nextIndent = this.currentIndent();
        // Special case: a sequence at the same indent as the mapping key is allowed
        // as the mapping value (e.g., "foo:\n- 42")
        if (nextIndent === baseIndent && this.peekPastIndent().type === 2 /* TokenType.Dash */) {
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
    parseBlockSequence(baseIndent) {
        const items = [];
        const startOffset = this.currentToken().startOffset;
        let endOffset = startOffset;
        let isFirstItem = true;
        while (this.currentToken().type !== 13 /* TokenType.EOF */) {
            this.skipNewlinesAndComments();
            if (this.currentToken().type === 13 /* TokenType.EOF */) {
                break;
            }
            // For the first item, the dash may be on the same line (no Indent token).
            // Compute the actual column to check against baseIndent.
            let indent;
            if (isFirstItem && this.currentToken().type === 2 /* TokenType.Dash */) {
                indent = this.currentToken().startOffset - this.getLineStart(this.currentToken().startOffset);
            }
            else {
                indent = this.currentIndent();
            }
            isFirstItem = false;
            if (indent < baseIndent) {
                break;
            }
            if (indent !== baseIndent) {
                if (indent > baseIndent) {
                    this.emitError(localize('unexpectedIndentation', 'Unexpected indentation (expected {0}, got {1})', baseIndent, indent), this.currentToken().startOffset, this.currentToken().endOffset, 'unexpected-indentation');
                }
                else {
                    break;
                }
            }
            const contentToken = this.peekPastIndent();
            if (contentToken.type !== 2 /* TokenType.Dash */) {
                break;
            }
            // Skip indent
            if (this.currentToken().type === 9 /* TokenType.Indent */) {
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
    parseSequenceItemValue(baseIndent, dashToken) {
        const next = this.currentToken();
        // Skip comment after dash
        if (next.type === 10 /* TokenType.Comment */) {
            this.advance();
        }
        // Flow collections on same line
        if (next.type === 4 /* TokenType.FlowMapStart */) {
            return this.parseFlowMap();
        }
        if (next.type === 6 /* TokenType.FlowSeqStart */) {
            return this.parseFlowSeq();
        }
        // Nested sequence on same line (e.g., '- - value')
        if (next.type === 2 /* TokenType.Dash */) {
            // The nested sequence's base indent is the column of the dash
            const nestedIndent = next.startOffset - this.getLineStart(next.startOffset);
            return this.parseBlockSequence(nestedIndent);
        }
        // Inline scalar on same line
        if (next.type === 0 /* TokenType.Scalar */) {
            // Check if this is actually a mapping (key: value on same line after dash)
            if (this.peek(1).type === 1 /* TokenType.Colon */) {
                // It's an inline mapping after '- ' like '- name: John'
                // The implicit indent for continuation lines is the column of the key
                const itemIndent = next.startOffset - this.getLineStart(next.startOffset);
                return this.parseBlockMapping(itemIndent, true);
            }
            return this.parseScalar(baseIndent);
        }
        // Value on next line
        this.skipNewlinesAndComments();
        if (this.currentToken().type === 13 /* TokenType.EOF */) {
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
    getLineStart(offset) {
        let i = offset - 1;
        while (i >= 0 && this.input[i] !== '\n' && this.input[i] !== '\r') {
            i--;
        }
        return i + 1;
    }
    // -- Flow map --------------------------------------------------------
    parseFlowMap() {
        const startToken = this.advance(); // consume '{'
        const properties = [];
        this.skipFlowWhitespace();
        while (this.currentToken().type !== 5 /* TokenType.FlowMapEnd */ && this.currentToken().type !== 13 /* TokenType.EOF */) {
            // Parse key (must be a scalar)
            let key;
            if (this.currentToken().type === 0 /* TokenType.Scalar */) {
                key = this.parseFlowScalar();
            }
            else {
                this.emitError(localize('expectedMappingKey', 'Expected mapping key'), this.currentToken().startOffset, this.currentToken().endOffset, 'expected-key');
                break;
            }
            this.skipFlowWhitespace();
            // Check for colon - if missing, the key has an empty value (terminated by comma or })
            let value;
            if (this.currentToken().type === 1 /* TokenType.Colon */) {
                this.advance();
                this.skipFlowWhitespace();
                // Parse value
                value = this.parseFlowValue();
            }
            else {
                // Key without value (e.g., { key, other: val })
                value = this.makeEmptyScalar(key.endOffset);
            }
            properties.push({ key, value });
            this.skipFlowWhitespace();
            // Consume comma if present
            if (this.currentToken().type === 3 /* TokenType.Comma */) {
                this.advance();
                this.skipFlowWhitespace();
            }
        }
        const endToken = this.currentToken();
        if (endToken.type === 5 /* TokenType.FlowMapEnd */) {
            this.advance();
        }
        else {
            this.emitError(localize('expectedFlowMapEnd', 'Expected "}"'), endToken.startOffset, endToken.endOffset, 'expected-flow-map-end');
        }
        return {
            type: 'map',
            properties,
            style: 'flow',
            startOffset: startToken.startOffset,
            endOffset: endToken.type === 5 /* TokenType.FlowMapEnd */ ? endToken.endOffset : endToken.startOffset,
        };
    }
    // -- Flow sequence ---------------------------------------------------
    parseFlowSeq() {
        const startToken = this.advance(); // consume '['
        const items = [];
        this.skipFlowWhitespace();
        while (this.currentToken().type !== 7 /* TokenType.FlowSeqEnd */ && this.currentToken().type !== 13 /* TokenType.EOF */) {
            let item;
            if (this.currentToken().type === 4 /* TokenType.FlowMapStart */) {
                item = this.parseFlowMap();
            }
            else if (this.currentToken().type === 6 /* TokenType.FlowSeqStart */) {
                item = this.parseFlowSeq();
            }
            else if (this.currentToken().type === 0 /* TokenType.Scalar */) {
                item = this.parseFlowScalar();
            }
            else {
                this.emitError(localize('unexpectedTokenInFlowSeq', 'Unexpected token in flow sequence'), this.currentToken().startOffset, this.currentToken().endOffset, 'unexpected-token');
                this.advance();
                continue;
            }
            items.push(item);
            this.skipFlowWhitespace();
            if (this.currentToken().type === 3 /* TokenType.Comma */) {
                this.advance();
                this.skipFlowWhitespace();
            }
        }
        const endToken = this.currentToken();
        if (endToken.type === 7 /* TokenType.FlowSeqEnd */) {
            this.advance();
        }
        else {
            this.emitError(localize('expectedFlowSeqEnd', 'Expected "]"'), endToken.startOffset, endToken.endOffset, 'expected-flow-seq-end');
        }
        return {
            type: 'sequence',
            items,
            style: 'flow',
            startOffset: startToken.startOffset,
            endOffset: endToken.type === 7 /* TokenType.FlowSeqEnd */ ? endToken.endOffset : endToken.startOffset,
        };
    }
    /**
     * Parse a scalar inside a flow collection, handling multiline plain scalars.
     * In flow context, plain (unquoted) scalars can span multiple lines;
     * line breaks are folded into spaces.
     */
    parseFlowScalar() {
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
                if (t.type === 8 /* TokenType.Newline */) {
                    hasNewline = true;
                    p++;
                }
                else if (t.type === 9 /* TokenType.Indent */ || t.type === 10 /* TokenType.Comment */) {
                    p++;
                }
                else {
                    break;
                }
            }
            if (!hasNewline || p >= this.tokens.length) {
                break;
            }
            const nextToken = this.tokens[p];
            if (nextToken.type === 0 /* TokenType.Scalar */ && nextToken.format === 'none') {
                // Fold continuation line into the scalar
                this.pos = p + 1;
                value += ' ' + nextToken.value;
                endOffset = nextToken.endOffset;
            }
            else {
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
    parseFlowValue() {
        if (this.currentToken().type === 4 /* TokenType.FlowMapStart */) {
            return this.parseFlowMap();
        }
        else if (this.currentToken().type === 6 /* TokenType.FlowSeqStart */) {
            return this.parseFlowSeq();
        }
        else if (this.currentToken().type === 0 /* TokenType.Scalar */) {
            return this.parseFlowScalar();
        }
        else {
            return this.makeEmptyScalar(this.currentToken().startOffset);
        }
    }
    /** Skip whitespace, newlines, and comments inside flow collections */
    skipFlowWhitespace() {
        while (true) {
            const t = this.currentToken().type;
            if (t === 8 /* TokenType.Newline */ || t === 9 /* TokenType.Indent */ || t === 10 /* TokenType.Comment */) {
                this.advance();
            }
            else {
                break;
            }
        }
    }
    scalarFromToken(token) {
        return {
            type: 'scalar',
            value: token.value,
            rawValue: token.rawValue,
            startOffset: token.startOffset,
            endOffset: token.endOffset,
            format: token.format,
        };
    }
    makeEmptyScalar(offset) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoieWFtbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvY29tbW9uL3lhbWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUV4Qzs7Ozs7Ozs7Ozs7OztHQWFHO0FBQ0gsTUFBTSxVQUFVLEtBQUssQ0FBQyxLQUFhLEVBQUUsU0FBMkIsRUFBRSxFQUFFLFVBQXdCLEVBQUU7SUFDN0YsTUFBTSxPQUFPLEdBQUcsSUFBSSxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDdkMsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDO0lBQzlCLE1BQU0sTUFBTSxHQUFHLElBQUksVUFBVSxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQzlELE9BQU8sTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDO0FBQ3ZCLENBQUM7QUEwQ0QsK0VBQStFO0FBRS9FLElBQVcsU0FrQlY7QUFsQkQsV0FBVyxTQUFTO0lBQ25CLHlEQUF5RDtJQUN6RCw2Q0FBTSxDQUFBO0lBQ04sb0JBQW9CO0lBQ3BCLDJDQUFLLENBQUE7SUFDTCx5Q0FBSSxDQUFBO0lBQ0osMkNBQUssQ0FBQTtJQUNMLHlEQUFZLENBQUE7SUFDWixxREFBVSxDQUFBO0lBQ1YseURBQVksQ0FBQTtJQUNaLHFEQUFVLENBQUE7SUFDVix5QkFBeUI7SUFDekIsK0NBQU8sQ0FBQTtJQUNQLDZDQUFNLENBQUE7SUFDTixnREFBTyxDQUFBO0lBQ1AsNERBQWEsQ0FBQTtJQUNiLHdEQUFXLENBQUE7SUFDWCx3Q0FBRyxDQUFBO0FBQ0osQ0FBQyxFQWxCVSxTQUFTLEtBQVQsU0FBUyxRQWtCbkI7QUFnQkQsU0FBUyxTQUFTLENBQ2pCLElBQWUsRUFDZixXQUFtQixFQUNu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d0JBQUUsS0FBSyxJQUFJLEdBQUcsQ0FBQzt3QkFBQyxNQUFNO29CQUM5QixLQUFLLEdBQUc7d0JBQUUsS0FBSyxJQUFJLEdBQUcsQ0FBQzt3QkFBQyxNQUFNO29CQUM5QixLQUFLLEdBQUc7d0JBQUUsS0FBSyxJQUFJLElBQUksQ0FBQzt3QkFBQyxNQUFNO29CQUMvQixLQUFLLEdBQUc7d0JBQUUsS0FBSyxJQUFJLElBQUksQ0FBQzt3QkFBQyxNQUFNO29CQUMvQixLQUFLLEdBQUc7d0JBQUUsS0FBSyxJQUFJLE1BQU0sQ0FBQzt3QkFBQyxNQUFNO29CQUNqQyxLQUFLLEdBQUc7d0JBQUUsS0FBSyxJQUFJLElBQUksQ0FBQzt3QkFBQyxNQUFNO29CQUMvQixLQUFLLEdBQUc7d0JBQUUsS0FBSyxJQUFJLE1BQU0sQ0FBQzt3QkFBQyxNQUFNO29CQUNqQyxLQUFLLEdBQUc7d0JBQUUsS0FBSyxJQUFJLElBQUksQ0FBQzt3QkFBQyxNQUFNO29CQUMvQixLQUFLLEdBQUc7d0JBQUUsS0FBSyxJQUFJLElBQUksQ0FBQzt3QkFBQyxNQUFNO29CQUMvQixLQUFLLEdBQUc7d0JBQUUsS0FBSyxJQUFJLEdBQUcsQ0FBQzt3QkFBQyxNQUFNO29CQUM5QixLQUFLLEdBQUc7d0JBQUUsS0FBSyxJQUFJLE1BQU0sQ0FBQzt3QkFBQyxNQUFNO29CQUNqQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUM7d0JBQ1YsNEJBQTRCO3dCQUM1QixNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsR0FBRyxHQUFHLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO3dCQUM3RCxNQUFNLElBQUksR0FBRyxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxDQUFDO3dCQUMvQixJQUFJLEdBQUcsQ0FBQyxNQUFNLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7NEJBQ3RDLEtBQUssSUFBSSxNQUFNLENBQUMs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