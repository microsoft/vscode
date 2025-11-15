/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionGalleryManifest } from '../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { FilterType, SortBy } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { EXTENSION_CATEGORIES } from '../../../../platform/extensions/common/extensions.js';

export class Query {

	constructor(public value: string, public sortBy: string) {
		this.value = value.trim();
	}

	static suggestions(query: string, galleryManifest: IExtensionGalleryManifest | null): string[] {

		const commands = ['installed', 'updates', 'enabled', 'disabled', 'builtin'];
		if (galleryManifest?.capabilities.extensionQuery?.filtering?.some(c => c.name === FilterType.Featured)) {
			commands.push('featured');
		}

		commands.push(...['mcp', 'popular', 'recommended', 'recentlyPublished', 'workspaceUnsupported', 'deprecated', 'sort']);
		const isCategoriesEnabled = galleryManifest?.capabilities.extensionQuery?.filtering?.some(c => c.name === FilterType.Category);
		if (isCategoriesEnabled) {
			commands.push('category');
		}

		commands.push(...['tag', 'ext', 'id', 'outdated', 'recentlyUpdated']);
		const sortCommands = [];
		if (galleryManifest?.capabilities.extensionQuery?.sorting?.some(c => c.name === SortBy.InstallCount)) {
			sortCommands.push('installs');
		}
		if (galleryManifest?.capabilities.extensionQuery?.sorting?.some(c => c.name === SortBy.WeightedRating)) {
			sortCommands.push('rating');
		}
		sortCommands.push('name', 'publishedDate', 'updateDate');

		const subcommands = {
			'sort': sortCommands,
			'category': isCategoriesEnabled ? EXTENSION_CATEGORIES.map(c => `"${c.toLowerCase()}"`) : [],
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
