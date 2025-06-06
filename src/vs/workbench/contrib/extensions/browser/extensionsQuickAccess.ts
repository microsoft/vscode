/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { IPickerQuickAccessItem, PickerQuickAccessProvider } from '../../../../platform/quickinput/browser/pickerQuickAccess.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { localize } from '../../../../nls.js';
import { IExtensionGalleryService, IExtensionManagementService, IGalleryExtension } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IExtensionsWorkbenchService } from '../common/extensions.js';

export class InstallExtensionQuickAccessProvider extends PickerQuickAccessProvider<IPickerQuickAccessItem> {

	static PREFIX = 'ext install ';

	constructor(
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionGalleryService private readonly galleryService: IExtensionGalleryService,
		@IExtensionManagementService private readonly extensionsService: IExtensionManagementService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILogService private readonly logService: ILogService
	) {
		super(InstallExtensionQuickAccessProvider.PREFIX);
	}

	protected _getPicks(filter: string, disposables: DisposableStore, token: CancellationToken): Array<IPickerQuickAccessItem | IQuickPickSeparator> | Promise<Array<IPickerQuickAccessItem | IQuickPickSeparator>> {

		// Nothing typed
		if (!filter) {
			return [{
				label: localize('type', "Type an extension name to install or search.")
			}];
		}

		const genericSearchPickItem: IPickerQuickAccessItem = {
			label: localize('searchFor', "Press Enter to search for extension '{0}'.", filter),
			accept: () => this.extensionsWorkbenchService.openSearch(filter)
		};

		// Extension ID typed: try to find it
		if (/\./.test(filter)) {
			return this.getPicksForExtensionId(filter, genericSearchPickItem, token);
		}

		// Extension name typed: offer to search it
		return [genericSearchPickItem];
	}

	private async getPicksForExtensionId(filter: string, fallback: IPickerQuickAccessItem, token: CancellationToken): Promise<Array<IPickerQuickAccessItem | IQuickPickSeparator>> {
		try {
			const [galleryExtension] = await this.galleryService.getExtensions([{ id: filter }], token);
			if (token.isCancellationRequested) {
				return []; // return early if canceled
			}

			if (!galleryExtension) {
				return [fallback];
			}

			return [{
				label: localize('install', "Press Enter to install extension '{0}'.", filter),
				accept: () => this.installExtension(galleryExtension, filter)
			}];
		} catch (error) {
			if (token.isCancellationRequested) {
				return []; // expected error
			}

			this.logService.error(error);

			return [fallback];
		}
	}

	private async installExtension(extension: IGalleryExtension, name: string): Promise<void> {
		try {
			await this.extensionsWorkbenchService.openSearch(`@id:${name}`);
			await this.extensionsService.installFromGallery(extension);
		} catch (error) {
			this.notificationService.error(error);
		}
	}
}

export class ManageExtensionsQuickAccessProvider extends PickerQuickAccessProvider<IPickerQuickAccessItem> {

	static PREFIX = 'ext ';

	constructor(@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService) {
		super(ManageExtensionsQuickAccessProvider.PREFIX);
	}

	protected _getPicks(): Array<IPickerQuickAccessItem | IQuickPickSeparator> {
		return [{
			label: localize('manage', "Press Enter to manage your extensions."),
			accept: () => this.extensionsWorkbenchService.openSearch('')
		}];
	}
}
