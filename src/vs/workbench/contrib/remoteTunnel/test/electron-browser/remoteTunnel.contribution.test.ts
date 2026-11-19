/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ITunnelApplicationConfig } from '../../../../../base/common/product.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { AgentHostRemoteConnectionsSettingId } from '../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INativeEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLoggerService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IQuickInputHideEvent, IQuickInputService, IQuickPick, IQuickPickItem, QuickInputHideReason } from '../../../../../platform/quickinput/common/quickInput.js';
import { INACTIVE_TUNNEL_MODE, IRemoteTunnelService, type ActiveTunnelMode, type TunnelStatus } from '../../../../../platform/remoteTunnel/common/remoteTunnel.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IAuthenticationProvider, AuthenticationSession, IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { RemoteTunnelCommandIds, RemoteTunnelWorkbenchContribution } from '../../electron-browser/remoteTunnel.contribution.js';
import { NotificationService } from '../../../../services/notification/common/notificationService.js';
import { TestProgressService } from '../../../../test/browser/workbenchTestServices.js';
import { testIWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { executeToggleRemoteConnections } from '../../../../contrib/chat/electron-browser/tunnelHost.contribution.js';

const tunnelApplicationConfig: ITunnelApplicationConfig = {
	authenticationProviders: {
		github: { scopes: ['user:email'] },
	},
	editorWebUrl: '',
	extension: { extensionId: 'ms-vscode.remote-server', friendlyName: 'Remote Tunnels' },
};

const githubSession: AuthenticationSession = {
	id: 'github-session',
	accessToken: 'github-token',
	account: { id: 'github-account', label: 'GitHub Account' },
	scopes: ['user:email'],
};

class TestAuthenticationService extends mock<IAuthenticationService>() {
	override readonly declaredProviders = [{ id: 'github', label: 'GitHub' }];
	readonly requestedSessions: Array<{ providerId: string; scopes: readonly string[] | undefined }> = [];
	readonly createdSessions: Array<{ providerId: string; scopes: readonly string[] }> = [];

	private readonly provider = new class extends mock<IAuthenticationProvider>() {
		override readonly id = 'github';
		override readonly label = 'GitHub';
		override readonly supportsMultipleAccounts = false;
	};

	constructor(private readonly sessions: readonly AuthenticationSession[], private readonly createdSession = githubSession) {
		super();
	}

	override getProvider(): IAuthenticationProvider {
		return this.provider;
	}

	override async getSessions(...[providerId, scopes]: Parameters<IAuthenticationService['getSessions']>): Promise<readonly AuthenticationSession[]> {
		this.requestedSessions.push({ providerId, scopes: Array.isArray(scopes) ? scopes : undefined });
		return this.sessions;
	}

	override async createSession(...[providerId, scopes]: Parameters<IAuthenticationService['createSession']>): Promise<AuthenticationSession> {
		this.createdSessions.push({ providerId, scopes: Array.isArray(scopes) ? scopes : [] });
		return this.createdSession;
	}
}

class TestQuickInputService extends mock<IQuickInputService>() {
	createQuickPickCalls = 0;

	override createQuickPick<T extends IQuickPickItem>(options: { useSeparators: true }): IQuickPick<T, { useSeparators: true }>;
	override createQuickPick<T extends IQuickPickItem>(options?: { useSeparators: boolean }): IQuickPick<T, { useSeparators: false }>;
	override createQuickPick<T extends IQuickPickItem>(): never {
		this.createQuickPickCalls++;
		throw new Error('Unexpected quick pick');
	}
}

/** Dismisses every quick pick as soon as it is shown. */
class DismissingQuickInputService extends mock<IQuickInputService>() {
	override createQuickPick<T extends IQuickPickItem>(options: { useSeparators: true }): IQuickPick<T, { useSeparators: true }>;
	override createQuickPick<T extends IQuickPickItem>(options?: { useSeparators: boolean }): IQuickPick<T, { useSeparators: false }>;
	override createQuickPick<T extends IQuickPickItem>(): IQuickPick<T, { useSeparators: true }> | IQuickPick<T, { useSeparators: false }> {
		const onDidHide = new Emitter<IQuickInputHideEvent>();
		return upcastPartial<IQuickPick<T, { useSeparators: true }>>({
			onDidHide: onDidHide.event,
			onDidAccept: Event.None,
			show: () => onDidHide.fire({ reason: QuickInputHideReason.Gesture }),
			dispose: () => onDidHide.dispose(),
		});
	}
}

class TestRemoteTunnelService extends mock<IRemoteTunnelService>() {
	override readonly onDidChangeTunnelStatus = Event.None;
	override readonly onDidChangeMode = Event.None;
	override readonly onDidTokenFailed = Event.None;
	readonly startedModes: ActiveTunnelMode[] = [];

	override async getMode() {
		return INACTIVE_TUNNEL_MODE;
	}

	override async getTunnelStatus(): Promise<TunnelStatus> {
		return { type: 'disconnected' };
	}

	override async initialize(): Promise<TunnelStatus> {
		return { type: 'disconnected' };
	}

	override async startTunnel(mode: ActiveTunnelMode): Promise<TunnelStatus> {
		this.startedModes.push(mode);
		return {
			type: 'connected',
			info: { tunnelName: 'test-tunnel', isAttached: false },
			serviceInstallFailed: false,
		};
	}

	override async getTunnelName(): Promise<string | undefined> {
		return undefined;
	}
}

class TestEnvironmentService extends mock<INativeEnvironmentService>() {
	override readonly logsHome = URI.parse('test:///logs');
	override readonly userHome = URI.file('/test/home');
}

class TestExtensionService extends mock<IExtensionService>() {
	override async whenInstalledExtensionsRegistered(): Promise<boolean> {
		return true;
	}

	override async getExtension() {
		return undefined;
	}
}

class TestDialogService extends mock<IDialogService>() {
	override async confirm() { return { confirmed: true }; }
}
class TestCommandService extends mock<ICommandService>() { }
class TestWorkspaceContextService extends mock<IWorkspaceContextService>() {
	override getWorkspace() { return testIWorkspace({ id: 'test', folders: [] }); }
}
class TestNotificationService extends mock<INotificationService>() { }

function createContribution(store: Pick<DisposableStore, 'add'>, authenticationService: TestAuthenticationService, quickInputService: IQuickInputService, remoteTunnelService: TestRemoteTunnelService): RemoteTunnelWorkbenchContribution {
	return store.add(new RemoteTunnelWorkbenchContribution(
		authenticationService,
		new TestDialogService(),
		new TestExtensionService(),
		store.add(new MockContextKeyService()),
		new class extends mock<IProductService>() {
			override readonly tunnelApplicationName = 'Code';
			override readonly tunnelApplicationConfig = tunnelApplicationConfig;
		},
		store.add(new InMemoryStorageService()),
		store.add(new NullLoggerService()),
		quickInputService,
		new TestEnvironmentService(),
		remoteTunnelService,
		new TestCommandService(),
		new TestWorkspaceContextService(),
		new TestProgressService(),
		new TestNotificationService(),
	));
}

suite('RemoteTunnelWorkbenchContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('declining preview propagates cancellation through the sharing toggle without starting a tunnel', async () => {
		const authenticationService = new TestAuthenticationService([githubSession]);
		const quickInputService = new TestQuickInputService();
		const remoteTunnelService = new TestRemoteTunnelService();
		createContribution(store, authenticationService, quickInputService, remoteTunnelService);
		const instantiation = store.add(new TestInstantiationService());
		const storageService = store.add(new InMemoryStorageService());
		instantiation.set(IStorageService, storageService);
		instantiation.set(IRemoteTunnelService, remoteTunnelService);
		instantiation.set(IConfigurationService, new TestConfigurationService({ [AgentHostRemoteConnectionsSettingId]: 'devTunnel' }));
		instantiation.set(INotificationService, new TestNotificationService());
		instantiation.set(IClipboardService, new class extends mock<IClipboardService>() { }());
		instantiation.set(IProductService, new class extends mock<IProductService>() { }());
		instantiation.set(IQuickInputService, quickInputService);
		let confirmations = 0;
		instantiation.set(IDialogService, new class extends mock<IDialogService>() {
			override async confirm() { confirmations++; return { confirmed: false }; }
		}());
		const commands: string[] = [];
		instantiation.stub(ICommandService, {}, 'executeCommand', async (id: string) => {
			commands.push(id);
			assert.strictEqual(id, RemoteTunnelCommandIds.turnOn);
			return instantiation.invokeFunction(CommandsRegistry.getCommand(id)!.handler);
		});
		const result = await instantiation.invokeFunction(executeToggleRemoteConnections);
		assert.deepStrictEqual({
			result, confirmations, commands, startedModes: remoteTunnelService.startedModes,
			quickPicks: quickInputService.createQuickPickCalls, authentication: authenticationService.requestedSessions,
		}, { result: 'canceled', confirmations: 1, commands: [RemoteTunnelCommandIds.turnOn], startedModes: [], quickPicks: 0, authentication: [] });
	});

	test('dismissing the account picker cancels without starting a tunnel or reporting a failure', async () => {
		const remoteTunnelService = new TestRemoteTunnelService();
		const quickInputService = new DismissingQuickInputService();
		createContribution(store, new TestAuthenticationService([githubSession]), quickInputService, remoteTunnelService);
		const instantiation = store.add(new TestInstantiationService());
		instantiation.set(IStorageService, store.add(new InMemoryStorageService()));
		// Reporting a failure would call these services' missing notify and executeCommand methods and throw.
		instantiation.set(INotificationService, new TestNotificationService());
		instantiation.set(ICommandService, new TestCommandService());
		instantiation.set(IClipboardService, new class extends mock<IClipboardService>() { }());
		instantiation.set(IDialogService, new TestDialogService());
		instantiation.set(IQuickInputService, quickInputService);
		instantiation.set(IProductService, new class extends mock<IProductService>() { }());
		const result = await instantiation.invokeFunction(CommandsRegistry.getCommand(RemoteTunnelCommandIds.turnOn)!.handler, { showServiceOption: false });
		assert.deepStrictEqual({ result, startedModes: remoteTunnelService.startedModes }, { result: 'canceled', startedModes: [] });
	});

	for (const hasLink of [false, true]) {
		test(`preserves success notification links without interpreting tunnel names (web link: ${hasLink})`, async () => {
			const tunnelName = 'test-[Open](command:unexpected)';
			const authenticationService = new TestAuthenticationService([githubSession]);
			const quickInputService = new TestQuickInputService();
			const remoteTunnelService = new class extends TestRemoteTunnelService {
				override async startTunnel(): Promise<TunnelStatus> {
					return {
						type: 'connected',
						info: { tunnelName, isAttached: false, ...(hasLink ? { link: 'https://example.com/tunnel', domain: 'example.com' } : {}) },
						serviceInstallFailed: false,
					};
				}
			};
			createContribution(store, authenticationService, quickInputService, remoteTunnelService);
			const storageService = store.add(new InMemoryStorageService());
			const notificationService = store.add(new NotificationService(storageService));
			store.add(toDisposable(() => {
				for (const notification of [...notificationService.model.notifications]) {
					notification.close();
				}
			}));
			const instantiation = store.add(new TestInstantiationService());
			const copied: string[] = [];
			instantiation.set(INotificationService, notificationService);
			instantiation.set(IStorageService, storageService);
			instantiation.set(IClipboardService, new class extends mock<IClipboardService>() {
				override async writeText(text: string): Promise<void> { copied.push(text); }
			});
			instantiation.set(ICommandService, new TestCommandService());
			instantiation.set(IDialogService, new TestDialogService());
			instantiation.set(IQuickInputService, quickInputService);
			instantiation.set(IProductService, new class extends mock<IProductService>() { });
			await instantiation.invokeFunction(CommandsRegistry.getCommand(RemoteTunnelCommandIds.turnOn)!.handler, {
				showServiceOption: false,
				authenticationProviderId: 'github',
			});

			const notification = notificationService.model.notifications[0];
			if (hasLink) {
				await notification.actions!.primary![0].run();
			}
			assert.deepStrictEqual({
				includesLiteralName: notification.message.linkedText.toString().includes(tunnelName),
				links: notification.message.linkedText.nodes.filter(node => typeof node !== 'string'),
				copied,
			}, {
				includesLiteralName: true,
				links: hasLink ? [
					{ label: tunnelName, href: `command:${RemoteTunnelCommandIds.configure}` },
					{ label: 'example.com', href: 'https://example.com/tunnel/test/home' },
					{ label: 'Remote Tunnels', href: 'https://code.visualstudio.com/docs/remote/tunnels' },
					{ label: 'configure', href: `command:${RemoteTunnelCommandIds.manage}` },
					{ label: 'turn off', href: `command:${RemoteTunnelCommandIds.turnOff}` },
				] : [
					{ label: 'configure', href: `command:${RemoteTunnelCommandIds.configure}` },
					{ label: 'turn off', href: `command:${RemoteTunnelCommandIds.turnOff}` },
				],
				copied: hasLink ? ['https://example.com/tunnel/test/home'] : [],
			});
		});
	}

	test('turn off waits for the tunnel to stop', async () => {
		const stopped = new DeferredPromise<void>();
		const remoteTunnelService = new class extends TestRemoteTunnelService {
			override stopTunnel(): Promise<void> {
				return stopped.p;
			}
		};
		createContribution(store, new TestAuthenticationService([githubSession]), new TestQuickInputService(), remoteTunnelService);
		const instantiation = store.add(new TestInstantiationService());
		let resolved = false;
		const turnOff = Promise.resolve(instantiation.invokeFunction(CommandsRegistry.getCommand(RemoteTunnelCommandIds.turnOff)!.handler)).then(() => { resolved = true; });

		await timeout(0);
		const beforeStop = resolved;
		stopped.complete();
		await turnOff;

		assert.deepStrictEqual({ beforeStop, afterStop: resolved }, { beforeStop: false, afterStop: true });
	});

	test('starts Agents remote access with an existing GitHub session without an authentication quick pick', async () => {
		const authenticationService = new TestAuthenticationService([githubSession]);
		const quickInputService = new TestQuickInputService();
		const remoteTunnelService = new TestRemoteTunnelService();
		const contribution = createContribution(store, authenticationService, quickInputService, remoteTunnelService);

		await contribution['startTunnel'](false, 'github');

		assert.deepStrictEqual({
			quickPickCalls: quickInputService.createQuickPickCalls,
			requestedSessions: authenticationService.requestedSessions,
			createdSessions: authenticationService.createdSessions,
			startedModes: remoteTunnelService.startedModes,
		}, {
			quickPickCalls: 0,
			requestedSessions: [{ providerId: 'github', scopes: ['user:email'] }],
			createdSessions: [],
			startedModes: [{
				active: true,
				asService: false,
				session: {
					providerId: 'github',
					sessionId: 'github-session',
					token: 'github-token',
					accountLabel: 'GitHub Account',
				},
			}],
		});
	});

	test('signs in to GitHub directly for Agents remote access when no session exists', async () => {
		const authenticationService = new TestAuthenticationService([]);
		const quickInputService = new TestQuickInputService();
		const remoteTunnelService = new TestRemoteTunnelService();
		const contribution = createContribution(store, authenticationService, quickInputService, remoteTunnelService);

		await contribution['startTunnel'](false, 'github');

		assert.deepStrictEqual({
			quickPickCalls: quickInputService.createQuickPickCalls,
			createdSessions: authenticationService.createdSessions,
			startedModes: remoteTunnelService.startedModes,
		}, {
			quickPickCalls: 0,
			createdSessions: [{ providerId: 'github', scopes: ['user:email'] }],
			startedModes: [{
				active: true,
				asService: false,
				session: {
					providerId: 'github',
					sessionId: 'github-session',
					token: 'github-token',
					accountLabel: 'GitHub Account',
				},
			}],
		});
	});
});
