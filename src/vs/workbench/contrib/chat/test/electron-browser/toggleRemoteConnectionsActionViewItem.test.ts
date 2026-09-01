/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationOverrides, IConfigurationService, IConfigurationUpdateOverrides } from '../../../../../platform/configuration/common/configuration.js';
import { IInputOptions, IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { CONFIGURATION_KEY_HOST_NAME, INACTIVE_TUNNEL_MODE, IRemoteTunnelService, type ActiveTunnelMode, type TunnelMode, type TunnelStatus } from '../../../../../platform/remoteTunnel/common/remoteTunnel.js';
import { getRemoteTunnelAccessState } from '../../electron-browser/toggleRemoteConnectionsActionViewItem.js';
import { executeToggleRemoteConnections } from '../../electron-browser/tunnelHost.contribution.js';
import { promptToRenameRemoteTunnel } from '../../../remoteTunnel/electron-browser/remoteTunnel.contribution.js';

class TestRemoteTunnelService extends mock<IRemoteTunnelService>() {
	mode: TunnelMode = INACTIVE_TUNNEL_MODE;
	status: TunnelStatus = { type: 'disconnected' };

	override getMode(): Promise<TunnelMode> {
		return Promise.resolve(this.mode);
	}

	override getTunnelStatus(): Promise<TunnelStatus> {
		return Promise.resolve(this.status);
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
	ensureNoDisposablesAreLeakedInTestSuite();

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
