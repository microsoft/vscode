/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMotionFrame, IMotionRecipe } from '../../../../base/common/motion.js';
import { deepClone, deepFreeze } from '../../../../base/common/objects.js';
import { localize } from '../../../../nls.js';
import { MotionResponsePresetId, motionResponsePresets } from './motionResponses.js';

export type MotionPresetPhase = 'change' | 'enter' | 'exit' | 'geometry' | 'content';

type MotionPresetTrack =
	| { readonly primitive: 'fade'; readonly property: 'opacity' }
	| { readonly primitive: 'scale' | 'translate'; readonly property: 'transform' }
	| { readonly primitive: 'resize'; readonly property: 'width' | 'grid-template-rows' }
	| { readonly primitive: 'color'; readonly property: 'background-color' | 'border-color' };

interface IMotionPreset {
	readonly id: string;
	readonly label: string;
	readonly purpose: string;
	readonly applicability: string;
	readonly intent: 'feedback' | 'reveal' | 'reflow' | 'awareness';
	readonly reducedMotion: 'immediate';
	readonly requirements: {
		readonly geometry: 'component-owned';
		readonly semanticState: 'immediate';
		readonly focus: 'immediate';
		readonly interruption: 'replace-from-current';
		readonly lifecycle: 'component-owned';
	};
	readonly phases: readonly {
		readonly phase: MotionPresetPhase;
		readonly response: MotionResponsePresetId;
		readonly tracks: readonly MotionPresetTrack[];
	}[];
}

/** Reusable definitions independent of consumer tokens; components implement the stated requirements. */
export const motionPresets = [
	{
		id: 'control',
		label: localize('motion.preset.stateFeedback', "State feedback"),
		purpose: localize('motion.preset.stateFeedback.purpose', "Acknowledge a changed state without moving its action target."),
		applicability: localize('motion.preset.stateFeedback.applicability', "Local color and indicator changes; not keyboard focus or an already clear repeated action."),
		intent: 'feedback', reducedMotion: 'immediate',
		requirements: { geometry: 'component-owned', semanticState: 'immediate', focus: 'immediate', interruption: 'replace-from-current', lifecycle: 'component-owned' },
		phases: [
			{ phase: 'change', response: 'responsive', tracks: [
				{ primitive: 'color', property: 'background-color' },
				{ primitive: 'color', property: 'border-color' },
				{ primitive: 'translate', property: 'transform' },
			] },
		],
	},
	{
		id: 'selection',
		label: localize('motion.preset.selectionChange', "Selection change"),
		purpose: localize('motion.preset.selectionChange.purpose', "Connect a new selection to its previous location while labels remain still."),
		applicability: localize('motion.preset.selectionChange.applicability', "An indicator within stable bounds; not hover, keyboard focus, or rapid navigation."),
		intent: 'feedback', reducedMotion: 'immediate',
		requirements: { geometry: 'component-owned', semanticState: 'immediate', focus: 'immediate', interruption: 'replace-from-current', lifecycle: 'component-owned' },
		phases: [
			{ phase: 'change', response: 'responsive', tracks: [
				{ primitive: 'translate', property: 'transform' },
				{ primitive: 'resize', property: 'width' },
			] },
		],
	},
	{
		id: 'surface',
		label: localize('motion.preset.surfacePresence', "Surface presence"),
		purpose: localize('motion.preset.surfacePresence.purpose', "Establish or withdraw a surface at a stable anchor."),
		applicability: localize('motion.preset.surfacePresence.applicability', "Deliberate opening and closing; not typing, content updates, or restoration of an already visible surface."),
		intent: 'reveal', reducedMotion: 'immediate',
		requirements: { geometry: 'component-owned', semanticState: 'immediate', focus: 'immediate', interruption: 'replace-from-current', lifecycle: 'component-owned' },
		phases: [
			{ phase: 'enter', response: 'settled', tracks: [
				{ primitive: 'fade', property: 'opacity' },
				{ primitive: 'scale', property: 'transform' },
			] },
			{ phase: 'exit', response: 'responsive', tracks: [
				{ primitive: 'fade', property: 'opacity' },
				{ primitive: 'scale', property: 'transform' },
			] },
		],
	},
	{
		id: 'disclosure',
		label: localize('motion.preset.expandCollapse', "Expand and collapse"),
		purpose: localize('motion.preset.expandCollapse.purpose', "Reveal or withdraw supporting content without losing its reading anchor."),
		applicability: localize('motion.preset.expandCollapse.applicability', "Bounded vertical disclosures with unscaled text; not direct resizing, startup layout, or rapid tree navigation."),
		intent: 'reflow', reducedMotion: 'immediate',
		requirements: { geometry: 'component-owned', semanticState: 'immediate', focus: 'immediate', interruption: 'replace-from-current', lifecycle: 'component-owned' },
		phases: [
			{ phase: 'geometry', response: 'settled', tracks: [{ primitive: 'resize', property: 'grid-template-rows' }] },
			{ phase: 'content', response: 'responsive', tracks: [{ primitive: 'fade', property: 'opacity' }] },
		],
	},
	{
		id: 'notification',
		label: localize('motion.preset.notificationArrival', "Notification arrival"),
		purpose: localize('motion.preset.notificationArrival.purpose', "Make new information noticeable once without taking focus."),
		applicability: localize('motion.preset.notificationArrival.applicability', "A bounded arrival from a meaningful edge; not repeated emphasis, an animated countdown, or a dismissal delay."),
		intent: 'awareness', reducedMotion: 'immediate',
		requirements: { geometry: 'component-owned', semanticState: 'immediate', focus: 'immediate', interruption: 'replace-from-current', lifecycle: 'component-owned' },
		phases: [
			{ phase: 'enter', response: 'settled', tracks: [
				{ primitive: 'translate', property: 'transform' },
				{ primitive: 'fade', property: 'opacity' },
			] },
		],
	},
	{
		id: 'replacement',
		label: localize('motion.preset.contentReplacement', "Content replacement"),
		purpose: localize('motion.preset.contentReplacement.purpose', "Reveal ready content inside a stable surface without moving its controls."),
		applicability: localize('motion.preset.contentReplacement.applicability', "First usable content after loading or new results after an explicit refresh; keep retained content still. Not background updates, frequent step navigation, keystrokes, streaming, or blanking readable content."),
		intent: 'reveal', reducedMotion: 'immediate',
		requirements: { geometry: 'component-owned', semanticState: 'immediate', focus: 'immediate', interruption: 'replace-from-current', lifecycle: 'component-owned' },
		phases: [{ phase: 'enter', response: 'responsive', tracks: [{ primitive: 'fade', property: 'opacity' }] }],
	},
	{
		id: 'visibility',
		label: localize('motion.preset.visibilityChange', "Visibility change"),
		purpose: localize('motion.preset.visibilityChange.purpose', "Reveal or withdraw contextual chrome without moving its target."),
		applicability: localize('motion.preset.visibilityChange.applicability', "Hover and scrollbar visibility; not content replacement or delayed keyboard access."),
		intent: 'awareness', reducedMotion: 'immediate',
		requirements: { geometry: 'component-owned', semanticState: 'immediate', focus: 'immediate', interruption: 'replace-from-current', lifecycle: 'component-owned' },
		phases: [
			{ phase: 'enter', response: 'settled', tracks: [{ primitive: 'fade', property: 'opacity' }] },
			{ phase: 'exit', response: 'responsive', tracks: [{ primitive: 'fade', property: 'opacity' }] },
		],
	},
] as const satisfies readonly IMotionPreset[];

