/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { ResourceMap } from '../../../base/common/map.js';
import { URI } from '../../../base/common/uri.js';
import { AbstractExtensionTask, IUninstallExtensionTask, UninstallExtensionTaskOptions } from '../common/abstractExtensionManagementService.js';
import { ILocalExtension } from '../common/extensionManagement.js';
import { IExtensionsProfileScannerService } from '../common/extensionsProfileScannerService.js';
import { IExtensionIdentifier } from '../../extensions/common/extensions.js';
import { ExtensionManagementStoreCoordinator, getExtensionManagementStoreCoordinator } from './extensionManagementStoreCoordinator.js';

type ProfileRemover = Pick<IExtensionsProfileScannerService, 'removeExtensionsFromProfile'>;

/** Combines only concurrently arriving removals within one uninstall invocation and profile. */
export class UninstallExtensionsProfileBatch implements ProfileRemover {
	private readonly pending = new ResourceMap<{ identifiers: IExtensionIdentifier[]; completion: DeferredPromise<void> }>();

	constructor(private readonly scanner: ProfileRemover) { }

	removeExtensionsFromProfile(identifiers: IExtensionIdentifier[], profileLocation: URI): Promise<void> {
		let batch = this.pending.get(profileLocation);
		if (!batch) {
			batch = { identifiers: [], completion: new DeferredPromise<void>() };
			this.pending.set(profileLocation, batch);
			const pending = batch;
			queueMicrotask(async () => {
				// Later arrivals belong to another wave, even while this write is still running.
				this.pending.delete(profileLocation);
				try {
					await this.scanner.removeExtensionsFromProfile(pending.identifiers, profileLocation);
					pending.completion.complete();
				} catch (error) {
					pending.completion.error(error);
				}
			});
		}
		batch.identifiers.push(...identifiers);
		return batch.completion.p;
	}
}

export class UninstallExtensionInProfileTask extends AbstractExtensionTask<void> implements IUninstallExtensionTask {
	constructor(
		readonly extension: ILocalExtension,
		readonly options: UninstallExtensionTaskOptions,
		private readonly scanner: ProfileRemover,
		private readonly coordinator: Pick<ExtensionManagementStoreCoordinator, 'withMutation'> = getExtensionManagementStoreCoordinator(),
	) {
		super();
	}

	override run(): Promise<void> {
		return this.coordinator.withMutation(() => super.run());
	}

	protected doRun(token: CancellationToken): Promise<void> {
		return this.scanner.removeExtensionsFromProfile([this.extension.identifier], this.options.profileLocation);
	}
}
