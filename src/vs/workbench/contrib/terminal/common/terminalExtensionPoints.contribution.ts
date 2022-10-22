/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ITerminalContributionService, TerminalContributionService } from 'vs/workbench/contrib/terminal/common/terminalExtensionPoints';

registerSingleton(ITerminalContributionService, TerminalContributionService, InstantiationType.Delayed);
