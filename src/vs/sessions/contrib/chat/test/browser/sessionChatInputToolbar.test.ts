/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable, derived } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChatSessionFileChange2 } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IChat } from '../../../../services/sessions/common/session.js';
import { computeTurnData } from '../../browser/sessionChatInputToolbar.js';

suite('sessionChatInputToolbar', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('preview files include session-state plan.md while stats stay workspace-scoped', () => {
		const workspaceMd = URI.file('/repo/NOTES.md');
		const planFile = URI.file('/home/user/.copilot/session-state/abc/plan.md');

		const workspaceChange: IChatSessionFileChange2 = {
			uri: workspaceMd,
			modifiedUri: workspaceMd,
			originalUri: URI.file('/repo/NOTES.md.before'),
			insertions: 2,
			deletions: 1,
		};
		const planChange: IChatSessionFileChange2 = {
			uri: planFile,
			modifiedUri: planFile,
			insertions: 12,
			deletions: 0,
		};

		const chat = new class extends mock<IChat>() {
			override readonly lastTurnChanges = constObservable([workspaceChange]);
			override readonly lastTurnPreviewChanges = constObservable([workspaceChange, planChange]);
		}();

		const turnData = derived(reader => computeTurnData(chat, reader)).get();

		assert.deepStrictEqual(turnData.stats, { files: 1, insertions: 2, deletions: 1 });
		assert.deepStrictEqual(turnData.previewFiles.map(f => ({ path: f.uri.path, kind: f.kind, created: f.created })), [
			{ path: planFile.path, kind: 'markdown', created: true },
			{ path: workspaceMd.path, kind: 'markdown', created: false },
		]);
	});

	test('falls back to lastTurnChanges for preview when preview stream is omitted', () => {
		const md = URI.file('/repo/README.md');
		const change: IChatSessionFileChange2 = {
			uri: md,
			modifiedUri: md,
			insertions: 3,
			deletions: 0,
		};
		const chat = new class extends mock<IChat>() {
			override readonly lastTurnChanges = constObservable([change]);
		}();

		const turnData = derived(reader => computeTurnData(chat, reader)).get();
		assert.strictEqual(turnData.stats.files, 1);
		assert.deepStrictEqual(turnData.previewFiles.map(f => f.uri.path), [md.path]);
	});
});
