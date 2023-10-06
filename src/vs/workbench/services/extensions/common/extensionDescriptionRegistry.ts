/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionIdentifier, ExtensionIdentifierMap, ExtensionIdentifierSet, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { Emitter } from 'vs/base/common/event';
import * as path from 'vs/base/common/path';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';

export class DeltaExtensionsResult {
	constructor(
		public readonly versionId: number,
		public readonly removedDueToLooping: IExtensionDescription[]
	) { }
}

export interface IReadOnlyExtensionDescriptionRegistry {
	containsActivationEvent(activationEvent: string): boolean;
	containsExtension(extensionId: ExtensionIdentifier): boolean;
	getExtensionDescriptionsForActivationEvent(activationEvent: string): IExtensionDescription[];
	getAllExtensionDescriptions(): IExtensionDescription[];
	getExtensionDescription(extensionId: ExtensionIdentifier | string): IExtensionDescription | undefined;
	getExtensionDescriptionByUUID(uuid: string): IExtensionDescription | undefined;
	getExtensionDescriptionByIdOrUUID(extensionId: ExtensionIdentifier | string, uuid: string | undefined): IExtensionDescription | undefined;
}

export class ExtensionDescriptionRegistry implements IReadOnlyExtensionDescriptionRegistry {

	public static isHostExtension(extensionId: ExtensionIdentifier | string, myRegistry: ExtensionDescriptionRegistry, globalRegistry: ExtensionDescriptionRegistry): boolean {
		if (myRegistry.getExtensionDescription(extensionId)) {
			// I have this extension
			return false;
		}
		const extensionDescription = globalRegistry.getExtensionDescription(extensionId);
		if (!extensionDescription) {
			// unknown extension
			return false;
		}
		if ((extensionDescription.main || extensionDescription.browser) && extensionDescription.api === 'none') {
			return true;
		}
		return false;
	}

	private readonly _onDidChange = new Emitter<void>();
	public readonly onDidChange = this._onDidChange.event;

	private _versionId: number = 0;
	private _extensionDescriptions: IExtensionDescription[];
	private _extensionsMap!: ExtensionIdentifierMap<IExtensionDescription>;
	private _extensionsArr!: IExtensionDescription[];
	private _activationMap!: Map<string, IExtensionDescription[]>;

	constructor(
		private readonly _activationEventsReader: IActivationEventsReader,
		extensionDescriptions: IExtensionDescription[]
	) {
		this._extensionDescriptions = extensionDescriptions;
		this._initialize();
	}

	private _initialize(): void {
		// Ensure extensions are stored in the order: builtin, user, under development
		this._extensionDescriptions.sort(extensionCmp);

		this._extensionsMap = new ExtensionIdentifierMap<IExtensionDescription>();
		this._extensionsArr = [];
		this._activationMap = new Map<string, IExtensionDescription[]>();

		for (const extensionDescription of this._extensionDescriptions) {
			if (this._extensionsMap.has(extensionDescription.identifier)) {
				// No overwriting allowed!
				console.error('Extension `' + extensionDescription.identifier.value + '` is already registered');
				continue;
			}

			this._extensionsMap.set(extensionDescription.identifier, extensionDescription);
			this._extensionsArr.push(extensionDescription);

			const activationEvents = this._activationEventsReader.readActivationEvents(extensionDescription);
			if (Array.isArray(activationEvents)) {
				for (let activationEvent of activationEvents) {
					// TODO@joao: there's no easy way to contribute this
					if (activationEvent === 'onUri') {
						activationEvent = `onUri:${ExtensionIdentifier.toKey(extensionDescription.identifier)}`;
					}

					if (!this._activationMap.has(activationEvent)) {
						this._activationMap.set(activationEvent, []);
					}
					this._activationMap.get(activationEvent)!.push(extensionDescription);
				}
			}
		}
	}

	public set(extensionDescriptions: IExtensionDescription[]): { versionId: number } {
		this._extensionDescriptions = extensionDescriptions;
		this._initialize();
		this._versionId++;
		this._onDidChange.fire(undefined);
		return {
			versionId: this._versionId
		};
	}

	public deltaExtensions(toAdd: IExtensionDescription[], toRemove: ExtensionIdentifier[]): DeltaExtensionsResult {
		// It is possible that an extension is removed, only to be added again at a different version
		// so we will first handle removals
		this._extensionDescriptions = removeExtensions(this._extensionDescriptions, toRemove);

		// Then, handle the extensions to add
		this._extensionDescriptions = this._extensionDescriptions.concat(toAdd);

		// Immediately remove looping extensions!
		const looping = ExtensionDescriptionRegistry._findLoopingExtensions(this._extensionDescriptions);
		this._extensionDescriptions = removeExtensions(this._extensionDescriptions, looping.map(ext => ext.identifier));

		this._initialize();
		this._versionId++;
		this._onDidChange.fire(undefined);
		return new DeltaExtensionsResult(this._versionId, looping);
	}

