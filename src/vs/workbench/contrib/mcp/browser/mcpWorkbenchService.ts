/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IGalleryMcpServer, ILocalMcpServer, IMcpGalleryService, IMcpManagementService, IQueryOptions } from '../../../../platform/mcp/common/mcpManagement.js';
import { ACTIVE_GROUP, IEditorService } from '../../../services/editor/common/editorService.js';
import { DefaultIconPath } from '../../../services/extensionManagement/common/extensionManagement.js';
import { IMcpWorkbenchService, IWorkbenchMcpServer } from '../common/mcpTypes.js';
import { McpServerEditorInput } from './mcpServerEditorInput.js';

class McpWorkbenchServer implements IWorkbenchMcpServer {

	constructor(
		readonly local: ILocalMcpServer | undefined,
		readonly gallery: IGalleryMcpServer | undefined,
	) {
	}

	get id(): string {
		return this.gallery?.id ?? /* this.local?.manifest?.id ?? */ '';
	}

	get label(): string {
		return this.gallery?.displayName ?? /* this.local?.manifest?.displayName ?? */ '';
	}

	get iconUrl(): string {
		return this.gallery?.iconUrl /* ?? this.local?.manifest?.iconUrl */ ?? DefaultIconPath;
	}

	get publisherDisplayName(): string | undefined {
		return this.gallery?.publisherDisplayName ?? this.gallery?.publisher;
	}

	get publisherUrl(): string | undefined {
		return this.gallery?.publisherDomain?.link;
	}

	get description(): string {
		return this.gallery?.description ?? /* this.local?.manifest?.description ?? */ '';
	}

	get installCount(): number {
		return this.gallery?.installCount ?? 0;
	}

	get url(): string | undefined {
		return this.gallery?.url;
	}

	get repository(): string | undefined {
		return this.gallery?.repositoryUrl;
	}

}

export class McpWorkbenchService extends Disposable implements IMcpWorkbenchService {

	_serviceBrand: undefined;

	constructor(
		@IMcpGalleryService private readonly mcpGalleryService: IMcpGalleryService,
		@IMcpManagementService private readonly mcpManagementService: IMcpManagementService,
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
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

	async open(extension: IWorkbenchMcpServer, options?: IEditorOptions): Promise<void> {
		await this.editorService.openEditor(this.instantiationService.createInstance(McpServerEditorInput, extension), options, ACTIVE_GROUP);
	}

}
