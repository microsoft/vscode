/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { OS } from '../../../../../../base/common/platform.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { URI } from '../../../../../../base/common/uri.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { GitHubEnvironmentsAvailableContext, GitHubEnvironmentsEnabledSettingId } from '../../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { ISSHRemoteAgentHostService, SSHAuthMethod, type ISSHAgentHostConfig } from '../../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { MockKeybindingService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
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
import { ISessionWorkspace, SESSION_WORKSPACE_GROUP_REMOTE } from '../../../../../services/sessions/common/session.js';
import { SessionWorkspacePickerGroupContext } from '../../../../../common/contextkeys.js';
import { ConnectMissionControlEnvironmentCommand } from '../../../../../../workbench/contrib/chat/browser/remoteAgentHost/missionControlEnvironmentActions.js';
import { TestNotificationService } from '../../../../../../platform/notification/test/common/testNotificationService.js';
import { isIMenuItem, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../../platform/actions/common/menuService.js';
import { Menus } from '../../../../../browser/menus.js';
import '../../browser/missionControlAgentHostContribution.js';
import { getSessionCreationEnvironments } from '../../../../chat/browser/sessionEnvironmentPicker.js';
import { IWSLRemoteAgentHostService } from '../../../../../../platform/agentHost/common/wslRemoteAgentHost.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { ChatContextKeys } from '../../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { getVisibleRemoteKinds, RemoteKind } from '../../browser/remotesModel.js';

suite('Remote Agent Host actions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('Dev Tunnels uses the standard remote icon', () => {
		assert.deepStrictEqual(MenuRegistry.getCommand(RemoteAgentHostCommandIds.connectViaTunnel)?.icon, Codicon.remote);
	});

	test('remote connection picker labels end with an ellipsis', () => {
		assert.deepStrictEqual([
			RemoteAgentHostCommandIds.connectViaMissionControl,
			RemoteAgentHostCommandIds.connectViaTunnel,
			RemoteAgentHostCommandIds.connectViaSSH,
			RemoteAgentHostCommandIds.connectViaWSL,
		].map(id => {
			const command = MenuRegistry.getMenuItems(Menus.SessionWorkspaceManage).filter(isIMenuItem).find(item => item.command.id === id)?.command;
			const title = command?.shortTitle ?? command?.title;
			return typeof title === 'string' ? title : title?.value;
		}), ['GitHub Environments...', 'Dev Tunnels...', 'SSH...', 'WSL...']);
	});

	for (const environmentsEnabled of [false, true]) {
		test(`Remotes sections match the registered Environment picker order (environments: ${environmentsEnabled})`, () => {
			const configuration = new TestConfigurationService({
				[RemoteAgentHostsEnabledSettingId]: true,
				[GitHubEnvironmentsEnabledSettingId]: environmentsEnabled,
				'chat.disableAIFeatures': false,
			});
			store.add(configuration.onDidChangeConfigurationEmitter);
			const context = store.add(new ContextKeyService(configuration));
			ChatContextKeys.enabled.bindTo(context).set(true);
			GitHubEnvironmentsAvailableContext.bindTo(context).set(environmentsEnabled);
			SessionWorkspacePickerGroupContext.bindTo(context).set(SESSION_WORKSPACE_GROUP_REMOTE);
			const menus = store.add(new MenuService(new class extends mock<ICommandService>() { }(), new MockKeybindingService(), store.add(new InMemoryStorageService())));
			const kinds = new Map<string, RemoteKind>([
				[RemoteAgentHostCommandIds.connectViaMissionControl, 'environment'],
				[RemoteAgentHostCommandIds.connectViaTunnel, 'tunnel'],
				[RemoteAgentHostCommandIds.connectViaWSL, 'wsl'],
				[RemoteAgentHostCommandIds.connectViaSSH, 'ssh'],
			]);
			const pickerKinds = menus.getMenuActions(Menus.SessionWorkspaceManage, context)
				.flatMap(([, actions]) => actions.flatMap(action => kinds.has(action.id) ? [kinds.get(action.id)!] : []));
			assert.deepStrictEqual(getVisibleRemoteKinds(OS, environmentsEnabled), pickerKinds);
		});
	}

	for (const outcome of ['selected', 'cancelled-connection', 'cancelled-folder', 'missing-provider', 'empty-workspace'] as const) {
		test(`Mission Control environment selection opens its folder picker: ${outcome}`, async () => {
			const instantiation = store.add(new TestInstantiationService());
			const folder = URI.parse('vscode-agent-host://cloudsandbox__environment/c:/Users/test/code/project');
			const calls: object[] = [];
			const errors: string[] = [];
			const visible = observableValue('visible', false);
			const provider = upcastPartial<IAgentHostSessionsProvider>({
				id: 'agenthost-environment',
				label: 'Environment', icon: Codicon.remote, environment: { id: 'remote', label: 'Remote' },
				connectionStatus: observableValue('connected', RemoteAgentHostConnectionStatus.connected),
				isVisibleInEnvironmentPicker: visible,
				showInEnvironmentPicker: () => { visible.set(true, undefined); calls.push({ show: true }); },
				remoteAddress: 'cloudsandbox:environment',
				browseActions: [{
					label: 'Folders', icon: Codicon.folder, providerId: 'agenthost-environment',
					run: async () => {
						calls.push({ browse: true });
						return outcome === 'cancelled-folder' ? undefined : upcastPartial<ISessionWorkspace>({
							folders: outcome === 'empty-workspace' ? [] : [{ root: folder, workingDirectory: folder, name: 'Project', description: undefined }],
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
						assert.strictEqual(getSessionCreationEnvironments([provider])[0]?.id, provider.id);
						calls.push({ selected: uri.toString(), providerId: options?.providerId });
						return 'applied';
					},
				}),
			});
			const onBack = () => { };
			await instantiation.invokeFunction(accessor => CommandsRegistry.getCommand(RemoteAgentHostCommandIds.connectViaMissionControl)!.handler(accessor, onBack));
			assert.deepStrictEqual({ calls, errors, visible: visible.get() }, {
				calls: [
					{ command: ConnectMissionControlEnvironmentCommand, onBack },
					...(outcome === 'selected' || outcome === 'cancelled-folder' || outcome === 'empty-workspace' ? [{ browse: true }] : []),
					...(outcome === 'selected' ? [{ show: true }, { openNewSession: true }, { selected: folder.toString(), providerId: provider.id }] : []),
				],
				errors: outcome === 'missing-provider' ? ['Error: The connected environment is not available for folder browsing.'] : [],
				visible: outcome === 'selected',
			});
		});
	}

	test('WSL selection reveals the host and awaits the new session before selecting its workspace', async () => {
		const instantiation = store.add(new TestInstantiationService());
		const opened = new DeferredPromise<void>();
		const opening = new DeferredPromise<void>();
		const calls: string[] = [];
		const folder = URI.parse('vscode-agent-host://wsl__Ubuntu/project');
		const provider = upcastPartial<IAgentHostSessionsProvider>({
			id: 'agenthost-wsl', remoteAddress: 'wsl:Ubuntu',
			showInEnvironmentPicker: () => { calls.push('show'); },
			browseActions: [{
				label: 'Folders', icon: Codicon.folder, providerId: 'agenthost-wsl',
				run: async () => upcastPartial<ISessionWorkspace>({ folders: [{ root: folder, workingDirectory: folder, name: 'project', description: undefined }] }),
			}],
		});
		instantiation.stub(IWSLRemoteAgentHostService, {
			isWSLAvailable: async () => true,
			listDistros: async () => [{ name: 'Ubuntu', isDefault: true, isRunning: true, version: 2 }],
			connect: async () => { calls.push('connect'); return upcastPartial<Awaited<ReturnType<IWSLRemoteAgentHostService['connect']>>>({}); },
		});
		instantiation.stub(INotificationService, new TestNotificationService());
		instantiation.stub(IQuickInputService, {});
		instantiation.stub(IOpenerService, {});
		instantiation.stub(IInstantiationService, instantiation);
		instantiation.stub(ILogService, new NullLogService());
		instantiation.stub(ISessionsProvidersService, { getProviders: () => [provider] });
		instantiation.stub(ISessionsService, {
			activeSession: observableValue<IActiveSession | undefined>('activeSession', undefined),
			openNewSession: async () => {
				calls.push('open');
				opening.complete();
				await opened.p;
				return { session: undefined, trustDeclined: false };
			},
		});
		instantiation.stub(ISessionsPartService, {
			getSessionView: () => upcastPartial<SessionView>({
				selectWorkspace: () => { calls.push('select'); return 'applied'; },
			}),
		});
		const run = instantiation.invokeFunction(accessor => CommandsRegistry.getCommand(RemoteAgentHostCommandIds.connectViaWSL)!.handler(accessor));
		await opening.p;
		const before = [...calls];
		opened.complete();
		await run;
		assert.deepStrictEqual({ before, after: calls }, { before: ['connect', 'show', 'open'], after: ['connect', 'show', 'open', 'select'] });
	});

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
