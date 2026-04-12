/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { computeDefaultDocumentColors } from '../../../common/languages/defaultDocumentColorsComputer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
suite('Default Document Colors Computer', () => {
    class TestDocumentModel {
        constructor(content) {
            this.content = content;
        }
        getValue() {
            return this.content;
        }
        positionAt(offset) {
            const lines = this.content.substring(0, offset).split('\n');
            return {
                lineNumber: lines.length,
                column: lines[lines.length - 1].length + 1
            };
        }
        findMatches(regex) {
            return [...this.content.matchAll(regex)];
        }
    }
    ensureNoDisposablesAreLeakedInTestSuite();
    test('Hex colors in strings should be detected', () => {
        // Test case from issue: hex color inside string is not detected
        const model = new TestDocumentModel(`const color = '#ff0000';`);
        const colors = computeDefaultDocumentColors(model);
        assert.strictEqual(colors.length, 1, 'Should detect one hex color');
        assert.strictEqual(colors[0].color.red, 1, 'Red component should be 1 (255/255)');
        assert.strictEqual(colors[0].color.green, 0, 'Green component should be 0');
        assert.strictEqual(colors[0].color.blue, 0, 'Blue component should be 0');
        assert.strictEqual(colors[0].color.alpha, 1, 'Alpha should be 1');
    });
    test('Hex colors in double quotes should be detected', () => {
        const model = new TestDocumentModel('const color = "#00ff00";');
        const colors = computeDefaultDocumentColors(model);
        assert.strictEqual(colors.length, 1, 'Should detect one hex color');
        assert.strictEqual(colors[0].color.red, 0, 'Red component should be 0');
        assert.strictEqual(colors[0].color.green, 1, 'Green component should be 1 (255/255)');
        assert.strictEqual(colors[0].color.blue, 0, 'Blue component should be 0');
    });
    test('Multiple hex colors in array should be detected', () => {
        const model = new TestDocumentModel(`const colors = ['#ff0000', '#00ff00', '#0000ff'];`);
        const colors = computeDefaultDocumentColors(model);
        assert.strictEqual(colors.length, 3, 'Should detect three hex colors');
        // First color: red
        assert.strictEqual(colors[0].color.red, 1, 'First color red component should be 1');
        assert.strictEqual(colors[0].color.green, 0, 'First color green component should be 0');
        assert.strictEqual(colors[0].color.blue, 0, 'First color blue component should be 0');
        // Second color: green
        assert.strictEqual(colors[1].color.red, 0, 'Second color red component should be 0');
        assert.strictEqual(colors[1].color.green, 1, 'Second color green component should be 1');
        assert.strictEqual(colors[1].color.blue, 0, 'Second color blue component should be 0');
        // Third color: blue
        assert.strictEqual(colors[2].color.red, 0, 'Third color red component should be 0');
        assert.strictEqual(colors[2].color.green, 0, 'Third color green component should be 0');
        assert.strictEqual(colors[2].color.blue, 1, 'Third color blue component should be 1');
    });
    test('Existing functionality should still work', () => {
        // Test cases that were already working
        const testCases = [
            { content: `const color = ' #ff0000';`, name: 'hex with space before' },
            { content: '#ff0000', name: 'hex at start of line' },
            { content: '  #ff0000', name: 'hex with whitespace before' }
        ];
        testCases.forEach(testCase => {
            const model = new TestDocumentModel(testCase.content);
            const colors = computeDefaultDocumentColors(model);
            assert.strictEqual(colors.length, 1, `Should still detect ${testCase.name}`);
        });
    });
    test('8-digit hex colors should also work', () => {
        const model = new TestDocumentModel(`const color = '#ff0000ff';`);
        const colors = computeDefaultDocumentColors(model);
        assert.strictEqual(colors.length, 1, 'Should detect one 8-digit hex color');
        assert.strictEqual(colors[0].color.red, 1, 'Red component should be 1');
        assert.strictEqual(colors[0].color.green, 0, 'Green component should be 0');
        assert.strictEqual(colors[0].color.blue, 0, 'Blue component should be 0');
        assert.strictEqual(colors[0].color.alpha, 1, 'Alpha should be 1 (ff/255)');
    });
    test('hsl 100 percent saturation works with decimals', () => {
        const model = new TestDocumentModel('const color = hsl(253, 100.00%, 47.10%);');
        const colors = computeDefaultDocumentColors(model);
        assert.strictEqual(colors.length, 1, 'Should detect one hsl color');
    });
    test('hsl 100 percent saturation works without decimals', () => {
        const model = new TestDocumentModel('const color = hsl(253, 100%, 47.10%);');
        const colors = computeDefaultDocumentColors(model);
        assert.strictEqual(colors.length, 1, 'Should detect one hsl color');
    });
    test('hsl not 100 percent saturation should also work', () => {
        const model = new TestDocumentModel('const color = hsl(0, 83.60%, 47.80%);');
        const colors = computeDefaultDocumentColors(model);
        assert.strictEqual(colors.length, 1, 'Should detect one hsl color');
    });
    test('hsl with decimal hue values should work', () => {
        // Test case from issue #180436 comment
        const testCases = [
            { content: 'hsl(253.5, 100%, 50%)', name: 'decimal hue' },
            { content: 'hsl(360.0, 50%, 50%)', name: '360.0 hue' },
            { content: 'hsl(100.5, 50.5%, 50.5%)', name: 'all decimals' },
            { content: 'hsl(0.5, 50%, 50%)', name: 'small decimal hue' },
            { content: 'hsl(359.9, 100%, 50%)', name: 'near-max decimal hue' }
        ];
        testCases.forEach(testCase => {
            const model = new TestDocumentModel(`const color = ${testCase.content};`);
            const colors = computeDefaultDocumentColors(model);
            assert.strictEqual(colors.length, 1, `Should detect hsl color with ${testCase.name}: ${testCase.content}`);
        });
    });
    test('hsla with decimal values should work', () => {
        const testCases = [
            { content: 'hsla(253.5, 100%, 50%, 0.5)', name: 'decimal hue with alpha' },
            { content: 'hsla(360.0, 50.5%, 50.5%, 1)', name: 'all decimals with alpha 1' },
            { content: 'hsla(0.5, 50%, 50%, 0.25)', name: 'small decimal hue with alpha' }
        ];
        testCases.forEach(testCase => {
            const model = new TestDocumentModel(`const color = ${testCase.content};`);
            const colors = computeDefaultDocumentColors(model);
            assert.strictEqual(colors.length, 1, `Should detect hsla color with ${testCase.name}: ${testCase.content}`);
        });
    });
    test('hsl with space separator (CSS Level 4 syntax) should work', () => {
        // CSS Level 4 allows space-separated values instead of comma-separated
        const testCases = [
            { content: 'hsl(253 100% 50%)', name: 'space-separated' },
            { content: 'hsl(253.5 100% 50%)', name: 'space-separated with decimal hue' },
            { content: 'hsla(253 100% 50% / 0.5)', name: 'hsla with slash separator for alpha' },
            { content: 'hsla(253.5 100% 50% / 0.5)', name: 'hsla with decimal hue and slash separator' },
            { content: 'hsla(253 100% 50% / 1)', name: 'hsla with slash and alpha 1' }
        ];
        testCases.forEach(testCase => {
            const model = new TestDocumentModel(`const color = ${testCase.content};`);
            const colors = computeDefaultDocumentColors(model);
            assert.strictEqual(colors.length, 1, `Should detect hsl color with ${testCase.name}: ${testCase.content}`);
        });
    });
    test('rgb and rgba with CSS Level 4 space-separated syntax should work', () => {
        // CSS Level 4 allows space-separated values for RGB/RGBA
        const testCases = [
            { content: 'rgb(255 0 0)', name: 'rgb space-separated' },
            { content: 'rgb(128 128 128)', name: 'rgb space-separated gray' },
            { content: 'rgba(255 0 0 / 0.5)', name: 'rgba with slash separator for alpha' },
            { content: 'rgba(128 128 128 / 0.8)', name: 'rgba gray with slash separator' },
            { content: 'rgba(255 0 0 / 1)', name: 'rgba with slash and alpha 1' },
            // Traditional comma syntax should still work
            { content: 'rgb(255, 0, 0)', name: 'rgb comma-separated (traditional)' },
            { content: 'rgba(255, 0, 0, 0.5)', name: 'rgba comma-separated (traditional)' }
        ];
        testCases.forEach(testCase => {
            const model = new TestDocumentModel(`const color = ${testCase.content};`);
            const colors = computeDefaultDocumentColors(model);
            assert.strictEqual(colors.length, 1, `Should detect rgb/rgba color with ${testCase.name}: ${testCase.content}`);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVmYXVsdERvY3VtZW50Q29sb3JzQ29tcHV0ZXIudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci90ZXN0L2NvbW1vbi9sYW5ndWFnZXMvZGVmYXVsdERvY3VtZW50Q29sb3JzQ29tcHV0ZXIudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUNoRyxPQUFPLEtBQUssTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUNqQyxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUMxRyxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUVoRyxLQUFLLENBQUMsa0NBQWtDLEVBQUUsR0FBRyxFQUFFO0lBRTlDLE1BQU0saUJBQWlCO1FBQ3RCLFlBQW9CLE9BQWU7WUFBZixZQUFPLEdBQVAsT0FBTyxDQUFRO1FBQUksQ0FBQztRQUV4QyxRQUFRO1lBQ1AsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDO1FBQ3JCLENBQUM7UUFFRCxVQUFVLENBQUMsTUFBYztZQUN4QixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzVELE9BQU87Z0JBQ04sVUFBVSxFQUFFLEtBQUssQ0FBQyxNQUFNO2dCQUN4QixNQUFNLEVBQUUsS0FBSyxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsTUFBTSxHQUFHLENBQUM7YUFDMUMsQ0FBQztRQUNILENBQUM7UUFFRCxXQUFXLENBQUMsS0FBYTtZQUN4QixPQUFPLENBQUMsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQzFDLENBQUM7S0FDRDtJQUVELHVDQUF1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