/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, IReader, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { basename, isEqual } from '../../../../base/common/resources.js';
import { isObject } from '../../../../base/common/types.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IResolvedGitRepository, resolveGitRepositoryFromGitConfig } from '../../sessions/browser/gitHubRepositoryResolver.js';
import { ISessionsManagementService } from '../../sessions/common/sessionsManagement.js';
import { getSessionFolderRepositoryIdentity, getSessionRepositoryIdentity, ISessionRepositoryIdentity, SessionRepositoryKind } from '../common/sessionRepository.js';
import { ISessionsRepository, ISessionRepositoryLocation, ISessionRepositoryMember, ISessionsRepositoriesService } from '../common/sessionsRepositories.js';

/** Machine-local because locations are paths on this machine's view of its hosts. */
const SAVED_REPOSITORIES_STORAGE_KEY = 'sessions.repositories.saved';
const SELECTED_REPOSITORY_STORAGE_KEY = 'sessions.repositories.selected';

interface IStoredRepository {
	readonly key: string;
	readonly kind: SessionRepositoryKind;
	readonly label: string;
	readonly gitHubRepository?: { readonly owner: string; readonly repo: string };
	readonly relativePath?: string;
	readonly location?: { readonly folderUri: UriComponents; readonly providerId?: string };
}

interface IRepositoryBuilder {
	identity: ISessionRepositoryIdentity;
	isSaved: boolean;
	readonly aliases: string[];
	readonly locations: ISessionRepositoryLocation[];
	sessionCount: number;
}

function isStoredRepository(value: unknown): value is IStoredRepository {
	if (!isObject(value)) {
		return false;
	}
	const candidate = value as Partial<IStoredRepository>;
	return typeof candidate.key === 'string'
		&& (candidate.kind === SessionRepositoryKind.Repository || candidate.kind === SessionRepositoryKind.Folder)
		&& typeof candidate.label === 'string'
		&& (candidate.location === undefined || (isObject(candidate.location) && isObject(candidate.location.folderUri)));
}

function addLocation(repository: IRepositoryBuilder, location: ISessionRepositoryLocation): void {
	if (!repository.locations.some(existing => isEqual(existing.folderUri, location.folderUri) && existing.providerId === location.providerId)) {
		repository.locations.push(location);
	}
}

export class SessionsRepositoriesService extends Disposable implements ISessionsRepositoriesService {

	declare readonly _serviceBrand: undefined;

	private readonly _saved = observableValue<readonly IStoredRepository[]>(this, []);
	private readonly _selectedKey = observableValue<string | undefined>(this, undefined);

	readonly repositories: IObservable<readonly ISessionsRepository[]>;
	readonly selectedRepository: IObservable<ISessionsRepository | undefined>;

	constructor(
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IStorageService private readonly _storageService: IStorageService,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._saved.set(this._readSaved(), undefined);
		this._selectedKey.set(this._storageService.get(SELECTED_REPOSITORY_STORAGE_KEY, StorageScope.WORKSPACE), undefined);

		const sessionsChanged = observableSignalFromEvent(this, this._sessionsManagementService.onDidChangeSessions);
		this.repositories = derived(this, reader => {
			sessionsChanged.read(reader);
			return this._computeRepositories(this._saved.read(reader), reader);
		});
		this.selectedRepository = derived(this, reader => {
			const key = this._selectedKey.read(reader);
			return key === undefined ? undefined : this.repositories.read(reader).find(repository => repository.key === key || repository.aliases.includes(key));
		});
	}

