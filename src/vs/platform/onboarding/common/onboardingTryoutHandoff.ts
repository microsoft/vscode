/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';

export const ONBOARDING_TRYOUT_CHANNEL = 'onboardingTryout';

export type OnboardingTryoutSource = 'releaseNotes' | 'externalLink' | 'direct';

export interface IOnboardingTryoutRunOptions {
	readonly source: OnboardingTryoutSource;
	readonly runId?: string;
}

export function isOnboardingTryoutSource(value: unknown): value is OnboardingTryoutSource {
	return value === 'releaseNotes' || value === 'externalLink' || value === 'direct';
}

export interface IOnboardingTryoutWindowRequest {
	readonly requestId: string;
	readonly tryoutId: string;
	readonly source: OnboardingTryoutSource;
}

export type OnboardingTryoutWindowRequestResult = 'accepted' | 'cancelled' | 'rejected' | 'superseded';

export const IOnboardingTryoutHandoffService = createDecorator<IOnboardingTryoutHandoffService>('onboardingTryoutHandoffService');

export interface IOnboardingTryoutHandoffService {
	readonly _serviceBrand: undefined;
	open(request: IOnboardingTryoutWindowRequest): Promise<OnboardingTryoutWindowRequestResult>;
	cancel(requestId: string): Promise<void>;
	complete(requestId: string, result: OnboardingTryoutWindowRequestResult): Promise<void>;
}
