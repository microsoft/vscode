/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IFileService } from 'vs/platform/files/common/files';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceTrustManagementService } from 'vs/platform/workspace/common/workspaceTrust';
import { ICommonCellInfo } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { INotebookLoggingService } from 'vs/workbench/contrib/notebook/common/notebookLoggingService';
import { IScopedRendererMessaging } from 'vs/workbench/contrib/notebook/common/notebookRendererMessagingService';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { IWebviewService } from 'vs/workbench/contrib/webview/browser/webview';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IPathService } from 'vs/workbench/services/path/common/pathService';
import { BackLayerWebView, type BacklayerWebviewOptions, type INotebookDelegateForWebview } from 'vs/workbench/contrib/notebook/browser/view/renderers/backLayerWebView';

export class BackLayerWebViewPerCell<T extends ICommonCellInfo> extends BackLayerWebView<T> {

	constructor(
		notebookEditor: INotebookDelegateForWebview,
		id: string,
		notebookViewType: string,
		documentUri: URI,
		options: BacklayerWebviewOptions,
		rendererMessaging: IScopedRendererMessaging | undefined,
		@IWebviewService webviewService: IWebviewService,
		@IOpenerService openerService: IOpenerService,
		@INotebookService notebookService: INotebookService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IFileDialogService fileDialogService: IFileDialogService,
		@IFileService fileService: IFileService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkspaceTrustManagementService workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IConfigurationService configurationService: IConfigurationService,
		@ILanguageService languageService: ILanguageService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IStorageService storageService: IStorageService,
		@IPathService pathService: IPathService,
		@INotebookLoggingService notebookLogService: INotebookLoggingService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(notebookEditor, id, notebookViewType, documentUri,
			options, rendererMessaging, webviewService, openerService,
			notebookService, contextService, environmentService,
			fileDialogService, fileService, contextMenuService,
			contextKeyService, workspaceTrustManagementService,
			configurationService, languageService, workspaceContextService,
			editorGroupService, storageService, pathService, notebookLogService, themeService, telemetryService
		);
	}

}
