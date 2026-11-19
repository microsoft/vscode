/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMotionEffect, IMotionFrame, IMotionRecipe, MotionDirection } from '../../../../base/common/motion.js';
import { localize } from '../../../../nls.js';
import { MotionTokenRegistry, motionTokenRegistry } from '../motionRegistry.js';
import { asCssVariable, asCssVariableName } from '../sizeUtils.js';

interface MotionFrameDefinition {
	readonly opacity?: number | string;
	readonly scale?: number | string;
	readonly distance?: { readonly value: number; readonly unit: 'px' | '%' } | string;
	readonly angle?: number | string;
	readonly offset?: number;
}

interface MotionTrack {
	readonly property: 'background-color' | 'border-color' | 'left' | 'transform' | 'width' | 'scale' | 'opacity' | 'grid-template-rows' | 'visibility';
	readonly duration: string;
	readonly easing: string;
	readonly delay?: string;
}

interface MotionRecipeDefinition {
	readonly id: string;
	readonly atom?: 'fade' | 'scale' | 'translate';
	readonly purpose: string;
	readonly duration: string;
	readonly easing: string;
	readonly frames: readonly MotionFrameDefinition[];
	readonly tracks?: readonly MotionTrack[];
	readonly direction?: MotionDirection;
	readonly iterations?: number;
	readonly reduced: 'instant' | 'fade' | 'static';
}

export interface MotionRecipeContext {
	readonly direction?: MotionDirection;
	readonly rtl?: boolean;
	readonly playbackDirection?: IMotionEffect['direction'];
}

const visible = { opacity: 1, scale: 1, distance: { value: 0, unit: 'px' } } as const;
const hidden = { opacity: 0, scale: 1 };

