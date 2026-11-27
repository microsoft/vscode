/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Severity from '../../../../../base/common/severity.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { AccessibleViewRegistry } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IDialogService, IPromptButton } from '../../../../../platform/dialogs/common/dialogs.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../../browser/editor.js';
import { EditorExtensions, EditorsOrder } from '../../../../common/editor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { CHAT_CATEGORY } from '../../../chat/browser/actions/chatActions.js';
import { Schemas } from '../../../../../base/common/network.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { hasWorkspaceFileExtension } from '../../../../../platform/workspace/common/workspace.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { Menus } from '../menus.js';
import { ISessionSection, ISessionSectionWorkspace, SessionSectionWorkspaceIsLocalContext, SessionSectionWorkspaceKindContext } from '../views/sessionsListCommon.js';
import { ISessionsManagementService } from '../../common/sessionsManagement.js';
import { IRecentSessionWorkspace, ISessionWorkspacesService, SessionWorkspaceError } from '../../common/sessionWorkspaces.js';
import { getSessionWorkspaceIcon } from './sessionWorkspaceAppearance.js';
import { SessionWorkspaceEditor } from './sessionWorkspaceEditor.js';
import { SessionWorkspaceEditorAccessibilityHelp } from './sessionWorkspaceEditorAccessibilityHelp.js';
import { EDIT_SESSION_WORKSPACE_COMMAND_ID, NEW_SESSION_WORKSPACE_COMMAND_ID, REMOVE_SESSION_WORKSPACE_COMMAND_ID, SESSION_WORKSPACE_EDITOR_WHEN, SessionWorkspaceEditorAvailableContext } from './sessionWorkspaceEditorCommands.js';
import { SessionWorkspaceEditorInput } from './sessionWorkspaceEditorInput.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';

/** Tells the window's UI that it has the Workspace editor, which only the windows that load this contribution have. */
class SessionWorkspaceEditorAvailableContribution implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.sessionWorkspaceEditorAvailable';

	constructor(@IContextKeyService contextKeyService: IContextKeyService) {
		SessionWorkspaceEditorAvailableContext.bindTo(contextKeyService).set(true);
	}
}
registerWorkbenchContribution2(SessionWorkspaceEditorAvailableContribution.ID, SessionWorkspaceEditorAvailableContribution, WorkbenchPhase.BlockStartup);

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(SessionWorkspaceEditor, SessionWorkspaceEditor.ID, localize('workspaceEditor.label', "Workspace Editor")),
	[new SyncDescriptor(SessionWorkspaceEditorInput)],
);

AccessibleViewRegistry.register(new SessionWorkspaceEditorAccessibilityHelp());

/** A command on a workspace, which the user picks when the command is not given one. */
abstract class SessionWorkspacePickAction extends Action2 {
	/** The workspace of `uri`, else one that the user picks among the workspaces. */
	protected async resolveWorkspace(uri: URI | undefined, placeholder: string, workspacesService: ISessionWorkspacesService, labelService: ILabelService, quickInputService: IQuickInputService): Promise<IRecentSessionWorkspace | undefined> {
		if (URI.isUri(uri)) {
			return workspacesService.getWorkspace(uri);
		}
		const items = workspacesService.workspaces.get().map((workspace): IQuickPickItem & { workspace: IRecentSessionWorkspace } => ({
			workspace,
			label: workspace.name,
			description: workspace.folders.map(folder => labelService.getUriLabel(folder, { relative: false })).join(', '),
			iconClasses: ThemeIcon.asClassNameArray(getSessionWorkspaceIcon(workspace.icon)),
		}));
		const picked = await quickInputService.pick(items, { placeHolder: placeholder, matchOnDescription: true });
		return picked?.workspace;
	}
}

