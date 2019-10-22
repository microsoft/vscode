/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isWindows } from 'vs/base/common/platform';
import { CharCode } from 'vs/base/common/charCode';
import { isHighSurrogate, isLowSurrogate } from 'vs/base/common/strings';

const _schemePattern = /^\w[\w\d+.-]*$/;
const _singleSlashStart = /^\//;
const _doubleSlashStart = /^\/\//;

function _validateUri(ret: URI): void {

	// scheme, must be set
	if (!ret.scheme) {
		throw new Error(`[UriError]: Scheme is missing: {scheme: "", authority: "${ret.authority}", path: "${ret.path}", query: "${ret.query}", fragment: "${ret.fragment}"}`);
	}

	// scheme, https://tools.ietf.org/html/rfc3986#section-3.1
	// ALPHA *( ALPHA / DIGIT / "+" / "-" / "." )
	if (ret.scheme && !_schemePattern.test(ret.scheme)) {
		throw new Error('[UriError]: Scheme contains illegal characters.');
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
		} else {
			if (_doubleSlashStart.test(ret.path)) {
				throw new Error('[UriError]: If a URI does not contain an authority component, then the path cannot begin with two slash characters ("//")');
			}
		}
	}
}

// graceful behaviour when scheme is missing: fallback to using 'file'-scheme
function _schemeFix(scheme: string): string {
	if (!scheme) {
		console.trace('BAD uri lacks scheme, falling back to file-scheme.');
		scheme = 'file';
	}
	return scheme;
}

// implements a bit of https://tools.ietf.org/html/rfc3986#section-5
function _referenceResolution(scheme: string, path: string): string {

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
			} else if (path[0] !== _slash) {
				path = _slash + path;
			}
			break;
	}
	return path;
}

const _empty = '';
const _slash = '/';

