/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import * as errors from '../../../base/common/errors.js';
import { Disposable, IDisposable } from '../../../base/common/lifecycle.js';
import { ExtensionDescriptionRegistry } from '../../services/extensions/common/extensionDescriptionRegistry.js';
import { ExtensionIdentifier, ExtensionIdentifierMap } from '../../../platform/extensions/common/extensions.js';
import { ExtensionActivationReason, MissingExtensionDependency } from '../../services/extensions/common/extensions.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { Barrier } from '../../../base/common/async.js';

/**
 * Represents the source code (module) of an extension.
 */
export interface IExtensionModule {
	activate?(ctx: vscode.ExtensionContext): Promise<IExtensionAPI>;
	deactivate?(): void;
}

/**
 * Represents the API of an extension (return value of `activate`).
 */
export interface IExtensionAPI {
	// _extensionAPIBrand: any;
}

export type ExtensionActivationTimesFragment = {
	startup?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Activation occurred during startup' };
	codeLoadingTime?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Time it took to load the extension\'s code' };
	activateCallTime?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Time it took to call activate' };
	activateResolvedTime?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Time it took for async-activation to finish' };
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
	public readonly disposable: IDisposable;

	constructor(
		activationFailed: boolean,
		activationFailedError: Error | null,
		activationTimes: ExtensionActivationTimes,
		module: IExtensionModule,
		exports: IExtensionAPI | undefined,
		disposable: IDisposable
	) {
		this.activationFailed = activationFailed;
		this.activationFailedError = activationFailedError;
		this.activationTimes = activationTimes;
		this.module = module;
		this.exports = exports;
		this.disposable = disposable;
	}
}

export class EmptyExtension extends ActivatedExtension {
	constructor(activationTimes: ExtensionActivationTimes) {
		super(false, null, activationTimes, { activate: undefined, deactivate: undefined }, undefined, Disposable.None);
	}
}

export class HostExtension extends ActivatedExtension {
	constructor() {
		super(false, null, ExtensionActivationTimes.NONE, { activate: undefined, deactivate: undefined }, undefined, Disposable.None);
	}
}

class FailedExtension extends ActivatedExtension {
	constructor(activationError: Error) {
		super(true, activationError, ExtensionActivationTimes.NONE, { activate: undefined, deactivate: undefined }, undefined, Disposable.None);
	}
}

export interface IExtensionsActivatorHost {
	onExtensionActivationError(extensionId: ExtensionIdentifier, error: Error | null, missingExtensionDependency: MissingExtensionDependency | null): void;
	actualActivateExtension(extensionId: ExtensionIdentifier, reason: ExtensionActivationReason): Promise<ActivatedExtension>;
}

type ActivationIdAndReason = { id: ExtensionIdentifier; reason: ExtensionActivationReason };

export class ExtensionsActivator implements IDisposable {

	private readonly _registry: ExtensionDescriptionRegistry;
	private readonly _globalRegistry: ExtensionDescriptionRegistry;
	private readonly _host: IExtensionsActivatorHost;
	private readonly _operations: ExtensionIdentifierMap<ActivationOperation>;
	/**
	 * A map of already activated events to speed things up if the same activation event is triggered multiple times.
	 */
	private readonly _alreadyActivatedEvents: { [activationEvent: string]: boolean };

	constructor(
		registry: ExtensionDescriptionRegistry,
		globalRegistry: ExtensionDescriptionRegistry,
		host: IExtensionsActivatorHost,
		@ILogService private readonly _logService: ILogService
	) {
		this._registry = registry;
		this._globalRegistry = globalRegistry;
		this._host = host;
		this._operations = new ExtensionIdentifierMap<ActivationOperation>();
		this._alreadyActivatedEvents = Object.create(null);
	}

	public dispose(): void {
		for (const [_, op] of this._operations) {
			op.dispose();
		}
	}

	public async waitForActivatingExtensions(): Promise<void> {
		const res: Promise<boolean>[] = [];
		for (const [_, op] of this._operations) {
			res.push(op.wait());
		}
		await Promise.all(res);
	}

