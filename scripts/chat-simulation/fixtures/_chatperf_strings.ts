/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// perf-benchmark-marker

/**
 * Fixture for chat-simulation benchmarks.
 * Simplified from src/vs/base/common/strings.ts for stable perf testing.
 */

export function format(value: string, ...args: any[]): string {
	return value.replace(/{(\d+)}/g, (match, index) => {
		const i = parseInt(index, 10);
		return i >= 0 && i < args.length ? `${args[i]}` : match;
	});
}

export function escape(value: string): string {
	return value.replace(/[<>&"']/g, ch => {
		switch (ch) {
			case '<': return '&lt;';
			case '>': return '&gt;';
			case '&': return '&amp;';
			case '"': return '&quot;';
			case '\'': return '&#39;';
			default: return ch;
		}
	});
}

export function trim(value: string, ch: string = ' '): string {
	let start = 0;
	let end = value.length;
	while (start < end && value[start] === ch) { start++; }
	while (end > start && value[end - 1] === ch) { end--; }
	return value.substring(start, end);
}

export function equalsIgnoreCase(a: string, b: string): boolean {
	return a.length === b.length && a.toLowerCase() === b.toLowerCase();
}

export function startsWithIgnoreCase(str: string, candidate: string): boolean {
	if (str.length < candidate.length) { return false; }
	return str.substring(0, candidate.length).toLowerCase() === candidate.toLowerCase();
}

export function commonPrefixLength(a: string, b: string): number {
	const len = Math.min(a.length, b.length);
	for (let i = 0; i < len; i++) {
		if (a.charCodeAt(i) !== b.charCodeAt(i)) { return i; }
	}
	return len;
}

export function commonSuffixLength(a: string, b: string): number {
	const len = Math.min(a.length, b.length);
	for (let i = 0; i < len; i++) {
		if (a.charCodeAt(a.length - 1 - i) !== b.charCodeAt(b.length - 1 - i)) { return i; }
	}
	return len;
}

export function splitLines(str: string): string[] {
	return str.split(/\r\n|\r|\n/);
}

export function regExpLeadsToEndlessLoop(regexp: RegExp): boolean {
	if (regexp.source === '^' || regexp.source === '^$' || regexp.source === '$') {
		return false;
	}
	return !regexp.exec('')?.length;
}
