/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/changesActions.css';
import * as dom from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IReader } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { MenuEntryActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { Action2, MenuId, MenuItemAction, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ActiveEditorContext } from '../../../../workbench/common/contextkeys.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IEditorPane, isEditorCommandsContext } from '../../../../workbench/common/editor.js';
import { MultiDiffEditor } from '../../../../workbench/contrib/multiDiffEditor/browser/multiDiffEditor.js';
import { DiffEditorWidget } from '../../../../editor/browser/widget/diffEditor/diffEditorWidget.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { Menus } from '../../../browser/menus.js';
import { AGENT_HOST_CHECKOUT_CHANGESET_OPERATION_ID, AGENT_HOST_COMMIT_CHANGESET_OPERATION_ID, AGENT_HOST_SYNC_CHANGESET_OPERATION_ID } from '../../../../platform/agentHost/common/agentHostChangesetOperationService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { resolveSessionActionTarget } from '../../../services/sessions/browser/sessionActionTarget.js';
import { ISessionChangeset, ISessionChangesetOperation, ISessionFileChange, SessionChangesetOperationScope, SessionChangesetOperationStatus, SessionStatus, UNCOMMITTED_CHANGES_CHANGESET_ID } from '../../../services/sessions/common/session.js';
import { ISessionChangesStatsCache, readSessionChangesStats } from '../../../services/sessions/common/sessionChangesStatsCache.js';
import { getChangesOfSession, IChangesSessionObservables, IChangesViewService } from '../common/changesViewService.js';
import { ChangesMultiDiffSourceResolver } from './changesMultiDiffSourceResolver.js';
import { ISessionChangesService } from './sessionChangesService.js';
import { getFileActionEditorPane, IChangesEditorFileActionContext, SessionChangesEditor } from './sessionChangesEditor.js';
import { VIEW_SESSION_CHANGES_COMMAND_ID } from '../common/changes.js';
import { getChangesFileUri, isChangesFileResource } from './changesViewRenderer.js';
import { ISessionActionContextKeysSource, registerSessionActionContextKeyBinder } from './sessionActionContextKeys.js';
import { escapeRegExpCharacters } from '../../../../base/common/strings.js';

function getWorkspaceResource(resource: URI, changes: readonly ISessionFileChange[]): URI {
	const change = changes.find(change => isChangesFileResource(change, resource));
	return change ? getChangesFileUri(change) : resource;
}

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
		const layoutService = accessor.get(IAgentWorkbenchLayoutService);

		// The clicked session is forwarded as the argument by the session header,
		// which has already promoted it to be the active session. Fall back to the
		// active session when invoked without an explicit argument.
		const sessionResource = resolveSessionActionTarget(accessor, sessionArg)?.resource;
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

// --- Open File action (per-file toolbar in the desktop session changes editor)

/**
 * Opens the file shown in a diff row of the Agents window's desktop session
 * Changes editor ({@link SessionChangesEditor}) as a regular editor. The workbench
 * {@link GoToFileAction} only appears for the generic {@link MultiDiffEditor}, so
 * the custom desktop editor needs its own entry in the per-file toolbar. It is
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

		const changesViewService = accessor.get(IChangesViewService);
		const session = resolveSessionActionTarget(accessor, args[1]);
		if (!session) {
			return;
		}
		const changes = getChangesOfSession(changesViewService, accessor.get(ISessionsService).mainWindowActiveSession.get(), session);
		// From a chat window's Changes editor, in its group, not by focus; in the main window, as ever.
		const editor = (args[1] as Partial<IChangesEditorFileActionContext> | undefined)?.editor;
		const group = editor instanceof SessionChangesEditor && !accessor.get(IEditorGroupsService).mainPart.groups.includes(editor.group) ? editor.group : undefined;
		await accessor.get(IEditorService).openEditor({
			resource: getWorkspaceResource(resource, changes.changesObs.get()),
		}, group);
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

function getExpandedChangesDiffEditor(pane: IEditorPane | undefined, resource: URI): DiffEditorWidget | undefined {
	if (pane instanceof SessionChangesEditor) {
		pane.expand(resource);
	} else if (pane instanceof MultiDiffEditor) {
		const viewModel = pane.viewModel;
		const item = viewModel?.items.read(undefined)
			.find(item => isEqual(item.modifiedUri, resource) || isEqual(item.originalUri, resource));
		if (viewModel && item) {
			viewModel.expand(item);
		}
	}
	return getChangesDiffEditor(pane, resource);
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

		getExpandedChangesDiffEditor(getFileActionEditorPane(accessor.get(IEditorService), args), resource)?.showAllUnchangedRegions();
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

		getExpandedChangesDiffEditor(getFileActionEditorPane(accessor.get(IEditorService), args), resource)?.collapseAllUnchangedRegions();
	}
}
registerAction2(CollapseUnchangedRegionsAction);

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
			for (const session of sessionsService.visibleSessions.read(reader)) {
				// While the worktree is pending the reported changes belong to the
				// checkout the session was started from, not to the session.
				if (!session || session.worktreePending?.read(reader)) {
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

/**
 * The changeset operations that the Changes of a session show, each as `<kind>:<operation id>`: `resource` for those on a
 * file of its changeset, `changeset` for those in the title of its Changes editor. Every scope that shows a session's
 * Changes, such as each window, binds them for its session (see {@link bindChangesetOperations}).
 */
export const SessionChangesetOperationsContext = new RawContextKey<string[]>('sessions.changesetOperations', [], localize('sessionChangesetOperations', "The changeset operations that the changes of the session show."));
/** Those of {@link SessionChangesetOperationsContext} that are enabled. */
export const SessionEnabledChangesetOperationsContext = new RawContextKey<string[]>('sessions.changesetOperationsEnabled', [], localize('sessionEnabledChangesetOperations', "The changeset operations that the changes of the session show and that are enabled."));

type ChangesetOperationKind = 'resource' | 'changeset';

interface IChangesetOperationEntry {
	/** `<kind>:<operation id>`, as {@link SessionChangesetOperationsContext} lists it. */
	readonly key: string;
	readonly kind: ChangesetOperationKind;
	readonly operation: ISessionChangesetOperation;
	readonly enabled: boolean;
	readonly order: number;
}

interface IChangesetOperations {
	readonly entries: readonly IChangesetOperationEntry[];
	/** The changeset that the operations in the title of the Changes editor act on. */
	readonly titleChangeset: ISessionChangeset | undefined;
}

function isChangesetOperationBusy(operation: ISessionChangesetOperation): boolean {
	return operation.status === SessionChangesetOperationStatus.Disabled || operation.status === SessionChangesetOperationStatus.Running;
}

/**
 * The changeset operations that the Changes of `session` show. Those on a file are the resource-scoped operations of its
 * changeset. Those in the title of its Changes editor are, for a new (untitled) session, the changeset-scoped operations
 * of its uncommitted changes (except Sync and Checkout), and for an existing session the Commit operation of the
 * changeset selected in its Changes view; the title bar's button bar omits Commit, so that it always lives here.
 */
export function getChangesetOperations(session: IActiveSession | undefined, changes: Pick<IChangesSessionObservables, 'changesetObs' | 'changesetOperationsObs'>, reader: IReader | undefined): IChangesetOperations {
	const entries: IChangesetOperationEntry[] = [];
	const changeset = changes.changesetObs.read(reader);
	for (const operation of changeset?.operations.read(reader) ?? []) {
		if (operation.scopes.includes(SessionChangesetOperationScope.Resource)) {
			entries.push({ key: `resource:${operation.id}`, kind: 'resource', operation, enabled: !isChangesetOperationBusy(operation), order: 100 });
		}
	}
	if (!session) {
		return { entries, titleChangeset: undefined };
	}

	let titleChangeset: ISessionChangeset | undefined;
	let operations: readonly ISessionChangesetOperation[];
	let hasUncommittedChanges = true;
	if (session.status.read(reader) === SessionStatus.Untitled) {
		titleChangeset = (session.activeChat.read(reader) ?? session.mainChat.read(reader)).changesets.read(reader)
			?.find(candidate => candidate.id === UNCOMMITTED_CHANGES_CHANGESET_ID && candidate.isEnabled.read(reader));
		operations = titleChangeset?.operations.read(reader)
			.filter(operation => operation.id !== AGENT_HOST_SYNC_CHANGESET_OPERATION_ID)
			.filter(operation => operation.id !== AGENT_HOST_CHECKOUT_CHANGESET_OPERATION_ID)
			.filter(operation => operation.scopes.includes(SessionChangesetOperationScope.Changeset)) ?? [];
		hasUncommittedChanges = (session.workspace.read(reader)?.folders[0]?.gitRepository?.uncommittedChanges ?? 0) > 0;
	} else {
		titleChangeset = changeset;
		operations = titleChangeset
			? changes.changesetOperationsObs.read(reader)
				.filter(operation => operation.id === AGENT_HOST_COMMIT_CHANGESET_OPERATION_ID)
				.filter(operation => operation.scopes.includes(SessionChangesetOperationScope.Changeset))
			: [];
	}
	operations.forEach((operation, order) => entries.push({
		key: `changeset:${operation.id}`,
		kind: 'changeset',
		operation,
		enabled: !isChangesetOperationBusy(operation) && !(operation.id === AGENT_HOST_COMMIT_CHANGESET_OPERATION_ID && !hasUncommittedChanges),
		order,
	}));
	return { entries, titleChangeset };
}

/** Whether the list of the context key `key` has `entry`. */
function listHas(key: RawContextKey<string[]>, entry: string): ContextKeyExpression {
	return ContextKeyExpr.regex(key.key, new RegExp(`(^|,)${escapeRegExpCharacters(entry)}(,|$)`));
}

/** The Changes of the Changes editor whose file toolbar or title an action is invoked from, else those of the main window's session. */
function getInvokingChangesScope(accessor: ServicesAccessor, args: readonly unknown[]): { readonly session: IActiveSession | undefined; readonly changes: Pick<IChangesSessionObservables, 'changesObs' | 'changesetObs' | 'changesetOperationsObs'> } {
	const fileContext = args[1] as Partial<IChangesEditorFileActionContext> | undefined;
	const editorContext = args.find(isEditorCommandsContext);
	const editor = fileContext?.editor instanceof SessionChangesEditor
		? fileContext.editor
		: editorContext ? accessor.get(IEditorGroupsService).getGroup(editorContext.groupId)?.activeEditorPane : undefined;
	if (editor instanceof SessionChangesEditor) {
		return { session: editor.changesScope.session.get(), changes: editor.changesScope.changes };
	}
	const changesViewService = accessor.get(IChangesViewService);
	return {
		session: accessor.get(ISessionsService).mainWindowActiveSession.get(),
		changes: {
			changesObs: changesViewService.activeSessionChangesObs,
			changesetObs: changesViewService.activeSessionChangesetObs,
			changesetOperationsObs: changesViewService.activeSessionChangesetOperationsObs,
		},
	};
}

const CHANGESET_OPERATION_ACTION_PREFIX = 'workbench.contrib.sessions.changesetOperation.';
const CHANGES_HEADER_CHANGESET_OPERATION_ACTION_PREFIX = 'workbench.contrib.sessions.changesHeaderChangesetOperation.';

function registerChangesetOperationAction({ key, kind, operation, order }: IChangesetOperationEntry): IDisposable {
	const shown = listHas(SessionChangesetOperationsContext, key);
	const precondition = listHas(SessionEnabledChangesetOperationsContext, key);
	if (kind === 'resource') {
		return registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `${CHANGESET_OPERATION_ACTION_PREFIX}${operation.id}`,
					title: operation.label,
					icon: operation.icon,
					precondition,
					f1: false,
					menu: [{
						id: MenuId.AgentsChangeInlineToolbar,
						group: 'navigation',
						order,
						when: shown,
					}, {
						id: MenuId.MultiDiffEditorFileToolbar,
						when: ContextKeyExpr.and(ContextKeyExpr.equals('resourceScheme', 'changes-multi-diff-source'), shown),
						group: 'navigation',
						order,
					}]
				});
			}

			async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
				// The Changes view provides the resource as the third argument (it uses a custom action runner), the
				// toolbar of a file of the Changes editor as the first, followed by the session and editor it shows in.
				const resource = args.length === 3 ? args[2] : args[0];
				if (!URI.isUri(resource)) {
					return;
				}
				const { changes } = getInvokingChangesScope(accessor, args);
				const change = changes.changesObs.get().find(candidate => isChangesFileResource(candidate, resource));
				if (change) {
					await changes.changesetObs.get()?.invokeOperation(operation.id, { kind: 'resource', resource: getChangesFileUri(change) });
				}
			}
		});
	}
	return registerAction2(class extends Action2 {
		constructor() {
			super({
				id: `${CHANGES_HEADER_CHANGESET_OPERATION_ACTION_PREFIX}${operation.id}`,
				title: operation.label,
				tooltip: operation.description,
				icon: operation.icon,
				precondition,
				f1: false,
				menu: {
					id: Menus.SessionsEditorTitle,
					group: 'navigation',
					order,
					when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(SessionChangesEditor.ID), shown),
				}
			});
		}

		async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
			const { session, changes } = getInvokingChangesScope(accessor, args);
			await getChangesetOperations(session, changes, undefined).titleChangeset?.invokeOperation(operation.id);
		}
	});
}

