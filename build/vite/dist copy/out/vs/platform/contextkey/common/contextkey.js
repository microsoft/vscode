/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isChrome, isEdge, isFirefox, isLinux, isMacintosh, isSafari, isWeb, isWindows } from '../../../base/common/platform.js';
import { isFalsyOrWhitespace } from '../../../base/common/strings.js';
import { Scanner } from './scanner.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { localize } from '../../../nls.js';
import { illegalArgument } from '../../../base/common/errors.js';
const CONSTANT_VALUES = new Map();
CONSTANT_VALUES.set('false', false);
CONSTANT_VALUES.set('true', true);
CONSTANT_VALUES.set('isMac', isMacintosh);
CONSTANT_VALUES.set('isLinux', isLinux);
CONSTANT_VALUES.set('isWindows', isWindows);
CONSTANT_VALUES.set('isWeb', isWeb);
CONSTANT_VALUES.set('isMacNative', isMacintosh && !isWeb);
CONSTANT_VALUES.set('isEdge', isEdge);
CONSTANT_VALUES.set('isFirefox', isFirefox);
CONSTANT_VALUES.set('isChrome', isChrome);
CONSTANT_VALUES.set('isSafari', isSafari);
/** allow register constant context keys that are known only after startup; requires running `substituteConstants` on the context key - https://github.com/microsoft/vscode/issues/174218#issuecomment-1437972127 */
export function setConstant(key, value) {
    if (CONSTANT_VALUES.get(key) !== undefined) {
        throw illegalArgument('contextkey.setConstant(k, v) invoked with already set constant `k`');
    }
    CONSTANT_VALUES.set(key, value);
}
const hasOwnProperty = Object.prototype.hasOwnProperty;
export var ContextKeyExprType;
(function (ContextKeyExprType) {
    ContextKeyExprType[ContextKeyExprType["False"] = 0] = "False";
    ContextKeyExprType[ContextKeyExprType["True"] = 1] = "True";
    ContextKeyExprType[ContextKeyExprType["Defined"] = 2] = "Defined";
    ContextKeyExprType[ContextKeyExprType["Not"] = 3] = "Not";
    ContextKeyExprType[ContextKeyExprType["Equals"] = 4] = "Equals";
    ContextKeyExprType[ContextKeyExprType["NotEquals"] = 5] = "NotEquals";
    ContextKeyExprType[ContextKeyExprType["And"] = 6] = "And";
    ContextKeyExprType[ContextKeyExprType["Regex"] = 7] = "Regex";
    ContextKeyExprType[ContextKeyExprType["NotRegex"] = 8] = "NotRegex";
    ContextKeyExprType[ContextKeyExprType["Or"] = 9] = "Or";
    ContextKeyExprType[ContextKeyExprType["In"] = 10] = "In";
    ContextKeyExprType[ContextKeyExprType["NotIn"] = 11] = "NotIn";
    ContextKeyExprType[ContextKeyExprType["Greater"] = 12] = "Greater";
    ContextKeyExprType[ContextKeyExprType["GreaterEquals"] = 13] = "GreaterEquals";
    ContextKeyExprType[ContextKeyExprType["Smaller"] = 14] = "Smaller";
    ContextKeyExprType[ContextKeyExprType["SmallerEquals"] = 15] = "SmallerEquals";
})(ContextKeyExprType || (ContextKeyExprType = {}));
const defaultConfig = {
    regexParsingWithErrorRecovery: true
};
const errorEmptyString = localize('contextkey.parser.error.emptyString', "Empty context key expression");
const hintEmptyString = localize('contextkey.parser.error.emptyString.hint', "Did you forget to write an expression? You can also put 'false' or 'true' to always evaluate to false or true, respectively.");
const errorNoInAfterNot = localize('contextkey.parser.error.noInAfterNot', "'in' after 'not'.");
const errorClosingParenthesis = localize('contextkey.parser.error.closingParenthesis', "closing parenthesis ')'");
const errorUnexpectedToken = localize('contextkey.parser.error.unexpectedToken', "Unexpected token");
const hintUnexpectedToken = localize('contextkey.parser.error.unexpectedToken.hint', "Did you forget to put && or || before the token?");
const errorUnexpectedEOF = localize('contextkey.parser.error.unexpectedEOF', "Unexpected end of expression");
const hintUnexpectedEOF = localize('contextkey.parser.error.unexpectedEOF.hint', "Did you forget to put a context key?");
/**
 * A parser for context key expressions.
 *
 * Example:
 * ```ts
 * const parser = new Parser();
 * const expr = parser.parse('foo == "bar" && baz == true');
 *
 * if (expr === undefined) {
 * 	// there were lexing or parsing errors
 * 	// process lexing errors with `parser.lexingErrors`
 *  // process parsing errors with `parser.parsingErrors`
 * } else {
 * 	// expr is a valid expression
 * }
 * ```
 */
