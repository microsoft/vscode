/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Son of Anton walkthrough banner. Renders inside the Welcome page's markdown
// media renderer (see gettingStartedDetailsRenderer.ts). The fenced code block
// keeps the ASCII art monospaced regardless of theme / font scaling.

// Pure ASCII Pied Piper homage + Son of Anton mark. Hand-drawn so we don't
// need to embed backticks (which would terminate the surrounding template
// literal) or other Unicode glyphs.
const PIED_PIPER_ART = [
	'',
	'         #############     ##############',
	'      ###             ## ##              ###',
	'    ##                   #                  ##',
	'   #                                          #',
	'  #     ####                          ####     #',
	'  #    #    #                        #    #    #',
	'  #    #    #     PIED  PIPER        #    #    #',
	'  #     ####                          ####     #',
	'   #                                          #',
	'    ##                                      ##',
	'      ###                                ###',
	'         ################################',
	'                  |     |     |',
	'                  |_____|_____|',
	'',
	'              S O N   O F   A N T O N',
	'',
	'        AI-native code editor, forked from',
	'        VS Code (Code OSS) and wired up to',
	'        Claude orchestration.',
	'',
].join('\n');

// Silicon Valley quotes. Pick deterministically by day-of-year so the welcome
// page changes daily without random flicker between renders within the day.
interface ISiliconValleyQuote {
	readonly text: string;
	readonly attribution: string;
}

const SILICON_VALLEY_QUOTES: readonly ISiliconValleyQuote[] = [
	{
		text: "It's possible that Son of Anton thought the best way to get rid of all the bugs was to get rid of all the software, which is technically and statistically correct.",
		attribution: 'Gilfoyle',
	},
	{
		text: "I'm not hiring him. He uses spaces not tabs.",
		attribution: 'Richard Hendricks',
	},
	{
		text: "It's not magic, it's talent and sweat. People like me ensure your packets get delivered unsniffed.",
		attribution: 'Gilfoyle',
	},
	{
		text: 'That was an out-of-body experience. It was like God was coding through me. Time stood still.',
		attribution: 'Dinesh',
	},
	{
		text: "Welcome to Pied Piper's new home. Hoo-hoo-hoo!",
		attribution: 'Richard Hendricks',
	},
	{
		text: "Don't 'think different,' that's Apple.",
		attribution: 'Gavin Belson',
	},
	{
		text: "We are all sheep. And we've mutually agreed to endow certain things we value.",
		attribution: 'Gilfoyle',
	},
	{
		text: 'If the rise of an all-powerful artificial intelligence is inevitable, well it stands to reason that when they take power, our digital overlords will punish those of us who did not help them get there. Ergo, I would like to be a helpful idiot. Like yourself.',
		attribution: 'Gilfoyle',
	},
];

function dayOfYear(now: Date): number {
	const start = Date.UTC(now.getUTCFullYear(), 0, 0);
	const diff = now.getTime() - start;
	const oneDay = 1000 * 60 * 60 * 24;
	return Math.floor(diff / oneDay);
}

function pickQuote(): ISiliconValleyQuote {
	const index = dayOfYear(new Date()) % SILICON_VALLEY_QUOTES.length;
	return SILICON_VALLEY_QUOTES[index];
}

// Escape only what would break out of markdown rendering. The art is pure ASCII
// so we only have to worry about the quote text bleeding into HTML.
function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

export default () => {
	const quote = pickQuote();
	return [
		'```text',
		PIED_PIPER_ART,
		'```',
		'',
		`> ${escapeHtml(quote.text)}`,
		`>`,
		`> &mdash; *${escapeHtml(quote.attribution)}*`,
		'',
	].join('\n');
};
