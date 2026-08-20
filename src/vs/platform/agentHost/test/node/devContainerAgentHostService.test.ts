/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { mock } from '../../../../base/test/common/mock.js';
import { IProductService } from '../../../product/common/productService.js';
import { NullLogService } from '../../../log/common/log.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { DevContainerAgentHostMainService, IDevContainerRelay, parseDevContainerUpResult } from '../../node/devContainerAgentHostService.js';
import { ISshExec } from '../../node/sshRemoteAgentHostHelpers.js';

class TestRelay implements IDevContainerRelay {
	readonly sent: string[] = [];
	disposed = false;

	send(message: string): void {
		this.sent.push(message);
	}

	dispose(): void {
		this.disposed = true;
	}
}

class TestDevContainerAgentHostMainService extends DevContainerAgentHostMainService {
	readonly relay = new TestRelay();
	relayCommand: string | undefined;

	constructor() {
		super(
			new NullLogService(),
			new class extends mock<IProductService>() {
				override readonly quality = 'insider';
				override readonly serverDataFolderName = '.vscode-server-oss';
				override readonly commit = undefined;
			}(),
			NullTelemetryService,
			new TestConfigurationService(),
			new class extends mock<INativeEnvironmentService>() {
				override readonly args = Object.create(null);
			}(),
		);
	}

	protected override _resolveShellEnvironment(): Promise<typeof process.env> {
		return Promise.resolve(process.env);
	}

	protected override _runDevContainer(args: readonly string[]): Promise<{ stdout: string; stderr: string; code: number }> {
		assert.deepStrictEqual(args, ['up', '--workspace-folder', '/workspace']);
		return Promise.resolve({
			stdout: '[1 ms] Starting...\n{"outcome":"success","containerId":"container-id","remoteWorkspaceFolder":"/workspaces/project"}\n',
			stderr: '',
			code: 0,
		});
	}

	protected override _createExec(): ISshExec {
		return async command => {
			if (command === 'uname -s') {
				return { stdout: 'Linux\n', stderr: '', code: 0 };
			}
			if (command === 'uname -m') {
				return { stdout: 'x86_64\n', stderr: '', code: 0 };
			}
			if (command.includes('agent endpoints')) {
				return {
					stdout: JSON.stringify({
						userDataPath: '/home/vscode/.config/Code',
						endpoints: [{
							schemaVersion: 2,
							type: 'standalone',
							pid: 42,
							instanceId: 'instance',
							protocolVersion: '1',
							connectionToken: 'token',
							endpoint: { type: 'tcp', host: '127.0.0.1', port: 1234 },
						}],
					}),
					stderr: '',
					code: 0,
				};
			}
			return { stdout: '', stderr: '', code: 0 };
		};
	}

	protected override _createRelay(
		_connectionId: string,
		_workspaceFolder: string,
		command: string,
		_endpoint: { readonly type: 'tcp'; readonly host: string; readonly port: number } | { readonly type: 'socket'; readonly path: string },
		_connectionToken: string | undefined,
		_token: CancellationToken,
	): Promise<IDevContainerRelay> {
		this.relayCommand = command;
		return Promise.resolve(this.relay);
	}
}

suite('Dev Container Agent Host Main Service', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('parses the final Dev Container CLI result', () => {
		assert.deepStrictEqual(parseDevContainerUpResult([
			'[10 ms] Starting container',
			'{"outcome":"success","containerId":"abc","remoteWorkspaceFolder":"/workspaces/project"}',
		].join('\n')), {
			containerId: 'abc',
			remoteWorkspaceFolder: '/workspaces/project',
		});
	});

	test('reuses a standalone endpoint and exposes its relay', async () => {
		const service = store.add(new TestDevContainerAgentHostMainService());
		const result = await service.connect({
			connectionId: 'connection',
			workspaceFolder: '/workspace',
			name: 'Project Dev Container',
		});
		await service.relaySend('connection', '{"jsonrpc":"2.0"}');
		await service.disconnect('connection');

		assert.deepStrictEqual({
			result,
			relayCommand: service.relayCommand,
			sent: service.relay.sent,
			disposed: service.relay.disposed,
		}, {
			result: {
				connectionId: 'connection',
				address: 'devcontainer:container-id',
				name: 'Project Dev Container',
				remoteWorkspaceFolder: '/workspaces/project',
			},
			relayCommand: '~/.vscode-server-oss/code-insiders --cli-data-dir ~/.vscode-server-oss/cli agent relay \'instance\' --user-data-dir \'/home/vscode/.config/Code\'',
			sent: ['{"jsonrpc":"2.0"}'],
			disposed: true,
		});
	});
});
