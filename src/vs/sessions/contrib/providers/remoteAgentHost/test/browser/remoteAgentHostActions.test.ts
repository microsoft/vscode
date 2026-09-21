/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ISSHRemoteAgentHostService, SSHAuthMethod, type ISSHAgentHostConfig } from '../../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { IDialogService, IInputResult } from '../../../../../../platform/dialogs/common/dialogs.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { connectWithProgress, RemoteAgentHostCommandIds } from '../../browser/remoteAgentHostActions.js';
import { IAgentHostSessionsProvider } from '../../../../../common/agentHostSessionsProvider.js';
import { IOpenNewSessionOptions, ISessionsService } from '../../../../../services/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISession, ISessionType } from '../../../../../services/sessions/common/session.js';

suite('Remote Agent Host actions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function repositoryCommand(input: IInputResult, supportsRevision: boolean, supported = true) {
		const instantiationService = store.add(new TestInstantiationService());
		const opened: (IOpenNewSessionOptions | undefined)[] = [];
		const errors: string[] = [];
		const inputCounts: number[] = [];
		const provider = upcastPartial<IAgentHostSessionsProvider>({
			id: 'agenthost-test',
			label: 'Test Host',
			connectionStatus: constObservable(RemoteAgentHostConnectionStatus.connected),
			sessionTypes: [upcastPartial<ISessionType>({ id: 'copilot', label: 'Copilot', supportsRepositoryPreparation: supported, supportsRepositoryRevision: supportsRevision })],
		});
		instantiationService.stub(ISessionsProvidersService, { getProviders: () => [provider] });
		instantiationService.stub(IQuickInputService, {});
		instantiationService.stub(IDialogService, { input: async options => { inputCounts.push(options.inputs.length); return input; } });
		instantiationService.stub(INotificationService, { error: error => { errors.push(String(error)); } });
		instantiationService.stub(ISessionsService, {
			openNewSession: async options => {
				opened.push(options);
				return { session: upcastPartial<ISession>({}), trustDeclined: false };
			},
		});
		const command = CommandsRegistry.getCommand(RemoteAgentHostCommandIds.newRepositorySession);
		assert.ok(command);
		return { opened, errors, inputCounts, run: () => instantiationService.invokeFunction(command.handler) };
	}

	for (const supportsRevision of [false, true]) {
		test(`repository command opens a typed subdirectory draft (revision support ${supportsRevision})`, async () => {
			const source = 'https://example.com:8443/team/app.git';
			const h = repositoryCommand({ confirmed: true, values: [source, ...(supportsRevision ? ['main'] : []), 'packages/api'] }, supportsRevision);
			await h.run();
			assert.deepStrictEqual({ opened: h.opened, errors: h.errors, inputCounts: h.inputCounts }, {
				opened: [{
					folderUri: URI.parse(source),
					providerId: 'agenthost-test',
					sessionTypeId: 'copilot',
					repositories: [{ source: URI.parse(source), ...(supportsRevision ? { revision: 'main' } : {}), subdirectory: 'packages/api' }],
					cancelRestore: true,
				}],
				errors: [],
				inputCounts: [supportsRevision ? 3 : 2],
			});
		});
	}

	test('repository command cancellation does not open a session', async () => {
		const h = repositoryCommand({ confirmed: false }, true);
		await h.run();
		assert.deepStrictEqual({ opened: h.opened, errors: h.errors }, { opened: [], errors: [] });
	});

	for (const values of [
		['https://user@example.com/team/app', 'main', ''],
		['https://example.com/team/app', 'main', '../outside'],
		['file:///client/repository', '', ''],
	]) {
		test(`repository command reports invalid inputs instead of creating a draft (${values.join(',')})`, async () => {
			const h = repositoryCommand({ confirmed: true, values }, true);
			await h.run();
			assert.deepStrictEqual({ opened: h.opened.length, errorCount: h.errors.length }, { opened: 0, errorCount: 1 });
		});
	}

	test('repository command does not offer inputs when no connected host supports preparation', async () => {
		const h = repositoryCommand({ confirmed: true, values: ['https://example.com/team/app'] }, false, false);
		await h.run();
		assert.deepStrictEqual({ opened: h.opened.length, inputCounts: h.inputCounts, errors: h.errors }, {
			opened: 0,
			inputCounts: [],
			errors: ['Error: Connect to an agent host that supports repository preparation before starting a repository session.'],
		});
	});

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
