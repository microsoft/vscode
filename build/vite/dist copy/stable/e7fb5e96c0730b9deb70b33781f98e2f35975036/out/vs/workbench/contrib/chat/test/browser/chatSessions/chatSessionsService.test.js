/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChatSessionsService } from '../../../browser/chatSessions/chatSessions.contribution.js';
import { ChatSessionOptionsMap } from '../../../common/chatSessionsService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
suite.skip('ChatSessionsService', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let chatSessionsService;
    setup(() => {
        const instantiationService = store.add(workbenchInstantiationService(undefined, store));
        chatSessionsService = store.add(instantiationService.createInstance(ChatSessionsService));
    });
    suite('extractFileNameFromLink', () => {
        function callExtractFileNameFromLink(filePath) {
            return chatSessionsService['extractFileNameFromLink'](filePath);
        }
        test('should extract filename from markdown link with link text', () => {
            const input = 'Read [README](file:///path/to/README.md) for more info';
            const result = callExtractFileNameFromLink(input);
            assert.strictEqual(result, 'Read README for more info');
        });
        test('should extract filename from markdown link without link text', () => {
            const input = 'Read [](file:///index.js) for instructions';
            const result = callExtractFileNameFromLink(input);
            assert.strictEqual(result, 'Read index.js for instructions');
        });
        test('should extract filename from markdown link with empty link text', () => {
            const input = 'Check [  ](file:///config.json) settings';
            const result = callExtractFileNameFromLink(input);
            assert.strictEqual(result, 'Check config.json settings');
        });
        test('should handle multiple file links in same string', () => {
            const input = 'See [main](file:///main.js) and [utils](file:///utils/helper.ts)';
            const result = callExtractFileNameFromLink(input);
            assert.strictEqual(result, 'See main and utils');
        });
        test('should handle file path without extension', () => {
            const input = 'Open [](file:///src/components/Button)';
            const result = callExtractFileNameFromLink(input);
            assert.strictEqual(result, 'Open Button');
        });
        test('should handle deep file paths', () => {
            const input = 'Edit [](file:///very/deep/nested/path/to/file.tsx)';
            const result = callExtractFileNameFromLink(input);
            assert.strictEqual(result, 'Edit file.tsx');
        });
        test('should handle file path that is just a filename', () => {
            const input = 'View [script](file:///script.py)';
            const result = callExtractFileNameFromLink(input);
            assert.strictEqual(result, 'View script');
        });
        test('should handle link text with special characters', () => {
            const input = 'See [App.js (main)](file:///App.js)';
            const result = callExtractFileNameFromLink(input);
            assert.strictEqual(result, 'See App.js (main)');
        });
        test('should return original string if no file links present', () => {
            const input = 'This is just regular text with no links';
            const result = callExtractFileNameFromLink(input);
            assert.strictEqual(result, 'This is just regular text with no links');
        });
        test('should handle mixed content with file links and regular text', () => {
            const input = 'Check [config](file:///config.yml) and visit https://example.com';
            const result = callExtractFileNameFromLink(input);
            assert.strictEqual(result, 'Check config and visit https://example.com');
        });
        test('should handle file path with query parameters or fragments', () => {
            const input = 'Open [](file:///index.html?param=value#section)';
            const result = callExtractFileNameFromLink(input);
            assert.strictEqual(result, 'Open index.html?param=value#section');
        });
        test('should handle Windows-style paths', () => {
            const input = 'Edit [](file:///C:/Users/user/Documents/file.txt)';
            const result = callExtractFileNameFromLink(input);
            assert.strictEqual(result, 'Edit file.txt');
        });
        test('should preserve whitespace around replacements', () => {
            const input = '   Check [](file:///test.js)   ';
            const result = callExtractFileNameFromLink(input);
            assert.strictEqual(result, '   Check test.js   ');
        });
    });
});
suite('ChatSessionOptionsMap', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    suite('toStrValueArray', () => {
        test('should return undefined for undefined input', () => {
            assert.strictEqual(ChatSessionOptionsMap.toStrValueArray(undefined), undefined);
        });
        test('should convert a Map to an array of {optionId, value}', () => {
            const map = new Map([['models', 'gpt-4'], ['repo', 'my-repo']]);
            assert.deepStrictEqual(ChatSessionOptionsMap.toStrValueArray(map), [
                { optionId: 'models', value: 'gpt-4' },
                { optionId: 'repo', value: 'my-repo' },
            ]);
        });
        test('should extract .id from IChatSessionProviderOptionItem values', () => {
            const map = new Map([
                ['agent', { id: 'copilot', name: 'Copilot' }],
            ]);
            assert.deepStrictEqual(ChatSessionOptionsMap.toStrValueArray(map), [
                { optionId: 'agent', value: 'copilot' },
            ]);
        });
        test('should handle a plain object as if it were a record (defensive fallback)', () => {
            // Simulates a Map that lost its prototype during serialization
            const plainObject = { models: 'gpt-4', repo: 'my-repo' };
            assert.deepStrictEqual(ChatSessionOptionsMap.toStrValueArray(plainObject), [
                { optionId: 'models', value: 'gpt-4' },
                { optionId: 'repo', value: 'my-repo' },
            ]);
        });
    });
    suite('toRecord', () => {
        test('should convert a Map to a record', () => {
            const map = new Map([['models', 'gpt-4']]);
            const record = ChatSessionOptionsMap.toRecord(map);
            assert.strictEqual(record['models'], 'gpt-4');
        });
        test('should handle a plain object as if it were a record (defensive fallback)', () => {
            const plainObject = { models: 'gpt-4' };
            const record = ChatSessionOptionsMap.toRecord(plainObject);
            assert.strictEqual(record['models'], 'gpt-4');
        });
    });
    suite('fromRecord', () => {
        test('should convert a record to a Map', () => {
            const map = ChatSessionOptionsMap.fromRecord({ models: 'gpt-4', repo: 'my-repo' });
            assert.strictEqual(map.get('models'), 'gpt-4');
            assert.strictEqual(map.get('repo'), 'my-repo');
            assert.strictEqual(map.size, 2);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFNlc3Npb25zU2VydmljZS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2Jyb3dzZXIvY2hhdFNlc3Npb25zL2NoYXRTZXNzaW9uc1NlcnZpY2UudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDdEcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDakcsT0FBTyxFQUFFLHFCQUFxQixFQUFpQyxNQUFNLHdDQUF3QyxDQUFDO0FBQzlHLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBRXJHLEtBQUssQ0FBQyxJQUFJLENBQUMscUJBQXFCLEVBQUUsR0FBRyxFQUFFO0lBQ3RDLE1BQU0sS0FBSyxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFFeEQsSUFBSSxtQkFBd0MsQ0FBQztJQUU3QyxLQUFLLENBQUMsR0FBRyxFQUFFO1FBQ1YsTUFBTSxvQkFBb0IsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLDZCQUE2QixDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQ3hGLG1CQUFtQixHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQztJQUMzRixDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQyx5QkFBeUIsRUFBRSxHQUFHLEVBQUU7UUFFckMsU0FBUywyQkFBMkIsQ0FBQyxRQUFnQjtZQUdwRCxPQUFRLG1CQUEyRCxDQUFDLHlCQUF5QixDQUFDLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDMUcsQ0FB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