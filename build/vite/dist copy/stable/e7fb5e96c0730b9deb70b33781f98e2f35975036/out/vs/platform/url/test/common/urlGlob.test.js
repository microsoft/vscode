/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { testUrlMatchesGlob } from '../../common/urlGlob.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
suite('urlGlob', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    suite('testUrlMatchesGlob', () => {
        test('exact match', () => {
            assert.strictEqual(testUrlMatchesGlob('https://example.com', 'https://example.com'), true);
            assert.strictEqual(testUrlMatchesGlob('http://example.com', 'http://example.com'), true);
            assert.strictEqual(testUrlMatchesGlob('https://example.com/path', 'https://example.com/path'), true);
        });
        test('trailing slashes are ignored', () => {
            assert.strictEqual(testUrlMatchesGlob('https://example.com/', 'https://example.com'), true);
            assert.strictEqual(testUrlMatchesGlob('https://example.com', 'https://example.com/'), true);
            assert.strictEqual(testUrlMatchesGlob('https://example.com//', 'https://example.com'), true);
            assert.strictEqual(testUrlMatchesGlob('https://example.com/path/', 'https://example.com/path'), true);
        });
        test('query and fragment are ignored', () => {
            assert.strictEqual(testUrlMatchesGlob('https://example.com?query=value', 'https://example.com'), true);
            assert.strictEqual(testUrlMatchesGlob('https://example.com#fragment', 'https://example.com'), true);
            assert.strictEqual(testUrlMatchesGlob('https://example.com?query=value#fragment', 'https://example.com'), true);
        });
        test('scheme matching', () => {
            assert.strictEqual(testUrlMatchesGlob('https://example.com', 'https://example.com'), true);
            assert.strictEqual(testUrlMatchesGlob('http://example.com', 'https://example.com'), false);
            assert.strictEqual(testUrlMatchesGlob('ftp://example.com', 'https://example.com'), false);
        });
        test('glob without scheme assumes http/https', () => {
            assert.strictEqual(testUrlMatchesGlob('https://example.com', 'example.com'), true);
            assert.strictEqual(testUrlMatchesGlob('http://example.com', 'example.com'), true);
            assert.strictEqual(testUrlMatchesGlob('ftp://example.com', 'example.com'), false);
        });
        test('wildcard matching in path', () => {
            assert.strictEqual(testUrlMatchesGlob('https://example.com/anything', 'https://example.com/*'), true);
            assert.strictEqual(testUrlMatchesGlob('https://example.com/path/to/resource', 'https://example.com/*'), true);
            assert.strictEqual(testUrlMatchesGlob('https://example.com/path/to/resource', 'https://example.com/path/*'), true);
            assert.strictEqual(testUrlMatchesGlob('https://example.com/path/to/resource', 'https://example.com/path/*/resource'), true);
        });
        test('subdomain wildcard matching', () => {
            assert.strictEqual(testUrlMatchesGlob('https://sub.example.com', 'https://*.example.com'), true);
            assert.strictEqual(testUrlMatchesGlob('https://sub.domain.example.com', 'https://*.example.com'), true);
            assert.strictEqual(testUrlMatchesGlob('https://example.com', 'https://*.example.com'), true);
        });
        test('subdomain wildcard must match on dot boundary', () => {
            // Should NOT match: no dot boundary before the domain
            assert.strictEqual(testUrlMatchesGlob('https://notexample.com', 'https://*.example.com'), false);
            assert.strictEqual(testUrlMatchesGlob('https://evil-microsoft.com', 'https://*.microsoft.com'), false);
            assert.strictEqual(testUrlMatchesGlob('https://evilmicrosoft.com', 'https://*.microsoft.com'), false);
            assert.strictEqual(testUrlMatchesGlob('https://evil-example.com', 'https://*.example.com'), false);
            assert.strictEqual(testUrlMatchesGlob('https://myexample.com', 'https://*.example.com'), false);
            assert.strictEqual(testUrlMatchesGlob('https://notexample.com/path', 'https://*.example.com/path'), false);
            // Should match: proper subdomain with dot boundary
            assert.strictEqual(testUrlMatchesGlob('https://sub.microsoft.com', 'https://*.microsoft.com'), true);
            assert.strictEqual(testUrlMatchesGlob('https://a.b.c.microsoft.com', 'https://*.microsoft.com'), true);
            assert.strictEqual(testUrlMatchesGlob('https://microsoft.com', 'https://*.microsoft.com'), true);
            assert.strictEqual(testUrlMatchesGlob('https://sub.example.com/path', 'https://*.example.com/path'), true);
        });
        test('subdomain wildcard without scheme must match on dot boundary', () => {
            assert.strictEqual(testUrlMatchesGlob('https://evil-microsoft.com', '*.microsoft.com'), false);
            assert.strictEqual(testUrlMatchesGlob('http://evil-microsoft.com', '*.microsoft.com'), false);
            assert.strictEqual(testUrlMatchesGlob('https://sub.microsoft.com', '*.microsoft.com'), true);
            assert.strictEqual(testUrlMatchesGlob('http://sub.microsoft.com', '*.microsoft.com'), true);
        });
        test('port matching', () => {
            assert.strictEqual(testUrlMatchesGlob('https://example.com:8080', 'https://example.com:8080'), true);
            assert.strictEqual(testUrlMatchesGlob('https://example.com:8080', 'https://example.com:9090'), false);
            assert.strictEqual(testUrlMatchesGlob('https://example.com', 'https://example.com:8080'), false);
        });
        test('wildcard port matching', () => {
            assert.strictEqual(testUrlMatchesGlob('https://example.com:8080', 'https://example.com:*'), true);
            assert.strictEqual(testUrlMatchesGlob('https://example.com:9090', 'https://example.com:*'), true);
            assert.strictEqual(testUrlMatchesGlob('https://example.com', 'https://example.com:*'), true);
            assert.strictEqual(testUrlMatchesGlob('https://example.com:8080/path', 'https://example.com:*/path'), true);
        });
        test('root path glob', () => {
            assert.strictEqual(testUrlMatchesGlob('https://example.com', 'https://example.com/'), true);
            assert.strictEqual(testUrlMatchesGlob('https://example.com/', 'https://example.com/'), true);
            assert.strictEqual(testUrlMatchesGlob('https://example.com/path', 'https://example.com/'), true);
        });
        test('mismatch cases', () => {
            assert.strictEqual(testUrlMatchesGlob('https://example.com/path', 'https://example.com/other'), false);
            assert.strictEqual(testUrlMatchesGlob('https://example.com', 'https://other.com'), false);
            assert.strictEqual(testUrlMatchesGlob('https://sub.example.com', 'https://example.com'), false);
        });
        test('URI object input', () => {
            const uri = URI.parse('https://example.com/path');
            assert.strictEqual(testUrlMatchesGlob(uri, 'https://example.com/path'), true);
            assert.strictEqual(testUrlMatchesGlob(uri, 'https://example.com/*'), true);
        });
        test('complex patterns', () => {
            assert.strictEqual(testUrlMatchesGlob('https://api.github.com/repos/microsoft/vscode', 'https://*.github.com/repos/*/*'), true);
            assert.strictEqual(testUrlMatchesGlob('https://github.com/microsoft/vscode', 'https://*.github.com/repos/*/*'), false);
            assert.strictEqual(testUrlMatchesGlob('https://api.github.com:443/repos/microsoft/vscode', 'https://*.github.com:*/repos/*/*'), true);
        });
        test('edge cases', () => {
            // Wildcard after authority doesn't match without additional path
            assert.strictEqual(testUrlMatchesGlob('https://example.com', 'https://example.com*'), false);
            assert.strictEqual(testUrlMatchesGlob('https://example.com.extra', 'https://example.com*'), true);
            assert.strictEqual(testUrlMatchesGlob('https://example.com', '*'), true);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXJsR2xvYi50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vdXJsL3Rlc3QvY29tbW9uL3VybEdsb2IudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQzdELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRWhHLEtBQUssQ0FBQyxTQUFTLEVBQUUsR0FBRyxFQUFFO0lBRXJCLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsS0FBSyxDQUFDLG9CQUFvQixFQUFFLEdBQUcsRUFBRTtRQUVoQyxJQUFJLENBQUMsYUFBYSxFQUFFLEdBQUcsRUFBRTtZQUN4QixNQUFNLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLHFCQUFxQixFQUFFLHFCQUFxQixDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDM0YsTUFBTSxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxvQkFBb0IsRUFBRSxvQkFBb0IsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ3pGLE1BQU0sQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsMEJBQTBCLEVBQUUsMEJBQTBCLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN0RyxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyw4QkFBOEIsRUFBRSxHQUFHLEVBQUU7WUFDekMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxzQkFBc0IsRUFBRSxxQkFBcUIsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQzVGLE1BQU0sQ0FBQyxXQUFXLENBQUMsa0JB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