/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../base/browser/dom.js';
import { IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IManagedHoverContent } from '../../../../base/browser/ui/hover/hover.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { structuralEquals } from '../../../../base/common/equals.js';
import { Emitter } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derivedOpts, IObservable } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../nls.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, MenuItemAction, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { Menus } from '../../../browser/menus.js';
import { getSessionWorkspaceDisplayInfo, ISessionWorkspaceDisplayInfo } from '../../../browser/sessionWorkspace.js';
import { ChatPillActionViewItem } from '../../../../workbench/browser/chatPills.js';
import { SessionHasWorkspaceContext, IsQuickChatSessionContext } from '../../../common/contextkeys.js';
import { NEW_FILE_TAB_COMMAND_ID } from '../../../common/sessionCommands.js';
import { ISessionContext } from '../../../services/sessions/browser/sessionContext.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { SESSIONS_FILES_VIEW_ID } from './filesView.js';

// --- Open Files view action

export class OpenFilesViewAction extends Action2 {
	static readonly ID = 'workbench.agentSessions.action.openFilesView';

	constructor() {
		super({
			id: OpenFilesViewAction.ID,
			title: localize2('agentSessions.files', 'Files'),
			icon: Codicon.folder,
			f1: false,
			// Workspace metadata pill, ordered before changes.
			menu: {
				id: Menus.SessionHeaderMeta,
				group: 'navigation',
				order: -10,
				when: ContextKeyExpr.and(
					SessionHasWorkspaceContext,
					IsQuickChatSessionContext.negate(),
				)
			},
		});
	}

	override async run(accessor: ServicesAccessor, session?: IActiveSession): Promise<void> {
		const sessionsService = accessor.get(ISessionsService);
		const viewsService = accessor.get(IViewsService);
		const commandService = accessor.get(ICommandService);
		const layoutService = accessor.get(IAgentWorkbenchLayoutService);

		// The clicked pill forwards its session. Fall back to the active session
		// when invoked without an explicit argument.
		const targetSession = session ?? sessionsService.activeSession.get();
		if (!targetSession) {
			return;
		}

		if (layoutService.isSinglePaneLayoutEnabled) {
			await commandService.executeCommand(NEW_FILE_TAB_COMMAND_ID);
		}

		await viewsService.openView(SESSIONS_FILES_VIEW_ID, false);
	}
}
registerAction2(OpenFilesViewAction);

// --- Open Files view action view item

/**
 * Renders the session's workspace folder as a `<folder-icon> <label>` metadata pill.
 * The workspace is read from the {@link ISessionContext} so the correct session is shown.
 */
export class OpenFilesViewActionViewItem extends ChatPillActionViewItem {

	private readonly _workspaceObs: IObservable<ISessionWorkspaceDisplayInfo | undefined>;

	constructor(
		action: MenuItemAction,
		options: IActionViewItemOptions,
		@ISessionContext sessionContext: ISessionContext,
	) {
		super(undefined, action, options);

		this._workspaceObs = derivedOpts<ISessionWorkspaceDisplayInfo | undefined>({ owner: this, equalsFn: structuralEquals }, reader => getSessionWorkspaceDisplayInfo(sessionContext.session.read(reader), reader));

		this._register(autorun(reader => {
			this._workspaceObs.read(reader);
			this.updateLabel();
			this.updateTooltip();
			this.updateAriaLabel();
		}));
	}

	override render(container: HTMLElement): void {
		super.render(container);
		this.element?.classList.add('chat-pill-workspace-item');
		this.button?.element.classList.add('chat-pill-workspace-button');
	}

	protected override getIconElement(): HTMLElement | undefined {
		const icon = this._workspaceObs.get()?.icon ?? Codicon.folder;
		return $(`span.chat-pill-icon${ThemeIcon.asCSSSelector(icon)}`, { 'aria-hidden': 'true' });
	}

	protected override getLabelText(): string {
		return this._workspaceObs.get()?.label ?? '';
	}

	protected override getTooltip(): string {
		return localize('agentSessions.openFilesView.tooltip', "Open Files");
	}

	protected override getAriaLabel(): string {
		const workspace = this._workspaceObs.get();
		if (!workspace?.label) {
			return this.getTooltip();
		}
		return workspace.worktreePending
			? localize('agentSessions.openFilesView.worktreePendingAriaLabel', "Open Files: {0}, creating worktree", workspace.label)
			: localize('agentSessions.openFilesView.ariaLabel', "Open Files: {0}", workspace.label);
	}

	protected override getHoverContents(): IManagedHoverContent {
		const workspace = this._workspaceObs.get();
		if (workspace?.worktreePending) {
			const message = localize('agentSessions.openFilesView.worktreePending', "Creating worktree… Its folder and branch are shown once ready.");
			const md = new MarkdownString('', { supportThemeIcons: true });
			md.appendMarkdown(`$(${Codicon.worktree.id}) `);
			md.appendText(message);
			return { markdown: md, markdownNotSupportedFallback: message };
		}

		if (!workspace?.workingDirectoryPath) {
			return this.getTooltip();
		}

		const md = new MarkdownString('', { supportThemeIcons: true });
		const fallbackLines: string[] = [];
		md.appendMarkdown(`$(${Codicon.folder.id}) `);
		md.appendText(workspace.workingDirectoryPath);
		fallbackLines.push(workspace.workingDirectoryPath);

		if (workspace.branch) {
			md.appendMarkdown(`\n\n$(${Codicon.gitBranch.id}) `);
			md.appendText(workspace.branch);
			fallbackLines.push(workspace.branch);
		}

		return { markdown: md, markdownNotSupportedFallback: fallbackLines.join('\n') };
	}
}

/**
 * Registers the {@link OpenFilesViewActionViewItem} for the open-files metadata pill.
 */
class OpenFilesViewActionViewItemContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.openFilesViewActionViewItem';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
	) {
		super();

		// Announce the factory after registration so existing metadata pills re-render.
		const onDidRegister = this._register(new Emitter<void>());
		this._register(actionViewItemService.register(Menus.SessionHeaderMeta, OpenFilesViewAction.ID, (action, options, instantiationService) => {
			if (!(action instanceof MenuItemAction)) {
				return undefined;
			}
			return instantiationService.createInstance(OpenFilesViewActionViewItem, action, options);
		}, onDidRegister.event));
		onDidRegister.fire();
	}
}

registerWorkbenchContribution2(OpenFilesViewActionViewItemContribution.ID, OpenFilesViewActionViewItemContribution, WorkbenchPhase.AfterRestored);