const _regexp = /^(([^:/?#]+?):)?(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?/;

const enum MatchIndex {
	scheme = 2,
	authority = 4,
	path = 5,
	query = 7,
	fragment = 9
}

/**
 * Uniform Resource Identifier (URI) http://tools.ietf.org/html/rfc3986.
 * This class is a simple parser which creates the basic component parts
 * (http://tools.ietf.org/html/rfc3986#section-3) with minimal validation
 * and encoding.
 *
 *       foo://example.com:8042/over/there?name=ferret#nose
 *       \_/   \______________/\_________/ \_________/ \__/
 *        |           |            |            |        |
 *     scheme     authority       path        query   fragment
 *        |   _____________________|__
 *       / \ /                        \
 *       urn:example:animal:ferret:nose
 */
export class URI implements UriComponents {

	static isUri(thing: any): thing is URI {
		if (thing instanceof URI) {
			return true;
		}
		if (!thing) {
			return false;
		}
		return typeof (<URI>thing).authority === 'string'
			&& typeof (<URI>thing).fragment === 'string'
			&& typeof (<URI>thing).path === 'string'
			&& typeof (<URI>thing).query === 'string'
			&& typeof (<URI>thing).scheme === 'string'
			&& typeof (<URI>thing).fsPath === 'function'
			&& typeof (<URI>thing).with === 'function'
			&& typeof (<URI>thing).toString === 'function';
	}

	/**
	 * scheme is the 'http' part of 'http://www.msft.com/some/path?query#fragment'.
	 * The part before the first colon.
	 */
	readonly scheme: string;

	/**
	 * authority is the 'www.msft.com' part of 'http://www.msft.com/some/path?query#fragment'.
	 * The part between the first double slashes and the next slash.
	 */
	readonly authority: string;

	/**
	 * path is the '/some/path' part of 'http://www.msft.com/some/path?query#fragment'.
	 */
	readonly path: string;

	/**
	 * query is the 'query' part of 'http://www.msft.com/some/path?query#fragment'.
	 */
	readonly query: string;

	/**
	 * fragment is the 'fragment' part of 'http://www.msft.com/some/path?query#fragment'.
	 */
	readonly fragment: string;

	/**
	 * @internal
	 */
	protected constructor(scheme: string, authority?: string, path?: string, query?: string, fragment?: string);

	/**
	 * @internal
	 */
	protected constructor(components: UriComponents);

	/**
	 * @internal
	 */
	protected constructor(schemeOrData: string | UriComponents, authority?: string, path?: string, query?: string, fragment?: string) {

		if (typeof schemeOrData === 'object') {
			this.scheme = schemeOrData.scheme || _empty;
			this.authority = schemeOrData.authority || _empty;
			this.path = schemeOrData.path || _empty;
			this.query = schemeOrData.query || _empty;
			this.fragment = schemeOrData.fragment || _empty;
			// no validation because it's this URI
			// that creates uri components.
			// _validateUri(this);
		} else {
			this.scheme = _schemeFix(schemeOrData);
			this.authority = authority || _empty;
			this.path = _referenceResolution(this.scheme, path || _empty);
			this.query = query || _empty;
			this.fragment = fragment || _empty;

			_validateUri(this);
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
	get fsPath(): string {
		// if (this.scheme !== 'file') {
		// 	console.warn(`[UriError] calling fsPath with scheme ${this.scheme}`);
		// }
		return _makeFsPath(this);
	}

	// ---- modify to new -------------------------

	with(change: { scheme?: string; authority?: string | null; path?: string | null; query?: string | null; fragment?: string | null; }): URI {

		if (!change) {
			return this;
		}

		let { scheme, authority, path, query, fragment } = change;
		if (scheme === undefined) {
			scheme = this.scheme;
		} else if (scheme === null) {
			scheme = _empty;
		}
		if (authority === undefined) {
			authority = this.authority;
		} else if (authority === null) {
			authority = _empty;
		}
		if (path === undefined) {
			path = this.path;
		} else if (path === null) {
			path = _empty;
		}
		if (query === undefined) {
			query = this.query;
		} else if (query === null) {
			query = _empty;
		}
		if (fragment === undefined) {
			fragment = this.fragment;
		} else if (fragment === null) {
			fragment = _empty;
		}

		if (scheme === this.scheme
			&& authority === this.authority
			&& path === this.path
			&& query === this.query
			&& fragment === this.fragment) {

			return this;
		}

		return new _URI(scheme, authority, path, query, fragment);
	}

	// ---- parse & validate ------------------------

	/**
	 * Creates a new URI from a string, e.g. `http://www.msft.com/some/path`,
	 * `file:///usr/home`, or `scheme:with/path`.
	 *
	 * @param value A string which represents an URI (see `URI#toString`).
	 */
	static parse(value: string): URI {
		const match = _regexp.exec(value);
		if (!match) {
			throw new Error(`[UriError]: Invalid input: ${value}`);
		}

		const scheme = _schemeFix(match[MatchIndex.scheme]) || _empty;
		const authority = match[MatchIndex.authority] || _empty;
		const path = _referenceResolution(scheme, match[MatchIndex.path] || _empty);
		const query = match[MatchIndex.query] || _empty;
		const fragment = match[MatchIndex.fragment] || _empty;

		const result = new _URI(
			scheme,
			percentDecode(authority),
			percentDecode(path),
			percentDecode(query),
			percentDecode(fragment),
		);
		result._formatted = _toString(normalEncode, scheme, authority, path, query, fragment);
		return result;
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
	static file(path: string): URI {

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
			} else {
				authority = path.substring(2, idx);
				path = path.substring(idx) || _slash;
			}
		}

		if (path.charAt(0) !== _slash) {
			path = _slash + path;
		}

		// escape some vital characters
		authority = authority.replace(/%/g, '%25');
		path = path.replace(/%/g, '%25');

		if (!isWindows) {
			path = path.replace(/\\/g, '%5C');
		}

		return URI.parse('file://' + authority + path);
	}

	static from(components: { scheme: string; authority?: string; path?: string; query?: string; fragment?: string; }): URI {
		return new _URI(
			components.scheme,
			components.authority,
			components.path,
			components.query,
			components.fragment,
		);
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
	toString(skipEncoding: boolean = false): string {
		return _toString(skipEncoding ? minialEncode : normalEncode, this.scheme, this.authority, this.path, this.query, this.fragment);
	}

	toJSON(): UriComponents {
		return this;
	}

	static revive(data: UriComponents | URI): URI;
	static revive(data: UriComponents | URI | undefined): URI | undefined;
	static revive(data: UriComponents | URI | null): URI | null;
	static revive(data: UriComponents | URI | undefined | null): URI | undefined | null;
	static revive(data: UriComponents | URI | undefined | null): URI | undefined | null {
		if (!data) {
			return data;
		} else if (data instanceof URI) {
			return data;
		} else {
			const result = new _URI(data);
			result._formatted = (<UriState>data).external;
			result._fsPath = (<UriState>data)._sep === _pathSepMarker ? (<UriState>data).fsPath : null;
			return result;
		}
	}
}

export interface UriComponents {
	scheme: string;
	authority: string;
	path: string;
	query: string;
	fragment: string;
}

interface UriState extends UriComponents {
	$mid: number;
	external: string;
	fsPath: string;
	_sep: 1 | undefined;
}

const _pathSepMarker = isWindows ? 1 : undefined;

// tslint:disable-next-line:class-name
class _URI extends URI {

	_formatted: string | null = null;
	_fsPath: string | null = null;

	get fsPath(): string {
		if (!this._fsPath) {
			this._fsPath = _makeFsPath(this);
		}
		return this._fsPath;
	}

	toString(skipEncoding: boolean = false): string {
		if (skipEncoding) {
			// we don't cache that
			return _toString(minialEncode, this.scheme, this.authority, this.path, this.query, this.fragment);
		}
		if (!this._formatted) {
			this._formatted = _toString(normalEncode, this.scheme, this.authority, this.path, this.query, this.fragment);
		}
		return this._formatted;
	}

	toJSON(): UriComponents {
		const res = <UriState>{
			$mid: 1
		};
		// cached state
		if (this._fsPath) {
			res.fsPath = this._fsPath;
			res._sep = _pathSepMarker;
		}
		if (this._formatted) {
			res.external = this._formatted;
		}
		// uri components
		if (this.path) {
			res.path = this.path;
		}
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

/**
 * Compute `fsPath` for the given uri
 */
function _makeFsPath(uri: URI): string {

	let value: string;
	if (uri.authority && uri.path.length > 1 && uri.scheme === 'file') {
		// unc path: file://shares/c$/far/boo
		value = `//${uri.authority}${uri.path}`;
	} else if (
		uri.path.charCodeAt(0) === CharCode.Slash
		&& (uri.path.charCodeAt(1) >= CharCode.A && uri.path.charCodeAt(1) <= CharCode.Z || uri.path.charCodeAt(1) >= CharCode.a && uri.path.charCodeAt(1) <= CharCode.z)
		&& uri.path.charCodeAt(2) === CharCode.Colon
	) {
		// windows drive letter: file:///c:/far/boo
		value = uri.path[1].toLowerCase() + uri.path.substr(2);
	} else {
		// other path
		value = uri.path;
	}
	if (isWindows) {
		value = value.replace(/\//g, '\\');
	}
	return value;
}


//#region ---- decode

function decodeURIComponentGraceful(str: string): string {
	try {
		return decodeURIComponent(str);
	} catch {
		if (str.length > 3) {
			return str.substr(0, 3) + decodeURIComponentGraceful(str.substr(3));
		} else {
			return str;
		}
	}
}

const _hex2 = /(%[0-9A-Za-z][0-9A-Za-z])+/g;
function percentDecode(str: string): string {
	if (!str.match(_hex2)) {
		return str;
	}
	return str.replace(_hex2, (match) => decodeURIComponentGraceful(match));
}

//#endregion

//#region ---- encode

// https://url.spec.whatwg.org/#percent-encoded-bytes
// "The C0 control percent-encode set are the C0 controls and all code points greater than U+007E (~)."

function isC0ControlPercentEncodeSet(code: number): boolean {
	return code <= 0x1F || code > 0x7E;
}
// "The fragment percent-encode set is the C0 control percent-encode set and U+0020 SPACE, U+0022 ("), U+003C (<), U+003E (>), and U+0060 (`)."
function isFragmentPercentEncodeSet(code: number): boolean {
	return isC0ControlPercentEncodeSet(code)
		|| code === 0x20 || code === 0x22 || code === 0x3C || code === 0x3E || code === 0x60;
}
// "The path percent-encode set is the fragment percent-encode set and U+0023 (#), U+003F (?), U+007B ({), and U+007D (})."
function isPathPercentEncodeSet(code: number): boolean {
	return isFragmentPercentEncodeSet(code)
		|| code === 0x23 || code === 0x3F || code === 0x7B || code === 0x7D;
}
// "The userinfo percent-encode set is the path percent-encode set and U+002F (/), U+003A (:), U+003B (;), U+003D (=), U+0040 (@), U+005B ([), U+005C (\), U+005D (]), U+005E (^), and U+007C (|)."
function isUserInfoPercentEncodeSet(code: number): boolean {
	return isPathPercentEncodeSet(code)
		|| code === 0x2F || code === 0x3A || code === 0x3B || code === 0x3D || code === 0x40
		|| code === 0x5B || code === 0x5C || code === 0x5D || code === 0x5E || code === 0x7C;
}

// https://url.spec.whatwg.org/#query-state
function isQueryPrecentEncodeSet(code: number): boolean {
	return code < 0x21 || code > 0x7E
		|| code === 0x22 || code === 0x23 || code === 0x3C || code === 0x3E
		|| code === 0x27; // <- todo@joh https://url.spec.whatwg.org/#is-special
}

// this is non-standard and uses for `URI.toString(true)`
function isHashOrQuestionMark(code: number): boolean {
	return code === CharCode.Hash || code === CharCode.QuestionMark;
}

function isLowerAsciiHex(code: number): boolean {
	return code >= CharCode.Digit0 && code <= CharCode.Digit9
		|| code >= CharCode.a && code <= CharCode.z;
}

function percentEncode(str: string, mustEncode: (code: number) => boolean): string {
	let lazyOutStr: string | undefined;
	for (let i = 0; i < str.length; i++) {
		const code = str.charCodeAt(i);

		// invoke encodeURIComponent when needed
		if (mustEncode(code)) {
			if (!lazyOutStr) {
				lazyOutStr = str.substr(0, i);
			}
			//
			if (isHighSurrogate(code)) {
				if (i + 1 < str.length && isLowSurrogate(str.charCodeAt(i + 1))) {
					lazyOutStr += encodeURIComponent(str.substr(i, 2));
					i += 1;
				} else {
					// broken surrogate pair
					lazyOutStr += str.charAt(i);
				}
			} else {
				// todo@joh PERF, use lookup table
				lazyOutStr += encodeURIComponent(str.charAt(i));
			}
			continue;
		}

		// normalize percent encoded sequences to upper case
		// todo@joh also changes invalid sequences
		if (code === CharCode.PercentSign
			&& i + 2 < str.length
			&& (isLowerAsciiHex(str.charCodeAt(i + 1)) || isLowerAsciiHex(str.charCodeAt(i + 2)))
		) {
			if (!lazyOutStr) {
				lazyOutStr = str.substr(0, i);
			}
			lazyOutStr += '%' + str.substr(i + 1, 2).toUpperCase();
			i += 2;
			continue;
		}

		// once started, continue to build up lazy output
		if (lazyOutStr) {
			lazyOutStr += str.charAt(i);
		}
	}
	return lazyOutStr || str;
}

const enum EncodePart {
	user, authority, path, query, fragment
}
const normalEncode: { (code: number): boolean }[] = [isUserInfoPercentEncodeSet, isC0ControlPercentEncodeSet, isPathPercentEncodeSet, isFragmentPercentEncodeSet, isQueryPrecentEncodeSet];
const minialEncode: { (code: number): boolean }[] = [isHashOrQuestionMark, isHashOrQuestionMark, isHashOrQuestionMark, isHashOrQuestionMark, () => false];

/**
 * Create the external version of a uri
 */
function _toString(encoder: { (code: number): boolean }[], scheme: string, authority: string, path: string, query: string, fragment: string): string {

	let res = '';
	if (scheme) {
		res += scheme;
		res += ':';
	}
	if (authority || scheme === 'file') {
		res += _slash;
		res += _slash;
	}
	if (authority) {
		const idxUserInfo = authority.indexOf('@');
		if (idxUserInfo !== -1) {
			// <user:token>
			const userInfo = authority.substr(0, idxUserInfo);
			const idxPasswordOrToken = userInfo.indexOf(':');
			if (idxPasswordOrToken !== -1) {
				res += percentEncode(userInfo.substr(0, idxPasswordOrToken), encoder[EncodePart.user]);
				res += ':';
				res += percentEncode(userInfo.substr(idxPasswordOrToken + 1), encoder[EncodePart.user]);
			} else {
				res += percentEncode(userInfo, encoder[EncodePart.user]);
			}
			res += '@';
		}
		authority = authority.substr(idxUserInfo + 1).toLowerCase();
		const idxPort = authority.indexOf(':');
		if (idxPort !== -1) {
			// <authority>:<port>
			res += percentEncode(authority.substr(0, idxPort), encoder[EncodePart.authority]);
			res += ':';
		}
		res += percentEncode(authority.substr(idxPort + 1), encoder[EncodePart.authority]);
	}
	if (path) {
		// encode the path
		let pathEncoded = percentEncode(path, encoder[EncodePart.path]);

		// lower-case windows drive letters in /C:/fff or C:/fff and escape `:`

		let match = /(\/?[a-zA-Z]):/.exec(pathEncoded); // <- todo@joh make fast!
		if (match) {
			pathEncoded = match[1].toLowerCase() + '%3A' + pathEncoded.substr(match[0].length);
		}
		res += pathEncoded;
	}
	if (query) {
		res += '?';
		res += percentEncode(query, encoder[EncodePart.query]);
	}
	if (fragment) {
		res += '#';
		res += percentEncode(fragment, encoder[EncodePart.fragment]);
	}
	return res;
}

//#endregion
