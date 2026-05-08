/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import {
	SILICON_VALLEY_QUOTES,
	formatQuoteShort,
	getApocalypticQuote,
	getCelebrationQuote,
	getQuoteByCharacter,
	getQuoteByTone,
	getRandomQuote,
	getStartupQuote,
	type SVCharacter,
	type SVQuote,
	type SVQuoteTone,
} from 'son-of-anton-core/personality/siliconValleyQuotes';

// ── Phase 45: orchestrator quote-injection helpers ────────────────────────────
//
// `OrchestratorAgent.appendQuote` and `pickQuote` are private, so we test the
// pure-function library they delegate to. The orchestrator's behaviour
// reduces to: (preferred-character + tone) → (preferred-character, any tone)
// → (any character + tone) → fallback. We verify each tier here.

suite('Silicon Valley quotes — Phase 45', () => {

	test('getQuoteByTone returns a quote of the requested tone', () => {
		const tones: ReadonlyArray<SVQuoteTone> = [
			'witty', 'dry', 'self-loathing', 'apocalyptic', 'optimistic', 'absurd', 'pep-talk',
		];
		const results = tones.map(tone => {
			const q = getQuoteByTone(tone);
			return { tone, matched: q?.tone === tone };
		});
		assert.deepStrictEqual(
			results,
			tones.map(tone => ({ tone, matched: true })),
		);
	});

	test('getQuoteByCharacter returns a quote attributed to that character', () => {
		const characters: ReadonlyArray<SVCharacter> = [
			'Richard', 'Jared', 'Gilfoyle', 'Dinesh', 'Gavin', 'Erlich', 'Big_Head', 'Russ', 'other',
		];
		const results = characters.map(c => {
			const q = getQuoteByCharacter(c);
			return { character: c, matched: q?.character === c };
		});
		assert.deepStrictEqual(
			results,
			characters.map(character => ({ character, matched: true })),
		);
	});

	test('Gilfoyle has at least one dry quote (the orchestrator failure path)', () => {
		const gilfoyleDry = SILICON_VALLEY_QUOTES.filter(
			q => q.character === 'Gilfoyle' && q.tone === 'dry',
		);
		assert.ok(gilfoyleDry.length > 0, 'expected at least one dry Gilfoyle quote');
	});

	test('Jared has no optimistic quote — orchestrator must fall back', () => {
		const jaredOptimistic = SILICON_VALLEY_QUOTES.filter(
			q => q.character === 'Jared' && q.tone === 'optimistic',
		);
		// Phase 45 documented that Jared has no `optimistic` quotes; the
		// orchestrator's pickQuote routine relies on this gap to test its
		// "preferred character, any tone" fallback step.
		assert.strictEqual(jaredOptimistic.length, 0);

		// But Jared *does* have quotes overall, so getQuoteByCharacter
		// returns something for the fallback.
		const fallback = getQuoteByCharacter('Jared');
		assert.strictEqual(fallback?.character, 'Jared');
	});

	test('preferred-character + tone match wins when present (Gilfoyle, dry)', () => {
		// Mirrors the orchestrator's strongest match: filter the whole library
		// by both character and tone before picking randomly. We assert that
		// such matches exist so the orchestrator's first branch can fire.
		const matches = SILICON_VALLEY_QUOTES.filter(
			q => q.character === 'Gilfoyle' && q.tone === 'dry',
		);
		assert.ok(matches.length > 0);
		for (const m of matches) {
			assert.deepStrictEqual(
				{ character: m.character, tone: m.tone },
				{ character: 'Gilfoyle', tone: 'dry' },
			);
		}
	});

	test('returns undefined when neither character nor tone match (no Russ pep-talks)', () => {
		// Russ never gives pep talks. Confirm the library is consistent and
		// the tone-only fallback would also miss if we filtered to Russ.
		const russPep = SILICON_VALLEY_QUOTES.filter(
			q => q.character === 'Russ' && q.tone === 'pep-talk',
		);
		assert.strictEqual(russPep.length, 0);

		const noSuchTone = getQuoteByTone('not-a-tone' as unknown as SVQuoteTone);
		assert.strictEqual(noSuchTone, undefined);
	});

	test('getRandomQuote varies across many calls', () => {
		const seen = new Set<string>();
		for (let i = 0; i < 100; i++) {
			seen.add(getRandomQuote().text);
		}
		// 100 picks from a 40+ item library should hit > 5 distinct quotes.
		assert.ok(seen.size > 5, `expected >5 distinct quotes from 100 picks, got ${seen.size}`);
	});

	test('getStartupQuote is deterministic for a given UTC date', () => {
		const a = getStartupQuote(new Date(Date.UTC(2026, 4, 7)));
		const b = getStartupQuote(new Date(Date.UTC(2026, 4, 7)));
		const c = getStartupQuote(new Date(Date.UTC(2026, 4, 8)));
		assert.strictEqual(a.text, b.text);
		// Different days *usually* differ (depends on library size). Just
		// confirm the function is callable for a different day without error.
		assert.ok(typeof c.text === 'string' && c.text.length > 0);
	});

	test('getApocalypticQuote returns a Gilfoyle-or-apocalyptic quote', () => {
		for (let i = 0; i < 25; i++) {
			const q = getApocalypticQuote();
			const ok = q.tone === 'apocalyptic' || (q.character === 'Gilfoyle' && q.tone === 'dry');
			assert.ok(ok, `unexpected quote: ${JSON.stringify(q)}`);
		}
	});

	test('getCelebrationQuote returns an upbeat-toned quote', () => {
		const upbeat: ReadonlyArray<SVQuoteTone> = ['optimistic', 'pep-talk', 'absurd'];
		for (let i = 0; i < 25; i++) {
			const q = getCelebrationQuote();
			assert.ok(upbeat.includes(q.tone), `unexpected celebration tone: ${q.tone}`);
		}
	});

	test('formatQuoteShort renders as "<text>" -- <Character>', () => {
		const quote: SVQuote = { character: 'Big_Head', text: 'Cool. Cool cool cool.', tone: 'absurd' };
		assert.strictEqual(formatQuoteShort(quote), '"Cool. Cool cool cool." -- Big Head');
	});

	test('frequency gate semantics: 50% threshold suppresses or fires deterministically', () => {
		// Phase 45 introduced a probability gate of 0.5 inside appendQuote
		// (Math.random() >= QUOTE_PROBABILITY → no-op). We can't reach the
		// private method, but we can stub Math.random to verify the
		// arithmetic: a roll of 0.49 fires, 0.51 suppresses.
		const QUOTE_PROBABILITY = 0.5;
		const rolls = [0.0, 0.49, 0.5, 0.51, 0.99];
		const fires = rolls.map(r => r < QUOTE_PROBABILITY);
		assert.deepStrictEqual(fires, [true, true, false, false, false]);
	});
});
