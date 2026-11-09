/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { MotionToken, MotionTokenRegistry, motionTokenRegistry } from '../../common/motionRegistry.js';
import { resolveMotionPreset } from '../../common/motion/motionPresets.js';

suite('Motion tokens', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('semantic control tokens share the generated response while press feedback stays independent', () => {
		const response = resolveMotionPreset('control').phases[0].response;
		assert.deepStrictEqual(Object.fromEntries(motionTokenRegistry.getTokens().filter(token => /^motion\.(control|selection|press|border)\./.test(token.id)).map(token => [token.id, motionTokenRegistry.resolve(token.id)])), {
			'motion.control.duration': response.durationMs, 'motion.control.easing': response.easing,
			'motion.selection.duration': response.durationMs, 'motion.selection.easing': response.easing,
			'motion.press.duration': 100, 'motion.press.easing': [0, 0, 0.58, 1], 'motion.press.scale': 0.96,
			'motion.border.duration': response.durationMs, 'motion.border.easing': response.easing,
		});
	});

	test('CSS retains alias chains so primitive overrides propagate', () => {
		const registry = new MotionTokenRegistry([
			{ id: 'base', kind: 'duration', value: 150, description: '' },
			{ id: 'semantic', kind: 'duration', value: { ref: 'base' }, description: '' },
			{ id: 'component', kind: 'duration', value: { ref: 'semantic' }, description: '' },
		]);
		assert.deepStrictEqual({ resolved: registry.resolve('component'), css: registry.getCssVariables() }, {
			resolved: 150,
			css: { '--vscode-base': '150ms', '--vscode-semantic': 'var(--vscode-base)', '--vscode-component': 'var(--vscode-semantic)' },
		});
	});

	test('invalid token graphs fail explicitly', () => {
		const cases: readonly (readonly MotionToken[])[] = [
			[{ id: 'a', kind: 'duration', value: { ref: 'missing' }, description: '' }],
			[{ id: 'a', kind: 'duration', value: { ref: 'a' }, description: '' }],
			[{ id: 'a', kind: 'duration', value: { ref: 'b' }, description: '' }, { id: 'b', kind: 'duration', value: { ref: 'a' }, description: '' }],
			[{ id: 'a', kind: 'duration', value: { ref: 'b' }, description: '' }, { id: 'b', kind: 'easing', value: 'ease', description: '' }],
			[{ id: 'a', kind: 'duration', value: -1, description: '' }],
			[{ id: 'a', kind: 'duration', value: NaN, description: '' }],
			[{ id: 'a', kind: 'easing', value: [2, 0, 0, 1], description: '' }],
			[{ id: 'a', kind: 'duration', value: 0, description: '' }, { id: 'a', kind: 'duration', value: 1, description: '' }],
			[{ id: 'a.b', kind: 'duration', value: 0, description: '' }, { id: 'a-b', kind: 'duration', value: 1, description: '' }],
		];
		for (const tokens of cases) {
			assert.throws(() => new MotionTokenRegistry(tokens), /motion token|reference|motion duration|motion easing/);
		}
	});

	test('unknown lookups fail and zero duration remains a valid value', () => {
		const registry = new MotionTokenRegistry([{ id: 'none', kind: 'duration', value: 0, description: '' }]);
		assert.throws(() => registry.resolve('missing'), /Unknown motion token/);
		assert.deepStrictEqual([registry.resolve('none'), registry.getCssVariables()], [0, { '--vscode-none': '0ms' }]);
	});
});
