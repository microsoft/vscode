/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/explorerviewlet';
import { localize } from 'vs/nls';
import { mark } from 'vs/base/common/performance';
import { VIEWLET_ID, VIEW_ID, IFilesConfiguration, ExplorerViewletVisibleContext } from 'vs/workbench/contrib/files/common/files';
import { IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ExplorerView } from 'vs/workbench/contrib/files/browser/views/explorerView';
import { EmptyView } from 'vs/workbench/contrib/files/browser/views/emptyView';
import { OpenEditorsView } from 'vs/workbench/contrib/files/browser/views/openEditorsView';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IContextKeyService, IContextKey, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IViewsRegistry, IViewDescriptor, Extensions, ViewContainer, IViewContainersRegistry, ViewContainerLocation, IViewDescriptorService, ViewContentGroups } from 'vs/workbench/common/views';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { ViewPaneContainer } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { KeyChord, KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { Registry } from 'vs/platform/registry/common/platform';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { WorkbenchStateContext, RemoteNameContext, OpenFolderWorkspaceSupportContext } from 'vs/workbench/common/contextkeys';
import { IsWebContext } from 'vs/platform/contextkey/common/contextkeys';
import { AddRootFolderAction, OpenFolderAction, OpenFileFolderAction, OpenFolderViaWorkspaceAction } from 'vs/workbench/browser/actions/workspaceActions';
import { OpenRecentAction } from 'vs/workbench/browser/actions/windowActions';
import { isMacintosh, isWeb } from 'vs/base/common/platform';
import { Codicon } from 'vs/base/common/codicons';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';

const explorerViewIcon = registerIcon('explorer-view-icon', Codicon.files, localize('explorerViewIcon', 'View icon of the explorer view.'));
const openEditorsViewIcon = registerIcon('open-editors-view-icon', Codicon.book, localize('openEditorsIcon', 'View icon of the open editors view.'));

export class ExplorerViewletViewsContribution extends Disposable implements IWorkbenchContribution {

	constructor(
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IProgressService progressService: IProgressService
	) {
		super();

		progressService.withProgress({ location: ProgressLocation.Explorer }, () => workspaceContextService.getCompleteWorkspace()).finally(() => {
			this.registerViews();

			this._register(workspaceContextService.onDidChangeWorkbenchState(() => this.registerViews()));
			this._register(workspaceContextService.onDidChangeWorkspaceFolders(() => this.registerViews()));
		});
	}

	private registerViews(): void {
		mark('code/willRegisterExplorerViews');

		const viewDescriptors = viewsRegistry.getViews(VIEW_CONTAINER);

		const viewDescriptorsToRegister: IViewDescriptor[] = [];
		const viewDescriptorsToDeregister: IViewDescriptor[] = [];

		const openEditorsViewDescriptor = this.createOpenEditorsViewDescriptor();
		if (!viewDescriptors.some(v => v.id === openEditorsViewDescriptor.id)) {
			viewDescriptorsToRegister.push(openEditorsViewDescriptor);
		}

		const explorerViewDescriptor = this.createExplorerViewDescriptor();
		const registeredExplorerViewDescriptor = viewDescriptors.find(v => v.id === explorerViewDescriptor.id);
		const emptyViewDescriptor = this.createEmptyViewDescriptor();
		const registeredEmptyViewDescriptor = viewDescriptors.find(v => v.id === emptyViewDescriptor.id);

		if (this.workspaceContextService.getWorkbenchState() === WorkbenchState.EMPTY || this.workspaceContextService.getWorkspace().folders.length === 0) {
			if (registeredExplorerViewDescriptor) {
				viewDescriptorsToDeregister.push(registeredExplorerViewDescriptor);
			}
			if (!registeredEmptyViewDescriptor) {
				viewDescriptorsToRegister.push(emptyViewDescriptor);
			}
		} else {
			if (registeredEmptyViewDescriptor) {
				viewDescriptorsToDeregister.push(registeredEmptyViewDescriptor);
			}
			if (!registeredExplorerViewDescriptor) {
				viewDescriptorsToRegister.push(explorerViewDescriptor);
			}
		}

		if (viewDescriptorsToRegister.length) {
			viewsRegistry.registerViews(viewDescriptorsToRegister, VIEW_CONTAINER);
		}
		if (viewDescriptorsToDeregister.length) {
			viewsRegistry.deregisterViews(viewDescriptorsToDeregister, VIEW_CONTAINER);
		}

		mark('code/didRegisterExplorerViews');
	}

	private createOpenEditorsViewDescriptor(): IViewDescriptor {
		return {
			id: OpenEditorsView.ID,
			name: OpenEditorsView.NAME,
			ctorDescriptor: new SyncDescriptor(OpenEditorsView),
			containerIcon: openEditorsViewIcon,
			order: 0,
			canToggleVisibility: true,
			canMoveView: true,
			collapsed: false,
			hideByDefault: true,
			focusCommand: {
				id: 'workbench.files.action.focusOpenEditorsView',
				keybindings: { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyE) }
			}
		};
	}

	private createEmptyViewDescriptor(): IViewDescriptor {
		return {
			id: EmptyView.ID,
			name: EmptyView.NAME,
			containerIcon: explorerViewIcon,
			ctorDescriptor: new SyncDescriptor(EmptyView),
			order: 1,
			canToggleVisibility: true,
			focusCommand: {
				id: 'workbench.explorer.fileView.focus'
			}
		};
	}

	private createExplorerViewDescriptor(): IViewDescriptor {
		return {
			id: VIEW_ID,
			name: localize('folders', "Folders"),
			containerIcon: explorerViewIcon,
			ctorDescriptor: new SyncDescriptor(ExplorerView),
			order: 1,
			canMoveView: true,
			canToggleVisibility: false,
			focusCommand: {
				id: 'workbench.explorer.fileView.focus'
			}
		};
	}
}

