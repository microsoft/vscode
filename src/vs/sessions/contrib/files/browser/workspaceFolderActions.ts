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
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { Menus } from '../../../browser/menus.js';
import { SessionHeaderMetaActionViewItem } from '../../../browser/parts/sessionHeaderMetaActionViewItem.js';
import { SessionHasWorkspaceContext, IsQuickChatSessionContext } from '../../../common/contextkeys.js';
import { ISessionContext } from '../../../services/sessions/browser/sessionContext.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { SESSIONS_FILES_VIEW_ID } from './filesView.js';

// --- Open Files view action

class OpenFilesViewAction extends Action2 {
	static readonly ID = 'workbench.agentSessions.action.openFilesView';

	constructor() {
		super({
			id: OpenFilesViewAction.ID,
			title: localize2('agentSessions.files', 'Files'),
			icon: Codicon.folder,
			f1: false,
			// Workspace folder pill shown in the session header meta row
			// (vs/sessions/browser/parts/sessionHeader.ts), rendered with a custom
			// action view item. Ordered before the changes pill (order 0).
			menu: {
				id: Menus.SessionHeaderMeta,
				group: 'navigation',
				order: -10,
				when: ContextKeyExpr.and(SessionHasWorkspaceContext, IsQuickChatSessionContext.negate())
			},
		});
	}

	override async run(accessor: ServicesAccessor, session?: IActiveSession): Promise<void> {
		const sessionsService = accessor.get(ISessionsService);
		const viewsService = accessor.get(IViewsService);

		// The clicked session is forwarded as the argument by the session header,
		// which has already promoted it to be the active session. Fall back to the
		// active session when invoked without an explicit argument.
		const targetSession = session ?? sessionsService.activeSession.get();
		if (!targetSession) {
			return;
		}

		await viewsService.openView(SESSIONS_FILES_VIEW_ID, false);
	}
}
registerAction2(OpenFilesViewAction);

// --- Open Files view action view item (session header workspace folder pill)

interface IWorkspaceInfo {
	readonly label: string;
	readonly icon: ThemeIcon;
	readonly workingDirectoryPath: string | undefined;
	readonly branch: string | undefined;
}

/**
 * Renders the session's workspace folder as a `<folder-icon> <label>` pill for the
 * {@link OpenFilesViewAction} contributed into {@link Menus.SessionHeaderMeta}. Activating it
 * opens the Files view. The workspace is read from the {@link ISessionContext} so the correct
 * per-session folder is shown even when several session views are visible at once.
 */
export class OpenFilesViewActionViewItem extends SessionHeaderMetaActionViewItem {

	private readonly _workspaceObs: IObservable<IWorkspaceInfo | undefined>;

	constructor(
		action: MenuItemAction,
		options: IActionViewItemOptions,
		@ISessionContext sessionContext: ISessionContext,
	) {
		super(undefined, action, options);

		this._workspaceObs = derivedOpts<IWorkspaceInfo | undefined>({ owner: this, equalsFn: structuralEquals }, reader => {
			const session = sessionContext.session.read(reader);
			const workspace = session?.workspace.read(reader);
			if (!workspace?.label) {
				return undefined;
			}
			// Mirror the sessions list / hover icon logic: cloud for virtual
			// workspaces, folder when the session runs in the repo checkout,
			// worktree otherwise.
			const folder = workspace.folders[0];
			const isWorkspaceFolder = workspace.folders.length > 0 && folder?.gitRepository?.workTreeUri === undefined;
			const icon = workspace.isVirtualWorkspace ? Codicon.cloudCompact : isWorkspaceFolder ? Codicon.folderCompact : Codicon.worktreeCompact;
			const branch = folder?.gitRepository?.branchName?.trim() || undefined;
			return { label: workspace.label, icon, workingDirectoryPath: folder?.workingDirectory.fsPath, branch };
		});

		this._register(autorun(reader => {
			this._workspaceObs.read(reader);
			this.updateLabel();
			this.updateTooltip();
			this.updateAriaLabel();
		}));
	}

	override render(container: HTMLElement): void {
		super.render(container);
		this.element?.classList.add('chat-composite-bar-meta-workspace-item');
		this.button?.element.classList.add('chat-composite-bar-meta-workspace-button');
	}

	protected override getIconElement(): HTMLElement | undefined {
		const icon = this._workspaceObs.get()?.icon ?? Codicon.folder;
		return $(`span.chat-composite-bar-meta-item-icon${ThemeIcon.asCSSSelector(icon)}`);
	}

	protected override getLabelText(): string {
		return this._workspaceObs.get()?.label ?? '';
	}

	protected override getTooltip(): string {
		return localize('agentSessions.openFilesView.tooltip', "Open Files");
	}

	protected override getAriaLabel(): string {
		const label = this._workspaceObs.get()?.label;
		return label
			? localize('agentSessions.openFilesView.ariaLabel', "Open Files: {0}", label)
			: this.getTooltip();
	}

	protected override getHoverContents(): IManagedHoverContent {
		const workspace = this._workspaceObs.get();
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
 * Registers the {@link OpenFilesViewActionViewItem} for the open-files action in the
 * session header meta toolbar. Registering it here (rather than in the core session header)
 * keeps the rendering of the files-owned action co-located with the action itself.
 */
class OpenFilesViewActionViewItemContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.openFilesViewActionViewItem';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
	) {
		super();

		// The action view item service only notifies toolbars of a factory via
		// the event passed to register(), not on registration itself. A session
		// header restored with an existing workspace may create its meta toolbar
		// before this contribution runs, so announce the factory once right after
		// registering to make those toolbars re-render and pick it up.
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
