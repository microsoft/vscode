/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReader } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IProjectBoardConfiguration } from './projectBoardConfiguration.js';
import { IChat, ISession, ChatInteractivity, SessionStatus, getGitHubPullRequestRefs } from '../../../services/sessions/common/session.js';

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

	get rows(): readonly IProjectBoardAxis[] { return this._rows; }
	get columns(): readonly IProjectBoardAxis[] { return this._columns; }
	get isSortingDeferred(): boolean { return !!this.frozenOrder; }

	updateConfiguration(configuration: IProjectBoardConfiguration): void {
		this._rows = configuration.rows;
		this._columns = configuration.columns;
		this.autoIncludeSessions = configuration.autoIncludeSessions;
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
			const workspace = session.workspace?.read(reader);
			const sharedContext = new Map<string, { label: string; uri: URI }>();
			for (const folder of workspace?.folders ?? []) {
				for (const pr of getGitHubPullRequestRefs(folder.gitRepository?.gitHubInfo.read(reader))) {
					sharedContext.set(pr.uri.toString(), { label: `${pr.owner}/${pr.repo}#${pr.number}`, uri: pr.uri });
				}
			}
			for (const artifact of session.artifacts?.read(reader) ?? []) {
				const uri = artifact.link ?? artifact.uri;
				if (uri) {
					sharedContext.set(uri.toString(), { label: artifact.label, uri });
				}
			}
			const connection = session.remoteConnectionStatus?.read(reader)?.kind;
			for (const chat of session.chats.read(reader)) {
				this.knownChatIds.add(getProjectBoardCardId(session, chat));
				if (chat.interactivity.read(reader) === ChatInteractivity.Hidden) {
					continue;
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
					sharedContext: [...sharedContext.values()],
					connection: connection && connection !== 'connected' ? connection : undefined,
				});
			}
		}
		this._cards = cards;
	}

	getPlacement(cardId: string): IProjectBoardPlacement | undefined {
		return this.placements.get(cardId);
	}

	moveCard(cardId: string, placement: IProjectBoardPlacement | undefined): void {
		if (!this._cards.some(card => card.id === cardId)) {
			throw new Error(`Unknown project board card: ${cardId}`);
		}
		if (!placement) {
			this.placements.delete(cardId);
			return;
		}
		if (!this.rows.some(row => row.id === placement.rowId) || !this.columns.some(column => column.id === placement.columnId)) {
			throw new Error(`Unknown project board cell: ${placement.rowId}/${placement.columnId}`);
		}
		this.placements.set(cardId, placement);
	}

	getUnassignedCards(showArchived = false): readonly IProjectBoardCard[] {
		if (!this.autoIncludeSessions) {
			return [];
		}
		return this.sortCards(this._cards.filter(card => (showArchived || !card.archived) && !this.placements.has(card.id)));
	}

	getCards(rowId: string, columnId: string, showArchived = false): readonly IProjectBoardCard[] {
		return this.sortCards(this._cards.filter(card => {
			const placement = this.placements.get(card.id);
			return (showArchived || !card.archived) && placement?.rowId === rowId && placement.columnId === columnId;
		}));
	}
}

export function getProjectBoardCardId(session: ISession, chat: IChat): string {
	return `${session.providerId}\0${session.resource.toString()}\0${chat.resource.toString()}`;
}
