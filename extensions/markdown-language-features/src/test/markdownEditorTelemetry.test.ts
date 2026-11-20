/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
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
});
