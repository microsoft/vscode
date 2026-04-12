/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { illegalState } from '../../../base/common/errors.js';
import { localize } from '../../../nls.js';
export var TokenType;
(function (TokenType) {
    TokenType[TokenType["LParen"] = 0] = "LParen";
    TokenType[TokenType["RParen"] = 1] = "RParen";
    TokenType[TokenType["Neg"] = 2] = "Neg";
    TokenType[TokenType["Eq"] = 3] = "Eq";
    TokenType[TokenType["NotEq"] = 4] = "NotEq";
    TokenType[TokenType["Lt"] = 5] = "Lt";
    TokenType[TokenType["LtEq"] = 6] = "LtEq";
    TokenType[TokenType["Gt"] = 7] = "Gt";
    TokenType[TokenType["GtEq"] = 8] = "GtEq";
    TokenType[TokenType["RegexOp"] = 9] = "RegexOp";
    TokenType[TokenType["RegexStr"] = 10] = "RegexStr";
    TokenType[TokenType["True"] = 11] = "True";
    TokenType[TokenType["False"] = 12] = "False";
    TokenType[TokenType["In"] = 13] = "In";
    TokenType[TokenType["Not"] = 14] = "Not";
    TokenType[TokenType["And"] = 15] = "And";
    TokenType[TokenType["Or"] = 16] = "Or";
    TokenType[TokenType["Str"] = 17] = "Str";
    TokenType[TokenType["QuotedStr"] = 18] = "QuotedStr";
    TokenType[TokenType["Error"] = 19] = "Error";
    TokenType[TokenType["EOF"] = 20] = "EOF";
})(TokenType || (TokenType = {}));
function hintDidYouMean(...meant) {
    switch (meant.length) {
        case 1:
            return localize('contextkey.scanner.hint.didYouMean1', "Did you mean {0}?", meant[0]);
        case 2:
            return localize('contextkey.scanner.hint.didYouMean2', "Did you mean {0} or {1}?", meant[0], meant[1]);
        case 3:
            return localize('contextkey.scanner.hint.didYouMean3', "Did you mean {0}, {1} or {2}?", meant[0], meant[1], meant[2]);
        default: // we just don't expect that many
            return undefined;
    }
}
const hintDidYouForgetToOpenOrCloseQuote = localize('contextkey.scanner.hint.didYouForgetToOpenOrCloseQuote', "Did you forget to open or close the quote?");
const hintDidYouForgetToEscapeSlash = localize('contextkey.scanner.hint.didYouForgetToEscapeSlash', "Did you forget to escape the '/' (slash) character? Put two backslashes before it to escape, e.g., '\\\\/\'.");
/**
 * A simple scanner for context keys.
 *
 * Example:
 *
 * ```ts
 * const scanner = new Scanner().reset('resourceFileName =~ /docker/ && !config.docker.enabled');
 * const tokens = [...scanner];
 * if (scanner.errorTokens.length > 0) {
 *     scanner.errorTokens.forEach(err => console.error(`Unexpected token at ${err.offset}: ${err.lexeme}\nHint: ${err.additional}`));
 * } else {
 *     // process tokens
 * }
 * ```
 */
