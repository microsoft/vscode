/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ActionType } from '../../common/state/sessionActions.js';
import type { AhpNotification } from '../../common/state/sessionProtocol.js';
import { createErrorResponsePart, ResponsePartKind } from '../../common/state/sessionState.js';
import { AhpSnapshotRecorder, normalizeWorkspacePaths, waitForChatTurnComplete, waitForChatUnreadAfterTurn, waitForFinalServerMessage } from './e2e/harness/ahpSnapshot.js';
import { agentModelConfigurationReportKey } from '../../common/agentModelConfiguration.js';

suite('AhpSnapshotRecorder', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('normalizes workspace path casing and separators in text and embedded JSON across platforms', () => {
		const serialize = (workingDirectory: string, path: string) => {
			const recorder = new AhpSnapshotRecorder();
			recorder.setNormalization({ workingDirectory, homeDirectory: 'unused-home', userName: 'unused-user' });
			recorder.record('s2c', {
				id: 1,
				error: { code: -32602, message: `Workspace ${path}; file ${path}\\fixture.rtlang; input ${JSON.stringify({ path: `${path}\\fixture.rtlang` })}` },
			});
			return recorder.serialize();
		};
		assert.deepStrictEqual([
			serialize('c:\\Temp\\workspace', 'C:\\Temp\\workspace'),
			serialize('c:\\Temp\\workspace', 'C:/Temp/workspace'),
			serialize('/tmp/workspace', '/tmp/workspace'),
		], Array(3).fill(serialize('/tmp/workspace', '/tmp/workspace')));
	});

	test('normalizes only registered fixture URLs in error results and retains them across message clears', () => {
		const recorder = new AhpSnapshotRecorder();
		recorder.setFixtureUrl('auth', 'http://127.0.0.1:43123');
		recorder.clear();
		recorder.record('c2s', { id: 1, method: 'authenticate', params: {} });
		recorder.record('s2c', {
			id: 1,
			error: { code: -32602, message: 'Wrong resource http://127.0.0.1:43123/protected; unrelated http://127.0.0.1:43234 stays unchanged' },
		});

		const snapshot = recorder.serialize();
		assert.deepStrictEqual({
			placeholder: snapshot.includes('${url_auth}/protected'),
			stalePort: snapshot.includes('43123'),
			unregistered: snapshot.includes('http://127.0.0.1:43234'),
		}, { placeholder: true, stalePort: false, unregistered: true });
	});

	test('normalizes mixed separators and Unicode paths with spaces without changing following prose or POSIX casing', () => {
		const relative = 'watched space \u03a9/caf\u00e9\u{1f600}.rtlang';
		const suffix = '. Do not match \\d+ outside the path.';
		assert.deepStrictEqual({
			windows: normalizeWorkspacePaths(`File C:/Temp/workspace/${relative.replaceAll('/', '\\')}${suffix}`, 'c:\\Temp\\workspace'),
			posix: normalizeWorkspacePaths(`File /tmp/workspace/${relative}${suffix}`, '/tmp/workspace'),
			distinctPosix: normalizeWorkspacePaths('/tmp/Workspace/file.rtlang', '/tmp/workspace'),
			json: normalizeWorkspacePaths(JSON.stringify({ path: `C:\\Temp\\workspace\\${relative.replaceAll('/', '\\')}` }), 'c:\\Temp\\workspace'),
		}, {
			windows: `File \${workdir}/${relative}${suffix}`,
			posix: `File \${workdir}/${relative}${suffix}`,
			distinctPosix: '/tmp/Workspace/file.rtlang',
			json: JSON.stringify({ path: `\${workdir}/${relative}` }),
		});
	});

	test('omits only unsolicited model-report patches from traffic summaries', () => {
		const report = { [agentModelConfigurationReportKey]: { 'custom-chat:/one': { models: {} } } };
		const cases = [
			{ direction: 's2c', config: report, expected: false },
			{ direction: 's2c', config: { [agentModelConfigurationReportKey]: null }, expected: false },
			{ direction: 's2c', config: report, replace: true, expected: true },
			{ direction: 's2c', config: report, origin: { clientId: 'client', clientSeq: 1 }, expected: true },
			{ direction: 's2c', config: report, rejectionReason: 'host-owned', expected: true },
			{ direction: 's2c', config: { ...report, autoApprove: 'default' }, expected: true },
			{ direction: 's2c', config: {}, expected: true },
			{ direction: 'c2s', config: report, expected: true },
		] as const;
		for (const { direction, config, expected, ...params } of cases) {
			const { replace, ...envelope } = { replace: false, ...params };
			const recorder = new AhpSnapshotRecorder();
			recorder.record(direction, {
				method: direction === 's2c' ? 'action' : 'dispatchAction',
				params: { channel: 'session', ...envelope, action: { type: ActionType.SessionConfigChanged, config, replace } },
			});
			assert.strictEqual(recorder.serialize().includes('session/configChanged'), expected, JSON.stringify({ direction, config, ...params }));
		}
	});

	test('omits tool success by provider name before snapshot normalization', () => {
		const recorder = new AhpSnapshotRecorder();
		recorder.record('s2c', {
			method: 'action',
			params: {
				channel: 'ahp-chat://session/chat',
				action: {
					type: ActionType.ChatToolCallStart,
					turnId: 'turn-1',
					toolCallId: 'tool-1',
					toolName: 'bash',
					displayName: 'Run command',
				},
			},
		});

		recorder.record('s2c', {
			method: 'action',
			params: {
				channel: 'ahp-chat://session/chat',
				action: {
					type: ActionType.ChatToolCallComplete,
					turnId: 'turn-1',
					toolCallId: 'tool-1',
					result: { success: false },
				},
			},
		});

		const snapshot = recorder.serialize({
			profile: 'behavior',
			omitToolCallSuccessForToolNames: ['bash'],
		});

		assert.deepStrictEqual({
			normalizedToolName: snapshot.includes('toolName: ${shell}'),
			includesSuccess: snapshot.includes('success:'),
		}, {
			normalizedToolName: true,
			includesSuccess: false,
		});
	});

	test('omits only selected helper methods and their responses without hiding other RPC errors', () => {
		const recorder = new AhpSnapshotRecorder();
		for (const [id, method] of [[1, 'subscribe'], [2, 'resourceRead'], [3, 'authenticate']] as const) {
			recorder.record('c2s', { id, method, params: {} });
			recorder.record('s2c', id === 3
				? { id, error: { code: -32602, message: 'Expected authentication rejection' } }
				: { id, result: {} });
		}
		const snapshot = recorder.serialize({ ignoredMethods: ['subscribe', 'resourceRead'] });
		assert.deepStrictEqual({
			subscribe: snapshot.includes('subscribe'),
			resourceRead: snapshot.includes('resourceRead'),
			authenticate: snapshot.includes('method: authenticate') && snapshot.includes('responseTo: authenticate'),
			error: snapshot.includes('Expected authentication rejection'),
		}, { subscribe: false, resourceRead: false, authenticate: true, error: true });
	});

	test('preserves RPC error codes and multiline diagnostics without runtime stack locations', () => {
		const recorder = new AhpSnapshotRecorder();
		recorder.record('c2s', { id: 1, method: 'resources/read', params: {} });
		recorder.record('s2c', {
			id: 1,
			error: {
				code: -32603,
				message: 'Expected resource error\nat the requested boundary\n    at handleMessage (C:\\runtime\\connection.js:15:4)\n    at processTicks (node:internal/process/task_queues:21:6)',
			},
		});
		const snapshot = recorder.serialize();
		assert.deepStrictEqual({
			code: snapshot.includes('code: -32603'),
			message: snapshot.includes('Expected resource error') && snapshot.includes('at the requested boundary'),
			stack: snapshot.includes('connection.js') || snapshot.includes('processTicks'),
		}, { code: true, message: true, stack: false });
	});

	test('waits for an unread action on the completed chat after the turn outcome', async () => {
		const unread = new DeferredPromise<AhpNotification>();
		const chat = 'ahp-chat://session/chat';
		const matching: boolean[] = [];
		const client = {
			waitForNotification: (predicate: (notification: AhpNotification) => boolean) => {
				for (const [channel, serverSeq, isRead] of [
					[chat, 9, false],
					['ahp-chat://session/other', 11, false],
					[chat, 12, true],
					[chat, 13, false],
				] as const) {
					matching.push(predicate({
						jsonrpc: '2.0',
						method: 'action',
						params: { channel, serverSeq, origin: undefined, action: { type: ActionType.ChatIsReadChanged, isRead } },
					}));
				}
				return unread.p;
			},
		};
		let complete = false;
		const wait = waitForChatUnreadAfterTurn(client, chat, 10).then(() => { complete = true; });
		const completeBeforeUnread = complete;
		unread.complete({ jsonrpc: '2.0', method: 'action', params: { channel: chat, serverSeq: 13, origin: undefined, action: { type: ActionType.ChatIsReadChanged, isRead: false } } });
		await wait;

		assert.deepStrictEqual({ matching, completeBeforeUnread, complete }, {
			matching: [false, false, false, true],
			completeBeforeUnread: false,
			complete: true,
		});
	});

	test('a resumed turn ignores previous outcomes and waits for unread after its new completion', async () => {
		const chat = 'ahp-chat://session/chat';
		const turnId = 'resumed-turn';
		const notifications: AhpNotification[] = [
			{ jsonrpc: '2.0', method: 'action', params: { channel: chat, serverSeq: 9, origin: undefined, action: { type: ActionType.ChatTurnComplete, turnId, duration: 0 } } },
			{ jsonrpc: '2.0', method: 'action', params: { channel: chat, serverSeq: 10, origin: undefined, action: { type: ActionType.ChatError, turnId, duration: 0, part: createErrorResponsePart({ errorType: 'requestFailed', message: 'previous failure' }, true) } } },
			{ jsonrpc: '2.0', method: 'action', params: { channel: 'ahp-chat://session/other', serverSeq: 11, origin: undefined, action: { type: ActionType.ChatTurnComplete, turnId, duration: 0 } } },
			{ jsonrpc: '2.0', method: 'action', params: { channel: chat, serverSeq: 12, origin: undefined, action: { type: ActionType.ChatTurnComplete, turnId: 'other-turn', duration: 0 } } },
			{ jsonrpc: '2.0', method: 'action', params: { channel: chat, serverSeq: 13, origin: undefined, action: { type: ActionType.ChatIsReadChanged, isRead: false } } },
			{ jsonrpc: '2.0', method: 'action', params: { channel: chat, serverSeq: 14, origin: undefined, action: { type: ActionType.ChatTurnComplete, turnId, duration: 0 } } },
			{ jsonrpc: '2.0', method: 'action', params: { channel: chat, serverSeq: 15, origin: undefined, action: { type: ActionType.ChatIsReadChanged, isRead: false } } },
		];
		const matched: number[] = [];
		const client = {
			waitForNotification: async (predicate: (notification: AhpNotification) => boolean) => {
				const notification = notifications.find(predicate);
				assert.ok(notification);
				if (notification.method === 'action') {
					matched.push(notification.params.serverSeq);
				}
				return notification;
			},
			takeReplayError: () => undefined,
		};

		await waitForChatTurnComplete(client, chat, turnId, 10);

		assert.deepStrictEqual(matched, [14, 15]);
	});

	for (const replayFailure of [false, true]) {
		test(`turn completion fails immediately on an error${replayFailure ? ' and preserves the replay failure' : ''}`, async () => {
			const error = new Error('strict replay mismatch');
			let waits = 0;
			const client = {
				waitForNotification: async (predicate: (notification: AhpNotification) => boolean) => {
					waits++;
					const notification: AhpNotification = {
						jsonrpc: '2.0', method: 'action',
						params: { channel: 'chat', serverSeq: 1, origin: undefined, action: { type: ActionType.ChatError, turnId: 'turn', duration: 0, part: createErrorResponsePart({ errorType: 'requestFailed', message: 'failed' }, true) } },
					};
					assert.ok(predicate(notification));
					return notification;
				},
				takeReplayError: () => replayFailure ? error : undefined,
			};

			await assert.rejects(waitForChatTurnComplete(client, 'chat', 'turn'), actual =>
				replayFailure ? actual === error : actual instanceof Error && actual.message === 'Turn turn failed: requestFailed: failed');
			assert.strictEqual(waits, 1);
		});
	}

	test('canonicalizes opted-in server action interleaving across channels', () => {
		const parent = { channel: 'ahp-chat://session/parent', turnId: 'parent-turn' } as const;
		const child = { channel: 'ahp-chat://session/child', turnId: 'child-turn' } as const;
		const turns = [parent, child];
		type ScheduledAction = { readonly turn: (typeof turns)[number]; readonly type: 'response' | 'complete' };
		const serialize = (schedule: readonly ScheduledAction[], canonicalize: boolean): string => {
			const recorder = new AhpSnapshotRecorder();
			for (const turn of turns) {
				recorder.record('s2c', {
					method: 'action',
					params: {
						channel: turn.channel,
						action: {
							type: ActionType.ChatTurnStarted,
							turnId: turn.turnId,
							message: { text: turn.turnId, origin: { kind: 'user' } },
						},
					},
				});
			}
			for (const scheduled of schedule) {
				recorder.record('s2c', {
					method: 'action',
					params: {
						channel: scheduled.turn.channel,
						action: scheduled.type === 'response' ? {
							type: ActionType.ChatResponsePart,
							turnId: scheduled.turn.turnId,
							part: {
								id: `${scheduled.turn.turnId}-response`,
								kind: ResponsePartKind.Markdown,
								content: scheduled.turn.turnId,
							},
						} : {
							type: ActionType.ChatTurnComplete,
							turnId: scheduled.turn.turnId,
						},
					},
				});
			}
			return recorder.serialize(canonicalize ? {
				orderIndependentActionTypes: [ActionType.ChatTurnComplete],
			} : undefined);
		};

		const recordedOrder: ScheduledAction[] = [
			{ turn: child, type: 'response' },
			{ turn: child, type: 'complete' },
			{ turn: parent, type: 'response' },
			{ turn: parent, type: 'complete' },
		];
		const crossChannelReorder: ScheduledAction[] = [
			{ turn: parent, type: 'response' },
			{ turn: parent, type: 'complete' },
			{ turn: child, type: 'response' },
			{ turn: child, type: 'complete' },
		];
		const sameChannelReorder: ScheduledAction[] = [
			{ turn: child, type: 'complete' },
			{ turn: child, type: 'response' },
			{ turn: parent, type: 'response' },
			{ turn: parent, type: 'complete' },
		];
		assert.deepStrictEqual({
			exactCrossChannelOrderMatches: serialize(recordedOrder, false) === serialize(crossChannelReorder, false),
			canonicalCrossChannelOrderMatches: serialize(recordedOrder, true) === serialize(crossChannelReorder, true),
			canonicalPerChannelOrderMatches: serialize(recordedOrder, true) === serialize(sameChannelReorder, true),
		}, {
			exactCrossChannelOrderMatches: false,
			canonicalCrossChannelOrderMatches: true,
			canonicalPerChannelOrderMatches: false,
		});
	});

	test('child replies can interleave with parent tool completion without hiding transcript defects', () => {
		type ScheduledAction = 'parentToolComplete' | 'parentReply' | 'childReply';
		const serialize = (schedule: readonly ScheduledAction[], options: { canonicalize?: boolean; success?: boolean } = {}): string => {
			const recorder = new AhpSnapshotRecorder();
			for (const chat of ['parent', 'child']) {
				recorder.record('s2c', {
					method: 'action',
					params: {
						channel: `ahp-chat://session/${chat}`,
						action: { type: ActionType.ChatTurnStarted, turnId: `${chat}-turn`, message: { text: chat, origin: { kind: 'user' } } },
					},
				});
			}
			recorder.record('s2c', {
				method: 'action',
				params: {
					channel: 'ahp-chat://session/parent',
					action: { type: ActionType.ChatToolCallStart, turnId: 'parent-turn', toolCallId: 'read-child', toolName: 'read_agent' },
				},
			});
			let responseIndex = 0;
			for (const scheduled of schedule) {
				const chat = scheduled === 'childReply' ? 'child' : 'parent';
				recorder.record('s2c', {
					method: 'action',
					params: {
						channel: `ahp-chat://session/${chat}`,
						action: scheduled === 'parentToolComplete' ? {
							type: ActionType.ChatToolCallComplete,
							turnId: 'parent-turn',
							toolCallId: 'read-child',
							result: { success: options.success ?? true },
						} : {
							type: ActionType.ChatResponsePart,
							turnId: `${chat}-turn`,
							part: { kind: ResponsePartKind.Markdown, id: `response-${responseIndex++}`, content: `${chat} answer` },
						},
					},
				});
			}
			return recorder.serialize({
				profile: 'behavior',
				...(options.canonicalize ? { orderIndependentActionTypes: [ActionType.ChatResponsePart] } : {}),
			});
		};
		const recorded: ScheduledAction[] = ['parentToolComplete', 'childReply', 'parentReply'];
		const interleaved: ScheduledAction[] = ['childReply', 'parentToolComplete', 'parentReply'];
		const canonical = serialize(recorded, { canonicalize: true });

		assert.deepStrictEqual({
			strictInterleavingMatches: serialize(recorded) === serialize(interleaved),
			canonicalInterleavingMatches: canonical === serialize(interleaved, { canonicalize: true }),
			sameChatReorderMatches: canonical === serialize(['childReply', 'parentReply', 'parentToolComplete'], { canonicalize: true }),
			failedToolMatches: canonical === serialize(recorded, { canonicalize: true, success: false }),
			missingReplyMatches: canonical === serialize(['parentToolComplete', 'parentReply'], { canonicalize: true }),
			duplicatedReplyMatches: canonical === serialize(['parentToolComplete', 'childReply', 'childReply', 'parentReply'], { canonicalize: true }),
		}, {
			strictInterleavingMatches: false,
			canonicalInterleavingMatches: true,
			sameChatReorderMatches: false,
			failedToolMatches: false,
			missingReplyMatches: false,
			duplicatedReplyMatches: false,
		});
	});

	test('a snapshot ending in read state waits for its turn completion and subsequent unread state', async () => {
		const chat = 'ahp-chat://session/chat';
		const turnId = 'completed-turn';
		const notifications: AhpNotification[] = [
			{ jsonrpc: '2.0', method: 'action', params: { channel: chat, serverSeq: 9, origin: undefined, action: { type: ActionType.ChatIsReadChanged, isRead: false } } },
			{ jsonrpc: '2.0', method: 'action', params: { channel: chat, serverSeq: 10, origin: undefined, action: { type: ActionType.ChatTurnComplete, turnId: 'previous-turn', duration: 0 } } },
			{ jsonrpc: '2.0', method: 'action', params: { channel: chat, serverSeq: 11, origin: undefined, action: { type: ActionType.ChatIsReadChanged, isRead: true } } },
			{ jsonrpc: '2.0', method: 'action', params: { channel: chat, serverSeq: 12, origin: undefined, action: { type: ActionType.ChatTurnComplete, turnId, duration: 0 } } },
			{ jsonrpc: '2.0', method: 'action', params: { channel: chat, serverSeq: 13, origin: undefined, action: { type: ActionType.ChatIsReadChanged, isRead: true } } },
			{ jsonrpc: '2.0', method: 'action', params: { channel: chat, serverSeq: 14, origin: undefined, action: { type: ActionType.ChatIsReadChanged, isRead: false } } },
		];
		const matched: number[] = [];
		const client = {
			waitForNotification: async (predicate: (notification: AhpNotification) => boolean) => {
				const notification = notifications.find(predicate);
				assert.ok(notification);
				if (notification.method === 'action') {
					matched.push(notification.params.serverSeq);
				}
				return notification;
			},
			takeReplayError: () => undefined,
		};

		await waitForFinalServerMessage(client, [
			{ channel: '${chat_0}', action: { type: ActionType.ChatTurnComplete, turnId: '${turn_0}' } },
			{ channel: '${chat_0}', action: { type: ActionType.ChatIsReadChanged } },
		], new Set(), new Map([['${chat_0}', chat], ['${turn_0}', turnId]]));

		assert.deepStrictEqual(matched, [12, 14]);
	});

	test('a snapshot round cannot complete on an outcome from a previous round of the same turn', async () => {
		const chat = 'ahp-chat://session/chat';
		const turnId = 'resumed-turn';
		const previous: AhpNotification = { jsonrpc: '2.0', method: 'action', params: { channel: chat, serverSeq: 10, origin: undefined, action: { type: ActionType.ChatTurnComplete, turnId, duration: 0 } } };
		const current: AhpNotification = { jsonrpc: '2.0', method: 'action', params: { channel: chat, serverSeq: 12, origin: undefined, action: { type: ActionType.ChatTurnComplete, turnId, duration: 0 } } };
		const unread: AhpNotification = { jsonrpc: '2.0', method: 'action', params: { channel: chat, serverSeq: 13, origin: undefined, action: { type: ActionType.ChatIsReadChanged, isRead: false } } };
		const matched: number[] = [];
		const client = {
			waitForNotification: async (predicate: (notification: AhpNotification) => boolean) => {
				const notification = [previous, current, unread].find(predicate);
				assert.ok(notification);
				if (notification.method === 'action') {
					matched.push(notification.params.serverSeq);
				}
				return notification;
			},
			takeReplayError: () => undefined,
		};

		await waitForFinalServerMessage(client, [
			{ channel: '${chat_0}', action: { type: ActionType.ChatTurnComplete, turnId: '${turn_0}' } },
		], new Set([previous]), new Map([['${chat_0}', chat], ['${turn_0}', turnId]]));

		assert.deepStrictEqual(matched, [12, 13]);
	});
});
