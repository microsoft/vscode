/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDragAndDropData } from '../../../../../base/browser/dnd.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { ListDragOverEffectPosition, ListDragOverEffectType } from '../../../../../base/browser/ui/list/list.js';
import { ElementsDragAndDropData, ListViewTargetSector } from '../../../../../base/browser/ui/list/listView.js';
import { ITreeDragAndDrop, ITreeDragOverReaction } from '../../../../../base/browser/ui/tree/tree.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { LocalSelectionTransfer } from '../../../../../platform/dnd/browser/dnd.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { DraggedSessionIdentifier, SessionsDataTransfers } from '../../../../browser/dnd.js';
import { ISessionGroupsService } from '../../../../services/sessions/browser/sessionGroupsService.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';

/** Moves catalog sessions into manual collections using the native session drag transfer. */
export class SessionWorkDragAndDrop<T> extends Disposable implements ITreeDragAndDrop<T> {
	private readonly transfer = LocalSelectionTransfer.getInstance<DraggedSessionIdentifier>();
	private draggedIdentifiers: DraggedSessionIdentifier[] | undefined;

	constructor(
		private readonly getSession: (element: T) => ISession | undefined,
		private readonly getCollection: (element: T) => string | undefined,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionGroupsService private readonly groupsService: ISessionGroupsService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this._register(toDisposable(() => {
			if (this.draggedIdentifiers && this.transfer.getData(DraggedSessionIdentifier.prototype) === this.draggedIdentifiers) {
				this.transfer.clearData(DraggedSessionIdentifier.prototype);
			}
			this.draggedIdentifiers = undefined;
		}));
	}

	getDragURI(element: T): string | null {
		const session = this.getSession(element);
		return session && !session.isArchived.get() ? session.resource.toString() : null;
	}

	getDragLabel(elements: T[]): string | undefined {
		const sessions = this.getElementSessions(elements);
		return sessions.length === 1 ? sessions[0].title.get()
			: sessions.length > 1 ? localize('sessionsWork.dragLabel', "{0} sessions", sessions.length) : undefined;
	}

	onDragStart(data: IDragAndDropData, originalEvent: DragEvent): void {
		this.onDragEnd();
		if (!(data instanceof ElementsDragAndDropData)) {
			originalEvent.preventDefault();
			return;
		}
		const identifiers = this.getElementSessions(data.elements).map(session => new DraggedSessionIdentifier(session.sessionId, session.resource));
		if (!identifiers.length) {
			originalEvent.preventDefault();
			return;
		}
		if (!this.resolveSessions(identifiers)) {
			originalEvent.preventDefault();
			this.notificationService.error(localize('sessionsWork.unavailableDrag', "Some dragged sessions are unavailable or archived."));
			return;
		}
		this.draggedIdentifiers = identifiers;
		this.transfer.setData(identifiers, DraggedSessionIdentifier.prototype);
		originalEvent.dataTransfer?.setData(SessionsDataTransfers.SESSION, JSON.stringify({
			sessionId: identifiers[0].sessionId,
			resource: identifiers[0].resource.toString(),
		}));
	}

	onDragOver(data: IDragAndDropData, targetElement: T | undefined, _targetIndex: number | undefined, _targetSector: ListViewTargetSector | undefined, originalEvent: DragEvent): boolean | ITreeDragOverReaction {
		const collection = targetElement === undefined ? undefined : this.getCollection(targetElement);
		return this.canDrop(collection, originalEvent, this.getDraggedIdentifiers(data));
	}

	canDropIntoCollection(collection: string, event: DragEvent): boolean {
		const result = this.canDrop(collection, event, this.transfer.getData(DraggedSessionIdentifier.prototype));
		return typeof result === 'boolean' ? result : result.accept;
	}

	private canDrop(collection: string | undefined, originalEvent: DragEvent, identifiers: readonly DraggedSessionIdentifier[] | undefined): boolean | ITreeDragOverReaction {
		if (collection === undefined || !this.groupsService.getGroup(collection)) {
			return false;
		}
		if (identifiers !== undefined) {
			const sessions = this.resolveSessions(identifiers);
			if (!sessions || sessions.every(session => this.groupsService.getGroupOfSession(session.sessionId) === collection)) {
				return false;
			}
		} else if (!originalEvent.dataTransfer?.types.includes(SessionsDataTransfers.SESSION)) {
			return false;
		}
		return {
			accept: true,
			effect: { type: ListDragOverEffectType.Move, position: ListDragOverEffectPosition.Over },
			autoExpand: true,
		};
	}

