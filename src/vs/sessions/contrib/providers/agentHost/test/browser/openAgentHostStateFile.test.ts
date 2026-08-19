/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import type { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import type { ContextKeyValue, IContext } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IRemoteAgentHostConnectionInfo, RemoteAgentHostConnectionStatus } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService, type INotification, type INotificationHandle } from '../../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../../platform/notification/test/common/testNotificationService.js';
import { IsSessionsWindowContext } from '../../../../../../workbench/common/contextkeys.js';
import { isResourceEditorInput } from '../../../../../../workbench/common/editor.js';
import { IEditorService } from '../../../../../../workbench/services/editor/common/editorService.js';
import { openAgentHostStateFile, OpenAgentHostStateFileAction as WorkbenchOpenAgentHostStateFileAction } from '../../../../../../workbench/contrib/chat/browser/actions/openAgentHostStateFileAction.js';
import { ChatContextKeys } from '../../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { buildLocalCopilotLogsUri, buildRemoteCopilotLogsUri, getCopilotCliSessionRawId, resolveEventsUri } from '../../../../../../workbench/contrib/chat/browser/copilotCliEventsUri.js';
import { IsAgentHostSession } from '../../browser/agentHostSkillButtons.js';
import { OpenAgentHostStateFileAction } from '../../browser/openAgentHostStateFileAction.js';

