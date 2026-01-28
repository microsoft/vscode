/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { computeDefaultDocumentColors } from '../../../common/languages/defaultDocumentColorsComputer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('Default Document Colors Computer', () => {

	class TestDocumentModel {
		constructor(private content: string) { }

		getValue(): string {
			return this.content;
		}

		positionAt(offset: number) {
			const lines = this.content.substring(0, offset).split('\n');
			return {
				lineNumber: lines.length,
				column: lines[lines.length - 1].length + 1
			};
		}

		findMatches(regex: RegExp): RegExpMatchArray[] {
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

	test('8-digit hex colors with ARGB format should be parsed correctly', () => {
		// #AARRGGBB format - alpha first
		const model = new TestDocumentModel(`const color = '#80ff0000';`);
		const colors = computeDefaultDocumentColors(model, 'argb');

		assert.strictEqual(colors.length, 1, 'Should detect one 8-digit hex color');
		assert.strictEqual(colors[0].color.red, 1, 'Red component should be 1 (ff)');
		assert.strictEqual(colors[0].color.green, 0, 'Green component should be 0');
		assert.strictEqual(colors[0].color.blue, 0, 'Blue component should be 0');
		// Alpha is first: 0x80 = 128, 128/255 ≈ 0.502
		assert.ok(Math.abs(colors[0].color.alpha - 128 / 255) < 0.01, `Alpha should be ~0.502 but was ${colors[0].color.alpha}`);
	});

	test('4-digit hex colors with ARGB format should be parsed correctly', () => {
		// #ARGB format - alpha first
		const model = new TestDocumentModel(`const color = '#8f00';`);
		const colors = computeDefaultDocumentColors(model, 'argb');

		assert.strictEqual(colors.length, 1, 'Should detect one 4-digit hex color');
		assert.strictEqual(colors[0].color.red, 1, 'Red component should be 1 (f expanded to ff)');
		assert.strictEqual(colors[0].color.green, 0, 'Green component should be 0');
		assert.strictEqual(colors[0].color.blue, 0, 'Blue component should be 0');
		// Alpha is first: 0x8 expanded to 0x88 = 136, 136/255 ≈ 0.533
		assert.ok(Math.abs(colors[0].color.alpha - 136 / 255) < 0.01, `Alpha should be ~0.533 but was ${colors[0].color.alpha}`);
	});

	test('8-digit hex colors with default RGBA format', () => {
		// #RRGGBBAA format - alpha last (default)
		const model = new TestDocumentModel(`const color = '#ff000080';`);
		const colors = computeDefaultDocumentColors(model); // default is rgba

		assert.strictEqual(colors.length, 1, 'Should detect one 8-digit hex color');
		assert.strictEqual(colors[0].color.red, 1, 'Red component should be 1');
		assert.strictEqual(colors[0].color.green, 0, 'Green component should be 0');
		assert.strictEqual(colors[0].color.blue, 0, 'Blue component should be 0');
		// Alpha is last: 0x80 = 128, 128/255 ≈ 0.502
		assert.ok(Math.abs(colors[0].color.alpha - 128 / 255) < 0.01, `Alpha should be ~0.502 but was ${colors[0].color.alpha}`);
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

	test('argb() colors should be detected', () => {
		const model = new TestDocumentModel(`const color = argb(0.5, 255, 0, 0);`);
		const colors = computeDefaultDocumentColors(model);

		assert.strictEqual(colors.length, 1, 'Should detect one argb color');
		assert.strictEqual(colors[0].color.red, 1, 'Red component should be 1');
		assert.strictEqual(colors[0].color.green, 0, 'Green component should be 0');
		assert.strictEqual(colors[0].color.blue, 0, 'Blue component should be 0');
		assert.ok(Math.abs(colors[0].color.alpha - 0.5) < 0.01, `Alpha should be 0.5 but was ${colors[0].color.alpha}`);
	});

	test('argb() colors with integer alpha should be detected', () => {
		const model = new TestDocumentModel(`const color = argb(1, 0, 255, 0);`);
		const colors = computeDefaultDocumentColors(model);

		assert.strictEqual(colors.length, 1, 'Should detect one argb color');
		assert.strictEqual(colors[0].color.red, 0);
		assert.strictEqual(colors[0].color.green, 1);
		assert.strictEqual(colors[0].color.blue, 0);
		assert.strictEqual(colors[0].color.alpha, 1);
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