/** Purpose-based recipes; frames reference the same primitives consumed by product CSS. */
export const motionRecipes: readonly MotionRecipeDefinition[] = [
	{ id: 'motion.atom.fade.enter', atom: 'fade', purpose: localize('motion.atom.fade.enter', "Reveal without changing position"), duration: 'motion.visibility.enter.duration', easing: 'motion.visibility.enter.easing',
		frames: [{ opacity: 0 }, { opacity: 1 }], reduced: 'instant' },
	{ id: 'motion.atom.fade.exit', atom: 'fade', purpose: localize('motion.atom.fade.exit', "Dismiss without changing position"), duration: 'motion.visibility.exit.duration', easing: 'motion.visibility.exit.easing',
		frames: [{ opacity: 1 }, { opacity: 0 }], reduced: 'instant' },
	{ id: 'motion.atom.scale.enter', atom: 'scale', purpose: localize('motion.atom.scale.enter', "Settle a surface at its anchor"), duration: 'motion.surface.enter.duration', easing: 'motion.surface.enter.easing',
		frames: [{ scale: 'motion.surface.enter.scale' }, { scale: 1 }], reduced: 'instant' },
	{ id: 'motion.atom.scale.exit', atom: 'scale', purpose: localize('motion.atom.scale.exit', "Withdraw a surface at its anchor"), duration: 'motion.surface.exit.duration', easing: 'motion.surface.exit.easing',
		frames: [{ scale: 1 }, { scale: 'motion.surface.exit.scale' }], reduced: 'instant' },
	{ id: 'motion.atom.translate.enter', atom: 'translate', purpose: localize('motion.atom.translate.enter', "Connect a surface to its originating edge"), duration: 'motion.notification.enter.duration', easing: 'motion.notification.enter.easing',
		frames: [{ distance: { value: 100, unit: '%' } }, { distance: { value: 0, unit: 'px' } }], direction: 'block-end', reduced: 'instant' },
	{ id: 'motion.atom.translate.exit', atom: 'translate', purpose: localize('motion.atom.translate.exit', "Return a surface toward its originating edge"), duration: 'motion.surface.exit.duration', easing: 'motion.surface.exit.easing',
		frames: [{ distance: { value: 0, unit: 'px' } }, { distance: { value: 100, unit: '%' } }], direction: 'block-end', reduced: 'instant' },
	{ id: 'motion.state.change', purpose: localize('motion.recipe.control', "Immediate switch feedback"), duration: 'motion.state.change.duration', easing: 'motion.state.change.easing', frames: [], reduced: 'instant', tracks: [
		{ property: 'background-color', duration: 'motion.state.change.duration', easing: 'motion.state.change.easing' },
		{ property: 'border-color', duration: 'motion.state.change.duration', easing: 'motion.state.change.easing' },
	] },
	{ id: 'motion.state.indicator', purpose: localize('motion.recipe.control.position', "Switch thumb movement"), duration: 'motion.state.change.duration', easing: 'motion.state.change.easing', frames: [], reduced: 'instant', tracks: [
		{ property: 'transform', duration: 'motion.state.change.duration', easing: 'motion.state.change.easing' },
	] },
	{ id: 'motion.selection.change', purpose: localize('motion.recipe.selection', "Follow segmented selection without moving labels"), duration: 'motion.selection.change.duration', easing: 'motion.selection.change.easing', frames: [], reduced: 'instant', tracks: [
		{ property: 'translate', duration: 'motion.selection.change.duration', easing: 'motion.selection.change.easing' },
		{ property: 'width', duration: 'motion.selection.change.duration', easing: 'motion.selection.change.easing' },
		{ property: 'scale', duration: 'motion.press.change.duration', easing: 'motion.press.change.easing' },
	] },
	{ id: 'motion.press.change', purpose: localize('motion.recipe.press', "Confirm a press without changing layout"), duration: 'motion.press.change.duration', easing: 'motion.press.change.easing',
		frames: [{ scale: 1 }, { scale: 'motion.press.change.scale', offset: 0.5 }, { scale: 1 }], reduced: 'static', tracks: [
			{ property: 'scale', duration: 'motion.press.change.duration', easing: 'motion.press.change.easing' },
		] },
	{ id: 'motion.surface.enter', purpose: localize('motion.recipe.surface.enter', "Settle an anchored surface into place"), duration: 'motion.surface.enter.duration', easing: 'motion.surface.enter.easing',
		frames: [{ ...hidden, scale: 'motion.surface.enter.scale' }, visible], reduced: 'instant' },
	{ id: 'motion.surface.exit', purpose: localize('motion.recipe.surface.exit', "Dismiss an anchored surface"), duration: 'motion.surface.exit.duration', easing: 'motion.surface.exit.easing',
		frames: [visible, { ...hidden, scale: 'motion.surface.exit.scale' }], reduced: 'instant' },
	{ id: 'motion.menu.enter', purpose: localize('motion.recipe.menu.enter', "Open a menu from its trigger"), duration: 'motion.surface.enter.duration', easing: 'motion.surface.enter.easing',
		frames: [{ opacity: 0, scale: 'motion.surface.enter.scale' }, { opacity: 1, scale: 1 }], reduced: 'instant' },
	{ id: 'motion.menu.exit', purpose: localize('motion.recipe.menu.exit', "Close a menu toward its trigger"), duration: 'motion.surface.exit.duration', easing: 'motion.surface.exit.easing',
		frames: [{ opacity: 1, scale: 1 }, { opacity: 0, scale: 'motion.surface.exit.scale' }], reduced: 'instant' },
	{ id: 'motion.notification.enter', purpose: localize('motion.recipe.toast.enter', "Arrive from the notification's anchored edge"), duration: 'motion.notification.enter.duration', easing: 'motion.notification.enter.easing',
		frames: [{ ...hidden, distance: { value: 100, unit: '%' } }, visible], direction: 'block-end', reduced: 'instant', tracks: [
			{ property: 'transform', duration: 'motion.notification.enter.duration', easing: 'motion.notification.enter.easing' },
			{ property: 'opacity', duration: 'motion.notification.enter.duration', easing: 'motion.notification.enter.easing' },
		] },
	{ id: 'motion.visibility.enter', purpose: localize('motion.recipe.fade.enter', "Non-spatial arrival"), duration: 'motion.visibility.enter.duration', easing: 'motion.visibility.enter.easing', frames: [{ opacity: 0 }, { opacity: 1 }], reduced: 'instant' },
	{ id: 'motion.visibility.exit', purpose: localize('motion.recipe.fade.exit', "Non-spatial dismissal"), duration: 'motion.visibility.exit.duration', easing: 'motion.visibility.exit.easing', frames: [{ opacity: 1 }, { opacity: 0 }], reduced: 'instant' },
	{ id: 'motion.content.enter', purpose: localize('motion.recipe.content.enter', "Reveal ready content in a stable surface"), duration: 'motion.content.enter.duration', easing: 'motion.content.enter.easing', frames: [{ opacity: 0 }, { opacity: 1 }], reduced: 'instant' },
	{ id: 'motion.spinner.cycle', purpose: localize('motion.recipe.progress.spin', "Indicate local work with stepped compact rotation"), duration: 'motion.spinner.cycle.duration', easing: 'motion.spinner.cycle.easing',
		frames: [{ angle: 0 }, { angle: 360 }], iterations: Infinity, reduced: 'static' },
	{ id: 'motion.disclosure.expand', purpose: localize('motion.recipe.disclosure', "Reveal content beneath its existing header"), duration: 'motion.disclosure.geometry.duration', easing: 'motion.disclosure.geometry.easing', frames: [], reduced: 'instant', tracks: [
		{ property: 'grid-template-rows', duration: 'motion.disclosure.geometry.duration', easing: 'motion.disclosure.geometry.easing' },
		{ property: 'opacity', duration: 'motion.disclosure.content.duration', easing: 'motion.disclosure.content.easing' },
		{ property: 'visibility', duration: 'motion.duration.none', easing: 'motion.easing.linear' },
	] },
	{ id: 'motion.disclosure.collapse', purpose: localize('motion.recipe.disclosure.exit', "Withdraw disclosure content before hiding it"), duration: 'motion.disclosure.geometry.duration', easing: 'motion.disclosure.geometry.easing', frames: [], reduced: 'instant', tracks: [
		{ property: 'grid-template-rows', duration: 'motion.disclosure.geometry.duration', easing: 'motion.disclosure.geometry.easing' },
		{ property: 'opacity', duration: 'motion.disclosure.content.duration', easing: 'motion.disclosure.content.easing' },
		{ property: 'visibility', duration: 'motion.duration.none', easing: 'motion.easing.linear', delay: 'motion.disclosure.geometry.duration' },
	] },
];

