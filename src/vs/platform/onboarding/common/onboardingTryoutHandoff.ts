/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';

export const ONBOARDING_TRYOUT_CHANNEL = 'onboardingTryout';

export interface IOnboardingTryoutWindowRequest {
	readonly requestId: string;
	readonly tryoutId: string;
}

export type OnboardingTryoutWindowRequestResult = 'accepted' | 'cancelled' | 'rejected' | 'superseded';

export const IOnboardingTryoutHandoffService = createDecorator<IOnboardingTryoutHandoffService>('onboardingTryoutHandoffService');

export interface IOnboardingTryoutHandoffService {
	readonly _serviceBrand: undefined;
	open(request: IOnboardingTryoutWindowRequest): Promise<OnboardingTryoutWindowRequestResult>;
	cancel(requestId: string): Promise<void>;
	complete(requestId: string, result: OnboardingTryoutWindowRequestResult): Promise<void>;
}
