/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { ICustomizationMarketplaceResource } from '../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export type CustomizationMarketplaceInstallState =
	| { readonly kind: 'available' | 'installing' | 'installed' | 'uninstalling' }
	| { readonly kind: 'unavailable'; readonly message: string };

export const ICustomizationMarketplaceInstallService = createDecorator<ICustomizationMarketplaceInstallService>('customizationMarketplaceInstallService');

export interface ICustomizationMarketplaceInstallService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	getInstallState(resource: ICustomizationMarketplaceResource): CustomizationMarketplaceInstallState;
	/** Uses the owning install flow; cancellation rejects with a CancellationError. */
	install(resource: ICustomizationMarketplaceResource): Promise<void>;
	/** Removes a previously installed marketplace resource through its owning service. */
	uninstall(resource: ICustomizationMarketplaceResource): Promise<void>;
}