export class Parser {
    // Note: this doesn't produce an exact syntax tree but a normalized one
    // ContextKeyExpression's that we use as AST nodes do not expose constructors that do not normalize
    static { this._parseError = new Error(); }
    get lexingErrors() {
        return this._scanner.errors;
    }
    get parsingErrors() {
        return this._parsingErrors;
    }
    constructor(_config = defaultConfig) {
        this._config = _config;
        // lifetime note: `_scanner` lives as long as the parser does, i.e., is not reset between calls to `parse`
        this._scanner = new Scanner();
        // lifetime note: `_tokens`, `_current`, and `_parsingErrors` must be reset between calls to `parse`
        this._tokens = [];
        this._current = 0; // invariant: 0 <= this._current < this._tokens.length ; any incrementation of this value must first call `_isAtEnd`
        this._parsingErrors = [];
        this._flagsGYRe = /g|y/g;
    }
    /**
     * Parse a context key expression.
     *
     * @param input the expression to parse
     * @returns the parsed expression or `undefined` if there's an error - call `lexingErrors` and `parsingErrors` to see the errors
     */
    parse(input) {
        if (input === '') {
            this._parsingErrors.push({ message: errorEmptyString, offset: 0, lexeme: '', additionalInfo: hintEmptyString });
            return undefined;
        }
        this._tokens = this._scanner.reset(input).scan();
        // @ulugbekna: we do not stop parsing if there are lexing errors to be able to reconstruct regexes with unescaped slashes; TODO@ulugbekna: make this respect config option for recovery
        this._current = 0;
        this._parsingErrors = [];
        try {
            const expr = this._expr();
            if (!this._isAtEnd()) {
                const peek = this._peek();
                const additionalInfo = peek.type === 17 /* TokenType.Str */ ? hintUnexpectedToken : undefined;
                this._parsingErrors.push({ message: errorUnexpectedToken, offset: peek.offset, lexeme: Scanner.getLexeme(peek), additionalInfo });
                throw Parser._parseError;
            }
            return expr;
        }
        catch (e) {
            if (!(e === Parser._parseError)) {
                throw e;
            }
            return undefined;
        }
    }
    _expr() {
        return this._or();
    }
    _or() {
        const expr = [this._and()];
        while (this._matchOne(16 /* TokenType.Or */)) {
            const right = this._and();
            expr.push(right);
        }
        return expr.length === 1 ? expr[0] : ContextKeyExpr.or(...expr);
    }
    _and() {
        const expr = [this._term()];
        while (this._matchOne(15 /* TokenType.And */)) {
            const right = this._term();
            expr.push(right);
        }
        return expr.length === 1 ? expr[0] : ContextKeyExpr.and(...expr);
    }
    _term() {
        if (this._matchOne(2 /* TokenType.Neg */)) {
            const peek = this._peek();
            switch (peek.type) {
                case 11 /* TokenType.True */:
                    this._advance();
                    return ContextKeyFalseExpr.INSTANCE;
                case 12 /* TokenType.False */:
                    this._advance();
                    return ContextKeyTrueExpr.INSTANCE;
                case 0 /* TokenType.LParen */: {
                    this._advance();
                    const expr = this._expr();
                    this._consume(1 /* TokenType.RParen */, errorClosingParenthesis);
                    return expr?.negate();
                }
                case 17 /* TokenType.Str */:
                    this._advance();
                    return ContextKeyNotExpr.create(peek.lexeme);
                default:
                    throw this._errExpectedButGot(`KEY | true | false | '(' expression ')'`, peek);
            }
        }
        return this._primary();
    }
    _primary() {
        const peek = this._peek();
        switch (peek.type) {
            case 11 /* TokenType.True */:
                this._advance();
                return ContextKeyExpr.true();
            case 12 /* TokenType.False */:
                this._advance();
                return ContextKeyExpr.false();
            case 0 /* TokenType.LParen */: {
                this._advance();
                const expr = this._expr();
                this._consume(1 /* TokenType.RParen */, errorClosingParenthesis);
                return expr;
            }
            case 17 /* TokenType.Str */: {
                // KEY
                const key = peek.lexeme;
                this._advance();
                // =~ regex
                if (this._matchOne(9 /* TokenType.RegexOp */)) {
                    // @ulugbekna: we need to reconstruct the regex from the tokens because some extensions use unescaped slashes in regexes
                    const expr = this._peek();
                    if (!this._config.regexParsingWithErrorRecovery) {
                        this._advance();
                        if (expr.type !== 10 /* TokenType.RegexStr */) {
                            throw this._errExpectedButGot(`REGEX`, expr);
                        }
                        const regexLexeme = expr.lexeme;
                        const closingSlashIndex = regexLexeme.lastIndexOf('/');
                        const flags = closingSlashIndex === regexLexeme.length - 1 ? undefined : this._removeFlagsGY(regexLexeme.substring(closingSlashIndex + 1));
                        let regexp;
                        try {
                            regexp = new RegExp(regexLexeme.substring(1, closingSlashIndex), flags);
                        }
                        catch (e) {
                            throw this._errExpectedButGot(`REGEX`, expr);
                        }
                        return ContextKeyRegexExpr.create(key, regexp);
                    }
                    switch (expr.type) {
                        case 10 /* TokenType.RegexStr */:
                        case 19 /* TokenType.Error */: { // also handle an ErrorToken in case of smth such as /(/file)/
                            const lexemeReconstruction = [expr.lexeme]; // /REGEX/ or /REGEX/FLAGS
                            this._advance();
                            let followingToken = this._peek();
                            let parenBalance = 0;
                            for (let i = 0; i < expr.lexeme.length; i++) {
                                if (expr.lexeme.charCodeAt(i) === 40 /* CharCode.OpenParen */) {
                                    parenBalance++;
                                }
                                else if (expr.lexeme.charCodeAt(i) === 41 /* CharCode.CloseParen */) {
                                    parenBalance--;
                                }
                            }
                            while (!this._isAtEnd() && followingToken.type !== 15 /* TokenType.And */ && followingToken.type !== 16 /* TokenType.Or */) {
                                switch (followingToken.type) {
                                    case 0 /* TokenType.LParen */:
                                        parenBalance++;
                                        break;
                                    case 1 /* TokenType.RParen */:
                                        parenBalance--;
                                        break;
                                    case 10 /* TokenType.RegexStr */:
                                    case 18 /* TokenType.QuotedStr */:
                                        for (let i = 0; i < followingToken.lexeme.length; i++) {
                                            if (followingToken.lexeme.charCodeAt(i) === 40 /* CharCode.OpenParen */) {
                                                parenBalance++;
                                            }
                                            else if (expr.lexeme.charCodeAt(i) === 41 /* CharCode.CloseParen */) {
                                                parenBalance--;
                                            }
                                        }
                                }
                                if (parenBalance < 0) {
                                    break;
                                }
                                lexemeReconstruction.push(Scanner.getLexeme(followingToken));
                                this._advance();
                                followingToken = this._peek();
                            }
                            const regexLexeme = lexemeReconstruction.join('');
                            const closingSlashIndex = regexLexeme.lastIndexOf('/');
                            const flags = closingSlashIndex === regexLexeme.length - 1 ? undefined : this._removeFlagsGY(regexLexeme.substring(closingSlashIndex + 1));
                            let regexp;
                            try {
                                regexp = new RegExp(regexLexeme.substring(1, closingSlashIndex), flags);
                            }
                            catch (e) {
                                throw this._errExpectedButGot(`REGEX`, expr);
                            }
                            return ContextKeyExpr.regex(key, regexp);
                        }
                        case 18 /* TokenType.QuotedStr */: {
                            const serializedValue = expr.lexeme;
                            this._advance();
                            // replicate old regex parsing behavior
                            let regex = null;
                            if (!isFalsyOrWhitespace(serializedValue)) {
                                const start = serializedValue.indexOf('/');
                                const end = serializedValue.lastIndexOf('/');
                                if (start !== end && start >= 0) {
                                    const value = serializedValue.slice(start + 1, end);
                                    const caseIgnoreFlag = serializedValue[end + 1] === 'i' ? 'i' : '';
                                    try {
                                        regex = new RegExp(value, caseIgnoreFlag);
                                    }
                                    catch (_e) {
                                        throw this._errExpectedButGot(`REGEX`, expr);
                                    }
                                }
                            }
                            if (regex === null) {
                                throw this._errExpectedButGot('REGEX', expr);
                            }
                            return ContextKeyRegexExpr.create(key, regex);
                        }
                        default:
                            throw this._errExpectedButGot('REGEX', this._peek());
                    }
                }
                // [ 'not' 'in' value ]
                if (this._matchOne(14 /* TokenType.Not */)) {
                    this._consume(13 /* TokenType.In */, errorNoInAfterNot);
                    const right = this._value();
                    return ContextKeyExpr.notIn(key, right);
                }
                // [ ('==' | '!=' | '<' | '<=' | '>' | '>=' | 'in') value ]
                const maybeOp = this._peek().type;
                switch (maybeOp) {
                    case 3 /* TokenType.Eq */: {
                        this._advance();
                        const right = this._value();
                        if (this._previous().type === 18 /* TokenType.QuotedStr */) { // to preserve old parser behavior: "foo == 'true'" is preserved as "foo == 'true'", but "foo == true" is optimized as "foo"
                            return ContextKeyExpr.equals(key, right);
                        }
                        switch (right) {
                            case 'true':
                                return ContextKeyExpr.has(key);
                            case 'false':
                                return ContextKeyExpr.not(key);
                            default:
                                return ContextKeyExpr.equals(key, right);
                        }
                    }
                    case 4 /* TokenType.NotEq */: {
                        this._advance();
                        const right = this._value();
                        if (this._previous().type === 18 /* TokenType.QuotedStr */) { // same as above with "foo != 'true'"
                            return ContextKeyExpr.notEquals(key, right);
                        }
                        switch (right) {
                            case 'true':
                                return ContextKeyExpr.not(key);
                            case 'false':
                                return ContextKeyExpr.has(key);
                            default:
                                return ContextKeyExpr.notEquals(key, right);
                        }
                    }
                    // TODO: ContextKeyExpr.smaller(key, right) accepts only `number` as `right` AND during eval of this node, we just eval to `false` if `right` is not a number
                    // consequently, package.json linter should _warn_ the user if they're passing undesired things to ops
                    case 5 /* TokenType.Lt */:
                        this._advance();
                        return ContextKeySmallerExpr.create(key, this._value());
                    case 6 /* TokenType.LtEq */:
                        this._advance();
                        return ContextKeySmallerEqualsExpr.create(key, this._value());
                    case 7 /* TokenType.Gt */:
                        this._advance();
                        return ContextKeyGreaterExpr.create(key, this._value());
                    case 8 /* TokenType.GtEq */:
                        this._advance();
                        return ContextKeyGreaterEqualsExpr.create(key, this._value());
                    case 13 /* TokenType.In */:
                        this._advance();
                        return ContextKeyExpr.in(key, this._value());
                    default:
                        return ContextKeyExpr.has(key);
                }
            }
            case 20 /* TokenType.EOF */:
                this._parsingErrors.push({ message: errorUnexpectedEOF, offset: peek.offset, lexeme: '', additionalInfo: hintUnexpectedEOF });
                throw Parser._parseError;
            default:
                throw this._errExpectedButGot(`true | false | KEY \n\t| KEY '=~' REGEX \n\t| KEY ('==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'not' 'in') value`, this._peek());
        }
    }
    _value() {
        const token = this._peek();
        switch (token.type) {
            case 17 /* TokenType.Str */:
            case 18 /* TokenType.QuotedStr */:
                this._advance();
                return token.lexeme;
            case 11 /* TokenType.True */:
                this._advance();
                return 'true';
            case 12 /* TokenType.False */:
                this._advance();
                return 'false';
            case 13 /* TokenType.In */: // we support `in` as a value, e.g., "when": "languageId == in" - exists in existing extensions
                this._advance();
                return 'in';
            default:
                // this allows "when": "foo == " which's used by existing extensions
                // we do not call `_advance` on purpose - we don't want to eat unintended tokens
                return '';
        }
    }
    _removeFlagsGY(flags) {
        return flags.replaceAll(this._flagsGYRe, '');
    }
    // careful: this can throw if current token is the initial one (ie index = 0)
    _previous() {
        return this._tokens[this._current - 1];
    }
    _matchOne(token) {
        if (this._check(token)) {
            this._advance();
            return true;
        }
        return false;
    }
    _advance() {
        if (!this._isAtEnd()) {
            this._current++;
        }
        return this._previous();
    }
    _consume(type, message) {
        if (this._check(type)) {
            return this._advance();
        }
        throw this._errExpectedButGot(message, this._peek());
    }
    _errExpectedButGot(expected, got, additionalInfo) {
        const message = localize('contextkey.parser.error.expectedButGot', "Expected: {0}\nReceived: '{1}'.", expected, Scanner.getLexeme(got));
        const offset = got.offset;
        const lexeme = Scanner.getLexeme(got);
        this._parsingErrors.push({ message, offset, lexeme, additionalInfo });
        return Parser._parseError;
    }
    _check(type) {
        return this._peek().type === type;
    }
    _peek() {
        return this._tokens[this._current];
    }
    _isAtEnd() {
        return this._peek().type === 20 /* TokenType.EOF */;
    }
}
export class ContextKeyExpr {
    static false() {
        return ContextKeyFalseExpr.INSTANCE;
    }
    static true() {
        return ContextKeyTrueExpr.INSTANCE;
    }
    static has(key) {
        return ContextKeyDefinedExpr.create(key);
    }
    static equals(key, value) {
        return ContextKeyEqualsExpr.create(key, value);
    }
    static notEquals(key, value) {
        return ContextKeyNotEqualsExpr.create(key, value);
    }
    static regex(key, value) {
        return ContextKeyRegexExpr.create(key, value);
    }
    static in(key, value) {
        return ContextKeyInExpr.create(key, value);
    }
    static notIn(key, value) {
        return ContextKeyNotInExpr.create(key, value);
    }
    static not(key) {
        return ContextKeyNotExpr.create(key);
    }
    static and(...expr) {
        return ContextKeyAndExpr.create(expr, null, true);
    }
    static or(...expr) {
        return ContextKeyOrExpr.create(expr, null, true);
    }
    static greater(key, value) {
        return ContextKeyGreaterExpr.create(key, value);
    }
    static greaterEquals(key, value) {
        return ContextKeyGreaterEqualsExpr.create(key, value);
    }
    static smaller(key, value) {
        return ContextKeySmallerExpr.create(key, value);
    }
    static smallerEquals(key, value) {
        return ContextKeySmallerEqualsExpr.create(key, value);
    }
    static { this._parser = new Parser({ regexParsingWithErrorRecovery: false }); }
    static deserialize(serialized) {
        if (serialized === undefined || serialized === null) { // an empty string needs to be handled by the parser to get a corresponding parsing error reported
            return undefined;
        }
        const expr = this._parser.parse(serialized);
        return expr;
    }
}
export function validateWhenClauses(whenClauses) {
    const parser = new Parser({ regexParsingWithErrorRecovery: false }); // we run with no recovery to guide users to use correct regexes
    return whenClauses.map(whenClause => {
        parser.parse(whenClause);
        if (parser.lexingErrors.length > 0) {
            return parser.lexingErrors.map((se) => ({
                errorMessage: se.additionalInfo ?
                    localize('contextkey.scanner.errorForLinterWithHint', "Unexpected token. Hint: {0}", se.additionalInfo) :
                    localize('contextkey.scanner.errorForLinter', "Unexpected token."),
                offset: se.offset,
                length: se.lexeme.length,
            }));
        }
        else if (parser.parsingErrors.length > 0) {
            return parser.parsingErrors.map((pe) => ({
                errorMessage: pe.additionalInfo ? `${pe.message}. ${pe.additionalInfo}` : pe.message,
                offset: pe.offset,
                length: pe.lexeme.length,
            }));
        }
        else {
            return [];
        }
    });
}
export function expressionsAreEqualWithConstantSubstitution(a, b) {
    const aExpr = a ? a.substituteConstants() : undefined;
    const bExpr = b ? b.substituteConstants() : undefined;
    if (!aExpr && !bExpr) {
        return true;
    }
    if (!aExpr || !bExpr) {
        return false;
    }
    return aExpr.equals(bExpr);
}
function cmp(a, b) {
    return a.cmp(b);
}
export class ContextKeyFalseExpr {
    static { this.INSTANCE = new ContextKeyFalseExpr(); }
    constructor() {
        this.type = 0 /* ContextKeyExprType.False */;
    }
    cmp(other) {
        return this.type - other.type;
    }
    equals(other) {
        return (other.type === this.type);
    }
    substituteConstants() {
        return this;
    }
    evaluate(context) {
        return false;
    }
    serialize() {
        return 'false';
    }
    keys() {
        return [];
    }
    map(mapFnc) {
        return this;
    }
    negate() {
        return ContextKeyTrueExpr.INSTANCE;
    }
}
export class ContextKeyTrueExpr {
    static { this.INSTANCE = new ContextKeyTrueExpr(); }
    constructor() {
        this.type = 1 /* ContextKeyExprType.True */;
    }
    cmp(other) {
        return this.type - other.type;
    }
    equals(other) {
        return (other.type === this.type);
    }
    substituteConstants() {
        return this;
    }
    evaluate(context) {
        return true;
    }
    serialize() {
        return 'true';
    }
    keys() {
        return [];
    }
    map(mapFnc) {
        return this;
    }
    negate() {
        return ContextKeyFalseExpr.INSTANCE;
    }
}
export class ContextKeyDefinedExpr {
    static create(key, negated = null) {
        const constantValue = CONSTANT_VALUES.get(key);
        if (typeof constantValue === 'boolean') {
            return constantValue ? ContextKeyTrueExpr.INSTANCE : ContextKeyFalseExpr.INSTANCE;
        }
        return new ContextKeyDefinedExpr(key, negated);
    }
    constructor(key, negated) {
        this.key = key;
        this.negated = negated;
        this.type = 2 /* ContextKeyExprType.Defined */;
    }
    cmp(other) {
        if (other.type !== this.type) {
            return this.type - other.type;
        }
        return cmp1(this.key, other.key);
    }
    equals(other) {
        if (other.type === this.type) {
            return (this.key === other.key);
        }
        return false;
    }
    substituteConstants() {
        const constantValue = CONSTANT_VALUES.get(this.key);
        if (typeof constantValue === 'boolean') {
            return constantValue ? ContextKeyTrueExpr.INSTANCE : ContextKeyFalseExpr.INSTANCE;
        }
        return this;
    }
    evaluate(context) {
        return (!!context.getValue(this.key));
    }
    serialize() {
        return this.key;
    }
    keys() {
        return [this.key];
    }
    map(mapFnc) {
        return mapFnc.mapDefined(this.key);
    }
    negate() {
        if (!this.negated) {
            this.negated = ContextKeyNotExpr.create(this.key, this);
        }
        return this.negated;
    }
}
export class ContextKeyEqualsExpr {
    static create(key, value, negated = null) {
        if (typeof value === 'boolean') {
            return (value ? ContextKeyDefinedExpr.create(key, negated) : ContextKeyNotExpr.create(key, negated));
        }
        const constantValue = CONSTANT_VALUES.get(key);
        if (typeof constantValue === 'boolean') {
            const trueValue = constantValue ? 'true' : 'false';
            return (value === trueValue ? ContextKeyTrueExpr.INSTANCE : ContextKeyFalseExpr.INSTANCE);
        }
        return new ContextKeyEqualsExpr(key, value, negated);
    }
    constructor(key, value, negated) {
        this.key = key;
        this.value = value;
        this.negated = negated;
        this.type = 4 /* ContextKeyExprType.Equals */;
    }
    cmp(other) {
        if (other.type !== this.type) {
            return this.type - other.type;
        }
        return cmp2(this.key, this.value, other.key, other.value);
    }
    equals(other) {
        if (other.type === this.type) {
            return (this.key === other.key && this.value === other.value);
        }
        return false;
    }
    substituteConstants() {
        const constantValue = CONSTANT_VALUES.get(this.key);
        if (typeof constantValue === 'boolean') {
            const trueValue = constantValue ? 'true' : 'false';
            return (this.value === trueValue ? ContextKeyTrueExpr.INSTANCE : ContextKeyFalseExpr.INSTANCE);
        }
        return this;
    }
    evaluate(context) {
        // Intentional ==
        // eslint-disable-next-line eqeqeq
        return (context.getValue(this.key) == this.value);
    }
    serialize() {
        return `${this.key} == '${this.value}'`;
    }
    keys() {
        return [this.key];
    }
    map(mapFnc) {
        return mapFnc.mapEquals(this.key, this.value);
    }
    negate() {
        if (!this.negated) {
            this.negated = ContextKeyNotEqualsExpr.create(this.key, this.value, this);
        }
        return this.negated;
    }
}
export class ContextKeyInExpr {
    static create(key, valueKey) {
        return new ContextKeyInExpr(key, valueKey);
    }
    constructor(key, valueKey) {
        this.key = key;
        this.valueKey = valueKey;
        this.type = 10 /* ContextKeyExprType.In */;
        this.negated = null;
    }
    cmp(other) {
        if (other.type !== this.type) {
            return this.type - other.type;
        }
        return cmp2(this.key, this.valueKey, other.key, other.valueKey);
    }
    equals(other) {
        if (other.type === this.type) {
            return (this.key === other.key && this.valueKey === other.valueKey);
        }
        return false;
    }
    substituteConstants() {
        return this;
    }
    evaluate(context) {
        const source = context.getValue(this.valueKey);
        const item = context.getValue(this.key);
        if (Array.isArray(source)) {
            // eslint-disable-next-line local/code-no-any-casts
            if (source.includes(item)) {
                return true;
            }
            // On Windows, file paths are case-insensitive so file URI
            // comparisons must be done in a case-insensitive manner.
            if (isWindows && typeof item === 'string' && item.startsWith('file:///')) {
                const itemLower = item.toLowerCase();
                return source.some(s => typeof s === 'string' && s.toLowerCase() === itemLower);
            }
            return false;
        }
        if (typeof item === 'string' && typeof source === 'object' && source !== null) {
            if (hasOwnProperty.call(source, item)) {
                return true;
            }
            // On Windows, file paths are case-insensitive so file URI
            // property lookups must be done in a case-insensitive manner.
            if (isWindows && item.startsWith('file:///')) {
                const itemLower = item.toLowerCase();
                return Object.keys(source).some(key => key.toLowerCase() === itemLower);
            }
            return false;
        }
        return false;
    }
    serialize() {
        return `${this.key} in '${this.valueKey}'`;
    }
    keys() {
        return [this.key, this.valueKey];
    }
    map(mapFnc) {
        return mapFnc.mapIn(this.key, this.valueKey);
    }
    negate() {
        if (!this.negated) {
            this.negated = ContextKeyNotInExpr.create(this.key, this.valueKey);
        }
        return this.negated;
    }
}
export class ContextKeyNotInExpr {
    static create(key, valueKey) {
        return new ContextKeyNotInExpr(key, valueKey);
    }
    constructor(key, valueKey) {
        this.key = key;
        this.valueKey = valueKey;
        this.type = 11 /* ContextKeyExprType.NotIn */;
        this._negated = ContextKeyInExpr.create(key, valueKey);
    }
    cmp(other) {
        if (other.type !== this.type) {
            return this.type - other.type;
        }
        return this._negated.cmp(other._negated);
    }
    equals(other) {
        if (other.type === this.type) {
            return this._negated.equals(other._negated);
        }
        return false;
    }
    substituteConstants() {
        return this;
    }
    evaluate(context) {
        return !this._negated.evaluate(context);
    }
    serialize() {
        return `${this.key} not in '${this.valueKey}'`;
    }
    keys() {
        return this._negated.keys();
    }
    map(mapFnc) {
        return mapFnc.mapNotIn(this.key, this.valueKey);
    }
    negate() {
        return this._negated;
    }
}
export class ContextKeyNotEqualsExpr {
    static create(key, value, negated = null) {
        if (typeof value === 'boolean') {
            if (value) {
                return ContextKeyNotExpr.create(key, negated);
            }
            return ContextKeyDefinedExpr.create(key, negated);
        }
        const constantValue = CONSTANT_VALUES.get(key);
        if (typeof constantValue === 'boolean') {
            const falseValue = constantValue ? 'true' : 'false';
            return (value === falseValue ? ContextKeyFalseExpr.INSTANCE : ContextKeyTrueExpr.INSTANCE);
        }
        return new ContextKeyNotEqualsExpr(key, value, negated);
    }
    constructor(key, value, negated) {
        this.key = key;
        this.value = value;
        this.negated = negated;
        this.type = 5 /* ContextKeyExprType.NotEquals */;
    }
    cmp(other) {
        if (other.type !== this.type) {
            return this.type - other.type;
        }
        return cmp2(this.key, this.value, other.key, other.value);
    }
    equals(other) {
        if (other.type === this.type) {
            return (this.key === other.key && this.value === other.value);
        }
        return false;
    }
    substituteConstants() {
        const constantValue = CONSTANT_VALUES.get(this.key);
        if (typeof constantValue === 'boolean') {
            const falseValue = constantValue ? 'true' : 'false';
            return (this.value === falseValue ? ContextKeyFalseExpr.INSTANCE : ContextKeyTrueExpr.INSTANCE);
        }
        return this;
    }
    evaluate(context) {
        // Intentional !=
        // eslint-disable-next-line eqeqeq
        return (context.getValue(this.key) != this.value);
    }
    serialize() {
        return `${this.key} != '${this.value}'`;
    }
    keys() {
        return [this.key];
    }
    map(mapFnc) {
        return mapFnc.mapNotEquals(this.key, this.value);
    }
    negate() {
        if (!this.negated) {
            this.negated = ContextKeyEqualsExpr.create(this.key, this.value, this);
        }
        return this.negated;
    }
}
export class ContextKeyNotExpr {
    static create(key, negated = null) {
        const constantValue = CONSTANT_VALUES.get(key);
        if (typeof constantValue === 'boolean') {
            return (constantValue ? ContextKeyFalseExpr.INSTANCE : ContextKeyTrueExpr.INSTANCE);
        }
        return new ContextKeyNotExpr(key, negated);
    }
    constructor(key, negated) {
        this.key = key;
        this.negated = negated;
        this.type = 3 /* ContextKeyExprType.Not */;
    }
    cmp(other) {
        if (other.type !== this.type) {
            return this.type - other.type;
        }
        return cmp1(this.key, other.key);
    }
    equals(other) {
        if (other.type === this.type) {
            return (this.key === other.key);
        }
        return false;
    }
    substituteConstants() {
        const constantValue = CONSTANT_VALUES.get(this.key);
        if (typeof constantValue === 'boolean') {
            return (constantValue ? ContextKeyFalseExpr.INSTANCE : ContextKeyTrueExpr.INSTANCE);
        }
        return this;
    }
    evaluate(context) {
        return (!context.getValue(this.key));
    }
    serialize() {
        return `!${this.key}`;
    }
    keys() {
        return [this.key];
    }
    map(mapFnc) {
        return mapFnc.mapNot(this.key);
    }
    negate() {
        if (!this.negated) {
            this.negated = ContextKeyDefinedExpr.create(this.key, this);
        }
        return this.negated;
    }
}
function withFloatOrStr(value, callback) {
    if (typeof value === 'string') {
        const n = parseFloat(value);
        if (!isNaN(n)) {
            value = n;
        }
    }
    if (typeof value === 'string' || typeof value === 'number') {
        return callback(value);
    }
    return ContextKeyFalseExpr.INSTANCE;
}
export class ContextKeyGreaterExpr {
    static create(key, _value, negated = null) {
        return withFloatOrStr(_value, (value) => new ContextKeyGreaterExpr(key, value, negated));
    }
    constructor(key, value, negated) {
        this.key = key;
        this.value = value;
        this.negated = negated;
        this.type = 12 /* ContextKeyExprType.Greater */;
    }
    cmp(other) {
        if (other.type !== this.type) {
            return this.type - other.type;
        }
        return cmp2(this.key, this.value, other.key, other.value);
    }
    equals(other) {
        if (other.type === this.type) {
            return (this.key === other.key && this.value === other.value);
        }
        return false;
    }
    substituteConstants() {
        return this;
    }
    evaluate(context) {
        if (typeof this.value === 'string') {
            return false;
        }
        return (parseFloat(context.getValue(this.key)) > this.value);
    }
    serialize() {
        return `${this.key} > ${this.value}`;
    }
    keys() {
        return [this.key];
    }
    map(mapFnc) {
        return mapFnc.mapGreater(this.key, this.value);
    }
    negate() {
        if (!this.negated) {
            this.negated = ContextKeySmallerEqualsExpr.create(this.key, this.value, this);
        }
        return this.negated;
    }
}
export class ContextKeyGreaterEqualsExpr {
    static create(key, _value, negated = null) {
        return withFloatOrStr(_value, (value) => new ContextKeyGreaterEqualsExpr(key, value, negated));
    }
    constructor(key, value, negated) {
        this.key = key;
        this.value = value;
        this.negated = negated;
        this.type = 13 /* ContextKeyExprType.GreaterEquals */;
    }
    cmp(other) {
        if (other.type !== this.type) {
            return this.type - other.type;
        }
        return cmp2(this.key, this.value, other.key, other.value);
    }
    equals(other) {
        if (other.type === this.type) {
            return (this.key === other.key && this.value === other.value);
        }
        return false;
    }
    substituteConstants() {
        return this;
    }
    evaluate(context) {
        if (typeof this.value === 'string') {
            return false;
        }
        return (parseFloat(context.getValue(this.key)) >= this.value);
    }
    serialize() {
        return `${this.key} >= ${this.value}`;
    }
    keys() {
        return [this.key];
    }
    map(mapFnc) {
        return mapFnc.mapGreaterEquals(this.key, this.value);
    }
    negate() {
        if (!this.negated) {
            this.negated = ContextKeySmallerExpr.create(this.key, this.value, this);
        }
        return this.negated;
    }
}
export class ContextKeySmallerExpr {
    static create(key, _value, negated = null) {
        return withFloatOrStr(_value, (value) => new ContextKeySmallerExpr(key, value, negated));
    }
    constructor(key, value, negated) {
        this.key = key;
        this.value = value;
        this.negated = negated;
        this.type = 14 /* ContextKeyExprType.Smaller */;
    }
    cmp(other) {
        if (other.type !== this.type) {
            return this.type - other.type;
        }
        return cmp2(this.key, this.value, other.key, other.value);
    }
    equals(other) {
        if (other.type === this.type) {
            return (this.key === other.key && this.value === other.value);
        }
        return false;
    }
    substituteConstants() {
        return this;
    }
    evaluate(context) {
        if (typeof this.value === 'string') {
            return false;
        }
        return (parseFloat(context.getValue(this.key)) < this.value);
    }
    serialize() {
        return `${this.key} < ${this.value}`;
    }
    keys() {
        return [this.key];
    }
    map(mapFnc) {
        return mapFnc.mapSmaller(this.key, this.value);
    }
    negate() {
        if (!this.negated) {
            this.negated = ContextKeyGreaterEqualsExpr.create(this.key, this.value, this);
        }
        return this.negated;
    }
}
export class ContextKeySmallerEqualsExpr {
    static create(key, _value, negated = null) {
        return withFloatOrStr(_value, (value) => new ContextKeySmallerEqualsExpr(key, value, negated));
    }
    constructor(key, value, negated) {
        this.key = key;
        this.value = value;
        this.negated = negated;
        this.type = 15 /* ContextKeyExprType.SmallerEquals */;
    }
    cmp(other) {
        if (other.type !== this.type) {
            return this.type - other.type;
        }
        return cmp2(this.key, this.value, other.key, other.value);
    }
    equals(other) {
        if (other.type === this.type) {
            return (this.key === other.key && this.value === other.value);
        }
        return false;
    }
    substituteConstants() {
        return this;
    }
    evaluate(context) {
        if (typeof this.value === 'string') {
            return false;
        }
        return (parseFloat(context.getValue(this.key)) <= this.value);
    }
    serialize() {
        return `${this.key} <= ${this.value}`;
    }
    keys() {
        return [this.key];
    }
    map(mapFnc) {
        return mapFnc.mapSmallerEquals(this.key, this.value);
    }
    negate() {
        if (!this.negated) {
            this.negated = ContextKeyGreaterExpr.create(this.key, this.value, this);
        }
        return this.negated;
    }
}
export class ContextKeyRegexExpr {
    static create(key, regexp) {
        return new ContextKeyRegexExpr(key, regexp);
    }
    constructor(key, regexp) {
        this.key = key;
        this.regexp = regexp;
        this.type = 7 /* ContextKeyExprType.Regex */;
        this.negated = null;
        //
    }
    cmp(other) {
        if (other.type !== this.type) {
            return this.type - other.type;
        }
        if (this.key < other.key) {
            return -1;
        }
        if (this.key > other.key) {
            return 1;
        }
        const thisSource = this.regexp ? this.regexp.source : '';
        const otherSource = other.regexp ? other.regexp.source : '';
        if (thisSource < otherSource) {
            return -1;
        }
        if (thisSource > otherSource) {
            return 1;
        }
        return 0;
    }
    equals(other) {
        if (other.type === this.type) {
            const thisSource = this.regexp ? this.regexp.source : '';
            const otherSource = other.regexp ? other.regexp.source : '';
            return (this.key === other.key && thisSource === otherSource);
        }
        return false;
    }
    substituteConstants() {
        return this;
    }
    evaluate(context) {
        const value = context.getValue(this.key);
        return this.regexp ? this.regexp.test(value) : false;
    }
    serialize() {
        const value = this.regexp
            ? `/${this.regexp.source}/${this.regexp.flags}`
            : '/invalid/';
        return `${this.key} =~ ${value}`;
    }
    keys() {
        return [this.key];
    }
    map(mapFnc) {
        return mapFnc.mapRegex(this.key, this.regexp);
    }
    negate() {
        if (!this.negated) {
            this.negated = ContextKeyNotRegexExpr.create(this);
        }
        return this.negated;
    }
}
export class ContextKeyNotRegexExpr {
    static create(actual) {
        return new ContextKeyNotRegexExpr(actual);
    }
    constructor(_actual) {
        this._actual = _actual;
        this.type = 8 /* ContextKeyExprType.NotRegex */;
        //
    }
    cmp(other) {
        if (other.type !== this.type) {
            return this.type - other.type;
        }
        return this._actual.cmp(other._actual);
    }
    equals(other) {
        if (other.type === this.type) {
            return this._actual.equals(other._actual);
        }
        return false;
    }
    substituteConstants() {
        return this;
    }
    evaluate(context) {
        return !this._actual.evaluate(context);
    }
    serialize() {
        return `!(${this._actual.serialize()})`;
    }
    keys() {
        return this._actual.keys();
    }
    map(mapFnc) {
        return new ContextKeyNotRegexExpr(this._actual.map(mapFnc));
    }
    negate() {
        return this._actual;
    }
}
/**
 * @returns the same instance if nothing changed.
 */
