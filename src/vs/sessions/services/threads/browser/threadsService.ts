/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ISession, ISessionAgentRef } from '../../sessions/common/session.js';
import { ISessionsManagementService } from '../../sessions/common/sessionsManagement.js';

export const ThreadAvatarIds = {
	Cowboy: 'cowboyHat',
	Wizard: 'wizardHat',
	Chef: 'whiteChefHat',
	Artist: 'artistBeret',
	Crown: 'crown',
	Propeller: 'propellerHat',
} as const;

export type ThreadAvatarId = typeof ThreadAvatarIds[keyof typeof ThreadAvatarIds];

export type ThreadScope =
	| { readonly kind: 'global' }
	| { readonly kind: 'workspace'; readonly folderUri: URI };

export interface IThreadDescriptor {
	readonly id: string;
	readonly name: string;
	readonly sessionId: string;
	readonly sessionResource: URI;
	readonly providerId: string;
	readonly sessionTypeId: string;
	readonly scope: ThreadScope;
	readonly agent?: ISessionAgentRef;
	readonly avatar: ThreadAvatarId;
	readonly connectorIds: readonly string[];
	readonly automationIds: readonly string[];
	readonly archived: boolean;
	readonly createdAt: number;
	readonly updatedAt: number;
}

export interface ICreateThread {
	readonly name: string;
	readonly session: ISession;
	readonly sessionTypeId: string;
	readonly scope: ThreadScope;
	readonly agent?: ISessionAgentRef;
	readonly avatar: ThreadAvatarId;
	readonly connectorIds: readonly string[];
}

interface ISerializedThreadDescriptor extends Omit<IThreadDescriptor, 'sessionResource' | 'scope'> {
	readonly sessionResource: string;
	readonly scope: { readonly kind: 'global' } | { readonly kind: 'workspace'; readonly folderUri: string };
}

export interface IThreadsService {
	readonly _serviceBrand: undefined;
	readonly threads: IObservable<readonly IThreadDescriptor[]>;
	readonly onDidChange: Event<void>;
	createThread(options: ICreateThread): IThreadDescriptor;
	renameThread(threadId: string, name: string): Promise<void>;
	setAvatar(threadId: string, avatar: ThreadAvatarId): void;
	setArchived(threadId: string, archived: boolean): void;
	deleteThread(threadId: string): Promise<void>;
	addAutomation(threadId: string, automationId: string): void;
	removeAutomation(threadId: string, automationId: string): void;
	getThread(threadId: string): IThreadDescriptor | undefined;
	getThreadForSession(session: ISession): IThreadDescriptor | undefined;
	isThread(session: ISession): boolean;
}

export const IThreadsService = createDecorator<IThreadsService>('threadsService');

export class ThreadsService extends Disposable implements IThreadsService {
	declare readonly _serviceBrand: undefined;

	private static readonly STORAGE_KEY = 'sessions.threads';

