/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../common/core/range.js';
import { DefaultDocumentColorProvider } from '../../browser/defaultDocumentColorProvider.js';
suite('DefaultDocumentColorProvider', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('Color presentations should not include alpha channel when alpha is 1', () => {
        const provider = new DefaultDocumentColorProvider(null);
        // Test case 1: Fully opaque color (alpha = 1) should not include alpha channel
        const opaqueColorInfo = {
            range: new Range(1, 1, 1, 10),
            color: {
                red: 1,
                green: 0,
                blue: 0,
                alpha: 1
            }
        };
        const opaquePresentations = provider.provideColorPresentations(null, opaqueColorInfo, CancellationToken.None);
        assert.strictEqual(opaquePresentations[0].label, 'rgb(255, 0, 0)', 'RGB should not include alpha when alpha is 1');
        assert.strictEqual(opaquePresentations[1].label, 'hsl(0, 100%, 50%)', 'HSL should not include alpha when alpha is 1');
        assert.strictEqual(opaquePresentations[2].label, '#ff0000', 'HEX should not include alpha when alpha is 1');
    });
    test('Color presentations should include alpha channel when alpha is not 1', () => {
        const provider = new DefaultDocumentColorProvider(null);
        // Test case 2: Transparent color (alpha = 0) should include alpha channel
        const transparentColorInfo = {
            range: new Range(1, 1, 1, 10),
            color: {
                red: 0,
                green: 0,
                blue: 0,
                alpha: 0
            }
        };
        const transparentPresentations = provider.provideColorPresentations(null, transparentColorInfo, CancellationToken.None);
        assert.strictEqual(transparentPresentations[0].label, 'rgba(0, 0, 0, 0)', 'RGB should include alpha when alpha is 0');
        assert.strictEqual(transparentPresentations[1].label, 'hsla(0, 0%, 0%, 0.00)', 'HSL should include alpha when alpha is 0');
        assert.strictEqual(transparentPresentations[2].label, '#00000000', 'HEX should include alpha when alpha is 0');
    });
    test('Color presentations should include alpha channel when alpha is between 0 and 1', () => {
        const provider = new DefaultDocumentColorProvider(null);
        // Test case 3: Semi-transparent color (alpha = 0.67) should include alpha channel
        const semiTransparentColorInfo = {
            range: new Range(1, 1, 1, 10),
            color: {
                red: 0.67,
                green: 0,
                blue: 0,
                alpha: 0.67
            }
        };
        const semiTransparentPresentations = provider.provideColorPresentations(null, semiTransparentColorInfo, CancellationToken.None);
        assert.strictEqual(semiTransparentPresentations[0].label, 'rgba(171, 0, 0, 0.67)', 'RGB should include alpha when alpha is 0.67');
        assert.strictEqual(semiTransparentPresentations[1].label, 'hsla(0, 100%, 34%, 0.67)', 'HSL should include alpha when alpha is 0.67');
        assert.strictEqual(semiTransparentPresentations[2].label, '#ab0000ab', 'HEX should include alpha when alpha is 0.67');
    });
    test('Regression test for issue #243746: opacity should be preserved when switching to hex format', () => {
        // Original bug: When switching from rgba/hsla with opacity to hex format,
        // the opacity was being lost because alpha was falsy (0 or less than 1)
        const provider = new DefaultDocumentColorProvider(null);
        const colorWithOpacity = {
            range: new Range(1, 1, 1, 10),
            color: {
                red: 0.5,
                green: 0.5,
                blue: 0.5,
                alpha: 0.5
            }
        };
        const presentations = provider.provideColorPresentations(null, colorWithOpacity, CancellationToken.None);
        // Hex format should preserve the opacity by including alpha channel
        assert.strictEqual(presentations[2].label, '#80808080', 'HEX format should preserve opacity (issue #243746)');
    });
    test('Regression test for issue #256853: fully opaque colors should not add unnecessary alpha suffix', () => {
        // Bug introduced by fix for #243746: When alpha was 1 (fully opaque),
        // the hex format would incorrectly add 'ff' suffix
        const provider = new DefaultDocumentColorProvider(null);
        const fullyOpaqueColor = {
            range: new Range(1, 1, 1, 10),
            color: {
                red: 0.58, // #935ba5 example from issue
                green: 0.36,
                blue: 0.65,
                alpha: 1
            }
        };
        const presentations = provider.provideColorPresentations(null, fullyOpaqueColor, CancellationToken.None);
        // Hex format should NOT include alpha when it's 1 (fully opaque)
        // The actual hex value is #945ca6 (after rounding 0.58*255, 0.36*255, 0.65*255)
        assert.strictEqual(presentations[2].label, '#945ca6', 'HEX format should not add ff suffix when fully opaque (issue #256853)');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVmYXVsdERvY3VtZW50Q29sb3JQcm92aWRlci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvY29sb3JQaWNrZXIvdGVzdC9icm93c2VyL2RlZmF1bHREb2N1bWVudENvbG9yUHJvdmlkZXIudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUNqQyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFekQsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFFN0YsS0FBSyxDQUFDLDhCQUE4QixFQUFFLEdBQUcsRUFBRTtJQUUxQyx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLElBQUksQ0FBQyxzRUFBc0UsRUFBRSxHQUFHLEVBQUU7UUFDakYsTUFBTSxRQUFRLEdBQUcsSUFBSSw0QkFBNEIsQ0FBQyxJQUFLLENBQUMsQ0FBQztRQUV6RCwrRUFBK0U7UUFDL0UsTUFBTSxlQUFlLEdBQXNCO1lBQzFDLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDN0IsS0FBSyxFQUFFO2dCQUNOLEdBQUcsRUFBRSxDQUFDO2dCQUNOLEtBQUssRUFBRSxDQUFDO2dCQUNSLElBQUksRUFBRSxDQUFDO2dCQUNQLEtBQUssRUFBRSxDQUFDO2FBQ1I7U0FDRCxDQUFDO1FBRUYsTUFBTSxtQkFBbUIsR0FBRyxRQUFRLENBQUMseUJBQXlCLENBQUMsSUFBSyxFQUFFLGVBQWUsRUFBRSxpQkFB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