/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { getCustomizationMarketplaceResourceKey, ICustomizationMarketplaceResource } from '../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export type CustomizationMarketplaceInstallState =
	| { readonly kind: 'available' | 'installing' }
	| { readonly kind: 'checking' | 'installed' | 'repairing' | 'uninstalling'; readonly target: CustomizationMarketplaceInstallationTarget }
	| { readonly kind: 'missing'; readonly target: CustomizationMarketplaceInstallationTarget; readonly repairUnavailableMessage?: string }
	| { readonly kind: 'error'; readonly target: CustomizationMarketplaceInstallationTarget; readonly message: string }
	| { readonly kind: 'unavailable'; readonly message: string; readonly setupUrl?: URI };

export type CustomizationMarketplaceInstallationTarget =
	| { readonly kind: 'skill' | 'plugin'; readonly uri?: URI; readonly name?: string }
	| { readonly kind: 'mcp'; readonly id?: string; readonly name?: string }
	| { readonly kind: 'copilotConnector'; readonly name: string };

export type RecordedCustomizationMarketplaceInstallState = Extract<CustomizationMarketplaceInstallState, { readonly target: CustomizationMarketplaceInstallationTarget }>;

export interface IRecordedCustomizationMarketplaceResource {
	readonly resource: ICustomizationMarketplaceResource;
	readonly state: RecordedCustomizationMarketplaceInstallState;
	/** Provider-owned durable installation identity, when available. */
	readonly installationId?: string;
}

export interface ICustomizationMarketplaceInstallProvider {
	readonly onDidChange: Event<void>;
	getInstallations(sessionResource: URI, token: CancellationToken): Promise<readonly IRecordedCustomizationMarketplaceResource[]>;
	getInstallUnavailableMessage?(resource: ICustomizationMarketplaceResource): string | undefined;
	install(sessionResource: URI, resource: ICustomizationMarketplaceResource, token: CancellationToken): Promise<void>;
	repair(sessionResource: URI, installation: IRecordedCustomizationMarketplaceResource, token: CancellationToken): Promise<void>;
	uninstall(sessionResource: URI, installation: IRecordedCustomizationMarketplaceResource, token: CancellationToken): Promise<void>;
}

export interface ICustomizationMarketplaceInstallationSnapshot {
	readonly installations: readonly IRecordedCustomizationMarketplaceResource[];
	findByResource(resource: ICustomizationMarketplaceResource): IRecordedCustomizationMarketplaceResource | undefined;
	findByTarget(target: CustomizationMarketplaceInstallationTarget): IRecordedCustomizationMarketplaceResource | undefined;
}

export function createCustomizationMarketplaceInstallationSnapshot(
	installations: readonly IRecordedCustomizationMarketplaceResource[],
	isCompatibleResource?: (recorded: ICustomizationMarketplaceResource, resource: ICustomizationMarketplaceResource) => boolean,
): ICustomizationMarketplaceInstallationSnapshot {
	const snapshotInstallations = [...installations];
	const byResource = new Map<string, IRecordedCustomizationMarketplaceResource>();
	const skillsByUri = new ResourceMap<IRecordedCustomizationMarketplaceResource>();
	const pluginsByUri = new ResourceMap<IRecordedCustomizationMarketplaceResource>();
	const mcpById = new Map<string, IRecordedCustomizationMarketplaceResource>();
	const connectorsByName = new Map<string, IRecordedCustomizationMarketplaceResource>();
	for (const installation of snapshotInstallations) {
		const resourceKey = getCustomizationMarketplaceResourceKey(installation.resource);
		if (!byResource.has(resourceKey)) {
			byResource.set(resourceKey, installation);
		}
		const target = installation.state.target;
		switch (target.kind) {
			case 'skill':
				if (target.uri && !skillsByUri.has(target.uri)) {
					skillsByUri.set(target.uri, installation);
				}
				break;
			case 'plugin':
				if (target.uri && !pluginsByUri.has(target.uri)) {
					pluginsByUri.set(target.uri, installation);
				}
				break;
			case 'mcp':
				if (target.id && !mcpById.has(target.id)) {
					mcpById.set(target.id, installation);
				}
				break;
			case 'copilotConnector':
				if (!connectorsByName.has(target.name)) {
					connectorsByName.set(target.name, installation);
				}
				break;
		}
	}
	return {
		installations: snapshotInstallations,
		findByResource: resource => byResource.get(getCustomizationMarketplaceResourceKey(resource))
			?? snapshotInstallations.find(installation => isCompatibleResource?.(installation.resource, resource)),
		findByTarget: target => {
			switch (target.kind) {
				case 'skill': return target.uri ? skillsByUri.get(target.uri) : undefined;
				case 'plugin': return target.uri ? pluginsByUri.get(target.uri) : undefined;
				case 'mcp': return target.id ? mcpById.get(target.id) : undefined;
				case 'copilotConnector': return connectorsByName.get(target.name);
			}
		},
	};
}

export const emptyCustomizationMarketplaceInstallationSnapshot = createCustomizationMarketplaceInstallationSnapshot([]);

export const ICustomizationMarketplaceInstallService = createDecorator<ICustomizationMarketplaceInstallService>('customizationMarketplaceInstallService');

export interface ICustomizationMarketplaceInstallService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	/** Applicable marketplace installations indexed by catalog identity and exact installed target. */
	readonly installations: IObservable<ICustomizationMarketplaceInstallationSnapshot>;
	getInstallState(resource: ICustomizationMarketplaceResource): CustomizationMarketplaceInstallState;
	/** Uses the owning install flow; cancellation rejects with a CancellationError. */
	install(resource: ICustomizationMarketplaceResource): Promise<void>;
	/** Restores files, registrations, or account connections missing from a recorded installation. */
	repair(resource: ICustomizationMarketplaceResource): Promise<void>;
	/** Cancels an in-progress Connector install or repair. */
	cancelConnectorOperation(resource: ICustomizationMarketplaceResource): void;
	/** Removes a previously installed marketplace resource through its owning service. */
	uninstall(resource: ICustomizationMarketplaceResource): Promise<void>;
}
