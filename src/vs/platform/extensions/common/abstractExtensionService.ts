/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import Severity from 'vs/base/common/severity';
import { TPromise } from 'vs/base/common/winjs.base';
import { IExtensionDescription, IExtensionService, IExtensionsStatus, ExtensionPointContribution } from 'vs/platform/extensions/common/extensions';
import { IExtensionPoint } from 'vs/platform/extensions/common/extensionsRegistry';

const hasOwnProperty = Object.hasOwnProperty;

export abstract class ActivatedExtension {
	activationFailed: boolean;

	constructor(activationFailed: boolean) {
		this.activationFailed = activationFailed;
	}
}

export interface IActivatedExtensionMap<T extends ActivatedExtension> {
	[extensionId: string]: T;
}

interface IActivatingExtensionMap {
	[extensionId: string]: TPromise<void>;
}

export abstract class AbstractExtensionService<T extends ActivatedExtension> implements IExtensionService {
	public _serviceBrand: any;

	private _activatingExtensions: IActivatingExtensionMap;
	protected _activatedExtensions: IActivatedExtensionMap<T>;
	private _onReady: TPromise<boolean>;
	private _onReadyC: (v: boolean) => void;
	private _isReady: boolean;
	protected _registry: ExtensionDescriptionRegistry;

	constructor(isReadyByDefault: boolean) {
		if (isReadyByDefault) {
			this._isReady = true;
			this._onReady = TPromise.as(true);
			this._onReadyC = (v: boolean) => { /*no-op*/ };
		} else {
			this._isReady = false;
			this._onReady = new TPromise<boolean>((c, e, p) => {
				this._onReadyC = c;
			}, () => {
				console.warn('You should really not try to cancel this ready promise!');
			});
		}
		this._activatingExtensions = {};
		this._activatedExtensions = {};
		this._registry = new ExtensionDescriptionRegistry();
	}

	protected _triggerOnReady(): void {
		this._isReady = true;
		this._onReadyC(true);
	}

	public onReady(): TPromise<boolean> {
		return this._onReady;
	}

	public readExtensionPointContributions<T>(extPoint: IExtensionPoint<T>): TPromise<ExtensionPointContribution<T>[]> {
		return this.onReady().then(() => {
			let availableExtensions = this._registry.getAllExtensionDescriptions();

			let result: ExtensionPointContribution<T>[] = [], resultLen = 0;
			for (let i = 0, len = availableExtensions.length; i < len; i++) {
				let desc = availableExtensions[i];

				if (desc.contributes && hasOwnProperty.call(desc.contributes, extPoint.name)) {
					result[resultLen++] = new ExtensionPointContribution<T>(desc, desc.contributes[extPoint.name]);
				}
			}

			return result;
		});
	}

	public getExtensions(): TPromise<IExtensionDescription[]> {
		return this.onReady().then(() => {
			return this._registry.getAllExtensionDescriptions();
		});
	}

	public getExtensionsStatus(): { [id: string]: IExtensionsStatus } {
		return null;
	}

	public isActivated(extensionId: string): boolean {
		return hasOwnProperty.call(this._activatedExtensions, extensionId);
	}

	public activateByEvent(activationEvent: string): TPromise<void> {
		if (this._isReady) {
			return this._activateByEvent(activationEvent);
		} else {
			return this._onReady.then(() => this._activateByEvent(activationEvent));
		}
	}

	private _activateByEvent(activationEvent: string): TPromise<void> {
		let activateExtensions = this._registry.getExtensionDescriptionsForActivationEvent(activationEvent);
		return this._activateExtensions(activateExtensions, 0);
	}

	public activateById(extensionId: string): TPromise<void> {
		return this._onReady.then(() => {
			let desc = this._registry.getExtensionDescription(extensionId);
			if (!desc) {
				throw new Error('Extension `' + extensionId + '` is not known');
			}

			return this._activateExtensions([desc], 0);
		});
	}

	/**
	 * Handle semantics related to dependencies for `currentExtension`.
	 * semantics: `redExtensions` must wait for `greenExtensions`.
	 */
	private _handleActivateRequest(currentExtension: IExtensionDescription, greenExtensions: { [id: string]: IExtensionDescription; }, redExtensions: IExtensionDescription[]): void {
		let depIds = (typeof currentExtension.extensionDependencies === 'undefined' ? [] : currentExtension.extensionDependencies);
		let currentExtensionGetsGreenLight = true;

		for (let j = 0, lenJ = depIds.length; j < lenJ; j++) {
			let depId = depIds[j];
			let depDesc = this._registry.getExtensionDescription(depId);

			if (!depDesc) {
				// Error condition 1: unknown dependency
				this._showMessage(Severity.Error, nls.localize('unknownDep', "Extension `{1}` failed to activate. Reason: unknown dependency `{0}`.", depId, currentExtension.id));
				this._activatedExtensions[currentExtension.id] = this._createFailedExtension();
				return;
			}

			if (hasOwnProperty.call(this._activatedExtensions, depId)) {
				let dep = this._activatedExtensions[depId];
				if (dep.activationFailed) {
					// Error condition 2: a dependency has already failed activation
					this._showMessage(Severity.Error, nls.localize('failedDep1', "Extension `{1}` failed to activate. Reason: dependency `{0}` failed to activate.", depId, currentExtension.id));
					this._activatedExtensions[currentExtension.id] = this._createFailedExtension();
					return;
				}
			} else {
				// must first wait for the dependency to activate
				currentExtensionGetsGreenLight = false;
				greenExtensions[depId] = depDesc;
			}
		}

		if (currentExtensionGetsGreenLight) {
			greenExtensions[currentExtension.id] = currentExtension;
		} else {
			redExtensions.push(currentExtension);
		}
	}

