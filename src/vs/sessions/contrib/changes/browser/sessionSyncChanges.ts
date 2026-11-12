/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, getActiveElement, reset } from '../../../../base/browser/dom.js';
import { ActionViewItem, IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IReader } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../nls.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { AGENT_HOST_SYNC_CHANGESET_OPERATION_ID } from '../../../../platform/agentHost/common/agentHostChangesetOperationService.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { getNewSessionRepositoryConfigGroup, Menus } from '../../../../workbench/contrib/sessions/browser/menus.js';
import { SessionActiveChatResourceContext, SessionIdContext } from '../../../../workbench/contrib/sessions/common/contextkeys.js';
import { getWindowHost, ISessionHost, SessionHostKind } from '../../../../workbench/services/sessions/browser/sessionHost.js';
import { IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ISessionsPartService } from '../../../../workbench/services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { resolveSessionCommandTarget } from '../../../../workbench/contrib/sessions/browser/sessionCommandTarget.js';
import { getSessionWorkspaceKind, IChat, ISession, ISessionChangeset, ISessionChangesetOperation, SessionChangesetOperationScope, SessionChangesetOperationStatus, SessionWorkspaceKind, UNCOMMITTED_CHANGES_CHANGESET_ID } from '../../../../workbench/services/sessions/common/session.js';
import { ISessionInputPickerVisibility } from '../../../../workbench/contrib/sessions/common/sessionPickerVisibility.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { FOCUS_SESSION_SYNC_ACTION_COMMAND_ID } from '../../../../workbench/contrib/sessions/common/sessionCommands.js';

function getSyncChangesOperation(chat: IChat | undefined, reader?: IReader): { changeset: ISessionChangeset; operation: ISessionChangesetOperation } | undefined {
	const changeset = chat?.changesets.read(reader)?.find(candidate =>
		candidate.id === UNCOMMITTED_CHANGES_CHANGESET_ID && candidate.isEnabled.read(reader));

	const operation = changeset?.operations.read(reader).find(candidate =>
		candidate.id === AGENT_HOST_SYNC_CHANGESET_OPERATION_ID &&
		candidate.scopes.includes(SessionChangesetOperationScope.Changeset));

	return changeset && operation ? { changeset, operation } : undefined;
}

function isSyncChangesEnabled(operation: ISessionChangesetOperation | undefined): boolean {
	return !!operation && operation.status !== SessionChangesetOperationStatus.Disabled && operation.status !== SessionChangesetOperationStatus.Running;
}

function isFolderSession(session: Pick<ISession, 'worktreePending'> | undefined, chat: IChat | undefined, reader?: IReader): boolean {
	const workspace = chat?.workspace.read(reader);
	return getSessionWorkspaceKind(workspace, session?.worktreePending?.read(reader)) === SessionWorkspaceKind.Folder;
}

function shouldShowSyncChanges(session: Pick<ISession, 'worktreePending'> | undefined, chat: IChat | undefined, reader?: IReader): boolean {
	const repository = chat?.workspace.read(reader)?.folders[0]?.gitRepository;
	return isFolderSession(session, chat, reader)
		&& ((repository?.incomingChanges ?? 0) > 0 || (repository?.outgoingChanges ?? 0) > 0);
}

function getSyncChangesTooltip(incomingChanges: number, outgoingChanges: number, upstreamBranchName: string | undefined): string {
	if (!upstreamBranchName || (incomingChanges === 0 && outgoingChanges === 0)) {
		return localize('sessions.syncChanges.tooltip', "Synchronize Changes");
	}

	if (outgoingChanges === 0) {
		return localize('sessions.syncChanges.pullTooltip', "Pull {0} commits from {1}", incomingChanges, upstreamBranchName);
	}

	if (incomingChanges === 0) {
		return localize('sessions.syncChanges.pushTooltip', "Push {0} commits to {1}", outgoingChanges, upstreamBranchName);
	}

	return localize('sessions.syncChanges.pullPushTooltip', "Pull {0} and push {1} commits between {2}", incomingChanges, outgoingChanges, upstreamBranchName);
}

class SessionSyncChangesAction extends Action2 {
	static readonly ID = 'workbench.action.sessions.syncChanges';

	constructor() {
		super({
			id: SessionSyncChangesAction.ID,
			title: localize2('sessions.syncChanges', "Sync Changes"),
			icon: Codicon.sync,
			f1: false,
		});
	}

	override async run(accessor: ServicesAccessor, context?: { session: ISession | undefined; chat?: IChat }): Promise<void> {
		// A composer's toolbar passes its session and the chat it shows; otherwise, the focused host's.
		const target = context ? undefined : resolveSessionCommandTarget(accessor, []);
		const session = context ? context.session : target?.session;
		const chat = context ? context.chat : target?.chat;

		const sync = getSyncChangesOperation(chat);
		if (!sync || !isFolderSession(session, chat) || !isSyncChangesEnabled(sync.operation)) {
			throw new Error(localize('sessions.syncChanges.unavailable', "Sync Changes is no longer available for this session."));
		}

		await sync.changeset.invokeOperation(sync.operation.id);
	}
}

export class SessionSyncChangesActionViewItem extends ActionViewItem {
	private _running = false;
	private _countsLabel = '';
	private _tooltip: string | undefined;
	private _icon: ThemeIcon = Codicon.sync;

