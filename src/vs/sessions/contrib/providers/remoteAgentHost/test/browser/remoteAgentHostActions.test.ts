/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ISSHRemoteAgentHostService, SSHAuthMethod, type ISSHAgentHostConfig } from '../../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { connectWithProgress } from '../../browser/remoteAgentHostActions.js';
import { INotificationTelemetrySource } from '../../../../../../platform/notification/common/notificationTelemetry.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { NotificationService } from '../../../../../../workbench/services/notification/common/notificationService.js';
import { NotificationChangeType } from '../../../../../../workbench/common/notifications.js';

suite('Remote Agent Host actions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

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
