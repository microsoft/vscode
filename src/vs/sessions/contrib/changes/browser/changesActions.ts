/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ISessionsHostLayoutService } from '../../../../workbench/services/sessions/browser/sessionsHostLayoutService.js';
import { ISessionsService } from '../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { resolveSessionCommandTarget } from '../../../../workbench/contrib/sessions/browser/sessionCommandTarget.js';
import { ISessionChangesStatsCache, readSessionChangesStats } from '../../../../workbench/services/sessions/common/sessionChangesStatsCache.js';
import { IChangesViewService } from '../../../../workbench/contrib/sessions/common/changesViewService.js';
import { ChangesMultiDiffSourceResolver } from '../../../../workbench/contrib/sessionChanges/browser/changesMultiDiffSourceResolver.js';
import { ISessionChangesService } from '../../../../workbench/contrib/sessionChanges/browser/sessionChangesService.js';
import { VIEW_SESSION_CHANGES_COMMAND_ID } from '../../../../workbench/contrib/sessions/common/changes.js';
import { readPaneSessions } from '../../../../workbench/services/sessions/browser/sessionGridPane.js';

// --- View All Changes action

class ViewAllChangesAction extends Action2 {
	static readonly ID = VIEW_SESSION_CHANGES_COMMAND_ID;

	constructor() {
		super({
			id: ViewAllChangesAction.ID,
			title: localize2('agentSessions.changes', 'Changes'),
			icon: Codicon.diffMultiple,
			f1: false,
		});
	}

	override async run(accessor: ServicesAccessor, sessionArg?: unknown): Promise<void> {
		const sessionChangesService = accessor.get(ISessionChangesService);
		const layoutService = accessor.get(ISessionsHostLayoutService);

		// The clicked session is forwarded as the argument by the session header,
		// which has already promoted it to be the active session. Fall back to the
		// active session when invoked without an explicit argument.
		const sessionResource = resolveSessionCommandTarget(accessor, [sessionArg])?.session?.resource;
		if (!sessionResource) {
			return;
		}

		// Opening the Changes editor from the pill is a deliberate user action, so
		// reveal the (possibly hidden) editor area explicitly — the automatic
		// desktop hide rules must not undo it.
		layoutService.revealEditorPartExplicitly();

		// The header pill reflects the default changeset.
		await sessionChangesService.openChangesEditor(sessionResource, { changesetSelection: { kind: 'id', id: undefined } });
	}
}
registerAction2(ViewAllChangesAction);


/**
 * Remembers the changes pill shown for each visible session so it can be rendered
 * optimistically the next time that session is opened, before the provider has
 * reported its changes. Recording sessions as they are shown (rather than from the
 * pill itself) also keeps the cache honest: a session that ends up without changes
 * drops its entry instead of keeping a stale pill.
 */
class SessionChangesStatsCacheContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessions.changesStatsCache';

	constructor(
		@ISessionsService sessionsService: ISessionsService,
		@ISessionChangesStatsCache changesStatsCache: ISessionChangesStatsCache,
	) {
		super();

		this._register(autorun(reader => {
			for (const session of readPaneSessions(sessionsService.slotPanes, reader)) {
				// While the worktree is pending the reported changes belong to the
				// checkout the session was started from, not to the session.
				if (session.worktreePending?.read(reader)) {
					continue;
				}
				const stats = readSessionChangesStats(session, reader);
				if (stats) {
					changesStatsCache.set(session.sessionId, stats);
				}
			}
		}));
	}
}

// --- Multi-diff source resolver

/**
 * Registers the multi-diff source resolver that teaches the multi-file diff
 * editor how to turn a `changes-multi-diff-source:<session>` URI into the actual
 * list of file diffs for that session.
 *
 * It used to be created by the `ChangesViewPane`, so it only existed while the
 * Changes view (auxiliary bar) was open. The session header's "View All Changes"
 * action opens the multi-diff editor directly, so the resolver must exist
 * independently of that view — hence this standalone contribution. It shares the
 * changes view model with the Changes view via {@link IChangesViewService}
 * so both resolve the same changeset selection. It is registered at
 * {@link WorkbenchPhase.BlockRestore} so a previously open changes diff editor
 * can resolve its contents during workbench restore.
 */
class ChangesMultiDiffSourceResolverContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessions.changesMultiDiffSourceResolver';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._register(instantiationService.createInstance(ChangesMultiDiffSourceResolver));
	}
}

registerWorkbenchContribution2(ChangesMultiDiffSourceResolverContribution.ID, ChangesMultiDiffSourceResolverContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(SessionChangesStatsCacheContribution.ID, SessionChangesStatsCacheContribution, WorkbenchPhase.AfterRestored);
