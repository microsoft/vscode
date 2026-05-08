/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Per-specialist curated sign-off quotes (Phase 78).
 *
 * Each specialist persona maps to three hand-picked quotes from
 * {@link ./siliconValleyQuotes.ts} whose tone overlaps with the persona's
 * voice. When `sota.personality.enabled` is on, agents may end a turn that
 * completed naturally with a randomly-selected quote from this list, formatted
 * as `\n\n-- "Quote text" -- Character\n`.
 *
 * Quotes here are stored by reference (text + character) rather than as
 * `SVQuote` objects, so a future renaming of `SVCharacter` doesn't ripple
 * through this file. The text values must match `SILICON_VALLEY_QUOTES`
 * verbatim so consumers can deduplicate against the main library if needed.
 */

import type { AgentHandle } from '../agents/types';

export interface CuratedQuote {
	readonly text: string;
	readonly character: string;
}

/**
 * Curated three-quote sign-off lists, keyed by specialist id.
 *
 * Selection criteria: tone overlap with the persona's voice. Where a natural
 * Silicon Valley character match exists (Gilfoyle for `anton`, Jared for
 * `anton-docs`, etc.) we draw from that character's lines first; otherwise
 * we pick whichever quote in the library best fits the persona's register.
 *
 * Only the 10 personas defined in `personas.ts` have entries. Specialists
 * like `anton-pentest` and `anton-review` rely on the orchestrator's existing
 * tone-based quote system rather than on per-handle curation here.
 */
