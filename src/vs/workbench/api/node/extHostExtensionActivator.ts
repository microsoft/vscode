/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { IDisposable } from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import { IExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { ExtensionDescriptionRegistry } from 'vs/workbench/services/extensions/node/extensionDescriptionRegistry';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';

const NO_OP_VOID_PROMISE = Promise.resolve<void>(undefined);

export interface IExtensionMemento {
	get<T>(key: string, defaultValue: T): T;
	update(key: string, value: any): Promise<boolean>;
}

export interface IExtensionContext {
	subscriptions: IDisposable[];
	workspaceState: IExtensionMemento;
	globalState: IExtensionMemento;
	extensionPath: string;
	storagePath: string;
	globalStoragePath: string;
	asAbsolutePath(relativePath: string): string;
	readonly logPath: string;
}

/**
 * Represents the source code (module) of an extension.
 */
export interface IExtensionModule {
	activate?(ctx: IExtensionContext): Promise<IExtensionAPI>;
	deactivate?(): void;
}

/**
 * Represents the API of an extension (return value of `activate`).
 */
export interface IExtensionAPI {
	// _extensionAPIBrand: any;
}

/* __GDPR__FRAGMENT__
	"ExtensionActivationTimes" : {
		"startup": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"codeLoadingTime" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"activateCallTime" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"activateResolvedTime" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true }
	}
*/
export class ExtensionActivationTimes {

	public static readonly NONE = new ExtensionActivationTimes(false, -1, -1, -1);

	public readonly startup: boolean;
	public readonly codeLoadingTime: number;
	public readonly activateCallTime: number;
	public readonly activateResolvedTime: number;

	constructor(startup: boolean, codeLoadingTime: number, activateCallTime: number, activateResolvedTime: number) {
		this.startup = startup;
		this.codeLoadingTime = codeLoadingTime;
		this.activateCallTime = activateCallTime;
		this.activateResolvedTime = activateResolvedTime;
	}
}

export class ExtensionActivationTimesBuilder {

	private readonly _startup: boolean;
	private _codeLoadingStart: number;
	private _codeLoadingStop: number;
	private _activateCallStart: number;
	private _activateCallStop: number;
	private _activateResolveStart: number;
	private _activateResolveStop: number;

	constructor(startup: boolean) {
		this._startup = startup;
		this._codeLoadingStart = -1;
		this._codeLoadingStop = -1;
		this._activateCallStart = -1;
		this._activateCallStop = -1;
		this._activateResolveStart = -1;
		this._activateResolveStop = -1;
	}

	private _delta(start: number, stop: number): number {
		if (start === -1 || stop === -1) {
			return -1;
		}
		return stop - start;
	}

	public build(): ExtensionActivationTimes {
		return new ExtensionActivationTimes(
			this._startup,
			this._delta(this._codeLoadingStart, this._codeLoadingStop),
			this._delta(this._activateCallStart, this._activateCallStop),
			this._delta(this._activateResolveStart, this._activateResolveStop)
		);
	}

	public codeLoadingStart(): void {
		this._codeLoadingStart = Date.now();
	}

	public codeLoadingStop(): void {
		this._codeLoadingStop = Date.now();
	}

	public activateCallStart(): void {
		this._activateCallStart = Date.now();
	}

	public activateCallStop(): void {
		this._activateCallStop = Date.now();
	}

	public activateResolveStart(): void {
		this._activateResolveStart = Date.now();
	}

	public activateResolveStop(): void {
		this._activateResolveStop = Date.now();
	}
}

export class ActivatedExtension {

	public readonly activationFailed: boolean;
	public readonly activationFailedError: Error | null;
	public readonly activationTimes: ExtensionActivationTimes;
	public readonly module: IExtensionModule;
	public readonly exports: IExtensionAPI | undefined;
	public readonly subscriptions: IDisposable[];

	constructor(
		activationFailed: boolean,
		activationFailedError: Error | null,
		activationTimes: ExtensionActivationTimes,
		module: IExtensionModule,
		exports: IExtensionAPI | undefined,
		subscriptions: IDisposable[]
	) {
		this.activationFailed = activationFailed;
		this.activationFailedError = activationFailedError;
		this.activationTimes = activationTimes;
		this.module = module;
		this.exports = exports;
		this.subscriptions = subscriptions;
	}
}

export class EmptyExtension extends ActivatedExtension {
	constructor(activationTimes: ExtensionActivationTimes) {
		super(false, null, activationTimes, { activate: undefined, deactivate: undefined }, undefined, []);
	}
}

export class FailedExtension extends ActivatedExtension {
	constructor(activationError: Error) {
		super(true, activationError, ExtensionActivationTimes.NONE, { activate: undefined, deactivate: undefined }, undefined, []);
	}
}

export interface IExtensionsActivatorHost {
	showMessage(severity: Severity, message: string): void;

	actualActivateExtension(extensionDescription: IExtensionDescription, reason: ExtensionActivationReason): Promise<ActivatedExtension>;
}

export class ExtensionActivatedByEvent {
	constructor(
		public readonly startup: boolean,
		public readonly activationEvent: string
	) { }
}

export class ExtensionActivatedByAPI {
	constructor(
		public readonly startup: boolean
	) { }
}

export type ExtensionActivationReason = ExtensionActivatedByEvent | ExtensionActivatedByAPI;

export class ExtensionsActivator {

	private readonly _registry: ExtensionDescriptionRegistry;
	private readonly _host: IExtensionsActivatorHost;
	private readonly _activatingExtensions: Map<string, Promise<void>>;
	private readonly _activatedExtensions: Map<string, ActivatedExtension>;
	/**
	 * A map of already activated events to speed things up if the same activation event is triggered multiple times.
	 */
	private readonly _alreadyActivatedEvents: { [activationEvent: string]: boolean; };

	constructor(registry: ExtensionDescriptionRegistry, host: IExtensionsActivatorHost) {
		this._registry = registry;
		this._host = host;
		this._activatingExtensions = new Map<string, Promise<void>>();
		this._activatedExtensions = new Map<string, ActivatedExtension>();
		this._alreadyActivatedEvents = Object.create(null);
	}

	public isActivated(extensionId: ExtensionIdentifier): boolean {
		const extensionKey = ExtensionIdentifier.toKey(extensionId);

		return this._activatedExtensions.has(extensionKey);
	}

	public getActivatedExtension(extensionId: ExtensionIdentifier): ActivatedExtension {
		const extensionKey = ExtensionIdentifier.toKey(extensionId);

		const activatedExtension = this._activatedExtensions.get(extensionKey);
		if (!activatedExtension) {
			throw new Error('Extension `' + extensionId.value + '` is not known or not activated');
		}
		return activatedExtension;
	}

	public activateByEvent(activationEvent: string, reason: ExtensionActivationReason): Promise<void> {
		if (this._alreadyActivatedEvents[activationEvent]) {
			return NO_OP_VOID_PROMISE;
		}
		let activateExtensions = this._registry.getExtensionDescriptionsForActivationEvent(activationEvent);
		return this._activateExtensions(activateExtensions, reason, 0).then(() => {
			this._alreadyActivatedEvents[activationEvent] = true;
		});
	}

	public activateById(extensionId: ExtensionIdentifier, reason: ExtensionActivationReason): Promise<void> {
		let desc = this._registry.getExtensionDescription(extensionId);
		if (!desc) {
			throw new Error('Extension `' + extensionId + '` is not known');
		}

		return this._activateExtensions([desc], reason, 0);
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
				this._host.showMessage(Severity.Error, nls.localize('unknownDep', "Cannot activate extension '{0}' as the depending extension '{1}' is not found. Please install or enable the depending extension and reload the window.", currentExtension.displayName || currentExtension.identifier.value, depId));
				const error = new Error(`Unknown dependency '${depId}'`);
				this._activatedExtensions.set(ExtensionIdentifier.toKey(currentExtension.identifier), new FailedExtension(error));
				return;
			}

			const dep = this._activatedExtensions.get(ExtensionIdentifier.toKey(depId));
			if (dep) {
				if (dep.activationFailed) {
					// Error condition 2: a dependency has already failed activation
					this._host.showMessage(Severity.Error, nls.localize('failedDep1', "Cannot activate extension '{0}' as the depending extension '{1}' is failed to activate.", currentExtension.displayName || currentExtension.identifier.value, depId));
					const error = new Error(`Dependency ${depId} failed to activate`);
					(<any>error).detail = dep.activationFailedError;
					this._activatedExtensions.set(ExtensionIdentifier.toKey(currentExtension.identifier), new FailedExtension(error));
					return;
				}
			} else {
				// must first wait for the dependency to activate
				currentExtensionGetsGreenLight = false;
				greenExtensions[ExtensionIdentifier.toKey(depId)] = depDesc;
			}
		}

		if (currentExtensionGetsGreenLight) {
			greenExtensions[ExtensionIdentifier.toKey(currentExtension.identifier)] = currentExtension;
		} else {
			redExtensions.push(currentExtension);
		}
	}

	private _activateExtensions(extensionDescriptions: IExtensionDescription[], reason: ExtensionActivationReason, recursionLevel: number): Promise<void> {
		// console.log(recursionLevel, '_activateExtensions: ', extensionDescriptions.map(p => p.id));
		if (extensionDescriptions.length === 0) {
			return Promise.resolve(undefined);
		}

		extensionDescriptions = extensionDescriptions.filter((p) => !this._activatedExtensions.has(ExtensionIdentifier.toKey(p.identifier)));
		if (extensionDescriptions.length === 0) {
			return Promise.resolve(undefined);
		}

		if (recursionLevel > 10) {
			// More than 10 dependencies deep => most likely a dependency loop
			for (let i = 0, len = extensionDescriptions.length; i < len; i++) {
				// Error condition 3: dependency loop
				this._host.showMessage(Severity.Error, nls.localize('failedDep2', "Extension '{0}' failed to activate. Reason: more than 10 levels of dependencies (most likely a dependency loop).", extensionDescriptions[i].identifier.value));
				const error = new Error('More than 10 levels of dependencies (most likely a dependency loop)');
				this._activatedExtensions.set(ExtensionIdentifier.toKey(extensionDescriptions[i].identifier), new FailedExtension(error));
			}
			return Promise.resolve(undefined);
		}

		let greenMap: { [id: string]: IExtensionDescription; } = Object.create(null),
			red: IExtensionDescription[] = [];

		for (let i = 0, len = extensionDescriptions.length; i < len; i++) {
			this._handleActivateRequest(extensionDescriptions[i], greenMap, red);
		}

		// Make sure no red is also green
		for (let i = 0, len = red.length; i < len; i++) {
			const redExtensionKey = ExtensionIdentifier.toKey(red[i].identifier);
			if (greenMap[redExtensionKey]) {
				delete greenMap[redExtensionKey];
			}
		}

		let green = Object.keys(greenMap).map(id => greenMap[id]);

		// console.log('greenExtensions: ', green.map(p => p.id));
		// console.log('redExtensions: ', red.map(p => p.id));

		if (red.length === 0) {
			// Finally reached only leafs!
			return Promise.all(green.map((p) => this._activateExtension(p, reason))).then(_ => undefined);
		}

		return this._activateExtensions(green, reason, recursionLevel + 1).then(_ => {
			return this._activateExtensions(red, reason, recursionLevel + 1);
		});
	}

	private _activateExtension(extensionDescription: IExtensionDescription, reason: ExtensionActivationReason): Promise<void> {
		const extensionKey = ExtensionIdentifier.toKey(extensionDescription.identifier);

		if (this._activatedExtensions.has(extensionKey)) {
			return Promise.resolve(undefined);
		}

		const currentlyActivatingExtension = this._activatingExtensions.get(extensionKey);
		if (currentlyActivatingExtension) {
			return currentlyActivatingExtension;
		}

		const newlyActivatingExtension = this._host.actualActivateExtension(extensionDescription, reason).then(undefined, (err) => {
			this._host.showMessage(Severity.Error, nls.localize('activationError', "Activating extension '{0}' failed: {1}.", extensionDescription.identifier.value, err.message));
			console.error('Activating extension `' + extensionDescription.identifier.value + '` failed: ', err.message);
			console.log('Here is the error stack: ', err.stack);
			// Treat the extension as being empty
			return new FailedExtension(err);
		}).then((x: ActivatedExtension) => {
			this._activatedExtensions.set(extensionKey, x);
			this._activatingExtensions.delete(extensionKey);
		});

		this._activatingExtensions.set(extensionKey, newlyActivatingExtension);
		return newlyActivatingExtension;
	}
}
