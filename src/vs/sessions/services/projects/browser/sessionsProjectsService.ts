/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, IReader, observableValue } from '../../../../base/common/observable.js';
import { isObject } from '../../../../base/common/types.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ISession } from '../../sessions/common/session.js';
import { ISessionsManagementService } from '../../sessions/common/sessionsManagement.js';
import { buildProjectKickoff, ICreateSessionsProjectOptions, ISessionsProject, ISessionsProjectsService } from '../common/sessionsProjects.js';

/** Machine-local, like the coordinator sessions and repository locations it refers to. */
const PROJECTS_STORAGE_KEY = 'sessions.projects';
const SELECTED_PROJECT_STORAGE_KEY = 'sessions.projects.selected';
/** Bounds the walk up a session's creators, guarding against cycles in provider metadata. */
const MAX_CREATOR_DEPTH = 32;

interface IStoredProject {
	readonly id: string;
	readonly name: string;
	readonly repositories: readonly { readonly key: string; readonly label: string; readonly folderUri?: UriComponents; readonly providerId?: string }[];
	readonly coordinator: UriComponents;
	readonly createdAt: number;
}

function isStoredProject(value: unknown): value is IStoredProject {
	if (!isObject(value)) {
		return false;
	}
	const candidate = value as Partial<IStoredProject>;
	return typeof candidate.id === 'string'
		&& typeof candidate.name === 'string'
		&& typeof candidate.createdAt === 'number'
		&& isObject(candidate.coordinator)
		&& Array.isArray(candidate.repositories)
		&& candidate.repositories.every(repository => isObject(repository) && typeof repository.key === 'string' && typeof repository.label === 'string');
}

function reviveProject(record: IStoredProject): ISessionsProject {
	return {
		id: record.id,
		name: record.name,
		createdAt: record.createdAt,
		coordinator: URI.revive(record.coordinator),
		repositories: record.repositories.map(repository => ({
			key: repository.key,
			label: repository.label,
			folderUri: repository.folderUri && URI.revive(repository.folderUri),
			providerId: repository.providerId,
		})),
	};
}

function storeProject(project: ISessionsProject): IStoredProject {
	return {
		id: project.id,
		name: project.name,
		createdAt: project.createdAt,
		coordinator: project.coordinator.toJSON(),
		repositories: project.repositories.map(repository => ({
			key: repository.key,
			label: repository.label,
			folderUri: repository.folderUri?.toJSON(),
			providerId: repository.providerId,
		})),
	};
}

export class SessionsProjectsService extends Disposable implements ISessionsProjectsService {

	declare readonly _serviceBrand: undefined;

	private readonly _projects = observableValue<readonly ISessionsProject[]>(this, []);
	readonly projects: IObservable<readonly ISessionsProject[]> = this._projects;

	private readonly _selectedId = observableValue<string | undefined>(this, undefined);
	readonly selectedProject: IObservable<ISessionsProject | undefined>;

	constructor(
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IStorageService private readonly _storageService: IStorageService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._projects.set(this._read(), undefined);
		this._selectedId.set(this._storageService.get(SELECTED_PROJECT_STORAGE_KEY, StorageScope.WORKSPACE), undefined);
		this.selectedProject = derived(this, reader => {
			const id = this._selectedId.read(reader);
			return id === undefined ? undefined : this._projects.read(reader).find(project => project.id === id);
		});
	}

	selectProject(id: string | undefined): void {
		this._selectedId.set(id, undefined);
		if (id === undefined) {
			this._storageService.remove(SELECTED_PROJECT_STORAGE_KEY, StorageScope.WORKSPACE);
		} else {
			this._storageService.store(SELECTED_PROJECT_STORAGE_KEY, id, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
	}

	async createProject(options: ICreateSessionsProjectOptions, token: CancellationToken = CancellationToken.None): Promise<ISessionsProject | undefined> {
		const name = options.name.trim();
		const session = await this._sessionsManagementService.createAndSendQuickChatRequest({
			query: buildProjectKickoff(name, options.repositories, options.firstMessage),
			title: name,
		}, undefined, token);
		if (!session || token.isCancellationRequested) {
			return undefined;
		}
		const project: ISessionsProject = {
			id: generateUuid(),
			name,
			repositories: options.repositories,
			coordinator: session.resource,
			createdAt: Date.now(),
		};
		this._write([project, ...this._projects.get()]);
		return project;
	}

	getProjectOfCoordinator(session: Pick<ISession, 'resource'>): ISessionsProject | undefined {
		const resource = session.resource.toString();
		return this._projects.get().find(project => project.coordinator.toString() === resource);
	}

	getProjectForSession(session: ISession, reader?: IReader): ISessionsProject | undefined {
		const projects = this._projects.read(reader);
		if (projects.length === 0) {
			return undefined;
		}
		const byCoordinator = new Map(projects.map(project => [project.coordinator.toString(), project]));
		let resource = session.resource;
		let current: ISession | undefined = session;
		const visited = new Set<string>();
		for (let depth = 0; depth < MAX_CREATOR_DEPTH; depth++) {
			const key = resource.toString();
			const project = byCoordinator.get(key);
			if (project) {
				return project;
			}
			const creator = current?.createdBySession?.read(reader)?.session;
			if (!creator || visited.has(key)) {
				return undefined;
			}
			visited.add(key);
			resource = creator;
			current = this._sessionsManagementService.getSession(creator);
		}
		return undefined;
	}

	renameProject(id: string, name: string): void {
		const trimmed = name.trim();
		if (trimmed) {
			this._write(this._projects.get().map(project => project.id === id ? { ...project, name: trimmed } : project));
		}
	}

	removeProject(id: string): void {
		if (this._selectedId.get() === id) {
			this.selectProject(undefined);
		}
		this._write(this._projects.get().filter(project => project.id !== id));
	}

	private _read(): ISessionsProject[] {
		const raw = this._storageService.get(PROJECTS_STORAGE_KEY, StorageScope.PROFILE);
		if (!raw) {
			return [];
		}
		try {
			const value: unknown = JSON.parse(raw);
			if (!Array.isArray(value)) {
				throw new Error('Projects must be an array.');
			}
			return value.filter(isStoredProject).map(reviveProject);
		} catch (error) {
			this._logService.warn('[Projects] Unable to restore projects.', error);
			return [];
		}
	}

	private _write(projects: readonly ISessionsProject[]): void {
		this._projects.set(projects, undefined);
		if (projects.length === 0) {
			this._storageService.remove(PROJECTS_STORAGE_KEY, StorageScope.PROFILE);
		} else {
			this._storageService.store(PROJECTS_STORAGE_KEY, JSON.stringify(projects.map(storeProject)), StorageScope.PROFILE, StorageTarget.MACHINE);
		}
	}
}

registerSingleton(ISessionsProjectsService, SessionsProjectsService, InstantiationType.Delayed);