/**
 * The action of each changeset operation, registered once while a scope shows it, whichever scopes show it, and shown
 * and enabled in each scope by its context keys.
 */
const changesetOperationActions = new class {
	private readonly _registrations = new Map<string, { count: number; readonly registration: IDisposable }>();

	acquire(entry: IChangesetOperationEntry): IDisposable {
		let registration = this._registrations.get(entry.key);
		if (!registration) {
			registration = { count: 0, registration: registerChangesetOperationAction(entry) };
			this._registrations.set(entry.key, registration);
		}
		registration.count++;
		const acquired = registration;
		let released = false;
		return toDisposable(() => {
			if (released) {
				return;
			}
			released = true;
			if (--acquired.count === 0) {
				acquired.registration.dispose();
				this._registrations.delete(entry.key);
			}
		});
	}
};

/**
 * Binds on `contextKeyService` the changeset operations that the Changes of the session of `source` show, and keeps their
 * actions registered meanwhile. The main window binds those of its session, a chat window those of the session it shows.
 */
export function bindChangesetOperations(source: Pick<ISessionActionContextKeysSource, 'session'> & { readonly changes: Pick<IChangesSessionObservables, 'changesetObs' | 'changesetOperationsObs'> }, contextKeyService: IContextKeyService): IDisposable {
	const shown = SessionChangesetOperationsContext.bindTo(contextKeyService);
	const enabled = SessionEnabledChangesetOperationsContext.bindTo(contextKeyService);
	return autorun(reader => {
		const { entries } = getChangesetOperations(source.session.read(reader), source.changes, reader);
		contextKeyService.bufferChangeEvents(() => {
			shown.set(entries.map(entry => entry.key));
			enabled.set(entries.filter(entry => entry.enabled).map(entry => entry.key));
		});
		for (const entry of entries) {
			reader.store.add(changesetOperationActions.acquire(entry));
		}
	});
}