deepFreeze(motionPresets);

export type MotionPresetId = typeof motionPresets[number]['id'];

/** Resolve the generated duration and curve together without reading or changing consumer tokens. */
export function resolveMotionPreset(id: MotionPresetId) {
	const definition = motionPresets.find(preset => preset.id === id);
	if (!definition) {
		throw new Error(`Unknown motion preset: ${id}`);
	}
	const phases = definition.phases.map(phase => {
		const response = motionResponsePresets.find(response => response.id === phase.response);
		if (!response) {
			throw new Error(`Missing motion response: ${phase.response}`);
		}
		return deepFreeze({ phase: phase.phase, tracks: phase.tracks, response: deepClone(response) } as const);
	});
	return Object.freeze({ definition, phases: Object.freeze(phases) });
}

export interface IMotionPresenceGeometry {
	/** Hidden endpoint relative to the component's resting scale of 1; omit to own only opacity. */
	readonly scale?: number;
}

/** Resolve finite surface presence for MotionController; the caller owns the anchor, state, focus, and lifetime. Fixed trajectories do not retain velocity. */
export function resolveMotionPresetEffect(id: 'surface', phase: 'enter' | 'exit', geometry: IMotionPresenceGeometry = {}): IMotionRecipe {
	if (id !== 'surface' || phase !== 'enter' && phase !== 'exit') {
		throw new Error(`Unsupported motion presence preset or phase: ${id}/${phase}`);
	}
	if (!geometry || typeof geometry !== 'object' || Array.isArray(geometry) || Object.keys(geometry).some(key => key !== 'scale') || geometry.scale !== undefined && (!Number.isFinite(geometry.scale) || geometry.scale <= 0)) {
		throw new Error('Invalid motion presence geometry');
	}
	const resolved = resolveMotionPreset(id).phases.find(candidate => candidate.phase === phase)!;
	let hidden: IMotionFrame = {};
	let visible: IMotionFrame = {};
	let reduced: IMotionFrame = {};
	for (const track of resolved.tracks) {
		if (track.primitive === 'fade') {
			hidden = { ...hidden, opacity: 0 };
			visible = { ...visible, opacity: 1 };
			reduced = { ...reduced, opacity: phase === 'enter' ? 1 : 0 };
		} else if (track.primitive === 'scale') {
			if (geometry.scale !== undefined) {
				hidden = { ...hidden, transform: `scale(${geometry.scale})` };
				visible = { ...visible, transform: 'scale(1)' };
				reduced = { ...reduced, transform: 'none' };
			}
		} else {
			throw new Error(`Unsupported motion presence primitive: ${track.primitive}`);
		}
	}
	return deepFreeze({
		id: `motion.preset.${id}.${phase}`,
		effect: {
			frames: phase === 'enter' ? [hidden, visible] : [visible, hidden],
			duration: resolved.response.durationMs, easing: resolved.response.easing,
			delay: 0, iterations: 1, direction: 'normal',
		},
		reducedEffect: {
			frames: [reduced],
			duration: 0, delay: 0, easing: 'linear', iterations: 1, direction: 'normal',
		},
	});
}
