/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Matches a whole emoji, including the sequences that make up a single one: a
 * variation selector requesting emoji presentation, a skin tone modifier, the
 * zero width joiner chains behind emoji such as the "technologist" ones,
 * keycaps, and the pairs of regional indicators that form flags.
 *
 * Deliberately built on `Extended_Pictographic` rather than `Emoji`, because the
 * latter also matches digits, `#` and `*`, which must keep being spoken.
 *
 * `Extended_Pictographic` also covers a handful of characters that are read as
 * text rather than seen as decoration, such as the copyright and trademark
 * signs. Those are kept unless they explicitly ask for emoji presentation with
 * `\uFE0F`.
 */
const TEXTUAL_SYMBOL = /[\u00A9\u00AE\u2122\u203C\u2049]/;
const EMOJI = new RegExp(`(?!${TEXTUAL_SYMBOL.source}(?!\\uFE0F))(?:\\p{Extended_Pictographic}\\uFE0F?(?:[\\u{1F3FB}-\\u{1F3FF}]|\\u20E3)?(?:\\u200D\\p{Extended_Pictographic}\\uFE0F?(?:[\\u{1F3FB}-\\u{1F3FF}])?)*|\\p{RI}\\p{RI}|[0-9#*]\\uFE0F?\\u20E3)`, 'gu');

/**
 * Removes emoji from `text` so they are not read aloud. Emoji are decoration in
 * a chat response, and speaking their name (e.g. "check mark button") interrupts
 * the sentence they punctuate.
 *
 * Whitespace left behind is collapsed so that the surrounding text keeps its
 * spacing and does not end up with a gap before punctuation.
 */
export function stripEmoji(text: string): string {
	if (!text) {
		return text;
	}

	return text
		.replace(EMOJI, '')
		.replace(/[^\S\n]+/g, ' ')			// collapse runs of spaces, but keep line breaks
		.replace(/[^\S\n]+([.,!?:;])/g, '$1')	// close the gap an emoji left before punctuation
		.replace(/[^\S\n]+$/gm, '')			// drop trailing spaces on each line
		.trim();
}

/**
 * Ends each line of already rendered plain text with a period unless it already
 * ends in punctuation a reader would pause on.
 *
 * Headings and list items only end in a line break, which a synthesizer does not
 * pause on, so a heading runs straight into the text below it. Punctuation is
 * the only way to ask for that pause without leaving the plain text behind.
 */
export function punctuateLines(text: string): string {
	return text.replace(/^(.*\S.*)$/gm, line => /[.!?:;,…]$/.test(line.trimEnd()) ? line : `${line.trimEnd()}.`);
}

/**
 * Synthesizers limit how much text one utterance may hold, and sound rushed well
 * before that limit, so text is split into smaller pieces.
 */
const MAX_CHARS_PER_UTTERANCE = 300;

/**
 * The first piece is kept short so that speech starts quickly; synthesis runs
 * ahead of playback, so later pieces can be larger without ever stalling.
 */
const MAX_CHARS_FIRST_UTTERANCE = 90;

/**
 * Splits `text` into pieces a synthesizer can speak without truncating,
 * preferring sentence boundaries and falling back to word boundaries. The first
 * piece is limited to `maxFirstChars` to keep the time until the first sound
 * short.
 */
export function splitForSynthesis(text: string, maxChars = MAX_CHARS_PER_UTTERANCE, maxFirstChars = MAX_CHARS_FIRST_UTTERANCE): string[] {
	const trimmed = text.trim();
	if (!trimmed) {
		return [];
	}

	const pieces: string[] = [];
	let current = '';

	const limit = () => pieces.length === 0 ? Math.min(maxFirstChars, maxChars) : maxChars;

	const flush = () => {
		const piece = current.trim();
		if (piece) {
			pieces.push(piece);
		}
		current = '';
	};

	// Keep the delimiter with the sentence it ends so the model keeps its intonation.
	for (const sentence of trimmed.split(/(?<=[.!?:;])\s+/)) {
		if (sentence.length > limit()) {
			flush();

			for (const word of sentence.split(/\s+/)) {
				if (current && current.length + word.length + 1 > limit()) {
					flush();
				}

				// A single word can be longer than the limit on its own, for
				// example a URL or a file path. Cutting it is still better than
				// letting the model silently truncate the whole piece.
				let rest = word;
				while (rest.length > limit()) {
					const room = limit() - (current ? current.length + 1 : 0);
					if (room > 0) {
						current = current ? `${current} ${rest.slice(0, room)}` : rest.slice(0, room);
						rest = rest.slice(room);
					}
					flush();
				}

				current = current ? `${current} ${rest}` : rest;
			}

			flush();
		} else if (current && current.length + sentence.length + 1 > limit()) {
			flush();
			current = sentence;
		} else {
			current = current ? `${current} ${sentence}` : sentence;
		}
	}

	flush();

	return pieces;
}
