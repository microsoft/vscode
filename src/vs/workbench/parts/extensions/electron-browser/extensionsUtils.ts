/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as arrays from 'vs/base/common/arrays';
import { localize } from 'vs/nls';
import { Event } from 'vs/base/common/event';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IExtensionManagementService, ILocalExtension, IExtensionEnablementService, IExtensionTipsService, IExtensionIdentifier, EnablementState, InstallOperation } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { ServicesAccessor, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { areSameExtensions, adoptToGalleryExtensionId, getGalleryExtensionIdFromLocal } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { getIdAndVersionFromLocalExtensionId } from 'vs/platform/extensionManagement/node/extensionManagementUtil';
import { Severity, INotificationService } from 'vs/platform/notification/common/notification';
import product from 'vs/platform/node/product';

export interface IExtensionStatus {
	identifier: IExtensionIdentifier;
	local: ILocalExtension;
	globallyEnabled: boolean;
}

export class KeymapExtensions implements IWorkbenchContribution {

	private disposables: IDisposable[] = [];

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IExtensionEnablementService private readonly extensionEnablementService: IExtensionEnablementService,
		@IExtensionTipsService private readonly tipsService: IExtensionTipsService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@INotificationService private readonly notificationService: INotificationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		this.disposables.push(
			lifecycleService.onShutdown(() => this.dispose()),
			instantiationService.invokeFunction(onExtensionChanged)((identifiers => {
				Promise.all(identifiers.map(identifier => this.checkForOtherKeymaps(identifier)))
					.then(undefined, onUnexpectedError);
			}))
		);
	}

	private checkForOtherKeymaps(extensionIdentifier: IExtensionIdentifier): Promise<void> {
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

	private promptForDisablingOtherKeymaps(newKeymap: IExtensionStatus, oldKeymaps: IExtensionStatus[]): void {
		const onPrompt = (confirmed: boolean) => {
			const telemetryData: { [key: string]: any; } = {
				newKeymap: newKeymap.identifier,
				oldKeymaps: oldKeymaps.map(k => k.identifier),
				confirmed
			};
			/* __GDPR__
				"disableOtherKeymaps" : {
					"newKeymap": { "${inline}": [ "${ExtensionIdentifier}" ] },
					"oldKeymaps": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
					"confirmed" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
				}
			*/
			this.telemetryService.publicLog('disableOtherKeymaps', telemetryData);
			if (confirmed) {
				Promise.all(oldKeymaps.map(keymap => {
					return this.extensionEnablementService.setEnablement(keymap.local, EnablementState.Disabled);
				}));
			}
		};

		this.notificationService.prompt(Severity.Info, localize('disableOtherKeymapsConfirmation', "Disable other keymaps ({0}) to avoid conflicts between keybindings?", oldKeymaps.map(k => `'${k.local.manifest.displayName}'`).join(', ')),
			[{
				label: localize('yes', "Yes"),
				run: () => onPrompt(true)
			}, {
				label: localize('no', "No"),
				run: () => onPrompt(false)
			}]
		);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}

export function onExtensionChanged(accessor: ServicesAccessor): Event<IExtensionIdentifier[]> {
	const extensionService = accessor.get(IExtensionManagementService);
	const extensionEnablementService = accessor.get(IExtensionEnablementService);
	const onDidInstallExtension = Event.chain(extensionService.onDidInstallExtension)
		.filter(e => e.operation === InstallOperation.Install)
		.event;
	return Event.debounce<IExtensionIdentifier, IExtensionIdentifier[]>(Event.any(
		Event.chain(Event.any(onDidInstallExtension, extensionService.onDidUninstallExtension))
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

export function getInstalledExtensions(accessor: ServicesAccessor): Promise<IExtensionStatus[]> {
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
	return cats && cats.indexOf('Keymaps') !== -1 || tipsService.getKeymapRecommendations().some(({ extensionId }) => areSameExtensions({ id: extensionId }, { id: getGalleryExtensionIdFromLocal(extension.local) }));
}

function stripVersion(id: string): string {
	return getIdAndVersionFromLocalExtensionId(id).id;
}

export function getKeywordsForExtension(extension: string): string[] {
	const keywords = product.extensionKeywords || {};
	return keywords[extension] || [];
}