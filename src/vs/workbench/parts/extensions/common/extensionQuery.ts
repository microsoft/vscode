/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { flatten } from 'vs/base/common/arrays';

export class Query {

	constructor(public value: string, public sortBy: string, public groupBy: string) {
		this.value = value.trim();
	}

	static autocompletions(): string[] {
		const commands = ['installed', 'outdated', 'enabled', 'disabled', 'builtin', 'recommended', 'sort', 'category', 'tag', 'ext'];
		const subcommands = {
			'sort': ['installs', 'rating', 'name'],
			'category': ['"programming languages"', 'snippets', 'linters', 'themes', 'debuggers', 'formatters', 'keymaps', '"scm providers"', 'other', '"extension packs"', '"language packs"'],
			'tag': [''],
			'ext': ['']
		};

		return flatten(
			commands.map(command =>
				subcommands[command]
					? subcommands[command].map(subcommand => `@${command}:${subcommand}${subcommand === '' ? '' : ' '}`)
					: [`@${command} `]));
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