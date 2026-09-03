/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Action } from '../../../../../base/common/actions.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationOverrides, IConfigurationService, IConfigurationUpdateOverrides } from '../../../../../platform/configuration/common/configuration.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IInputOptions, IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { CONFIGURATION_KEY_HOST_NAME, INACTIVE_TUNNEL_MODE, IRemoteTunnelService, type ActiveTunnelMode, type TunnelMode, type TunnelStatus } from '../../../../../platform/remoteTunnel/common/remoteTunnel.js';
import { getRemoteTunnelAccessState, ToggleRemoteConnectionsActionViewItem } from '../../electron-browser/toggleRemoteConnectionsActionViewItem.js';
import { executeToggleRemoteConnections } from '../../electron-browser/tunnelHost.contribution.js';
import { promptToRenameRemoteTunnel } from '../../../remoteTunnel/electron-browser/remoteTunnel.contribution.js';

class TestRemoteTunnelService extends mock<IRemoteTunnelService>() {
	mode: TunnelMode = INACTIVE_TUNNEL_MODE;
	status: TunnelStatus = { type: 'disconnected' };
	private readonly _onDidChangeMode = new Emitter<TunnelMode>();
	override readonly onDidChangeMode = this._onDidChangeMode.event;
	private readonly _onDidChangeTunnelStatus = new Emitter<TunnelStatus>();
	override readonly onDidChangeTunnelStatus = this._onDidChangeTunnelStatus.event;
	private readonly _initialMode = new DeferredPromise<TunnelMode>();
	private readonly _initialStatus = new DeferredPromise<TunnelStatus>();
	private _deferInitialState = false;

	override getMode(): Promise<TunnelMode> {
		return this._deferInitialState ? this._initialMode.p : Promise.resolve(this.mode);
	}

	override getTunnelStatus(): Promise<TunnelStatus> {
		return this._deferInitialState ? this._initialStatus.p : Promise.resolve(this.status);
	}

	deferInitialState(): void {
		this._deferInitialState = true;
	}

	completeInitialState(mode: TunnelMode, status: TunnelStatus): void {
		this._initialMode.complete(mode);
		this._initialStatus.complete(status);
	}

	fireMode(mode: TunnelMode): void {
		this.mode = mode;
		this._onDidChangeMode.fire(mode);
	}

	fireStatus(status: TunnelStatus): void {
		this.status = status;
		this._onDidChangeTunnelStatus.fire(status);
	}

	dispose(): void {
		this._onDidChangeMode.dispose();
		this._onDidChangeTunnelStatus.dispose();
	}
}

class TestCommandService extends mock<ICommandService>() {
	readonly commands: Array<{ id: string; args: unknown[] }> = [];

	override executeCommand<R = unknown>(id: string, ...args: unknown[]): Promise<R | undefined> {
		this.commands.push({ id, args });
		return Promise.resolve<R | undefined>(undefined);
	}
}

class TestQuickInputService extends mock<IQuickInputService>() {
	result: string | undefined;
	options: IInputOptions | undefined;

	override async input(options?: IInputOptions): Promise<string | undefined> {
		this.options = options;
		return this.result;
	}
}

class TestConfigurationService extends mock<IConfigurationService>() {
	readonly updates: Array<{ key: string; value: unknown; target: ConfigurationTarget | undefined }> = [];

	override updateValue(key: string, value: unknown): Promise<void>;
	override updateValue(key: string, value: unknown, target: ConfigurationTarget): Promise<void>;
	override updateValue(key: string, value: unknown, overrides: IConfigurationOverrides | IConfigurationUpdateOverrides): Promise<void>;
	override updateValue(key: string, value: unknown, targetOrOverrides?: ConfigurationTarget | IConfigurationOverrides | IConfigurationUpdateOverrides): Promise<void> {
		this.updates.push({ key, value, target: typeof targetOrOverrides === 'number' ? targetOrOverrides : undefined });
		return Promise.resolve();
	}
}

