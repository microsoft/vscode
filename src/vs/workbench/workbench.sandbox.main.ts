/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


// #######################################################################
// ###                                                                 ###
// ### !!! PLEASE ADD COMMON IMPORTS INTO WORKBENCH.COMMON.MAIN.TS !!! ###
// ###                                                                 ###
// #######################################################################


//#region --- workbench services

import 'vs/workbench/services/workspaces/electron-sandbox/workspacesService';
import 'vs/workbench/services/userDataSync/electron-sandbox/storageKeysSyncRegistryService';
import 'vs/workbench/services/menubar/electron-sandbox/menubarService';
import 'vs/workbench/services/issue/electron-sandbox/issueService';

//#endregion


//#region --- workbench contributions

// Debug
import 'vs/workbench/contrib/debug/electron-sandbox/extensionHostDebugService';

//#endregion
