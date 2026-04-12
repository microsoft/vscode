/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as paths from './path.js';
import { isWindows } from './platform.js';
const _schemePattern = /^\w[\w\d+.-]*$/;
const _singleSlashStart = /^\//;
const _doubleSlashStart = /^\/\//;
function _validateUri(ret, _strict) {
    // scheme, must be set
    if (!ret.scheme && _strict) {
        throw new Error(`[UriError]: Scheme is missing: {scheme: "", authority: "${ret.authority}", path: "${ret.path}", query: "${ret.query}", fragment: "${ret.fragment}"}`);
    }
    // scheme, https://tools.ietf.org/html/rfc3986#section-3.1
    // ALPHA *( ALPHA / DIGIT / "+" / "-" / "." )
    if (ret.scheme && !_schemePattern.test(ret.scheme)) {
        const matches = [...ret.scheme.matchAll(/[^\w\d+.-]/gu)];
        const detail = matches.length > 0
            ? ` Found '${matches[0][0]}' at index ${matches[0].index} (${matches.length} total)`
            : '';
        throw new Error(`[UriError]: Scheme contains illegal characters.${detail} (len:${ret.scheme.length})`);
    }
    // path, http://tools.ietf.org/html/rfc3986#section-3.3
    // If a URI contains an authority component, then the path component
    // must either be empty or begin with a slash ("/") character.  If a URI
    // does not contain an authority component, then the path cannot begin
    // with two slash characters ("//").
    if (ret.path) {
        if (ret.authority) {
            if (!_singleSlashStart.test(ret.path)) {
                throw new Error('[UriError]: If a URI contains an authority component, then the path component must either be empty or begin with a slash ("/") character');
            }
        }
        else {
            if (_doubleSlashStart.test(ret.path)) {
                throw new Error('[UriError]: If a URI does not contain an authority component, then the path cannot begin with two slash characters ("//")');
            }
        }
    }
}
// for a while we allowed uris *without* schemes and this is the migration
// for them, e.g. an uri without scheme and without strict-mode warns and falls
// back to the file-scheme. that should cause the least carnage and still be a
// clear warning
function _schemeFix(scheme, _strict) {
    if (!scheme && !_strict) {
        return 'file';
    }
    return scheme;
}
// implements a bit of https://tools.ietf.org/html/rfc3986#section-5
function _referenceResolution(scheme, path) {
    // the slash-character is our 'default base' as we don't
    // support constructing URIs relative to other URIs. This
    // also means that we alter and potentially break paths.
    // see https://tools.ietf.org/html/rfc3986#section-5.1.4
    switch (scheme) {
        case 'https':
        case 'http':
        case 'file':
            if (!path) {
                path = _slash;
            }
            else if (path[0] !== _slash) {
                path = _slash + path;
            }
            break;
    }
    return path;
}
const _empty = '';
const _slash = '/';
const _regexp = /^(([^:/?#]+?):)?(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?/;
/**
 * Uniform Resource Identifier (URI) http://tools.ietf.org/html/rfc3986.
 * This class is a simple parser which creates the basic component parts
 * (http://tools.ietf.org/html/rfc3986#section-3) with minimal validation
 * and encoding.
 *
 * ```txt
 *       foo://example.com:8042/over/there?name=ferret#nose
 *       \_/   \______________/\_________/ \_________/ \__/
 *        |           |            |            |        |
 *     scheme     authority       path        query   fragment
 *        |   _____________________|__
 *       / \ /                        \
 *       urn:example:animal:ferret:nose
 * ```
 */
export class URI {
    static isUri(thing) {
        if (thing instanceof URI) {
            return true;
        }
        if (!thing || typeof thing !== 'object') {
            return false;
        }
        return typeof thing.authority === 'string'
            && typeof thing.fragment === 'string'
            && typeof thing.path === 'string'
            && typeof thing.query === 'string'
            && typeof thing.scheme === 'string'
            && typeof thing.fsPath === 'string'
            && typeof thing.with === 'function'
            && typeof thing.toString === 'function';
    }
    /**
     * @internal
     */
    constructor(schemeOrData, authority, path, query, fragment, _strict = false) {
        if (typeof schemeOrData === 'object') {
            this.scheme = schemeOrData.scheme || _empty;
            this.authority = schemeOrData.authority || _empty;
            this.path = schemeOrData.path || _empty;
            this.query = schemeOrData.query || _empty;
            this.fragment = schemeOrData.fragment || _empty;
            // no validation because it's this URI
            // that creates uri components.
            // _validateUri(this);
        }
        else {
            this.scheme = _schemeFix(schemeOrData, _strict);
            this.authority = authority || _empty;
            this.path = _referenceResolution(this.scheme, path || _empty);
            this.query = query || _empty;
            this.fragment = fragment || _empty;
            _validateUri(this, _strict);
        }
    }
    // ---- filesystem path -----------------------
    /**
     * Returns a string representing the corresponding file system path of this URI.
     * Will handle UNC paths, normalizes windows drive letters to lower-case, and uses the
     * platform specific path separator.
     *
     * * Will *not* validate the path for invalid characters and semantics.
     * * Will *not* look at the scheme of this URI.
     * * The result shall *not* be used for display purposes but for accessing a file on disk.
     *
     *
     * The *difference* to `URI#path` is the use of the platform specific separator and the handling
     * of UNC paths. See the below sample of a file-uri with an authority (UNC path).
     *
     * ```ts
        const u = URI.parse('file://server/c$/folder/file.txt')
        u.authority === 'server'
        u.path === '/shares/c$/file.txt'
        u.fsPath === '\\server\c$\folder\file.txt'
    ```
     *
     * Using `URI#path` to read a file (using fs-apis) would not be enough because parts of the path,
     * namely the server name, would be missing. Therefore `URI#fsPath` exists - it's sugar to ease working
     * with URIs that represent files on disk (`file` scheme).
     */
    get fsPath() {
        // if (this.scheme !== 'file') {
        // 	console.warn(`[UriError] calling fsPath with scheme ${this.scheme}`);
        // }
        return uriToFsPath(this, false);
    }
    // ---- modify to new -------------------------
    with(change) {
        if (!change) {
            return this;
        }
        let { scheme, authority, path, query, fragment } = change;
        if (scheme === undefined) {
            scheme = this.scheme;
        }
        else if (scheme === null) {
            scheme = _empty;
        }
        if (authority === undefined) {
            authority = this.authority;
        }
        else if (authority === null) {
            authority = _empty;
        }
        if (path === undefined) {
            path = this.path;
        }
        else if (path === null) {
            path = _empty;
        }
        if (query === undefined) {
            query = this.query;
        }
        else if (query === null) {
            query = _empty;
        }
        if (fragment === undefined) {
            fragment = this.fragment;
        }
        else if (fragment === null) {
            fragment = _empty;
        }
        if (scheme === this.scheme
            && authority === this.authority
            && path === this.path
            && query === this.query
            && fragment === this.fragment) {
            return this;
        }
        return new Uri(scheme, authority, path, query, fragment);
    }
    // ---- parse & validate ------------------------
    /**
     * Creates a new URI from a string, e.g. `http://www.example.com/some/path`,
     * `file:///usr/home`, or `scheme:with/path`.
     *
     * @param value A string which represents an URI (see `URI#toString`).
     */
    static parse(value, _strict = false) {
        const match = _regexp.exec(value);
        if (!match) {
            return new Uri(_empty, _empty, _empty, _empty, _empty);
        }
        return new Uri(match[2] || _empty, percentDecode(match[4] || _empty), percentDecode(match[5] || _empty), percentDecode(match[7] || _empty), percentDecode(match[9] || _empty), _strict);
    }
    /**
     * Creates a new URI from a file system path, e.g. `c:\my\files`,
     * `/usr/home`, or `\\server\share\some\path`.
     *
     * The *difference* between `URI#parse` and `URI#file` is that the latter treats the argument
     * as path, not as stringified-uri. E.g. `URI.file(path)` is **not the same as**
     * `URI.parse('file://' + path)` because the path might contain characters that are
     * interpreted (# and ?). See the following sample:
     * ```ts
    const good = URI.file('/coding/c#/project1');
    good.scheme === 'file';
    good.path === '/coding/c#/project1';
    good.fragment === '';
    const bad = URI.parse('file://' + '/coding/c#/project1');
    bad.scheme === 'file';
    bad.path === '/coding/c'; // path is now broken
    bad.fragment === '/project1';
    ```
     *
     * @param path A file system path (see `URI#fsPath`)
     */
    static file(path) {
        let authority = _empty;
        // normalize to fwd-slashes on windows,
        // on other systems bwd-slashes are valid
        // filename character, eg /f\oo/ba\r.txt
        if (isWindows) {
            path = path.replace(/\\/g, _slash);
        }
        // check for authority as used in UNC shares
        // or use the path as given
        if (path[0] === _slash && path[1] === _slash) {
            const idx = path.indexOf(_slash, 2);
            if (idx === -1) {
                authority = path.substring(2);
                path = _slash;
            }
            else {
                authority = path.substring(2, idx);
                path = path.substring(idx) || _slash;
            }
        }
        return new Uri('file', authority, path, _empty, _empty);
    }
    /**
     * Creates new URI from uri components.
     *
     * Unless `strict` is `true` the scheme is defaults to be `file`. This function performs
     * validation and should be used for untrusted uri components retrieved from storage,
     * user input, command arguments etc
     */
    static from(components, strict) {
        const result = new Uri(components.scheme, components.authority, components.path, components.query, components.fragment, strict);
        return result;
    }
    /**
     * Join a URI path with path fragments and normalizes the resulting path.
     *
     * @param uri The input URI.
     * @param pathFragment The path fragment to add to the URI path.
     * @returns The resulting URI.
     */
    static joinPath(uri, ...pathFragment) {
        if (!uri.path) {
            throw new Error(`[UriError]: cannot call joinPath on URI without path`);
        }
        let newPath;
        if (isWindows && uri.scheme === 'file') {
            newPath = URI.file(paths.win32.join(uriToFsPath(uri, true), ...pathFragment)).path;
        }
        else {
            newPath = paths.posix.join(uri.path, ...pathFragment);
        }
        return uri.with({ path: newPath });
    }
    // ---- printing/externalize ---------------------------
    /**
     * Creates a string representation for this URI. It's guaranteed that calling
     * `URI.parse` with the result of this function creates an URI which is equal
     * to this URI.
     *
     * * The result shall *not* be used for display purposes but for externalization or transport.
     * * The result will be encoded using the percentage encoding and encoding happens mostly
     * ignore the scheme-specific encoding rules.
     *
     * @param skipEncoding Do not encode the result, default is `false`
     */
    toString(skipEncoding = false) {
        return _asFormatted(this, skipEncoding);
    }
    toJSON() {
        return this;
    }
    static revive(data) {
        if (!data) {
            return data;
        }
        else if (data instanceof URI) {
            return data;
        }
        else {
            const result = new Uri(data);
            result._formatted = data.external ?? null;
            result._fsPath = data._sep === _pathSepMarker ? data.fsPath ?? null : null;
            return result;
        }
    }
    [Symbol.for('debug.description')]() {
        return `URI(${this.toString()})`;
    }
}
export function isUriComponents(thing) {
    if (!thing || typeof thing !== 'object') {
        return false;
    }
    return typeof thing.scheme === 'string'
        && (typeof thing.authority === 'string' || typeof thing.authority === 'undefined')
        && (typeof thing.path === 'string' || typeof thing.path === 'undefined')
        && (typeof thing.query === 'string' || typeof thing.query === 'undefined')
        && (typeof thing.fragment === 'string' || typeof thing.fragment === 'undefined');
}
const _pathSepMarker = isWindows ? 1 : undefined;
// This class exists so that URI is compatible with vscode.Uri (API).
class Uri extends URI {
    constructor() {
        super(...arguments);
        this._formatted = null;
        this._fsPath = null;
    }
    get fsPath() {
        if (!this._fsPath) {
            this._fsPath = uriToFsPath(this, false);
        }
        return this._fsPath;
    }
    toString(skipEncoding = false) {
        if (!skipEncoding) {
            if (!this._formatted) {
                this._formatted = _asFormatted(this, false);
            }
            return this._formatted;
        }
        else {
            // we don't cache that
            return _asFormatted(this, true);
        }
    }
    toJSON() {
        // eslint-disable-next-line local/code-no-dangerous-type-assertions
        const res = {
            $mid: 1 /* MarshalledId.Uri */
        };
        // cached state
        if (this._fsPath) {
            res.fsPath = this._fsPath;
            res._sep = _pathSepMarker;
        }
        if (this._formatted) {
            res.external = this._formatted;
        }
        //--- uri components
        if (this.path) {
            res.path = this.path;
        }
        // TODO
        // this isn't correct and can violate the UriComponents contract but
        // this is part of the vscode.Uri API and we shouldn't change how that
        // works anymore
        if (this.scheme) {
            res.scheme = this.scheme;
        }
        if (this.authority) {
            res.authority = this.authority;
        }
        if (this.query) {
            res.query = this.query;
        }
        if (this.fragment) {
            res.fragment = this.fragment;
        }
        return res;
    }
}
// reserved characters: https://tools.ietf.org/html/rfc3986#section-2.2
const encodeTable = {
    [58 /* CharCode.Colon */]: '%3A', // gen-delims
    [47 /* CharCode.Slash */]: '%2F',
    [63 /* CharCode.QuestionMark */]: '%3F',
    [35 /* CharCode.Hash */]: '%23',
    [91 /* CharCode.OpenSquareBracket */]: '%5B',
    [93 /* CharCode.CloseSquareBracket */]: '%5D',
    [64 /* CharCode.AtSign */]: '%40',
    [33 /* CharCode.ExclamationMark */]: '%21', // sub-delims
    [36 /* CharCode.DollarSign */]: '%24',
    [38 /* CharCode.Ampersand */]: '%26',
    [39 /* CharCode.SingleQuote */]: '%27',
    [40 /* CharCode.OpenParen */]: '%28',
    [41 /* CharCode.CloseParen */]: '%29',
    [42 /* CharCode.Asterisk */]: '%2A',
    [43 /* CharCode.Plus */]: '%2B',
    [44 /* CharCode.Comma */]: '%2C',
    [59 /* CharCode.Semicolon */]: '%3B',
    [61 /* CharCode.Equals */]: '%3D',
    [32 /* CharCode.Space */]: '%20',
};
function encodeURIComponentFast(uriComponent, isPath, isAuthority) {
    let res = undefined;
    let nativeEncodePos = -1;
    for (let pos = 0; pos < uriComponent.length; pos++) {
        const code = uriComponent.charCodeAt(pos);
        // unreserved characters: https://tools.ietf.org/html/rfc3986#section-2.3
        if ((code >= 97 /* CharCode.a */ && code <= 122 /* CharCode.z */)
            || (code >= 65 /* CharCode.A */ && code <= 90 /* CharCode.Z */)
            || (code >= 48 /* CharCode.Digit0 */ && code <= 57 /* CharCode.Digit9 */)
            || code === 45 /* CharCode.Dash */
            || code === 46 /* CharCode.Period */
            || code === 95 /* CharCode.Underline */
            || code === 126 /* CharCode.Tilde */
            || (isPath && code === 47 /* CharCode.Slash */)
            || (isAuthority && code === 91 /* CharCode.OpenSquareBracket */)
            || (isAuthority && code === 93 /* CharCode.CloseSquareBracket */)
            || (isAuthority && code === 58 /* CharCode.Colon */)) {
            // check if we are delaying native encode
            if (nativeEncodePos !== -1) {
                res += encodeURIComponent(uriComponent.substring(nativeEncodePos, pos));
                nativeEncodePos = -1;
            }
            // check if we write into a new string (by default we try to return the param)
            if (res !== undefined) {
                res += uriComponent.charAt(pos);
            }
        }
        else {
            // encoding needed, we need to allocate a new string
            if (res === undefined) {
                res = uriComponent.substr(0, pos);
            }
            // check with default table first
            const escaped = encodeTable[code];
            if (escaped !== undefined) {
                // check if we are delaying native encode
                if (nativeEncodePos !== -1) {
                    res += encodeURIComponent(uriComponent.substring(nativeEncodePos, pos));
                    nativeEncodePos = -1;
                }
                // append escaped variant to result
                res += escaped;
            }
            else if (nativeEncodePos === -1) {
                // use native encode only when needed
                nativeEncodePos = pos;
            }
        }
    }
    if (nativeEncodePos !== -1) {
        res += encodeURIComponent(uriComponent.substring(nativeEncodePos));
    }
    return res !== undefined ? res : uriComponent;
}
function encodeURIComponentMinimal(path) {
    let res = undefined;
    for (let pos = 0; pos < path.length; pos++) {
        const code = path.charCodeAt(pos);
        if (code === 35 /* CharCode.Hash */ || code === 63 /* CharCode.QuestionMark */) {
            if (res === undefined) {
                res = path.substr(0, pos);
            }
            res += encodeTable[code];
        }
        else {
            if (res !== undefined) {
                res += path[pos];
            }
        }
    }
    return res !== undefined ? res : path;
}
/**
 * Compute `fsPath` for the given uri
 */
export function uriToFsPath(uri, keepDriveLetterCasing) {
    let value;
    if (uri.authority && uri.path.length > 1 && uri.scheme === 'file') {
        // unc path: file://shares/c$/far/boo
        value = `//${uri.authority}${uri.path}`;
    }
    else if (uri.path.charCodeAt(0) === 47 /* CharCode.Slash */
        && (uri.path.charCodeAt(1) >= 65 /* CharCode.A */ && uri.path.charCodeAt(1) <= 90 /* CharCode.Z */ || uri.path.charCodeAt(1) >= 97 /* CharCode.a */ && uri.path.charCodeAt(1) <= 122 /* CharCode.z */)
        && uri.path.charCodeAt(2) === 58 /* CharCode.Colon */) {
        if (!keepDriveLetterCasing) {
            // windows drive letter: file:///c:/far/boo
            value = uri.path[1].toLowerCase() + uri.path.substr(2);
        }
        else {
            value = uri.path.substr(1);
        }
    }
    else {
        // other path
        value = uri.path;
    }
    if (isWindows) {
        value = value.replace(/\//g, '\\');
    }
    return value;
}
/**
 * Create the external version of a uri
 */
function _asFormatted(uri, skipEncoding) {
    const encoder = !skipEncoding
        ? encodeURIComponentFast
        : encodeURIComponentMinimal;
    let res = '';
    let { scheme, authority, path, query, fragment } = uri;
    if (scheme) {
        res += scheme;
        res += ':';
    }
    if (authority || scheme === 'file') {
        res += _slash;
        res += _slash;
    }
    if (authority) {
        let idx = authority.indexOf('@');
        if (idx !== -1) {
            // <user>@<auth>
            const userinfo = authority.substr(0, idx);
            authority = authority.substr(idx + 1);
            idx = userinfo.lastIndexOf(':');
            if (idx === -1) {
                res += encoder(userinfo, false, false);
            }
            else {
                // <user>:<pass>@<auth>
                res += encoder(userinfo.substr(0, idx), false, false);
                res += ':';
                res += encoder(userinfo.substr(idx + 1), false, true);
            }
            res += '@';
        }
        authority = authority.toLowerCase();
        idx = authority.lastIndexOf(':');
        if (idx === -1) {
            res += encoder(authority, false, true);
        }
        else {
            // <auth>:<port>
            res += encoder(authority.substr(0, idx), false, true);
            res += authority.substr(idx);
        }
    }
    if (path) {
        // lower-case windows drive letters in /C:/fff or C:/fff
        if (path.length >= 3 && path.charCodeAt(0) === 47 /* CharCode.Slash */ && path.charCodeAt(2) === 58 /* CharCode.Colon */) {
            const code = path.charCodeAt(1);
            if (code >= 65 /* CharCode.A */ && code <= 90 /* CharCode.Z */) {
                path = `/${String.fromCharCode(code + 32)}:${path.substr(3)}`; // "/c:".length === 3
            }
        }
        else if (path.length >= 2 && path.charCodeAt(1) === 58 /* CharCode.Colon */) {
            const code = path.charCodeAt(0);
            if (code >= 65 /* CharCode.A */ && code <= 90 /* CharCode.Z */) {
                path = `${String.fromCharCode(code + 32)}:${path.substr(2)}`; // "/c:".length === 3
            }
        }
        // encode the rest of the path
        res += encoder(path, true, false);
    }
    if (query) {
        res += '?';
        res += encoder(query, false, false);
    }
    if (fragment) {
        res += '#';
        res += !skipEncoding ? encodeURIComponentFast(fragment, false, false) : fragment;
    }
    return res;
}
// --- decode
function decodeURIComponentGraceful(str) {
    try {
        return decodeURIComponent(str);
    }
    catch {
        if (str.length > 3) {
            return str.substr(0, 3) + decodeURIComponentGraceful(str.substr(3));
        }
        else {
            return str;
        }
    }
}
const _rEncodedAsHex = /(%[0-9A-Za-z][0-9A-Za-z])+/g;
function percentDecode(str) {
    if (!str.match(_rEncodedAsHex)) {
        return str;
    }
    return str.replace(_rEncodedAsHex, (match) => decodeURIComponentGraceful(match));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXJpLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9jb21tb24vdXJpLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBSWhHLE9BQU8sS0FBSyxLQUFLLE1BQU0sV0FBVyxDQUFDO0FBQ25DLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFFMUMsTUFBTSxjQUFjLEdBQUcsZ0JBQWdCLENBQUM7QUFDeEMsTUFBTSxpQkFBaUIsR0FBRyxLQUFLLENBQUM7QUFDaEMsTUFBTSxpQkFBaUIsR0FBRyxPQUFPLENBQUM7QUFFbEMsU0FBUyxZQUFZLENBQUMsR0FBUSxFQUFFLE9BQWlCO0lBRWhELHNCQUFzQjtJQUN0QixJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sSUFBSSxPQUFPLEVBQUUsQ0FBQztRQUM1QixNQUFNLElBQUksS0FBSyxDQUFDLDJEQUEyRCxHQUFHLENBQUMsU0FBUyxhQUFhLEdBQUcsQ0FBQyxJQUFJLGNBQWMsR0FBRyxDQUFDLEtBQUssaUJBQWlCLEdBQUcsQ0FBQyxRQUFRLElBQUksQ0FBQyxDQUFDO0lBQ3hLLENBQUM7SUFFRCwwREFBMEQ7SUFDMUQsNkNBQTZDO0lBQzdDLElBQUksR0FBRyxDQUFDLE1BQU0sSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7UUFDcEQsTUFBTSxPQUFPLEdBQUcsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUM7UUFDekQsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLE1BQU0sR0FBRyxDQUFDO1lBQ2hDLENBQUMsQ0FBQyxXQUFXLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsY0FBYyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxL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