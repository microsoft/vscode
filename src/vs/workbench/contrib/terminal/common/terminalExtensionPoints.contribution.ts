/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ITerminalContributionService, TerminalContributionService } from './terminalExtensionPoints.js';

registerSingleton(ITerminalContributionService, TerminalContributionService, InstantiationType.Delayed);
