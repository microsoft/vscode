/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


// #######################################################################
// ###                                                                 ###
// ### !!! PLEASE ADD COMMON IMPORTS INTO WORKBENCH.COMMON.MAIN.TS !!! ###
// ###                                                                 ###
// #######################################################################


//#region --- workbench common & sandbox

import 'vs/workbench/workbench.sandbox.main';

//#endregion


//#region --- workbench actions


//#endregion


//#region --- workbench (desktop main)

import 'vs/workbench/electron-sandbox/desktop.main';

//#endregion


//#region --- workbench services

import { IExtensionService, NullExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

// TODO@bpasero sandbox: remove me when extension host is present
class SimpleExtensionService extends NullExtensionService { }

registerSingleton(IExtensionService, SimpleExtensionService);


//#endregion


//#region --- workbench contributions

//#endregion
