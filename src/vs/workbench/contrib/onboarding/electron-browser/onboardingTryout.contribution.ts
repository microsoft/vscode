/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { ipcRenderer } from '../../../../base/parts/sandbox/electron-browser/globals.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { IOnboardingTryoutHandoffService, IOnboardingTryoutWindowRequest, ONBOARDING_TRYOUT_CHANNEL, OnboardingTryoutWindowRequestResult } from '../../../../platform/onboarding/common/onboardingTryoutHandoff.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions, IWorkbenchContribution, IWorkbenchContributionsRegistry, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { NativeOnboardingTryoutWindow } from './onboardingTryoutWindow.js';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-browser/environmentService.js';
import { AGENTS_WINDOW_TRYOUT_PRESENTATION_KIND, onboardingTryoutPresentationRegistry } from '../common/onboardingTryout.js';

class NativeOnboardingTryoutHandoffService implements IOnboardingTryoutHandoffService {
	declare readonly _serviceBrand: undefined;
	private readonly proxy: IOnboardingTryoutHandoffService;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
		@INativeWorkbenchEnvironmentService environmentService: INativeWorkbenchEnvironmentService,
	) {
		this.proxy = ProxyChannel.toService(mainProcessService.getChannel(ONBOARDING_TRYOUT_CHANNEL), { context: environmentService.window.id });
	}

	open(request: IOnboardingTryoutWindowRequest): Promise<OnboardingTryoutWindowRequestResult> {
		return this.proxy.open(request);
	}

	cancel(requestId: string): Promise<void> {
		return this.proxy.cancel(requestId);
	}

	complete(requestId: string, result: OnboardingTryoutWindowRequestResult): Promise<void> {
		return this.proxy.complete(requestId, result);
	}
}

registerSingleton(IOnboardingTryoutHandoffService, NativeOnboardingTryoutHandoffService, InstantiationType.Delayed);

export class NativeOnboardingTryoutContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.nativeOnboardingTryout';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@INativeWorkbenchEnvironmentService environmentService: INativeWorkbenchEnvironmentService,
	) {
		super();

		const coordinator = new Lazy(() => this._register(instantiationService.createInstance(
			NativeOnboardingTryoutWindow,
			Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench).whenRestored,
		)));
		this._register(onboardingTryoutPresentationRegistry.register({
			kind: AGENTS_WINDOW_TRYOUT_PRESENTATION_KIND,
			getAvailability: () => ({ kind: 'ready' }),
			prepare: async (scenario, context) => ({
				kind: 'ready',
				run: async () => {
					await coordinator.value.open(scenario.id, context.token, context.options);
					return { kind: 'routed' };
				},
			}),
		}));
		if (environmentService.isSessionsWindow) {
			this._register(Event.fromNodeEventEmitter<readonly unknown[]>(ipcRenderer, 'vscode:runOnboardingTryout', (_: unknown, ...args: unknown[]) => args)(
				args => coordinator.value.startRequest(args)));
			this._register(Event.fromNodeEventEmitter<readonly unknown[]>(ipcRenderer, 'vscode:cancelOnboardingTryout', (_: unknown, ...args: unknown[]) => args)(
				args => coordinator.rawValue?.cancelRequest(args)));
		}
	}
}

registerWorkbenchContribution2(NativeOnboardingTryoutContribution.ID, NativeOnboardingTryoutContribution, WorkbenchPhase.BlockStartup);
