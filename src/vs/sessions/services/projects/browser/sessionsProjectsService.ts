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
import { getSessionFolderProjectIdentity, getSessionProjectIdentity, ISessionProjectIdentity, SessionProjectKind } from '../common/sessionProject.js';
import { ISessionProject, ISessionProjectLocation, ISessionProjectMember, ISessionsProjectsService } from '../common/sessionsProjects.js';

/** Machine-local because locations are paths on this machine's view of its hosts. */
const SAVED_PROJECTS_STORAGE_KEY = 'sessions.projects.saved';
const SELECTED_PROJECT_STORAGE_KEY = 'sessions.projects.selected';

interface IStoredProject {
	readonly key: string;
	readonly kind: SessionProjectKind;
	readonly label: string;
	readonly gitHubRepository?: { readonly owner: string; readonly repo: string };
	readonly relativePath?: string;
	readonly location?: { readonly folderUri: UriComponents; readonly providerId?: string };
}

interface IProjectBuilder {
	identity: ISessionProjectIdentity;
	isSaved: boolean;
	readonly aliases: string[];
	readonly locations: ISessionProjectLocation[];
	sessionCount: number;
}

function isStoredProject(value: unknown): value is IStoredProject {
	if (!isObject(value)) {
		return false;
	}
	const candidate = value as Partial<IStoredProject>;
	return typeof candidate.key === 'string'
		&& (candidate.kind === SessionProjectKind.Repository || candidate.kind === SessionProjectKind.Folder)
		&& typeof candidate.label === 'string'
		&& (candidate.location === undefined || (isObject(candidate.location) && isObject(candidate.location.folderUri)));
}

function addLocation(project: IProjectBuilder, location: ISessionProjectLocation): void {
	if (!project.locations.some(existing => isEqual(existing.folderUri, location.folderUri) && existing.providerId === location.providerId)) {
		project.locations.push(location);
	}
}

export class SessionsProjectsService extends Disposable implements ISessionsProjectsService {

	declare readonly _serviceBrand: undefined;

	private readonly _saved = observableValue<readonly IStoredProject[]>(this, []);
	private readonly _selectedKey = observableValue<string | undefined>(this, undefined);

	readonly projects: IObservable<readonly ISessionProject[]>;
	readonly selectedProject: IObservable<ISessionProject | undefined>;

	constructor(
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IStorageService private readonly _storageService: IStorageService,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._saved.set(this._readSaved(), undefined);
		this._selectedKey.set(this._storageService.get(SELECTED_PROJECT_STORAGE_KEY, StorageScope.WORKSPACE), undefined);

		const sessionsChanged = observableSignalFromEvent(this, this._sessionsManagementService.onDidChangeSessions);
		this.projects = derived(this, reader => {
			sessionsChanged.read(reader);
			return this._computeProjects(this._saved.read(reader), reader);
		});
		this.selectedProject = derived(this, reader => {
			const key = this._selectedKey.read(reader);
			return key === undefined ? undefined : this.projects.read(reader).find(project => project.key === key || project.aliases.includes(key));
		});
	}

