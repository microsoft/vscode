/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../base/browser/dom.js';
import { IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { structuralEquals } from '../../../../base/common/equals.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derivedOpts, IObservable } from '../../../../base/common/observable.js';
import { localize, localize2 } from '../../../../nls.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, MenuItemAction, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { Menus } from '../../../browser/menus.js';
import { SessionHeaderMetaActionViewItem } from '../../../browser/parts/sessionHeaderMetaActionViewItem.js';
import { SessionHasChangesContext } from '../../../common/contextkeys.js';
import { ISessionContext } from '../../../services/sessions/browser/sessionContext.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { IChangesViewService } from '../common/changesViewService.js';
import { ChangesMultiDiffSourceResolver } from './changesMultiDiffSourceResolver.js';
import { ISessionChangesService } from './sessionChangesService.js';

// --- View All Changes action

class ViewAllChangesAction extends Action2 {
	static readonly ID = 'workbench.agentSessions.action.viewChanges';

	constructor() {
		super({
			id: ViewAllChangesAction.ID,
			title: localize2('agentSessions.changes', 'Changes'),
			icon: Codicon.diffMultiple,
			f1: false,
			// Diff stats shown in the session header meta row
			// (vs/sessions/browser/parts/sessionHeader.ts). Rendered with a
			// custom action view item that shows the live +/- counts.
			menu: {
				id: Menus.SessionHeaderMeta,
				group: 'navigation',
				order: 0,
				when: SessionHasChangesContext
			},
		});
	}

	override async run(accessor: ServicesAccessor, session?: IActiveSession): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const sessionsService = accessor.get(ISessionsService);
		const sessionChangesService = accessor.get(ISessionChangesService);
		const changesViewService = accessor.get(IChangesViewService);

		// The clicked session is forwarded as the argument by the session header,
		// which has already promoted it to be the active session. Fall back to the
		// active session when invoked without an explicit argument.
		const sessionResource = (session ?? sessionsService.activeSession.get())?.resource;
		if (!sessionResource) {
			return;
		}

		// The header pill reflects the session's default changeset, so reset any
		// Changes-view selection to the default before opening so the diff editor
		// (a shared per-session resource) shows the same changes as the pill.
		changesViewService.setChangesetId(undefined);

		// Open the multi-file diff editor in the editor part. The resource list is
		// resolved reactively via the `ChangesMultiDiffSourceResolver` registered as
		// a workbench contribution.
		await editorService.openEditor({
			multiDiffSource: sessionChangesService.getChangesEditorResource(sessionResource),
			label: localize('sessions.changes.title', 'Session Changes'),
		});
	}
}
registerAction2(ViewAllChangesAction);

// --- View All Changes action view item (session header diff stats)

interface IDiffStats {
	readonly files: number;
	readonly insertions: number;
	readonly deletions: number;
	readonly branch: string | undefined;
}

/**
 * Renders the {@link ViewAllChangesAction} menu item contributed into {@link Menus.SessionHeaderMeta}
 * (the session header meta row) as a `<diff-icon> <n> files +insertions -deletions` pill. It extends the
 * generic {@link SessionHeaderMetaActionViewItem} (so the icon and label render consistently with other
 * meta actions) and appends the session's live aggregate diff stats. Activating the item runs the
 * action, which opens the multi-file diff editor.
 *
 * The stats are read from the {@link ISessionContext} so the correct per-session changes
 * are shown even when several session views are visible at once. The counts reflect the
 * changeset the provider marks as {@link ISessionChangeset.isDefault}, falling back to the
 * session's top-level {@link IActiveSession.changes} when none is default.
 */
export class ViewAllChangesActionViewItem extends SessionHeaderMetaActionViewItem {

	private readonly _diffStatsObs: IObservable<IDiffStats>;

	constructor(
		action: MenuItemAction,
		options: IActionViewItemOptions,
		@ISessionContext sessionContext: ISessionContext,
	) {
		super(undefined, action, options);

		this._diffStatsObs = derivedOpts<IDiffStats>({ owner: this, equalsFn: structuralEquals }, reader => {
			const session = sessionContext.session.read(reader);
			const defaultChangeset = session?.changesets.read(reader)?.find(c => c.isDefault.read(reader));
			const changes = (defaultChangeset?.changes.read(reader) ?? session?.changes.read(reader)) ?? [];
			let insertions = 0;
			let deletions = 0;
			for (const change of changes) {
				insertions += change.insertions;
				deletions += change.deletions;
			}
			const branch = session?.workspace.read(reader)?.folders[0]?.gitRepository?.branchName?.trim() || undefined;
			return { files: changes.length, insertions, deletions, branch };
		});

		this._register(autorun(reader => {
			this._diffStatsObs.read(reader);
			this.updateLabel();
			this.updateTooltip();
			this.updateAriaLabel();
		}));
	}

	protected override getLabelText(): string {
		const { files } = this._diffStatsObs.get();
		return files === 1
			? localize('agentSessions.changes.file', "{0} file", files)
			: localize('agentSessions.changes.files', "{0} files", files);
	}

	protected override getAdditionalLabelContent(): Array<HTMLElement | string> {
		const { insertions, deletions } = this._diffStatsObs.get();
		return [
			$('span.chat-composite-bar-meta-added', undefined, `+${insertions}`),
			$('span.chat-composite-bar-meta-removed', undefined, `-${deletions}`),
		];
	}

	protected override getTooltip(): string {
		const { branch } = this._diffStatsObs.get();
		return branch
			? localize('agentSessions.viewChanges.tooltip.branch', "View Changes ({0})", branch)
			: localize('agentSessions.viewChanges.tooltip', "View Changes");
	}

	protected override getAriaLabel(): string {
		const { files, insertions, deletions } = this._diffStatsObs.get();
		const filesLabel = files === 1
			? localize('agentSessions.changes.file', "{0} file", files)
			: localize('agentSessions.changes.files', "{0} files", files);
		// e.g. "View Changes (main): 3 files, +10, -4"
		return localize('agentSessions.viewChanges.ariaLabel', "{0}: {1}, +{2}, -{3}", this.getTooltip(), filesLabel, insertions, deletions);
	}
}

/**
 * Registers the {@link ViewAllChangesActionViewItem} for the diff-stats action in the
 * session header meta toolbar. Registering it here (rather than in the core session header)
 * keeps the rendering of the changes-owned action co-located with the action itself.
 */
class ViewAllChangesActionViewItemContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.viewAllChangesActionViewItem';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
	) {
		super();

		// The action view item service only notifies toolbars of a factory via
		// the event passed to register(), not on registration itself. A session
		// header restored with existing changes may create its meta toolbar
		// before this contribution runs, so announce the factory once right
		// after registering to make those toolbars re-render and pick it up.
		const onDidRegister = this._register(new Emitter<void>());
		this._register(actionViewItemService.register(Menus.SessionHeaderMeta, ViewAllChangesAction.ID, (action, options, instantiationService) => {
			if (!(action instanceof MenuItemAction)) {
				return undefined;
			}
			return instantiationService.createInstance(ViewAllChangesActionViewItem, action, options);
		}, onDidRegister.event));
		onDidRegister.fire();
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
registerWorkbenchContribution2(ViewAllChangesActionViewItemContribution.ID, ViewAllChangesActionViewItemContribution, WorkbenchPhase.AfterRestored);
