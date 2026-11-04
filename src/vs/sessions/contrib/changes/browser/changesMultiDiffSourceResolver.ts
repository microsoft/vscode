/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, derivedObservableWithCache, derivedOpts, IObservable, observableFromEvent, ValueWithChangeEventFromObservable } from '../../../../base/common/observable.js';
import { equals as arraysEqual } from '../../../../base/common/arrays.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IMultiDiffSourceResolver, IMultiDiffSourceResolverService, IResolvedMultiDiffSource, MultiDiffEditorItem } from '../../../../workbench/contrib/multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { sortMultiDiffEditorFileListItems } from '../../../../workbench/contrib/multiDiffEditor/common/multiDiffEditor.js';
import { ISessionFileChange } from '../../../services/sessions/common/session.js';
import { ChangesViewMode } from '../common/changes.js';
import { getActiveSessionChanges, IChangesSessionObservables, IChangesViewService } from '../common/changesViewService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionChangesService } from './sessionChangesService.js';
import { getChangesEditorFileResource } from './changesEditorLabels.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';

/**
 * Global context key holding the URIs (as strings) of every file the user has
 * marked as reviewed in the active session. Combined with
 * {@link SessionChangesFileResourceContext} via the `in` / `not in` operators,
 * file toolbar menu items can toggle between "Mark as Reviewed" and
 * "Unmark as Reviewed".
 */
export const SessionChangesReviewedFilesContext = new RawContextKey<string[]>('sessions.changesReviewedFiles', []);

/**
 * Per-file context key set on each entry in the changes multi-diff editor.
 * Holds the URI (as a string) of the file shown in that diff row, so it can be
 * tested for membership in {@link SessionChangesReviewedFilesContext}.
 */
export const SessionChangesFileResourceContext = new RawContextKey<string>('sessions.changesFileResource', undefined);

export class ChangesMultiDiffSourceResolver extends Disposable implements IMultiDiffSourceResolver {

	constructor(
		@IChangesViewService private readonly changesViewService: IChangesViewService,
		@IMultiDiffSourceResolverService multiDiffSourceResolverService: IMultiDiffSourceResolverService,
		@ISessionChangesService private readonly _sessionChangesService: ISessionChangesService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
	) {
		super();
		this._register(multiDiffSourceResolverService.registerResolver(this));
	}

	canHandleUri(uri: URI): boolean {
		return this._sessionChangesService.getSessionResource(uri) !== undefined;
	}

	async resolveDiffSource(uri: URI): Promise<IResolvedMultiDiffSource> {
		const sessionResource = this._sessionChangesService.getSessionResource(uri)!;
		const chatResource = this._sessionChangesService.getChatResource(uri);
		const changesObs = getChangesEditorChanges(this, this.changesViewService, this._sessionsService, this._sessionsManagementService, sessionResource, chatResource);

		const resourcesObs = derivedOpts<readonly MultiDiffEditorItem[]>({
			owner: this,
			equalsFn: (a, b) => arraysEqual(a, b, (x, y) =>
				isEqual(x.originalUri, y.originalUri) &&
				isEqual(x.modifiedUri, y.modifiedUri)),
		}, reader => {
			const changes = changesObs.read(reader);
			// Order the diffs like the Changes view, which sorts its list and tree like the Source Control view.
			const viewMode = this.changesViewService.viewModeObs.read(reader) === ChangesViewMode.Tree ? 'tree' : 'list';
			return sortMultiDiffEditorFileListItems(changes, getChangesEditorFileResource, viewMode).map(change => {
				const resource = getChangesEditorFileResource(change);
				return new MultiDiffEditorItem(change.originalUri, change.modifiedUri, resource, undefined, {
					[SessionChangesFileResourceContext.key]: resource.toString(),
				});
			});
		});

		return { resources: new ValueWithChangeEventFromObservable(resourcesObs) };
	}
}

/**
 * The changes a Changes editor of `sessionResource` shows. With `chatResource`, from that chat only: whichever chat or
 * session is active, and whichever window has focus, such as for two editors of two chats of a session. Without, the
 * main window's editor of the session: of the chat the main window shows for it, as its active session or a session of
 * its grid, never of a session another window shows or has focus; once the main window does not show the session, such as
 * when the editor moved into a window that shows the session, of the chat that window shows.
 */
export function getChangesEditorChanges(owner: object, changesViewService: IChangesViewService, sessionsService: ISessionsService, sessionsManagementService: ISessionsManagementService, sessionResource: URI, chatResource: URI | undefined): IObservable<readonly ISessionFileChange[]> {
	if (chatResource) {
		const sessionObs = observableFromEvent(owner, sessionsManagementService.onDidChangeSessions, () => sessionsManagementService.getSession(sessionResource));
		const chatObs = derived(owner, reader => sessionObs.read(reader)?.chats.read(reader).find(chat => isEqual(chat.resource, chatResource)));
		const changes = changesViewService.getSessionChanges(sessionObs, chatObs);
		return derivedObservableWithCache<readonly ISessionFileChange[]>(owner, (reader, lastValue) => {
			if (!chatObs.read(reader)) {
				return lastValue ?? [];
			}
			return changes.changesObs.read(reader);
		});
	}

	// The per-session chain is created once; the derived below only selects between it and the shared active one. A
	// session the main window does not show, such as one moved into a window of its own with its editors, is the session
	// of that window, whichever window has focus.
	const sessionObs = derived(owner, reader => [sessionsService.mainWindowActiveSession.read(reader), ...sessionsService.visibleSessions.read(reader)].find(session => !!session && isEqual(session.resource, sessionResource))
		?? sessionsService.windowSessions.read(reader).find(session => isEqual(session.resource, sessionResource)));
	let sessionChanges: IChangesSessionObservables | undefined;
	return derivedObservableWithCache<readonly ISessionFileChange[]>(owner, (reader, lastValue) => {
		const session = sessionObs.read(reader);
		const isActive = !session || session === sessionsService.mainWindowActiveSession.read(reader);
		const changes = isActive ? getActiveSessionChanges(changesViewService) : (sessionChanges ??= changesViewService.getSessionChanges(sessionObs));
		const resource = changes.resourceObs.read(reader);
		if (!resource || !isEqual(resource, sessionResource)) {
			return lastValue ?? [];
		}

		return changes.changesObs.read(reader);
	});
}
