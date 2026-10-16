/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, observableValue } from '../../../../base/common/observable.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IAgentHostConnectionsService } from '../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ISession, ISessionAgentRef } from '../../sessions/common/session.js';
import { ISessionsManagementService } from '../../sessions/common/sessionsManagement.js';

export const ThreadAvatarIds = {
	None: 'none',
	Cowboy: 'cowboyHat',
	Wizard: 'wizardHat',
	Chef: 'whiteChefHat',
	Artist: 'artistBeret',
	Crown: 'crown',
	Propeller: 'propellerHat',
} as const;

export type ThreadAvatarId = typeof ThreadAvatarIds[keyof typeof ThreadAvatarIds];

export const LOCAL_THREAD_HOST_ID = 'local';

export type ThreadScope =
	| { readonly kind: 'global'; readonly hostId: string }
	| { readonly kind: 'workspace'; readonly hostId: string; readonly folderUri: URI };

export interface IThreadParticipant {
	readonly id: string;
	readonly name: string;
	readonly agent?: ISessionAgentRef;
}

export interface IThreadDescriptor {
	readonly schemaVersion: 2;
	readonly id: string;
	readonly name: string;
	readonly sessionId: string;
	readonly sessionResource: URI;
	/** Exact host-native AHP session address used by session-management tools. */
	readonly routingResource: URI;
	readonly materialized: boolean;
	readonly providerId: string;
	readonly sessionTypeId: string;
	readonly scope: ThreadScope;
	readonly participants: readonly IThreadParticipant[];
	readonly primaryParticipantId: string;
	readonly avatar: ThreadAvatarId;
	readonly connectorIds: readonly string[];
	readonly automationIds: readonly string[];
	readonly createdAt: number;
	readonly updatedAt: number;
}

export interface ICreateThread {
	readonly name: string;
	readonly session: ISession;
	readonly sessionTypeId: string;
	readonly scope: ThreadScope;
	readonly participants: readonly IThreadParticipant[];
	readonly primaryParticipantId: string;
	readonly avatar: ThreadAvatarId;
	readonly connectorIds: readonly string[];
}

interface ISerializedThreadDescriptor extends Omit<IThreadDescriptor, 'sessionResource' | 'routingResource' | 'scope' | 'schemaVersion' | 'participants' | 'primaryParticipantId' | 'materialized'> {
	readonly schemaVersion?: 2;
	readonly sessionResource: string;
	readonly routingResource?: string;
	readonly materialized?: boolean;
	readonly scope: { readonly kind: 'global'; readonly hostId?: string } | { readonly kind: 'workspace'; readonly hostId?: string; readonly folderUri: string };
	readonly participants?: readonly IThreadParticipant[];
	readonly primaryParticipantId?: string;
	readonly agent?: ISessionAgentRef;
	readonly archived?: boolean;
}

