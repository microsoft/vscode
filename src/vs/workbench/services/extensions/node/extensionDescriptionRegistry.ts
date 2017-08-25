/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';

const hasOwnProperty = Object.hasOwnProperty;

export class ExtensionDescriptionRegistry {
	private _extensionsMap: { [extensionId: string]: IExtensionDescription; };
	private _extensionsArr: IExtensionDescription[];
	private _activationMap: { [activationEvent: string]: IExtensionDescription[]; };

	constructor(extensionDescriptions: IExtensionDescription[]) {
		this._extensionsMap = {};
		this._extensionsArr = [];
		this._activationMap = {};

		for (let i = 0, len = extensionDescriptions.length; i < len; i++) {
			let extensionDescription = extensionDescriptions[i];

			if (hasOwnProperty.call(this._extensionsMap, extensionDescription.id)) {
				// No overwriting allowed!
				console.error('Extension `' + extensionDescription.id + '` is already registered');
				continue;
			}

			this._extensionsMap[extensionDescription.id] = extensionDescription;
			this._extensionsArr.push(extensionDescription);

			if (Array.isArray(extensionDescription.activationEvents)) {
				for (let j = 0, lenJ = extensionDescription.activationEvents.length; j < lenJ; j++) {
					let activationEvent = extensionDescription.activationEvents[j];
					this._activationMap[activationEvent] = this._activationMap[activationEvent] || [];
					this._activationMap[activationEvent].push(extensionDescription);
				}
			}
		}
	}

	public containsActivationEvent(activationEvent: string): boolean {
		return hasOwnProperty.call(this._activationMap, activationEvent);
	}

	public getExtensionDescriptionsForActivationEvent(activationEvent: string): IExtensionDescription[] {
		if (!hasOwnProperty.call(this._activationMap, activationEvent)) {
			return [];
		}
		return this._activationMap[activationEvent].slice(0);
	}

	public getAllExtensionDescriptions(): IExtensionDescription[] {
		return this._extensionsArr.slice(0);
	}

	public getExtensionDescription(extensionId: string): IExtensionDescription {
		if (!hasOwnProperty.call(this._extensionsMap, extensionId)) {
			return null;
		}
		return this._extensionsMap[extensionId];
	}
}
