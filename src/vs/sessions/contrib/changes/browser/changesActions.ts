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
import { autorun, derivedOpts, IObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, MenuId, MenuItemAction, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { ActiveEditorContext } from '../../../../workbench/common/contextkeys.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IEditorPane } from '../../../../workbench/common/editor.js';
import { MultiDiffEditor } from '../../../../workbench/contrib/multiDiffEditor/browser/multiDiffEditor.js';
import { DiffEditorWidget } from '../../../../editor/browser/widget/diffEditor/diffEditorWidget.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { Menus } from '../../../browser/menus.js';
import { SessionHeaderMetaActionViewItem } from '../../../browser/parts/sessionHeaderMetaActionViewItem.js';
import { SessionHasChangesContext, IsQuickChatSessionContext } from '../../../common/contextkeys.js';
import { ISessionContext } from '../../../services/sessions/browser/sessionContext.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { SessionChangesetOperationScope } from '../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { IChangesViewService } from '../common/changesViewService.js';
import { ChangesMultiDiffSourceResolver, SessionChangesFileResourceContext, SessionChangesReviewedFilesContext } from './changesMultiDiffSourceResolver.js';
import { ISessionChangesService } from './sessionChangesService.js';
import { SessionChangesEditor } from './sessionChangesEditor.js';
import { VIEW_SESSION_CHANGES_COMMAND_ID } from '../common/changes.js';

// --- View All Changes action

class ViewAllChangesAction extends Action2 {
	static readonly ID = VIEW_SESSION_CHANGES_COMMAND_ID;

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
				when: ContextKeyExpr.and(SessionHasChangesContext, IsQuickChatSessionContext.negate())
			},
		});
	}

	override async run(accessor: ServicesAccessor, session?: IActiveSession): Promise<void> {
		const sessionsService = accessor.get(ISessionsService);
		const sessionChangesService = accessor.get(ISessionChangesService);
		const changesViewService = accessor.get(IChangesViewService);
		const layoutService = accessor.get(IAgentWorkbenchLayoutService);

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

		// Opening the Changes editor from the pill is a deliberate user action, so
		// reveal the (possibly hidden) editor area explicitly — the automatic
		// single-pane hide rules must not undo it.
		layoutService.revealEditorPartExplicitly();

		// Open the session Changes editor in the editor part. The resource list is
		// resolved reactively via the `ChangesMultiDiffSourceResolver` registered as
		// a workbench contribution.
		await sessionChangesService.openChangesEditor(sessionResource);
	}
}
registerAction2(ViewAllChangesAction);

// --- Open File action (per-file toolbar in the single-pane session changes editor)

/**
 * Opens the file shown in a diff row of the Agents window's single-pane session
 * Changes editor ({@link SessionChangesEditor}) as a regular editor. The workbench
 * {@link GoToFileAction} only appears for the generic {@link MultiDiffEditor}, so
 * the custom single-pane editor needs its own entry in the per-file toolbar. It is
 * scoped to the {@link SessionChangesEditor} rather than the shared
 * `changes-multi-diff-source` scheme so it does not duplicate the workbench action
 * when the same changes are shown in the generic multi-file diff editor.
 */
class OpenChangedFileAction extends Action2 {

	static readonly ID = 'workbench.agentSessions.changes.openFile';

