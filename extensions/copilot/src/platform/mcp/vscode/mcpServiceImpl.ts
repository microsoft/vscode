/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { McpGateway, McpGatewayServer, lm, type Event } from 'vscode';
import { IDisposable } from '../../../util/vs/base/common/lifecycle';
import { ResourceMap } from '../../../util/vs/base/common/map';
import { URI } from '../../../util/vs/base/common/uri';
import { ILogService } from '../../log/common/logService';
import { AbstractMcpService } from '../common/mcpService';

class TrackedMcpGateway implements McpGateway {
	constructor(
		private readonly _gateway: McpGateway,
		private readonly _onDispose: () => void
	) { }

	get servers(): readonly McpGatewayServer[] {
		return this._gateway.servers;
	}

	get onDidChangeServers(): Event<readonly McpGatewayServer[]> {
		return this._gateway.onDidChangeServers;
	}

	dispose(): void {
		this._onDispose();
		this._gateway.dispose();
	}
}

export class McpService extends AbstractMcpService implements IDisposable {
	declare readonly _serviceBrand: undefined;

	private readonly _gateways = new ResourceMap<Promise<TrackedMcpGateway | undefined>>();

	constructor(@ILogService private readonly _logService: ILogService) {
		super();
	}

	get mcpServerDefinitions() {
		return lm.mcpServerDefinitions;
	}

	get onDidChangeMcpServerDefinitions() {
		return lm.onDidChangeMcpServerDefinitions;
	}

	startMcpGateway(resource: URI): Promise<McpGateway | undefined> {
		const existing = this._gateways.get(resource);
		if (existing !== undefined) {
			return existing;
		}

		const promise = this._doStartMcpGateway(resource);
		this._gateways.set(resource, promise);
		return promise;
	}

	private async _doStartMcpGateway(resource: URI): Promise<TrackedMcpGateway | undefined> {
		try {
			// TODO: Pass resource into startMcpGateway once supported, to allow gateway to do per-session initialization if needed
			const gateway = await lm.startMcpGateway();
			if (gateway) {
				return new TrackedMcpGateway(gateway, () => this._gateways.delete(resource));
			}
		} catch (error) {
			this._logService.warn(`Failed to start MCP Gateway: ${error instanceof Error ? error.message : String(error)}`);
		}
		this._gateways.delete(resource);
		return undefined;
	}

	dispose(): void {
		const pending = [...this._gateways.values()];
		this._gateways.clear();
		for (const promise of pending) {
			void promise.then(gateway => {
				try {
					gateway?.dispose();
				} catch {
					// best-effort cleanup
				}
			});
		}
	}
}