registerSessionActionContextKeyBinder((_accessor, source, contextKeyService) => bindChangesetOperations(source, contextKeyService));

class CommitActionViewItem extends MenuEntryActionViewItem {

	override render(container: HTMLElement): void {
		this.options.icon = false;
		this.options.label = true;
		container.classList.add('changes-commit-action');
		super.render(container);
	}

	protected override updateLabel(): void {
		if (this.label) {
			const icon = this._commandAction.item.icon;
			const iconElement = icon && ThemeIcon.isThemeIcon(icon) ? renderIcon(icon) : undefined;
			iconElement?.setAttribute('aria-hidden', 'true');
			dom.reset(this.label, ...(iconElement ? [iconElement] : []), dom.$('span.changes-commit-label', undefined, this._commandAction.label));
		}
	}
}

/** Renders the Commit operation in the title of the Changes editor with its label, in every window. */
export class ChangesHeaderChangesetOperationsActionContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.sessions.changesHeaderChangesetOperationsAction';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
	) {
		super();
		this._register(actionViewItemService.register(Menus.SessionsEditorTitle, `${CHANGES_HEADER_CHANGESET_OPERATION_ACTION_PREFIX}${AGENT_HOST_COMMIT_CHANGESET_OPERATION_ID}`, (action, options, instantiationService) => {
			return action instanceof MenuItemAction
				? instantiationService.createInstance(CommitActionViewItem, action, options)
				: undefined;
		}));
	}
}

registerWorkbenchContribution2(ChangesMultiDiffSourceResolverContribution.ID, ChangesMultiDiffSourceResolverContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChangesHeaderChangesetOperationsActionContribution.ID, ChangesHeaderChangesetOperationsActionContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(SessionChangesStatsCacheContribution.ID, SessionChangesStatsCacheContribution, WorkbenchPhase.AfterRestored);