	public isActivated(extensionId: ExtensionIdentifier): boolean {
		const op = this._operations.get(extensionId);
		return Boolean(op && op.value);
	}

	public getActivatedExtension(extensionId: ExtensionIdentifier): ActivatedExtension {
		const op = this._operations.get(extensionId);
		if (!op || !op.value) {
			throw new Error(`Extension '${extensionId.value}' is not known or not activated`);
		}
		return op.value;
	}

	public async activateByEvent(activationEvent: string, startup: boolean): Promise<void> {
		if (this._alreadyActivatedEvents[activationEvent]) {
			return;
		}

		const activateExtensions = this._registry.getExtensionDescriptionsForActivationEvent(activationEvent);
		await this._activateExtensions(activateExtensions.map(e => ({
			id: e.identifier,
			reason: { startup, extensionId: e.identifier, activationEvent }
		})));

		this._alreadyActivatedEvents[activationEvent] = true;
	}

	public activateById(extensionId: ExtensionIdentifier, reason: ExtensionActivationReason): Promise<void> {
		const desc = this._registry.getExtensionDescription(extensionId);
		if (!desc) {
			throw new Error(`Extension '${extensionId.value}' is not known`);
		}
		return this._activateExtensions([{ id: desc.identifier, reason }]);
	}

	private async _activateExtensions(extensions: ActivationIdAndReason[]): Promise<void> {
		const operations = extensions
			.filter((p) => !this.isActivated(p.id))
			.map(ext => this._handleActivationRequest(ext));
		await Promise.all(operations.map(op => op.wait()));
	}

	/**
	 * Handle semantics related to dependencies for `currentExtension`.
	 * We don't need to worry about dependency loops because they are handled by the registry.
	 */
	private _handleActivationRequest(currentActivation: ActivationIdAndReason): ActivationOperation {
		if (this._operations.has(currentActivation.id)) {
			return this._operations.get(currentActivation.id)!;
		}

		if (this._isHostExtension(currentActivation.id)) {
			return this._createAndSaveOperation(currentActivation, null, [], null);
		}

		const currentExtension = this._registry.getExtensionDescription(currentActivation.id);
		if (!currentExtension) {
			// Error condition 0: unknown extension
			const error = new Error(`Cannot activate unknown extension '${currentActivation.id.value}'`);
			const result = this._createAndSaveOperation(currentActivation, null, [], new FailedExtension(error));
			this._host.onExtensionActivationError(
				currentActivation.id,
				error,
				new MissingExtensionDependency(currentActivation.id.value)
			);
			return result;
		}

		const deps: ActivationOperation[] = [];
		const depIds = (typeof currentExtension.extensionDependencies === 'undefined' ? [] : currentExtension.extensionDependencies);
		for (const depId of depIds) {

			if (this._isResolvedExtension(depId)) {
				// This dependency is already resolved
				continue;
			}

			const dep = this._operations.get(depId);
			if (dep) {
				deps.push(dep);
				continue;
			}

			if (this._isHostExtension(depId)) {
				// must first wait for the dependency to activate
				deps.push(this._handleActivationRequest({
					id: this._globalRegistry.getExtensionDescription(depId)!.identifier,
					reason: currentActivation.reason
				}));
				continue;
			}

			const depDesc = this._registry.getExtensionDescription(depId);
			if (depDesc) {
				if (!depDesc.main && !depDesc.browser) {
					// this dependency does not need to activate because it is descriptive only
					continue;
				}

				// must first wait for the dependency to activate
				deps.push(this._handleActivationRequest({
					id: depDesc.identifier,
					reason: currentActivation.reason
				}));
				continue;
			}

			// Error condition 1: unknown dependency
			const currentExtensionFriendlyName = currentExtension.displayName || currentExtension.identifier.value;
			const error = new Error(`Cannot activate the '${currentExtensionFriendlyName}' extension because it depends on unknown extension '${depId}'`);
			const result = this._createAndSaveOperation(currentActivation, currentExtension.displayName, [], new FailedExtension(error));
			this._host.onExtensionActivationError(
				currentExtension.identifier,
				error,
				new MissingExtensionDependency(depId)
			);
			return result;
		}

		return this._createAndSaveOperation(currentActivation, currentExtension.displayName, deps, null);
	}

