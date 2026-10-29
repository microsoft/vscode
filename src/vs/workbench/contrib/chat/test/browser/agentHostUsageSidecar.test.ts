/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { mock } from '../../../../../base/test/common/mock.js';
import type { IAgentSessionMetadata } from '../../../../../platform/agentHost/common/agent.js';
import type { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { NullRemoteAgentHostService, RemoteAgentHostConnectionStatus, type IRemoteAgentHostService } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import type { IActiveSubscriptionInfo } from '../../../../../platform/agentHost/common/state/agentSubscription.js';

import { Schemas } from '../../../../../base/common/network.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { FileOperation } from '../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { agentModelCallMetaKey } from '../../../../../platform/agentHost/common/meta/agentModelCallMeta.js';
import { ActionType, type ActionEnvelope, type INotification } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { buildDefaultChatUri } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { AgentHostUsageRecorder, buildAgentHostUsageUri, readAgentHostUsageRecords } from '../../browser/chatDebug/agentHostUsageSidecar.js';

suite('AgentHostUsageRecorder model-call diagnostics', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const baseDir = URI.file('/user');

	class TestRecorder extends AgentHostUsageRecorder {
		async flush(): Promise<void> {
			await this.whenRecorded();
			await this.queued('sdk', async () => { });
		}
	}

	// The host records this default chat for `copilotcli:/sdk`; its URI encodes another session.
	const defaultChat = buildDefaultChatUri('copilotcli:/encoded');
	const target: IAgentSessionMetadata = { session: URI.parse('copilotcli:/sdk'), startTime: 0, modifiedTime: 0, chats: [{ chat: URI.parse(defaultChat), kind: 'default' }] };

	/** A host whose session records the test controls, counting each listing. */
	class FakeHost extends mock<IAgentConnection>() {
		readonly actions = disposables.add(new Emitter<ActionEnvelope>());
		readonly notifications = disposables.add(new Emitter<INotification>());
		override readonly onDidAction = this.actions.event;
		override readonly onDidNotification = this.notifications.event;
		listings = 0;
		constructor(private readonly _listSessions: () => Promise<IAgentSessionMetadata[]> = async () => [target]) {
			super();
		}
		override listSessions(): Promise<IAgentSessionMetadata[]> {
			this.listings++;
			return this._listSessions();
		}
		override getActiveSubscriptions(): readonly IActiveSubscriptionInfo[] {
			return [];
		}
		override getSubscriptionUnmanaged(): undefined {
			return undefined;
		}
	}

	function usage(channel: string, id: string, turnId?: string): ActionEnvelope {
		return {
			channel, serverSeq: 1, origin: undefined,
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
		};
	}

	function setup(local = new FakeHost(), remote?: FakeHost) {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
		let enabled = true;
		const remoteHosts = remote ? new class extends mock<IRemoteAgentHostService>() {
			override readonly onDidChangeConnections = Event.None;
			override readonly connections = [{ address: 'remote.example:1', name: 'remote', status: RemoteAgentHostConnectionStatus.connected }];
			override getConnectionByAuthority(): IAgentConnection | undefined { return remote; }
		}() : new NullRemoteAgentHostService();
		const recorder = disposables.add(new TestRecorder(baseDir, () => enabled, fileService, new NullLogService(), local, remoteHosts));
		const fire = (id: string, turnId?: string) => local.actions.fire(usage(defaultChat, id, turnId));
		const records = async (rawId = 'sdk') => (await readAgentHostUsageRecords(fileService, buildAgentHostUsageUri(baseDir, rawId))).map(record => record.apiCallId);
		return { fileService, recorder, fire, records, local, disable: () => enabled = false };
	}

	test('deduplicates call IDs, records under the host-recorded owner of the default chat and respects the debug gate', async () => {
		const { fileService, recorder, fire, disable } = setup();
		fire('old', 'old-turn');
		fire('old', 'old-turn');
		fire('unknown');
		disable();
		fire('disabled');
		await recorder.flush();
		const records = await readAgentHostUsageRecords(fileService, buildAgentHostUsageUri(baseDir, 'sdk'));
		assert.deepStrictEqual({
			records: records.map(record => ({
				version: record.schemaVersion, id: record.apiCallId, turn: record.turnId,
				correlation: record.correlation, tokens: record.inputTokens, duration: record.durationMs,
			})),
			encoded: await fileService.exists(buildAgentHostUsageUri(baseDir, 'encoded')),
		}, {
			records: [
				{ version: 2, id: 'old', turn: 'old-turn', correlation: 'exact', tokens: 10, duration: 123 },
				{ version: 2, id: 'unknown', turn: undefined, correlation: 'unresolved', tokens: 10, duration: 123 },
			],
			encoded: false,
		});
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

	test('records for a target listed among more sessions than the owner cache holds', async () => {
		const others = Array.from({ length: 1100 }, (_, index): IAgentSessionMetadata => ({ session: URI.parse(`copilotcli:/other-${index}`), startTime: 0, modifiedTime: 0 }));
		const { recorder, fire, records, local } = setup(new FakeHost(async () => [target, ...others]));
		fire('first');
		fire('second');
		await recorder.flush();
		assert.deepStrictEqual({ records: await records(), listings: local.listings }, { records: ['first', 'second'], listings: 1 });
	});

	test('a burst of updates during the first lookup lists the sessions once', async () => {
		const listed = new DeferredPromise<IAgentSessionMetadata[]>();
		const { recorder, fire, records, local } = setup(new FakeHost(() => listed.p));
		for (let index = 0; index < 5; index++) {
			fire(`burst-${index}`);
		}
		await listed.complete([target]);
		await recorder.flush();
		assert.deepStrictEqual({ records: await records(), listings: local.listings }, { records: ['burst-0', 'burst-1', 'burst-2', 'burst-3', 'burst-4'], listings: 1 });
	});

	test('a failing session listing does not stop later records', async () => {
		let fail = true;
		const { recorder, fire, records } = setup(new FakeHost(async () => {
			if (fail) {
				fail = false;
				throw new Error('host unavailable');
			}
			return [target];
		}));
		fire('dropped');
		fire('recorded');
		await recorder.flush();
		assert.deepStrictEqual(await records(), ['recorded']);
	});

	test('a failed session listing is not remembered: a later usage records once the listing works', async () => {
		let fail = true;
		const { recorder, fire, records } = setup(new FakeHost(async () => {
			if (fail) {
				throw new Error('host unavailable');
			}
			return [target];
		}));
		fire('while-failing');
		await recorder.flush();
		fail = false;
		fire('after-recovery');
		await recorder.flush();
		assert.deepStrictEqual(await records(), ['after-recovery']);
	});

	test('a usage that arrives before its session is listed is not remembered as a non-default chat', async () => {
		let listed: IAgentSessionMetadata[] = [];
		const { recorder, fire, records } = setup(new FakeHost(async () => listed));
		fire('before-listing');
		await recorder.flush();
		listed = [target];
		fire('after-listing');
		await recorder.flush();
		assert.deepStrictEqual(await records(), ['after-listing']);
	});

	test('a peer chat\'s usage is not recorded and its role is looked up once', async () => {
		const peerChat = 'ahp-chat://peer/Y29waWxvdGNsaTovZW5jb2RlZA';
		const local = new FakeHost(async () => [{ ...target, chats: [...target.chats!, { chat: URI.parse(peerChat), kind: 'peer' }] }]);
		const { recorder, records } = setup(local);
		local.actions.fire(usage(peerChat, 'peer-1'));
		await recorder.flush();
		local.actions.fire(usage(peerChat, 'peer-2'));
		await recorder.flush();
		assert.deepStrictEqual({ records: await records(), listings: local.listings }, { records: [], listings: 1 });
	});

	test('a slow remote host does not block local records', async () => {
		const stalled = new DeferredPromise<IAgentSessionMetadata[]>();
		const remote = new FakeHost(() => stalled.p);
		const { fileService, fire, records } = setup(new FakeHost(), remote);
		// `recorder.flush()` would also wait for the stalled remote lookup, so wait for the local record's write instead.
		const uri = buildAgentHostUsageUri(baseDir, 'sdk');
		const localWritten = Event.toPromise(Event.filter(fileService.onDidRunOperation, e => e.isOperation(FileOperation.WRITE) && isEqual(e.resource, uri)));
		remote.actions.fire(usage(defaultChat, 'remote'));
		fire('local');
		await localWritten;
		const local = await records();
		await stalled.complete([]);
		assert.deepStrictEqual(local, ['local']);
	});
});
