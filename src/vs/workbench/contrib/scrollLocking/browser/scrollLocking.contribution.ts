/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { SyncScroll as ScrollLocking } from './scrollLocking.js';

registerWorkbenchContribution2(
	ScrollLocking.ID,
	ScrollLocking,
	WorkbenchPhase.Eventually // registration only
);