	drop(data: IDragAndDropData, targetElement: T | undefined, _targetIndex: number | undefined, _targetSector: ListViewTargetSector | undefined, originalEvent: DragEvent): void {
		this.performDrop(targetElement === undefined ? undefined : this.getCollection(targetElement), originalEvent, this.getDraggedIdentifiers(data));
	}

	dropIntoCollection(collection: string, event: DragEvent): readonly ISession[] | undefined {
		return this.performDrop(collection, event, this.transfer.getData(DraggedSessionIdentifier.prototype));
	}

	private performDrop(collection: string | undefined, originalEvent: DragEvent, dragged: readonly DraggedSessionIdentifier[] | undefined): readonly ISession[] | undefined {
		try {
			if (collection === undefined) {
				throw new Error(localize('sessionsWork.invalidDropTarget', "Sessions can only be moved to a manual collection."));
			}
			const identifiers = dragged ?? this.readNativeIdentifiers(originalEvent);
			const sessions = this.resolveSessions(identifiers);
			if (!sessions) {
				throw new Error(localize('sessionsWork.unavailableDrag', "Some dragged sessions are unavailable or archived."));
			}
			const group = this.groupsService.getGroup(collection);
			if (!group) {
				throw new Error(localize('sessionsWork.missingDropTarget', "This collection no longer exists."));
			}
			if (sessions.every(session => this.groupsService.getGroupOfSession(session.sessionId) === collection)) {
				throw new Error(localize('sessionsWork.unchangedDrop', "The selected sessions are already in this collection."));
			}
			this.groupsService.addToGroup(sessions.map(session => session.sessionId), group.id);
			status(sessions.length === 1
				? localize('sessionsWork.movedSession', "Moved {0} to {1}.", sessions[0].title.get(), group.name)
				: localize('sessionsWork.movedSessions', "Moved {0} sessions to {1}.", sessions.length, group.name));
			return sessions;
		} catch (error) {
			this.notificationService.error(error);
			return undefined;
		} finally {
			this.onDragEnd();
		}
	}

	onDragEnd(): void {
		this.transfer.clearData(DraggedSessionIdentifier.prototype);
		this.draggedIdentifiers = undefined;
	}

	private getElementSessions(elements: readonly T[]): ISession[] {
		const sessions = new Map<string, ISession>();
		for (const element of elements) {
			const session = this.getSession(element);
			if (session && !sessions.has(session.sessionId)) {
				sessions.set(session.sessionId, session);
			}
		}
		return [...sessions.values()];
	}

	private getDraggedIdentifiers(data: IDragAndDropData): readonly DraggedSessionIdentifier[] | undefined {
		const identifiers = this.transfer.getData(DraggedSessionIdentifier.prototype);
		if (identifiers !== undefined) {
			return identifiers;
		}
		// External tree elements have a different row type; only session identifiers cross tree boundaries.
		return data instanceof ElementsDragAndDropData
			? this.getElementSessions(data.elements).map(session => new DraggedSessionIdentifier(session.sessionId, session.resource))
			: undefined;
	}

	private resolveSessions(identifiers: readonly DraggedSessionIdentifier[]): ISession[] | undefined {
		const sessions = new Map<string, ISession>();
		for (const identifier of identifiers) {
			const session = this.sessionsManagementService.getSession(identifier.resource);
			if (!session || session.sessionId !== identifier.sessionId || session.isArchived.get()) {
				return undefined;
			}
			if (!sessions.has(session.sessionId)) {
				sessions.set(session.sessionId, session);
			}
		}
		return sessions.size ? [...sessions.values()] : undefined;
	}

	private readNativeIdentifiers(event: DragEvent): readonly DraggedSessionIdentifier[] {
		const raw = event.dataTransfer?.getData(SessionsDataTransfers.SESSION);
		const value: { readonly sessionId?: unknown; readonly resource?: unknown } | undefined = raw ? JSON.parse(raw) : undefined;
		if (!value || typeof value !== 'object'
			|| typeof value.sessionId !== 'string' || !value.sessionId
			|| typeof value.resource !== 'string' || !value.resource) {
			throw new Error(localize('sessionsWork.invalidDragData', "The dragged session data is invalid."));
		}
		return [new DraggedSessionIdentifier(value.sessionId, URI.parse(value.resource, true))];
	}
}
