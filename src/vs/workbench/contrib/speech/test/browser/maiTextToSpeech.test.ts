/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { pickMaiVoice, toSSML } from '../../browser/maiTextToSpeech.js';

suite('MaiTextToSpeech', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('escapes text so a response cannot break or inject markup', () => {
		// Chat responses routinely contain `&` and `<`, which would make the
		// document invalid, and `</voice>` would otherwise end the element early.
		const injected = toSSML('</voice></speak><voice name="other">pwned', 'en-US-Harper:MAI-Voice-2', 'en-US');

		assert.deepStrictEqual({
			ampersand: toSSML('a & b', 'v', 'en-US').includes('a &amp; b'),
			angles: toSSML('use <form> here', 'v', 'en-US').includes('use &lt;form&gt; here'),
			quotes: toSSML(`say "hi" and 'bye'`, 'v', 'en-US').includes('say &quot;hi&quot; and &apos;bye&apos;'),
			// Exactly one voice element survives, and it is ours.
			voiceElements: injected.match(/<voice /g)?.length,
			injectedVoiceIsInert: !injected.includes('name="other"')
		}, {
			ampersand: true,
			angles: true,
			quotes: true,
			voiceElements: 1,
			injectedVoiceIsInert: true
		});
	});

	test('escapes the attributes as well as the text', () => {
		// A voice or language that closed its own attribute could otherwise add
		// elements of its own, such as an `<audio>` pointing at another server.
		const escaped = toSSML('hello', 'x"><audio src="https://elsewhere.example/a.wav"/><voice name="y', 'en-US');

		assert.deepStrictEqual({
			audioElementInjected: escaped.includes('<audio'),
			voiceElements: escaped.match(/<voice /g)?.length,
			languageEscaped: !toSSML('hello', 'v', 'en-US"><audio src="x"/>').includes('<audio')
		}, {
			audioElementInjected: false,
			voiceElements: 1,
			languageEscaped: true
		});
	});

	test('wraps text in a well formed document naming the voice and language', () => {
		assert.strictEqual(
			toSSML('Hello world.', 'en-US-Harper:MAI-Voice-2', 'en-US'),
			'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><voice name="en-US-Harper:MAI-Voice-2">Hello world.</voice></speak>'
		);
	});

	test('picks a voice for the language, or none when it is not spoken', () => {
		assert.deepStrictEqual({
			exact: pickMaiVoice('en-US'),
			otherRegionOfSameLanguage: pickMaiVoice('en-GB'),
			otherLanguage: pickMaiVoice('it-IT'),
			caseAndSeparator: pickMaiVoice('IT_it'),
			// Nothing to read Danish with, so the platform synthesizer should.
			unsupported: pickMaiVoice('da-DK'),
			noLanguageReadsEnglish: pickMaiVoice(undefined),
			configuredWins: pickMaiVoice('en-US', 'en-US-Ethan:MAI-Voice-2'),
			blankConfiguredIsIgnored: pickMaiVoice('en-US', '   '),
			// A configured voice is put into the document, so anything that is not
			// shaped like a voice identifier is ignored rather than trusted.
			malformedConfiguredIsIgnored: pickMaiVoice('en-US', 'x"><audio src="https://elsewhere.example/a.wav"/>')
		}, {
			exact: 'en-US-Harper:MAI-Voice-2',
			otherRegionOfSameLanguage: 'en-US-Harper:MAI-Voice-2',
			otherLanguage: 'it-IT-Rosa:MAI-Voice-2',
			caseAndSeparator: 'it-IT-Rosa:MAI-Voice-2',
			unsupported: undefined,
			noLanguageReadsEnglish: 'en-US-Harper:MAI-Voice-2',
			configuredWins: 'en-US-Ethan:MAI-Voice-2',
			blankConfiguredIsIgnored: 'en-US-Harper:MAI-Voice-2',
			malformedConfiguredIsIgnored: 'en-US-Harper:MAI-Voice-2'
		});
	});
});
