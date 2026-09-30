/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { AGENT_HOST_SCHEME } from '../../../../platform/agentHost/common/agentHostUri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IListService } from '../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IViewContainersRegistry, IViewsRegistry, ViewContainerLocation, Extensions as ViewContainerExtensions, WindowEnablement } from '../../../../workbench/common/views.js';
import { ExplorerView } from '../../../../workbench/contrib/files/browser/views/explorerView.js';
import { ViewPaneContainer } from '../../../../workbench/browser/parts/views/viewPaneContainer.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { IsSessionsWindowContext, ResourceContextKey, WorkspaceFolderCountContext } from '../../../../workbench/common/contextkeys.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../../workbench/common/editor.js';
import { resolveCommandsContext } from '../../../../workbench/browser/parts/editor/editorCommandsContext.js';
import { FileDownload } from '../../../../workbench/contrib/files/browser/fileImportExport.js';
import { IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { Menus } from '../../../browser/menus.js';
import { SESSIONS_FILES_EMPTY_VIEW_ID, SESSIONS_FILES_VIEW_ID, SessionsExplorerEmptyView, SessionsExplorerView } from './filesView.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { IsPhoneLayoutContext, IsQuickChatSessionContext, SessionHasWorkspaceContext, DesktopLayoutContext } from '../../../common/contextkeys.js';

export const SESSIONS_FILES_CONTAINER_ID = 'workbench.sessions.auxiliaryBar.filesContainer';

const filesViewIcon = registerIcon('sessions-files-view-icon', Codicon.files, localize2('sessionsFilesViewIcon', 'View icon of the files view in the sessions window.').value);

const viewContainerRegistry = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry);

// Files view container
const filesViewContainer = viewContainerRegistry.registerViewContainer({
	id: SESSIONS_FILES_CONTAINER_ID,
	title: localize2('files', "Files"),
	icon: filesViewIcon,
	order: 11,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [SESSIONS_FILES_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: SESSIONS_FILES_CONTAINER_ID,
	hideIfEmpty: true,
	openCommandActionDescriptor: {
		id: SESSIONS_FILES_CONTAINER_ID,
		title: localize2('explore', "Explorer"),
		mnemonicTitle: localize({ key: 'miFiles', comment: ['&& denotes a mnemonic'] }, "Fil&&es"),
		keybindings: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyE },
		order: 0
	},
	windowEnablement: WindowEnablement.Sessions,
}, ViewContainerLocation.AuxiliaryBar, { isDefault: true });

export class RegisterFilesViewContribution implements IWorkbenchContribution {

	static readonly ID = 'sessions.registerFilesView';

	constructor() {
		const viewsRegistry = Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry);

		// Re-register the explorer view inside the new Files container
		viewsRegistry.registerViews([{
			id: SESSIONS_FILES_VIEW_ID,
			name: localize2('files', "Files"),
			containerIcon: filesViewIcon,
			ctorDescriptor: new SyncDescriptor(SessionsExplorerView),
			canToggleVisibility: false,
			canMoveView: false,
			when: ContextKeyExpr.and(WorkspaceFolderCountContext.notEqualsTo('0'), IsPhoneLayoutContext.negate(), SessionHasWorkspaceContext),
			windowEnablement: WindowEnablement.Sessions,
		}], filesViewContainer);

		// Register an empty view to show when there are no workspace folders
		viewsRegistry.registerViews([{
			id: SESSIONS_FILES_EMPTY_VIEW_ID,
			name: localize2('files', "Files"),
			containerIcon: filesViewIcon,
			ctorDescriptor: new SyncDescriptor(SessionsExplorerEmptyView),
			canToggleVisibility: false,
			canMoveView: false,
			when: ContextKeyExpr.and(
				IsPhoneLayoutContext.negate(),
				ContextKeyExpr.or(
					ContextKeyExpr.and(WorkspaceFolderCountContext.isEqualTo('0'), SessionHasWorkspaceContext),
					ContextKeyExpr.and(DesktopLayoutContext, IsQuickChatSessionContext),
				),
			),
			windowEnablement: WindowEnablement.Sessions,
		}], filesViewContainer);
	}
}

registerWorkbenchContribution2(RegisterFilesViewContribution.ID, RegisterFilesViewContribution, WorkbenchPhase.BlockStartup);

export class DownloadRemoteFileAction extends Action2 {
	static readonly ID = 'sessions.files.action.downloadRemoteFile';

	constructor() {
		const precondition = ContextKeyExpr.and(
			IsSessionsWindowContext,
			ResourceContextKey.IsFileSystemResource,
			ContextKeyExpr.or(
				ResourceContextKey.Scheme.isEqualTo(AGENT_HOST_SCHEME),
				ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeRemote),
			),
		);
		super({
			id: DownloadRemoteFileAction.ID,
			title: localize2('downloadRemoteFile', "Download..."),
			icon: Codicon.cloudDownload,
			precondition,
			menu: [{
				id: Menus.SessionsEditorHeaderPrimary,
				group: '2_download',
				when: ContextKeyExpr.and(precondition, DesktopLayoutContext),
			}, {
				id: MenuId.EditorTitle,
				group: 'navigation',
				when: ContextKeyExpr.and(precondition, DesktopLayoutContext.negate()),
			}],
		});
	}

	async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const fileService = accessor.get(IFileService);
		const notificationService = accessor.get(INotificationService);
		const instantiationService = accessor.get(IInstantiationService);
		const context = resolveCommandsContext(args, editorService, accessor.get(IEditorGroupsService), accessor.get(IListService));
		const resources = context.groupedEditors
			.flatMap(group => group.editors)
			.map(editor => EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY }))
			.filter((resource): resource is URI => resource !== undefined && (resource.scheme === AGENT_HOST_SCHEME || resource.scheme === Schemas.vscodeRemote));

		try {
			const sources = await Promise.all(resources.map(resource => fileService.resolve(resource)));
			if (sources.length > 0) {
				await instantiationService.createInstance(FileDownload).download(sources);
			}
		} catch (error) {
			notificationService.error(error);
			throw error;
		}
	}
}

registerAction2(DownloadRemoteFileAction);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'sessions.files.action.collapseExplorerFolders',
			title: localize2('collapseExplorerFolders', "Collapse Folders in Explorer"),
			icon: Codicon.collapseAll,
			menu: {
				id: MenuId.ViewTitle,
				group: '1_files',
				order: 10,
				when: ContextKeyExpr.equals('view', SESSIONS_FILES_VIEW_ID),
			},
		});
	}

	run(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getViewWithId(SESSIONS_FILES_VIEW_ID);
		if (view !== null) {
			(view as ExplorerView).collapseAll();
		}
	}
});
