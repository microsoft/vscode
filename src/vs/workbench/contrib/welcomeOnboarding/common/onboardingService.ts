/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IOnboardingService = createDecorator<IOnboardingService>('onboardingService');

export interface IOnboardingService {
	readonly _serviceBrand: undefined;

	/**
	 * Fires when the onboarding modal is dismissed.
	 */
	readonly onDidDismiss: Event<void>;

	/**
	 * Show the onboarding modal.
	 */
	show(): void;
}
