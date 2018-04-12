/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { IDisposable } from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import { TPromise } from 'vs/base/common/winjs.base';
import { ExtensionDescriptionRegistry } from 'vs/workbench/services/extensions/node/extensionDescriptionRegistry';
import { IExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { ExtHostLogger } from 'vs/workbench/api/node/extHostLogService';

const hasOwnProperty = Object.hasOwnProperty;
const NO_OP_VOID_PROMISE = TPromise.wrap<void>(void 0);

export interface IExtensionMemento {
	get<T>(key: string, defaultValue: T): T;
	update(key: string, value: any): Thenable<boolean>;
}

export interface IExtensionContext {
	subscriptions: IDisposable[];
	workspaceState: IExtensionMemento;
	globalState: IExtensionMemento;
	extensionPath: string;
	storagePath: string;
	asAbsolutePath(relativePath: string): string;
	logger: ExtHostLogger;
	readonly logDirectory: string;
}

/**
 * Represents the source code (module) of an extension.
 */
export interface IExtensionModule {
	activate(ctx: IExtensionContext): TPromise<IExtensionAPI>;
	deactivate(): void;
}

/**
 * Represents the API of an extension (return value of `activate`).
 */
export interface IExtensionAPI {
	// _extensionAPIBrand: any;
}

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
	public readonly activationFailedError: Error;
	public readonly activationTimes: ExtensionActivationTimes;
	public readonly module: IExtensionModule;
	public readonly exports: IExtensionAPI;
	public readonly subscriptions: IDisposable[];

	constructor(
		activationFailed: boolean,
		activationFailedError: Error,
		activationTimes: ExtensionActivationTimes,
		module: IExtensionModule,
		exports: IExtensionAPI,
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

	actualActivateExtension(extensionDescription: IExtensionDescription, reason: ExtensionActivationReason): TPromise<ActivatedExtension>;
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
	private readonly _activatingExtensions: { [extensionId: string]: TPromise<void>; };
	private readonly _activatedExtensions: { [extensionId: string]: ActivatedExtension; };
	/**
	 * A map of already activated events to speed things up if the same activation event is triggered multiple times.
	 */
	private readonly _alreadyActivatedEvents: { [activationEvent: string]: boolean; };

	constructor(registry: ExtensionDescriptionRegistry, host: IExtensionsActivatorHost) {
		this._registry = registry;
		this._host = host;
		this._activatingExtensions = {};
		this._activatedExtensions = {};
		this._alreadyActivatedEvents = Object.create(null);
	}

	public isActivated(extensionId: string): boolean {
		return hasOwnProperty.call(this._activatedExtensions, extensionId);
	}

	public getActivatedExtension(extensionId: string): ActivatedExtension {
		if (!hasOwnProperty.call(this._activatedExtensions, extensionId)) {
			throw new Error('Extension `' + extensionId + '` is not known or not activated');
		}
		return this._activatedExtensions[extensionId];
	}

	public activateByEvent(activationEvent: string, reason: ExtensionActivationReason): TPromise<void> {
		if (this._alreadyActivatedEvents[activationEvent]) {
			return NO_OP_VOID_PROMISE;
		}
		let activateExtensions = this._registry.getExtensionDescriptionsForActivationEvent(activationEvent);
		return this._activateExtensions(activateExtensions, reason, 0).then(() => {
			this._alreadyActivatedEvents[activationEvent] = true;
		});
	}

	public activateById(extensionId: string, reason: ExtensionActivationReason): TPromise<void> {
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
				this._host.showMessage(Severity.Error, nls.localize('unknownDep', "Extension '{1}' failed to activate. Reason: unknown dependency '{0}'.", depId, currentExtension.id));
				const error = new Error(`Unknown dependency '${depId}'`);
				this._activatedExtensions[currentExtension.id] = new FailedExtension(error);
				return;
			}

			if (hasOwnProperty.call(this._activatedExtensions, depId)) {
				let dep = this._activatedExtensions[depId];
				if (dep.activationFailed) {
					// Error condition 2: a dependency has already failed activation
					this._host.showMessage(Severity.Error, nls.localize('failedDep1', "Extension '{1}' failed to activate. Reason: dependency '{0}' failed to activate.", depId, currentExtension.id));
					const error = new Error(`Dependency ${depId} failed to activate`);
					(<any>error).detail = dep.activationFailedError;
					this._activatedExtensions[currentExtension.id] = new FailedExtension(error);
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

	private _activateExtensions(extensionDescriptions: IExtensionDescription[], reason: ExtensionActivationReason, recursionLevel: number): TPromise<void> {
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
				this._host.showMessage(Severity.Error, nls.localize('failedDep2', "Extension '{0}' failed to activate. Reason: more than 10 levels of dependencies (most likely a dependency loop).", extensionDescriptions[i].id));
				const error = new Error('More than 10 levels of dependencies (most likely a dependency loop)');
				this._activatedExtensions[extensionDescriptions[i].id] = new FailedExtension(error);
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
			return TPromise.join(green.map((p) => this._activateExtension(p, reason))).then(_ => void 0);
		}

		return this._activateExtensions(green, reason, recursionLevel + 1).then(_ => {
			return this._activateExtensions(red, reason, recursionLevel + 1);
		});
	}

	private _activateExtension(extensionDescription: IExtensionDescription, reason: ExtensionActivationReason): TPromise<void> {
		if (hasOwnProperty.call(this._activatedExtensions, extensionDescription.id)) {
			return TPromise.as(void 0);
		}

		if (hasOwnProperty.call(this._activatingExtensions, extensionDescription.id)) {
			return this._activatingExtensions[extensionDescription.id];
		}

		this._activatingExtensions[extensionDescription.id] = this._host.actualActivateExtension(extensionDescription, reason).then(null, (err) => {
			this._host.showMessage(Severity.Error, nls.localize('activationError', "Activating extension '{0}' failed: {1}.", extensionDescription.id, err.message));
			console.error('Activating extension `' + extensionDescription.id + '` failed: ', err.message);
			console.log('Here is the error stack: ', err.stack);
			// Treat the extension as being empty
			return new FailedExtension(err);
		}).then((x: ActivatedExtension) => {
			this._activatedExtensions[extensionDescription.id] = x;
			delete this._activatingExtensions[extensionDescription.id];
		});

		return this._activatingExtensions[extensionDescription.id];
	}
}
