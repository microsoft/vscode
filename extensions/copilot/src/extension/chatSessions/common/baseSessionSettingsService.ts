/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { INativeEnvService } from '../../../platform/env/common/envService';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { Emitter } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { extUriBiasedIgnorePathCase } from '../../../util/vs/base/common/resources';
import { URI } from '../../../util/vs/base/common/uri';
import { SessionSettingsFile, SessionSettingsLocationDescriptor } from './sessionSettingsService';

/**
 * Base implementation for session settings services that read/write JSON settings files.
 * Handles file watching, caching, and priority ordering.
 *
 * Subclasses must provide the location descriptors (which define where settings files live
 * and their priority order).
 */
export abstract class SessionSettingsService<TLocationType extends string, TSettings> extends Disposable {
	declare readonly _serviceBrand: undefined;

	protected readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _settingsCache: Readonly<SessionSettingsFile<TLocationType, TSettings>[]> | undefined;
	private _settingsUris: URI[] = [];

	constructor(
		private readonly _locations: readonly SessionSettingsLocationDescriptor<TLocationType>[],
		protected readonly workspaceService: IWorkspaceService,
		protected readonly fileSystemService: IFileSystemService,
		protected readonly envService: INativeEnvService,
	) {
		super();

		const onSettingsChanged = () => {
			this._settingsCache = undefined;
			this._onDidChange.fire();
		};

		const setupWatchers = () => {
			this._settingsUris = [];
			for (const location of this._locations) {
				const uris = location.getUris(this.workspaceService.getWorkspaceFolders(), this.envService.userHome);
				this._settingsUris.push(...uris);
				for (const uri of uris) {
					const watcher = this._register(this.fileSystemService.createFileSystemWatcher(uri.fsPath));
					this._register(watcher.onDidChange(onSettingsChanged));
					this._register(watcher.onDidCreate(onSettingsChanged));
					this._register(watcher.onDidDelete(onSettingsChanged));
				}
			}
		};

		this._register(this.workspaceService.onDidChangeWorkspaceFolders(() => {
			setupWatchers();
			onSettingsChanged();
		}));

		setupWatchers();
	}

	private _getUrisByLocation(location: TLocationType): URI[] {
		const descriptor = this._locations.find(l => l.type === location);
		if (!descriptor) {
			return [];
		}
		return descriptor.getUris(this.workspaceService.getWorkspaceFolders(), this.envService.userHome);
	}

	getUris(location?: TLocationType): URI[] {
		if (location) {
			return this._getUrisByLocation(location);
		}
		return this._settingsUris;
	}

	getUri(location: TLocationType, uri: URI): URI {
		const uris = this.getUris(location);
		if (uris.length === 1) {
			return uris[0];
		}
		const workspaceFolders = this.workspaceService.getWorkspaceFolders();
		for (const workspaceFolder of workspaceFolders) {
			if (extUriBiasedIgnorePathCase.isEqualOrParent(uri, workspaceFolder)) {
				const settingsUri = uris.find(u => extUriBiasedIgnorePathCase.isEqual(u, workspaceFolder));
				if (settingsUri) {
					return settingsUri;
				}
			}
		}
		throw new Error(`Could not find a matching settings URI for ${uri.toString()}`);
	}

	async readSettingsFile(uri: URI): Promise<TSettings> {
		try {
			const bytes = await this.fileSystemService.readFile(uri);
			const parsed = JSON.parse(new TextDecoder().decode(bytes));
			return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : this.getDefaultSettings();
		} catch {
			return this.getDefaultSettings();
		}
	}

	async readAllSettings(): Promise<Readonly<SessionSettingsFile<TLocationType, TSettings>[]>> {
		if (this._settingsCache) {
			return this._settingsCache;
		}

		const settingsFiles = await Promise.all(
			this._settingsUris.map(uri => this.readSettingsFile(uri))
		);

		const allFiles: SessionSettingsFile<TLocationType, TSettings>[] = settingsFiles.map((settings, index) => ({
			type: this._getLocationType(this._settingsUris[index]),
			settings,
			uri: this._settingsUris[index],
		}));

		// Sort by priority (lower number = higher precedence)
		const priorityMap = new Map(this._locations.map(l => [l.type, l.priority]));
		this._settingsCache = allFiles.sort((a, b) => (priorityMap.get(a.type) ?? 0) - (priorityMap.get(b.type) ?? 0));

		return this._settingsCache;
	}

	async writeSettingsFile(uri: URI, settings: TSettings): Promise<void> {
		const content = new TextEncoder().encode(JSON.stringify(settings, null, 4));
		await this.fileSystemService.writeFile(uri, content);
		// Eagerly invalidate so that subsequent reads (before the file
		// watcher fires) return fresh data.
		this._settingsCache = undefined;
	}

	/**
	 * Returns the default empty settings object (e.g. `{}` cast to TSettings).
	 */
	protected abstract getDefaultSettings(): TSettings;

	/**
	 * Determines the location type for a given URI.
	 */
	private _getLocationType(uri: URI): TLocationType {
		for (const location of this._locations) {
			const uris = location.getUris(this.workspaceService.getWorkspaceFolders(), this.envService.userHome);
			if (uris.some(u => extUriBiasedIgnorePathCase.isEqual(u, uri))) {
				return location.type;
			}
		}
		return this._locations[0].type;
	}
}
