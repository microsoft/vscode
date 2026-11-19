/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../base/common/uri.js';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { StorageScope } from '../../../platform/storage/common/storage.js';
import { TestStorageService } from '../../../workbench/test/common/workbenchTestServices.js';
import { ISession } from '../../../workbench/services/sessions/common/session.js';
import { EmbeddedEditorSessionMemory } from '../../electron-browser/embeddedEditor.js';

suite('EmbeddedEditorSessionMemory', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('shows the editor window of a session again when it is selected again, until the user leaves it', () => {
		const memory = new EmbeddedEditorSessionMemory(disposables.add(new TestStorageService()));
		const a = createSession('a');
		const b = createSession('b');

		const steps: string[] = [];
		steps.push(`select a: ${memory.select(a, true)}`);
		memory.willShow('a');
		steps.push(`select b: ${memory.select(b, true)}`);
		memory.didHide();
		steps.push(`select a: ${memory.select(a, true)}`);
		memory.willShow('a');
		steps.push(`select a again: ${memory.select(a, true)}`);
		memory.didHide(); // closed, or left from within the editor window
		steps.push(`select b: ${memory.select(b, true)}`);
		steps.push(`select a: ${memory.select(a, true)}`);
		memory.willShow('a');
		memory.willHide(); // Back to Agents
		memory.didHide();
		steps.push(`select b: ${memory.select(b, true)}`);
		steps.push(`select a: ${memory.select(a, true)}`);

		assert.deepStrictEqual(steps, [
			'select a: undefined',
			'select b: hide',
			'select a: show',
			'select a again: undefined',
			'select b: undefined',
			'select a: undefined',
			'select b: undefined',
			'select a: undefined',
		]);
	});

	test('restores after a restart once the folders are known, also for a session with a new identity', () => {
		const storage = disposables.add(new TestStorageService());
		const memory = new EmbeddedEditorSessionMemory(storage);
		memory.select(createSession('a'), true);
		memory.willShow('a');
		memory.select(createSession('draft'), true);
		memory.willShow('draft');

		const restarted = new EmbeddedEditorSessionMemory(storage);
		const steps = [
			`a without folders: ${restarted.select(createSession('a'), false)}`,
			`a with folders: ${restarted.select(createSession('a'), true)}`,
			`graduated draft: ${restarted.select(createSession('created', ['draft']), true)}`,
		];

		assert.deepStrictEqual({ steps, stored: storage.get('sessions.embeddedEditor.sessions', StorageScope.WORKSPACE) }, {
			steps: [
				'a without folders: undefined',
				'a with folders: show',
				'graduated draft: show',
			],
			stored: '["a","created"]',
		});
	});
});

function createSession(sessionId: string, previousSessionIds: string[] = []): ISession {
	return new class extends mock<ISession>() {
		override readonly sessionId = sessionId;
		override readonly previousIdentities = previousSessionIds.map(id => ({ sessionId: id, resource: URI.from({ scheme: 'test', path: `/${id}` }) }));
	}();
}
