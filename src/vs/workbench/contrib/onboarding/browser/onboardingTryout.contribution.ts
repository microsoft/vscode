/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { createMarkdownCommandLink } from '../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IOnboardingTryoutService, onboardingTryoutPresentationRegistry, parseOnboardingTryoutArguments, registerOnboardingTryoutPresentation, RUN_ONBOARDING_TRYOUT_COMMAND_ID } from '../common/onboardingTryout.js';
import { GuidedTryoutPresentation } from './guidedTryoutPresentation.js';
import { EditorSampleTryoutPresentation } from './onboardingSamplePresentation.js';
import { CommandTryoutPresentation, ViewTryoutPresentation } from './onboardingTryoutActions.js';
import { OnboardingTryoutService } from './onboardingTryoutService.js';
import { runOnboardingTryout } from './onboardingTryoutRunner.js';
import './onboardingTryoutUrlHandler.js';

registerSingleton(IOnboardingTryoutService, OnboardingTryoutService, InstantiationType.Delayed);

class OnboardingTryoutContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.onboardingTryouts';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._register(registerOnboardingTryoutPresentation(instantiationService.createInstance(CommandTryoutPresentation)));
		this._register(registerOnboardingTryoutPresentation(instantiationService.createInstance(ViewTryoutPresentation)));
		this._register(onboardingTryoutPresentationRegistry.register(this._register(new GuidedTryoutPresentation())));
		const samples = this._register(instantiationService.createInstance(EditorSampleTryoutPresentation));
		this._register(registerOnboardingTryoutPresentation(samples));
	}
}

registerWorkbenchContribution2(OnboardingTryoutContribution.ID, OnboardingTryoutContribution, WorkbenchPhase.BlockRestore);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: RUN_ONBOARDING_TRYOUT_COMMAND_ID,
			title: localize2('onboarding.tryout.run', "Try Feature Example"),
		});
	}

	async run(accessor: ServicesAccessor, ...args: unknown[]) {
		const tryoutService = accessor.get(IOnboardingTryoutService);
		const commandService = accessor.get(ICommandService);
		const notificationService = accessor.get(INotificationService);
		const logService = accessor.get(ILogService);
		return runOnboardingTryout(
			parseOnboardingTryoutArguments(args),
			CancellationToken.None,
			tryoutService,
			commandService,
			notificationService,
			logService,
		);
	}
});

async function pickTryout(accessor: ServicesAccessor): Promise<string | undefined> {
	const tryoutService = accessor.get(IOnboardingTryoutService);
	const quickInputService = accessor.get(IQuickInputService);
	const items = tryoutService.getTryouts().flatMap(scenario => {
		const availability = tryoutService.getAvailability(scenario.id);
		return availability.kind === 'hidden' ? [] : [{
			id: scenario.id,
			label: scenario.tryout.title,
			description: scenario.id,
			detail: availability.kind === 'unavailable' ? availability.message : scenario.tryout.description,
		}];
	});
	const picked = await quickInputService.pick(items, {
		placeHolder: localize('onboarding.tryout.pick', "Select a feature example"),
		matchOnDescription: true,
	});
	return picked?.id;
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'developer.onboarding.copyTryoutLink',
			title: localize2('onboarding.tryout.copyLink', "Copy Feature Example Link"),
			category: Categories.Developer,
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const tryoutService = accessor.get(IOnboardingTryoutService);
		const clipboardService = accessor.get(IClipboardService);
		const id = await pickTryout(accessor);
		const scenario = id && tryoutService.getTryout(id);
		if (scenario) {
			await clipboardService.writeText(createMarkdownCommandLink({
				id: RUN_ONBOARDING_TRYOUT_COMMAND_ID,
				arguments: [scenario.id],
				text: scenario.tryout.title,
				tooltip: scenario.tryout.description,
			}));
		}
	}
});
