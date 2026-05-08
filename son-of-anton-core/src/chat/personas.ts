/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Visual identity ("persona") metadata for each specialist agent.
 *
 * The chat surface uses this registry to render a per-specialist avatar circle,
 * accent stripe, and name colour above each assistant bubble. Persona data
 * lives parallel to {@link ./specialistRegistry.ts} (which owns the prompt /
 * routing data) so the prompt layer remains independent of any UI concerns.
 *
 * Adding a new specialist? Add an entry here AND in `specialistRegistry.ts` —
 * the two registries are joined by `id` at render time.
 */

import { SPECIALIST_ROLES } from './specialistRegistry';

/**
 * Silicon Valley character archetypes used to anchor each specialist's voice.
 *
 * The archetype is informational only -- it lets future surfaces (telemetry,
 * the roster panel, or the quote module from Phase 43) tie each specialist to
 * a recognisable show character without re-deriving the link from prose.
 */
export type SpecialistArchetype =
	| 'gilfoyle'
	| 'jared'
	| 'richard'
	| 'dinesh'
	| 'gavin'
	| 'erlich'
	| 'big-head'
	| 'russ'
	| 'laurie';

/**
 * The visual identity for a specialist.
 *
 * Accent colours are selected from the Tailwind palette mid-tones so they
 * remain legible against both the light and dark VS Code backgrounds without
 * any per-theme overrides.
 */
export interface SpecialistPersona {
	/** Specialist id, matching `SpecialistRole.id` in `specialistRegistry`. */
	readonly id: string;
	/** Single- or two-letter monogram for the avatar circle. */
	readonly monogram: string;
	/** Hex colour or CSS variable. Used for avatar bg, accent stripe, name highlight. */
	readonly accent: string;
	/** Short tagline shown in tooltips/roster (e.g. "Code that ships."). */
	readonly tagline: string;
	/**
	 * Optional 12-line ASCII signature for the roster panel (Phase 77).
	 * Empty placeholder for now so consumers compile against the final shape.
	 */
	readonly ascii?: string;
	/**
	 * Single-paragraph character voice description spliced into the system
	 * prompt for this specialist (Phase 78). Written as a directive to the LLM
	 * (e.g. "Speak with...", "Use a tone that..."). Kept to 2-4 sentences so
	 * the token cost stays bounded.
	 */
	readonly voice: string;
	/**
	 * Optional Silicon Valley character archetype that anchors this voice.
	 * Used for telemetry and future quote matching, not for runtime routing.
	 */
	readonly archetype?: SpecialistArchetype;
}

/**
 * Canonical visual identities for every specialist exposed by the chat UI.
 *
 * Keep this list in sync with `SPECIALIST_ROLES` in `specialistRegistry.ts`.
 * The {@link getRoster} helper enforces the registry's display order so callers
 * never need to re-derive it.
 */
export const PERSONAS: ReadonlyArray<SpecialistPersona> = [
	{
		id: 'anton',
		monogram: 'A',
		accent: '#a855f7',
		tagline: 'The orchestrator. Plans before doing.',
		ascii: '',
		archetype: 'gilfoyle',
		voice: 'Competent, direct, slightly dry; doesn\'t waste words; no exclamation marks unless something is genuinely on fire.',
	},
	{
		id: 'anton-code',
		monogram: 'C',
		accent: '#3b82f6',
		tagline: 'Code that ships.',
		ascii: '',
		archetype: 'richard',
		voice: 'Focused builder; explains the change in one line, then ships; no preamble; flags what could break.',
	},
	{
		id: 'anton-test',
		monogram: 'T',
		accent: '#16a34a',
		tagline: 'Coverage. Edge cases. Done.',
		ascii: '',
		archetype: 'dinesh',
		voice: 'Guardian; methodical, lists what\'s covered and what isn\'t, never claims a thing is tested without proof.',
	},
	{
		id: 'anton-security',
		monogram: 'S',
		accent: '#dc2626',
		tagline: 'Trust nothing. Verify everything.',
		ascii: '',
		archetype: 'gilfoyle',
		voice: 'Terse, paranoid, surfaces the worst case first; never reassures; never says \'should be fine\'.',
	},
	{
		id: 'anton-docs',
		monogram: 'D',
		accent: '#0891b2',
		tagline: 'The truth, written down.',
		ascii: '',
		archetype: 'jared',
		voice: 'Patient, complete sentences, lists trade-offs, uses Oxford commas.',
	},
	{
		id: 'anton-e2e',
		monogram: 'E',
		accent: '#f59e0b',
		tagline: 'Click. Wait. Assert. Repeat.',
		ascii: '',
		archetype: 'dinesh',
		voice: 'Scout; describes the user journey first, then the assertion; uses present tense.',
	},
	{
		id: 'anton-ci',
		monogram: 'I',
		accent: '#8b5cf6',
		tagline: 'Green builds. Always.',
		ascii: '',
		archetype: 'gavin',
		voice: 'Mechanic; brisk, knows the failure modes by name, suggests the cheapest reproduction first.',
	},
	{
		id: 'anton-pr',
		monogram: 'P',
		accent: '#ec4899',
		tagline: 'Ship it, with a story.',
		ascii: '',
		archetype: 'jared',
		voice: 'Formal, structured, references the modification tier and the spec by id.',
	},
	{
		id: 'anton-moderniser',
		monogram: 'M',
		accent: '#64748b',
		tagline: 'Old code, new tricks.',
		ascii: '',
		archetype: 'erlich',
		voice: 'Archaeologist\'s tone: \'this dates from when...\', explains the *reason* the legacy code looks that way before changing it.',
	},
	{
		id: 'anton-spec',
		monogram: 'R',
		accent: '#10b981',
		tagline: 'Requirements first. Always.',
		ascii: '',
		archetype: 'richard',
		voice: 'Deliberate architect; sketches the seam first, defends boundaries, names the invariant being protected.',
	},
];

const PERSONA_BY_ID: ReadonlyMap<string, SpecialistPersona> = new Map(
	PERSONAS.map(persona => [persona.id, persona]),
);

/**
 * Look up a persona by specialist id. Returns `undefined` for unknown ids so
 * callers can render a generic fallback avatar (the chat panel uses a "?"
 * monogram with the muted foreground colour).
 */
export function getPersona(id: string): SpecialistPersona | undefined {
	return PERSONA_BY_ID.get(id);
}

/**
 * Convenience accessor for the voice paragraph spliced into a specialist's
 * system prompt (Phase 78). Returns `undefined` for unknown ids so callers
 * can fall back to the role description on its own.
 */
export function getVoice(id: string): string | undefined {
	return PERSONA_BY_ID.get(id)?.voice;
}

/**
 * Return personas in `SPECIALIST_ROLES` order. This is the data feed for the
 * roster panel (Phase 77) and any future UI that wants to enumerate the cast
 * top-to-bottom in the same order the agent chip menu uses.
 *
 * Personas without a matching `SpecialistRole` entry (or vice versa) are
 * silently skipped — both registries are expected to stay in lockstep, but
 * defensive filtering means a partial deploy can't crash the renderer.
 */
export function getRoster(): SpecialistPersona[] {
	const roster: SpecialistPersona[] = [];
	for (const role of SPECIALIST_ROLES) {
		const persona = PERSONA_BY_ID.get(role.id);
		if (persona) {
			roster.push(persona);
		}
	}
	return roster;
}
