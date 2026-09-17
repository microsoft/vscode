/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Extension, Memento, Uri } from 'vscode';
import { sanitizeVSCodeVersion } from '../../../util/common/vscodeVersion';
import { isCI } from '../../../util/vs/base/common/platform';
import { URI } from '../../../util/vs/base/common/uri';
import { RemoteCacheType } from '../../embeddings/common/embeddingsIndex';
import { SettingListItem } from '../../embeddings/common/vscodeIndex';
import { IEnvService } from '../../env/common/envService';
import { IVSCodeExtensionContext } from '../../extContext/common/extensionContext';
import { IFileSystemService } from '../../filesystem/common/fileSystemService';
import { IFetcherService } from '../../networking/common/fetcherService';
import { IWorkbenchService } from '../../workbench/common/workbenchService';

interface Command {
	command: string;
	label: string;
	keybinding?: string;
	description?: string;
	precondition?: string;
}

interface Settings {
	[key: string]: SettingListItem;
}

export class TestWorkbenchService implements IWorkbenchService {
	declare readonly _serviceBrand: undefined;

	private readonly commandsTestData: RemoteTestDataCache<Command[]>;
	private readonly settingsTestData: RemoteTestDataCache<Settings>;

	constructor(@IFetcherService fetcherService: IFetcherService,
		@IFileSystemService fileSystemService: IFileSystemService,
		@IVSCodeExtensionContext vscodeExtensionContext: IVSCodeExtensionContext,
		@IEnvService envService: IEnvService) {
		const cacheVersion = sanitizeVSCodeVersion(envService.getEditorInfo().version);

		this.commandsTestData = new RemoteTestDataCache(vscodeExtensionContext, fileSystemService, fetcherService, 'allCoreCommands', cacheVersion, RemoteCacheType.Commands);
		this.settingsTestData = new RemoteTestDataCache(vscodeExtensionContext, fileSystemService, fetcherService, 'allCoreSettings', cacheVersion, RemoteCacheType.Settings);
	}

	getAllExtensions(): readonly Extension<any>[] {
		// TODO: Implement this
		return [];
	}

	async getAllCommands(filterByPreCondition?: boolean): Promise<{ label: string; command: string; keybinding: string }[]> {
		const commands = await this.commandsTestData.getCache() as Command[];
		// Commands that are not contributed by extensions. Update list as needed for tests
		const filteredCommands = commands.filter((command) =>
			command.command.startsWith('workbench') ||
			command.command.startsWith('telemetry') ||
			command.command.startsWith('editor') ||
			(filterByPreCondition ? command.precondition === undefined : true)
		);

		return filteredCommands.map((command) => ({
			label: command.label,
			command: command.command,
			keybinding: command.keybinding ?? 'Not set'
		}));
	}

	async getAllSettings(): Promise<{ [key: string]: SettingListItem }> {
		return await this.settingsTestData.getCache() as Settings;
	}
}

class RemoteTestDataCache<T extends Command[] | Settings | string[]> {
	private _remoteCache: T | undefined;
	private readonly cacheVersionKey: string;

	private readonly remoteCacheURL: string;

	constructor(
		private readonly vscodeExtensionContext: IVSCodeExtensionContext,
		private readonly fileSystem: IFileSystemService,
		private readonly fetcher: IFetcherService,
		private readonly cacheKey: string,
		private readonly cacheVersion: string,
		remoteCacheType: RemoteCacheType
	) {
		this.cacheVersionKey = `${cacheKey}-version`;
		this.remoteCacheURL = `https://embeddings.vscode-cdn.net/test-artifacts/v${cacheVersion}/${remoteCacheType}/core.json`;
	}

	public async getCache(): Promise<T | undefined> {
		const cache = await this.getLocalCache();
		if (cache) {
			return cache as T;
		}

		if (isCI) {
			throw new Error(`No embeddings cache found for ${this.cacheVersion}`);
		}

		const remoteCache = await this.fetchRemoteCache();
		if (!remoteCache) {
			return;
		}

		await this.cacheVersionMementoStorage.update(this.cacheVersionKey, this.cacheVersion);
		await this.updateCache(remoteCache);
		return remoteCache as T;
	}

	private async fetchRemoteCache(): Promise<T | undefined> {
		if (this._remoteCache) {
			return this._remoteCache;
		}
		try {
			const response = await this.fetcher.fetch(this.remoteCacheURL, { method: 'GET', callSite: 'test-workbench-remote-cache' });
			if (response.ok) {
				this._remoteCache = (await response.json()) as T;
				return this._remoteCache;
			} else {
				console.error(`Failed to fetch remote embeddings cache from ${this.remoteCacheURL}`);
				return;
			}
		} catch {
			console.error(`Failed to fetch remote embeddings cache from ${this.remoteCacheURL}`);
			return;
		}
	}

	private get cacheStorageUri(): Uri | undefined {
		return this.vscodeExtensionContext.globalStorageUri;
	}

	private get cacheVersionMementoStorage(): Memento {
		return this.vscodeExtensionContext.globalState;
	}

	private async getLocalCache(): Promise<T | undefined> {
		if (!this.cacheStorageUri) {
			return;
		}
		const cacheVersion = this.cacheVersionMementoStorage.get<string>(this.cacheVersionKey);

		if (cacheVersion !== this.cacheVersion) {
			return undefined;
		}
		try {
			const buffer = await this.fileSystem.readFile(URI.joinPath(this.cacheStorageUri, `${this.cacheKey}.json`));
			// Convert the buffer to a string and JSON parse it
			return JSON.parse(buffer.toString()) as T;
		} catch {
			return undefined;
		}
	}

	private async updateCache(value: T) {
		if (!this.cacheStorageUri) {
			return;
		}
		// Cannot write to readonly file system
		if (!this.fileSystem.isWritableFileSystem(this.cacheStorageUri.scheme)) {
			return;
		}
		// Create directory at stoageUri if it doesn't exist
		try {
			await this.fileSystem.stat(this.cacheStorageUri);
		} catch (e) {
			if (e.code === 'ENOENT') {
				// Directory doesn't exist we should create it
				await this.fileSystem.createDirectory(this.cacheStorageUri);
			}
		}

		// Update cache version
		await this.cacheVersionMementoStorage.update(this.cacheVersionKey, this.cacheVersion);
		const hasOldCache = this.cacheVersionMementoStorage.get(this.cacheKey);
		if (hasOldCache) {
			await this.cacheVersionMementoStorage.update(this.cacheKey, undefined);
		}

		const cacheFile = URI.joinPath(this.cacheStorageUri, `${this.cacheKey}.json`);
		try {
			const fileSystemPromise =
				value === undefined
					? this.fileSystem.delete(cacheFile, { useTrash: false })
					: this.fileSystem.writeFile(cacheFile, Buffer.from(JSON.stringify(value)));
			await fileSystemPromise;
		} catch (e) {
			if (value !== undefined) {
				console.error(`Failed to write embeddings cache to ${cacheFile}`);
			}
		}
	}
}
