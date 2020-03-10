/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IQuickPick, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IQuickAccessProvider } from 'vs/platform/quickinput/common/quickAccess';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { localize } from 'vs/nls';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { VIEWLET_ID, IExtensionsViewPaneContainer } from 'vs/workbench/contrib/extensions/common/extensions';
import { IExtensionGalleryService, IExtensionManagementService, IGalleryExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ILogService } from 'vs/platform/log/common/log';

interface IInstallExtensionQuickPickItem extends IQuickPickItem {
	extension?: {
		name: string;
		resolved?: IGalleryExtension;
	}
}

export class InstallExtensionQuickAccessProvider implements IQuickAccessProvider {

	static PREFIX = 'ext install ';

	constructor(
		@IViewletService private readonly viewletService: IViewletService,
		@IExtensionGalleryService private readonly galleryService: IExtensionGalleryService,
		@IExtensionManagementService private readonly extensionsService: IExtensionManagementService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILogService private readonly logService: ILogService
	) { }

	provide(picker: IQuickPick<IInstallExtensionQuickPickItem>, token: CancellationToken): IDisposable {
		const disposables = new DisposableStore();

		// Disable filtering & sorting, we control the results
		picker.matchOnLabel = picker.matchOnDescription = picker.matchOnDetail = picker.sortByLabel = false;

		// Update picker item
		let extensionSearchToken: CancellationTokenSource | undefined = undefined;
		const updatePickerItems = () => {
			if (extensionSearchToken) {
				extensionSearchToken.dispose(true);
			}

			extensionSearchToken = new CancellationTokenSource(token);

			this.updateExtensionPickerItems(picker, extensionSearchToken.token);
		};
		disposables.add(picker.onDidChangeValue(() => updatePickerItems()));
		updatePickerItems();

		// Open extensions view on accept
		disposables.add(picker.onDidAccept(() => {
			const [item] = picker.selectedItems;
			if (item) {
				picker.hide();
				if (item.extension) {
					if (item.extension.resolved) {
						this.installExtension(item.extension.resolved, item.extension.name);
					} else {
						this.searchExtension(item.extension.name);
					}
				}
			}
		}));

		return disposables;
	}

	private async updateExtensionPickerItems(picker: IQuickPick<IInstallExtensionQuickPickItem>, token: CancellationToken): Promise<void> {
		const value = picker.value.trim().substr(InstallExtensionQuickAccessProvider.PREFIX.length);

		// Nothing typed
		if (!value) {
			picker.busy = false;
			picker.items = [{
				label: localize('type', "Type an extension name to install or search.")
			}];

			return;
		}

		const genericSearchPickItem = {
			label: localize('searchFor', "Press Enter to search for extension '{0}'.", value),
			extension: { name: value }
		};

		// Extension ID typed: try to find it
		if (/\./.test(value)) {
			picker.busy = true;

			try {
				const galleryResult = await this.galleryService.query({ names: [value], pageSize: 1 }, token);
				if (token.isCancellationRequested) {
					return; // return early if canceled
				}

				const galleryExtension = galleryResult.firstPage[0];
				if (!galleryExtension) {
					picker.items = [genericSearchPickItem];
				} else {
					picker.items = [{
						label: localize('install', "Press Enter to install extension '{0}'.", value),
						extension: {
							name: value,
							resolved: galleryExtension
						}
					}];
				}
			} catch (error) {
				if (token.isCancellationRequested) {
					return; // expected error
				}

				this.logService.error(error);

				picker.items = [genericSearchPickItem];
			} finally {
				picker.busy = false;
			}
		}

		// Extension name typed: offer to search it
		else {
			picker.busy = false;
			picker.items = [genericSearchPickItem];
		}
	}

	private async installExtension(extension: IGalleryExtension, name: string): Promise<void> {
		try {
			await openExtensionsViewlet(this.viewletService, `@id:${name}`);
			await this.extensionsService.installFromGallery(extension);
		} catch (error) {
			this.notificationService.error(error);
		}
	}

	private async searchExtension(name: string): Promise<void> {
		openExtensionsViewlet(this.viewletService, name);
	}
}

export class ManageExtensionsQuickAccessProvider implements IQuickAccessProvider {

	static PREFIX = 'ext ';

	constructor(@IViewletService private readonly viewletService: IViewletService) { }

	provide(picker: IQuickPick<IQuickPickItem>, token: CancellationToken): IDisposable {
		const disposables = new DisposableStore();

		// Disable filtering & sorting, we control the results
		picker.matchOnLabel = picker.matchOnDescription = picker.matchOnDetail = picker.sortByLabel = false;

		// Have just one static picker item
		picker.items = [{
			label: localize('manage', "Press Enter to manage your extensions.")
		}];

		// Open extensions view on accept
		disposables.add(picker.onDidAccept(() => {
			const [item] = picker.selectedItems;
			if (item) {
				picker.hide();
				openExtensionsViewlet(this.viewletService);
			}
		}));

		return disposables;
	}
}

async function openExtensionsViewlet(viewletService: IViewletService, search = ''): Promise<void> {
	const viewlet = await viewletService.openViewlet(VIEWLET_ID, true);
	const view = viewlet?.getViewPaneContainer() as IExtensionsViewPaneContainer | undefined;
	view?.search(search);
	view?.focus();
}
