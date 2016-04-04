/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

// see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent
function fixedEncodeURIComponent(str: string): string {
	return encodeURIComponent(str).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
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

	private static _empty = '';
	private static _regexp = /^(([^:/?#]+?):)?(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?/;
	private static _driveLetterPath = /^\/[a-zA-z]:/;
	private static _driveLetter = /^[a-zA-z]:/;

	private _scheme: string;
	private _authority: string;
	private _path: string;
	private _query: string;
	private _fragment: string;

	constructor() {
		this._scheme = URI._empty;
		this._authority = URI._empty;
		this._path = URI._empty;
		this._query = URI._empty;
		this._fragment = URI._empty;
	}

	/**
	 * scheme is the 'http' part of 'http://www.msft.com/some/path?query#fragment'.
	 * The part before the first colon.
	 */
	get scheme() {
		return this._scheme;
	}

	/**
	 * authority is the 'www.msft.com' part of 'http://www.msft.com/some/path?query#fragment'.
	 * The part between the first double slashes and the next slash.
	 */
	get authority() {
		return this._authority;
	}

	/**
	 * path is the '/some/path' part of 'http://www.msft.com/some/path?query#fragment'.
	 */
	get path() {
		return this._path;
	}

	/**
	 * query is the 'query' part of 'http://www.msft.com/some/path?query#fragment'.
	 */
	get query() {
		return this._query;
	}

	/**
	 * fragment is the 'fragment' part of 'http://www.msft.com/some/path?query#fragment'.
	 */
	get fragment() {
		return this._fragment;
	}

	// ---- filesystem path -----------------------

	private _fsPath: string;

	/**
	 * Returns a string representing the corresponding file system path of this URI.
	 * Will handle UNC paths and normalize windows drive letters to lower-case. Also
	 * uses the platform specific path separator. Will *not* validate the path for
	 * invalid characters and semantics. Will *not* look at the scheme of this URI.
	 */
	get fsPath() {
		if (!this._fsPath) {
			var value: string;
			if (this._authority && this.scheme === 'file') {
				// unc path: file://shares/c$/far/boo
				value = `//${this._authority}${this._path}`;
			} else if (URI._driveLetterPath.test(this._path)) {
				// windows drive letter: file:///c:/far/boo
				value = this._path[1].toLowerCase() + this._path.substr(2);
			} else {
				// other path
				value = this._path;
			}
			if (process.platform === 'win32') {
				value = value.replace(/\//g, '\\');
			}
			this._fsPath = value;
		}
		return this._fsPath;
	}

	// ---- modify to new -------------------------

	public with(scheme: string, authority: string, path: string, query: string, fragment: string): URI {
		var ret = new URI();
		ret._scheme = scheme || this.scheme;
		ret._authority = authority || this.authority;
		ret._path = path || this.path;
		ret._query = query || this.query;
		ret._fragment = fragment || this.fragment;
		URI._validate(ret);
		return ret;
	}

	public withScheme(value: string): URI {
		return this.with(value, undefined, undefined, undefined, undefined);
	}

	public withAuthority(value: string): URI {
		return this.with(undefined, value, undefined, undefined, undefined);
	}

	public withPath(value: string): URI {
		return this.with(undefined, undefined, value, undefined, undefined);
	}

	public withQuery(value: string): URI {
		return this.with(undefined, undefined, undefined, value, undefined);
	}

	public withFragment(value: string): URI {
		return this.with(undefined, undefined, undefined, undefined, value);
	}

	// ---- parse & validate ------------------------

	public static parse(value: string): URI {
		var ret = URI._parse(value);
		ret = ret.with(undefined,
			decodeURIComponent(ret.authority),
			decodeURIComponent(ret.path),
			decodeURIComponent(ret.query),
			decodeURIComponent(ret.fragment));

		return ret;
	}

	public static file(path: string): URI {
		path = path.replace(/\\/g, '/');
		path = path.replace(/%/g, '%25');
		path = path.replace(/#/g, '%23');
		path = path.replace(/\?/g, '%3F');
		path = URI._driveLetter.test(path)
			? '/' + path
			: path;

		var ret = URI._parse(path);
		if (ret.scheme || ret.fragment || ret.query) {
			throw new Error('Path contains a scheme, fragment or a query. Can not convert it to a file uri.');
		}

		ret = ret.with('file', undefined,
			decodeURIComponent(ret.path),
			undefined, undefined);

		return ret;
	}

	private static _parse(value: string): URI {
		var ret = new URI();
		var match = URI._regexp.exec(value);
		if (match) {
			ret._scheme = match[2] || ret._scheme;
			ret._authority = match[4] || ret._authority;
			ret._path = match[5] || ret._path;
			ret._query = match[7] || ret._query;
			ret._fragment = match[9] || ret._fragment;
		}
		URI._validate(ret);
		return ret;
	}

	public static create(scheme?: string, authority?: string, path?: string, query?: string, fragment?: string): URI {
		return new URI().with(scheme, authority, path, query, fragment);
	}

	private static _validate(ret: URI): void {

		// validation
		// path, http://tools.ietf.org/html/rfc3986#section-3.3
		// If a URI contains an authority component, then the path component
		// must either be empty or begin with a slash ("/") character.  If a URI
		// does not contain an authority component, then the path cannot begin
		// with two slash characters ("//").
		if (ret.authority && ret.path && ret.path[0] !== '/') {
			throw new Error('[UriError]: If a URI contains an authority component, then the path component must either be empty or begin with a slash ("/") character');
		}
		if (!ret.authority && ret.path.indexOf('//') === 0) {
			throw new Error('[UriError]: If a URI does not contain an authority component, then the path cannot begin with two slash characters ("//")');
		}
	}

	// ---- printing/externalize ---------------------------

	private _formatted: string;

	public toString(): string {
		if (!this._formatted) {
			var parts: string[] = [];

			if (this._scheme) {
				parts.push(this._scheme);
				parts.push(':');
			}
			if (this._authority || this._scheme === 'file') {
				parts.push('//');
			}
			if (this._authority) {
				var authority = this._authority,
					idx: number;

				authority = authority.toLowerCase();
				idx = authority.indexOf(':');
				if (idx === -1) {
					parts.push(fixedEncodeURIComponent(authority));
				} else {
					parts.push(fixedEncodeURIComponent(authority.substr(0, idx)));
					parts.push(authority.substr(idx));
				}
			}
			if (this._path) {
				// encode every segment of the path
				var path = this._path,
					segments: string[];

				// lower-case win drive letters in /C:/fff
				if (URI._driveLetterPath.test(path)) {
					path = '/' + path[1].toLowerCase() + path.substr(2);
				} else if (URI._driveLetter.test(path)) {
					path = path[0].toLowerCase() + path.substr(1);
				}
				segments = path.split('/');
				for (var i = 0, len = segments.length; i < len; i++) {
					segments[i] = fixedEncodeURIComponent(segments[i]);
				}
				parts.push(segments.join('/'));
			}
			if (this._query) {
				// in http(s) querys often use 'key=value'-pairs and
				// ampersand characters for multiple pairs
				var encoder = /https?/i.test(this.scheme)
					? encodeURI
					: fixedEncodeURIComponent;

				parts.push('?');
				parts.push(encoder(this._query));
			}
			if (this._fragment) {
				parts.push('#');
				parts.push(fixedEncodeURIComponent(this._fragment));
			}
			this._formatted = parts.join('');
		}
		return this._formatted;
	}

	public toJSON(): any {
		return this.toString();
	}

	public static isURI(thing: any): thing is URI {
		if (thing instanceof URI) {
			return true;
		}
		if(!thing) {
			return false;
		}
		if (typeof (<URI>thing).scheme !== 'string') {
			return false;
		}
		if (typeof (<URI>thing).authority !== 'string') {
			return false;
		}
		if (typeof (<URI>thing).fsPath !== 'string') {
			return false;
		}
		if (typeof (<URI>thing).query !== 'string') {
			return false;
		}
		if (typeof (<URI>thing).fragment !== 'string') {
			return false;
		}
		if (typeof (<URI>thing).with !== 'function') {
			return false;
		}
		if (typeof (<URI>thing).withScheme !== 'function') {
			return false;
		}
		if (typeof (<URI>thing).withAuthority !== 'function') {
			return false;
		}
		if (typeof (<URI>thing).withPath !== 'function') {
			return false;
		}
		if (typeof (<URI>thing).withQuery !== 'function') {
			return false;
		}
		if (typeof (<URI>thing).withFragment !== 'function') {
			return false;
		}
		if (typeof (<URI>thing).toString !== 'function') {
			return false;
		}
		if (typeof (<URI>thing).toJSON !== 'function') {
			return false;
		}
		return true;
	}
}
