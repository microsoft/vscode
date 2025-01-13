/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EXTENSION_CATEGORIES } from '../../../../platform/extensions/common/extensions.js';

export class Query {

	constructor(public value: string, public sortBy: string) {
		this.value = value.trim();
	}

	static suggestions(query: string): string[] {
		const commands = ['installed', 'updates', 'enabled', 'disabled', 'builtin', 'featured', 'popular', 'recommended', 'recentlyPublished', 'workspaceUnsupported', 'deprecated', 'sort', 'category', 'tag', 'ext', 'id', 'outdated', 'recentlyUpdated'] as const;
		const subcommands = {
			'sort': ['installs', 'rating', 'name', 'publishedDate', 'updateDate'],
			'category': EXTENSION_CATEGORIES.map(c => `"${c.toLowerCase()}"`),
			'tag': [''],
			'ext': [''],
			'id': ['']
		} as const;

		const queryContains = (substr: string) => query.indexOf(substr) > -1;
		const hasSort = subcommands.sort.some(subcommand => queryContains(`@sort:${subcommand}`));
		const hasCategory = subcommands.category.some(subcommand => queryContains(`@category:${subcommand}`));

		return commands.flatMap(command => {
			if (hasSort && command === 'sort' || hasCategory && command === 'category') {
				return [];
			}
			if (command in subcommands) {
				return (subcommands as Record<string, readonly string[]>)[command]
					.map(subcommand => `@${command}:${subcommand}${subcommand === '' ? '' : ' '}`);
			}
			else {
				return queryContains(`@${command}`) ? [] : [`@${command} `];
			}
		});
	}

	static parse(value: string): Query {
		let sortBy = '';
		value = value.replace(/@sort:(\w+)(-\w*)?/g, (match, by: string, order: string) => {
			sortBy = by;

			return '';
		});
		return new Query(value, sortBy);
	}

	toString(): string {
		let result = this.value;

		if (this.sortBy) {
			result = `${result}${result ? ' ' : ''}@sort:${this.sortBy}`;
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
