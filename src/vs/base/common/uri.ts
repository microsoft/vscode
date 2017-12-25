/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as platform from 'vs/base/common/platform';


function _encode(ch: string): string {
	return '%' + ch.charCodeAt(0).toString(16).toUpperCase();
}

// see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent
function encodeURIComponent2(str: string): string {
	return encodeURIComponent(str).replace(/[!'()*]/g, _encode);
}

function encodeNoop(str: string): string {
	return str.replace(/[#?]/, _encode);
}


const _schemePattern = /^\w[\w\d+.-]*$/;
const _singleSlashStart = /^\//;
const _doubleSlashStart = /^\/\//;

function _validateUri(ret: URI): void {
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

const _empty = '';
const _slash = '/';
const _regexp = /^(([^:/?#]+?):)?(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?/;
const _driveLetterPath = /^\/[a-zA-Z]:/;
const _upperCaseDrive = /^(\/)?([A-Z]:)/;
const _driveLetter = /^[a-zA-Z]:/;

/**
 * Uniform Resource Identifier (URI) http://tools.ietf.org/html/rfc3986.
 * This class is a simple parser which creates the basic component paths
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
 *
 *
 */
export default class URI implements UriComponents {

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
			&& typeof (<URI>thing).scheme === 'string';
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
	protected constructor(scheme: string, authority: string, path: string, query: string, fragment: string);

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
			this.scheme = schemeOrData || _empty;
			this.authority = authority || _empty;
			this.path = path || _empty;
			this.query = query || _empty;
			this.fragment = fragment || _empty;
			_validateUri(this);
		}
	}

	// ---- filesystem path -----------------------

	/**
	 * Returns a string representing the corresponding file system path of this URI.
	 * Will handle UNC paths and normalize windows drive letters to lower-case. Also
	 * uses the platform specific path separator. Will *not* validate the path for
	 * invalid characters and semantics. Will *not* look at the scheme of this URI.
	 */
	get fsPath(): string {
		return _makeFsPath(this);
	}

	// ---- modify to new -------------------------

	public with(change: { scheme?: string; authority?: string; path?: string; query?: string; fragment?: string }): URI {

		if (!change) {
			return this;
		}

		let { scheme, authority, path, query, fragment } = change;
		if (scheme === void 0) {
			scheme = this.scheme;
		} else if (scheme === null) {
			scheme = _empty;
		}
		if (authority === void 0) {
			authority = this.authority;
		} else if (authority === null) {
			authority = _empty;
		}
		if (path === void 0) {
			path = this.path;
		} else if (path === null) {
			path = _empty;
		}
		if (query === void 0) {
			query = this.query;
		} else if (query === null) {
			query = _empty;
		}
		if (fragment === void 0) {
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

	public static parse(value: string): URI {
		const match = _regexp.exec(value);
		if (!match) {
			return new _URI(_empty, _empty, _empty, _empty, _empty);
		}
		return new _URI(
			match[2] || _empty,
			decodeURIComponent(match[4] || _empty),
			decodeURIComponent(match[5] || _empty),
			decodeURIComponent(match[7] || _empty),
			decodeURIComponent(match[9] || _empty),
		);
	}

	public static file(path: string): URI {

		let authority = _empty;

		// normalize to fwd-slashes on windows,
		// on other systems bwd-slashes are valid
		// filename character, eg /f\oo/ba\r.txt
		if (platform.isWindows) {
			path = path.replace(/\\/g, _slash);
		}

		// check for authority as used in UNC shares
		// or use the path as given
		if (path[0] === _slash && path[1] === _slash) {
			let idx = path.indexOf(_slash, 2);
			if (idx === -1) {
				authority = path.substring(2);
				path = _slash;
			} else {
				authority = path.substring(2, idx);
				path = path.substring(idx) || _slash;
			}
		}

		// Ensure that path starts with a slash
		// or that it is at least a slash
		if (_driveLetter.test(path)) {
			path = _slash + path;

		} else if (path[0] !== _slash) {
			// tricky -> makes invalid paths
			// but otherwise we have to stop
			// allowing relative paths...
			path = _slash + path;
		}

		return new _URI('file', authority, path, _empty, _empty);
	}

	public static from(components: { scheme?: string; authority?: string; path?: string; query?: string; fragment?: string }): URI {
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
	 *
	 * @param skipEncoding Do not encode the result, default is `false`
	 */
	public toString(skipEncoding: boolean = false): string {
		return _asFormatted(this, skipEncoding);
	}

	public toJSON(): object {
		const res = <UriState>{
			$mid: 1,
			fsPath: this.fsPath,
			external: this.toString(),
		};

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

	static revive(data: UriComponents | any): URI {
		if (!data) {
			return data;
		} else if (data instanceof URI) {
			return data;
		} else {
			let result = new _URI(data);
			result._fsPath = (<UriState>data).fsPath;
			result._formatted = (<UriState>data).external;
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
	fsPath: string;
	external: string;
}


// tslint:disable-next-line:class-name
class _URI extends URI {

	_formatted: string = null;
	_fsPath: string = null;

	get fsPath(): string {
		if (!this._fsPath) {
			this._fsPath = _makeFsPath(this);
		}
		return this._fsPath;
	}

	public toString(skipEncoding: boolean = false): string {
		if (!skipEncoding) {
			if (!this._formatted) {
				this._formatted = _asFormatted(this, false);
			}
			return this._formatted;
		} else {
			// we don't cache that
			return _asFormatted(this, true);
		}
	}
}


/**
 * Compute `fsPath` for the given uri
 * @param uri
 */
function _makeFsPath(uri: URI): string {

	let value: string;
	if (uri.authority && uri.path && uri.scheme === 'file') {
		// unc path: file://shares/c$/far/boo
		value = `//${uri.authority}${uri.path}`;
	} else if (_driveLetterPath.test(uri.path)) {
		// windows drive letter: file:///c:/far/boo
		value = uri.path[1].toLowerCase() + uri.path.substr(2);
	} else {
		// other path
		value = uri.path;
	}
	if (platform.isWindows) {
		value = value.replace(/\//g, '\\');
	}
	return value;
}

/**
 * Create the external version of a uri
 */
function _asFormatted(uri: URI, skipEncoding: boolean): string {

	const encoder = !skipEncoding
		? encodeURIComponent2
		: encodeNoop;

	const parts: string[] = [];

	let { scheme, authority, path, query, fragment } = uri;
	if (scheme) {
		parts.push(scheme, ':');
	}
	if (authority || scheme === 'file') {
		parts.push('//');
	}
	if (authority) {
		let idx = authority.indexOf('@');
		if (idx !== -1) {
			const userinfo = authority.substr(0, idx);
			authority = authority.substr(idx + 1);
			idx = userinfo.indexOf(':');
			if (idx === -1) {
				parts.push(encoder(userinfo));
			} else {
				parts.push(encoder(userinfo.substr(0, idx)), ':', encoder(userinfo.substr(idx + 1)));
			}
			parts.push('@');
		}
		authority = authority.toLowerCase();
		idx = authority.indexOf(':');
		if (idx === -1) {
			parts.push(encoder(authority));
		} else {
			parts.push(encoder(authority.substr(0, idx)), authority.substr(idx));
		}
	}
	if (path) {
		// lower-case windows drive letters in /C:/fff or C:/fff
		const m = _upperCaseDrive.exec(path);
		if (m) {
			if (m[1]) {
				path = '/' + m[2].toLowerCase() + path.substr(3); // "/c:".length === 3
			} else {
				path = m[2].toLowerCase() + path.substr(2); // // "c:".length === 2
			}
		}

		// encode every segement but not slashes
		// make sure that # and ? are always encoded
		// when occurring in paths - otherwise the result
		// cannot be parsed back again
		let lastIdx = 0;
		while (true) {
			let idx = path.indexOf(_slash, lastIdx);
			if (idx === -1) {
				parts.push(encoder(path.substring(lastIdx)));
				break;
			}
			parts.push(encoder(path.substring(lastIdx, idx)), _slash);
			lastIdx = idx + 1;
		}
	}
	if (query) {
		parts.push('?', encoder(query));
	}
	if (fragment) {
		parts.push('#', encoder(fragment));
	}

	return parts.join(_empty);
}
