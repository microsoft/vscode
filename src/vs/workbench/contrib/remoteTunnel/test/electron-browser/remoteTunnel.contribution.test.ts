/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ITunnelApplicationConfig } from '../../../../../base/common/product.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { INativeEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLoggerService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IProgress, IProgressService, IProgressStep } from '../../../../../platform/progress/common/progress.js';
import { IQuickInputService, IQuickPick, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { INACTIVE_TUNNEL_MODE, IRemoteTunnelService, type ActiveTunnelMode, type TunnelStatus } from '../../../../../platform/remoteTunnel/common/remoteTunnel.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IAuthenticationProvider, AuthenticationSession, IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { RemoteTunnelWorkbenchContribution } from '../../electron-browser/remoteTunnel.contribution.js';

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

class TestDialogService extends mock<IDialogService>() { }
class TestCommandService extends mock<ICommandService>() { }
class TestWorkspaceContextService extends mock<IWorkspaceContextService>() { }
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
