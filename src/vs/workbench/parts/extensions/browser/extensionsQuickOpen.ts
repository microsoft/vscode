/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { IAutoFocus, Mode, IModel } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenEntry, QuickOpenModel } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { QuickOpenHandler } from 'vs/workbench/browser/quickopen';
import { IExtensionsViewlet, VIEWLET_ID } from 'vs/workbench/parts/extensions/common/extensions';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IExtensionGalleryService, IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { CancellationToken } from 'vs/base/common/cancellation';

class SimpleEntry extends QuickOpenEntry {

	constructor(private label: string, private action: Function) {
		super();
	}

	getLabel(): string {
		return this.label;
	}

	getAriaLabel(): string {
		return this.label;
	}

	run(mode: Mode): boolean {
		if (mode === Mode.PREVIEW) {
			return false;
		}

		this.action();

		return true;
	}
}

export class ExtensionsHandler extends QuickOpenHandler {

	public static readonly ID = 'workbench.picker.extensions';

	constructor(@IViewletService private readonly viewletService: IViewletService) {
		super();
	}

	getResults(text: string, token: CancellationToken): Promise<IModel<any>> {
		const label = nls.localize('manage', "Press Enter to manage your extensions.");
		const action = () => {
			this.viewletService.openViewlet(VIEWLET_ID, true)
				.then(viewlet => viewlet as IExtensionsViewlet)
				.then(viewlet => {
					viewlet.search('');
					viewlet.focus();
				});
		};

		return Promise.resolve(new QuickOpenModel([new SimpleEntry(label, action)]));
	}

	getEmptyLabel(input: string): string {
		return '';
	}

	getAutoFocus(searchValue: string): IAutoFocus {
		return { autoFocusFirstEntry: true };
	}
}

export class GalleryExtensionsHandler extends QuickOpenHandler {

	public static readonly ID = 'workbench.picker.gallery';

	constructor(
		@IViewletService private readonly viewletService: IViewletService,
		@IExtensionGalleryService private readonly galleryService: IExtensionGalleryService,
		@IExtensionManagementService private readonly extensionsService: IExtensionManagementService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super();
	}

	getResults(text: string, token: CancellationToken): Promise<IModel<any>> {
		if (/\./.test(text)) {
			return this.galleryService.query({ names: [text], pageSize: 1 })
				.then(galleryResult => {
					const entries: SimpleEntry[] = [];
					const galleryExtension = galleryResult.firstPage[0];

					if (!galleryExtension) {
						const label = nls.localize('notfound', "Extension '{0}' not found in the Marketplace.", text);
						entries.push(new SimpleEntry(label, () => null));

					} else {
						const label = nls.localize('install', "Press Enter to install '{0}' from the Marketplace.", text);
						const action = () => {
							return this.viewletService.openViewlet(VIEWLET_ID, true)
								.then(viewlet => viewlet as IExtensionsViewlet)
								.then(viewlet => viewlet.search(`@id:${text}`))
								.then(() => this.extensionsService.installFromGallery(galleryExtension))
								.then(undefined, err => this.notificationService.error(err));
						};

						entries.push(new SimpleEntry(label, action));
					}

					return new QuickOpenModel(entries);
				});
		}

		const entries: SimpleEntry[] = [];

		if (text) {
			const label = nls.localize('searchFor', "Press Enter to search for '{0}' in the Marketplace.", text);
			const action = () => {
				this.viewletService.openViewlet(VIEWLET_ID, true)
					.then(viewlet => viewlet as IExtensionsViewlet)
					.then(viewlet => {
						viewlet.search(text);
						viewlet.focus();
					});
			};

			entries.push(new SimpleEntry(label, action));
		}

		return Promise.resolve(new QuickOpenModel(entries));
	}

	getEmptyLabel(input: string): string {
		return nls.localize('noExtensionsToInstall', "Type an extension name");
	}

	getAutoFocus(searchValue: string): IAutoFocus {
		return { autoFocusFirstEntry: true };
	}
}