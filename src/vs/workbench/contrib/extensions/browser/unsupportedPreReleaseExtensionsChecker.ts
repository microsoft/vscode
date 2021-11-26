/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { localize } from 'vs/nls';
import { IExtensionGalleryService, IExtensionManagementService, IGalleryExtension, ILocalExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { ExtensionType, IExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { SwitchUnsupportedExtensionToPreReleaseExtensionCommandAction } from 'vs/workbench/contrib/extensions/browser/extensionsActions';

export class UnsupportedPreReleaseExtensionsChecker implements IWorkbenchContribution {

	constructor(
		@INotificationService private readonly notificationService: INotificationService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		this.notifyUnsupportedPreReleaseExtensions();
	}

	private async notifyUnsupportedPreReleaseExtensions(): Promise<void> {
		const extensionsControlManifest = await this.extensionManagementService.getExtensionsControlManifest();
		if (!extensionsControlManifest.unsupportedPreReleaseExtensions) {
			return;
		}

		const installed = await this.extensionManagementService.getInstalled(ExtensionType.User);
		const unsupportedLocalExtensionsWithIdentifiers: [ILocalExtension, IExtensionIdentifier][] = [];
		for (const extension of installed) {
			const preReleaseExtension = extensionsControlManifest.unsupportedPreReleaseExtensions[extension.identifier.id.toLowerCase()];
			if (preReleaseExtension) {
				unsupportedLocalExtensionsWithIdentifiers.push([extension, { id: preReleaseExtension.id }]);
			}
		}
		if (!unsupportedLocalExtensionsWithIdentifiers.length) {
			return;
		}

		const unsupportedPreReleaseExtensions: [ILocalExtension, IGalleryExtension][] = [];
		const galleryExensions = await this.extensionGalleryService.getExtensions(unsupportedLocalExtensionsWithIdentifiers.map(([, identifier]) => identifier), true, CancellationToken.None);
		for (const gallery of galleryExensions) {
			const unsupportedLocalExtension = unsupportedLocalExtensionsWithIdentifiers.find(([, identifier]) => areSameExtensions(identifier, gallery.identifier));
			if (unsupportedLocalExtension) {
				unsupportedPreReleaseExtensions.push([unsupportedLocalExtension[0], gallery]);
			}
		}
		if (!unsupportedPreReleaseExtensions.length) {
			return;
		}

		if (unsupportedPreReleaseExtensions.length === 1) {
			const [local, gallery] = unsupportedPreReleaseExtensions[0];
			const action = this.instantiationService.createInstance(SwitchUnsupportedExtensionToPreReleaseExtensionCommandAction, unsupportedPreReleaseExtensions[0][0], unsupportedPreReleaseExtensions[0][1], true);
			this.notificationService.notify({
				severity: Severity.Info,
				message: localize('unsupported prerelease message', "'{0}' extension is now part of the '{1}' extension as a pre-release version and it is no longer supported. Would you like to switch to '{2}' extension?", local.manifest.displayName || local.identifier.id, gallery.displayName, gallery.displayName),
				actions: {
					primary: [action]
				},
				sticky: true
			});
			return;
		}
	}

}