suite('ToggleRemoteConnectionsActionViewItem', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('derives unified access state from the authoritative remote tunnel state', () => {
		const activeMode: ActiveTunnelMode = {
			active: true,
			asService: false,
			session: { providerId: 'github', sessionId: 'session', accountLabel: 'Account' },
		};

		assert.deepStrictEqual({
			disabled: getRemoteTunnelAccessState(INACTIVE_TUNNEL_MODE, { type: 'disconnected' }),
			connecting: getRemoteTunnelAccessState(activeMode, { type: 'connecting' }),
			connected: getRemoteTunnelAccessState(activeMode, {
				type: 'connected',
				info: { tunnelName: 'my-tunnel', isAttached: false },
				serviceInstallFailed: false,
			}),
			externallyHosted: getRemoteTunnelAccessState(INACTIVE_TUNNEL_MODE, {
				type: 'connected',
				info: { tunnelName: 'external-tunnel', isAttached: true },
				serviceInstallFailed: false,
			}),
		}, {
			disabled: { isSharing: false, isConnecting: false, tunnelName: undefined },
			connecting: { isSharing: false, isConnecting: true, tunnelName: undefined },
			connected: { isSharing: true, isConnecting: false, tunnelName: 'my-tunnel' },
			externallyHosted: { isSharing: true, isConnecting: false, tunnelName: 'external-tunnel' },
		});
	});

	test('does not announce an existing tunnel while initial state loads', async () => {
		const testDisposables = store.add(new DisposableStore());
		const remoteTunnelService = testDisposables.add(new TestRemoteTunnelService());
		const activeMode: ActiveTunnelMode = {
			active: true,
			asService: false,
			session: { providerId: 'github', sessionId: 'session', accountLabel: 'Account' },
		};
		const connectedStatus: TunnelStatus = {
			type: 'connected',
			info: { tunnelName: 'my-tunnel', isAttached: false },
			serviceInstallFailed: false,
		};
		remoteTunnelService.deferInitialState();

		const action = testDisposables.add(new Action('test.toggleRemoteConnections', 'Toggle Remote Connections'));
		const viewItem = testDisposables.add(new ToggleRemoteConnectionsActionViewItem(
			action,
			remoteTunnelService,
			NullHoverService,
			new class extends mock<IProductService>() { }(),
		));
		const container = document.createElement('div');
		viewItem.render(container);

		remoteTunnelService.fireMode(activeMode);
		remoteTunnelService.fireStatus(connectedStatus);
		remoteTunnelService.completeInitialState(INACTIVE_TUNNEL_MODE, { type: 'disconnected' });
		await timeout(0);

		const toast = container.querySelector<HTMLElement>('.tunnel-host-toast');
		assert.deepStrictEqual({
			sharing: container.classList.contains('sharing'),
			toastVisible: toast?.classList.contains('visible') ?? false,
		}, {
			sharing: true,
			toastVisible: false,
		});

		remoteTunnelService.fireStatus({ type: 'disconnected' });
		remoteTunnelService.fireStatus(connectedStatus);

		assert.strictEqual(toast?.classList.contains('visible'), true);
	});

	test('does not announce an initially connected tunnel', async () => {
		const testDisposables = store.add(new DisposableStore());
		const remoteTunnelService = testDisposables.add(new TestRemoteTunnelService());
		remoteTunnelService.mode = {
			active: true,
			asService: false,
			session: { providerId: 'github', sessionId: 'session', accountLabel: 'Account' },
		};
		remoteTunnelService.status = {
			type: 'connected',
			info: { tunnelName: 'my-tunnel', isAttached: false },
			serviceInstallFailed: false,
		};

		const action = testDisposables.add(new Action('test.toggleRemoteConnections', 'Toggle Remote Connections'));
		const viewItem = testDisposables.add(new ToggleRemoteConnectionsActionViewItem(
			action,
			remoteTunnelService,
			NullHoverService,
			new class extends mock<IProductService>() { }(),
		));
		const container = document.createElement('div');
		viewItem.render(container);
		await timeout(0);

		const toast = container.querySelector<HTMLElement>('.tunnel-host-toast');
		assert.deepStrictEqual({
			sharing: container.classList.contains('sharing'),
			toastVisible: toast?.classList.contains('visible') ?? false,
		}, {
			sharing: true,
			toastVisible: false,
		});
	});

	test('executes the Remote Tunnel turn-on and turn-off commands', async () => {
		const activeMode: ActiveTunnelMode = {
			active: true,
			asService: false,
			session: { providerId: 'github', sessionId: 'session', accountLabel: 'Account' },
		};
		const remoteTunnelService = new TestRemoteTunnelService();
		const commandService = new TestCommandService();

		await executeToggleRemoteConnections(remoteTunnelService, commandService);
		remoteTunnelService.mode = activeMode;
		remoteTunnelService.status = {
			type: 'connected',
			info: { tunnelName: 'my-tunnel', isAttached: false },
			serviceInstallFailed: false,
		};
		await executeToggleRemoteConnections(remoteTunnelService, commandService);

		assert.deepStrictEqual(commandService.commands, [
			{ id: 'workbench.remoteTunnel.actions.turnOn', args: [] },
			{ id: 'workbench.remoteTunnel.actions.turnOff', args: [] },
		]);
	});

	test('passes the Agents tunnel start constraints only when requested', async () => {
		const remoteTunnelService = new TestRemoteTunnelService();
		const commandService = new TestCommandService();

		await executeToggleRemoteConnections(remoteTunnelService, commandService, {
			authenticationProviderId: 'github',
			showServiceOption: false,
		});

		assert.deepStrictEqual(commandService.commands, [{
			id: 'workbench.remoteTunnel.actions.turnOn',
			args: [{ authenticationProviderId: 'github', showServiceOption: false }],
		}]);
	});

	test('renames a tunnel through quick input and persists the hostname override', async () => {
		const quickInputService = new TestQuickInputService();
		const configurationService = new TestConfigurationService();
		quickInputService.result = 'renamed-tunnel';

		await promptToRenameRemoteTunnel(quickInputService, configurationService, 'old-tunnel');

		assert.deepStrictEqual({
			input: {
				title: quickInputService.options?.title,
				value: quickInputService.options?.value,
				placeHolder: quickInputService.options?.placeHolder,
			},
			updates: configurationService.updates,
		}, {
			input: {
				title: 'Rename Tunnel',
				value: 'old-tunnel',
				placeHolder: 'Leave blank to use this machine\'s host name.',
			},
			updates: [{ key: CONFIGURATION_KEY_HOST_NAME, value: 'renamed-tunnel', target: ConfigurationTarget.USER }],
		});
	});
});
