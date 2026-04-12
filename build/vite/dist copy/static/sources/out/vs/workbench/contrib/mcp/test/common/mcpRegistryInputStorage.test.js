/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { TestSecretStorageService } from '../../../../../platform/secrets/test/common/testSecretStorageService.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { McpRegistryInputStorage } from '../../common/mcpRegistryInputStorage.js';
suite('Workbench - MCP - RegistryInputStorage', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let testStorageService;
    let testSecretStorageService;
    let testLogService;
    let mcpInputStorage;
    setup(() => {
        testStorageService = store.add(new TestStorageService());
        testSecretStorageService = new TestSecretStorageService();
        testLogService = store.add(new NullLogService());
        // Create the input storage with APPLICATION scope
        mcpInputStorage = store.add(new McpRegistryInputStorage(-1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */, testStorageService, testSecretStorageService, testLogService));
    });
    test('setPlainText stores values that can be retrieved with getMap', async () => {
        const values = {
            'key1': { value: 'value1' },
            'key2': { value: 'value2' }
        };
        await mcpInputStorage.setPlainText(values);
        const result = await mcpInputStorage.getMap();
        assert.strictEqual(result.key1.value, 'value1');
        assert.strictEqual(result.key2.value, 'value2');
    });
    test('setSecrets stores encrypted values that can be retrieved with getMap', async () => {
        const secrets = {
            'secretKey1': { value: 'secretValue1' },
            'secretKey2': { value: 'secretValue2' }
        };
        await mcpInputStorage.setSecrets(secrets);
        const result = await mcpInputStorage.getMap();
        assert.strictEqual(result.secretKey1.value, 'secretValue1');
        assert.strictEqual(result.secretKey2.value, 'secretValue2');
    });
    test('getMap returns combined plain text and secret values', async () => {
        await mcpInputStorage.setPlainText({
            'plainKey': { value: 'plainValue' }
        });
        await mcpInputStorage.setSecrets({
            'secretKey': { value: 'secretValue' }
        });
        const result = await mcpInputStorage.getMap();
        assert.strictEqual(result.plainKey.value, 'plainValue');
        assert.strictEqual(result.secretKey.value, 'secretValue');
    });
    test('clear removes specific values', async () => {
        await mcpInputStorage.setPlainText({
            'key1': { value: 'value1' },
            'key2': { value: 'value2' }
        });
        await mcpInputStorage.setSecrets({
            'secretKey1': { value: 'secretValue1' },
            'secretKey2': { value: 'secretValue2' }
        });
        // Clear one plain and one secret value
        await mcpInputStorage.clear('key1');
        await mcpInputStorage.clear('secretKey1');
        const result = await mcpInputStorage.getMap();
        assert.strictEqual(result.key1, undefined);
        assert.strictEqual(result.key2.value, 'value2');
        assert.strictEqual(result.secretKey1, undefined);
        assert.strictEqual(result.secretKey2.value, 'secretValue2');
    });
    test('clearAll removes all values', async () => {
        await mcpInputStorage.setPlainText({
            'key1': { value: 'value1' }
        });
        await mcpInputStorage.setSecrets({
            'secretKey1': { value: 'secretValue1' }
        });
        mcpInputStorage.clearAll();
        const result = await mcpInputStorage.getMap();
        assert.deepStrictEqual(result, {});
    });
    test('updates to plain text values overwrite existing values', async () => {
        await mcpInputStorage.setPlainText({
            'key1': { value: 'value1' },
            'key2': { value: 'value2' }
        });
        await mcpInputStorage.setPlainText({
            'key1': { value: 'updatedValue1' }
        });
        const result = await mcpInputStorage.getMap();
        assert.strictEqual(result.key1.value, 'updatedValue1');
        assert.strictEqual(result.key2.value, 'value2');
    });
    test('updates to secret values overwrite existing values', async () => {
        await mcpInputStorage.setSecrets({
            'secretKey1': { value: 'secretValue1' },
            'secretKey2': { value: 'secretValue2' }
        });
        await mcpInputStorage.setSecrets({
            'secretKey1': { value: 'updatedSecretValue1' }
        });
        const result = await mcpInputStorage.getMap();
        assert.strictEqual(result.secretKey1.value, 'updatedSecretValue1');
        assert.strictEqual(result.secretKey2.value, 'secretValue2');
    });
    test('storage persists values across instances', async () => {
        // Set values on first instance
        await mcpInputStorage.setPlainText({
            'key1': { value: 'value1' }
        });
        await mcpInputStorage.setSecrets({
            'secretKey1': { value: 'secretValue1' }
        });
        await testStorageService.flush();
        // Create a second instance that should have access to the same storage
        const secondInstance = store.add(new McpRegistryInputStorage(-1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */, testStorageService, testSecretStorageService, testLogService));
        const result = await secondInstance.getMap();
        assert.strictEqual(result.key1.value, 'value1');
        assert.strictEqual(result.secretKey1.value, 'secretValue1');
        assert.ok(!testStorageService.get('mcpInputs', -1 /* StorageScope.APPLICATION */)?.includes('secretValue1'));
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwUmVnaXN0cnlJbnB1dFN0b3JhZ2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL21jcC90ZXN0L2NvbW1vbi9tY3BSZWdpc3RyeUlucHV0U3RvcmFnZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQ2pDLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBZSxjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUN4RixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx5RUFBeUUsQ0FBQztBQUVuSCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUN0RixPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUVsRixLQUFLLENBQUMsd0NBQXdDLEVBQUUsR0FBRyxFQUFFO0lBQ3BELE1BQU0sS0FBSyxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFFeEQsSUFBSSxrQkFBc0MsQ0FBQztJQUMzQyxJQUFJLHdCQUFrRCxDQUFDO0lBQ3ZELElBQUksY0FBMkIsQ0FBQztJQUNoQyxJQUFJLGVBQXdDLENBQUM7SUFFN0MsS0FBSyxDQUFDLEdBQUcsRUFBRTtRQUNWLGtCQUFrQixHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxrQkFBa0IsRUFBRSxDQUFDLENBQUM7UUFDekQsd0JBQXdCLEdBQUcsSUFBSSx3QkFBd0IsRUFBRSxDQUFDO1FBQzFELGNBQWMsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksY0FBYyxFQUFFLENBQUMsQ0FBQztRQUVqRCxrREFBa0Q7UUFDbEQsZUFBZSxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSx1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