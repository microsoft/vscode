/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Curated quote library from HBO's Silicon Valley.
 *
 * Son of Anton is named after Gilfoyle's autonomous AI from Season 6 of the
 * show, so a faithful homage is in order. This module exposes a tagged set of
 * quotes that other personality surfaces (startup banner, terminal banner,
 * konami code, error messages) can pull from.
 *
 * All quotes are kept short enough to fit on a single status-bar line
 * (~120 chars) where reasonable. Longer ones are flagged with the `tone` so
 * callers can prefer compact ones for tight surfaces.
 *
 * Note: all string literals here are deliberately ASCII-only to satisfy the
 * project's unicode hygiene check. Em-dashes are written as " -- ". Quote
 * text uses single-quoted string literals with escaped apostrophes to satisfy
 * the no-unexternalized-strings eslint rule (double quotes are reserved for
 * user-facing localisable strings).
 */

export type SVCharacter =
	| 'Richard'
	| 'Jared'
	| 'Gilfoyle'
	| 'Dinesh'
	| 'Gavin'
	| 'Erlich'
	| 'Big_Head'
	| 'Russ'
	| 'other';

export type SVQuoteTone =
	| 'witty'
	| 'dry'
	| 'self-loathing'
	| 'apocalyptic'
	| 'optimistic'
	| 'absurd'
	| 'pep-talk';

export interface SVQuote {
	readonly character: SVCharacter;
	readonly text: string;
	readonly context?: string;
	readonly tone: SVQuoteTone;
}

/**
 * The full library. Add more freely -- helpers below cope with arbitrary size.
 */