	selectProject(key: string | undefined): void {
		this._selectedKey.set(key, undefined);
		if (key === undefined) {
			this._storageService.remove(SELECTED_PROJECT_STORAGE_KEY, StorageScope.WORKSPACE);
		} else {
			this._storageService.store(SELECTED_PROJECT_STORAGE_KEY, key, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
	}

	isSessionInProject(session: ISessionProjectMember, project: ISessionProject, reader?: IReader): boolean {
		const folder = session.workspace.read(reader)?.folders[0];
		if (!folder) {
			return false;
		}
		const key = getSessionFolderProjectIdentity(folder, reader).key;
		return key === project.key
			|| project.aliases.includes(key)
			|| project.locations.some(location => isEqual(location.folderUri, folder.root));
	}

	async addFolder(folderUri: URI, providerId?: string): Promise<ISessionProject | undefined> {
		const resolved = this._sessionsManagementService.resolveWorkspace(folderUri, providerId);
		if (!resolved) {
			return undefined;
		}
		let repository: IResolvedGitRepository | undefined;
		try {
			repository = await resolveGitRepositoryFromGitConfig(this._fileService, folderUri, ['github.com']);
		} catch (error) {
			this._logService.warn('[Projects] Unable to read Git metadata for a project folder; saving it as a plain folder.', error);
		}
		const identity = getSessionProjectIdentity({
			root: folderUri,
			name: resolved.workspace.folders[0]?.name ?? basename(folderUri),
			gitHubRepository: repository?.gitHub,
			repositoryUri: repository?.root,
		});
		this._save(identity, { folderUri, providerId: resolved.providerId });
		return this.projects.get().find(project => project.key === identity.key || project.aliases.includes(identity.key));
	}

	saveProject(project: ISessionProject): void {
		this._save(project, project.locations[0]);
	}

	removeSavedProject(project: ISessionProject): void {
		const keys = new Set([project.key, ...project.aliases]);
		const saved = this._saved.get();
		const remaining = saved.filter(record => !keys.has(record.key));
		if (remaining.length !== saved.length) {
			this._writeSaved(remaining);
		}
	}

	private _save(identity: ISessionProjectIdentity, location: ISessionProjectLocation | undefined): void {
		const record: IStoredProject = {
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

	private _computeProjects(saved: readonly IStoredProject[], reader: IReader): ISessionProject[] {
		const byKey = new Map<string, IProjectBuilder>();
		const sessions = [...this._sessionsManagementService.getSessions()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
		for (const session of sessions) {
			if (session.isArchived.read(reader) || session.isQuickChat?.read(reader)) {
				continue;
			}
			const folder = session.workspace.read(reader)?.folders[0];
			if (!folder) {
				continue;
			}
			const identity = getSessionFolderProjectIdentity(folder, reader);
			let project = byKey.get(identity.key);
			if (!project) {
				project = { identity, isSaved: false, aliases: [], locations: [], sessionCount: 0 };
				byKey.set(identity.key, project);
			}
			project.sessionCount++;
			addLocation(project, { folderUri: folder.root, providerId: session.providerId });
		}

		const savedProjects: IProjectBuilder[] = [];
		for (const record of saved) {
			const location = record.location && { folderUri: URI.revive(record.location.folderUri), providerId: record.location.providerId };
			// A folder saved before its repository was known joins the project its sessions report.
			let project = byKey.get(record.key)
				?? (location && [...byKey.values()].find(candidate => candidate.locations.some(existing => isEqual(existing.folderUri, location.folderUri))));
			if (!project) {
				project = {
					identity: { key: record.key, kind: record.kind, label: record.label, gitHubRepository: record.gitHubRepository, relativePath: record.relativePath },
					isSaved: false,
					aliases: [],
					locations: [],
					sessionCount: 0,
				};
				byKey.set(record.key, project);
			} else if (project.identity.key !== record.key && !project.aliases.includes(record.key)) {
				project.aliases.push(record.key);
			}
			if (location) {
				addLocation(project, location);
			}
			if (!project.isSaved) {
				project.isSaved = true;
				savedProjects.push(project);
			}
		}

		const ordered = [...savedProjects, ...[...byKey.values()].filter(project => !project.isSaved)];
		return ordered.map(({ identity, isSaved, aliases, locations, sessionCount }) => ({ ...identity, isSaved, aliases, locations, sessionCount }));
	}

	private _readSaved(): IStoredProject[] {
		const raw = this._storageService.get(SAVED_PROJECTS_STORAGE_KEY, StorageScope.PROFILE);
		if (!raw) {
			return [];
		}
		try {
			const value: unknown = JSON.parse(raw);
			if (!Array.isArray(value)) {
				throw new Error('Saved projects must be an array.');
			}
			return value.filter(isStoredProject);
		} catch (error) {
			this._logService.warn('[Projects] Unable to restore saved projects.', error);
			return [];
		}
	}

	private _writeSaved(saved: readonly IStoredProject[]): void {
		this._saved.set(saved, undefined);
		if (saved.length === 0) {
			this._storageService.remove(SAVED_PROJECTS_STORAGE_KEY, StorageScope.PROFILE);
		} else {
			this._storageService.store(SAVED_PROJECTS_STORAGE_KEY, JSON.stringify(saved), StorageScope.PROFILE, StorageTarget.MACHINE);
		}
	}
}

registerSingleton(ISessionsProjectsService, SessionsProjectsService, InstantiationType.Delayed);
