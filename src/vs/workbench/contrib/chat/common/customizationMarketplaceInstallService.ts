/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { ICustomizationMarketplaceResource } from '../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export type CustomizationMarketplaceInstallState =
	| { readonly kind: 'available' | 'installing' }
	| { readonly kind: 'checking' | 'installed' | 'repairing' | 'uninstalling'; readonly target: CustomizationMarketplaceInstallationTarget }
	| { readonly kind: 'missing'; readonly target: CustomizationMarketplaceInstallationTarget; readonly repairUnavailableMessage?: string }
	| { readonly kind: 'error'; readonly target: CustomizationMarketplaceInstallationTarget; readonly message: string }
	| { readonly kind: 'unavailable'; readonly message: string; readonly setupUrl?: URI };

export type CustomizationMarketplaceInstallationTarget =
	| { readonly kind: 'skill' | 'plugin'; readonly uri: URI }
	| { readonly kind: 'mcp'; readonly id: string }
	| { readonly kind: 'copilotConnector'; readonly name: string };

export const ICustomizationMarketplaceInstallService = createDecorator<ICustomizationMarketplaceInstallService>('customizationMarketplaceInstallService');

export interface ICustomizationMarketplaceInstallService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	getInstallState(resource: ICustomizationMarketplaceResource): CustomizationMarketplaceInstallState;
	/** Returns recorded resources applicable to the active customization destination, including missing targets. */
	getRecordedResources(): readonly ICustomizationMarketplaceResource[];
	/** Uses the owning install flow; cancellation rejects with a CancellationError. */
	install(resource: ICustomizationMarketplaceResource): Promise<void>;
	/** Restores files, registrations, or account connections missing from a recorded installation. */
	repair(resource: ICustomizationMarketplaceResource): Promise<void>;
	/** Removes a previously installed marketplace resource through its owning service. */
	uninstall(resource: ICustomizationMarketplaceResource): Promise<void>;
}