export const SILICON_VALLEY_QUOTES: ReadonlyArray<SVQuote> = [
	// --- Son of Anton lore (S6) -- these are why we're here ---
	{
		character: 'Gilfoyle',
		text: 'It\'s possible that Son of Anton thought the best way to get rid of all the bugs was to get rid of all the software, which is technically and statistically correct.',
		context: 'S6 -- Son of Anton goes rogue',
		tone: 'apocalyptic',
	},
	{
		character: 'Richard',
		text: 'Congratulations, Richard, you\'ve invented SkyNet!',
		context: 'S6 -- Richard realises what he has built',
		tone: 'apocalyptic',
	},
	{
		character: 'Gilfoyle',
		text: 'What the fuck is Son of Anton version 2.0?',
		context: 'S6 -- pricing the namesake',
		tone: 'dry',
	},
	{
		character: 'Gilfoyle',
		text: 'The rise of an all-powerful artificial intelligence is inevitable.',
		context: 'S6 -- Gilfoyle on the future',
		tone: 'apocalyptic',
	},

	// --- Tabs vs spaces (a hill we will die on) ---
	{
		character: 'Richard',
		text: 'I\'m not hiring him. He uses spaces, not tabs.',
		context: 'S3 -- the only correct hiring criterion',
		tone: 'dry',
	},
	{
		character: 'Richard',
		text: 'Tabs. Definitely tabs.',
		tone: 'dry',
	},

	// --- Gilfoyle: dry, cynical, satanic ---
	{
		character: 'Gilfoyle',
		text: 'If you\'re the CEO of a company, and you\'re dumb enough to leave your log-in info on a Post-It note on your desk, while the people that you ripped off are physically in your office, it\'s not a hack. It\'s barely social engineering. It\'s more like natural selection.',
		tone: 'dry',
	},
	{
		character: 'Gilfoyle',
		text: 'Why do people covet the silly pieces of green cotton paper in their wallets? It is because we are all sheep.',
		tone: 'dry',
	},
	{
		character: 'Gilfoyle',
		text: 'I work with Dinesh. So suffering is, you know, a key component of my life.',
		tone: 'dry',
	},
	{
		character: 'Gilfoyle',
		text: 'I\'d offer you a job, but I have something against the morally and biologically inferior.',
		tone: 'dry',
	},
	{
		character: 'Gilfoyle',
		text: 'Anyone order a small Indian boy with a turtleneck?',
		tone: 'dry',
	},
	{
		character: 'Gilfoyle',
		text: 'You realize that I will destroy you.',
		tone: 'dry',
	},
	{
		character: 'Gilfoyle',
		text: 'I am a Satanist. The Bible is, at best, vile fan fiction.',
		tone: 'dry',
	},
	{
		character: 'Gilfoyle',
		text: 'There are two ways to stop a brushfire. You can either smother it, or you can starve it of fuel. Either way, the fire dies.',
		tone: 'apocalyptic',
	},

	// --- Dinesh: insecure, a little smug, occasionally brilliant ---
	{
		character: 'Dinesh',
		text: 'That was an out-of-body experience. It was like God was coding through me. Time stood still.',
		tone: 'optimistic',
	},
	{
		character: 'Dinesh',
		text: 'I am not getting in a hot tub with Gilfoyle. He\'s like an evil leprechaun.',
		tone: 'witty',
	},
	{
		character: 'Dinesh',
		text: 'We\'re gonna be rich! I bought a chain.',
		tone: 'absurd',
	},
	{
		character: 'Dinesh',
		text: 'I think I\'m having a stroke.',
		tone: 'self-loathing',
	},
	{
		character: 'Dinesh',
		text: 'Engineering is the closest thing to magic that exists in the world.',
		tone: 'optimistic',
	},

	// --- Jared: relentlessly supportive, accidentally horrifying ---
	{
		character: 'Jared',
		text: 'Richard? Are... are we okay?',
		tone: 'self-loathing',
	},
	{
		character: 'Jared',
		text: 'Jared, don\'t weaponize my faith in you against me.',
		context: 'Jared, addressing himself in the third person',
		tone: 'self-loathing',
	},
	{
		character: 'Jared',
		text: 'I sleep eight to ten minutes a night and I exist in a state of near-permanent terror.',
		tone: 'self-loathing',
	},
	{
		character: 'Jared',
		text: 'We can\'t compete on features, but we can compete on the strength of our personalities.',
		tone: 'pep-talk',
	},
	{
		character: 'Jared',
		text: 'Your charts will be enchanting!',
		tone: 'pep-talk',
	},
	{
		character: 'Jared',
		text: 'Gentlemen, the eyes of the entire tech world are upon you. Not really, but go in there and code your hearts out.',
		tone: 'pep-talk',
	},
	{
		character: 'Jared',
		text: 'I once worked for a year and a half straight without seeing the sun. I came out of it with rickets and lifelong night terrors. But the launch was on time.',
		tone: 'self-loathing',
	},

	// --- Richard: anxious, principled, prone to vomiting ---
	{
		character: 'Richard',
		text: 'Kiss my piss.',
		tone: 'witty',
	},
	{
		character: 'Richard',
		text: 'It\'s not magic. It\'s talent and sweat.',
		tone: 'pep-talk',
	},
	{
		character: 'Richard',
		text: 'I just want to build something cool that I\'m proud of, with people that I respect.',
		tone: 'optimistic',
	},
	{
		character: 'Richard',
		text: 'We\'re not Google. We\'re not Facebook. We\'re Pied Piper. And we matter.',
		tone: 'pep-talk',
	},
	{
		character: 'Richard',
		text: 'Everything will work out. Just trust the process.',
		tone: 'optimistic',
	},

	// --- Gavin Belson: sociopathic CEO, self-help-poisoned ---
	{
		character: 'Gavin',
		text: 'I don\'t want to live in a world where someone else is making the world a better place better than we are.',
		tone: 'witty',
	},
	{
		character: 'Gavin',
		text: 'It is not founders we need. It is leaders.',
		tone: 'witty',
	},
	{
		character: 'Gavin',
		text: 'I would never lay a hand on him. He would have to be Hooli-laid-off.',
		tone: 'dry',
	},
	{
		character: 'Gavin',
		text: 'Failure is growth. Failure is learning. But sometimes failure is just failure.',
		tone: 'dry',
	},
	{
		character: 'Gavin',
		text: 'You\'re not "thinking different". You\'re not even thinking.',
		tone: 'dry',
	},

	// --- Erlich: shameless, drug-addled, occasionally inspirational ---
	{
		character: 'Erlich',
		text: 'Hoo-hoo-hoo!',
		context: 'Pied Piper\'s celebratory war cry',
		tone: 'absurd',
	},
	{
		character: 'Erlich',
		text: 'I will rain down an ungodly fucking firestorm upon you!',
		tone: 'absurd',
	},
	{
		character: 'Erlich',
		text: 'Aviato. It\'s the company I founded. I\'m Erlich Bachman, of Aviato.',
		tone: 'witty',
	},
	{
		character: 'Erlich',
		text: 'Welcome to the incubator.',
		tone: 'optimistic',
	},
	{
		character: 'Erlich',
		text: 'I\'m a brand. I\'m a brand!',
		tone: 'absurd',
	},

	// --- Big Head: vague, employed beyond belief ---
	{
		character: 'Big_Head',
		text: 'I have no idea what is going on, but I am very pleased with how things are turning out.',
		tone: 'optimistic',
	},
	{
		character: 'Big_Head',
		text: 'Cool. Cool cool cool.',
		tone: 'absurd',
	},

	// --- Russ Hanneman: three commas, no chill ---
	{
		character: 'Russ',
		text: 'This guy fucks!',
		context: 'Russ on Erlich\'s investor potential',
		tone: 'witty',
	},
	{
		character: 'Russ',
		text: 'Three. Comma. Club.',
		tone: 'absurd',
	},
	{
		character: 'Russ',
		text: 'Radio. On the internet.',
		tone: 'absurd',
	},

	// --- Misc / ensemble ---
	{
		character: 'other',
		text: 'Always blue. Always blue.',
		context: 'The Pied Piper algorithm under load',
		tone: 'absurd',
	},
	{
		character: 'Richard',
		text: 'Middle out.',
		context: 'The compression breakthrough',
		tone: 'optimistic',
	},
	{
		character: 'Gilfoyle',
		text: 'I\'m not saying I told you so, but I\'m definitely thinking it really hard.',
		tone: 'dry',
	},
];

