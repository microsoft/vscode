/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IWindowTitleVariableService, registerWindowTitleVariable, WindowTitleVariableService } from 'vs/workbench/contrib/windowTitle/browser/windowTitleVariableService';

registerSingleton(IWindowTitleVariableService, WindowTitleVariableService, InstantiationType.Delayed);

CommandsRegistry.registerCommand('registerWindowTitleVariable', registerWindowTitleVariable);