	selectRepository(key: string | undefined): void {
		this._selectedKey.set(key, undefined);
		if (key === undefined) {
			this._storageService.remove(SELECTED_REPOSITORY_STORAGE_KEY, StorageScope.WORKSPACE);
		} else {
			this._storageService.store(SELECTED_REPOSITORY_STORAGE_KEY, key, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
	}

	isSessionInRepository(session: ISessionRepositoryMember, repository: ISessionsRepository, reader?: IReader): boolean {
		const folder = session.workspace.read(reader)?.folders[0];
		if (!folder) {
			return false;
		}
		const key = getSessionFolderRepositoryIdentity(folder, reader).key;
		return key === repository.key
			|| repository.aliases.includes(key)
			|| repository.locations.some(location => isEqual(location.folderUri, folder.root));
	}

	async addFolder(folderUri: URI, providerId?: string): Promise<ISessionsRepository | undefined> {
		const resolved = this._sessionsManagementService.resolveWorkspace(folderUri, providerId);
		if (!resolved) {
			return undefined;
		}
		let gitRepository: IResolvedGitRepository | undefined;
		try {
			gitRepository = await resolveGitRepositoryFromGitConfig(this._fileService, folderUri, ['github.com']);
		} catch (error) {
			this._logService.warn('[Repositories] Unable to read Git metadata for a repository folder; saving it as a plain folder.', error);
		}
		const identity = getSessionRepositoryIdentity({
			root: folderUri,
			name: resolved.workspace.folders[0]?.name ?? basename(folderUri),
			gitHubRepository: gitRepository?.gitHub,
			repositoryUri: gitRepository?.root,
		});
		this._save(identity, { folderUri, providerId: resolved.providerId });
		return this.repositories.get().find(repository => repository.key === identity.key || repository.aliases.includes(identity.key));
	}

	saveRepository(repository: ISessionsRepository): void {
		this._save(repository, repository.locations[0]);
	}

	resolveRepositories(): void {
		for (const session of this._sessionsManagementService.getSessions()) {
			const git = session.workspace.get()?.folders[0]?.gitRepository;
			if (git && !git.gitHubInfo.get()) {
				git.resolveGitHubInfo?.();
			}
		}
	}

	removeSavedRepository(repository: ISessionsRepository): void {
		const keys = new Set([repository.key, ...repository.aliases]);
		const saved = this._saved.get();
		const remaining = saved.filter(record => !keys.has(record.key));
		if (remaining.length !== saved.length) {
			this._writeSaved(remaining);
		}
	}

	private _save(identity: ISessionRepositoryIdentity, location: ISessionRepositoryLocation | undefined): void {
		const record: IStoredRepository = {
			key: identity.key,
			kind: identity.kind,
			label: identity.label,
			gitHubRepository: identity.gitHubRepository,
			relativePath: identity.relativePath,
			location: location && { folderUri: location.folderUri.toJSON(), providerId: location.providerId },
		};
		const saved = this._saved.get();
		const index = saved.findIndex(existing => existing.key === identity.key);
		this._writeSaved(index === -1 ? [...saved, record] : saved.map((existing, i) => i === index ? record : existing));
	}

	private _computeRepositories(saved: readonly IStoredRepository[], reader: IReader): ISessionsRepository[] {
		const byKey = new Map<string, IRepositoryBuilder>();
		const sessions = [...this._sessionsManagementService.getSessions()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
		for (const session of sessions) {
			if (session.isArchived.read(reader) || session.isQuickChat?.read(reader)) {
				continue;
			}
			const folder = session.workspace.read(reader)?.folders[0];
			if (!folder) {
				continue;
			}
			const identity = getSessionFolderRepositoryIdentity(folder, reader);
			let repository = byKey.get(identity.key);
			if (!repository) {
				repository = { identity, isSaved: false, aliases: [], locations: [], sessionCount: 0 };
				byKey.set(identity.key, repository);
			}
			repository.sessionCount++;
			addLocation(repository, { folderUri: folder.root, providerId: session.providerId });
		}

		// A checkout without GitHub metadata yet, such as a worktree whose remote is still
		// resolving, joins the GitHub repository checked out at the same repository.
		for (const [key, repository] of byKey) {
			const repositoryUri = repository.identity.repositoryUri;
			if (repository.identity.gitHubRepository || !repositoryUri) {
				continue;
			}
			const target = [...byKey.values()].find(candidate => candidate.identity.gitHubRepository
				&& candidate.identity.relativePath === repository.identity.relativePath
				&& ((candidate.identity.repositoryUri && isEqual(candidate.identity.repositoryUri, repositoryUri)) || candidate.locations.some(location => isEqual(location.folderUri, repositoryUri))));
			if (target) {
				target.sessionCount += repository.sessionCount;
				target.aliases.push(key);
				for (const location of repository.locations) {
					addLocation(target, location);
				}
				byKey.delete(key);
			}
		}

		const savedRepositories: IRepositoryBuilder[] = [];
		for (const record of saved) {
			const location = record.location && { folderUri: URI.revive(record.location.folderUri), providerId: record.location.providerId };
			// A folder saved before its repository was known joins the repository its sessions report.
			let repository = byKey.get(record.key)
				?? (location && [...byKey.values()].find(candidate => candidate.locations.some(existing => isEqual(existing.folderUri, location.folderUri))));
			if (!repository) {
				repository = {
					identity: { key: record.key, kind: record.kind, label: record.label, gitHubRepository: record.gitHubRepository, relativePath: record.relativePath },
					isSaved: false,
					aliases: [],
					locations: [],
					sessionCount: 0,
				};
				byKey.set(record.key, repository);
			} else if (repository.identity.key !== record.key && !repository.aliases.includes(record.key)) {
				repository.aliases.push(record.key);
			}
			if (location) {
				addLocation(repository, location);
			}
			if (!repository.isSaved) {
				repository.isSaved = true;
				savedRepositories.push(repository);
			}
		}

		const ordered = [...savedRepositories, ...[...byKey.values()].filter(repository => !repository.isSaved)];
		return ordered.map(({ identity, isSaved, aliases, locations, sessionCount }) => ({ ...identity, isSaved, aliases, locations, sessionCount }));
	}

	private _readSaved(): IStoredRepository[] {
		const raw = this._storageService.get(SAVED_REPOSITORIES_STORAGE_KEY, StorageScope.PROFILE);
		if (!raw) {
			return [];
		}
		try {
			const value: unknown = JSON.parse(raw);
			if (!Array.isArray(value)) {
				throw new Error('Saved repositories must be an array.');
			}
			return value.filter(isStoredRepository);
		} catch (error) {
			this._logService.warn('[Repositories] Unable to restore saved repositories.', error);
			return [];
		}
	}

	private _writeSaved(saved: readonly IStoredRepository[]): void {
		this._saved.set(saved, undefined);
		if (saved.length === 0) {
			this._storageService.remove(SAVED_REPOSITORIES_STORAGE_KEY, StorageScope.PROFILE);
		} else {
			this._storageService.store(SAVED_REPOSITORIES_STORAGE_KEY, JSON.stringify(saved), StorageScope.PROFILE, StorageTarget.MACHINE);
		}
	}
}

registerSingleton(ISessionsRepositoriesService, SessionsRepositoriesService, InstantiationType.Delayed);
