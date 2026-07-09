/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerNextEditProviderId, XTabProviderId } from '../../../platform/configuration/common/configurationService';
import { IStatelessNextEditProvider } from '../../../platform/inlineEdits/common/statelessNextEditProvider';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { XtabProvider } from '../../xtab/node/xtabProvider';

export const defaultNextEditProviderId = XTabProviderId;

export const supportedProviderIds = {
	[registerNextEditProviderId(XtabProvider.ID)]: XtabProvider,
};

export function createNextEditProvider(nextEditProviderId: string | undefined, instantiationService: IInstantiationService): IStatelessNextEditProvider {
	const providerId = nextEditProviderId ?? defaultNextEditProviderId;
	const provider = supportedProviderIds[providerId as keyof typeof supportedProviderIds];
	if (!provider) {
		throw new Error(`Unknown next edit provider ID: ${providerId}`);
	}
	return instantiationService.createInstance(provider);
}