	private _createAndSaveOperation(activation: ActivationIdAndReason, displayName: string | null | undefined, deps: ActivationOperation[], value: ActivatedExtension | null): ActivationOperation {
		const operation = new ActivationOperation(activation.id, displayName, activation.reason, deps, value, this._host, this._logService);
		this._operations.set(activation.id, operation);
		return operation;
	}

	private _isHostExtension(extensionId: ExtensionIdentifier | string): boolean {
		return ExtensionDescriptionRegistry.isHostExtension(extensionId, this._registry, this._globalRegistry);
	}

	private _isResolvedExtension(extensionId: ExtensionIdentifier | string): boolean {
		const extensionDescription = this._globalRegistry.getExtensionDescription(extensionId);
		if (!extensionDescription) {
			// unknown extension
			return false;
		}
		return (!extensionDescription.main && !extensionDescription.browser);
	}
}

class ActivationOperation {

	private readonly _barrier = new Barrier();
	private _isDisposed = false;

	public get value(): ActivatedExtension | null {
		return this._value;
	}

	public get friendlyName(): string {
		return this._displayName || this._id.value;
	}

	constructor(
		private readonly _id: ExtensionIdentifier,
		private readonly _displayName: string | null | undefined,
		private readonly _reason: ExtensionActivationReason,
		private readonly _deps: ActivationOperation[],
		private _value: ActivatedExtension | null,
		private readonly _host: IExtensionsActivatorHost,
		@ILogService private readonly _logService: ILogService
	) {
		this._initialize();
	}

	public dispose(): void {
		this._isDisposed = true;
	}

	public wait() {
		return this._barrier.wait();
	}

	private async _initialize(): Promise<void> {
		await this._waitForDepsThenActivate();
		this._barrier.open();
	}

	private async _waitForDepsThenActivate(): Promise<void> {
		if (this._value) {
			// this operation is already finished
			return;
		}

		while (this._deps.length > 0) {
			// remove completed deps
			for (let i = 0; i < this._deps.length; i++) {
				const dep = this._deps[i];

				if (dep.value && !dep.value.activationFailed) {
					// the dependency is already activated OK
					this._deps.splice(i, 1);
					i--;
					continue;
				}

				if (dep.value && dep.value.activationFailed) {
					// Error condition 2: a dependency has already failed activation
					const error = new Error(`Cannot activate the '${this.friendlyName}' extension because its dependency '${dep.friendlyName}' failed to activate`);
					(<any>error).detail = dep.value.activationFailedError;
					this._value = new FailedExtension(error);
					this._host.onExtensionActivationError(this._id, error, null);
					return;
				}
			}

			if (this._deps.length > 0) {
				// wait for one dependency
				await Promise.race(this._deps.map(dep => dep.wait()));
			}
		}

		await this._activate();
	}

	private async _activate(): Promise<void> {
		try {
			this._value = await this._host.actualActivateExtension(this._id, this._reason);
		} catch (err) {

			const error = new Error();
			if (err && err.name) {
				error.name = err.name;
			}
			if (err && err.message) {
				error.message = `Activating extension '${this._id.value}' failed: ${err.message}.`;
			} else {
				error.message = `Activating extension '${this._id.value}' failed: ${err}.`;
			}
			if (err && err.stack) {
				error.stack = err.stack;
			}

			// Treat the extension as being empty
			this._value = new FailedExtension(error);

			if (this._isDisposed && errors.isCancellationError(err)) {
				// It is expected for ongoing activations to fail if the extension host is going down
				// So simply ignore and don't log canceled errors in this case
				return;
			}

			this._host.onExtensionActivationError(this._id, error, null);
			this._logService.error(`Activating extension ${this._id.value} failed due to an error:`);
			this._logService.error(err);
		}
	}
}
