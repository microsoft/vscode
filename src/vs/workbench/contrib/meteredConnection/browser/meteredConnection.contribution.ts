/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { MeteredConnectionStatusContribution } from './meteredConnectionStatus.js';

import '../../../../platform/meteredConnection/common/meteredConnection.config.contribution.js';

registerWorkbenchContribution2(MeteredConnectionStatusContribution.ID, MeteredConnectionStatusContribution, WorkbenchPhase.AfterRestored);
