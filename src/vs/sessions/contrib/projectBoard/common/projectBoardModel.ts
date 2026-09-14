/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReader } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IChat, ISession, ChatInteractivity, SessionStatus } from '../../../services/sessions/common/session.js';

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

	get cards(): readonly IProjectBoardCard[] {
		return this._cards;
	}

	updateSessions(sessions: readonly ISession[], reader?: IReader): void {
		const cards: IProjectBoardCard[] = [];
		for (const session of sessions) {
			const sessionTitle = session.title.read(reader);
			for (const chat of session.chats.read(reader)) {
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
		if (!projectBoardRows.some(row => row.id === placement.rowId) || !projectBoardColumns.some(column => column.id === placement.columnId)) {
			throw new Error(`Unknown project board cell: ${placement.rowId}/${placement.columnId}`);
		}
		this.placements.set(cardId, placement);
	}

	getUnassignedCards(showArchived = false): readonly IProjectBoardCard[] {
		return this._cards.filter(card => (showArchived || !card.archived) && !this.placements.has(card.id));
	}

	getCards(rowId: string, columnId: string, showArchived = false): readonly IProjectBoardCard[] {
		return this._cards.filter(card => {
			const placement = this.placements.get(card.id);
			return (showArchived || !card.archived) && placement?.rowId === rowId && placement.columnId === columnId;
		});
	}
}

export function getProjectBoardCardId(session: ISession, chat: IChat): string {
	return `${session.providerId}\0${session.resource.toString()}\0${chat.resource.toString()}`;
}
