/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('vs/base/common/assert');
import objects = require('vs/base/common/objects');
import strings = require('vs/base/common/strings');
import hash = require('vs/base/common/hash');
import marshalling = require('vs/base/common/marshalling');
import paths = require('vs/base/common/paths');
import URI from 'vs/base/common/uri';

interface ISerializedURL {
	$isURL: boolean;
	$value: string;
}

marshalling.registerMarshallingContribution({

	canSerialize: (obj:any): boolean => {
		return obj instanceof URL;
	},

	serialize: (url:URL, serialize:(obj:any)=>any): ISerializedURL => {
		return url._toSerialized();
	},

	canDeserialize: (obj:ISerializedURL): boolean => {
		return obj.$isURL;
	},

	deserialize: (obj:ISerializedURL, deserialize:(obj:any)=>any): any => {
		return new URL(obj.$value);
	}
});


var _colon = ':'.charCodeAt(0),
	_slash = '/'.charCodeAt(0),
	_questionMark = '?'.charCodeAt(0),
	_hash = '#'.charCodeAt(0);

export class ParsedUrl {

	private spec:string;
	private specLength:number;
	private schemeStart:number;
	private domainStart:number;
	private portStart:number;
	private pathStart:number;
	private queryStringStart:number;
	private fragmentIdStart:number;

	constructor(spec:string) {
		this.spec = spec || strings.empty;
		this.specLength = this.spec.length;



		this.parse();
	}

	private forwardSubstring(startIndex:number, endIndex:number): string {
		if (startIndex < endIndex) {
			return this.spec.substring(startIndex, endIndex);
		}
		return strings.empty;
	}

	/**
	 * http for http://www.test.com:8000/this/that/theother.html?query=foo#hash
	 */
	public getScheme(): string {
		return this.forwardSubstring(this.schemeStart, this.domainStart - 1);
	}

	/**
	 * http: for http://www.test.com:8000/this/that/theother.html?query=foo#hash
	 */
	public getProtocol(): string {
		return this.forwardSubstring(this.schemeStart, this.domainStart);
	}

	/**
	 * www.test.com for http://www.test.com:8000/this/that/theother.html?query=foo#hash
	 */
	public getDomain(): string {
		return this.forwardSubstring(this.domainStart + 2, this.portStart);
	}

	/**
	 * 8000 for http://www.test.com:8000/this/that/theother.html?query=foo#hash
	 */
	public getPort(): string {
		return this.forwardSubstring(this.portStart + 1, this.pathStart);
	}

	/**
	 * www.test.com:8000 for http://www.test.com:8000/this/that/theother.html?query=foo#hash
	 */
	public getHost(): string {
		return this.forwardSubstring(this.domainStart + 2, this.pathStart);
	}

	/**
	 * /this/that/theother.html for http://www.test.com:8000/this/that/theother.html?query=foo#hash
	 */
	public getPath(): string {
		return this.forwardSubstring(this.pathStart, this.queryStringStart);
	}

	/**
	 * query=foo for http://www.test.com:8000/this/that/theother.html?query=foo#hash
	 */
	public getQueryString(): string {
		return this.forwardSubstring(this.queryStringStart + 1, this.fragmentIdStart);
	}

	/**
	 * hash for http://www.test.com:8000/this/that/theother.html?query=foo#hash
	 */
	public getFragmentId(): string {
		return this.forwardSubstring(this.fragmentIdStart + 1, this.specLength);
	}

	/**
	 * http://www.test.com:8000 for http://www.test.com:8000/this/that/theother.html?query=foo#hash
	 */
	public getAllBeforePath(): string {
		return this.forwardSubstring(0, this.pathStart);
	}
	/**
	 * http://www.test.com:8000/this/that/theother.html?query=foo for http://www.test.com:8000/this/that/theother.html?query=foo#hash
	 */
	public getAllBeforeFragmentId(): string {
		return this.forwardSubstring(0, this.fragmentIdStart);
	}


