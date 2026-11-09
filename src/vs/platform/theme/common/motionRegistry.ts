/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { hasKey } from '../../../base/common/types.js';
import { asCssVariableName } from './sizeUtils.js';
import { MotionResponsePresetId, motionResponsePresets } from './motion/motionResponses.js';

type MotionReference = { readonly ref: string };
type MotionResponseReference = { readonly response: MotionResponsePresetId };
type EasingValue = 'linear' | 'ease' | 'ease-in' | 'ease-out' | readonly [number, number, number, number] | { readonly steps: number; readonly position?: 'jump-none' };
type DistanceValue = { readonly value: number; readonly unit: 'px' | '%' };

export type MotionToken = {
	readonly id: string;
	readonly description: string;
} & (
	| { readonly kind: 'duration'; readonly value: number | MotionReference | MotionResponseReference }
	| { readonly kind: 'easing'; readonly value: EasingValue | MotionReference | MotionResponseReference }
	| { readonly kind: 'delay' | 'scale' | 'opacity' | 'angle' | 'iterations'; readonly value: number | MotionReference }
	| { readonly kind: 'distance' | 'offset'; readonly value: DistanceValue | MotionReference }
);

type MotionValue = number | string | EasingValue | DistanceValue;

function isReference(value: MotionToken['value']): value is MotionReference {
	return typeof value === 'object' && 'ref' in value;
}

function isResponseReference(value: MotionToken['value']): value is MotionResponseReference {
	return typeof value === 'object' && 'response' in value;
}

/** A built-in motion catalog that preserves semantic aliases in CSS output. */
export class MotionTokenRegistry {
	private readonly tokens = new Map<string, MotionToken>();

	constructor(tokens: readonly MotionToken[]) {
		const cssNames = new Set<string>();
		for (const token of tokens) {
			const cssName = asCssVariableName(token.id);
			if (this.tokens.has(token.id) || cssNames.has(cssName)) {
				throw new Error(`Duplicate motion token: ${token.id}`);
			}
			this.tokens.set(token.id, token);
			cssNames.add(cssName);
		}
		for (const token of tokens) {
			this.resolve(token.id);
		}
	}

	getTokens(): readonly MotionToken[] {
		return [...this.tokens.values()];
	}

	resolve(id: string): MotionValue {
		const visited = new Set<string>();
		let token = this.tokens.get(id);
		if (!token) {
			throw new Error(`Unknown motion token: ${id}`);
		}
		const kind = token.kind;
		while (isReference(token.value)) {
			if (visited.has(token.id)) {
				throw new Error(`Cyclic motion token: ${token.id}`);
			}
			visited.add(token.id);
			const target = this.tokens.get(token.value.ref);
			if (!target || target.kind !== kind) {
				throw new Error(`Invalid ${kind} reference from ${token.id} to ${token.value.ref}`);
			}
			token = target;
		}
		const responseReference = token.value;
		if (isResponseReference(responseReference)) {
			const response = motionResponsePresets.find(response => response.id === responseReference.response);
			if (!response || token.kind !== 'duration' && token.kind !== 'easing') {
				throw new Error(`Unknown motion response for token: ${token.id}`);
			}
			return token.kind === 'duration' ? response.durationMs : response.easing;
		}
		if (token.kind === 'distance' || token.kind === 'offset') {
			const value = token.value;
			if (isReference(value) || !Number.isFinite(value.value) || value.unit !== 'px' && value.unit !== '%' || token.kind === 'distance' && value.value < 0) {
				throw new Error(`Invalid motion distance: ${token.id}`);
			}
			return value;
		}
		if (token.kind === 'easing') {
			const value = token.value;
			if (isReference(value) || isResponseReference(value) || typeof value !== 'string' && (hasKey(value, { steps: true })
				? !Number.isInteger(value.steps) || value.position !== undefined && value.position !== 'jump-none' || value.steps < (value.position === 'jump-none' ? 2 : 1)
				: !value.every(Number.isFinite) || value[0] < 0 || value[0] > 1 || value[2] < 0 || value[2] > 1)) {
				throw new Error(`Invalid motion easing: ${token.id}`);
			}
			return value;
		}
		const value = token.value;
		if (typeof value !== 'number' || !(token.kind === 'iterations' && value === Infinity) && !Number.isFinite(value)
			|| token.kind !== 'delay' && token.kind !== 'angle' && value < 0
			|| token.kind === 'opacity' && value > 1
			|| token.kind === 'iterations' && (value < 1 || value !== Infinity && !Number.isInteger(value))) {
			throw new Error(`Invalid motion ${token.kind}: ${token.id}`);
		}
		return value;
	}

