/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { EXTENSION_CATEGORIES } from '../../../../platform/extensions/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions } from '../../../services/extensionManagement/common/extensionFeatures.js';
export class Query {
    constructor(value, sortBy) {
        this.value = value;
        this.sortBy = sortBy;
        this.value = value.trim();
    }
    static suggestions(query, galleryManifest) {
        const commands = ['installed', 'updates', 'enabled', 'disabled', 'builtin', 'contribute'];
        if (galleryManifest?.capabilities.extensionQuery?.filtering?.some(c => c.name === "Featured" /* FilterType.Featured */)) {
            commands.push('featured');
        }
        commands.push(...['mcp', 'agentPlugins', 'popular', 'recommended', 'recentlyPublished', 'workspaceUnsupported', 'deprecated', 'sort']);
        const isCategoriesEnabled = galleryManifest?.capabilities.extensionQuery?.filtering?.some(c => c.name === "Category" /* FilterType.Category */);
        if (isCategoriesEnabled) {
            commands.push('category');
        }
        commands.push(...['tag', 'ext', 'id', 'outdated', 'recentlyUpdated', 'restartRequired']);
        const sortCommands = [];
        if (galleryManifest?.capabilities.extensionQuery?.sorting?.some(c => c.name === "InstallCount" /* SortBy.InstallCount */)) {
            sortCommands.push('installs');
        }
        if (galleryManifest?.capabilities.extensionQuery?.sorting?.some(c => c.name === "WeightedRating" /* SortBy.WeightedRating */)) {
            sortCommands.push('rating');
        }
        sortCommands.push('name', 'publishedDate', 'updateDate');
        const contributeCommands = [];
        for (const feature of Registry.as(Extensions.ExtensionFeaturesRegistry).getExtensionFeatures()) {
            contributeCommands.push(feature.id);
        }
        const subcommands = {
            'sort': sortCommands,
            'category': isCategoriesEnabled ? EXTENSION_CATEGORIES.map(c => `"${c.toLowerCase()}"`) : [],
            'tag': [''],
            'ext': [''],
            'id': [''],
            'contribute': contributeCommands
        };
        const queryContains = (substr) => query.indexOf(substr) > -1;
        const hasSort = subcommands.sort.some(subcommand => queryContains(`@sort:${subcommand}`));
        const hasCategory = subcommands.category.some(subcommand => queryContains(`@category:${subcommand}`));
        return commands.flatMap(command => {
            if (hasSort && command === 'sort' || hasCategory && command === 'category') {
                return [];
            }
            if (command in subcommands) {
                return subcommands[command]
                    .map(subcommand => `@${command}:${subcommand}${subcommand === '' ? '' : ' '}`);
            }
            else {
                return queryContains(`@${command}`) ? [] : [`@${command} `];
            }
        });
    }
    static parse(value) {
        let sortBy = '';
        value = value.replace(/@sort:(\w+)(-\w*)?/g, (match, by, order) => {
            sortBy = by;
            return '';
        });
        return new Query(value, sortBy);
    }
    toString() {
        let result = this.value;
        if (this.sortBy) {
            result = `${result}${result ? ' ' : ''}@sort:${this.sortBy}`;
        }
        return result;
    }
    isValid() {
        return !/@outdated/.test(this.value);
    }
    equals(other) {
        return this.value === other.value && this.sortBy === other.sortBy;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uUXVlcnkuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25RdWVyeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUloRyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUM1RixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUFFLFVBQVUsRUFBOEIsTUFBTSxtRUFBbUUsQ0FBQztBQUUzSCxNQUFNLE9BQU8sS0FBSztJQUVqQixZQUFtQixLQUFhLEVBQVMsTUFBYztRQUFwQyxVQUFLLEdBQUwsS0FBSyxDQUFRO1FBQVMsV0FBTSxHQUFOLE1BQU0sQ0FBUTtRQUN0RCxJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUMzQixDQUFDO0lBRUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFhLEVBQUUsZUFBaUQ7UUFFbEYsTUFBTSxRQUFRLEdBQUcsQ0FBQyxXQUFXLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLFlBQVksQ0FBQyxDQUFDO1FBQzFGLElBQUksZUFBZSxFQUFFLFlBQVksQ0FBQyxjQUFjLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLHlDQUF3QixDQUFDLEVBQUUsQ0FBQztZQUN4RyxRQUFRLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQzNCLENBQUM7UUFFRCxRQUFRLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsY0FBYyxFQUFFLFNBQVMsRUFBRSxhQUFhLEVBQUUsbUJBQW1CLEVBQUUsc0JBQXNCLEVBQUUsWUFB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