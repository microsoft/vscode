/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getMotionCssVariables, motionRecipes, resolveMotionRecipe } from '../../common/motion/motionRecipes.js';
import { MotionTokenRegistry, motionTokenRegistry } from '../../common/motionRegistry.js';
import { motionPresetBindings, resolveMotionPresetBinding } from '../../common/motion/motionPresetBindings.js';

suite('Motion recipes', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('primitive duration names are separate from preserved component timing', () => {
		assert.deepStrictEqual({
			primitives: motionTokenRegistry.getTokens().filter(token => token.id.startsWith('motion.duration.')).map(token => motionTokenRegistry.resolve(token.id)),
			components: ['motion.visibility.exit.duration', 'motion.progress.cycle.duration'].map(id => motionTokenRegistry.getNumber(id, 'duration')),
		}, { primitives: [0, 100, 200, 300], components: [0, 4000] });
	});

	test('every animation recipe resolves with a finite reduced-motion alternative', () => {
		const recipes = motionRecipes.filter(recipe => recipe.frames.length);
		assert.deepStrictEqual(recipes.map(recipe => {
			const resolved = resolveMotionRecipe(recipe.id);
			return { id: resolved.id, finiteReduced: Number.isFinite(resolved.reducedEffect.duration) && resolved.reducedEffect.iterations === 1 && resolved.reducedEffect.delay === 0, spatialReduced: resolved.reducedEffect.frames.some(frame => frame.transform !== 'none') };
		}), recipes.map(recipe => ({ id: recipe.id, finiteReduced: true, spatialReduced: false })));
	});

	test('surface and fade timings consume complete shared response pairs', () => {
		assert.deepStrictEqual(['motion.surface.enter', 'motion.surface.exit', 'motion.visibility.enter', 'motion.visibility.exit']
			.map(id => [id, resolveMotionRecipe(id).effect.duration]), [
			['motion.surface.enter', 250], ['motion.surface.exit', 150],
			['motion.visibility.enter', 100], ['motion.visibility.exit', 0],
		]);
	});

	test('logical directions reflect inline travel in RTL, not block travel', () => {
		assert.deepStrictEqual([
			resolveMotionRecipe('motion.atom.translate.enter', { direction: 'inline-start' }).effect.frames[0].transform,
			resolveMotionRecipe('motion.atom.translate.enter', { direction: 'inline-start', rtl: true }).effect.frames[0].transform,
			resolveMotionRecipe('motion.atom.translate.enter', { direction: 'inline-end', rtl: true }).effect.frames[0].transform,
			resolveMotionRecipe('motion.atom.translate.enter', { direction: 'block-start', rtl: true }).effect.frames[0].transform,
			resolveMotionRecipe('motion.notification.enter', { direction: 'inline-end' }).effect.frames[0].transform,
		], ['translateX(-100%)', 'translateX(100%)', 'translateX(-100%)', 'translateY(-100%)', 'translateX(100%) scale(1)']);
	});

	test('playback direction is explicit and direct surface feedback has no delay', () => {
		const recipe = resolveMotionRecipe('motion.surface.enter', { playbackDirection: 'reverse' });
		assert.deepStrictEqual({
			delay: recipe.effect.delay, direction: recipe.effect.direction, reducedDelay: recipe.reducedEffect.delay,
			end: recipe.reducedEffect.frames.at(-1),
		}, { delay: 0, direction: 'reverse', reducedDelay: 0, end: { opacity: 0, transform: 'none' } });
	});

	test('transition composites preserve references rather than copying resolved values', () => {
		const css = getMotionCssVariables();
		assert.deepStrictEqual({
			control: css['--vscode-motion-state-change-transition'],
			controlPosition: css['--vscode-motion-state-indicator-transition'],
			selection: css['--vscode-motion-selection-change-transition'],
			disclosure: css['--vscode-motion-disclosure-collapse-transition'],
		}, {
			control: 'background-color var(--vscode-motion-state-change-duration) var(--vscode-motion-state-change-easing), border-color var(--vscode-motion-state-change-duration) var(--vscode-motion-state-change-easing)',
			controlPosition: 'transform var(--vscode-motion-state-change-duration) var(--vscode-motion-state-change-easing)',
			selection: 'transform var(--vscode-motion-selection-change-duration) var(--vscode-motion-selection-change-easing), width var(--vscode-motion-selection-change-duration) var(--vscode-motion-selection-change-easing), scale var(--vscode-motion-press-change-duration) var(--vscode-motion-press-change-easing)',
			disclosure: 'grid-template-rows var(--vscode-motion-disclosure-geometry-duration) var(--vscode-motion-disclosure-geometry-easing), opacity var(--vscode-motion-disclosure-content-duration) var(--vscode-motion-disclosure-content-easing), visibility var(--vscode-motion-duration-none) var(--vscode-motion-easing-linear) var(--vscode-motion-disclosure-geometry-duration)',
		});
	});

	test('steps, units, loops and invalid typed values have explicit contracts', () => {
		const offsets = new MotionTokenRegistry([{ id: 'test.offset', kind: 'offset', value: { value: -4, unit: 'px' }, description: '' }]);
		assert.deepStrictEqual({
			distance: resolveMotionRecipe('motion.atom.translate.enter').effect.frames[0].transform,
			steps: motionTokenRegistry.getValueCss('motion.spinner.cycle.easing', 'easing'),
			offset: offsets.getValueCss('test.offset', 'offset'),
			loop: resolveMotionRecipe('motion.spinner.cycle').effect.iterations,
			angle: resolveMotionRecipe('motion.spinner.cycle').effect.frames[0].transform,
		}, { distance: 'translateY(100%)', steps: 'steps(30)', offset: '-4px', loop: Infinity, angle: 'rotate(0deg)' });
		assert.throws(() => motionTokenRegistry.getNumber('motion.easing.linear', 'duration'), /Expected motion duration/);
		assert.throws(() => resolveMotionRecipe('motion.missing'), /not a keyframe animation/);
		assert.throws(() => new MotionTokenRegistry([{ id: 'bad', kind: 'opacity', value: 2, description: '' }]), /Invalid motion opacity/);
		assert.throws(() => new MotionTokenRegistry([{ id: 'bad', kind: 'easing', value: { steps: 0 }, description: '' }]), /Invalid motion easing/);
	});

	test('compact spinner rotation never borrows the linear ProgressBar path timing', () => {
		const spinner = resolveMotionRecipe('motion.spinner.cycle').effect;
		assert.deepStrictEqual({
			barDuration: motionTokenRegistry.getNumber('motion.progress.cycle.duration', 'duration'),
			spinnerDuration: spinner.duration,
			spinnerEasing: spinner.easing,
		}, { barDuration: 4000, spinnerDuration: 1500, spinnerEasing: 'steps(30)' });
	});

	test('atoms isolate one property and resolve the same tokenized endpoints as their composed styles', () => {
		assert.deepStrictEqual(['fade', 'scale', 'translate'].map(atom => {
			const recipe = resolveMotionRecipe(`motion.atom.${atom}.enter`);
			return { atom, frames: recipe.effect.frames, duration: recipe.effect.duration, reduced: recipe.reducedEffect };
		}), [
			{ atom: 'fade', frames: [{ opacity: 0 }, { opacity: 1 }], duration: 100, reduced: { frames: [{ opacity: 1, transform: 'none' }], duration: 0, delay: 0, easing: 'linear', iterations: 1, direction: 'normal' } },
			{ atom: 'scale', frames: [{ transform: 'scale(0.97)' }, { transform: 'scale(1)' }], duration: 250, reduced: { frames: [{ transform: 'none' }], duration: 0, delay: 0, easing: 'linear', iterations: 1, direction: 'normal' } },
			{ atom: 'translate', frames: [{ transform: 'translateY(100%)' }, { transform: 'translateY(0px)' }], duration: 300, reduced: { frames: [{ transform: 'none' }], duration: 0, delay: 0, easing: 'linear', iterations: 1, direction: 'normal' } },
		]);
	});

	test('atom defaults inherit purpose timing rather than a universal speed variant', () => {
		assert.deepStrictEqual(['fade', 'scale', 'translate'].map(atom => ['enter', 'exit'].map(phase => resolveMotionRecipe(`motion.atom.${atom}.${phase}`).effect.duration)),
			[[100, 0], [250, 150], [300, 150]]);
	});

	test('resolved bindings do not mutate product defaults', () => {
		const baseline = getMotionCssVariables();
		const resolved = motionPresetBindings.map(binding => resolveMotionPresetBinding(binding));
		for (const candidate of resolved) {
			for (const [index, phase] of candidate.definition.phases.entries()) {
				const response = candidate.phases[index].response;
				assert.deepStrictEqual({
					duration: phase.durationTokens.map(token => candidate.cssVariables[`--vscode-${token.replaceAll('.', '-')}`]),
					easing: phase.easingTokens.map(token => candidate.cssVariables[`--vscode-${token.replaceAll('.', '-')}`]),
				}, {
					duration: phase.durationTokens.map(() => `${response.durationMs}ms`),
					easing: phase.easingTokens.map(() => response.easing),
				});
			}
		}
		assert.deepStrictEqual(getMotionCssVariables(), baseline);
	});

	test('reveal and reflow preserve meaningful phase ordering', () => {
		const surface = resolveMotionPresetBinding(motionPresetBindings.find(binding => binding.id === 'surface')!);
		const disclosure = resolveMotionPresetBinding(motionPresetBindings.find(binding => binding.id === 'disclosure')!);
		assert.deepStrictEqual({
			exitBeforeArrival: surface.phases[1].response.durationMs < surface.phases[0].response.durationMs,
			contentBeforeGeometry: disclosure.phases[1].response.durationMs < disclosure.phases[0].response.durationMs,
			sharedShape: surface.phases[0].response.easing === surface.phases[1].response.easing,
			geometryParameters: Object.keys(disclosure.cssVariables).some(name => /distance|scale|offset/.test(name)),
		}, { exitBeforeArrival: true, contentBeforeGeometry: true, sharedShape: true, geometryParameters: false });
	});
});
