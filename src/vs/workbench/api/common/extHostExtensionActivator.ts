/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ExtensionDescriptionRegistry } from 'vs/workbench/services/extensions/common/extensionDescriptionRegistry';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { ExtensionActivationError, MissingDependencyError } from 'vs/workbench/services/extensions/common/extensions';

const NO_OP_VOID_PROMISE = Promise.resolve<void>(undefined);

export interface IExtensionMemento {
	get<T>(key: string): T | undefined;
	get<T>(key: string, defaultValue: T): T;
	update(key: string, value: any): Promise<void>;
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
	executionContext: number;
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

export type ExtensionActivationTimesFragment = {
	startup?: { classification: 'SystemMetaData', purpose: 'PerformanceAndHealth', isMeasurement: true };
	codeLoadingTime?: { classification: 'SystemMetaData', purpose: 'PerformanceAndHealth', isMeasurement: true };
	activateCallTime?: { classification: 'SystemMetaData', purpose: 'PerformanceAndHealth', isMeasurement: true };
	activateResolvedTime?: { classification: 'SystemMetaData', purpose: 'PerformanceAndHealth', isMeasurement: true };
};

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

export class HostExtension extends ActivatedExtension {
	constructor() {
		super(false, null, ExtensionActivationTimes.NONE, { activate: undefined, deactivate: undefined }, undefined, []);
	}
}

export class FailedExtension extends ActivatedExtension {
	constructor(activationError: Error) {
		super(true, activationError, ExtensionActivationTimes.NONE, { activate: undefined, deactivate: undefined }, undefined, []);
	}
}

export interface IExtensionsActivatorHost {
	onExtensionActivationError(extensionId: ExtensionIdentifier, error: ExtensionActivationError): void;
	actualActivateExtension(extensionId: ExtensionIdentifier, reason: ExtensionActivationReason): Promise<ActivatedExtension>;
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
	private readonly _resolvedExtensionsSet: Set<string>;
	private readonly _hostExtensionsMap: Map<string, ExtensionIdentifier>;
	private readonly _host: IExtensionsActivatorHost;
	private readonly _activatingExtensions: Map<string, Promise<void>>;
	private readonly _activatedExtensions: Map<string, ActivatedExtension>;
	/**
	 * A map of already activated events to speed things up if the same activation event is triggered multiple times.
	 */
	private readonly _alreadyActivatedEvents: { [activationEvent: string]: boolean; };

	constructor(registry: ExtensionDescriptionRegistry, resolvedExtensions: ExtensionIdentifier[], hostExtensions: ExtensionIdentifier[], host: IExtensionsActivatorHost) {
		this._registry = registry;
		this._resolvedExtensionsSet = new Set<string>();
		resolvedExtensions.forEach((extensionId) => this._resolvedExtensionsSet.add(ExtensionIdentifier.toKey(extensionId)));
		this._hostExtensionsMap = new Map<string, ExtensionIdentifier>();
		hostExtensions.forEach((extensionId) => this._hostExtensionsMap.set(ExtensionIdentifier.toKey(extensionId), extensionId));
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
		const activateExtensions = this._registry.getExtensionDescriptionsForActivationEvent(activationEvent);
		return this._activateExtensions(activateExtensions.map(e => e.identifier), reason).then(() => {
			this._alreadyActivatedEvents[activationEvent] = true;
		});
	}

	public activateById(extensionId: ExtensionIdentifier, reason: ExtensionActivationReason): Promise<void> {
		const desc = this._registry.getExtensionDescription(extensionId);
		if (!desc) {
			throw new Error('Extension `' + extensionId + '` is not known');
		}

		return this._activateExtensions([desc.identifier], reason);
	}