	private static _findLoopingExtensions(extensionDescriptions: IExtensionDescription[]): IExtensionDescription[] {
		const G = new class {

			private _arcs = new Map<string, string[]>();
			private _nodesSet = new Set<string>();
			private _nodesArr: string[] = [];

			addNode(id: string): void {
				if (!this._nodesSet.has(id)) {
					this._nodesSet.add(id);
					this._nodesArr.push(id);
				}
			}

			addArc(from: string, to: string): void {
				this.addNode(from);
				this.addNode(to);
				if (this._arcs.has(from)) {
					this._arcs.get(from)!.push(to);
				} else {
					this._arcs.set(from, [to]);
				}
			}

			getArcs(id: string): string[] {
				if (this._arcs.has(id)) {
					return this._arcs.get(id)!;
				}
				return [];
			}

			hasOnlyGoodArcs(id: string, good: Set<string>): boolean {
				const dependencies = G.getArcs(id);
				for (let i = 0; i < dependencies.length; i++) {
					if (!good.has(dependencies[i])) {
						return false;
					}
				}
				return true;
			}

			getNodes(): string[] {
				return this._nodesArr;
			}
		};

		const descs = new ExtensionIdentifierMap<IExtensionDescription>();
		for (const extensionDescription of extensionDescriptions) {
			descs.set(extensionDescription.identifier, extensionDescription);
			if (extensionDescription.extensionDependencies) {
				for (const depId of extensionDescription.extensionDependencies) {
					G.addArc(ExtensionIdentifier.toKey(extensionDescription.identifier), ExtensionIdentifier.toKey(depId));
				}
			}
		}

		// initialize with all extensions with no dependencies.
		const good = new Set<string>();
		G.getNodes().filter(id => G.getArcs(id).length === 0).forEach(id => good.add(id));

		// all other extensions will be processed below.
		const nodes = G.getNodes().filter(id => !good.has(id));

		let madeProgress: boolean;
		do {
			madeProgress = false;

			// find one extension which has only good deps
			for (let i = 0; i < nodes.length; i++) {
				const id = nodes[i];

				if (G.hasOnlyGoodArcs(id, good)) {
					nodes.splice(i, 1);
					i--;
					good.add(id);
					madeProgress = true;
				}
			}
		} while (madeProgress);

		// The remaining nodes are bad and have loops
		return nodes.map(id => descs.get(id)!);
	}

	public containsActivationEvent(activationEvent: string): boolean {
		return this._activationMap.has(activationEvent);
	}

	public containsExtension(extensionId: ExtensionIdentifier): boolean {
		return this._extensionsMap.has(extensionId);
	}

	public getExtensionDescriptionsForActivationEvent(activationEvent: string): IExtensionDescription[] {
		const extensions = this._activationMap.get(activationEvent);
		return extensions ? extensions.slice(0) : [];
	}

	public getAllExtensionDescriptions(): IExtensionDescription[] {
		return this._extensionsArr.slice(0);
	}

	public getSnapshot(): ExtensionDescriptionRegistrySnapshot {
		return new ExtensionDescriptionRegistrySnapshot(
			this._versionId,
			this.getAllExtensionDescriptions()
		);
	}

	public getExtensionDescription(extensionId: ExtensionIdentifier | string): IExtensionDescription | undefined {
		const extension = this._extensionsMap.get(extensionId);
		return extension ? extension : undefined;
	}

	public getExtensionDescriptionByUUID(uuid: string): IExtensionDescription | undefined {
		for (const extensionDescription of this._extensionsArr) {
			if (extensionDescription.uuid === uuid) {
				return extensionDescription;
			}
		}
		return undefined;
	}

	public getExtensionDescriptionByIdOrUUID(extensionId: ExtensionIdentifier | string, uuid: string | undefined): IExtensionDescription | undefined {
		return (
			this.getExtensionDescription(extensionId)
			?? (uuid ? this.getExtensionDescriptionByUUID(uuid) : undefined)
		);
	}
}

export class ExtensionDescriptionRegistrySnapshot {
	constructor(
		public readonly versionId: number,
		public readonly extensions: readonly IExtensionDescription[]
	) { }
}

export interface IActivationEventsReader {
	readActivationEvents(extensionDescription: IExtensionDescription): string[] | undefined;
}

export const basicActivationEventsReader: IActivationEventsReader = {
	readActivationEvents: (extensionDescription: IExtensionDescription): string[] | undefined => {
		return extensionDescription.activationEvents;
	}
};

export class LockableExtensionDescriptionRegistry implements IReadOnlyExtensionDescriptionRegistry {

	private readonly _actual: ExtensionDescriptionRegistry;
	private readonly _lock = new Lock();

	constructor(activationEventsReader: IActivationEventsReader) {
		this._actual = new ExtensionDescriptionRegistry(activationEventsReader, []);
	}

	public async acquireLock(customerName: string): Promise<ExtensionDescriptionRegistryLock> {
		const lock = await this._lock.acquire(customerName);
		return new ExtensionDescriptionRegistryLock(this, lock);
	}

