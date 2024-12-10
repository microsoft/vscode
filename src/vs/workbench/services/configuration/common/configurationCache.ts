/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationCache, ConfigurationKey } from './configuration.js';
import { URI } from '../../../../base/common/uri.js';
import { FileOperationError, FileOperationResult, IFileService } from '../../../../platform/files/common/files.js';
import { joinPath } from '../../../../base/common/resources.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Queue } from '../../../../base/common/async.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';

export class ConfigurationCache implements IConfigurationCache {

	private readonly cacheHome: URI;
	private readonly cachedConfigurations: Map<string, CachedConfiguration> = new Map<string, CachedConfiguration>();

	constructor(
		private readonly donotCacheResourcesWithSchemes: string[],
		environmentService: IEnvironmentService,
		private readonly fileService: IFileService
	) {
		this.cacheHome = environmentService.cacheHome;
	}

	needsCaching(resource: URI): boolean {
		// Cache all non native resources
		return !this.donotCacheResourcesWithSchemes.includes(resource.scheme);
	}

	read(key: ConfigurationKey): Promise<string> {
		return this.getCachedConfiguration(key).read();
	}

	write(key: ConfigurationKey, content: string): Promise<void> {
		return this.getCachedConfiguration(key).save(content);
	}

	remove(key: ConfigurationKey): Promise<void> {
		return this.getCachedConfiguration(key).remove();
	}

	private getCachedConfiguration({ type, key }: ConfigurationKey): CachedConfiguration {
		const k = `${type}:${key}`;
		let cachedConfiguration = this.cachedConfigurations.get(k);
		if (!cachedConfiguration) {
			cachedConfiguration = new CachedConfiguration({ type, key }, this.cacheHome, this.fileService);
			this.cachedConfigurations.set(k, cachedConfiguration);
		}
		return cachedConfiguration;
	}
}

class CachedConfiguration {

	private queue: Queue<void>;
	private cachedConfigurationFolderResource: URI;
	private cachedConfigurationFileResource: URI;

	constructor(
		{ type, key }: ConfigurationKey,
		cacheHome: URI,
		private readonly fileService: IFileService
	) {
		this.cachedConfigurationFolderResource = joinPath(cacheHome, 'CachedConfigurations', type, key);
		this.cachedConfigurationFileResource = joinPath(this.cachedConfigurationFolderResource, type === 'workspaces' ? 'workspace.json' : 'configuration.json');
		this.queue = new Queue<void>();
	}

	async read(): Promise<string> {
		try {
			const content = await this.fileService.readFile(this.cachedConfigurationFileResource);
			return content.value.toString();
		} catch (e) {
			return '';
		}
	}

	async save(content: string): Promise<void> {
		const created = await this.createCachedFolder();
		if (created) {
			await this.queue.queue(async () => {
				await this.fileService.writeFile(this.cachedConfigurationFileResource, VSBuffer.fromString(content));
			});
		}
	}

	async remove(): Promise<void> {
		try {
			await this.queue.queue(() => this.fileService.del(this.cachedConfigurationFolderResource, { recursive: true, useTrash: false }));
		} catch (error) {
			if ((<FileOperationError>error).fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
				throw error;
			}
		}
	}

	private async createCachedFolder(): Promise<boolean> {
		if (await this.fileService.exists(this.cachedConfigurationFolderResource)) {
			return true;
		}
		try {
			await this.fileService.createFolder(this.cachedConfigurationFolderResource);
			return true;
		} catch (error) {
			return false;
		}
	}
}

