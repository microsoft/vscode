/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ExtensionKind } from 'vs/platform/environment/common/environment';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { ExtensionDescriptionRegistry } from 'vs/workbench/services/extensions/common/extensionDescriptionRegistry';
import { ExtensionHostKind, ExtensionRunningPreference, IExtensionHostKindPicker, determineExtensionHostKinds, extensionHostKindToString } from 'vs/workbench/services/extensions/common/extensionHostKind';
import { IExtensionHostManager } from 'vs/workbench/services/extensions/common/extensionHostManager';
import { IExtensionManifestPropertiesService } from 'vs/workbench/services/extensions/common/extensionManifestPropertiesService';
import { ExtensionRunningLocation, LocalProcessRunningLocation, LocalWebWorkerRunningLocation, RemoteRunningLocation } from 'vs/workbench/services/extensions/common/extensionRunningLocation';

export class ExtensionRunningLocationTracker {

	private _runningLocation = new Map<string, ExtensionRunningLocation | null>();
	private _maxLocalProcessAffinity: number = 0;
	private _maxLocalWebWorkerAffinity: number = 0;

	public get maxLocalProcessAffinity(): number {
		return this._maxLocalProcessAffinity;
	}

	public get maxLocalWebWorkerAffinity(): number {
		return this._maxLocalWebWorkerAffinity;
	}

	constructor(
		private readonly _registry: ExtensionDescriptionRegistry,
		private readonly _extensionHostKindPicker: IExtensionHostKindPicker,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
		@IExtensionManifestPropertiesService private readonly _extensionManifestPropertiesService: IExtensionManifestPropertiesService,
	) { }

	public readExtensionKinds(extensionDescription: IExtensionDescription): ExtensionKind[] {
		if (extensionDescription.isUnderDevelopment && this._environmentService.extensionDevelopmentKind) {
			return this._environmentService.extensionDevelopmentKind;
		}

		return this._extensionManifestPropertiesService.getExtensionKind(extensionDescription);
	}

	public getRunningLocation(extensionId: ExtensionIdentifier): ExtensionRunningLocation | null {
		return this._runningLocation.get(ExtensionIdentifier.toKey(extensionId)) || null;
	}

	public filterByRunningLocation(extensions: IExtensionDescription[], desiredRunningLocation: ExtensionRunningLocation): IExtensionDescription[] {
		return filterByRunningLocation(extensions, this._runningLocation, desiredRunningLocation);
	}

	public filterByExtensionHostKind(extensions: IExtensionDescription[], desiredExtensionHostKind: ExtensionHostKind): IExtensionDescription[] {
		return filterByExtensionHostKind(extensions, this._runningLocation, desiredExtensionHostKind);
	}

	public filterByExtensionHostManager(extensions: IExtensionDescription[], extensionHostManager: IExtensionHostManager): IExtensionDescription[] {
		return filterByExtensionHostManager(extensions, this._runningLocation, extensionHostManager);
	}

