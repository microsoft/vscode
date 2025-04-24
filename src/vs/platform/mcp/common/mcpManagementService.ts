/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { deepClone } from '../../../base/common/objects.js';
import { URI } from '../../../base/common/uri.js';
import { ConfigurationTarget, IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { IGalleryMcpServer, ILocalMcpServer, IMcpGalleryService, IMcpManagementService } from './mcpManagement.js';
import { IMcpConfiguration, IMcpServerConfig, IMcpServerManifest } from './mcpPlatformTypes.js';

export class McpManagementService extends Disposable implements IMcpManagementService {

	_serviceBrand: undefined;

	private readonly mcpLocation: URI;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IMcpGalleryService private readonly mcpGalleryService: IMcpGalleryService,
		@IFileService private readonly fileService: IFileService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.mcpLocation = uriIdentityService.extUri.joinPath(environmentService.userRoamingDataHome, 'mcp');
	}

	async getInstalled(): Promise<ILocalMcpServer[]> {
		const { userLocal } = this.configurationService.inspect<IMcpConfiguration>('mcp');

		if (!userLocal?.value?.servers) {
			return [];
		}

		return Promise.all(Object.entries(userLocal.value.servers).map(async ([name, config]) => {
			let manifest: IMcpServerManifest | undefined;
			if (config.location) {
				const value = await this.fileService.readFile(URI.parse(config.location));
				manifest = <IMcpServerManifest>JSON.parse(value.value.toString());
			}
			if (!manifest) {
				manifest = {
					name,
					version: '0.0.0',
					server: config
				};
			}
			return {
				name,
				manifest,
				publisherDisplayName: config.metadata?.publisherDisplayName,
			};
		}));
	}

	async installFromGallery(server: IGalleryMcpServer): Promise<void> {
		this.logService.trace('MCP Management Service: installGallery', server.url);

		const manifest = await this.mcpGalleryService.getManifest(server, CancellationToken.None);
		const manifestPath = this.uriIdentityService.extUri.joinPath(this.mcpLocation, server.name, 'manifest.json');
		await this.fileService.writeFile(
			this.uriIdentityService.extUri.joinPath(this.mcpLocation, server.name, 'manifest.json'),
			VSBuffer.fromString(JSON.stringify(manifest))
		);

		const { userLocal } = this.configurationService.inspect<IMcpConfiguration>('mcp');

		const value: IMcpConfiguration = deepClone(userLocal?.value ?? { servers: {} });
		if (!value.servers) {
			value.servers = {};
		}
		const serverConfig = <IMcpServerConfig>manifest.server;
		value.servers[server.name] = {
			location: manifestPath.toString(),
			type: 'stdio',
			command: serverConfig.command,
			args: serverConfig.args,
			env: serverConfig.env,
			metadata: {
				publisher: server.publisher,
				publisherDisplayName: server.publisherDisplayName,
			}
		};

		await this.configurationService.updateValue('mcp', value, ConfigurationTarget.USER_LOCAL);
	}

}