	constructor() {
		super({
			id: OpenChangedFileAction.ID,
			title: localize2('agentSessions.changes.openFile', 'Open File'),
			icon: Codicon.goToFile,
			f1: false,
			menu: {
				id: MenuId.MultiDiffEditorFileToolbar,
				when: ActiveEditorContext.isEqualTo(SessionChangesEditor.ID),
				group: 'navigation',
				order: 22,
			},
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const resource = args[0];
		if (!(resource instanceof URI)) {
			return;
		}

		await accessor.get(IEditorService).openEditor({ resource });
	}
}
registerAction2(OpenChangedFileAction);

// --- Expand Full File action (per-file toolbar in the session changes multi-diff editor)

/**
 * Resolves the {@link DiffEditorWidget} showing `resource` in the active Changes
 * multi-diff editor. The Changes editor opens either as the docked
 * {@link SessionChangesEditor} or, in the non-docked layout, as a plain
 * {@link MultiDiffEditor}; both expose `tryGetCodeEditor`, so the expand/collapse
 * actions work in either mode.
 */
function getChangesDiffEditor(pane: IEditorPane | undefined, resource: URI): DiffEditorWidget | undefined {
	const codeEditor = pane instanceof SessionChangesEditor || pane instanceof MultiDiffEditor
		? pane.tryGetCodeEditor(resource)
		: undefined;
	return codeEditor?.diffEditor instanceof DiffEditorWidget ? codeEditor.diffEditor : undefined;
}

/**
 * Reveals all hidden unchanged regions for the file shown in a diff row of the
 * Agents window's Changes editor, showing the whole file at once (a per-file
 * counterpart to the per-region reveal controls).
 */
class ExpandFullFileAction extends Action2 {

	static readonly ID = 'workbench.agentSessions.changes.expandFullFile';

	constructor() {
		super({
			id: ExpandFullFileAction.ID,
			title: localize2('agentSessions.changes.expandFullFile', 'Expand Full File'),
			icon: Codicon.unfold,
			f1: false,
			menu: {
				id: MenuId.MultiDiffEditorFileToolbar,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('resourceScheme', 'changes-multi-diff-source'),
					EditorContextKeys.multiDiffEditorItemAllUnchangedRegionsShown.toNegated()),
				group: 'navigation',
				order: 21,
			},
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const resource = args[0];
		if (!(resource instanceof URI)) {
			return;
		}

		getChangesDiffEditor(accessor.get(IEditorService).activeEditorPane, resource)?.showAllUnchangedRegions();
	}
}
registerAction2(ExpandFullFileAction);

// --- Collapse Unchanged Regions action (per-file toolbar in the session changes multi-diff editor)

/**
 * Collapses all unchanged regions for the file shown in a diff row of the Agents
 * window's Changes editor, hiding the unchanged context so only the changes are
 * shown. The symmetric counterpart of {@link ExpandFullFileAction}: the two
 * occupy the same toolbar slot and swap based on whether the file is fully
 * expanded.
 */
class CollapseUnchangedRegionsAction extends Action2 {

	static readonly ID = 'workbench.agentSessions.changes.collapseUnchangedRegions';

	constructor() {
		super({
			id: CollapseUnchangedRegionsAction.ID,
			title: localize2('agentSessions.changes.collapseUnchangedRegions', 'Collapse Unchanged Regions'),
			icon: Codicon.fold,
			f1: false,
			menu: {
				id: MenuId.MultiDiffEditorFileToolbar,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('resourceScheme', 'changes-multi-diff-source'),
					EditorContextKeys.multiDiffEditorItemAllUnchangedRegionsShown),
				group: 'navigation',
				order: 21,
			},
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const resource = args[0];
		if (!(resource instanceof URI)) {
			return;
		}

		getChangesDiffEditor(accessor.get(IEditorService).activeEditorPane, resource)?.collapseAllUnchangedRegions();
	}
}
registerAction2(CollapseUnchangedRegionsAction);

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
 * are shown even when several session views are visible at once. The counts come from the
 * session's {@link ISession.changesSummary} when available, falling back to aggregating the
 * changeset the provider marks as {@link ISessionChangeset.isDefault} (or the session's
 * top-level {@link IActiveSession.changes} when none is default).
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
			const workspace = session?.workspace.read(reader);
			const branch = workspace?.folders[0]?.gitRepository?.branchName?.trim();

			// Prefer the provider-supplied changes summary which reflects the
			// session's authoritative aggregate. Fall back to aggregating the
			// default changeset's changes when no summary is available.
			const changesSummary = session?.changesSummary?.read(reader);
			if (changesSummary) {
				return {
					branch,
					files: changesSummary.files,
					insertions: changesSummary.additions,
					deletions: changesSummary.deletions,
				} satisfies IDiffStats;
			}

			const defaultChangeset = session?.changesets.read(reader)?.find(c => c.isDefault.read(reader));
			const changes = (defaultChangeset?.changes.read(reader) ?? session?.changes.read(reader)) ?? [];

			let insertions = 0, deletions = 0;
			for (const change of changes) {
				insertions += change.insertions;
				deletions += change.deletions;
			}

			return {
				branch,
				files: changes.length,
				insertions,
				deletions,
			} satisfies IDiffStats;
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

class ChangesetOperationsActionControllerContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.sessions.changesetOperationsActionController';

	constructor(
		@IChangesViewService changesViewService: IChangesViewService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super();

		// Use to optimistically update the toolbars until the server confirms
		// the state. As soon as the server confirms the state, the client array
		// will be reset to `undefined` so that the server state takes precedence.
		const clientReviewedFilesObs = observableValue<string[] | undefined>(this, undefined);

		// Authoritative source of reviewed files. This will be updated
		// when the state is saved on the server and confirmed back to
		// the client
		const agentHostReviewedFilesObs = observableValue<string[]>(this, []);

		this._register(autorun(reader => {
			const changes = changesViewService.activeSessionChangesObs.read(reader);

			const reviewedFiles = changes
				.filter(change => change.reviewed)
				.map(change => change.modifiedUri?.toString() ?? change.originalUri?.toString())
				.filter((uri: string | undefined) => uri !== undefined);

			transaction(tx => {
				clientReviewedFilesObs.set(undefined, tx);
				agentHostReviewedFilesObs.set(reviewedFiles, tx);
			});
		}));

		this._register(bindContextKey<string[]>(SessionChangesReviewedFilesContext, contextKeyService, reader => {
			return clientReviewedFilesObs.read(reader) ?? agentHostReviewedFilesObs.read(reader);
		}));

		this._register(autorun(reader => {
			const changeset = changesViewService.activeSessionChangesetObs.read(reader);
			const resourceOperations = (changeset?.operations.read(reader) ?? [])
				.filter(op => op.scopes.includes(SessionChangesetOperationScope.Resource));

			if (resourceOperations.length === 0) {
				return;
			}

			for (const operation of resourceOperations) {
				reader.store.add(registerAction2(class extends Action2 {
					constructor() {
						super({
							id: `workbench.contrib.sessions.changesetOperation.${operation.id}`,
							title: operation.label,
							icon: operation.icon,
							f1: false,
							toggled: ContextKeyExpr.in(
								SessionChangesFileResourceContext.key,
								SessionChangesReviewedFilesContext.key),
							menu: [{
								id: MenuId.AgentsChangeInlineToolbar,
								group: 'navigation',
								order: 100
							},
							{
								id: MenuId.MultiDiffEditorFileToolbar,
								group: 'navigation',
								order: 100
							}]
						});
					}

					async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
						// The Changes view provides the resource as the third argument (uses a
						// custom action runner) while the multi-file diff editor provides the
						// resource as the first argument.
						const resource = args.length === 3 ? args[2] : args[0];
						if (!resource || !(resource instanceof URI)) {
							return;
						}

						await changeset?.invokeOperation(operation.id, {
							kind: 'resource',
							resource,
						});
					}
				}));
			}
		}));
	}
}

registerWorkbenchContribution2(ChangesMultiDiffSourceResolverContribution.ID, ChangesMultiDiffSourceResolverContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChangesetOperationsActionControllerContribution.ID, ChangesetOperationsActionControllerContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ViewAllChangesActionViewItemContribution.ID, ViewAllChangesActionViewItemContribution, WorkbenchPhase.AfterRestored);
