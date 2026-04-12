/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as platform from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestCodeEditorService } from '../editorTestServices.js';
import { TestColorTheme, TestThemeService } from '../../../../platform/theme/test/common/testThemeService.js';
suite('Decoration Render Options', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    const themeServiceMock = new TestThemeService();
    const options = {
        gutterIconPath: URI.parse('https://github.com/microsoft/vscode/blob/main/resources/linux/code.png'),
        gutterIconSize: 'contain',
        backgroundColor: 'red',
        borderColor: 'yellow'
    };
    test('register and resolve decoration type', () => {
        const s = store.add(new TestCodeEditorService(themeServiceMock));
        store.add(s.registerDecorationType('test', 'example', options));
        assert.notStrictEqual(s.resolveDecorationOptions('example', false), undefined);
    });
    test('remove decoration type', () => {
        const s = store.add(new TestCodeEditorService(themeServiceMock));
        s.registerDecorationType('test', 'example', options);
        assert.notStrictEqual(s.resolveDecorationOptions('example', false), undefined);
        s.removeDecorationType('example');
        assert.throws(() => s.resolveDecorationOptions('example', false));
    });
    function readStyleSheet(styleSheet) {
        return styleSheet.read();
    }
    test('css properties', () => {
        const s = store.add(new TestCodeEditorService(themeServiceMock));
        const styleSheet = s.globalStyleSheet;
        store.add(s.registerDecorationType('test', 'example', options));
        const sheet = readStyleSheet(styleSheet);
        assert(sheet.indexOf(`{background:url('${CSS.escape('https://github.com/microsoft/vscode/blob/main/resources/linux/code.png')}') center center no-repeat;background-size:contain;}`) >= 0);
        assert(sheet.indexOf(`{background-color:red;border-color:yellow;box-sizing: border-box;}`) >= 0);
    });
    test('theme color', () => {
        const options = {
            backgroundColor: { id: 'editorBackground' },
            borderColor: { id: 'editorBorder' },
        };
        const themeService = new TestThemeService(new TestColorTheme({
            editorBackground: '#FF0000'
        }));
        const s = store.add(new TestCodeEditorService(themeService));
        const styleSheet = s.globalStyleSheet;
        s.registerDecorationType('test', 'example', options);
        assert.strictEqual(readStyleSheet(styleSheet), '.monaco-editor .ced-example-0 {background-color:#ff0000;border-color:transparent;box-sizing: border-box;}');
        themeService.setTheme(new TestColorTheme({
            editorBackground: '#EE0000',
            editorBorder: '#00FFFF'
        }));
        assert.strictEqual(readStyleSheet(styleSheet), '.monaco-editor .ced-example-0 {background-color:#ee0000;border-color:#00ffff;box-sizing: border-box;}');
        s.removeDecorationType('example');
        assert.strictEqual(readStyleSheet(styleSheet), '');
    });
    test('theme overrides', () => {
        const options = {
            color: { id: 'editorBackground' },
            light: {
                color: '#FF00FF'
            },
            dark: {
                color: '#000000',
                after: {
                    color: { id: 'infoForeground' }
                }
            }
        };
        const themeService = new TestThemeService(new TestColorTheme({
            editorBackground: '#FF0000',
            infoForeground: '#444444'
        }));
        const s = store.add(new TestCodeEditorService(themeService));
        const styleSheet = s.globalStyleSheet;
        s.registerDecorationType('test', 'example', options);
        const expected = [
            '.vs-dark.monaco-editor .ced-example-4::after, .hc-black.monaco-editor .ced-example-4::after {color:#444444 !important;}',
            '.vs-dark.monaco-editor .ced-example-1, .hc-black.monaco-editor .ced-example-1 {color:#000000 !important;}',
            '.vs.monaco-editor .ced-example-1, .hc-light.monaco-editor .ced-example-1 {color:#FF00FF !important;}',
            '.monaco-editor .ced-example-1 {color:#ff0000 !important;}'
        ].join('\n');
        assert.strictEqual(readStyleSheet(styleSheet), expected);
        s.removeDecorationType('example');
        assert.strictEqual(readStyleSheet(styleSheet), '');
    });
    test('css properties, gutterIconPaths', () => {
        const s = store.add(new TestCodeEditorService(themeServiceMock));
        const styleSheet = s.globalStyleSheet;
        // URI, only minimal encoding
        s.registerDecorationType('test', 'example', { gutterIconPath: URI.parse('data:image/svg+xml;base64,PHN2ZyB4b+') });
        assert(readStyleSheet(styleSheet).indexOf(`{background:url('${CSS.escape('data:image/svg+xml;base64,PHN2ZyB4b+')}') center center no-repeat;}`) > 0);
        s.removeDecorationType('example');
        function assertBackground(url1, url2) {
            const actual = readStyleSheet(styleSheet);
            assert(actual.indexOf(`{background:url('${url1}') center center no-repeat;}`) > 0
                || actual.indexOf(`{background:url('${url2}') center center no-repeat;}`) > 0);
        }
        if (platform.isWindows) {
            // windows file path (used as string)
            s.registerDecorationType('test', 'example', { gutterIconPath: URI.file('c:\\files\\miles\\more.png') });
            assertBackground(CSS.escape('file:///c:/files/miles/more.png'), CSS.escape('vscode-file://vscode-app/c:/files/miles/more.png'));
            s.removeDecorationType('example');
            // single quote must always be escaped/encoded
            s.registerDecorationType('test', 'example', { gutterIconPath: URI.file('c:\\files\\foo\\b\'ar.png') });
            assertBackground(CSS.escape('file:///c:/files/foo/b\'ar.png'), CSS.escape('vscode-file://vscode-app/c:/files/foo/b\'ar.png'));
            s.removeDecorationType('example');
        }
        else {
            // unix file path (used as string)
            s.registerDecorationType('test', 'example', { gutterIconPath: URI.file('/Users/foo/bar.png') });
            assertBackground(CSS.escape('file:///Users/foo/bar.png'), CSS.escape('vscode-file://vscode-app/Users/foo/bar.png'));
            s.removeDecorationType('example');
            // single quote must always be escaped/encoded
            s.registerDecorationType('test', 'example', { gutterIconPath: URI.file('/Users/foo/b\'ar.png') });
            assertBackground(CSS.escape('file:///Users/foo/b\'ar.png'), CSS.escape('vscode-file://vscode-app/Users/foo/b\'ar.png'));
            s.removeDecorationType('example');
        }
        s.registerDecorationType('test', 'example', { gutterIconPath: URI.parse('http://test/pa\'th') });
        assert(readStyleSheet(styleSheet).indexOf(`{background:url('${CSS.escape('http://test/pa\'th')}') center center no-repeat;}`) > 0);
        s.removeDecorationType('example');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVjb3JhdGlvblJlbmRlck9wdGlvbnMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci90ZXN0L2Jyb3dzZXIvc2VydmljZXMvZGVjb3JhdGlvblJlbmRlck9wdGlvbnMudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxLQUFLLFFBQVEsTUFBTSxxQ0FBcUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFaEcsT0FBTyxFQUFFLHFCQUFxQixFQUF3QixNQUFNLDBCQUEwQixDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxjQUFjLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUU5RyxLQUFLLENBQUMsMkJBQTJCLEVBQUUsR0FBRyxFQUFFO0lBQ3ZDLE1BQU0sS0FBSyxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFFeEQsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLGdCQUFnQixFQUFFLENBQUM7SUFFaEQsTUFBTSxPQUFPLEdBQTZCO1FBQ3pDLGNBQWMsRUFBRSxHQUFHLENBQUMsS0FBSyxDQUFDLHdFQUF3RSxDQUFDO1FBQ25HLGNBQWMsRUFBRSxTQUFTO1FBQ3pCLGVBQWUsRUFBRSxLQUFLO1FBQ3RCLFdBQVcsRUFBRSxRQUFRO0tBQ3JCLENBQUM7SUFDRixJQUFJLENBQUMsc0NBQXNDLEVBQUUsR0FBRyxFQUFFO1FBQ2pELE1BQU0sQ0FBQyxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxxQkFBcUIsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7UUFDakUsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMs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