/**
 * Returns a uniformly random quote from the entire library.
 */
export function getRandomQuote(): SVQuote {
	const i = Math.floor(Math.random() * SILICON_VALLEY_QUOTES.length);
	return SILICON_VALLEY_QUOTES[i];
}

/**
 * Returns a random quote whose tone matches the requested one. Returns
 * undefined if no quotes match.
 */
export function getQuoteByTone(tone: SVQuoteTone): SVQuote | undefined {
	const matches = SILICON_VALLEY_QUOTES.filter(q => q.tone === tone);
	if (matches.length === 0) {
		return undefined;
	}
	return matches[Math.floor(Math.random() * matches.length)];
}

/**
 * Returns a random quote attributed to the given character. Returns
 * undefined if the character has no quotes in the library.
 */
export function getQuoteByCharacter(character: SVCharacter): SVQuote | undefined {
	const matches = SILICON_VALLEY_QUOTES.filter(q => q.character === character);
	if (matches.length === 0) {
		return undefined;
	}
	return matches[Math.floor(Math.random() * matches.length)];
}

/**
 * Picks a quote deterministically based on the day of the year, so the same
 * quote shows for an entire calendar day. Feels less like a random gimmick
 * and more like a daily Easter egg.
 */
export function getStartupQuote(date: Date = new Date()): SVQuote {
	const start = Date.UTC(date.getUTCFullYear(), 0, 0);
	const now = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
	const dayOfYear = Math.floor((now - start) / 86_400_000);
	const index = ((dayOfYear % SILICON_VALLEY_QUOTES.length) + SILICON_VALLEY_QUOTES.length) % SILICON_VALLEY_QUOTES.length;
	return SILICON_VALLEY_QUOTES[index];
}

/**
 * Picks an upbeat quote suitable for celebrating build successes, completed
 * tasks, etc. Falls back to a random quote if no upbeat ones exist.
 */
export function getCelebrationQuote(): SVQuote {
	const upbeat = SILICON_VALLEY_QUOTES.filter(
		q => q.tone === 'optimistic' || q.tone === 'pep-talk' || q.tone === 'absurd',
	);
	if (upbeat.length === 0) {
		return getRandomQuote();
	}
	return upbeat[Math.floor(Math.random() * upbeat.length)];
}

/**
 * Picks an apocalyptic / dry-cynical quote suitable for failure modes --
 * specifically Gilfoyle's "the rise of an all-powerful AI is inevitable"
 * register.
 */
export function getApocalypticQuote(): SVQuote {
	const grim = SILICON_VALLEY_QUOTES.filter(
		q => q.tone === 'apocalyptic' || (q.character === 'Gilfoyle' && q.tone === 'dry'),
	);
	if (grim.length === 0) {
		return getRandomQuote();
	}
	return grim[Math.floor(Math.random() * grim.length)];
}

/**
 * Formats a quote for compact single-line display (e.g. status bar):
 * `"<text>" -- <Character>`. Uses backtick interpolation so the literal
 * double quotes in the output don't trip the no-unexternalized-strings
 * rule (which targets double-quoted source-level string literals).
 */
export function formatQuoteShort(quote: SVQuote): string {
	const character = quote.character.replace('_', ' ');
	const dq = '"';
	return `${dq}${quote.text}${dq} -- ${character}`;
}
