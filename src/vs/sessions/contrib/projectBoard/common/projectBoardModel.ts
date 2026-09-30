/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReader } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IProjectBoardConfiguration } from './projectBoardConfiguration.js';
import { IChat, ISession, ChatInteractivity, ChatOriginKind, SessionArtifactKind, SessionStatus, getGitHubPullRequestRefs, getSessionOwnedGitHubPullRequestRefs, getSessionChildChats } from '../../../services/sessions/common/session.js';

export interface IProjectBoardAxis {
	readonly id: string;
	readonly label: string;
}

export interface IProjectBoardPlacement {
	readonly rowId: string;
	readonly columnId: string;
}

export interface IProjectBoardCard {
	readonly id: string;
	readonly session: ISession;
	readonly chat: IChat;
	readonly title: string;
	readonly sessionTitle: string;
	readonly status: SessionStatus;
	readonly isRead: boolean;
	readonly description: string | undefined;
	readonly archived: boolean;
	readonly readOnly: boolean;
	readonly workspace: string | undefined;
	readonly sharedContext: readonly { readonly label: string; readonly uri: URI }[];
	readonly pullRequests: readonly {
		readonly label: string;
		readonly uri: URI;
		readonly title?: string;
		readonly icon?: ThemeIcon;
		readonly state?: 'open' | 'closed' | 'merged';
	}[];
	readonly connection: string | undefined;
}

export const projectBoardRows: readonly IProjectBoardAxis[] = [
	{ id: 'general', label: localize('projectBoard.general', "General") },
];

export const projectBoardColumns: readonly IProjectBoardAxis[] = [
	{ id: 'p0', label: localize('projectBoard.p0', "P0") },
	{ id: 'p1', label: localize('projectBoard.p1', "P1") },
	{ id: 'p2', label: localize('projectBoard.p2', "P2") },
	{ id: 'p3', label: localize('projectBoard.p3', "P3") },
];

export class ProjectBoardModel {

	private readonly placements = new Map<string, IProjectBoardPlacement>();
	private _cards: readonly IProjectBoardCard[] = [];
	private readonly knownChatIds = new Set<string>();
	private readonly promptRecency = new Map<string, number>();
	private frozenOrder: Map<string, number> | undefined;
	private _rows = projectBoardRows;
	private _columns = projectBoardColumns;
	private autoIncludeSessions = true;
	private showSessionList = false;
	private sessionPlacements: Map<ISession, IProjectBoardPlacement | undefined> | undefined;
	private readonly parents = new Map<string, IProjectBoardCard>();
	private readonly children = new Map<string, readonly IProjectBoardCard[]>();

	get rows(): readonly IProjectBoardAxis[] { return this._rows; }
	get columns(): readonly IProjectBoardAxis[] { return this._columns; }
	get isSortingDeferred(): boolean { return !!this.frozenOrder; }

	updateConfiguration(configuration: IProjectBoardConfiguration): void {
		this._rows = configuration.rows;
		this._columns = configuration.columns;
		this.autoIncludeSessions = configuration.autoIncludeSessions;
		this.showSessionList = !!configuration.display?.showSessionList;
		this.sessionPlacements = undefined;
		this.placements.clear();
		for (const placement of configuration.placements) {
			this.placements.set(placement.cardId, { rowId: placement.rowId, columnId: placement.columnId });
		}
	}

	get cards(): readonly IProjectBoardCard[] {
		return this._cards;
	}

	hasChat(cardId: string): boolean {
		return this.knownChatIds.has(cardId);
	}

	setPromptRecency(cardId: string, submittedAt: number | undefined): void {
		if (submittedAt !== undefined && Number.isFinite(submittedAt)) {
			this.promptRecency.set(cardId, submittedAt);
		} else {
			this.promptRecency.delete(cardId);
		}
	}

	setSortingDeferred(deferred: boolean): void {
		if (deferred && !this.frozenOrder) {
			this.frozenOrder = new Map(this.sortCards(this._cards).map((card, index) => [card.id, index]));
		} else if (!deferred) {
			this.frozenOrder = undefined;
		}
	}

	private sortCards(cards: readonly IProjectBoardCard[]): readonly IProjectBoardCard[] {
		return [...cards].sort((first, second) => {
			if (this.frozenOrder) {
				const difference = (this.frozenOrder.get(first.id) ?? Number.MAX_SAFE_INTEGER) - (this.frozenOrder.get(second.id) ?? Number.MAX_SAFE_INTEGER);
				if (difference) {
					return difference;
				}
			} else {
				const firstTime = this.promptRecency.get(first.id);
				const secondTime = this.promptRecency.get(second.id);
				if (firstTime !== secondTime) {
					return firstTime === undefined ? 1 : secondTime === undefined ? -1 : secondTime - firstTime;
				}
			}
			return first.id < second.id ? -1 : first.id > second.id ? 1 : 0;
		});
	}