	getNumber(id: string, kind: 'duration' | 'delay' | 'scale' | 'opacity' | 'angle' | 'iterations'): number {
		if (this.tokens.get(id)?.kind !== kind) {
			throw new Error(`Expected motion ${kind}: ${id}`);
		}
		const value = this.resolve(id);
		if (typeof value !== 'number') {
			throw new Error(`Expected numeric motion token: ${id}`);
		}
		return value;
	}

	getValueCss(id: string, kind: MotionToken['kind']): string {
		const token = this.tokens.get(id);
		if (token?.kind !== kind) {
			throw new Error(`Expected motion ${kind}: ${id}`);
		}
		const value = this.resolve(id);
		return this.valueToCss(value, kind);
	}

	private valueToCss(value: MotionValue, kind: MotionToken['kind']): string {
		if (typeof value === 'number') {
			return value === Infinity ? 'infinite' : `${value}${kind === 'duration' || kind === 'delay' ? 'ms' : kind === 'angle' ? 'deg' : ''}`;
		}
		if (typeof value === 'string') {
			return value;
		}
		if (hasKey(value, { unit: true })) {
			return `${value.value}${value.unit}`;
		}
		return hasKey(value, { steps: true }) ? `steps(${value.steps}${value.position ? `, ${value.position}` : ''})` : `cubic-bezier(${value.join(', ')})`;
	}

	getCssVariables(): Record<string, string> {
		return Object.fromEntries(this.getTokens().map(token => {
			const value = token.value;
			const css = isReference(value) ? `var(${asCssVariableName(value.ref)})` : this.valueToCss(this.resolve(token.id), token.kind);
			return [asCssVariableName(token.id), css];
		}));
	}
}

