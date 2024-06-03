/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ExtensionKind } from 'vs/platform/environment/common/environment';
import { ExtensionIdentifier, ExtensionIdentifierMap, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IReadOnlyExtensionDescriptionRegistry } from 'vs/workbench/services/extensions/common/extensionDescriptionRegistry';
import { ExtensionHostKind, ExtensionRunningPreference, IExtensionHostKindPicker, determineExtensionHostKinds } from 'vs/workbench/services/extensions/common/extensionHostKind';
import { IExtensionHostManager } from 'vs/workbench/services/extensions/common/extensionHostManagers';
import { IExtensionManifestPropertiesService } from 'vs/workbench/services/extensions/common/extensionManifestPropertiesService';
import { ExtensionRunningLocation, LocalProcessRunningLocation, LocalWebWorkerRunningLocation, RemoteRunningLocation } from 'vs/workbench/services/extensions/common/extensionRunningLocation';

export class ExtensionRunningLocationTracker {

	private _runningLocation = new ExtensionIdentifierMap<ExtensionRunningLocation | null>();
	private _maxLocalProcessAffinity: number = 0;
	private _maxLocalWebWorkerAffinity: number = 0;

	public get maxLocalProcessAffinity(): number {
		return this._maxLocalProcessAffinity;
	}

	public get maxLocalWebWorkerAffinity(): number {
		return this._maxLocalWebWorkerAffinity;
	}

	constructor(
		private readonly _registry: IReadOnlyExtensionDescriptionRegistry,
		private readonly _extensionHostKindPicker: IExtensionHostKindPicker,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
		@IExtensionManifestPropertiesService private readonly _extensionManifestPropertiesService: IExtensionManifestPropertiesService,
	) { }

	public set(extensionId: ExtensionIdentifier, runningLocation: ExtensionRunningLocation) {
		this._runningLocation.set(extensionId, runningLocation);
	}

	public readExtensionKinds(extensionDescription: IExtensionDescription): ExtensionKind[] {
		if (extensionDescription.isUnderDevelopment && this._environmentService.extensionDevelopmentKind) {
			return this._environmentService.extensionDevelopmentKind;
		}

		return this._extensionManifestPropertiesService.getExtensionKind(extensionDescription);
	}

	public getRunningLocation(extensionId: ExtensionIdentifier): ExtensionRunningLocation | null {
		return this._runningLocation.get(extensionId) || null;
	}

	public filterByRunningLocation(extensions: readonly IExtensionDescription[], desiredRunningLocation: ExtensionRunningLocation): IExtensionDescription[] {
		return filterExtensionDescriptions(extensions, this._runningLocation, extRunningLocation => desiredRunningLocation.equals(extRunningLocation));
	}

	public filterByExtensionHostKind(extensions: readonly IExtensionDescription[], desiredExtensionHostKind: ExtensionHostKind): IExtensionDescription[] {
		return filterExtensionDescriptions(extensions, this._runningLocation, extRunningLocation => extRunningLocation.kind === desiredExtensionHostKind);
	}

	public filterByExtensionHostManager(extensions: readonly IExtensionDescription[], extensionHostManager: IExtensionHostManager): IExtensionDescription[] {
		return filterExtensionDescriptions(extensions, this._runningLocation, extRunningLocation => extensionHostManager.representsRunningLocation(extRunningLocation));
	}