	updateSessions(sessions: readonly ISession[], reader?: IReader): void {
		const cards: IProjectBoardCard[] = [];
		this.knownChatIds.clear();
		for (const session of sessions) {
			const sessionTitle = session.title.read(reader);
			const sessionWorkspace = session.workspace?.read(reader);
			const sharedContext = new Map<string, { label: string; uri: URI }>();
			const sharedPullRequests = new Map<string, IProjectBoardCard['pullRequests'][number]>();
			for (const artifact of session.artifacts?.read(reader) ?? []) {
				const uri = artifact.link ?? artifact.uri;
				if (uri) {
					const link = { label: artifact.label, uri };
					if (artifact.kind === SessionArtifactKind.PullRequest && artifact.isArtifact && ['http', 'https'].includes(uri.scheme)) {
						sharedPullRequests.set(uri.toString(), link);
					} else {
						sharedContext.set(uri.toString(), link);
					}
				}
			}
			const connection = session.remoteConnectionStatus?.read(reader)?.kind;
			for (const chat of session.chats.read(reader)) {
				this.knownChatIds.add(getProjectBoardCardId(session, chat));
				if (chat.interactivity.read(reader) === ChatInteractivity.Hidden) {
					continue;
				}
				const workspace = chat.workspace?.read(reader) ?? sessionWorkspace;
				const context = new Map(sharedContext);
				const pullRequests = new Map(sharedPullRequests);
				for (const folder of workspace?.folders ?? []) {
					const info = folder.gitRepository?.gitHubInfo.read(reader);
					for (const pr of getGitHubPullRequestRefs(info)) {
						context.set(pr.uri.toString(), { label: `${pr.owner}/${pr.repo}#${pr.number}`, uri: pr.uri });
					}
					for (const pr of getSessionOwnedGitHubPullRequestRefs(info)) {
						if (['http', 'https'].includes(pr.uri.scheme)) {
							pullRequests.set(pr.uri.toString(), {
								label: `${pr.owner}/${pr.repo}#${pr.number}`, uri: pr.uri, title: pr.title,
								icon: pr.icon, state: pr.liveState ?? pr.state,
							});
						}
					}
				}
				for (const uri of pullRequests.keys()) {
					context.delete(uri);
				}
				cards.push({
					id: getProjectBoardCardId(session, chat),
					session,
					chat,
					title: chat.title.read(reader),
					sessionTitle,
					status: chat.status.read(reader),
					isRead: chat.isRead.read(reader),
					description: chat.description.read(reader)?.value,
					archived: !!(session.isArchived?.read(reader) || chat.isArchived?.read(reader)),
					readOnly: chat.interactivity.read(reader) === ChatInteractivity.ReadOnly,
					workspace: workspace?.label,
					sharedContext: [...context.values()],
					pullRequests: [...pullRequests.values()],
					connection: connection && connection !== 'connected' ? connection : undefined,
				});
			}
		}
		this._cards = cards;
		this.sessionPlacements = undefined;
		this.parents.clear();
		this.children.clear();
		const byId = new Map(cards.map(card => [card.id, card]));
		for (const session of sessions) {
			const parent = byId.get(getProjectBoardCardId(session, session.mainChat.read(reader)));
			if (parent) {
				for (const chat of getSessionChildChats(session, reader)) {
					const child = byId.get(getProjectBoardCardId(session, chat));
					if (child) {
						this.parents.set(child.id, parent);
					}
				}
			}
			for (const chat of session.chats.read(reader)) {
				if (chat.origin?.kind !== ChatOriginKind.Tool || !chat.origin.parentChat) {
					continue;
				}
				const child = byId.get(getProjectBoardCardId(session, chat));
				const spawningChat = byId.get(`${getProjectBoardSessionKey(session)}\0${chat.origin.parentChat.toString()}`);
				if (child && spawningChat && child !== spawningChat) {
					this.parents.set(child.id, spawningChat);
				}
			}
		}
		// Malformed provider cycles stay visible as roots rather than hiding chats or recursing forever.
		for (const card of cards) {
			const ancestors = new Set<string>();
			let current: IProjectBoardCard | undefined = card;
			while (current && !ancestors.has(current.id)) {
				ancestors.add(current.id);
				current = this.parents.get(current.id);
			}
			if (current) {
				let cycle: IProjectBoardCard | undefined = current;
				while (cycle) {
					const parent = this.parents.get(cycle.id);
					this.parents.delete(cycle.id);
					cycle = parent;
				}
			}
		}
		for (const card of cards) {
			const parent = this.parents.get(card.id);
			if (parent) {
				this.children.set(parent.id, [...(this.children.get(parent.id) ?? []), card]);
			}
		}
	}

