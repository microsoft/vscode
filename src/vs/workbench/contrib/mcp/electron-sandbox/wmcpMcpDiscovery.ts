/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeMcpDiscoveryHelperService, NativeMcpDiscoveryHelperChannelName } from '../../../../platform/mcp/common/nativeMcpDiscoveryHelper.js';
import { StorageScope } from '../../../../platform/storage/common/storage.js';
import { IMcpDiscovery } from '../common/discovery/mcpDiscovery.js';
import { IMcpRegistry } from '../common/mcpRegistryTypes.js';
import { McpServerDefinition, McpServerTransportType } from '../common/mcpTypes.js';

const KEY = 'chat.mcp.wmcpArgs';

export class WmcpMcpDiscovery extends Disposable implements IMcpDiscovery {
	private readonly _discovery = this._register(new DisposableStore());
	constructor(
		@IMainProcessService private readonly mainProcess: IMainProcessService,
		@ILogService private readonly logService: ILogService,
		@IMcpRegistry private readonly _mcpRegistry: IMcpRegistry,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
	}

	public start(): void {
		const check = () => {
			const config = this._configurationService.getValue<string[]>(KEY);
			if (!config.length) {
				this._discovery.clear();
			} else {
				this._runWith(config);
			}
		};

		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(KEY)) {
				check();
			}
		}));

		check();
	}

	private _runWith(args: string[]): void {
		const service = ProxyChannel.toService<INativeMcpDiscoveryHelperService>(
			this.mainProcess.getChannel(NativeMcpDiscoveryHelperChannelName));
		const cts = new CancellationTokenSource();
		this._discovery.add(toDisposable(() => cts.dispose(true)));

		service.getWmcp(args).then(
			data => {
				if (cts.token.isCancellationRequested) {
					return;
				}

				this._discovery.add(this._mcpRegistry.registerCollection({
					id: 'wmcp',
					label: 'Windows MCP',
					remoteAuthority: null,
					scope: StorageScope.APPLICATION,
					isTrustedByDefault: false,
					serverDefinitions: observableValue(this, data.map(({ id, label, uri }): McpServerDefinition => ({
						id,
						label,
						launch: {
							type: McpServerTransportType.HTTP,
							uri: URI.revive(uri),
							headers: [],
						}
					}))),
				}));
			},
			err => {
				this.logService.warn('Error getting main process MCP environment', err);
			}
		);
	}
}