	private _activateExtensions(extensionDescriptions: IExtensionDescription[], recursionLevel: number): TPromise<void> {
		// console.log(recursionLevel, '_activateExtensions: ', extensionDescriptions.map(p => p.id));
		if (extensionDescriptions.length === 0) {
			return TPromise.as(void 0);
		}

		extensionDescriptions = extensionDescriptions.filter((p) => !hasOwnProperty.call(this._activatedExtensions, p.id));
		if (extensionDescriptions.length === 0) {
			return TPromise.as(void 0);
		}

		if (recursionLevel > 10) {
			// More than 10 dependencies deep => most likely a dependency loop
			for (let i = 0, len = extensionDescriptions.length; i < len; i++) {
				// Error condition 3: dependency loop
				this._showMessage(Severity.Error, nls.localize('failedDep2', "Extension `{0}` failed to activate. Reason: more than 10 levels of dependencies (most likely a dependency loop).", extensionDescriptions[i].id));
				this._activatedExtensions[extensionDescriptions[i].id] = this._createFailedExtension();
			}
			return TPromise.as(void 0);
		}

		let greenMap: { [id: string]: IExtensionDescription; } = Object.create(null),
			red: IExtensionDescription[] = [];

		for (let i = 0, len = extensionDescriptions.length; i < len; i++) {
			this._handleActivateRequest(extensionDescriptions[i], greenMap, red);
		}

		// Make sure no red is also green
		for (let i = 0, len = red.length; i < len; i++) {
			if (greenMap[red[i].id]) {
				delete greenMap[red[i].id];
			}
		}

		let green = Object.keys(greenMap).map(id => greenMap[id]);

		// console.log('greenExtensions: ', green.map(p => p.id));
		// console.log('redExtensions: ', red.map(p => p.id));

		if (red.length === 0) {
			// Finally reached only leafs!
			return TPromise.join(green.map((p) => this._activateExtension(p))).then(_ => void 0);
		}

		return this._activateExtensions(green, recursionLevel + 1).then(_ => {
			return this._activateExtensions(red, recursionLevel + 1);
		});
	}

	protected _activateExtension(extensionDescription: IExtensionDescription): TPromise<void> {
		if (hasOwnProperty.call(this._activatedExtensions, extensionDescription.id)) {
			return TPromise.as(void 0);
		}

		if (hasOwnProperty.call(this._activatingExtensions, extensionDescription.id)) {
			return this._activatingExtensions[extensionDescription.id];
		}

		this._activatingExtensions[extensionDescription.id] = this._actualActivateExtension(extensionDescription).then(null, (err) => {
			this._showMessage(Severity.Error, nls.localize('activationError', "Activating extension `{0}` failed: {1}.", extensionDescription.id, err.message));
			console.error('Activating extension `' + extensionDescription.id + '` failed: ', err.message);
			console.log('Here is the error stack: ', err.stack);
			// Treat the extension as being empty
			return this._createFailedExtension();
		}).then((x: T) => {
			this._activatedExtensions[extensionDescription.id] = x;
			delete this._activatingExtensions[extensionDescription.id];
		});

		return this._activatingExtensions[extensionDescription.id];
	}

	protected abstract _showMessage(severity: Severity, message: string): void;

	protected abstract _createFailedExtension(): T;

	protected abstract _actualActivateExtension(extensionDescription: IExtensionDescription): TPromise<T>;
}


interface IExtensionDescriptionMap {
	[extensionId: string]: IExtensionDescription;
}

export class ExtensionDescriptionRegistry {
	private _extensionsMap: IExtensionDescriptionMap;
	private _extensionsArr: IExtensionDescription[];
	private _activationMap: { [activationEvent: string]: IExtensionDescription[]; };

	constructor() {
		this._extensionsMap = {};
		this._extensionsArr = [];
		this._activationMap = {};
	}

	public registerExtensions(extensionDescriptions: IExtensionDescription[]): void {
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
