/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class Query {

	constructor(public value: string, public sortBy: string, public groupBy: string) {
		this.value = value.trim();
	}

	static autocomplete(token: string): string {
		const commands = ['installed', 'outdated', 'enabled', 'disabled', 'builtin', 'recommended', 'sort', 'category', 'tag', 'ext'];
		const refinements = {
			'sort': ['installs', 'rating', 'name'],
			'category': ['programming languages', 'snippets', 'linters', 'themes', 'debuggers', 'formatters', 'keymaps', 'scm providers', 'other', 'extension packs', 'language packs'],
			'tag': []
		};

		const prefixMatch = (arr: string[] | undefined, prefix: string): string | null => {
			let longestMatch = 0;
			let bestMatch: string | null = null;
			(arr || []).forEach(possible => {
				let matchLength = 0;
				for (let i = 0; i < prefix.length; i++) {
					if (prefix[i].toLowerCase() === possible[i].toLowerCase()) {
						matchLength++;
					} else {
						break;
					}
				}
				if (matchLength > longestMatch) {
					bestMatch = possible;
					longestMatch = matchLength;
				} else if (matchLength === longestMatch) {
					bestMatch = null; // non-exclusive prefix match, reset
				}
			});
			return bestMatch;
		};

		if (token[0] !== '@') { return token; }

		if (token.indexOf(':') === -1) {
			let replacement = prefixMatch(commands, token.slice(1));
			return replacement ? '@' + replacement + (refinements[replacement] ? ':' : '') : token;
		} else {
			let command = token.slice(1, token.indexOf(':'));
			let refinement = token.slice(token.indexOf(':') + 1);

			let hadQuote = refinement[0] === '"';
			if (hadQuote) { refinement = refinement.slice(1); }

			let replacement = prefixMatch(refinements[command], refinement);
			if (replacement) {
				if (replacement.indexOf(' ') > -1 || hadQuote) {
					return `@${command}:"${replacement}"`;
				} else {
					return `@${command}:${replacement}`;
				}
			} else {
				return token;
			}
		}
	}

	static parse(value: string): Query {
		let sortBy = '';
		value = value.replace(/@sort:(\w+)(-\w*)?/g, (match, by: string, order: string) => {
			sortBy = by;

			return '';
		});

		let groupBy = '';
		value = value.replace(/@group:(\w+)(-\w*)?/g, (match, by: string, order: string) => {
			groupBy = by;

			return '';
		});

		return new Query(value, sortBy, groupBy);
	}

	toString(): string {
		let result = this.value;

		if (this.sortBy) {
			result = `${result}${result ? ' ' : ''}@sort:${this.sortBy}`;
		}
		if (this.groupBy) {
			result = `${result}${result ? ' ' : ''}@group:${this.groupBy}`;
		}

		return result;
	}

	isValid(): boolean {
		return !/@outdated/.test(this.value);
	}

	equals(other: Query): boolean {
		return this.value === other.value && this.sortBy === other.sortBy;
	}
}