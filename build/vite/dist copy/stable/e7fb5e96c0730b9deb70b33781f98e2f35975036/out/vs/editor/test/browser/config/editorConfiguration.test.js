/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { migrateOptions } from '../../../browser/config/migrateOptions.js';
import { EditorZoom } from '../../../common/config/editorZoom.js';
import { TestConfiguration } from './testConfiguration.js';
suite('Common Editor Config', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('Zoom Level', () => {
        //Zoom levels are defined to go between -5, 20 inclusive
        const zoom = EditorZoom;
        zoom.setZoomLevel(0);
        assert.strictEqual(zoom.getZoomLevel(), 0);
        zoom.setZoomLevel(-0);
        assert.strictEqual(zoom.getZoomLevel(), 0);
        zoom.setZoomLevel(5);
        assert.strictEqual(zoom.getZoomLevel(), 5);
        zoom.setZoomLevel(-1);
        assert.strictEqual(zoom.getZoomLevel(), -1);
        zoom.setZoomLevel(9);
        assert.strictEqual(zoom.getZoomLevel(), 9);
        zoom.setZoomLevel(-9);
        assert.strictEqual(zoom.getZoomLevel(), -5);
        zoom.setZoomLevel(20);
        assert.strictEqual(zoom.getZoomLevel(), 20);
        zoom.setZoomLevel(-10);
        assert.strictEqual(zoom.getZoomLevel(), -5);
        zoom.setZoomLevel(9.1);
        assert.strictEqual(zoom.getZoomLevel(), 9.1);
        zoom.setZoomLevel(-9.1);
        assert.strictEqual(zoom.getZoomLevel(), -5);
        zoom.setZoomLevel(Infinity);
        assert.strictEqual(zoom.getZoomLevel(), 20);
        zoom.setZoomLevel(Number.NEGATIVE_INFINITY);
        assert.strictEqual(zoom.getZoomLevel(), -5);
    });
    class TestWrappingConfiguration extends TestConfiguration {
        _readEnvConfiguration() {
            return {
                extraEditorClassName: '',
                outerWidth: 1000,
                outerHeight: 100,
                emptySelectionClipboard: true,
                pixelRatio: 1,
                accessibilitySupport: 0 /* AccessibilitySupport.Unknown */,
                editContextSupported: true,
            };
        }
    }
    function assertWrapping(config, isViewportWrapping, wrappingColumn) {
        const options = config.options;
        const wrappingInfo = options.get(166 /* EditorOption.wrappingInfo */);
        assert.strictEqual(wrappingInfo.isViewportWrapping, isViewportWrapping);
        assert.strictEqual(wrappingInfo.wrappingColumn, wrappingColumn);
    }
    test('wordWrap default', () => {
        const config = new TestWrappingConfiguration({});
        assertWrapping(config, false, -1);
        config.dispose();
    });
    test('wordWrap compat false', () => {
        const config = new TestWrappingConfiguration({
            // eslint-disable-next-line local/code-no-any-casts
            wordWrap: false
        });
        assertWrapping(config, false, -1);
        config.dispose();
    });
    test('wordWrap compat true', () => {
        const config = new TestWrappingConfiguration({
            // eslint-disable-next-line local/code-no-any-casts
            wordWrap: true
        });
        assertWrapping(config, true, 80);
        config.dispose();
    });
    test('wordWrap on', () => {
        const config = new TestWrappingConfiguration({
            wordWrap: 'on'
        });
        assertWrapping(config, true, 80);
        config.dispose();
    });
    test('wordWrap on without minimap', () => {
        const config = new TestWrappingConfiguration({
            wordWrap: 'on',
            minimap: {
                enabled: false
            }
        });
        assertWrapping(config, true, 88);
        config.dispose();
    });
    test('wordWrap on does not use wordWrapColumn', () => {
        const config = new TestWrappingConfiguration({
            wordWrap: 'on',
            wordWrapColumn: 10
        });
        assertWrapping(config, true, 80);
        config.dispose();
    });
    test('wordWrap off', () => {
        const config = new TestWrappingConfiguration({
            wordWrap: 'off'
        });
        assertWrapping(config, false, -1);
        config.dispose();
    });
    test('wordWrap off does not use wordWrapColumn', () => {
        const config = new TestWrappingConfiguration({
            wordWrap: 'off',
            wordWrapColumn: 10
        });
        assertWrapping(config, false, -1);
        config.dispose();
    });
    test('wordWrap wordWrapColumn uses default wordWrapColumn', () => {
        const config = new TestWrappingConfiguration({
            wordWrap: 'wordWrapColumn'
        });
        assertWrapping(config, false, 80);
        config.dispose();
    });
    test('wordWrap wordWrapColumn uses wordWrapColumn', () => {
        const config = new TestWrappingConfiguration({
            wordWrap: 'wordWrapColumn',
            wordWrapColumn: 100
        });
        assertWrapping(config, false, 100);
        config.dispose();
    });
    test('wordWrap wordWrapColumn validates wordWrapColumn', () => {
        const config = new TestWrappingConfiguration({
            wordWrap: 'wordWrapColumn',
            wordWrapColumn: -1
        });
        assertWrapping(config, false, 1);
        config.dispose();
    });
    test('wordWrap bounded uses default wordWrapColumn', () => {
        const config = new TestWrappingConfiguration({
            wordWrap: 'bounded'
        });
        assertWrapping(config, true, 80);
        config.dispose();
    });
    test('wordWrap bounded uses wordWrapColumn', () => {
        const config = new TestWrappingConfiguration({
            wordWrap: 'bounded',
            wordWrapColumn: 40
        });
        assertWrapping(config, true, 40);
        config.dispose();
    });
    test('wordWrap bounded validates wordWrapColumn', () => {
        const config = new TestWrappingConfiguration({
            wordWrap: 'bounded',
            wordWrapColumn: -1
        });
        assertWrapping(config, true, 1);
        config.dispose();
    });
    test('issue #53152: Cannot assign to read only property \'enabled\' of object', () => {
        const hoverOptions = {};
        Object.defineProperty(hoverOptions, 'enabled', {
            writable: false,
            value: 'on'
        });
        const config = new TestConfiguration({ hover: hoverOptions });
        assert.strictEqual(config.options.get(69 /* EditorOption.hover */).enabled, 'on');
        config.updateOptions({ hover: { enabled: 'off' } });
        assert.strictEqual(config.options.get(69 /* EditorOption.hover */).enabled, 'off');
        config.dispose();
    });
    test('does not emit event when nothing changes', () => {
        const config = new TestConfiguration({ glyphMargin: true, roundedSelection: false });
        let event = null;
        const disposable = config.onDidChange(e => event = e);
        assert.strictEqual(config.options.get(66 /* EditorOption.glyphMargin */), true);
        config.updateOptions({ glyphMargin: true });
        config.updateOptions({ roundedSelection: false });
        assert.strictEqual(event, null);
        config.dispose();
        disposable.dispose();
    });
    test('issue #94931: Unable to open source file', () => {
        const config = new TestConfiguration({ quickSuggestions: null });
        const actual = config.options.get(102 /* EditorOption.quickSuggestions */);
        assert.deepStrictEqual(actual, {
            other: 'on',
            comments: 'off',
            strings: 'off'
        });
        config.dispose();
    });
    test('issue #102920: Can\'t snap or split view with JSON files', () => {
        const config = new TestConfiguration({ quickSuggestions: null });
        config.updateOptions({ quickSuggestions: { strings: true } });
        const actual = config.options.get(102 /* EditorOption.quickSuggestions */);
        assert.deepStrictEqual(actual, {
            other: 'on',
            comments: 'off',
            strings: 'on'
        });
        config.dispose();
    });
    test('issue #151926: Untyped editor options apply', () => {
        const config = new TestConfiguration({});
        config.updateOptions({ unicodeHighlight: { allowedCharacters: { 'x': true } } });
        const actual = config.options.get(142 /* EditorOption.unicodeHighlighting */);
        assert.deepStrictEqual(actual, {
            nonBasicASCII: 'inUntrustedWorkspace',
            invisibleCharacters: true,
            ambiguousCharacters: true,
            includeComments: 'inUntrustedWorkspace',
            includeStrings: 'inUntrustedWorkspace',
            allowedCharacters: { 'x': true },
            allowedLocales: { '_os': true, '_vscode': true }
        });
        config.dispose();
    });
});
suite('migrateOptions', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function migrate(options) {
        migrateOptions(options);
        return options;
    }
    test('wordWrap', () => {
        assert.deepStrictEqual(migrate({ wordWrap: true }), { wordWrap: 'on' });
        assert.deepStrictEqual(migrate({ wordWrap: false }), { wordWrap: 'off' });
    });
    test('lineNumbers', () => {
        assert.deepStrictEqual(migrate({ lineNumbers: true }), { lineNumbers: 'on' });
        assert.deepStrictEqual(migrate({ lineNumbers: false }), { lineNumbers: 'off' });
    });
    test('autoClosingBrackets', () => {
        assert.deepStrictEqual(migrate({ autoClosingBrackets: false }), { autoClosingBrackets: 'never', autoClosingQuotes: 'never', autoSurround: 'never' });
    });
    test('cursorBlinking', () => {
        assert.deepStrictEqual(migrate({ cursorBlinking: 'visible' }), { cursorBlinking: 'solid' });
    });
    test('renderWhitespace', () => {
        assert.deepStrictEqual(migrate({ renderWhitespace: true }), { renderWhitespace: 'boundary' });
        assert.deepStrictEqual(migrate({ renderWhitespace: false }), { renderWhitespace: 'none' });
    });
    test('renderLineHighlight', () => {
        assert.deepStrictEqual(migrate({ renderLineHighlight: true }), { renderLineHighlight: 'line' });
        assert.deepStrictEqual(migrate({ renderLineHighlight: false }), { renderLineHighlight: 'none' });
    });
    test('acceptSuggestionOnEnter', () => {
        assert.deepStrictEqual(migrate({ acceptSuggestionOnEnter: true }), { acceptSuggestionOnEnter: 'on' });
        assert.deepStrictEqual(migrate({ acceptSuggestionOnEnter: false }), { acceptSuggestionOnEnter: 'off' });
    });
    test('tabCompletion', () => {
        assert.deepStrictEqual(migrate({ tabCompletion: true }), { tabCompletion: 'onlySnippets' });
        assert.deepStrictEqual(migrate({ tabCompletion: false }), { tabCompletion: 'off' });
    });
    test('suggest.filteredTypes', () => {
        assert.deepStrictEqual(migrate({
            suggest: {
                filteredTypes: {
                    method: false,
                    function: false,
                    constructor: false,
                    deprecated: false,
                    field: false,
                    variable: false,
                    class: false,
                    struct: false,
                    interface: false,
                    module: false,
                    property: false,
                    event: false,
                    operator: false,
                    unit: false,
                    value: false,
                    constant: false,
                    enum: false,
                    enumMember: false,
                    keyword: false,
                    text: false,
                    color: false,
                    file: false,
                    reference: false,
                    folder: false,
                    typeParameter: false,
                    snippet: false,
                }
            }
        }), {
            suggest: {
                filteredTypes: undefined,
                showMethods: false,
                showFunctions: false,
                showConstructors: false,
                showDeprecated: false,
                showFields: false,
                showVariables: false,
                showClasses: false,
                showStructs: false,
                showInterfaces: false,
                showModules: false,
                showProperties: false,
                showEvents: false,
                showOperators: false,
                showUnits: false,
                showValues: false,
                showConstants: false,
                showEnums: false,
                showEnumMembers: false,
                showKeywords: false,
                showWords: false,
                showColors: false,
                showFiles: false,
                showReferences: false,
                showFolders: false,
                showTypeParameters: false,
                showSnippets: false,
            }
        });
    });
    test('quickSuggestions', () => {
        assert.deepStrictEqual(migrate({ quickSuggestions: true }), { quickSuggestions: { comments: 'on', strings: 'on', other: 'on' } });
        assert.deepStrictEqual(migrate({ quickSuggestions: false }), { quickSuggestions: { comments: 'off', strings: 'off', other: 'off' } });
        assert.deepStrictEqual(migrate({ quickSuggestions: { comments: 'on', strings: 'off' } }), { quickSuggestions: { comments: 'on', strings: 'off' } });
    });
    test('hover', () => {
        assert.deepStrictEqual(migrate({ hover: true }), { hover: { enabled: 'on' } });
        assert.deepStrictEqual(migrate({ hover: false }), { hover: { enabled: 'off' } });
    });
    test('parameterHints', () => {
        assert.deepStrictEqual(migrate({ parameterHints: true }), { parameterHints: { enabled: true } });
        assert.deepStrictEqual(migrate({ parameterHints: false }), { parameterHints: { enabled: false } });
    });
    test('autoIndent', () => {
        assert.deepStrictEqual(migrate({ autoIndent: true }), { autoIndent: 'full' });
        assert.deepStrictEqual(migrate({ autoIndent: false }), { autoIndent: 'advanced' });
    });
    test('matchBrackets', () => {
        assert.deepStrictEqual(migrate({ matchBrackets: true }), { matchBrackets: 'always' });
        assert.deepStrictEqual(migrate({ matchBrackets: false }), { matchBrackets: 'never' });
    });
    test('renderIndentGuides, highlightActiveIndentGuide', () => {
        assert.deepStrictEqual(migrate({ renderIndentGuides: true }), { renderIndentGuides: undefined, guides: { indentation: true } });
        assert.deepStrictEqual(migrate({ renderIndentGuides: false }), { renderIndentGuides: undefined, guides: { indentation: false } });
        assert.deepStrictEqual(migrate({ highlightActiveIndentGuide: true }), { highlightActiveIndentGuide: undefined, guides: { highlightActiveIndentation: true } });
        assert.deepStrictEqual(migrate({ highlightActiveIndentGuide: false }), { highlightActiveIndentGuide: undefined, guides: { highlightActiveIndentation: false } });
    });
    test('migration does not overwrite new setting', () => {
        assert.deepStrictEqual(migrate({ renderIndentGuides: true, guides: { indentation: false } }), { renderIndentGuides: undefined, guides: { indentation: false } });
        assert.deepStrictEqual(migrate({ highlightActiveIndentGuide: true, guides: { highlightActiveIndentation: false } }), { highlightActiveIndentGuide: undefined, guides: { highlightActiveIndentation: false } });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yQ29uZmlndXJhdGlvbi50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL3Rlc3QvYnJvd3Nlci9jb25maWcvZWRpdG9yQ29uZmlndXJhdGlvbi50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUVoRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFFM0UsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBRzNELEtBQUssQ0FBQyxzQkFBc0IsRUFBRSxHQUFHLEVBQUU7SUFFbEMsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxJQUFJLENBQUMsWUFBWSxFQUFFLEdBQUcsRUFBRTtRQUV2Qix3REFBd0Q7UUFDeEQsTUFBTSxJQUFJLEdBQUcsVUFBVSxDQUFDO1FBRXhCLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDckIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFM0MsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3RCLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRTNDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDckIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFM0MsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3RCLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFNUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNyQixNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUUzQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUU1QyxJQUFJLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3RCLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRTVDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUN2QixNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRTVDLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDdkIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFFN0MsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3hCLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFNUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM1QixNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUU1QyxJQUFJLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBQzVDLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDN0MsQ0FBQyxDQUFDLENBQUM7SUFFSCxNQUFNLHlCQUEwQixTQUFRLGlCQUFpQjtRQUNyQyxxQkFBcUI7WUFDdkMsT0FBTztnQkFDTixvQkFBb0IsRUFBRSxFQUFFO2dCQUN4QixVQUFVLEVBQUUsSUFBSTtnQkFDaEIsV0FBVyxFQUFFLEdBQUc7Z0JBQ2hCLHVCQUF1QixFQUFFLElBQUk7Z0JBQzdCLFVBQVUsRUFBRSxDQUFDO2dCQUNiLG9CQUFvQixzQ0FBOEI7Z0JBQ2xELG9CQUFvQixFQUFFLElBQUk7YUFDMUIsQ0FBQztRQUNILENBQUM7S0FDRDtJQUVELFNBQVMsY0FBYyxDQUFDLE1BQXlCLEVBQUUsa0JBQTJCLEVBQUUsY0FBc0I7UUFDckcsTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQztRQUMvQixNQUFNLFlBQVksR0FBRyxPQUFPLENBQUMsR0FBRyxxQ0FBMkIsQ0FBQztRQUM1RCxNQUFNLENBQUMsV0FBVyxDQUFDLFlBQVksQ0FBQyxrQkFBa0IsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO1FBQ3hFLE1BQU0sQ0FBQyxXQUFXLENBQUMsWUFBWSxDQUFDLGNBQWMsRUFBRSxjQUFjLENBQUMsQ0FBQztJQUNqRSxDQUFDO0lBRUQsSUFBSSxDQUFDLGtCQUFrQixFQUFFLEdBQUcsRUFBRTtRQUM3QixNQUFNLE1BQU0sR0FBRyxJQUFJLHlCQUF5QixDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ2pELGNBQWMsQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDbEMsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2xCLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHVCQUF1QixFQUFFLEdBQUcsRUFBRTtRQUNsQyxNQUFNLE1BQU0sR0FBRyxJQUFJLHlCQUF5QixDQUFDO1lBQzVDLG1EQUFtRDtZQUNuRCxRQUFRLEVBQU8sS0FBSztTQUNwQixDQUFDLENBQUM7UUFDSCxjQUFjLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2xDLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNsQixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxzQkFBc0IsRUFBRSxHQUFHLEVBQUU7UUFDakMsTUFBTSxNQUFNLEdBQUcsSUFBSSx5QkFBeUIsQ0FBQztZQUM1QyxtREFBbUQ7WUFDbkQsUUFBUSxFQUFPLElBQUk7U0FDbkIsQ0FBQyxDQUFDO1FBQ0gsY0FBYyxDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDakMsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2xCLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGFBQWEsRUFBRSxHQUFHLEVBQUU7UUFDeEIsTUFBTSxNQUFNLEdBQUcsSUFBSSx5QkFBeUIsQ0FBQztZQUM1QyxRQUFRLEVBQUUsSUFBSTtTQUNkLENBQUMsQ0FBQztRQUNILGNBQWMsQ0FBQyxNQUFNLEVBQUUsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ2pDLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNsQixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw2QkFBNkIsRUFBRSxHQUFHLEVBQUU7UUFDeEMsTUFBTSxNQUFNLEdBQUcsSUFBSSx5QkFBeUIsQ0FBQztZQUM1QyxRQUFRLEVBQUUsSUFBSTtZQUNkLE9BQU8sRUFBRTtnQkFDUixPQUFPLEVBQUUsS0FBSzthQUNkO1NBQ0QsQ0FBQyxDQUFDO1FBQ0gsY0FBYyxDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDakMsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2xCLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHlDQUF5QyxFQUFFLEdBQUcsRUFBRTtRQUNwRCxNQUFNLE1BQU0sR0FBRyxJQUFJLHlCQUF5QixDQUFDO1lBQzVDLFFBQVEsRUFBRSxJQUFJO1lBQ2QsY0FBYyxFQUFFLEVBQUU7U0FDbEIsQ0FBQyxDQUFDO1FBQ0gsY0FBYyxDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDakMsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2xCLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGNBQWMsRUFBRSxHQUFHLEVBQUU7UUFDekIsTUFBTSxNQUFNLEdBQUcsSUFBSSx5QkFBeUIsQ0FBQztZQUM1QyxRQUFRLEVBQUUsS0FBSztTQUNmLENBQUMsQ0FBQztRQUNILGNBQWMsQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDbEMsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2xCLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDBDQUEwQyxFQUFFLEdBQUcsRUFBRTtRQUNyRCxNQUFNLE1BQU0sR0FBRyxJQUFJLHlCQUF5QixDQUFDO1lBQzVDLFFBQVEsRUFBRSxLQUFLO1lBQ2YsY0FBYyxFQUFFLEVBQUU7U0FDbEIsQ0FBQyxDQUFDO1FBQ0gsY0FBYyxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNsQyxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDbEIsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMscURBQXFELEVBQUUsR0FBRyxFQUFFO1FBQ2hFLE1BQU0sTUFBTSxHQUFHLElBQUkseUJBQXlCLENBQUM7WUFDNUMsUUFBUSxFQUFFLGdCQUFnQjtTQUMxQixDQUFDLENBQUM7UUFDSCxjQUFjLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNsQyxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDbEIsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsNkNBQTZDLEVBQUUsR0FBRyxFQUFFO1FBQ3hELE1BQU0sTUFBTSxHQUFHLElBQUkseUJBQXlCLENBQUM7WUFDNUMsUUFBUSxFQUFFLGdCQUFnQjtZQUMxQixjQUFjLEVBQUUsR0FBRztTQUNuQixDQUFDLENBQUM7UUFDSCxjQUFjLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxHQUFHLENBQUMsQ0FBQztRQUNuQyxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDbEIsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsa0RBQWtELEVBQUUsR0FBRyxFQUFFO1FBQzdELE1BQU0sTUFBTSxHQUFHLElBQUkseUJBQXlCLENBQUM7WUFDNUMsUUFBUSxFQUFFLGdCQUFnQjtZQUMxQixjQUFjLEVBQUUsQ0FBQyxDQUFDO1NBQ2xCLENBQUMsQ0FBQztRQUNILGNBQWMsQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pDLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNsQixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw4Q0FBOEMsRUFBRSxHQUFHLEVBQUU7UUFDekQsTUFBTSxNQUFNLEdBQUcsSUFBSSx5QkFBeUIsQ0FBQztZQUM1QyxRQUFRLEVBQUUsU0FBUztTQUNuQixDQUFDLENBQUM7UUFDSCxjQUFjLENBQUMsTUFBTSxFQUFFLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNqQyxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDbEIsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsc0NBQXNDLEVBQUUsR0FBRyxFQUFFO1FBQ2pELE1BQU0sTUFBTSxHQUFHLElBQUkseUJBQXlCLENBQUM7WUFDNUMsUUFBUSxFQUFFLFNBQVM7WUFDbkIsY0FBYyxFQUFFLEVBQUU7U0FDbEIsQ0FBQyxDQUFDO1FBQ0gsY0FBYyxDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDakMsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2xCLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDJDQUEyQyxFQUFFLEdBQUcsRUFBRTtRQUN0RCxNQUFNLE1BQU0sR0FBRyxJQUFJLHlCQUF5QixDQUFDO1lBQzVDLFFBQVEsRUFBRSxTQUFTO1lBQ25CLGNBQWMsRUFBRSxDQUFDLENBQUM7U0FDbEIsQ0FBQyxDQUFDO1FBQ0gsY0FBYyxDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDaEMsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2xCLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHlFQUF5RSxFQUFFLEdBQUcsRUFBRTtRQUNwRixNQUFNLFlBQVksR0FBd0IsRUFBRSxDQUFDO1FBQzdDLE1BQU0sQ0FBQyxjQUFjLENBQUMsWUFBWSxFQUFFLFNBQVMsRUFBRTtZQUM5QyxRQUFRLEVBQUUsS0FBSztZQUNmLEtBQUssRUFBRSxJQUFJO1NBQ1gsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxNQUFNLEdBQUcsSUFBSSxpQkFBaUIsQ0FBQyxFQUFFLEtBQUssRUFBRSxZQUFZLEVBQUUsQ0FBQyxDQUFDO1FBRTlELE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxHQUFHLDZCQUFvQixDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN6RSxNQUFNLENBQUMsYUFBYSxDQUFDLEVBQUUsS0FBSyxFQUFFLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNwRCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsR0FBRyw2QkFBb0IsQ0FBQyxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFMUUsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2xCLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDBDQUEwQyxFQUFFLEdBQUcsRUFBRTtRQUNyRCxNQUFNLE1BQU0sR0FBRyxJQUFJLGlCQUFpQixDQUFDLEVBQUUsV0FBVyxFQUFFLElBQUksRUFBRSxnQkFBZ0IsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBQ3JGLElBQUksS0FBSyxHQUFxQyxJQUFJLENBQUM7UUFDbkQsTUFBTSxVQUFVLEdBQUcsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQztRQUN0RCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsR0FBRyxtQ0FBMEIsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUV2RSxNQUFNLENBQUMsYUFBYSxDQUFDLEVBQUUsV0FBVyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFDNUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxFQUFFLGdCQUFnQixFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7UUFDbEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDaEMsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2pCLFVBQVUsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUN0QixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQywwQ0FBMEMsRUFBRSxHQUFHLEVBQUU7UUFDckQsTUFBTSxNQUFNLEdBQUcsSUFBSSxpQkFBaUIsQ0FBQyxFQUFFLGdCQUFnQixFQUFFLElBQUssRUFBRSxDQUFDLENBQUM7UUFDbEUsTUFBTSxNQUFNLEdBQWlELE1BQU0sQ0FBQyxPQUFPLENBQUMsR0FBRyx5Q0FBK0IsQ0FBQztRQUMvRyxNQUFNLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRTtZQUM5QixLQUFLLEVBQUUsSUFBSTtZQUNYLFFBQVEsRUFBRSxLQUFLO1lBQ2YsT0FBTyxFQUFFLEtBQUs7U0FDZCxDQUFDLENBQUM7UUFDSCxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDbEIsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsMERBQTBELEVBQUUsR0FBRyxFQUFFO1FBQ3JFLE1BQU0sTUFBTSxHQUFHLElBQUksaUJBQWlCLENBQUMsRUFBRSxnQkFBZ0IsRUFBRSxJQUFLLEVBQUUsQ0FBQyxDQUFDO1FBQ2xFLE1BQU0sQ0FBQyxhQUFhLENBQUMsRUFBRSxnQkFBZ0IsRUFBRSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDOUQsTUFBTSxNQUFNLEdBQWlELE1BQU0sQ0FBQyxPQUFPLENBQUMsR0FBRyx5Q0FBK0IsQ0FBQztRQUMvRyxNQUFNLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRTtZQUM5QixLQUFLLEVBQUUsSUFBSTtZQUNYLFFBQVEsRUFBRSxLQUFLO1lBQ2YsT0FBTyxFQUFFLElBQUk7U0FDYixDQUFDLENBQUM7UUFDSCxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDbEIsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsNkNBQTZDLEVBQUUsR0FBRyxFQUFFO1FBQ3hELE1BQU0sTUFBTSxHQUFHLElBQUksaUJBQWlCLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDekMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxFQUFFLGdCQUFnQixFQUFFLEVBQUUsaUJBQWlCLEVBQUUsRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDakYsTUFBTSxNQUFNLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxHQUFHLDRDQUFrQyxDQUFDO1FBQ3BFLE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUM1QjtZQUNDLGFBQWEsRUFBRSxzQkFBc0I7WUFDckMsbUJBQW1CLEVBQUUsSUFBSTtZQUN6QixtQkFBbUIsRUFBRSxJQUFJO1lBQ3pCLGVBQWUsRUFBRSxzQkFBc0I7WUFDdkMsY0FBYyxFQUFFLHNCQUFzQjtZQUN0QyxpQkFBaUIsRUFBRSxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUU7WUFDaEMsY0FBYyxFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFO1NBQ2hELENBQ0QsQ0FBQztRQUNGLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNsQixDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDO0FBRUgsS0FBSyxDQUFDLGdCQUFnQixFQUFFLEdBQUcsRUFBRTtJQUU1Qix1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLFNBQVMsT0FBTyxDQUFDLE9BQVk7UUFDNUIsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3hCLE9BQU8sT0FBTyxDQUFDO0lBQ2hCLENBQUM7SUFFRCxJQUFJLENBQUMsVUFBVSxFQUFFLEdBQUcsRUFBRTtRQUNyQixNQUFNLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFDeEUsTUFBTSxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO0lBQzNFLENBQUMsQ0FBQyxDQUFDO0lBQ0gsSUFBSSxDQUFDLGFBQWEsRUFBRSxHQUFHLEVBQUU7UUFDeEIsTUFBTSxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsRUFBRSxXQUFXLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxFQUFFLFdBQVcsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQzlFLE1BQU0sQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLEVBQUUsV0FBVyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztJQUNqRixDQUFDLENBQUMsQ0FBQztJQUNILElBQUksQ0FBQyxxQkFBcUIsRUFBRSxHQUFHLEVBQUU7UUFDaEMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsRUFBRSxtQkFBbUIsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLEVBQUUsbUJBQW1CLEVBQUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE9BQU8sRUFBRSxZQUFZLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQztJQUN0SixDQUFDLENBQUMsQ0FBQztJQUNILElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxHQUFHLEVBQUU7UUFDM0IsTUFBTSxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsRUFBRSxjQUFjLEVBQUUsU0FBUyxFQUFFLENBQUMsRUFBRSxFQUFFLGNBQWMsRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFDO0lBQzdGLENBQUMsQ0FBQyxDQUFDO0lBQ0gsSUFBSSxDQUFDLGtCQUFrQixFQUFFLEdBQUcsRUFBRTtRQUM3QixNQUFNLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxFQUFFLGdCQUFnQixFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsRUFBRSxnQkFBZ0IsRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFDO1FBQzlGLE1BQU0sQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLEVBQUUsZ0JBQWdCLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxFQUFFLGdCQUFnQixFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7SUFDNUYsQ0FBQyxDQUFDLENBQUM7SUFDSCxJQUFJLENBQUMscUJBQXFCLEVBQUUsR0FBRyxFQUFFO1FBQ2hDLE1BQU0sQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLEVBQUUsbUJBQW1CLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxFQUFFLG1CQUFtQixFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDaEcsTUFBTSxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsRUFBRSxtQkFBbUIsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUNsRyxDQUFDLENBQUMsQ0FBQztJQUNILElBQUksQ0FBQyx5QkFBeUIsRUFBRSxHQUFHLEVBQUU7UUFDcEMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsRUFBRSx1QkFBdUIsRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLEVBQUUsdUJBQXVCLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUN0RyxNQUFNLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxFQUFFLHVCQUF1QixFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsRUFBRSx1QkFBdUIsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO0lBQ3pHLENBQUMsQ0FBQyxDQUFDO0lBQ0gsSUFBSSxDQUFDLGVBQWUsRUFBRSxHQUFHLEVBQUU7UUFDMUIsTUFBTSxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsRUFBRSxhQUFhLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxFQUFFLGFBQWEsRUFBRSxjQUFjLEVBQUUsQ0FBQyxDQUFDO1FBQzVGLE1BQU0sQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLEVBQUUsYUFBYSxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsRUFBRSxhQUFhLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztJQUNyRixDQUFDLENBQUMsQ0FBQztJQUNILElBQUksQ0FBQyx1QkFBdUIsRUFBRSxHQUFHLEVBQUU7UUFDbEMsTUFBTSxDQUFDLGVBQWUsQ0FDckIsT0FBTyxDQUFDO1lBQ1AsT0FBTyxFQUFFO2dCQUNSLGFBQWEsRUFBRTtvQkFDZCxNQUFNLEVBQUUsS0FBSztvQkFDYixRQUFRLEVBQUUsS0FBSztvQkFDZixXQUFXLEVBQUUsS0FBSztvQkFDbEIsVUFBVSxFQUFFLEtBQUs7b0JBQ2pCLEtBQUssRUFBRSxLQUFLO29CQUNaLFFBQVEsRUFBRSxLQUFLO29CQUNmLEtBQUssRUFBRSxLQUFLO29CQUNaLE1BQU0sRUFBRSxLQUFLO29CQUNiLFNBQVMsRUFBRSxLQUFLO29CQUNoQixNQUFNLEVBQUUsS0FBSztvQkFDYixRQUFRLEVBQUUsS0FBSztvQkFDZixLQUFLLEVBQUUsS0FBSztvQkFDWixRQUFRLEVBQUUsS0FBSztvQkFDZixJQUFJLEVBQUUsS0FBSztvQkFDWCxLQUFLLEVBQUUsS0FBSztvQkFDWixRQUFRLEVBQUUsS0FBSztvQkFDZixJQUFJLEVBQUUsS0FBSztvQkFDWCxVQUFVLEVBQUUsS0FBSztvQkFDakIsT0FBTyxFQUFFLEtBQUs7b0JBQ2QsSUFBSSxFQUFFLEtBQUs7b0JBQ1gsS0FBSyxFQUFFLEtBQUs7b0JBQ1osSUFBSSxFQUFFLEtBQUs7b0JBQ1gsU0FBUyxFQUFFLEtBQUs7b0JBQ2hCLE1BQU0sRUFBRSxLQUFLO29CQUNiLGFBQWEsRUFBRSxLQUFLO29CQUNwQixPQUFPLEVBQUUsS0FBSztpQkFDZDthQUNEO1NBQ0QsQ0FBQyxFQUFFO1lBQ0osT0FBTyxFQUFFO2dCQUNSLGFBQWEsRUFBRSxTQUFTO2dCQUN4QixXQUFXLEVBQUUsS0FBSztnQkFDbEIsYUFBYSxFQUFFLEtBQUs7Z0JBQ3BCLGdCQUFnQixFQUFFLEtBQUs7Z0JBQ3ZCLGNBQWMsRUFBRSxLQUFLO2dCQUNyQixVQUFVLEVBQUUsS0FBSztnQkFDakIsYUFBYSxFQUFFLEtBQUs7Z0JBQ3BCLFdBQVcsRUFBRSxLQUFLO2dCQUNsQixXQUFXLEVBQUUsS0FBSztnQkFDbEIsY0FBYyxFQUFFLEtBQUs7Z0JBQ3JCLFdBQVcsRUFBRSxLQUFLO2dCQUNsQixjQUFjLEVBQUUsS0FBSztnQkFDckIsVUFBVSxFQUFFLEtBQUs7Z0JBQ2pCLGFBQWEsRUFBRSxLQUFLO2dCQUNwQixTQUFTLEVBQUUsS0FBSztnQkFDaEIsVUFBVSxFQUFFLEtBQUs7Z0JBQ2pCLGFBQWEsRUFBRSxLQUFLO2dCQUNwQixTQUFTLEVBQUUsS0FBSztnQkFDaEIsZUFBZSxFQUFFLEtBQUs7Z0JBQ3RCLFlBQVksRUFBRSxLQUFLO2dCQUNuQixTQUFTLEVBQUUsS0FBSztnQkFDaEIsVUFBVSxFQUFFLEtBQUs7Z0JBQ2pCLFNBQVMsRUFBRSxLQUFLO2dCQUNoQixjQUFjLEVBQUUsS0FBSztnQkFDckIsV0FBVyxFQUFFLEtBQUs7Z0JBQ2xCLGtCQUFrQixFQUFFLEtBQUs7Z0JBQ3pCLFlBQVksRUFBRSxLQUFLO2FBQ25CO1NBQ0QsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFDSCxJQUFJLENBQUMsa0JBQWtCLEVBQUUsR0FBRyxFQUFFO1FBQzdCLE1BQU0sQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLEVBQUUsZ0JBQWdCLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxFQUFFLGdCQUFnQixFQUFFLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDbEksTUFBTSxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsRUFBRSxnQkFBZ0IsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLEVBQUUsZ0JBQWdCLEVBQUUsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0SSxNQUFNLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxFQUFFLGdCQUFnQixFQUFFLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsZ0JBQWdCLEVBQUUsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDckosQ0FBQyxDQUFDLENBQUM7SUFDSCxJQUFJLENBQUMsT0FBTyxFQUFFLEdBQUcsRUFBRTtRQUNsQixNQUFNLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztRQUMvRSxNQUFNLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztJQUNsRixDQUFDLENBQUMsQ0FBQztJQUNILElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxHQUFHLEVBQUU7UUFDM0IsTUFBTSxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsRUFBRSxjQUFjLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxFQUFFLGNBQWMsRUFBRSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDakcsTUFBTSxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsRUFBRSxjQUFjLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxFQUFFLGNBQWMsRUFBRSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDcEcsQ0FBQyxDQUFDLENBQUM7SUFDSCxJQUFJLENBQUMsWUFBWSxFQUFFLEdBQUcsRUFBRTtRQUN2QixNQUFNLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLEVBQUUsVUFBVSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDOUUsTUFBTSxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFDO0lBQ3BGLENBQUMsQ0FBQyxDQUFDO0lBQ0gsSUFBSSxDQUFDLGVBQWUsRUFBRSxHQUFHLEVBQUU7UUFDMUIsTUFBTSxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsRUFBRSxhQUFhLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxFQUFFLGFBQWEsRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDO1FBQ3RGLE1BQU0sQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLEVBQUUsYUFBYSxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsRUFBRSxhQUFhLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQztJQUN2RixDQUFDLENBQUMsQ0FBQztJQUNILElBQUksQ0FBQyxnREFBZ0QsRUFBRSxHQUFHLEVBQUU7UUFDM0QsTUFBTSxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsRUFBRSxrQkFBa0IsRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLEVBQUUsa0JBQWtCLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxFQUFFLFdBQVcsRUFBRSxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDaEksTUFBTSxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsRUFBRSxrQkFBa0IsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLEVBQUUsa0JBQWtCLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxFQUFFLFdBQVcsRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDbEksTUFBTSxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsRUFBRSwwQkFBMEIsRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLEVBQUUsMEJBQTBCLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxFQUFFLDBCQUEwQixFQUFFLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztRQUMvSixNQUFNLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxFQUFFLDBCQUEwQixFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsRUFBRSwwQkFBMEIsRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLEVBQUUsMEJBQTBCLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ2xLLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDBDQUEwQyxFQUFFLEdBQUcsRUFBRTtRQUNyRCxNQUFNLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxFQUFFLGtCQUFrQixFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsa0JBQWtCLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxFQUFFLFdBQVcsRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDakssTUFBTSxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsRUFBRSwwQkFBMEIsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLEVBQUUsMEJBQTBCLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsMEJBQTBCLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxFQUFFLDBCQUEwQixFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztJQUNoTixDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDIn0=