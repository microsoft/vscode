/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionContext } from 'vscode';
import { IInstantiationServiceBuilder } from '../../../util/common/services';
import { registerServices as registerCommonServices } from '../vscode/services';

// ###########################################################################################
// ###                                                                                     ###
// ###               Web services that run ONLY in web worker extension host.              ###
// ###                                                                                     ###
// ###  !!! Prefer to list services in ../vscode/services.ts to support them anywhere !!!  ###
// ###                                                                                     ###
// ###########################################################################################

export function registerServices(builder: IInstantiationServiceBuilder, extensionContext: ExtensionContext): void {
	registerCommonServices(builder, extensionContext);
}