export class ExplorerViewPaneContainer extends ViewPaneContainer {

	private viewletVisibleContextKey: IContextKey<boolean>;

	constructor(
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IExtensionService extensionService: IExtensionService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService
	) {

		super(VIEWLET_ID, { mergeViewWithContainerWhenSingleView: true }, instantiationService, configurationService, layoutService, contextMenuService, telemetryService, extensionService, themeService, storageService, contextService, viewDescriptorService);

		this.viewletVisibleContextKey = ExplorerViewletVisibleContext.bindTo(contextKeyService);
		this._register(this.contextService.onDidChangeWorkspaceName(e => this.updateTitleArea()));
	}

	override create(parent: HTMLElement): void {
		super.create(parent);
		parent.classList.add('explorer-viewlet');
	}

	protected override createView(viewDescriptor: IViewDescriptor, options: IViewletViewOptions): ViewPane {
		if (viewDescriptor.id === VIEW_ID) {
			return this.instantiationService.createInstance(ExplorerView, {
				...options, delegate: {
					willOpenElement: e => {
						if (!(e instanceof MouseEvent)) {
							return; // only delay when user clicks
						}

						const openEditorsView = this.getOpenEditorsView();
						if (openEditorsView) {
							let delay = 0;

							const config = this.configurationService.getValue<IFilesConfiguration>();
							if (!!config.workbench?.editor?.enablePreview) {
								// delay open editors view when preview is enabled
								// to accomodate for the user doing a double click
								// to pin the editor.
								// without this delay a double click would be not
								// possible because the next element would move
								// under the mouse after the first click.
								delay = 250;
							}

							openEditorsView.setStructuralRefreshDelay(delay);
						}
					},
					didOpenElement: e => {
						if (!(e instanceof MouseEvent)) {
							return; // only delay when user clicks
						}

						const openEditorsView = this.getOpenEditorsView();
						openEditorsView?.setStructuralRefreshDelay(0);
					}
				}
			});
		}
		return super.createView(viewDescriptor, options);
	}

	getExplorerView(): ExplorerView {
		return <ExplorerView>this.getView(VIEW_ID);
	}

	getOpenEditorsView(): OpenEditorsView {
		return <OpenEditorsView>this.getView(OpenEditorsView.ID);
	}

	override setVisible(visible: boolean): void {
		this.viewletVisibleContextKey.set(visible);
		super.setVisible(visible);
	}

	override focus(): void {
		const explorerView = this.getView(VIEW_ID);
		if (explorerView && this.panes.every(p => !p.isExpanded())) {
			explorerView.setExpanded(true);
		}
		if (explorerView?.isExpanded()) {
			explorerView.focus();
		} else {
			super.focus();
		}
	}
}

const viewContainerRegistry = Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry);

/**
 * Explorer viewlet container.
 */
export const VIEW_CONTAINER: ViewContainer = viewContainerRegistry.registerViewContainer({
	id: VIEWLET_ID,
	title: { value: localize('explore', "Explorer"), original: 'Explorer' },
	ctorDescriptor: new SyncDescriptor(ExplorerViewPaneContainer),
	storageId: 'workbench.explorer.views.state',
	icon: explorerViewIcon,
	alwaysUseContainerInfo: true,
	hideIfEmpty: true,
	order: 0,
	openCommandActionDescriptor: {
		id: VIEWLET_ID,
		title: { value: localize('explore', "Explorer"), original: 'Explorer' },
		mnemonicTitle: localize({ key: 'miViewExplorer', comment: ['&& denotes a mnemonic'] }, "&&Explorer"),
		keybindings: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyE },
		order: 0
	},
}, ViewContainerLocation.Sidebar, { isDefault: true });

