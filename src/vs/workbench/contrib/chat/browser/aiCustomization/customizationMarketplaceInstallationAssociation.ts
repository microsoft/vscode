/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { CustomizationMarketplaceIcon, CustomizationMarketplaceInstallation, getCustomizationMarketplaceResourceKey, ICustomizationMarketplaceResource } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';

const legacyInstallationRecordStoragePrefix = 'chat.customizations.marketplace.installationRecord.v1.';

export function removeLegacyCustomizationMarketplaceInstallationRecords(storageService: IStorageService): void {
	for (const key of storageService.keys(StorageScope.PROFILE, StorageTarget.MACHINE)) {
		if (key.startsWith(legacyInstallationRecordStoragePrefix)) {
			storageService.remove(key, StorageScope.PROFILE);
		}
	}
}

export interface ICustomizationMarketplaceInstallationAssociation {
	readonly id: string;
	readonly sourceId: string;
	readonly identifier: string;
	readonly version?: string;
	readonly displayName: string;
	readonly description: string;
	readonly mediaType: string;
	readonly installation: CustomizationMarketplaceInstallation;
	readonly icon?: CustomizationMarketplaceIcon;
	readonly target: CustomizationMarketplaceInstallationAssociationTarget;
}

export type CustomizationMarketplaceInstallationAssociationTarget =
	| { readonly kind: 'plugin'; readonly uri: URI }
	| { readonly kind: 'mcp'; readonly id: string }
	| {
		readonly kind: 'copilotConnector';
		readonly name: string;
		readonly providerId: string;
		readonly accountName: string;
		readonly enterprise: boolean;
	};

export class CustomizationMarketplaceInstallationAssociationCache extends Disposable {
	private readonly _associations = new Map<string, ICustomizationMarketplaceInstallationAssociation>();

	get associations(): ReadonlyMap<string, ICustomizationMarketplaceInstallationAssociation> {
		return this._associations;
	}

	upsert(association: ICustomizationMarketplaceInstallationAssociation): void {
		this._associations.set(association.id, association);
	}

	delete(association: ICustomizationMarketplaceInstallationAssociation): void {
		this._associations.delete(association.id);
	}
}

export function getInstallationAssociationResourceKey(association: ICustomizationMarketplaceInstallationAssociation): string {
	return getCustomizationMarketplaceResourceKey(association);
}

export function toAssociatedMarketplaceResource(association: ICustomizationMarketplaceInstallationAssociation): ICustomizationMarketplaceResource {
	return {
		sourceId: association.sourceId,
		identifier: association.identifier,
		version: association.version,
		displayName: association.displayName,
		description: association.description,
		mediaType: association.mediaType,
		tags: [],
		capabilities: [],
		representativeQueries: [],
		installation: association.installation,
		icon: association.icon,
	};
}
