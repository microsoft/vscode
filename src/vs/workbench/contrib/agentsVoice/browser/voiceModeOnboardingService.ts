/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toDisposable, type IDisposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { buildFeatureCopilotChat } from '../../../../platform/product/common/buildFeatures.js';
import type { IChatInputOnboardingHostOptions } from '../../chat/browser/widget/input/chatInputOnboarding.js';

export const IVoiceModeOnboardingService = createDecorator<IVoiceModeOnboardingService>('voiceModeOnboardingService');

export interface IVoiceModeOnboardingService {
	readonly _serviceBrand: undefined;
	readonly isVisible: boolean;
	registerHost(options: IChatInputOnboardingHostOptions): IDisposable;
	showIfNeeded(): void;
	show(): boolean;
}

class DisabledVoiceModeOnboardingService implements IVoiceModeOnboardingService {
	declare readonly _serviceBrand: undefined;
	readonly isVisible = false;

	registerHost(_options: IChatInputOnboardingHostOptions): IDisposable {
		return toDisposable(() => { });
	}

	showIfNeeded(): void { }
	show(): boolean { return false; }
}

if (!buildFeatureCopilotChat) {
	registerSingleton(IVoiceModeOnboardingService, DisabledVoiceModeOnboardingService, InstantiationType.Delayed);
}
