/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ColorThemeData } from '../../common/colorThemeData.js';
import assert from 'assert';
import { TokenStyle, getTokenClassificationRegistry } from '../../../../../platform/theme/common/tokenClassificationRegistry.js';
import { Color } from '../../../../../base/common/color.js';
import { isString } from '../../../../../base/common/types.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { DiskFileSystemProvider } from '../../../../../platform/files/node/diskFileSystemProvider.js';
import { FileAccess, Schemas } from '../../../../../base/common/network.js';
import { ExtensionResourceLoaderService } from '../../../../../platform/extensionResourceLoader/common/extensionResourceLoaderService.js';
import { mock, TestProductService } from '../../../../test/common/workbenchTestServices.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ExtensionGalleryManifestService } from '../../../../../platform/extensionManagement/common/extensionGalleryManifestService.js';
const undefinedStyle = { bold: undefined, underline: undefined, italic: undefined };
const unsetStyle = { bold: false, underline: false, italic: false };
function ts(foreground, styleFlags) {
    const foregroundColor = isString(foreground) ? Color.fromHex(foreground) : undefined;
    return new TokenStyle(foregroundColor, styleFlags?.bold, styleFlags?.underline, styleFlags?.strikethrough, styleFlags?.italic);
}
function tokenStyleAsString(ts) {
    if (!ts) {
        return 'tokenstyle-undefined';
    }
    let str = ts.foreground ? ts.foreground.toString() : 'no-foreground';
    if (ts.bold !== undefined) {
        str += ts.bold ? '+B' : '-B';
    }
    if (ts.underline !== undefined) {
        str += ts.underline ? '+U' : '-U';
    }
    if (ts.italic !== undefined) {
        str += ts.italic ? '+I' : '-I';
    }
    return str;
}
function assertTokenStyle(actual, expected, message) {
    assert.strictEqual(tokenStyleAsString(actual), tokenStyleAsString(expected), message);
}
function assertTokenStyleMetaData(colorIndex, actual, expected, message = '') {
    if (expected === undefined || expected === null || actual === undefined) {
        assert.strictEqual(actual, expected, message);
        return;
    }
    assert.strictEqual(actual.bold, expected.bold, 'bold ' + message);
    assert.strictEqual(actual.italic, expected.italic, 'italic ' + message);
    assert.strictEqual(actual.underline, expected.underline, 'underline ' + message);
    const actualForegroundIndex = actual.foreground;
    if (actualForegroundIndex && expected.foreground) {
        assert.strictEqual(colorIndex[actualForegroundIndex], Color.Format.CSS.formatHexA(expected.foreground, true).toUpperCase(), 'foreground ' + message);
    }
    else {
        assert.strictEqual(actualForegroundIndex, expected.foreground || 0, 'foreground ' + message);
    }
}
function assertTokenStyles(themeData, expected, language = 'typescript') {
    const colorIndex = themeData.tokenColorMap;
    for (const qualifiedClassifier in expected) {
        const [type, ...modifiers] = qualifiedClassifier.split('.');
        const expectedTokenStyle = expected[qualifiedClassifier];
        const tokenStyleMetaData = themeData.getTokenStyleMetadata(type, modifiers, language);
        assertTokenStyleMetaData(colorIndex, tokenStyleMetaData, expectedTokenStyle, qualifiedClassifier);
    }
}
suite('Themes - TokenStyleResolving', () => {
    const fileService = new FileService(new NullLogService());
    const requestService = new (mock())();
    const storageService = new (mock())();
    const environmentService = new (mock())();
    const configurationService = new (mock())();
    const extensionResourceLoaderService = new ExtensionResourceLoaderService(fileService, storageService, TestProductService, environmentService, configurationService, new ExtensionGalleryManifestService(TestProductService), requestService, new NullLogService());
    const diskFileSystemProvider = new DiskFileSystemProvider(new NullLogService());
    fileService.registerProvider(Schemas.file, diskFileSystemProvider);
    teardown(() => {
        diskFileSystemProvider.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('color defaults', async () => {
        const themeData = ColorThemeData.createUnloadedTheme('foo');
        themeData.location = FileAccess.asFileUri('vs/workbench/services/themes/test/node/color-theme.json');
        await themeData.ensureLoaded(extensionResourceLoaderService);
        assert.strictEqual(themeData.isLoaded, true);
        assertTokenStyles(themeData, {
            'comment': ts('#000000', undefinedStyle),
            'variable': ts('#111111', unsetStyle),
            'type': ts('#333333', { bold: false, underline: true, italic: false }),
            'function': ts('#333333', unsetStyle),
            'string': ts('#444444', undefinedStyle),
            'number': ts('#555555', undefinedStyle),
            'keyword': ts('#666666', undefinedStyle)
        });
    });
    test('resolveScopes', async () => {
        const themeData = ColorThemeData.createLoadedEmptyTheme('test', 'test');
        const customTokenColors = {
            textMateRules: [
                {
                    scope: 'variable',
                    settings: {
                        fontStyle: '',
                        foreground: '#F8F8F2'
                    }
                },
                {
                    scope: 'keyword.operator',
                    settings: {
                        fontStyle: 'italic bold underline',
                        foreground: '#F92672'
                    }
                },
                {
                    scope: 'storage',
                    settings: {
                        fontStyle: 'italic',
                        foreground: '#F92672'
                    }
                },
                {
                    scope: ['storage.type', 'meta.structure.dictionary.json string.quoted.double.json'],
                    settings: {
                        foreground: '#66D9EF'
                    }
                },
                {
                    scope: 'entity.name.type, entity.name.class, entity.name.namespace, entity.name.scope-resolution',
                    settings: {
                        fontStyle: 'underline',
                        foreground: '#A6E22E'
                    }
                },
            ]
        };
        themeData.setCustomTokenColors(customTokenColors);
        let tokenStyle;
        const defaultTokenStyle = undefined;
        tokenStyle = themeData.resolveScopes([['variable']]);
        assertTokenStyle(tokenStyle, ts('#F8F8F2', unsetStyle), 'variable');
        tokenStyle = themeData.resolveScopes([['keyword.operator']]);
        assertTokenStyle(tokenStyle, ts('#F92672', { italic: true, bold: true, underline: true }), 'keyword');
        tokenStyle = themeData.resolveScopes([['keyword']]);
        assertTokenStyle(tokenStyle, defaultTokenStyle, 'keyword');
        tokenStyle = themeData.resolveScopes([['keyword.operator']]);
        assertTokenStyle(tokenStyle, ts('#F92672', { italic: true, bold: true, underline: true }), 'keyword.operator');
        tokenStyle = themeData.resolveScopes([['keyword.operators']]);
        assertTokenStyle(tokenStyle, defaultTokenStyle, 'keyword.operators');
        tokenStyle = themeData.resolveScopes([['storage']]);
        assertTokenStyle(tokenStyle, ts('#F92672', { italic: true, bold: false, underline: false }), 'storage');
        tokenStyle = themeData.resolveScopes([['storage.type']]);
        assertTokenStyle(tokenStyle, ts('#66D9EF', { italic: true, bold: false, underline: false }), 'storage.type');
        tokenStyle = themeData.resolveScopes([['entity.name.class']]);
        assertTokenStyle(tokenStyle, ts('#A6E22E', { italic: false, bold: false, underline: true }), 'entity.name.class');
        tokenStyle = themeData.resolveScopes([['meta.structure.dictionary.json', 'string.quoted.double.json']]);
        assertTokenStyle(tokenStyle, ts('#66D9EF', undefined), 'json property');
        tokenStyle = themeData.resolveScopes([['source.json', 'meta.structure.dictionary.json', 'string.quoted.double.json']]);
        assertTokenStyle(tokenStyle, ts('#66D9EF', undefined), 'json property');
        tokenStyle = themeData.resolveScopes([['keyword'], ['storage.type'], ['entity.name.class']]);
        assertTokenStyle(tokenStyle, ts('#66D9EF', { italic: true, bold: false, underline: false }), 'storage.type');
    });
    test('resolveScopes - match most specific', async () => {
        const themeData = ColorThemeData.createLoadedEmptyTheme('test', 'test');
        const customTokenColors = {
            textMateRules: [
                {
                    scope: 'entity.name.type',
                    settings: {
                        fontStyle: 'underline',
                        foreground: '#A6E22E'
                    }
                },
                {
                    scope: 'entity.name.type.class',
                    settings: {
                        foreground: '#FF00FF'
                    }
                },
                {
                    scope: 'entity.name',
                    settings: {
                        foreground: '#FFFFFF'
                    }
                },
            ]
        };
        themeData.setCustomTokenColors(customTokenColors);
        const tokenStyle = themeData.resolveScopes([['entity.name.type.class']]);
        assertTokenStyle(tokenStyle, ts('#FF00FF', { italic: false, bold: false, underline: true }), 'entity.name.type.class');
    });
    test('rule matching', async () => {
        const themeData = ColorThemeData.createLoadedEmptyTheme('test', 'test');
        themeData.setCustomColors({ 'editor.foreground': '#000000' });
        themeData.setCustomSemanticTokenColors({
            enabled: true,
            rules: {
                'type': '#ff0000',
                'class': { foreground: '#0000ff', italic: true },
                '*.static': { bold: true },
                '*.declaration': { italic: true },
                '*.async.static': { italic: true, underline: true },
                '*.async': { foreground: '#000fff', underline: true }
            }
        });
        assertTokenStyles(themeData, {
            'type': ts('#ff0000', undefinedStyle),
            'type.static': ts('#ff0000', { bold: true }),
            'type.static.declaration': ts('#ff0000', { bold: true, italic: true }),
            'class': ts('#0000ff', { italic: true }),
            'class.static.declaration': ts('#0000ff', { bold: true, italic: true, }),
            'class.declaration': ts('#0000ff', { italic: true }),
            'class.declaration.async': ts('#000fff', { underline: true, italic: true }),
            'class.declaration.async.static': ts('#000fff', { italic: true, underline: true, bold: true }),
        });
    });
    test('super type', async () => {
        const registry = getTokenClassificationRegistry();
        registry.registerTokenType('myTestInterface', 'A type just for testing', 'interface');
        registry.registerTokenType('myTestSubInterface', 'A type just for testing', 'myTestInterface');
        try {
            const themeData = ColorThemeData.createLoadedEmptyTheme('test', 'test');
            themeData.setCustomColors({ 'editor.foreground': '#000000' });
            themeData.setCustomSemanticTokenColors({
                enabled: true,
                rules: {
                    'interface': '#ff0000',
                    'myTestInterface': { italic: true },
                    'interface.static': { bold: true }
                }
            });
            assertTokenStyles(themeData, { 'myTestSubInterface': ts('#ff0000', { italic: true }) });
            assertTokenStyles(themeData, { 'myTestSubInterface.static': ts('#ff0000', { italic: true, bold: true }) });
            themeData.setCustomSemanticTokenColors({
                enabled: true,
                rules: {
                    'interface': '#ff0000',
                    'myTestInterface': { foreground: '#ff00ff', italic: true }
                }
            });
            assertTokenStyles(themeData, { 'myTestSubInterface': ts('#ff00ff', { italic: true }) });
        }
        finally {
            registry.deregisterTokenType('myTestInterface');
            registry.deregisterTokenType('myTestSubInterface');
        }
    });
    test('language', async () => {
        try {
            const themeData = ColorThemeData.createLoadedEmptyTheme('test', 'test');
            themeData.setCustomColors({ 'editor.foreground': '#000000' });
            themeData.setCustomSemanticTokenColors({
                enabled: true,
                rules: {
                    'interface': '#fff000',
                    'interface:java': '#ff0000',
                    'interface.static': { bold: true },
                    'interface.static:typescript': { italic: true }
                }
            });
            assertTokenStyles(themeData, { 'interface': ts('#ff0000', undefined) }, 'java');
            assertTokenStyles(themeData, { 'interface': ts('#fff000', undefined) }, 'typescript');
            assertTokenStyles(themeData, { 'interface.static': ts('#ff0000', { bold: true }) }, 'java');
            assertTokenStyles(themeData, { 'interface.static': ts('#fff000', { bold: true, italic: true }) }, 'typescript');
        }
        finally {
        }
    });
    test('language - scope resolving', async () => {
        const registry = getTokenClassificationRegistry();
        const numberOfDefaultRules = registry.getTokenStylingDefaultRules().length;
        registry.registerTokenStyleDefault(registry.parseTokenSelector('type', 'typescript1'), { scopesToProbe: [['entity.name.type.ts1']] });
        registry.registerTokenStyleDefault(registry.parseTokenSelector('type:javascript1'), { scopesToProbe: [['entity.name.type.js1']] });
        try {
            const themeData = ColorThemeData.createLoadedEmptyTheme('test', 'test');
            themeData.setCustomColors({ 'editor.foreground': '#000000' });
            themeData.setCustomTokenColors({
                textMateRules: [
                    {
                        scope: 'entity.name.type',
                        settings: { foreground: '#aa0000' }
                    },
                    {
                        scope: 'entity.name.type.ts1',
                        settings: { foreground: '#bb0000' }
                    }
                ]
            });
            assertTokenStyles(themeData, { 'type': ts('#aa0000', undefined) }, 'javascript1');
            assertTokenStyles(themeData, { 'type': ts('#bb0000', undefined) }, 'typescript1');
        }
        finally {
            registry.deregisterTokenStyleDefault(registry.parseTokenSelector('type', 'typescript1'));
            registry.deregisterTokenStyleDefault(registry.parseTokenSelector('type:javascript1'));
            assert.strictEqual(registry.getTokenStylingDefaultRules().length, numberOfDefaultRules);
        }
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9rZW5TdHlsZVJlc29sdmluZy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3RoZW1lcy90ZXN0L25vZGUvdG9rZW5TdHlsZVJlc29sdmluZy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNoRSxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFFNUIsT0FBTyxFQUFFLFVBQVUsRUFBRSw4QkFBOEIsRUFBRSxNQUFNLHFFQUFxRSxDQUFDO0FBQ2pJLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM1RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDL0QsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUN0RyxPQUFPLEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSxNQUFNLDBGQUEwRixDQUFDO0FBRTFJLE9BQU8sRUFBRSxJQUFJLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUs1RixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsK0JBQStCLEVBQUUsTUFBTSx1RkFBdUYsQ0FBQztBQUV4SSxNQUFNLGNBQWMsR0FBRyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLENB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