/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ISSHRemoteAgentHostService, SSHAuthMethod, type ISSHAgentHostConfig } from '../../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { connectWithProgress } from '../../browser/remoteAgentHostActions.js';

suite('Remote Agent Host actions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

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
