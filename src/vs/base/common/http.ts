/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');

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

export function getErrorStatusDescription(status: number) : string {
	if (status < 400) {
		return void 0;
	}
	switch (status) {
		case 400: return nls.localize('status.400', 'Bad request. The request cannot be fulfilled due to bad syntax.');
		case 401: return nls.localize('status.401', 'Unauthorized. The server is refusing to respond.');
		case 403: return nls.localize('status.403', 'Forbidden. The server is refusing to respond.');
		case 404: return nls.localize('status.404', 'Not Found. The requested location could not be found.');
		case 405: return nls.localize('status.405', 'Method not allowed. A request was made using a request method not supported by that location.');
		case 406: return nls.localize('status.406', 'Not Acceptable. The server can only generate a response that is not accepted by the client.');
		case 407: return nls.localize('status.407', 'Proxy Authentication Required. The client must first authenticate itself with the proxy.');
		case 408: return nls.localize('status.408', 'Request Timeout. The server timed out waiting for the request.');
		case 409: return nls.localize('status.409', 'Conflict. The request could not be completed because of a conflict in the request.');
		case 410: return nls.localize('status.410', 'Gone. The requested page is no longer available.');
		case 411: return nls.localize('status.411', 'Length Required. The "Content-Length" is not defined.');
		case 412: return nls.localize('status.412', 'Precondition Failed. The precondition given in the request evaluated to false by the server.');
		case 413: return nls.localize('status.413', 'Request Entity Too Large. The server will not accept the request, because the request entity is too large.');
		case 414: return nls.localize('status.414', 'Request-URI Too Long. The server will not accept the request, because the URL is too long.');
		case 415: return nls.localize('status.415', 'Unsupported Media Type. The server will not accept the request, because the media type is not supported.');
		case 500: return nls.localize('status.500', 'Internal Server Error.');
		case 501: return nls.localize('status.501', 'Not Implemented. The server either does not recognize the request method, or it lacks the ability to fulfill the request.');
		case 503: return nls.localize('status.503', 'Service Unavailable. The server is currently unavailable (overloaded or down).');
		default: return nls.localize('status.416', 'HTTP status code {0}', status);
	}
}