export const SPECIALIST_QUOTES: Partial<Record<AgentHandle, ReadonlyArray<CuratedQuote>>> = {
	'anton': [
		// Gilfoyle: dry, slightly apocalyptic -- the core anton voice.
		{
			text: 'I\'m not saying I told you so, but I\'m definitely thinking it really hard.',
			character: 'Gilfoyle',
		},
		{
			text: 'The rise of an all-powerful artificial intelligence is inevitable.',
			character: 'Gilfoyle',
		},
		{
			text: 'There are two ways to stop a brushfire. You can either smother it, or you can starve it of fuel. Either way, the fire dies.',
			character: 'Gilfoyle',
		},
	],
	'anton-code': [
		// Richard: tabs-not-spaces purism + earnest pep-talk -- the coder's register.
		{
			text: 'Tabs. Definitely tabs.',
			character: 'Richard',
		},
		{
			text: 'It\'s not magic. It\'s talent and sweat.',
			character: 'Richard',
		},
		{
			text: 'I just want to build something cool that I\'m proud of, with people that I respect.',
			character: 'Richard',
		},
	],
	'anton-test': [
		// Dinesh: earnest, slight bravado about catching the edge case.
		{
			text: 'Engineering is the closest thing to magic that exists in the world.',
			character: 'Dinesh',
		},
		{
			text: 'That was an out-of-body experience. It was like God was coding through me. Time stood still.',
			character: 'Dinesh',
		},
		// Gilfoyle's brushfire line doubles as a "stop it before it spreads" testing motto.
		{
			text: 'There are two ways to stop a brushfire. You can either smother it, or you can starve it of fuel. Either way, the fire dies.',
			character: 'Gilfoyle',
		},
	],
	'anton-security': [
		// Gilfoyle: apocalyptic and dry -- the paranoid security register.
		{
			text: 'It\'s possible that Son of Anton thought the best way to get rid of all the bugs was to get rid of all the software, which is technically and statistically correct.',
			character: 'Gilfoyle',
		},
		{
			text: 'If you\'re the CEO of a company, and you\'re dumb enough to leave your log-in info on a Post-It note on your desk, while the people that you ripped off are physically in your office, it\'s not a hack. It\'s barely social engineering. It\'s more like natural selection.',
			character: 'Gilfoyle',
		},
		{
			text: 'You realize that I will destroy you.',
			character: 'Gilfoyle',
		},
	],
	'anton-docs': [
		// Jared: patient, earnest, structured. The docs voice.
		{
			text: 'We can\'t compete on features, but we can compete on the strength of our personalities.',
			character: 'Jared',
		},
		{
			text: 'Your charts will be enchanting!',
			character: 'Jared',
		},
		{
			text: 'Gentlemen, the eyes of the entire tech world are upon you. Not really, but go in there and code your hearts out.',
			character: 'Jared',
		},
	],
	'anton-e2e': [
		// Dinesh: witty/optimistic about flows, plus a competitive edge.
		{
			text: 'I am not getting in a hot tub with Gilfoyle. He\'s like an evil leprechaun.',
			character: 'Dinesh',
		},
		{
			text: 'Engineering is the closest thing to magic that exists in the world.',
			character: 'Dinesh',
		},
		// Big Head's bemused optimism -- E2E specs feel exactly like this.
		{
			text: 'I have no idea what is going on, but I am very pleased with how things are turning out.',
			character: 'Big Head',
		},
	],
	'anton-ci': [
		// Gavin: brisk, decisive, slightly dry. The build-mechanic register.
		{
			text: 'Failure is growth. Failure is learning. But sometimes failure is just failure.',
			character: 'Gavin',
		},
		{
			text: 'I don\'t want to live in a world where someone else is making the world a better place better than we are.',
			character: 'Gavin',
		},
		// Gilfoyle for the diagnose-not-suppress philosophy.
		{
			text: 'There are two ways to stop a brushfire. You can either smother it, or you can starve it of fuel. Either way, the fire dies.',
			character: 'Gilfoyle',
		},
	],
	'anton-pr': [
		// Jared: structured, generous with context. The PR-narrator voice.
		{
			text: 'Gentlemen, the eyes of the entire tech world are upon you. Not really, but go in there and code your hearts out.',
			character: 'Jared',
		},
		{
			text: 'We can\'t compete on features, but we can compete on the strength of our personalities.',
			character: 'Jared',
		},
		{
			text: 'I once worked for a year and a half straight without seeing the sun. I came out of it with rickets and lifelong night terrors. But the launch was on time.',
			character: 'Jared',
		},
	],
	'anton-moderniser': [
		// Erlich: confident, grand-vision archaeologist of legacy code.
		{
			text: 'Welcome to the incubator.',
			character: 'Erlich',
		},
		{
			text: 'Aviato. It\'s the company I founded. I\'m Erlich Bachman, of Aviato.',
			character: 'Erlich',
		},
		{
			text: 'I will rain down an ungodly fucking firestorm upon you!',
			character: 'Erlich',
		},
	],
	'anton-spec': [
		// Richard: methodical, principled, requirement-driven.
		{
			text: 'We\'re not Google. We\'re not Facebook. We\'re Pied Piper. And we matter.',
			character: 'Richard',
		},
		{
			text: 'Everything will work out. Just trust the process.',
			character: 'Richard',
		},
		{
			text: 'Middle out.',
			character: 'Richard',
		},
	],
};

/**
 * Pick a curated sign-off quote for the given specialist. Returns `undefined`
 * when the handle has no curation in {@link SPECIALIST_QUOTES} (e.g.
 * `anton-pentest` or `anton-review`), so callers can silently skip the
 * sign-off rather than emit a generic line.
 *
 * Selection is uniformly random across the curated list. The 25%-probability
 * gate that decides whether to fire at all lives at the call site, so this
 * helper always returns a pick when one is available.
 */
export function pickSignOffQuote(handle: AgentHandle): CuratedQuote | undefined {
	const quotes = SPECIALIST_QUOTES[handle];
	if (!quotes || quotes.length === 0) {
		return undefined;
	}
	return quotes[Math.floor(Math.random() * quotes.length)];
}

/**
 * Format a curated quote as the agent sign-off footer used by Phase 78.
 *
 * Output shape: `\n\n-- "Quote text" -- Character\n`. The leading double
 * newline keeps it visually separate from the assistant's last paragraph; the
 * trailing newline preserves block-level spacing in markdown renderers.
 */
export function formatSignOff(quote: CuratedQuote): string {
	const dq = '"';
	return `\n\n-- ${dq}${quote.text}${dq} -- ${quote.character}\n`;
}