	public deltaExtensions(acquiredLock: ExtensionDescriptionRegistryLock, toAdd: IExtensionDescription[], toRemove: ExtensionIdentifier[]): DeltaExtensionsResult {
		if (!acquiredLock.isAcquiredFor(this)) {
			throw new Error('Lock is not held');
		}
		return this._actual.deltaExtensions(toAdd, toRemove);
	}

	public containsActivationEvent(activationEvent: string): boolean {
		return this._actual.containsActivationEvent(activationEvent);
	}
	public containsExtension(extensionId: ExtensionIdentifier): boolean {
		return this._actual.containsExtension(extensionId);
	}
	public getExtensionDescriptionsForActivationEvent(activationEvent: string): IExtensionDescription[] {
		return this._actual.getExtensionDescriptionsForActivationEvent(activationEvent);
	}
	public getAllExtensionDescriptions(): IExtensionDescription[] {
		return this._actual.getAllExtensionDescriptions();
	}
	public getSnapshot(): ExtensionDescriptionRegistrySnapshot {
		return this._actual.getSnapshot();
	}
	public getExtensionDescription(extensionId: ExtensionIdentifier | string): IExtensionDescription | undefined {
		return this._actual.getExtensionDescription(extensionId);
	}
	public getExtensionDescriptionByUUID(uuid: string): IExtensionDescription | undefined {
		return this._actual.getExtensionDescriptionByUUID(uuid);
	}
	public getExtensionDescriptionByIdOrUUID(extensionId: ExtensionIdentifier | string, uuid: string | undefined): IExtensionDescription | undefined {
		return this._actual.getExtensionDescriptionByIdOrUUID(extensionId, uuid);
	}
}

export class ExtensionDescriptionRegistryLock extends Disposable {

	private _isDisposed = false;

	constructor(
		private readonly _registry: LockableExtensionDescriptionRegistry,
		lock: IDisposable
	) {
		super();
		this._register(lock);
	}

	public isAcquiredFor(registry: LockableExtensionDescriptionRegistry): boolean {
		return !this._isDisposed && this._registry === registry;
	}
}

class LockCustomer {
	public readonly promise: Promise<IDisposable>;
	private _resolve!: (value: IDisposable) => void;

	constructor(
		public readonly name: string
	) {
		this.promise = new Promise<IDisposable>((resolve, reject) => {
			this._resolve = resolve;
		});
	}

	resolve(value: IDisposable): void {
		this._resolve(value);
	}
}

class Lock {
	private readonly _pendingCustomers: LockCustomer[] = [];
	private _isLocked = false;

	public async acquire(customerName: string): Promise<IDisposable> {
		const customer = new LockCustomer(customerName);
		this._pendingCustomers.push(customer);
		this._advance();
		return customer.promise;
	}

	private _advance(): void {
		if (this._isLocked) {
			// cannot advance yet
			return;
		}
		if (this._pendingCustomers.length === 0) {
			// no more waiting customers
			return;
		}

		const customer = this._pendingCustomers.shift()!;

		this._isLocked = true;
		let customerHoldsLock = true;

		const logLongRunningCustomerTimeout = setTimeout(() => {
			if (customerHoldsLock) {
				console.warn(`The customer named ${customer.name} has been holding on to the lock for 30s. This might be a problem.`);
			}
		}, 30 * 1000 /* 30 seconds */);

		const releaseLock = () => {
			if (!customerHoldsLock) {
				return;
			}
			clearTimeout(logLongRunningCustomerTimeout);
			customerHoldsLock = false;
			this._isLocked = false;
			this._advance();
		};

		customer.resolve(toDisposable(releaseLock));
	}
}

const enum SortBucket {
	Builtin = 0,
	User = 1,
	Dev = 2
}

/**
 * Ensure that:
 * - first are builtin extensions
 * - second are user extensions
 * - third are extensions under development
 *
 * In each bucket, extensions must be sorted alphabetically by their folder name.
 */
function extensionCmp(a: IExtensionDescription, b: IExtensionDescription): number {
	const aSortBucket = (a.isBuiltin ? SortBucket.Builtin : a.isUnderDevelopment ? SortBucket.Dev : SortBucket.User);
	const bSortBucket = (b.isBuiltin ? SortBucket.Builtin : b.isUnderDevelopment ? SortBucket.Dev : SortBucket.User);
	if (aSortBucket !== bSortBucket) {
		return aSortBucket - bSortBucket;
	}
	const aLastSegment = path.posix.basename(a.extensionLocation.path);
	const bLastSegment = path.posix.basename(b.extensionLocation.path);
	if (aLastSegment < bLastSegment) {
		return -1;
	}
	if (aLastSegment > bLastSegment) {
		return 1;
	}
	return 0;
}

function removeExtensions(arr: IExtensionDescription[], toRemove: ExtensionIdentifier[]): IExtensionDescription[] {
	const toRemoveSet = new ExtensionIdentifierSet(toRemove);
	return arr.filter(extension => !toRemoveSet.has(extension.identifier));
}
