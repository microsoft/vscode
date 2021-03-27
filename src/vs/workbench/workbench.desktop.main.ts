/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


// #######################################################################
// ###                                                                 ###
// ### !!! PLEASE ADD COMMON IMPORTS INTO WORKBENCH.COMMON.MAIN.TS !!! ###
// ###                                                                 ###
// #######################################################################


//#region --- workbench common

import 'vs/workbench/workbench.common.main';

//#endregion


//#region --- workbench (desktop main)

import 'vs/workbench/electron-browser/desktop.contribution';
import 'vs/workbench/electron-browser/desktop.main';

//#endregion


//#region --- workbench services
import 'vs/workbench/services/dialogs/electron-browser/fileDialogService';
import 'vs/workbench/services/integrity/node/integrityService';
import 'vs/workbench/services/textMate/electron-browser/textMateService';
import 'vs/workbench/services/search/node/searchService';
import 'vs/workbench/services/output/electron-browser/outputChannelModelService';
import 'vs/workbench/services/textfile/electron-browser/nativeTextFileService';
import 'vs/workbench/services/dialogs/electron-browser/dialogService';
import 'vs/workbench/services/keybinding/electron-browser/nativeKeymapService';
import 'vs/workbench/services/keybinding/electron-browser/keybinding.contribution';
import 'vs/workbench/services/extensions/electron-browser/extensionService';
import 'vs/workbench/services/contextmenu/electron-browser/contextmenuService';
import 'vs/workbench/services/extensionManagement/electron-browser/extensionManagementServerService';
import 'vs/workbench/services/remote/electron-browser/remoteAgentServiceImpl';
import 'vs/workbench/services/telemetry/electron-browser/telemetryService';
import 'vs/workbench/services/configurationResolver/electron-browser/configurationResolverService';
import 'vs/workbench/services/extensionManagement/node/extensionManagementService';
import 'vs/workbench/services/accessibility/node/accessibilityService';
import 'vs/workbench/services/remote/node/tunnelService';
import 'vs/workbench/services/backup/node/backupFileService';
import 'vs/workbench/services/url/electron-browser/urlService';
import 'vs/workbench/services/workspaces/electron-browser/workspacesService';
import 'vs/workbench/services/workspaces/electron-browser/workspaceEditingService';
import 'vs/workbench/services/userDataSync/electron-browser/userDataSyncService';
import 'vs/workbench/services/authToken/electron-browser/authTokenService';
import 'vs/workbench/services/host/electron-browser/desktopHostService';
import 'vs/workbench/services/request/electron-browser/requestService';
import 'vs/workbench/services/lifecycle/electron-browser/lifecycleService';
import 'vs/workbench/services/sharedProcess/electron-browser/sharedProcessService';
import 'vs/workbench/services/electron/electron-browser/electronService';
import 'vs/workbench/services/localizations/electron-browser/localizationsService';
import 'vs/workbench/services/clipboard/electron-browser/clipboardService';
import 'vs/workbench/services/update/electron-browser/updateService';
import 'vs/workbench/services/issue/electron-browser/issueService';
import 'vs/workbench/services/menubar/electron-browser/menubarService';
import 'vs/workbench/services/extensionResourceLoader/electron-browser/extensionResourceLoaderService';

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ICredentialsService } from 'vs/platform/credentials/common/credentials';
import { KeytarCredentialsService } from 'vs/platform/credentials/node/credentialsService';

registerSingleton(ICredentialsService, KeytarCredentialsService, true);

//#endregion


//#region --- workbench contributions

// Localizations
import 'vs/workbench/contrib/localizations/browser/localizations.contribution';

// Logs
import 'vs/workbench/contrib/logs/electron-browser/logs.contribution';

// Tags
import 'vs/workbench/contrib/tags/electron-browser/workspaceTagsService';
import 'vs/workbench/contrib/tags/electron-browser/tags.contribution';

// Rapid Render Splash
import 'vs/workbench/contrib/splash/electron-browser/partsSplash.contribution';

// Explorer
import 'vs/workbench/contrib/files/electron-browser/files.contribution';
import 'vs/workbench/contrib/files/electron-browser/fileActions.contribution';

// Debug
import 'vs/workbench/contrib/debug/node/debugHelperService';
import 'vs/workbench/contrib/debug/electron-browser/extensionHostDebugService';

// Webview
import 'vs/workbench/contrib/webview/electron-browser/webview.contribution';

// Extensions Management
import 'vs/workbench/contrib/extensions/electron-browser/extensions.contribution';

// Terminal
import 'vs/workbench/contrib/terminal/electron-browser/terminal.contribution';

// Remote
import 'vs/workbench/contrib/remote/electron-browser/remote.contribution';

// CodeEditor Contributions
import 'vs/workbench/contrib/codeEditor/electron-browser/codeEditor.contribution';

// Execution
import 'vs/workbench/contrib/externalTerminal/node/externalTerminalService';

// Performance
import 'vs/workbench/contrib/performance/electron-browser/performance.contribution';

// CLI
import 'vs/workbench/contrib/cli/node/cli.contribution';

// Themes Support
import 'vs/workbench/contrib/themes/test/electron-browser/themes.test.contribution';

// Issues
import 'vs/workbench/contrib/issue/electron-browser/issue.contribution';

// Tasks
import 'vs/workbench/contrib/tasks/electron-browser/taskService';

// User Data Sync
import 'vs/workbench/contrib/userDataSync/electron-browser/userDataSync.contribution';

// Telemetry Opt Out
import 'vs/workbench/contrib/welcome/telemetryOptOut/electron-browser/telemetryOptOut.contribution';

// Configuration Exporter
import 'vs/workbench/contrib/configExporter/node/configurationExportHelper.contribution';

//#endregion
