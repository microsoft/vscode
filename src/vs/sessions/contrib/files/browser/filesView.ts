/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/filesView.css';
import * as dom from '../../../../base/browser/dom.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IViewPaneLocationColors, IViewPaneOptions, ViewPane } from '../../../../workbench/browser/parts/views/viewPane.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { agentsPanelBackground } from '../../../common/theme.js';
import { ExplorerView, IExplorerViewPaneOptions } from '../../../../workbench/contrib/files/browser/views/explorerView.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder, IWorkspaceFoldersChangeEvent, IWorkspaceFoldersWillChangeEvent, IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IEditorResolverService } from '../../../../workbench/services/editor/common/editorResolverService.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IWorkbenchThemeService } from '../../../../workbench/services/themes/common/workbenchThemeService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IExplorerService } from '../../../../workbench/contrib/files/browser/files.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { localize } from '../../../../nls.js';
import { URI } from '../../../../base/common/uri.js';
import { Event } from '../../../../base/common/event.js';
import { NEW_FILE_TAB_COMMAND_ID } from '../../../common/sessionCommands.js';

const $ = dom.$;

export const SESSIONS_FILES_EMPTY_VIEW_ID = 'sessions.files.explorer.empty';

export class SessionsExplorerView extends ExplorerView {
	override async selectResource(resource: URI | undefined, reveal = this.autoReveal, retry = 0): Promise<void> {
		if (resource && reveal === 'force' && retry === 0) {
			await this.commandService.executeCommand(NEW_FILE_TAB_COMMAND_ID);
			if (!this.isBodyVisible()) {
				await Event.toPromise(Event.filter(this.onDidChangeBodyVisibility, () => this.isBodyVisible()));
			}
		}
		await super.selectResource(resource, reveal, retry);
	}

	protected override get primaryActionGroups(): string[] | undefined {
		return ['1_files'];
	}

	protected override getLocationBasedColors(): IViewPaneLocationColors {
		const colors = super.getLocationBasedColors();
		return {
			...colors,
			background: agentsPanelBackground,
			listOverrideStyles: {
				...colors.listOverrideStyles,
				listBackground: agentsPanelBackground,
			}
		};
	}
}

/**
 * Reports a workspace with a single root folder as a single folder workbench, so the
 * Explorer view lists the contents of that folder instead of the folder itself.
 */
export class SingleRootWorkspaceContextService implements IWorkspaceContextService {

	declare readonly _serviceBrand: undefined;

	constructor(private readonly contextService: IWorkspaceContextService) { }

	get onDidChangeWorkbenchState(): Event<WorkbenchState> { return this.contextService.onDidChangeWorkbenchState; }
	get onDidChangeWorkspaceName(): Event<void> { return this.contextService.onDidChangeWorkspaceName; }
	get onWillChangeWorkspaceFolders(): Event<IWorkspaceFoldersWillChangeEvent> { return this.contextService.onWillChangeWorkspaceFolders; }
	get onDidChangeWorkspaceFolders(): Event<IWorkspaceFoldersChangeEvent> { return this.contextService.onDidChangeWorkspaceFolders; }

	getWorkbenchState(): WorkbenchState {
		const state = this.contextService.getWorkbenchState();
		return state === WorkbenchState.WORKSPACE && this.contextService.getWorkspace().folders.length === 1 ? WorkbenchState.FOLDER : state;
	}

	getCompleteWorkspace(): Promise<IWorkspace> { return this.contextService.getCompleteWorkspace(); }
	getWorkspace(): IWorkspace { return this.contextService.getWorkspace(); }
	getWorkspaceFolder(resource: URI): IWorkspaceFolder | null { return this.contextService.getWorkspaceFolder(resource); }
	isCurrentWorkspace(workspaceIdOrFolder: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | URI): boolean { return this.contextService.isCurrentWorkspace(workspaceIdOrFolder); }
	isInsideWorkspace(resource: URI): boolean { return this.contextService.isInsideWorkspace(resource); }
	hasWorkspaceData(): boolean { return this.contextService.hasWorkspaceData(); }
}

/**
 * Files view for the editor header layout, where the editor header breadcrumbs show a single
 * root folder, so the tree lists its contents directly. The Agents window is always a multi-root
 * workbench, so only the view itself sees a single root folder as a single folder workbench;
 * everything it creates, such as the tree and its renderers, uses the actual workspace.
 */
export class SessionsSingleRootExplorerView extends SessionsExplorerView {

	constructor(
		options: IExplorerViewPaneOptions,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IProgressService progressService: IProgressService,
		@IEditorService editorService: IEditorService,
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@ILabelService labelService: ILabelService,
		@IThemeService themeService: IWorkbenchThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IHoverService hoverService: IHoverService,
		@IExplorerService explorerService: IExplorerService,
		@IStorageService storageService: IStorageService,
		@IClipboardService clipboardService: IClipboardService,
		@IFileService fileService: IFileService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@ICommandService commandService: ICommandService,
		@IOpenerService openerService: IOpenerService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		super(options, contextMenuService, viewDescriptorService, instantiationService, new SingleRootWorkspaceContextService(contextService), progressService, editorService, editorResolverService, layoutService, keybindingService, contextKeyService, configurationService, labelService, themeService, telemetryService, hoverService, explorerService, storageService, clipboardService, fileService, uriIdentityService, commandService, openerService, accessibilityService, environmentService);
	}
}

export class SessionsExplorerEmptyView extends ViewPane {
	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		const bodyContainer = dom.append(container, $('.files-empty-view-body'));
		const welcomeContainer = dom.append(bodyContainer, $('.files-empty-welcome'));

		const welcomeMessage = dom.append(welcomeContainer, $('.files-empty-welcome-message'));
		welcomeMessage.textContent = localize('filesView.noFiles', "Folders and files will appear here.");
	}
}
