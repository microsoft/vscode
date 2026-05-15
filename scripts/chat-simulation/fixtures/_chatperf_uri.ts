/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// perf-benchmark-marker

/**
 * Fixture for chat-simulation benchmarks.
 * Simplified from src/vs/base/common/uri.ts for stable perf testing.
 */

const _empty = '';
const _slash = '/';

export class URI {
	readonly scheme: string;
	readonly authority: string;
	readonly path: string;
	readonly query: string;
	readonly fragment: string;

	private constructor(scheme: string, authority: string, path: string, query: string, fragment: string) {
		this.scheme = scheme;
		this.authority = authority || _empty;
		this.path = path || _empty;
		this.query = query || _empty;
		this.fragment = fragment || _empty;
	}

	static file(path: string): URI {
		let authority = _empty;
		if (path.length >= 2 && path.charCodeAt(0) === 47 /* / */ && path.charCodeAt(1) === 47 /* / */) {
			const idx = path.indexOf(_slash, 2);
			if (idx === -1) {
				authority = path.substring(2);
				path = _slash;
			} else {
				authority = path.substring(2, idx);
				path = path.substring(idx) || _slash;
			}
		}
		return new URI('file', authority, path, _empty, _empty);
	}

	static parse(value: string): URI {
		const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/.exec(value);
		if (!match) { return new URI(_empty, _empty, _empty, _empty, _empty); }
		return new URI(match[1], match[2], match[3], match[4]?.substring(1) || _empty, match[5]?.substring(1) || _empty);
	}

	with(change: { scheme?: string; authority?: string; path?: string; query?: string; fragment?: string }): URI {
		return new URI(
			change.scheme ?? this.scheme,
			change.authority ?? this.authority,
			change.path ?? this.path,
			change.query ?? this.query,
			change.fragment ?? this.fragment,
		);
	}

	toString(): string {
		let result = '';
		if (this.scheme) { result += this.scheme + '://'; }
		if (this.authority) { result += this.authority; }
		if (this.path) { result += this.path; }
		if (this.query) { result += '?' + this.query; }
		if (this.fragment) { result += '#' + this.fragment; }
		return result;
	}

	get fsPath(): string {
		return this.path;
	}

	toJSON(): object {
		return {
			scheme: this.scheme,
			authority: this.authority,
			path: this.path,
			query: this.query,
			fragment: this.fragment,
		};
	}
}
