/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export var TokenType;
(function (TokenType) {
    TokenType[TokenType["Dollar"] = 0] = "Dollar";
    TokenType[TokenType["Colon"] = 1] = "Colon";
    TokenType[TokenType["Comma"] = 2] = "Comma";
    TokenType[TokenType["CurlyOpen"] = 3] = "CurlyOpen";
    TokenType[TokenType["CurlyClose"] = 4] = "CurlyClose";
    TokenType[TokenType["Backslash"] = 5] = "Backslash";
    TokenType[TokenType["Forwardslash"] = 6] = "Forwardslash";
    TokenType[TokenType["Pipe"] = 7] = "Pipe";
    TokenType[TokenType["Int"] = 8] = "Int";
    TokenType[TokenType["VariableName"] = 9] = "VariableName";
    TokenType[TokenType["Format"] = 10] = "Format";
    TokenType[TokenType["Plus"] = 11] = "Plus";
    TokenType[TokenType["Dash"] = 12] = "Dash";
    TokenType[TokenType["QuestionMark"] = 13] = "QuestionMark";
    TokenType[TokenType["EOF"] = 14] = "EOF";
})(TokenType || (TokenType = {}));
export class Scanner {
    constructor() {
        this.value = '';
        this.pos = 0;
    }
    static { this._table = {
        [36 /* CharCode.DollarSign */]: 0 /* TokenType.Dollar */,
        [58 /* CharCode.Colon */]: 1 /* TokenType.Colon */,
        [44 /* CharCode.Comma */]: 2 /* TokenType.Comma */,
        [123 /* CharCode.OpenCurlyBrace */]: 3 /* TokenType.CurlyOpen */,
        [125 /* CharCode.CloseCurlyBrace */]: 4 /* TokenType.CurlyClose */,
        [92 /* CharCode.Backslash */]: 5 /* TokenType.Backslash */,
        [47 /* CharCode.Slash */]: 6 /* TokenType.Forwardslash */,
        [124 /* CharCode.Pipe */]: 7 /* TokenType.Pipe */,
        [43 /* CharCode.Plus */]: 11 /* TokenType.Plus */,
        [45 /* CharCode.Dash */]: 12 /* TokenType.Dash */,
        [63 /* CharCode.QuestionMark */]: 13 /* TokenType.QuestionMark */,
    }; }
    static isDigitCharacter(ch) {
        return ch >= 48 /* CharCode.Digit0 */ && ch <= 57 /* CharCode.Digit9 */;
    }
    static isVariableCharacter(ch) {
        return ch === 95 /* CharCode.Underline */
            || (ch >= 97 /* CharCode.a */ && ch <= 122 /* CharCode.z */)
            || (ch >= 65 /* CharCode.A */ && ch <= 90 /* CharCode.Z */);
    }
    text(value) {
        this.value = value;
        this.pos = 0;
    }
    tokenText(token) {
        return this.value.substr(token.pos, token.len);
    }
    next() {
        if (this.pos >= this.value.length) {
            return { type: 14 /* TokenType.EOF */, pos: this.pos, len: 0 };
        }
        const pos = this.pos;
        let len = 0;
        let ch = this.value.charCodeAt(pos);
        let type;
        // static types
        type = Scanner._table[ch];
        if (typeof type === 'number') {
            this.pos += 1;
            return { type, pos, len: 1 };
        }
        // number
        if (Scanner.isDigitCharacter(ch)) {
            type = 8 /* TokenType.Int */;
            do {
                len += 1;
                ch = this.value.charCodeAt(pos + len);
            } while (Scanner.isDigitCharacter(ch));
            this.pos += len;
            return { type, pos, len };
        }
        // variable name
        if (Scanner.isVariableCharacter(ch)) {
            type = 9 /* TokenType.VariableName */;
            do {
                ch = this.value.charCodeAt(pos + (++len));
            } while (Scanner.isVariableCharacter(ch) || Scanner.isDigitCharacter(ch));
            this.pos += len;
            return { type, pos, len };
        }
        // format
        type = 10 /* TokenType.Format */;
        do {
            len += 1;
            ch = this.value.charCodeAt(pos + len);
        } while (!isNaN(ch)
            && typeof Scanner._table[ch] === 'undefined' // not static token
            && !Scanner.isDigitCharacter(ch) // not number
            && !Scanner.isVariableCharacter(ch) // not variable
        );
        this.pos += len;
        return { type, pos, len };
    }
}
export class Marker {
    constructor() {
        this._children = [];
    }
    appendChild(child) {
        if (child instanceof Text && this._children[this._children.length - 1] instanceof Text) {
            // this and previous child are text -> merge them
            this._children[this._children.length - 1].value += child.value;
        }
        else {
            // normal adoption of child
            child.parent = this;
            this._children.push(child);
        }
        return this;
    }
    replace(child, others) {
        const { parent } = child;
        const idx = parent.children.indexOf(child);
        const newChildren = parent.children.slice(0);
        newChildren.splice(idx, 1, ...others);
        parent._children = newChildren;
        (function _fixParent(children, parent) {
            for (const child of children) {
                child.parent = parent;
                _fixParent(child.children, child);
            }
        })(others, parent);
    }
    get children() {
        return this._children;
    }
    get rightMostDescendant() {
        if (this._children.length > 0) {
            return this._children[this._children.length - 1].rightMostDescendant;
        }
        return this;
    }
    get snippet() {
        let candidate = this;
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
    len() {
        return 0;
    }
}
export class Text extends Marker {
    static escape(value) {
        return value.replace(/\$|}|\\/g, '\\$&');
    }
    constructor(value) {
        super();
        this.value = value;
    }
    toString() {
        return this.value;
    }
    toTextmateString() {
        return Text.escape(this.value);
    }
    len() {
        return this.value.length;
    }
    clone() {
        return new Text(this.value);
    }
}
export class TransformableMarker extends Marker {
}
export class Placeholder extends TransformableMarker {
    static compareByIndex(a, b) {
        if (a.index === b.index) {
            return 0;
        }
        else if (a.isFinalTabstop) {
            return 1;
        }
        else if (b.isFinalTabstop) {
            return -1;
        }
        else if (a.index < b.index) {
            return -1;
        }
        else if (a.index > b.index) {
            return 1;
        }
        else {
            return 0;
        }
    }
    constructor(index) {
        super();
        this.index = index;
    }
    get isFinalTabstop() {
        return this.index === 0;
    }
    get choice() {
        return this._children.length === 1 && this._children[0] instanceof Choice
            ? this._children[0]
            : undefined;
    }
    toTextmateString() {
        let transformString = '';
        if (this.transform) {
            transformString = this.transform.toTextmateString();
        }
        if (this.children.length === 0 && !this.transform) {
            return `\$${this.index}`;
        }
        else if (this.children.length === 0) {
            return `\${${this.index}${transformString}}`;
        }
        else if (this.choice) {
            return `\${${this.index}|${this.choice.toTextmateString()}|${transformString}}`;
        }
        else {
            return `\${${this.index}:${this.children.map(child => child.toTextmateString()).join('')}${transformString}}`;
        }
    }
    clone() {
        const ret = new Placeholder(this.index);
        if (this.transform) {
            ret.transform = this.transform.clone();
        }
        ret._children = this.children.map(child => child.clone());
        return ret;
    }
}
export class Choice extends Marker {
    constructor() {
        super(...arguments);
        this.options = [];
    }
    appendChild(marker) {
        if (marker instanceof Text) {
            marker.parent = this;
            this.options.push(marker);
        }
        return this;
    }
    toString() {
        return this.options[0].value;
    }
    toTextmateString() {
        return this.options
            .map(option => option.value.replace(/\||,|\\/g, '\\$&'))
            .join(',');
    }
    len() {
        return this.options[0].len();
    }
    clone() {
        const ret = new Choice();
        this.options.forEach(ret.appendChild, ret);
        return ret;
    }
}
export class Transform extends Marker {
    constructor() {
        super(...arguments);
        this.regexp = new RegExp('');
    }
    resolve(value) {
        const _this = this;
        let didMatch = false;
        let ret = value.replace(this.regexp, function () {
            didMatch = true;
            return _this._replace(Array.prototype.slice.call(arguments, 0, -2));
        });
        // when the regex didn't match and when the transform has
        // else branches, then run those
        if (!didMatch && this._children.some(child => child instanceof FormatString && Boolean(child.elseValue))) {
            ret = this._replace([]);
        }
        return ret;
    }
    _replace(groups) {
        let ret = '';
        for (const marker of this._children) {
            if (marker instanceof FormatString) {
                let value = groups[marker.index] || '';
                value = marker.resolve(value);
                ret += value;
            }
            else {
                ret += marker.toString();
            }
        }
        return ret;
    }
    toString() {
        return '';
    }
    toTextmateString() {
        return `/${this.regexp.source}/${this.children.map(c => c.toTextmateString())}/${(this.regexp.ignoreCase ? 'i' : '') + (this.regexp.global ? 'g' : '')}`;
    }
    clone() {
        const ret = new Transform();
        ret.regexp = new RegExp(this.regexp.source, '' + (this.regexp.ignoreCase ? 'i' : '') + (this.regexp.global ? 'g' : ''));
        ret._children = this.children.map(child => child.clone());
        return ret;
    }
}
export class FormatString extends Marker {
    constructor(index, shorthandName, ifValue, elseValue) {
        super();
        this.index = index;
        this.shorthandName = shorthandName;
        this.ifValue = ifValue;
        this.elseValue = elseValue;
    }
    resolve(value) {
        if (this.shorthandName === 'upcase') {
            return !value ? '' : value.toLocaleUpperCase();
        }
        else if (this.shorthandName === 'downcase') {
            return !value ? '' : value.toLocaleLowerCase();
        }
        else if (this.shorthandName === 'capitalize') {
            return !value ? '' : (value[0].toLocaleUpperCase() + value.substr(1));
        }
        else if (this.shorthandName === 'pascalcase') {
            return !value ? '' : this._toPascalCase(value);
        }
        else if (this.shorthandName === 'camelcase') {
            return !value ? '' : this._toCamelCase(value);
        }
        else if (this.shorthandName === 'kebabcase') {
            return !value ? '' : this._toKebabCase(value);
        }
        else if (this.shorthandName === 'snakecase') {
            return !value ? '' : this._toSnakeCase(value);
        }
        else if (Boolean(value) && typeof this.ifValue === 'string') {
            return this.ifValue;
        }
        else if (!Boolean(value) && typeof this.elseValue === 'string') {
            return this.elseValue;
        }
        else {
            return value || '';
        }
    }
    // Note: word-based case transforms rely on uppercase/lowercase distinctions.
    // For scripts without case, transforms are effectively no-ops.
    _toKebabCase(value) {
        const match = value.match(/[\p{L}0-9]+/gu);
        if (!match) {
            return value;
        }
        if (!value.match(/[\p{L}0-9]/u)) {
            return value
                .trim()
                .toLowerCase()
                .replace(/^_+|_+$/g, '')
                .replace(/[\s_]+/g, '-');
        }
        const cleaned = value.trim().replace(/^_+|_+$/g, '');
        const match2 = cleaned.match(/\p{Lu}{2,}(?=\p{Lu}\p{Ll}+[0-9]*|[\s_-]|$)|\p{Lu}?\p{Ll}+[0-9]*|\p{Lu}(?=\p{Lu}\p{Ll})|\p{Lu}(?=[\s_-]|$)|[0-9]+/gu);
        if (!match2) {
            return cleaned
                .split(/[\s_-]+/)
                .filter(word => word.length > 0)
                .map(word => word.toLowerCase())
                .join('-');
        }
        return match2
            .map(x => x.toLowerCase())
            .join('-');
    }
    _toPascalCase(value) {
        const match = value.match(/[\p{L}0-9]+/gu);
        if (!match) {
            return value;
        }
        return match.map(word => {
            return word.charAt(0).toUpperCase() + word.substr(1);
        })
            .join('');
    }
    _toCamelCase(value) {
        const match = value.match(/[\p{L}0-9]+/gu);
        if (!match) {
            return value;
        }
        return match.map((word, index) => {
            if (index === 0) {
                return word.charAt(0).toLowerCase() + word.substr(1);
            }
            return word.charAt(0).toUpperCase() + word.substr(1);
        })
            .join('');
    }
    _toSnakeCase(value) {
        return value.replace(/(\p{Ll})(\p{Lu})/gu, '$1_$2')
            .replace(/[\s\-]+/g, '_')
            .toLowerCase();
    }
    toTextmateString() {
        let value = '${';
        value += this.index;
        if (this.shorthandName) {
            value += `:/${this.shorthandName}`;
        }
        else if (this.ifValue && this.elseValue) {
            value += `:?${this.ifValue}:${this.elseValue}`;
        }
        else if (this.ifValue) {
            value += `:+${this.ifValue}`;
        }
        else if (this.elseValue) {
            value += `:-${this.elseValue}`;
        }
        value += '}';
        return value;
    }
    clone() {
        const ret = new FormatString(this.index, this.shorthandName, this.ifValue, this.elseValue);
        return ret;
    }
}
export class Variable extends TransformableMarker {
    constructor(name) {
        super();
        this.name = name;
    }
    resolve(resolver) {
        let value = resolver.resolve(this);
        if (this.transform) {
            value = this.transform.resolve(value || '');
        }
        if (value !== undefined) {
            this._children = [new Text(value)];
            return true;
        }
        return false;
    }
    toTextmateString() {
        let transformString = '';
        if (this.transform) {
            transformString = this.transform.toTextmateString();
        }
        if (this.children.length === 0) {
            return `\${${this.name}${transformString}}`;
        }
        else {
            return `\${${this.name}:${this.children.map(child => child.toTextmateString()).join('')}${transformString}}`;
        }
    }
    clone() {
        const ret = new Variable(this.name);
        if (this.transform) {
            ret.transform = this.transform.clone();
        }
        ret._children = this.children.map(child => child.clone());
        return ret;
    }
}
function walk(marker, visitor) {
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
    get placeholderInfo() {
        if (!this._placeholders) {
            // fill in placeholders
            const all = [];
            let last;
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
    get placeholders() {
        const { all } = this.placeholderInfo;
        return all;
    }
    offset(marker) {
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
    fullLen(marker) {
        let ret = 0;
        walk([marker], marker => {
            ret += marker.len();
            return true;
        });
        return ret;
    }
    enclosingPlaceholders(placeholder) {
        const ret = [];
        let { parent } = placeholder;
        while (parent) {
            if (parent instanceof Placeholder) {
                ret.push(parent);
            }
            parent = parent.parent;
        }
        return ret;
    }
    resolveVariables(resolver) {
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
    appendChild(child) {
        this._placeholders = undefined;
        return super.appendChild(child);
    }
    replace(child, others) {
        this._placeholders = undefined;
        return super.replace(child, others);
    }
    toTextmateString() {
        return this.children.reduce((prev, cur) => prev + cur.toTextmateString(), '');
    }
    clone() {
        const ret = new TextmateSnippet();
        this._children = this.children.map(child => child.clone());
        return ret;
    }
    walk(visitor) {
        walk(this.children, visitor);
    }
}
export class SnippetParser {
    constructor() {
        this._scanner = new Scanner();
        this._token = { type: 14 /* TokenType.EOF */, pos: 0, len: 0 };
    }
    static escape(value) {
        return value.replace(/\$|}|\\/g, '\\$&');
    }
    /**
     * Takes a snippet and returns the insertable string, e.g return the snippet-string
     * without any placeholder, tabstop, variables etc...
     */
    static asInsertText(value) {
        return new SnippetParser().parse(value).toString();
    }
    static guessNeedsClipboard(template) {
        return /\${?CLIPBOARD/.test(template);
    }
    parse(value, insertFinalTabstop, enforceFinalTabstop) {
        const snippet = new TextmateSnippet();
        this.parseFragment(value, snippet);
        this.ensureFinalTabstop(snippet, enforceFinalTabstop ?? false, insertFinalTabstop ?? false);
        return snippet;
    }
    parseFragment(value, snippet) {
        const offset = snippet.children.length;
        this._scanner.text(value);
        this._token = this._scanner.next();
        while (this._parse(snippet)) {
            // nothing
        }
        // fill in values for placeholders. the first placeholder of an index
        // that has a value defines the value for all placeholders with that index
        const placeholderDefaultValues = new Map();
        const incompletePlaceholders = [];
        snippet.walk(marker => {
            if (marker instanceof Placeholder) {
                if (marker.isFinalTabstop) {
                    placeholderDefaultValues.set(0, undefined);
                }
                else if (!placeholderDefaultValues.has(marker.index) && marker.children.length > 0) {
                    placeholderDefaultValues.set(marker.index, marker.children);
                }
                else {
                    incompletePlaceholders.push(marker);
                }
            }
            return true;
        });
        const fillInIncompletePlaceholder = (placeholder, stack) => {
            const defaultValues = placeholderDefaultValues.get(placeholder.index);
            if (!defaultValues) {
                return;
            }
            const clone = new Placeholder(placeholder.index);
            clone.transform = placeholder.transform;
            for (const child of defaultValues) {
                const newChild = child.clone();
                clone.appendChild(newChild);
                // "recurse" on children that are again placeholders
                if (newChild instanceof Placeholder && placeholderDefaultValues.has(newChild.index) && !stack.has(newChild.index)) {
                    stack.add(newChild.index);
                    fillInIncompletePlaceholder(newChild, stack);
                    stack.delete(newChild.index);
                }
            }
            snippet.replace(placeholder, [clone]);
        };
        const stack = new Set();
        for (const placeholder of incompletePlaceholders) {
            fillInIncompletePlaceholder(placeholder, stack);
        }
        return snippet.children.slice(offset);
    }
    ensureFinalTabstop(snippet, enforceFinalTabstop, insertFinalTabstop) {
        if (enforceFinalTabstop || insertFinalTabstop && snippet.placeholders.length > 0) {
            const finalTabstop = snippet.placeholders.find(p => p.index === 0);
            if (!finalTabstop) {
                // the snippet uses placeholders but has no
                // final tabstop defined -> insert at the end
                snippet.appendChild(new Placeholder(0));
            }
        }
    }
    _accept(type, value) {
        if (type === undefined || this._token.type === type) {
            const ret = !value ? true : this._scanner.tokenText(this._token);
            this._token = this._scanner.next();
            return ret;
        }
        return false;
    }
    _backTo(token) {
        this._scanner.pos = token.pos + token.len;
        this._token = token;
        return false;
    }
    _until(type) {
        const start = this._token;
        while (this._token.type !== type) {
            if (this._token.type === 14 /* TokenType.EOF */) {
                return false;
            }
            else if (this._token.type === 5 /* TokenType.Backslash */) {
                const nextToken = this._scanner.next();
                if (nextToken.type !== 0 /* TokenType.Dollar */
                    && nextToken.type !== 4 /* TokenType.CurlyClose */
                    && nextToken.type !== 5 /* TokenType.Backslash */) {
                    return false;
                }
            }
            this._token = this._scanner.next();
        }
        const value = this._scanner.value.substring(start.pos, this._token.pos).replace(/\\(\$|}|\\)/g, '$1');
        this._token = this._scanner.next();
        return value;
    }
    _parse(marker) {
        return this._parseEscaped(marker)
            || this._parseTabstopOrVariableName(marker)
            || this._parseComplexPlaceholder(marker)
            || this._parseComplexVariable(marker)
            || this._parseAnything(marker);
    }
    // \$, \\, \} -> just text
    _parseEscaped(marker) {
        let value;
        if (value = this._accept(5 /* TokenType.Backslash */, true)) {
            // saw a backslash, append escaped token or that backslash
            value = this._accept(0 /* TokenType.Dollar */, true)
                || this._accept(4 /* TokenType.CurlyClose */, true)
                || this._accept(5 /* TokenType.Backslash */, true)
                || value;
            marker.appendChild(new Text(value));
            return true;
        }
        return false;
    }
    // $foo -> variable, $1 -> tabstop
    _parseTabstopOrVariableName(parent) {
        let value;
        const token = this._token;
        const match = this._accept(0 /* TokenType.Dollar */)
            && (value = this._accept(9 /* TokenType.VariableName */, true) || this._accept(8 /* TokenType.Int */, true));
        if (!match) {
            return this._backTo(token);
        }
        parent.appendChild(/^\d+$/.test(value)
            ? new Placeholder(Number(value))
            : new Variable(value));
        return true;
    }
    // ${1:<children>}, ${1} -> placeholder
    _parseComplexPlaceholder(parent) {
        let index;
        const token = this._token;
        const match = this._accept(0 /* TokenType.Dollar */)
            && this._accept(3 /* TokenType.CurlyOpen */)
            && (index = this._accept(8 /* TokenType.Int */, true));
        if (!match) {
            return this._backTo(token);
        }
        const placeholder = new Placeholder(Number(index));
        if (this._accept(1 /* TokenType.Colon */)) {
            // ${1:<children>}
            while (true) {
                // ...} -> done
                if (this._accept(4 /* TokenType.CurlyClose */)) {
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
        }
        else if (placeholder.index > 0 && this._accept(7 /* TokenType.Pipe */)) {
            // ${1|one,two,three|}
            const choice = new Choice();
            while (true) {
                if (this._parseChoiceElement(choice)) {
                    if (this._accept(2 /* TokenType.Comma */)) {
                        // opt, -> more
                        continue;
                    }
                    if (this._accept(7 /* TokenType.Pipe */)) {
                        placeholder.appendChild(choice);
                        if (this._accept(4 /* TokenType.CurlyClose */)) {
                            // ..|} -> done
                            parent.appendChild(placeholder);
                            return true;
                        }
                    }
                }
                this._backTo(token);
                return false;
            }
        }
        else if (this._accept(6 /* TokenType.Forwardslash */)) {
            // ${1/<regex>/<format>/<options>}
            if (this._parseTransform(placeholder)) {
                parent.appendChild(placeholder);
                return true;
            }
            this._backTo(token);
            return false;
        }
        else if (this._accept(4 /* TokenType.CurlyClose */)) {
            // ${1}
            parent.appendChild(placeholder);
            return true;
        }
        else {
            // ${1 <- missing curly or colon
            return this._backTo(token);
        }
    }
    _parseChoiceElement(parent) {
        const token = this._token;
        const values = [];
        while (true) {
            if (this._token.type === 2 /* TokenType.Comma */ || this._token.type === 7 /* TokenType.Pipe */) {
                break;
            }
            let value;
            if (value = this._accept(5 /* TokenType.Backslash */, true)) {
                // \, \|, or \\
                value = this._accept(2 /* TokenType.Comma */, true)
                    || this._accept(7 /* TokenType.Pipe */, true)
                    || this._accept(5 /* TokenType.Backslash */, true)
                    || value;
            }
            else {
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
    _parseComplexVariable(parent) {
        let name;
        const token = this._token;
        const match = this._accept(0 /* TokenType.Dollar */)
            && this._accept(3 /* TokenType.CurlyOpen */)
            && (name = this._accept(9 /* TokenType.VariableName */, true));
        if (!match) {
            return this._backTo(token);
        }
        const variable = new Variable(name);
        if (this._accept(1 /* TokenType.Colon */)) {
            // ${foo:<children>}
            while (true) {
                // ...} -> done
                if (this._accept(4 /* TokenType.CurlyClose */)) {
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
        }
        else if (this._accept(6 /* TokenType.Forwardslash */)) {
            // ${foo/<regex>/<format>/<options>}
            if (this._parseTransform(variable)) {
                parent.appendChild(variable);
                return true;
            }
            this._backTo(token);
            return false;
        }
        else if (this._accept(4 /* TokenType.CurlyClose */)) {
            // ${foo}
            parent.appendChild(variable);
            return true;
        }
        else {
            // ${foo <- missing curly or colon
            return this._backTo(token);
        }
    }
    _parseTransform(parent) {
        // ...<regex>/<format>/<options>}
        const transform = new Transform();
        let regexValue = '';
        let regexOptions = '';
        // (1) /regex
        while (true) {
            if (this._accept(6 /* TokenType.Forwardslash */)) {
                break;
            }
            let escaped;
            if (escaped = this._accept(5 /* TokenType.Backslash */, true)) {
                escaped = this._accept(6 /* TokenType.Forwardslash */, true) || escaped;
                regexValue += escaped;
                continue;
            }
            if (this._token.type !== 14 /* TokenType.EOF */) {
                regexValue += this._accept(undefined, true);
                continue;
            }
            return false;
        }
        // (2) /format
        while (true) {
            if (this._accept(6 /* TokenType.Forwardslash */)) {
                break;
            }
            let escaped;
            if (escaped = this._accept(5 /* TokenType.Backslash */, true)) {
                escaped = this._accept(5 /* TokenType.Backslash */, true) || this._accept(6 /* TokenType.Forwardslash */, true) || escaped;
                transform.appendChild(new Text(escaped));
                continue;
            }
            if (this._parseFormatString(transform) || this._parseAnything(transform)) {
                continue;
            }
            return false;
        }
        // (3) /option
        while (true) {
            if (this._accept(4 /* TokenType.CurlyClose */)) {
                break;
            }
            if (this._token.type !== 14 /* TokenType.EOF */) {
                regexOptions += this._accept(undefined, true);
                continue;
            }
            return false;
        }
        try {
            transform.regexp = new RegExp(regexValue, regexOptions);
        }
        catch (e) {
            // invalid regexp
            return false;
        }
        parent.transform = transform;
        return true;
    }
    _parseFormatString(parent) {
        const token = this._token;
        if (!this._accept(0 /* TokenType.Dollar */)) {
            return false;
        }
        let complex = false;
        if (this._accept(3 /* TokenType.CurlyOpen */)) {
            complex = true;
        }
        const index = this._accept(8 /* TokenType.Int */, true);
        if (!index) {
            this._backTo(token);
            return false;
        }
        else if (!complex) {
            // $1
            parent.appendChild(new FormatString(Number(index)));
            return true;
        }
        else if (this._accept(4 /* TokenType.CurlyClose */)) {
            // ${1}
            parent.appendChild(new FormatString(Number(index)));
            return true;
        }
        else if (!this._accept(1 /* TokenType.Colon */)) {
            this._backTo(token);
            return false;
        }
        if (this._accept(6 /* TokenType.Forwardslash */)) {
            // ${1:/upcase}
            const shorthand = this._accept(9 /* TokenType.VariableName */, true);
            if (!shorthand || !this._accept(4 /* TokenType.CurlyClose */)) {
                this._backTo(token);
                return false;
            }
            else {
                parent.appendChild(new FormatString(Number(index), shorthand));
                return true;
            }
        }
        else if (this._accept(11 /* TokenType.Plus */)) {
            // ${1:+<if>}
            const ifValue = this._until(4 /* TokenType.CurlyClose */);
            if (ifValue) {
                parent.appendChild(new FormatString(Number(index), undefined, ifValue, undefined));
                return true;
            }
        }
        else if (this._accept(12 /* TokenType.Dash */)) {
            // ${2:-<else>}
            const elseValue = this._until(4 /* TokenType.CurlyClose */);
            if (elseValue) {
                parent.appendChild(new FormatString(Number(index), undefined, undefined, elseValue));
                return true;
            }
        }
        else if (this._accept(13 /* TokenType.QuestionMark */)) {
            // ${2:?<if>:<else>}
            const ifValue = this._until(1 /* TokenType.Colon */);
            if (ifValue) {
                const elseValue = this._until(4 /* TokenType.CurlyClose */);
                if (elseValue) {
                    parent.appendChild(new FormatString(Number(index), undefined, ifValue, elseValue));
                    return true;
                }
            }
        }
        else {
            // ${1:<else>}
            const elseValue = this._until(4 /* TokenType.CurlyClose */);
            if (elseValue) {
                parent.appendChild(new FormatString(Number(index), undefined, undefined, elseValue));
                return true;
            }
        }
        this._backTo(token);
        return false;
    }
    _parseAnything(marker) {
        if (this._token.type !== 14 /* TokenType.EOF */) {
            marker.appendChild(new Text(this._scanner.tokenText(this._token)));
            this._accept(undefined);
            return true;
        }
        return false;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic25pcHBldFBhcnNlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL3NuaXBwZXQvYnJvd3Nlci9zbmlwcGV0UGFyc2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBSWhHLE1BQU0sQ0FBTixJQUFrQixTQWdCakI7QUFoQkQsV0FBa0IsU0FBUztJQUMxQiw2Q0FBTSxDQUFBO0lBQ04sMkNBQUssQ0FBQTtJQUNMLDJDQUFLLENBQUE7SUFDTCxtREFBUyxDQUFBO0lBQ1QscURBQVUsQ0FBQTtJQUNWLG1EQUFTLENBQUE7SUFDVCx5REFBWSxDQUFBO0lBQ1oseUNBQUksQ0FBQTtJQUNKLHVDQUFHLENBQUE7SUFDSCx5REFBWSxDQUFBO0lBQ1osOENBQU0sQ0FBQTtJQUNOLDBDQUFJLENBQUE7SUFDSiwwQ0FBSSxDQUFBO0lBQ0osMERBQVksQ0FBQTtJQUNaLHdDQUFHLENBQUE7QUFDSixDQUFDLEVBaEJpQixTQUFTLEtBQVQsU0FBUyxRQWdCMUI7QUFTRCxNQUFNLE9BQU8sT0FBTztJQUFwQjtRQTBCQyxVQUFLLEdBQVcsRUFBRSxDQUFDO1FBQ25CLFFBQUcsR0FBVyxDQUFDLENBQUM7SUFvRWpCLENBQUM7YUE3RmUsV0FBTSxHQUFnQztRQUNwRCw4QkFBcUIsMEJBQWtCO1FBQ3ZDLHlCQUFnQix5QkFBaUI7UUFDakMseUJBQWdCLHlCQUFpQjtRQUNqQyxtQ0FBeUIsNkJBQXFCO1FBQzlDLG9DQUEwQiw4QkFBc0I7UUFDaEQsNkJBQW9CLDZCQUFxQjtRQUN6Qyx5QkFBZ0IsZ0NBQXdCO1FBQ3hDLHlCQUFlLHdCQUFnQjtRQUMvQix3QkFBZSx5QkFBZ0I7UUFDL0Isd0JBQWUseUJBQWdCO1FBQy9CLGdDQUF1QixpQ0FBd0I7S0FDL0MsQUFab0IsQ0FZbkI7SUFFRixNQUFNLENBQUMsZ0JBQWdCLENBQUMsRUFBVTtRQUNq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