suite('Open Agent Host State File', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const userHome = URI.file('/home/me');

	function makeRemoteConn(address: string, defaultDirectory: string | undefined): IRemoteAgentHostConnectionInfo {
		return {
			address,
			name: address,
			clientId: 'client-1',
			defaultDirectory,
			status: RemoteAgentHostConnectionStatus.connected,
		};
	}

	function context(values: Record<string, ContextKeyValue>): IContext {
		return {
			getValue: <T extends ContextKeyValue = ContextKeyValue>(key: string): T | undefined => values[key] as T | undefined,
		};
	}

	test('workbench command is disabled in the Agents window', () => {
		const workbenchPrecondition = new WorkbenchOpenAgentHostStateFileAction().desc.precondition;
		const sessionsPrecondition = new OpenAgentHostStateFileAction().desc.precondition;

		assert.deepStrictEqual({
			workbenchVSCodeWindow: workbenchPrecondition?.evaluate(context({
				[ChatContextKeys.enabled.key]: true,
				[IsSessionsWindowContext.key]: false,
			})),
			workbenchAgentsWindow: workbenchPrecondition?.evaluate(context({
				[ChatContextKeys.enabled.key]: true,
				[IsSessionsWindowContext.key]: true,
			})),
			sessionsCopilotCliSession: sessionsPrecondition?.evaluate(context({
				[ChatContextKeys.enabled.key]: true,
				[IsAgentHostSession.key]: false,
			})),
			sessionsAgentHostSession: sessionsPrecondition?.evaluate(context({
				[ChatContextKeys.enabled.key]: true,
				[IsAgentHostSession.key]: true,
			})),
		}, {
			workbenchVSCodeWindow: true,
			workbenchAgentsWindow: false,
			sessionsCopilotCliSession: false,
			sessionsAgentHostSession: true,
		});
	});

	test('local AH copilotcli session resolves to ~/.copilot/session-state/<id>/events.jsonl', () => {
		const result = resolveEventsUri(URI.parse('agent-host-copilotcli:/abc'), userHome, () => undefined);
		assert.deepStrictEqual(
			{ kind: result.kind, resource: result.kind === 'ok' ? result.resource.toString() : undefined },
			{ kind: 'ok', resource: 'file:///home/me/.copilot/session-state/abc/events.jsonl' },
		);
	});

	test('local AH copilotcli session resolves from COPILOT_HOME', () => {
		const result = resolveEventsUri(
			URI.parse('agent-host-copilotcli:/abc'),
			userHome,
			() => undefined,
			{ COPILOT_HOME: '/custom/copilot' },
		);
		assert.deepStrictEqual(
			{ kind: result.kind, resource: result.kind === 'ok' ? result.resource.toString() : undefined },
			{ kind: 'ok', resource: 'file:///custom/copilot/session-state/abc/events.jsonl' },
		);
	});

	test('copilot log roots resolve beside session-state', () => {
		const conn = makeRemoteConn('localhost:4321', '/home/remote');
		const remoteLogs = buildRemoteCopilotLogsUri(conn);
		assert.deepStrictEqual({
			rawId: getCopilotCliSessionRawId(URI.parse('agent-host-copilotcli:/abc')),
			nonCopilotRawId: getCopilotCliSessionRawId(URI.parse('agent-host-copilot:/abc')),
			localLogs: buildLocalCopilotLogsUri(userHome).toString(),
			remoteLogs: remoteLogs ? {
				scheme: remoteLogs.scheme,
				authority: remoteLogs.authority,
				isLogsPath: remoteLogs.path.endsWith('/home/remote/.copilot/logs'),
			} : undefined,
		}, {
			rawId: 'abc',
			nonCopilotRawId: undefined,
			localLogs: 'file:///home/me/.copilot/logs',
			remoteLogs: {
				scheme: 'vscode-agent-host',
				authority: 'localhost__4321',
				isLogsPath: true,
			},
		});
	});

	test('local copilot log root resolves from COPILOT_HOME', () => {
		assert.strictEqual(
			buildLocalCopilotLogsUri(userHome, { COPILOT_HOME: '/custom/copilot' }).toString(),
			'file:///custom/copilot/logs',
		);
	});

	test('EH CLI copilotcli session resolves to ~/.copilot/session-state/<id>/events.jsonl', () => {
		const result = resolveEventsUri(URI.parse('copilotcli:/abc'), userHome, () => undefined);
		assert.deepStrictEqual(
			{ kind: result.kind, resource: result.kind === 'ok' ? result.resource.toString() : undefined },
			{ kind: 'ok', resource: 'file:///home/me/.copilot/session-state/abc/events.jsonl' },
		);
	});

	test('remote copilotcli session wraps host events.jsonl in vscode-agent-host URI', () => {
		const conn = makeRemoteConn('localhost:4321', '/home/remote');
		const result = resolveEventsUri(
			URI.parse('remote-localhost__4321-copilotcli:/xyz'),
			userHome,
			authority => authority === 'localhost__4321' ? conn : undefined,
		);
		assert.deepStrictEqual(
			{ kind: result.kind, resource: result.kind === 'ok' ? result.resource.toString() : undefined },
			{ kind: 'ok', resource: 'vscode-agent-host://localhost__4321/home/remote/.copilot/session-state/xyz/events.jsonl?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0' },
		);
	});

	test('remote scheme without an active connection returns remote-not-connected', () => {
		const result = resolveEventsUri(
			URI.parse('remote-myhost-copilotcli:/abc'),
			userHome,
			() => undefined,
		);
		assert.deepStrictEqual(result, { kind: 'remote-not-connected', authority: 'myhost' });
	});

	test('remote scheme without a defaultDirectory returns remote-no-home', () => {
		const conn = makeRemoteConn('myhost', undefined);
		const result = resolveEventsUri(
			URI.parse('remote-myhost-copilotcli:/abc'),
			userHome,
			authority => authority === 'myhost' ? conn : undefined,
		);
		assert.deepStrictEqual(result, { kind: 'remote-no-home', authority: 'myhost' });
	});

	test('unknown scheme returns unsupported-scheme', () => {
		const result = resolveEventsUri(URI.parse('claude:/abc'), userHome, () => undefined);
		assert.deepStrictEqual(result, { kind: 'unsupported-scheme', scheme: 'claude' });
	});

	test('missing session resource returns no-session', () => {
		const result = resolveEventsUri(undefined, userHome, () => undefined);
		assert.deepStrictEqual(result, { kind: 'no-session' });
	});

	test('opens the state file returned by the owning Agent Host connection', async () => {
		const clientSession = URI.parse('agent-host-copilotcli:/client-session-id');
		const backendSession = URI.parse('copilotcli:/backend-session-id');
		const stateFile = URI.file('/state/sdk-conversation-id/events.jsonl');
		const calls: { resolved: string[]; requested: string[]; opened: string[]; notifications: string[] } = {
			resolved: [],
			requested: [],
			opened: [],
			notifications: [],
		};
		const connection = new class extends mock<IAgentConnection>() {
			override async getSessionStateFile(session: URI): Promise<URI | undefined> {
				calls.requested.push(session.toString());
				return stateFile;
			}
		}();
		const connectionsService = new class extends mock<IAgentHostConnectionsService>() {
			override resolveSessionResource(session: URI) {
				calls.resolved.push(session.toString());
				return { connection, backendSession };
			}
		}();
		const editorService = new class extends mock<IEditorService>() {
			override async openEditor(...args: unknown[]): Promise<undefined> {
				const editor = args[0];
				if (isResourceEditorInput(editor)) {
					calls.opened.push(editor.resource.toString());
				}
				return undefined;
			}
		}();
		const notificationService = new class extends TestNotificationService {
			override notify(notification: INotification): INotificationHandle {
				calls.notifications.push(String(notification.message));
				return super.notify(notification);
			}
		}();
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IAgentHostConnectionsService, connectionsService);
		instantiationService.stub(IEditorService, editorService);
		instantiationService.stub(INotificationService, notificationService);

		await openAgentHostStateFile(instantiationService, clientSession);

		assert.deepStrictEqual(calls, {
			resolved: ['agent-host-copilotcli:/client-session-id'],
			requested: ['copilotcli:/backend-session-id'],
			opened: ['file:///state/sdk-conversation-id/events.jsonl'],
			notifications: [],
		});
	});
});