	private _computeAffinity(inputExtensions: IExtensionDescription[], extensionHostKind: ExtensionHostKind, isInitialAllocation: boolean): { affinities: Map<string, number>; maxAffinity: number } {
		// Only analyze extensions that can execute
		const extensions = new Map<string, IExtensionDescription>();
		for (const extension of inputExtensions) {
			if (extension.main || extension.browser) {
				extensions.set(ExtensionIdentifier.toKey(extension.identifier), extension);
			}
		}
		// Also add existing extensions of the same kind that can execute
		for (const extension of this._registry.getAllExtensionDescriptions()) {
			if (extension.main || extension.browser) {
				const runningLocation = this._runningLocation.get(ExtensionIdentifier.toKey(extension.identifier));
				if (runningLocation && runningLocation.kind === extensionHostKind) {
					extensions.set(ExtensionIdentifier.toKey(extension.identifier), extension);
				}
			}
		}

		// Initially, each extension belongs to its own group
		const groups = new Map<string, number>();
		let groupNumber = 0;
		for (const [_, extension] of extensions) {
			groups.set(ExtensionIdentifier.toKey(extension.identifier), ++groupNumber);
		}

		const changeGroup = (from: number, to: number) => {
			for (const [key, group] of groups) {
				if (group === from) {
					groups.set(key, to);
				}
			}
		};

		// We will group things together when there are dependencies
		for (const [_, extension] of extensions) {
			if (!extension.extensionDependencies) {
				continue;
			}
			const myGroup = groups.get(ExtensionIdentifier.toKey(extension.identifier))!;
			for (const depId of extension.extensionDependencies) {
				const depGroup = groups.get(ExtensionIdentifier.toKey(depId));
				if (!depGroup) {
					// probably can't execute, so it has no impact
					continue;
				}

				if (depGroup === myGroup) {
					// already in the same group
					continue;
				}

				changeGroup(depGroup, myGroup);
			}
		}

		// Initialize with existing affinities
		const resultingAffinities = new Map<number, number>();
		let lastAffinity = 0;
		for (const [_, extension] of extensions) {
			const runningLocation = this._runningLocation.get(ExtensionIdentifier.toKey(extension.identifier));
			if (runningLocation) {
				const group = groups.get(ExtensionIdentifier.toKey(extension.identifier))!;
				resultingAffinities.set(group, runningLocation.affinity);
				lastAffinity = Math.max(lastAffinity, runningLocation.affinity);
			}
		}

		// When doing extension host debugging, we will ignore the configured affinity
		// because we can currently debug a single extension host
		if (!this._environmentService.isExtensionDevelopment) {
			// Go through each configured affinity and try to accomodate it
			const configuredAffinities = this._configurationService.getValue<{ [extensionId: string]: number } | undefined>('extensions.experimental.affinity') || {};
			const configuredExtensionIds = Object.keys(configuredAffinities);
			const configuredAffinityToResultingAffinity = new Map<number, number>();
			for (const extensionId of configuredExtensionIds) {
				const configuredAffinity = configuredAffinities[extensionId];
				if (typeof configuredAffinity !== 'number' || configuredAffinity <= 0 || Math.floor(configuredAffinity) !== configuredAffinity) {
					this._logService.info(`Ignoring configured affinity for '${extensionId}' because the value is not a positive integer.`);
					continue;
				}
				const group = groups.get(ExtensionIdentifier.toKey(extensionId));
				if (!group) {
					this._logService.info(`Ignoring configured affinity for '${extensionId}' because the extension is unknown or cannot execute for extension host kind: ${extensionHostKindToString(extensionHostKind)}.`);
					continue;
				}

				const affinity1 = resultingAffinities.get(group);
				if (affinity1) {
					// Affinity for this group is already established
					configuredAffinityToResultingAffinity.set(configuredAffinity, affinity1);
					continue;
				}

				const affinity2 = configuredAffinityToResultingAffinity.get(configuredAffinity);
				if (affinity2) {
					// Affinity for this configuration is already established
					resultingAffinities.set(group, affinity2);
					continue;
				}

				if (!isInitialAllocation) {
					this._logService.info(`Ignoring configured affinity for '${extensionId}' because extension host(s) are already running. Reload window.`);
					continue;
				}

				const affinity3 = ++lastAffinity;
				configuredAffinityToResultingAffinity.set(configuredAffinity, affinity3);
				resultingAffinities.set(group, affinity3);
			}
		}

		const result = new Map<string, number>();
		for (const extension of inputExtensions) {
			const group = groups.get(ExtensionIdentifier.toKey(extension.identifier)) || 0;
			const affinity = resultingAffinities.get(group) || 0;
			result.set(ExtensionIdentifier.toKey(extension.identifier), affinity);
		}

		if (lastAffinity > 0 && isInitialAllocation) {
			for (let affinity = 1; affinity <= lastAffinity; affinity++) {
				const extensionIds: ExtensionIdentifier[] = [];
				for (const extension of inputExtensions) {
					if (result.get(ExtensionIdentifier.toKey(extension.identifier)) === affinity) {
						extensionIds.push(extension.identifier);
					}
				}
				this._logService.info(`Placing extension(s) ${extensionIds.map(e => e.value).join(', ')} on a separate extension host.`);
			}
		}

		return { affinities: result, maxAffinity: lastAffinity };
	}

