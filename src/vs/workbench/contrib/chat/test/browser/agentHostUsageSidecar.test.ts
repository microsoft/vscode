/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { NullRemoteAgentHostService } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { agentModelCallMetaKey } from '../../../../../platform/agentHost/common/meta/agentModelCallMeta.js';
import { ActionType, type ActionEnvelope, type INotification } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { buildDefaultChatUri } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { AgentHostUsageRecorder, buildAgentHostUsageUri, readAgentHostUsageRecords } from '../../browser/chatDebug/agentHostUsageSidecar.js';

suite('AgentHostUsageRecorder model-call diagnostics', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const baseDir = URI.file('/user');

	class TestRecorder extends AgentHostUsageRecorder {
		flush(): Promise<void> { return this.queued('sdk', async () => { }); }
	}

	function setup() {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
		const actions = disposables.add(new Emitter<ActionEnvelope>());
		const notifications = disposables.add(new Emitter<INotification>());
		let enabled = true;
		const recorder = disposables.add(new TestRecorder(baseDir, () => enabled, fileService, new NullLogService(),
			{ onDidAction: actions.event, onDidNotification: notifications.event }, new NullRemoteAgentHostService()));
		const fire = (id: string, turnId?: string) => actions.fire({
			channel: buildDefaultChatUri('copilotcli:/sdk'), serverSeq: 1, origin: undefined,
			action: {
				type: ActionType.ChatUsage, turnId: 'current-turn',
				usage: {
					inputTokens: 999, _meta: {
						[agentModelCallMetaKey]: {
							schemaVersion: 1, sdkSessionId: 'sdk', eventId: id, apiCallId: id, turnId,
							durationMs: 123, inputTokens: 10,
						}
					}
				},
			},
		});
		return { fileService, recorder, fire, disable: () => enabled = false };
	}

	test('deduplicates call IDs, preserves exact ownership and respects the debug gate', async () => {
		const { fileService, recorder, fire, disable } = setup();
		fire('old', 'old-turn');
		fire('old', 'old-turn');
		fire('unknown');
		disable();
		fire('disabled');
		await recorder.flush();
		const records = await readAgentHostUsageRecords(fileService, buildAgentHostUsageUri(baseDir, 'sdk'));
		assert.deepStrictEqual(records.map(record => ({
			version: record.schemaVersion, id: record.apiCallId, turn: record.turnId,
			correlation: record.correlation, tokens: record.inputTokens, duration: record.durationMs,
		})), [
			{ version: 2, id: 'old', turn: 'old-turn', correlation: 'exact', tokens: 10, duration: 123 },
			{ version: 2, id: 'unknown', turn: undefined, correlation: 'unresolved', tokens: 10, duration: 123 },
		]);
	});

	test('retains a bounded recent diagnostic window', async () => {
		const { fileService, recorder, fire } = setup();
		for (let i = 0; i < 2050; i++) {
			fire(`call-${i}`);
		}
		await recorder.flush();
		const records = await readAgentHostUsageRecords(fileService, buildAgentHostUsageUri(baseDir, 'sdk'));
		assert.deepStrictEqual({ count: records.length, first: records[0].apiCallId, last: records.at(-1)?.apiCallId }, {
			count: 1025, first: 'call-1025', last: 'call-2049',
		});
	});
});