	private _computeAffinity(inputExtensions: IExtensionDescription[], extensionHostKind: ExtensionHostKind, isInitialAllocation: boolean): { affinities: ExtensionIdentifierMap<number>; maxAffinity: number } {
		// Only analyze extensions that can execute
		const extensions = new ExtensionIdentifierMap<IExtensionDescription>();
		for (const extension of inputExtensions) {
			if (extension.main || extension.browser) {
				extensions.set(extension.identifier, extension);
			}
		}
		// Also add existing extensions of the same kind that can execute
		for (const extension of this._registry.getAllExtensionDescriptions()) {
			if (extension.main || extension.browser) {
				const runningLocation = this._runningLocation.get(extension.identifier);
				if (runningLocation && runningLocation.kind === extensionHostKind) {
					extensions.set(extension.identifier, extension);
				}
			}
		}

		// Initially, each extension belongs to its own group
		const groups = new ExtensionIdentifierMap<number>();
		let groupNumber = 0;
		for (const [_, extension] of extensions) {
			groups.set(extension.identifier, ++groupNumber);
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
			const myGroup = groups.get(extension.identifier)!;
			for (const depId of extension.extensionDependencies) {
				const depGroup = groups.get(depId);
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
			const runningLocation = this._runningLocation.get(extension.identifier);
			if (runningLocation) {
				const group = groups.get(extension.identifier)!;
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
				const group = groups.get(extensionId);
				if (!group) {
					// The extension is not known or cannot execute for this extension host kind
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

		const result = new ExtensionIdentifierMap<number>();
		for (const extension of inputExtensions) {
			const group = groups.get(extension.identifier) || 0;
			const affinity = resultingAffinities.get(group) || 0;
			result.set(extension.identifier, affinity);
		}

		if (lastAffinity > 0 && isInitialAllocation) {
			for (let affinity = 1; affinity <= lastAffinity; affinity++) {
				const extensionIds: ExtensionIdentifier[] = [];
				for (const extension of inputExtensions) {
					if (result.get(extension.identifier) === affinity) {
						extensionIds.push(extension.identifier);
					}
				}
				this._logService.info(`Placing extension(s) ${extensionIds.map(e => e.value).join(', ')} on a separate extension host.`);
			}
		}

		return { affinities: result, maxAffinity: lastAffinity };
	}

	public computeRunningLocation(localExtensions: IExtensionDescription[], remoteExtensions: IExtensionDescription[], isInitialAllocation: boolean): ExtensionIdentifierMap<ExtensionRunningLocation | null> {
		return this._doComputeRunningLocation(this._runningLocation, localExtensions, remoteExtensions, isInitialAllocation).runningLocation;
	}

	private _doComputeRunningLocation(existingRunningLocation: ExtensionIdentifierMap<ExtensionRunningLocation | null>, localExtensions: IExtensionDescription[], remoteExtensions: IExtensionDescription[], isInitialAllocation: boolean): { runningLocation: ExtensionIdentifierMap<ExtensionRunningLocation | null>; maxLocalProcessAffinity: number; maxLocalWebWorkerAffinity: number } {
		// Skip extensions that have an existing running location
		localExtensions = localExtensions.filter(extension => !existingRunningLocation.has(extension.identifier));
		remoteExtensions = remoteExtensions.filter(extension => !existingRunningLocation.has(extension.identifier));

		const extensionHostKinds = determineExtensionHostKinds(
			localExtensions,
			remoteExtensions,
			(extension) => this.readExtensionKinds(extension),
			(extensionId, extensionKinds, isInstalledLocally, isInstalledRemotely, preference) => this._extensionHostKindPicker.pickExtensionHostKind(extensionId, extensionKinds, isInstalledLocally, isInstalledRemotely, preference)
		);

		const extensions = new ExtensionIdentifierMap<IExtensionDescription>();
		for (const extension of localExtensions) {
			extensions.set(extension.identifier, extension);
		}
		for (const extension of remoteExtensions) {
			extensions.set(extension.identifier, extension);
		}

		const result = new ExtensionIdentifierMap<ExtensionRunningLocation | null>();
		const localProcessExtensions: IExtensionDescription[] = [];
		const localWebWorkerExtensions: IExtensionDescription[] = [];
		for (const [extensionIdKey, extensionHostKind] of extensionHostKinds) {
			let runningLocation: ExtensionRunningLocation | null = null;
			if (extensionHostKind === ExtensionHostKind.LocalProcess) {
				const extensionDescription = extensions.get(extensionIdKey);
				if (extensionDescription) {
					localProcessExtensions.push(extensionDescription);
				}
			} else if (extensionHostKind === ExtensionHostKind.LocalWebWorker) {
				const extensionDescription = extensions.get(extensionIdKey);
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
			const affinity = affinities.get(extension.identifier) || 0;
			result.set(extension.identifier, new LocalProcessRunningLocation(affinity));
		}
		const { affinities: localWebWorkerAffinities, maxAffinity: maxLocalWebWorkerAffinity } = this._computeAffinity(localWebWorkerExtensions, ExtensionHostKind.LocalWebWorker, isInitialAllocation);
		for (const extension of localWebWorkerExtensions) {
			const affinity = localWebWorkerAffinities.get(extension.identifier) || 0;
			result.set(extension.identifier, new LocalWebWorkerRunningLocation(affinity));
		}

		// Add extensions that already have an existing running location
		for (const [extensionIdKey, runningLocation] of existingRunningLocation) {
			if (runningLocation) {
				result.set(extensionIdKey, runningLocation);
			}
		}

		return { runningLocation: result, maxLocalProcessAffinity: maxAffinity, maxLocalWebWorkerAffinity: maxLocalWebWorkerAffinity };
	}

	public initializeRunningLocation(localExtensions: IExtensionDescription[], remoteExtensions: IExtensionDescription[]): void {
		const { runningLocation, maxLocalProcessAffinity, maxLocalWebWorkerAffinity } = this._doComputeRunningLocation(this._runningLocation, localExtensions, remoteExtensions, true);
		this._runningLocation = runningLocation;
		this._maxLocalProcessAffinity = maxLocalProcessAffinity;
		this._maxLocalWebWorkerAffinity = maxLocalWebWorkerAffinity;
	}

	/**
	 * Returns the running locations for the removed extensions.
	 */
	public deltaExtensions(toAdd: IExtensionDescription[], toRemove: ExtensionIdentifier[]): ExtensionIdentifierMap<ExtensionRunningLocation | null> {
		// Remove old running location
		const removedRunningLocation = new ExtensionIdentifierMap<ExtensionRunningLocation | null>();
		for (const extensionId of toRemove) {
			const extensionKey = extensionId;
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
			this._runningLocation.set(extension.identifier, runningLocation);
		}

		const { affinities } = this._computeAffinity(localProcessExtensions, ExtensionHostKind.LocalProcess, false);
		for (const extension of localProcessExtensions) {
			const affinity = affinities.get(extension.identifier) || 0;
			this._runningLocation.set(extension.identifier, new LocalProcessRunningLocation(affinity));
		}

		const { affinities: webWorkerExtensionsAffinities } = this._computeAffinity(localWebWorkerExtensions, ExtensionHostKind.LocalWebWorker, false);
		for (const extension of localWebWorkerExtensions) {
			const affinity = webWorkerExtensionsAffinities.get(extension.identifier) || 0;
			this._runningLocation.set(extension.identifier, new LocalWebWorkerRunningLocation(affinity));
		}
	}
}

export function filterExtensionDescriptions(extensions: readonly IExtensionDescription[], runningLocation: ExtensionIdentifierMap<ExtensionRunningLocation | null>, predicate: (extRunningLocation: ExtensionRunningLocation) => boolean): IExtensionDescription[] {
	return extensions.filter((ext) => {
		const extRunningLocation = runningLocation.get(ext.identifier);
		return extRunningLocation && predicate(extRunningLocation);
	});
}

export function filterExtensionIdentifiers(extensions: readonly ExtensionIdentifier[], runningLocation: ExtensionIdentifierMap<ExtensionRunningLocation | null>, predicate: (extRunningLocation: ExtensionRunningLocation) => boolean): ExtensionIdentifier[] {
	return extensions.filter((ext) => {
		const extRunningLocation = runningLocation.get(ext);
		return extRunningLocation && predicate(extRunningLocation);
	});
}
