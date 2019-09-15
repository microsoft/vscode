/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as platform from 'vs/base/common/platform';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Win3264BitContribution } from 'vs/workbench/contrib/update/electron-browser/update';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';

const workbench = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);

if (platform.isWindows) {
	if (process.arch === 'ia32') {
		workbench.registerWorkbenchContribution(Win3264BitContribution, LifecyclePhase.Restored);
	}
}