	public computeRunningLocation(localExtensions: IExtensionDescription[], remoteExtensions: IExtensionDescription[], isInitialAllocation: boolean): { runningLocation: Map<string, ExtensionRunningLocation | null>; maxLocalProcessAffinity: number; maxLocalWebWorkerAffinity: number } {
		const extensionHostKinds = determineExtensionHostKinds(
			localExtensions,
			remoteExtensions,
			(extension) => this.readExtensionKinds(extension),
			(extensionId, extensionKinds, isInstalledLocally, isInstalledRemotely, preference) => this._extensionHostKindPicker.pickExtensionHostKind(extensionId, extensionKinds, isInstalledLocally, isInstalledRemotely, preference)
		);

		const extensions = new Map<string, IExtensionDescription>();
		for (const extension of localExtensions) {
			extensions.set(ExtensionIdentifier.toKey(extension.identifier), extension);
		}
		for (const extension of remoteExtensions) {
			extensions.set(ExtensionIdentifier.toKey(extension.identifier), extension);
		}

		const result = new Map<string, ExtensionRunningLocation | null>();
		const localProcessExtensions: IExtensionDescription[] = [];
		const localWebWorkerExtensions: IExtensionDescription[] = [];
		for (const [extensionIdKey, extensionHostKind] of extensionHostKinds) {
			let runningLocation: ExtensionRunningLocation | null = null;
			if (extensionHostKind === ExtensionHostKind.LocalProcess) {
				const extensionDescription = extensions.get(ExtensionIdentifier.toKey(extensionIdKey));
				if (extensionDescription) {
					localProcessExtensions.push(extensionDescription);
				}
			} else if (extensionHostKind === ExtensionHostKind.LocalWebWorker) {
				const extensionDescription = extensions.get(ExtensionIdentifier.toKey(extensionIdKey));
				if (extensionDescription) {
					localWebWorkerExtensions.push(extensionDescription);
				}
			} else if (extensionHostKind === ExtensionHostKind.Remote) {
				runningLocation = new RemoteRunningLocation();
			}
			result.set(extensionIdKey, runningLocation);
		}

		const { affinities, maxAffinity } = this._computeAffinity(localProcessExtensions, ExtensionHostKind.LocalProcess, isInitialAllocation);
		for (const extension of localProcessExtensions) {
			const affinity = affinities.get(ExtensionIdentifier.toKey(extension.identifier)) || 0;
			result.set(ExtensionIdentifier.toKey(extension.identifier), new LocalProcessRunningLocation(affinity));
		}
		const { affinities: localWebWorkerAffinities, maxAffinity: maxLocalWebWorkerAffinity } = this._computeAffinity(localWebWorkerExtensions, ExtensionHostKind.LocalWebWorker, isInitialAllocation);
		for (const extension of localWebWorkerExtensions) {
			const affinity = localWebWorkerAffinities.get(ExtensionIdentifier.toKey(extension.identifier)) || 0;
			result.set(ExtensionIdentifier.toKey(extension.identifier), new LocalWebWorkerRunningLocation(affinity));
		}

		return { runningLocation: result, maxLocalProcessAffinity: maxAffinity, maxLocalWebWorkerAffinity: maxLocalWebWorkerAffinity };
	}

	public initializeRunningLocation(localExtensions: IExtensionDescription[], remoteExtensions: IExtensionDescription[]): void {
		const { runningLocation, maxLocalProcessAffinity, maxLocalWebWorkerAffinity } = this.computeRunningLocation(localExtensions, remoteExtensions, true);
		this._runningLocation = runningLocation;
		this._maxLocalProcessAffinity = maxLocalProcessAffinity;
		this._maxLocalWebWorkerAffinity = maxLocalWebWorkerAffinity;
	}

	/**
	 * Returns the running locations for the removed extensions.
	 */
	public deltaExtensions(toAdd: IExtensionDescription[], toRemove: ExtensionIdentifier[]): Map<string, ExtensionRunningLocation | null> {
		// Remove old running location
		const removedRunningLocation = new Map<string, ExtensionRunningLocation | null>();
		for (const extensionId of toRemove) {
			const extensionKey = ExtensionIdentifier.toKey(extensionId);
			removedRunningLocation.set(extensionKey, this._runningLocation.get(extensionKey) || null);
			this._runningLocation.delete(extensionKey);
		}

		// Determine new running location
		this._updateRunningLocationForAddedExtensions(toAdd);

		return removedRunningLocation;
	}

