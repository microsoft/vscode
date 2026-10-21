/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ITunnelApplicationConfig } from '../../../../../base/common/product.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INativeEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLoggerService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IProgress, IProgressService, IProgressStep } from '../../../../../platform/progress/common/progress.js';
import { IQuickInputService, IQuickPick, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { INACTIVE_TUNNEL_MODE, IRemoteTunnelService, type ActiveTunnelMode, type TunnelStatus } from '../../../../../platform/remoteTunnel/common/remoteTunnel.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IAuthenticationProvider, AuthenticationSession, AuthenticationSessionsChangeEvent, IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { RemoteTunnelCommandIds, RemoteTunnelWorkbenchContribution } from '../../electron-browser/remoteTunnel.contribution.js';
import { NotificationService } from '../../../../services/notification/common/notificationService.js';

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
	override readonly onDidChangeSessions: Event<{ providerId: string; label: string; event: AuthenticationSessionsChangeEvent }>;

	private readonly provider = new class extends mock<IAuthenticationProvider>() {
		override readonly id = 'github';
		override readonly label = 'GitHub';
		override readonly supportsMultipleAccounts = false;
	};

	constructor(
		private sessions: readonly AuthenticationSession[],
		private readonly createdSession = githubSession,
		onDidChangeSessions: Event<{ providerId: string; label: string; event: AuthenticationSessionsChangeEvent }> = Event.None,
	) {
		super();
		this.onDidChangeSessions = onDidChangeSessions;
	}

	setSessions(sessions: readonly AuthenticationSession[]) {
		this.sessions = sessions;
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

class TestRemoteTunnelService extends mock<IRemoteTunnelService>() {
	override readonly onDidChangeTunnelStatus: Event<TunnelStatus>;
	override readonly onDidChangeMode = Event.None;
	override readonly onDidTokenFailed: Event<IRemoteTunnelSession | undefined>;
	readonly startedModes: ActiveTunnelMode[] = [];
	readonly stoppedModes: boolean[] = [];
	activeMode: ActiveTunnelMode | { active: false } = INACTIVE_TUNNEL_MODE;
	tunnelStatus: TunnelStatus = { type: 'disconnected' };

	constructor(
		onDidChangeTunnelStatus: Event<TunnelStatus> = Event.None,
		onDidTokenFailed: Event<IRemoteTunnelSession | undefined> = Event.None,
	) {
		super();
		this.onDidChangeTunnelStatus = onDidChangeTunnelStatus;
		this.onDidTokenFailed = onDidTokenFailed;
	}

	override async getMode() {
		return this.activeMode;
	}

	override async getTunnelStatus(): Promise<TunnelStatus> {
		return this.tunnelStatus;
	}

	override async initialize(): Promise<TunnelStatus> {
		return this.tunnelStatus;
	}

	override async startTunnel(mode: ActiveTunnelMode): Promise<TunnelStatus> {
		this.startedModes.push(mode);
		this.activeMode = mode;
		this.tunnelStatus = {
			type: 'connected',
			info: { tunnelName: 'test-tunnel', isAttached: false },
			serviceInstallFailed: false,
		};
		return this.tunnelStatus;
	}

	override async stopTunnel(): Promise<void> {
		this.stoppedModes.push(true);
		this.activeMode = INACTIVE_TUNNEL_MODE;
		this.tunnelStatus = { type: 'disconnected' };
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

class TestProgressService extends mock<IProgressService>() {
	override async withProgress<R>(_options: Parameters<IProgressService['withProgress']>[0], task: (progress: IProgress<IProgressStep>) => Promise<R>): Promise<R> {
		return task({ report() { } });
	}
}

class TestDialogService extends mock<IDialogService>() {
	override async confirm() { return { confirmed: true }; }
}
class TestCommandService extends mock<ICommandService>() { }
class TestWorkspaceContextService extends mock<IWorkspaceContextService>() {
	override getWorkspace() { return { id: 'test', folders: [] }; }
}
class TestNotificationService extends mock<INotificationService>() { }

function createContribution(store: Pick<DisposableStore, 'add'>, authenticationService: TestAuthenticationService, quickInputService: TestQuickInputService, remoteTunnelService: TestRemoteTunnelService): RemoteTunnelWorkbenchContribution {
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

	test('auto-recovers and restarts tunnel when onDidTokenFailed fires with refreshed session token', async () => {
		const tokenFailedEmitter = store.add(new Emitter<IRemoteTunnelSession | undefined>());
		const initialSession: AuthenticationSession = {
			...githubSession,
			accessToken: 'initial-stale-token',
		};
		const refreshedSession: AuthenticationSession = {
			...githubSession,
			accessToken: 'refreshed-fresh-token',
		};
		const authenticationService = new TestAuthenticationService([initialSession]);
		const quickInputService = new TestQuickInputService();
		const remoteTunnelService = new TestRemoteTunnelService(Event.None, tokenFailedEmitter.event);
		createContribution(store, authenticationService, quickInputService, remoteTunnelService);

		remoteTunnelService.activeMode = {
			active: true,
			asService: false,
			session: {
				providerId: 'github',
				sessionId: initialSession.id,
				token: initialSession.accessToken,
				accountLabel: initialSession.account.label,
			},
		};

		authenticationService.setSessions([refreshedSession]);
		tokenFailedEmitter.fire(remoteTunnelService.activeMode.session);
		await new Promise<void>(resolve => setImmediate(resolve));

		assert.strictEqual(remoteTunnelService.startedModes.length, 1);
		assert.strictEqual(remoteTunnelService.startedModes[0].session.token, 'refreshed-fresh-token');
	});

	test('restarts tunnel with updated token when onDidChangeSessions fires for active session', async () => {
		const sessionsEmitter = store.add(new Emitter<{ providerId: string; label: string; event: AuthenticationSessionsChangeEvent }>());
		const initialSession: AuthenticationSession = {
			...githubSession,
			accessToken: 'old-token',
		};
		const updatedSession: AuthenticationSession = {
			...githubSession,
			accessToken: 'new-token',
		};
		const authenticationService = new TestAuthenticationService([initialSession], undefined, sessionsEmitter.event);
		const quickInputService = new TestQuickInputService();
		const remoteTunnelService = new TestRemoteTunnelService();
		createContribution(store, authenticationService, quickInputService, remoteTunnelService);

		remoteTunnelService.activeMode = {
			active: true,
			asService: false,
			session: {
				providerId: 'github',
				sessionId: initialSession.id,
				token: initialSession.accessToken,
				accountLabel: initialSession.account.label,
			},
		};

		sessionsEmitter.fire({
			providerId: 'github',
			label: 'GitHub',
			event: {
				added: [],
				removed: [],
				changed: [updatedSession],
			},
		});
		await new Promise<void>(resolve => setImmediate(resolve));

		assert.strictEqual(remoteTunnelService.startedModes.length, 1);
		assert.strictEqual(remoteTunnelService.startedModes[0].session.token, 'new-token');
	});

	test('stops tunnel when onDidChangeSessions removes active session', async () => {
		const sessionsEmitter = store.add(new Emitter<{ providerId: string; label: string; event: AuthenticationSessionsChangeEvent }>());
		const authenticationService = new TestAuthenticationService([githubSession], undefined, sessionsEmitter.event);
		const quickInputService = new TestQuickInputService();
		const remoteTunnelService = new TestRemoteTunnelService();
		createContribution(store, authenticationService, quickInputService, remoteTunnelService);

		remoteTunnelService.activeMode = {
			active: true,
			asService: false,
			session: {
				providerId: 'github',
				sessionId: githubSession.id,
				token: githubSession.accessToken,
				accountLabel: githubSession.account.label,
			},
		};

		sessionsEmitter.fire({
			providerId: 'github',
			label: 'GitHub',
			event: {
				added: [],
				removed: [githubSession],
				changed: [],
			},
		});
		await new Promise<void>(resolve => setImmediate(resolve));

		assert.strictEqual(remoteTunnelService.stoppedModes.length, 1);
	});
});