export interface IThreadsService {
	readonly _serviceBrand: undefined;
	readonly threads: IObservable<readonly IThreadDescriptor[]>;
	readonly activeDraftThread: IObservable<IThreadDescriptor | undefined>;
	readonly onDidChange: Event<void>;
	createThread(options: ICreateThread): IThreadDescriptor;
	renameThread(threadId: string, name: string): Promise<void>;
	setAvatar(threadId: string, avatar: ThreadAvatarId): void;
	setParticipants(threadId: string, participants: readonly IThreadParticipant[], primaryParticipantId: string): void;
	rebindDraft(threadId: string, session: ISession): void;
	setActiveDraftThread(threadId: string | undefined): void;
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
	private readonly _activeDraftThreadId = observableValue<string | undefined>(this, undefined);
	readonly activeDraftThread = derived(this, reader => {
		const activeId = this._activeDraftThreadId.read(reader);
		return activeId ? this._threads.read(reader).find(thread => thread.id === activeId) : undefined;
	});
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IAgentHostConnectionsService private readonly agentHostConnectionsService: IAgentHostConnectionsService,
	) {
		super();
		const threads = this.load();
		this._threads.set(threads, undefined);
		this.save(threads);
		const replaceSession = ({ from, to }: { readonly from: ISession; readonly to: ISession }) => {
			const thread = this.getThreadForSession(from);
			if (!thread) {
				return;
			}
			this.replace(thread.id, {
				...thread,
				sessionId: to.sessionId,
				sessionResource: to.resource,
				routingResource: this.resolveRoutingResource(to.resource),
				materialized: true,
				updatedAt: Date.now(),
			});
			if (this._activeDraftThreadId.get() === thread.id) {
				this._activeDraftThreadId.set(undefined, undefined);
			}
		};
		this._register(this.sessionsManagementService.onDidReplaceNewDraftSession(replaceSession));
		this._register(this.sessionsManagementService.onDidReplaceSession(replaceSession));
		this._register(this.sessionsManagementService.onDidDeleteSession(session => {
			const thread = this.getThreadForSession(session);
			if (thread) {
				this.remove(thread.id);
			}
		}));
		this._register(this.agentHostConnectionsService.onDidChangeSessionResolution(() => {
			const threads = this._threads.get();
			let changed = false;
			const resolved = threads.map(thread => {
				const routingResource = this.resolveRoutingResource(thread.sessionResource);
				if (routingResource.toString() === thread.routingResource.toString()) {
					return thread;
				}
				changed = true;
				return { ...thread, routingResource, updatedAt: Date.now() };
			});
			if (changed) {
				this.setThreads(resolved);
			}
		}));
	}

	createThread(options: ICreateThread): IThreadDescriptor {
		const now = Date.now();
		const thread: IThreadDescriptor = {
			schemaVersion: 2,
			id: generateUuid(),
			name: options.name,
			sessionId: options.session.sessionId,
			sessionResource: options.session.resource,
			routingResource: this.resolveRoutingResource(options.session.resource),
			materialized: false,
			providerId: options.session.providerId,
			sessionTypeId: options.sessionTypeId,
			scope: options.scope,
			participants: options.participants,
			primaryParticipantId: options.primaryParticipantId,
			avatar: options.avatar,
			connectorIds: [...new Set(options.connectorIds)],
			automationIds: [],
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

	setParticipants(threadId: string, participants: readonly IThreadParticipant[], primaryParticipantId: string): void {
		const thread = this.getThread(threadId);
		if (!thread || participants.length === 0 || !participants.some(participant => participant.id === primaryParticipantId)) {
			return;
		}
		this.replace(threadId, {
			...thread,
			participants: [...participants],
			primaryParticipantId,
			updatedAt: Date.now(),
		});
	}

	rebindDraft(threadId: string, session: ISession): void {
		const thread = this.getThread(threadId);
		if (!thread) {
			return;
		}

		this.replace(threadId, {
			...thread,
			sessionId: session.sessionId,
			sessionResource: session.resource,
			routingResource: this.resolveRoutingResource(session.resource),
			materialized: false,
			updatedAt: Date.now(),
		});
	}

	setActiveDraftThread(threadId: string | undefined): void {
		this._activeDraftThreadId.set(threadId, undefined);
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
		if (this._activeDraftThreadId.get() === threadId) {
			this._activeDraftThreadId.set(undefined, undefined);
		}
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
					|| typeof thread.createdAt !== 'number'
					|| typeof thread.updatedAt !== 'number'
				) {
					return [];
				}
				const scope: ThreadScope = thread.scope?.kind === 'workspace' && typeof thread.scope.folderUri === 'string'
					? { kind: 'workspace', hostId: thread.scope.hostId ?? LOCAL_THREAD_HOST_ID, folderUri: URI.parse(thread.scope.folderUri) }
					: { kind: 'global', hostId: thread.scope?.hostId ?? LOCAL_THREAD_HOST_ID };
				const participants = thread.participants?.filter(participant =>
					typeof participant.id === 'string'
					&& typeof participant.name === 'string'
					&& (participant.agent === undefined || typeof participant.agent.uri === 'string')
				) ?? [];
				if (participants.length === 0) {
					participants.push(thread.agent
						? { id: thread.agent.uri, name: localize('threadParticipant.migrated', "Agent"), agent: thread.agent }
						: { id: 'default', name: localize('threadParticipant.default', "Default Agent") });
				}
				const primaryParticipantId = participants.some(participant => participant.id === thread.primaryParticipantId)
					? thread.primaryParticipantId!
					: participants[0].id;
				const sessionResource = URI.parse(thread.sessionResource);
				const routingResource = this.agentHostConnectionsService.resolveSessionResourceIdentity(sessionResource)?.backendSession
					?? (thread.routingResource ? URI.parse(thread.routingResource) : sessionResource);
				return [{
					schemaVersion: 2,
					id: thread.id,
					name: thread.name,
					sessionId: thread.sessionId,
					sessionResource,
					routingResource,
					materialized: thread.materialized ?? (thread.schemaVersion === 2
						? this.sessionsManagementService.getSession(sessionResource) !== undefined
						: true),
					providerId: thread.providerId,
					sessionTypeId: thread.sessionTypeId,
					scope,
					participants,
					primaryParticipantId,
					avatar: thread.avatar,
					connectorIds: thread.connectorIds,
					automationIds: thread.automationIds,
					createdAt: thread.createdAt,
					updatedAt: thread.updatedAt,
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
			routingResource: thread.routingResource.toString(),
			scope: thread.scope.kind === 'workspace'
				? { kind: 'workspace', hostId: thread.scope.hostId, folderUri: thread.scope.folderUri.toString() }
				: { kind: 'global', hostId: thread.scope.hostId },
		}));
		this.storageService.store(ThreadsService.STORAGE_KEY, JSON.stringify(serialized), StorageScope.PROFILE, StorageTarget.USER);
	}

	private resolveRoutingResource(sessionResource: URI): URI {
		return this.agentHostConnectionsService.resolveSessionResourceIdentity(sessionResource)?.backendSession ?? sessionResource;
	}
}

registerSingleton(IThreadsService, ThreadsService, InstantiationType.Delayed);
