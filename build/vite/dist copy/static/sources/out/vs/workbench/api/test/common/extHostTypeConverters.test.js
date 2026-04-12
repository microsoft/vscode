/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ChatRequestModeInstructions, IconPath } from '../../common/extHostTypeConverters.js';
import { ThemeColor, ThemeIcon } from '../../common/extHostTypes.js';
suite('extHostTypeConverters', function () {
    ensureNoDisposablesAreLeakedInTestSuite();
    suite('IconPath', function () {
        suite('from', function () {
            test('undefined', function () {
                assert.strictEqual(IconPath.from(undefined), undefined);
            });
            test('ThemeIcon', function () {
                const themeIcon = new ThemeIcon('account', new ThemeColor('testing.iconForeground'));
                assert.strictEqual(IconPath.from(themeIcon), themeIcon);
            });
            test('URI', function () {
                const uri = URI.parse('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
                assert.strictEqual(IconPath.from(uri), uri);
            });
            test('string', function () {
                const str = '/path/to/icon.png';
                // eslint-disable-next-line local/code-no-any-casts
                const r1 = IconPath.from(str);
                assert.ok(URI.isUri(r1));
                assert.strictEqual(r1.scheme, 'file');
                assert.strictEqual(r1.path, str);
            });
            test('dark only', function () {
                const input = { dark: URI.file('/path/to/dark.png') };
                // eslint-disable-next-line local/code-no-any-casts
                const result = IconPath.from(input);
                assert.strictEqual(typeof result, 'object');
                assert.ok('light' in result && 'dark' in result);
                assert.ok(URI.isUri(result.light));
                assert.ok(URI.isUri(result.dark));
                assert.strictEqual(result.dark.toString(), input.dark.toString());
                assert.strictEqual(result.light.toString(), input.dark.toString());
            });
            test('dark/light', function () {
                const input = { light: URI.file('/path/to/light.png'), dark: URI.file('/path/to/dark.png') };
                const result = IconPath.from(input);
                assert.strictEqual(typeof result, 'object');
                assert.ok('light' in result && 'dark' in result);
                assert.ok(URI.isUri(result.light));
                assert.ok(URI.isUri(result.dark));
                assert.strictEqual(result.dark.toString(), input.dark.toString());
                assert.strictEqual(result.light.toString(), input.light.toString());
            });
            test('dark/light strings', function () {
                const input = { light: '/path/to/light.png', dark: '/path/to/dark.png' };
                // eslint-disable-next-line local/code-no-any-casts
                const result = IconPath.from(input);
                assert.strictEqual(typeof result, 'object');
                assert.ok('light' in result && 'dark' in result);
                assert.ok(URI.isUri(result.light));
                assert.ok(URI.isUri(result.dark));
                assert.strictEqual(result.dark.path, input.dark);
                assert.strictEqual(result.light.path, input.light);
            });
            test('invalid object', function () {
                const invalidObject = { foo: 'bar' };
                // eslint-disable-next-line local/code-no-any-casts
                const result = IconPath.from(invalidObject);
                assert.strictEqual(result, undefined);
            });
            test('light only', function () {
                const input = { light: URI.file('/path/to/light.png') };
                // eslint-disable-next-line local/code-no-any-casts
                const result = IconPath.from(input);
                assert.strictEqual(result, undefined);
            });
        });
        suite('to', function () {
            test('undefined', function () {
                assert.strictEqual(IconPath.to(undefined), undefined);
            });
            test('ThemeIcon', function () {
                const themeIcon = new ThemeIcon('account');
                assert.strictEqual(IconPath.to(themeIcon), themeIcon);
            });
            test('URI', function () {
                const uri = { scheme: 'data', path: 'image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' };
                const result = IconPath.to(uri);
                assert.ok(URI.isUri(result));
                assert.strictEqual(result.toString(), URI.revive(uri).toString());
            });
            test('dark/light', function () {
                const input = {
                    light: { scheme: 'file', path: '/path/to/light.png' },
                    dark: { scheme: 'file', path: '/path/to/dark.png' }
                };
                const result = IconPath.to(input);
                assert.strictEqual(typeof result, 'object');
                assert.ok('light' in result && 'dark' in result);
                assert.ok(URI.isUri(result.light));
                assert.ok(URI.isUri(result.dark));
                assert.strictEqual(result.dark.toString(), URI.revive(input.dark).toString());
                assert.strictEqual(result.light.toString(), URI.revive(input.light).toString());
            });
        });
    });
    suite('ChatRequestModeInstructions', function () {
        test('to returns undefined for undefined input', function () {
            assert.strictEqual(ChatRequestModeInstructions.to(undefined), undefined);
        });
        test('from returns undefined for undefined input', function () {
            assert.strictEqual(ChatRequestModeInstructions.from(undefined), undefined);
        });
        test('to converts IChatRequestModeInstructions to API type', function () {
            const uri = URI.parse('file:///custom-agent');
            const input = {
                uri,
                name: 'test-mode',
                content: 'test content',
                toolReferences: [{
                        kind: 'tool',
                        id: 'tool1',
                        name: 'tool1',
                        value: undefined,
                        range: { start: 0, endExclusive: 5 },
                    }],
                metadata: { key: 'value' },
                isBuiltin: false,
            };
            const result = ChatRequestModeInstructions.to(input);
            assert.deepStrictEqual(result, {
                uri,
                name: 'test-mode',
                content: 'test content',
                toolReferences: [{ name: 'tool1', range: [0, 5] }],
                metadata: { key: 'value' },
                isBuiltin: false,
            });
        });
        test('to handles Dto with UriComponents', function () {
            const input = {
                uri: { scheme: 'file', path: '/custom-agent' },
                name: 'test-mode',
                content: 'test content',
                toolReferences: [],
                metadata: undefined,
                isBuiltin: true,
            };
            const result = ChatRequestModeInstructions.to(input);
            assert.ok(URI.isUri(result.uri));
            assert.strictEqual(result.name, 'test-mode');
            assert.strictEqual(result.isBuiltin, true);
            assert.deepStrictEqual(result.toolReferences, []);
        });
        test('from converts API type to IChatRequestModeInstructions', function () {
            const uri = URI.parse('file:///custom-agent');
            const input = {
                uri,
                name: 'test-mode',
                content: 'test content',
                toolReferences: [{ name: 'tool1', range: [0, 5] }],
                metadata: { key: 'value' },
                isBuiltin: false,
            };
            const result = ChatRequestModeInstructions.from(input);
            assert.deepStrictEqual(result, {
                uri,
                name: 'test-mode',
                content: 'test content',
                toolReferences: [{
                        kind: 'tool',
                        id: 'tool1',
                        name: 'tool1',
                        value: undefined,
                        range: { start: 0, endExclusive: 5 },
                    }],
                metadata: { key: 'value' },
                isBuiltin: false,
            });
        });
        test('from handles missing toolReferences', function () {
            const input = {
                name: 'test-mode',
                content: 'test content',
            };
            const result = ChatRequestModeInstructions.from(input);
            assert.deepStrictEqual(result.toolReferences, []);
        });
        test('roundtrip from -> to preserves data', function () {
            const uri = URI.parse('file:///custom-agent');
            const apiInput = {
                uri,
                name: 'roundtrip-mode',
                content: 'roundtrip content',
                toolReferences: [
                    { name: 'tool1' },
                    { name: 'tool2', range: [10, 20] },
                ],
                metadata: { flag: true },
                isBuiltin: false,
            };
            const internal = ChatRequestModeInstructions.from(apiInput);
            const backToApi = ChatRequestModeInstructions.to(internal);
            assert.strictEqual(backToApi.name, apiInput.name);
            assert.strictEqual(backToApi.content, apiInput.content);
            assert.strictEqual(backToApi.isBuiltin, apiInput.isBuiltin);
            assert.strictEqual(backToApi.uri?.toString(), uri.toString());
            assert.strictEqual(backToApi.toolReferences?.length, 2);
            assert.strictEqual(backToApi.toolReferences?.[0].name, 'tool1');
            assert.strictEqual(backToApi.toolReferences?.[0].range, undefined);
            assert.strictEqual(backToApi.toolReferences?.[1].name, 'tool2');
            assert.deepStrictEqual(backToApi.toolReferences?.[1].range, [10, 20]);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdFR5cGVDb252ZXJ0ZXJzLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL3Rlc3QvY29tbW9uL2V4dEhvc3RUeXBlQ29udmVydGVycy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsR0FBRyxFQUFpQixNQUFNLGdDQUFnQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRWhHLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxRQUFRLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUM5RixPQUFPLEVBQUUsVUFBVSxFQUFFLFNBQVMsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBSXJFLEtBQUssQ0FBQyx1QkFBdUIsRUFBRTtJQUM5Qix1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLEtBQUssQ0FBQyxVQUFVLEVBQUU7UUFDakIsS0FBSyxDQUFDLE1BQU0sRUFBRTtZQUNiLElBQUksQ0FBQyxXQUFXLEVBQUU7Z0JBQ2pCLE1BQU0sQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUN6RCxDQUFDLENBQUMsQ0FBQztZQUVILElBQUksQ0FBQyxXQUFXLEVBQUU7Z0JBQ2pCLE1BQU0sU0FBUyxHQUFHLElBQUksU0FBUyxDQUFDLFNBQVMsRUFBRSxJQUFJLFVBQVUsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLENBQUM7Z0JBQ3JGLE1BQU0sQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUN6RCxDQUFDLENBQUMsQ0FBQztZQUVILElBQUksQ0FBQyxLQUFLLEVB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