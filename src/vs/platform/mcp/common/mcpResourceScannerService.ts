/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Queue } from '../../../base/common/async.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { parse, ParseError } from '../../../base/common/json.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../base/common/map.js';
import { URI } from '../../../base/common/uri.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../files/common/files.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { IScannedMcpServers, IScannedMcpServer } from './mcpManagement.js';
import { IMcpServerVariable } from './mcpPlatformTypes.js';

export interface ProfileMcpServersEvent {
	readonly servers: readonly IScannedMcpServer[];
	readonly profileLocation: URI;
}

export interface DidAddProfileMcpServersEvent extends ProfileMcpServersEvent {
	readonly error?: Error;
}

export interface DidRemoveProfileMcpServersEvent extends ProfileMcpServersEvent {
	readonly error?: Error;
}

export const IMcpResourceScannerService = createDecorator<IMcpResourceScannerService>('IMcpResourceScannerService');
export interface IMcpResourceScannerService {
	readonly _serviceBrand: undefined;
	scanMcpServers(mcpResource: URI): Promise<IScannedMcpServers>;
	addMcpServers(servers: { server: IScannedMcpServer; inputs?: IMcpServerVariable[] }[], mcpResource: URI): Promise<IScannedMcpServer[]>;
	removeMcpServers(serverNames: string[], mcpResource: URI): Promise<void>;
}

export class McpResourceScannerService extends Disposable implements IMcpResourceScannerService {
	readonly _serviceBrand: undefined;

	private readonly resourcesAccessQueueMap = new ResourceMap<Queue<any>>();

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IUriIdentityService protected readonly uriIdentityService: IUriIdentityService,
	) {
		super();
	}

	async scanMcpServers(mcpResource: URI): Promise<IScannedMcpServers> {
		return this.withProfileMcpServers(mcpResource);
	}

	async addMcpServers(servers: { server: IScannedMcpServer; inputs?: IMcpServerVariable[] }[], mcpResource: URI): Promise<IScannedMcpServer[]> {
		const result: IScannedMcpServer[] = [];
		await this.withProfileMcpServers(mcpResource, scannedMcpServers => {
			let updatedInputs = scannedMcpServers.inputs ?? [];
			const existingServers = scannedMcpServers.servers ?? {};
			for (const { server, inputs } of servers) {
				existingServers[server.name] = server;
				result.push(server);
				if (inputs) {
					const existingInputIds = new Set(updatedInputs.map(input => input.id));
					const newInputs = inputs.filter(input => !existingInputIds.has(input.id));
					updatedInputs = [...updatedInputs, ...newInputs];
				}
			}
			return { servers: existingServers, inputs: updatedInputs };
		});
		return result;
	}

	async removeMcpServers(serverNames: string[], mcpResource: URI): Promise<void> {
		await this.withProfileMcpServers(mcpResource, scannedMcpServers => {
			for (const serverName of serverNames) {
				if (scannedMcpServers.servers?.[serverName]) {
					delete scannedMcpServers.servers[serverName];
				}
			}
			return scannedMcpServers;
		});
	}

	private async withProfileMcpServers(file: URI, updateFn?: (data: IScannedMcpServers) => IScannedMcpServers): Promise<IScannedMcpServers> {
		return this.getResourceAccessQueue(file)
			.queue(async () => {
				let scannedMcpServers: IScannedMcpServers | undefined;
				try {
					const content = await this.fileService.readFile(file);
					const errors: ParseError[] = [];
					scannedMcpServers = parse(content.value.toString(), errors, { allowTrailingComma: true, allowEmptyContent: true });
					if (errors.length > 0) {
						throw new Error('Failed to parse scanned MCP servers: ' + errors.join(', '));
					}
				} catch (error) {
					if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
						throw error;
					}
				}
				if (updateFn) {
					scannedMcpServers = updateFn(scannedMcpServers ?? {});
					if ((scannedMcpServers.servers && Object.keys(scannedMcpServers.servers).length > 0) || (scannedMcpServers.inputs && scannedMcpServers.inputs.length > 0)) {
						await this.fileService.writeFile(file, VSBuffer.fromString(JSON.stringify(scannedMcpServers, null, '\t')));
					} else {
						await this.fileService.del(file);
					}
				}
				return scannedMcpServers;
			});
	}

	private getResourceAccessQueue(file: URI): Queue<any> {
		let resourceQueue = this.resourcesAccessQueueMap.get(file);
		if (!resourceQueue) {
			resourceQueue = new Queue<any>();
			this.resourcesAccessQueueMap.set(file, resourceQueue);
		}
		return resourceQueue;
	}
}

registerSingleton(IMcpResourceScannerService, McpResourceScannerService, InstantiationType.Delayed);
