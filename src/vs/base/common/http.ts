/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

// Methods
export var GET = 'GET';
export var POST = 'POST';
export var PUT = 'PUT';
export var DELETE = 'DELETE';

// Header
export namespace Header {
	export var CONTENT_TYPE = 'Content-Type';
	export var CONTENT_LENGTH = 'Content-Length';
	export var LAST_MODIFIED = 'Last-Modified';
	export var LOCATION = 'Location';
	export var ETAG = 'ETag';
	export var X_CONTENT_CHARSET = 'X-Content-Charset';
	export var X_CONTENT_TYPES = 'X-Content-Types';
	export var X_CONTENT_HASH = 'X-Content-Hash';
	export var X_FILEPATH = 'X-Filepath';
	export var X_RESOURCE = 'X-Resource';
}

// Mime
export namespace Mime {
	export var RAW = 'application/octet-stream';
	export var JSON = 'application/json';
	export var TEXT = 'text/plain';
	export var HTML = 'text/html';
}

// Charset
export namespace Charset {
	export var UTF8 = 'utf-8';
	export var UTF8_BOM = 'UTF8_BOM';
}

export interface IDataChunk {
	header(name:string):string;
	value():string;
}


export interface IXHROptions {
	type?:string;
	url?:string;
	user?:string;
	password?:string;
	responseType?:string;
	headers?:any;
	timeout?: number;
	followRedirects?: number;
	data?:any;
}

export interface IXHRResponse {
	responseText: string;
	status: number;

	readyState : number;
	getResponseHeader: (header:string) => string;
}

export function isRedirect(status: number) : boolean {
	return status >= 300 && status <= 303 || status === 307;
}

var contentLengthPattern = /X-Chunk-Length:(\d+)\r\n\r\n/gi,
	headerPattern = /(.+?):(.+?)\r\n(\r\n)?/gm;

function newDataChunk(responseText:string, headerStartOffset:number, headerEndOffset:number, contentLength:number):IDataChunk {

	var _value:string,
		_headers:{[name:string]:string};

	return {
		header: function(name:string):string {
			if(typeof _headers === 'undefined') {
				_headers = Object.create(null);
				headerPattern.lastIndex = headerStartOffset;
				while(true) {
					var match = headerPattern.exec(responseText);
					if(!match) {
						// no header found
						break;
					}
					_headers[match[1].toLowerCase()] = match[2];

					if(match[3]) {
						// the last header found
						break;
					}
				}
			}
			return _headers[name.toLowerCase()];
		},
		value: function() {
			if(typeof _value === 'undefined') {
				_value = responseText.substr(headerEndOffset + 2 /*crlf*/, contentLength);
			}
			return _value;
		}
	};
}

/**
 * Parses the response text of the provided request into individual data chunks. The chunks
 * are filled into the provided array.
 */
export function parseChunkedData(request:IXHRResponse, collection:IDataChunk[], offset:number = 0):number {

	var responseText = request.responseText;

	contentLengthPattern.lastIndex = offset;

	while(true) {
		var match = contentLengthPattern.exec(responseText);
		if(!match) {
			return offset;
		}
		var contentLength = parseInt(match[1], 10);
		if(responseText.length < contentLengthPattern.lastIndex + contentLength) {
			return offset;
		}

		collection.push(newDataChunk(responseText, offset, contentLengthPattern.lastIndex - 2, contentLength));
		offset = contentLengthPattern.lastIndex + contentLength;
	}
}