	constructor(
		action: IAction,
		options: IActionViewItemOptions,
		@ISessionHost private readonly sessionHost: ISessionHost,
		@ISessionsPartService private readonly sessionsPartService: ISessionsPartService,
		@ISessionInputPickerVisibility pickerVisibility: ISessionInputPickerVisibility,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
	) {
		super(undefined, action, { ...options, icon: false, label: true });
		this._register(pickerVisibility.registerPicker('sync', () => this.focus()));
		this._register(this.keybindingService.onDidUpdateKeybindings(() => this.updateTooltip()));

		this._register(autorun(reader => {
			const chat = sessionHost.chat.read(reader);
			const operation = getSyncChangesOperation(chat, reader)?.operation;
			const repository = chat?.workspace.read(reader)?.folders[0]?.gitRepository;

			const incomingChanges = repository?.incomingChanges ?? 0;
			const outgoingChanges = repository?.outgoingChanges ?? 0;

			// Leave the presentation untouched until the menu disposes
			// the completed action.
			if (incomingChanges === 0 && outgoingChanges === 0) {
				return;
			}

			this._countsLabel = incomingChanges > 0
				? outgoingChanges > 0
					? localize('sessions.syncChanges.incomingOutgoingCounts', "{0}\u2193 {1}\u2191", incomingChanges, outgoingChanges)
					: localize('sessions.syncChanges.incomingCount', "{0}\u2193", incomingChanges)
				: localize('sessions.syncChanges.outgoingCount', "{0}\u2191", outgoingChanges);

			this._running = operation?.status === SessionChangesetOperationStatus.Running;
			this._icon = this._running
				? ThemeIcon.modify(Codicon.sync, 'spin')
				: operation?.icon ?? Codicon.sync;

			this._tooltip = this._running
				? localize('sessions.syncChanges.running', "Synchronizing Changes...")
				: getSyncChangesTooltip(incomingChanges, outgoingChanges, repository?.upstreamBranchName);

			this.updateLabel();
			this.updateTooltip();
		}));
	}

	protected override getTooltip(): string | undefined {
		const tooltip = this._tooltip ?? super.getTooltip();
		return tooltip ? this.keybindingService.appendKeybinding(tooltip, FOCUS_SESSION_SYNC_ACTION_COMMAND_ID) : tooltip;
	}

	protected override updateLabel(): void {
		if (!this.label || !this._countsLabel) {
			return;
		}

		const icon = renderIcon(this._icon);
		icon.setAttribute('aria-hidden', 'true');
		this.label.classList.add('sync-changes-action-view-item');
		this.label.setAttribute('aria-busy', String(this._running));
		reset(this.label, icon, $('span.sync-changes-counts', undefined, this._countsLabel));
	}

	override dispose(): void {
		const session = this.sessionHost.session.get();
		const chat = this.sessionHost.chat.get();
		if ((!getSyncChangesOperation(chat) || !shouldShowSyncChanges(session, chat)) && this.element?.contains(getActiveElement())) {
			// Back to the surface of the host it is in: a pane of the grid, else its own chat's input, such as a chat
			// editor's, never the grid's pane of the same session in another window.
			if (this.sessionHost.kind === SessionHostKind.Pane && getWindowHost(this.sessionHost).kind === SessionHostKind.MainWindow) {
				this.sessionsPartService.focusViewOfHost(this.sessionHost);
			} else if (chat) {
				this.chatWidgetService.getWidgetBySessionResource(chat.resource)?.focusInput();
			}
		}

		super.dispose();
	}
}

export class SessionSyncChangesContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.sessions.syncChanges';

	constructor(
		@ISessionsService sessionsService: ISessionsService,
		@IActionViewItemService actionViewItemService: IActionViewItemService,
	) {
		super();
		this._register(registerAction2(SessionSyncChangesAction));
		this._register(actionViewItemService.register(
			Menus.NewSessionRepositoryConfig,
			SessionSyncChangesAction.ID,
			(action, options, scopedInstantiationService) => scopedInstantiationService.createInstance(SessionSyncChangesActionViewItem, action, options),
		));

		this._register(autorun(reader => {
			for (const pane of sessionsService.panes.read(reader)) {
				const session = pane.session.read(reader);
				if (!session) {
					continue;
				}
				const syncEnabled = derived(reader => {
					const chat = pane.chat.read(reader);
					const sync = getSyncChangesOperation(chat, reader);
					return sync && shouldShowSyncChanges(session, chat, reader) ? isSyncChangesEnabled(sync.operation) : undefined;
				});
				reader.store.add(autorun(reader => {
					const enabled = syncEnabled.read(reader);
					if (enabled !== undefined) {
						reader.store.add(MenuRegistry.appendMenuItem(Menus.NewSessionRepositoryConfig, {
							command: {
								id: SessionSyncChangesAction.ID,
								title: localize('sessions.syncChanges', "Sync Changes"),
								icon: Codicon.sync,
								precondition: enabled ? undefined : ContextKeyExpr.false(),
							},
							group: getNewSessionRepositoryConfigGroup(Number.MAX_SAFE_INTEGER, SessionSyncChangesAction.ID),
							order: Number.MAX_SAFE_INTEGER,
							when: ContextKeyExpr.and(IsSessionsWindowContext, ChatContextKeys.enabled, SessionIdContext.isEqualTo(session.sessionId),
								SessionActiveChatResourceContext.isEqualTo(pane.chat.read(reader)?.resource.toString() ?? '')),
						}));
					}
				}));
			}
		}));
	}
}

registerWorkbenchContribution2(SessionSyncChangesContribution.ID, SessionSyncChangesContribution, WorkbenchPhase.AfterRestored);