export function resolveMotionRecipe(id: string, context: MotionRecipeContext = {}, registry: MotionTokenRegistry = motionTokenRegistry): IMotionRecipe {
	const definition = motionRecipes.find(recipe => recipe.id === id);
	if (!definition || definition.frames.length < 2) {
		throw new Error(`Motion recipe is not a keyframe animation: ${id}`);
	}
	const number = (value: number | string, kind: 'opacity' | 'scale' | 'angle') => typeof value === 'number' ? value : registry.getNumber(value, kind);
	const direction = context.direction ?? definition.direction ?? 'block-end';
	const frames: IMotionFrame[] = definition.frames.map(frame => {
		const transforms: string[] = [];
		if (frame.distance !== undefined) {
			const distance = typeof frame.distance === 'string' ? registry.getValueCss(frame.distance, 'distance') : `${frame.distance.value}${frame.distance.unit}`;
			const inline = direction === 'inline-start' || direction === 'inline-end';
			const negative = inline ? (direction === 'inline-start') !== !!context.rtl : direction === 'block-start';
			transforms.push(`translate${inline ? 'X' : 'Y'}(${negative ? '-' : ''}${distance})`);
		}
		if (frame.scale !== undefined) {
			transforms.push(`scale(${number(frame.scale, 'scale')})`);
		}
		if (frame.angle !== undefined) {
			transforms.push(`rotate(${number(frame.angle, 'angle')}deg)`);
		}
		return {
			...(frame.opacity !== undefined ? { opacity: number(frame.opacity, 'opacity') } : {}),
			...(transforms.length ? { transform: transforms.join(' ') } : {}),
			...(frame.offset !== undefined ? { offset: frame.offset } : {}),
		};
	});
	const effect: IMotionEffect = {
		frames, delay: 0,
		duration: registry.getNumber(definition.duration, 'duration'),
		easing: registry.getValueCss(definition.easing, 'easing'),
		iterations: definition.iterations ?? 1,
		direction: context.playbackDirection ?? 'normal',
	};
	const reverse = effect.direction === 'reverse' || effect.direction === 'alternate-reverse';
	const reducedFrames: IMotionFrame[] = definition.reduced === 'fade'
		? (reverse ? [...frames].reverse() : frames).map(frame => ({ ...(frame.opacity !== undefined ? { opacity: frame.opacity } : {}), transform: 'none' }))
		: [{ ...frames[reverse ? 0 : frames.length - 1], transform: 'none' }];
	return {
		id, effect,
		reducedEffect: {
			frames: reducedFrames,
			duration: definition.reduced === 'fade' ? registry.getNumber('motion.duration.short', 'duration') : 0,
			delay: 0, easing: registry.getValueCss('motion.easing.linear', 'easing'), iterations: 1, direction: 'normal',
		},
	};
}

/** CSS transition recipes retain the alias graph and component-owned motion guards. */
export function getMotionCssVariables(registry: MotionTokenRegistry = motionTokenRegistry): Record<string, string> {
	const variables = registry.getCssVariables();
	for (const recipe of motionRecipes) {
		registry.getNumber(recipe.duration, 'duration');
		registry.getValueCss(recipe.easing, 'easing');
		if (recipe.tracks) {
			variables[asCssVariableName(`${recipe.id}.transition`)] = recipe.tracks.map(track => {
				registry.getNumber(track.duration, 'duration');
				registry.getValueCss(track.easing, 'easing');
				if (track.delay) {
					registry.getNumber(track.delay, 'duration');
				}
				return `${track.property} ${asCssVariable(track.duration)} ${asCssVariable(track.easing)}${track.delay ? ` ${asCssVariable(track.delay)}` : ''}`;
			}).join(', ');
		}
	}
	return variables;
}
