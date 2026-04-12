/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getSizeRegistry, registerSize, size, sizeForAllThemes, sizeValueToCss, asCssVariableName, asCssVariable } from '../../common/sizeRegistry.js';
// Import baseSizes to ensure base size tokens are registered
import { bodyFontSize, bodyFontSizeSmall, codiconFontSize, cornerRadiusMedium, cornerRadiusSmall, cornerRadiusLarge, strokeThickness } from '../../common/sizes/baseSizes.js';
suite('Size Registry', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('registerSize should register a size token', () => {
        const id = registerSize('test.size', { dark: size(10, 'px'), light: size(10, 'px'), hcDark: size(10, 'px'), hcLight: size(10, 'px') }, 'Test size');
        assert.strictEqual(id, 'test.size');
        const sizes = getSizeRegistry().getSizes();
        const testSize = sizes.find(s => s.id === 'test.size');
        assert.ok(testSize);
        assert.strictEqual(testSize.description, 'Test size');
        getSizeRegistry().deregisterSize('test.size');
    });
    test('sizeValueToCss should convert size value to CSS string', () => {
        assert.strictEqual(sizeValueToCss(size(10, 'px')), '10px');
        assert.strictEqual(sizeValueToCss(size(1.5, 'rem')), '1.5rem');
        assert.strictEqual(sizeValueToCss(size(100, '%')), '100%');
        assert.strictEqual(sizeValueToCss(size(1.2, 'em')), '1.2em');
    });
    test('asCssVariableName should convert identifier to CSS variable name', () => {
        assert.strictEqual(asCssVariableName('fontSize'), '--vscode-fontSize');
        assert.strictEqual(asCssVariableName('corner.radius'), '--vscode-corner-radius');
        assert.strictEqual(asCssVariableName('font.size.large'), '--vscode-font-size-large');
    });
    test('asCssVariable should create CSS variable reference', () => {
        assert.strictEqual(asCssVariable('fontSize'), 'var(--vscode-fontSize)');
        assert.strictEqual(asCssVariable('cornerRadius'), 'var(--vscode-cornerRadius)');
    });
    test('deregisterSize should remove a size token', () => {
        registerSize('test.remove', { dark: size(5, 'px'), light: size(5, 'px'), hcDark: size(5, 'px'), hcLight: size(5, 'px') }, 'Test remove');
        let sizes = getSizeRegistry().getSizes();
        assert.ok(sizes.find(s => s.id === 'test.remove'));
        getSizeRegistry().deregisterSize('test.remove');
        sizes = getSizeRegistry().getSizes();
        assert.ok(!sizes.find(s => s.id === 'test.remove'));
    });
    test('size tokens should be available', () => {
        const sizes = getSizeRegistry().getSizes();
        // Check that base sizes are registered
        assert.ok(sizes.find(s => s.id === bodyFontSize), 'bodyFontSize should be registered');
        assert.ok(sizes.find(s => s.id === bodyFontSizeSmall), 'bodyFontSizeSmall should be registered');
        assert.ok(sizes.find(s => s.id === codiconFontSize), 'codiconFontSize should be registered');
        assert.ok(sizes.find(s => s.id === cornerRadiusMedium), 'cornerRadius.medium should be registered');
        assert.ok(sizes.find(s => s.id === cornerRadiusSmall), 'cornerRadius.small should be registered');
        assert.ok(sizes.find(s => s.id === cornerRadiusLarge), 'cornerRadius.large should be registered');
        assert.ok(sizes.find(s => s.id === strokeThickness), 'strokeThickness should be registered');
    });
    test('sizeForAllThemes should create same value for all themes', () => {
        const sizeDefaults = sizeForAllThemes(10, 'px');
        assert.deepStrictEqual(sizeDefaults.light, { value: 10, unit: 'px' });
        assert.deepStrictEqual(sizeDefaults.dark, { value: 10, unit: 'px' });
        assert.deepStrictEqual(sizeDefaults.hcDark, { value: 10, unit: 'px' });
        assert.deepStrictEqual(sizeDefaults.hcLight, { value: 10, unit: 'px' });
    });
    test('registerSize should work with sizeForAllThemes', () => {
        const id = registerSize('test.allThemes', sizeForAllThemes(5, 'rem'), 'Test all themes');
        assert.strictEqual(id, 'test.allThemes');
        const sizes = getSizeRegistry().getSizes();
        const testSize = sizes.find(s => s.id === 'test.allThemes');
        assert.ok(testSize);
        getSizeRegistry().deregisterSize('test.allThemes');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2l6ZVJlZ2lzdHJ5LnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS90aGVtZS90ZXN0L2NvbW1vbi9zaXplUmVnaXN0cnkudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxZQUFZLEVBQUUsSUFBSSxFQUFFLGdCQUFnQixFQUFFLGNBQWMsRUFBRSxpQkFBaUIsRUFBRSxhQUFhLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUN2Siw2REFBNkQ7QUFDN0QsT0FBTyxFQUFFLFlBQVksRUFBRSxpQkFBaUIsRUFBRSxlQUFlLEVBQUUsa0JBQWtCLEVBQUUsaUJBQWlCLEVBQUUsaUJBQWlCLEVBQUUsZUFBZSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFFOUssS0FBSyxDQUFDLGVBQWUsRUFBRSxHQUFHLEVBQUU7SUFFM0IsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxJQUFJLENBQUMsMkNBQTJDLEVBQUUsR0FBRyxFQUFFO1FBQ3RELE1BQU0sRUFBRSxHQUFHLFlBQVksQ0FBQyxXQUFXLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRSxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRSxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRSxJQUFJLENBQUMsRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRSxJQUFJLENBQUMsRUFBRSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQ3BKLE1BQU0sQ0FBQyxXQUFXLENBQUMsRUFBRSxFQUFFLFdBQVcsQ0FBQyxDQUFD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