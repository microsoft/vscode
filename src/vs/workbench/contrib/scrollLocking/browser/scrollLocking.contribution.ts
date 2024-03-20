/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkbenchPhase, registerWorkbenchContribution2 } from 'vs/workbench/common/contributions';
import { SyncScroll as ScrollLocking } from 'vs/workbench/contrib/scrollLocking/browser/scrollLocking';

registerWorkbenchContribution2(
	ScrollLocking.ID,
	ScrollLocking,
	WorkbenchPhase.Eventually // registration only
);