	/**
	 * Combine with a relative url, returns absolute url
	 * e.g.
	 * http://www.test.com/this/that/theother.html?query=foo#hash=hash
	 * combined with ../test.js?query=foo#hash
	 * results in http://www.test.com/this/test.js?query=foo#hash
	 */
	public combine(relativeUrl:string):string {
		var questionMarkIndex = relativeUrl.indexOf('?');
		var hashIndex = relativeUrl.indexOf('#');
		var suffixIndex = relativeUrl.length;
		if (questionMarkIndex !== -1 && questionMarkIndex < suffixIndex) {
			suffixIndex = questionMarkIndex;
		}
		if (hashIndex !== -1 && hashIndex < suffixIndex) {
			suffixIndex = hashIndex;
		}

		var relativeUrlPath = relativeUrl.substring(0, suffixIndex);
		var relativeUrlSuffix = relativeUrl.substring(suffixIndex);


		relativeUrlPath = relativeUrlPath.replace('\\', '/');

		var resultPath: string;
		if (strings.startsWith(relativeUrlPath, '/')) {
			// Looks like an absolute URL
			resultPath = paths.join(relativeUrlPath);
		} else {
			resultPath = paths.join(paths.dirname(this.getPath()), relativeUrlPath);
		}

		while (resultPath.charAt(0) === '/') {
			resultPath = resultPath.substr(1);
		}

		while (resultPath.indexOf('../') === 0) {
			resultPath = resultPath.substr(3);
		}

		return this.getAllBeforePath() + '/' + resultPath + relativeUrlSuffix;
	}

	// scheme://domain:port/path?query_string#fragment_id
	private parse(): void {
		var IN_SCHEME = 0,
			IN_DOMAIN = 1,
			IN_PORT = 2,
			IN_PATH = 3,
			IN_QUERY_STRING = 4,
			state = IN_SCHEME,
			spec = this.spec,
			length = this.specLength,
			i:number,
			prevChCode:number = -1,
			prevPrevChCode:number = -1,
			chCode:number;

		this.schemeStart = 0;
		this.domainStart = this.specLength;
		this.portStart = this.specLength;
		this.pathStart = this.specLength;
		this.queryStringStart = this.specLength;
		this.fragmentIdStart = this.specLength;

		for (i = 0; i < length; i++) {
			chCode = spec.charCodeAt(i);

			switch (state) {
				case IN_SCHEME:
					if (prevChCode === _slash && chCode === _slash) {
						// going into the domain
						state = IN_DOMAIN;
						this.domainStart = i - 1;
					}
					break;

				case IN_DOMAIN:
					if (chCode === _colon) {
						// going into the port
						state = IN_PORT;
						this.portStart = i;
					} else if (chCode === _slash) {
						// skipping the port, going straight to the path
						state = IN_PATH;
						this.portStart = i;
						this.pathStart = i;
					} else if (chCode === _hash) {
						// skipping the port, path & query string, going straight to the fragment, we can halt now
						this.portStart = i;
						this.pathStart = i;
						this.queryStringStart = i;
						this.fragmentIdStart = i;
						i = length;
					}
					break;

				case IN_PORT:
					if (chCode === _slash) {
						// going into the path
						state = IN_PATH;
						this.pathStart = i;
					} else if (chCode === _hash) {
						// skipping the path & query string, going straight to the fragment, we can halt now
						this.pathStart = i;
						this.queryStringStart = i;
						this.fragmentIdStart = i;
						i = length;
					}
					break;

				case IN_PATH:
					if (chCode === _questionMark) {
						// going in to the query string
						state = IN_QUERY_STRING;
						this.queryStringStart = i;
					} else if (chCode === _hash) {
						// skipping the query string, going straight to the fragment, we can halt now
						this.queryStringStart = i;
						this.fragmentIdStart = i;
						i = length;
					}
					break;

				case IN_QUERY_STRING:
					if (chCode === _hash) {
						// going into the hash, we can halt now
						this.fragmentIdStart = i;
						i = length;
					}
					break;
			}

			prevPrevChCode = prevChCode;
			prevChCode = chCode;
		}

		if (state === IN_SCHEME) {
			// Looks like we had a very bad url
			this.schemeStart = this.specLength;
		}
	}
}


export class URL extends URI implements objects.IEqualable {

	/**
	 * Creates a new URL from the provided value
	 * by decoding it first.
	 * @param value A encoded url value.
	 */
	public static fromEncoded(value:string):URL {
		return new URL(decodeURIComponent(value));
	}

