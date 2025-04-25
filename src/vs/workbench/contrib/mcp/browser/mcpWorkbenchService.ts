/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IGalleryMcpServer, ILocalMcpServer, IMcpGalleryService, IMcpManagementService, IQueryOptions } from '../../../../platform/mcp/common/mcpManagement.js';
import { DefaultIconPath } from '../../../services/extensionManagement/common/extensionManagement.js';
import { IMcpWorkbenchService, IWorkbenchMcpServer } from '../common/mcpTypes.js';

class McpWorkbenchServer implements IWorkbenchMcpServer {

	constructor(
		readonly local: ILocalMcpServer | undefined,
		readonly gallery: IGalleryMcpServer | undefined,
	) {
	}

	get id(): string {
		return this.gallery?.id ?? this.local?.manifest?.id ?? '';
	}

	get label(): string {
		return this.gallery?.displayName ?? this.local?.manifest?.displayName ?? '';
	}

	get iconUrl(): string {
		return this.gallery?.iconUrl ?? this.local?.manifest?.iconUrl ?? DefaultIconPath;
	}

	get publisherDisplayName(): string | undefined {
		return this.gallery?.publisherDisplayName ?? this.local?.manifest?.publisherDisplayName;
	}

	get description(): string {
		return this.gallery?.description ?? this.local?.manifest?.description ?? '';
	}

	get installCount(): number {
		return this.gallery?.installCount ?? 0;
	}

}

export class McpWorkbenchService extends Disposable implements IMcpWorkbenchService {

	_serviceBrand: undefined;

	constructor(
		@IMcpGalleryService private readonly mcpGalleryService: IMcpGalleryService,
		@IMcpManagementService private readonly mcpManagementService: IMcpManagementService,
	) {
		super();
	}

	async queryGallery(options?: IQueryOptions, token?: CancellationToken): Promise<IWorkbenchMcpServer[]> {
		const result = await this.mcpGalleryService.query(options, token);
		return result.map(gallery => new McpWorkbenchServer(undefined, gallery));
	}

	async queryLocal(): Promise<IWorkbenchMcpServer[]> {
		const local = await this.mcpManagementService.getInstalled();
		return local.map(local => new McpWorkbenchServer(local, undefined));
	}

	async install(server: IWorkbenchMcpServer): Promise<void> {
		if (!server.gallery) {
			throw new Error('Gallery server is missing');
		}
		await this.mcpManagementService.installFromGallery(server.gallery);
	}

}
