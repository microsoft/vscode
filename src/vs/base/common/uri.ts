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
export default class URI {

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

	private static _empty = '';
	private static _slash = '/';
	private static _regexp = /^(([^:/?#]+?):)?(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?/;
	private static _driveLetterPath = /^\/[a-zA-Z]:/;
	private static _upperCaseDrive = /^(\/)?([A-Z]:)/;

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

	private _formatted: string = null;
	private _fsPath: string = null;

	/**
	 * @internal
	 */
	private constructor(scheme: string, authority: string, path: string, query: string, fragment: string) {

		this.scheme = scheme || URI._empty;
		this.authority = authority || URI._empty;
		this.path = path || URI._empty;
		this.query = query || URI._empty;
		this.fragment = fragment || URI._empty;

		this._validate(this);
	}

	// ---- filesystem path -----------------------

	/**
	 * Returns a string representing the corresponding file system path of this URI.
	 * Will handle UNC paths and normalize windows drive letters to lower-case. Also
	 * uses the platform specific path separator. Will *not* validate the path for
	 * invalid characters and semantics. Will *not* look at the scheme of this URI.
	 */
	get fsPath(): string {
		if (!this._fsPath) {
			let value: string;
			if (this.authority && this.path && this.scheme === 'file') {
				// unc path: file://shares/c$/far/boo
				value = `//${this.authority}${this.path}`;
			} else if (URI._driveLetterPath.test(this.path)) {
				// windows drive letter: file:///c:/far/boo
				value = this.path[1].toLowerCase() + this.path.substr(2);
			} else {
				// other path
				value = this.path;
			}
			if (platform.isWindows) {
				value = value.replace(/\//g, '\\');
			}
			this._fsPath = value;
		}
		return this._fsPath;
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
			scheme = '';
		}
		if (authority === void 0) {
			authority = this.authority;
		} else if (authority === null) {
			authority = '';
		}
		if (path === void 0) {
			path = this.path;
		} else if (path === null) {
			path = '';
		}
		if (query === void 0) {
			query = this.query;
		} else if (query === null) {
			query = '';
		}
		if (fragment === void 0) {
			fragment = this.fragment;
		} else if (fragment === null) {
			fragment = '';
		}

		if (scheme === this.scheme
			&& authority === this.authority
			&& path === this.path
			&& query === this.query
			&& fragment === this.fragment) {

			return this;
		}

		return new URI(scheme, authority, path, query, fragment);
	}

	// ---- parse & validate ------------------------

	public static parse(value: string): URI {
		const match = URI._regexp.exec(value);
		if (!match) {
			return new URI(URI._empty, URI._empty, URI._empty, URI._empty, URI._empty);
		}
		return new URI(
			match[2] || URI._empty,
			decodeURIComponent(match[4] || URI._empty),
			decodeURIComponent(match[5] || URI._empty),
			decodeURIComponent(match[7] || URI._empty),
			decodeURIComponent(match[9] || URI._empty),
		);
	}

	public static file(path: string): URI {

		let authority = URI._empty;

		// normalize to fwd-slashes on windows,
		// on other systems bwd-slashes are valid
		// filename character, eg /f\oo/ba\r.txt
		if (platform.isWindows) {
			path = path.replace(/\\/g, URI._slash);
		}

		// check for authority as used in UNC shares
		// or use the path as given
		if (path[0] === URI._slash && path[0] === path[1]) {
			let idx = path.indexOf(URI._slash, 2);
			if (idx === -1) {
				authority = path.substring(2);
				path = URI._empty;
			} else {
				authority = path.substring(2, idx);
				path = path.substring(idx);
			}
		}

		// Ensure that path starts with a slash
		// or that it is at least a slash
		if (path[0] !== URI._slash) {
			path = URI._slash + path;
		}

		return new URI('file', authority, path, URI._empty, URI._empty);
	}

	public static from(components: { scheme?: string; authority?: string; path?: string; query?: string; fragment?: string }): URI {
		return new URI(
			components.scheme,
			components.authority,
			components.path,
			components.query,
			components.fragment,
		);
	}

	private static _schemePattern = /^\w[\w\d+.-]*$/;
	private static _singleSlashStart = /^\//;
	private static _doubleSlashStart = /^\/\//;

	private _validate(ret: URI): void {
		// scheme, https://tools.ietf.org/html/rfc3986#section-3.1
		// ALPHA *( ALPHA / DIGIT / "+" / "-" / "." )
		if (ret.scheme && !URI._schemePattern.test(ret.scheme)) {
			throw new Error('[UriError]: Scheme contains illegal characters.');
		}

		// path, http://tools.ietf.org/html/rfc3986#section-3.3
		// If a URI contains an authority component, then the path component
		// must either be empty or begin with a slash ("/") character.  If a URI
		// does not contain an authority component, then the path cannot begin
		// with two slash characters ("//").
		if (ret.path) {
			if (ret.authority) {
				if (!URI._singleSlashStart.test(ret.path)) {
					throw new Error('[UriError]: If a URI contains an authority component, then the path component must either be empty or begin with a slash ("/") character');
				}
			} else {
				if (URI._doubleSlashStart.test(ret.path)) {
					throw new Error('[UriError]: If a URI does not contain an authority component, then the path cannot begin with two slash characters ("//")');
				}
			}
		}
	}

	// ---- printing/externalize ---------------------------

	/**
	 *
	 * @param skipEncoding Do not encode the result, default is `false`
	 */
	public toString(skipEncoding: boolean = false): string {
		if (!skipEncoding) {
			if (!this._formatted) {
				this._formatted = URI._asFormatted(this, false);
			}
			return this._formatted;
		} else {
			// we don't cache that
			return URI._asFormatted(this, true);
		}
	}

	private static _asFormatted(uri: URI, skipEncoding: boolean): string {

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
			authority = authority.toLowerCase();
			let idx = authority.indexOf(':');
			if (idx === -1) {
				parts.push(encoder(authority));
			} else {
				parts.push(encoder(authority.substr(0, idx)), authority.substr(idx));
			}
		}
		if (path) {
			// lower-case windows drive letters in /C:/fff or C:/fff
			const m = URI._upperCaseDrive.exec(path);
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
				let idx = path.indexOf(URI._slash, lastIdx);
				if (idx === -1) {
					parts.push(encoder(path.substring(lastIdx)));
					break;
				}
				parts.push(encoder(path.substring(lastIdx, idx)), URI._slash);
				lastIdx = idx + 1;
			};
		}
		if (query) {
			parts.push('?', encoder(query));
		}
		if (fragment) {
			parts.push('#', encoder(fragment));
		}

		return parts.join(URI._empty);
	}

	public toJSON(): any {
		const res = <UriState>{
			fsPath: this.fsPath,
			external: this.toString(),
			$mid: 1
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

	static revive(data: any): URI {
		let result = new URI(
			(<UriState>data).scheme,
			(<UriState>data).authority,
			(<UriState>data).path,
			(<UriState>data).query,
			(<UriState>data).fragment
		);
		result._fsPath = (<UriState>data).fsPath;
		result._formatted = (<UriState>data).external;
		return result;
	}
}

interface UriComponents {
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
