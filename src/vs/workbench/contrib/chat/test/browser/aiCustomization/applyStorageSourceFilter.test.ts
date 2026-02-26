/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { applyStorageSourceFilter, IStorageSourceFilter } from '../../../common/aiCustomizationWorkspaceService.js';

function item(path: string, storage: PromptsStorage): { uri: URI; storage: PromptsStorage } {
	return { uri: URI.file(path), storage };
}

suite('applyStorageSourceFilter', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('source filtering', () => {
		test('keeps items matching sources', () => {
			const items = [
				item('/w/a.md', PromptsStorage.local),
				item('/u/b.md', PromptsStorage.user),
				item('/e/c.md', PromptsStorage.extension),
			];
			const filter: IStorageSourceFilter = {
				sources: [PromptsStorage.local, PromptsStorage.user, PromptsStorage.extension],
			};
			assert.strictEqual(applyStorageSourceFilter(items, filter).length, 3);
		});

		test('removes items not in sources', () => {
			const items = [
				item('/w/a.md', PromptsStorage.local),
				item('/u/b.md', PromptsStorage.user),
				item('/e/c.md', PromptsStorage.extension),
				item('/p/d.md', PromptsStorage.plugin),
			];
			const filter: IStorageSourceFilter = {
				sources: [PromptsStorage.local],
			};
			const result = applyStorageSourceFilter(items, filter);
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].uri.toString(), URI.file('/w/a.md').toString());
		});

		test('empty sources removes everything', () => {
			const items = [
				item('/w/a.md', PromptsStorage.local),
				item('/u/b.md', PromptsStorage.user),
			];
			const filter: IStorageSourceFilter = { sources: [] };
			assert.strictEqual(applyStorageSourceFilter(items, filter).length, 0);
		});

		test('empty items returns empty', () => {
			const filter: IStorageSourceFilter = {
				sources: [PromptsStorage.local, PromptsStorage.user],
			};
			assert.strictEqual(applyStorageSourceFilter([], filter).length, 0);
		});
	});

	suite('includedUserFileRoots filtering', () => {
		test('undefined includedUserFileRoots keeps all user files', () => {
			const items = [
				item('/home/.copilot/a.md', PromptsStorage.user),
				item('/home/.vscode/b.md', PromptsStorage.user),
				item('/home/.claude/c.md', PromptsStorage.user),
			];
			const filter: IStorageSourceFilter = {
				sources: [PromptsStorage.user],
				// includedUserFileRoots not set = allow all
			};
			assert.strictEqual(applyStorageSourceFilter(items, filter).length, 3);
		});

		test('includedUserFileRoots filters user files by root', () => {
			const items = [
				item('/home/.copilot/instructions/a.md', PromptsStorage.user),
				item('/home/.vscode/instructions/b.md', PromptsStorage.user),
				item('/home/.claude/rules/c.md', PromptsStorage.user),
			];
			const filter: IStorageSourceFilter = {
				sources: [PromptsStorage.user],
				includedUserFileRoots: [URI.file('/home/.copilot'), URI.file('/home/.claude')],
			};
			const result = applyStorageSourceFilter(items, filter);
			assert.strictEqual(result.length, 2);
			assert.strictEqual(result[0].uri.toString(), URI.file('/home/.copilot/instructions/a.md').toString());
			assert.strictEqual(result[1].uri.toString(), URI.file('/home/.claude/rules/c.md').toString());
		});

		test('includedUserFileRoots does not affect non-user items', () => {
			const items = [
				item('/w/a.md', PromptsStorage.local),
				item('/e/b.md', PromptsStorage.extension),
				item('/home/.copilot/c.md', PromptsStorage.user),
			];
			const filter: IStorageSourceFilter = {
				sources: [PromptsStorage.local, PromptsStorage.extension, PromptsStorage.user],
				includedUserFileRoots: [URI.file('/home/.copilot')],
			};
			const result = applyStorageSourceFilter(items, filter);
			// local + extension kept (not affected by user root filter), user kept (matches root)
			assert.strictEqual(result.length, 3);
		});

		test('empty includedUserFileRoots removes all user files', () => {
			const items = [
				item('/w/a.md', PromptsStorage.local),
				item('/home/.copilot/b.md', PromptsStorage.user),
			];
			const filter: IStorageSourceFilter = {
				sources: [PromptsStorage.local, PromptsStorage.user],
				includedUserFileRoots: [], // explicit empty = no user files allowed
			};
			const result = applyStorageSourceFilter(items, filter);
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].storage, PromptsStorage.local);
		});

		test('user file at exact root is included', () => {
			const items = [
				item('/home/.copilot', PromptsStorage.user),
			];
			const filter: IStorageSourceFilter = {
				sources: [PromptsStorage.user],
				includedUserFileRoots: [URI.file('/home/.copilot')],
			};
			assert.strictEqual(applyStorageSourceFilter(items, filter).length, 1);
		});

		test('user file outside all roots is excluded', () => {
			const items = [
				item('/other/path/a.md', PromptsStorage.user),
			];
			const filter: IStorageSourceFilter = {
				sources: [PromptsStorage.user],
				includedUserFileRoots: [URI.file('/home/.copilot'), URI.file('/home/.claude')],
			};
			assert.strictEqual(applyStorageSourceFilter(items, filter).length, 0);
		});

		test('deeply nested user file under root is included', () => {
			const items = [
				item('/home/.copilot/instructions/sub/deep/a.md', PromptsStorage.user),
			];
			const filter: IStorageSourceFilter = {
				sources: [PromptsStorage.user],
				includedUserFileRoots: [URI.file('/home/.copilot')],
			};
			assert.strictEqual(applyStorageSourceFilter(items, filter).length, 1);
		});
	});

	suite('combined filtering', () => {
		test('source filter + user root filter applied together', () => {
			const items = [
				item('/w/a.md', PromptsStorage.local),
				item('/home/.copilot/b.md', PromptsStorage.user),
				item('/home/.vscode/c.md', PromptsStorage.user),
				item('/e/d.md', PromptsStorage.extension),
				item('/p/e.md', PromptsStorage.plugin),
			];
			const filter: IStorageSourceFilter = {
				sources: [PromptsStorage.local, PromptsStorage.user],
				includedUserFileRoots: [URI.file('/home/.copilot')],
			};
			const result = applyStorageSourceFilter(items, filter);
			// local (kept), .copilot user (kept), .vscode user (excluded by root),
			// extension (excluded by source), plugin (excluded by source)
			assert.strictEqual(result.length, 2);
		});

		test('sessions-like filter: hooks show only local', () => {
			const items = [
				item('/w/.github/hooks/pre.json', PromptsStorage.local),
				item('/home/.claude/settings.json', PromptsStorage.user),
			];
			const filter: IStorageSourceFilter = {
				sources: [PromptsStorage.local],
			};
			const result = applyStorageSourceFilter(items, filter);
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].storage, PromptsStorage.local);
		});

		test('sessions-like filter: instructions show only CLI roots', () => {
			const items = [
				item('/w/.github/instructions/a.md', PromptsStorage.local),
				item('/home/.copilot/instructions/b.md', PromptsStorage.user),
				item('/home/.claude/rules/c.md', PromptsStorage.user),
				item('/home/.vscode-profile/instructions/d.md', PromptsStorage.user),
			];
			const filter: IStorageSourceFilter = {
				sources: [PromptsStorage.local, PromptsStorage.user],
				includedUserFileRoots: [
					URI.file('/home/.copilot'),
					URI.file('/home/.claude'),
					URI.file('/home/.agents'),
				],
			};
			const result = applyStorageSourceFilter(items, filter);
			// local + .copilot + .claude pass; .vscode-profile excluded
			assert.strictEqual(result.length, 3);
		});

		test('core-like filter: show everything', () => {
			const items = [
				item('/w/a.md', PromptsStorage.local),
				item('/u/b.md', PromptsStorage.user),
				item('/e/c.md', PromptsStorage.extension),
				item('/p/d.md', PromptsStorage.plugin),
			];
			const filter: IStorageSourceFilter = {
				sources: [PromptsStorage.local, PromptsStorage.user, PromptsStorage.extension, PromptsStorage.plugin],
			};
			assert.strictEqual(applyStorageSourceFilter(items, filter).length, 4);
		});
	});

	suite('type safety', () => {
		test('works with objects that have extra properties', () => {
			const items = [
				{ uri: URI.file('/w/a.md'), storage: PromptsStorage.local, name: 'A', extra: true },
				{ uri: URI.file('/u/b.md'), storage: PromptsStorage.user, name: 'B', extra: false },
			];
			const filter: IStorageSourceFilter = {
				sources: [PromptsStorage.local],
			};
			const result = applyStorageSourceFilter(items, filter);
			assert.strictEqual(result.length, 1);
			assert.strictEqual((result[0] as typeof items[0]).name, 'A');
		});
	});
});
