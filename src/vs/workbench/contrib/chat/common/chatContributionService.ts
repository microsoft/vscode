/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface IChatProviderContribution {
	id: string;
	label: string;
	extensionIcon?: URI;
	when?: string;
}

export const IChatContributionService = createDecorator<IChatContributionService>('IChatContributionService');
export interface IChatContributionService {
	_serviceBrand: undefined;

	registeredProviders: IChatProviderContribution[];
	getViewIdForProvider(providerId: string): string;
}

export interface IRawChatProviderContribution {
	id: string;
	label: string;
	icon?: string;
	when?: string;
}
