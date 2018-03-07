/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as arrays from 'vs/base/common/arrays';
import { localize } from 'vs/nls';
import Event, { chain, anyEvent, debounceEvent } from 'vs/base/common/event';
import { onUnexpectedError, canceled } from 'vs/base/common/errors';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IExtensionManagementService, ILocalExtension, IExtensionEnablementService, IExtensionTipsService, LocalExtensionType, IExtensionIdentifier, EnablementState } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { ServicesAccessor, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { BetterMergeDisabledNowKey, BetterMergeId, areSameExtensions, adoptToGalleryExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { getIdAndVersionFromLocalExtensionId } from 'vs/platform/extensionManagement/node/extensionManagementUtil';
import { Severity, INotificationService } from 'vs/platform/notification/common/notification';

export interface IExtensionStatus {
	identifier: IExtensionIdentifier;
	local: ILocalExtension;
	globallyEnabled: boolean;
}

export class KeymapExtensions implements IWorkbenchContribution {

	private disposables: IDisposable[] = [];

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IExtensionEnablementService private extensionEnablementService: IExtensionEnablementService,
		@IExtensionTipsService private tipsService: IExtensionTipsService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@INotificationService private notificationService: INotificationService,
		@ITelemetryService private telemetryService: ITelemetryService,
	) {
		this.disposables.push(
			lifecycleService.onShutdown(() => this.dispose()),
			instantiationService.invokeFunction(onExtensionChanged)((identifiers => {
				TPromise.join(identifiers.map(identifier => this.checkForOtherKeymaps(identifier)))
					.then(null, onUnexpectedError);
			}))
		);
	}

	private checkForOtherKeymaps(extensionIdentifier: IExtensionIdentifier): TPromise<void> {
		return this.instantiationService.invokeFunction(getInstalledExtensions).then(extensions => {
			const keymaps = extensions.filter(extension => isKeymapExtension(this.tipsService, extension));
			const extension = arrays.first(keymaps, extension => stripVersion(extension.identifier.id) === extensionIdentifier.id);
			if (extension && extension.globallyEnabled) {
				const otherKeymaps = keymaps.filter(extension => stripVersion(extension.identifier.id) !== extensionIdentifier.id && extension.globallyEnabled);
				if (otherKeymaps.length) {
					return this.promptForDisablingOtherKeymaps(extension, otherKeymaps);
				}
			}
			return undefined;
		});
	}

	private promptForDisablingOtherKeymaps(newKeymap: IExtensionStatus, oldKeymaps: IExtensionStatus[]): TPromise<void> {
		const message = localize('disableOtherKeymapsConfirmation', "Disable other keymaps ({0}) to avoid conflicts between keybindings?", oldKeymaps.map(k => `'${k.local.manifest.displayName}'`).join(', '));
		const options = [
			localize('yes', "Yes"),
			localize('no', "No")
		];
		return this.notificationService.prompt(Severity.Info, message, options)
			.then(value => {
				const confirmed = value === 0;
				const telemetryData: { [key: string]: any; } = {
					newKeymap: newKeymap.identifier,
					oldKeymaps: oldKeymaps.map(k => k.identifier),
					confirmed
				};
				/* __GDPR__
					"disableOtherKeymaps" : {
						"newKeymap" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
						"oldKeymaps": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
						"confirmed" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
					}
				*/
				this.telemetryService.publicLog('disableOtherKeymaps', telemetryData);
				if (confirmed) {
					return TPromise.join(oldKeymaps.map(keymap => {
						return this.extensionEnablementService.setEnablement(keymap.local, EnablementState.Disabled);
					}));
				}
				return undefined;
			}, error => TPromise.wrapError(canceled()))
			.then(() => { /* drop resolved value */ });
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}

export function onExtensionChanged(accessor: ServicesAccessor): Event<IExtensionIdentifier[]> {
	const extensionService = accessor.get(IExtensionManagementService);
	const extensionEnablementService = accessor.get(IExtensionEnablementService);
	return debounceEvent<IExtensionIdentifier, IExtensionIdentifier[]>(anyEvent(
		chain(anyEvent(extensionService.onDidInstallExtension, extensionService.onDidUninstallExtension))
			.map(e => ({ id: stripVersion(e.identifier.id), uuid: e.identifier.uuid }))
			.event,
		extensionEnablementService.onEnablementChanged
	), (list, id) => {
		if (!list) {
			return [id];
		} else if (list.some(l => !areSameExtensions(l, id))) {
			list.push(id);
		}
		return list;
	});
}

export function getInstalledExtensions(accessor: ServicesAccessor): TPromise<IExtensionStatus[]> {
	const extensionService = accessor.get(IExtensionManagementService);
	const extensionEnablementService = accessor.get(IExtensionEnablementService);
	return extensionService.getInstalled().then(extensions => {
		return extensionEnablementService.getDisabledExtensions()
			.then(disabledExtensions => {
				return extensions.map(extension => {
					return {
						identifier: { id: adoptToGalleryExtensionId(stripVersion(extension.identifier.id)), uuid: extension.identifier.uuid },
						local: extension,
						globallyEnabled: disabledExtensions.every(disabled => !areSameExtensions(disabled, extension.identifier))
					};
				});
			});
	});
}

export function isKeymapExtension(tipsService: IExtensionTipsService, extension: IExtensionStatus): boolean {
	const cats = extension.local.manifest.categories;
	return cats && cats.indexOf('Keymaps') !== -1 || tipsService.getKeymapRecommendations().indexOf(stripVersion(extension.identifier.id)) !== -1;
}

function stripVersion(id: string): string {
	return getIdAndVersionFromLocalExtensionId(id).id;
}

export class BetterMergeDisabled implements IWorkbenchContribution {

	constructor(
		@IStorageService storageService: IStorageService,
		@INotificationService notificationService: INotificationService,
		@IExtensionService extensionService: IExtensionService,
		@IExtensionManagementService extensionManagementService: IExtensionManagementService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		extensionService.whenInstalledExtensionsRegistered().then(() => {
			if (storageService.getBoolean(BetterMergeDisabledNowKey, StorageScope.GLOBAL, false)) {
				storageService.remove(BetterMergeDisabledNowKey, StorageScope.GLOBAL);

				notificationService.prompt(Severity.Info, localize('betterMergeDisabled', "The Better Merge extension is now built-in, the installed extension was disabled and can be uninstalled."), [localize('uninstall', "Uninstall")]).then(choice => {
					if (choice === 0) {
						extensionManagementService.getInstalled(LocalExtensionType.User).then(extensions => {
							return Promise.all(extensions.filter(e => stripVersion(e.identifier.id) === BetterMergeId)
								.map(e => extensionManagementService.uninstall(e, true)));
						});
					}
				});
			}
		});
	}
}
