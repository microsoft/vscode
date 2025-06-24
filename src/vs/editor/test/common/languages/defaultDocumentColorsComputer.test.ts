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
		const model = new TestDocumentModel("const color = '#ff0000';");
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
		const model = new TestDocumentModel("const colors = ['#ff0000', '#00ff00', '#0000ff'];");
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
			{ content: "const color = ' #ff0000';", name: 'hex with space before' },
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
		const model = new TestDocumentModel("const color = '#ff0000ff';");
		const colors = computeDefaultDocumentColors(model);

		assert.strictEqual(colors.length, 1, 'Should detect one 8-digit hex color');
		assert.strictEqual(colors[0].color.red, 1, 'Red component should be 1');
		assert.strictEqual(colors[0].color.green, 0, 'Green component should be 0');
		assert.strictEqual(colors[0].color.blue, 0, 'Blue component should be 0');
		assert.strictEqual(colors[0].color.alpha, 1, 'Alpha should be 1 (ff/255)');
	});

	test('HSL colors with different valid syntaxes should be detected', () => {
		// Test case from the original issue: https://github.com/microsoft/vscode/issues/193512
		const model = new TestDocumentModel("const blues = ['hsl(192, 87%, 49%)', 'hsl(192 87% 49%)', 'hsl(192.5, 87.5%, 49.5%)'];");
		const colors = computeDefaultDocumentColors(model);

		assert.strictEqual(colors.length, 3, 'Should detect all three HSL colors');

		// All should be similar blue colors (we're not testing exact color conversion here, just detection)
		colors.forEach((color, index) => {
			assert.strictEqual(typeof color.color.red, 'number', `Color ${index + 1} should have numeric red component`);
			assert.strictEqual(typeof color.color.green, 'number', `Color ${index + 1} should have numeric green component`);
			assert.strictEqual(typeof color.color.blue, 'number', `Color ${index + 1} should have numeric blue component`);
			assert.strictEqual(color.color.alpha, 1, `Color ${index + 1} should have alpha of 1`);
		});
	});

	test('Individual HSL syntax variants should be detected', () => {
		const testCases = [
			{ syntax: 'hsl(192, 87%, 49%)', name: 'comma-separated with integer hue' },
			{ syntax: 'hsl(192 87% 49%)', name: 'space-separated (CSS Level 4)' },
			{ syntax: 'hsl(192.5, 87.5%, 49.5%)', name: 'comma-separated with decimal values' },
			{ syntax: 'hsl(192.5 87.5% 49.5%)', name: 'space-separated with decimal values' }
		];

		testCases.forEach(testCase => {
			const model = new TestDocumentModel(`const color = '${testCase.syntax}';`);
			const colors = computeDefaultDocumentColors(model);
			assert.strictEqual(colors.length, 1, `Should detect ${testCase.name}: ${testCase.syntax}`);
		});
	});

	test('Individual HSLA syntax variants should be detected', () => {
		const testCases = [
			{ syntax: 'hsla(192, 87%, 49%, 0.8)', name: 'comma-separated with integer hue' },
			{ syntax: 'hsla(192 87% 49% 0.8)', name: 'space-separated (CSS Level 4)' },
			{ syntax: 'hsla(192.5, 87.5%, 49.5%, 0.5)', name: 'comma-separated with decimal values' },
			{ syntax: 'hsla(192.5 87.5% 49.5% 0.5)', name: 'space-separated with decimal values' },
			{ syntax: 'hsla(180, 50%, 50%, .5)', name: 'alpha without leading zero' }
		];

		testCases.forEach(testCase => {
			const model = new TestDocumentModel(`const color = '${testCase.syntax}';`);
			const colors = computeDefaultDocumentColors(model);
			assert.strictEqual(colors.length, 1, `Should detect ${testCase.name}: ${testCase.syntax}`);
		});
	});
});