const openFolder = localize('openFolder', "Open Folder");
const addAFolder = localize('addAFolder', "add a folder");
const openRecent = localize('openRecent', "Open Recent");

const addRootFolderButton = `[${openFolder}](command:${AddRootFolderAction.ID})`;
const addAFolderButton = `[${addAFolder}](command:${AddRootFolderAction.ID})`;
const openFolderButton = `[${openFolder}](command:${(isMacintosh && !isWeb) ? OpenFileFolderAction.ID : OpenFolderAction.ID})`;
const openFolderViaWorkspaceButton = `[${openFolder}](command:${OpenFolderViaWorkspaceAction.ID})`;
const openRecentButton = `[${openRecent}](command:${OpenRecentAction.ID})`;

const viewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);
viewsRegistry.registerViewWelcomeContent(EmptyView.ID, {
	content: localize({ key: 'noWorkspaceHelp', comment: ['Please do not translate the word "commmand", it is part of our internal syntax which must not change'] },
		"You have not yet added a folder to the workspace.\n{0}", addRootFolderButton),
	when: ContextKeyExpr.and(
		// inside a .code-workspace
		WorkbenchStateContext.isEqualTo('workspace'),
		// unless we cannot enter or open workspaces (e.g. web serverless)
		OpenFolderWorkspaceSupportContext
	),
	group: ViewContentGroups.Open,
	order: 1
});

viewsRegistry.registerViewWelcomeContent(EmptyView.ID, {
	content: localize({ key: 'noFolderHelpWeb', comment: ['Please do not translate the word "commmand", it is part of our internal syntax which must not change'] },
		"You have not yet opened a folder.\n{0}\n{1}", openFolderViaWorkspaceButton, openRecentButton),
	when: ContextKeyExpr.and(
		// inside a .code-workspace
		WorkbenchStateContext.isEqualTo('workspace'),
		// we cannot enter workspaces (e.g. web serverless)
		OpenFolderWorkspaceSupportContext.toNegated()
	),
	group: ViewContentGroups.Open,
	order: 1
});

viewsRegistry.registerViewWelcomeContent(EmptyView.ID, {
	content: localize({ key: 'remoteNoFolderHelp', comment: ['Please do not translate the word "commmand", it is part of our internal syntax which must not change'] },
		"Connected to remote.\n{0}", openFolderButton),
	when: ContextKeyExpr.and(
		// not inside a .code-workspace
		WorkbenchStateContext.notEqualsTo('workspace'),
		// connected to a remote
		RemoteNameContext.notEqualsTo(''),
		// but not in web
		IsWebContext.toNegated()),
	group: ViewContentGroups.Open,
	order: 1
});

viewsRegistry.registerViewWelcomeContent(EmptyView.ID, {
	content: localize({ key: 'noFolderButEditorsHelp', comment: ['Please do not translate the word "commmand", it is part of our internal syntax which must not change'] },
		"You have not yet opened a folder.\n{0}\nOpening a folder will close all currently open editors. To keep them open, {1} instead.", openFolderButton, addAFolderButton),
	when: ContextKeyExpr.and(
		// editors are opened
		ContextKeyExpr.has('editorIsOpen'),
		ContextKeyExpr.or(
			// not inside a .code-workspace and local
			ContextKeyExpr.and(WorkbenchStateContext.notEqualsTo('workspace'), RemoteNameContext.isEqualTo('')),
			// not inside a .code-workspace and web
			ContextKeyExpr.and(WorkbenchStateContext.notEqualsTo('workspace'), IsWebContext)
		)
	),
	group: ViewContentGroups.Open,
	order: 1
});

viewsRegistry.registerViewWelcomeContent(EmptyView.ID, {
	content: localize({ key: 'noFolderHelp', comment: ['Please do not translate the word "commmand", it is part of our internal syntax which must not change'] },
		"You have not yet opened a folder.\n{0}", openFolderButton),
	when: ContextKeyExpr.and(
		// no editor is open
		ContextKeyExpr.has('editorIsOpen')?.negate(),
		ContextKeyExpr.or(
			// not inside a .code-workspace and local
			ContextKeyExpr.and(WorkbenchStateContext.notEqualsTo('workspace'), RemoteNameContext.isEqualTo('')),
			// not inside a .code-workspace and web
			ContextKeyExpr.and(WorkbenchStateContext.notEqualsTo('workspace'), IsWebContext)
		)
	),
	group: ViewContentGroups.Open,
	order: 1
});
