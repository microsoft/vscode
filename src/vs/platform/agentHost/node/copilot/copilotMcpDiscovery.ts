/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient } from '@github/copilot-sdk';
import { Sequencer } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { dirname } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { getCopilotMcpConfigurationPath } from '../../../environment/common/copilotHome.js';
import type { IFileService } from '../../../files/common/files.js';
import type { ILogService } from '../../../log/common/log.js';
import type { McpServerSource } from '../../common/meta/mcpCustomizationMeta.js';
import { findCopilotPluginRoot } from './sessionCustomizationDiscovery.js';

export interface ICopilotDiscoveredMcpServer {
	readonly name: string;
	readonly source: McpServerSource;
	readonly uri: URI | undefined;
	readonly enabled?: boolean;
	readonly pluginUri?: URI;
	readonly pluginName?: string;
}

/** Shares user-config invalidation across pre-send catalogs without creating SDK sessions. */
export class CopilotMcpDiscovery extends Disposable {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;
	private readonly _sequencer = new Sequencer();
	private readonly _configurationUri: URI;
	private readonly _configWatcher = this._register(new DisposableStore());
	private _reloadRequired = false;

	constructor(
		private readonly _getClient: () => Promise<CopilotClient>,
		userHome: URI,
		private readonly _fileService: IFileService,
		private readonly _logService: ILogService,
	) {
		super();
		this._configurationUri = URI.file(getCopilotMcpConfigurationPath(userHome.fsPath, process.env));
		const configDirectory = dirname(this._configurationUri);
		this._watchConfigDirectory();
		const parentWatcher = this._register(_fileService.createWatcher(dirname(configDirectory), { recursive: false, excludes: [] }));
		this._register(parentWatcher.onDidChange(event => {
			if (event.contains(configDirectory)) {
				this._watchConfigDirectory();
				this._invalidate('userConfigDirectoryChanged');
			}
		}));
	}

	private _watchConfigDirectory(): void {
		this._configWatcher.clear();
		const directory = dirname(this._configurationUri);
		const settingsUri = URI.joinPath(directory, 'config.json');
		const watcher = this._configWatcher.add(this._fileService.createWatcher(directory, { recursive: false, excludes: [] }));
		this._configWatcher.add(watcher.onDidChange(event => {
			if (event.affects(this._configurationUri) || event.affects(settingsUri)) {
				this._invalidate('userConfigFileChanged');
			}
		}));
	}

	private _invalidate(reason: string): void {
		this._reloadRequired = true;
		this._logService.debug(`[Copilot:McpDiscovery] User configuration invalidated: reason=${reason}`);
		this._onDidChange.fire();
	}

	discover(directory: URI | undefined): Promise<readonly ICopilotDiscoveredMcpServer[]> {
		return this._sequencer.queue(async () => {
			const client = await this._getClient();
			if (this._reloadRequired) {
				this._reloadRequired = false;
				try {
					this._logService.debug('[Copilot:McpDiscovery] Reloading user configuration: method=mcp.config.reload');
					await client.rpc.mcp.config.reload();
					this._logService.debug('[Copilot:McpDiscovery] User configuration reloaded');
				} catch (error) {
					this._reloadRequired = true;
					throw error;
				}
			}
			if (!directory) {
				this._logService.debug('[Copilot:McpDiscovery] Querying user declarations: method=mcp.config.list');
				const { servers } = await client.rpc.mcp.config.list();
				// config.list has no disabled-list metadata. Never retain its raw launch configuration.
				return Object.keys(servers).map(name => ({ name, source: 'user', uri: this._configurationUri }));
			}
			this._logService.debug('[Copilot:McpDiscovery] Querying workspace catalog: method=mcp.discover, includeEffectiveSource=true');
			const { servers } = await client.rpc.mcp.discover({ workingDirectory: directory.fsPath, includeEffectiveSource: true });
			return Promise.all(servers.map(async server => {
				const uri = server.effectiveSource?.file ? URI.parse(server.effectiveSource.file.uri) : server.source === 'user' ? this._configurationUri : undefined;
				return {
					name: server.name,
					source: server.source,
					uri,
					enabled: server.enabled,
					pluginUri: server.source === 'plugin' && uri ? await findCopilotPluginRoot(uri, this._fileService, CancellationToken.None) : undefined,
					pluginName: server.sourcePlugin,
				};
			}));
		});
	}
}
