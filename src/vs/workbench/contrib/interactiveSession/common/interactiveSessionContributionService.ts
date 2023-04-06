/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface IInteractiveSessionProviderContribution {
	id: string;
	label: string;
	extensionIcon?: URI;
	when?: string;
}

export const IInteractiveSessionContributionService = createDecorator<IInteractiveSessionContributionService>('IInteractiveSessionContributionService');
export interface IInteractiveSessionContributionService {
	_serviceBrand: undefined;

	registeredProviders: IInteractiveSessionProviderContribution[];
	getViewIdForProvider(providerId: string): string;
}

export interface IRawInteractiveSessionProviderContribution {
	id: string;
	label: string;
	icon?: string;
	when?: string;
}
