/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { MAX_SCANNED_DOCUMENT_LENGTH, scanMarkdownFeatures } from '../preview/markdownDocumentFeatures';
import { MarkdownEditorSessionTelemetry } from '../preview/markdownEditorTelemetry';
import type { TelemetryReporter } from '../telemetryReporter';

suite('Markdown editor telemetry', () => {
	function createSession(start: { scheme: string; textLength: number; mode: 'read' | 'edit' }) {
		const events: { name: string; properties?: Record<string, string>; measurements?: Record<string, number> }[] = [];
		const reporter: TelemetryReporter = {
			sendTelemetryEvent: (name, properties, measurements) => events.push({ name, properties, measurements }),
			dispose: () => { },
		};
		const clock = { now: 1000 };
		const session = new MarkdownEditorSessionTelemetry(reporter, { ...start, viewState: { visible: true, focused: true } }, () => clock.now);
		const sessionId = (): string | undefined => events[0]?.properties?.sessionId;
		return { session, events, clock, sessionId };
	}

	test('accounts mode switches, edits and visible/focused time', () => {
		const { session, events, clock, sessionId } = createSession({ scheme: 'file', textLength: 2500, mode: 'read' });
		clock.now += 100;
		session.setViewState({ visible: true, focused: false }); // focused 100
		clock.now += 50;
		session.setMode('read'); // no switch
		session.setMode('edit');
		clock.now += 200;
		session.recordEdit(); // first edit at 350
		session.recordEdit();
		session.setViewState({ visible: false, focused: false }); // visible 350
		clock.now += 1000;
		session.setViewState({ visible: true, focused: true });
		clock.now += 25; // visible 375, focused 125
		session.setMode('read');
		session.end('closed');
		session.end('shutdown');
		session.recordEdit();

		assert.deepStrictEqual(events, [
			{ name: 'markdownEditor.modeChanged', properties: { sessionId: sessionId(), to: 'edit' }, measurements: { msSinceOpen: 150 } },
			{ name: 'markdownEditor.modeChanged', properties: { sessionId: sessionId(), to: 'read' }, measurements: { msSinceOpen: 1375 } },
			{
				name: 'markdownEditor.session',
				properties: { sessionId: sessionId(), scheme: 'file', sizeBucket: '<10k', initialMode: 'read', finalMode: 'read', ended: 'closed' },
				measurements: { modeSwitches: 2, editCount: 2, firstEditMs: 350, visibleMs: 375, focusedMs: 125, lifetimeMs: 1375 },
			},
		]);
	});

	test('reports untitled documents without edits', () => {
		const { session, events, clock, sessionId } = createSession({ scheme: 'untitled', textLength: 0, mode: 'edit' });
		session.setUntitledDocumentId('untitled-1');
		clock.now += 10;
		session.end('shutdown');

		assert.deepStrictEqual(events, [{
			name: 'markdownEditor.session',
			properties: { sessionId: sessionId(), scheme: 'untitled', sizeBucket: '0', initialMode: 'edit', finalMode: 'edit', ended: 'shutdown', untitledDocumentId: 'untitled-1' },
			measurements: { modeSwitches: 0, editCount: 0, firstEditMs: -1, visibleMs: 10, focusedMs: 10, lifetimeMs: 10 },
		}]);
	});

	test('reports document features when they were scanned', () => {
		const { session, events } = createSession({ scheme: 'file', textLength: 100, mode: 'read' });
		session.setDocumentFeatures(scanMarkdownFeatures('# A\n\n```mermaid\ngraph TD\n```\n'));
		session.end('closed');

		assert.deepStrictEqual(events[0].properties, {
			sessionId: events[0].properties?.sessionId, scheme: 'file', sizeBucket: '<1k', initialMode: 'read', finalMode: 'read', ended: 'closed',
			hasMermaid: 'true', hasMath: 'false', hasHtmlBlock: 'false', hasFrontMatter: 'false', hasTable: 'false', hasFootnote: 'false', hasTaskList: 'false', headingCountBucket: '1-5',
		});
	});
});

suite('Markdown document features', () => {
	test('detects constructs outside fenced code', () => {
		const doc = [
			'---',
			'title: x',
			'---',
			'# Title',
			'## Section',
			'',
			'| a | b |',
			'| --- | :-: |',
			'| 1 | 2 |',
			'',
			'- [x] done',
			'- [ ] open',
			'',
			'Inline math $x^2$ and a footnote[^1].',
			'',
			'[^1]: The note.',
			'',
			'<details>',
			'<summary>More</summary>',
			'</details>',
			'',
			'```ts',
			'# not a heading',
			'<div>not html</div>',
			'```',
		].join('\n');
		assert.deepStrictEqual(scanMarkdownFeatures(doc), {
			hasMermaid: false, hasMath: true, hasHtmlBlock: true, hasFrontMatter: true, hasTable: true, hasFootnote: true, hasTaskList: true, headingCountBucket: '1-5',
		});
	});

	test('finds nothing in plain prose and ignores prices', () => {
		assert.deepStrictEqual(scanMarkdownFeatures('Just text.\nIt costs $5 and $ 10.\n\n---\n'), {
			hasMermaid: false, hasMath: false, hasHtmlBlock: false, hasFrontMatter: false, hasTable: false, hasFootnote: false, hasTaskList: false, headingCountBucket: '0',
		});
	});

	test('counts Setext headings only below paragraph text', () => {
		assert.strictEqual(scanMarkdownFeatures('Title\n=====\n\nSection\n-------\n').headingCountBucket, '1-5');
		assert.strictEqual(scanMarkdownFeatures('---\ntitle: x\n---\n\n- item\n---\n\n> quote\n---\n').headingCountBucket, '0');
	});

	test('closes a code fence only on a line with just the fence', () => {
		const features = scanMarkdownFeatures('```js\n```!\n| a | b |\n| --- | --- |\n```\n# Heading\n');
		assert.strictEqual(features.hasTable, false);
		assert.strictEqual(features.headingCountBucket, '1-5');
	});

	test('scans a long almost-table line quickly', () => {
		const start = performance.now();
		assert.strictEqual(scanMarkdownFeatures('| --- | ---' + ' '.repeat(90_000) + 'x').hasTable, false);
		assert.ok(performance.now() - start < 50);
	});

	test('scans the largest scanned document quickly', () => {
		const line = '| cell | `code` $x$ [link](https://example.com) - [ ] task <b>bold</b> **strong** _em_\n';
		const doc = line.repeat(Math.floor(MAX_SCANNED_DOCUMENT_LENGTH / line.length));
		scanMarkdownFeatures(doc); // warm up
		const start = performance.now();
		const runs = 20;
		for (let i = 0; i < runs; i++) {
			scanMarkdownFeatures(doc);
		}
		const msPerScan = (performance.now() - start) / runs;
		assert.ok(msPerScan < 20, `scan took ${msPerScan.toFixed(2)} ms`);
	});
});
