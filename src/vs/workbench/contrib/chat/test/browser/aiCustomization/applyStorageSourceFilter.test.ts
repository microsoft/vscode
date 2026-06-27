/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AICustomizationSource, AICustomizationSources, applySourceFilter, IStorageSourceFilter } from '../../../common/aiCustomizationWorkspaceService.js';

function item(path: string, source: AICustomizationSource): { uri: URI; source: AICustomizationSource } {
	return { uri: URI.file(path), source };
}

suite('applyStorageSourceFilter', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('source filtering', () => {
		test('keeps items matching sources', () => {
			const items = [
				item('/w/a.md', AICustomizationSources.local),
				item('/u/b.md', AICustomizationSources.user),
				item('/e/c.md', AICustomizationSources.extension),
			];
			const filter: IStorageSourceFilter = {
				sources: [AICustomizationSources.local, AICustomizationSources.user, AICustomizationSources.extension],
			};
			assert.strictEqual(applySourceFilter(items, filter).length, 3);
		});

		test('removes items not in sources', () => {
			const items = [
				item('/w/a.md', AICustomizationSources.local),
				item('/u/b.md', AICustomizationSources.user),
				item('/e/c.md', AICustomizationSources.extension),
				item('/p/d.md', AICustomizationSources.plugin),
			];
			const filter: IStorageSourceFilter = {
				sources: [AICustomizationSources.local],
			};
			const result = applySourceFilter(items, filter);
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].uri.toString(), URI.file('/w/a.md').toString());
		});

		test('empty sources removes everything', () => {
			const items = [
				item('/w/a.md', AICustomizationSources.local),
				item('/u/b.md', AICustomizationSources.user),
			];
			const filter: IStorageSourceFilter = { sources: [] };
			assert.strictEqual(applySourceFilter(items, filter).length, 0);
		});

		test('empty items returns empty', () => {
			const filter: IStorageSourceFilter = {
				sources: [AICustomizationSources.local, AICustomizationSources.user],
			};
			assert.strictEqual(applySourceFilter([], filter).length, 0);
		});
	});

	suite('combined filtering', () => {
		test('sessions-like filter: hooks show only local', () => {
			const items = [
				item('/w/.github/hooks/pre.json', AICustomizationSources.local),
				item('/home/.claude/settings.json', AICustomizationSources.user),
			];
			const filter: IStorageSourceFilter = {
				sources: [AICustomizationSources.local],
			};
			const result = applySourceFilter(items, filter);
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].source, AICustomizationSources.local);
		});

		test('show multiple sources together', () => {
			const items = [
				item('/w/a.md', AICustomizationSources.local),
				item('/home/.copilot/b.md', AICustomizationSources.user),
				item('/home/.vscode/c.md', AICustomizationSources.user),
				item('/e/d.md', AICustomizationSources.extension),
				item('/p/e.md', AICustomizationSources.plugin),
			];
			const filter: IStorageSourceFilter = {
				sources: [AICustomizationSources.local, AICustomizationSources.user],
			};
			const result = applySourceFilter(items, filter);
			// local + all users kept, extension + plugin excluded
			assert.strictEqual(result.length, 3);
		});

		test('core-like filter: show everything', () => {
			const items = [
				item('/w/a.md', AICustomizationSources.local),
				item('/u/b.md', AICustomizationSources.user),
				item('/e/c.md', AICustomizationSources.extension),
				item('/p/d.md', AICustomizationSources.plugin),
			];
			const filter: IStorageSourceFilter = {
				sources: [AICustomizationSources.local, AICustomizationSources.user, AICustomizationSources.extension, AICustomizationSources.plugin],
			};
			assert.strictEqual(applySourceFilter(items, filter).length, 4);
		});

		test('core-like filter with builtin: extension items pass when both extension and builtin are in sources', () => {
			// Items from the chat extension have storage=extension but groupKey=builtin.
			// The filter operates on storage, so extension items pass through regardless of groupKey.
			const items = [
				item('/w/a.md', AICustomizationSources.local),
				item('/e/builtin-agent.md', AICustomizationSources.extension),
				item('/e/third-party.md', AICustomizationSources.extension),
				item('/b/sessions-builtin.md', AICustomizationSources.builtin),
			];
			const filter: IStorageSourceFilter = {
				sources: [AICustomizationSources.local, AICustomizationSources.extension, AICustomizationSources.builtin],
			};
			const result = applySourceFilter(items, filter);
			assert.strictEqual(result.length, 4);
		});

		test('builtin source is respected independently', () => {
			const items = [
				item('/e/from-extension.md', AICustomizationSources.extension),
				item('/b/from-sessions.md', AICustomizationSources.builtin),
			];
			// Only builtin in sources — extension items excluded
			const filter: IStorageSourceFilter = {
				sources: [AICustomizationSources.builtin],
			};
			const result = applySourceFilter(items, filter);
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].source, AICustomizationSources.builtin);
		});
	});

	suite('type safety', () => {
		test('works with objects that have extra properties', () => {
			const items = [
				{ uri: URI.file('/w/a.md'), source: AICustomizationSources.local, name: 'A', extra: true },
				{ uri: URI.file('/u/b.md'), source: AICustomizationSources.user, name: 'B', extra: false },
			];
			const filter: IStorageSourceFilter = {
				sources: [AICustomizationSources.local],
			};
			const result = applySourceFilter(items, filter);
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].name, 'A');
		});
	});
});
