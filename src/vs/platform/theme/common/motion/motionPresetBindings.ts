/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepFreeze } from '../../../../base/common/objects.js';
import { MotionPresetId, MotionPresetPhase, resolveMotionPreset } from './motionPresets.js';
import { MotionTokenRegistry, motionTokenRegistry } from '../motionRegistry.js';
import { asCssVariableName } from '../sizeUtils.js';

export interface IMotionPresetBinding {
	readonly id: string;
	readonly preset: MotionPresetId;
	readonly phases: readonly {
		readonly phase: MotionPresetPhase;
		readonly durationTokens: readonly string[];
		readonly easingTokens: readonly string[];
	}[];
}

/** Product token bindings; response selection and applicability belong to motionPresets. */
export const motionPresetBindings = [
	{
		id: 'control', preset: 'control',
		phases: [{ phase: 'change', durationTokens: ['motion.control.duration', 'motion.border.duration'], easingTokens: ['motion.control.easing', 'motion.border.easing'] }],
	},
	{
		id: 'selection', preset: 'selection',
		phases: [{ phase: 'change', durationTokens: ['motion.selection.duration'], easingTokens: ['motion.selection.easing'] }],
	},
	{
		id: 'surface', preset: 'surface',
		phases: [
			{ phase: 'enter', durationTokens: ['motion.surface.enter.duration'], easingTokens: ['motion.surface.easing'] },
			{ phase: 'exit', durationTokens: ['motion.surface.exit.duration'], easingTokens: ['motion.surface.exit.easing'] },
		],
	},
	{
		id: 'disclosure', preset: 'disclosure',
		phases: [
			{ phase: 'geometry', durationTokens: ['motion.disclosure.duration'], easingTokens: ['motion.disclosure.easing'] },
			{ phase: 'content', durationTokens: ['motion.disclosure.opacity.duration'], easingTokens: ['motion.disclosure.opacity.easing'] },
		],
	},
	{
		id: 'notification', preset: 'notification',
		phases: [{ phase: 'enter', durationTokens: ['motion.toast.duration'], easingTokens: ['motion.toast.easing'] }],
	},
	{
		id: 'replacement', preset: 'replacement',
		phases: [{ phase: 'enter', durationTokens: ['motion.content.duration'], easingTokens: ['motion.content.easing'] }],
	},
	{
		id: 'visibility', preset: 'visibility',
		phases: [
			{ phase: 'enter', durationTokens: ['motion.fade.enter.duration'], easingTokens: ['motion.fade.easing'] },
			{ phase: 'exit', durationTokens: ['motion.fade.exit.duration', 'motion.scrollbar.exit.duration'], easingTokens: ['motion.fade.easing'] },
		],
	},
] as const satisfies readonly IMotionPresetBinding[];

deepFreeze(motionPresetBindings);

/** Resolve a scoped CSS binding, rejecting incomplete pairs and incompatible shared-token assignments. */
export function resolveMotionPresetBinding<TId extends string>(binding: IMotionPresetBinding & { readonly id: TId }, registry: MotionTokenRegistry = motionTokenRegistry) {
	const preset = resolveMotionPreset(binding.preset);
	if (!binding.phases.length) {
		throw new Error(`Missing motion preset phases: ${binding.id}`);
	}
	const seen = new Set<MotionPresetPhase>();
	const variables = new Map<string, string>();
	const set = (token: string, value: string) => {
		const name = asCssVariableName(token);
		const previous = variables.get(name);
		if (previous !== undefined && previous !== value) {
			throw new Error(`Conflicting response phases for motion token: ${token}`);
		}
		variables.set(name, value);
	};
	const phases = binding.phases.map(bound => {
		const phase = preset.phases.find(phase => phase.phase === bound.phase);
		if (!phase || seen.has(bound.phase)) {
			throw new Error(`Invalid or duplicate motion preset phase: ${binding.preset}/${bound.phase}`);
		}
		seen.add(bound.phase);
		if (!bound.durationTokens.length || !bound.easingTokens.length) {
			throw new Error(`Incomplete motion response binding: ${binding.id}/${bound.phase}`);
		}
		for (const token of bound.durationTokens) {
			registry.getNumber(token, 'duration');
			set(token, `${phase.response.durationMs}ms`);
		}
		for (const token of bound.easingTokens) {
			registry.getValueCss(token, 'easing');
			set(token, phase.response.easing);
		}
		return phase;
	});
	const definition = Object.freeze({
		...preset.definition, id: binding.id, preset: binding.preset,
		geometry: preset.definition.requirements.geometry,
		semanticState: preset.definition.requirements.semanticState,
		interruption: 'position-continuous' as const,
		phases: Object.freeze(binding.phases.map((bound, index) => Object.freeze({
			phase: bound.phase, response: phases[index].response.id,
			durationTokens: Object.freeze([...bound.durationTokens]), easingTokens: Object.freeze([...bound.easingTokens]),
		}))),
	});
	return Object.freeze({ definition, phases: Object.freeze(phases), cssVariables: Object.freeze(Object.fromEntries(variables)) });
}
