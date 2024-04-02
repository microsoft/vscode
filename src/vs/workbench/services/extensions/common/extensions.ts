/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import Severity from 'vs/base/common/severity';
import { URI } from 'vs/base/common/uri';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import { getExtensionId, getGalleryExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { ImplicitActivationEvents } from 'vs/platform/extensionManagement/common/implicitActivationEvents';
import { ExtensionIdentifier, ExtensionIdentifierMap, ExtensionIdentifierSet, ExtensionType, IExtension, IExtensionContributions, IExtensionDescription, TargetPlatform } from 'vs/platform/extensions/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IV8Profile } from 'vs/platform/profiling/common/profiling';
import { ExtensionHostKind } from 'vs/workbench/services/extensions/common/extensionHostKind';
import { IExtensionDescriptionDelta, IExtensionDescriptionSnapshot } from 'vs/workbench/services/extensions/common/extensionHostProtocol';
import { ExtensionRunningLocation } from 'vs/workbench/services/extensions/common/extensionRunningLocation';
import { ApiProposalName } from 'vs/workbench/services/extensions/common/extensionsApiProposals';
import { IExtensionPoint } from 'vs/workbench/services/extensions/common/extensionsRegistry';

export const nullExtensionDescription = Object.freeze<IExtensionDescription>({
	identifier: new ExtensionIdentifier('nullExtensionDescription'),
	name: 'Null Extension Description',
	version: '0.0.0',
	publisher: 'vscode',
	engines: { vscode: '' },
	extensionLocation: URI.parse('void:location'),
	isBuiltin: false,
	targetPlatform: TargetPlatform.UNDEFINED,
	isUserBuiltin: false,
	isUnderDevelopment: false,
});

export type WebWorkerExtHostConfigValue = boolean | 'auto';
export const webWorkerExtHostConfig = 'extensions.webWorker';

export const IExtensionService = createDecorator<IExtensionService>('extensionService');

export interface IMessage {
	type: Severity;
	message: string;
	extensionId: ExtensionIdentifier;
	extensionPointId: string;
}

export interface IExtensionsStatus {
	id: ExtensionIdentifier;
	messages: IMessage[];
	activationStarted: boolean;
	activationTimes: ActivationTimes | undefined;
	runtimeErrors: Error[];
	runningLocation: ExtensionRunningLocation | null;
}

export class MissingExtensionDependency {
	constructor(readonly dependency: string) { }
}

/**
 * e.g.
 * ```
 * {
 *    startTime: 1511954813493000,
 *    endTime: 1511954835590000,
 *    deltas: [ 100, 1500, 123456, 1500, 100000 ],
 *    ids: [ 'idle', 'self', 'extension1', 'self', 'idle' ]
 * }
 * ```
 */
export interface IExtensionHostProfile {
	/**
	 * Profiling start timestamp in microseconds.
	 */
	startTime: number;
	/**
	 * Profiling end timestamp in microseconds.
	 */
	endTime: number;
	/**
	 * Duration of segment in microseconds.
	 */
	deltas: number[];
	/**
	 * Segment identifier: extension id or one of the four known strings.
	 */
	ids: ProfileSegmentId[];

	/**
	 * Get the information as a .cpuprofile.
	 */
	data: IV8Profile;

	/**
	 * Get the aggregated time per segmentId
	 */
	getAggregatedTimes(): Map<ProfileSegmentId, number>;
}

export const enum ExtensionHostStartup {
	/**
	 * The extension host should be launched immediately and doesn't require a `$startExtensionHost` call.
	 */
	EagerAutoStart = 1,
	/**
	 * The extension host should be launched immediately and needs a `$startExtensionHost` call.
	 */
	EagerManualStart = 2,
	/**
	 * The extension host should be launched lazily and only when it has extensions it needs to host. It needs a `$startExtensionHost` call.
	 */
	Lazy = 3,
}

export interface IExtensionHost {
	readonly pid: number | null;
	readonly runningLocation: ExtensionRunningLocation;
	readonly remoteAuthority: string | null;
	readonly startup: ExtensionHostStartup;
	/**
	 * A collection of extensions which includes information about which
	 * extension will execute or is executing on this extension host.
	 * **NOTE**: this will reflect extensions correctly only after `start()` resolves.
	 */
	readonly extensions: ExtensionHostExtensions | null;
	readonly onExit: Event<[number, string | null]>;

	start(): Promise<IMessagePassingProtocol>;
	getInspectPort(): number | undefined;
	enableInspectPort(): Promise<boolean>;
	dispose(): void;
}

export class ExtensionHostExtensions {
	private _versionId: number;
	private _allExtensions: IExtensionDescription[];
	private _myExtensions: ExtensionIdentifier[];
	private _myActivationEvents: Set<string> | null;

	public get versionId(): number {
		return this._versionId;
	}

	public get allExtensions(): IExtensionDescription[] {
		return this._allExtensions;
	}

	public get myExtensions(): ExtensionIdentifier[] {
		return this._myExtensions;
	}

	constructor(versionId: number, allExtensions: readonly IExtensionDescription[], myExtensions: ExtensionIdentifier[]) {
		this._versionId = versionId;
		this._allExtensions = allExtensions.slice(0);
		this._myExtensions = myExtensions.slice(0);
		this._myActivationEvents = null;
	}

	toSnapshot(): IExtensionDescriptionSnapshot {
		return {
			versionId: this._versionId,
			allExtensions: this._allExtensions,
			myExtensions: this._myExtensions,
			activationEvents: ImplicitActivationEvents.createActivationEventsMap(this._allExtensions)
		};
	}

	public set(versionId: number, allExtensions: IExtensionDescription[], myExtensions: ExtensionIdentifier[]): IExtensionDescriptionDelta {
		if (this._versionId > versionId) {
			throw new Error(`ExtensionHostExtensions: invalid versionId ${versionId} (current: ${this._versionId})`);
		}
		const toRemove: ExtensionIdentifier[] = [];
		const toAdd: IExtensionDescription[] = [];
		const myToRemove: ExtensionIdentifier[] = [];
		const myToAdd: ExtensionIdentifier[] = [];

		const oldExtensionsMap = extensionDescriptionArrayToMap(this._allExtensions);
		const newExtensionsMap = extensionDescriptionArrayToMap(allExtensions);
		const extensionsAreTheSame = (a: IExtensionDescription, b: IExtensionDescription) => {
			return (
				(a.extensionLocation.toString() === b.extensionLocation.toString())
				|| (a.isBuiltin === b.isBuiltin)
				|| (a.isUserBuiltin === b.isUserBuiltin)
				|| (a.isUnderDevelopment === b.isUnderDevelopment)
			);
		};

		for (const oldExtension of this._allExtensions) {
			const newExtension = newExtensionsMap.get(oldExtension.identifier);
			if (!newExtension) {
				toRemove.push(oldExtension.identifier);
				oldExtensionsMap.delete(oldExtension.identifier);
				continue;
			}
			if (!extensionsAreTheSame(oldExtension, newExtension)) {
				// The new extension is different than the old one
				// (e.g. maybe it executes in a different location)
				toRemove.push(oldExtension.identifier);
				oldExtensionsMap.delete(oldExtension.identifier);
				continue;
			}
		}
		for (const newExtension of allExtensions) {
			const oldExtension = oldExtensionsMap.get(newExtension.identifier);
			if (!oldExtension) {
				toAdd.push(newExtension);
				continue;
			}
			if (!extensionsAreTheSame(oldExtension, newExtension)) {
				// The new extension is different than the old one
				// (e.g. maybe it executes in a different location)
				toRemove.push(oldExtension.identifier);
				oldExtensionsMap.delete(oldExtension.identifier);
				continue;
			}
		}

		const myOldExtensionsSet = new ExtensionIdentifierSet(this._myExtensions);
		const myNewExtensionsSet = new ExtensionIdentifierSet(myExtensions);
		for (const oldExtensionId of this._myExtensions) {
			if (!myNewExtensionsSet.has(oldExtensionId)) {
				myToRemove.push(oldExtensionId);
			}
		}
		for (const newExtensionId of myExtensions) {
			if (!myOldExtensionsSet.has(newExtensionId)) {
				myToAdd.push(newExtensionId);
			}
		}

		const addActivationEvents = ImplicitActivationEvents.createActivationEventsMap(toAdd);
		const delta = { versionId, toRemove, toAdd, addActivationEvents, myToRemove, myToAdd };
		this.delta(delta);
		return delta;
	}

	public delta(extensionsDelta: IExtensionDescriptionDelta): IExtensionDescriptionDelta | null {
		if (this._versionId >= extensionsDelta.versionId) {
			// ignore older deltas
			return null;
		}

		const { toRemove, toAdd, myToRemove, myToAdd } = extensionsDelta;
		// First handle removals
		const toRemoveSet = new ExtensionIdentifierSet(toRemove);
		const myToRemoveSet = new ExtensionIdentifierSet(myToRemove);
		for (let i = 0; i < this._allExtensions.length; i++) {
			if (toRemoveSet.has(this._allExtensions[i].identifier)) {
				this._allExtensions.splice(i, 1);
				i--;
			}
		}
		for (let i = 0; i < this._myExtensions.length; i++) {
			if (myToRemoveSet.has(this._myExtensions[i])) {
				this._myExtensions.splice(i, 1);
				i--;
			}
		}
		// Then handle additions
		for (const extension of toAdd) {
			this._allExtensions.push(extension);
		}
		for (const extensionId of myToAdd) {
			this._myExtensions.push(extensionId);
		}

		// clear cached activation events
		this._myActivationEvents = null;

		return extensionsDelta;
	}

	public containsExtension(extensionId: ExtensionIdentifier): boolean {
		for (const myExtensionId of this._myExtensions) {
			if (ExtensionIdentifier.equals(myExtensionId, extensionId)) {
				return true;
			}
		}
		return false;
	}

	public containsActivationEvent(activationEvent: string): boolean {
		if (!this._myActivationEvents) {
			this._myActivationEvents = this._readMyActivationEvents();
		}
		return this._myActivationEvents.has(activationEvent);
	}

	private _readMyActivationEvents(): Set<string> {
		const result = new Set<string>();

		for (const extensionDescription of this._allExtensions) {
			if (!this.containsExtension(extensionDescription.identifier)) {
				continue;
			}

			const activationEvents = ImplicitActivationEvents.readActivationEvents(extensionDescription);
			for (const activationEvent of activationEvents) {
				result.add(activationEvent);
			}
		}

		return result;
	}
}

function extensionDescriptionArrayToMap(extensions: IExtensionDescription[]): ExtensionIdentifierMap<IExtensionDescription> {
	const result = new ExtensionIdentifierMap<IExtensionDescription>();
	for (const extension of extensions) {
		result.set(extension.identifier, extension);
	}
	return result;
}

export function isProposedApiEnabled(extension: IExtensionDescription, proposal: ApiProposalName): boolean {
	if (!extension.enabledApiProposals) {
		return false;
	}
	return extension.enabledApiProposals.includes(proposal);
}

export function checkProposedApiEnabled(extension: IExtensionDescription, proposal: ApiProposalName): void {
	if (!isProposedApiEnabled(extension, proposal)) {
		throw new Error(`Extension '${extension.identifier.value}' CANNOT use API proposal: ${proposal}.\nIts package.json#enabledApiProposals-property declares: ${extension.enabledApiProposals?.join(', ') ?? '[]'} but NOT ${proposal}.\n The missing proposal MUST be added and you must start in extension development mode or use the following command line switch: --enable-proposed-api ${extension.identifier.value}`);
	}
}


/**
 * Extension id or one of the four known program states.
 */
export type ProfileSegmentId = string | 'idle' | 'program' | 'gc' | 'self';

export interface ExtensionActivationReason {
	readonly startup: boolean;
	readonly extensionId: ExtensionIdentifier;
	readonly activationEvent: string;
}

export class ActivationTimes {
	constructor(
		public readonly codeLoadingTime: number,
		public readonly activateCallTime: number,
		public readonly activateResolvedTime: number,
		public readonly activationReason: ExtensionActivationReason
	) {
	}
}

export class ExtensionPointContribution<T> {
	readonly description: IExtensionDescription;
	readonly value: T;

	constructor(description: IExtensionDescription, value: T) {
		this.description = description;
		this.value = value;
	}
}

export interface IWillActivateEvent {
	readonly event: string;
	readonly activation: Promise<void>;
}

export interface IResponsiveStateChangeEvent {
	extensionHostKind: ExtensionHostKind;
	isResponsive: boolean;
	/**
	 * Return the inspect port or `0`. `0` means inspection is not possible.
	 */
	getInspectPort(tryEnableInspector: boolean): Promise<number>;
}

export const enum ActivationKind {
	Normal = 0,
	Immediate = 1
}

export interface WillStopExtensionHostsEvent {

	/**
	 * A human readable reason for stopping the extension hosts
	 * that e.g. can be shown in a confirmation dialog to the
	 * user.
	 */
	readonly reason: string;

	/**
	 * Allows to veto the stopping of extension hosts. The veto can be a long running
	 * operation.
	 *
	 * @param reason a human readable reason for vetoing the extension host stop in case
	 * where the resolved `value: true`.
	 */
	veto(value: boolean | Promise<boolean>, reason: string): void;
}

export interface IExtensionService {
	readonly _serviceBrand: undefined;

	/**
	 * An event emitted when extensions are registered after their extension points got handled.
	 *
	 * This event will also fire on startup to signal the installed extensions.
	 *
	 * @returns the extensions that got registered
	 */
	onDidRegisterExtensions: Event<void>;

	/**
	 * @event
	 * Fired when extensions status changes.
	 * The event contains the ids of the extensions that have changed.
	 */
	onDidChangeExtensionsStatus: Event<ExtensionIdentifier[]>;

	/**
	 * Fired when the available extensions change (i.e. when extensions are added or removed).
	 */
	onDidChangeExtensions: Event<{ readonly added: readonly IExtensionDescription[]; readonly removed: readonly IExtensionDescription[] }>;

	/**
	 * All registered extensions.
	 * - List will be empty initially during workbench startup and will be filled with extensions as they are registered
	 * - Listen to `onDidChangeExtensions` event for any changes to the extensions list. It will change as extensions get registered or de-reigstered.
	 * - Listen to `onDidRegisterExtensions` event or wait for `whenInstalledExtensionsRegistered` promise to get the initial list of registered extensions.
	 */
	readonly extensions: readonly IExtensionDescription[];

	/**
	 * An event that is fired when activation happens.
	 */
	onWillActivateByEvent: Event<IWillActivateEvent>;

	/**
	 * An event that is fired when an extension host changes its
	 * responsive-state.
	 */
	onDidChangeResponsiveChange: Event<IResponsiveStateChangeEvent>;

	/**
	 * Fired before stop of extension hosts happens. Allows listeners to veto against the
	 * stop to prevent it from happening.
	 */
	onWillStop: Event<WillStopExtensionHostsEvent>;

	/**
	 * Send an activation event and activate interested extensions.
	 *
	 * This will wait for the normal startup of the extension host(s).
	 *
	 * In extraordinary circumstances, if the activation event needs to activate
	 * one or more extensions before the normal startup is finished, then you can use
	 * `ActivationKind.Immediate`. Please do not use this flag unless really necessary
	 * and you understand all consequences.
	 */
	activateByEvent(activationEvent: string, activationKind?: ActivationKind): Promise<void>;

	/**
	 * Send an activation ID and activate interested extensions.
	 *
	 */
	activateById(extensionId: ExtensionIdentifier, reason: ExtensionActivationReason): Promise<void>;

	/**
	 * Determine if `activateByEvent(activationEvent)` has resolved already.
	 *
	 * i.e. the activation event is finished and all interested extensions are already active.
	 */
	activationEventIsDone(activationEvent: string): boolean;

	/**
	 * An promise that resolves when the installed extensions are registered after
	 * their extension points got handled.
	 */
	whenInstalledExtensionsRegistered(): Promise<boolean>;

	/**
	 * Return a specific extension
	 * @param id An extension id
	 */
	getExtension(id: string): Promise<IExtensionDescription | undefined>;

	/**
	 * Returns `true` if the given extension can be added. Otherwise `false`.
	 * @param extension An extension
	 */
	canAddExtension(extension: IExtensionDescription): boolean;

	/**
	 * Returns `true` if the given extension can be removed. Otherwise `false`.
	 * @param extension An extension
	 */
	canRemoveExtension(extension: IExtensionDescription): boolean;

	/**
	 * Read all contributions to an extension point.
	 */
	readExtensionPointContributions<T extends IExtensionContributions[keyof IExtensionContributions]>(extPoint: IExtensionPoint<T>): Promise<ExtensionPointContribution<T>[]>;

	/**
	 * Get information about extensions status.
	 */
	getExtensionsStatus(): { [id: string]: IExtensionsStatus };

	/**
	 * Return the inspect ports (if inspection is possible) for extension hosts of kind `extensionHostKind`.
	 */
	getInspectPorts(extensionHostKind: ExtensionHostKind, tryEnableInspector: boolean): Promise<number[]>;

	/**
	 * Stops the extension hosts.
	 *
	 * @param reason a human readable reason for stopping the extension hosts. This maybe
	 * can be presented to the user when showing dialogs.
	 *
	 * @returns a promise that resolves to `true` if the extension hosts were stopped, `false`
	 * if the operation was vetoed by listeners of the `onWillStop` event.
	 */
	stopExtensionHosts(reason: string): Promise<boolean>;

	/**
	 * Starts the extension hosts. If updates are provided, the extension hosts are started with the given updates.
	 */
	startExtensionHosts(updates?: { readonly toAdd: readonly IExtension[]; readonly toRemove: readonly string[] }): Promise<void>;

	/**
	 * Modify the environment of the remote extension host
	 * @param env New properties for the remote extension host
	 */
	setRemoteEnvironment(env: { [key: string]: string | null }): Promise<void>;
}

export interface IInternalExtensionService {
	_activateById(extensionId: ExtensionIdentifier, reason: ExtensionActivationReason): Promise<void>;
	_onWillActivateExtension(extensionId: ExtensionIdentifier): void;
	_onDidActivateExtension(extensionId: ExtensionIdentifier, codeLoadingTime: number, activateCallTime: number, activateResolvedTime: number, activationReason: ExtensionActivationReason): void;
	_onDidActivateExtensionError(extensionId: ExtensionIdentifier, error: Error): void;
	_onExtensionRuntimeError(extensionId: ExtensionIdentifier, err: Error): void;
}

export interface ProfileSession {
	stop(): Promise<IExtensionHostProfile>;
}

export function toExtension(extensionDescription: IExtensionDescription): IExtension {
	return {
		type: extensionDescription.isBuiltin ? ExtensionType.System : ExtensionType.User,
		isBuiltin: extensionDescription.isBuiltin || extensionDescription.isUserBuiltin,
		identifier: { id: getGalleryExtensionId(extensionDescription.publisher, extensionDescription.name), uuid: extensionDescription.uuid },
		manifest: extensionDescription,
		location: extensionDescription.extensionLocation,
		targetPlatform: extensionDescription.targetPlatform,
		validations: [],
		isValid: true
	};
}

export function toExtensionDescription(extension: IExtension, isUnderDevelopment?: boolean): IExtensionDescription {
	return {
		identifier: new ExtensionIdentifier(getExtensionId(extension.manifest.publisher, extension.manifest.name)),
		isBuiltin: extension.type === ExtensionType.System,
		isUserBuiltin: extension.type === ExtensionType.User && extension.isBuiltin,
		isUnderDevelopment: !!isUnderDevelopment,
		extensionLocation: extension.location,
		...extension.manifest,
		uuid: extension.identifier.uuid,
		targetPlatform: extension.targetPlatform
	};
}


export class NullExtensionService implements IExtensionService {
	declare readonly _serviceBrand: undefined;
	onDidRegisterExtensions: Event<void> = Event.None;
	onDidChangeExtensionsStatus: Event<ExtensionIdentifier[]> = Event.None;
	onDidChangeExtensions = Event.None;
	onWillActivateByEvent: Event<IWillActivateEvent> = Event.None;
	onDidChangeResponsiveChange: Event<IResponsiveStateChangeEvent> = Event.None;
	onWillStop: Event<WillStopExtensionHostsEvent> = Event.None;
	readonly extensions = [];
	activateByEvent(_activationEvent: string): Promise<void> { return Promise.resolve(undefined); }
	activateById(extensionId: ExtensionIdentifier, reason: ExtensionActivationReason): Promise<void> { return Promise.resolve(undefined); }
	activationEventIsDone(_activationEvent: string): boolean { return false; }
	whenInstalledExtensionsRegistered(): Promise<boolean> { return Promise.resolve(true); }
	getExtension() { return Promise.resolve(undefined); }
	readExtensionPointContributions<T>(_extPoint: IExtensionPoint<T>): Promise<ExtensionPointContribution<T>[]> { return Promise.resolve(Object.create(null)); }
	getExtensionsStatus(): { [id: string]: IExtensionsStatus } { return Object.create(null); }
	getInspectPorts(_extensionHostKind: ExtensionHostKind, _tryEnableInspector: boolean): Promise<number[]> { return Promise.resolve([]); }
	stopExtensionHosts(): any { }
	async startExtensionHosts(): Promise<void> { }
	async setRemoteEnvironment(_env: { [key: string]: string | null }): Promise<void> { }
	canAddExtension(): boolean { return false; }
	canRemoveExtension(): boolean { return false; }
}
