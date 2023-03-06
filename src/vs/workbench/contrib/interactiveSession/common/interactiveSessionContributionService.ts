/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IInteractiveSessionContributionService = createDecorator<IInteractiveSessionContributionService>('IInteractiveSessionContributionService');
export interface IInteractiveSessionContributionService {
	_serviceBrand: undefined;

	registeredProviders: IInteractiveSessionProviderContribution[];
}

export interface IInteractiveSessionProviderContribution {
	id: string;
	label: string;
	icon: string;
	when?: string;
}
