/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkbenchPhase, registerWorkbenchContribution2 } from 'vs/workbench/common/contributions';
import { SyncScroll } from 'vs/workbench/contrib/scrollLocking/browser/syncScroll';

registerWorkbenchContribution2(
	SyncScroll.ID,
	SyncScroll,
	WorkbenchPhase.Eventually // registration only
);