	getPlacement(cardId: string): IProjectBoardPlacement | undefined {
		const card = this._cards.find(card => card.id === cardId);
		return card ? this.getCardPlacement(card) : this.showSessionList ? undefined : this.placements.get(cardId);
	}

	getParentCard(cardId: string, showArchived = false): IProjectBoardCard | undefined {
		const parent = this.parents.get(cardId);
		if (!parent || (!showArchived && parent.archived)) {
			return undefined;
		}
		const parentPlacement = this.getCardPlacement(parent);
		const childPlacement = this.placements.get(cardId) ?? parentPlacement;
		return (this.autoIncludeSessions || parentPlacement)
			&& childPlacement?.rowId === parentPlacement?.rowId && childPlacement?.columnId === parentPlacement?.columnId
			? parent : undefined;
	}

	getChildCards(parentId: string, showArchived = false): readonly IProjectBoardCard[] {
		return this.sortCards((this.children.get(parentId) ?? []).filter(card =>
			(showArchived || !card.archived) && this.getParentCard(card.id, showArchived)?.id === parentId
		));
	}

	getInheritedPlacement(cardId: string): IProjectBoardPlacement | undefined {
		let parent = this.parents.get(cardId);
		while (parent) {
			const placement = this.placements.get(parent.id);
			if (placement) {
				return placement;
			}
			parent = this.parents.get(parent.id);
		}
		return undefined;
	}

	private getCardPlacement(card: IProjectBoardCard): IProjectBoardPlacement | undefined {
		if (!this.showSessionList) {
			return this.placements.get(card.id) ?? this.getInheritedPlacement(card.id);
		}
		if (!this.sessionPlacements) {
			this.sessionPlacements = new Map();
			const conflicts = new Set<ISession>();
			for (const card of this._cards) {
				const placement = this.placements.get(card.id);
				if (placement) {
					const result = this.sessionPlacements.get(card.session);
					if (result && (result.rowId !== placement.rowId || result.columnId !== placement.columnId)) {
						conflicts.add(card.session);
					}
					this.sessionPlacements.set(card.session, placement);
				}
			}
			for (const session of conflicts) {
				this.sessionPlacements.set(session, undefined);
			}
		}
		return this.sessionPlacements.get(card.session);
	}

	moveCard(cardId: string, placement: IProjectBoardPlacement | undefined): void {
		if (!this._cards.some(card => card.id === cardId)) {
			throw new Error(`Unknown project board card: ${cardId}`);
		}
		if (!placement) {
			this.placements.delete(cardId);
			this.sessionPlacements = undefined;
			return;
		}
		if (!this.rows.some(row => row.id === placement.rowId) || !this.columns.some(column => column.id === placement.columnId)) {
			throw new Error(`Unknown project board cell: ${placement.rowId}/${placement.columnId}`);
		}
		this.placements.set(cardId, placement);
		this.sessionPlacements = undefined;
	}

	getUnassignedCards(showArchived = false): readonly IProjectBoardCard[] {
		if (!this.autoIncludeSessions) {
			return [];
		}
		return this.getPresentationCards(showArchived).filter(card => !this.getCardPlacement(card));
	}

	getCards(rowId: string, columnId: string, showArchived = false): readonly IProjectBoardCard[] {
		return this.getPresentationCards(showArchived).filter(card => {
			const placement = this.getCardPlacement(card);
			return placement?.rowId === rowId && placement.columnId === columnId;
		});
	}

	private getPresentationCards(showArchived: boolean): readonly IProjectBoardCard[] {
		const cards = this.sortCards(this._cards.filter(card => showArchived || !card.archived));
		if (!this.showSessionList) {
			return cards.filter(card => !this.getParentCard(card.id, showArchived));
		}
		const sessions = new Set<ISession>();
		return cards.filter(card => {
			if (sessions.has(card.session)) {
				return false;
			}
			sessions.add(card.session);
			return true;
		});
	}
}

export function getProjectBoardCardId(session: ISession, chat: IChat): string {
	return `${getProjectBoardSessionKey(session)}\0${chat.resource.toString()}`;
}

export function getProjectBoardSessionKey(session: Pick<ISession, 'providerId' | 'resource'>): string {
	return `${session.providerId}\0${session.resource.toString()}`;
}