	/**
	 * Update `this._runningLocation` with running locations for newly enabled/installed extensions.
	 */
	private _updateRunningLocationForAddedExtensions(toAdd: IExtensionDescription[]): void {
		// Determine new running location
		const localProcessExtensions: IExtensionDescription[] = [];
		const localWebWorkerExtensions: IExtensionDescription[] = [];
		for (const extension of toAdd) {
			const extensionKind = this.readExtensionKinds(extension);
			const isRemote = extension.extensionLocation.scheme === Schemas.vscodeRemote;
			const extensionHostKind = this._extensionHostKindPicker.pickExtensionHostKind(extension.identifier, extensionKind, !isRemote, isRemote, ExtensionRunningPreference.None);
			let runningLocation: ExtensionRunningLocation | null = null;
			if (extensionHostKind === ExtensionHostKind.LocalProcess) {
				localProcessExtensions.push(extension);
			} else if (extensionHostKind === ExtensionHostKind.LocalWebWorker) {
				localWebWorkerExtensions.push(extension);
			} else if (extensionHostKind === ExtensionHostKind.Remote) {
				runningLocation = new RemoteRunningLocation();
			}
			this._runningLocation.set(ExtensionIdentifier.toKey(extension.identifier), runningLocation);
		}

		const { affinities } = this._computeAffinity(localProcessExtensions, ExtensionHostKind.LocalProcess, false);
		for (const extension of localProcessExtensions) {
			const affinity = affinities.get(ExtensionIdentifier.toKey(extension.identifier)) || 0;
			this._runningLocation.set(ExtensionIdentifier.toKey(extension.identifier), new LocalProcessRunningLocation(affinity));
		}

		const { affinities: webWorkerExtensionsAffinities } = this._computeAffinity(localWebWorkerExtensions, ExtensionHostKind.LocalWebWorker, false);
		for (const extension of localWebWorkerExtensions) {
			const affinity = webWorkerExtensionsAffinities.get(ExtensionIdentifier.toKey(extension.identifier)) || 0;
			this._runningLocation.set(ExtensionIdentifier.toKey(extension.identifier), new LocalWebWorkerRunningLocation(affinity));
		}
	}
}

export function filterByRunningLocation(extensions: IExtensionDescription[], runningLocation: Map<string, ExtensionRunningLocation | null>, desiredRunningLocation: ExtensionRunningLocation): IExtensionDescription[] {
	return _filterByRunningLocation(extensions, ext => ext.identifier, runningLocation, desiredRunningLocation);
}

function _filterByRunningLocation<T>(extensions: T[], extId: (item: T) => ExtensionIdentifier, runningLocation: Map<string, ExtensionRunningLocation | null>, desiredRunningLocation: ExtensionRunningLocation): T[] {
	return _filterExtensions(extensions, extId, runningLocation, extRunningLocation => desiredRunningLocation.equals(extRunningLocation));
}

function filterByExtensionHostKind(extensions: IExtensionDescription[], runningLocation: Map<string, ExtensionRunningLocation | null>, desiredExtensionHostKind: ExtensionHostKind): IExtensionDescription[] {
	return _filterExtensions(extensions, ext => ext.identifier, runningLocation, extRunningLocation => extRunningLocation.kind === desiredExtensionHostKind);
}

function filterByExtensionHostManager(extensions: IExtensionDescription[], runningLocation: Map<string, ExtensionRunningLocation | null>, extensionHostManager: IExtensionHostManager): IExtensionDescription[] {
	return _filterByExtensionHostManager(extensions, ext => ext.identifier, runningLocation, extensionHostManager);
}

export function _filterByExtensionHostManager<T>(extensions: T[], extId: (item: T) => ExtensionIdentifier, runningLocation: Map<string, ExtensionRunningLocation | null>, extensionHostManager: IExtensionHostManager): T[] {
	return _filterExtensions(extensions, extId, runningLocation, extRunningLocation => extensionHostManager.representsRunningLocation(extRunningLocation));
}

function _filterExtensions<T>(extensions: T[], extId: (item: T) => ExtensionIdentifier, runningLocation: Map<string, ExtensionRunningLocation | null>, predicate: (extRunningLocation: ExtensionRunningLocation) => boolean): T[] {
	return extensions.filter((ext) => {
		const extRunningLocation = runningLocation.get(ExtensionIdentifier.toKey(extId(ext)));
		return extRunningLocation && predicate(extRunningLocation);
	});
}