	/**
	 * Handle semantics related to dependencies for `currentExtension`.
	 * semantics: `redExtensions` must wait for `greenExtensions`.
	 */
	private _handleActivateRequest(currentExtensionId: ExtensionIdentifier, greenExtensions: { [id: string]: ExtensionIdentifier; }, redExtensions: ExtensionIdentifier[]): void {
		if (this._hostExtensionsMap.has(ExtensionIdentifier.toKey(currentExtensionId))) {
			greenExtensions[ExtensionIdentifier.toKey(currentExtensionId)] = currentExtensionId;
			return;
		}

		const currentExtension = this._registry.getExtensionDescription(currentExtensionId)!;
		const depIds = (typeof currentExtension.extensionDependencies === 'undefined' ? [] : currentExtension.extensionDependencies);
		let currentExtensionGetsGreenLight = true;

		for (let j = 0, lenJ = depIds.length; j < lenJ; j++) {
			const depId = depIds[j];

			if (this._resolvedExtensionsSet.has(ExtensionIdentifier.toKey(depId))) {
				// This dependency is already resolved
				continue;
			}

			const dep = this._activatedExtensions.get(ExtensionIdentifier.toKey(depId));
			if (dep && !dep.activationFailed) {
				// the dependency is already activated OK
				continue;
			}

			if (dep && dep.activationFailed) {
				// Error condition 2: a dependency has already failed activation
				this._host.onExtensionActivationError(currentExtension.identifier, nls.localize('failedDep1', "Cannot activate extension '{0}' because it depends on extension '{1}', which failed to activate.", currentExtension.displayName || currentExtension.identifier.value, depId));
				const error = new Error(`Dependency ${depId} failed to activate`);
				(<any>error).detail = dep.activationFailedError;
				this._activatedExtensions.set(ExtensionIdentifier.toKey(currentExtension.identifier), new FailedExtension(error));
				return;
			}

			if (this._hostExtensionsMap.has(ExtensionIdentifier.toKey(depId))) {
				// must first wait for the dependency to activate
				currentExtensionGetsGreenLight = false;
				greenExtensions[ExtensionIdentifier.toKey(depId)] = this._hostExtensionsMap.get(ExtensionIdentifier.toKey(depId))!;
				continue;
			}

			const depDesc = this._registry.getExtensionDescription(depId);
			if (depDesc) {
				// must first wait for the dependency to activate
				currentExtensionGetsGreenLight = false;
				greenExtensions[ExtensionIdentifier.toKey(depId)] = depDesc.identifier;
				continue;
			}

			// Error condition 1: unknown dependency
			this._host.onExtensionActivationError(currentExtension.identifier, new MissingDependencyError(depId));
			const error = new Error(`Unknown dependency '${depId}'`);
			this._activatedExtensions.set(ExtensionIdentifier.toKey(currentExtension.identifier), new FailedExtension(error));
			return;
		}

		if (currentExtensionGetsGreenLight) {
			greenExtensions[ExtensionIdentifier.toKey(currentExtension.identifier)] = currentExtensionId;
		} else {
			redExtensions.push(currentExtensionId);
		}
	}

	private _activateExtensions(extensionIds: ExtensionIdentifier[], reason: ExtensionActivationReason): Promise<void> {
		// console.log('_activateExtensions: ', extensionIds.map(p => p.value));
		if (extensionIds.length === 0) {
			return Promise.resolve(undefined);
		}

		extensionIds = extensionIds.filter((p) => !this._activatedExtensions.has(ExtensionIdentifier.toKey(p)));
		if (extensionIds.length === 0) {
			return Promise.resolve(undefined);
		}

		const greenMap: { [id: string]: ExtensionIdentifier; } = Object.create(null),
			red: ExtensionIdentifier[] = [];

		for (let i = 0, len = extensionIds.length; i < len; i++) {
			this._handleActivateRequest(extensionIds[i], greenMap, red);
		}

		// Make sure no red is also green
		for (let i = 0, len = red.length; i < len; i++) {
			const redExtensionKey = ExtensionIdentifier.toKey(red[i]);
			if (greenMap[redExtensionKey]) {
				delete greenMap[redExtensionKey];
			}
		}

		const green = Object.keys(greenMap).map(id => greenMap[id]);

		// console.log('greenExtensions: ', green.map(p => p.id));
		// console.log('redExtensions: ', red.map(p => p.id));

		if (red.length === 0) {
			// Finally reached only leafs!
			return Promise.all(green.map((p) => this._activateExtension(p, reason))).then(_ => undefined);
		}

		return this._activateExtensions(green, reason).then(_ => {
			return this._activateExtensions(red, reason);
		});
	}

	private _activateExtension(extensionId: ExtensionIdentifier, reason: ExtensionActivationReason): Promise<void> {
		const extensionKey = ExtensionIdentifier.toKey(extensionId);

		if (this._activatedExtensions.has(extensionKey)) {
			return Promise.resolve(undefined);
		}

		const currentlyActivatingExtension = this._activatingExtensions.get(extensionKey);
		if (currentlyActivatingExtension) {
			return currentlyActivatingExtension;
		}

		const newlyActivatingExtension = this._host.actualActivateExtension(extensionId, reason).then(undefined, (err) => {
			this._host.onExtensionActivationError(extensionId, nls.localize('activationError', "Activating extension '{0}' failed: {1}.", extensionId.value, err.message));
			console.error('Activating extension `' + extensionId.value + '` failed: ', err.message);
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
