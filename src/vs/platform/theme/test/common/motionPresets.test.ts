/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IMotionPresenceGeometry, MotionPresetId, motionPresets, resolveMotionPreset, resolveMotionPresetEffect } from '../../common/motion/motionPresets.js';
import { IMotionPresetBinding, motionPresetBindings, resolveMotionPresetBinding } from '../../common/motion/motionPresetBindings.js';
import { getMotionCssVariables } from '../../common/motion/motionRecipes.js';
import { MotionTokenRegistry, motionTokenRegistry } from '../../common/motionRegistry.js';

suite('Motion presets', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('two surfaces share response pairs while owning their own geometry', () => {
		const baseline = getMotionCssVariables();
		const geometry = [{ scale: 0.96 }, { scale: 0.99 }];
		const preset = resolveMotionPreset('surface');
		assert.deepStrictEqual(geometry.map(context => (['enter', 'exit'] as const).map(phase => {
			const recipe = resolveMotionPresetEffect('surface', phase, context);
			return {
				frames: recipe.effect.frames,
				responsePair: [recipe.effect.duration, recipe.effect.easing],
				timing: [recipe.effect.delay, recipe.effect.iterations, recipe.effect.direction],
				reduced: recipe.reducedEffect,
			};
		})), geometry.map(context => (['enter', 'exit'] as const).map(phase => {
			const hidden = { opacity: 0, transform: `scale(${context.scale})` };
			const visible = { opacity: 1, transform: 'scale(1)' };
			const response = preset.phases.find(candidate => candidate.phase === phase)!.response;
			return {
				frames: phase === 'enter' ? [hidden, visible] : [visible, hidden],
				responsePair: [response.durationMs, response.easing],
				timing: [0, 1, 'normal'],
				reduced: { frames: [{ opacity: phase === 'enter' ? 1 : 0, transform: 'none' }], duration: 0, delay: 0, easing: 'linear', iterations: 1, direction: 'normal' },
			};
		})));
		assert.deepStrictEqual(getMotionCssVariables(), baseline);
		assert.strictEqual(Object.isFrozen(geometry[0]), false);
	});

	test('non-spatial presence never takes ownership of an existing transform', () => {
		assert.deepStrictEqual((['enter', 'exit'] as const).map(phase => {
			const recipe = resolveMotionPresetEffect('surface', phase);
			return { frames: recipe.effect.frames, reduced: recipe.reducedEffect.frames };
		}), [
			{ frames: [{ opacity: 0 }, { opacity: 1 }], reduced: [{ opacity: 1 }] },
			{ frames: [{ opacity: 1 }, { opacity: 0 }], reduced: [{ opacity: 0 }] },
		]);
	});

	test('invalid presence geometry and unsupported presets or phases fail explicitly', () => {
		for (const scale of [NaN, Infinity, -Infinity, 0, -0.5]) {
			assert.throws(() => resolveMotionPresetEffect('surface', 'enter', { scale }), /Invalid motion presence geometry/);
		}
		for (const geometry of [null, 1, [], { scale: 0.97, width: 100 }, { scale: '0.97' }]) {
			assert.throws(() => resolveMotionPresetEffect('surface', 'enter', geometry as IMotionPresenceGeometry), /Invalid motion presence geometry/);
		}
		assert.throws(() => resolveMotionPreset('missing' as MotionPresetId), /Unknown motion preset/);
		// @ts-expect-error Only the surface presence preset has a keyframe resolver.
		assert.throws(() => resolveMotionPresetEffect('selection', 'enter'), /Unsupported motion presence preset or phase/);
		// @ts-expect-error A presence effect requires an enter or exit phase.
		assert.throws(() => resolveMotionPresetEffect('surface', 'change'), /Unsupported motion presence preset or phase/);
	});

	test('resolved catalogs, response metadata, frames, and CSS variables cannot be mutated', () => {
		const preset = resolveMotionPreset('surface');
		const effect = resolveMotionPresetEffect('surface', 'enter', { scale: 0.97 });
		const candidate = resolveMotionPresetBinding(motionPresetBindings[2]);
		for (const value of [
			motionPresets, motionPresets[0], motionPresets[0].requirements, motionPresets[0].phases[0].tracks,
			motionPresetBindings, motionPresetBindings[0].phases[0].durationTokens,
			preset.phases, preset.phases[0], preset.phases[0].response, preset.phases[0].response.source,
			effect, effect.effect, effect.effect.frames, effect.effect.frames[0], effect.reducedEffect.frames[0],
			candidate.cssVariables, candidate.phases[0], candidate.definition.phases[0].durationTokens,
		]) {
			assert.throws(() => Object.assign(value, { mutation: true }), TypeError);
		}
	});

	test('CSS consumers bind the same preset without choosing responses again', () => {
		const registry = new MotionTokenRegistry([
			{ id: 'first.duration', kind: 'duration', value: 100, description: '' },
			{ id: 'first.easing', kind: 'easing', value: 'ease', description: '' },
			{ id: 'second.duration', kind: 'duration', value: 200, description: '' },
			{ id: 'second.easing', kind: 'easing', value: 'linear', description: '' },
		]);
		const response = resolveMotionPreset('surface').phases[0].response;
		assert.deepStrictEqual(['first', 'second'].map(id => resolveMotionPresetBinding({
			id, preset: 'surface',
			phases: [{ phase: 'enter', durationTokens: [`${id}.duration`], easingTokens: [`${id}.easing`] }],
		}, registry).cssVariables), ['first', 'second'].map(id => ({
			[`--vscode-${id}-duration`]: `${response.durationMs}ms`,
			[`--vscode-${id}-easing`]: response.easing,
		})));
		assert.deepStrictEqual(['first.duration', 'second.duration'].map(id => registry.getNumber(id, 'duration')), [100, 200]);
	});

	test('production token defaults consume complete preset pairs without preview overrides', () => {
		assert.deepStrictEqual(motionPresetBindings.map(binding => {
			const resolved = resolveMotionPresetBinding(binding);
			return binding.phases.map((phase, index) => ({
				durations: phase.durationTokens.map(token => motionTokenRegistry.getNumber(token, 'duration') === resolved.phases[index].response.durationMs),
				easings: phase.easingTokens.map(token => motionTokenRegistry.getValueCss(token, 'easing') === resolved.phases[index].response.easing),
			}));
		}), motionPresetBindings.map(binding => binding.phases.map(phase => ({
			durations: phase.durationTokens.map(() => true),
			easings: phase.easingTokens.map(() => true),
		}))));
	});

	test('bindings reject missing pairs, nonexistent phases, and incompatible token kinds', () => {
		const phase = { phase: 'enter', durationTokens: ['motion.surface.enter.duration'], easingTokens: ['motion.surface.easing'] } as const;
		const invalid: { phases: IMotionPresetBinding['phases']; error: RegExp }[] = [
			{ phases: [], error: /Missing motion preset phases/ },
			{ phases: [{ ...phase, phase: 'change' }], error: /Invalid or duplicate motion preset phase/ },
			{ phases: [phase, phase], error: /Invalid or duplicate motion preset phase/ },
			{ phases: [{ ...phase, durationTokens: [] }], error: /Incomplete motion response binding/ },
			{ phases: [{ ...phase, easingTokens: [] }], error: /Incomplete motion response binding/ },
			{ phases: [{ ...phase, durationTokens: ['motion.surface.easing'] }], error: /Expected motion duration/ },
			{ phases: [{ ...phase, durationTokens: ['motion.surface.enter.scale'] }], error: /Expected motion duration/ },
			{ phases: [{ ...phase, easingTokens: ['motion.surface.enter.duration'] }], error: /Expected motion easing/ },
			{ phases: [{ ...phase, durationTokens: ['missing'] }], error: /Expected motion duration/ },
		];
		for (const { phases, error } of invalid) {
			assert.throws(() => resolveMotionPresetBinding({ id: 'invalid', preset: 'surface', phases }), error);
		}
	});

	test('a shared easing binding is allowed but conflicting shared durations are rejected', () => {
		const binding = motionPresetBindings.find(binding => binding.id === 'surface')!;
		const valid = resolveMotionPresetBinding(binding);
		assert.deepStrictEqual({
			sameCurve: valid.phases[0].response.easing === valid.phases[1].response.easing,
			differentDurations: valid.phases[0].response.durationMs !== valid.phases[1].response.durationMs,
		}, { sameCurve: true, differentDurations: true });
		assert.throws(() => resolveMotionPresetBinding({
			...binding,
			phases: binding.phases.map(phase => ({ ...phase, durationTokens: ['motion.surface.enter.duration'] })),
		}), /Conflicting response phases for motion token/);
	});
});
