/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { hasKey } from '../../../base/common/types.js';
import { asCssVariableName } from './sizeUtils.js';

type MotionReference = { readonly ref: string };
type EasingValue = 'linear' | 'ease' | 'ease-in' | 'ease-out' | readonly [number, number, number, number] | { readonly steps: number; readonly position?: 'jump-none' };
type DistanceValue = { readonly value: number; readonly unit: 'px' | '%' };

export type MotionToken = {
	readonly id: string;
	readonly description: string;
} & (
	| { readonly kind: 'duration'; readonly value: number | MotionReference }
	| { readonly kind: 'easing'; readonly value: EasingValue | MotionReference }
	| { readonly kind: 'delay' | 'scale' | 'opacity' | 'angle' | 'iterations'; readonly value: number | MotionReference }
	| { readonly kind: 'distance' | 'offset'; readonly value: DistanceValue | MotionReference }
);

type MotionValue = number | string | EasingValue | DistanceValue;

function isReference(value: MotionToken['value']): value is MotionReference {
	return typeof value === 'object' && 'ref' in value;
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
		if (token.kind === 'distance' || token.kind === 'offset') {
			const value = token.value;
			if (isReference(value) || !Number.isFinite(value.value) || value.unit !== 'px' && value.unit !== '%' || token.kind === 'distance' && value.value < 0) {
				throw new Error(`Invalid motion distance: ${token.id}`);
			}
			return value;
		}
		if (token.kind === 'easing') {
			const value = token.value;
			if (isReference(value) || typeof value !== 'string' && (hasKey(value, { steps: true })
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
	{ id: 'motion.duration.none', kind: 'duration', value: 0, description: localize('motion.duration.none', "Immediate state change without animation.") },
	{ id: 'motion.duration.short', kind: 'duration', value: 100, description: localize('motion.duration.short', "Brief tactile acknowledgment for small, frequently used controls, such as press feedback.") },
	{ id: 'motion.duration.medium', kind: 'duration', value: 200, description: localize('motion.duration.medium', "Moderate changes within a stable region, including interpolation between reported progress values.") },
	{ id: 'motion.duration.long', kind: 'duration', value: 300, description: localize('motion.duration.long', "Substantial spatial changes that need both endpoints to remain understandable; not routine control feedback.") },
	{ id: 'motion.easing.linear', kind: 'easing', value: 'linear', description: localize('motion.easing.linear', "Constant rate from start to finish.") },
	{ id: 'motion.easing.decelerate', kind: 'easing', value: [0, 0, 0.58, 1], description: localize('motion.easing.decelerate', "Prompt local feedback that slows toward its destination.") },
	{ id: 'motion.hover.change.duration', kind: 'duration', value: { ref: 'motion.duration.short' }, description: localize('motion.hover.change.duration', "Brief pointer feedback on resize handles; direct resizing remains immediate.") },
	{ id: 'motion.hover.change.easing', kind: 'easing', value: { ref: 'motion.easing.decelerate' }, description: localize('motion.hover.change.easing', "Decelerating pointer feedback without moving the target.") },
	{ id: 'motion.state.change.duration', kind: 'duration', value: 120, description: localize('motion.state.change.duration', "Existing switch feedback duration; the setting changes immediately.") },
	{ id: 'motion.state.change.easing', kind: 'easing', value: 'ease', description: localize('motion.state.change.easing', "Existing switch feedback curve; use with its duration.") },
	{ id: 'motion.selection.change.duration', kind: 'duration', value: 160, description: localize('motion.selection.change.duration', "Existing segmented-selection travel duration; selection changes immediately.") },
	{ id: 'motion.selection.change.easing', kind: 'easing', value: [0.2, 0.8, 0.2, 1], description: localize('motion.selection.change.easing', "Existing segmented-selection curve; use with its duration.") },
	{ id: 'motion.press.change.duration', kind: 'duration', value: { ref: 'motion.duration.short' }, description: localize('motion.press.change.duration', "Duration of segmented selection press feedback.") },
	{ id: 'motion.press.change.easing', kind: 'easing', value: { ref: 'motion.easing.decelerate' }, description: localize('motion.press.change.easing', "Brief tactile press response; use with its duration.") },
	{ id: 'motion.press.change.scale', kind: 'scale', value: 0.96, description: localize('motion.press.change.scale', "Local press scale without changing the hit target.") },
	{ id: 'motion.surface.enter.duration', kind: 'duration', value: 250, description: localize('motion.surface.enter.duration', "Existing Quick Pick and action-popup entrance duration.") },
	{ id: 'motion.surface.exit.duration', kind: 'duration', value: 150, description: localize('motion.surface.exit.duration', "Existing popup dismissal duration; shorter than entrance.") },
	{ id: 'motion.surface.enter.easing', kind: 'easing', value: [0.22, 1, 0.36, 1], description: localize('motion.surface.enter.easing', "Existing popup entrance curve; use with its duration.") },
	{ id: 'motion.surface.exit.easing', kind: 'easing', value: { ref: 'motion.surface.enter.easing' }, description: localize('motion.surface.exit.easing', "Existing popup dismissal curve; use with its duration.") },
	{ id: 'motion.surface.enter.scale', kind: 'scale', value: 0.97, description: localize('motion.surface.enter.scale', "Anchored surface entrance scale.") },
	{ id: 'motion.surface.exit.scale', kind: 'scale', value: 0.99, description: localize('motion.surface.exit.scale', "Anchored surface dismissal scale.") },
	{ id: 'motion.visibility.enter.duration', kind: 'duration', value: { ref: 'motion.duration.short' }, description: localize('motion.visibility.enter.duration', "Existing hover reveal duration; intent delay remains separate.") },
	{ id: 'motion.visibility.exit.duration', kind: 'duration', value: { ref: 'motion.duration.none' }, description: localize('motion.visibility.exit.duration', "Withdraw contextual information immediately; scrollbars retain their own departure cadence.") },
	{ id: 'motion.visibility.enter.easing', kind: 'easing', value: { ref: 'motion.easing.linear' }, description: localize('motion.visibility.enter.easing', "Existing hover opacity pacing.") },
	{ id: 'motion.visibility.exit.easing', kind: 'easing', value: { ref: 'motion.easing.linear' }, description: localize('motion.visibility.exit.easing', "Immediate contextual withdrawal without a decorative exit.") },
	{ id: 'motion.content.enter.duration', kind: 'duration', value: { ref: 'motion.duration.short' }, description: localize('motion.content.enter.duration', "Brief ready-content reveal within a stable surface; never a delay before committing state.") },
	{ id: 'motion.content.enter.easing', kind: 'easing', value: { ref: 'motion.easing.linear' }, description: localize('motion.content.enter.easing', "Simple opacity reveal; keep existing readable content still.") },
	{ id: 'motion.notification.enter.duration', kind: 'duration', value: { ref: 'motion.duration.long' }, description: localize('motion.notification.enter.duration', "Existing notification arrival duration.") },
	{ id: 'motion.notification.enter.easing', kind: 'easing', value: { ref: 'motion.easing.decelerate' }, description: localize('motion.notification.enter.easing', "Existing decelerating notification arrival curve.") },
	{ id: 'motion.progress.cycle.duration', kind: 'duration', value: 4000, description: localize('motion.progress.cycle.duration', "Indeterminate progress cycle duration.") },
	{ id: 'motion.progress.cycle.easing', kind: 'easing', value: { ref: 'motion.easing.linear' }, description: localize('motion.progress.cycle.easing', "Indeterminate progress easing.") },
	{ id: 'motion.progress.longRunning.easing', kind: 'easing', value: { steps: 100 }, description: localize('motion.progress.longRunning.easing', "Lower-update-rate easing for long-running indeterminate progress.") },
	{ id: 'motion.spinner.cycle.duration', kind: 'duration', value: 1500, description: localize('motion.spinner.cycle.duration', "Compact activity icon rotation cycle duration.") },
	{ id: 'motion.spinner.cycle.easing', kind: 'easing', value: { steps: 30 }, description: localize('motion.spinner.cycle.easing', "Quantized compact activity rotation pacing.") },
	{ id: 'motion.progress.update.duration', kind: 'duration', value: { ref: 'motion.duration.medium' }, description: localize('motion.progress.update.duration', "Known progress width interpolation duration; the value updates immediately.") },
	{ id: 'motion.progress.update.easing', kind: 'easing', value: { ref: 'motion.easing.linear' }, description: localize('motion.progress.update.easing', "Constant-rate interpolation only between reported progress values.") },
	{ id: 'motion.disclosure.geometry.duration', kind: 'duration', value: 180, description: localize('motion.disclosure.geometry.duration', "Existing chat disclosure geometry duration.") },
	{ id: 'motion.disclosure.content.duration', kind: 'duration', value: 140, description: localize('motion.disclosure.content.duration', "Existing chat disclosure opacity duration; finishes before geometry.") },
	{ id: 'motion.disclosure.geometry.easing', kind: 'easing', value: [0.2, 0, 0, 1], description: localize('motion.disclosure.geometry.easing', "Existing chat disclosure curve; preserve the reading anchor.") },
	{ id: 'motion.disclosure.content.easing', kind: 'easing', value: { ref: 'motion.disclosure.geometry.easing' }, description: localize('motion.disclosure.content.easing', "Existing disclosure opacity curve; use with the shorter content duration.") },
]);
