/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../../platform/log/common/log.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../../../platform/storage/common/storage.js';
import { getSelectedModelStorageKey } from '../../../../common/chatSelectedModel.js';
import { ChatAgentLocation } from '../../../../common/constants.js';
import { ChatModelSelectionDiagnostics } from '../../../../browser/widget/input/chatModelSelectionDiagnostics.js';

class TestLogService extends NullLogService {
	readonly messages: string[] = [];

	override debug(message: string, ...args: unknown[]): void {
		this.messages.push(`[debug] ${[message, ...args].join(' ')}`);
	}

	override info(message: string, ...args: unknown[]): void {
		this.messages.push(`[info] ${[message, ...args].join(' ')}`);
	}
}

suite('ChatModelSelectionDiagnostics', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('logs structured coordinator events and external storage conflicts', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const logService = disposables.add(new TestLogService());
		const modelTarget = 'agent-host-test';
		const key = getSelectedModelStorageKey(ChatAgentLocation.Chat, modelTarget);
		const diagnostics = new ChatModelSelectionDiagnostics(logService, storage, () => ({
			surface: 'workbench',
			location: ChatAgentLocation.Chat,
			modelTarget,
			sessionKey: 'session',
			conversationKey: 'chat:one',
		}));
		diagnostics.report('initialize', { configuredModel: 'auto', resultModel: 'test/current' }, 'info');
		storage.storeAll([{ key, value: 'test/external', scope: StorageScope.PROFILE, target: StorageTarget.USER }], true);
		diagnostics.logStorageChange({ key, scope: StorageScope.PROFILE, target: StorageTarget.USER, external: true }, 'test/current');
		const messages = logService.messages.join('\n');

		assert.deepStrictEqual({
			structured: messages.includes('[ChatModelSelection] event=initialize')
				&& messages.includes('surface="workbench"')
				&& messages.includes(`storageKey=${JSON.stringify(key)}`),
			externalConflict: messages.includes('event=storage-change')
				&& messages.includes('external=true')
				&& messages.includes('conflictsWithCurrentModel=true')
				&& messages.includes('storedModel="test/external"'),
		}, {
			structured: true,
			externalConflict: true,
		});
	});
});
