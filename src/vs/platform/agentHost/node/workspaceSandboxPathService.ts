/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { Schemas } from '../../../base/common/network.js';
import { isWindows, OperatingSystem } from '../../../base/common/platform.js';
import { extUri } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { getWorkingDirectoryScopeId } from '../common/agentHostWorkingDirectories.js';
import { applySessionSandboxPathGrant, isSandboxPathGrant, ISandboxPathGrant, ISessionSandboxPaths, parseSessionSandboxPaths, removeSandboxReadonlyPaths } from '../common/sandboxPathGrant.js';
import { IAgentHostStorageService } from './agentHostStorageService.js';

const storageKeyPrefix = 'agentHost.workspaceSandboxPaths.v2.';

/** Preserves path case because filesystem case sensitivity cannot be inferred from the host OS. */
export function getWorkspaceSandboxScopeId(workingDirectories: readonly URI[]): string {
	const normalizedDirectories = workingDirectories.map(directory => {
		// Collapsing parent traversal can change the directory when a preceding segment is a symlink.
		const normalized = directory.path.split(isWindows ? /[\\/]/ : '/').includes('..')
			? directory
			: extUri.removeTrailingPathSeparator(extUri.normalizePath(directory));
		return normalized.toString();
	});
	return getWorkingDirectoryScopeId(normalizedDirectories, extUri);
}

export const IWorkspaceSandboxPathService = createDecorator<IWorkspaceSandboxPathService>('workspaceSandboxPathService');

/** Callers supply the requesting chat's resolved, non-scratch workspace roots in host URI space. */
export interface IWorkspaceSandboxPathService {
	readonly _serviceBrand: undefined;
	/** Publishes the folder-set scope ID whose live grants changed. */
	readonly onDidChange: Event<string>;
	getPaths(workingDirectories: readonly URI[]): ISessionSandboxPaths | undefined;
	/** Records a runtime-approved grant immediately; the promise reports persistence failure without reverting it. */
	grant(workingDirectories: readonly URI[], grant: ISandboxPathGrant): Promise<void>;
	removeReadonlyPaths(workingDirectories: readonly URI[], paths: readonly string[], os: OperatingSystem): Promise<void>;
	clear(workingDirectories: readonly URI[]): Promise<void>;
}

/** Private grants shared by exact folder sets within one host's storage, independent of session lifetime. */
export class WorkspaceSandboxPathService implements IWorkspaceSandboxPathService {
	declare readonly _serviceBrand: undefined;
	readonly onDidChange: Event<string>;

	constructor(
		@IAgentHostStorageService private readonly _storage: IAgentHostStorageService,
	) {
		this.onDidChange = Event.map(Event.filter(_storage.onDidChange, key => key.startsWith(storageKeyPrefix)), key => key.substring(storageKeyPrefix.length));
	}

	getPaths(workingDirectories: readonly URI[]): ISessionSandboxPaths | undefined {
		return this._read(this._key(workingDirectories));
	}

	async grant(workingDirectories: readonly URI[], grant: ISandboxPathGrant): Promise<void> {
		if (!isSandboxPathGrant(grant)) {
			throw new Error(localize('invalidWorkspaceSandboxGrant', "Invalid workspace sandbox path grant."));
		}
		const key = this._key(workingDirectories);
		const paths = applySessionSandboxPathGrant(this._read(key) ?? parseSessionSandboxPaths(undefined), grant);
		this._storage.set(key, JSON.stringify(paths));
		await this._storage.whenIdle();
	}

	async removeReadonlyPaths(workingDirectories: readonly URI[], paths: readonly string[], os: OperatingSystem): Promise<void> {
		const key = this._key(workingDirectories);
		const current = this._read(key);
		if (!current) {
			return;
		}
		const updated = removeSandboxReadonlyPaths(current, paths, os);
		if (updated !== current) {
			this._storage.set(key, JSON.stringify(updated));
			await this._storage.whenIdle();
		}
	}

	async clear(workingDirectories: readonly URI[]): Promise<void> {
		this._storage.delete(this._key(workingDirectories));
		await this._storage.whenIdle();
	}

	private _read(key: string): ISessionSandboxPaths | undefined {
		if (this._storage.loadError) {
			throw new Error(localize('workspaceSandboxStorageUnavailable', "Workspace sandbox permissions could not be loaded."), { cause: this._storage.loadError });
		}
		const raw = this._storage.get<unknown>(key);
		if (raw === undefined) {
			return undefined;
		}
		try {
			if (typeof raw !== 'string') {
				throw new Error('Expected serialized sandbox paths.');
			}
			return parseSessionSandboxPaths(raw);
		} catch (error) {
			throw new Error(localize('invalidWorkspaceSandboxPaths', "Invalid persisted workspace sandbox paths."), { cause: error });
		}
	}

	private _key(workingDirectories: readonly URI[]): string {
		if (!workingDirectories.length || workingDirectories.some(directory => directory.scheme !== Schemas.file || !directory.path.startsWith('/') || directory.query || directory.fragment)) {
			throw new Error(localize('workspaceSandboxRootsRequired', "Workspace sandbox permissions require resolved filesystem workspace folders."));
		}
		return storageKeyPrefix + getWorkspaceSandboxScopeId(workingDirectories);
	}
}