	private readonly _threads = observableValue<readonly IThreadDescriptor[]>(this, []);
	readonly threads: IObservable<readonly IThreadDescriptor[]> = this._threads;
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
	) {
		super();
		this._threads.set(this.load(), undefined);
		const replaceSession = ({ from, to }: { readonly from: ISession; readonly to: ISession }) => {
			const thread = this.getThreadForSession(from);
			if (!thread) {
				return;
			}
			this.replace(thread.id, {
				...thread,
				sessionId: to.sessionId,
				sessionResource: to.resource,
				updatedAt: Date.now(),
			});
		};
		this._register(this.sessionsManagementService.onDidReplaceNewDraftSession(replaceSession));
		this._register(this.sessionsManagementService.onDidReplaceSession(replaceSession));
		this._register(this.sessionsManagementService.onDidDeleteSession(session => {
			const thread = this.getThreadForSession(session);
			if (thread) {
				this.remove(thread.id);
			}
		}));
	}

	createThread(options: ICreateThread): IThreadDescriptor {
		const now = Date.now();
		const thread: IThreadDescriptor = {
			id: generateUuid(),
			name: options.name,
			sessionId: options.session.sessionId,
			sessionResource: options.session.resource,
			providerId: options.session.providerId,
			sessionTypeId: options.sessionTypeId,
			scope: options.scope,
			agent: options.agent,
			avatar: options.avatar,
			connectorIds: [...new Set(options.connectorIds)],
			automationIds: [],
			archived: false,
			createdAt: now,
			updatedAt: now,
		};
		this.setThreads([...this._threads.get(), thread]);
		return thread;
	}

	async renameThread(threadId: string, name: string): Promise<void> {
		const thread = this.getThread(threadId);
		const title = name.trim();
		if (!thread || !title || thread.name === title) {
			return;
		}
		const session = this.sessionsManagementService.getSession(thread.sessionResource);
		if (session) {
			await this.sessionsManagementService.renameSession(session, title);
		}
		this.replace(threadId, { ...thread, name: title, updatedAt: Date.now() });
	}

	setAvatar(threadId: string, avatar: ThreadAvatarId): void {
		const thread = this.getThread(threadId);
		if (!thread || thread.avatar === avatar) {
			return;
		}
		this.replace(threadId, { ...thread, avatar, updatedAt: Date.now() });
	}

	setArchived(threadId: string, archived: boolean): void {
		const thread = this.getThread(threadId);
		if (!thread || thread.archived === archived) {
			return;
		}
		this.replace(threadId, { ...thread, archived, updatedAt: Date.now() });
	}

	async deleteThread(threadId: string): Promise<void> {
		const thread = this.getThread(threadId);
		if (!thread) {
			return;
		}
		const session = this.sessionsManagementService.getSession(thread.sessionResource);
		if (session) {
			await this.sessionsManagementService.deleteSession(session);
		}
		this.remove(threadId);
	}

	addAutomation(threadId: string, automationId: string): void {
		const thread = this.getThread(threadId);
		if (!thread || thread.automationIds.includes(automationId)) {
			return;
		}
		this.replace(threadId, {
			...thread,
			automationIds: [...thread.automationIds, automationId],
			updatedAt: Date.now(),
		});
	}

	removeAutomation(threadId: string, automationId: string): void {
		const thread = this.getThread(threadId);
		if (!thread || !thread.automationIds.includes(automationId)) {
			return;
		}
		this.replace(threadId, {
			...thread,
			automationIds: thread.automationIds.filter(id => id !== automationId),
			updatedAt: Date.now(),
		});
	}

	getThread(threadId: string): IThreadDescriptor | undefined {
		return this._threads.get().find(thread => thread.id === threadId);
	}

	getThreadForSession(session: ISession): IThreadDescriptor | undefined {
		return this._threads.get().find(thread => thread.sessionId === session.sessionId || thread.sessionResource.toString() === session.resource.toString());
	}

	isThread(session: ISession): boolean {
		return this.getThreadForSession(session) !== undefined;
	}

	private replace(threadId: string, replacement: IThreadDescriptor): void {
		this.setThreads(this._threads.get().map(thread => thread.id === threadId ? replacement : thread));
	}

	private remove(threadId: string): void {
		this.setThreads(this._threads.get().filter(thread => thread.id !== threadId));
	}

	private setThreads(threads: readonly IThreadDescriptor[]): void {
		this._threads.set(threads, undefined);
		this.save(threads);
		this._onDidChange.fire();
	}

	private load(): readonly IThreadDescriptor[] {
		const raw = this.storageService.get(ThreadsService.STORAGE_KEY, StorageScope.PROFILE);
		if (!raw) {
			return [];
		}
		try {
			const parsed = JSON.parse(raw) as ISerializedThreadDescriptor[];
			if (!Array.isArray(parsed)) {
				return [];
			}
			return parsed.flatMap(thread => {
				if (
					!thread
					|| typeof thread.id !== 'string'
					|| typeof thread.name !== 'string'
					|| typeof thread.sessionId !== 'string'
					|| typeof thread.sessionResource !== 'string'
					|| typeof thread.providerId !== 'string'
					|| typeof thread.sessionTypeId !== 'string'
					|| !Object.values(ThreadAvatarIds).includes(thread.avatar)
					|| !Array.isArray(thread.connectorIds)
					|| !Array.isArray(thread.automationIds)
					|| typeof thread.archived !== 'boolean'
					|| typeof thread.createdAt !== 'number'
					|| typeof thread.updatedAt !== 'number'
				) {
					return [];
				}
				const scope: ThreadScope = thread.scope?.kind === 'workspace' && typeof thread.scope.folderUri === 'string'
					? { kind: 'workspace', folderUri: URI.parse(thread.scope.folderUri) }
					: { kind: 'global' };
				return [{
					...thread,
					sessionResource: URI.parse(thread.sessionResource),
					scope,
				}];
			});
		} catch {
			return [];
		}
	}

	private save(threads: readonly IThreadDescriptor[]): void {
		if (threads.length === 0) {
			this.storageService.remove(ThreadsService.STORAGE_KEY, StorageScope.PROFILE);
			return;
		}
		const serialized: ISerializedThreadDescriptor[] = threads.map(thread => ({
			...thread,
			sessionResource: thread.sessionResource.toString(),
			scope: thread.scope.kind === 'workspace'
				? { kind: 'workspace', folderUri: thread.scope.folderUri.toString() }
				: { kind: 'global' },
		}));
		this.storageService.store(ThreadsService.STORAGE_KEY, JSON.stringify(serialized), StorageScope.PROFILE, StorageTarget.USER);
	}
}

registerSingleton(IThreadsService, ThreadsService, InstantiationType.Delayed);