registerAction2(class NewSessionWorkspaceAction extends Action2 {
	constructor() {
		super({
			id: NEW_SESSION_WORKSPACE_COMMAND_ID,
			title: localize2('newWorkspace', "New Workspace..."),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: SESSION_WORKSPACE_EDITOR_WHEN,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<IRecentSessionWorkspace | undefined> {
		const input = new SessionWorkspaceEditorInput({ kind: 'new' }, accessor.get(IUriIdentityService).extUri);
		await accessor.get(IEditorService).openEditor(input, { pinned: true });
		return input.whenClosed();
	}
});

registerAction2(class EditSessionWorkspaceAction extends SessionWorkspacePickAction {
	constructor() {
		super({
			id: EDIT_SESSION_WORKSPACE_COMMAND_ID,
			title: localize2('editWorkspace', "Edit Workspace..."),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: SESSION_WORKSPACE_EDITOR_WHEN,
		});
	}

	override async run(accessor: ServicesAccessor, uri?: URI): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const extUri = accessor.get(IUriIdentityService).extUri;
		const workspace = await this.resolveWorkspace(uri, localize('editWorkspace.pick', "Select a workspace to edit"), accessor.get(ISessionWorkspacesService), accessor.get(ILabelService), accessor.get(IQuickInputService));
		if (workspace) {
			await editorService.openEditor(new SessionWorkspaceEditorInput({ kind: 'edit', workspace }, extUri), { pinned: true });
		}
	}
});

registerAction2(class RemoveSessionWorkspaceAction extends SessionWorkspacePickAction {
	constructor() {
		super({
			id: REMOVE_SESSION_WORKSPACE_COMMAND_ID,
			title: localize2('removeWorkspace', "Remove Workspace..."),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: SESSION_WORKSPACE_EDITOR_WHEN,
		});
	}

	override async run(accessor: ServicesAccessor, uri?: URI): Promise<void> {
		const dialogService = accessor.get(IDialogService);
		const workspacesService = accessor.get(ISessionWorkspacesService);
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const editorService = accessor.get(IEditorService);
		const notificationService = accessor.get(INotificationService);
		const logService = accessor.get(ILogService);
		const labelService = accessor.get(ILabelService);
		const extUri = accessor.get(IUriIdentityService).extUri;
		const workspace = await this.resolveWorkspace(uri, localize('removeWorkspace.pick', "Select a workspace to remove"), workspacesService, labelService, accessor.get(IQuickInputService));
		if (!workspace) {
			return;
		}

		// Only a workspace with a workspace file that still exists offers to delete it, never a folder; a file the user made
		// says that it is theirs
		const hasFile = SessionWorkspaceEditorInput.hasWorkspaceFile(extUri, workspace) && !workspace.missing;
		const buttons: IPromptButton<boolean>[] = [{ label: localize({ key: 'removeWorkspace.remove', comment: ['&& denotes a mnemonic'] }, "&&Remove Workspace"), run: () => false }];
		let detail = localize('removeWorkspace.detail', "Its sessions are kept and listed by their folders.");
		if (hasFile && workspace.owned) {
			buttons.push({ label: localize({ key: 'removeWorkspace.delete', comment: ['&& denotes a mnemonic'] }, "&&Delete Workspace and File"), run: () => true });
			detail = localize('removeWorkspace.detailOwnedFile', "Its sessions are kept and listed by their folders. Delete Workspace and File also moves its workspace file to the trash.");
		} else if (hasFile) {
			buttons.push({ label: localize({ key: 'removeWorkspace.deleteOwnFile', comment: ['&& denotes a mnemonic'] }, "&&Delete Workspace and Its File"), run: () => true });
			detail = localize('removeWorkspace.detailOwnFile', "Its sessions are kept and listed by their folders. Delete Workspace and Its File also moves your workspace file {0} to the trash.", labelService.getUriLabel(workspace.uri, { relative: false }));
		}
		const { result: deleteFile } = await dialogService.prompt<boolean>({
			type: Severity.Warning,
			message: localize('removeWorkspace.message', "Remove the workspace '{0}'?", workspace.name),
			detail,
			buttons,
			cancelButton: true,
		});
		if (deleteFile === undefined) {
			return;
		}

		// Its open editors close first and save what they still have to, so nothing writes the workspace once it is removed.
		// An editor can have renamed the workspace while the user was asked: match it as it is now and as it was.
		const confirmed = workspacesService.getWorkspace(workspace.uri) ?? workspace;
		const editors = editorService.getEditors(EditorsOrder.SEQUENTIAL)
			.filter(({ editor }) => editor instanceof SessionWorkspaceEditorInput && (editor.isFor(workspace) || editor.isFor(confirmed)));
		const inputs = editors.map(({ editor }) => editor as SessionWorkspaceEditorInput);
		if (editors.length) {
			await editorService.closeEditors(editors);
		}
		await Promise.all(inputs.filter(input => input.isDisposed()).map(input => input.whenClosed()));
		// A pending rename can have moved the workspace to another file
		const current = workspacesService.getWorkspace(workspace.uri) ?? workspace;

		try {
			// Removing can be refused, such as deleting a file where there is no trash, which leaves the workspace as it was
			await workspacesService.removeWorkspace(current.uri, { deleteFile: deleteFile && hasFile });
		} catch (error) {
			logService.error(error);
			// A refusal of the workspaces service explains itself; any other error stays in the log
			notificationService.error(error instanceof SessionWorkspaceError ? error.message : localize('removeWorkspace.failed', "Could not remove the workspace '{0}'. See the log for details.", workspace.name));
			return;
		}
		try {
			// Its sessions are listed by their folders from now on
			await sessionsManagementService.detachSessionsFromWorkspace([current.uri, ...current.previousUris ?? []]);
		} catch (error) {
			logService.error(error);
			notificationService.error(localize('removeWorkspace.detachFailed', "Removed the workspace '{0}', but some of its sessions could not be moved to their folders. See the log for details.", workspace.name));
		}
	}
});

/** A command on a workspace row of Group by Workspaces & Groups, whose context menu passes the row. */
abstract class SessionWorkspaceRowAction extends Action2 {
	/** The workspace of the row. */
	protected getRowWorkspace(section: ISessionSection | undefined): ISessionSectionWorkspace | undefined {
		return section?.workspace;
	}
}

registerAction2(class OpenWorkspaceRowInEditorWindowAction extends SessionWorkspaceRowAction {
	constructor() {
		super({
			id: 'sessionsView.openWorkspaceInEditorWindow',
			title: localize2('openWorkspaceInEditorWindow', "Open in Editor Window"),
			category: CHAT_CATEGORY,
			// An editor window opens a workspace on this computer
			precondition: ContextKeyExpr.and(SessionSectionWorkspaceKindContext.notEqualsTo(''), SessionSectionWorkspaceIsLocalContext),
			menu: [{ id: Menus.SessionSectionContext, group: 'navigation', order: 10, when: ContextKeyExpr.and(SESSION_WORKSPACE_EDITOR_WHEN, SessionSectionWorkspaceKindContext.notEqualsTo(''), SessionSectionWorkspaceIsLocalContext) }],
		});
	}

	override async run(accessor: ServicesAccessor, section?: ISessionSection): Promise<void> {
		const workspace = this.getRowWorkspace(section);
		if (!workspace || workspace.uri.scheme !== Schemas.file) {
			return;
		}
		const toOpen = hasWorkspaceFileExtension(workspace.uri) ? { workspaceUri: workspace.uri } : { folderUri: workspace.uri };
		await accessor.get(IHostService).openWindow([toOpen], { forceNewWindow: true });
	}
});

registerAction2(class EditWorkspaceRowAction extends SessionWorkspaceRowAction {
	constructor() {
		super({
			id: 'sessionsView.editWorkspace',
			title: localize2('editWorkspaceRow', "Edit Workspace..."),
			category: CHAT_CATEGORY,
			precondition: SessionSectionWorkspaceKindContext.isEqualTo('known'),
			menu: [{ id: Menus.SessionSectionContext, group: '4_manage', order: 1, when: ContextKeyExpr.and(SESSION_WORKSPACE_EDITOR_WHEN, SessionSectionWorkspaceKindContext.isEqualTo('known')) }],
		});
	}

	override run(accessor: ServicesAccessor, section?: ISessionSection): Promise<void> | undefined {
		const workspace = this.getRowWorkspace(section);
		return workspace ? accessor.get(ICommandService).executeCommand(EDIT_SESSION_WORKSPACE_COMMAND_ID, workspace.uri) : undefined;
	}
});

registerAction2(class RemoveWorkspaceRowAction extends SessionWorkspaceRowAction {
	constructor() {
		super({
			id: 'sessionsView.removeWorkspace',
			title: localize2('removeWorkspaceRow', "Remove Workspace..."),
			category: CHAT_CATEGORY,
			precondition: SessionSectionWorkspaceKindContext.isEqualTo('known'),
			// Destructive, so last
			menu: [{ id: Menus.SessionSectionContext, group: '4_manage', order: 100, when: ContextKeyExpr.and(SESSION_WORKSPACE_EDITOR_WHEN, SessionSectionWorkspaceKindContext.isEqualTo('known')) }],
		});
	}

	override run(accessor: ServicesAccessor, section?: ISessionSection): Promise<void> | undefined {
		const workspace = this.getRowWorkspace(section);
		return workspace ? accessor.get(ICommandService).executeCommand(REMOVE_SESSION_WORKSPACE_COMMAND_ID, workspace.uri) : undefined;
	}
});
