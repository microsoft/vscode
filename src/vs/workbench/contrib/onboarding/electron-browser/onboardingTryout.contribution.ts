/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ipcRenderer } from '../../../../base/parts/sandbox/electron-browser/globals.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions, IWorkbenchContribution, IWorkbenchContributionsRegistry, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { NativeOnboardingTryoutWindow } from './onboardingTryoutWindow.js';

class NativeOnboardingTryoutContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.nativeOnboardingTryout';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._register(instantiationService.createInstance(
			NativeOnboardingTryoutWindow,
			Event.fromNodeEventEmitter<readonly unknown[]>(ipcRenderer, 'vscode:runOnboardingTryout', (_: unknown, ...args: unknown[]) => args),
			Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench).whenRestored,
		));
	}
}

registerWorkbenchContribution2(NativeOnboardingTryoutContribution.ID, NativeOnboardingTryoutContribution, WorkbenchPhase.BlockStartup);
