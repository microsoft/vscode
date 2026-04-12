/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { applyStorageSourceFilter, BUILTIN_STORAGE } from '../../../common/aiCustomizationWorkspaceService.js';
function item(path, storage) {
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
            const filter = {
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
            const filter = {
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
            const filter = { sources: [] };
            assert.strictEqual(applyStorageSourceFilter(items, filter).length, 0);
        });
        test('empty items returns empty', () => {
            const filter = {
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
            const filter = {
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
            const filter = {
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
            const filter = {
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
            const filter = {
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
            const filter = {
                sources: [PromptsStorage.user],
                includedUserFileRoots: [URI.file('/home/.copilot')],
            };
            assert.strictEqual(applyStorageSourceFilter(items, filter).length, 1);
        });
        test('user file outside all roots is excluded', () => {
            const items = [
                item('/other/path/a.md', PromptsStorage.user),
            ];
            const filter = {
                sources: [PromptsStorage.user],
                includedUserFileRoots: [URI.file('/home/.copilot'), URI.file('/home/.claude')],
            };
            assert.strictEqual(applyStorageSourceFilter(items, filter).length, 0);
        });
        test('deeply nested user file under root is included', () => {
            const items = [
                item('/home/.copilot/instructions/sub/deep/a.md', PromptsStorage.user),
            ];
            const filter = {
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
            const filter = {
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
            const filter = {
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
            const filter = {
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
            const filter = {
                sources: [PromptsStorage.local, PromptsStorage.user, PromptsStorage.extension, PromptsStorage.plugin],
            };
            assert.strictEqual(applyStorageSourceFilter(items, filter).length, 4);
        });
        test('core-like filter with builtin: extension items pass when both extension and builtin are in sources', () => {
            // Items from the chat extension have storage=extension but groupKey=builtin.
            // The filter operates on storage, so extension items pass through regardless of groupKey.
            const items = [
                item('/w/a.md', PromptsStorage.local),
                item('/e/builtin-agent.md', PromptsStorage.extension),
                item('/e/third-party.md', PromptsStorage.extension),
                item('/b/sessions-builtin.md', BUILTIN_STORAGE),
            ];
            const filter = {
                sources: [PromptsStorage.local, PromptsStorage.extension, BUILTIN_STORAGE],
            };
            const result = applyStorageSourceFilter(items, filter);
            assert.strictEqual(result.length, 4);
        });
        test('builtin source is respected independently', () => {
            const items = [
                item('/e/from-extension.md', PromptsStorage.extension),
                item('/b/from-sessions.md', BUILTIN_STORAGE),
            ];
            // Only builtin in sources — extension items excluded
            const filter = {
                sources: [BUILTIN_STORAGE],
            };
            const result = applyStorageSourceFilter(items, filter);
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].storage, BUILTIN_STORAGE);
        });
    });
    suite('type safety', () => {
        test('works with objects that have extra properties', () => {
            const items = [
                { uri: URI.file('/w/a.md'), storage: PromptsStorage.local, name: 'A', extra: true },
                { uri: URI.file('/u/b.md'), storage: PromptsStorage.user, name: 'B', extra: false },
            ];
            const filter = {
                sources: [PromptsStorage.local],
            };
            const result = applyStorageSourceFilter(items, filter);
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].name, 'A');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwbHlTdG9yYWdlU291cmNlRmlsdGVyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvYnJvd3Nlci9haUN1c3RvbWl6YXRpb24vYXBwbHlTdG9yYWdlU291cmNlRmlsdGVyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDeEYsT0FBTyxFQUFFLHdCQUF3QixFQUFFLGVBQWUsRUFBd0IsTUFBTSxvREFBb0QsQ0FBQztBQUVySSxTQUFTLElBQUksQ0FBQyxJQUFZLEVBQUUsT0FBZ0M7SUFDM0QsT0FBTyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLE9BQU8sRUFBRSxDQUFDO0FBQ3pDLENBQUM7QUFFRCxLQUFLLENBQUMsMEJBQTBCLEVBQUUsR0FBRyxFQUFFO0lBQ3RDLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsS0FBSyxDQUFDLGtCQUFrQixFQUFFLEdBQUcsRUFBRTtRQUM5QixJQUFJLENBQUMsOEJBQThCLEVBQUUsR0FBRyxFQUFFO1lBQ3pDLE1BQU0sS0FBSyxHQUFHO2dCQUNiLElBQUksQ0FBQyxTQUFTLEVBQUUsY0FBYyxDQUFDLEtBQUssQ0FBQztnQkFDckMsSUFBSSxDQUFDLFNBQVMsRUFBRSxjQUFjLENBQUMsSUFBSSxDQUFDO2dCQUNwQyxJQUFJLENBQUMsU0FBUyxFQUFFLGNBQWMsQ0FBQyxTQUFTLENBQUM7YUFDekMsQ0FBQztZ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