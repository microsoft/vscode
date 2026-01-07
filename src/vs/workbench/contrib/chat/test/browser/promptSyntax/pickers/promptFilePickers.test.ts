/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IExtensionDescription } from '../../../../../../../platform/extensions/common/extensions.js';
import { ExtensionAgentSourceType, IExtensionPromptPath, IPromptPath, PromptsStorage } from '../../../../common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../../../common/promptSyntax/promptTypes.js';

suite('PromptFilePickers - Group extension resources by sourceLabel', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Simulates the grouping logic from `_createPromptPickItems` that groups extension resources by sourceLabel.
	 */
	function groupExtensionsBySourceLabel(exts: readonly IPromptPath[]): Map<string, IPromptPath[]> {
		const groupedExts = new Map<string, IPromptPath[]>();
		const defaultExtGroupLabel = 'Extensions';
		for (const ext of exts) {
			const extPath = ext as IExtensionPromptPath;
			const groupLabel = extPath.sourceLabel ?? defaultExtGroupLabel;
			if (!groupedExts.has(groupLabel)) {
				groupedExts.set(groupLabel, []);
			}
			groupedExts.get(groupLabel)!.push(ext);
		}
		return groupedExts;
	}

	function createMockExtensionPromptPath(
		name: string,
		extension: IExtensionDescription,
		sourceLabel?: string
	): IExtensionPromptPath {
		return {
			uri: URI.parse(`file://extensions/${extension.identifier.value}/${name}.instructions.md`),
			storage: PromptsStorage.extension,
			type: PromptsType.instructions,
			extension,
			source: ExtensionAgentSourceType.contribution,
			name,
			description: `Description for ${name}`,
			sourceLabel
		};
	}

	function createMockExtension(id: string, displayName?: string): IExtensionDescription {
		return {
			identifier: { value: id },
			displayName: displayName ?? id,
		} as IExtensionDescription;
	}

	test('groups extension resources by sourceLabel', () => {
		const ext1 = createMockExtension('test.extension1', 'Test Extension 1');
		const ext2 = createMockExtension('test.extension2', 'Test Extension 2');

		const extensionPrompts: IExtensionPromptPath[] = [
			createMockExtensionPromptPath('prompt1', ext1, 'Custom Source A'),
			createMockExtensionPromptPath('prompt2', ext1, 'Custom Source A'),
			createMockExtensionPromptPath('prompt3', ext2, 'Custom Source B'),
			createMockExtensionPromptPath('prompt4', ext2, 'Custom Source A'),
		];

		const grouped = groupExtensionsBySourceLabel(extensionPrompts);

		assert.strictEqual(grouped.size, 2, 'Should have 2 groups');
		assert.ok(grouped.has('Custom Source A'), 'Should have "Custom Source A" group');
		assert.ok(grouped.has('Custom Source B'), 'Should have "Custom Source B" group');

		const groupA = grouped.get('Custom Source A')!;
		assert.strictEqual(groupA.length, 3, 'Custom Source A should have 3 items');
		assert.strictEqual((groupA[0] as IExtensionPromptPath).name, 'prompt1');
		assert.strictEqual((groupA[1] as IExtensionPromptPath).name, 'prompt2');
		assert.strictEqual((groupA[2] as IExtensionPromptPath).name, 'prompt4');

		const groupB = grouped.get('Custom Source B')!;
		assert.strictEqual(groupB.length, 1, 'Custom Source B should have 1 item');
		assert.strictEqual((groupB[0] as IExtensionPromptPath).name, 'prompt3');
	});

	test('falls back to "Extensions" for resources without sourceLabel', () => {
		const ext1 = createMockExtension('test.extension1', 'Test Extension 1');
		const ext2 = createMockExtension('test.extension2', 'Test Extension 2');

		const extensionPrompts: IExtensionPromptPath[] = [
			createMockExtensionPromptPath('prompt1', ext1, undefined), // No sourceLabel
			createMockExtensionPromptPath('prompt2', ext2, undefined), // No sourceLabel
			createMockExtensionPromptPath('prompt3', ext1, 'Custom Source'),
		];

		const grouped = groupExtensionsBySourceLabel(extensionPrompts);

		assert.strictEqual(grouped.size, 2, 'Should have 2 groups');
		assert.ok(grouped.has('Extensions'), 'Should have default "Extensions" group');
		assert.ok(grouped.has('Custom Source'), 'Should have "Custom Source" group');

		const defaultGroup = grouped.get('Extensions')!;
		assert.strictEqual(defaultGroup.length, 2, 'Extensions group should have 2 items without sourceLabel');

		const customGroup = grouped.get('Custom Source')!;
		assert.strictEqual(customGroup.length, 1, 'Custom Source group should have 1 item');
	});

	test('handles mixed resources with and without sourceLabel', () => {
		const ext1 = createMockExtension('test.extension1');
		const ext2 = createMockExtension('test.extension2');
		const ext3 = createMockExtension('test.extension3');

		const extensionPrompts: IExtensionPromptPath[] = [
			createMockExtensionPromptPath('prompt1', ext1, 'GitHub'),
			createMockExtensionPromptPath('prompt2', ext2, undefined),
			createMockExtensionPromptPath('prompt3', ext3, 'GitHub'),
			createMockExtensionPromptPath('prompt4', ext1, 'Azure'),
			createMockExtensionPromptPath('prompt5', ext2, undefined),
		];

		const grouped = groupExtensionsBySourceLabel(extensionPrompts);

		assert.strictEqual(grouped.size, 3, 'Should have 3 groups: GitHub, Azure, Extensions');
		assert.ok(grouped.has('GitHub'), 'Should have "GitHub" group');
		assert.ok(grouped.has('Azure'), 'Should have "Azure" group');
		assert.ok(grouped.has('Extensions'), 'Should have default "Extensions" group');

		assert.strictEqual(grouped.get('GitHub')!.length, 2, 'GitHub should have 2 items');
		assert.strictEqual(grouped.get('Azure')!.length, 1, 'Azure should have 1 item');
		assert.strictEqual(grouped.get('Extensions')!.length, 2, 'Extensions should have 2 items');
	});

	test('handles empty extension list', () => {
		const extensionPrompts: IExtensionPromptPath[] = [];

		const grouped = groupExtensionsBySourceLabel(extensionPrompts);

		assert.strictEqual(grouped.size, 0, 'Should have no groups for empty input');
	});

	test('all resources in a single sourceLabel group', () => {
		const ext1 = createMockExtension('test.extension1');
		const ext2 = createMockExtension('test.extension2');

		const extensionPrompts: IExtensionPromptPath[] = [
			createMockExtensionPromptPath('prompt1', ext1, 'Same Source'),
			createMockExtensionPromptPath('prompt2', ext2, 'Same Source'),
			createMockExtensionPromptPath('prompt3', ext1, 'Same Source'),
		];

		const grouped = groupExtensionsBySourceLabel(extensionPrompts);

		assert.strictEqual(grouped.size, 1, 'Should have only 1 group');
		assert.ok(grouped.has('Same Source'), 'Should have "Same Source" group');
		assert.strictEqual(grouped.get('Same Source')!.length, 3, 'Same Source should have all 3 items');
	});

	test('all resources fall back to default Extensions group', () => {
		const ext1 = createMockExtension('test.extension1');
		const ext2 = createMockExtension('test.extension2');

		const extensionPrompts: IExtensionPromptPath[] = [
			createMockExtensionPromptPath('prompt1', ext1, undefined),
			createMockExtensionPromptPath('prompt2', ext2, undefined),
			createMockExtensionPromptPath('prompt3', ext1, undefined),
		];

		const grouped = groupExtensionsBySourceLabel(extensionPrompts);

		assert.strictEqual(grouped.size, 1, 'Should have only 1 group');
		assert.ok(grouped.has('Extensions'), 'Should have default "Extensions" group');
		assert.strictEqual(grouped.get('Extensions')!.length, 3, 'Extensions should have all 3 items');
	});

	test('preserves order of items within each group', () => {
		const ext = createMockExtension('test.extension');

		const extensionPrompts: IExtensionPromptPath[] = [
			createMockExtensionPromptPath('first', ext, 'Group'),
			createMockExtensionPromptPath('second', ext, 'Group'),
			createMockExtensionPromptPath('third', ext, 'Group'),
		];

		const grouped = groupExtensionsBySourceLabel(extensionPrompts);

		const group = grouped.get('Group')!;
		assert.strictEqual((group[0] as IExtensionPromptPath).name, 'first', 'First item should be first');
		assert.strictEqual((group[1] as IExtensionPromptPath).name, 'second', 'Second item should be second');
		assert.strictEqual((group[2] as IExtensionPromptPath).name, 'third', 'Third item should be third');
	});

	test('sourceLabel with special characters', () => {
		const ext = createMockExtension('test.extension');

		const extensionPrompts: IExtensionPromptPath[] = [
			createMockExtensionPromptPath('prompt1', ext, 'Source with spaces and 123'),
			createMockExtensionPromptPath('prompt2', ext, 'Source/with/slashes'),
			createMockExtensionPromptPath('prompt3', ext, 'Source:with:colons'),
		];

		const grouped = groupExtensionsBySourceLabel(extensionPrompts);

		assert.strictEqual(grouped.size, 3, 'Should have 3 unique groups');
		assert.ok(grouped.has('Source with spaces and 123'));
		assert.ok(grouped.has('Source/with/slashes'));
		assert.ok(grouped.has('Source:with:colons'));
	});
});