export class Scanner {
    constructor() {
        this._input = '';
        this._start = 0;
        this._current = 0;
        this._tokens = [];
        this._errors = [];
        // u - unicode, y - sticky // TODO@ulugbekna: we accept double quotes as part of the string rather than as a delimiter (to preserve old parser's behavior)
        this.stringRe = /[a-zA-Z0-9_<>\-\./\\:\*\?\+\[\]\^,#@;"%\$\p{L}-]+/uy;
    }
    static getLexeme(token) {
        switch (token.type) {
            case 0 /* TokenType.LParen */:
                return '(';
            case 1 /* TokenType.RParen */:
                return ')';
            case 2 /* TokenType.Neg */:
                return '!';
            case 3 /* TokenType.Eq */:
                return token.isTripleEq ? '===' : '==';
            case 4 /* TokenType.NotEq */:
                return token.isTripleEq ? '!==' : '!=';
            case 5 /* TokenType.Lt */:
                return '<';
            case 6 /* TokenType.LtEq */:
                return '<=';
            case 7 /* TokenType.Gt */:
                return '>=';
            case 8 /* TokenType.GtEq */:
                return '>=';
            case 9 /* TokenType.RegexOp */:
                return '=~';
            case 10 /* TokenType.RegexStr */:
                return token.lexeme;
            case 11 /* TokenType.True */:
                return 'true';
            case 12 /* TokenType.False */:
                return 'false';
            case 13 /* TokenType.In */:
                return 'in';
            case 14 /* TokenType.Not */:
                return 'not';
            case 15 /* TokenType.And */:
                return '&&';
            case 16 /* TokenType.Or */:
                return '||';
            case 17 /* TokenType.Str */:
                return token.lexeme;
            case 18 /* TokenType.QuotedStr */:
                return token.lexeme;
            case 19 /* TokenType.Error */:
                return token.lexeme;
            case 20 /* TokenType.EOF */:
                return 'EOF';
            default:
                throw illegalState(`unhandled token type: ${JSON.stringify(token)}; have you forgotten to add a case?`);
        }
    }
    static { this._regexFlags = new Set(['i', 'g', 's', 'm', 'y', 'u'].map(ch => ch.charCodeAt(0))); }
    static { this._keywords = new Map([
        ['not', 14 /* TokenType.Not */],
        ['in', 13 /* TokenType.In */],
        ['false', 12 /* TokenType.False */],
        ['true', 11 /* TokenType.True */],
    ]); }
    get errors() {
        return this._errors;
    }
    reset(value) {
        this._input = value;
        this._start = 0;
        this._current = 0;
        this._tokens = [];
        this._errors = [];
        return this;
    }
    scan() {
        while (!this._isAtEnd()) {
            this._start = this._current;
            const ch = this._advance();
            switch (ch) {
                case 40 /* CharCode.OpenParen */:
                    this._addToken(0 /* TokenType.LParen */);
                    break;
                case 41 /* CharCode.CloseParen */:
                    this._addToken(1 /* TokenType.RParen */);
                    break;
                case 33 /* CharCode.ExclamationMark */:
                    if (this._match(61 /* CharCode.Equals */)) {
                        const isTripleEq = this._match(61 /* CharCode.Equals */); // eat last `=` if `!==`
                        this._tokens.push({ type: 4 /* TokenType.NotEq */, offset: this._start, isTripleEq });
                    }
                    else {
                        this._addToken(2 /* TokenType.Neg */);
                    }
                    break;
                case 39 /* CharCode.SingleQuote */:
                    this._quotedString();
                    break;
                case 47 /* CharCode.Slash */:
                    this._regex();
                    break;
                case 61 /* CharCode.Equals */:
                    if (this._match(61 /* CharCode.Equals */)) { // support `==`
                        const isTripleEq = this._match(61 /* CharCode.Equals */); // eat last `=` if `===`
                        this._tokens.push({ type: 3 /* TokenType.Eq */, offset: this._start, isTripleEq });
                    }
                    else if (this._match(126 /* CharCode.Tilde */)) {
                        this._addToken(9 /* TokenType.RegexOp */);
                    }
                    else {
                        this._error(hintDidYouMean('==', '=~'));
                    }
                    break;
                case 60 /* CharCode.LessThan */:
                    this._addToken(this._match(61 /* CharCode.Equals */) ? 6 /* TokenType.LtEq */ : 5 /* TokenType.Lt */);
                    break;
                case 62 /* CharCode.GreaterThan */:
                    this._addToken(this._match(61 /* CharCode.Equals */) ? 8 /* TokenType.GtEq */ : 7 /* TokenType.Gt */);
                    break;
                case 38 /* CharCode.Ampersand */:
                    if (this._match(38 /* CharCode.Ampersand */)) {
                        this._addToken(15 /* TokenType.And */);
                    }
                    else {
                        this._error(hintDidYouMean('&&'));
                    }
                    break;
                case 124 /* CharCode.Pipe */:
                    if (this._match(124 /* CharCode.Pipe */)) {
                        this._addToken(16 /* TokenType.Or */);
                    }
                    else {
                        this._error(hintDidYouMean('||'));
                    }
                    break;
                // TODO@ulugbekna: 1) rewrite using a regex 2) reconsider what characters are considered whitespace, including unicode, nbsp, etc.
                case 32 /* CharCode.Space */:
                case 13 /* CharCode.CarriageReturn */:
                case 9 /* CharCode.Tab */:
                case 10 /* CharCode.LineFeed */:
                case 160 /* CharCode.NoBreakSpace */: // &nbsp
                    break;
                default:
                    this._string();
            }
        }
        this._start = this._current;
        this._addToken(20 /* TokenType.EOF */);
        return Array.from(this._tokens);
    }
    _match(expected) {
        if (this._isAtEnd()) {
            return false;
        }
        if (this._input.charCodeAt(this._current) !== expected) {
            return false;
        }
        this._current++;
        return true;
    }
    _advance() {
        return this._input.charCodeAt(this._current++);
    }
    _peek() {
        return this._isAtEnd() ? 0 /* CharCode.Null */ : this._input.charCodeAt(this._current);
    }
    _addToken(type) {
        this._tokens.push({ type, offset: this._start });
    }
    _error(additional) {
        const offset = this._start;
        const lexeme = this._input.substring(this._start, this._current);
        const errToken = { type: 19 /* TokenType.Error */, offset: this._start, lexeme };
        this._errors.push({ offset, lexeme, additionalInfo: additional });
        this._tokens.push(errToken);
    }
    _string() {
        this.stringRe.lastIndex = this._start;
        const match = this.stringRe.exec(this._input);
        if (match) {
            this._current = this._start + match[0].length;
            const lexeme = this._input.substring(this._start, this._current);
            const keyword = Scanner._keywords.get(lexeme);
            if (keyword) {
                this._addToken(keyword);
            }
            else {
                this._tokens.push({ type: 17 /* TokenType.Str */, lexeme, offset: this._start });
            }
        }
    }
    // captures the lexeme without the leading and trailing '
    _quotedString() {
        while (this._peek() !== 39 /* CharCode.SingleQuote */ && !this._isAtEnd()) { // TODO@ulugbekna: add support for escaping ' ?
            this._advance();
        }
        if (this._isAtEnd()) {
            this._error(hintDidYouForgetToOpenOrCloseQuote);
            return;
        }
        // consume the closing '
        this._advance();
        this._tokens.push({ type: 18 /* TokenType.QuotedStr */, lexeme: this._input.substring(this._start + 1, this._current - 1), offset: this._start + 1 });
    }
    /*
     * Lexing a regex expression: /.../[igsmyu]*
     * Based on https://github.com/microsoft/TypeScript/blob/9247ef115e617805983740ba795d7a8164babf89/src/compiler/scanner.ts#L2129-L2181
     *
     * Note that we want slashes within a regex to be escaped, e.g., /file:\\/\\/\\// should match `file:///`
     */
    _regex() {
        let p = this._current;
        let inEscape = false;
        let inCharacterClass = false;
        while (true) {
            if (p >= this._input.length) {
                this._current = p;
                this._error(hintDidYouForgetToEscapeSlash);
                return;
            }
            const ch = this._input.charCodeAt(p);
            if (inEscape) { // parsing an escape character
                inEscape = false;
            }
            else if (ch === 47 /* CharCode.Slash */ && !inCharacterClass) { // end of regex
                p++;
                break;
            }
            else if (ch === 91 /* CharCode.OpenSquareBracket */) {
                inCharacterClass = true;
            }
            else if (ch === 92 /* CharCode.Backslash */) {
                inEscape = true;
            }
            else if (ch === 93 /* CharCode.CloseSquareBracket */) {
                inCharacterClass = false;
            }
            p++;
        }
        // Consume flags // TODO@ulugbekna: use regex instead
        while (p < this._input.length && Scanner._regexFlags.has(this._input.charCodeAt(p))) {
            p++;
        }
        this._current = p;
        const lexeme = this._input.substring(this._start, this._current);
        this._tokens.push({ type: 10 /* TokenType.RegexStr */, lexeme, offset: this._start });
    }
    _isAtEnd() {
        return this._current >= this._input.length;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Nhbm5lci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL3NjYW5uZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUUzQyxNQUFNLENBQU4sSUFBa0IsU0FzQmpCO0FBdEJELFdBQWtCLFNBQVM7SUFDMUIsNkNBQU0sQ0FBQTtJQUNOLDZDQUFNLENBQUE7SUFDTix1Q0FBRyxDQUFBO0lBQ0gscUNBQUUsQ0FBQTtJQUNGLDJDQUFLLENBQUE7SUFDTCxxQ0FBRSxDQUFBO0lBQ0YseUNBQUksQ0FBQTtJQUNKLHFDQUFFLENBQUE7SUFDRix5Q0FBSSxDQUFBO0lBQ0osK0NBQU8sQ0FBQTtJQUNQLGtEQUFRLENBQUE7SUFDUiwwQ0FBSSxDQUFBO0lBQ0osNENBQUssQ0FBQTtJQUNMLHNDQUFFLENBQUE7SUFDRix3Q0FBRyxDQUFBO0lBQ0gsd0NBQUcsQ0FBQTtJQUNILHNDQUFFLENBQUE7SUFDRix3Q0FBRyxDQUFBO0lBQ0gsb0RBQVMsQ0FBQTtJQUNULDRDQUFLLENBQUE7SUFDTCx3Q0FBRyxDQUFBO0FBQ0osQ0FBQyxFQXRCaUIsU0FBUyxLQUFULFNBQVMsUUFzQjFCO0FBc0RELFNBQVMsY0FBYyxDQUFDLEdBQUcsS0FBZTtJQUN6QyxRQUFRLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUN0QixLQUFLLENBQUM7WUFDTCxPQUFPLFFBQVEsQ0FBQyxxQ0FBcUMsRUFBRSxtQkFBbUIsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN2RixLQUFLLENBQUM7WUFDTCxPQUFPLFFBQVEsQ0FBQyxxQ0FBcUMsRUFBRSwwQkFBMEIs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