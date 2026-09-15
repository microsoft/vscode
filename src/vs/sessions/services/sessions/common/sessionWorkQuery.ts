/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReader } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { ISession, SessionStatus } from './session.js';
import { ISessionWorkSummary } from './sessionWorkSummary.js';

export type PromotableSessionWorkView = 'needsInput' | 'review' | 'inProgress' | 'all';

export type SessionWorkView = 'overview' | PromotableSessionWorkView | 'archive' | 'archived' | 'cards';

export const SESSION_WORK_VIEWS: readonly SessionWorkView[] = ['overview', 'needsInput', 'review', 'inProgress', 'all', 'archive', 'archived', 'cards'];

export function isPromotableSessionWorkView(view: unknown): view is PromotableSessionWorkView {
	return view === 'needsInput' || view === 'review' || view === 'inProgress' || view === 'all';
}

export interface ISessionWorkQuery {
	readonly view?: SessionWorkView;
	readonly collection?: string;
	readonly filter: string;
	readonly status?: SessionStatus;
}

export interface ISessionWorkEntry {
	readonly session: ISession;
	readonly summary: ISessionWorkSummary;
	readonly collection?: string;
	readonly pinned: boolean;
}

export function getSessionWorkViewLabel(view: SessionWorkView): string {
	switch (view) {
		case 'cards':
		case 'overview': return localize('sessionsWork.overview', "My work");
		case 'needsInput': return localize('sessionsWork.needsInput', "Needs you");
		case 'review': return localize('sessionsWork.review', "Needs review");
		case 'inProgress': return localize('sessionsWork.inProgress', "In progress");
		case 'all': return localize('sessionsWork.all', "All sessions");
		case 'archive': return localize('sessionsWork.archive', "Consider archiving");
		case 'archived': return localize('sessionsWork.archived', "Archived sessions");
	}
}

export function matchesSessionWorkQuery(entry: ISessionWorkEntry, query: ISessionWorkQuery, reader?: IReader): boolean {
	const { session, summary } = entry;
	const archived = session.isArchived.read(reader);
	if ((query.view === 'archived') !== archived || session.isAutomation?.read(reader)) {
		return false;
	}
	if (query.collection !== undefined && query.collection !== entry.collection) {
		return false;
	}
	if (query.status !== undefined && query.status !== session.status.read(reader)) {
		return false;
	}
	const filter = query.filter.trim().toLocaleLowerCase();
	const searchable = `${session.title.read(reader)} ${session.workspace.read(reader)?.label ?? ''}`.toLocaleLowerCase();
	if (filter && !filter.split(/\s+/).every(word => searchable.includes(word))) {
		return false;
	}
	switch (query.view) {
		case 'needsInput': return !!summary.attention;
		case 'review': return summary.hasUnreviewedResults && !summary.running && !summary.attention;
		case 'inProgress': return summary.running;
		case 'archive': return summary.archiveKind !== 'excluded';
		default: return true;
	}
}
