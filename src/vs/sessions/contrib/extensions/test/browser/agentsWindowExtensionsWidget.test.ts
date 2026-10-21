/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILocalExtension } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { ExtensionState, IExtension } from '../../../../../workbench/contrib/extensions/common/extensions.js';
import { AgentsWindowExtensionGroup, groupAgentsWindowExtensions, IAgentsWindowExtensionsGroup } from '../../browser/agentsWindowExtensionsWidget.js';

interface ITestExtensionOptions {
	readonly displayName: string;
	readonly publisher?: string;
	readonly description?: string;
	readonly isBuiltin?: boolean;
	readonly state?: ExtensionState;
	readonly installed?: boolean;
}

function anExtension(id: string, options: ITestExtensionOptions): IExtension {
	return new class extends mock<IExtension>() {
		override readonly identifier = { id };
		override readonly displayName = options.displayName;
		override readonly publisherDisplayName = options.publisher ?? 'Publisher';
		override readonly description = options.description ?? '';
		override readonly isBuiltin = options.isBuiltin ?? false;
		override readonly state = options.state ?? ExtensionState.Installed;
		override readonly local = options.installed === false ? undefined : new class extends mock<ILocalExtension>() { }();
	}();
}

function summarize(groups: readonly IAgentsWindowExtensionsGroup[]) {
	return groups.map(group => ({ group: group.group, entries: group.entries.map(entry => ({ id: entry.extension.identifier.id, nameMatches: entry.nameMatches })) }));
}

suite('AgentsWindowExtensionsWidget', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const supportedIds = new Set(['pub.zeta', 'pub.alpha', 'pub.builtin']);
	const supportsAgentsWindow = (extension: IExtension) => supportedIds.has(extension.identifier.id);

	const extensions = [
		anExtension('pub.zeta', { displayName: 'Zeta Theme' }),
		anExtension('pub.alpha', { displayName: 'Alpha Grammar' }),
		anExtension('pub.python', { displayName: 'Python', publisher: 'Microsoft', description: 'Python language support' }),
		anExtension('pub.eslint', { displayName: 'ESLint', description: 'Integrates ESLint JavaScript into VS Code.' }),
		anExtension('pub.builtin', { displayName: 'Built-in', isBuiltin: true }),
		anExtension('pub.uninstalling', { displayName: 'Uninstalling', state: ExtensionState.Uninstalling }),
		anExtension('pub.gallery', { displayName: 'Gallery Only', installed: false }),
	];

	test('groups installed non built-in extensions by Agents window support', () => {
		assert.deepStrictEqual(summarize(groupAgentsWindowExtensions(extensions, '', supportsAgentsWindow)), [
			{ group: AgentsWindowExtensionGroup.Supported, entries: [{ id: 'pub.alpha', nameMatches: undefined }, { id: 'pub.zeta', nameMatches: undefined }] },
			{ group: AgentsWindowExtensionGroup.Other, entries: [{ id: 'pub.eslint', nameMatches: undefined }, { id: 'pub.python', nameMatches: undefined }] },
		]);
	});

	test('filters by name, identifier, publisher, and description', () => {
		assert.deepStrictEqual({
			name: summarize(groupAgentsWindowExtensions(extensions, ' theme ', supportsAgentsWindow)),
			identifier: summarize(groupAgentsWindowExtensions(extensions, 'pub.py', supportsAgentsWindow)),
			publisher: summarize(groupAgentsWindowExtensions(extensions, 'microsoft', supportsAgentsWindow)),
			description: summarize(groupAgentsWindowExtensions(extensions, 'javascript', supportsAgentsWindow)),
			excluded: summarize(groupAgentsWindowExtensions(extensions, 'built-in', supportsAgentsWindow)),
		}, {
			name: [
				{ group: AgentsWindowExtensionGroup.Supported, entries: [{ id: 'pub.zeta', nameMatches: [{ start: 5, end: 10 }] }] },
				{ group: AgentsWindowExtensionGroup.Other, entries: [] },
			],
			identifier: [
				{ group: AgentsWindowExtensionGroup.Supported, entries: [] },
				{ group: AgentsWindowExtensionGroup.Other, entries: [{ id: 'pub.python', nameMatches: undefined }] },
			],
			publisher: [
				{ group: AgentsWindowExtensionGroup.Supported, entries: [] },
				{ group: AgentsWindowExtensionGroup.Other, entries: [{ id: 'pub.python', nameMatches: undefined }] },
			],
			description: [
				{ group: AgentsWindowExtensionGroup.Supported, entries: [] },
				{ group: AgentsWindowExtensionGroup.Other, entries: [{ id: 'pub.eslint', nameMatches: undefined }] },
			],
			excluded: [
				{ group: AgentsWindowExtensionGroup.Supported, entries: [] },
				{ group: AgentsWindowExtensionGroup.Other, entries: [] },
			],
		});
	});
});
