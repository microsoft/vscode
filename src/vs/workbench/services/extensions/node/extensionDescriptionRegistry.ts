/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { CanonicalExtensionIdentifier } from 'vs/platform/extensions/common/extensions';

export class ExtensionDescriptionRegistry {
	private _extensionDescriptions: IExtensionDescription[];
	private _extensionsMap: Map<string, IExtensionDescription>;
	private _extensionsArr: IExtensionDescription[];
	private _activationMap: Map<string, IExtensionDescription[]>;

	constructor(extensionDescriptions: IExtensionDescription[]) {
		this._extensionDescriptions = extensionDescriptions;
		this._initialize();
	}

	private _initialize(): void {
		this._extensionsMap = new Map<string, IExtensionDescription>();
		this._extensionsArr = [];
		this._activationMap = new Map<string, IExtensionDescription[]>();

		for (let i = 0, len = this._extensionDescriptions.length; i < len; i++) {
			let extensionDescription = this._extensionDescriptions[i];

			if (this._extensionsMap.has(CanonicalExtensionIdentifier.toKey(extensionDescription.identifier))) {
				// No overwriting allowed!
				console.error('Extension `' + extensionDescription.identifier.value + '` is already registered');
				continue;
			}

			this._extensionsMap.set(CanonicalExtensionIdentifier.toKey(extensionDescription.identifier), extensionDescription);
			this._extensionsArr.push(extensionDescription);

			if (Array.isArray(extensionDescription.activationEvents)) {
				for (let j = 0, lenJ = extensionDescription.activationEvents.length; j < lenJ; j++) {
					let activationEvent = extensionDescription.activationEvents[j];

					// TODO@joao: there's no easy way to contribute this
					if (activationEvent === 'onUri') {
						activationEvent = `onUri:${CanonicalExtensionIdentifier.toKey(extensionDescription.identifier)}`;
					}

					if (!this._activationMap.has(activationEvent)) {
						this._activationMap.set(activationEvent, []);
					}
					this._activationMap.get(activationEvent).push(extensionDescription);
				}
			}
		}
	}

	public keepOnly(extensionIds: CanonicalExtensionIdentifier[]): void {
		let toKeep = new Set<string>();
		extensionIds.forEach(extensionId => toKeep.add(CanonicalExtensionIdentifier.toKey(extensionId)));
		this._extensionDescriptions = this._extensionDescriptions.filter(extension => toKeep.has(CanonicalExtensionIdentifier.toKey(extension.identifier)));
		this._initialize();
	}

	public remove(extensionId: CanonicalExtensionIdentifier): void {
		this._extensionDescriptions = this._extensionDescriptions.filter(extension => !CanonicalExtensionIdentifier.equals(extension.identifier, extensionId));
		this._initialize();
	}

	public containsActivationEvent(activationEvent: string): boolean {
		return this._activationMap.has(activationEvent);
	}

	public getExtensionDescriptionsForActivationEvent(activationEvent: string): IExtensionDescription[] {
		if (!this._activationMap.has(activationEvent)) {
			return [];
		}
		return this._activationMap.get(activationEvent).slice(0);
	}

	public getAllExtensionDescriptions(): IExtensionDescription[] {
		return this._extensionsArr.slice(0);
	}

	public getExtensionDescription(extensionId: CanonicalExtensionIdentifier | string): IExtensionDescription | null {
		if (!this._extensionsMap.has(CanonicalExtensionIdentifier.toKey(extensionId))) {
			return null;
		}
		return this._extensionsMap.get(CanonicalExtensionIdentifier.toKey(extensionId));
	}
}