function eliminateConstantsInArray(arr) {
    // Allocate array only if there is a difference
    let newArr = null;
    for (let i = 0, len = arr.length; i < len; i++) {
        const newExpr = arr[i].substituteConstants();
        if (arr[i] !== newExpr) {
            // something has changed!
            // allocate array on first difference
            if (newArr === null) {
                newArr = [];
                for (let j = 0; j < i; j++) {
                    newArr[j] = arr[j];
                }
            }
        }
        if (newArr !== null) {
            newArr[i] = newExpr;
        }
    }
    if (newArr === null) {
        return arr;
    }
    return newArr;
}
export class ContextKeyAndExpr {
    static create(_expr, negated, extraRedundantCheck) {
        return ContextKeyAndExpr._normalizeArr(_expr, negated, extraRedundantCheck);
    }
    constructor(expr, negated) {
        this.expr = expr;
        this.negated = negated;
        this.type = 6 /* ContextKeyExprType.And */;
    }
    cmp(other) {
        if (other.type !== this.type) {
            return this.type - other.type;
        }
        if (this.expr.length < other.expr.length) {
            return -1;
        }
        if (this.expr.length > other.expr.length) {
            return 1;
        }
        for (let i = 0, len = this.expr.length; i < len; i++) {
            const r = cmp(this.expr[i], other.expr[i]);
            if (r !== 0) {
                return r;
            }
        }
        return 0;
    }
    equals(other) {
        if (other.type === this.type) {
            if (this.expr.length !== other.expr.length) {
                return false;
            }
            for (let i = 0, len = this.expr.length; i < len; i++) {
                if (!this.expr[i].equals(other.expr[i])) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }
    substituteConstants() {
        const exprArr = eliminateConstantsInArray(this.expr);
        if (exprArr === this.expr) {
            // no change
            return this;
        }
        return ContextKeyAndExpr.create(exprArr, this.negated, false);
    }
    evaluate(context) {
        for (let i = 0, len = this.expr.length; i < len; i++) {
            if (!this.expr[i].evaluate(context)) {
                return false;
            }
        }
        return true;
    }
    static _normalizeArr(arr, negated, extraRedundantCheck) {
        const expr = [];
        let hasTrue = false;
        for (const e of arr) {
            if (!e) {
                continue;
            }
            if (e.type === 1 /* ContextKeyExprType.True */) {
                // anything && true ==> anything
                hasTrue = true;
                continue;
            }
            if (e.type === 0 /* ContextKeyExprType.False */) {
                // anything && false ==> false
                return ContextKeyFalseExpr.INSTANCE;
            }
            if (e.type === 6 /* ContextKeyExprType.And */) {
                expr.push(...e.expr);
                continue;
            }
            expr.push(e);
        }
        if (expr.length === 0 && hasTrue) {
            return ContextKeyTrueExpr.INSTANCE;
        }
        if (expr.length === 0) {
            return undefined;
        }
        if (expr.length === 1) {
            return expr[0];
        }
        expr.sort(cmp);
        // eliminate duplicate terms
        for (let i = 1; i < expr.length; i++) {
            if (expr[i - 1].equals(expr[i])) {
                expr.splice(i, 1);
                i--;
            }
        }
        if (expr.length === 1) {
            return expr[0];
        }
        // We must distribute any OR expression because we don't support parens
        // OR extensions will be at the end (due to sorting rules)
        while (expr.length > 1) {
            const lastElement = expr[expr.length - 1];
            if (lastElement.type !== 9 /* ContextKeyExprType.Or */) {
                break;
            }
            // pop the last element
            expr.pop();
            // pop the second to last element
            const secondToLastElement = expr.pop();
            const isFinished = (expr.length === 0);
            // distribute `lastElement` over `secondToLastElement`
            const resultElement = ContextKeyOrExpr.create(lastElement.expr.map(el => ContextKeyAndExpr.create([el, secondToLastElement], null, extraRedundantCheck)), null, isFinished);
            if (resultElement) {
                expr.push(resultElement);
                expr.sort(cmp);
            }
        }
        if (expr.length === 1) {
            return expr[0];
        }
        // resolve false AND expressions
        if (extraRedundantCheck) {
            for (let i = 0; i < expr.length; i++) {
                for (let j = i + 1; j < expr.length; j++) {
                    if (expr[i].negate().equals(expr[j])) {
                        // A && !A case
                        return ContextKeyFalseExpr.INSTANCE;
                    }
                }
            }
            if (expr.length === 1) {
                return expr[0];
            }
        }
        return new ContextKeyAndExpr(expr, negated);
    }
    serialize() {
        return this.expr.map(e => e.serialize()).join(' && ');
    }
    keys() {
        const result = [];
        for (const expr of this.expr) {
            result.push(...expr.keys());
        }
        return result;
    }
    map(mapFnc) {
        return new ContextKeyAndExpr(this.expr.map(expr => expr.map(mapFnc)), null);
    }
    negate() {
        if (!this.negated) {
            const result = [];
            for (const expr of this.expr) {
                result.push(expr.negate());
            }
            this.negated = ContextKeyOrExpr.create(result, this, true);
        }
        return this.negated;
    }
}
export class ContextKeyOrExpr {
    static create(_expr, negated, extraRedundantCheck) {
        return ContextKeyOrExpr._normalizeArr(_expr, negated, extraRedundantCheck);
    }
    constructor(expr, negated) {
        this.expr = expr;
        this.negated = negated;
        this.type = 9 /* ContextKeyExprType.Or */;
    }
    cmp(other) {
        if (other.type !== this.type) {
            return this.type - other.type;
        }
        if (this.expr.length < other.expr.length) {
            return -1;
        }
        if (this.expr.length > other.expr.length) {
            return 1;
        }
        for (let i = 0, len = this.expr.length; i < len; i++) {
            const r = cmp(this.expr[i], other.expr[i]);
            if (r !== 0) {
                return r;
            }
        }
        return 0;
    }
    equals(other) {
        if (other.type === this.type) {
            if (this.expr.length !== other.expr.length) {
                return false;
            }
            for (let i = 0, len = this.expr.length; i < len; i++) {
                if (!this.expr[i].equals(other.expr[i])) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }
    substituteConstants() {
        const exprArr = eliminateConstantsInArray(this.expr);
        if (exprArr === this.expr) {
            // no change
            return this;
        }
        return ContextKeyOrExpr.create(exprArr, this.negated, false);
    }
    evaluate(context) {
        for (let i = 0, len = this.expr.length; i < len; i++) {
            if (this.expr[i].evaluate(context)) {
                return true;
            }
        }
        return false;
    }
    static _normalizeArr(arr, negated, extraRedundantCheck) {
        let expr = [];
        let hasFalse = false;
        if (arr) {
            for (let i = 0, len = arr.length; i < len; i++) {
                const e = arr[i];
                if (!e) {
                    continue;
                }
                if (e.type === 0 /* ContextKeyExprType.False */) {
                    // anything || false ==> anything
                    hasFalse = true;
                    continue;
                }
                if (e.type === 1 /* ContextKeyExprType.True */) {
                    // anything || true ==> true
                    return ContextKeyTrueExpr.INSTANCE;
                }
                if (e.type === 9 /* ContextKeyExprType.Or */) {
                    expr = expr.concat(e.expr);
                    continue;
                }
                expr.push(e);
            }
            if (expr.length === 0 && hasFalse) {
                return ContextKeyFalseExpr.INSTANCE;
            }
            expr.sort(cmp);
        }
        if (expr.length === 0) {
            return undefined;
        }
        if (expr.length === 1) {
            return expr[0];
        }
        // eliminate duplicate terms
        for (let i = 1; i < expr.length; i++) {
            if (expr[i - 1].equals(expr[i])) {
                expr.splice(i, 1);
                i--;
            }
        }
        if (expr.length === 1) {
            return expr[0];
        }
        // resolve true OR expressions
        if (extraRedundantCheck) {
            for (let i = 0; i < expr.length; i++) {
                for (let j = i + 1; j < expr.length; j++) {
                    if (expr[i].negate().equals(expr[j])) {
                        // A || !A case
                        return ContextKeyTrueExpr.INSTANCE;
                    }
                }
            }
            if (expr.length === 1) {
                return expr[0];
            }
        }
        return new ContextKeyOrExpr(expr, negated);
    }
    serialize() {
        return this.expr.map(e => e.serialize()).join(' || ');
    }
    keys() {
        const result = [];
        for (const expr of this.expr) {
            result.push(...expr.keys());
        }
        return result;
    }
    map(mapFnc) {
        return new ContextKeyOrExpr(this.expr.map(expr => expr.map(mapFnc)), null);
    }
    negate() {
        if (!this.negated) {
            const result = [];
            for (const expr of this.expr) {
                result.push(expr.negate());
            }
            // We don't support parens, so here we distribute the AND over the OR terminals
            // We always take the first 2 AND pairs and distribute them
            while (result.length > 1) {
                const LEFT = result.shift();
                const RIGHT = result.shift();
                const all = [];
                for (const left of getTerminals(LEFT)) {
                    for (const right of getTerminals(RIGHT)) {
                        all.push(ContextKeyAndExpr.create([left, right], null, false));
                    }
                }
                result.unshift(ContextKeyOrExpr.create(all, null, false));
            }
            this.negated = ContextKeyOrExpr.create(result, this, true);
        }
        return this.negated;
    }
}
export class RawContextKey extends ContextKeyDefinedExpr {
    static { this._info = []; }
    static all() {
        return RawContextKey._info.values();
    }
    constructor(key, defaultValue, metaOrHide) {
        super(key, null);
        this._defaultValue = defaultValue;
        // collect all context keys into a central place
        if (typeof metaOrHide === 'object') {
            RawContextKey._info.push({ ...metaOrHide, key });
        }
        else if (metaOrHide !== true) {
            RawContextKey._info.push({ key, description: metaOrHide, type: defaultValue !== null && defaultValue !== undefined ? typeof defaultValue : undefined });
        }
    }
    bindTo(target) {
        return target.createKey(this.key, this._defaultValue);
    }
    getValue(target) {
        return target.getContextKeyValue(this.key);
    }
    toNegated() {
        return this.negate();
    }
    isEqualTo(value) {
        return ContextKeyEqualsExpr.create(this.key, value);
    }
    notEqualsTo(value) {
        return ContextKeyNotEqualsExpr.create(this.key, value);
    }
    greater(value) {
        return ContextKeyGreaterExpr.create(this.key, value);
    }
}
export const IContextKeyService = createDecorator('contextKeyService');
function cmp1(key1, key2) {
    if (key1 < key2) {
        return -1;
    }
    if (key1 > key2) {
        return 1;
    }
    return 0;
}
function cmp2(key1, value1, key2, value2) {
    if (key1 < key2) {
        return -1;
    }
    if (key1 > key2) {
        return 1;
    }
    if (value1 < value2) {
        return -1;
    }
    if (value1 > value2) {
        return 1;
    }
    return 0;
}
/**
 * Returns true if it is provable `p` implies `q`.
 */
export function implies(p, q) {
    if (p.type === 0 /* ContextKeyExprType.False */ || q.type === 1 /* ContextKeyExprType.True */) {
        // false implies anything
        // anything implies true
        return true;
    }
    if (p.type === 9 /* ContextKeyExprType.Or */) {
        if (q.type === 9 /* ContextKeyExprType.Or */) {
            // `a || b || c` can only imply something like `a || b || c || d`
            return allElementsIncluded(p.expr, q.expr);
        }
        return false;
    }
    if (q.type === 9 /* ContextKeyExprType.Or */) {
        for (const element of q.expr) {
            if (implies(p, element)) {
                return true;
            }
        }
        return false;
    }
    if (p.type === 6 /* ContextKeyExprType.And */) {
        if (q.type === 6 /* ContextKeyExprType.And */) {
            // `a && b && c` implies `a && c`
            return allElementsIncluded(q.expr, p.expr);
        }
        for (const element of p.expr) {
            if (implies(element, q)) {
                return true;
            }
        }
        return false;
    }
    return p.equals(q);
}
/**
 * Returns true if all elements in `p` are also present in `q`.
 * The two arrays are assumed to be sorted
 */
function allElementsIncluded(p, q) {
    let pIndex = 0;
    let qIndex = 0;
    while (pIndex < p.length && qIndex < q.length) {
        const cmp = p[pIndex].cmp(q[qIndex]);
        if (cmp < 0) {
            // an element from `p` is missing from `q`
            return false;
        }
        else if (cmp === 0) {
            pIndex++;
            qIndex++;
        }
        else {
            qIndex++;
        }
    }
    return (pIndex === p.length);
}
function getTerminals(node) {
    if (node.type === 9 /* ContextKeyExprType.Or */) {
        return node.expr;
    }
    return [node];
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGV4dGtleS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFJaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxXQUFXLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNqSSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsT0FBTyxFQUFpQyxNQUFNLGNBQWMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDOUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBRTNDLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUVqRSxNQUFNLGVBQWUsR0FBRyxJQUFJLEdBQUcsRUFBbUIsQ0FBQztBQUNuRCxlQUFlLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQztBQUNwQyxlQUFlLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQztBQUNsQyxlQUFlLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxXQUFXLENBQUMsQ0FBQztBQUMxQyxlQUFlLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxPQUFPLENBQUMsQ0FBQztBQUN4QyxlQUFlLENBQUMsR0FBRyxDQUFDLFdBQVcsRUFBRSxTQUFTLENBQUMsQ0FBQztBQUM1QyxlQUFlLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQztBQUNwQyxlQUFlLENBQUMsR0FBRyxDQUFDLGFBQWEsRUFBRSxX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