	public static fromValue(value:string):URL {
		return new URL(value);
	}

	public static fromUri(value: URI): URL {
		return new URL(value);
	}

	private _spec:string;
	private _uri: URI;
	private _parsed:ParsedUrl;

	constructor(spec: string);
	constructor(spec: URI);
	constructor(stringOrURI: any) {
		super();
		assert.ok(!!stringOrURI, 'spec must not be null');
		if(typeof stringOrURI === 'string') {
			this._uri = URI.parse(stringOrURI);
		} else {
			this._uri = stringOrURI;
		}
		this._spec = this._uri.toString(); // make sure spec is normalized
		this._parsed = null;
	}

	public equals(other:any):boolean {
		if (this.toString() !== String(other)) {
			return false;
		}

		return ((other instanceof URL) || URI.isURI(other));
	}

	public hashCode():number {
		return hash.computeMurmur2StringHashCode(this._spec);
	}

	public isInMemory(): boolean {
		return this.scheme === schemas.inMemory;
	}

	/**
	 * http for http://www.test.com:8000/this/that/theother.html?query=foo#hash
	 */
	public getScheme():string {
		this._ensureParsedUrl();
		return this._parsed.getScheme();
	}

	/**
	 * /this/that/theother.html for http://www.test.com:8000/this/that/theother.html?query=foo#hash
	 */
	public getPath():string {
		this._ensureParsedUrl();
		return this._parsed.getPath();
	}

	/**
	 * Strip out the hash part of the URL
	 * http://www.test.com:8000/this/that/theother.html?query=foo for http://www.test.com:8000/this/that/theother.html?query=foo#hash
	 */
	public toUnique():string {
		this._ensureParsedUrl();
		return this._parsed.getAllBeforeFragmentId();
	}

	public startsWith(other:URL):boolean {
		return strings.startsWith(this._spec, other._spec);
	}

	/**
	 * Combine with a relative url, returns absolute url
	 * e.g.
	 * http://www.test.com/this/that/theother.html?query=foo#hash=hash
	 * combined with ../test.js?query=foo#hash
	 * results in http://www.test.com/this/test.js?query=foo#hash
	 */
	public combine(relativeUrl:string):URL {
		this._ensureParsedUrl();
		return new URL(this._parsed.combine(relativeUrl));
	}

	private _ensureParsedUrl(): void {
		if(this._parsed === null) {
			this._parsed = new ParsedUrl(this._spec);
		}
	}

	// ----- URI implementation -------------------------

	public get scheme(): string {
		return this._uri.scheme;
	}

	public get authority(): string {
		return this._uri.authority;
	}

	public get path(): string {
		return this._uri.path;
	}

	public get fsPath(): string {
		return this._uri.fsPath;
	}

	public get query(): string {
		return this._uri.query;
	}

	public get fragment(): string {
		return this._uri.fragment;
	}

	public withScheme(value: string): URI {
		return URI.create(value, this.authority, this.fsPath, this.query, this.fragment);
	}

	public withAuthority(value: string): URI {
		return URI.create(this.scheme, value, this.fsPath, this.query, this.fragment);
	}

	public withPath(value: string): URI {
		return URI.create(this.scheme, this.authority, value, this.query, this.fragment);
	}

	public withQuery(value: string): URI {
		return URI.create(this.scheme, this.authority, this.fsPath, value, this.fragment);
	}

	public withFragment(value: string): URI {
		return URI.create(this.scheme, this.authority, this.fsPath, this.query, value);
	}

	public with(scheme: string, authority: string, path: string, query: string, fragment: string): URI {
		return URI.create(scheme, authority, path, query, fragment);
	}

	public toString():string {
		return this._spec;
	}

	public toJSON(): any {
		return this.toString();
	}

	public _toSerialized(): any {
		return {
			$isURL: true,
			// TODO@Alex: implement derived resources (embedded mirror models) better
			$value: this.toString().replace(/URL_MARSHAL_REMOVE.*$/, '')
		};
	}
}

export namespace schemas {

	/**
	 * A schema that is used for models that exist in memory
	 * only and that have no correspondance on a server or such.
	 */
	export var inMemory:string = 'inmemory';

	export var http:string = 'http';

	export var https:string = 'https';

	export var file:string = 'file';
}