export const motionTokenRegistry = new MotionTokenRegistry([
	{ id: 'motion.response.responsive.duration', kind: 'duration', value: { response: 'responsive' }, description: localize('motion.response.responsive.duration', "Generated responsive timing; use with its paired easing.") },
	{ id: 'motion.response.responsive.easing', kind: 'easing', value: { response: 'responsive' }, description: localize('motion.response.responsive.easing', "Generated responsive curve; use with its paired duration.") },
	{ id: 'motion.response.settled.duration', kind: 'duration', value: { response: 'settled' }, description: localize('motion.response.settled.duration', "Generated settled timing; use with its paired easing.") },
	{ id: 'motion.response.settled.easing', kind: 'easing', value: { response: 'settled' }, description: localize('motion.response.settled.easing', "Generated settled curve; use with its paired duration.") },
	{ id: 'motion.duration.none', kind: 'duration', value: 0, description: localize('motion.duration.none', "Immediate state change without animation.") },
	{ id: 'motion.duration.faster', kind: 'duration', value: 100, description: localize('motion.duration.faster', "Brief tactile acknowledgment for small, frequently used controls, such as press feedback.") },
	{ id: 'motion.duration.fast', kind: 'duration', value: 150, description: localize('motion.duration.fast', "Short local visibility or state changes that need a little more time to read than a press.") },
	{ id: 'motion.duration.normal', kind: 'duration', value: 200, description: localize('motion.duration.normal', "Moderate changes within a stable region, including interpolation between reported progress values.") },
	{ id: 'motion.duration.gentle', kind: 'duration', value: 250, description: localize('motion.duration.gentle', "More visual weight or travel within a bounded region, when extra time preserves orientation.") },
	{ id: 'motion.duration.slow', kind: 'duration', value: 300, description: localize('motion.duration.slow', "Substantial spatial changes that need both endpoints to remain understandable; not routine control feedback.") },
	{ id: 'motion.duration.ultraSlow', kind: 'duration', value: 1000, description: localize('motion.duration.ultraSlow', "Reserved for deliberately paced expressive choreography, not interaction or surface-transition defaults.") },
	{ id: 'motion.easing.linear', kind: 'easing', value: 'linear', description: localize('motion.easing.linear', "Constant rate from start to finish.") },
	{ id: 'motion.easing.easeInOut', kind: 'easing', value: [0.33, 0, 0.67, 1], description: localize('motion.easing.easeInOut', "Balanced acceleration and deceleration.") },
	{ id: 'motion.control.duration', kind: 'duration', value: { ref: 'motion.response.responsive.duration' }, description: localize('motion.control.duration', "State-feedback settling duration; the setting changes immediately.") },
	{ id: 'motion.control.easing', kind: 'easing', value: { ref: 'motion.response.responsive.easing' }, description: localize('motion.control.easing', "State-feedback response curve.") },
	{ id: 'motion.selection.duration', kind: 'duration', value: { ref: 'motion.response.responsive.duration' }, description: localize('motion.selection.duration', "Selection-indicator settling duration; selection changes immediately.") },
	{ id: 'motion.selection.easing', kind: 'easing', value: { ref: 'motion.response.responsive.easing' }, description: localize('motion.selection.easing', "Selection-indicator response curve.") },
	{ id: 'motion.press.duration', kind: 'duration', value: { ref: 'motion.duration.faster' }, description: localize('motion.press.duration', "Duration of segmented selection press feedback.") },
	{ id: 'motion.press.easing', kind: 'easing', value: [0, 0, 0.58, 1], description: localize('motion.press.easing', "Existing segmented selection press curve.") },
	{ id: 'motion.press.scale', kind: 'scale', value: 0.96, description: localize('motion.press.scale', "Local press scale without changing the hit target.") },
	{ id: 'motion.border.duration', kind: 'duration', value: { ref: 'motion.control.duration' }, description: localize('motion.border.duration', "State feedback for table resize boundaries; resizing remains immediate.") },
	{ id: 'motion.border.easing', kind: 'easing', value: { ref: 'motion.control.easing' }, description: localize('motion.border.easing', "State-feedback response for a resize boundary.") },
	{ id: 'motion.surface.enter.duration', kind: 'duration', value: { ref: 'motion.response.settled.duration' }, description: localize('motion.surface.enter.duration', "Anchored surface entrance duration.") },
	{ id: 'motion.surface.exit.duration', kind: 'duration', value: { ref: 'motion.response.responsive.duration' }, description: localize('motion.surface.exit.duration', "Anchored surface dismissal duration; shorter than entrance.") },
	{ id: 'motion.surface.easing', kind: 'easing', value: { ref: 'motion.response.settled.easing' }, description: localize('motion.surface.easing.alias', "Anchored surface entrance response curve.") },
	{ id: 'motion.surface.exit.easing', kind: 'easing', value: { ref: 'motion.response.responsive.easing' }, description: localize('motion.surface.exit.easing', "Anchored surface dismissal response curve.") },
	{ id: 'motion.surface.enter.scale', kind: 'scale', value: 0.97, description: localize('motion.surface.enter.scale', "Anchored surface entrance scale.") },
	{ id: 'motion.surface.exit.scale', kind: 'scale', value: 0.99, description: localize('motion.surface.exit.scale', "Anchored surface dismissal scale.") },
	{ id: 'motion.fade.enter.duration', kind: 'duration', value: { ref: 'motion.response.settled.duration' }, description: localize('motion.fade.enter.duration', "Contextual visibility entrance duration.") },
	{ id: 'motion.fade.exit.duration', kind: 'duration', value: { ref: 'motion.response.responsive.duration' }, description: localize('motion.fade.exit.duration', "Contextual visibility departure duration.") },
	{ id: 'motion.fade.easing', kind: 'easing', value: { ref: 'motion.response.settled.easing' }, description: localize('motion.fade.easing', "Contextual visibility response curve.") },
	{ id: 'motion.content.duration', kind: 'duration', value: { ref: 'motion.response.responsive.duration' }, description: localize('motion.content.duration', "Ready-content reveal within a stable surface; never a delay before committing state.") },
	{ id: 'motion.content.easing', kind: 'easing', value: { ref: 'motion.response.responsive.easing' }, description: localize('motion.content.easing', "Ready-content response curve, paired with its duration.") },
	{ id: 'motion.toast.duration', kind: 'duration', value: { ref: 'motion.response.settled.duration' }, description: localize('motion.toast.duration', "Edge-anchored notification arrival duration.") },
	{ id: 'motion.toast.easing', kind: 'easing', value: { ref: 'motion.response.settled.easing' }, description: localize('motion.toast.easing', "Edge-anchored notification response curve.") },
	{ id: 'motion.scrollbar.exit.duration', kind: 'duration', value: { ref: 'motion.fade.exit.duration' }, description: localize('motion.scrollbar.exit.duration', "Contextual scrollbar departure; inactivity delay remains component-owned.") },
	{ id: 'motion.progress.duration', kind: 'duration', value: 4000, description: localize('motion.progress.duration', "Indeterminate progress cycle duration.") },
	{ id: 'motion.progress.easing', kind: 'easing', value: { ref: 'motion.easing.linear' }, description: localize('motion.progress.easing', "Indeterminate progress easing.") },
	{ id: 'motion.progress.longRunning.easing', kind: 'easing', value: { steps: 100 }, description: localize('motion.progress.longRunning.easing', "Lower-update-rate easing for long-running indeterminate progress.") },
	{ id: 'motion.spinner.duration', kind: 'duration', value: 1500, description: localize('motion.spinner.duration', "Compact activity icon rotation cycle duration.") },
	{ id: 'motion.spinner.easing', kind: 'easing', value: { steps: 30 }, description: localize('motion.spinner.easing', "Quantized compact activity rotation pacing.") },
	{ id: 'motion.progress.determinate.duration', kind: 'duration', value: { ref: 'motion.duration.normal' }, description: localize('motion.progress.determinate.duration', "Known progress width interpolation duration; the value updates immediately.") },
	{ id: 'motion.disclosure.duration', kind: 'duration', value: { ref: 'motion.response.settled.duration' }, description: localize('motion.disclosure.duration', "Expand or collapse content already associated with a disclosure header.") },
	{ id: 'motion.disclosure.opacity.duration', kind: 'duration', value: { ref: 'motion.response.responsive.duration' }, description: localize('motion.disclosure.opacity.duration', "Content opacity settles before disclosure geometry finishes.") },
	{ id: 'motion.disclosure.easing', kind: 'easing', value: { ref: 'motion.response.settled.easing' }, description: localize('motion.disclosure.easing', "Disclosure geometry response curve.") },
	{ id: 'motion.disclosure.opacity.easing', kind: 'easing', value: { ref: 'motion.response.responsive.easing' }, description: localize('motion.disclosure.opacity.easing', "Disclosure content response curve.") },
	{ id: 'motion.attention.duration', kind: 'duration', value: { ref: 'motion.duration.faster' }, description: localize('motion.attention.duration', "One interval of the existing find-option signal; not a general attention pattern.") },
	{ id: 'motion.attention.easing', kind: 'easing', value: { ref: 'motion.easing.linear' }, description: localize('motion.attention.easing', "Existing find-option signal pacing; use stable states for errors and input needed.") },
	{ id: 'motion.matrix.duration', kind: 'duration', value: 1820, description: localize('motion.matrix.duration', "Working dot-matrix cycle, not a measured completion estimate.") },
	{ id: 'motion.matrix.easing', kind: 'easing', value: { steps: 6, position: 'jump-none' }, description: localize('motion.matrix.easing', "Stepped opacity changes for working dots.") },
	{ id: 'motion.matrix.stagger', kind: 'delay', value: 130, description: localize('motion.matrix.stagger', "Phase interval between working dots.") },
	{ id: 'motion.matrix.ring.duration', kind: 'duration', value: 1200, description: localize('motion.matrix.ring.duration', "Ring activity pulse cycle.") },
	{ id: 'motion.logo.duration', kind: 'duration', value: 2667, description: localize('motion.logo.duration', "Working-logo drawing cycle; illustration phase boundaries stay owned by the component.") },
	{ id: 'motion.voice.duration', kind: 'duration', value: 2300, description: localize('motion.voice.duration', "Base cycle for the listening rim; the component coordinates its layered oscillators.") },
	{ id: 'motion.voice.fade.duration', kind: 'duration', value: 600, description: localize('motion.voice.fade.duration', "Fade between connected voice states without moving the input surface.") },
	{ id: 'motion.confetti.launch.min', kind: 'duration', value: 210, description: localize('motion.confetti.launch.min', "Shortest completion-particle launch.") },
	{ id: 'motion.confetti.launch.max', kind: 'duration', value: 290, description: localize('motion.confetti.launch.max', "Longest completion-particle launch.") },
	{ id: 'motion.confetti.fall.min', kind: 'duration', value: 940, description: localize('motion.confetti.fall.min', "Shortest completion-particle fall.") },
	{ id: 'motion.confetti.fall.max', kind: 'duration', value: 1220, description: localize('motion.confetti.fall.max', "Longest completion-particle fall.") },
	{ id: 'motion.confetti.frame.duration', kind: 'duration', value: 40, description: localize('motion.confetti.frame.duration', "Quantized completion-particle sampling interval.") },
	{ id: 'motion.confetti.pixel.size', kind: 'distance', value: { value: 4, unit: 'px' }, description: localize('motion.confetti.pixel.size', "Completion-particle size.") },
	{ id: 'motion.confetti.distance.min', kind: 'distance', value: { value: 48, unit: 'px' }, description: localize('motion.confetti.distance.min', "Shortest completion-particle fall distance.") },
	{ id: 'motion.confetti.distance.max', kind: 'distance', value: { value: 72, unit: 'px' }, description: localize('motion.confetti.distance.max', "Longest completion-particle fall distance.") },
	{ id: 'motion.confetti.arc.min', kind: 'distance', value: { value: 24, unit: 'px' }, description: localize('motion.confetti.arc.min', "Smallest completion-particle launch arc.") },
	{ id: 'motion.confetti.arc.max', kind: 'distance', value: { value: 44, unit: 'px' }, description: localize('motion.confetti.arc.max', "Largest completion-particle launch arc.") },
	{ id: 'motion.confetti.drift', kind: 'distance', value: { value: 8, unit: 'px' }, description: localize('motion.confetti.drift', "Maximum completion-particle horizontal drift in either direction.") },
]);
