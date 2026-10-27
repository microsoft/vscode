/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, derivedObservableWithCache, derivedOpts, ValueWithChangeEventFromObservable } from '../../../../base/common/observable.js';
import { equals as arraysEqual } from '../../../../base/common/arrays.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IMultiDiffSourceResolver, IMultiDiffSourceResolverService, IResolvedMultiDiffSource, MultiDiffEditorItem } from '../../../../workbench/contrib/multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { sortMultiDiffEditorFileListItems } from '../../../../workbench/contrib/multiDiffEditor/common/multiDiffEditor.js';
import { ISessionFileChange } from '../../../services/sessions/common/session.js';
import { ChangesViewMode } from '../common/changes.js';
import { getActiveSessionChanges, IChangesSessionObservables, IChangesViewService } from '../common/changesViewService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { findSessionByChatOrResource } from '../../../services/sessions/browser/sessionActionTarget.js';
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
	) {
		super();
		this._register(multiDiffSourceResolverService.registerResolver(this));
	}

	canHandleUri(uri: URI): boolean {
		return this._sessionChangesService.getSessionResource(uri) !== undefined;
	}

	async resolveDiffSource(uri: URI): Promise<IResolvedMultiDiffSource> {
		const sessionResource = this._sessionChangesService.getSessionResource(uri)!;
		// The editor of a window of its own shows the changes of the chat that window shows, whichever chat of its session
		// is active.
		const chatResource = this._sessionChangesService.getScopedChatResource(uri);

		// The per-session chain is created once per resolve; the derived below only selects between it and the shared active one.
		const sessionObs = derived(reader => findSessionByChatOrResource(this._sessionsService, sessionResource, chatResource, reader));
		let sessionChanges: IChangesSessionObservables | undefined;
		const changesObs = derivedObservableWithCache<readonly ISessionFileChange[]>({
			owner: this,
		}, (reader, lastValue) => {
			const session = sessionObs.read(reader);
			const isActive = !session || session === this._sessionsService.mainWindowActiveSession.read(reader);
			const changes = isActive ? getActiveSessionChanges(this.changesViewService) : (sessionChanges ??= this.changesViewService.getSessionChanges(sessionObs));
			const resource = changes.resourceObs.read(reader);
			if (!resource || !isEqual(resource, sessionResource)) {
				return lastValue ?? [];
			}

			return changes.changesObs.read(reader);
		});

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
