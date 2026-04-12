/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { reviveIdentifier, hasWorkspaceFileExtension, isWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, toWorkspaceIdentifier, isEmptyWorkspaceIdentifier } from '../../../workspace/common/workspace.js';
suite('Workspaces', () => {
    test('reviveIdentifier', () => {
        const serializedWorkspaceIdentifier = { id: 'id', configPath: URI.file('foo').toJSON() };
        assert.strictEqual(isWorkspaceIdentifier(reviveIdentifier(serializedWorkspaceIdentifier)), true);
        const serializedSingleFolderWorkspaceIdentifier = { id: 'id', uri: URI.file('foo').toJSON() };
        assert.strictEqual(isSingleFolderWorkspaceIdentifier(reviveIdentifier(serializedSingleFolderWorkspaceIdentifier)), true);
        const serializedEmptyWorkspaceIdentifier = { id: 'id' };
        assert.strictEqual(reviveIdentifier(serializedEmptyWorkspaceIdentifier).id, serializedEmptyWorkspaceIdentifier.id);
        assert.strictEqual(isWorkspaceIdentifier(serializedEmptyWorkspaceIdentifier), false);
        assert.strictEqual(isSingleFolderWorkspaceIdentifier(serializedEmptyWorkspaceIdentifier), false);
        assert.strictEqual(reviveIdentifier(undefined), undefined);
    });
    test('hasWorkspaceFileExtension', () => {
        assert.strictEqual(hasWorkspaceFileExtension('something'), false);
        assert.strictEqual(hasWorkspaceFileExtension('something.code-workspace'), true);
    });
    test('toWorkspaceIdentifier', () => {
        let identifier = toWorkspaceIdentifier({ id: 'id', folders: [] });
        assert.ok(identifier);
        assert.ok(isEmptyWorkspaceIdentifier(identifier));
        assert.ok(!isWorkspaceIdentifier(identifier));
        assert.ok(!isWorkspaceIdentifier(identifier));
        identifier = toWorkspaceIdentifier({ id: 'id', folders: [{ index: 0, name: 'test', toResource: () => URI.file('test'), uri: URI.file('test') }] });
        assert.ok(identifier);
        assert.ok(isSingleFolderWorkspaceIdentifier(identifier));
        assert.ok(!isWorkspaceIdentifier(identifier));
        identifier = toWorkspaceIdentifier({ id: 'id', configuration: URI.file('test.code-workspace'), folders: [] });
        assert.ok(identifier);
        assert.ok(!isSingleFolderWorkspaceIdentifier(identifier));
        assert.ok(isWorkspaceIdentifier(identifier));
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya3NwYWNlcy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vd29ya3NwYWNlcy90ZXN0L2NvbW1vbi93b3Jrc3BhY2VzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRyxPQUFPLEVBQThFLGdCQUFnQixFQUFFLHlCQUF5QixFQUFFLHFCQUFxQixFQUFFLGlDQUFpQyxFQUE2QixxQkFBcUIsRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRXpULEtBQUssQ0FBQyxZQUFZLEVBQUUsR0FBRyxFQUFFO0lBRXhCLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxHQUFHLEVBQUU7UUFDN0IsTUFBTSw2QkFBNkIsR0FBbUMsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUM7UUFDekgsTUFBTSxDQUFDLFdBQVcsQ0FBQyxxQkFBcUIsQ0FBQyxnQkFBZ0IsQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFakcsTUFBTSx5Q0FBeUMsR0FBK0MsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUM7UUFDMUksTUFBTSxDQUFDLFdBQVcsQ0FBQyxpQ0FBaUMsQ0FBQyxnQkFBZ0IsQ0FBQyx5Q0FBeUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENB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