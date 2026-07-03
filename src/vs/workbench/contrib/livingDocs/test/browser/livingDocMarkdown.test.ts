/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { extractBindLinks, findQuoteLine, parseChatResponse, parseLivingDoc, parseMultiChatResponse, reconcileBindLinks, serializeLivingDoc, withFrontmatterList, withFrontmatterSource, withReplacedBody } from '../../common/livingDocMarkdown.js';

// A clean-file Living Document: pure Markdown + frontmatter dependency lists + inline bind links.
const WEEKLY_MD = [
	'---',
	'title: Weekly Operating Summary',
	'subtitle: Week 24',
	'sources:',
	'  - metrics.csv',
	'context:',
	'  - market-research.md',
	'---',
	'',
	'## Highlights',
	'',
	'Revenue grew [18%](bind:metrics.mrr.delta) week-on-week to [$48.6k](bind:metrics.mrr) MRR, on [427](bind:metrics.signups) new signups.',
	'',
	'## Commentary',
	'',
	'Growth accelerated sharply this week.',
].join('\n') + '\n';

const PLAIN_MD = [
	'# Project Readme',
	'',
	'Some **bold** intro prose with a [link](https://example.com).',
	'',
	'- first item',
	'- second item',
].join('\n') + '\n';

suite('LivingDoc bind-link format', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('parses frontmatter dependency lists and inline bind links', () => {
		const doc = parseLivingDoc(WEEKLY_MD);
		assert.deepStrictEqual(
			{
				title: doc.title,
				subtitle: doc.subtitle,
				sources: doc.sources,
				context: doc.context,
				isLiving: doc.isLiving,
				headings: doc.blocks.filter(b => b.type === 'heading').map(b => b.text),
				binds: doc.blocks.flatMap(b => b.binds),
			},
			{
				title: 'Weekly Operating Summary',
				subtitle: 'Week 24',
				sources: ['metrics.csv'],
				context: ['market-research.md'],
				isLiving: true,
				headings: ['Highlights', 'Commentary'],
				binds: [
					{ value: '18%', key: 'metrics.mrr.delta' },
					{ value: '$48.6k', key: 'metrics.mrr' },
					{ value: '427', key: 'metrics.signups' },
				],
			},
		);
	});

	test('a clean .md with bind links round-trips through parse -> serialize unchanged', () => {
		assert.strictEqual(serializeLivingDoc(parseLivingDoc(WEEKLY_MD)), WEEKLY_MD);
	});

	test('reconcileBindLinks rewrites visible cache to the resolved value (lock wins), keeping the key', () => {
		const line = 'MRR is [$41.2k](bind:metrics.mrr) today.';
		const resolved = new Map([['metrics.mrr', '$48.6k']]);
		assert.strictEqual(reconcileBindLinks(line, resolved), 'MRR is [$48.6k](bind:metrics.mrr) today.');
	});

	test('extractBindLinks ignores ordinary Markdown links', () => {
		assert.deepStrictEqual(extractBindLinks('see [the docs](https://example.com) and [427](bind:metrics.signups)'), [
			{ value: '427', key: 'metrics.signups' },
		]);
	});

	// The migrated KPI table (spec 4): a clean Markdown table whose cells are bind links.
	const MIGRATED_TABLE_MD = [
		'---',
		'title: Board Note',
		'sources:',
		'  - metrics.csv',
		'---',
		'',
		'## Numbers',
		'',
		'| Metric | Previous | Current | Change |',
		'| --- | --- | --- | --- |',
		'| MRR | [$41.2k](bind:metrics.mrr.prev) | [$48.6k](bind:metrics.mrr) | [+18%](bind:metrics.mrr.delta) |',
		'| New signups | [312](bind:metrics.signups.prev) | [427](bind:metrics.signups) | [+37%](bind:metrics.signups.delta) |',
	].join('\n') + '\n';

	// The OLD format we replaced: bindings smuggled into HTML comments, a `{cell}`-free figure.
	const OLD_LIVING_MD = [
		'---',
		'livingDoc: true',
		'title: Weekly',
		'source: metrics.csv',
		'syncedWeek: 23',
		'---',
		'',
		'## Highlights',
		'',
		'<!-- bind id=p-highlights kind=figure cells=mrr -->',
		'Revenue grew 12% to $41.2k MRR.',
	].join('\n') + '\n';

	test('migrated sample: a clean table of bind links parses, exposes its keys, and round-trips', () => {
		const doc = parseLivingDoc(MIGRATED_TABLE_MD);
		const table = doc.blocks.find(b => b.type === 'table')!;
		assert.deepStrictEqual(
			{ keys: table.binds.map(b => b.key), roundTrips: serializeLivingDoc(doc) === MIGRATED_TABLE_MD },
			{ keys: ['metrics.mrr.prev', 'metrics.mrr', 'metrics.mrr.delta', 'metrics.signups.prev', 'metrics.signups', 'metrics.signups.delta'], roundTrips: true },
		);
	});

	test('the old HTML-comment binding scheme is no longer a Living Document signal', () => {
		const doc = parseLivingDoc(OLD_LIVING_MD);
		// No frontmatter sources/context and no inline bind links -> the old comment scheme is inert.
		assert.deepStrictEqual({ isLiving: doc.isLiving, binds: doc.blocks.flatMap(b => b.binds).length }, { isLiving: false, binds: 0 });
	});

	test('plain Markdown is not a Living Document and takes its title from the first H1', () => {
		const doc = parseLivingDoc(PLAIN_MD);
		assert.strictEqual(doc.isLiving, false);
		assert.strictEqual(doc.title, 'Project Readme');
		assert.ok(doc.body.includes('- first item'), 'body retains the raw Markdown for generic rendering');
	});

	// plan 16 iter 4: a plain doc must round-trip to BYTE-CLEAN plain Markdown. The display title derives
	// from the H1 (above), but that derived title must NOT be written back as `---\ntitle: ...\n---` -- a
	// file the user wrote as plain Markdown stays plain Markdown after an accepted chat edit re-serializes it.
	test('a plain doc round-trips through parse -> serialize as byte-clean plain Markdown (no injected frontmatter)', () => {
		assert.strictEqual(serializeLivingDoc(parseLivingDoc(PLAIN_MD)), PLAIN_MD);
	});

	test('serializing a plain doc after an inserted block stays plain Markdown -- no injected title frontmatter', () => {
		// Mirrors accepting a chat insert on a plain doc: the body gains a paragraph, then _persist re-serializes.
		const withInsert = PLAIN_MD + '\nA freshly inserted paragraph from chat.\n';
		const serialized = serializeLivingDoc(parseLivingDoc(withInsert));
		assert.deepStrictEqual(
			{
				startsWithFrontmatter: serialized.startsWith('---'),
				injectsTitle: serialized.includes('title:'),
				keepsInsert: serialized.includes('A freshly inserted paragraph from chat.'),
				stillPlain: parseLivingDoc(serialized).isLiving,
			},
			{ startsWithFrontmatter: false, injectsTitle: false, keepsInsert: true, stillPlain: false },
		);
	});

	// A plain doc that DID author a `title:` (but no sources/context) keeps it -- we drop only the DERIVED
	// title, never frontmatter the user actually wrote.
	test('a plain doc with an authored title (no sources) keeps that title on round-trip', () => {
		const TITLED_PLAIN = ['---', 'title: My Notes', '---', '', 'Just some prose.'].join('\n') + '\n';
		assert.strictEqual(serializeLivingDoc(parseLivingDoc(TITLED_PLAIN)), TITLED_PLAIN);
	});

	// withFrontmatterSource edits only the frontmatter `sources:` list, leaving the body verbatim - so adding
	// a source via the UI never touches the prose (the add-source affordance, R5).
	test('withFrontmatterSource adds a source to an existing sources list and the body is untouched', () => {
		const next = withFrontmatterSource(WEEKLY_MD, 'crm.json', true);
		const doc = parseLivingDoc(next);
		assert.deepStrictEqual(doc.sources, ['metrics.csv', 'crm.json'], 'appended to the sources list');
		assert.ok(next.includes('Revenue grew [18%](bind:metrics.mrr.delta)'), 'prose is byte-identical');
		assert.strictEqual(doc.context.length, 1, 'context list untouched');
	});

	test('withFrontmatterSource is idempotent on add and a no-op removing a source that is not bound', () => {
		assert.strictEqual(withFrontmatterSource(WEEKLY_MD, 'metrics.csv', true), WEEKLY_MD, 'adding an existing source is a no-op');
		assert.strictEqual(withFrontmatterSource(WEEKLY_MD, 'absent.csv', false), WEEKLY_MD, 'removing an absent source is a no-op');
	});

	test('withFrontmatterSource removes a source, dropping the empty sources key but keeping context', () => {
		const next = withFrontmatterSource(WEEKLY_MD, 'metrics.csv', false);
		const doc = parseLivingDoc(next);
		assert.deepStrictEqual({ sources: doc.sources, context: doc.context }, { sources: [], context: ['market-research.md'] }, 'source removed, context kept');
		assert.ok(!next.includes('sources:'), 'the now-empty sources key is dropped');
	});

	// The same frontmatter editor drives the `context:` list (referenced files, R6) - add/remove a real file
	// reference without touching prose or the sources list.
	test('withFrontmatterList edits the context list for referenced files, leaving sources and prose intact', () => {
		const added = withFrontmatterList(WEEKLY_MD, 'context', 'appendix.md', true);
		assert.deepStrictEqual(parseLivingDoc(added).context, ['market-research.md', 'appendix.md'], 'reference appended to the context list');
		assert.deepStrictEqual(parseLivingDoc(added).sources, ['metrics.csv'], 'sources untouched');
		assert.ok(added.includes('Growth accelerated sharply this week.'), 'prose untouched');

		const removed = withFrontmatterList(WEEKLY_MD, 'context', 'market-research.md', false);
		assert.deepStrictEqual({ context: parseLivingDoc(removed).context, sources: parseLivingDoc(removed).sources }, { context: [], sources: ['metrics.csv'] }, 'context reference removed, sources kept');
	});

	test('withFrontmatterSource creates a frontmatter block when a plain doc gains its first source', () => {
		const next = withFrontmatterSource(PLAIN_MD, 'metrics.csv', true);
		const doc = parseLivingDoc(next);
		assert.deepStrictEqual(doc.sources, ['metrics.csv'], 'first source recorded');
		assert.strictEqual(doc.isLiving, true, 'the doc is now living');
		assert.ok(doc.body.includes('- first item'), 'original body preserved');
		assert.ok(doc.title === 'Project Readme', 'title still derives from the H1');
	});

	test('withReplacedBody swaps the body but keeps the frontmatter (so a PM edit of a living doc keeps its sources)', () => {
		// Simulates the ProseMirror round-trip: the editor hands back only the body (bind links intact).
		const editedBody = 'Revenue grew [12%](bind:metrics.mrr.delta) week-on-week to [$48.6k](bind:metrics.mrr) MRR, on [427](bind:metrics.signups) new signups, and the team shipped on time.';
		const next = withReplacedBody(WEEKLY_MD, editedBody);
		const doc = parseLivingDoc(next);
		assert.deepStrictEqual({
			sources: doc.sources,
			context: doc.context,
			isLiving: doc.isLiving,
			keepsEdit: doc.body.includes('shipped on time'),
			keepsBind: doc.body.includes('[12%](bind:metrics.mrr.delta)'),
		}, { sources: ['metrics.csv'], context: ['market-research.md'], isLiving: true, keepsEdit: true, keepsBind: true });
	});

	test('withReplacedBody on a plain doc (no frontmatter) just returns the new body', () => {
		assert.strictEqual(withReplacedBody('# Title\n\nold body\n', 'new body').trim(), 'new body');
	});

	// plan 16 iter 5: the chat-response parser must be tolerant -- a non-JSON / truncated / prose-wrapped
	// reply degrades to a plain answer instead of throwing (which used to surface as "the agent model errored").
	test('parseChatResponse extracts a clean JSON object with reply + edits + inserts', () => {
		const raw = '{"reply":"Done.","edits":[{"oldText":"a","newText":"b"}],"inserts":[{"afterHeading":"","newText":"- x"}]}';
		assert.deepStrictEqual(parseChatResponse(raw), {
			reply: 'Done.',
			edits: [{ oldText: 'a', newText: 'b' }],
			inserts: [{ afterHeading: '', newText: '- x' }],
		});
	});

	test('parseChatResponse extracts the JSON object even when the model wraps it in prose', () => {
		const raw = 'Sure, here is the change:\n{"reply":"Updated the intro.","edits":[],"inserts":[]}\nHope that helps!';
		assert.deepStrictEqual(parseChatResponse(raw), { reply: 'Updated the intro.', edits: [], inserts: [] });
	});

	test('parseChatResponse degrades a plain-text (non-JSON) reply to a plain answer with no proposals', () => {
		const raw = 'The document already covers that, so no change is needed.';
		assert.deepStrictEqual(parseChatResponse(raw), { reply: raw, edits: [], inserts: [] });
	});

	test('parseChatResponse degrades malformed / truncated JSON to a plain answer instead of throwing', () => {
		const raw = '{"reply":"half a sentence and then the stream cut o';
		assert.deepStrictEqual(parseChatResponse(raw), { reply: raw, edits: [], inserts: [] });
	});

	test('parseChatResponse extracts the object even when the model appends a stray trailing brace', () => {
		// Observed live: the cheap model emits a valid object followed by an extra "}". The old
		// indexOf('{')..lastIndexOf('}') slice swallowed the stray brace, threw, and leaked the raw JSON
		// into the chat. The balanced-brace scan stops at the first complete object.
		const raw = '{"reply":"","edits":[{"oldText":"blue","newText":"red"}],"inserts":[]}}';
		assert.deepStrictEqual(parseChatResponse(raw), {
			reply: '',
			edits: [{ oldText: 'blue', newText: 'red' }],
			inserts: [],
		});
	});

	test('parseChatResponse keeps braces that appear inside string values', () => {
		const raw = '{"reply":"use {tokens} like this","edits":[],"inserts":[]} trailing prose';
		assert.deepStrictEqual(parseChatResponse(raw), { reply: 'use {tokens} like this', edits: [], inserts: [] });
	});

	test('parseChatResponse drops a stray trailing close bracket the model appends to an array', () => {
		// Observed live (gpt-4o-mini): a complete object whose final array carries an extra "]" -
		// {..."inserts":[]]}. The brace scan must drop the stray closer rather than fail and leak the JSON.
		const raw = '{"reply":"","edits":[{"oldText":"blue","newText":"red"}],"inserts":[]]}';
		assert.deepStrictEqual(parseChatResponse(raw), {
			reply: '',
			edits: [{ oldText: 'blue', newText: 'red' }],
			inserts: [],
		});
	});

	test('parseChatResponse keeps a real nested array intact', () => {
		const raw = '{"reply":"ok","edits":[{"oldText":"a","newText":"b"}],"inserts":[]}';
		assert.deepStrictEqual(parseChatResponse(raw), {
			reply: 'ok',
			edits: [{ oldText: 'a', newText: 'b' }],
			inserts: [],
		});
	});

	// plan 18 (D-C): one model call returns a per-document edit map for the working set.
	test('parseMultiChatResponse extracts a reply plus per-document edits/inserts keyed by doc', () => {
		const raw = '{"reply":"Changed blue to red.","docs":[{"doc":"Project Brief","edits":[{"oldText":"blue","newText":"red"}]},{"doc":"Appendix","inserts":[{"afterHeading":"","newText":"Primary is red."}]}]}';
		assert.deepStrictEqual(parseMultiChatResponse(raw), {
			reply: 'Changed blue to red.',
			docs: [
				{ doc: 'Project Brief', edits: [{ oldText: 'blue', newText: 'red' }], inserts: [] },
				{ doc: 'Appendix', edits: [], inserts: [{ afterHeading: '', newText: 'Primary is red.' }] },
			],
		});
	});

	test('parseMultiChatResponse degrades a plain-text / malformed reply to a plain answer with no docs', () => {
		assert.deepStrictEqual(parseMultiChatResponse('I could not find blue anywhere.'), { reply: 'I could not find blue anywhere.', docs: [] });
		assert.deepStrictEqual(parseMultiChatResponse('{"reply":"cut o'), { reply: '{"reply":"cut o', docs: [] });
	});

	test('parseMultiChatResponse extracts the object even with a stray trailing brace', () => {
		const raw = '{"reply":"Done.","docs":[{"doc":"Brief","edits":[{"oldText":"a","newText":"b"}]}]}}';
		assert.deepStrictEqual(parseMultiChatResponse(raw), {
			reply: 'Done.',
			docs: [{ doc: 'Brief', edits: [{ oldText: 'a', newText: 'b' }], inserts: [] }],
		});
	});

	test('parseMultiChatResponse drops a stray trailing close bracket', () => {
		const raw = '{"reply":"Done.","docs":[{"doc":"Brief","edits":[{"oldText":"a","newText":"b"}]}]]}';
		assert.deepStrictEqual(parseMultiChatResponse(raw), {
			reply: 'Done.',
			docs: [{ doc: 'Brief', edits: [{ oldText: 'a', newText: 'b' }], inserts: [] }],
		});
	});

	test('parseMultiChatResponse reads a per-edit source grounding (sourceQuote + sourceLine) when present', () => {
		const raw = '{"reply":"Applied.","docs":[{"doc":"Access Control Policy","edits":[{"heading":"MFA","oldText":"old","newText":"new","rationale":"MFA now required","sourceQuote":"multi-factor authentication is now REQUIRED for all administrative access","sourceLine":2}]}]}';
		assert.deepStrictEqual(parseMultiChatResponse(raw), {
			reply: 'Applied.',
			docs: [{
				doc: 'Access Control Policy',
				edits: [{ heading: 'MFA', oldText: 'old', newText: 'new', rationale: 'MFA now required', sourceQuote: 'multi-factor authentication is now REQUIRED for all administrative access', sourceLine: 2 }],
				inserts: [],
			}],
		});
	});

	test('parseMultiChatResponse reads a source grounding on an insert too', () => {
		const raw = '{"reply":"Added.","docs":[{"doc":"Cryptography Policy","inserts":[{"afterHeading":"Standards","newText":"TLS 1.2+","sourceQuote":"data in transit must use TLS 1.2 or higher","sourceLine":19}]}]}';
		assert.deepStrictEqual(parseMultiChatResponse(raw), {
			reply: 'Added.',
			docs: [{
				doc: 'Cryptography Policy',
				edits: [],
				inserts: [{ afterHeading: 'Standards', newText: 'TLS 1.2+', sourceQuote: 'data in transit must use TLS 1.2 or higher', sourceLine: 19 }],
			}],
		});
	});

	test('parseMultiChatResponse degrades gracefully when the model omits the source grounding (no fabricated fields)', () => {
		const raw = '{"reply":"Applied.","docs":[{"doc":"Backup Policy","edits":[{"oldText":"a","newText":"b","rationale":"tidy"}]}]}';
		assert.deepStrictEqual(parseMultiChatResponse(raw), {
			reply: 'Applied.',
			docs: [{ doc: 'Backup Policy', edits: [{ oldText: 'a', newText: 'b', rationale: 'tidy' }], inserts: [] }],
		});
	});

	test('parseMultiChatResponse ignores a non-numeric sourceLine but keeps the quote', () => {
		const raw = '{"reply":"Applied.","docs":[{"doc":"Backup Policy","edits":[{"oldText":"a","newText":"b","sourceQuote":"a decision","sourceLine":"line two"}]}]}';
		assert.deepStrictEqual(parseMultiChatResponse(raw), {
			reply: 'Applied.',
			docs: [{ doc: 'Backup Policy', edits: [{ oldText: 'a', newText: 'b', sourceQuote: 'a decision' }], inserts: [] }],
		});
	});

	suite('findQuoteLine', () => {
		const transcript = [
			'Security Review - 3 March 2026',
			'2  Decision: multi-factor authentication is now REQUIRED for all administrative access,',
			'3          including cloud consoles, production servers, and the identity provider.',
			'19 Decision: data in transit must use TLS 1.2 or higher; TLS 1.0 and 1.1 are disallowed.',
		].join('\n');

		test('finds the true file line of a verbatim quote, ignoring the printed line-number token', () => {
			assert.strictEqual(findQuoteLine(transcript, 'data in transit must use TLS 1.2 or higher'), 4);
		});

		test('resolves a decision the source wrapped across two lines to its first line', () => {
			assert.strictEqual(findQuoteLine(transcript, 'multi-factor authentication is now REQUIRED for all administrative access, including cloud consoles'), 2);
		});

		test('returns undefined when the quote is not in the source (never guesses a line)', () => {
			assert.strictEqual(findQuoteLine(transcript, 'a decision that was never made'), undefined);
		});

		test('does not false-match a short source line inside a longer unrelated quote', () => {
			// A brief source line must not be claimed by a longer quote that merely contains its words -
			// that would assign a wrong-but-real line and break the decisions column's provenance.
			const short = ['1  MFA required.', '2  Logs are retained for six months.'].join('\n');
			assert.strictEqual(findQuoteLine(short, 'MFA required for all cloud systems and third-party integrations'), undefined);
		});
	});
});
