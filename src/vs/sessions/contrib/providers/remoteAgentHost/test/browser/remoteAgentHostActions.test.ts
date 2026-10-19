/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { URI } from '../../../../../../base/common/uri.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ISSHRemoteAgentHostService, SSHAuthMethod, type ISSHAgentHostConfig } from '../../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { connectWithProgress, RemoteAgentHostCommandIds } from '../../browser/remoteAgentHostActions.js';
import { INotificationTelemetrySource } from '../../../../../../platform/notification/common/notificationTelemetry.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { NotificationService } from '../../../../../../workbench/services/notification/common/notificationService.js';
import { NotificationChangeType } from '../../../../../../workbench/common/notifications.js';
import { ICommandService, CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../../services/sessions/browser/sessionsService.js';
import { ISessionsPartService } from '../../../../../services/sessions/browser/sessionsPartService.js';
import { IAgentHostSessionsProvider } from '../../../../../common/agentHostSessionsProvider.js';
import { IActiveSession } from '../../../../../services/sessions/common/sessionsManagement.js';
import { SessionView } from '../../../../../browser/parts/sessionView.js';
import { ISessionWorkspace } from '../../../../../services/sessions/common/session.js';
import { ConnectMissionControlEnvironmentCommand } from '../../../../../../workbench/contrib/chat/browser/remoteAgentHost/missionControlEnvironmentActions.js';
import { TestNotificationService } from '../../../../../../platform/notification/test/common/testNotificationService.js';

suite('Remote Agent Host actions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const outcome of ['selected', 'cancelled-connection', 'cancelled-folder', 'missing-provider'] as const) {
		test(`Mission Control environment selection opens its folder picker: ${outcome}`, async () => {
			const instantiation = store.add(new TestInstantiationService());
			const folder = URI.parse('vscode-agent-host://cloudsandbox__environment/c:/Users/test/code/project');
			const calls: object[] = [];
			const errors: string[] = [];
			const provider = upcastPartial<IAgentHostSessionsProvider>({
				id: 'agenthost-environment',
				remoteAddress: 'cloudsandbox:environment',
				browseActions: [{
					label: 'Folders', icon: Codicon.folder, providerId: 'agenthost-environment',
					run: async () => {
						calls.push({ browse: true });
						return outcome === 'cancelled-folder' ? undefined : upcastPartial<ISessionWorkspace>({
							folders: [{ root: folder, workingDirectory: folder, name: 'Project', description: undefined }],
						});
					},
				}],
			});
			instantiation.stub(ICommandService, {}, 'executeCommand', async (id: string, onBack?: () => void) => {
				calls.push({ command: id, onBack });
				return outcome === 'cancelled-connection' ? undefined : 'environment';
			});
			instantiation.stub(INotificationService, new class extends TestNotificationService {
				override error(message: Parameters<TestNotificationService['error']>[0]) {
					errors.push(String(message));
					return super.error(message);
				}
			}());
			instantiation.stub(ISessionsProvidersService, { getProviders: () => outcome === 'missing-provider' ? [] : [provider] });
			instantiation.stub(ISessionsService, {
				activeSession: observableValue<IActiveSession | undefined>('activeSession', undefined),
				openNewSession: async () => {
					calls.push({ openNewSession: true });
					return { session: undefined, trustDeclined: false };
				},
			});
			instantiation.stub(ISessionsPartService, {
				getSessionView: () => upcastPartial<SessionView>({
					selectWorkspace: (uri, options) => {
						calls.push({ selected: uri.toString(), providerId: options?.providerId });
						return 'applied';
					},
				}),
			});
			const onBack = () => { };
			await instantiation.invokeFunction(accessor => CommandsRegistry.getCommand(RemoteAgentHostCommandIds.connectViaMissionControl)!.handler(accessor, onBack));
			assert.deepStrictEqual({ calls, errors }, {
				calls: [
					{ command: ConnectMissionControlEnvironmentCommand, onBack },
					...(outcome === 'selected' || outcome === 'cancelled-folder' ? [{ browse: true }] : []),
					...(outcome === 'selected' ? [{ openNewSession: true }, { selected: folder.toString(), providerId: provider.id }] : []),
				],
				errors: outcome === 'missing-provider' ? ['Error: The connected environment is not available for folder browsing.'] : [],
			});
		});
	}

	for (const cancelled of [false, true]) {
		test(`SSH progress and ${cancelled ? 'cancelled connection' : 'failure'} use fixed identities, never host names or errors`, async () => {
			const instantiationService = store.add(new TestInstantiationService());
			const notifications = store.add(new NotificationService(store.add(new InMemoryStorageService())));
			store.add(toDisposable(() => {
				for (const notification of [...notifications.model.notifications]) {
					notification.close();
				}
			}));
			const attribution: INotificationTelemetrySource[] = [];
			store.add(notifications.model.onDidChangeNotification(event => {
				if (event.kind === NotificationChangeType.ADD) {
					attribution.push(event.item.telemetry);
				}
			}));
			instantiationService.stub(INotificationService, notifications);
			instantiationService.stub(ITelemetryService, NullTelemetryService);
			instantiationService.stub(IRemoteAgentHostService, { connections: [] });
			instantiationService.stub(ISSHRemoteAgentHostService, {
				onDidReportConnectProgress: Event.None,
				connect: async () => { throw cancelled ? new CancellationError() : new Error('private failure'); }
			});
			const address = await instantiationService.invokeFunction(accessor => connectWithProgress(accessor, {
				host: 'private.example', username: 'private user', name: 'private connection', authMethod: SSHAuthMethod.Agent
			}, 'private display host'));
			assert.deepStrictEqual({ address, attribution, remaining: notifications.model.notifications.length }, {
				address: undefined,
				attribution: [
					{ origin: 'core', notificationId: 'remoteAgentHost.ssh.connect', extensionId: 'none' },
					...(cancelled ? [] : [{ origin: 'core', notificationId: 'remoteAgentHost.ssh.connectError', extensionId: 'none' }])
				],
				remaining: cancelled ? 0 : 1
			});
		});
	}

	test('reuses an existing SSH connection when reopening the folder picker', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		let connectCalls = 0;
		instantiationService.stub(ISSHRemoteAgentHostService, {
			onDidReportConnectProgress: Event.None,
			connect: async () => {
				connectCalls++;
				throw new Error('Unexpected SSH connect');
			},
		} as Partial<ISSHRemoteAgentHostService>);
		instantiationService.stub(IRemoteAgentHostService, {
			connections: [{
				address: 'ssh:me',
				name: 'me',
				status: RemoteAgentHostConnectionStatus.connected,
			}],
		} as Partial<IRemoteAgentHostService>);
		instantiationService.stub(INotificationService, {});
		instantiationService.stub(ITelemetryService, NullTelemetryService);

		const config: ISSHAgentHostConfig = {
			host: 'me',
			username: 'user',
			authMethod: SSHAuthMethod.Agent,
			name: 'me',
			sshConfigHost: 'me',
		};
		const address = await instantiationService.invokeFunction(accessor => connectWithProgress(accessor, config, 'me'));

		assert.deepStrictEqual({ address, connectCalls }, { address: 'ssh:me', connectCalls: 0 });
	});
});
